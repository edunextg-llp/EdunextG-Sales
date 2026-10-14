import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import StaffModel from '../models/staffModel.js';
import OverdueSaleRequestModel, { cleanSaleForRequest, getOverdueOutlets } from '../models/overdueSaleRequestModel.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['pending', 'approved', 'rejected', 'used', 'open', 'all'];

const parseOutletIds = (value) => {
    const list = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(list.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
};

export async function getRequester(user) {
    if (user?.role === 'admin') {
        return { role: 'admin', id: user.id || null, name: user.username || user.email || `Admin #${user.id}` };
    }
    const deliveryBoyId = user?.deliveryBoyId || user?.id || null;
    let name = '';
    if (deliveryBoyId) {
        try {
            name = (await DeliveryBoyModel.getById(deliveryBoyId))?.name || '';
        } catch {
            name = '';
        }
    }
    return {
        role: user?.role || 'unknown',
        id: deliveryBoyId,
        name: name || user?.loginId || `User #${deliveryBoyId}`,
    };
}

// POST /api/staff/overdue-requests
// Raised from Add Sales when an outlet's ERP ID has credit overdue by more than 3 days.
export const createOverdueRequest = async (req, res) => {
    try {
        const staffId = Number(req.body.staffId);
        const saleDate = String(req.body.saleDate || '').trim();
        const outletIds = parseOutletIds(req.body.outletIds);
        const note = String(req.body.note || '').trim();

        if (!Number.isInteger(staffId) || staffId <= 0) return res.status(400).json({ error: 'Select a staff first.' });
        if (!DATE_PATTERN.test(saleDate)) return res.status(400).json({ error: 'Sale date is invalid.' });
        if (!outletIds.length) return res.status(400).json({ error: 'Select at least one outlet.' });
        if (!note) return res.status(400).json({ error: 'Reason for request is required.' });
        if (note.length > 1000) return res.status(400).json({ error: 'Reason must be 1000 characters or less.' });

        // Never trust the client's overdue list: work it out again here.
        const overdueOutlets = await getOverdueOutlets(outletIds);
        if (!overdueOutlets.length) {
            return res.status(400).json({ error: 'These outlets have no overdue credit. You can add the sales directly.' });
        }

        // Save the exact invoices being requested, so the approval covers only those.
        const salesPayloadByOutlet = {};
        const payload = req.body.salesPayload && typeof req.body.salesPayload === 'object' ? req.body.salesPayload : {};
        const sales = Array.isArray(payload.sales) ? payload.sales.slice(0, 100) : [];
        overdueOutlets.forEach(({ outletId }) => {
            const outletSales = sales.filter((sale) => Number(sale?.outletId) === outletId).map(cleanSaleForRequest);
            if (!outletSales.length) return;
            salesPayloadByOutlet[outletId] = {
                companyName: String(payload.companyName || '').trim(),
                sales: outletSales,
            };
        });
        if (!Object.keys(salesPayloadByOutlet).length) {
            return res.status(400).json({ error: 'Enter the invoice before sending the request.' });
        }

        const requests = await OverdueSaleRequestModel.createRequests({
            staffId,
            saleDate,
            overdueOutlets: overdueOutlets.filter((outlet) => salesPayloadByOutlet[outlet.outletId]),
            note,
            salesPayloadByOutlet,
            requester: await getRequester(req.user),
        });
        res.status(201).json({ message: 'Request sent to admin for approval.', requests });
    } catch (error) {
        console.error('Error creating overdue sale request:', error);
        res.status(500).json({ error: 'Unable to send the request. Please try again.' });
    }
};

// GET /api/staff/overdue-requests
// Admin: list by status. Add Sales users: own requests, or status for one staff + date + outlets.
export const listOverdueRequests = async (req, res) => {
    try {
        const { staffId, saleDate, outletIds } = req.query;
        if (staffId || saleDate || outletIds) {
            const id = Number(staffId);
            if (!Number.isInteger(id) || id <= 0 || !DATE_PATTERN.test(String(saleDate || ''))) {
                return res.status(400).json({ error: 'staffId and saleDate are required.' });
            }
            const requests = await OverdueSaleRequestModel.getLatestForSale({
                staffId: id,
                saleDate: String(saleDate),
                outletIds: parseOutletIds(outletIds),
            });
            return res.json({ requests });
        }

        // Admin sees every request; other Add Sales users see only the ones they raised.
        const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
        let requestedBy = null;
        if (req.user?.role !== 'admin') {
            const requester = await getRequester(req.user);
            requestedBy = { role: requester.role, id: requester.id };
        }
        res.json(await OverdueSaleRequestModel.list({ status, limit: req.query.limit, requestedBy }));
    } catch (error) {
        console.error('Error listing overdue sale requests:', error);
        res.status(500).json({ error: 'Unable to load overdue requests.' });
    }
};

const SALE_ERROR_HINTS = ['Insufficient stock', 'not available in current stock', 'Physical stock is not available', 'No DMS stock upload found'];

// Creates the sales saved in an approved request (same save as Add Sales) and
// marks the request used. On failure the request stays approved so the sales
// can still be added from Add Sales or retried here.
export async function createSalesFromRequest(request) {
    const sales = request?.sales_payload?.sales;
    if (!Array.isArray(sales) || !sales.length) {
        return { created: false, error: 'This request has no invoice details saved. Add the sales from Add Sales.' };
    }
    const staffId = Number(request.staff_id);
    const staff = await StaffModel.getDetails(staffId);
    const companyName = String(request.sales_payload.companyName || '').trim()
        || String(staff?.company_name || '').split(',').map((name) => name.trim()).find(Boolean) || '';
    for (const sale of sales) {
        if (sale.invoiceNumber && await StaffModel.findSaleByInvoice(staffId, sale.invoiceNumber)) {
            return { created: false, error: `Invoice ${sale.invoiceNumber} already exists for this staff.` };
        }
    }
    const claimed = await OverdueSaleRequestModel.claim([request.id]);
    if (!claimed.length) return { created: false, error: 'This approval has already been used.' };

    let savedSales;
    try {
        const reserved = [];
        const validatedSales = [];
        for (const sale of sales) {
            const invoiceNumber = String(sale.invoiceNumber || '').trim()
                || await StaffModel.generateUniqueBillNumber(staffId, companyName, reserved);
            reserved.push(invoiceNumber);
            validatedSales.push({
                outletId: Number(sale.outletId),
                invoiceNumber,
                requisitionNumber: String(sale.requisitionNumber || '').trim(),
                itemCount: Number(sale.itemCount) || 0,
                price: Number(sale.price) || 0,
                deliveryBoyId: null,
                vehicleNo: null,
                paymentMode: 'cash',
                lineItems: Array.isArray(sale.lineItems) ? sale.lineItems : [],
            });
        }
        savedSales = await StaffModel.saveSales(staffId, request.sale_date, validatedSales, { companyName });
    } catch (error) {
        await OverdueSaleRequestModel.release([request.id]).catch(() => {});
        const known = SALE_ERROR_HINTS.some((hint) => error.message?.includes(hint)) || error.code === 'REQUISITION_NOT_APPROVED';
        if (!known) console.error('Error creating sales from overdue request:', error);
        return { created: false, error: known ? error.message : 'Sales could not be created. Add them from Add Sales.' };
    }

    // Same permission log Add Sales writes for an approved request.
    try {
        await StaffModel.createOverdueSalePermission({
            staffId,
            saleDate: request.sale_date,
            outletId: Number(request.outlet_id),
            outletErpId: request.outlet_erp_id,
            outletName: request.outlet_name,
            maxOverdueDays: request.max_overdue_days,
            overdueCreditIds: (request.overdue_details || []).map((credit) => credit.creditPaymentId),
            overdueDetails: request.overdue_details || [],
            permissionNote: `Approved request #${request.id} (by ${request.requested_by_name || 'user'}): ${request.request_note || ''}${request.review_note ? ` | Admin: ${request.review_note}` : ''} | Sales created on approval`,
            permittedByAdminId: request.reviewed_by_admin_id,
            permittedByName: request.reviewed_by_name,
        });
    } catch (logError) {
        console.error('Sales created, but overdue permission log failed:', logError);
    }
    return { created: true, sales: savedSales };
}

// POST /api/staff/overdue-requests/:id/create-sales — retry for an approved request.
export const createSalesForRequest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid request.' });
        const [request] = await OverdueSaleRequestModel.getByIds([id]);
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        if (request.status !== 'approved') return res.status(409).json({ error: 'Only approved requests that have no sales yet can create sales.' });
        const result = await createSalesFromRequest(request);
        const [updated] = await OverdueSaleRequestModel.getByIds([id]);
        if (!result.created) return res.status(409).json({ error: result.error, request: updated });
        res.json({ message: `${result.sales?.length || 0} sale(s) created.`, request: updated, sales: result.sales });
    } catch (error) {
        console.error('Error creating sales for overdue request:', error);
        res.status(500).json({ error: 'Unable to create the sales.' });
    }
};

