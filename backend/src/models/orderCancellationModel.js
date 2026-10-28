import db from '../config/db.js';
import { actorNameSql, actorParams } from '../utils/requestContext.js';

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

    static async create({ saleId, saleItemId, productErpId, outletName, invoiceNumber, productName, productQty, productSize, amount, reason, remarks, cancellationRequestId }, connection = db) {
        const qtyValue = productQty ?? productSize;
        const [result] = await connection.execute(
            `INSERT INTO order_cancellations 
            (sale_id, sale_item_id, product_erp_id, outlet_name, invoice_number, product_name, product_size, product_qty, amount, reason, remarks,
             cancelled_by_type, cancelled_by_id, cancellation_request_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [saleId || null, saleItemId || null, productErpId || null, outletName, invoiceNumber, productName, String(qtyValue), qtyValue, amount, reason, remarks,
                ...actorParams(), cancellationRequestId || null]
        );
        return result.insertId;
    }

    static async getBySaleId(saleId) {
        // cancelled_by = who logged / approved it; requested_by = who raised the approval request.
        const cancelledBy = actorNameSql('oc', 'cancelled_by');
        const [rows] = await db.execute(
            `SELECT oc.id, oc.sale_id, oc.sale_item_id, oc.product_erp_id, oc.outlet_name, oc.invoice_number, oc.product_name,
                    oc.product_size, oc.product_qty, oc.amount, oc.reason, oc.remarks,
                    DATE_FORMAT(oc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    ${cancelledBy.columns},
                    COALESCE(req.reviewed_by_name, cancelled_by_admin.username, cancelled_by_staff.name, cancelled_by_db.name) AS approved_by_name,
                    req.requested_by_name
             FROM order_cancellations oc
             ${cancelledBy.joins}
             LEFT JOIN order_cancellation_requests req ON req.id = oc.cancellation_request_id
             WHERE oc.sale_id = ?
             ORDER BY oc.created_at DESC`,
            [saleId]
        );
        return rows;
    }
}

export default OrderCancellationModel;
