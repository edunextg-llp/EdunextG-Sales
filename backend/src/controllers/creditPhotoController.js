import multer from 'multer';
import db from '../config/db.js';
import DeliveryCollectionModel from '../models/deliveryCollectionModel.js';
import StaffPortalModel from '../models/staffPortalModel.js';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '../utils/cloudinary.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } }).single('file');
const webUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } }).single('file');

export function receiveWebCreditPhoto(req, res, next) {
    webUpload(req, res, (error) => {
        if (error || req.file?.size >= 1024 * 1024) {
            return res.status(400).json({ error: !error || error.code === 'LIMIT_FILE_SIZE'
                ? 'Photo must be smaller than 1 MB.' : 'Unable to read photo upload.' });
        }
        return next();
    });
}

export function receiveCreditPhoto(req, res, next) {
    upload(req, res, (error) => error
        ? res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Photo must be smaller than 8 MB.' : 'Unable to read photo upload.' })
        : next());
}

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
        const [rows] = await db.execute('SELECT id, packaging_status, credit_photo_url FROM staff_sales WHERE id = ?', [saleId]);
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

export const getCreditPhoto = (req, res) => res.json({ url: req.creditPhotoSale.credit_photo_url || null });

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
        const result = await uploadBufferToCloudinary(req.file.buffer, {
            folder: 'credit-photos', resourceType: 'image', uploadOptions: { format: 'jpg' },
        });
        await db.execute('UPDATE staff_sales SET credit_photo_url = ? WHERE id = ?', [result.secure_url, req.creditPhotoSale.id]);
        res.json({ url: result.secure_url });
    } catch (error) {
        console.error('Credit photo upload failed:', error);
        res.status(500).json({ error: 'Unable to save the photo. Please try again.' });
    }
}
