import { buildDeliveryLog, createDeliveryLogWorkbook } from "./deliveryLog";

const sales = [
  { id: 1, company_name: "Everest", location_name: "Airport", packaging_status: "packing_done" },
  { id: 2, company_name: "Everest", location_name: "Airport", packaging_status: "returned" },
  { id: 3, company_name: "Everest", location_name: "Baguiati", packaging_status: "delivered" },
  { id: 4, company_name: "Loyal", location_name: "Airport", original_packaging_status: "packing_done", packaging_status: "out_for_delivery" },
  { id: 5, company_name: "Loyal", location_name: "Airport", packaging_status: "out_for_delivery" },
  { id: 6, packaging_status: "packing_done" },
];

test("counts pending bills once using saved status, retaining zero-count areas and missing labels", () => {
  const report = buildDeliveryLog([...sales, sales[0]]);
  expect(report.total).toBe(4);
  expect(report.rows.filter((row) => row.type === "summary").map((row) => row.cells)).toEqual([
    ["Company not assigned", 1], ["Everest", 2], ["Loyal", 1],
  ]);
  expect(report.rows[0]).toEqual({ type: "header", cells: ["Company / Area", "Airport", "Area not assigned", "Baguiati", "Total pending"] });
  expect(report.rows).toContainEqual({ type: "counts", cells: ["Everest", 2, 0, 0, 2] });
  expect(report.rows).toContainEqual({ type: "counts", cells: ["Loyal", 1, 0, 0, 1] });
  expect(report.rows).toContainEqual({ type: "total", cells: ["Area totals", 3, 1, 0, 4] });
  expect(report.rows.flatMap((row) => row.cells).filter((cell) => cell === "Airport")).toHaveLength(1);
  expect(buildDeliveryLog([]).total).toBe(0);
});

test("moves areas with no pending bills in any company after active areas", () => {
  const report = buildDeliveryLog([
    { id: 1, company_name: "Everest", location_name: "Airport", packaging_status: "delivered" },
    { id: 2, company_name: "Loyal", location_name: "Airport", packaging_status: "out_for_delivery" },
    { id: 3, company_name: "Everest", location_name: "Zoo", packaging_status: "delivered" },
    { id: 4, company_name: "Loyal", location_name: "Zoo", packaging_status: "packing_done" },
    { id: 5, company_name: "Everest", location_name: "Market", packaging_status: "returned" },
  ]);
  expect(report.rows[0].cells).toEqual(["Company / Area", "Market", "Zoo", "Airport", "Total pending"]);
  expect(report.rows).toContainEqual({ type: "counts", cells: ["Everest", 1, 0, 0, 1] });
  expect(report.rows).toContainEqual({ type: "counts", cells: ["Loyal", 0, 1, 0, 1] });
  expect(report.rows).toContainEqual({ type: "total", cells: ["Area totals", 1, 1, 0, 2] });
});

test("Excel preserves the dialog's section order, area counts and company totals", async () => {
  const report = buildDeliveryLog(sales);
  const workbook = await createDeliveryLogWorkbook(report);
  const buffer = await workbook.xlsx.writeBuffer();
  const { default: ExcelJS } = await import("exceljs");
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(buffer);
  const sheet = restored.getWorksheet("Delivery Log");
  report.rows.forEach(({ cells }, index) => {
    cells.forEach((value, column) => expect(sheet.getRow(index + 3).getCell(column + 1).value).toBe(value));
  });
  expect(sheet.getRow(sheet.rowCount).getCell(2).value).toBe(4);
});
