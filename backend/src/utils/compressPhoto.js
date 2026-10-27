import sharp from 'sharp';

/** Largest photo the server accepts from the web portal. */
export const MAX_PHOTO_BYTES = 1024 * 1024;
/** Web photos larger than this are re-encoded to roughly this size. */
export const TARGET_PHOTO_BYTES = 70 * 1024;
/** Mobile apps may send up to 3 MB; their photos are stored under 50 KB. */
export const MOBILE_MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MOBILE_TARGET_PHOTO_BYTES = 50 * 1024;

// Tried in order until the JPEG fits the target; each step trades a little sharpness for size.
const STEPS = [
    { side: 1600, quality: 75 },
    { side: 1280, quality: 70 },
    { side: 1280, quality: 60 },
    { side: 1024, quality: 60 },
    { side: 1024, quality: 50 },
    { side: 900, quality: 45 },
    { side: 800, quality: 40 },
    { side: 700, quality: 35 },
    { side: 600, quality: 30 },
    { side: 500, quality: 30 },
    { side: 400, quality: 25 },
];

/**
 * Shrinks a photo to under `targetBytes` (70 KB by default) as a JPEG (auto-rotated, max side 1600px).
 * Photos already under the target are returned unchanged.
 * Resolves to { buffer, compressed, originalBytes, bytes }.
 */
export async function compressPhoto(buffer, { targetBytes = TARGET_PHOTO_BYTES } = {}) {
    const originalBytes = buffer.length;
    if (originalBytes < targetBytes) {
        return { buffer, compressed: false, originalBytes, bytes: originalBytes };
    }

    let best = null;
    for (const step of STEPS) {
        const output = await sharp(buffer, { limitInputPixels: 50_000_000 })
            .rotate()
            .resize({ width: step.side, height: step.side, fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: step.quality, mozjpeg: true })
            .toBuffer();
        if (!best || output.length < best.length) best = output;
        if (output.length < targetBytes) break;
    }

    // Never store something bigger than what was uploaded.
    const result = best.length < originalBytes ? best : buffer;
    return { buffer: result, compressed: result !== buffer, originalBytes, bytes: result.length };
}
