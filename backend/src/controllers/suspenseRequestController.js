import SuspenseRequestModel from '../models/suspenseRequestModel.js';
import { getRequester } from './overdueSaleRequestController.js';

const STATUSES = ['pending', 'approved', 'rejected', 'all'];

// GET /api/staff/suspense-requests?status=pending
// Admin sees every request; other users see only the ones they raised.
export const listSuspenseRequests = async (req, res) => {
    try {
        const status = STATUSES.includes(req.query.status) ? req.query.status : 'pending';
        let requestedBy = null;
        if (req.user?.role !== 'admin') {
            const requester = await getRequester(req.user);
            requestedBy = { role: requester.role, id: requester.id };
        }
        res.json(await SuspenseRequestModel.list({ status, limit: req.query.limit, requestedBy }));
    } catch (error) {
        console.error('Error listing suspense requests:', error);
        res.status(500).json({ error: 'Unable to load suspense requests.' });
    }
};

// PUT /api/staff/suspense-requests/:id/review   { action: 'approve' | 'reject', note }
export const reviewSuspenseRequest = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const action = String(req.body.action || '').toLowerCase();
        const note = String(req.body.note || '').trim();
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid request.' });
        if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Action must be approve or reject.' });
        if (action === 'reject' && !note) return res.status(400).json({ error: 'Reason is required to reject a request.' });
        const request = await SuspenseRequestModel.review(id, { approve: action === 'approve', note, admin: await getRequester(req.user) });
        if (!request) return res.status(409).json({ error: 'This request has already been reviewed.' });
        const moved = request.moved_ids.length;
        const skipped = request.skipped_ids.length;
        res.json({
            message: action === 'approve'
                ? `Approved: ${moved} bill(s) moved to Suspense.${skipped ? ` ${skipped} skipped because they are no longer pending delivery.` : ''}`
                : 'Request rejected. The bills stay in Pending Deliveries.',
            request,
        });
    } catch (error) {
        console.error('Error reviewing suspense request:', error);
        res.status(500).json({ error: 'Unable to update the request.' });
    }
};
