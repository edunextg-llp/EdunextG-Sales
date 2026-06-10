const cashCountingPrintTemplate = String.raw`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Cash Counting Sheet</title>
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

      .cash-heading {
        width: max-content;
        margin: 14px auto 12px;
        border-bottom: 2px solid #111827;
        color: #111827;
        font-size: 15px;
        font-weight: 800;
        text-align: center;
        text-transform: uppercase;
      }

      .cash-box {
        border: 1px solid #111827;
        padding: 10px;
      }

      .cash-box + .cash-box {
        margin-top: 18px;
      }

      .cash-box-title {
        margin: 0 0 8px;
        color: #111827;
        font-size: 13px;
        font-weight: 800;
        text-transform: uppercase;
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
      </header>

      <section class="document-title">Cash Counting Sheet</section>

      <section class="details-grid">
        <div class="field">
          <div class="field-label">Date</div>
          <div class="field-value"><%= depositDate %></div>
        </div>
        <div class="field">
          <div class="field-label">Depositor</div>
          <div class="field-value"><%= depositorName %></div>
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

      <div class="cash-heading">Cash Details</div>

      <section class="cash-box">
        <h2 class="cash-box-title">Notes</h2>
        <table>
          <thead>
            <tr>
              <th class="number">Denomination</th>
              <th class="number">Count</th>
              <th class="number">Amount</th>
            </tr>
          </thead>
          <tbody>
            <% noteRows.forEach(function(row) { %>
              <tr>
                <td class="number">Rs. <%= row.denomination %></td>
                <td class="number"><%= row.count %></td>
                <td class="number"><%= row.amount %></td>
              </tr>
            <% }); %>
          </tbody>
        </table>
      </section>

      <section class="cash-box">
        <h2 class="cash-box-title">Coins</h2>
        <table>
          <thead>
            <tr>
              <th class="number">Denomination</th>
              <th class="number">Count</th>
              <th class="number">Amount</th>
            </tr>
          </thead>
          <tbody>
            <% coinRows.forEach(function(row) { %>
              <tr>
                <td class="number">Rs. <%= row.denomination %></td>
                <td class="number"><%= row.count %></td>
                <td class="number"><%= row.amount %></td>
              </tr>
            <% }); %>
            <tr class="total-row">
              <td colspan="2">Total Cash</td>
              <td class="number"><%= totalAmount %></td>
            </tr>
          </tbody>
        </table>
      </section>

      <div class="amount-words">Amount in words: <%= amountInWords %></div>

      <section class="signature-grid">
        <div class="signature">Prepared By</div>
        <div class="signature">Checked By</div>
        <div class="signature">Received By</div>
      </section>
    </main>
  </body>
</html>`;

export default cashCountingPrintTemplate;
