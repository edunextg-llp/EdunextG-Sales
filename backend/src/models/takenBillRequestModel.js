import db from '../config/db.js';
import StaffPortalModel, { BALANCE_SQL, CANCELLED_SQL, PAID_SQL, PENDING_SQL } from './staffPortalModel.js';

/**
 * Staff app requests to take a credit bill as an Out Bill, or to return one after
 * collecting payment. Nothing changes in taken_bills until the office approves.
 */

const MONEY_MODES = `('cash','upi','cheque')`;
const toNumber = (value) => Number(value) || 0;

function fail(code) {
    return new Error(code);
}

/** Locks the sale, so requests and reviews for one bill run one at a time. */
async function lockSale(connection, saleId) {
    const [rows] = await connection.execute(
        'SELECT id, staff_id, packaging_status FROM staff_sales WHERE id = ? FOR UPDATE',
        [saleId]
    );
    return rows[0] || null;
}

/** Credit entries on the sale that still have money due, with whoever holds each one. */
async function getOpenCredits(connection, saleId) {
    const [rows] = await connection.execute(
        `SELECT sp.id AS payment_id, tb.id AS taken_bill_id
         FROM sale_payments sp
         LEFT JOIN (
             SELECT parent_credit_payment_id, SUM(amount) AS paid
             FROM sale_payments
             WHERE parent_credit_payment_id IS NOT NULL AND payment_mode IN ${MONEY_MODES}
             GROUP BY parent_credit_payment_id
         ) child ON child.parent_credit_payment_id = sp.id
         LEFT JOIN taken_bills tb ON tb.payment_id = sp.id AND tb.returned_at IS NULL
         WHERE sp.sale_id = ? AND sp.payment_mode = 'credit' AND sp.amount > COALESCE(child.paid, 0)`,
        [saleId]
    );
    return rows;
}

async function getCollectibleAmount(connection, saleId) {
    const [rows] = await connection.execute(
        `SELECT ${BALANCE_SQL} AS balance_amount, COALESCE(pending.pending_amount, 0) AS pending_amount
         FROM staff_sales ss
         LEFT JOIN (${PAID_SQL}) paid ON paid.sale_id = ss.id
         LEFT JOIN (${CANCELLED_SQL}) cancelled ON cancelled.sale_id = ss.id
         LEFT JOIN (${PENDING_SQL}) pending ON pending.sale_id = ss.id
         WHERE ss.id = ?`,
        [saleId]
    );
    return toNumber(rows[0]?.balance_amount) - toNumber(rows[0]?.pending_amount);
}

async function hasPendingRequest(connection, saleId, staffId, type) {
    const [rows] = await connection.execute(
        `SELECT id FROM taken_bill_requests
         WHERE sale_id = ? AND staff_id = ? AND request_type = ? AND status = 'pending' LIMIT 1`,
        [saleId, staffId, type]
    );
    return rows.length > 0;
}

async function inTransaction(work) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Bills this staff member holds that they can hand back: they submitted a payment
 * since taking the bill, or the bill has been paid off.
 */
async function getReturnableBills(staffId, executor = db) {
    const [rows] = await executor.execute(
        `SELECT ss.id AS sale_id, CONCAT('BP', ss.id) AS bp_sale_id, ss.invoice_number, ss.credit_photo_url,
                ${BALANCE_SQL} AS balance_amount,
                DATE_FORMAT(bill.taken_date, '%Y-%m-%d') AS taken_date,
                sc.outlet_name, sc.outlet_erp_id, sc.location_name, sc.contact_number,
                COALESCE(c.name, 'Company not assigned') AS company_name,
                (SELECT COALESCE(SUM(dbc.amount), 0) FROM delivery_boy_collections dbc
                 WHERE dbc.sale_id = ss.id AND dbc.staff_id = ? AND dbc.payment_mode IN ${MONEY_MODES}
                   AND dbc.created_at >= bill.taken_at) AS collected_amount,
                (SELECT r.status FROM taken_bill_requests r
                 WHERE r.sale_id = ss.id AND r.staff_id = ? AND r.request_type = 'return' AND r.created_at >= bill.taken_at
                 ORDER BY r.id DESC LIMIT 1) AS return_status,
                (SELECT r.review_note FROM taken_bill_requests r
                 WHERE r.sale_id = ss.id AND r.staff_id = ? AND r.request_type = 'return' AND r.created_at >= bill.taken_at
                 ORDER BY r.id DESC LIMIT 1) AS return_note
         FROM (
             SELECT sp.sale_id, MIN(tb.taken_date) AS taken_date, MIN(tb.created_at) AS taken_at
             FROM taken_bills tb
             INNER JOIN sale_payments sp ON sp.id = tb.payment_id
             WHERE tb.staff_id = ? AND tb.collector_type = 'company_staff' AND tb.returned_at IS NULL
             GROUP BY sp.sale_id
         ) bill
         INNER JOIN staff_sales ss ON ss.id = bill.sale_id
         LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
         LEFT JOIN staff seller ON seller.id = ss.staff_id
         LEFT JOIN companies c ON c.id = seller.company_id
         LEFT JOIN (${PAID_SQL}) paid ON paid.sale_id = ss.id
         LEFT JOIN (${CANCELLED_SQL}) cancelled ON cancelled.sale_id = ss.id
         ORDER BY bill.taken_date ASC, ss.id ASC`,
        [staffId, staffId, staffId, staffId]
    );
    return rows
        .map((row) => ({
            ...row,
            balance_amount: toNumber(row.balance_amount),
            collected_amount: toNumber(row.collected_amount),
        }))
        .filter((bill) => bill.collected_amount > 0 || bill.balance_amount <= 0.001);
}

