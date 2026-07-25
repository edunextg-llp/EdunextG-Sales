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
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             WHERE UPPER(pr.requisition_number) = UPPER(?)`,
            [number]
        );
        return PurchaseRequisitionModel.normalize(rows[0]);
    }

    static async listByStaff(staffId, { date = null } = {}) {
        const params = [staffId];
        let dateClause = '';

        if (date) {
            dateClause = ' AND DATE(pr.created_at) = ?';
            params.push(date);
        }

        const [rows] = await db.execute(
            `SELECT pr.*, c.name AS company_name, s.name AS staff_name, s.contact_no AS staff_contact,
                    sc.outlet_name, sc.outlet_erp_id, sc.address AS outlet_address,
                    sc.contact_number AS outlet_contact, sc.location_name, sc.has_gst, sc.gst_number
             FROM purchase_requisitions pr
             JOIN companies c ON c.id = pr.company_id
             JOIN staff s ON s.id = pr.staff_id
             JOIN staff_counters sc ON sc.id = pr.outlet_id
             WHERE pr.staff_id = ?${dateClause}
             ORDER BY pr.created_at DESC`,
            params
        );
        return rows.map((row) => PurchaseRequisitionModel.normalize(row));
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
