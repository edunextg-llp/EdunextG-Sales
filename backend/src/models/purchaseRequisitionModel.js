import db from '../config/db.js';

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
                  items, item_count, total_quantity, total_amount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    requisitionNumber, data.sellerType, data.companyId, data.staffId,
                    data.outletId, data.outletDay || null, JSON.stringify(data.items),
                    data.items.length, data.totalQuantity, data.totalAmount,
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
            `SELECT pr.*, c.name AS company_name, s.name AS staff_name, s.contact_no AS staff_contact,
                    sc.outlet_name, sc.outlet_erp_id, sc.address AS outlet_address,
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             WHERE pr.id = ?`,
            [id]
        );
        return PurchaseRequisitionModel.normalize(rows[0]);
    }

    static async getByNumber(number) {
        const [rows] = await db.execute(
            `SELECT pr.*, c.name AS company_name, s.name AS staff_name, s.contact_no AS staff_contact,
                    sc.outlet_name, sc.outlet_erp_id, sc.address AS outlet_address,
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number,
                    sale.invoice_number AS invoiced_invoice_number
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             LEFT JOIN staff_sales sale ON sale.id = pr.invoiced_sale_id
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
            `SELECT pr.*, c.name AS company_name, s.name AS staff_name, s.contact_no AS staff_contact,
                    sc.outlet_name, sc.outlet_erp_id, sc.address AS outlet_address,
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number,
                    sale.invoice_number AS invoiced_invoice_number,
                    COALESCE(sale.packaging_status, CASE WHEN pr.status = 'cancelled' THEN 'cancelled' ELSE 'pending' END) AS delivery_status,
                    COALESCE(sale.cancellation_reason, sale_cancellations.reasons, CASE WHEN pr.status = 'cancelled' THEN pr.review_note ELSE NULL END) AS cancellation_reason,
                    DATE_FORMAT(
                        CASE
                            WHEN sale.packaging_status = 'delivered' THEN sale_events.delivered_at
                            WHEN sale.packaging_status = 'cancelled' THEN sale_events.cancelled_at
                            WHEN pr.status = 'cancelled' THEN pr.reviewed_at
                            ELSE NULL
                        END,
                        '%Y-%m-%d %H:%i:%s'
                    ) AS delivery_status_at
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             LEFT JOIN staff_sales sale ON sale.id = pr.invoiced_sale_id
             LEFT JOIN (
                 SELECT sale_id,
                        MAX(CASE WHEN status = 'delivered' THEN changed_at END) AS delivered_at,
                        MAX(CASE WHEN status = 'cancelled' THEN changed_at END) AS cancelled_at
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
        }
        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const [rows] = await db.execute(
            `SELECT pr.*, c.name AS company_name, s.name AS staff_name, s.contact_no AS staff_contact,
                    sc.outlet_name, sc.outlet_erp_id, sc.address AS outlet_address,
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number,
                    sale.invoice_number AS invoiced_invoice_number,
                    COALESCE(sale.packaging_status, CASE WHEN pr.status = 'cancelled' THEN 'cancelled' ELSE 'pending' END) AS delivery_status,
                    COALESCE(sale.cancellation_reason, sale_cancellations.reasons, CASE WHEN pr.status = 'cancelled' THEN pr.review_note ELSE NULL END) AS cancellation_reason,
                    DATE_FORMAT(
                        CASE
                            WHEN sale.packaging_status = 'delivered' THEN sale_events.delivered_at
                            WHEN sale.packaging_status = 'cancelled' THEN sale_events.cancelled_at
                            WHEN pr.status = 'cancelled' THEN pr.reviewed_at
                            ELSE NULL
                        END,
                        '%Y-%m-%d %H:%i:%s'
                    ) AS delivery_status_at
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             LEFT JOIN staff_sales sale ON sale.id = pr.invoiced_sale_id
             LEFT JOIN (
                 SELECT sale_id,
                        MAX(CASE WHEN status = 'delivered' THEN changed_at END) AS delivered_at,
                        MAX(CASE WHEN status = 'cancelled' THEN changed_at END) AS cancelled_at
                 FROM staff_sale_status_history
                 GROUP BY sale_id
             ) sale_events ON sale_events.sale_id = sale.id
             LEFT JOIN (
                 SELECT sale_id, GROUP_CONCAT(DISTINCT reason ORDER BY created_at SEPARATOR '; ') AS reasons
                 FROM order_cancellations
                 WHERE reason IS NOT NULL AND TRIM(reason) <> ''
                 GROUP BY sale_id
             ) sale_cancellations ON sale_cancellations.sale_id = sale.id
             ${where}
             ORDER BY pr.created_at DESC`,
            params
        );
        return rows.map((row) => PurchaseRequisitionModel.normalize(row));
    }

    static async updateStatus(id, status, adminId, note = null) {
        const [result] = await db.execute(
            `UPDATE purchase_requisitions
             SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ?
             WHERE id = ? AND status IN ('open', 'pending')`,
            [status, adminId, note || null, id]
        );
        return result.affectedRows ? PurchaseRequisitionModel.getById(id) : null;
    }

    static async deletePendingByStaff(id, staffId) {
        const [result] = await db.execute(
            `DELETE FROM purchase_requisitions
             WHERE id = ? AND staff_id = ? AND status = 'pending'
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
