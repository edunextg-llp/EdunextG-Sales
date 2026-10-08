import db from '../config/db.js';
import PaymentModel from './paymentModel.js';
import { getPendingCollectedAmount } from './staffPortalModel.js';

// Business date in India. Settled payments are dated with this instead of the
// database's CURDATE(), which follows the DB server clock and can be a day off
// (e.g. a UTC/US-hosted MySQL), hiding them from "Today Collection".
export const indiaToday = (now = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

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

    static async getOutstandingSalesForDeliveryBoy(deliveryBoyId, executor = db, companyStaff = false) {
        const [rows] = await executor.execute(
            `SELECT ss.id AS sale_id, ss.price, ss.paid_amount,
                    GREATEST(0, ss.price - COALESCE(cancelled.total, 0) - COALESCE(paid.total, 0)) AS balance_amount,
                    COALESCE(credit_due.credit_amount, 0) AS credit_amount,
                    CASE WHEN assigned_bill.sale_id IS NOT NULL THEN 'taken_bill' ELSE 'delivery' END AS collection_source,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    ss.invoice_number, ss.credit_photo_url, sc.outlet_name, sc.outlet_erp_id,
                    sc.location_name, COALESCE(c.name, 'Company not assigned') AS company_name
             FROM staff_sales ss
             INNER JOIN staff_counters sc ON sc.id = ss.outlet_id
             INNER JOIN staff s ON s.id = ss.staff_id
             LEFT JOIN companies c ON c.id = s.company_id
             LEFT JOIN (
                 SELECT DISTINCT sp.sale_id
                 FROM taken_bills tb
                 INNER JOIN sale_payments sp ON sp.id = tb.payment_id
                 WHERE tb.${companyStaff ? 'staff_id' : 'delivery_boy_id'} = ? AND tb.collector_type = '${companyStaff ? 'company_staff' : 'bawarchee_staff'}'
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
               -- A taken bill always shows to the person who took it; a recent delivery
               -- drops off once a payment for it is waiting in D.B. Collection.
               AND (assigned_bill.sale_id IS NOT NULL OR NOT EXISTS (
                    SELECT 1 FROM delivery_boy_collections pending
                    WHERE pending.sale_id = ss.id AND pending.settled_at IS NULL
               ))
               AND (assigned_bill.sale_id IS NOT NULL OR (
                    ss.${companyStaff ? 'delivery_staff_id' : 'delivery_boy_id'} = ? AND NOT EXISTS (
                        SELECT 1 FROM delivery_boy_collections submitted
                        WHERE submitted.sale_id = ss.id
                    ) AND EXISTS (
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

    static async collectOutstandingPayment(deliveryBoyId, saleId, data, companyStaff = false) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('SELECT id FROM staff_sales WHERE id = ? FOR UPDATE', [saleId]);
            const due = (await this.getOutstandingSalesForDeliveryBoy(deliveryBoyId, connection, companyStaff))
                .find((row) => Number(row.sale_id) === Number(saleId));
            if (!due) { await connection.rollback(); return null; }
            if (due.collection_source === 'taken_bill' && data.paymentMode === 'credit') throw new Error('TAKEN_BILL_ALREADY_CREDIT');
            const price = await PaymentModel.getEffectiveSalePrice(connection, saleId);
            const paid = await PaymentModel.getTotalPaid(connection, saleId);
            // Money already waiting in D.B. Collection can't be collected again.
            const pendingAmount = await getPendingCollectedAmount(connection, saleId);
            const remaining = Math.max(0, Math.round((price - paid - pendingAmount) * 100) / 100);
            if (data.paymentMode !== 'credit' && remaining <= 0.001) {
                throw Object.assign(new Error('PAYMENT_ALREADY_PENDING'), { pendingAmount });
            }
            if (!Number.isFinite(data.amount) || data.amount <= 0 || data.amount > remaining + 0.001) {
                throw Object.assign(new Error('EXCEEDS_BALANCE'), { remaining });
            }
            if (data.paymentMode === 'credit' && due.credit_amount > 0 && Math.abs(data.amount - remaining) > 0.001) {
                throw new Error('FULL_CREDIT_BALANCE_REQUIRED');
            }
            const [result] = await connection.execute(
                `INSERT INTO delivery_boy_collections
                 (sale_id, ${companyStaff ? 'staff_id' : 'delivery_boy_id'}, collector_type, payment_mode, amount, cash_details, reference_no, reference_date, credit_days, remarks, collection_source, settled_at)
                 VALUES (?, ?, '${companyStaff ? 'company_staff' : 'delivery_boy'}', ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
                [saleId, deliveryBoyId, data.paymentMode, data.amount,
                 data.cashDetails ? JSON.stringify(data.cashDetails) : null,
                 data.referenceNo, data.referenceDate, data.creditDays, `Mobile payment for BP${saleId}`, due.collection_source]
            );
            await connection.commit();
            return { collection: { id: result.insertId, sale_id: saleId, amount: data.amount }, remainingBalance: remaining };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    }

    // Payments this delivery boy submitted from the app that the office has not settled yet.
    // These stay visible in the app so the mode or amount can still be corrected.
    static async getPendingCollectionsForDeliveryBoy(deliveryBoyId, executor = db, companyStaff = false) {
        const [rows] = await executor.execute(
            `SELECT dbc.id AS collection_id, dbc.sale_id, dbc.payment_mode, dbc.amount,
                    dbc.reference_no, DATE_FORMAT(dbc.reference_date, '%Y-%m-%d') AS reference_date,
                    dbc.credit_days, COALESCE(dbc.collection_source, 'delivery') AS collection_source,
                    DATE_FORMAT(dbc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE_FORMAT(dbc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    ss.invoice_number, ss.credit_photo_url, sc.outlet_name, sc.outlet_erp_id,
                    COALESCE(c.name, 'Company not assigned') AS company_name,
                    GREATEST(0, ss.price - COALESCE(cancelled.total, 0) - COALESCE(paid.total, 0)) AS max_amount,
                    COALESCE(credit_due.credit_amount, 0) AS credit_amount
             FROM delivery_boy_collections dbc
             INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN staff s ON s.id = ss.staff_id
             LEFT JOIN companies c ON c.id = s.company_id
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
             WHERE dbc.${companyStaff ? 'staff_id' : 'delivery_boy_id'} = ? AND dbc.settled_at IS NULL
               AND COALESCE(dbc.collector_type, 'delivery_boy') = '${companyStaff ? 'company_staff' : 'delivery_boy'}'
             ORDER BY dbc.created_at DESC, dbc.id DESC`,
            [deliveryBoyId]
        );
        return rows.map((row) => ({
            ...row,
            amount: Number(row.amount) || 0,
            max_amount: Number(row.max_amount) || 0,
            credit_amount: Number(row.credit_amount) || 0,
        }));
    }

    // Lets the delivery boy correct the mode/amount of a payment until the office settles it.
    static async updatePendingCollection(deliveryBoyId, collectionId, data, companyStaff = false) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                `SELECT id, sale_id, collection_source FROM delivery_boy_collections
                 WHERE id = ? AND ${companyStaff ? 'staff_id' : 'delivery_boy_id'} = ? AND settled_at IS NULL
                   AND COALESCE(collector_type, 'delivery_boy') = '${companyStaff ? 'company_staff' : 'delivery_boy'}'
                 FOR UPDATE`,
                [collectionId, deliveryBoyId]
            );
            const collection = rows[0];
            if (!collection) { await connection.rollback(); return null; }
            if (collection.collection_source === 'taken_bill' && data.paymentMode === 'credit') throw new Error('TAKEN_BILL_ALREADY_CREDIT');
            await connection.execute('SELECT id FROM staff_sales WHERE id = ? FOR UPDATE', [collection.sale_id]);
            const price = await PaymentModel.getEffectiveSalePrice(connection, collection.sale_id);
            const paid = await PaymentModel.getTotalPaid(connection, collection.sale_id);
            const remaining = Math.max(0, price - paid);
            if (!Number.isFinite(data.amount) || data.amount <= 0 || data.amount > remaining + 0.001) {
                throw Object.assign(new Error('EXCEEDS_BALANCE'), { remaining });
            }
            if (data.paymentMode === 'credit') {
                const [creditRows] = await connection.execute(
                    `SELECT COALESCE(SUM(GREATEST(0, sp.amount - COALESCE(child.paid, 0))), 0) AS credit_amount
                     FROM sale_payments sp
                     LEFT JOIN (SELECT parent_credit_payment_id, SUM(amount) AS paid FROM sale_payments
                                WHERE parent_credit_payment_id IS NOT NULL AND payment_mode IN ('cash','upi','cheque')
                                GROUP BY parent_credit_payment_id) child ON child.parent_credit_payment_id = sp.id
                     WHERE sp.sale_id = ? AND sp.payment_mode = 'credit'`,
                    [collection.sale_id]
                );
                if (Number(creditRows[0]?.credit_amount) > 0 && Math.abs(data.amount - remaining) > 0.001) {
                    throw new Error('FULL_CREDIT_BALANCE_REQUIRED');
                }
            }
            await connection.execute(
                `UPDATE delivery_boy_collections
                 SET payment_mode = ?, amount = ?, cash_details = ?, reference_no = ?, reference_date = ?, credit_days = ?
                 WHERE id = ?`,
                [data.paymentMode, data.amount,
                 data.cashDetails ? JSON.stringify(data.cashDetails) : null,
                 data.referenceNo ?? null, data.referenceDate ?? null, data.creditDays ?? null, collectionId]
            );
            await connection.commit();
            return { collection: { id: collectionId, sale_id: collection.sale_id, amount: data.amount, payment_mode: data.paymentMode }, remainingBalance: remaining };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally { connection.release(); }
    }

    static async settle(collectionId, chequeDate, details = {}) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                `SELECT dbc.*, COALESCE(dboy.name, collector_staff.name) AS delivery_boy_name, ss.price
                 FROM delivery_boy_collections dbc
                 LEFT JOIN delivery_boys dboy ON dboy.id = dbc.delivery_boy_id
                 LEFT JOIN staff collector_staff ON collector_staff.id = dbc.staff_id
                 INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
                 WHERE dbc.id = ? AND dbc.settled_at IS NULL FOR UPDATE`,
                [collectionId]
            );
            const collection = rows[0];
            if (!collection) { await connection.rollback(); return false; }
            // Admin may settle a UPI/cheque collection as cash (the app recorded the wrong mode).
            if (details.settleMode != null && details.settleMode !== collection.payment_mode) {
                if (details.settleMode !== 'cash' || !['upi', 'cheque'].includes(collection.payment_mode)) {
                    throw new Error('INVALID_SETTLE_MODE');
                }
                const note = `Settled as cash (recorded as ${collection.payment_mode}${collection.reference_no ? ` ${collection.reference_no}` : ''})`;
                await connection.execute(
                    `UPDATE delivery_boy_collections
                     SET payment_mode = 'cash', reference_no = NULL, reference_date = NULL,
                         remarks = TRIM(CONCAT(COALESCE(remarks, ''), ' ', ?))
                     WHERE id = ?`,
                    [note, collectionId]
                );
                collection.payment_mode = 'cash';
                collection.reference_no = null;
                collection.reference_date = null;
            }
            // The office can correct a wrong amount while settling (e.g. the app
            // recorded 2304 but the outlet actually paid 2340). The new amount is
            // still checked against the bill balance below.
            if (details.amount != null && details.amount !== '') {
                const corrected = Number(details.amount);
                if (!Number.isFinite(corrected) || corrected <= 0
                    || Math.abs(corrected * 100 - Math.round(corrected * 100)) > 0.000001) {
                    throw new Error('INVALID_AMOUNT');
                }
                const recorded = Number(collection.amount) || 0;
                if (Math.abs(corrected - recorded) > 0.001) {
                    const note = `Amount corrected from ${recorded.toFixed(2)} to ${corrected.toFixed(2)} at settlement`;
                    await connection.execute(
                        `UPDATE delivery_boy_collections
                         SET amount = ?, cash_details = NULL,
                             remarks = TRIM(CONCAT(COALESCE(remarks, ''), ' ', ?))
                         WHERE id = ?`,
                        [corrected, note, collectionId]
                    );
                    collection.amount = corrected;
                }
            }
            // Note counts are optional for cash: when the admin settles without them,
            // keep whatever was recorded with the collection.
            if (collection.payment_mode === 'cash' && details.cashDetails != null) {
                const denominations = { note_500: 500, note_200: 200, note_100: 100, note_50: 50, note_20: 20, note_10: 10, coin_20: 20, coin_10: 10, coin_5: 5, coin_2: 2, coin_1: 1, paisa: 0.01 };
                const counts = {};
                let total = 0;
                for (const [key, value] of Object.entries(denominations)) {
                    const raw = details.cashDetails?.[key] ?? 0;
                    const count = Number(raw);
                    if (!['number', 'string'].includes(typeof raw) || !Number.isSafeInteger(count) || count < 0) {
                        throw new Error('INVALID_CASH_COUNTS');
                    }
                    counts[key] = count;
                    total += count * Math.round(value * 100);
                }
                if (!Number.isSafeInteger(total) || total <= 0 || total !== Math.round(Number(collection.amount) * 100)) {
                    throw new Error('CASH_TOTAL_MISMATCH');
                }
                await connection.execute('UPDATE delivery_boy_collections SET cash_details = ? WHERE id = ?', [JSON.stringify(counts), collectionId]);
            }
            if (collection.payment_mode === 'upi') {
                const referenceNo = typeof details.referenceNo === 'string' ? details.referenceNo.trim() : '';
                if (!referenceNo || referenceNo.length > 255) throw new Error('UPI_REFERENCE_REQUIRED');
                collection.reference_no = referenceNo;
                await connection.execute('UPDATE delivery_boy_collections SET reference_no = ? WHERE id = ?', [referenceNo, collectionId]);
            }
            if (collection.payment_mode === 'cheque') {
                const parsed = typeof chequeDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(chequeDate)
                    ? new Date(`${chequeDate}T00:00:00Z`) : new Date(NaN);
                if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== chequeDate || chequeDate < '1000-01-01') {
                    throw new Error('CHEQUE_DATE_REQUIRED');
                }
                collection.reference_date = chequeDate;
                await connection.execute(
                    'UPDATE delivery_boy_collections SET reference_date = ? WHERE id = ?',
                    [chequeDate, collectionId]
                );
            }

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

            const paymentDate = indiaToday();
            const insertPayment = async (paymentAmount, parentCreditPaymentId = null) => {
                const [result] = await connection.execute(
                    `INSERT INTO sale_payments
                     (sale_id, payment_date, payment_mode, amount, collector_name,
                      parent_credit_payment_id, reference_no, reference_date, credit_days, collector_staff_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [collection.sale_id, paymentDate, collection.payment_mode, paymentAmount, collection.delivery_boy_name,
                     parentCreditPaymentId, collection.reference_no, collection.reference_date, collection.credit_days,
                     collection.staff_id ?? null]
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
                        'UPDATE sale_payments SET credit_days = ?, payment_date = ? WHERE id = ?',
                        [collection.credit_days, paymentDate, credit.id]
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
                    COALESCE(dboy.name, collector_staff.name) AS delivery_boy_name,
                    COALESCE(dbc.collector_type, 'delivery_boy') AS collector_type
             FROM delivery_boy_collections dbc
             INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN delivery_boys dboy ON dboy.id = dbc.delivery_boy_id
             LEFT JOIN staff collector_staff ON collector_staff.id = dbc.staff_id
             WHERE dbc.sale_id = ?
             ORDER BY dbc.updated_at DESC, dbc.id DESC`,
            [saleId]
        );
        return rows.map(DeliveryCollectionModel.normalizeRow);
    }

    static async getAll({ search = '', fromDate = '', toDate = '' } = {}) {
        const params = [];
        let where = '';
        const normalizedSearch = String(search || '').trim();

        if (normalizedSearch) {
            const term = `%${normalizedSearch}%`;
            where = `WHERE (sc.outlet_name LIKE ?
                OR ss.invoice_number LIKE ?
                OR COALESCE(dboy.name, collector_staff.name) LIKE ?
                OR dbc.payment_mode LIKE ?
                OR CAST(dbc.sale_id AS CHAR) LIKE ?
                OR sale_company.name LIKE ?
                OR collector_company.name LIKE ?)`;
            params.push(term, term, term, term, term, term, term);
        }
        if (fromDate) {
            where += `${where ? ' AND' : 'WHERE'} dbc.created_at >= ?`;
            params.push(`${fromDate} 00:00:00`);
        }
        if (toDate) {
            where += `${where ? ' AND' : 'WHERE'} dbc.created_at < DATE_ADD(?, INTERVAL 1 DAY)`;
            params.push(toDate);
        }

        const [rows] = await db.execute(
            `SELECT dbc.id, dbc.sale_id, dbc.delivery_boy_id, dbc.sale_payment_id, dbc.settled_at, dbc.payment_mode, dbc.amount,
                    dbc.cash_details, dbc.reference_no,
                    DATE_FORMAT(dbc.reference_date, '%Y-%m-%d') AS reference_date,
                    dbc.credit_days, dbc.remarks,
                    DATE_FORMAT(dbc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE_FORMAT(dbc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
                    dbc.collection_source,
                    COALESCE(dbc.collector_type, 'delivery_boy') AS collector_type, dbc.staff_id,
                    ss.invoice_number, ss.credit_photo_url, ss.price, ss.paid_amount, ss.balance_amount,
                    ss.packaging_status,
                    sc.outlet_name,
                    COALESCE(dboy.name, collector_staff.name) AS delivery_boy_name,
                    DATE_FORMAT(dbc.created_at, '%Y-%m-%d') AS collection_date,
                    COALESCE(sale_company.name, 'Company not assigned') AS sale_company_name,
                    CASE
                        WHEN COALESCE(dbc.collector_type, 'delivery_boy') = 'company_staff' THEN COALESCE(
                            collector_company.name,
                            (SELECT GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ')
                             FROM staff_companies stc2
                             INNER JOIN companies c2 ON c2.id = stc2.company_id
                             WHERE stc2.staff_id = dbc.staff_id),
                            'Company not assigned')
                        ELSE 'BAWARCHEE'
                    END AS collector_company_name
             FROM delivery_boy_collections dbc
             INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN staff seller ON seller.id = ss.staff_id
             LEFT JOIN companies sale_company ON sale_company.id = seller.company_id
             LEFT JOIN delivery_boys dboy ON dboy.id = dbc.delivery_boy_id
             LEFT JOIN staff collector_staff ON collector_staff.id = dbc.staff_id
             LEFT JOIN companies collector_company ON collector_company.id = collector_staff.company_id
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
