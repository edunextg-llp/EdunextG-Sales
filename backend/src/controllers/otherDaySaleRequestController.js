import OtherDaySaleRequestModel, { getOtherDayOutlets, todayDate, todayDayName } from '../models/otherDaySaleRequestModel.js';
import { getRequester } from './overdueSaleRequestController.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['pending', 'approved', 'rejected', 'used', 'open', 'all'];

const parseOutletIds = (value) => {
    const list = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(list.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
};

// POST /api/staff/other-day-requests   { staffId, saleDate, outletIds, note }
// Raised from Add Sales when an outlet belongs to a different day's bit than today.
export const createOtherDayRequest = async (req, res) => {
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

        // Work out the other-day outlets here rather than trusting the client.
        const outlets = await getOtherDayOutlets(outletIds, saleDate);
        if (!outlets.length) {
            return res.status(400).json({ error: `These outlets are in today's (${todayDayName()}) bit. You can add the sales directly.` });
        }

        const requests = await OtherDaySaleRequestModel.createRequests({
            staffId, saleDate, outlets, note, requester: await getRequester(req.user),
        });
        res.status(201).json({ message: 'Request sent to admin for approval.', requests });
    } catch (error) {
        console.error('Error creating other-day bit request:', error);
        res.status(500).json({ error: 'Unable to send the request. Please try again.' });
    }
};

// GET /api/staff/other-day-requests
// With staffId + saleDate + outletIds: latest request per outlet (Add Sales status).
// Otherwise: admin sees every request, other users their own.
export const listOtherDayRequests = async (req, res) => {
    try {
        const { staffId, saleDate, outletIds } = req.query;
        if (staffId || saleDate || outletIds) {
            const id = Number(staffId);
            if (!Number.isInteger(id) || id <= 0 || !DATE_PATTERN.test(String(saleDate || ''))) {
                return res.status(400).json({ error: 'staffId and saleDate are required.' });
            }
            const requests = await OtherDaySaleRequestModel.getLatestForSale({
                staffId: id, saleDate: String(saleDate), outletIds: parseOutletIds(outletIds),
            });
            return res.json({ requests, todayDay: todayDayName(), todayDate: todayDate() });
        }

        const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
        let requestedBy = null;
        if (req.user?.role !== 'admin') {
            const requester = await getRequester(req.user);
            requestedBy = { role: requester.role, id: requester.id };
        }
        res.json(await OtherDaySaleRequestModel.list({ status, limit: req.query.limit, requestedBy }));
    } catch (error) {
        console.error('Error listing other-day bit requests:', error);
        res.status(500).json({ error: 'Unable to load requests.' });
    }
};

// PUT /api/staff/other-day-requests/:id/review   { action: 'approve' | 'reject', note }
export const reviewOtherDayRequest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const action = String(req.body.action || '').toLowerCase();
        const note = String(req.body.note || '').trim();
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid request.' });
        if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Action must be approve or reject.' });
        if (action === 'reject' && !note) return res.status(400).json({ error: 'Reason is required to reject a request.' });

        const admin = await getRequester(req.user);
        const updated = await OtherDaySaleRequestModel.review(id, {
            approve: action === 'approve', note, adminId: admin.id, adminName: admin.name,
        });
        if (!updated) return res.status(409).json({ error: 'This request has already been reviewed.' });
        const [request] = await OtherDaySaleRequestModel.getByIds([id]);
        res.json({
            message: action === 'approve'
                ? 'Request approved. The user can now add the sale for this outlet.'
                : 'Request rejected.',
            request,
        });
    } catch (error) {
        console.error('Error reviewing other-day bit request:', error);
        res.status(500).json({ error: 'Unable to update the request.' });
    }
};
