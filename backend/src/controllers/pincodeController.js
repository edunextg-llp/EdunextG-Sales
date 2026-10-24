// Pin code -> district / state lookup, done server-side so the browser never
// depends on a third-party API's CORS, TLS or uptime. Results are cached in memory.

const cache = new Map();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 6000;

const fetchJson = async (url) => {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: 'application/json', 'User-Agent': 'EdunextG-Sales/1.0' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
};

// Source 1: India Post data (district + state + post office names).
const fromPostalPincode = async (pin) => {
    const data = await fetchJson(`https://api.postalpincode.in/pincode/${pin}`);
    const result = Array.isArray(data) ? data[0] : null;
    const offices = result?.Status === 'Success' ? result.PostOffice || [] : [];
    const first = offices[0];
    if (!first) return null;
    return {
        district: first.District || '',
        state: first.State || '',
        city: first.Block && first.Block !== 'NA' ? first.Block : first.District || first.Name || '',
        area: first.Name || '',
        postOffices: offices.map((o) => o.Name).filter(Boolean),
    };
};

// Source 2 (fallback): Zippopotam (state + place names, no district).
const fromZippopotam = async (pin) => {
    const data = await fetchJson(`https://api.zippopotam.us/in/${pin}`);
    const place = data?.places?.[0];
    if (!place) return null;
    return {
        district: '',
        state: place.state || '',
        city: place['place name'] || '',
        area: place['place name'] || '',
        postOffices: (data.places || []).map((p) => p['place name']).filter(Boolean),
    };
};

export const lookupPincode = async (req, res) => {
    const pin = String(req.params.pin || '').replace(/\D/g, '');
    if (!/^[1-9]\d{5}$/.test(pin)) {
        return res.status(400).json({ error: 'Enter a valid 6-digit pin code.' });
    }

    const cached = cache.get(pin);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return res.json(cached.data);

    for (const source of [fromPostalPincode, fromZippopotam]) {
        try {
            const data = await source(pin);
            if (data && (data.state || data.district)) {
                cache.set(pin, { at: Date.now(), data });
                return res.json(data);
            }
        } catch (err) {
            console.warn(`Pin code lookup via ${source.name} failed for ${pin}:`, err.message);
        }
    }

    return res.status(404).json({ error: 'Pin code not found. Please fill district and state manually.' });
};
