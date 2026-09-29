import { groupAssignments, createAssignmentSheet } from './assignmentReport';

const rows = [
  { id: 1, delivery_boy_id: 7, delivery_boy_name: 'A', invoice_number: '001', location_name: 'North', outlet_name: 'Shop', price: '120.50', effective_price: '100.50' },
  { id: 2, delivery_boy_id: 7, delivery_boy_name: 'A', price: '25.25' },
  { id: 3, delivery_boy_id: null, price: 900 },
];
test('groups assigned invoices once and totals invoice values', () => {
  const groups = groupAssignments([...rows, rows[0]]);
  expect(groups).toHaveLength(1);
  expect(groups[0].rows).toHaveLength(2);
  expect(groups[0].total).toBe(125.75);
});
test('download contains requested columns, text invoice numbers, and a total formula', async () => {
  const workbook = await createAssignmentSheet(groupAssignments(rows)[0], '2026-09-01', 'location_name');
  const sheet = workbook.getWorksheet('Assigned Orders');
  expect(sheet.getRow(2).values.slice(1)).toEqual(['Sr. No.', 'Invoice No.', 'BIT', 'Outlet Name', 'Invoice Amount']);
  expect(sheet.getCell('B3').value).toBe('001');
  expect(sheet.getCell('C3').value).toBe('North');
  expect(sheet.getCell('E5').value).toEqual({ formula: 'SUM(E3:E4)', result: 125.75 });
  expect((await workbook.xlsx.writeBuffer()).byteLength).toBeGreaterThan(0);
});
