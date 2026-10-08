import db from '../config/db.js';
import PaymentModel from './paymentModel.js';

/**
 * Data access for the Company Staff mobile portal.
 *
 * A staff member sees only:
 *  - invoices they booked or were assigned to deliver, with packaging/delivery status
 *  - Out Bills they took for collection (taken_bills.collector_type = 'company_staff')
 *  - the payments they submitted to D.B. Collection (delivery_boy_collections.staff_id)
 */

export const INVOICE_STATUSES = [
    'not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned',
];
export const PACKAGING_STATUSES = ['not_packing', 'packing', 'packing_done'];

const PAID_SQL = `SELECT sale_id, SUM(amount) AS total FROM sale_payments
                  WHERE payment_mode IN ('cash','upi','cheque') GROUP BY sale_id`;
const CANCELLED_SQL = `SELECT sale_id, SUM(amount) AS total FROM order_cancellations GROUP BY sale_id`;
const CREDIT_DUE_SQL = `
    SELECT credit.sale_id,
           SUM(GREATEST(0, credit.amount - COALESCE(child.paid, 0))) AS credit_amount,
           DATE_FORMAT(MIN(credit.payment_date), '%Y-%m-%d') AS credit_date,
           MAX(credit.credit_days) AS credit_days
    FROM sale_payments credit
    LEFT JOIN (
        SELECT parent_credit_payment_id, SUM(amount) AS paid
        FROM sale_payments
        WHERE parent_credit_payment_id IS NOT NULL AND payment_mode IN ('cash','upi','cheque')
        GROUP BY parent_credit_payment_id
    ) child ON child.parent_credit_payment_id = credit.id
    WHERE credit.payment_mode = 'credit'
    GROUP BY credit.sale_id`;
const BALANCE_SQL = 'GREATEST(0, ss.price - COALESCE(cancelled.total, 0) - COALESCE(paid.total, 0))';
const PENDING_SQL = `SELECT sale_id,
                            SUM(CASE WHEN payment_mode IN ('cash','upi','cheque') THEN amount ELSE 0 END) AS pending_amount,
                            COUNT(*) AS pending_count
                     FROM delivery_boy_collections WHERE settled_at IS NULL GROUP BY sale_id`;

// Money (cash/UPI/cheque) already submitted for a sale and still waiting in
// D.B. Collection. A pending Credit entry is not money, so it is not counted.
export async function getPendingCollectedAmount(executor, saleId) {
    const [rows] = await executor.execute(
        `SELECT COALESCE(SUM(amount), 0) AS pending_amount
         FROM delivery_boy_collections
         WHERE sale_id = ? AND settled_at IS NULL AND payment_mode IN ('cash','upi','cheque')`,
        [saleId]
    );
    return Number(rows[0]?.pending_amount) || 0;
}


function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function normalizeInvoice(row) {
    return {
        ...row,
        price: toNumber(row.price),
        paid_amount: toNumber(row.paid_amount),
        balance_amount: toNumber(row.balance_amount),
    };
}

function normalizeCollection(row) {
    return {
        ...row,
        amount: toNumber(row.amount),
        status: row.settled_at ? 'settled' : 'pending',
    };
}

class StaffPortalModel {
    static async getActiveStaff(staffId) {
        const [rows] = await db.execute('SELECT id, is_active FROM staff WHERE id = ? LIMIT 1', [staffId]);
        const staff = rows[0];
        return staff && Number(staff.is_active) === 1 ? staff : null;
    }

