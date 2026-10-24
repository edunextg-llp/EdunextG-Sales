import db from '../config/db.js';
import StaffModel from './staffModel.js';

// Add Sales users may bill directly only today's date AND today's bit: outlets whose route day is
// today's weekday (IST). CNF outlets (and outlets with no day saved) have no weekday, so on today's
// date they are always allowed. Anything else (another day's bit, or any outlet on a past/future
// date) needs an admin-approved request for that staff + sale date + outlet, used up by one save.

export const BIT_TIME_ZONE = 'Asia/Kolkata';
const ALWAYS_ALLOWED_DAYS = new Set(['cnf']);

const toIds = (values = []) => [...new Set((values || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];

export const todayDayName = (now = new Date()) =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: BIT_TIME_ZONE }).format(now);

// Today's date in India as YYYY-MM-DD.
export const todayDate = (now = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: BIT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const isTodaysBit = (outletDay, today = todayDayName()) => {
    const day = String(outletDay || '').trim().toLowerCase();
    if (!day) return true; // no route day saved: not part of any bit, so nothing to restrict
    return ALWAYS_ALLOWED_DAYS.has(day) || day === String(today).toLowerCase();
};

// Outlets (counters) that need approval for this sale date: every outlet when the sale date
// isn't today, otherwise only outlets outside today's bit.
// reason: 'other_date' (sale date is not today) or 'other_day' (another day's bit).
export async function getOtherDayOutlets(outletIds = [], saleDate = null, now = new Date()) {
    const ids = toIds(outletIds);
    if (!ids.length) return [];
    const today = todayDayName(now);
    const todayIso = todayDate(now);
    const otherDate = Boolean(saleDate) && String(saleDate).slice(0, 10) !== todayIso;
    const counters = await StaffModel.getCountersByIds(ids);
    return counters
        .filter((counter) => otherDate || !isTodaysBit(counter.day, today))
        .map((counter) => ({
            outletId: Number(counter.id),
            outletErpId: counter.outlet_erp_id || '',
            outletName: counter.outlet_name || '',
            outletDay: counter.day || '',
            todayDay: today,
            todayDate: todayIso,
            reason: otherDate ? 'other_date' : 'other_day',
        }));
}

const REQUEST_SELECT = `
    SELECT r.id, r.staff_id, s.name AS staff_name, DATE_FORMAT(r.sale_date, '%Y-%m-%d') AS sale_date,
           r.outlet_id, r.outlet_erp_id, r.outlet_name, r.outlet_day, r.request_day, r.request_note,
           r.requested_by_role, r.requested_by_id, r.requested_by_name,
           r.status, r.reviewed_by_admin_id, r.reviewed_by_name, r.review_note, r.reviewed_at,
           r.used_at, r.created_at, r.updated_at
    FROM other_day_sale_requests r
    LEFT JOIN staff s ON s.id = r.staff_id`;

export default class OtherDaySaleRequestModel {
    // One open request per staff + date + outlet: a pending one gets the latest note, an approved one is reused.
    static async createRequests({ staffId, saleDate, outlets, note, requester }) {
        const ids = [];
        for (const outlet of outlets) {
            const [existing] = await db.execute(
                `SELECT id, status FROM other_day_sale_requests
                 WHERE staff_id = ? AND sale_date = ? AND outlet_id = ? AND status IN ('pending', 'approved')
                 ORDER BY id DESC LIMIT 1`,
                [staffId, saleDate, outlet.outletId]
            );
            if (existing.length) {
                if (existing[0].status === 'pending') {
                    await db.execute(
                        `UPDATE other_day_sale_requests SET request_note = ?, request_day = ?
                         WHERE id = ? AND status = 'pending'`,
                        [note, outlet.todayDay || null, existing[0].id]
                    );
                }
                ids.push(existing[0].id);
                continue;
            }
            const [result] = await db.execute(
                `INSERT INTO other_day_sale_requests (
                    staff_id, sale_date, outlet_id, outlet_erp_id, outlet_name, outlet_day, request_day,
                    request_note, requested_by_role, requested_by_id, requested_by_name
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    staffId, saleDate, outlet.outletId, outlet.outletErpId || null, outlet.outletName || null,
                    outlet.outletDay || null, outlet.todayDay || null, note,
                    requester.role, requester.id || null, requester.name || null,
                ]
            );
            ids.push(result.insertId);
        }
        return this.getByIds(ids);
    }

    static async getByIds(ids = []) {
        const list = toIds(ids);
        if (!list.length) return [];
        const [rows] = await db.execute(
            `${REQUEST_SELECT} WHERE r.id IN (${list.map(() => '?').join(', ')}) ORDER BY r.id DESC`,
            list
        );
        return rows;
    }

    // Latest request per outlet for one staff + sale date (Add Sales status check).
    static async getLatestForSale({ staffId, saleDate, outletIds }) {
        const ids = toIds(outletIds);
        if (!ids.length) return [];
        const [rows] = await db.execute(
            `${REQUEST_SELECT}
             WHERE r.staff_id = ? AND r.sale_date = ? AND r.outlet_id IN (${ids.map(() => '?').join(', ')})
             ORDER BY r.id DESC`,
            [staffId, saleDate, ...ids]
        );
        const latest = new Map();
        rows.forEach((row) => { if (!latest.has(Number(row.outlet_id))) latest.set(Number(row.outlet_id), row); });
        return [...latest.values()];
    }

    // requestedBy limits the list to one user's own requests (non-admin users).
    static async list({ status = 'pending', limit = 200, requestedBy = null } = {}) {
        const params = [];
        const conditions = [];
        if (status === 'open') {
            conditions.push("r.status IN ('pending', 'approved')");
        } else if (status && status !== 'all') {
            conditions.push('r.status = ?');
            params.push(status);
        }
        if (requestedBy) {
            conditions.push('r.requested_by_role = ? AND r.requested_by_id = ?');
            params.push(requestedBy.role, requestedBy.id);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
        const [rows] = await db.execute(
            `${REQUEST_SELECT} ${where} ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT ${safeLimit}`,
            params
        );
        const [[counts]] = await db.execute(
            `SELECT SUM(r.status = 'pending') AS pending, SUM(r.status = 'approved') AS approved,
                    SUM(r.status = 'rejected') AS rejected, SUM(r.status = 'used') AS used
             FROM other_day_sale_requests r ${requestedBy ? 'WHERE r.requested_by_role = ? AND r.requested_by_id = ?' : ''}`,
            requestedBy ? [requestedBy.role, requestedBy.id] : []
        );
        return {
            requests: rows,
            counts: Object.fromEntries(Object.entries(counts || {}).map(([key, value]) => [key, Number(value) || 0])),
        };
    }

    static async review(id, { approve, note, adminId, adminName }) {
        const [result] = await db.execute(
            `UPDATE other_day_sale_requests
             SET status = ?, review_note = ?, reviewed_by_admin_id = ?, reviewed_by_name = ?, reviewed_at = NOW()
             WHERE id = ? AND status = 'pending'`,
            [approve ? 'approved' : 'rejected', note || null, adminId || null, adminName || null, id]
        );
        return result.affectedRows > 0;
    }

    static async findApproved({ staffId, saleDate, outletIds }) {
        const ids = toIds(outletIds);
        if (!ids.length) return [];
        const [rows] = await db.execute(
            `${REQUEST_SELECT}
             WHERE r.staff_id = ? AND r.sale_date = ? AND r.status = 'approved'
               AND r.outlet_id IN (${ids.map(() => '?').join(', ')})
             ORDER BY r.id ASC`,
            [staffId, saleDate, ...ids]
        );
        return rows;
    }

    // Each approval allows one save. Returns the ids actually claimed.
    static async claim(ids = []) {
        const claimed = [];
        for (const id of toIds(ids)) {
            const [result] = await db.execute(
                `UPDATE other_day_sale_requests SET status = 'used', used_at = NOW() WHERE id = ? AND status = 'approved'`,
                [id]
            );
            if (result.affectedRows > 0) claimed.push(id);
        }
        return claimed;
    }

    // Give approvals back if the sale save failed after they were claimed.
    static async release(ids = []) {
        const list = toIds(ids);
        if (!list.length) return;
        await db.execute(
            `UPDATE other_day_sale_requests SET status = 'approved', used_at = NULL
             WHERE status = 'used' AND id IN (${list.map(() => '?').join(', ')})`,
            list
        );
    }
}
