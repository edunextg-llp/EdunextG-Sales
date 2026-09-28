const salesInvoicePrintTemplate = String.raw`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Tax Invoice</title>
    <style>
      @page { size: A4 landscape; margin: 0.11in; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 9px; line-height: 1.2; }
      .page { border: 1px solid #000; padding: 6px; page-break-after: always; break-after: page; }
      .page:last-child { page-break-after: auto; break-after: auto; }
      .top-meta { display: flex; justify-content: space-between; align-items: flex-start; font-size: 8px; font-weight: 700; }
      .title { margin: 2px 0 6px; font-size: 15px; font-weight: 800; text-align: center; }
      .panel { border: 1px solid #000; margin-bottom: 5px; }
      .panel-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr; }
      .panel-col { min-height: 54px; padding: 4px 5px; border-right: 1px solid #000; }
      .panel-col:last-child { border-right: 0; }
      .line { margin-bottom: 2px; word-break: break-word; }
      .label { font-weight: 700; }
      .value { font-weight: 600; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #000; padding: 3px 2px; vertical-align: middle; overflow-wrap: anywhere; }
      th { background: #f2f2f2; font-size: 7px; line-height: 1.1; font-weight: 700; text-align: center; }
      td.center { text-align: center; }
      td.num { text-align: right; }
      .total-row td { background: #fafafa; font-weight: 800; }
      .footer-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 5px; margin-top: 5px; }
      .footer-box { min-height: 70px; border: 1px solid #000; padding: 5px; }
      .summary-line { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 3px; font-weight: 700; }
      .summary-total { border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; font-size: 10px; }
      .signature { display: flex; justify-content: flex-end; padding-top: 18px; font-size: 8px; font-weight: 700; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <% invoices.forEach(function(invoice, invoiceIndex) { %>
      <main class="page">
        <div class="top-meta"><span><%= invoiceIndex + 1 %>/<%= invoiceCount %></span><span>Seller Copy</span></div>
        <div class="title">Tax Invoice</div>

        <section class="panel">
          <div class="panel-grid">
            <div class="panel-col">
              <div class="line"><span class="label">FROM:-</span> <span class="value"><%= companyName %></span></div>
              <div class="line"><span class="label">Seller Address:-</span> <span class="value"><%= companyAddress %></span></div>
              <div class="line"><span class="label">FSSAI Number:-</span> <span class="value">--</span></div>
            </div>
            <div class="panel-col">
              <div class="line"><span class="label">GST No:-</span> <span class="value"><%= companyLegal %></span></div>
              <div class="line"><span class="label">PAN No:-</span> <span class="value">--</span></div>
              <div class="line"><span class="label">Phone No:-</span> <span class="value">--</span></div>
            </div>
            <div class="panel-col">
              <div class="line"><span class="label">Invoice No:-</span> <span class="value"><%= invoice.invoiceNumber %></span></div>
              <div class="line"><span class="label">Date:-</span> <span class="value"><%= saleDate %></span></div>
              <div class="line"><span class="label">Sticker No:-</span> <span class="value"><%= invoice.stickerNumber %></span></div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-grid">
            <div class="panel-col">
              <div class="line"><span class="label">TO:-</span> <span class="value"><%= outletName %></span></div>
              <div class="line"><span class="label">Buyer Address:-</span> <span class="value"><%= locationName %></span></div>
              <div class="line"><span class="label">Company:-</span> <span class="value"><%= companyLabel %></span></div>
            </div>
            <div class="panel-col">
              <div class="line"><span class="label">GST No:-</span> <span class="value">--</span></div>
              <div class="line"><span class="label">PAN No:-</span> <span class="value">--</span></div>
              <div class="line"><span class="label">Phone No:-</span> <span class="value">--</span></div>
            </div>
            <div class="panel-col">
              <div class="line"><span class="label">Buyer ERP Id:-</span> <span class="value"><%= outletErpId %></span></div>
              <div class="line"><span class="label">Salesman Name:-</span> <span class="value"><%= staffName %></span></div>
              <div class="line"><span class="label">Total Items:-</span> <span class="value"><%= invoice.itemCount %></span></div>
            </div>
          </div>
        </section>

        <table>
          <thead>
            <tr>
              <th style="width:4%">S No.</th><th style="width:31%">Item Name</th><th style="width:9%">Unit</th>
              <th style="width:9%">Order Qty</th><th style="width:9%">Free Qty</th><th style="width:10%">Invoice Qty</th>
              <th style="width:14%">Price/Piece</th><th style="width:14%">Total Value (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            <% invoice.products.forEach(function(product, productIndex) { %>
              <tr>
                <td class="center"><%= productIndex + 1 %></td><td><%= product.name %></td><td class="center"><%= product.unit %></td>
                <td class="num"><%= product.qty %></td><td class="num">0</td><td class="num"><%= product.qty %></td>
                <td class="num"><%= product.rateText %></td><td class="num"><%= product.amountText %></td>
              </tr>
            <% }); %>
            <tr class="total-row"><td colspan="3" class="center">Total</td><td class="num"><%= invoice.itemCount %></td><td class="num">0</td><td class="num"><%= invoice.itemCount %></td><td></td><td class="num"><%= invoice.amountText %></td></tr>
          </tbody>
        </table>

        <div class="footer-grid">
          <section class="footer-box">
            <div class="line"><span class="label">CGST -</span> 0.00, <span class="label">SGST -</span> 0.00, <span class="label">IGST -</span> 0.00, <span class="label">UTGST -</span> 0.00</div>
            <div class="line"><span class="label">CREDIT NOTE Remarks:</span> --</div>
            <div class="line"><span class="label">DEBIT NOTE Remarks:</span> --</div>
            <div class="line"><span class="label">Amount in words:</span> <%= amountInWords %></div>
            <div class="signature">For <%= companyName %></div>
          </section>
          <section class="footer-box">
            <div class="summary-line"><span>CREDIT NOTE Adjustment:</span><span>+ 0.00</span></div>
            <div class="summary-line"><span>DEBIT NOTE Adjustment:</span><span>- 0.00</span></div>
            <div class="summary-line"><span>Round Off:</span><span>Rs. 0.00</span></div>
            <div class="summary-line"><span>Total Value (Rs.) INCL.5% GST:</span><span><%= invoice.amountText %></span></div>
            <div class="summary-line summary-total"><span>Total Value:</span><span><%= invoice.amountText %></span></div>
            <div class="summary-line summary-total"><span>Net Payable Amount:</span><span><%= invoice.amountText %></span></div>
          </section>
        </div>
      </main>
    <% }); %>
  </body>
</html>`;

export default salesInvoicePrintTemplate;
