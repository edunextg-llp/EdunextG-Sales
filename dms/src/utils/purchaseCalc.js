// Purchase (DMS stock) entry maths and helpers.
//
// DMS prices purchase lines from the DP price (sent with pricingMode "mrp", a name kept
// so lines saved earlier still match; MRP itself is only stored for reference):
//   Qty         = pcs per box x boxes + loose pcs
//   Net amount  = DP x Qty
//   Discount %  = Trade + Primary + Cash (EVEREST companies) or a single Discount %
//   Taxable     = Net amount - discount
//   CGST = SGST = Taxable x GST% / 2   (GST % comes from the item, default 5)
//   Line total  = Taxable + CGST + SGST
//   Cost / pc   = Line total / Qty     (shown, incl. GST)
//               = Taxable / Qty        (excl. GST, saved as the purchase price)
// Keep in sync with calcMrpLine in backend/src/controllers/dmsStockController.js.

// Shared with the main site and its Purchase History "edit invoice" button.
export const DRAFT_KEY = "dms-manual-stock-draft";

export const DMS_STOCK_TEMPLATE_URL =
  "https://res.cloudinary.com/ddwp5cuhl/raw/upload/v1782977868/DMS_Stock_-_Copy_cgba8i.xlsx";

/** EVEREST and EVEREST (NEEVAN) use Trade / Primary / Cash discounts. */
export const isEverestCompany = (companyName) =>
  String(companyName || "").trim().toUpperCase().startsWith("EVEREST");

export const erpKey = (value) => String(value || "").trim().toLowerCase();

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const num = (value) => Number(value) || 0;
const clampPct = (value) => Math.min(100, Math.max(0, num(value)));
const trimNumber = (value) => {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
};

export const emptyLine = () => ({
  productErpId: "",
  productName: "",
  variantName: "",
  itemCode: "",
  hsnCode: "",
  pcsPerBox: "",
  currentStockInCase: "",
  currentStockInPcs: "",
  batchNumber: "",
  mfgDate: "",
  expiryDate: "",
  mrp: "",
  dpPrice: "",
  discountPercent: "",
  tradeDiscountPercent: "",
  primaryDiscountPercent: "",
  cashDiscountPercent: "",
  gstPercent: "5",
  // Sale prices per piece; shown only for companies that make sale bills.
  // Left blank, the backend keeps the item's last known prices.
  wholesalePrice: "",
  retailPrice: "",
  sourceItemId: null,
  sourceDmsItemId: null,
});

/** Item details for a line, taken from the seller's item (Add Item). */
export const itemFields = (item) => ({
  productErpId: item.product_erp_id || "",
  productName: item.sku_name || "",
  variantName: item.variant_name || "",
  itemCode: item.item_code || "",
  hsnCode: item.hsn_code || "",
  pcsPerBox: item.pcs_per_box != null ? trimNumber(item.pcs_per_box) : "",
  gstPercent: item.gst_percent != null ? trimNumber(item.gst_percent) : "5",
  sourceItemId: item.id || null,
});

/** Total discount % for the line. */
export const lineDiscountPercent = (line, everest) =>
  clampPct(
    everest
      ? num(line.tradeDiscountPercent) + num(line.primaryDiscountPercent) + num(line.cashDiscountPercent)
      : line.discountPercent
  );

export function calcLine(line, everest) {
  const qty = num(line.pcsPerBox) * num(line.currentStockInCase) + num(line.currentStockInPcs);
  // Lines saved before DP was on the form used MRP as the base rate.
  const dp = num(line.dpPrice) || num(line.mrp);
  const discountPercent = lineDiscountPercent(line, everest);
  const gstPercent = line.gstPercent === "" || line.gstPercent == null ? 5 : clampPct(line.gstPercent);

  const net = dp * qty;
  const discountAmount = (net * discountPercent) / 100;
  const taxable = net - discountAmount;
  const cgst = (taxable * gstPercent) / 200;
  const sgst = cgst;
  return {
    qty,
    net,
    discountPercent,
    discountAmount,
    taxable,
    gstPercent,
    cgst,
    sgst,
    totalGst: cgst + sgst,
    total: taxable + cgst + sgst,
    // Excl. GST: saved as the purchase price (other screens add GST on top of it).
    costPerPiece: qty ? taxable / qty : dp * (1 - discountPercent / 100),
    // Incl. GST: what one piece really costs = line total / qty.
    costPerPieceWithGst: qty ? (taxable + cgst + sgst) / qty : dp * (1 - discountPercent / 100) * (1 + gstPercent / 100),
  };
}

