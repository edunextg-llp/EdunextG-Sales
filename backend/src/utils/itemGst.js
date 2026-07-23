const DEFAULT_GST_PERCENT = 5;

export function splitGstPercent(gstPercent) {
    const gst = Number(gstPercent);
    if (!Number.isFinite(gst) || gst < 0) {
        return { error: 'GST must be a valid percentage.' };
    }

    const half = Math.round((gst / 2) * 100) / 100;

    return {
        gstPercent: gst,
        cgstPercent: half,
        sgstPercent: half,
    };
}

export function resolveItemGst(gstPercent = DEFAULT_GST_PERCENT) {
    return splitGstPercent(gstPercent);
}

export { DEFAULT_GST_PERCENT };