    static async getCompanies(companyIds = []) {
        const ids = [...new Set(companyIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
        if (!ids.length) return [];
        const [rows] = await db.execute(
            `SELECT id, name, type FROM companies WHERE id IN (${ids.map(() => '?').join(', ')}) ORDER BY name`,
            ids
        );
        return rows;
    }

    static async getProfile(staffId) {
        const [rows] = await db.execute(
            `SELECT s.id, s.name, s.contact_no, s.whatsapp_number, s.login_id, s.staff_type, s.staff_category,
                    COALESCE(
                        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', '),
                        primary_company.name
                    ) AS company_name,
                    COALESCE(
                        GROUP_CONCAT(DISTINCT c.id ORDER BY c.name SEPARATOR ','),
                        CAST(s.company_id AS CHAR)
                    ) AS company_ids
             FROM staff s
             LEFT JOIN staff_companies map ON map.staff_id = s.id
             LEFT JOIN companies c ON c.id = map.company_id
             LEFT JOIN companies primary_company ON primary_company.id = s.company_id
             WHERE s.id = ? AND s.is_active = 1
             GROUP BY s.id`,
            [staffId]
        );
        return rows[0] || null;
    }

    /**
     * Invoices booked by this staff member. `status` may be a single status or
     * the group 'packaging' (not_packing + packing + packing_done).
     */
    static async getInvoices(staffId, { fromDate, toDate, status = '', search = '', limit = 500 } = {}, executor = db) {
        const params = [staffId, staffId];
        let where = 'WHERE (ss.staff_id = ? OR ss.delivery_staff_id = ?)';

        if (fromDate) {
            where += " AND (ss.sale_date >= ? OR (ss.delivery_staff_id = ? AND ss.packaging_status = 'out_for_delivery'))";
            params.push(fromDate, staffId);
        }
        if (toDate) {
            where += " AND (ss.sale_date <= ? OR (ss.delivery_staff_id = ? AND ss.packaging_status = 'out_for_delivery'))";
            params.push(toDate, staffId);
        }
        if (status === 'packaging') {
            where += ` AND ss.packaging_status IN (${PACKAGING_STATUSES.map(() => '?').join(', ')})`;
            params.push(...PACKAGING_STATUSES);
        } else if (status) {
            where += ' AND ss.packaging_status = ?';
            params.push(status);
        }
        const term = String(search || '').trim();
        if (term) {
            where += ` AND (ss.invoice_number LIKE ? OR sc.outlet_name LIKE ? OR sc.outlet_erp_id LIKE ?
                       OR sc.contact_number LIKE ? OR CONCAT('BP', ss.id) LIKE ?)`;
            params.push(...Array(5).fill(`%${term}%`));
        }
        const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 500, 1), 1000);

        const [rows] = await executor.execute(
            `SELECT ss.id, CONCAT('BP', ss.id) AS bp_sale_id, ss.invoice_number,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    ss.item_count, ss.packed_item_count, ss.box_count, ss.price,
                    ss.packaging_status, ss.cancellation_reason, ss.vehicle_no, ss.delivery_staff_id,
                    sc.outlet_name, sc.outlet_erp_id, sc.contact_number, sc.location_name,
                    COALESCE(dboy.name, (SELECT name FROM staff WHERE id = ss.delivery_staff_id)) AS delivery_boy_name,
                    COALESCE(paid.total, 0) AS paid_amount,
                    ${BALANCE_SQL} AS balance_amount,
                    DATE_FORMAT(history.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN delivery_boys dboy ON dboy.id = ss.delivery_boy_id
             LEFT JOIN (${PAID_SQL}) paid ON paid.sale_id = ss.id
             LEFT JOIN (${CANCELLED_SQL}) cancelled ON cancelled.sale_id = ss.id
             LEFT JOIN (
                 SELECT sale_id, MAX(changed_at) AS status_updated_at
                 FROM staff_sale_status_history GROUP BY sale_id
             ) history ON history.sale_id = ss.id
             ${where}
             ORDER BY ss.sale_date DESC, ss.id DESC
             LIMIT ${safeLimit}`,
            params
        );
        return rows.map(normalizeInvoice);
    }

