import db from '../config/db.js';

class PaymentModel {
    static async getBySaleId(saleId) {
        const [rows] = await db.execute(
            `SELECT id, sale_id, payment_date, payment_mode, amount,
                    reference_no, reference_date, credit_days, created_at
             FROM sale_payments
             WHERE sale_id = ?
             ORDER BY payment_date ASC, id ASC`,
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

    static async getTotalAllocated(connection, saleId) {
        const [rows] = await connection.execute(
            'SELECT COALESCE(SUM(amount), 0) AS total FROM sale_payments WHERE sale_id = ?',
            [saleId]
        );
        return parseFloat(rows[0].total);
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
        let totalAllocated = 0;
        let lastMode = 'cash';

        for (const payment of payments) {
            const amount = parseFloat(payment.amount);
            totalAllocated += amount;
            if (['cash', 'upi', 'cheque'].includes(payment.payment_mode)) {
                paidAmount += amount;
            }
            lastMode = payment.payment_mode;
        }

        const balanceAmount = Math.max(0, Math.round((price - totalAllocated) * 100) / 100);
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
            `SELECT id, price, paid_amount, balance_amount, invoice_number
             FROM staff_sales WHERE id = ?`,
            [saleId]
        );
        if (!rows[0]) {
            return null;
        }

        const sale = rows[0];
        const price = parseFloat(sale.price) || 0;

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
            let totalAllocated = 0;
            let lastMode = 'cash';

            for (const payment of payments) {
                const amount = parseFloat(payment.amount) || 0;
                totalAllocated += amount;
                if (['cash', 'upi', 'cheque'].includes(payment.payment_mode)) {
                    paidAmount += amount;
                }
                lastMode = payment.payment_mode;
            }

            return {
                id: sale.id,
                price,
                paid_amount: paidAmount,
                balance_amount: Math.max(0, Math.round((price - totalAllocated) * 100) / 100),
                payment_mode: lastMode,
                invoice_number: sale.invoice_number,
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
            paid_amount: paidAmount,
            balance_amount: balanceAmount,
            invoice_number: sale.invoice_number,
        };
    }

    static async addPayment(saleId, data) {
        const { paymentDate, paymentMode, amount, referenceNo, referenceDate, creditDays } = data;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const price = await PaymentModel.getSalePrice(connection, saleId);
            if (price === null) {
                const err = new Error('SALE_NOT_FOUND');
                throw err;
            }

            const totalAllocated = await PaymentModel.getTotalAllocated(connection, saleId);
            const remaining = Math.round((price - totalAllocated) * 100) / 100;

            if (amount > remaining + 0.001) {
                const err = new Error('EXCEEDS_BALANCE');
                err.remaining = remaining;
                throw err;
            }

            await connection.execute(
                `INSERT INTO sale_payments
                 (sale_id, payment_date, payment_mode, amount, reference_no, reference_date, credit_days)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    saleId,
                    paymentDate,
                    paymentMode,
                    amount,
                    referenceNo || null,
                    referenceDate || null,
                    creditDays ?? null,
                ]
            );

            await PaymentModel.recalculateSaleTotals(connection, saleId);
            await connection.commit();

            const payments = await PaymentModel.getBySaleId(saleId);
            const [saleRows] = await db.execute(
                'SELECT price, paid_amount, balance_amount FROM staff_sales WHERE id = ?',
                [saleId]
            );

            return {
                payments,
                summary: {
                    price: parseFloat(saleRows[0].price),
                    paidAmount: parseFloat(saleRows[0].paid_amount),
                    balanceAmount: parseFloat(saleRows[0].balance_amount),
                },
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

export default PaymentModel;
