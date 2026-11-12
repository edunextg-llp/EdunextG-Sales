// MRP lots of one item, as sent by /staff/current-stock (`lots`, already in selling order:
// earliest expiry first, then lowest MRP). Same rules as backend/src/utils/stockLots.js.

const num = (v) => Number(v) || 0;
const round = (v) => Math.round((num(v) + Number.EPSILON) * 10000) / 10000;

// One lot = MRP + batch + expiry date (stock received on another date with another expiry
// stays separate).
export const lotKey = (lot) =>
  `${(Math.round(num(lot?.mrp) * 100) / 100).toFixed(2)}|${String(lot?.batchNumber || "").trim().toLowerCase()}|${String(
    lot?.expiryDate || ""
  ).slice(0, 10)}`;

// Takes qty from lots (in place). A preferred lot (MRP + batch) goes first.
export function takeFromLots(lots, qty, preferred = null) {
  let left = round(qty);
  const taken = [];
  const queue =
    preferred && num(preferred.mrp) > 0
      ? [...lots.filter((l) => lotKey(l) === lotKey(preferred)), ...lots.filter((l) => lotKey(l) !== lotKey(preferred))]
      : lots;
  queue.forEach((lot) => {
    if (left <= 0) return;
    const take = Math.min(num(lot.pcs), left);
    if (take <= 0) return;
    lot.pcs = round(num(lot.pcs) - take);
    left = round(left - take);
    taken.push({ lot, qty: round(take) });
  });
  return { taken, short: left };
}

// What is left of a product's lots after the lines already on the bill / requisition.
// `lines` use productErpId, qty, mrp, batchNumber; skipIndex leaves one line out (editing).
export function remainingLots(product, lines = [], skipIndex = null) {
  const lots = (product?.lots || []).map((l) => ({ ...l }));
  lines.forEach((line, i) => {
    if (i === skipIndex || line.productErpId !== product?.product_erp_id) return;
    takeFromLots(lots, num(line.qty), num(line.mrp) > 0 ? line : null);
  });
  return lots;
}

export const lotPrice = (lot, priceType) =>
  priceType === "wholesale" ? num(lot.wholesale_price) || num(lot.retail_price) : num(lot.retail_price) || num(lot.wholesale_price);

const showDate = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

// "₹11 · exp 01/12/2026" / "₹10 · B2"
export const lotLabel = (lot) =>
  [
    `₹${num(lot?.mrp).toFixed(2).replace(/\.00$/, "")}`,
    lot?.batchNumber || "",
    lot?.expiryDate ? `exp ${showDate(lot.expiryDate)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
