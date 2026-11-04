import TakenBillRequestModel from '../models/takenBillRequestModel.js';
import { resolveCurrentActor } from '../utils/requestContext.js';

const ERRORS = {
    BILL_NOT_FOUND: [404, 'This bill is not available to you.'],
    NO_OPEN_CREDIT: [409, 'This bill has no credit left to collect.'],
    ALREADY_TAKEN: [409, 'This bill has already been taken.'],
    PAYMENT_WAITING: [409, 'The payment for this bill is already waiting in D.B. Collection.'],
    ALREADY_REQUESTED: [409, 'A request for this bill is already waiting for approval.'],
    NOT_COLLECTED: [409, 'Collect a payment on this bill before returning it.'],
    REQUEST_NOT_FOUND: [404, 'Request not found.'],
    ALREADY_REVIEWED: [409, 'This request has already been reviewed.'],
    BILL_NOT_HELD: [409, 'This staff member no longer holds this bill.'],
};

function sendError(res, error, fallback) {
    const known = ERRORS[error.message];
    if (known) return res.status(known[0]).json({ error: known[1], code: error.message });
    console.error(`${fallback}:`, error);
    return res.status(500).json({ error: fallback });
}

function readId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

/* ---------- Staff app ---------- */

export const getCreditBills = async (req, res) => {
    try {
        return res.status(200).json(await TakenBillRequestModel.getCreditBills(req.staffId));
    } catch (error) {
        return sendError(res, error, 'Unable to fetch credit bills');
    }
};

export const getOutBillStatus = async (req, res) => {
    try {
        return res.status(200).json(await TakenBillRequestModel.getStaffStatus(req.staffId));
    } catch (error) {
        return sendError(res, error, 'Unable to fetch Out Bill requests');
    }
};

export const requestTake = async (req, res) => {
    const saleId = readId(req.params.saleId);
    if (!saleId) return res.status(400).json({ error: 'Invalid invoice' });
    const remarks = String(req.body?.remarks ?? '').trim();
    if (!remarks) return res.status(400).json({ error: 'Enter remarks to take this bill' });
    if (remarks.length > 500) return res.status(400).json({ error: 'Remarks must be 500 characters or less' });
    try {
        const request = await TakenBillRequestModel.requestTake(req.staffId, saleId, remarks);
        return res.status(201).json({ message: 'Request sent to the office for approval', request });
    } catch (error) {
        return sendError(res, error, 'Unable to request this bill');
    }
};

export const requestReturn = async (req, res) => {
    const saleId = readId(req.params.saleId);
    if (!saleId) return res.status(400).json({ error: 'Invalid invoice' });
    try {
        const request = await TakenBillRequestModel.requestReturn(req.staffId, saleId);
        return res.status(201).json({ message: 'Return request sent to the office for approval', request });
    } catch (error) {
        return sendError(res, error, 'Unable to request the return');
    }
};

/* ---------- Web Out Bill page ---------- */

export const listPending = async (req, res) => {
    try {
        return res.status(200).json(await TakenBillRequestModel.listPending());
    } catch (error) {
        return sendError(res, error, 'Unable to fetch Out Bill requests');
    }
};

export const review = async (req, res) => {
    const requestId = readId(req.params.id);
    if (!requestId) return res.status(400).json({ error: 'Invalid request' });

    const action = String(req.body?.action || '').toLowerCase();
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Choose approve or reject' });
    }
    const note = String(req.body?.note || '').trim();
    if (action === 'reject' && !note) return res.status(400).json({ error: 'Enter a reason for rejecting' });
    if (note.length > 500) return res.status(400).json({ error: 'Reason must be 500 characters or less' });

    try {
        const actor = await resolveCurrentActor();
        const request = await TakenBillRequestModel.review(requestId, {
            approve: action === 'approve',
            note,
            reviewedBy: actor?.name ?? null,
        });
        return res.status(200).json({ message: action === 'approve' ? 'Request approved' : 'Request rejected', request });
    } catch (error) {
        return sendError(res, error, 'Unable to review this request');
    }
};
