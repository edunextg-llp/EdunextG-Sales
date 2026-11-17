const purchaseRequisitionPrintTemplate = String.raw`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Purchase Requisition - <%= requisitionNumber %></title>
    <style>
      @page { size: A4 landscape; margin: 0.11in; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10px;
        line-height: 1.25;
      }
      .page {
        border: 1px solid #111827;
        padding: 8px 10px;
      }
      .top-meta {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 4px;
        font-size: 10px;
        font-weight: 700;
      }
      .title {
        text-align: center;
        font-size: 16px;
        font-weight: 800;
        margin: 2px 0 8px;
      }
      .panel {
        border: 1px solid #111827;
        margin-bottom: 8px;
      }
      .panel-grid {
        display: grid;
        grid-template-columns: 1.2fr 1fr 1fr;
        gap: 0;
      }
      .panel-col {
        padding: 6px 8px;
        border-right: 1px solid #111827;
        min-height: 72px;
      }
      .panel-col:last-child { border-right: none; }
      .label { font-weight: 700; }
      .value { font-weight: 600; word-break: break-word; }
      .line { margin-bottom: 3px; }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th, td {
        border: 1px solid #111827;
        padding: 4px 3px;
        vertical-align: middle;
        word-wrap: break-word;
      }
      th {
        background: #f3f4f6;
        font-size: 8.5px;
        font-weight: 700;
        text-align: center;
      }
      td.num { text-align: right; }
      td.center { text-align: center; }
      .total-row td {
        font-weight: 800;
        background: #f9fafb;
      }
      .footer-grid {
        display: grid;
        grid-template-columns: 1.4fr 1fr;
        gap: 8px;
        margin-top: 8px;
      }
      .footer-box {
        border: 1px solid #111827;
        padding: 8px;
        min-height: 88px;
      }
      .summary-line {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
        font-weight: 700;
      }
      .summary-total {
        border-top: 1px solid #111827;
        margin-top: 6px;
        padding-top: 6px;
        font-size: 12px;
        font-weight: 800;
      }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="top-meta">
        <div>1/1</div>
        <div>Seller Copy</div>
      </div>
      <div class="title">Purchase Requisition</div>

      <section class="panel">
        <div class="panel-grid">
          <div class="panel-col">
            <div class="line"><span class="label">FROM:-</span> <span class="value"><%= sellerName %></span></div>
            <div class="line"><span class="label">Seller Address:-</span> <span class="value"><%= sellerAddress %></span></div>
            <div class="line"><span class="label">Fssai Number:-</span> <span class="value"><%= sellerFssai %></span></div>
          </div>
          <div class="panel-col">
            <div class="line"><span class="label">GST No:</span> <span class="value"><%= sellerGst %></span></div>
            <div class="line"><span class="label">PAN No:</span> <span class="value"><%= sellerPan %></span></div>
            <div class="line"><span class="label">Phone No:-</span> <span class="value"><%= sellerPhone %></span></div>
          </div>
          <div class="panel-col">
            <div class="line"><span class="label">Requisition No:-</span> <span class="value"><%= requisitionNumber %></span></div>
            <div class="line"><span class="label">Invoice No:-</span> <span class="value"><%= invoiceNumber %></span></div>
            <div class="line"><span class="label">Date:-</span> <span class="value"><%= invoiceDate %></span></div>
            <div class="line"><span class="label">Phone No:-</span> <span class="value"><%= sellerPhone %></span></div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-grid">
          <div class="panel-col">
            <div class="line"><span class="label">TO:-</span> <span class="value"><%= buyerName %></span></div>
            <div class="line"><span class="label">Buyer Address:-</span> <span class="value"><%= buyerAddress %></span></div>
            <div class="line"><span class="label">Fssai Number:-</span> <span class="value"><%= buyerFssai %></span></div>
          </div>
          <div class="panel-col">
            <div class="line"><span class="label">GST No:</span> <span class="value"><%= buyerGst %></span></div>
            <div class="line"><span class="label">PAN No:-</span> <span class="value"><%= buyerPan %></span></div>
            <div class="line"><span class="label">Phone No:-</span> <span class="value"><%= buyerPhone %></span></div>
          </div>
          <div class="panel-col">
            <div class="line"><span class="label">Buyer Erp Id:-</span> <span class="value"><%= buyerErpId %></span></div>
            <div class="line"><span class="label">Salesman Name:-</span> <span class="value"><%= salesmanName %></span></div>
            <div class="line"><span class="label">Beat Name:-</span> <span class="value"><%= beatName %></span></div>
            <div class="line"><span class="label">Route Name:-</span> <span class="value"><%= routeName %></span></div>
            <div class="line"><span class="label">Employee Contact No.:-</span> <span class="value"><%= employeeContact %></span></div>
          </div>
        </div>
      </section>

      <table>
        <thead>
          <tr>
            <th>S No.</th>
            <th>Item Name</th>
            <th>Variant Name</th>
            <th>Hsn Code</th>
            <th>MRP (₹)</th>
            <th>Order Qty</th>
            <th>Free Qty</th>
            <th>Invoice Qty</th>
            <th>Price/Piece</th>
            <th>Net Amt. (₹)</th>
            <th>Secondary Dis. ₹(%)</th>
            <th>Cash Dis. ₹(%)</th>
            <th>Taxable Value (₹)</th>
            <th>GST (%)</th>
            <th>GST Amt. (₹)</th>
            <th>Total Value (₹)</th>
          </tr>
        </thead>
        <tbody>
          <% items.forEach(function(item) { %>
          <tr>
            <td class="center"><%= item.sno %></td>
            <td><%= item.itemName %></td>
            <td><%= item.variantName %></td>
            <td class="center"><%= item.hsnCode %></td>
            <td class="num"><%= item.mrp %></td>
            <td class="num"><%= item.orderQty %></td>
            <td class="num"><%= item.freeQty %></td>
            <td class="num"><%= item.invoiceQty %></td>
            <td class="num"><%= item.pricePerPiece %></td>
            <td class="num"><%= item.netAmount %></td>
            <td class="num"><%= item.secondaryDiscount %></td>
            <td class="num"><%= item.cashDiscount %></td>
            <td class="num"><%= item.taxableValue %></td>
            <td class="center"><%= item.gstPercent %></td>
            <td class="num"><%= item.gstAmount %></td>
            <td class="num"><%= item.totalValue %></td>
          </tr>
          <% }); %>
          <tr class="total-row">
            <td colspan="5" class="center">Total</td>
            <td class="num"><%= totals.orderQty %></td>
            <td class="num"><%= totals.freeQty %></td>
            <td class="num"><%= totals.invoiceQty %></td>
            <td></td>
            <td class="num"><%= totals.netAmount %></td>
            <td class="num"><%= totals.secondaryDiscount %></td>
            <td class="num"><%= totals.cashDiscount %></td>
            <td class="num"><%= totals.taxableValue %></td>
            <td></td>
            <td class="num"><%= totals.gstAmount %></td>
            <td class="num"><%= totals.totalValue %></td>
          </tr>
        </tbody>
      </table>

      <div class="footer-grid">
        <div class="footer-box">
          <div class="line"><span class="label">CGST -</span> <%= totals.cgst %>, <span class="label">SGST -</span> <%= totals.sgst %>, <span class="label">IGST -</span> 0.00, <span class="label">UTGST -</span> 0.00</div>
          <div class="line"><span class="label">CREDIT NOTE Remarks:</span> --</div>
          <div class="line"><span class="label">DEBIT NOTE Remarks:</span> --</div>
          <div class="line"><span class="label">Amount in words:</span> <%= amountInWords %></div>
          <div class="line"><span class="label">Remarks:</span> <%= remarks %></div>
        </div>
        <div class="footer-box">
          <div class="summary-line"><span>CREDIT NOTE Adjustment:</span><span>+ 0.00</span></div>
          <div class="summary-line"><span>DEBIT NOTE Adjustment:</span><span>- 0.00</span></div>
          <div class="summary-line"><span>Round Off:</span><span>₹ <%= roundOff %></span></div>
          <div class="summary-line summary-total"><span>Total Value:</span><span>₹ <%= totals.totalValue %></span></div>
          <div class="summary-line summary-total"><span>Net Payable Amount:</span><span>₹ <%= totals.totalValue %></span></div>
        </div>
      </div>
    </main>
  </body>
</html>`;

export default purchaseRequisitionPrintTemplate;
