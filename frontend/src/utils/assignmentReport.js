export const invoiceValue = (row) => Number(row.effective_price ?? row.price) || 0;
export function groupAssignments(rows) {
  const groups = new Map();
  const seen = new Set();
  rows.forEach((row) => {
    if (!row.delivery_boy_id || seen.has(String(row.id))) return;
    seen.add(String(row.id));
    const key = String(row.delivery_boy_id);
    const group = groups.get(key) || { id: key, name: row.delivery_boy_name || `Employee ${key}`, rows: [], total: 0 };
    group.rows.push(row); group.total += invoiceValue(row); groups.set(key, group);
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
