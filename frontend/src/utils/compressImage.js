/** Largest photo or PDF that may be uploaded (same rule as the server). */
export const MAX_UPLOAD_BYTES = 1024 * 1024;
/** Photos larger than this are shrunk to roughly this size before upload. */
export const TARGET_PHOTO_BYTES = 70 * 1024;
export const FILE_TOO_LARGE = "File must not be more than 1 MB.";

const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// Tried in order until the JPEG fits the target (mirrors backend/src/utils/compressPhoto.js).
const STEPS = [
  { side: 1600, quality: 0.75 },
  { side: 1280, quality: 0.7 },
  { side: 1280, quality: 0.6 },
  { side: 1024, quality: 0.6 },
  { side: 1024, quality: 0.5 },
  { side: 900, quality: 0.45 },
  { side: 800, quality: 0.4 },
  { side: 700, quality: 0.35 },
  { side: 600, quality: 0.3 },
];

export const formatBytes = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This photo could not be read. Choose a JPG, PNG, or WebP photo.")); };
    image.src = url;
  });
}

function toJpeg(image, side, quality) {
  const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff"; // transparent PNG areas become white, not black
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Returns the file to upload: images above 70 KB become a JPEG of about 70 KB,
 * smaller images and PDFs are kept. Throws when the result is more than 1 MB.
 */
export async function prepareUpload(file, { allowPdf = false } = {}) {
  if (!file) throw new Error("Please choose a file.");
  const isPdf = file.type === "application/pdf";
  if (!IMAGE_TYPES.includes(file.type) && !(allowPdf && isPdf)) {
    throw new Error(allowPdf ? "Choose a JPG, PNG, WebP, or PDF file." : "Choose a JPG, PNG, or WebP photo.");
  }
  if (isPdf || file.size <= TARGET_PHOTO_BYTES) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(FILE_TOO_LARGE);
    return file;
  }

  const image = await loadImage(file);
  let best = null;
  for (const step of STEPS) {
    // eslint-disable-next-line no-await-in-loop
    const blob = await toJpeg(image, step.side, step.quality);
    if (blob && (!best || blob.size < best.size)) best = blob;
    if (blob && blob.size <= TARGET_PHOTO_BYTES) break;
  }

  const result = best && best.size < file.size
    ? new File([best], `${(file.name || "photo").replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" })
    : file;
  if (result.size > MAX_UPLOAD_BYTES) throw new Error(FILE_TOO_LARGE);
  return result;
}
