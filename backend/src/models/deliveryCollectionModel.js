import db from '../config/db.js';

class DeliveryCollectionModel {
    static async getAssignedSale(deliveryBoyId, saleId) {
        const [rows] = await db.execute(
            `SELECT ss.id, ss.invoice_number, ss.price, ss.packaging_status,
                    sc.outlet_name
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             WHERE ss.id = ? AND ss.delivery_boy_id = ?
             LIMIT 1`,
            [saleId, deliveryBoyId]
        );
        return rows[0] || null;
    }

    static async upsertForDeliveryBoy(deliveryBoyId, saleId, data) {
        const sale = await DeliveryCollectionModel.getAssignedSale(deliveryBoyId, saleId);
        if (!sale) {
            return null;
        }

        const cashDetails = data.cashDetails ? JSON.stringify(data.cashDetails) : null;

        await db.execute(
            `INSERT INTO delivery_boy_collections
                (sale_id, delivery_boy_id, payment_mode, amount, cash_details,
                 reference_no, reference_date, credit_days, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                payment_mode = VALUES(payment_mode),
                amount = VALUES(amount),
                cash_details = VALUES(cash_details),
                reference_no = VALUES(reference_no),
                reference_date = VALUES(reference_date),
                credit_days = VALUES(credit_days),
                remarks = VALUES(remarks),
                updated_at = CURRENT_TIMESTAMP`,
            [
                saleId,
                deliveryBoyId,
                data.paymentMode,
                data.amount,
                cashDetails,
                data.referenceNo || null,
                data.referenceDate || null,
                data.creditDays ?? null,
                data.remarks || null,
            ]
        );

        return DeliveryCollectionModel.getBySaleForDeliveryBoy(deliveryBoyId, saleId);
    }

    static async getBySaleForDeliveryBoy(deliveryBoyId, saleId) {
        const [rows] = await db.execute(
            `SELECT dbc.id, dbc.sale_id, dbc.delivery_boy_id, dbc.payment_mode, dbc.amount,
                    dbc.cash_details, dbc.reference_no,
                    DATE_FORMAT(dbc.reference_date, '%Y-%m-%d') AS reference_date,
                    dbc.credit_days, dbc.remarks,
                    DATE_FORMAT(dbc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE_FORMAT(dbc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                    ss.invoice_number, ss.price, ss.packaging_status,
                    sc.outlet_name,
                    dboy.name AS delivery_boy_name
             FROM delivery_boy_collections dbc
             INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN delivery_boys dboy ON dboy.id = dbc.delivery_boy_id
             WHERE dbc.sale_id = ? AND dbc.delivery_boy_id = ?
             LIMIT 1`,
            [saleId, deliveryBoyId]
        );
        return DeliveryCollectionModel.normalizeRow(rows[0]);
    }

    static async getForDeliveryBoy(deliveryBoyId) {
        const [rows] = await db.execute(
            `SELECT dbc.id, dbc.sale_id, dbc.delivery_boy_id, dbc.payment_mode, dbc.amount,
                    dbc.cash_details, dbc.reference_no,
                    DATE_FORMAT(dbc.reference_date, '%Y-%m-%d') AS reference_date,
                    dbc.credit_days, dbc.remarks,
                    DATE_FORMAT(dbc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE_FORMAT(dbc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                    ss.invoice_number, ss.price, ss.packaging_status,
                    sc.outlet_name,
                    dboy.name AS delivery_boy_name
             FROM delivery_boy_collections dbc
             INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN delivery_boys dboy ON dboy.id = dbc.delivery_boy_id
             WHERE dbc.delivery_boy_id = ?
             ORDER BY dbc.updated_at DESC, dbc.id DESC`,
            [deliveryBoyId]
        );
        return rows.map(DeliveryCollectionModel.normalizeRow);
    }

    static async getBySaleId(saleId) {
        const [rows] = await db.execute(
            `SELECT dbc.id, dbc.sale_id, dbc.delivery_boy_id, dbc.payment_mode, dbc.amount,
                    dbc.cash_details, dbc.reference_no,
                    DATE_FORMAT(dbc.reference_date, '%Y-%m-%d') AS reference_date,
                    dbc.credit_days, dbc.remarks,
                    DATE_FORMAT(dbc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE_FORMAT(dbc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                    ss.invoice_number, ss.price, ss.packaging_status,
                    sc.outlet_name,
                    dboy.name AS delivery_boy_name
             FROM delivery_boy_collections dbc
             INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN delivery_boys dboy ON dboy.id = dbc.delivery_boy_id
             WHERE dbc.sale_id = ?
             ORDER BY dbc.updated_at DESC, dbc.id DESC`,
            [saleId]
        );
        return rows.map(DeliveryCollectionModel.normalizeRow);
    }

    static async getAll({ search = '' } = {}) {
        const params = [];
        let where = '';
        const normalizedSearch = String(search || '').trim();

        if (normalizedSearch) {
            const term = `%${normalizedSearch}%`;
            where = `WHERE sc.outlet_name LIKE ?
                OR ss.invoice_number LIKE ?
                OR dboy.name LIKE ?
                OR dbc.payment_mode LIKE ?
                OR CAST(dbc.sale_id AS CHAR) LIKE ?`;
            params.push(term, term, term, term, term);
        }

        const [rows] = await db.execute(
            `SELECT dbc.id, dbc.sale_id, dbc.delivery_boy_id, dbc.payment_mode, dbc.amount,
                    dbc.cash_details, dbc.reference_no,
                    DATE_FORMAT(dbc.reference_date, '%Y-%m-%d') AS reference_date,
                    dbc.credit_days, dbc.remarks,
                    DATE_FORMAT(dbc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE_FORMAT(dbc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                    ss.invoice_number, ss.price, ss.paid_amount, ss.balance_amount,
                    ss.packaging_status,
                    sc.outlet_name,
                    dboy.name AS delivery_boy_name
             FROM delivery_boy_collections dbc
             INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN delivery_boys dboy ON dboy.id = dbc.delivery_boy_id
             ${where}
             ORDER BY dbc.updated_at DESC, dbc.id DESC
             LIMIT 1000`,
            params
        );
        return rows.map(DeliveryCollectionModel.normalizeRow);
    }

    static normalizeRow(row) {
        if (!row) {
            return null;
        }

        let cashDetails = null;
        if (row.cash_details) {
            try {
                cashDetails = typeof row.cash_details === 'string'
                    ? JSON.parse(row.cash_details)
                    : row.cash_details;
            } catch (_error) {
                cashDetails = null;
            }
        }

        return {
            ...row,
            amount: parseFloat(row.amount) || 0,
            price: row.price != null ? parseFloat(row.price) || 0 : null,
            paid_amount: row.paid_amount != null ? parseFloat(row.paid_amount) || 0 : null,
            balance_amount: row.balance_amount != null ? parseFloat(row.balance_amount) || 0 : null,
            cash_details: cashDetails,
        };
    }
}

export default DeliveryCollectionModel;
