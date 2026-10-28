import multer from 'multer';
import db from '../config/db.js';
import DeliveryCollectionModel from '../models/deliveryCollectionModel.js';
import StaffPortalModel from '../models/staffPortalModel.js';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '../utils/cloudinary.js';
import { actorNameSql, actorParams } from '../utils/requestContext.js';
import {
    compressPhoto,
    MAX_PHOTO_BYTES,
    MOBILE_MAX_PHOTO_BYTES,
    MOBILE_TARGET_PHOTO_BYTES,
    TARGET_PHOTO_BYTES,
} from '../utils/compressPhoto.js';

export const PHOTO_TOO_LARGE = 'Photo must not be more than 1 MB.';
export const MOBILE_PHOTO_TOO_LARGE = 'Photo must not be more than 3 MB.';

function receiver(maxBytes, targetBytes, tooLarge) {
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } }).single('file');
    return (req, res, next) => upload(req, res, (error) => {
        if (error) {
            return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
                .json({ error: error.code === 'LIMIT_FILE_SIZE' ? tooLarge : 'Unable to read photo upload.' });
        }
        if (req.file && req.file.size > maxBytes) return res.status(413).json({ error: tooLarge });
        req.photoLimits = { maxBytes, targetBytes, tooLarge };
        return next();
    });
}

/** Delivery and staff mobile apps: up to 3 MB, stored under 50 KB. */
export const receiveCreditPhoto = receiver(MOBILE_MAX_PHOTO_BYTES, MOBILE_TARGET_PHOTO_BYTES, MOBILE_PHOTO_TOO_LARGE);
/** Web portal: up to 1 MB, stored at about 70 KB. */
export const receiveWebCreditPhoto = receiver(MAX_PHOTO_BYTES, TARGET_PHOTO_BYTES, PHOTO_TOO_LARGE);

// Check invoice access before receiving bytes or contacting Cloudinary.
export async function authorizeCreditPhoto(req, res, next) {
    try {
        const saleId = Number(req.params.saleId);
        if (!Number.isSafeInteger(saleId) || saleId <= 0) return res.status(400).json({ error: 'Invalid invoice.' });
        let allowed = false;
        if (req.deliveryBoyId) {
            const bills = await DeliveryCollectionModel.getOutstandingSalesForDeliveryBoy(req.deliveryBoyId);
            const pending = await DeliveryCollectionModel.getPendingCollectionsForDeliveryBoy(req.deliveryBoyId);
            allowed = [...bills, ...pending].some((bill) => Number(bill.sale_id) === saleId);
        } else if (req.staffId) {
            const bills = await StaffPortalModel.getOutBills(req.staffId);
            const dues = await DeliveryCollectionModel.getOutstandingSalesForDeliveryBoy(req.staffId, db, true);
            const pending = await DeliveryCollectionModel.getPendingCollectionsForDeliveryBoy(req.staffId, db, true);
            allowed = [...bills, ...dues, ...pending].some((bill) => Number(bill.sale_id) === saleId);
        } else {
            allowed = req.user?.role === 'admin' || req.user?.permissions?.includes('update_payment') || req.user?.permissions?.includes('out_bill');
        }
        if (!allowed) return res.status(403).json({ error: 'You cannot update photos for this invoice.' });
        const uploadedBy = actorNameSql('ss', 'credit_photo_by');
        const [rows] = await db.execute(
            `SELECT ss.id, ss.invoice_number, ss.packaging_status, ss.credit_photo_url,
                    DATE_FORMAT(ss.credit_photo_at, '%Y-%m-%d %H:%i:%s') AS credit_photo_at,
                    ${uploadedBy.columns}
             FROM staff_sales ss
             ${uploadedBy.joins}
             WHERE ss.id = ?`,
            [saleId]
        );
        if (!rows.length) return res.status(404).json({ error: 'Invoice not found.' });
        if (req.method !== 'GET' && rows[0].packaging_status !== 'delivered') {
            return res.status(400).json({ error: 'Credit photos can be added only after delivery.' });
        }
        req.creditPhotoSale = rows[0];
        next();
    } catch (error) {
        console.error('Credit photo authorization failed:', error);
        res.status(500).json({ error: 'Unable to check invoice access.' });
    }
}

export const getCreditPhoto = (req, res) => {
    const sale = req.creditPhotoSale;
    return res.json({
        url: sale.credit_photo_url || null,
        uploadedBy: sale.credit_photo_url ? sale.credit_photo_by_name || null : null,
        uploadedByRole: sale.credit_photo_url ? sale.credit_photo_by_role || null : null,
        uploadedAt: sale.credit_photo_url ? sale.credit_photo_at || null : null,
    });
};

export function isCreditPhoto(buffer) {
    return Buffer.isBuffer(buffer) && (
        (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
        || (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        || (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    );
}

export async function saveCreditPhoto(req, res) {
    try {
        if (!isCreditPhoto(req.file?.buffer)) return res.status(400).json({ error: 'Select a JPG, PNG, or WebP photo.' });
        if (!isCloudinaryConfigured()) return res.status(503).json({ error: 'Photo storage is not configured. Please contact your administrator.' });
        const limits = req.photoLimits || { maxBytes: MAX_PHOTO_BYTES, targetBytes: TARGET_PHOTO_BYTES, tooLarge: PHOTO_TOO_LARGE };
        // Shrunk to the route's target (web ~70 KB, mobile under 50 KB) before it is stored.
        const photo = await compressPhoto(req.file.buffer, { targetBytes: limits.targetBytes });
        if (photo.bytes > limits.maxBytes) return res.status(413).json({ error: limits.tooLarge });
        const result = await uploadBufferToCloudinary(photo.buffer, {
            folder: 'credit-photos', resourceType: 'image', uploadOptions: { format: 'jpg' },
        });
        await db.execute(
            `UPDATE staff_sales
             SET credit_photo_url = ?, credit_photo_by_type = ?, credit_photo_by_id = ?, credit_photo_at = NOW()
             WHERE id = ?`,
            [result.secure_url, ...actorParams(), req.creditPhotoSale.id]
        );
        const uploadedBy = actorNameSql('ss', 'credit_photo_by');
        const [rows] = await db.execute(
            `SELECT DATE_FORMAT(ss.credit_photo_at, '%Y-%m-%d %H:%i:%s') AS credit_photo_at, ${uploadedBy.columns}
             FROM staff_sales ss ${uploadedBy.joins} WHERE ss.id = ?`,
            [req.creditPhotoSale.id]
        );
        res.json({
            url: result.secure_url,
            uploadedBy: rows[0]?.credit_photo_by_name || null,
            uploadedByRole: rows[0]?.credit_photo_by_role || null,
            uploadedAt: rows[0]?.credit_photo_at || null,
        });
    } catch (error) {
        console.error('Credit photo upload failed:', error);
        res.status(500).json({ error: 'Unable to save the photo. Please try again.' });
    }
}
