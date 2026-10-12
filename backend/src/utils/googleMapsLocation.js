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

const isLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/**
 * Reads coordinates out of a full Google Maps URL (or any text containing one).
 * Prefers the exact place pin (!3d…!4d…) over q=/ll= and the map view centre (@lat,lng).
 */
export function extractCoordinates(value) {
    let text = String(value || '');
    try { text = decodeURIComponent(text); } catch { /* keep raw text */ }
    const patterns = [
        /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
        /[?&](?:q|query|ll|destination|daddr|center)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/,
        /\/maps\/(?:place|search|dir)\/(?:[^/]*\/)?(-?\d+(?:\.\d+)?)\s*,\s*\+?(-?\d+(?:\.\d+)?)/,
        /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const lat = Number(match[1]);
            const lng = Number(match[2]);
            if (isLatLng(lat, lng)) return { latitude: lat, longitude: lng };
        }
    }
    return null;
}

/**
 * Finds the coordinates behind a Google Maps link. Full links are parsed directly;
 * short links (maps.app.goo.gl) are followed to the full URL. Returns null if the
 * link holds no usable location.
 */
export async function resolveGoogleMapsCoordinates(link, { timeoutMs = 6000 } = {}) {
    const direct = extractCoordinates(link);
    if (direct) return direct;
    let url = String(link || '').trim();
    if (!/^https?:\/\//i.test(url)) return null;
    const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36' };

    for (let hop = 0; hop < 6; hop += 1) {
        const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
        const next = response.headers.get('location');
        if (next) {
            url = new URL(next, url).toString();
            const found = extractCoordinates(url);
            if (found) return found;
            continue;
        }
        if (!response.ok) return null;
        // Some place links land on a page whose URL has no coordinates; the page itself does.
        const body = await response.text();
        const fromBody = extractCoordinates(body.match(/https:\/\/www\.google\.com\/maps\/[^"'\\\s]*/)?.[0]);
        if (fromBody) return fromBody;
        const state = body.match(/APP_INITIALIZATION_STATE=\[\[\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/);
        if (state && isLatLng(Number(state[3]), Number(state[2]))) {
            return { latitude: Number(state[3]), longitude: Number(state[2]) };
        }
        return null;
    }
    return null;
}
