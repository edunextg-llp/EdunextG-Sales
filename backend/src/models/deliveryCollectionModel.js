import db from '../config/db.js';
import PaymentModel from './paymentModel.js';

class DeliveryCollectionModel {
    static async getAssignedSale(deliveryBoyId, saleId) {
        const [rows] = await db.execute(
            `SELECT ss.id, ss.invoice_number, ss.price, ss.packaging_status,
                    sc.outlet_name
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON s.id = ss.staff_id
             WHERE ss.id = ? AND (
                ss.delivery_boy_id = ? OR EXISTS (
                    SELECT 1 FROM delivery_boy_companies dbc
                    LEFT JOIN staff_companies stc ON stc.company_id = dbc.company_id AND stc.staff_id = s.id
                    WHERE dbc.delivery_boy_id = ? AND (dbc.company_id = s.company_id OR stc.staff_id IS NOT NULL)
                )
             )
             LIMIT 1`,
            [saleId, deliveryBoyId, deliveryBoyId]
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
                (sale_id, delivery_boy_id, sale_payment_id, payment_mode, amount, cash_details,
                 reference_no, reference_date, credit_days, remarks, settled_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
             `,
            [
                saleId,
                deliveryBoyId,
                data.salePaymentId || null,
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
            `SELECT dbc.id, dbc.sale_id, dbc.delivery_boy_id, dbc.sale_payment_id, dbc.settled_at, dbc.payment_mode, dbc.amount,
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
             ORDER BY dbc.id DESC
             LIMIT 1`,
            [saleId, deliveryBoyId]
        );
        return DeliveryCollectionModel.normalizeRow(rows[0]);
    }

    static async getForDeliveryBoy(deliveryBoyId) {
        const [rows] = await db.execute(
            `SELECT dbc.id, dbc.sale_id, dbc.delivery_boy_id, dbc.sale_payment_id, dbc.settled_at, dbc.payment_mode, dbc.amount,
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

    static async getOutstandingSalesForDeliveryBoy(deliveryBoyId, executor = db) {
        const [rows] = await executor.execute(
            `SELECT ss.id AS sale_id, ss.price, ss.paid_amount,
                    GREATEST(0, ss.price - COALESCE(cancelled.total, 0) - COALESCE(paid.total, 0)) AS balance_amount,
                    COALESCE(credit_due.credit_amount, 0) AS credit_amount,
                    CASE WHEN assigned_bill.sale_id IS NOT NULL THEN 'taken_bill' ELSE 'delivery' END AS collection_source,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    ss.invoice_number, sc.outlet_name, sc.outlet_erp_id,
                    sc.location_name, COALESCE(c.name, 'Company not assigned') AS company_name
             FROM staff_sales ss
             INNER JOIN staff_counters sc ON sc.id = ss.outlet_id
             INNER JOIN staff s ON s.id = ss.staff_id
             LEFT JOIN companies c ON c.id = s.company_id
             LEFT JOIN (
                 SELECT DISTINCT sp.sale_id
                 FROM taken_bills tb
                 INNER JOIN sale_payments sp ON sp.id = tb.payment_id
                 WHERE tb.delivery_boy_id = ? AND tb.collector_type = 'bawarchee_staff'
                   AND tb.returned_at IS NULL
                   AND sp.payment_mode = 'credit'
                   AND sp.amount > COALESCE((SELECT SUM(child.amount) FROM sale_payments child
                       WHERE child.parent_credit_payment_id = sp.id AND child.payment_mode IN ('cash','upi','cheque')), 0)
             ) assigned_bill ON assigned_bill.sale_id = ss.id
             LEFT JOIN (SELECT sale_id, SUM(amount) AS total FROM sale_payments
                        WHERE payment_mode IN ('cash','upi','cheque') GROUP BY sale_id) paid ON paid.sale_id = ss.id
             LEFT JOIN (SELECT sale_id, SUM(amount) AS total FROM order_cancellations
                        GROUP BY sale_id) cancelled ON cancelled.sale_id = ss.id
             LEFT JOIN (
                 SELECT credit.sale_id,
                        SUM(GREATEST(0, credit.amount - COALESCE(child.paid, 0))) AS credit_amount
                 FROM sale_payments credit
                 LEFT JOIN (
                     SELECT parent_credit_payment_id, SUM(amount) AS paid
                     FROM sale_payments
                     WHERE parent_credit_payment_id IS NOT NULL
                       AND payment_mode IN ('cash','upi','cheque')
                     GROUP BY parent_credit_payment_id
                 ) child ON child.parent_credit_payment_id = credit.id
                 WHERE credit.payment_mode = 'credit'
                 GROUP BY credit.sale_id
             ) credit_due ON credit_due.sale_id = ss.id
             WHERE (assigned_bill.sale_id IS NOT NULL OR ss.packaging_status = 'delivered')
               AND GREATEST(0, ss.price - COALESCE(cancelled.total, 0) - COALESCE(paid.total, 0)) > 0
               AND NOT EXISTS (
                    SELECT 1 FROM delivery_boy_collections pending
                    WHERE pending.sale_id = ss.id AND pending.settled_at IS NULL
               )
               AND (assigned_bill.sale_id IS NOT NULL OR (
                    ss.delivery_boy_id = ? AND EXISTS (
                        SELECT 1 FROM staff_sale_status_history history
                        WHERE history.sale_id = ss.id AND history.status = 'delivered'
                          AND history.changed_at > NOW() - INTERVAL 1 DAY
                          AND history.changed_at <= NOW()
                    )))
             ORDER BY ss.sale_date ASC, ss.id ASC`,
            [deliveryBoyId, deliveryBoyId]
        );
        return rows.map((row) => ({
            ...row,
            price: Number(row.price) || 0,
            paid_amount: Number(row.paid_amount) || 0,
            balance_amount: Number(row.balance_amount) || 0,
            credit_amount: Number(row.credit_amount) || 0,
        }));
    }

    static async collectOutstandingPayment(deliveryBoyId, saleId, data) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('SELECT id FROM staff_sales WHERE id = ? FOR UPDATE', [saleId]);
            const due = (await this.getOutstandingSalesForDeliveryBoy(deliveryBoyId, connection))
                .find((row) => Number(row.sale_id) === Number(saleId));
            if (!due) { await connection.rollback(); return null; }
            const price = await PaymentModel.getEffectiveSalePrice(connection, saleId);
            const paid = await PaymentModel.getTotalPaid(connection, saleId);
            const remaining = Math.max(0, price - paid);
            if (!Number.isFinite(data.amount) || data.amount <= 0 || data.amount > remaining + 0.001) {
                throw Object.assign(new Error('EXCEEDS_BALANCE'), { remaining });
            }
            if (data.paymentMode === 'credit' && due.credit_amount > 0 && Math.abs(data.amount - remaining) > 0.001) {
                throw new Error('FULL_CREDIT_BALANCE_REQUIRED');
            }
            const [result] = await connection.execute(
                `INSERT INTO delivery_boy_collections
                 (sale_id, delivery_boy_id, payment_mode, amount, cash_details, reference_no, reference_date, credit_days, remarks, settled_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
                [saleId, deliveryBoyId, data.paymentMode, data.amount,
                 data.cashDetails ? JSON.stringify(data.cashDetails) : null,
                 data.referenceNo, data.referenceDate, data.creditDays, `Mobile payment for BP${saleId}`]
            );
            await connection.commit();
            return { collection: { id: result.insertId, sale_id: saleId, amount: data.amount }, remainingBalance: remaining };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    }

    static async settle(collectionId) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                `SELECT dbc.*, dboy.name AS delivery_boy_name, ss.price
                 FROM delivery_boy_collections dbc
                 INNER JOIN delivery_boys dboy ON dboy.id = dbc.delivery_boy_id
                 INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
                 WHERE dbc.id = ? AND dbc.settled_at IS NULL FOR UPDATE`,
                [collectionId]
            );
            const collection = rows[0];
            if (!collection) { await connection.rollback(); return false; }

            const amount = Number(collection.amount) || 0;
            await connection.execute('SELECT id FROM staff_sales WHERE id = ? FOR UPDATE', [collection.sale_id]);
            const [paidRows] = await connection.execute(
                `SELECT COALESCE(SUM(amount), 0) AS paid FROM sale_payments
                 WHERE sale_id = ? AND payment_mode IN ('cash','upi','cheque')`,
                [collection.sale_id]
            );
            const effectivePrice = await PaymentModel.getEffectiveSalePrice(connection, collection.sale_id);
            const remainingSaleBalance = Math.max(0, effectivePrice - Number(paidRows[0].paid));
            if (amount <= 0 || amount > remainingSaleBalance + 0.001) {
                const error = new Error('COLLECTION_EXCEEDS_BALANCE');
                error.remaining = remainingSaleBalance;
                throw error;
            }

            const insertPayment = async (paymentAmount, parentCreditPaymentId = null) => {
                const [result] = await connection.execute(
                    `INSERT INTO sale_payments
                     (sale_id, payment_date, payment_mode, amount, collector_staff_id, collector_name,
                      parent_credit_payment_id, reference_no, reference_date, credit_days)
                     VALUES (?, CURDATE(), ?, ?, NULL, ?, ?, ?, ?, ?)`,
                    [collection.sale_id, collection.payment_mode, paymentAmount, collection.delivery_boy_name,
                     parentCreditPaymentId, collection.reference_no, collection.reference_date, collection.credit_days]
                );
                return result.insertId;
            };

            let amountToApply = amount;
            let lastPaymentId = null;
            if (collection.payment_mode === 'credit') {
                const [existingCredits] = await connection.execute(
                    `SELECT sp.id, GREATEST(0, sp.amount - COALESCE(child.paid, 0)) AS balance
                     FROM sale_payments sp
                     LEFT JOIN (SELECT parent_credit_payment_id, SUM(amount) AS paid FROM sale_payments
                                WHERE parent_credit_payment_id IS NOT NULL AND payment_mode IN ('cash','upi','cheque')
                                GROUP BY parent_credit_payment_id) child ON child.parent_credit_payment_id = sp.id
                     WHERE sp.sale_id = ? AND sp.payment_mode = 'credit'
                     HAVING balance > 0`, [collection.sale_id]
                );
                if (existingCredits.length && Math.abs(amount - remainingSaleBalance) > 0.001) {
                    throw Object.assign(new Error('COLLECTION_EXCEEDS_BALANCE'), { remaining: remainingSaleBalance });
                }
                for (const credit of existingCredits) {
                    await connection.execute(
                        'UPDATE sale_payments SET credit_days = ?, payment_date = CURDATE() WHERE id = ?',
                        [collection.credit_days, credit.id]
                    );
                    lastPaymentId = credit.id;
                    amountToApply = Math.max(0, Math.round((amountToApply - Number(credit.balance)) * 100) / 100);
                }
            }
            if (collection.payment_mode !== 'credit') {
                const [credits] = await connection.execute(
                    `SELECT sp.id, GREATEST(0, sp.amount - COALESCE(child.paid, 0)) AS balance
                     FROM sale_payments sp
                     LEFT JOIN (SELECT parent_credit_payment_id, SUM(amount) AS paid FROM sale_payments
                                WHERE parent_credit_payment_id IS NOT NULL AND payment_mode IN ('cash','upi','cheque')
                                GROUP BY parent_credit_payment_id) child ON child.parent_credit_payment_id = sp.id
                     WHERE sp.sale_id = ? AND sp.payment_mode = 'credit'
                     HAVING balance > 0 ORDER BY sp.payment_date ASC, sp.id ASC`,
                    [collection.sale_id]
                );
                for (const credit of credits) {
                    if (amountToApply <= 0.001) break;
                    const allocation = Math.min(amountToApply, Number(credit.balance));
                    lastPaymentId = await insertPayment(allocation, credit.id);
                    amountToApply = Math.round((amountToApply - allocation) * 100) / 100;
                }
            }
            if (amountToApply > 0.001) {
                lastPaymentId = await insertPayment(amountToApply);
            }

            await PaymentModel.recalculateSaleTotals(connection, collection.sale_id);
            await connection.execute(
                `UPDATE delivery_boy_collections SET sale_payment_id = ?, settled_at = NOW() WHERE id = ?`,
                [lastPaymentId, collectionId]
            );
            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getBySaleId(saleId) {
        const [rows] = await db.execute(
            `SELECT dbc.id, dbc.sale_id, dbc.delivery_boy_id, dbc.sale_payment_id, dbc.settled_at, dbc.payment_mode, dbc.amount,
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
            `SELECT dbc.id, dbc.sale_id, dbc.delivery_boy_id, dbc.sale_payment_id, dbc.settled_at, dbc.payment_mode, dbc.amount,
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
             LIMIT 10000`,
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
