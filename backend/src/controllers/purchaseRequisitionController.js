import CompanyModel from '../models/companyModel.js';
import DmsStockModel from '../models/dmsStockModel.js';
import PhysicalStockModel from '../models/physicalStockModel.js';
import PurchaseRequisitionModel from '../models/purchaseRequisitionModel.js';
import StaffModel from '../models/staffModel.js';
import { getOverdueOutlets } from '../models/overdueSaleRequestModel.js';
import { buildCurrentStockDiff } from './currentStockController.js';
import { takeFromLots } from '../utils/stockLots.js';
import { activeSchemesFor, freeFor } from './freeGoodsController.js';

// Today's date in India (the business day), as YYYY-MM-DD.
const indiaToday = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const indiaWeekday = () => new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', weekday: 'long',
}).format(new Date());

const isSilCompany = (company) => String(company?.name || '').trim().toUpperCase() === 'SIL';

const canApproveBelowTarget = (user) => user?.role === 'admin'
    || user?.permissions?.includes('requisition_target_approval');

// The approval rule itself is enforced in review(), so a failure here must not undo the change.
const syncBelowTargetRequest = async (staffId, companyId, date, target, note = null) => {
    if (!(Number(target) > 0)) return;
    await PurchaseRequisitionModel.syncTargetRequest(staffId, companyId, date, Number(target), note)
        .catch((error) => console.error('Could not update below-target request:', error));
};

// SIL outlets with overdue credit cannot get a requisition until it is cleared.
// "Overdue" is the same rule Add Sales uses (see OVERDUE_DAYS_LIMIT).
const findSilOutletOverdue = async (company, outletId) => {
    if (!isSilCompany(company)) return null;
    const [outlet] = await getOverdueOutlets([outletId]);
    if (!outlet) return null;
    const total = outlet.credits.reduce((sum, credit) => sum + (Number(credit.balanceAmount) || 0), 0);
    const amount = Math.round(total * 100) / 100;
    const shownAmount = amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return {
        outletId,
        outletName: outlet.outletName,
        amount,
        maxOverdueDays: outlet.maxOverdueDays,
        message: `Kindly clear the overdue of ${outlet.outletName}: Rs. ${shownAmount}, overdue by ${outlet.maxOverdueDays} days. A requisition cannot be added until it is cleared.`,
    };
};

