import db from '../config/db.js';

class OrderCancellationModel {
    static async getTotalCancelledAmount(connection, saleId) {
        const [rows] = await connection.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM order_cancellations
             WHERE sale_id = ?`,
            [saleId]
        );
        return parseFloat(rows[0].total) || 0;
    }

    static async create({ saleId, saleItemId, productErpId, outletName, invoiceNumber, productName, productQty, productSize, amount, reason }, connection = db) {
        const qtyValue = productQty ?? productSize;
        const [result] = await connection.execute(
            `INSERT INTO order_cancellations 
            (sale_id, sale_item_id, product_erp_id, outlet_name, invoice_number, product_name, product_size, product_qty, amount, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [saleId || null, saleItemId || null, productErpId || null, outletName, invoiceNumber, productName, String(qtyValue), qtyValue, amount, reason]
        );
        return result.insertId;
    }

    static async getBySaleId(saleId) {
        const [rows] = await db.execute(
            `SELECT id, sale_id, sale_item_id, product_erp_id, outlet_name, invoice_number, product_name, product_size, product_qty, amount, reason,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM order_cancellations 
             WHERE sale_id = ? 
             ORDER BY created_at DESC`,
            [saleId]
        );
        return rows;
    }
}

export default OrderCancellationModel;
