function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSrNo(value) {
  return String(value).padStart(2, "0");
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export function printChalanPdf(sale) {
  if (!sale?.items?.length) {
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Please allow popups to print.");
    return;
  }

  const totalQty = sale.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalAmount = sale.items.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.mrp || 0),
    0
  );

  const assigneeLabel =
    sale.assigneeType === "company_staff" ? "Company Staff" : "Delivery Boy";

  const rows = sale.items
    .map(
      (item) => `
      <tr>
        <td align="center">${escapeHtml(formatSrNo(item.srNo))}</td>
        <td>${escapeHtml(item.itemName)}</td>
        <td align="right">${escapeHtml(item.qty)}</td>
        <td align="right">${formatCurrency(item.mrp)}</td>
        <td align="right">${formatCurrency(Number(item.qty || 0) * Number(item.mrp || 0))}</td>
      </tr>
    `
    )
    .join("");

  printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Chalan ${escapeHtml(sale.chalanCode)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 22px; margin: 0 0 8px; text-align: center; }
      .meta { margin-bottom: 20px; font-size: 14px; }
      .meta p { margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #333; padding: 8px; font-size: 13px; }
      th { background: #f0f2f5; text-align: left; }
      .total { margin-top: 16px; font-size: 15px; font-weight: bold; text-align: right; }
      .signature { margin-top: 48px; display: flex; justify-content: space-between; }
      .signature-line {
        border-top: 1px solid #000;
        width: 240px;
        margin-top: 40px;
        padding-top: 6px;
        font-size: 14px;
      }
      @media print { body { margin: 12px; } }
    </style>
  </head>
  <body>
    <h1>Chalan</h1>
    <div class="meta">
      <p><strong>Chalan Code:</strong> ${escapeHtml(sale.chalanCode)}</p>
      <p><strong>Date:</strong> ${escapeHtml(new Date(sale.saleDate).toLocaleDateString())}</p>
      <p><strong>${escapeHtml(assigneeLabel)}:</strong> ${escapeHtml(sale.assigneeName || "—")}</p>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 70px;">SR</th>
          <th>Item Name</th>
          <th style="width: 90px;">Qty</th>
          <th style="width: 110px;">MRP</th>
          <th style="width: 120px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <div class="total">
      <div>Total Qty: ${escapeHtml(totalQty)}</div>
      <div>Total Amount: ${formatCurrency(totalAmount)}</div>
    </div>
    <div class="signature">
      <div class="signature-line">Prepared By</div>
      <div class="signature-line">Received By</div>
    </div>
  </body>
</html>`);

  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => printWindow.print();
}