class TakenBillRequestModel {
    /** Every unpaid credit bill on this staff member's delivered invoices, with its take status. */
    static async getCreditBills(staffId) {
        const credit = await StaffPortalModel.getCreditByOutlet(staffId);
        const [requests] = await db.execute(
            `SELECT sale_id, status, review_note FROM taken_bill_requests
             WHERE staff_id = ? AND request_type = 'take' ORDER BY id ASC`,
            [staffId]
        );
        const latestRequest = new Map(requests.map((row) => [row.sale_id, row]));
        const [mine] = await db.execute(
            `SELECT DISTINCT sp.sale_id FROM taken_bills tb
             INNER JOIN sale_payments sp ON sp.id = tb.payment_id
             WHERE tb.staff_id = ? AND tb.collector_type = 'company_staff' AND tb.returned_at IS NULL`,
            [staffId]
        );
        const mineIds = new Set(mine.map((row) => row.sale_id));
        const [pending] = await db.execute(
            `SELECT dbc.sale_id, SUM(dbc.amount) AS pending_amount
             FROM delivery_boy_collections dbc
             INNER JOIN staff_sales ss ON ss.id = dbc.sale_id
             WHERE ss.staff_id = ? AND dbc.settled_at IS NULL AND dbc.payment_mode IN ${MONEY_MODES}
             GROUP BY dbc.sale_id`,
            [staffId]
        );
        const pendingBySale = new Map(pending.map((row) => [row.sale_id, toNumber(row.pending_amount)]));

        const bills = credit.outlets
            .flatMap((outlet) => outlet.bills.map((bill) => {
                const request = latestRequest.get(bill.sale_id);
                const status = request?.status;
                const pendingAmount = pendingBySale.get(bill.sale_id) || 0;
                return {
                    ...bill,
                    taken_by_me: mineIds.has(bill.sale_id),
                    pending_amount: pendingAmount,
                    payment_waiting: pendingAmount > 0 && bill.credit_amount - pendingAmount <= 0.001,
                    take_request_status: status === 'pending' || status === 'rejected' ? status : null,
                    take_request_note: status === 'rejected' ? request.review_note : null,
                };
            }))
            .sort((left, right) => right.overdue_days - left.overdue_days
                || String(left.due_date).localeCompare(String(right.due_date)));

        return {
            total_credit: credit.total_credit,
            overdue_credit: credit.overdue_credit,
            bill_count: credit.bill_count,
            bills,
        };
    }

    /** What the app's Out Bills screen shows besides the bills to collect. */
    static async getStaffStatus(staffId) {
        const [awaiting] = await db.execute(
            `SELECT r.id, r.sale_id, CONCAT('BP', ss.id) AS bp_sale_id, ss.invoice_number,
                    DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS requested_at,
                    ${BALANCE_SQL} AS balance_amount,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name
             FROM taken_bill_requests r
             INNER JOIN staff_sales ss ON ss.id = r.sale_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN (${PAID_SQL}) paid ON paid.sale_id = ss.id
             LEFT JOIN (${CANCELLED_SQL}) cancelled ON cancelled.sale_id = ss.id
             WHERE r.staff_id = ? AND r.request_type = 'take' AND r.status = 'pending'
             ORDER BY r.id ASC`,
            [staffId]
        );
        return {
            awaiting_approval: awaiting.map((row) => ({ ...row, balance_amount: toNumber(row.balance_amount) })),
            returnable: await getReturnableBills(staffId),
        };
    }

    static async requestTake(staffId, saleId, remarks) {
        return inTransaction(async (connection) => {
            const sale = await lockSale(connection, saleId);
            if (!sale || Number(sale.staff_id) !== Number(staffId) || sale.packaging_status !== 'delivered') {
                throw fail('BILL_NOT_FOUND');
            }
            const openCredits = await getOpenCredits(connection, saleId);
            if (openCredits.length === 0) throw fail('NO_OPEN_CREDIT');
            if (openCredits.some((credit) => credit.taken_bill_id)) throw fail('ALREADY_TAKEN');
            if (await getCollectibleAmount(connection, saleId) <= 0.001) throw fail('PAYMENT_WAITING');
            if (await hasPendingRequest(connection, saleId, staffId, 'take')) throw fail('ALREADY_REQUESTED');
            const [result] = await connection.execute(
                `INSERT INTO taken_bill_requests (request_type, sale_id, staff_id, remarks) VALUES ('take', ?, ?, ?)`,
                [saleId, staffId, remarks]
            );
            return { id: result.insertId, sale_id: saleId, request_type: 'take', status: 'pending' };
        });
    }

