import ejs from "ejs/ejs.min.js";

export const invoiceValue = (row) => Number(row.effective_price ?? row.price) || 0;
// areaOrder: area names in delivery priority (from Create Route). Bills in
// those areas come first in that order; the rest keep their original order.
export function groupAssignments(rows, areaOrder = []) {
  const groups = new Map();
  const seen = new Set();
  rows.forEach((row) => {
    if (!row.delivery_boy_id || seen.has(String(row.id))) return;
    seen.add(String(row.id));
    const key = String(row.delivery_boy_id);
    const group = groups.get(key) || { id: key, name: row.delivery_boy_name || `Employee ${key}`, rows: [], total: 0 };
    group.rows.push(row); group.total += invoiceValue(row); groups.set(key, group);
  });
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const rank = new Map();
  areaOrder.forEach((area) => { const key = normalize(area); if (!rank.has(key)) rank.set(key, rank.size); });
  const rankOf = (row) => (rank.has(normalize(row.location_name)) ? rank.get(normalize(row.location_name)) : Number.MAX_SAFE_INTEGER);
  groups.forEach((group) => {
    group.rows = group.rows.map((row, index) => ({ row, index }))
      .sort((a, b) => rankOf(a.row) - rankOf(b.row) || a.index - b.index)
      .map(({ row }) => row);
  });
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createAssignmentSheet(group, date, bitField) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Assigned Orders');
  sheet.columns = [{ width: 10 }, { width: 25 }, { width: 28 }, { width: 40 }, { width: 22 }];
  sheet.addRow([`Assigned Orders — ${date} — ${group.name}`]);
  sheet.mergeCells('A1:E1');
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow(['Sr. No.', 'Invoice No.', 'BIT', 'Outlet Name', 'Invoice Amount']);
  group.rows.forEach((row, index) => sheet.addRow([index + 1, String(row.invoice_number || row.id), String(row[bitField] || ''), row.outlet_name || '', invoiceValue(row)]));
  const totalRow = sheet.addRow(['Total Invoice Value', '', '', '', { formula: `SUM(E3:E${group.rows.length + 2})`, result: group.rows.reduce((sum, row) => sum + invoiceValue(row), 0) }]);
  sheet.mergeCells(`A${totalRow.number}:D${totalRow.number}`);
  sheet.getColumn(5).numFmt = '#,##0.00';
  [sheet.getRow(2), totalRow].forEach((row) => {
    row.font = { bold: true };
    row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; });
  });
  sheet.eachRow((row) => { row.alignment = { vertical: 'middle', wrapText: true }; row.height = 28; });
  sheet.views = [{ state: 'frozen', ySplit: 2 }];
  sheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return workbook;
}

export async function downloadAssignmentSheet(group, date, bitField) {
  const workbook = await createAssignmentSheet(group, date, bitField);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url; link.download = `Assignments_${date}_${group.name.replace(/[^a-z0-9_-]/gi, '_')}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pdfMoney = (value) => Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function assignmentSheetHtml(group, date, bitField) {
  const rows = group.rows.map((row, index) => ({
    sr: index + 1,
    invoice: String(row.invoice_number || row.id),
    bit: String(row[bitField] || '—'),
    outlet: row.outlet_name || '',
    amount: pdfMoney(invoiceValue(row)),
  }));
  const total = pdfMoney(group.rows.reduce((sum, row) => sum + invoiceValue(row), 0));
  return ejs.render(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Assignments_<%= date %>_<%= name %></title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #172033; font-size: 12px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      p { color: #475569; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #94a3b8; padding: 7px 8px; text-align: left; overflow-wrap: anywhere; }
      th { background: #dbeafe; }
      .sr { width: 8%; } .inv { width: 20%; } .bit { width: 20%; } .amt { width: 18%; text-align: right; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      .total td { font-weight: bold; background: #dbeafe; }
      button { padding: 10px 16px; margin-bottom: 16px; cursor: pointer; }
      @media print { button, .hint { display: none; } }
    </style></head><body>
      <button onclick="window.print()">Print / Save as PDF</button>
      <p class="hint">Choose Save as PDF in the print dialog to download this sheet.</p>
      <h1>Assigned Orders — <%= name %></h1>
      <p>Date: <%= date %> · <%= rows.length %> orders</p>
      <table><thead><tr><th class="sr">Sr. No.</th><th class="inv">Invoice No.</th><th class="bit">BIT</th><th>Outlet Name</th><th class="amt">Invoice Amount</th></tr></thead>
      <tbody><% rows.forEach(function(row) { %>
        <tr><td><%= row.sr %></td><td><%= row.invoice %></td><td><%= row.bit %></td><td><%= row.outlet %></td><td class="amt"><%= row.amount %></td></tr>
      <% }); %>
        <tr class="total"><td colspan="4">Total Invoice Value</td><td class="amt"><%= total %></td></tr>
      </tbody></table>
    </body></html>`, { rows, total, date, name: group.name });
}

export function printAssignmentSheetPdf(group, date, bitField) {
  const html = assignmentSheetHtml(group, date, bitField);
  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) throw new Error('Please allow popups to download the assignment PDF.');
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { if (!printWindow.closed) printWindow.print(); }, 250);
}
