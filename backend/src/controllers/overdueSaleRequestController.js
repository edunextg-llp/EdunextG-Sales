import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import StaffModel from '../models/staffModel.js';
import OverdueSaleRequestModel, { ADMIN_APPROVAL_LEVEL, cleanSaleForRequest, getOverdueOutlets, SELF_APPROVE_OVERDUE_DAYS } from '../models/overdueSaleRequestModel.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['awaiting_staff', 'pending', 'approved', 'rejected', 'used', 'open', 'self_approved', 'own_permission', 'all'];

// Which 14+ day overdue requests this login can approve. Admin can review everything.
const approvalLevelsFor = (user) => {
    if (user?.role === 'bawarchee_staff' && user.bawarcheeRole === 'manager') return ['up_to_2000'];
    return user?.permissions?.includes('overdue_approval') ? ['up_to_1000'] : [];
};
const canReviewRequest = (user, request) => user?.role === 'admin'
    || (Boolean(request.approval_level) && approvalLevelsFor(user).includes(request.approval_level));

const parseOutletIds = (value) => {
    const list = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(list.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
};

export async function getRequester(user) {
    if (user?.role === 'admin') {
        return { role: 'admin', id: user.id || null, name: user.username || user.email || `Admin #${user.id}` };
    }
    if (user?.role === 'bawarchee_staff') {
        const staffId = user.staffId || user.id || null;
        let staffName = '';
        try {
            staffName = (await StaffModel.getDetails(staffId))?.name || '';
        } catch {
            staffName = '';
        }
        return { role: 'bawarchee_staff', id: staffId, name: staffName || user.loginId || `Staff #${staffId}` };
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
        if (overdueOutlets.some((outlet) => Number(outlet.maxOverdueDays) > SELF_APPROVE_OVERDUE_DAYS)) {
            return res.status(409).json({ error: `Outlets overdue by more than ${SELF_APPROVE_OVERDUE_DAYS} days cannot be sent to admin. Cancel the invoice from Add Sales.` });
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

// Checks a 14+ day overdue send from Add Sales, whoever it is going to. The overdue list is worked
// out again here. Returns the sale details, or { status, error } when it can't be sent.
const readTooOldOverdueSend = async (body) => {
    const staffId = Number(body.staffId);
    const saleDate = String(body.saleDate || '').trim();
    const outletIds = parseOutletIds(body.outletIds);
    if (!Number.isInteger(staffId) || staffId <= 0) return { status: 400, error: 'Select a staff first.' };
    if (!DATE_PATTERN.test(saleDate)) return { status: 400, error: 'Sale date is invalid.' };
    if (!outletIds.length) return { status: 400, error: 'Select at least one outlet.' };

    const overdue = (await getOverdueOutlets(outletIds))
        .filter((outlet) => Number(outlet.maxOverdueDays) > SELF_APPROVE_OVERDUE_DAYS);
    if (overdue.length !== outletIds.length) {
        return { status: 409, error: `Only outlets overdue by more than ${SELF_APPROVE_OVERDUE_DAYS} days can be sent this way. Save the sale again.` };
    }

    const payload = body.salesPayload && typeof body.salesPayload === 'object' ? body.salesPayload : {};
    const sales = Array.isArray(payload.sales) ? payload.sales.slice(0, 100) : [];
    const salesPayloadByOutlet = {};
    for (const outlet of overdue) {
        const outletSales = sales.filter((sale) => Number(sale?.outletId) === outlet.outletId).map(cleanSaleForRequest);
        if (!outletSales.length) return { status: 400, error: 'Enter the invoice before sending it.' };
        salesPayloadByOutlet[outlet.outletId] = { companyName: String(payload.companyName || '').trim(), sales: outletSales };
    }
    return { staffId, saleDate, outletIds, overdue, salesPayloadByOutlet };
};

// POST /api/staff/overdue-requests/send-to-admin
// From Add Sales: 14+ days overdue goes straight to Admin with a reason. Approving creates the sale.
export const sendToAdmin = async (req, res) => {
    try {
        const note = String(req.body.note || '').trim();
        if (!note) return res.status(400).json({ error: 'Enter the reason for sending this to admin.' });
        if (note.length > 1000) return res.status(400).json({ error: 'Reason must be 1000 characters or less.' });

        const send = await readTooOldOverdueSend(req.body);
        if (send.error) return res.status(send.status).json({ error: send.error });
        const { staffId, saleDate, outletIds, overdue, salesPayloadByOutlet } = send;

        // Already with another approver, or approved: leave it there rather than have two open requests.
        const latest = await OverdueSaleRequestModel.getLatestForSale({ staffId, saleDate, outletIds });
        const taken = latest.find((request) => request.status === 'approved'
            || (request.status === 'pending' && request.approval_level !== ADMIN_APPROVAL_LEVEL));
        if (taken) {
            return res.status(409).json({
                error: taken.status === 'approved'
                    ? `${taken.outlet_name} is already approved for this date. Save the sale again.`
                    : `${taken.outlet_name} is already waiting for approval (request #${taken.id}).`,
            });
        }

        const requests = await OverdueSaleRequestModel.createForAdmin({
            staffId,
            saleDate,
            overdueOutlets: overdue,
            note,
            salesPayloadByOutlet,
            requester: await getRequester(req.user),
        });
        return res.status(201).json({ message: 'Sent to admin for approval.', requests });
    } catch (error) {
        console.error('Error sending overdue request to admin:', error);
        return res.status(500).json({ error: 'Unable to send this to admin.' });
    }
};

// POST /api/staff/overdue-requests/send-to-staff
// From Add Sales: 14+ days overdue goes to the outlet's marketing staff for a reason and days to pay.
export const sendToMarketingStaff = async (req, res) => {
    try {
        const send = await readTooOldOverdueSend(req.body);
        if (send.error) return res.status(send.status).json({ error: send.error });
        const { staffId, saleDate, overdue, salesPayloadByOutlet } = send;

        const outlets = [];
        for (const outlet of overdue) {
            const counter = await StaffModel.getCounterById(outlet.outletId);
            outlets.push({ outlet, marketingStaffId: counter.staff_id });
        }

        const requests = await OverdueSaleRequestModel.createAwaitingStaff({
            staffId, saleDate, outlets, salesPayloadByOutlet, requester: await getRequester(req.user),
        });
        return res.status(201).json({ message: 'Sent to marketing staff.', requests });
    } catch (error) {
        console.error('Error sending overdue request to marketing staff:', error);
        return res.status(500).json({ error: 'Unable to send this to marketing staff.' });
    }
};

// GET /api/staff/overdue-requests/my (also the staff app): requests for this marketing staff member.
export const listMyOverdueRequests = async (req, res) => {
    try {
        if (req.user?.role !== 'staff') return res.status(403).json({ error: 'Only marketing staff have this list.' });
        return res.json({ requests: await OverdueSaleRequestModel.listForMarketingStaff(Number(req.user.staffId)) });
    } catch (error) {
        console.error('Error listing marketing staff overdue requests:', error);
        return res.status(500).json({ error: 'Unable to load overdue requests.' });
    }
};

// PUT /api/staff/overdue-requests/:id/respond { reason, paymentDays } (also the staff app)
export const respondToOverdueRequest = async (req, res) => {
    try {
        if (req.user?.role !== 'staff') return res.status(403).json({ error: 'Only marketing staff can respond.' });
        const id = Number(req.params.id);
        const reason = String(req.body.reason || '').trim();
        const paymentDays = Number(req.body.paymentDays);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid request.' });
        if (!reason) return res.status(400).json({ error: 'Enter the reason for the overdue.' });
        if (reason.length > 1000) return res.status(400).json({ error: 'Reason must be 1000 characters or less.' });
        if (!Number.isInteger(paymentDays) || paymentDays < 1 || paymentDays > 7) {
            return res.status(400).json({ error: 'Days to complete payment must be from 1 to 7.' });
        }
        const [request] = await OverdueSaleRequestModel.getByIds([id]);
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        const [outlet] = await getOverdueOutlets([request.outlet_id]);
        const saved = await OverdueSaleRequestModel.recordStaffResponse(id, Number(req.user.staffId), { reason, paymentDays, outlet });
        if (!saved) return res.status(409).json({ error: 'This request is not waiting for your response.' });
        const [updated] = await OverdueSaleRequestModel.getByIds([id]);
        return res.json({ message: 'Submitted for approval.', request: updated });
    } catch (error) {
        console.error('Error saving marketing staff overdue response:', error);
        return res.status(500).json({ error: 'Unable to submit your response.' });
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
        if (req.query.scope === 'approver' && req.user?.role !== 'admin') {
            const approvalLevels = approvalLevelsFor(req.user);
            if (!approvalLevels.length) return res.status(403).json({ error: 'You do not review overdue requests.' });
            return res.json(await OverdueSaleRequestModel.list({ status, limit: req.query.limit, approvalLevels }));
        }
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

// A rejected 14+ day request: its invoices go to Delivered -> Cancelled Items, the same as
// "Cancel Invoice" on Add Sales. No stock is taken. An invoice that already exists is left alone.
async function cancelSalesFromRequest(request, rejectedBy, note) {
    const sales = request?.sales_payload?.sales;
    if (!Array.isArray(sales) || !sales.length) {
        return { cancelled: [], error: 'This request has no invoice details saved, so nothing was added to Cancelled Items.' };
    }
    const staffId = Number(request.staff_id);
    const remark = `Request #${request.id} rejected by ${rejectedBy}: ${note}`;
    const companyName = String(request.sales_payload.companyName || '').trim();
    const cancelled = [];
    const problems = [];
    const reserved = [];
    for (const sale of sales) {
        const given = String(sale.invoiceNumber || '').trim();
        try {
            if (given && await StaffModel.findSaleByInvoice(staffId, given)) {
                problems.push(`Invoice ${given} already exists.`);
                continue;
            }
            const invoiceNumber = given || await StaffModel.generateUniqueBillNumber(staffId, companyName, reserved);
            reserved.push(invoiceNumber);
            await StaffModel.saveOverdueCancelledSale(staffId, request.sale_date, {
                outletId: Number(sale.outletId),
                invoiceNumber,
                itemCount: Number(sale.itemCount) || 0,
                price: Number(sale.price) || 0,
                lineItems: Array.isArray(sale.lineItems) ? sale.lineItems : [],
            }, { remark });
            cancelled.push(invoiceNumber);
        } catch (error) {
            console.error('Error cancelling invoice from rejected overdue request:', error);
            problems.push(`Invoice ${given || '(no number)'} could not be cancelled.`);
        }
    }
    return { cancelled, error: problems.join(' ') || null };
}

// POST /api/staff/overdue-requests/:id/create-sales — retry for an approved request.
export const createSalesForRequest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid request.' });
        const [request] = await OverdueSaleRequestModel.getByIds([id]);
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        if (!canReviewRequest(req.user, request)) return res.status(403).json({ error: 'You cannot act on this request.' });
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

        const [existing] = await OverdueSaleRequestModel.getByIds([id]);
        if (!existing) return res.status(404).json({ error: 'Request not found.' });
        if (!canReviewRequest(req.user, existing)) {
            return res.status(403).json({ error: 'This overdue amount needs a different approver.' });
        }
        const reviewer = await getRequester(req.user);
        const updated = await OverdueSaleRequestModel.review(id, {
            approve: action === 'approve',
            note,
            adminId: req.user?.role === 'admin' ? reviewer.id : null,
            adminName: reviewer.name,
            allowAwaitingStaff: req.user?.role === 'admin',
        });
        if (!updated) return res.status(409).json({ error: 'This request has already been reviewed.' });
        let [request] = await OverdueSaleRequestModel.getByIds([id]);
        // 14+ day requests (from marketing staff or sent straight to Admin) always create the sale on approval.
        if (action === 'approve' && existing.status !== 'awaiting_staff' && (req.body.createSales === true || existing.approval_level)) {
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
        // Marking it rejected above is what stops a second reject from cancelling the invoices twice.
        if (action === 'reject' && (existing.approval_level || existing.marketing_staff_id)) {
            const result = await cancelSalesFromRequest(request, reviewer.name, note);
            const moved = result.cancelled.length
                ? `Request rejected. Invoice ${result.cancelled.join(', ')} moved to Delivered -> Cancelled Items.`
                : 'Request rejected.';
            return res.json({
                message: result.error ? `${moved} ${result.error}` : moved,
                request,
                salesError: result.error,
            });
        }
        res.json({ message: action === 'approve' ? 'Request approved.' : 'Request rejected.', request });
    } catch (error) {
        console.error('Error reviewing overdue sale request:', error);
        res.status(500).json({ error: 'Unable to update the request.' });
    }
};
