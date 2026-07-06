const GOOGLE_MAPS_SHORT_URL_PATTERN = /^https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9_-]+$/;

export function formatGoogleMapsLocation(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';

    if (GOOGLE_MAPS_SHORT_URL_PATTERN.test(trimmed)) {
        return trimmed;
    }

    const mapsAppMatch = trimmed.match(/^(?:https?:\/\/)?maps\.app\.goo\.gl\/([A-Za-z0-9_-]+)\/?$/i);
    if (mapsAppMatch) {
        return `https://maps.app.goo.gl/${mapsAppMatch[1]}`;
    }

    const gooGlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?goo\.gl\/maps\/([A-Za-z0-9_-]+)\/?$/i);
    if (gooGlMatch) {
        return `https://maps.app.goo.gl/${gooGlMatch[1]}`;
    }

    if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
        return `https://maps.app.goo.gl/${trimmed}`;
    }

    return trimmed;
}

export function validateGoogleMapsLocation(value, fieldName = 'Google Location') {
    const formatted = formatGoogleMapsLocation(value);
    if (!formatted) {
        return { valid: false, error: `${fieldName} is required.` };
    }
    if (!GOOGLE_MAPS_SHORT_URL_PATTERN.test(formatted)) {
        return {
            valid: false,
            error: `${fieldName} must be a Google Maps short link (e.g. https://maps.app.goo.gl/T9zxVHUGoiYcBX2s8).`,
        };
    }
    return { valid: true, value: formatted };
}
