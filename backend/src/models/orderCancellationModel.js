import db from '../config/db.js';

class OrderCancellationModel {
    static async create({ saleId, outletName, invoiceNumber, productName, productSize, amount, reason }) {
        const [result] = await db.execute(
            `INSERT INTO order_cancellations 
            (sale_id, outlet_name, invoice_number, product_name, product_size, amount, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [saleId || null, outletName, invoiceNumber, productName, productSize, amount, reason]
        );
        return result.insertId;
    }

    static async getBySaleId(saleId) {
        const [rows] = await db.execute(
            `SELECT id, sale_id, outlet_name, invoice_number, product_name, product_size, amount, reason,
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