    static async requestReturn(staffId, saleId) {
        return inTransaction(async (connection) => {
            const sale = await lockSale(connection, saleId);
            if (!sale) throw fail('BILL_NOT_FOUND');
            const [taken] = await connection.execute(
                `SELECT tb.id FROM taken_bills tb
                 INNER JOIN sale_payments sp ON sp.id = tb.payment_id
                 WHERE sp.sale_id = ? AND tb.staff_id = ? AND tb.collector_type = 'company_staff' AND tb.returned_at IS NULL
                 LIMIT 1`,
                [saleId, staffId]
            );
            if (taken.length === 0) throw fail('BILL_NOT_FOUND');
            const returnable = await getReturnableBills(staffId, connection);
            if (!returnable.some((bill) => Number(bill.sale_id) === Number(saleId))) throw fail('NOT_COLLECTED');
            if (await hasPendingRequest(connection, saleId, staffId, 'return')) throw fail('ALREADY_REQUESTED');
            const [result] = await connection.execute(
                `INSERT INTO taken_bill_requests (request_type, sale_id, staff_id) VALUES ('return', ?, ?)`,
                [saleId, staffId]
            );
            return { id: result.insertId, sale_id: saleId, request_type: 'return', status: 'pending' };
        });
    }

    /** Requests waiting for the office on the Out Bill page. */
    static async listPending() {
        const [rows] = await db.execute(
            `SELECT r.id, r.request_type, r.sale_id, r.staff_id, r.remarks, s.name AS staff_name,
                    DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS requested_at,
                    ss.invoice_number, ss.sticker_number, ss.credit_photo_url,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name, sc.contact_number,
                    COALESCE(c.name, 'Company not assigned') AS company_name,
                    ${BALANCE_SQL} AS balance_amount,
                    COALESCE(pending.pending_amount, 0) AS pending_amount
             FROM taken_bill_requests r
             INNER JOIN staff_sales ss ON ss.id = r.sale_id
             INNER JOIN staff s ON s.id = r.staff_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN staff seller ON seller.id = ss.staff_id
             LEFT JOIN companies c ON c.id = seller.company_id
             LEFT JOIN (${PAID_SQL}) paid ON paid.sale_id = ss.id
             LEFT JOIN (${CANCELLED_SQL}) cancelled ON cancelled.sale_id = ss.id
             LEFT JOIN (${PENDING_SQL}) pending ON pending.sale_id = ss.id
             WHERE r.status = 'pending'
             ORDER BY r.id ASC`
        );
        return rows.map((row) => ({
            ...row,
            balance_amount: toNumber(row.balance_amount),
            pending_amount: toNumber(row.pending_amount),
        }));
    }

    /** Approving a take creates the taken_bills rows; approving a return closes them. */
    static async review(requestId, { approve, note, reviewedBy }) {
        const [found] = await db.execute('SELECT sale_id FROM taken_bill_requests WHERE id = ?', [requestId]);
        if (!found[0]) throw fail('REQUEST_NOT_FOUND');

        return inTransaction(async (connection) => {
            await lockSale(connection, found[0].sale_id);
            const [rows] = await connection.execute(
                'SELECT id, request_type, sale_id, staff_id, status FROM taken_bill_requests WHERE id = ?',
                [requestId]
            );
            const request = rows[0];
            if (!request) throw fail('REQUEST_NOT_FOUND');
            if (request.status !== 'pending') throw fail('ALREADY_REVIEWED');

            if (approve && request.request_type === 'take') {
                const openCredits = await getOpenCredits(connection, request.sale_id);
                if (openCredits.length === 0) throw fail('NO_OPEN_CREDIT');
                if (openCredits.some((credit) => credit.taken_bill_id)) throw fail('ALREADY_TAKEN');
                await connection.query(
                    'INSERT INTO taken_bills (payment_id, staff_id, taken_date, collector_type, delivery_boy_id) VALUES ?',
                    [openCredits.map((credit) => [credit.payment_id, request.staff_id, new Date(), 'company_staff', null])]
                );
            }
            if (approve && request.request_type === 'return') {
                const [result] = await connection.execute(
                    `UPDATE taken_bills tb
                     INNER JOIN sale_payments sp ON sp.id = tb.payment_id
                     SET tb.returned_at = NOW()
                     WHERE sp.sale_id = ? AND tb.staff_id = ? AND tb.collector_type = 'company_staff' AND tb.returned_at IS NULL`,
                    [request.sale_id, request.staff_id]
                );
                if (result.affectedRows === 0) throw fail('BILL_NOT_HELD');
            }

            await connection.execute(
                `UPDATE taken_bill_requests
                 SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = NOW()
                 WHERE id = ?`,
                [approve ? 'approved' : 'rejected', note || null, reviewedBy || null, requestId]
            );
            return { id: requestId, request_type: request.request_type, status: approve ? 'approved' : 'rejected' };
        });
    }
}

export default TakenBillRequestModel;
