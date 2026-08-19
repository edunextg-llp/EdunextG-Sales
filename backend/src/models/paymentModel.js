import db from '../config/db.js';
import OrderCancellationModel from './orderCancellationModel.js';

class PaymentModel {
    static async getBySaleId(saleId) {
        const [rows] = await db.execute(
            `SELECT sp.id, sp.sale_id, sp.parent_credit_payment_id,
                    DATE_FORMAT(sp.payment_date, '%Y-%m-%d') AS payment_date,
                    sp.payment_mode, sp.amount, sp.collector_staff_id, collector.name AS collector_staff_name,
                    sp.collector_name, sp.reference_no,
                    DATE_FORMAT(sp.reference_date, '%Y-%m-%d') AS reference_date,
                    sp.credit_days, sp.created_at
             FROM sale_payments sp
             LEFT JOIN staff collector ON collector.id = sp.collector_staff_id
             WHERE sp.sale_id = ?
             ORDER BY sp.payment_date ASC, sp.id ASC`,
            [saleId]
        );
        return rows;
    }

    static async getSalePrice(connection, saleId) {
        const [rows] = await connection.execute(
            'SELECT price FROM staff_sales WHERE id = ?',
            [saleId]
        );
        if (!rows.length) {
            return null;
        }
        return parseFloat(rows[0].price);
    }

    static async getEffectiveSalePrice(connection, saleId) {
        const price = await PaymentModel.getSalePrice(connection, saleId);
        if (price === null) {
            return null;
        }
        const totalCancelled = await OrderCancellationModel.getTotalCancelledAmount(connection, saleId);
        return Math.max(0, Math.round((price - totalCancelled) * 100) / 100);
    }

    /** Sum of cash, UPI, and cheque only — credit does not count as paid. */
    static async getTotalPaid(connection, saleId, excludePaymentId = null) {
        const params = [saleId];
        let excludeClause = '';
        if (excludePaymentId != null) {
            excludeClause = ' AND id <> ?';
            params.push(excludePaymentId);
        }
        const [rows] = await connection.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM sale_payments
             WHERE sale_id = ? AND payment_mode IN ('cash', 'upi', 'cheque')${excludeClause}`,
            params
        );
        return parseFloat(rows[0].total);
    }

    static async getCreditRemaining(connection, saleId, creditPaymentId, excludePaymentId = null) {
        const [creditRows] = await connection.execute(
            `SELECT id, amount
             FROM sale_payments
             WHERE id = ? AND sale_id = ? AND payment_mode = 'credit'
             FOR UPDATE`,
            [creditPaymentId, saleId]
        );

        if (!creditRows.length) {
            const err = new Error('CREDIT_PAYMENT_NOT_FOUND');
            throw err;
        }

        const params = [creditPaymentId];
        let excludeClause = '';
        if (excludePaymentId != null) {
            excludeClause = ' AND id <> ?';
            params.push(excludePaymentId);
        }

        const [childRows] = await connection.execute(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM sale_payments
             WHERE parent_credit_payment_id = ?
               AND payment_mode IN ('cash', 'upi', 'cheque')${excludeClause}`,
            params
        );