export const getOutletOverdue = async (req, res) => {
    try {
        const companyId = Number(req.query.companyId);
        const outletId = Number(req.query.outletId);
        const company = await CompanyModel.getById(companyId);
        if (!company || !outletId) return res.status(400).json({ error: 'Company and outlet are required.' });
        if (req.user?.role === 'staff') {
            const outlet = await StaffModel.getCounterById(outletId);
            if (!req.user.companyIds?.map(Number).includes(companyId) || Number(outlet?.staff_id) !== Number(req.user.staffId)) {
                return res.status(403).json({ error: 'This outlet is not assigned to you.' });
            }
        }
        return res.status(200).json({ overdue: await findSilOutletOverdue(company, outletId) });
    } catch (error) {
        console.error('Error checking outlet overdue:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const create = async (req, res) => {
    try {
        const companyId = Number(req.body?.companyId);
        const staffId = req.user?.role === 'staff'
            ? Number(req.user.staffId)
            : Number(req.body?.staffId);
        const outletId = Number(req.body?.outletId);
        const sellerType = req.body?.sellerType === 'cnf' ? 'cnf' : 'distributor';
        const requested = Array.isArray(req.body?.items) ? req.body.items : [];
        const company = await CompanyModel.getById(companyId);
        if (!company || !staffId || !outletId || !requested.length) {
            return res.status(400).json({ error: 'Company, staff, outlet, and items are required.' });
        }
        if (req.user?.role === 'staff' && !req.user.companyIds?.map(Number).includes(companyId)) {
            return res.status(403).json({ error: 'This company is not assigned to your staff account.' });
        }
        const outlet = await StaffModel.getCounterById(outletId);
        if (!outlet || Number(outlet.staff_id) !== staffId) {
            return res.status(403).json({ error: 'This outlet is not assigned to the selected staff.' });
        }
        // SIL staff can only raise requisitions for today's outlets (C&F staff use their CNF list).
        if (req.user?.role === 'staff' && isSilCompany(company)) {
            const allowedDay = sellerType === 'cnf' ? 'CNF' : indiaWeekday();
            if (outlet.day !== allowedDay) {
                return res.status(409).json({
                    code: 'OUTLET_WRONG_DAY',
                    error: `${outlet.outlet_name} is a ${outlet.day} outlet. SIL requisitions can only be added for ${allowedDay} outlets today.`,
                });
            }
        }
        const overdue = await findSilOutletOverdue(company, outletId);
        if (overdue) {
            return res.status(409).json({ code: 'OUTLET_OVERDUE', error: overdue.message, overdue });
        }
        const dmsImport = await DmsStockModel.getLatestImportByCompanyName(company.name);
        if (!dmsImport) return res.status(400).json({ error: 'No Item List stock found for this company.' });
        const dms = await DmsStockModel.getLatestItemsByCompanyId(companyId, 2000);
        const physical = await PhysicalStockModel.getCurrentItemsByDmsImportId(dmsImport.id);
        const stock = buildCurrentStockDiff(physical, dms);
        // Each requested item is taken lot by lot (earliest expiry, then lowest MRP; a lot the
        // staff picked goes first) and becomes one line per MRP lot, each at that lot's rate.
        const lotsByErp = new Map();
        const items = requested.flatMap((entry) => {
            const key = String(entry.productErpId || '').trim().toLowerCase();
            const product = stock.find((row) => String(row.product_erp_id || '').trim().toLowerCase() === key);
            const quantity = Number(entry.quantity);
            if (!product || !(quantity > 0)) {
                const error = new Error(`Invalid or unavailable quantity for ${entry.productErpId}.`);
                error.statusCode = 400;
                throw error;
            }
            if (!lotsByErp.has(key)) lotsByErp.set(key, (product.lots || []).map((lot) => ({ ...lot })));
            const preferred = Number(entry.mrp) > 0
                ? { mrp: entry.mrp, batchNumber: entry.batchNumber, expiryDate: entry.expiryDate }
                : null;
            const { taken, short } = takeFromLots(lotsByErp.get(key), quantity, preferred);
            if (short > 0) {
                const error = new Error(`Invalid or unavailable quantity for ${entry.productErpId}.`);
                error.statusCode = 400;
                throw error;
            }
            const priceType = entry.priceType === 'wholesale' ? 'wholesale' : 'retail';
            return taken.map(({ lot, qty }) => {
                const preferredRate = priceType === 'wholesale' ? Number(lot.wholesale_price) : Number(lot.retail_price);
                const alternateRate = priceType === 'wholesale' ? Number(lot.retail_price) : Number(lot.wholesale_price);
                const rate = preferredRate
                    || alternateRate
                    || Number(product.price_per_piece)
                    || Number(product.dp_price)
                    || 0;
                if (rate <= 0) {
                    const error = new Error(`Selling price is missing for ${entry.productErpId}. Update this product in DMS Entry before submitting.`);
                    error.statusCode = 400;
                    throw error;
                }
                const { lots: _lots, price_lines: _priceLines, ...productFields } = product;
                return {
                    ...productFields,
                    mrp: lot.mrp,
                    batch_number: lot.batchNumber || '',
                    expiry_date: lot.expiryDate || '',
                    retail_price: Number(lot.retail_price) || product.retail_price,
                    wholesale_price: Number(lot.wholesale_price) || product.wholesale_price,
                    quantity: qty,
                    priceType,
                    rate,
                    amount: qty * rate,
                    gst_percent: Number(product.gst_percent) || 5,
                };
            });
        });
        // Free goods: each running scheme adds its free pieces as lines at rate 0 (taken from
        // stock lot by lot like the rest; only what is in stock).
        const schemes = await activeSchemesFor(companyId);
        if (schemes.size) {
            const bought = new Map();
            items.forEach((item) => {
                const key = String(item.product_erp_id || '').trim().toLowerCase();
                bought.set(key, (bought.get(key) || 0) + Number(item.quantity || 0));
            });
            for (const { scheme, freeErpId, freeQty } of freeFor(schemes, bought)) {
                const key = String(freeErpId || '').trim().toLowerCase();
                const product = stock.find((row) => String(row.product_erp_id || '').trim().toLowerCase() === key);
                if (!product) continue;
                if (!lotsByErp.has(key)) lotsByErp.set(key, (product.lots || []).map((lot) => ({ ...lot })));
                const { taken } = takeFromLots(lotsByErp.get(key), freeQty);
                const { lots: _lots, price_lines: _priceLines, ...productFields } = product;
                taken.forEach(({ lot, qty }) => items.push({
                    ...productFields,
                    mrp: lot.mrp,
                    batch_number: lot.batchNumber || '',
                    expiry_date: lot.expiryDate || '',
                    quantity: qty,
                    priceType: 'free',
                    rate: 0,
                    amount: 0,
                    gst_percent: Number(product.gst_percent) || 5,
                    is_free: true,
                    free_scheme_id: scheme.id,
                    free_note: `Buy ${scheme.buy_qty} get ${scheme.free_qty} free`,
                }));
            }
        }

        // Companies with a daily target (e.g. SIL Rs. 11,250): requisitions wait in the staff member's
        // Requisition Queue and go for approval only when they Final Submit that date.
        const needsFinalSubmit = Number(company.daily_requisition_target) > 0;
        const requisition = await PurchaseRequisitionModel.create({
            sellerType, companyId, staffId, outletId, outletDay: req.body?.outletDay,
            items,
            totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
            totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
            status: needsFinalSubmit ? 'draft' : 'pending',
        });
        return res.status(201).json({
            message: needsFinalSubmit
                ? 'Requisition added to your queue. Final Submit it from Requisition Queue.'
                : 'Purchase requisition created.',
            requisition,
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};

export const list = async (req, res) => {
    try {
        const date = req.query.date ? String(req.query.date).trim() : null;
        const requestedStaffId = Number(req.query.staffId);
        const requestedCompanyId = Number(req.query.companyId);
        const staffId = req.user?.role === 'staff' ? Number(req.user.staffId) : requestedStaffId;
        const companyId = Number.isInteger(requestedCompanyId) && requestedCompanyId > 0
            ? requestedCompanyId
            : null;
        const requisitions = Number.isInteger(staffId) && staffId > 0
            ? await PurchaseRequisitionModel.listByStaff(staffId, { date, companyId })
            : await PurchaseRequisitionModel.listAll({
                date,
                companyId,
                status: req.query.status ? String(req.query.status).trim() : null,
            });
        // Approvers never see drafts (not Final Submitted yet); staff see their own.
        const submitted = req.user?.role === 'staff'
            ? requisitions
            : requisitions.filter((row) => row.status !== 'draft');
        // Who approved / rejected is shown to Admin only.
        const visible = req.user?.role === 'admin'
            ? submitted
            : submitted.map(({ reviewed_by_name, reviewed_by_login_id, reviewed_by, reviewed_by_type, ...row }) => row);
        return res.json({ requisitions: visible });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getByNumber = async (req, res) => {
    try {
        const requisition = await PurchaseRequisitionModel.getByNumber(String(req.params.number || '').trim());
        if (!requisition) return res.status(404).json({ error: 'Requisition was not found.' });
        const requisitionStatus = String(requisition.status || '').trim().toLowerCase();
        if (requisitionStatus !== 'approved') {
            const statusMessages = {
                invoiced: requisition.invoiced_invoice_number
                    ? `This requisition has already been used for invoice ${requisition.invoiced_invoice_number} and cannot be used again.`
                    : 'This requisition has already been used for an invoice and cannot be used again. The invoice link was not recorded for this older requisition.',
                cancelled: 'This requisition was cancelled and cannot be used in Add Sales.',
                pending: 'This requisition is still pending approval.',
                draft: 'This requisition has not been Final Submitted by the staff member yet.',
                open: 'This requisition is still pending approval.',
            };
            return res.status(409).json({
                error: statusMessages[requisitionStatus]
                    || `This requisition cannot be used because its current status is "${requisitionStatus || 'unknown'}".`,
                status: requisitionStatus || null,
                invoiceNumber: requisition.invoiced_invoice_number || null,
                saleId: requisition.invoiced_sale_id || null,
            });
        }
        const outletId = Number(req.query.outletId);
        if (Number.isInteger(outletId) && outletId > 0 && Number(requisition.outlet_id) !== outletId) {
            return res.status(403).json({ error: `This requisition belongs to outlet "${requisition.outlet_name}" and cannot be used for the selected outlet.` });
        }
        if (req.user?.role === 'staff' && Number(requisition.staff_id) !== Number(req.user.staffId)) {
            return res.status(403).json({ error: 'You cannot view another staff member’s requisition.' });
        }
        return res.json({ requisition });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const review = async (req, res) => {
    try {
        const canReview = req.user?.role === 'admin'
            || req.user?.permissions?.includes('requisition_approval');
        if (!canReview) {
            return res.status(403).json({ error: 'You do not have permission to approve or cancel requisitions.' });
        }
        const status = String(req.body?.status || '').toLowerCase();
        if (!['approved', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Status must be approved or cancelled.' });
        }
        // Companies with a daily target (e.g. SIL Rs. 11,250): if the staff member's
        // requisitions for that day add up to less, only Admin or a user with the
        // "Below Target Approval" permission may approve. Cancelling stays open.
        if (status === 'approved') {
            const current = await PurchaseRequisitionModel.getById(Number(req.params.id));
            const target = Number(current?.company_daily_target) || 0;
            if (current && target > 0) {
                const day = await PurchaseRequisitionModel.getDayTotal(
                    current.staff_id, current.company_id, current.requisition_date
                );
                if (day.total < target && canApproveBelowTarget(req.user)) {
                    req.belowTargetDay = current;
                }
                if (day.total < target && !canApproveBelowTarget(req.user)) {
                    return res.status(403).json({
                        error: `${current.staff_name}'s ${current.company_name} requisitions on ${current.requisition_date} total Rs. ${day.total.toFixed(2)}, below the daily target of Rs. ${target.toFixed(2)}. This day needs Below Target approval.`,
                        code: 'BELOW_TARGET',
                        target,
                        achieved: day.total,
                    });
                }
            }
        }
        const requisition = await PurchaseRequisitionModel.updateStatus(
            Number(req.params.id),
            status,
            Number(req.user.id),
            String(req.body?.note || '').trim()
        );
        if (!requisition) {
            return res.status(409).json({ error: 'This requisition was already reviewed or was not found.' });
        }
        if (req.belowTargetDay) {
            await PurchaseRequisitionModel.resolveTargetRequestForDay(
                req.belowTargetDay.staff_id, req.belowTargetDay.company_id, req.belowTargetDay.requisition_date
            ).catch((error) => console.error('Could not close below-target request:', error));
        }
        if (status === 'cancelled') {
            await syncBelowTargetRequest(
                requisition.staff_id, requisition.company_id, requisition.requisition_date, requisition.company_daily_target
            );
        }
        return res.json({
            message: status === 'approved' ? 'Requisition approved.' : 'Requisition cancelled.',
            requisition,
        });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Daily target progress. Staff (web or app) always get their own; approvers can pass ?staffId=.
export const getTargetProgress = async (req, res) => {
    try {
        const staffId = req.user?.role === 'staff' ? Number(req.user.staffId) : Number(req.query.staffId);
        if (!Number.isInteger(staffId) || staffId <= 0) {
            return res.status(400).json({ error: 'Staff is required.' });
        }
        const requestedDate = String(req.query.date || '').trim();
        const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : indiaToday();
        const targets = await PurchaseRequisitionModel.getTargetProgress(staffId, date);
        return res.json({ date, targets });
    } catch (error) {
        console.error('Error loading requisition target progress:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

const canReviewRequisitions = (user) => user?.role === 'admin'
    || user?.permissions?.includes('requisition_approval');

// Who did what (requester / reviewer names and IDs) is shown to Admin only.
const hideActors = (row) => ({
    ...row,
    requested_by_type: null, requested_by_id: null, requested_by_name: null, requested_by_login_id: null,
    reviewed_by_type: null, reviewed_by_id: null, reviewed_by_name: null, reviewed_by_login_id: null,
});

export const listTargetRequests = async (req, res) => {
    try {
        if (!canReviewRequisitions(req.user) && !canApproveBelowTarget(req.user)) {
            return res.status(403).json({ error: 'You do not have permission to view requisition requests.' });
        }
        const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
        const rows = await PurchaseRequisitionModel.listTargetRequests({ status });
        return res.json({ requests: req.user?.role === 'admin' ? rows : rows.map(hideActors) });
    } catch (error) {
        console.error('Error listing below-target requests:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// A Requisition Approval user sends a below-target day for Below Target approval.
export const createTargetRequest = async (req, res) => {
    try {
        if (!canReviewRequisitions(req.user)) {
            return res.status(403).json({ error: 'You do not have permission to send approval requests.' });
        }
        const staffId = Number(req.body?.staffId);
        const companyId = Number(req.body?.companyId);
        const date = String(req.body?.date || '').trim();
        if (!Number.isInteger(staffId) || staffId <= 0 || !Number.isInteger(companyId) || companyId <= 0
            || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'Staff, company and date are required.' });
        }
        const company = await CompanyModel.getById(companyId);
        const target = Number(company?.daily_requisition_target) || 0;
        const day = await PurchaseRequisitionModel.getDayTotal(staffId, companyId, date);
        if (!target || day.total >= target) {
            return res.status(400).json({ error: 'This day is not below its daily target, so it can be approved normally.' });
        }
        if (await PurchaseRequisitionModel.getPendingTargetRequest(staffId, companyId, date)) {
            return res.status(409).json({ error: 'An approval request for this day is already waiting.' });
        }
        const id = await PurchaseRequisitionModel.createTargetRequest({
            staffId, companyId, date, target, achieved: day.total,
            note: String(req.body?.note || '').trim().slice(0, 1000),
        });
        return res.status(201).json({ message: 'Approval request sent.', id });
    } catch (error) {
        console.error('Error creating below-target request:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Admin / Below Target Approval user approves (approves all pending requisitions of that day) or rejects.
export const reviewTargetRequest = async (req, res) => {
    try {
        if (!canApproveBelowTarget(req.user)) {
            return res.status(403).json({ error: 'Only Admin or a Below Target Approval user can review this request.' });
        }
        const status = String(req.body?.status || '').toLowerCase();
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Status must be approved or rejected.' });
        }
        const result = await PurchaseRequisitionModel.reviewTargetRequest(
            Number(req.params.id), status, Number(req.user.id), String(req.body?.note || '').trim()
        );
        if (!result) return res.status(409).json({ error: 'This request was already reviewed or was not found.' });
        return res.json({
            message: status === 'approved'
                ? `Request approved. ${result.approvedCount} pending requisition(s) approved.`
                : 'Request rejected.',
            ...result,
        });
    } catch (error) {
        console.error('Error reviewing below-target request:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Staff: their Requisition Queue, one entry per date and company with a daily target.
export const getQueue = async (req, res) => {
    try {
        if (req.user?.role !== 'staff') {
            return res.status(403).json({ error: 'Only staff have a Requisition Queue.' });
        }
        const staffId = Number(req.user.staffId);
        const [rows, requests] = await Promise.all([
            PurchaseRequisitionModel.listByStaff(staffId),
            PurchaseRequisitionModel.listTargetRequestsForStaff(staffId),
        ]);
        const latestRequest = new Map(requests.map((row) => [`${row.request_date}|${row.company_id}`, row]));
        const groups = new Map();
        rows.filter((row) => Number(row.company_daily_target) > 0).forEach((row) => {
            const key = `${row.requisition_date}|${row.company_id}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        });
        const days = [...groups.entries()].map(([key, requisitions]) => {
            const [first] = requisitions;
            const target = Number(first.company_daily_target);
            const counted = requisitions.filter((row) => row.status !== 'cancelled');
            const sum = (list) => Math.round(list.reduce((total, row) => total + Number(row.total_amount || 0), 0) * 100) / 100;
            const drafts = requisitions.filter((row) => row.status === 'draft');
            const achieved = sum(counted);
            const request = latestRequest.get(key) || null;
            const waiting = requisitions.some((row) => ['open', 'pending'].includes(row.status));
            let stage = 'done';
            if (drafts.length) stage = 'queue';
            else if (waiting && request?.status === 'pending') stage = 'admin';
            else if (waiting && request?.status === 'rejected') stage = 'rejected';
            else if (waiting) stage = 'approval';
            return {
                key,
                date: first.requisition_date,
                companyId: first.company_id,
                companyName: first.company_name,
                target,
                achieved,
                short: Math.max(0, Math.round((target - achieved) * 100) / 100),
                belowTarget: achieved < target,
                draftCount: drafts.length,
                draftTotal: sum(drafts),
                stage,
                reason: request?.note || null,
                adminNote: request?.review_note || null,
                requisitions,
            };
        }).sort((a, b) => b.date.localeCompare(a.date) || a.companyName.localeCompare(b.companyName));
        return res.json({ days: days.slice(0, 90) });
    } catch (error) {
        console.error('Error loading requisition queue:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// Staff: Final Submit their queued requisitions for a company, for one date (or all queued dates
// if none is sent). A day that reaches the daily target goes to normal approval. A day below the
// target needs confirmBelowTarget and a reason, and waits for Admin / a Below Target approver.
export const finalSubmit = async (req, res) => {
    try {
        if (req.user?.role !== 'staff') {
            return res.status(403).json({ error: 'Only staff can Final Submit their requisitions.' });
        }
        const staffId = Number(req.user.staffId);
        const companyId = Number(req.body?.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Company is required.' });
        }
        if (!req.user.companyIds?.map(Number).includes(companyId)) {
            return res.status(403).json({ error: 'This company is not assigned to your staff account.' });
        }
        const company = await CompanyModel.getById(companyId);
        const target = Number(company?.daily_requisition_target) || 0;
        const onlyDate = String(req.body?.date || '').trim();
        const draftDays = (await PurchaseRequisitionModel.listDraftDays(staffId, companyId))
            .filter((day) => !onlyDate || day.date === onlyDate);
        if (!draftDays.length) {
            return res.status(400).json({ error: 'You have no queued requisitions to submit.' });
        }

        const days = [];
        for (const draftDay of draftDays) {
            const day = await PurchaseRequisitionModel.getDayTotal(staffId, companyId, draftDay.date);
            days.push({
                date: draftDay.date,
                draftCount: draftDay.count,
                total: day.total,
                target,
                short: target > 0 ? Math.max(0, Math.round((target - day.total) * 100) / 100) : 0,
                belowTarget: target > 0 && day.total < target,
            });
        }

        const below = days.filter((day) => day.belowTarget);
        if (below.length && req.body?.confirmBelowTarget !== true) {
            return res.status(409).json({
                code: 'BELOW_TARGET',
                error: `Your ${company.name} requisitions are below the daily target of Rs. ${target.toFixed(2)}. `
                    + 'If you Final Submit now, they will need Admin approval.',
                days,
            });
        }

        const note = String(req.body?.note || '').trim().slice(0, 1000);
        if (below.length && !note) {
            return res.status(400).json({
                code: 'REASON_REQUIRED',
                error: 'Enter the reason for submitting below the daily target.',
                days,
            });
        }
        let submitted = 0;
        for (const day of days) {
            submitted += await PurchaseRequisitionModel.submitDrafts(staffId, companyId, day.date);
            await syncBelowTargetRequest(staffId, companyId, day.date, target, day.belowTarget ? note : null);
        }

        return res.json({
            message: below.length
                ? `${submitted} requisition(s) submitted. Below target, so they are waiting for Admin approval.`
                : `${submitted} requisition(s) submitted for approval.`,
            submitted,
            belowTarget: below.length > 0,
            days,
        });
    } catch (error) {
        console.error('Error on requisition final submit:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const removePending = async (req, res) => {
    try {
        if (req.user?.role !== 'staff') {
            return res.status(403).json({ error: 'Only the staff member who created the requisition can delete it.' });
        }
        const requisitionId = Number(req.params.id);
        if (!Number.isInteger(requisitionId) || requisitionId <= 0) {
            return res.status(400).json({ error: 'Invalid requisition ID.' });
        }
        const existing = await PurchaseRequisitionModel.getById(requisitionId);
        const deleted = await PurchaseRequisitionModel.deletePendingByStaff(
            requisitionId,
            Number(req.user.staffId)
        );
        if (!deleted) {
            return res.status(409).json({
                error: 'Only your own draft or pending requisition can be deleted. It may already be approved, cancelled, or invoiced.',
            });
        }
        // A queued requisition was never submitted, so it has no approval to update.
        if (existing.status !== 'draft') {
            await syncBelowTargetRequest(
                existing.staff_id, existing.company_id, existing.requisition_date, existing.company_daily_target
            );
        }
        return res.json({ message: 'Pending requisition deleted successfully.' });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
