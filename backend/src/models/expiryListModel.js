import db from '../config/db.js';

class ExpiryListModel {
    static async create(data) {
        const [result] = await db.execute(
            `INSERT INTO outlet_expiry_list
             (company_id, staff_id, outlet_id, product_source, product_erp_id, product_name, expiry_date, qty, amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.companyId, data.staffId, data.outletId, data.productSource,
                data.productErpId || null, data.productName, data.expiryDate, data.qty, data.amount]
        );
        return ExpiryListModel.getById(result.insertId);
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT el.id, el.company_id, el.staff_id, el.outlet_id, el.product_source,
                    el.product_erp_id, el.product_name, DATE_FORMAT(el.expiry_date, '%Y-%m-%d') AS expiry_date,
                    el.qty, el.amount, c.name AS company_name, s.name AS staff_name,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name,
                    DATE_FORMAT(el.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM outlet_expiry_list el
             INNER JOIN companies c ON c.id = el.company_id
             INNER JOIN staff s ON s.id = el.staff_id
             INNER JOIN staff_counters sc ON sc.id = el.outlet_id
             WHERE el.id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT el.id, el.company_id, el.staff_id, el.outlet_id, el.product_source,
                    el.product_erp_id, el.product_name, DATE_FORMAT(el.expiry_date, '%Y-%m-%d') AS expiry_date,
                    el.qty, el.amount, c.name AS company_name, s.name AS staff_name,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name,
                    DATE_FORMAT(el.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM outlet_expiry_list el
             INNER JOIN companies c ON c.id = el.company_id
             INNER JOIN staff s ON s.id = el.staff_id
             INNER JOIN staff_counters sc ON sc.id = el.outlet_id
             ORDER BY el.expiry_date ASC, el.id DESC
             LIMIT 1000`
        );
        return rows;
    }
}

export default ExpiryListModel;
