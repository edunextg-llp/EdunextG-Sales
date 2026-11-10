import db from '../config/db.js';
import MaterialReportModel from '../models/materialReportModel.js';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '../utils/cloudinary.js';
import { compressPhoto, MOBILE_MAX_PHOTO_BYTES, MOBILE_TARGET_PHOTO_BYTES } from '../utils/compressPhoto.js';
import { isCreditPhoto, MOBILE_PHOTO_TOO_LARGE } from './creditPhotoController.js';
import { validateNumeric } from '../utils/validation.js';

const ERRORS = {
    SALE_NOT_FOUND: [404, 'This delivery is not assigned to you.'],
    NOT_DELIVERED: [400, 'Mark the order Delivered before reporting extra or less material.'],
    REPORT_WINDOW_CLOSED: [400, 'Material can be reported only within 24 hours of delivery.'],
    ALREADY_REPORTED: [409, 'This has already been reported for this invoice.'],
    ALREADY_REVIEWED: [409, 'This report was already reviewed.'],
};

function sendError(res, error, fallback) {
    if (error.message === 'EXCEEDS_BALANCE') {
        return res.status(400).json({ error: `Amount cannot be more than the unpaid balance of Rs. ${Number(error.remaining).toFixed(2)}.` });
    }
    const known = ERRORS[error.message];
    if (known) return res.status(known[0]).json({ error: known[1] });
    console.error(fallback, error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

const cleanText = (value, max = 1000) => String(value || '').trim().slice(0, max);
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function parseSaleId(req, res) {
    const saleId = Number(req.params.saleId);
    if (!Number.isSafeInteger(saleId) || saleId <= 0) {
        res.status(400).json({ error: 'Invalid invoice.' });
        return null;
    }
    return saleId;
}

// ---------- Delivery app ----------

export async function getMobileSaleReports(req, res) {
    const saleId = parseSaleId(req, res);
    if (!saleId) return undefined;
    try {
        return res.json({ reports: await MaterialReportModel.getForSale(saleId, req.deliveryBoyId) });
    } catch (error) { return sendError(res, error, 'Material reports load failed:'); }
}

export async function getMobileStars(req, res) {
    try {
        return res.json({ stars: await MaterialReportModel.getStars(req.deliveryBoyId) });
    } catch (error) { return sendError(res, error, 'Stars load failed:'); }
}

// JSON or multipart: productName + productQty, optional remarks and optional photo (file).
export async function submitMobileExtra(req, res) {
    const saleId = parseSaleId(req, res);
    if (!saleId) return undefined;
    const productName = cleanText(req.body?.productName, 255);
    if (productName.length < 2) return res.status(400).json({ error: 'Enter the extra product name.' });
    const qtyResult = validateNumeric(req.body?.productQty, 'Quantity');
    const productQty = qtyResult.value;
    if (!qtyResult.valid || !Number.isFinite(productQty) || productQty <= 0 || productQty > 100000
        || Math.abs(productQty * 100 - Math.round(productQty * 100)) > 0.000001) {
        return res.status(400).json({ error: 'Enter a quantity greater than 0 (at most two decimal places).' });
    }
    try {
        // Check access first so nothing is uploaded for a sale the delivery boy can't report.
        await MaterialReportModel.getReportableSale(db, req.deliveryBoyId, saleId);
        let photoUrl = null;
        if (req.file?.buffer) {
            if (!isCreditPhoto(req.file.buffer)) return res.status(400).json({ error: 'The photo must be JPG, PNG, or WebP.' });
            if (!isCloudinaryConfigured()) return res.status(503).json({ error: 'Photo storage is not configured. Please contact your administrator.' });
            const photo = await compressPhoto(req.file.buffer, { targetBytes: MOBILE_TARGET_PHOTO_BYTES });
            if (photo.bytes > MOBILE_MAX_PHOTO_BYTES) return res.status(413).json({ error: MOBILE_PHOTO_TOO_LARGE });
            const upload = await uploadBufferToCloudinary(photo.buffer, {
                folder: 'material-reports', resourceType: 'image', uploadOptions: { format: 'jpg' },
            });
            photoUrl = upload.secure_url;
        }
        const id = await MaterialReportModel.createExtra(req.deliveryBoyId, saleId, {
            productName,
            productQty,
            photoUrl,
            remarks: cleanText(req.body?.remarks),
        });
        const stars = await MaterialReportModel.getStars(req.deliveryBoyId);
        return res.status(201).json({ message: 'Extra product reported. You earned 1 star! It has gone for review.', id, stars });
    } catch (error) { return sendError(res, error, 'Extra material report failed:'); }
}

export async function submitMobileLess(req, res) {
    const saleId = parseSaleId(req, res);
    if (!saleId) return undefined;
    const amountResult = validateNumeric(req.body?.amount, 'Amount');
    const amount = amountResult.value;
    if (!amountResult.valid || !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
        return res.status(400).json({ error: 'Enter a positive amount with at most two decimal places.' });
    }
    try {
        const result = await MaterialReportModel.createLess(req.deliveryBoyId, saleId, {
            amount,
            remarks: cleanText(req.body?.remarks),
        });
        return res.status(201).json({
            message: `Rs. ${amount.toFixed(2)} taken off the bill and sent for review. Collect Rs. ${result.newBalance.toFixed(2)}.`,
            ...result,
        });
    } catch (error) { return sendError(res, error, 'Less material report failed:'); }
}

// ---------- Web ----------

const isAdmin = (req) => req.user?.role === 'admin';
const canReview = (req) => isAdmin(req) || req.user?.permissions?.includes('material_report_review');
const packerId = (req) => (req.user?.role === 'packaging_staff' ? Number(req.user.deliveryBoyId || req.user.id) : null);

export async function listWebReports(req, res) {
    try {
        const type = ['extra', 'less'].includes(req.query.type) ? req.query.type : '';
        const status = ['pending', 'approved', 'rejected', 'not_required', 'reason_pending'].includes(req.query.status) ? req.query.status : '';
        const fromDate = isIsoDate(String(req.query.fromDate || '')) ? req.query.fromDate : '';
        const toDate = isIsoDate(String(req.query.toDate || '')) ? req.query.toDate : '';
        const search = cleanText(req.query.search, 100);
        let scope;
        if (isAdmin(req)) scope = 'all';
        else if (canReview(req)) scope = 'review';
        else if (packerId(req)) scope = 'packer';
        else return res.status(403).json({ error: 'You do not have access to material reports.' });

        const reports = await MaterialReportModel.list({ scope, packerId: packerId(req), type, status, fromDate, toDate, search });
        return res.json({
            reports,
            stars: isAdmin(req) ? await MaterialReportModel.getStarSummary() : [],
            access: { isAdmin: isAdmin(req), canReview: canReview(req), packerId: packerId(req) },
        });
    } catch (error) { return sendError(res, error, 'Material reports list failed:'); }
}

export async function saveWebReason(req, res) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid report.' });
    const reason = cleanText(req.body?.reason);
    if (reason.length < 3) return res.status(400).json({ error: 'Enter the reason (at least 3 characters).' });
    const me = packerId(req);
    if (!me) return res.status(403).json({ error: 'Only the packaging staff who packed this invoice can give the reason.' });
    try {
        if (!await MaterialReportModel.saveReason(id, me, reason)) {
            return res.status(404).json({ error: 'Report not found, or this invoice was packed by someone else.' });
        }
        return res.json({ message: 'Reason saved.', report: await MaterialReportModel.getById(id) });
    } catch (error) { return sendError(res, error, 'Material report reason failed:'); }
}

export async function reviewWebReport(req, res) {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid report.' });
    if (!canReview(req)) return res.status(403).json({ error: 'You cannot review material reports.' });
    const action = String(req.body?.action || '');
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Choose approve or reject.' });
    const remarks = cleanText(req.body?.remarks);
    if (action === 'reject' && remarks.length < 3) return res.status(400).json({ error: 'Enter why the report is rejected.' });
    try {
        const done = await MaterialReportModel.review(id, { approve: action === 'approve', remarks });
        if (!done) return res.status(404).json({ error: 'Material report not found.' });
        const report = await MaterialReportModel.getById(id);
        const isExtra = report?.report_type === 'extra';
        let message;
        if (action === 'approve') message = isExtra ? 'Approved. The delivery boy keeps the star.' : 'Approved. The amount stays taken off the bill.';
        else message = isExtra ? 'Rejected. The star was taken back.' : 'Rejected. The amount was added back to the bill.';
        return res.json({ message, report });
    } catch (error) { return sendError(res, error, 'Material report review failed:'); }
}
