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
           r.marketing_staff_id, r.overdue_amount, r.approval_level, r.payment_days, r.staff_responded_at,
           marketing.name AS marketing_staff_name,
           COALESCE(
               (SELECT GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ', ')
                FROM staff_companies sc INNER JOIN companies c ON c.id = sc.company_id
                WHERE sc.staff_id = r.staff_id),
               (SELECT c.name FROM companies c WHERE c.id = s.company_id)
           ) AS staff_company_names
    FROM overdue_sale_requests r
    LEFT JOIN staff s ON s.id = r.staff_id
    LEFT JOIN staff marketing ON marketing.id = r.marketing_staff_id`;

// Sent straight to Admin from Add Sales, skipping marketing staff. Only Admin can review these.
export const ADMIN_APPROVAL_LEVEL = 'admin';

// Who approves a 14+ day overdue request, by the outlet's overdue amount.
export const approvalLevelForAmount = (amount) => {
    if (amount <= 1000) return 'up_to_1000';
    return amount <= 2000 ? 'up_to_2000' : 'above_2000';
};

export const outletOverdueAmount = (outlet) => Math.round(
    (outlet?.credits || []).reduce((total, credit) => total + (Number(credit.balanceAmount) || 0), 0) * 100
) / 100;

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

    // 14+ days overdue: waits for the outlet's marketing staff. A request already waiting for them
    // gets the latest invoice details; one already further along is returned as-is.
    static async createAwaitingStaff({ staffId, saleDate, outlets, salesPayloadByOutlet, requester }) {
        const ids = [];
        for (const { outlet, marketingStaffId } of outlets) {
            const payload = salesPayloadByOutlet[outlet.outletId];
            const summary = summarizeSales(payload.sales);
            const [existing] = await db.execute(
                `SELECT id, status FROM overdue_sale_requests
                 WHERE staff_id = ? AND sale_date = ? AND outlet_id = ? AND status IN ('awaiting_staff', 'pending', 'approved')
                 ORDER BY id DESC LIMIT 1`,
                [staffId, saleDate, outlet.outletId]
            );
            if (existing.length) {
                if (existing[0].status === 'awaiting_staff') {
                    await db.execute(
                        'UPDATE overdue_sale_requests SET sales_payload = ?, sales_summary = ? WHERE id = ?',
                        [JSON.stringify(payload), JSON.stringify(summary), existing[0].id]
                    );
                }
                ids.push(existing[0].id);
                continue;
            }
            const [result] = await db.execute(
                `INSERT INTO overdue_sale_requests (
                    staff_id, sale_date, outlet_id, outlet_erp_id, outlet_name, max_overdue_days,
                    overdue_details, sales_summary, sales_payload, request_note, requested_by_role, requested_by_id, requested_by_name,
                    status, marketing_staff_id, overdue_amount
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Sent to marketing staff', ?, ?, ?, 'awaiting_staff', ?, ?)`,
                [
                    staffId, saleDate, outlet.outletId, outlet.outletErpId || '', outlet.outletName || null,
                    outlet.maxOverdueDays || 0, JSON.stringify(outlet.credits || []),
                    JSON.stringify(summary), JSON.stringify(payload),
                    requester.role, requester.id || null, requester.name || null,
                    marketingStaffId, outletOverdueAmount(outlet),
                ]
            );
            ids.push(result.insertId);
        }
        return this.getByIds(ids);
    }

    // 14+ days overdue, sent straight to Admin. A request still waiting for marketing staff moves to
    // Admin and leaves their list; one already with Admin gets the latest invoice details.
    static async createForAdmin({ staffId, saleDate, overdueOutlets, note, salesPayloadByOutlet, requester }) {
        const ids = [];
        for (const outlet of overdueOutlets) {
            const payload = salesPayloadByOutlet[outlet.outletId];
            const summary = summarizeSales(payload.sales);
            const [existing] = await db.execute(
                `SELECT id FROM overdue_sale_requests
                 WHERE staff_id = ? AND sale_date = ? AND outlet_id = ?
                   AND (status = 'awaiting_staff' OR (status = 'pending' AND approval_level = ?))
                 ORDER BY id DESC LIMIT 1`,
                [staffId, saleDate, outlet.outletId, ADMIN_APPROVAL_LEVEL]
            );
            if (existing.length) {
                await db.execute(
                    `UPDATE overdue_sale_requests
                     SET status = 'pending', approval_level = ?, marketing_staff_id = NULL, request_note = ?,
                         sales_payload = ?, sales_summary = ?, overdue_details = ?, max_overdue_days = ?, overdue_amount = ?
                     WHERE id = ?`,
                    [ADMIN_APPROVAL_LEVEL, note, JSON.stringify(payload), JSON.stringify(summary),
                        JSON.stringify(outlet.credits || []), outlet.maxOverdueDays || 0, outletOverdueAmount(outlet), existing[0].id]
                );
                ids.push(existing[0].id);
                continue;
            }
            const [result] = await db.execute(
                `INSERT INTO overdue_sale_requests (
                    staff_id, sale_date, outlet_id, outlet_erp_id, outlet_name, max_overdue_days,
                    overdue_details, sales_summary, sales_payload, request_note, requested_by_role, requested_by_id, requested_by_name,
                    status, overdue_amount, approval_level
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
                [
                    staffId, saleDate, outlet.outletId, outlet.outletErpId || '', outlet.outletName || null,
                    outlet.maxOverdueDays || 0, JSON.stringify(outlet.credits || []),
                    JSON.stringify(summary), JSON.stringify(payload), note,
                    requester.role, requester.id || null, requester.name || null,
                    outletOverdueAmount(outlet), ADMIN_APPROVAL_LEVEL,
                ]
            );
            ids.push(result.insertId);
        }
        return this.getByIds(ids);
    }

    // Marketing staff's answer: the figures are worked out again now, as payments may have come in.
    static async recordStaffResponse(id, marketingStaffId, { reason, paymentDays, outlet }) {
        const amount = outlet ? outletOverdueAmount(outlet) : 0;
        const fresh = outlet ? [outlet.maxOverdueDays || 0, JSON.stringify(outlet.credits || [])] : [0, '[]'];
        const [result] = await db.execute(
            `UPDATE overdue_sale_requests
             SET status = 'pending', request_note = ?, payment_days = ?, overdue_amount = ?, approval_level = ?,
                 max_overdue_days = ?, overdue_details = ?, staff_responded_at = NOW()
             WHERE id = ? AND marketing_staff_id = ? AND status = 'awaiting_staff'`,
            [reason, paymentDays, amount, approvalLevelForAmount(amount), ...fresh, id, marketingStaffId]
        );
        return result.affectedRows > 0;
    }

    static async listForMarketingStaff(marketingStaffId) {
        const [rows] = await db.execute(
            `${REQUEST_SELECT} WHERE r.marketing_staff_id = ?
             ORDER BY (r.status = 'awaiting_staff') DESC, r.created_at DESC LIMIT 200`,
            [marketingStaffId]
        );
        return rows.map(mapRequest);
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

    // requestedBy limits the list to one user's own requests (non-admin users);
    // approvalLevels limits it to what an approver can review.
    static async list({ status = 'pending', limit = 200, requestedBy = null, approvalLevels = null } = {}) {
        const params = [];
        const conditions = [];
        if (status === 'open') {
            conditions.push("r.status IN ('awaiting_staff', 'pending', 'approved')");
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
        const levelClause = approvalLevels ? `r.approval_level IN (${approvalLevels.map(() => '?').join(', ')})` : '';
        if (approvalLevels) {
            conditions.push(levelClause);
            params.push(...approvalLevels);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
        const [rows] = await db.execute(
            `${REQUEST_SELECT} ${where} ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT ${safeLimit}`,
            params
        );
        const [[counts]] = await db.execute(
            `SELECT SUM(r.status = 'awaiting_staff') AS awaiting_staff,
                    SUM(r.status = 'pending') AS pending, SUM(r.status = 'approved') AS approved,
                    SUM(r.status = 'rejected') AS rejected, SUM(r.status = 'used') AS used,
                    SUM(r.self_approved = 1) AS self_approved
             FROM overdue_sale_requests r
             ${requestedBy ? 'WHERE r.requested_by_role = ? AND r.requested_by_id = ?' : ''}
             ${approvalLevels ? `WHERE ${levelClause}` : ''}`,
            [...(requestedBy ? [requestedBy.role, requestedBy.id] : []), ...(approvalLevels || [])]
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
