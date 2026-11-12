// Printable GST invoice for a DMS sale (Sales > Create Sales). Opens in a new window and
// starts the print dialog; choose "Save as PDF" there for a PDF.

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const num = (v) => Number(v) || 0;
const money = (v) => num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const qty = (v) => (Number.isInteger(num(v)) ? String(num(v)) : num(v).toFixed(2));

// Rupees in words, Indian style (lakh / crore).
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const twoDigits = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
const threeDigits = (n) =>
  [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", twoDigits(n % 100)].filter(Boolean).join(" ");
export function rupeesInWords(amount) {
  let n = Math.round(num(amount));
  if (!n) return "Zero Rupees Only";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return `${parts.join(" ")} Rupees Only`;
}

export function printInvoice({ sale, items = [], payments = [] }) {
  const cancelled = sale.status === "cancelled";
  const rows = items
    .map(
      (it, i) => `
      <tr${it.is_free ? ' class="free"' : ""}>
        <td class="r">${i + 1}</td>
        <td>${esc(it.variant_name || it.product_name)}${it.is_free ? ' <span class="tag">FREE</span>' : ""}
          <div class="sub">${esc(it.item_code || it.product_erp_id)}${it.is_free && it.free_note ? ` · ${esc(it.free_note)}` : ""}</div></td>
        <td>${esc(it.hsn_code || "")}</td>
        <td class="r">${it.mrp ? money(it.mrp) : ""}</td>
        <td>${esc([it.batch_number, it.expiry_date ? `Exp ${day(it.expiry_date)}` : ""].filter(Boolean).join(" · "))}</td>
        <td class="r">${qty(it.qty)}</td>
        <td class="r">${money(it.rate)}</td>
        <td class="r">${money(it.taxable_amount)}</td>
        <td class="r">${num(it.gst_percent)}%</td>
        <td class="r">${money(it.gst_amount)}</td>
        <td class="r b">${money(it.amount)}</td>
      </tr>`
    )
    .join("");
  const paymentRows = payments.length
    ? payments.map((p) => `${day(p.payment_date)} · ${esc(String(p.payment_mode).toUpperCase())} · ₹${money(p.amount)}${p.reference ? ` (${esc(p.reference)})` : ""}`).join("<br>")
    : "No payment yet";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${esc(sale.invoice_number)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12px/1.4 ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #0f1d33; margin: 24px; }
  h1 { font-size: 18px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d4ed8; padding-bottom: 10px; }
  .title { text-align: right; }
  .title .t { font-size: 16px; font-weight: 700; color: #1d4ed8; letter-spacing: .04em; }
  .muted { color: #5b6b85; }
  .boxes { display: flex; gap: 16px; margin: 14px 0; }
  .box { flex: 1; border: 1px solid #dfe6f2; border-radius: 5px; padding: 8px 10px; }
  .box .k { font-size: 10px; text-transform: uppercase; color: #5b6b85; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f5f8fd; text-align: left; font-size: 10.5px; color: #3b4a63; border-bottom: 1px solid #cdd7e6; padding: 6px; }
  td { border-bottom: 1px solid #eef3fa; padding: 5px 6px; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; } .b { font-weight: 700; }
  .sub { font-size: 10px; color: #5b6b85; }
  tr.free td { background: #f0faf3; }
  .tag { background: #dcf3e3; color: #15803d; font-weight: 700; font-size: 9px; padding: 1px 4px; border-radius: 3px; }
  .foot { display: flex; gap: 16px; margin-top: 14px; }
  .sum { width: 300px; margin-left: auto; }
  .sum div { display: flex; justify-content: space-between; padding: 2px 0; }
  .sum .total { border-top: 1px solid #cdd7e6; margin-top: 4px; padding-top: 6px; font-size: 14px; font-weight: 700; }
  .due { color: #dc2626; font-weight: 700; }
  .stamp { color: #dc2626; border: 2px solid #dc2626; display: inline-block; padding: 2px 10px; font-weight: 700; transform: rotate(-4deg); }
  .sign { margin-top: 40px; display: flex; justify-content: space-between; color: #5b6b85; }
  @media print { body { margin: 10mm; } .noprint { display: none; } }
</style></head>
<body>
  <div class="noprint" style="margin-bottom:12px"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="head">
    <div>
      <h1>${esc(sale.company_name || "")}</h1>
      <div class="muted">${sale.buyer_type === "outlet" ? "Sale to outlet" : "Sale to distributor / CNF"}</div>
    </div>
    <div class="title">
      <div class="t">TAX INVOICE</div>
      <div>Invoice <b>${esc(sale.invoice_number)}</b></div>
      <div>Date <b>${day(sale.sale_date)}</b></div>
      ${cancelled ? '<div class="stamp">CANCELLED</div>' : ""}
    </div>
  </div>
  <div class="boxes">
    <div class="box">
      <div class="k">Bill to</div>
      <div class="b">${esc(sale.buyer_name)}</div>
      ${sale.buyer_code ? `<div class="muted">${esc(sale.buyer_code)}</div>` : ""}
      ${sale.buyer_address ? `<div>${esc(sale.buyer_address)}</div>` : ""}
      ${sale.buyer_contact ? `<div>Ph: ${esc(sale.buyer_contact)}</div>` : ""}
      ${sale.buyer_gstin ? `<div>GSTIN: <b>${esc(sale.buyer_gstin)}</b></div>` : ""}
    </div>
    <div class="box">
      <div class="k">Payment</div>
      <div>${paymentRows}</div>
      ${num(sale.balance_amount) > 0 && !cancelled ? `<div class="due" style="margin-top:4px">Balance due ₹${money(sale.balance_amount)}</div>` : ""}
    </div>
  </div>
  <table>
    <thead><tr>
      <th class="r">#</th><th>Item</th><th>HSN</th><th class="r">MRP</th><th>Batch / Exp</th>
      <th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable</th><th class="r">GST</th><th class="r">GST ₹</th><th class="r">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">
    <div style="flex:1">
      <div class="k muted" style="font-size:10px;text-transform:uppercase">Amount in words</div>
      <div class="b">${rupeesInWords(sale.total_amount)}</div>
      ${sale.remarks ? `<div style="margin-top:8px" class="muted">Remarks: ${esc(sale.remarks)}</div>` : ""}
      <div class="muted" style="margin-top:8px">Rates include GST.</div>
    </div>
    <div class="sum">
      <div><span>Total qty</span><span>${qty(sale.total_qty)} pcs</span></div>
      <div><span>Taxable</span><span>₹${money(sale.taxable_amount)}</span></div>
      <div><span>CGST</span><span>₹${money(num(sale.gst_amount) / 2)}</span></div>
      <div><span>SGST</span><span>₹${money(num(sale.gst_amount) / 2)}</span></div>
      <div><span>Round off</span><span>₹${money(sale.round_off)}</span></div>
      <div class="total"><span>Total</span><span>₹${money(sale.total_amount)}</span></div>
      <div><span>Paid</span><span>₹${money(sale.paid_amount)}</span></div>
      <div class="due"><span>Balance</span><span>₹${money(sale.balance_amount)}</span></div>
    </div>
  </div>
  <div class="sign"><span>Receiver's signature</span><span>For ${esc(sale.company_name || "")}</span></div>
  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 200); });</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) throw new Error("Allow pop-ups for this site to print the invoice.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}
