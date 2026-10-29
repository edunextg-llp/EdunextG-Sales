import CompanyModel from '../models/companyModel.js';
import DmsStockModel from '../models/dmsStockModel.js';
import PhysicalStockModel from '../models/physicalStockModel.js';
import PurchaseRequisitionModel from '../models/purchaseRequisitionModel.js';
import StaffModel from '../models/staffModel.js';
import { buildCurrentStockDiff } from './currentStockController.js';

// Today's date in India (the business day), as YYYY-MM-DD.
const indiaToday = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const canApproveBelowTarget = (user) => user?.role === 'admin'
    || user?.permissions?.includes('requisition_target_approval');

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
        const dmsImport = await DmsStockModel.getLatestImportByCompanyName(company.name);
        if (!dmsImport) return res.status(400).json({ error: 'No Item List stock found for this company.' });
        const dms = await DmsStockModel.getLatestItemsByCompanyId(companyId, 2000);
        const physical = await PhysicalStockModel.getCurrentItemsByDmsImportId(dmsImport.id);
        const stock = buildCurrentStockDiff(physical, dms);
        const items = requested.map((entry) => {
            const product = stock.find((row) =>
                String(row.product_erp_id || '').trim().toLowerCase()
                === String(entry.productErpId || '').trim().toLowerCase()
            );
            const quantity = Number(entry.quantity);
            if (!product || quantity <= 0 || quantity > Number(product.total_current_stock_in_pcs)) {
                const error = new Error(`Invalid or unavailable quantity for ${entry.productErpId}.`);
                error.statusCode = 400;
                throw error;
            }
            const priceType = entry.priceType === 'wholesale' ? 'wholesale' : 'retail';
            const preferredRate = priceType === 'wholesale'
                ? Number(product.wholesale_price)
                : Number(product.retail_price);
            const alternateRate = priceType === 'wholesale'
                ? Number(product.retail_price)
                : Number(product.wholesale_price);
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
            const amount = quantity * rate;
            const gstPercent = Number(product.gst_percent) || 5;
            return {
                ...product,
                quantity,
                priceType,
                rate,
                amount,
                gst_percent: gstPercent,
            };
        });
        const requisition = await PurchaseRequisitionModel.create({
            sellerType, companyId, staffId, outletId, outletDay: req.body?.outletDay,
            items,
            totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
            totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
        });
        return res.status(201).json({ message: 'Purchase requisition created.', requisition });
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
        // Who approved / rejected is shown to Admin only.
        const visible = req.user?.role === 'admin'
            ? requisitions
            : requisitions.map(({ reviewed_by_name, reviewed_by_login_id, reviewed_by, reviewed_by_type, ...row }) => row);
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

export const removePending = async (req, res) => {
    try {
        if (req.user?.role !== 'staff') {
            return res.status(403).json({ error: 'Only the staff member who created the requisition can delete it.' });
        }
        const requisitionId = Number(req.params.id);
        if (!Number.isInteger(requisitionId) || requisitionId <= 0) {
            return res.status(400).json({ error: 'Invalid requisition ID.' });
        }
        const deleted = await PurchaseRequisitionModel.deletePendingByStaff(
            requisitionId,
            Number(req.user.staffId)
        );
        if (!deleted) {
            return res.status(409).json({
                error: 'Only your own pending requisition can be deleted. It may already be approved, cancelled, or invoiced.',
            });
        }
        return res.json({ message: 'Pending requisition deleted successfully.' });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
