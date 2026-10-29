import db from '../config/db.js';
import { currentActor } from '../utils/requestContext.js';

class PurchaseRequisitionModel {
    static async create(data) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [sequence] = await connection.execute(
                `SELECT COALESCE(MAX(CAST(RIGHT(requisition_number, 6) AS UNSIGNED)), 0) + 1 AS next_no
                 FROM purchase_requisitions FOR UPDATE`
            );
            const requisitionNumber = `PRQ${String(sequence[0]?.next_no || 1).padStart(6, '0')}`;
            const [result] = await connection.execute(
                `INSERT INTO purchase_requisitions
                 (requisition_number, seller_type, company_id, staff_id, outlet_id, outlet_day,
                  items, item_count, total_quantity, total_amount, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    requisitionNumber, data.sellerType, data.companyId, data.staffId,
                    data.outletId, data.outletDay || null, JSON.stringify(data.items),
                    data.items.length, data.totalQuantity, data.totalAmount, data.status || 'pending',
                ]
            );
            await connection.commit();
            return PurchaseRequisitionModel.getById(result.insertId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT pr.*, c.name AS company_name, c.daily_requisition_target AS company_daily_target,
                    DATE_FORMAT(pr.created_at, '%Y-%m-%d') AS requisition_date,
                    -- Who approved / rejected: "Admin" for admins (older rows without a type were admins),
                    -- otherwise the staff / packaging / delivery user's name and login ID.
                    CASE WHEN pr.reviewed_by IS NULL THEN NULL
                         WHEN pr.reviewed_by_type = 'admin' OR pr.reviewed_by_type IS NULL THEN 'Admin'
                         ELSE COALESCE(rv_staff.name, rv_db.name) END AS reviewed_by_name,
                    CASE WHEN pr.reviewed_by_type = 'staff' THEN rv_staff.login_id
                         WHEN pr.reviewed_by_type = 'delivery_boy' THEN rv_db.delivery_login_id
                         ELSE NULL END AS reviewed_by_login_id,
                    DATE_FORMAT(pr.reviewed_at, '%Y-%m-%d %H:%i') AS reviewed_at_label,
                    s.name AS staff_name, s.contact_no AS staff_contact,
                    sc.outlet_name, sc.outlet_erp_id, sc.address AS outlet_address,
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             LEFT JOIN staff rv_staff ON pr.reviewed_by_type = 'staff' AND rv_staff.id = pr.reviewed_by
             LEFT JOIN delivery_boys rv_db ON pr.reviewed_by_type = 'delivery_boy' AND rv_db.id = pr.reviewed_by
             WHERE pr.id = ?`,
            [id]
        );
        return PurchaseRequisitionModel.normalize(rows[0]);
    }

    static async getByNumber(number) {
        const [rows] = await db.execute(
            `SELECT pr.*, c.name AS company_name, c.daily_requisition_target AS company_daily_target,
                    DATE_FORMAT(pr.created_at, '%Y-%m-%d') AS requisition_date,
                    -- Who approved / rejected: "Admin" for admins (older rows without a type were admins),
                    -- otherwise the staff / packaging / delivery user's name and login ID.
                    CASE WHEN pr.reviewed_by IS NULL THEN NULL
                         WHEN pr.reviewed_by_type = 'admin' OR pr.reviewed_by_type IS NULL THEN 'Admin'
                         ELSE COALESCE(rv_staff.name, rv_db.name) END AS reviewed_by_name,
                    CASE WHEN pr.reviewed_by_type = 'staff' THEN rv_staff.login_id
                         WHEN pr.reviewed_by_type = 'delivery_boy' THEN rv_db.delivery_login_id
                         ELSE NULL END AS reviewed_by_login_id,
                    DATE_FORMAT(pr.reviewed_at, '%Y-%m-%d %H:%i') AS reviewed_at_label,
                    s.name AS staff_name, s.contact_no AS staff_contact,
                    sc.outlet_name, sc.outlet_erp_id, sc.address AS outlet_address,
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number,
                    sale.invoice_number AS invoiced_invoice_number,
                    COALESCE(sale.packaging_status, CASE WHEN pr.status = 'cancelled' THEN 'cancelled' ELSE 'pending' END) AS delivery_status,
                    COALESCE(sale.cancellation_reason, sale_cancellations.reasons, CASE WHEN pr.status = 'cancelled' THEN pr.review_note ELSE NULL END) AS cancellation_reason,
                    DATE_FORMAT(COALESCE(sale_events.status_updated_at, pr.invoiced_at, pr.reviewed_at, pr.created_at), '%Y-%m-%d %H:%i:%s') AS delivery_status_at
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             LEFT JOIN staff rv_staff ON pr.reviewed_by_type = 'staff' AND rv_staff.id = pr.reviewed_by
             LEFT JOIN delivery_boys rv_db ON pr.reviewed_by_type = 'delivery_boy' AND rv_db.id = pr.reviewed_by
             LEFT JOIN staff_sales sale ON sale.id = pr.invoiced_sale_id
             LEFT JOIN (
                 SELECT sale_id, MAX(changed_at) AS status_updated_at
                 FROM staff_sale_status_history
                 GROUP BY sale_id
             ) sale_events ON sale_events.sale_id = sale.id
             LEFT JOIN (
                 SELECT sale_id, GROUP_CONCAT(DISTINCT reason ORDER BY created_at SEPARATOR '; ') AS reasons
                 FROM order_cancellations
                 WHERE reason IS NOT NULL AND TRIM(reason) <> ''
                 GROUP BY sale_id
             ) sale_cancellations ON sale_cancellations.sale_id = sale.id
             WHERE UPPER(pr.requisition_number) = UPPER(?)`,
            [number]
        );
        return PurchaseRequisitionModel.normalize(rows[0]);
    }

    static async listByStaff(staffId, { date = null, companyId = null } = {}) {
        const params = [staffId];
        let filters = '';

        if (date) {
            filters += ' AND DATE(pr.created_at) = ?';
            params.push(date);
        }
        if (companyId) {
            filters += ' AND pr.company_id = ?';
            params.push(companyId);
        }

        const [rows] = await db.execute(
            `SELECT pr.*, c.name AS company_name, c.daily_requisition_target AS company_daily_target,
                    DATE_FORMAT(pr.created_at, '%Y-%m-%d') AS requisition_date,
                    -- Who approved / rejected: "Admin" for admins (older rows without a type were admins),
                    -- otherwise the staff / packaging / delivery user's name and login ID.
                    CASE WHEN pr.reviewed_by IS NULL THEN NULL
                         WHEN pr.reviewed_by_type = 'admin' OR pr.reviewed_by_type IS NULL THEN 'Admin'
                         ELSE COALESCE(rv_staff.name, rv_db.name) END AS reviewed_by_name,
                    CASE WHEN pr.reviewed_by_type = 'staff' THEN rv_staff.login_id
                         WHEN pr.reviewed_by_type = 'delivery_boy' THEN rv_db.delivery_login_id
                         ELSE NULL END AS reviewed_by_login_id,
                    DATE_FORMAT(pr.reviewed_at, '%Y-%m-%d %H:%i') AS reviewed_at_label,
                    s.name AS staff_name, s.contact_no AS staff_contact,
                    sc.outlet_name, sc.outlet_erp_id, sc.address AS outlet_address,
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number,
                    sale.invoice_number AS invoiced_invoice_number,
                    COALESCE(sale.packaging_status, CASE WHEN pr.status = 'cancelled' THEN 'cancelled' ELSE 'pending' END) AS delivery_status,
                    COALESCE(sale.cancellation_reason, sale_cancellations.reasons, CASE WHEN pr.status = 'cancelled' THEN pr.review_note ELSE NULL END) AS cancellation_reason,
                    DATE_FORMAT(COALESCE(sale_events.status_updated_at, pr.invoiced_at, pr.reviewed_at, pr.created_at), '%Y-%m-%d %H:%i:%s') AS delivery_status_at
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             LEFT JOIN staff rv_staff ON pr.reviewed_by_type = 'staff' AND rv_staff.id = pr.reviewed_by
             LEFT JOIN delivery_boys rv_db ON pr.reviewed_by_type = 'delivery_boy' AND rv_db.id = pr.reviewed_by
             LEFT JOIN staff_sales sale ON sale.id = pr.invoiced_sale_id
             LEFT JOIN (
                 SELECT sale_id, MAX(changed_at) AS status_updated_at
                 FROM staff_sale_status_history
                 GROUP BY sale_id
             ) sale_events ON sale_events.sale_id = sale.id
             LEFT JOIN (
                 SELECT sale_id, GROUP_CONCAT(DISTINCT reason ORDER BY created_at SEPARATOR '; ') AS reasons
                 FROM order_cancellations
                 WHERE reason IS NOT NULL AND TRIM(reason) <> ''
                 GROUP BY sale_id
             ) sale_cancellations ON sale_cancellations.sale_id = sale.id
             WHERE pr.staff_id = ?${filters}
             ORDER BY pr.created_at DESC`,
            params
        );
        return rows.map((row) => PurchaseRequisitionModel.normalize(row));
    }

    static async listAll({ date = null, companyId = null, status = null } = {}) {
        const params = [];
        const clauses = [];
        if (date) {
            clauses.push('DATE(pr.created_at) = ?');
            params.push(date);
        }
        if (companyId) {
            clauses.push('pr.company_id = ?');
            params.push(companyId);
        }
        if (status) {
            clauses.push('pr.status = ?');
            params.push(status);
        } else {
            // Drafts are not submitted yet, so approvers don't see them.
            clauses.push("pr.status <> 'draft'");
        }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const [rows] = await db.execute(
            `SELECT pr.*, c.name AS company_name, c.daily_requisition_target AS company_daily_target,
                    DATE_FORMAT(pr.created_at, '%Y-%m-%d') AS requisition_date,
                    -- Who approved / rejected: "Admin" for admins (older rows without a type were admins),
                    -- otherwise the staff / packaging / delivery user's name and login ID.
                    CASE WHEN pr.reviewed_by IS NULL THEN NULL
                         WHEN pr.reviewed_by_type = 'admin' OR pr.reviewed_by_type IS NULL THEN 'Admin'
                         ELSE COALESCE(rv_staff.name, rv_db.name) END AS reviewed_by_name,
                    CASE WHEN pr.reviewed_by_type = 'staff' THEN rv_staff.login_id
                         WHEN pr.reviewed_by_type = 'delivery_boy' THEN rv_db.delivery_login_id
                         ELSE NULL END AS reviewed_by_login_id,
                    DATE_FORMAT(pr.reviewed_at, '%Y-%m-%d %H:%i') AS reviewed_at_label,
                    s.name AS staff_name, s.contact_no AS staff_contact,
                    sc.outlet_name, sc.outlet_erp_id, sc.address AS outlet_address,
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number,
                    sale.invoice_number AS invoiced_invoice_number
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             LEFT JOIN staff rv_staff ON pr.reviewed_by_type = 'staff' AND rv_staff.id = pr.reviewed_by
             LEFT JOIN delivery_boys rv_db ON pr.reviewed_by_type = 'delivery_boy' AND rv_db.id = pr.reviewed_by
             LEFT JOIN staff_sales sale ON sale.id = pr.invoiced_sale_id
             ${where}
             ORDER BY pr.created_at DESC`,
            params
        );
        return rows.map((row) => PurchaseRequisitionModel.normalize(row));
    }

    static async updateStatus(id, status, adminId, note = null) {
        const [result] = await db.execute(
            `UPDATE purchase_requisitions
             SET status = ?, reviewed_by = ?, reviewed_by_type = ?, reviewed_at = NOW(), review_note = ?
             WHERE id = ? AND status IN ('open', 'pending')`,
            [status, adminId, currentActor().type, note || null, id]
        );
        return result.affectedRows ? PurchaseRequisitionModel.getById(id) : null;
    }

    // Requisitions that count toward the daily target: everything except cancelled.
    static async getDayTotal(staffId, companyId, date) {
        const [rows] = await db.execute(
            `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
             FROM purchase_requisitions
             WHERE staff_id = ? AND company_id = ? AND DATE(created_at) = ?
               AND status <> 'cancelled'`,
            [staffId, companyId, date]
        );
        return { total: Number(rows[0]?.total) || 0, count: Number(rows[0]?.count) || 0 };
    }

    // Target progress for one staff member on one date, for every assigned company
    // that has a daily requisition target.
    static async getTargetProgress(staffId, date) {
        const [rows] = await db.execute(
            `SELECT c.id AS company_id, c.name AS company_name, c.type AS company_type,
                    c.daily_requisition_target AS target,
                    COALESCE(SUM(CASE WHEN pr.status <> 'cancelled' THEN pr.total_amount END), 0) AS achieved,
                    COUNT(CASE WHEN pr.status <> 'cancelled' THEN pr.id END) AS requisition_count,
                    COALESCE(drafts.draft_count, 0) AS draft_count,
                    COALESCE(drafts.draft_total, 0) AS draft_total
             FROM companies c
             INNER JOIN (
                 SELECT company_id FROM staff_companies WHERE staff_id = ?
                 UNION
                 SELECT company_id FROM staff WHERE id = ? AND company_id IS NOT NULL
             ) link ON link.company_id = c.id
             LEFT JOIN (
                 SELECT company_id, COUNT(*) AS draft_count, SUM(total_amount) AS draft_total
                 FROM purchase_requisitions
                 WHERE staff_id = ? AND status = 'draft'
                 GROUP BY company_id
             ) drafts ON drafts.company_id = c.id
             LEFT JOIN purchase_requisitions pr
                    ON pr.company_id = c.id AND pr.staff_id = ? AND DATE(pr.created_at) = ?
             WHERE c.daily_requisition_target IS NOT NULL AND c.daily_requisition_target > 0
             GROUP BY c.id, c.name, c.type, c.daily_requisition_target, drafts.draft_count, drafts.draft_total
             ORDER BY c.name`,
            [staffId, staffId, staffId, staffId, date]
        );
        return rows.map((row) => {
            const target = Number(row.target) || 0;
            const achieved = Math.round((Number(row.achieved) || 0) * 100) / 100;
            return {
                companyId: row.company_id,
                companyName: row.company_name,
                companyType: row.company_type,
                date,
                target,
                achieved,
                remaining: Math.max(0, Math.round((target - achieved) * 100) / 100),
                completed: achieved >= target,
                requisitionCount: Number(row.requisition_count) || 0,
                // Saved but not Final Submitted yet (any date).
                draftCount: Number(row.draft_count) || 0,
                draftTotal: Math.round((Number(row.draft_total) || 0) * 100) / 100,
            };
        });
    }

    /* ---------- Below Target approval requests ---------- */

    static async listTargetRequests({ status = null } = {}) {
        const params = [];
        const where = status ? 'WHERE r.status = ?' : '';
        if (status) params.push(status);
        const [rows] = await db.execute(
            `SELECT r.id, r.staff_id, r.company_id, DATE_FORMAT(r.request_date, '%Y-%m-%d') AS request_date,
                    r.target_amount, r.achieved_amount, r.note, r.status, r.review_note,
                    r.requested_by_type, r.requested_by_id, r.reviewed_by_type, r.reviewed_by_id,
                    DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i') AS requested_at,
                    DATE_FORMAT(r.reviewed_at, '%Y-%m-%d %H:%i') AS reviewed_at,
                    s.name AS staff_name, c.name AS company_name,
                    CASE WHEN r.requested_by_type = 'admin' THEN 'Admin'
                         ELSE COALESCE(rq_staff.name, rq_db.name) END AS requested_by_name,
                    COALESCE(rq_staff.login_id, rq_db.delivery_login_id) AS requested_by_login_id,
                    CASE WHEN r.reviewed_by_type = 'admin' THEN 'Admin'
                         ELSE COALESCE(rv_staff.name, rv_db.name) END AS reviewed_by_name,
                    COALESCE(rv_staff.login_id, rv_db.delivery_login_id) AS reviewed_by_login_id
             FROM requisition_target_requests r
             JOIN staff s ON s.id = r.staff_id
             JOIN companies c ON c.id = r.company_id
             LEFT JOIN staff rq_staff ON r.requested_by_type = 'staff' AND rq_staff.id = r.requested_by_id
             LEFT JOIN delivery_boys rq_db ON r.requested_by_type = 'delivery_boy' AND rq_db.id = r.requested_by_id
             LEFT JOIN staff rv_staff ON r.reviewed_by_type = 'staff' AND rv_staff.id = r.reviewed_by_id
             LEFT JOIN delivery_boys rv_db ON r.reviewed_by_type = 'delivery_boy' AND rv_db.id = r.reviewed_by_id
             ${where}
             ORDER BY r.created_at DESC
             LIMIT 500`,
            params
        );
        return rows.map((row) => ({
            ...row,
            target_amount: Number(row.target_amount) || 0,
            achieved_amount: Number(row.achieved_amount) || 0,
        }));
    }

    static async getPendingTargetRequest(staffId, companyId, date) {
        const [rows] = await db.execute(
            `SELECT id FROM requisition_target_requests
             WHERE staff_id = ? AND company_id = ? AND request_date = ? AND status = 'pending' LIMIT 1`,
            [staffId, companyId, date]
        );
        return rows[0] || null;
    }

    static async createTargetRequest({ staffId, companyId, date, target, achieved, note }) {
        const actor = currentActor();
        const [result] = await db.execute(
            `INSERT INTO requisition_target_requests
             (staff_id, company_id, request_date, target_amount, achieved_amount, note, requested_by_type, requested_by_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [staffId, companyId, date, target, achieved, note || null, actor.type, actor.id]
        );
        return result.insertId;
    }

    // Approve: approves every still-pending requisition of that staff / company / day.
    static async reviewTargetRequest(id, status, reviewerId, note = null) {
        const actor = currentActor();
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                `SELECT id, staff_id, company_id, DATE_FORMAT(request_date, '%Y-%m-%d') AS request_date
                 FROM requisition_target_requests WHERE id = ? AND status = 'pending' FOR UPDATE`,
                [id]
            );
            const request = rows[0];
            if (!request) {
                await connection.rollback();
                return null;
            }
            await connection.execute(
                `UPDATE requisition_target_requests
                 SET status = ?, reviewed_by_type = ?, reviewed_by_id = ?, review_note = ?, reviewed_at = NOW()
                 WHERE id = ?`,
                [status, actor.type, actor.id, note || null, id]
            );
            let approvedCount = 0;
            if (status === 'approved') {
                const [result] = await connection.execute(
                    `UPDATE purchase_requisitions
                     SET status = 'approved', reviewed_by = ?, reviewed_by_type = ?, reviewed_at = NOW(),
                         review_note = COALESCE(review_note, 'Approved via Below Target request')
                     WHERE staff_id = ? AND company_id = ? AND DATE(created_at) = ?
                       AND status IN ('open', 'pending')`,
                    [reviewerId, actor.type, request.staff_id, request.company_id, request.request_date]
                );
                approvedCount = result.affectedRows;
            }
            await connection.commit();
            return { ...request, status, approvedCount };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // When a Below Target approver approves the day directly, close its open request.
    static async resolveTargetRequestForDay(staffId, companyId, date) {
        const actor = currentActor();
        await db.execute(
            `UPDATE requisition_target_requests
             SET status = 'approved', reviewed_by_type = ?, reviewed_by_id = ?, reviewed_at = NOW(),
                 review_note = COALESCE(review_note, 'Approved directly')
             WHERE staff_id = ? AND company_id = ? AND request_date = ? AND status = 'pending'`,
            [actor.type, actor.id, staffId, companyId, date]
        );
    }

    // Days that still have draft requisitions for this staff member and company.
    static async listDraftDays(staffId, companyId) {
        const [rows] = await db.execute(
            `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS draft_date, COUNT(*) AS draft_count
             FROM purchase_requisitions
             WHERE staff_id = ? AND company_id = ? AND status = 'draft'
             GROUP BY draft_date
             ORDER BY draft_date`,
            [staffId, companyId]
        );
        return rows.map((row) => ({ date: row.draft_date, count: Number(row.draft_count) || 0 }));
    }

    // Final Submit: drafts of that day go to the approval queue.
    static async submitDrafts(staffId, companyId, date) {
        const [result] = await db.execute(
            `UPDATE purchase_requisitions SET status = 'pending'
             WHERE staff_id = ? AND company_id = ? AND DATE(created_at) = ? AND status = 'draft'`,
            [staffId, companyId, date]
        );
        return result.affectedRows;
    }

    static async deletePendingByStaff(id, staffId) {
        const [result] = await db.execute(
            `DELETE FROM purchase_requisitions
             WHERE id = ? AND staff_id = ? AND status IN ('pending', 'draft')
             LIMIT 1`,
            [id, staffId]
        );
        return result.affectedRows > 0;
    }

    static normalize(row) {
        if (!row) return null;
        let items = row.items;
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch { items = []; }
        }
        return { ...row, items: Array.isArray(items) ? items : [] };
    }
}

export default PurchaseRequisitionModel;
