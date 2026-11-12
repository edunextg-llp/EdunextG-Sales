import db from '../config/db.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import DeliveryCollectionModel from '../models/deliveryCollectionModel.js';
import { parseMobilePayment, sendMobilePaymentError } from './deliveryBoyController.js';

export async function list(req, res) {
    try {
        const [items] = await db.execute(
            `SELECT ss.id, ss.invoice_number, ss.packaging_status, ss.cancellation_reason,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    ss.price, ss.vehicle_no, ss.credit_photo_url,
                    sc.outlet_name, sc.location_name, sc.contact_number, sc.id AS outlet_id,
                    COALESCE(NULLIF(TRIM(sc.google_location), ''), NULLIF(TRIM(sc.delivery_google_location), '')) AS google_location,
                    COALESCE(c.name, 'Company not assigned') AS company_name
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN staff seller ON seller.id = ss.staff_id
             LEFT JOIN companies c ON c.id = seller.company_id
             WHERE ss.delivery_staff_id = ?
             ORDER BY (ss.packaging_status = 'out_for_delivery') DESC, ss.delivery_date DESC, ss.id DESC
             LIMIT 1000`, [req.staffId]);
        const dues = await DeliveryCollectionModel.getOutstandingSalesForDeliveryBoy(req.staffId, db, true);
        const pending = await DeliveryCollectionModel.getPendingCollectionsForDeliveryBoy(req.staffId, db, true);
        return res.json({ items, dues: dues.filter((row) => row.collection_source === 'delivery'), pending: pending.filter((row) => row.collection_source === 'delivery') });
    } catch (error) {
        console.error('Staff deliveries:', error);
        return res.status(500).json({ error: 'Unable to load deliveries.' });
    }
}

export async function updateStatus(req, res) {
    try {
        const saleId = Number(req.params.saleId);
        const status = req.body.status;
        const reason = String(req.body.cancellationReason || '').trim();
        if (!Number.isSafeInteger(saleId) || saleId <= 0 || !['delivered', 'cancelled', 'returned'].includes(status)) return res.status(400).json({ error: 'Select Delivered, Cancel, or Return.' });
        if (status === 'cancelled' && !reason) return res.status(400).json({ error: 'Enter a cancellation reason.' });
        const item = await DeliveryBoyModel.updateAssignedSaleStatus(req.staffId, saleId, status, reason || null, true);
        if (!item) return res.status(404).json({ error: 'Assigned delivery not found.' });
        if (item.locked) return res.status(409).json({ error: 'This delivery has already been updated. Refresh the list.' });
        return res.json({ item });
    } catch (error) {
        if (error.message === 'OUTLET_LOCATION_REQUIRED') return res.status(400).json({ error: 'Update the outlet location before marking this invoice Delivered.' });
        console.error('Staff delivery status:', error);
        return res.status(500).json({ error: 'Unable to update delivery.' });
    }
}

export async function updateLocation(req, res) {
    const saleId = Number(req.params.saleId);
    const { latitude, longitude } = req.body;
    if (!Number.isSafeInteger(saleId) || saleId <= 0 || typeof latitude !== 'number' || typeof longitude !== 'number'
        || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return res.status(400).json({ error: 'A valid GPS location is required.' });
    }
    try {
        const googleLocation = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const result = await DeliveryBoyModel.updateAssignedSaleLocation(req.staffId, saleId, googleLocation, true);
        if (!result) return res.status(409).json({ error: 'Location is already saved or this delivery is no longer assigned to you. Refresh the list.' });
        return res.json(result);
    } catch (error) {
        console.error('Staff outlet location:', error);
        return res.status(500).json({ error: 'Unable to save the outlet location.' });
    }
}

export async function collect(req, res) {
    try {
        const saleId = Number(req.params.saleId);
        if (!Number.isSafeInteger(saleId) || saleId <= 0) return res.status(400).json({ error: 'Invalid invoice.' });
        const parsed = parseMobilePayment(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const result = await DeliveryCollectionModel.collectOutstandingPayment(req.staffId, saleId, parsed.payment, true);
        if (!result) return res.status(409).json({ error: 'Payment is unavailable, already submitted, or outside the 24-hour delivery window.' });
        return res.json({ message: 'Payment submitted to D.B. Collection.', ...result });
    } catch (error) { return sendMobilePaymentError(res, error, 'Staff delivery payment:'); }
}

const money = (value) => {
    if (value == null || value === '') return 0;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) return NaN;
    return Math.round(amount * 100) / 100;
};

// Body: { cash, upi, upiReference, cheque, chequeNo, creditDays }. Any unpaid rest goes on credit.
function parseSplitPayment(body = {}) {
    const cash = money(body.cash), upi = money(body.upi), cheque = money(body.cheque);
    if ([cash, upi, cheque].some(Number.isNaN)) return { error: 'Enter amounts with at most two decimal places.' };
    const chequeNo = String(body.chequeNo || '').trim();
    if (cheque > 0 && !chequeNo) return { error: 'Enter the cheque number.' };
    let creditDays = null;
    if (body.creditDays != null && body.creditDays !== '') {
        creditDays = Number(body.creditDays);
        if (!Number.isInteger(creditDays) || creditDays < 1 || creditDays > 14) return { error: 'Credit days must be between 1 and 14' };
    }
    const parts = [];
    if (cash > 0) parts.push({ paymentMode: 'cash', amount: cash });
    if (upi > 0) parts.push({ paymentMode: 'upi', amount: upi, referenceNo: String(body.upiReference || '').trim() || null });
    if (cheque > 0) parts.push({ paymentMode: 'cheque', amount: cheque, referenceNo: chequeNo });
    return { parts, creditDays };
}

function splitHandler(companyStaff, replace = false) {
    return async (req, res) => {
        try {
            const saleId = Number(req.params.saleId);
            if (!Number.isSafeInteger(saleId) || saleId <= 0) return res.status(400).json({ error: 'Invalid invoice.' });
            const parsed = parseSplitPayment(req.body || {});
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            const collectorId = companyStaff ? req.staffId : req.deliveryBoyId;
            const result = await DeliveryCollectionModel.collectSplitPayment(collectorId, saleId, parsed.parts, parsed.creditDays, companyStaff, replace);
            if (!result) {
                return res.status(409).json({ error: replace
                    ? 'This payment is unavailable or already settled. Refresh the list.'
                    : 'Payment is unavailable, already submitted, or outside the 24-hour delivery window.' });
            }
            return res.json({ message: replace ? 'Payment updated for settlement.' : 'Payment submitted to D.B. Collection.', ...result });
        } catch (error) { return sendMobilePaymentError(res, error, 'Split payment:'); }
    };
}

/** Company staff doing deliveries (staff app). */
export const collectSplit = splitHandler(true);
/** Delivery boys (Bawarchee delivery app). */
export const collectSplitForDeliveryBoy = splitHandler(false);
/** Edit a submitted (not final-submitted, not settled) payment as one split. */
export const editSplit = splitHandler(true, true);
export const editSplitForDeliveryBoy = splitHandler(false, true);

export async function editCollection(req, res) {
    try {
        const id = Number(req.params.collectionId);
        if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid payment.' });
        const parsed = parseMobilePayment(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const result = await DeliveryCollectionModel.updatePendingCollection(req.staffId, id, parsed.payment, true);
        if (!result) return res.status(409).json({ error: 'This payment is unavailable or already settled.' });
        return res.json({ message: 'Payment updated for settlement.', ...result });
    } catch (error) { return sendMobilePaymentError(res, error, 'Staff delivery payment edit:'); }
}
