import db from '../config/db.js';
import StaffModel from '../models/staffModel.js';
import CompanyModel from '../models/companyModel.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import OtherDaySaleRequestModel, { isTodaysBit, todayDate, todayDayName } from '../models/otherDaySaleRequestModel.js';
import OverdueSaleRequestModel, { cleanSaleForRequest, getOverdueOutlets, SELF_APPROVE_OVERDUE_DAYS } from '../models/overdueSaleRequestModel.js';
import { createSalesFromRequest } from '../controllers/overdueSaleRequestController.js';
import { approvalRouteFor, canUseOwnOverduePermission } from '../utils/permissionKeys.js';
import { companyInvoiceNo, dropsInPrefix } from '../utils/pdfInvoiceNumbers.js';

// Auto Add Sales.
// Every invoice in the PDF of a Dashboard > Assign "Add Sales" task is created in Add Sales from the
// PDF (invoice no. [EVEREST without "IN"], date, outlet, Net Payable amount, no. of items), under the
// outlet's staff. The same rules as the Add Sales page apply, with the task's Assign To person as the
// one adding the sale (their permissions):
//   - the invoice date must be today (a past day is never created; a future day waits for that day);
//   - another day's bit or overdue credit needs permission. If the assignee has the own permission,
//     they approve it with a reason in their portal (Auto Add Sales approval); otherwise a request
//     goes to admin / the approver tier and the sale is created once it is approved.
// Not for SIL for now.
//
// document_assignments.auto_sales holds the result per invoice:
//   created | exists | rejected                 -> final
//   needs_own | waiting | waiting_date | failed -> checked again on the next run

const AUTO_SALES_OFF = new Set(['SIL']);
export const autoSalesOff = (companyName) => AUTO_SALES_OFF.has(String(companyName || '').trim().toUpperCase());
const FINAL = new Set(['created', 'exists', 'rejected']);
const RETRY_EVERY_MS = 5 * 60 * 1000;
const RETRY_DAYS = 7;

const plain = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const parseJson = (value) => {
    try {
        return typeof value === 'string' ? JSON.parse(value) : value ?? null;
    } catch {
        return null;
    }
};
const showDate = (iso) => String(iso || '').split('-').reverse().join('-');
const running = new Set();

// ---------------------------------------------------------------------------------------------
// The person adding the sale: the task's Assign To (Packaging Staff / Delivery Boy login, or a
// company staff member). Shaped like req.user so the Add Sales permission helpers work on it.
async function loadActor(task) {
    if (task.assignee_type === 'delivery_boy') {
        const [rows] = await db.query('SELECT id, name, role FROM delivery_boys WHERE id = ?', [task.assignee_id]);
        const access = await DeliveryBoyModel.getCurrentPermissions(task.assignee_id);
        const role = rows[0]?.role === 'packaging_staff' ? 'packaging_staff' : 'delivery_boy';
        return {
            role,
            id: Number(task.assignee_id),
            deliveryBoyId: Number(task.assignee_id),
            name: rows[0]?.name || `User #${task.assignee_id}`,
            permissions: access?.isActive ? access.permissions : [],
            overdueRange: access?.overdueRange || null,
            overdueApproverRule: access?.approverRule || null,
            overdueApprovesTiers: access?.approvesTiers || [],
        };
    }
    const [rows] = await db.query('SELECT id, name FROM staff WHERE id = ?', [task.assignee_id]);
    // Company (marketing) staff have no Add Sales permissions: everything that needs one is requested.
    return { role: 'staff', id: Number(task.assignee_id), staffId: Number(task.assignee_id), name: rows[0]?.name || `Staff #${task.assignee_id}`, permissions: [] };
}
const requesterOf = (actor) => ({ role: actor.role, id: actor.id, name: actor.name });
const canOwnOtherDay = (actor) => actor.permissions.includes('add_sales') && actor.permissions.includes('other_day_own_permission');