// PUT /api/staff/overdue-requests/:id/review   { action: 'approve' | 'reject', note, createSales }
// createSales: true also creates the requested sales right after approving.
export const reviewOverdueRequest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const action = String(req.body.action || '').toLowerCase();
        const note = String(req.body.note || '').trim();
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid request.' });
        if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Action must be approve or reject.' });
        if (action === 'reject' && !note) return res.status(400).json({ error: 'Reason is required to reject a request.' });

        const admin = await getRequester(req.user);
        const updated = await OverdueSaleRequestModel.review(id, {
            approve: action === 'approve',
            note,
            adminId: admin.id,
            adminName: admin.name,
        });
        if (!updated) return res.status(409).json({ error: 'This request has already been reviewed.' });
        let [request] = await OverdueSaleRequestModel.getByIds([id]);
        if (action === 'approve' && req.body.createSales === true) {
            const result = await createSalesFromRequest(request);
            [request] = await OverdueSaleRequestModel.getByIds([id]);
            return res.json({
                message: result.created
                    ? `Request approved and ${result.sales?.length || 0} sale(s) created.`
                    : `Request approved, but sales were not created: ${result.error}`,
                request,
                salesCreated: result.created,
                salesError: result.created ? null : result.error,
            });
        }
        res.json({ message: action === 'approve' ? 'Request approved.' : 'Request rejected.', request });
    } catch (error) {
        console.error('Error reviewing overdue sale request:', error);
        res.status(500).json({ error: 'Unable to update the request.' });
    }
};
