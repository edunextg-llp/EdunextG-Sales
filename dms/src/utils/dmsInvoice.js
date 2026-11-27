// Printable GST invoice for a DMS sale (Sales > Create Sales), in the same layout as the main
// site's Add Sales "Tax Invoice", sized for A5 (outlet bills) or A4 (bills to a distributor). Opens in a new window and starts the print
// dialog; choose "Save as PDF" there for a PDF.

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

// Seller letterhead, as on the main site's Add Sales invoice (utils/printSalesInvoicePdf.js).
const SELLER = {
  name: "BAWARCHEE FOOD PACKAGING PRIVATE LIMITED",
  address:
    "Head Office: Holding No. 82, 121 Aswini Dutta Road, South Dum Dum, PO - Dum Dum, PS - Baguiati, South Dum Dum Municipality, Distt - North 24 Paragnas, West Bengal - 700028",
  gst: "19AAJCB9178Q1ZJ",
  pan: "AAJCB9178Q",
  cin: "U15549WB2021PTC245833",
};
const rs = (v) => `Rs. ${money(v)}`;
const unitRate = (v) => num(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// Long bills go over several sheets: up to `rows` rows on a page, the last page (with the
// totals and footer) up to `lastRows`. Each page also shrinks a little if needed.
// Bills to a distributor (CNF company bills) print on A4 portrait; outlet bills on A5 landscape.
const PAPER = {
  a5: { label: "A5", desc: "A5 landscape", width: "210mm", height: "148mm", rows: 15, lastRows: 10, font: "9px" },
  a4: { label: "A4", desc: "A4 portrait", width: "210mm", height: "297mm", rows: 38, lastRows: 30, font: "10px" },
};

// Same layout as the Add Sales "Tax Invoice" (templates/salesInvoicePrintTemplate.js), on A5
// landscape sheets (outlet bills) or A4 portrait sheets (bills to a distributor), one or more.
export function printInvoice({ sale, items = [] }) {
  const paper = sale.buyer_type === "distributor" ? PAPER.a4 : PAPER.a5;
  const cancelled = sale.status === "cancelled";
  const paidQty = items.filter((it) => !it.is_free).reduce((t, it) => t + num(it.qty), 0);
  const freeQty = items.filter((it) => it.is_free).reduce((t, it) => t + num(it.qty), 0);
  const gst = num(sale.gst_amount);
  const beforeRound = num(sale.total_amount) - num(sale.round_off);

  const rowHtml = items.map((it, i) => {
    const name = `${it.product_name || "Item"}${it.variant_name ? `, ${it.variant_name}` : ""}`;
    const lot = [it.mrp ? `MRP ${money(it.mrp)}` : "", it.batch_number, it.expiry_date ? `Exp ${day(it.expiry_date)}` : ""].filter(Boolean).join(" · ");
    const pieces = num(it.qty);
    const beforeGst = it.is_free ? 0 : it.rate_before_gst ?? (pieces > 0 ? num(it.taxable_amount) / pieces : 0);
    const afterGst = it.is_free ? 0 : it.rate_before_gst != null && pieces > 0 ? num(it.amount) / pieces : it.rate;
    return `
          <tr>
            <td class="center">${i + 1}</td>
            <td>${it.is_free ? "&#8627; " : ""}${esc(name)}${it.is_free ? " <b>(FREE)</b>" : ""}${it.is_free && it.free_note ? `<div class="sub"><b>${esc(it.free_note)}</b></div>` : ""}${lot ? `<div class="sub">${esc(lot)}</div>` : ""}</td>
            <td class="center">${esc(it.hsn_code || "--")}</td>
            <td class="center">PCS</td>
            <td class="num">${it.is_free ? 0 : qty(it.qty)}</td>
            <td class="num">${it.is_free ? qty(it.qty) : 0}</td>
            <td class="num">${qty(it.qty)}</td>
            <td class="num">${unitRate(beforeGst)}</td>
            <td class="num">${unitRate(afterGst)}</td>
            <td class="num">${rs(it.amount)}</td>
          </tr>`;
  });
  const chunks = [];
  const rest = rowHtml.slice();
  while (rest.length > paper.lastRows) chunks.push(rest.splice(0, paper.rows));
  chunks.push(rest);
  const pageCount = chunks.length;

  const header = `
      <div class="title">Tax Invoice</div>
      <section class="panel">
        <div class="panel-grid">
          <div class="panel-col">
            <div class="line"><span class="label">FROM:-</span> <span class="value">${esc(SELLER.name)}</span></div>
            <div class="line"><span class="label">Seller Address:-</span> <span class="value">${esc(SELLER.address)}</span></div>
            <div class="line"><span class="label">FSSAI Number:-</span> <span class="value">--</span></div>
          </div>
          <div class="panel-col">
            <div class="line"><span class="label">GST No:-</span> <span class="value">${esc(SELLER.gst)}</span></div>
            <div class="line"><span class="label">PAN No:-</span> <span class="value">${esc(SELLER.pan)}</span></div>
            <div class="line"><span class="label">CIN:-</span> <span class="value">${esc(SELLER.cin)}</span></div>
          </div>
          <div class="panel-col">
            <div class="line"><span class="label">Invoice No:-</span> <span class="value">${esc(sale.invoice_number)}</span></div>
            <div class="line"><span class="label">Date:-</span> <span class="value">${day(sale.sale_date)}</span></div>
            <div class="line"><span class="label">Company:-</span> <span class="value">${esc(sale.company_name || "--")}</span></div>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-grid">
          <div class="panel-col">
            <div class="line"><span class="label">TO:-</span> <span class="value">${esc(sale.buyer_name || "--")}</span></div>
            <div class="line"><span class="label">Buyer Address:-</span> <span class="value">${esc(sale.buyer_address || "--")}</span></div>
            <div class="line"><span class="label">Buyer Type:-</span> <span class="value">${sale.buyer_type === "outlet" ? "Outlet" : "Distributor"}</span></div>
          </div>
          <div class="panel-col">
            <div class="line"><span class="label">GST No:-</span> <span class="value">${esc(sale.buyer_gstin || "--")}</span></div>
            <div class="line"><span class="label">PAN No:-</span> <span class="value">--</span></div>
            <div class="line"><span class="label">Phone No:-</span> <span class="value">${esc(sale.buyer_contact || "--")}</span></div>
          </div>
          <div class="panel-col">
            <div class="line"><span class="label">Buyer ERP Id:-</span> <span class="value">${esc(sale.buyer_code || "--")}</span></div>
            <div class="line"><span class="label">Billed By:-</span> <span class="value">${esc(sale.created_by_name || "--")}</span></div>
            <div class="line"><span class="label">Total Items:-</span> <span class="value">${items.length}</span></div>
          </div>
        </div>
      </section>`;

  const thead = `
        <thead>
          <tr>
            <th style="width:4%">S No.</th><th style="width:27%">Item Name</th><th style="width:8%">HSN</th><th style="width:5%">Unit</th>
            <th style="width:7%">Order Qty</th><th style="width:6%">Free Qty</th><th style="width:7%">Invoice Qty</th>
            <th style="width:11%">Rate/Pc Before GST (Rs.)</th><th style="width:11%">Rate/Pc After GST (Rs.)</th>
            <th style="width:14%">Total Value (Rs.)</th>
          </tr>
        </thead>`;

  const totalRow = `
          <tr class="total-row">
            <td colspan="4" class="center">Total</td>
            <td class="num">${qty(paidQty)}</td><td class="num">${qty(freeQty)}</td><td class="num">${qty(paidQty + freeQty)}</td>
            <td colspan="2"></td><td class="num">${rs(beforeRound)}</td>
          </tr>`;

  const footer = `
      <div class="footer-grid">
        <section class="footer-box">
          <div class="line"><span class="label">Taxable -</span> ${money(sale.taxable_amount)}, <span class="label">CGST -</span> ${money(gst / 2)}, <span class="label">SGST -</span> ${money(gst / 2)}, <span class="label">IGST -</span> 0.00, <span class="label">UTGST -</span> 0.00</div>
          <div class="line"><span class="label">CREDIT NOTE Remarks:</span> --</div>
          <div class="line"><span class="label">DEBIT NOTE Remarks:</span> --</div>
          <div class="line"><span class="label">Remarks:</span> ${esc(sale.remarks || "--")}</div>
          <div class="line"><span class="label">Amount in words:</span> ${rupeesInWords(sale.total_amount)}</div>
          <div class="signature">For ${esc(SELLER.name)}</div>
        </section>
        <section class="footer-box">
          <div class="summary-line"><span>CREDIT NOTE Adjustment:</span><span>+ 0.00</span></div>
          <div class="summary-line"><span>DEBIT NOTE Adjustment:</span><span>- 0.00</span></div>
          <div class="summary-line"><span>Round Off:</span><span>${rs(sale.round_off)}</span></div>
          <div class="summary-line"><span>Total Value (Rs.) INCL. GST:</span><span>${rs(beforeRound)}</span></div>
          <div class="summary-line summary-total"><span>Total Value:</span><span>${rs(sale.total_amount)}</span></div>
          <div class="summary-line summary-total"><span>Net Payable Amount:</span><span>${rs(sale.total_amount)}</span></div>
          ${num(sale.paid_amount) > 0 ? `<div class="summary-line"><span>Paid:</span><span>${rs(sale.paid_amount)}</span></div>` : ""}
          ${num(sale.balance_amount) > 0 && !cancelled ? `<div class="summary-line"><span>Balance Due:</span><span>${rs(sale.balance_amount)}</span></div>` : ""}
        </section>
      </div>`;

  const pages = chunks
    .map((chunk, p) => {
      const last = p === pageCount - 1;
      return `
    <div class="sheet"><main class="page"><div class="fit">
      ${cancelled ? '<div class="stamp">CANCELLED</div>' : ""}
      <div class="top-meta"><span>${p + 1}/${pageCount}</span><span>Seller Copy</span></div>
      ${header}
      <div class="grow">
      <table>
        ${thead}
        <tbody>
          ${chunk.join("")}
          ${last ? totalRow : `<tr><td colspan="10" class="center sub">Continued on page ${p + 2}</td></tr>`}
        </tbody>
      </table>
      </div>
      ${last ? footer : ""}
    </div></main></div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Tax Invoice ${esc(sale.invoice_number)}</title>
    <style>
      /* ${paper.desc} sheets (${paper.width} × ${paper.height}), no printer margin: the sheet has its own 4 mm. */
      @page { size: ${paper.width} ${paper.height}; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; }
      body { color: #000; font-family: Arial, Helvetica, sans-serif; font-size: ${paper.font}; line-height: 1.25; }
      .sheet { width: ${paper.width}; height: ${paper.height}; padding: 4mm; overflow: hidden; background: #fff; break-after: page; page-break-after: always; }
      .sheet:last-of-type { break-after: auto; page-break-after: auto; }
      .page { height: 100%; border: 1px solid #000; padding: 5px; position: relative; overflow: hidden; }
      .fit { display: flex; flex-direction: column; min-height: 100%; }
      .grow { flex: 1; }
      .top-meta { display: flex; justify-content: space-between; align-items: flex-start; font-size: 7px; font-weight: 700; }
      .title { margin: 1px 0 4px; font-size: 13px; font-weight: 800; text-align: center; }
      .panel { border: 1px solid #000; margin-bottom: 4px; }
      .panel-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; }
      .panel-col { min-height: 44px; padding: 3px 4px; border-right: 1px solid #000; }
      .panel-col:last-child { border-right: 0; }
      .line { margin-bottom: 2px; word-break: break-word; }
      .label { font-weight: 700; }
      .value { font-weight: 600; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #000; padding: 2px; vertical-align: middle; overflow-wrap: anywhere; }
      th { background: #f2f2f2; font-size: 6.5px; line-height: 1.1; font-weight: 700; text-align: center; }
      td.center { text-align: center; }
      td.num { text-align: right; }
      .sub { font-size: 6.5px; color: #333; }
      .total-row td { background: #fafafa; font-weight: 800; }
      .footer-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 4px; margin-top: 4px; }
      .footer-box { min-height: 58px; border: 1px solid #000; padding: 4px; }
      .summary-line { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 2px; font-weight: 700; }
      .summary-total { border-top: 1px solid #000; margin-top: 3px; padding-top: 3px; font-size: 9px; }
      .signature { display: flex; justify-content: flex-end; padding-top: 14px; font-size: 7px; font-weight: 700; }
      .stamp { position: absolute; top: 30%; left: 30%; color: #dc2626; border: 3px solid #dc2626; padding: 4px 14px; font-size: 22px; font-weight: 800; transform: rotate(-12deg); opacity: .6; }
      .noprint { margin: 8px; font-family: Arial, sans-serif; }
      @media screen { body { background: #e5e7eb; } .sheet { margin: 0 auto 16px; box-shadow: 0 2px 10px rgba(0,0,0,.25); } }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .noprint { display: none; } }
    </style>
  </head>
  <body>
    <div class="noprint"><button onclick="window.print()">Print / Save as PDF (${paper.label})</button> &nbsp;Paper: ${paper.desc} · Margins: None · Scale: 100%</div>
    ${pages}
    <script>
      // Shrink a sheet's content (only if needed) until it fits its page, then print.
      function fitToSheet() {
        document.querySelectorAll(".page").forEach(function (page) {
          var fit = page.querySelector(".fit"), avail = page.clientHeight - 10, zoom = 1;
          fit.style.minHeight = "0";
          fit.style.zoom = 1;
          while (fit.getBoundingClientRect().height > avail && zoom > 0.6) {
            zoom -= 0.03;
            fit.style.zoom = zoom;
          }
          // Fill the sheet so the totals sit at the bottom (lengths inside a zoomed box are scaled).
          fit.style.minHeight = avail / zoom + "px";
        });
      }
      window.addEventListener("load", function () { fitToSheet(); setTimeout(function () { window.print(); }, 250); });
    </script>
  </body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("Allow pop-ups for this site to print the invoice.");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}
