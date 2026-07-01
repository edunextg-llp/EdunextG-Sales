const upiDepositPrintTemplate = String.raw`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>UPI Deposit Sheet</title>
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

      .total-row td {
        background: #f9fafb;
        font-size: 13px;
        font-weight: 800;
      }

      .amount-words {
        margin-top: 12px;
        border: 1px solid #d1d5db;
        padding: 9px 10px;
        font-weight: 700;
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

      <section class="document-title">UPI Deposit Sheet</section>

      <section class="details-grid">
        <div class="field">
          <div class="field-label">Deposit ID</div>
          <div class="field-value"><%= depositRefNo %></div>
        </div>
        <div class="field">
          <div class="field-label">Date</div>
          <div class="field-value"><%= depositDate %></div>
        </div>
        <div class="field">
          <div class="field-label">Bank</div>
          <div class="field-value"><%= bankName %></div>
        </div>
        <div class="field">
          <div class="field-label">Branch</div>
          <div class="field-value"><%= branchName %></div>
        </div>
        <div class="field">
          <div class="field-label">Account No</div>
          <div class="field-value"><%= bankAccountNo %></div>
        </div>
        <div class="field">
          <div class="field-label">IFSC</div>
          <div class="field-value"><%= ifscCode %></div>
        </div>
      </section>

      <table>
        <thead>
          <tr>
            <th>Outlet</th>
            <th>Invoice No</th>
            <th>UPI ID</th>
            <th class="number">Amount</th>
          </tr>
        </thead>
        <tbody>
          <% rows.forEach(function(row) { %>
            <tr>
              <td><%= row.storeName %></td>
              <td><%= row.invoiceNumber %></td>
              <td><%= row.upiId %></td>
              <td class="number"><%= row.amountText %></td>
            </tr>
          <% }); %>
          <tr class="total-row">
            <td colspan="3">Total UPI</td>
            <td class="number"><%= totalAmount %></td>
          </tr>
        </tbody>
      </table>

      <div class="amount-words">Amount in words: <%= amountInWords %></div>

      <section class="signature-grid">
        <div class="signature">Prepared By</div>
        <div class="signature">Checked By</div>
        <div class="signature">Received By</div>
      </section>
    </main>
  </body>
</html>`;

export default upiDepositPrintTemplate;