// ---------------------------------------------------------------------------------------------
// Outlet: by ERP id (EVEREST prints "Buyer Erp Id"), else by name. The task's marketing person
// first; otherwise the same company's active staff who has it (a sale is saved under the outlet's
// staff); when several do, the PDF's salesman. Returns { outlet } or { error }.
export async function findOutlet(task, detail) {
    const [outlets] = await db.query(
        `SELECT sc.id, sc.staff_id, sc.day, sc.outlet_name, sc.outlet_erp_id, st.name AS staff_name
         FROM staff_counters sc
         JOIN staff st ON st.id = sc.staff_id
         WHERE sc.staff_id = ?
            OR (st.is_active = 1 AND (st.company_id = ? OR EXISTS (
                SELECT 1 FROM staff_companies x WHERE x.staff_id = st.id AND x.company_id = ?)))
         ORDER BY sc.id`,
        [task.marketing_staff_id, task.company_id, task.company_id]
    );
    const erp = plain(detail.outletErpId);
    const name = plain(detail.outletName);
    let matches = erp ? outlets.filter((o) => plain(o.outlet_erp_id) === erp) : [];
    if (!matches.length && name) matches = outlets.filter((o) => plain(o.outlet_name) === name);
    if (!matches.length) {
        const label = `${detail.outletName || ''}${detail.outletErpId ? ` (${detail.outletErpId})` : ''}`.trim();
        return { error: `Outlet "${label}" is not in the outlets of ${task.company_name || 'this company'}'s staff.` };
    }
    // Several route days of the same outlet: today's bit first.
    const today = todayDayName();
    const best = (list) => list.find((o) => isTodaysBit(o.day, today)) || list[0];
    const own = matches.filter((o) => Number(o.staff_id) === Number(task.marketing_staff_id));
    if (own.length) return { outlet: best(own) };
    const staffIds = [...new Set(matches.map((o) => Number(o.staff_id)))];
    if (staffIds.length === 1) return { outlet: best(matches) };
    const bySalesman = matches.filter((o) => salesmanScore(detail.salesman, o.staff_name) > 0);
    const topScore = Math.max(0, ...bySalesman.map((o) => salesmanScore(detail.salesman, o.staff_name)));
    const top = bySalesman.filter((o) => salesmanScore(detail.salesman, o.staff_name) === topScore);
    if (top.length && new Set(top.map((o) => Number(o.staff_id))).size === 1) return { outlet: best(top) };
    const names = [...new Set(matches.map((o) => o.staff_name))].join(', ');
    return { error: `Outlet "${detail.outletName || detail.outletErpId}" is with several staff (${names}). Add this sale manually.` };
}

// How well a PDF salesman ("Debasish Das (Kol-1)", "SUBHRA NATH (kol-1)") fits a staff name
// ("DEBASISH (SSR)", "SUBRO NATH -(SSR)"): first name 2 (1 if the first 3 letters agree), +1 per other same word.
const nameWords = (value) => String(value || '').replace(/\([^)]*\)/g, ' ').toUpperCase().split(/[^A-Z]+/).filter((w) => w.length > 1);
export function salesmanScore(salesman, staffName) {
    const a = nameWords(salesman);
    const b = nameWords(staffName);
    if (!a.length || !b.length) return 0;
    let score = a[0] === b[0] ? 2 : a[0].slice(0, 3) === b[0].slice(0, 3) ? 1 : 0;
    a.slice(1).forEach((word) => { if (b.includes(word)) score += 1; });
    b.slice(1).forEach((word) => { if (a[0] === word) score += 1; });
    return score;
}

// Dashboard > Assign: the active company staff the PDF's salesman is (unique best match), or null.
export async function staffForSalesman(salesman) {
    if (!salesman) return null;
    const [staff] = await db.query(
        `SELECT s.id, s.name, s.company_id FROM staff s
         WHERE s.is_active = 1 AND (s.staff_category IS NULL OR s.staff_category = 'company_staff')`
    );
    const scored = staff.map((s) => ({ ...s, score: salesmanScore(salesman, s.name) })).filter((s) => s.score > 0);
    const top = Math.max(0, ...scored.map((s) => s.score));
    const best = scored.filter((s) => s.score === top);
    return best.length === 1 ? best[0] : null;
}

