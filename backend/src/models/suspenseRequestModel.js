import db from '../config/db.js';
import StaffModel from './staffModel.js';

const parseJson = (value, fallback) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
};

export const toSaleIds = (values = []) => [...new Set((Array.isArray(values) ? values : [])
    .map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];

const mapRequest = (row) => ({
    ...row,
    sale_ids: parseJson(row.sale_ids, []),
    bills_summary: parseJson(row.bills_summary, []),
    moved_ids: parseJson(row.moved_ids, []),
    skipped_ids: parseJson(row.skipped_ids, []),
});

const REQUEST_SELECT = `
    SELECT id, sale_ids, bills_summary, reason, status, requested_by_role, requested_by_id, requested_by_name,
           reviewed_by_admin_id, reviewed_by_name, review_note,
           DATE_FORMAT(reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at, moved_ids, skipped_ids,
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM suspense_requests`;

export default class SuspenseRequestModel {
    // Bill details kept with the request, so the admin sees what is being parked.
    static async getBills(saleIds) {
        const ids = toSaleIds(saleIds);
        if (!ids.length) return [];
        const [rows] = await db.execute(
            `SELECT ss.id, ss.invoice_number, ss.price, ss.box_count, ss.packet_count, ss.packaging_status, ss.in_suspense,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    sc.outlet_name, sc.location_name, s.name AS staff_name,
                    COALESCE(
                        (SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                         FROM staff_companies scm INNER JOIN companies c ON c.id = scm.company_id
                         WHERE scm.staff_id = s.id),
                        (SELECT c.name FROM companies c WHERE c.id = s.company_id)
                    ) AS company_name
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN staff s ON s.id = ss.staff_id
             WHERE ss.id IN (${ids.map(() => '?').join(', ')})`,
            ids
        );
        return rows;
    }

    // Sale ids that already wait in a pending request.
    static async pendingSaleIds() {
        const [rows] = await db.execute(`SELECT sale_ids FROM suspense_requests WHERE status = 'pending'`);
        return new Set(rows.flatMap((row) => parseJson(row.sale_ids, [])).map(Number));
    }

    // Saves a request for the bills that can still go to Suspense. Bills already
    // in Suspense, out of Pending Deliveries or in another pending request are skipped.
    static async create({ saleIds, reason, requester, status = 'pending' }) {
        const ids = toSaleIds(saleIds);
        const pending = await this.pendingSaleIds();
        const bills = (await this.getBills(ids)).filter((bill) => Number(bill.in_suspense) !== 1
            && ['packing_done', 'returned'].includes(bill.packaging_status)
            && !pending.has(Number(bill.id)));
        const eligible = bills.map((bill) => Number(bill.id));
        const skippedIds = ids.filter((id) => !eligible.includes(id));
        if (!eligible.length) return { request: null, skippedIds };
        const summary = bills.map((bill) => ({
            id: Number(bill.id),
            invoice_number: bill.invoice_number,
            outlet_name: bill.outlet_name,
            area: bill.location_name,
            company_name: bill.company_name,
            staff_name: bill.staff_name,
            sale_date: bill.sale_date,
            price: Number(bill.price) || 0,
            box_count: bill.box_count,
            packet_count: bill.packet_count,
        }));
        const [result] = await db.execute(
            `INSERT INTO suspense_requests (sale_ids, bills_summary, reason, status, requested_by_role, requested_by_id, requested_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [JSON.stringify(eligible), JSON.stringify(summary), reason, status, requester.role, requester.id || null, requester.name || null]
        );
        return { request: await this.getById(result.insertId), skippedIds };
    }

    static async getById(id) {
        const [rows] = await db.execute(`${REQUEST_SELECT} WHERE id = ?`, [id]);
        return rows[0] ? mapRequest(rows[0]) : null;
    }

    // requestedBy limits the list to one user's own requests (non-admin users).
    static async list({ status = 'pending', limit = 200, requestedBy = null } = {}) {
        const conditions = [];
        const params = [];
        if (status && status !== 'all') { conditions.push('status = ?'); params.push(status); }
        if (requestedBy) { conditions.push('requested_by_role = ? AND requested_by_id <=> ?'); params.push(requestedBy.role, requestedBy.id ?? null); }
        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
        const [rows] = await db.execute(`${REQUEST_SELECT}${where} ORDER BY (status = 'pending') DESC, created_at DESC, id DESC LIMIT ${safeLimit}`, params);
        const [[counts]] = await db.execute(
            `SELECT SUM(status = 'pending') AS pending, SUM(status = 'approved') AS approved, SUM(status = 'rejected') AS rejected
             FROM suspense_requests${requestedBy ? ' WHERE requested_by_role = ? AND requested_by_id <=> ?' : ''}`,
            requestedBy ? [requestedBy.role, requestedBy.id ?? null] : []
        );
        return {
            requests: rows.map(mapRequest),
            counts: Object.fromEntries(Object.entries(counts || {}).map(([key, value]) => [key, Number(value) || 0])),
        };
    }

    // Approve: move the bills (only those still waiting for delivery) with the
    // request's reason. Reject: bills stay in Pending Deliveries.
    static async review(id, { approve, note, admin }) {
        const [result] = await db.execute(
            `UPDATE suspense_requests SET status = ?, review_note = ?, reviewed_by_admin_id = ?, reviewed_by_name = ?, reviewed_at = NOW()
             WHERE id = ? AND status = 'pending'`,
            [approve ? 'approved' : 'rejected', note || null, admin.id || null, admin.name || null, id]
        );
        if (!result.affectedRows) return null;
        const request = await this.getById(id);
        if (approve) await this.applyMove(request);
        return this.getById(id);
    }

    static async applyMove(request) {
        const moved = request.sale_ids.length
            ? await StaffModel.setSalesSuspense(request.sale_ids, true, request.reason)
            : { movedIds: [], skippedIds: [] };
        await db.execute(
            'UPDATE suspense_requests SET moved_ids = ?, skipped_ids = ? WHERE id = ?',
            [JSON.stringify(moved.movedIds), JSON.stringify(moved.skippedIds), request.id]
        );
        return moved;
    }
}