        const creditAmount = parseFloat(creditRows[0].amount) || 0;
        const childPaid = parseFloat(childRows[0].total) || 0;
        return Math.max(0, Math.round((creditAmount - childPaid) * 100) / 100);
    }

    static async buildPaymentResponse(saleId) {
        const payments = await PaymentModel.getBySaleId(saleId);
        const [saleRows] = await db.execute(
            `SELECT id, CONCAT('BP', id) AS bp_sale_id,
                    price, paid_amount, balance_amount
             FROM staff_sales WHERE id = ?`,
            [saleId]
        );

        return {
            payments,
            summary: {
                price: parseFloat(saleRows[0].price),
                paidAmount: parseFloat(saleRows[0].paid_amount),
                balanceAmount: parseFloat(saleRows[0].balance_amount),
                saleId: saleRows[0].id,
                bpSaleId: saleRows[0].bp_sale_id,
            },
        };
    }

    static async recalculateSaleTotals(connection, saleId) {
        const price = await PaymentModel.getSalePrice(connection, saleId);
        if (price === null) {
            return;
        }

        const [payments] = await connection.execute(
            'SELECT payment_mode, amount FROM sale_payments WHERE sale_id = ? ORDER BY id ASC',
            [saleId]
        );

        let paidAmount = 0;
        let lastMode = 'cash';

        for (const payment of payments) {
            const amount = parseFloat(payment.amount);
            if (['cash', 'upi', 'cheque'].includes(payment.payment_mode)) {
                paidAmount += amount;
            }
            lastMode = payment.payment_mode;
        }

        const totalCancelled = await OrderCancellationModel.getTotalCancelledAmount(connection, saleId);
        const effectivePrice = Math.max(0, Math.round((price - totalCancelled) * 100) / 100);
        const balanceAmount = Math.max(0, Math.round((effectivePrice - paidAmount) * 100) / 100);
        const paymentMode =
            balanceAmount === 0
                ? lastMode
                : payments.some((p) => p.payment_mode === 'credit')
                  ? 'credit'
                  : lastMode;

        await connection.execute(
            `UPDATE staff_sales
             SET paid_amount = ?, balance_amount = ?, payment_mode = ?
             WHERE id = ?`,
            [paidAmount, balanceAmount, paymentMode, saleId]
        );
    }

    static async getSaleSummary(saleId) {
        const [rows] = await db.execute(
            `SELECT id, CONCAT('BP', id) AS bp_sale_id,
                    price, paid_amount, balance_amount, invoice_number
             FROM staff_sales WHERE id = ?`,
            [saleId]
        );
        if (!rows[0]) {
            return null;
        }

        const sale = rows[0];
        const price = parseFloat(sale.price) || 0;
        const totalCancelled = await OrderCancellationModel.getTotalCancelledAmount(db, saleId);
        const effectivePrice = Math.max(0, Math.round((price - totalCancelled) * 100) / 100);

        let payments = [];
        try {
            const [paymentRows] = await db.execute(
                'SELECT payment_mode, amount FROM sale_payments WHERE sale_id = ? ORDER BY id ASC',
                [saleId]
            );
            payments = paymentRows;
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                throw error;
            }
        }

        if (payments.length > 0) {
            let paidAmount = 0;
            let lastMode = 'cash';

            for (const payment of payments) {
                const amount = parseFloat(payment.amount) || 0;
                if (['cash', 'upi', 'cheque'].includes(payment.payment_mode)) {
                    paidAmount += amount;
                }
                lastMode = payment.payment_mode;
            }

            return {
                id: sale.id,
                price,
                effectivePrice,
                cancelledAmount: totalCancelled,
                paid_amount: paidAmount,
                balance_amount: Math.max(0, Math.round((price - paidAmount) * 100) / 100),
                payment_mode: lastMode,
                invoice_number: sale.invoice_number,
                bp_sale_id: sale.bp_sale_id,
            };
        }

        const paidAmount = parseFloat(sale.paid_amount) || 0;
        const storedBalance = sale.balance_amount != null ? parseFloat(sale.balance_amount) : null;
        const balanceAmount =
            storedBalance != null && !Number.isNaN(storedBalance)
                ? Math.max(0, storedBalance)
                : Math.max(0, price - paidAmount);

        return {
            id: sale.id,
            price,
            effectivePrice,
            cancelledAmount: totalCancelled,
            paid_amount: paidAmount,
            balance_amount: balanceAmount,
            invoice_number: sale.invoice_number,
            bp_sale_id: sale.bp_sale_id,
        };
    }

    static async addPayment(saleId, data) {
        const { paymentDate, paymentMode, amount, collectorStaffId, collectorName, referenceNo, referenceDate, creditDays, parentCreditPaymentId } = data;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const price = await PaymentModel.getEffectiveSalePrice(connection, saleId);
            if (price === null) {
                const err = new Error('SALE_NOT_FOUND');
                throw err;
            }

            const totalPaid = await PaymentModel.getTotalPaid(connection, saleId);
            const remaining = Math.round((price - totalPaid) * 100) / 100;

            if (amount > remaining + 0.001) {
                const err = new Error('EXCEEDS_BALANCE');
                err.remaining = remaining;
                throw err;
            }

            let parentCreditId = null;
            if (parentCreditPaymentId) {
                if (paymentMode === 'credit') {
                    const err = new Error('CREDIT_CHILD_CANNOT_BE_CREDIT');
                    throw err;
                }

                parentCreditId = parseInt(parentCreditPaymentId, 10);
                const creditRemaining = await PaymentModel.getCreditRemaining(
                    connection,
                    saleId,
                    parentCreditId
                );
                if (amount > creditRemaining + 0.001) {
                    const err = new Error('EXCEEDS_CREDIT_BALANCE');
                    err.remaining = creditRemaining;
                    throw err;
                }
            }

            await connection.execute(
                `INSERT INTO sale_payments
                 (sale_id, payment_date, payment_mode, amount, collector_staff_id, collector_name, parent_credit_payment_id, reference_no, reference_date, credit_days)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    saleId,
                    paymentDate,
                    paymentMode,
                    amount,
                    collectorStaffId || null,
                    collectorName || null,
                    parentCreditId,
                    referenceNo || null,
                    referenceDate || null,
                    creditDays ?? null,
                ]
            );

            await PaymentModel.recalculateSaleTotals(connection, saleId);
            await connection.commit();

            return PaymentModel.buildPaymentResponse(saleId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async updatePayment(saleId, paymentId, data) {
        const { paymentDate, paymentMode, amount, collectorStaffId, collectorName, referenceNo, referenceDate, creditDays } = data;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [existingRows] = await connection.execute(
                'SELECT id FROM sale_payments WHERE id = ? AND sale_id = ?',
                [paymentId, saleId]
            );
            if (!existingRows.length) {
                const err = new Error('PAYMENT_NOT_FOUND');
                throw err;
            }

            const price = await PaymentModel.getEffectiveSalePrice(connection, saleId);
            if (price === null) {
                const err = new Error('SALE_NOT_FOUND');
                throw err;
            }

            if (['cash', 'upi', 'cheque'].includes(paymentMode)) {
                const totalPaidExcluding = await PaymentModel.getTotalPaid(
                    connection,
                    saleId,
                    paymentId
                );
                const remaining = Math.round((price - totalPaidExcluding) * 100) / 100;
                if (amount > remaining + 0.001) {
                    const err = new Error('EXCEEDS_BALANCE');
                    err.remaining = remaining;
                    throw err;
                }
            }

            await connection.execute(
                `UPDATE sale_payments
                 SET payment_date = ?, payment_mode = ?, amount = ?,
                     reference_no = ?, reference_date = ?, credit_days = ?
                 WHERE id = ? AND sale_id = ?`,
                [
                    paymentDate,
                    paymentMode,
                    amount,
                    referenceNo || null,
                    referenceDate || null,
                    creditDays ?? null,
                    paymentId,
                    saleId,
                ]
            );

            await PaymentModel.recalculateSaleTotals(connection, saleId);
            await connection.commit();

            return PaymentModel.buildPaymentResponse(saleId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async updatePayment(paymentId, saleId, data) {
        const { paymentDate, paymentMode, amount, collectorStaffId, collectorName, referenceNo, referenceDate, creditDays } = data;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const price = await PaymentModel.getEffectiveSalePrice(connection, saleId);
            if (price === null) {
                const err = new Error('SALE_NOT_FOUND');
                throw err;
            }

            // Exclude this payment from the sum to check remaining balance properly
            const [rows] = await connection.execute(
                `SELECT COALESCE(SUM(amount), 0) AS total
                 FROM sale_payments
                 WHERE sale_id = ? AND id != ? AND payment_mode IN ('cash', 'upi', 'cheque')`,
                [saleId, paymentId]
            );
            const totalPaidWithoutThis = parseFloat(rows[0].total);
            const remainingBase = price - totalPaidWithoutThis;
            const remainingFloat = Math.round(remainingBase * 100) / 100;

            let checkAmount = amount;
            if (['cash', 'upi', 'cheque'].includes(paymentMode)) {
                if (checkAmount > remainingFloat + 0.001) {
                    const err = new Error('EXCEEDS_BALANCE');
                    err.remaining = remainingFloat;
                    throw err;
                }
            }

            const [existingPaymentRows] = await connection.execute(
                'SELECT parent_credit_payment_id FROM sale_payments WHERE id = ? AND sale_id = ?',
                [paymentId, saleId]
            );
            const parentCreditPaymentId = existingPaymentRows[0]?.parent_credit_payment_id;
            if (parentCreditPaymentId && paymentMode === 'credit') {
                const err = new Error('CREDIT_CHILD_CANNOT_BE_CREDIT');
                throw err;
            }
            if (parentCreditPaymentId && ['cash', 'upi', 'cheque'].includes(paymentMode)) {
                const creditRemaining = await PaymentModel.getCreditRemaining(
                    connection,
                    saleId,
                    parentCreditPaymentId,
                    paymentId
                );
                if (checkAmount > creditRemaining + 0.001) {
                    const err = new Error('EXCEEDS_CREDIT_BALANCE');
                    err.remaining = creditRemaining;
                    throw err;
                }
            }

            await connection.execute(
                `UPDATE sale_payments
                 SET payment_date = ?, payment_mode = ?, amount = ?, collector_staff_id = ?, collector_name = ?, reference_no = ?, reference_date = ?, credit_days = ?
                 WHERE id = ? AND sale_id = ?`,
                [
                    paymentDate,
                    paymentMode,
                    amount,
                    collectorStaffId || null,
                    collectorName || null,
                    referenceNo || null,
                    referenceDate || null,
                    creditDays ?? null,
                    paymentId,
                    saleId
                ]
            );

            await PaymentModel.recalculateSaleTotals(connection, saleId);
            await connection.commit();

            const payments = await PaymentModel.getBySaleId(saleId);
            const [saleRows] = await db.execute(
                `SELECT id, CONCAT('BP', id) AS bp_sale_id,
                        price, paid_amount, balance_amount
                 FROM staff_sales WHERE id = ?`,
                [saleId]
            );

            return {
                payments,
                summary: {
                    price: parseFloat(saleRows[0].price),
                    paidAmount: parseFloat(saleRows[0].paid_amount),
                    balanceAmount: parseFloat(saleRows[0].balance_amount),
                    saleId: saleRows[0].id,
                    bpSaleId: saleRows[0].bp_sale_id,
                },
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async deletePayment(saleId, paymentId) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const price = await PaymentModel.getSalePrice(connection, saleId);
            if (price === null) {
                const err = new Error('SALE_NOT_FOUND');
                throw err;
            }

            const [existingRows] = await connection.execute(
                `SELECT id, payment_mode
                 FROM sale_payments
                 WHERE id = ? AND sale_id = ?
                 FOR UPDATE`,
                [paymentId, saleId]
            );
            if (!existingRows.length) {
                const err = new Error('PAYMENT_NOT_FOUND');
                throw err;
            }

            const payment = existingRows[0];

            if (payment.payment_mode === 'credit') {
                await connection.execute(
                    'DELETE FROM sale_payments WHERE parent_credit_payment_id = ? AND sale_id = ?',
                    [paymentId, saleId]
                );
            }

            await connection.execute(
                'DELETE FROM sale_payments WHERE id = ? AND sale_id = ?',
                [paymentId, saleId]
            );

            await PaymentModel.recalculateSaleTotals(connection, saleId);
            await connection.commit();

            return PaymentModel.buildPaymentResponse(saleId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

export default PaymentModel;