    static async getInvoiceDetail(staffId, saleId) {
        const [rows] = await db.execute(
            `SELECT ss.id, CONCAT('BP', ss.id) AS bp_sale_id, ss.invoice_number, ss.credit_photo_url,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    ss.item_count, ss.packed_item_count, ss.box_count, ss.price,
                    ss.packaging_status, ss.cancellation_reason, ss.vehicle_no, ss.delivery_staff_id,
                    sc.outlet_name, sc.outlet_erp_id, sc.contact_number, sc.location_name,
                    COALESCE(dboy.name, (SELECT name FROM staff WHERE id = ss.delivery_staff_id)) AS delivery_boy_name,
                    COALESCE(paid.total, 0) AS paid_amount,
                    ${BALANCE_SQL} AS balance_amount
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN delivery_boys dboy ON dboy.id = ss.delivery_boy_id
             LEFT JOIN (${PAID_SQL}) paid ON paid.sale_id = ss.id
             LEFT JOIN (${CANCELLED_SQL}) cancelled ON cancelled.sale_id = ss.id
             WHERE ss.id = ? AND (ss.staff_id = ? OR ss.delivery_staff_id = ?)
             LIMIT 1`,
            [saleId, staffId, staffId]
        );
        if (!rows[0]) return null;

        const [history] = await db.execute(
            `SELECT status, DATE_FORMAT(changed_at, '%Y-%m-%d %H:%i:%s') AS changed_at
             FROM staff_sale_status_history WHERE sale_id = ?
             ORDER BY changed_at ASC, id ASC`,
            [saleId]
        );
        const [payments] = await db.execute(
            `SELECT id, payment_mode, amount, DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date,
                    credit_days, collector_name
             FROM sale_payments WHERE sale_id = ?
             ORDER BY payment_date ASC, id ASC`,
            [saleId]
        );
        const [items] = await db.execute(
            `SELECT product_name, variant_name, qty, rate, line_total
             FROM staff_sale_items WHERE sale_id = ?
             ORDER BY sort_order ASC, id ASC`,
            [saleId]
        );

        return {
            ...normalizeInvoice(rows[0]),
            history,
            payments: payments.map((payment) => ({ ...payment, amount: toNumber(payment.amount) })),
            items: items.map((item) => ({
                ...item,
                qty: toNumber(item.qty),
                rate: toNumber(item.rate),
                line_total: toNumber(item.line_total),
            })),
        };
    }

    /**
     * Active Out Bills this staff member took, with an unpaid balance. A taken bill
     * always shows, even when an older payment for it is still waiting in
     * D.B. Collection; pending_amount tells the app how much of it is already submitted.
     */
    static async getOutBills(staffId, executor = db) {
        const [rows] = await executor.execute(
            `SELECT ss.id AS sale_id, CONCAT('BP', ss.id) AS bp_sale_id, ss.invoice_number, ss.credit_photo_url, ss.price,
                    COALESCE(paid.total, 0) AS paid_amount,
                    ${BALANCE_SQL} AS balance_amount,
                    COALESCE(credit_due.credit_amount, 0) AS credit_amount,
                    credit_due.credit_date, credit_due.credit_days,
                    DATE_FORMAT(DATE_ADD(credit_due.credit_date, INTERVAL COALESCE(credit_due.credit_days, 0) DAY), '%Y-%m-%d') AS due_date,
                    GREATEST(0, DATEDIFF(CURDATE(), DATE_ADD(credit_due.credit_date, INTERVAL COALESCE(credit_due.credit_days, 0) DAY))) AS overdue_days,
                    bill.taken_bill_id,
                    DATE_FORMAT(bill.taken_date, '%Y-%m-%d') AS taken_date,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    sc.outlet_name, sc.outlet_erp_id, sc.contact_number, sc.location_name,
                    COALESCE(c.name, 'Company not assigned') AS company_name,
                    COALESCE(pending.pending_amount, 0) AS pending_amount,
                    COALESCE(pending.pending_count, 0) AS pending_count
             FROM (
                 SELECT sp.sale_id, MIN(tb.id) AS taken_bill_id, MIN(tb.taken_date) AS taken_date
                 FROM taken_bills tb
                 INNER JOIN sale_payments sp ON sp.id = tb.payment_id
                 WHERE tb.staff_id = ? AND tb.collector_type = 'company_staff'
                   AND tb.returned_at IS NULL
                   AND sp.payment_mode = 'credit'
                   AND sp.amount > COALESCE((SELECT SUM(child.amount) FROM sale_payments child
                       WHERE child.parent_credit_payment_id = sp.id AND child.payment_mode IN ('cash','upi','cheque')), 0)
                 GROUP BY sp.sale_id
             ) bill
             INNER JOIN staff_sales ss ON ss.id = bill.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN staff seller ON seller.id = ss.staff_id
             LEFT JOIN companies c ON c.id = seller.company_id
             LEFT JOIN (${PAID_SQL}) paid ON paid.sale_id = ss.id
             LEFT JOIN (${CANCELLED_SQL}) cancelled ON cancelled.sale_id = ss.id
             LEFT JOIN (${CREDIT_DUE_SQL}) credit_due ON credit_due.sale_id = ss.id
             LEFT JOIN (${PENDING_SQL}) pending ON pending.sale_id = ss.id
             WHERE ${BALANCE_SQL} > 0
             ORDER BY bill.taken_date ASC, ss.id ASC`,
            [staffId]
        );
        return rows.map((row) => ({
            ...row,
            price: toNumber(row.price),
            paid_amount: toNumber(row.paid_amount),
            balance_amount: toNumber(row.balance_amount),
            credit_amount: toNumber(row.credit_amount),
            credit_days: row.credit_days == null ? null : toNumber(row.credit_days),
            overdue_days: toNumber(row.overdue_days),
            pending_amount: toNumber(row.pending_amount),
            pending_count: toNumber(row.pending_count),
        }));
    }

