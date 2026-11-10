import db from '../config/db.js';
import PaymentModel from './paymentModel.js';
import OrderCancellationModel from './orderCancellationModel.js';
import { getPendingCollectedAmount } from './staffPortalModel.js';
import { currentActor } from '../utils/requestContext.js';

// Extra / less material found by the delivery boy after delivery.
//  - extra: product name + quantity (photo optional); the delivery boy earns 1 star at once.
//           Reviewers approve it, or reject it and the star is taken back.
//  - less:  the amount is taken off the bill at once (an order_cancellations row). Reviewers
//           approve it, or reject it and the amount is added back to the bill.
// Reviewers have the material_report_review permission (DEEP and SUNANDA BISWAS); admin sees everything.
// Both go to the packaging staff who packed the invoice for a reason.

export const LESS_MATERIAL_PRODUCT = 'Less material (delivery report)';
// A report can be made only within this window after the sale was marked delivered.
const REPORT_WINDOW_SQL = 'ssh.delivered_at > NOW() - INTERVAL 1 DAY AND ssh.delivered_at <= NOW()';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function reportError(code, extra = {}) {
    return Object.assign(new Error(code), extra);
}

const REPORT_SELECT = `
    SELECT r.id, r.sale_id, CONCAT('BP', r.sale_id) AS bp_sale_id, r.report_type, r.photo_url, r.amount, r.remarks,
           r.product_name, r.product_qty,
           r.star_awarded, r.packed_by_id, r.packer_reason,
           DATE_FORMAT(r.packer_reason_at, '%Y-%m-%d %H:%i:%s') AS packer_reason_at,
           r.review_status, r.review_remarks,
           DATE_FORMAT(r.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
           CASE r.reviewed_by_type
               WHEN 'admin' THEN 'Admin'
               WHEN 'delivery_boy' THEN reviewer.name
               WHEN 'staff' THEN reviewer_staff.name
           END AS reviewed_by_name,
           DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           r.delivery_boy_id, db.name AS delivery_boy_name,
           packer.name AS packed_by_name,
           ss.invoice_number, ss.price, DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
           sc.outlet_name, sc.outlet_erp_id, c.name AS company_name
    FROM delivery_material_reports r
    INNER JOIN staff_sales ss ON ss.id = r.sale_id
    LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
    LEFT JOIN staff s ON s.id = ss.staff_id
    LEFT JOIN companies c ON c.id = s.company_id
    LEFT JOIN delivery_boys db ON db.id = r.delivery_boy_id
    LEFT JOIN delivery_boys packer ON packer.id = r.packed_by_id
    LEFT JOIN delivery_boys reviewer ON r.reviewed_by_type = 'delivery_boy' AND reviewer.id = r.reviewed_by_id
    LEFT JOIN staff reviewer_staff ON r.reviewed_by_type = 'staff' AND reviewer_staff.id = r.reviewed_by_id`;

function mapReport(row) {
    return {
        ...row,
        amount: row.amount == null ? null : Number(row.amount),
        product_qty: row.product_qty == null ? null : Number(row.product_qty),
        price: row.price == null ? null : Number(row.price),
        star_awarded: Number(row.star_awarded) === 1,
    };
}

class MaterialReportModel {
    // The delivered sale, if it belongs to this delivery boy and is still inside the report window.
    static async getReportableSale(executor, deliveryBoyId, saleId, { lock = false } = {}) {
        const [rows] = await executor.execute(
            `SELECT ss.id, ss.invoice_number, ss.packed_by_id, ss.packaging_status, sc.outlet_name,
                    CASE WHEN ${REPORT_WINDOW_SQL} THEN 1 ELSE 0 END AS in_window
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN (
                 SELECT sale_id, MAX(CASE WHEN status = 'delivered' THEN changed_at END) AS delivered_at
                 FROM staff_sale_status_history WHERE sale_id = ? GROUP BY sale_id
             ) ssh ON ssh.sale_id = ss.id
             WHERE ss.id = ? AND ss.delivery_boy_id = ?${lock ? ' FOR UPDATE' : ''}`,
            [saleId, saleId, deliveryBoyId]
        );
        const sale = rows[0];
        if (!sale) throw reportError('SALE_NOT_FOUND');
        if (sale.packaging_status !== 'delivered') throw reportError('NOT_DELIVERED');
        if (Number(sale.in_window) !== 1) throw reportError('REPORT_WINDOW_CLOSED');
        return sale;
    }

