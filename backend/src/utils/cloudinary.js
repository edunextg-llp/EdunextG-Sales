import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Resolve against this module, not the directory used to launch the server.
// Existing deployment environment variables keep precedence over the local file.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

function isCloudinaryConfigured() {
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
}

function ensureCloudinaryConfigured() {
    if (!isCloudinaryConfigured()) {
        throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
    }

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
}

export function uploadBufferToCloudinary(buffer, options = {}) {
    ensureCloudinaryConfigured();

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: options.folder || 'staff-documents',
                resource_type: options.resourceType || 'auto',
                ...options.uploadOptions,
            },
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(result);
            }
        );

        uploadStream.end(buffer);
    });
}

function parseDeliveryUrl(deliveryUrl) {
    const match = String(deliveryUrl || '').match(/res\.cloudinary\.com\/[^/]+\/(image|raw|video)\/(upload|private|authenticated)\/(?:v\d+\/)?(.+)$/);
    if (!match) return null;
    const [, resourceType, type, path] = match;
    const decoded = decodeURIComponent(path.split('?')[0]);
    let publicId = decoded;
    let format = '';
    if (resourceType !== 'raw') {
        const dot = decoded.lastIndexOf('.');
        if (dot > decoded.lastIndexOf('/')) { publicId = decoded.slice(0, dot); format = decoded.slice(dot + 1); }
    }
    return { resourceType, type, publicId, format };
}

// Links the browser uses to get a stored file straight from Cloudinary.
// - viewUrl: opens in the browser (PDF viewer / image).
// - downloadUrl: signed Cloudinary download link that saves the file
//   (works even when the account blocks public PDF delivery).
export function cloudinaryFileLinks(deliveryUrl) {
    const parsed = parseDeliveryUrl(deliveryUrl);
    if (!parsed) return { viewUrl: deliveryUrl, downloadUrl: deliveryUrl };
    ensureCloudinaryConfigured();
    const { resourceType, type, publicId, format } = parsed;
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
    const signed = (attachment) => cloudinary.utils.private_download_url(publicId, format, { resource_type: resourceType, type, attachment, expires_at: expiresAt });
    // Old PDFs stored as "image" can be blocked on the public link, so view them via the signed link.
    const blockedPdf = resourceType === 'image' && format.toLowerCase() === 'pdf';
    return { viewUrl: blockedPdf ? signed(false) : deliveryUrl, downloadUrl: signed(true) };
}

export { isCloudinaryConfigured };
