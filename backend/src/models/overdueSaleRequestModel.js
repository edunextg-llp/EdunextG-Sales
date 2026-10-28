import db from '../config/db.js';
import StaffModel from './staffModel.js';

export const OVERDUE_DAYS_LIMIT = 3;
// Staff with the "7 days overdue" permission may bill an outlet whose oldest overdue credit
// is this many days past due or less (4-13 days), by giving a reason. 14+ days needs admin approval.
export const SELF_APPROVE_OVERDUE_DAYS = 13;

const parseJson = (value, fallback) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return fallback; }
};

const toIds = (values = []) => [...new Set((values || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];

const normalizeText = (value) => String(value ?? '').trim().toUpperCase();
const fixed = (value) => (Number(value) || 0).toFixed(2);

// Only the fields that decide what gets billed and deducted from stock.
export function cleanSaleForRequest(sale = {}) {
    return {
        outletId: Number(sale.outletId),
        invoiceNumber: String(sale.invoiceNumber || '').trim(),
        requisitionNumber: String(sale.requisitionNumber || '').trim(),
        itemCount: Number(sale.itemCount) || 0,
        price: Number(sale.price) || 0,
        lineItems: Array.isArray(sale.lineItems)
            ? sale.lineItems.map((line) => ({
                productErpId: String(line.productErpId || line.product_erp_id || '').trim(),
                productName: String(line.productName || line.product_name || '').trim(),
                productDivision: String(line.productDivision || line.product_division || '').trim(),
                variantName: String(line.variantName || line.variant_name || '').trim(),
                qty: Number(line.qty) || 0,
                rate: Number(line.rate) || 0,
                lineTotal: Number(line.lineTotal ?? line.line_total) || 0,
            })).filter((line) => line.productErpId && line.productErpId !== '__existing_sale__' && line.qty > 0)
            : [],
    };
}

const saleKey = (sale) => {
    const clean = cleanSaleForRequest(sale);
    const lines = clean.lineItems
        .map((line) => `${normalizeText(line.productErpId)}:${fixed(line.qty)}:${fixed(line.rate)}`)
        .sort()
        .join(',');
    return [normalizeText(clean.invoiceNumber), clean.itemCount, fixed(clean.price), lines].join('|');
};

// True when the submitted sales for an outlet are exactly the ones the admin approved.
export function salesMatchApproval(approvedSales = [], submittedSales = []) {
    if (approvedSales.length !== submittedSales.length) return false;
    const approved = approvedSales.map(saleKey).sort();
    const submitted = submittedSales.map(saleKey).sort();
    return approved.every((key, index) => key === submitted[index]);
}

export const summarizeSales = (sales = []) => ({
    invoiceCount: sales.length,
    totalAmount: Number(sales.reduce((total, sale) => total + (Number(sale.price) || 0), 0).toFixed(2)),
    invoiceNumbers: sales.map((sale) => sale.invoiceNumber).filter(Boolean),
});

const mapRequest = (row) => {
    const salesPayload = parseJson(row.sales_payload, null);
    return {
        ...row,
        overdue_details: parseJson(row.overdue_details, []),
        sales_summary: parseJson(row.sales_summary, null),
        sales_payload: salesPayload,
        // The company chosen on Add Sales, else the staff's companies.
        company_name: String(salesPayload?.companyName || '').trim() || row.staff_company_names || '',
    };
};

// Outlets (by ERP ID) that have credit overdue by more than OVERDUE_DAYS_LIMIT days.
export async function getOverdueOutlets(outletIds = []) {
    const ids = toIds(outletIds);
    if (!ids.length) return [];
    const counters = await StaffModel.getCountersByIds(ids);
    const counterById = new Map(counters.map((counter) => [Number(counter.id), counter]));
    const erpIds = counters.map((counter) => counter.outlet_erp_id).filter(Boolean);
    const overdueCredits = await StaffModel.getCreditsOverdueByErp(erpIds, OVERDUE_DAYS_LIMIT);
    if (!overdueCredits.length) return [];

    const overdueByErp = new Map();
    overdueCredits.forEach((credit) => {
        const erpKey = String(credit.outlet_erp_id || '').trim().toLowerCase();
        if (!erpKey) return;
        if (!overdueByErp.has(erpKey)) overdueByErp.set(erpKey, []);
        overdueByErp.get(erpKey).push(credit);
    });

    return ids
        .map((outletId) => {
            const counter = counterById.get(outletId);
            if (!counter) return null;
            const credits = overdueByErp.get(String(counter.outlet_erp_id || '').trim().toLowerCase()) || [];
            if (!credits.length) return null;
            return {
                outletId,
                outletErpId: counter.outlet_erp_id,
                outletName: counter.outlet_name,
                maxOverdueDays: Math.max(...credits.map((credit) => Number(credit.overdue_days) || 0)),
                credits: credits.map((credit) => ({
                    creditPaymentId: credit.credit_payment_id,
                    saleId: credit.sale_id,
                    invoiceNumber: credit.invoice_number,
                    stickerNumber: credit.sticker_number,
                    creditAmount: credit.credit_amount,
                    balanceAmount: credit.balance_amount,
                    issueDate: credit.issue_date,
                    dueDate: credit.due_date,
                    creditDays: credit.credit_days,
                    overdueDays: credit.overdue_days,
                    creditStaffName: credit.credit_staff_name,
                    creditOutletName: credit.outlet_name,
                })),
            };
        })
        .filter(Boolean);
}

const REQUEST_SELECT = `
    SELECT r.id, r.staff_id, s.name AS staff_name, DATE_FORMAT(r.sale_date, '%Y-%m-%d') AS sale_date,
           r.outlet_id, r.outlet_erp_id, r.outlet_name, r.max_overdue_days, r.overdue_details,
           r.sales_summary, r.sales_payload, r.request_note, r.requested_by_role, r.requested_by_id, r.requested_by_name,
           r.status, r.reviewed_by_admin_id, r.reviewed_by_name, r.review_note, r.reviewed_at,
           r.used_at, r.created_at, r.updated_at, r.self_approved,
           COALESCE(
               (SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                FROM staff_companies sc INNER JOIN companies c ON c.id = sc.company_id
                WHERE sc.staff_id = r.staff_id),
               (SELECT c.name FROM companies c WHERE c.id = s.company_id)
           ) AS staff_company_names
    FROM overdue_sale_requests r
    LEFT JOIN staff s ON s.id = r.staff_id`;

export default class OverdueSaleRequestModel {
    // One request per staff + date + outlet. A pending request is updated with the latest
    // invoice details; an approved one is returned as-is (it must be used first).
    static async createRequests({ staffId, saleDate, overdueOutlets, note, salesPayloadByOutlet = {}, requester }) {
        const ids = [];
        for (const outlet of overdueOutlets) {
            const payload = salesPayloadByOutlet[outlet.outletId] || null;
            const summary = payload ? summarizeSales(payload.sales) : null;
            const [existing] = await db.execute(
                `SELECT id, status FROM overdue_sale_requests
                 WHERE staff_id = ? AND sale_date = ? AND outlet_id = ? AND status IN ('pending', 'approved')
                 ORDER BY id DESC LIMIT 1`,
                [staffId, saleDate, outlet.outletId]
            );
            if (existing.length) {
                if (existing[0].status === 'pending' && payload) {
                    await db.execute(
                        `UPDATE overdue_sale_requests
                         SET sales_payload = ?, sales_summary = ?, request_note = ?, overdue_details = ?, max_overdue_days = ?
                         WHERE id = ? AND status = 'pending'`,
                        [JSON.stringify(payload), JSON.stringify(summary), note, JSON.stringify(outlet.credits || []),
                            outlet.maxOverdueDays || 0, existing[0].id]
                    );
                }
                ids.push(existing[0].id);
                continue;
            }
            const [result] = await db.execute(
                `INSERT INTO overdue_sale_requests (
                    staff_id, sale_date, outlet_id, outlet_erp_id, outlet_name, max_overdue_days,
                    overdue_details, sales_summary, sales_payload, request_note, requested_by_role, requested_by_id, requested_by_name
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    staffId, saleDate, outlet.outletId, outlet.outletErpId || '', outlet.outletName || null,
                    outlet.maxOverdueDays || 0, JSON.stringify(outlet.credits || []),
                    summary ? JSON.stringify(summary) : null, payload ? JSON.stringify(payload) : null, note,
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
        return rows.map(mapRequest);
    }

    // Latest request per outlet for one staff + sale date (used by the Add Sales screen).
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
        return [...latest.values()].map(mapRequest);
    }

    // requestedBy limits the list to one user's own requests (non-admin users).
    static async list({ status = 'pending', limit = 200, requestedBy = null } = {}) {
        const params = [];
        const conditions = [];
        if (status === 'open') {
            conditions.push("r.status IN ('pending', 'approved')");
        } else if (status === 'self_approved') {
            conditions.push('r.self_approved = 1');
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
                    SUM(r.status = 'rejected') AS rejected, SUM(r.status = 'used') AS used,
                    SUM(r.self_approved = 1) AS self_approved
             FROM overdue_sale_requests r ${requestedBy ? 'WHERE r.requested_by_role = ? AND r.requested_by_id = ?' : ''}`,
            requestedBy ? [requestedBy.role, requestedBy.id] : []
        );
        return {
            requests: rows.map(mapRequest),
            counts: Object.fromEntries(Object.entries(counts || {}).map(([key, value]) => [key, Number(value) || 0])),
        };
    }

    static async review(id, { approve, note, adminId, adminName }) {
        const [result] = await db.execute(
            `UPDATE overdue_sale_requests
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
        return rows.map(mapRequest);
    }

    // Sales added with the 7-day overdue permission: saved as already used, so admin sees them
    // in the Overdue Requests list ("Staff approved") without having to act on them.
    static async recordSelfApproved({ staffId, saleDate, outlet, note, salesPayload, requester }) {
        const summary = salesPayload ? summarizeSales(salesPayload.sales || []) : null;
        const [result] = await db.execute(
            `INSERT INTO overdue_sale_requests (
                staff_id, sale_date, outlet_id, outlet_erp_id, outlet_name, max_overdue_days,
                overdue_details, sales_summary, sales_payload, request_note, requested_by_role, requested_by_id, requested_by_name,
                status, reviewed_by_name, review_note, reviewed_at, used_at, self_approved
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'used', ?, ?, NOW(), NOW(), 1)`,
            [
                staffId, saleDate, outlet.outletId, outlet.outletErpId || '', outlet.outletName || null,
                outlet.maxOverdueDays || 0, JSON.stringify(outlet.credits || []),
                summary ? JSON.stringify(summary) : null, salesPayload ? JSON.stringify(salesPayload) : null, note,
                requester.role, requester.id || null, requester.name || null,
                `${requester.name || 'Staff'} (7-day overdue permission)`,
                `Allowed without admin approval: overdue ${outlet.maxOverdueDays} day(s), within ${SELF_APPROVE_OVERDUE_DAYS} days.`,
            ]
        );
        return result.insertId;
    }

    // Each approval can create sales once. Returns the ids that were actually claimed.
    static async claim(ids = []) {
        const claimed = [];
        for (const id of toIds(ids)) {
            const [result] = await db.execute(
                `UPDATE overdue_sale_requests SET status = 'used', used_at = NOW() WHERE id = ? AND status = 'approved'`,
                [id]
            );
            if (result.affectedRows > 0) claimed.push(id);
        }
        return claimed;
    }

    // Give an approval back if saving the sales failed after it was claimed.
    static async release(ids = []) {
        const list = toIds(ids);
        if (!list.length) return;
        await db.execute(
            `UPDATE overdue_sale_requests SET status = 'approved', used_at = NULL
             WHERE status = 'used' AND id IN (${list.map(() => '?').join(', ')})`,
            list
        );
    }
}