    static async getForSale(saleId, deliveryBoyId) {
        const [rows] = await db.execute(
            `${REPORT_SELECT} WHERE r.sale_id = ? AND r.delivery_boy_id = ? ORDER BY r.id DESC`,
            [saleId, deliveryBoyId]
        );
        return rows.map(mapReport);
    }

    static async hasActiveReport(executor, saleId, type) {
        const [rows] = await executor.execute(
            `SELECT id FROM delivery_material_reports
             WHERE sale_id = ? AND report_type = ? AND review_status <> 'rejected' LIMIT 1`,
            [saleId, type]
        );
        return rows.length > 0;
    }

    static async createExtra(deliveryBoyId, saleId, { productName, productQty, photoUrl, remarks }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const sale = await this.getReportableSale(connection, deliveryBoyId, saleId, { lock: true });
            if (await this.hasActiveReport(connection, saleId, 'extra')) throw reportError('ALREADY_REPORTED');
            const [result] = await connection.execute(
                `INSERT INTO delivery_material_reports
                 (sale_id, delivery_boy_id, report_type, product_name, product_qty, photo_url, remarks, star_awarded, packed_by_id, review_status)
                 VALUES (?, ?, 'extra', ?, ?, ?, ?, 1, ?, 'pending')`,
                [saleId, deliveryBoyId, productName, productQty, photoUrl || null, remarks || null, sale.packed_by_id || null]
            );
            await connection.commit();
            return result.insertId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    }

    static async createLess(deliveryBoyId, saleId, { amount, remarks }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const sale = await this.getReportableSale(connection, deliveryBoyId, saleId, { lock: true });
            if (await this.hasActiveReport(connection, saleId, 'less')) throw reportError('ALREADY_REPORTED');
            // Money already paid or waiting in D.B. Collection can't be taken off the bill.
            const price = await PaymentModel.getEffectiveSalePrice(connection, saleId);
            const paid = await PaymentModel.getTotalPaid(connection, saleId);
            const pending = await getPendingCollectedAmount(connection, saleId);
            const remaining = Math.max(0, round2(price - paid - pending));
            if (amount > remaining + 0.001) throw reportError('EXCEEDS_BALANCE', { remaining });

            const deliveryBoyName = (await connection.execute('SELECT name FROM delivery_boys WHERE id = ?', [deliveryBoyId]))[0][0]?.name || `#${deliveryBoyId}`;
            const cancellationId = await OrderCancellationModel.create({
                saleId,
                outletName: sale.outlet_name || '-',
                invoiceNumber: sale.invoice_number || `BP${saleId}`,
                productName: LESS_MATERIAL_PRODUCT,
                productQty: 0,
                amount,
                reason: 'Less material at delivery',
                remarks: `Reported by ${deliveryBoyName}${remarks ? `: ${remarks}` : ''}. Waiting for review.`,
            }, connection);
            const [result] = await connection.execute(
                `INSERT INTO delivery_material_reports
                 (sale_id, delivery_boy_id, report_type, amount, remarks, packed_by_id, cancellation_id, review_status)
                 VALUES (?, ?, 'less', ?, ?, ?, ?, 'pending')`,
                [saleId, deliveryBoyId, amount, remarks || null, sale.packed_by_id || null, cancellationId]
            );
            await PaymentModel.recalculateSaleTotals(connection, saleId);
            await connection.commit();
            return { id: result.insertId, newBalance: round2(remaining - amount) };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    }

    static async getStars(deliveryBoyId) {
        const [rows] = await db.execute(
            `SELECT COALESCE(SUM(star_awarded), 0) AS stars FROM delivery_material_reports WHERE delivery_boy_id = ?`,
            [deliveryBoyId]
        );
        return Number(rows[0]?.stars) || 0;
    }