/** DP amt per piece = DP + GST (no discount). Sale prices can't go below it. */
export const dpAmtPerPiece = (line) => {
  const gst = line.gstPercent === "" || line.gstPercent == null ? 5 : clampPct(line.gstPercent);
  return num(line.dpPrice) * (1 + gst / 100);
};

/** Returns an error message, or "" when the line can be added. */
export function validateLine(line, everest) {
  if (!String(line.productErpId || "").trim()) return "Pick an item first.";
  if (!line.pcsPerBox) return "This item has no '1 box = pieces' value. Set it on the Add Item page.";
  if (!(Number(line.currentStockInCase) > 0) && !(Number(line.currentStockInPcs) > 0)) {
    return "Enter the number of boxes or loose pieces.";
  }
  if (!line.mrp || Number(line.mrp) <= 0) return "Enter a valid MRP.";
  if (!line.dpPrice || Number(line.dpPrice) <= 0) return "Enter a valid DP price.";
  if (line.mfgDate && line.expiryDate && line.mfgDate > line.expiryDate) return "Expiry date must be after MFG date.";
  const parts = everest
    ? [line.tradeDiscountPercent, line.primaryDiscountPercent, line.cashDiscountPercent]
    : [line.discountPercent];
  if (parts.some((p) => p !== "" && (Number(p) < 0 || Number(p) > 100))) return "Discount must be between 0 and 100%.";
  if (lineDiscountPercent(line, everest) >= 100) return "Total discount can't be 100% or more.";
  if ([line.wholesalePrice, line.retailPrice].some((p) => p !== "" && p != null && Number(p) < 0)) {
    return "Sale prices can't be negative.";
  }
  // Wholesale / retail can't be below DP amt (DP + GST per piece). Blank = last price, not checked.
  const dpAmt = dpAmtPerPiece(line);
  for (const [key, name] of [["wholesalePrice", "Wholesale"], ["retailPrice", "Retail"]]) {
    const p = line[key];
    if (p !== "" && p != null && Math.round(Number(p) * 10000) < Math.round(dpAmt * 10000)) {
      return `${name} price can't be below DP amt ${rupees(dpAmt, 4)} (DP + GST).`;
    }
  }
  return "";
}

/** The object sent to the backend for one line. Also what the lines table shows. */
export function lineSnapshot(line, everest, isUpdate) {
  const c = calcLine(line, everest);
  const money = (v) => (Math.round(v * 10000) / 10000).toString();
  return {
    pricingMode: "mrp",
    productErpId: String(line.productErpId || "").trim(),
    productName: String(line.productName || "").trim(),
    variantName: String(line.variantName || "").trim(),
    itemCode: line.itemCode || "",
    hsnCode: line.hsnCode || "",
    pcsPerBox: line.pcsPerBox,
    currentStockInCase: line.currentStockInCase,
    currentStockInPcs: line.currentStockInPcs,
    totalCurrentStockInPcs: String(c.qty),
    batchNumber: line.batchNumber,
    mfgDate: line.mfgDate,
    expiryDate: line.expiryDate,
    mrp: line.mrp,
    dpPrice: line.dpPrice,
    discountPercent: String(c.discountPercent),
    tradeDiscountPercent: everest ? line.tradeDiscountPercent : "",
    primaryDiscountPercent: everest ? line.primaryDiscountPercent : "",
    cashDiscountPercent: everest ? line.cashDiscountPercent : "",
    gstPercent: String(c.gstPercent),
    wholesalePrice: line.wholesalePrice ?? "",
    retailPrice: line.retailPrice ?? "",
    price: money(c.net),
    discountAmount: money(c.discountAmount),
    taxableAmount: money(c.taxable),
    cgstAmount: money(c.cgst),
    sgstAmount: money(c.sgst),
    totalValue: money(c.total),
    pricePerPiece: money(c.costPerPiece),
    purchasePrice: money(c.costPerPiece),
    sourceItemId: line.sourceItemId || null,
    sourceDmsItemId: line.sourceDmsItemId || null,
    isUpdate: Boolean(isUpdate),
  };
}

export const loadDraft = () => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
};

// ---- display helpers ----

export const rupees = (value, decimals = 2) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export const qty = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const showDate = (value, withTime = false) => {
  if (!value) return "—";
  const s = String(value);
  const ymd = s.slice(0, 10);
  if (!withTime && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  const date = new Date(s.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return s;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
