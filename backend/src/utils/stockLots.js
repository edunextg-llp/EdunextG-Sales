// MRP lots of one item: the same item (same item code / ERP ID) can be on the shelf at
// several MRPs and batches. Physical Stock keeps that split in raw_data.mrpLines; sales and
// requisitions take pieces lot by lot in this order:
//   1. lots with an expiry date, earliest expiry first
//   2. then lots without an expiry date
//   ties (and undated lots): lowest MRP first, then the one received first, then batch.
// A lot is one MRP + batch + expiry date: stock of the same item that came in on different
// dates stays separate when its expiry (or batch) differs; the same MRP, batch and expiry
// is the same stock on the shelf and adds up into one lot.

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const isoDate = (value) => {
    const text = String(value || '').trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

export const mrpKey = (value) => roundMoney(toNumber(value)).toFixed(2);
export const batchKey = (value) => String(value || '').trim().toLowerCase();
export const lotKey = (lot) => `${mrpKey(lot.mrp)}|${batchKey(lot.batchNumber)}|${isoDate(lot.expiryDate)}`;

export const compareLots = (a, b) => {
    const ea = isoDate(a.expiryDate);
    const eb = isoDate(b.expiryDate);
    if (ea && eb && ea !== eb) return ea < eb ? -1 : 1;
    if (ea && !eb) return -1;
    if (!ea && eb) return 1;
    const byMrp = toNumber(a.mrp) - toNumber(b.mrp);
    if (byMrp) return byMrp;
    const ra = isoDate(a.receivedDate);
    const rb = isoDate(b.receivedDate);
    if (ra !== rb) return !ra ? 1 : !rb ? -1 : ra < rb ? -1 : 1;
    return String(a.batchNumber || '').localeCompare(String(b.batchNumber || ''));
};

export const orderLots = (lots) => [...lots].sort(compareLots);

// A saved count's lines, one per MRP + batch, in selling order.
export function groupLines(mrpLines = []) {
    const map = new Map();
    (Array.isArray(mrpLines) ? mrpLines : []).forEach((line) => {
        const lot = {
            mrp: roundMoney(toNumber(line.mrp)),
            batchNumber: String(line.batchNumber || '').trim(),
            mfgDate: isoDate(line.mfgDate),
            expiryDate: isoDate(line.expiryDate),
            receivedDate: isoDate(line.receivedDate),
            pcs: roundQuantity(Math.max(0, toNumber(line.pcs))),
        };
        const key = lotKey(lot);
        const prev = map.get(key);
        map.set(key, prev
            ? {
                ...prev,
                mfgDate: prev.mfgDate || lot.mfgDate,
                // Merged deliveries keep the earliest received date.
                receivedDate: [prev.receivedDate, lot.receivedDate].filter(Boolean).sort()[0] || '',
                pcs: roundQuantity(prev.pcs + lot.pcs),
            }
            : lot);
    });
    return orderLots([...map.values()]);
}

// Lots that add up to exactly `total` pieces. Old counts (before lots were kept in step with
// sales) can hold more than the stock left: the extra comes off in selling order, as those
// lots were sold first. Pieces not in any lot (no MRP split, or stock put back without one)
// go to a lot at the item's MRP.
export function reconcileLots(mrpLines, total, itemMrp = 0) {
    const target = roundQuantity(Math.max(0, toNumber(total)));
    const lots = groupLines(mrpLines);
    let extra = roundQuantity(lots.reduce((sum, lot) => sum + lot.pcs, 0) - target);
    for (const lot of lots) {
        if (extra <= 0) break;
        const take = Math.min(lot.pcs, extra);
        lot.pcs = roundQuantity(lot.pcs - take);
        extra = roundQuantity(extra - take);
    }
    if (extra < 0) {
        const missing = -extra;
        const home = lots.find((lot) => mrpKey(lot.mrp) === mrpKey(itemMrp) && !lot.batchNumber && !lot.expiryDate)
            || (lots.length === 1 ? lots[0] : null);
        if (home) home.pcs = roundQuantity(home.pcs + missing);
        else lots.push({ mrp: roundMoney(toNumber(itemMrp)), batchNumber: '', mfgDate: '', expiryDate: '', receivedDate: '', pcs: missing });
    }
    return orderLots(lots.filter((lot) => lot.pcs > 0));
}

// Selling prices of a lot: the DMS purchase line at the same MRP, otherwise the item's latest
// prices scaled to this MRP.
export function lotPrices(lot, item = {}) {
    const line = (item.price_lines || []).find((p) => mrpKey(p.mrp) === mrpKey(lot.mrp)
        && (toNumber(p.retail_price) > 0 || toNumber(p.wholesale_price) > 0));
    if (line) {
        return { retail_price: toNumber(line.retail_price), wholesale_price: toNumber(line.wholesale_price) };
    }
    const itemMrp = toNumber(item.mrp);
    const scale = itemMrp > 0 && toNumber(lot.mrp) > 0 ? toNumber(lot.mrp) / itemMrp : 1;
    return {
        retail_price: roundMoney(toNumber(item.retail_price) * scale),
        wholesale_price: roundMoney(toNumber(item.wholesale_price) * scale),
    };
}

// Takes `qty` pieces from `lots` (already in selling order). A preferred lot (MRP + batch)
// goes first, the rest follows the order. Returns [{ lot, qty }] and lowers lot.pcs in place.
export function takeFromLots(lots, qty, preferred = null) {
    let left = roundQuantity(toNumber(qty));
    const taken = [];
    const queue = preferred && toNumber(preferred.mrp) > 0
        ? [
            ...lots.filter((lot) => lotKey(lot) === lotKey(preferred)),
            ...lots.filter((lot) => lotKey(lot) !== lotKey(preferred)),
        ]
        : lots;
    for (const lot of queue) {
        if (left <= 0) break;
        const take = Math.min(lot.pcs, left);
        if (take <= 0) continue;
        lot.pcs = roundQuantity(lot.pcs - take);
        left = roundQuantity(left - take);
        taken.push({ lot, qty: roundQuantity(take) });
    }
    return { taken, short: left };
}

// Back to raw_data.mrpLines form (boxes / loose worked out from pieces).
export function toMrpLines(lots, pcsPerBox) {
    const perBox = toNumber(pcsPerBox);
    return lots
        .filter((lot) => lot.pcs > 0)
        .map((lot) => {
            const boxes = perBox > 0 ? Math.floor(lot.pcs / perBox) : 0;
            return {
                mrp: lot.mrp,
                batchNumber: lot.batchNumber || '',
                mfgDate: lot.mfgDate || '',
                expiryDate: lot.expiryDate || '',
                receivedDate: lot.receivedDate || '',
                boxes,
                loose: roundQuantity(lot.pcs - boxes * perBox),
                pcs: lot.pcs,
            };
        });
}
