function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Print Daily Outlet Price Entry receipt with receiver signature line.
 */
export function printSalesReceipt(summary) {
  if (!summary?.sales?.length) {
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Please allow popups to print.");
    return;
  }

  const total = summary.sales.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const rows = summary.sales
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.shopName)}</td>
        <td>${escapeHtml(row.outletErpId || "—")}</td>
        <td>${escapeHtml(row.invoiceNumber)}</td>
        <td>${escapeHtml(row.stickerNumber)}</td>
        <td>${escapeHtml(row.deliveryBoyName || "—")}</td>
        <td>${escapeHtml(row.vehicleNo || "—")}</td>
        <td align="right">₹${Number(row.amount).toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Daily Outlet Price Entry</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 22px; margin: 0 0 8px; text-align: center; }
      .meta { margin-bottom: 20px; font-size: 14px; }
      .meta p { margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #333; padding: 8px; font-size: 13px; }
      th { background: #f0f2f5; text-align: left; }
      .total { margin-top: 16px; font-size: 16px; font-weight: bold; text-align: right; }
      .signature { margin-top: 48px; }
      .signature-line {
        border-top: 1px solid #000;
        width: 280px;
        margin-top: 40px;
        padding-top: 6px;
        font-size: 14px;
      }
      @media print { body { margin: 12px; } }
    </style>
  </head>
  <body>
    <h1>Daily Outlet Price Entry</h1>
    <div class="meta">
      <p><strong>Date:</strong> ${escapeHtml(
        new Date(summary.date).toLocaleDateString()
      )} (${escapeHtml(summary.dayName)})</p>
      <p><strong>Staff:</strong> ${escapeHtml(summary.staffName)}</p>
      <p><strong>Company:</strong> ${escapeHtml(summary.companyName || "—")}</p>
    </div>
    <table>
      <thead>
        <tr>
          <th>Outlet</th>
          <th>ERP ID</th>
          <th>Invoice No</th>
          <th>Sticker No</th>
          <th>Delivery Boy</th>
          <th>Vehicle No</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total">Total: ₹${total.toFixed(2)}</div>
    <div class="signature">
      <div class="signature-line">Receiver Signature</div>
    </div>
    <script>
      window.onload = function () {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`);

  printWindow.document.close();
}
