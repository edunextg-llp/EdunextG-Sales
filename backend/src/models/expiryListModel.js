import db from '../config/db.js';

class ExpiryListModel {
    static async create(data) {
        const [result] = await db.execute(
            `INSERT INTO outlet_expiry_list
             (company_id, seller_id, staff_id, outlet_id, product_source, product_erp_id, product_name, invoice_number, batch_number, expiry_date, qty, amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.companyId, data.sellerId, data.staffId, data.outletId, data.productSource,
                data.productErpId || null, data.productName, data.invoiceNumber, data.batchNumber,
                data.expiryDate, data.qty, data.amount]
        );
        return ExpiryListModel.getById(result.insertId);
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT el.id, el.company_id, el.seller_id, el.staff_id, el.outlet_id, el.product_source,
                    el.product_erp_id, el.product_name, el.invoice_number, el.batch_number, DATE_FORMAT(el.expiry_date, '%Y-%m-%d') AS expiry_date,
                    el.qty, el.amount, c.name AS company_name, ps.seller_name, s.name AS staff_name,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name,
                    DATE_FORMAT(el.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM outlet_expiry_list el
             INNER JOIN companies c ON c.id = el.company_id
             INNER JOIN purchase_sellers ps ON ps.id = el.seller_id
             INNER JOIN staff s ON s.id = el.staff_id
             INNER JOIN staff_counters sc ON sc.id = el.outlet_id
             WHERE el.id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT el.id, el.company_id, el.seller_id, el.staff_id, el.outlet_id, el.product_source,
                    el.product_erp_id, el.product_name, el.invoice_number, el.batch_number, DATE_FORMAT(el.expiry_date, '%Y-%m-%d') AS expiry_date,
                    el.qty, el.amount, c.name AS company_name, ps.seller_name, s.name AS staff_name,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name,
                    DATE_FORMAT(el.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM outlet_expiry_list el
             INNER JOIN companies c ON c.id = el.company_id
             INNER JOIN purchase_sellers ps ON ps.id = el.seller_id
             INNER JOIN staff s ON s.id = el.staff_id
             INNER JOIN staff_counters sc ON sc.id = el.outlet_id
             ORDER BY el.expiry_date ASC, el.id DESC
             LIMIT 10000`
        );
        return rows;
    }

    static async update(id, data) {
        const [result] = await db.execute(
            `UPDATE outlet_expiry_list SET company_id = ?, seller_id = ?, staff_id = ?, outlet_id = ?,
                    product_source = ?, product_erp_id = ?, product_name = ?, invoice_number = ?,
                    batch_number = ?, expiry_date = ?, qty = ?, amount = ? WHERE id = ?`,
            [data.companyId, data.sellerId, data.staffId, data.outletId, data.productSource,
                data.productErpId || null, data.productName, data.invoiceNumber, data.batchNumber,
                data.expiryDate, data.qty, data.amount, id]
        );
        return result.affectedRows ? ExpiryListModel.getById(id) : null;
    }
}

export default ExpiryListModel;