    /**
     * Records a payment against one of the staff member's Out Bills as a pending
     * D.B. Collection entry. The sale balance changes only when an admin settles it.
     */
    static async submitOutBillPayment(staffId, saleId, data) {
        if (data.paymentMode === 'credit') throw new Error('TAKEN_BILL_ALREADY_CREDIT');
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('SELECT id FROM staff_sales WHERE id = ? FOR UPDATE', [saleId]);
            const bill = (await StaffPortalModel.getOutBills(staffId, connection))
                .find((row) => Number(row.sale_id) === Number(saleId));
            if (!bill) {
                await connection.rollback();
                return null;
            }

            const price = await PaymentModel.getEffectiveSalePrice(connection, saleId);
            const paid = await PaymentModel.getTotalPaid(connection, saleId);
            // Money already waiting in D.B. Collection can't be collected again.
            const pendingAmount = await getPendingCollectedAmount(connection, saleId);
            const remaining = Math.max(0, Math.round(((price ?? 0) - paid - pendingAmount) * 100) / 100);
            if (data.paymentMode !== 'credit' && remaining <= 0.001) {
                throw Object.assign(new Error('PAYMENT_ALREADY_PENDING'), { pendingAmount });
            }
            if (!Number.isFinite(data.amount) || data.amount <= 0 || data.amount > remaining + 0.001) {
                throw Object.assign(new Error('EXCEEDS_BALANCE'), { remaining });
            }
            if (data.paymentMode === 'credit' && bill.credit_amount > 0 && Math.abs(data.amount - remaining) > 0.001) {
                throw new Error('FULL_CREDIT_BALANCE_REQUIRED');
            }

            const [result] = await connection.execute(
                `INSERT INTO delivery_boy_collections
                 (sale_id, delivery_boy_id, staff_id, collector_type, payment_mode, amount, cash_details,
                  reference_no, reference_date, credit_days, remarks, collection_source, settled_at)
                 VALUES (?, NULL, ?, 'company_staff', ?, ?, NULL, ?, ?, ?, ?, 'taken_bill', NULL)`,
                [
                    saleId,
                    staffId,
                    data.paymentMode,
                    data.amount,
                    data.referenceNo ?? null,
                    data.referenceDate ?? null,
                    data.creditDays ?? null,
                    `Staff app Out Bill payment for BP${saleId}`,
                ]
            );
            await connection.commit();
            return {
                collection: { id: result.insertId, sale_id: Number(saleId), amount: data.amount, status: 'pending' },
                remainingBalance: remaining,
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /** Every outlet (counter) assigned to this staff member, for the area-wise outlet list. */
    static async getOutlets(staffId) {
        const [rows] = await db.execute(
            `SELECT id, outlet_erp_id, outlet_name, contact_number, whatsapp_number, address,
                    location_name, day, serial_no, priority_number, google_location,
                    delivery_google_location
             FROM staff_counters
             WHERE staff_id = ?
             ORDER BY COALESCE(NULLIF(TRIM(location_name), ''), 'zzz'), location_name,
                      FIELD(day, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'CNF'),
                      COALESCE(priority_number, 999999), COALESCE(serial_no, 999999), outlet_name`,
            [staffId]
        );
        return rows;
    }

    static async getOutlet(staffId, outletId) {
        const [rows] = await db.execute(
            `SELECT id, outlet_erp_id, outlet_name, contact_number, whatsapp_number, address,
                    location_name, day, serial_no, priority_number, google_location,
                    delivery_google_location
             FROM staff_counters WHERE id = ? AND staff_id = ? LIMIT 1`,
            [outletId, staffId]
        );
        return rows[0] || null;
    }

    /**
     * Saves a GPS map link as the outlet's Google location. The delivery location is filled
     * only when delivery staff have not captured one yet (their capture stays locked).
     */
    static async updateOutletLocation(staffId, outletId, googleLocation) {
        const [result] = await db.execute(
            `UPDATE staff_counters
             SET google_location = ?,
                 delivery_google_location = COALESCE(NULLIF(TRIM(delivery_google_location), ''), ?)
             WHERE id = ? AND staff_id = ?`,
            [googleLocation, googleLocation, outletId, staffId]
        );
        return result.affectedRows > 0 ? StaffPortalModel.getOutlet(staffId, outletId) : null;
    }

    static async updateOutletContact(staffId, outletId, contactNumber) {
        const [result] = await db.execute(
            'UPDATE staff_counters SET contact_number = ? WHERE id = ? AND staff_id = ?',
            [contactNumber, outletId, staffId]
        );
        return result.affectedRows > 0 ? StaffPortalModel.getOutlet(staffId, outletId) : null;
    }

    static async getCollections(staffId, { fromDate = '', toDate = '' } = {}) {
        const params = [staffId];
        let where = `WHERE dbc.staff_id = ? AND dbc.collector_type = 'company_staff'`;
        if (fromDate) {
            where += ' AND dbc.created_at >= ?';
            params.push(`${fromDate} 00:00:00`);
        }
        if (toDate) {
            where += ' AND dbc.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
            params.push(toDate);
        }
        const [rows] = await db.execute(
            `SELECT dbc.id, dbc.sale_id, CONCAT('BP', dbc.sale_id) AS bp_sale_id, dbc.payment_mode, dbc.amount,
                    dbc.reference_no, DATE_FORMAT(dbc.reference_date, '%Y-%m-%d') AS reference_date,
                    dbc.credit_days, dbc.collection_source,
                    DATE_FORMAT(dbc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE_FORMAT(dbc.settled_at, '%Y-%m-%d %H:%i:%s') AS settled_at,
                    ss.invoice_number, sc.outlet_name, sc.outlet_erp_id
             FROM delivery_boy_collections dbc
             INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             ${where}
             ORDER BY dbc.created_at DESC, dbc.id DESC
             ${fromDate && toDate ? '' : 'LIMIT 1000'}`,
            params
        );
        return rows.map(normalizeCollection);
    }

    /**
     * Cancelled amounts on this staff member's invoices (by sale date):
     * whole-bill cancellations plus item-level cancellations on bills that were not fully cancelled.
     */
    static async getCancellations(staffId, { fromDate, toDate }) {
        const [fullRows] = await db.execute(
            `SELECT ss.id AS sale_id, CONCAT('BP', ss.id) AS bp_sale_id, ss.invoice_number,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date, ss.price AS amount,
                    ss.cancellation_reason AS reason, sc.outlet_name, sc.outlet_erp_id, sc.location_name,
                    DATE_FORMAT(history.cancelled_at, '%Y-%m-%d %H:%i:%s') AS cancelled_at
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN (
                 SELECT sale_id, MAX(changed_at) AS cancelled_at
                 FROM staff_sale_status_history WHERE status = 'cancelled' GROUP BY sale_id
             ) history ON history.sale_id = ss.id
             WHERE ss.staff_id = ? AND ss.packaging_status = 'cancelled'
               AND ss.sale_date >= ? AND ss.sale_date <= ?
             ORDER BY ss.sale_date DESC, ss.id DESC`,
            [staffId, fromDate, toDate]
        );
        const [partialRows] = await db.execute(
            `SELECT ss.id AS sale_id, CONCAT('BP', ss.id) AS bp_sale_id, ss.invoice_number,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    SUM(oc.amount) AS amount, COUNT(*) AS item_count,
                    GROUP_CONCAT(DISTINCT NULLIF(TRIM(oc.reason), '') ORDER BY oc.created_at SEPARATOR '; ') AS reason,
                    GROUP_CONCAT(oc.product_name ORDER BY oc.created_at SEPARATOR ', ') AS products,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name,
                    DATE_FORMAT(MAX(oc.created_at), '%Y-%m-%d %H:%i:%s') AS cancelled_at
             FROM order_cancellations oc
             INNER JOIN staff_sales ss ON ss.id = oc.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             WHERE ss.staff_id = ? AND ss.packaging_status <> 'cancelled'
               AND ss.sale_date >= ? AND ss.sale_date <= ?
             GROUP BY ss.id, ss.invoice_number, ss.sale_date, sc.outlet_name, sc.outlet_erp_id, sc.location_name
             ORDER BY ss.sale_date DESC, ss.id DESC`,
            [staffId, fromDate, toDate]
        );
        const rows = [
            ...fullRows.map((row) => ({ ...row, type: 'bill', amount: toNumber(row.amount), item_count: null, products: null })),
            ...partialRows.map((row) => ({ ...row, type: 'items', amount: toNumber(row.amount), item_count: toNumber(row.item_count) })),
        ].sort((left, right) => String(right.sale_date).localeCompare(String(left.sale_date)) || right.sale_id - left.sale_id);
        const sum = (list) => Math.round(list.reduce((total, row) => total + row.amount, 0) * 100) / 100;
        const bills = rows.filter((row) => row.type === 'bill');
        const items = rows.filter((row) => row.type === 'items');
        return {
            total_amount: sum(rows),
            bills: { count: bills.length, amount: sum(bills) },
            items: { count: items.length, amount: sum(items) },
            rows,
        };
    }

    /** Outstanding credit on this staff member's delivered invoices, grouped by outlet. */
    static async getCreditByOutlet(staffId) {
        const [rows] = await db.execute(
            `SELECT sp.id AS payment_id, ss.id AS sale_id, CONCAT('BP', ss.id) AS bp_sale_id, ss.invoice_number, ss.credit_photo_url,
                    DATE_FORMAT(sp.payment_date, '%Y-%m-%d') AS credit_date, sp.credit_days,
                    DATE_FORMAT(DATE_ADD(sp.payment_date, INTERVAL COALESCE(sp.credit_days, 0) DAY), '%Y-%m-%d') AS due_date,
                    GREATEST(0, DATEDIFF(CURDATE(), DATE_ADD(sp.payment_date, INTERVAL COALESCE(sp.credit_days, 0) DAY))) AS overdue_days,
                    GREATEST(0, sp.amount - COALESCE(credit_paid.paid, 0)) AS credit_remaining,
                    ${BALANCE_SQL} AS sale_balance,
                    sc.id AS outlet_id, sc.outlet_name, sc.outlet_erp_id, sc.location_name, sc.contact_number,
                    CASE WHEN tb.id IS NOT NULL THEN 1 ELSE 0 END AS is_taken,
                    COALESCE(taker_staff.name, taker_boy.name) AS taken_by
             FROM sale_payments sp
             INNER JOIN staff_sales ss ON ss.id = sp.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN (
                 SELECT parent_credit_payment_id, SUM(amount) AS paid
                 FROM sale_payments
                 WHERE parent_credit_payment_id IS NOT NULL AND payment_mode IN ('cash','upi','cheque')
                 GROUP BY parent_credit_payment_id
             ) credit_paid ON credit_paid.parent_credit_payment_id = sp.id
             LEFT JOIN (${PAID_SQL}) paid ON paid.sale_id = ss.id
             LEFT JOIN (${CANCELLED_SQL}) cancelled ON cancelled.sale_id = ss.id
             LEFT JOIN taken_bills tb ON tb.payment_id = sp.id AND tb.returned_at IS NULL
             LEFT JOIN staff taker_staff ON taker_staff.id = tb.staff_id
             LEFT JOIN delivery_boys taker_boy ON taker_boy.id = tb.delivery_boy_id
             WHERE ss.staff_id = ? AND sp.payment_mode = 'credit' AND ss.packaging_status = 'delivered'
             HAVING credit_remaining > 0 AND sale_balance > 0
             ORDER BY sp.payment_date ASC, sp.id ASC`,
            [staffId]
        );

        // One entry per invoice: several credit rows on a sale never exceed the sale's own balance.
        const bills = new Map();
        for (const row of rows) {
            const existing = bills.get(row.sale_id);
            if (!existing) {
                const { credit_remaining: creditRemaining, sale_balance: saleBalance, payment_id: _paymentId, ...rest } = row;
                bills.set(row.sale_id, {
                    ...rest,
                    credit_amount: toNumber(creditRemaining),
                    sale_balance: toNumber(saleBalance),
                    credit_days: row.credit_days == null ? null : toNumber(row.credit_days),
                    overdue_days: toNumber(row.overdue_days),
                    is_taken: Number(row.is_taken) === 1,
                });
            } else {
                existing.credit_amount += toNumber(row.credit_remaining);
                existing.overdue_days = Math.max(existing.overdue_days, toNumber(row.overdue_days));
                existing.is_taken = existing.is_taken || Number(row.is_taken) === 1;
                existing.taken_by = existing.taken_by || row.taken_by;
            }
        }

        const outlets = new Map();
        for (const entry of bills.values()) {
            const { sale_balance: saleBalance, ...bill } = entry;
            bill.credit_amount = Math.round(Math.min(bill.credit_amount, saleBalance) * 100) / 100;
            const key = bill.outlet_id ?? `sale-${bill.sale_id}`;
            if (!outlets.has(key)) {
                outlets.set(key, {
                    outlet_id: bill.outlet_id,
                    outlet_name: bill.outlet_name,
                    outlet_erp_id: bill.outlet_erp_id,
                    location_name: bill.location_name,
                    contact_number: bill.contact_number,
                    credit_amount: 0,
                    overdue_amount: 0,
                    bill_count: 0,
                    oldest_due_date: bill.due_date,
                    max_overdue_days: 0,
                    bills: [],
                });
            }
            const outlet = outlets.get(key);
            outlet.credit_amount += bill.credit_amount;
            if (bill.overdue_days > 0) outlet.overdue_amount += bill.credit_amount;
            outlet.bill_count += 1;
            outlet.max_overdue_days = Math.max(outlet.max_overdue_days, bill.overdue_days);
            if (bill.due_date && (!outlet.oldest_due_date || bill.due_date < outlet.oldest_due_date)) {
                outlet.oldest_due_date = bill.due_date;
            }
            outlet.bills.push(bill);
        }

        const round = (value) => Math.round(value * 100) / 100;
        const list = [...outlets.values()]
            .map((outlet) => ({ ...outlet, credit_amount: round(outlet.credit_amount), overdue_amount: round(outlet.overdue_amount) }))
            .sort((left, right) => right.credit_amount - left.credit_amount);
        return {
            total_credit: round(list.reduce((total, outlet) => total + outlet.credit_amount, 0)),
            overdue_credit: round(list.reduce((total, outlet) => total + outlet.overdue_amount, 0)),
            outlet_count: list.length,
            bill_count: bills.size,
            outlets: list,
        };
    }

    static async getDashboard(staffId, { fromDate, toDate, overall = false }) {
        const [statusRows] = await db.execute(
            `SELECT ss.packaging_status AS status, COUNT(*) AS count, COALESCE(SUM(ss.price), 0) AS value
             FROM staff_sales ss
             WHERE ss.staff_id = ? AND ss.sale_date >= ? AND ss.sale_date <= ?
             GROUP BY ss.packaging_status`,
            [staffId, fromDate, toDate]
        );
        const [pendingRows] = await db.execute(
            `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
             FROM delivery_boy_collections
             WHERE staff_id = ? AND collector_type = 'company_staff' AND settled_at IS NULL`,
            [staffId]
        );
        const [requisitionRows] = await db.execute(
            `SELECT
                 SUM(status IN ('open', 'pending')) AS pending,
                 SUM(status = 'approved') AS approved,
                 SUM(status = 'invoiced' AND DATE(created_at) BETWEEN ? AND ?) AS invoiced_in_period,
                 SUM(status = 'cancelled' AND DATE(created_at) BETWEEN ? AND ?) AS cancelled_in_period,
                 SUM(DATE(created_at) BETWEEN ? AND ?) AS created_in_period,
                 COALESCE(SUM(CASE WHEN DATE(created_at) BETWEEN ? AND ? THEN total_amount END), 0) AS amount_in_period
             FROM purchase_requisitions
             WHERE staff_id = ?`,
            [fromDate, toDate, fromDate, toDate, fromDate, toDate, fromDate, toDate, staffId]
        );
        const [outletRows] = await db.execute(
            `SELECT COUNT(*) AS total,
                    SUM(google_location IS NULL OR TRIM(google_location) = '') AS missing_location,
                    COUNT(DISTINCT NULLIF(TRIM(location_name), '')) AS areas
             FROM staff_counters
             WHERE staff_id = ?`,
            [staffId]
        );
        const cancellations = await StaffPortalModel.getCancellations(staffId, { fromDate, toDate });
        const credit = await StaffPortalModel.getCreditByOutlet(staffId);
        const outBills = await StaffPortalModel.getOutBills(staffId);
        const recentInvoices = await StaffPortalModel.getInvoices(staffId, { fromDate, toDate, limit: 5 });
        const requisitions = requisitionRows[0] || {};
        const outletSummary = outletRows[0] || {};

        const byStatus = Object.fromEntries(INVOICE_STATUSES.map((status) => [status, { count: 0, value: 0 }]));
        for (const row of statusRows) {
            if (byStatus[row.status]) {
                byStatus[row.status] = { count: toNumber(row.count), value: toNumber(row.value) };
            }
        }
        const sum = (statuses, key) => statuses.reduce((total, status) => total + byStatus[status][key], 0);

        return {
            period: overall ? { from: null, overall: true, to: null } : { from: fromDate, to: toDate },
            invoices: {
                total: sum(INVOICE_STATUSES, 'count'),
                total_value: Math.round(sum(INVOICE_STATUSES, 'value') * 100) / 100,
                packaging: sum(PACKAGING_STATUSES, 'count'),
                out_for_delivery: byStatus.out_for_delivery.count,
                delivered: byStatus.delivered.count,
                delivered_value: byStatus.delivered.value,
                cancelled: byStatus.cancelled.count,
                returned: byStatus.returned.count,
                by_status: byStatus,
            },
            out_bills: {
                count: outBills.length,
                balance: Math.round(outBills.reduce((total, bill) => total + bill.balance_amount, 0) * 100) / 100,
                overdue: outBills.filter((bill) => bill.overdue_days > 0).length,
            },
            pending_settlement: {
                count: toNumber(pendingRows[0]?.count),
                amount: toNumber(pendingRows[0]?.amount),
            },
            requisitions: {
                pending: toNumber(requisitions.pending),
                approved: toNumber(requisitions.approved),
                created_in_period: toNumber(requisitions.created_in_period),
                invoiced_in_period: toNumber(requisitions.invoiced_in_period),
                cancelled_in_period: toNumber(requisitions.cancelled_in_period),
                amount_in_period: Math.round(toNumber(requisitions.amount_in_period) * 100) / 100,
            },
            outlets: {
                total: toNumber(outletSummary.total),
                areas: toNumber(outletSummary.areas),
                missing_location: toNumber(outletSummary.missing_location),
            },
            cancellations: {
                total_amount: cancellations.total_amount,
                bills: cancellations.bills,
                items: cancellations.items,
            },
            credit: {
                total: credit.total_credit,
                overdue: credit.overdue_credit,
                outlets: credit.outlet_count,
                bills: credit.bill_count,
            },
            recent_invoices: recentInvoices,
        };
    }
}

export default StaffPortalModel;
