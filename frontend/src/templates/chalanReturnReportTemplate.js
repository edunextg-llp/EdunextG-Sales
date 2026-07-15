const chalanReturnReportTemplate = String.raw`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Chalan Return Report</title>
    <style>
      @page {
        size: A4 landscape;
        margin: 12mm;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11px;
        line-height: 1.35;
        background: #ffffff;
      }

      .page {
        min-height: 185mm;
        border: 1px solid #111827;
        padding: 14px 16px 16px;
        display: flex;
        flex-direction: column;
      }

      .letterhead {
        border-bottom: 2px solid #111827;
        padding-bottom: 10px;
        margin-bottom: 12px;
        text-align: center;
      }

      .company-name {
        margin: 0;
        color: #b91c1c;
        font-size: 20px;
        line-height: 1.1;
        font-weight: 800;
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
        max-width: 760px;
        margin: 8px auto 0;
        color: #111827;
        font-size: 10px;
        font-weight: 600;
      }

      .company-legal {
        margin-top: 5px;
        color: #111827;
        font-size: 10px;
        font-weight: 700;
        word-spacing: 4px;
      }

      .document-title {
        margin: 12px 0 10px;
        padding: 7px 10px;
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        color: #111827;
        font-size: 15px;
        font-weight: 800;
        text-align: center;
        text-transform: uppercase;
      }

      .details-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px 14px;
        margin-bottom: 12px;
      }

      .field {
        display: grid;
        grid-template-columns: 108px minmax(0, 1fr);
        border-bottom: 1px solid #d1d5db;
        min-height: 22px;
        align-items: end;
      }

      .field-label {
        color: #374151;
        font-weight: 700;
        padding: 0 8px 4px 0;
      }

      .field-value {
        color: #111827;
        font-weight: 600;
        padding: 0 0 4px;
        word-break: break-word;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        border: 1px solid #111827;
        padding: 6px 7px;
        vertical-align: middle;
      }

      th {
        background: #e5e7eb;
        color: #111827;
        font-size: 10px;
        text-align: left;
        text-transform: uppercase;
      }

      td.center,
      th.center {
        text-align: center;
      }

      td.number,
      th.number {
        text-align: right;
      }

      .total-row td {
        background: #f9fafb;
        font-size: 12px;
        font-weight: 800;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-top: 10px;
      }

      .summary-box {
        border: 1px solid #d1d5db;
        padding: 8px 10px;
        background: #f9fafb;
      }

      .summary-label {
        color: #374151;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
      }

      .summary-value {
        margin-top: 4px;
        font-size: 13px;
        font-weight: 800;
      }

      .amount-words {
        margin-top: 10px;
        border: 1px solid #d1d5db;
        padding: 8px 10px;
        font-weight: 700;
      }

      .signature-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px;
        margin-top: auto;
        padding-top: 28px;
        padding-bottom: 10px;
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

      <section class="document-title">Chalan Return Report</section>

      <section class="details-grid">
        <div class="field">
          <div class="field-label">From Date</div>
          <div class="field-value"><%= fromDate %></div>
        </div>
        <div class="field">
          <div class="field-label">To Date</div>
          <div class="field-value"><%= toDate %></div>
        </div>
        <div class="field">
          <div class="field-label">Generated On</div>
          <div class="field-value"><%= generatedOn %></div>
        </div>
      </section>

      <table>
        <thead>
          <tr>
            <th class="center">SR</th>
            <th>Chalan Code</th>
            <th>Staff / Delivery</th>
            <th class="center">Return Type</th>
            <th class="center">Return Item</th>
            <th class="center">Return Packing</th>
            <th class="number">Return Amount</th>
            <th class="center">Return Date</th>
            <th>Delivery Boy</th>
            <th>Vehicle</th>
          </tr>
        </thead>
        <tbody>
          <% rows.forEach(function(row) { %>
            <tr>
              <td class="center"><%= row.srNo %></td>
              <td><%= row.chalanCode %></td>
              <td><%= row.assigneeName %></td>
              <td class="center"><%= row.returnTypeLabel %></td>
              <td class="center"><%= row.returnItemCount %></td>
              <td class="center"><%= row.returnPackedItemCount %></td>
              <td class="number"><%= row.returnAmountText %></td>
              <td class="center"><%= row.returnDate %></td>
              <td><%= row.deliveryBoyName %></td>
              <td><%= row.vehicleNo %></td>
            </tr>
          <% }); %>
          <tr class="total-row">
            <td colspan="4">Total Returns: <%= totalCount %></td>
            <td class="center"><%= totalReturnItems %></td>
            <td class="center"><%= totalReturnPackedItems %></td>
            <td class="number"><%= totalAmount %></td>
            <td colspan="3"></td>
          </tr>
        </tbody>
      </table>

      <section class="summary-grid">
        <div class="summary-box">
          <div class="summary-label">Full Returns</div>
          <div class="summary-value"><%= fullReturnCount %></div>
        </div>
        <div class="summary-box">
          <div class="summary-label">Partial Returns</div>
          <div class="summary-value"><%= partialReturnCount %></div>
        </div>
        <div class="summary-box">
          <div class="summary-label">Total Entries</div>
          <div class="summary-value"><%= totalCount %></div>
        </div>
        <div class="summary-box">
          <div class="summary-label">Total Amount</div>
          <div class="summary-value"><%= totalAmount %></div>
        </div>
      </section>

      <div class="amount-words">Amount in words: <%= amountInWords %></div>

      <section class="signature-grid">
        <div class="signature">Prepared By</div>
        <div class="signature">Checked By</div>
        <div class="signature">Authorized By</div>
      </section>
    </main>
  </body>
</html>`;

export default chalanReturnReportTemplate;