    /**
     * Reports for the web page.
     *  scope 'all'     -> admin: everything
     *  scope 'review'  -> reviewer: extra and less reports
     *  scope 'packer'  -> packaging staff: reports on invoices they packed
     */
    static async list({ scope, packerId, type = '', status = '', fromDate = '', toDate = '', search = '' }) {
        const where = [];
        const params = [];
        if (scope === 'packer') { where.push('r.packed_by_id = ?'); params.push(packerId); }
        if (type) { where.push('r.report_type = ?'); params.push(type); }
        if (status === 'reason_pending') where.push(`(r.packer_reason IS NULL OR TRIM(r.packer_reason) = '')`);
        else if (status) { where.push('r.review_status = ?'); params.push(status); }
        if (fromDate) { where.push('DATE(r.created_at) >= ?'); params.push(fromDate); }
        if (toDate) { where.push('DATE(r.created_at) <= ?'); params.push(toDate); }
        if (search) {
            where.push(`(ss.invoice_number LIKE ? OR sc.outlet_name LIKE ? OR db.name LIKE ? OR packer.name LIKE ? OR CONCAT('BP', r.sale_id) LIKE ?)`);
            const like = `%${search}%`;
            params.push(like, like, like, like, like);
        }
        const [rows] = await db.execute(
            `${REPORT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.created_at DESC, r.id DESC LIMIT 1000`,
            params
        );
        return rows.map(mapReport);
    }

    static async getStarSummary() {
        const [rows] = await db.execute(
            `SELECT db.id AS delivery_boy_id, db.name AS delivery_boy_name,
                    COALESCE(SUM(r.star_awarded), 0) AS stars,
                    SUM(r.report_type = 'extra') AS extra_count,
                    SUM(r.report_type = 'less') AS less_count,
                    COALESCE(SUM(CASE WHEN r.report_type = 'less' AND r.review_status <> 'rejected' THEN r.amount END), 0) AS less_amount
             FROM delivery_material_reports r
             INNER JOIN delivery_boys db ON db.id = r.delivery_boy_id
             GROUP BY db.id, db.name
             ORDER BY stars DESC, db.name`
        );
        return rows.map((row) => ({
            ...row,
            stars: Number(row.stars) || 0,
            extra_count: Number(row.extra_count) || 0,
            less_count: Number(row.less_count) || 0,
            less_amount: Number(row.less_amount) || 0,
        }));
    }

    static async getById(id) {
        const [rows] = await db.execute(`${REPORT_SELECT} WHERE r.id = ?`, [id]);
        return rows[0] ? mapReport(rows[0]) : null;
    }

    // Packaging staff who packed the invoice explains why there was extra / less material.
    static async saveReason(id, packerId, reason) {
        const [result] = await db.execute(
            `UPDATE delivery_material_reports
             SET packer_reason = ?, packer_reason_at = NOW()
             WHERE id = ? AND packed_by_id = ?`,
            [reason, id, packerId]
        );
        return result.affectedRows > 0;
    }

    // Less: approve keeps the deduction; reject removes it so the amount is due again.
    // Extra: approve keeps the star; reject takes the star back.
    static async review(id, { approve, remarks }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                `SELECT id, sale_id, report_type, cancellation_id, review_status FROM delivery_material_reports
                 WHERE id = ? FOR UPDATE`,
                [id]
            );
            const report = rows[0];
            if (!report) { await connection.rollback(); return null; }
            if (report.review_status !== 'pending') throw reportError('ALREADY_REVIEWED');
            const actor = currentActor();
            if (report.report_type === 'extra') {
                await connection.execute(
                    `UPDATE delivery_material_reports
                     SET review_status = ?, review_remarks = ?, reviewed_by_type = ?, reviewed_by_id = ?, reviewed_at = NOW(),
                         star_awarded = ?
                     WHERE id = ?`,
                    [approve ? 'approved' : 'rejected', remarks || null, actor.type, actor.id, approve ? 1 : 0, id]
                );
                await connection.commit();
                return true;
            }
            if (report.cancellation_id) {
                if (approve) {
                    await connection.execute(
                        `UPDATE order_cancellations
                         SET remarks = CONCAT(COALESCE(remarks, ''), ' Approved.')
                         WHERE id = ?`,
                        [report.cancellation_id]
                    );
                } else {
                    await connection.execute('DELETE FROM order_cancellations WHERE id = ?', [report.cancellation_id]);
                }
            }
            await connection.execute(
                `UPDATE delivery_material_reports
                 SET review_status = ?, review_remarks = ?, reviewed_by_type = ?, reviewed_by_id = ?, reviewed_at = NOW(),
                     cancellation_id = ?
                 WHERE id = ?`,
                [approve ? 'approved' : 'rejected', remarks || null, actor.type, actor.id,
                 approve ? report.cancellation_id : null, id]
            );
            // Keep the stored paid / balance totals in step with the changed bill amount.
            await PaymentModel.recalculateSaleTotals(connection, report.sale_id);
            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    }
}

export default MaterialReportModel;
