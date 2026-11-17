// Order copy (A4, black and white) for a distributor order: order details, the distributor, and the ordered items
// with their free goods. Only CNF distributors get it (Orders > My orders > Order copy).
// Same layout as the Bawarchee app's order copy (Bawarchee-App/src/distributor/order-copy.ts).
// Opens in a new window and starts the print dialog; choose "Save as PDF" there for a PDF.

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const num = (v) => Number(v) || 0;
const qty = (v) => (Number.isInteger(num(v)) ? num(v).toLocaleString("en-IN") : num(v).toFixed(2));
const day = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

const STATUS = {
  pending: "Waiting for approval",
  approved: "Approved",
  billed: "Billed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const isCnf = (profile) => String(profile?.companyType || "").toLowerCase() === "cnf";

export function orderCopyHtml(order, profile) {
  const orderNo = order.order_number || `ORD${String(order.id).padStart(6, "0")}`;
  const paid = order.items.filter((it) => !it.is_free);
  const freeTotal = order.items.filter((it) => it.is_free).reduce((t, it) => t + num(it.qty), 0);
  const paidTotal = paid.reduce((t, it) => t + num(it.qty), 0);

  let sr = 0;
  const rows = order.items
    .map((it) => {
      const name = esc(it.variant_name || it.product_name || it.product_erp_id);
      if (it.is_free) {
        return `<tr class="free"><td></td><td>&#8627; <b>FREE</b> ${name}${it.free_note ? `<div class="note">${esc(it.free_note)}</div>` : ""}</td>
          <td class="mono">${esc(it.product_erp_id)}</td><td class="r"></td><td class="r">${qty(it.qty)}</td></tr>`;
      }
      sr += 1;
      return `<tr><td class="c">${sr}</td><td>${name}</td><td class="mono">${esc(it.product_erp_id)}</td>
        <td class="r b">${qty(it.qty)}</td><td class="r"></td></tr>`;
    })
    .join("");

  const kv = (k, v) => (v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : "");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Order copy ${esc(orderNo)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 11.5px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 10px; }
  .title { font-size: 24px; font-weight: 800; color: #000; letter-spacing: .5px; }
  .sub { color: #333; margin-top: 2px; }
  .no { text-align: right; }
  .no .big { font-size: 18px; font-weight: 800; font-family: "Courier New", monospace; }
  .status { display: inline-block; margin-top: 4px; padding: 2px 10px; border-radius: 10px; border: 1px solid #000; color: #000; font-weight: 700; font-size: 11px; }
  .grid { display: flex; gap: 14px; margin-top: 14px; }
  .box { flex: 1; border: 1px solid #000; border-radius: 8px; padding: 10px 12px; }
  .box h3 { margin: 0 0 6px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #333; }
  .box .name { font-size: 14px; font-weight: 800; margin-bottom: 4px; }
  .kv { border-collapse: collapse; width: 100%; }
  .kv th { text-align: left; color: #333; font-weight: 600; padding: 2px 8px 2px 0; width: 38%; vertical-align: top; }
  .kv td { padding: 2px 0; font-weight: 600; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 16px; }
  table.items th { background: #fff; color: #000; border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 10.5px; text-transform: uppercase; letter-spacing: .5px; padding: 7px 8px; text-align: left; }
  table.items td { border-bottom: 1px solid #bbb; padding: 6px 8px; vertical-align: top; }
  table.items tr.free td { background: #fff; color: #000; font-style: italic; }
  .note { font-size: 10px; opacity: .8; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: 700; }
  .mono { font-family: "Courier New", monospace; font-size: 10.5px; }
  tfoot td { font-weight: 800; border-top: 2px solid #000; border-bottom: none; padding-top: 8px; }
  .remarks { margin-top: 12px; padding: 8px 12px; border: 1px solid #000; border-radius: 6px; }
  .sign { display: flex; justify-content: space-between; margin-top: 60px; }
  .sign div { width: 40%; border-top: 1px solid #000; padding-top: 4px; text-align: center; color: #000; }
  .foot { margin-top: 18px; color: #333; font-size: 10px; text-align: center; }
  .noprint { background: #fff7e6; padding: 8px 12px; margin-bottom: 12px; border-radius: 6px; font-size: 12px; }
  @media print { .noprint { display: none; } }
</style>
</head>
<body>
  <div class="noprint"><button onclick="window.print()">Print / Save as PDF (A4)</button> &nbsp;Paper: A4 portrait</div>
  <div class="head">
    <div>
      <div class="title">ORDER COPY</div>
      <div class="sub">${esc(profile?.companyName || "")}</div>
    </div>
    <div class="no">
      <div class="big">${esc(orderNo)}</div>
      <div class="sub">Date ${day(order.created_at)}</div>
      <div class="status">${esc(STATUS[order.status] || order.status)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h3>Ordered by</h3>
      <div class="name">${esc(profile?.name || "")}</div>
      <table class="kv">
        ${kv("Contact person", profile?.contactPerson)}
        ${kv("Login ID", profile?.loginId)}
        ${kv("Phone", profile?.phone)}
        ${kv("GSTIN", profile?.gstin)}
        ${kv("Address", profile?.address)}
      </table>
    </div>
    <div class="box">
      <h3>Order</h3>
      <table class="kv">
        ${kv("Order No.", orderNo)}
        ${kv("Order date", day(order.created_at))}
        ${kv("Price", order.price_type === "retail" ? "Retail price" : "Wholesale price")}
        ${kv("Requisition No.", order.requisition_number)}
        ${kv("Bill No.", order.invoice_number)}
        ${kv("Company", profile?.companyName)}
      </table>
    </div>
  </div>

  <table class="items">
    <thead><tr><th class="c" style="width:40px">#</th><th>Item</th><th style="width:130px">ERP ID</th><th class="r" style="width:90px">Qty (pcs)</th><th class="r" style="width:90px">Free (pcs)</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td></td><td>Total · ${paid.length} item${paid.length === 1 ? "" : "s"}</td><td></td><td class="r">${qty(paidTotal)}</td><td class="r">${freeTotal ? qty(freeTotal) : ""}</td></tr></tfoot>
  </table>

  ${order.remarks ? `<div class="remarks"><b>Note:</b> ${esc(order.remarks)}</div>` : ""}
  ${order.status === "rejected" && order.reject_reason ? `<div class="remarks"><b>Rejected:</b> ${esc(order.reject_reason)}</div>` : ""}

  <div class="sign"><div>Distributor signature</div><div>For ${esc(profile?.companyName || "the company")}</div></div>
  <div class="foot">Order copy only, not a tax invoice. Rates and free goods are confirmed on the bill.</div>
</body>
</html>`;
}

export function printOrderCopy(order, profile) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) throw new Error("Allow pop-ups for this site to print the order copy.");
  w.document.open();
  w.document.write(orderCopyHtml(order, profile).replace("</body>", `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},250);});</script></body>`));
  w.document.close();
  w.focus();
}
