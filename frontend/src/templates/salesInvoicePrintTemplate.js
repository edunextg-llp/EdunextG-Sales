const salesInvoicePrintTemplate = String.raw`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sales Invoice Report</title>
    <style>
      @page {
        size: A4;
        margin: 14mm;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
        line-height: 1.35;
        background: #ffffff;
      }

      .page {
        min-height: 269mm;
        border: 1px solid #111827;
        padding: 16px 18px 18px;
        position: relative;
        display: flex;
        flex-direction: column;
      }

      .letterhead {
        border-bottom: 2px solid #111827;
        padding-bottom: 12px;
        margin-bottom: 14px;
        text-align: center;
      }

      .company-name {
        margin: 0;
        color: #b91c1c;
        font-size: 22px;
        line-height: 1.1;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .company-subtitle {
        margin-top: 4px;
        color: #374151;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .company-address {
        max-width: 720px;
        margin: 8px auto 0;
        color: #111827;
        font-size: 10.5px;
        font-weight: 600;
      }

      .company-legal {
        margin-top: 5px;
        color: #111827;
        font-size: 10.5px;
        font-weight: 700;
        word-spacing: 4px;
      }

      .document-title {
        margin: 14px 0 12px;
        padding: 8px 10px;
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        color: #111827;
        font-size: 16px;
        font-weight: 800;
        text-align: center;
        text-transform: uppercase;
      }

      .details-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 14px;
        margin-bottom: 14px;
      }

      .field {
        display: grid;
        grid-template-columns: 116px minmax(0, 1fr);
        border-bottom: 1px solid #d1d5db;
        min-height: 24px;
        align-items: end;
      }

      .field-label {
        color: #374151;
        font-weight: 700;
        padding: 0 8px 5px 0;
      }

      .field-value {
        color: #111827;
        font-weight: 600;
        padding: 0 0 5px;
        word-break: break-word;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        border: 1px solid #111827;
        padding: 7px 8px;
        vertical-align: middle;
      }

      th {
        background: #e5e7eb;
        color: #111827;
        font-size: 11px;
        text-align: left;
        text-transform: uppercase;
      }

      td.number,
      th.number {
        text-align: right;
      }

      td.center,
      th.center {
        text-align: center;
      }

      .total-row td {
        background: #f9fafb;
        font-size: 13px;
        font-weight: 800;
      }

      .invoice-heading {
        width: max-content;
        margin: 14px auto 12px;
        border-bottom: 2px solid #111827;
        color: #111827;
        font-size: 15px;
        font-weight: 800;
        text-align: center;
        text-transform: uppercase;
      }

      .invoice-box {
        border: 1px solid #111827;
        padding: 10px;
        margin-bottom: 14px;
      }

      .invoice-box-title {
        margin: 0 0 8px;
        color: #111827;
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .invoice-meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px 10px;
        margin-bottom: 10px;
        font-size: 11px;
      }

      .invoice-meta strong {
        color: #374151;
      }

      .amount-words {
        margin-top: 12px;
        border: 1px solid #d1d5db;
        padding: 9px 10px;
        font-weight: 700;
      }

      .grand-total {
        margin-top: 8px;
        padding: 10px;
        border: 1px solid #111827;
        background: #f9fafb;
        font-size: 14px;
        font-weight: 800;
        text-align: right;
      }

      .signature-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px;
        margin-top: auto;
        padding-top: 46px;
        padding-bottom: 18px;
      }

      .signature {
        border-top: 1px solid #111827;
        padding-top: 6px;
        text-align: center;
        font-size: 11px;
        font-weight: 700;
      }

      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="letterhead">
        <h1 class="company-name"><%= companyName %></h1>
        <div class="company-subtitle"><%= companySubtitle %></div>
        <div class="company-address"><%= companyAddress %></div>
        <div class="company-legal"><%= companyLegal %></div>
      </header>

      <section class="document-title">Sales Invoice Report</section>

      <section class="details-grid">
        <div class="field">
          <div class="field-label">Outlet Name</div>
          <div class="field-value"><%= outletName %></div>
        </div>
        <div class="field">
          <div class="field-label">ERP ID</div>
          <div class="field-value"><%= outletErpId %></div>
        </div>
        <div class="field">
          <div class="field-label">Area</div>
          <div class="field-value"><%= locationName %></div>
        </div>
        <div class="field">
          <div class="field-label">Date</div>
          <div class="field-value"><%= saleDate %></div>
        </div>
        <div class="field">
          <div class="field-label">Staff</div>
          <div class="field-value"><%= staffName %></div>
        </div>
        <div class="field">
          <div class="field-label">Company</div>
          <div class="field-value"><%= companyLabel %></div>
        </div>
        <div class="field">
          <div class="field-label">Invoices</div>
          <div class="field-value"><%= invoiceCount %></div>
        </div>
      </section>

      <div class="invoice-heading">Invoice Details</div>

      <% invoices.forEach(function(invoice, invoiceIndex) { %>
        <section class="invoice-box">
          <h2 class="invoice-box-title">
            Invoice <%= invoiceIndex + 1 %> — <%= invoice.invoiceNumber %>
          </h2>
          <div class="invoice-meta">
            <div><strong>Sticker:</strong> <%= invoice.stickerNumber || "—" %></div>
            <div><strong>Items Qty:</strong> <%= invoice.itemCount || "—" %></div>
            <div><strong>Invoice Total:</strong> <%= invoice.amountText %></div>
          </div>
          <table>
            <thead>
              <tr>
                <th class="center" style="width: 40px;">#</th>
                <th>Product Name</th>
                <th class="center" style="width: 60px;">Unit</th>
                <th class="number" style="width: 70px;">Qty</th>
                <th class="number" style="width: 90px;">Rate</th>
                <th class="number" style="width: 100px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <% invoice.products.forEach(function(product, productIndex) { %>
                <tr>
                  <td class="center"><%= productIndex + 1 %></td>
                  <td><%= product.name %></td>
                  <td class="center"><%= product.unit %></td>
                  <td class="number"><%= product.qty %></td>
                  <td class="number"><%= product.rateText %></td>
                  <td class="number"><%= product.amountText %></td>
                </tr>
              <% }); %>
              <tr class="total-row">
                <td colspan="5">Invoice Total</td>
                <td class="number"><%= invoice.amountText %></td>
              </tr>
            </tbody>
          </table>
        </section>
      <% }); %>

      <div class="grand-total">Grand Total (All Invoices): <%= grandTotal %></div>
      <div class="amount-words">Amount in words: <%= amountInWords %></div>

      <section class="signature-grid">
        <div class="signature">Prepared By</div>
        <div class="signature">Checked By</div>
        <div class="signature">Received By</div>
      </section>
    </main>
  </body>
</html>`;

export default salesInvoicePrintTemplate;