async function existingSale(number, companyName) {
    const keys = dropsInPrefix(companyName) && /^\d/.test(number) ? [number, `IN${number}`] : [number];
    const [rows] = await db.query(
        `SELECT id FROM staff_sales WHERE REGEXP_REPLACE(UPPER(invoice_number), '[^A-Z0-9]', '') IN (?) ORDER BY id DESC LIMIT 1`,
        [keys]
    );
    return rows[0] || null;
}

// ---------------------------------------------------------------------------------------------
// One invoice. ownApproval = { note } when the assignee approves in their portal.
async function processInvoice(task, detail, actor, ownApproval = null) {
    const number = companyInvoiceNo(detail.invoiceNo, task.company_name);
    const existing = await existingSale(number, task.company_name);
    if (existing) return { status: 'exists', saleId: existing.id };
    if (!detail.outletName && !detail.outletErpId) return { status: 'failed', reason: 'Outlet not found in the PDF.' };
    if (!(Number(detail.amount) > 0)) return { status: 'failed', reason: 'Invoice amount not found in the PDF.' };
    if (!(Number(detail.itemCount) > 0)) return { status: 'failed', reason: 'No. of items not found in the PDF.' };
    if (!detail.date) return { status: 'failed', reason: 'Invoice date not found in the PDF.' };

    const { outlet, error } = await findOutlet(task, detail);
    if (!outlet) return { status: 'failed', reason: error };

    const staffId = Number(outlet.staff_id);
    const saleDate = detail.date;
    const sale = {
        outletId: Number(outlet.id),
        invoiceNumber: number,
        itemCount: Number(detail.itemCount),
        price: Math.round(Number(detail.amount) * 100) / 100,
    };
    const base = { outletId: sale.outletId, outletName: outlet.outlet_name, staffId, amount: sale.price };
    const outletInfo = {
        outletId: sale.outletId, outletErpId: outlet.outlet_erp_id || '', outletName: outlet.outlet_name || '',
        outletDay: outlet.day || '', todayDay: todayDayName(),
    };
    const note = `Auto Add Sales: invoice ${number} (Dashboard > Assign #${task.id})`;
    const save = async () => {
        const [sticker] = await StaffModel.saveSales(staffId, saleDate, [{
            ...sale, paymentMode: 'cash', deliveryBoyId: null, vehicleNo: null,
        }], { companyName: task.company_name });
        return sticker?.saleId || null;
    };

    // Overdue credit (more than 3 days). An approved overdue request also covers the bit / date rule.
    const [overdue] = await getOverdueOutlets([sale.outletId]);
    if (overdue) {
        const days = Number(overdue.maxOverdueDays);
        const [latest] = await OverdueSaleRequestModel.getLatestForSale({ staffId, saleDate, outletIds: [sale.outletId] });
        if (latest?.status === 'approved') {
            const result = await createSalesFromRequest(latest);
            if (!result.created) return { ...base, status: 'failed', reason: result.error };
            return { ...base, status: 'created', saleId: result.sales?.[0]?.saleId || null, via: `overdue request #${latest.id}` };
        }
        if (latest && ['pending', 'awaiting_staff'].includes(latest.status)) {
            return { ...base, status: 'waiting', kind: 'overdue', days, requestId: latest.id, reason: `Overdue ${days} days: waiting for approval (request #${latest.id}).` };
        }
        if (latest?.status === 'rejected') {
            return { ...base, status: 'rejected', reason: `Overdue request #${latest.id} was rejected.` };
        }
        const dateCheck = checkDate(saleDate, base);
        if (dateCheck) return dateCheck;
        const own = canUseOwnOverduePermission(actor, days, sale.price);
        const ownKind = days > SELF_APPROVE_OVERDUE_DAYS ? 'own' : '7day';
        if (own && !ownApproval) {
            return { ...base, status: 'needs_own', kind: 'overdue', days, reason: `Overdue ${days} days: ${actor.name} can approve it on own permission.` };
        }
        if (own && ownApproval) {
            const saleId = await save();
            const payload = { companyName: task.company_name, sales: [cleanSaleForRequest(sale)] };
            await OverdueSaleRequestModel.recordSelfApproved({
                staffId, saleDate, outlet: { ...outletInfo, maxOverdueDays: days, credits: overdue.credits },
                note: ownApproval.note, salesPayload: payload, requester: requesterOf(actor), kind: ownKind,
            });
            await StaffModel.createOverdueSalePermission({
                staffId, saleDate, outletId: sale.outletId, outletErpId: outletInfo.outletErpId, outletName: outletInfo.outletName,
                maxOverdueDays: days,
                overdueCreditIds: (overdue.credits || []).map((credit) => credit.creditPaymentId),
                overdueDetails: overdue.credits || [],
                permissionNote: `${ownApproval.note} | ${note}`,
                permittedByAdminId: null,
                permittedByName: `${actor.name} (${ownKind === 'own' ? 'own permission' : '7-day overdue permission'})`,
            }).catch((logError) => console.error('Auto Add Sales: overdue permission log failed:', logError));
            return { ...base, status: 'created', saleId, via: `${actor.name} own permission` };
        }
        // No own permission: send the request, as the Add Sales page does.
        const payloadByOutlet = { [sale.outletId]: { companyName: task.company_name, sales: [cleanSaleForRequest(sale)] } };
        const overdueOutlet = { ...overdue, outletErpId: overdue.outletErpId || outletInfo.outletErpId, outletName: overdue.outletName || outletInfo.outletName };
        const route = approvalRouteFor(actor.overdueApproverRule || null, days, sale.price);
        const send = days > SELF_APPROVE_OVERDUE_DAYS ? OverdueSaleRequestModel.createForAdmin : OverdueSaleRequestModel.createRequests;
        const [request] = await send.call(OverdueSaleRequestModel, {
            staffId, saleDate, overdueOutlets: [overdueOutlet], note, salesPayloadByOutlet: payloadByOutlet,
            requester: requesterOf(actor), routeByOutlet: { [sale.outletId]: route },
        });
        const to = route.to === 'approver' ? route.approverName : 'admin';
        return { ...base, status: 'waiting', kind: 'overdue', days, requestId: request?.id || null, reason: `Overdue ${days} days: sent to ${to} for approval${request?.id ? ` (request #${request.id})` : ''}.` };
    }

    // Another day's bit: approved request, own permission, or send a request.
    if (!isTodaysBit(outlet.day)) {
        const approved = await OtherDaySaleRequestModel.findApproved({ staffId, saleDate, outletIds: [sale.outletId] });
        if (approved.length) {
            const claimed = await OtherDaySaleRequestModel.claim([approved[0].id]);
            if (claimed.length) {
                try {
                    const saleId = await save();
                    return { ...base, status: 'created', saleId, via: `other-day request #${approved[0].id}` };
                } catch (saveError) {
                    await OtherDaySaleRequestModel.release(claimed).catch(() => {});
                    throw saveError;
                }
            }
        }
        const dateCheck = checkDate(saleDate, base);
        if (dateCheck) return dateCheck;
        const [latest] = await OtherDaySaleRequestModel.getLatestForSale({ staffId, saleDate, outletIds: [sale.outletId] });
        if (latest?.status === 'pending') {
            return { ...base, status: 'waiting', kind: 'other_day', requestId: latest.id, reason: `${outlet.day} bit outlet: waiting for other-day approval (request #${latest.id}).` };
        }
        if (latest?.status === 'rejected') return { ...base, status: 'rejected', reason: `Other-day request #${latest.id} was rejected.` };
        if (canOwnOtherDay(actor) && !ownApproval) {
            return { ...base, status: 'needs_own', kind: 'other_day', reason: `${outlet.day} bit outlet (today ${todayDayName()}): ${actor.name} can approve it on own permission.` };
        }
        if (canOwnOtherDay(actor) && ownApproval) {
            const saleId = await save();
            await OtherDaySaleRequestModel.recordOwnPermission({
                staffId, saleDate, outlets: [outletInfo], note: `${ownApproval.note} | ${note}`, requester: requesterOf(actor),
            });
            return { ...base, status: 'created', saleId, via: `${actor.name} own permission` };
        }
        const [request] = await OtherDaySaleRequestModel.createRequests({
            staffId, saleDate, outlets: [outletInfo], note, requester: requesterOf(actor),
        });
        return { ...base, status: 'waiting', kind: 'other_day', requestId: request?.id || null, reason: `${outlet.day} bit outlet: sent for other-day approval${request?.id ? ` (request #${request.id})` : ''}.` };
    }

    const dateCheck = checkDate(saleDate, base);
    if (dateCheck) return dateCheck;
    const saleId = await save();
    return { ...base, status: 'created', saleId };
}

// Only today's invoices are created: a past day never, a future day when that day comes.
function checkDate(saleDate, base) {
    const today = todayDate();
    if (saleDate < today) {
        return { ...base, status: 'failed', final: true, reason: `Invoice date ${showDate(saleDate)} is a past day. Previous day Add Sales is not allowed.` };
    }
    if (saleDate > today) {
        return { ...base, status: 'waiting_date', reason: `Invoice date ${showDate(saleDate)}: it will be created on that day.` };
    }
    return null;
}

const TASK_SELECT = `SELECT a.id, a.status, a.assignment_type, a.company_id, a.marketing_staff_id, a.assignee_type, a.assignee_id,
        a.invoice_details, a.auto_sales, DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date, c.name AS company_name
     FROM document_assignments a
     LEFT JOIN companies c ON c.id = a.company_id`;

async function loadTask(id) {
    const [rows] = await db.query(`${TASK_SELECT} WHERE a.id = ?`, [id]);
    return rows[0] || null;
}

const taskIsOn = async (task) => {
    if (!task || task.assignment_type !== 'add_sales' || task.status === 'cancelled') return false;
    if (autoSalesOff(task.company_name)) return false;
    const company = await CompanyModel.getByName(task.company_name);
    return !(company && Number(company.creates_sale_bill) === 0);
};

// Runs every invoice of one task that is not final yet. Safe to call again at any time.
export async function autoCreateSales(assignmentId) {
    const id = Number(assignmentId);
    if (running.has(id)) return;
    running.add(id);
    try {
        const task = await loadTask(id);
        if (!(await taskIsOn(task))) return;
        const details = parseJson(task.invoice_details);
        if (!Array.isArray(details) || !details.length) return;
        const results = parseJson(task.auto_sales) || {};
        const actor = await loadActor(task);
        let changed = false;
        for (const detail of details) {
            const key = companyInvoiceNo(detail.invoiceNo, task.company_name);
            if (FINAL.has(results[key]?.status) || results[key]?.final) continue;
            let result;
            try {
                result = await processInvoice(task, detail, actor);
            } catch (error) {
                console.error(`Auto Add Sales: assignment ${id}, invoice ${key} failed:`, error);
                result = { status: 'failed', reason: String(error?.message || 'Could not create the sale.').slice(0, 200) };
            }
            const before = results[key];
            results[key] = { ...result, at: before?.status === result.status ? before.at : new Date().toISOString() };
            changed = changed || JSON.stringify(before) !== JSON.stringify(results[key]);
        }
        if (changed) await db.query('UPDATE document_assignments SET auto_sales = ? WHERE id = ?', [JSON.stringify(results), id]);
    } finally {
        running.delete(id);
    }
}

// ---------------------------------------------------------------------------------------------
// Assignee portal: invoices waiting for the logged-in person's own-permission approval.
export async function listOwnApprovals(assigneeType, assigneeId) {
    const [rows] = await db.query(
        `${TASK_SELECT}
         WHERE a.assignee_type = ? AND a.assignee_id = ? AND a.assignment_type = 'add_sales'
           AND a.auto_sales IS NOT NULL AND JSON_SEARCH(a.auto_sales, 'one', 'needs_own', NULL, '$.*.status') IS NOT NULL
         ORDER BY a.id DESC LIMIT 50`,
        [assigneeType, assigneeId]
    );
    const list = [];
    rows.forEach((task) => {
        const details = parseJson(task.invoice_details) || [];
        Object.entries(parseJson(task.auto_sales) || {}).forEach(([invoiceNumber, result]) => {
            if (result.status !== 'needs_own') return;
            const detail = details.find((d) => companyInvoiceNo(d.invoiceNo, task.company_name) === invoiceNumber) || {};
            list.push({
                assignmentId: task.id, invoiceNumber, companyName: task.company_name,
                invoiceDate: detail.date || null, outletName: result.outletName || detail.outletName,
                amount: result.amount ?? detail.amount, itemCount: detail.itemCount,
                kind: result.kind, days: result.days || null, reason: result.reason,
            });
        });
    });
    return list;
}

// The assignee approves (with a reason) or rejects one invoice. Approve re-checks everything,
// then creates the sale on their own permission.
export async function decideOwnApproval({ assigneeType, assigneeId, assignmentId, invoiceNumber, approve, note }) {
    const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
    const id = Number(assignmentId);
    if (running.has(id)) throw fail(409, 'This task is being processed. Try again in a moment.');
    running.add(id);
    try {
        const task = await loadTask(id);
        if (!task || task.assignee_type !== assigneeType || Number(task.assignee_id) !== Number(assigneeId)) throw fail(404, 'Task not found.');
        if (!(await taskIsOn(task))) throw fail(409, 'Auto Add Sales is off for this task.');
        const results = parseJson(task.auto_sales) || {};
        if (results[invoiceNumber]?.status !== 'needs_own') throw fail(409, 'This invoice is not waiting for your approval any more.');
        const actor = await loadActor(task);
        if (!approve) {
            results[invoiceNumber] = { ...results[invoiceNumber], status: 'rejected', reason: `Rejected by ${actor.name}${note ? `: ${note}` : ''}.`, at: new Date().toISOString() };
        } else {
            const detail = (parseJson(task.invoice_details) || []).find((d) => companyInvoiceNo(d.invoiceNo, task.company_name) === invoiceNumber);
            if (!detail) throw fail(404, 'Invoice not found in the PDF.');
            results[invoiceNumber] = { ...(await processInvoice(task, detail, actor, { note })), at: new Date().toISOString() };
        }
        await db.query('UPDATE document_assignments SET auto_sales = ? WHERE id = ?', [JSON.stringify(results), id]);
        return results[invoiceNumber];
    } finally {
        running.delete(id);
    }
}

// ---------------------------------------------------------------------------------------------
// Every few minutes: tasks of the last days with invoices not final yet (approved requests,
// invoice dated today, outlet added since ...).
export function startAutoAddSalesScheduler() {
    const tick = async () => {
        try {
            const [rows] = await db.query(
                `SELECT id, auto_sales FROM document_assignments
                 WHERE assignment_type = 'add_sales' AND status <> 'cancelled' AND invoice_details IS NOT NULL
                   AND created_at >= NOW() - INTERVAL ${RETRY_DAYS} DAY`
            );
            for (const row of rows) {
                const results = Object.values(parseJson(row.auto_sales) || {});
                const open = !row.auto_sales || results.some((r) => !FINAL.has(r.status) && !r.final && r.status !== 'needs_own');
                if (open) await autoCreateSales(row.id);
            }
        } catch (error) {
            console.error('Auto Add Sales scheduler failed:', error);
        }
    };
    setTimeout(tick, 30 * 1000);
    return setInterval(tick, RETRY_EVERY_MS);
}
