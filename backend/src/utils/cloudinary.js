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

export { isCloudinaryConfigured };
