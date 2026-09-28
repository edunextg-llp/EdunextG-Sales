// A single report layout drives both the dialog and its Excel export.
export function buildDeliveryLog(sales, { hideEmptyAreas = false } = {}) {
  const companies = new Map();
  const seen = new Set();
  sales.forEach((sale) => {
    const company = String(sale.company_name || "Company not assigned").trim();
    const area = String(sale.location_name || "Area not assigned").trim();
    if (!companies.has(company)) companies.set(company, new Map());
    const areas = companies.get(company);
    if (!areas.has(area)) areas.set(area, 0);
    const status = sale.original_packaging_status || sale.packaging_status;
    if (!["packing_done", "returned"].includes(status)) return;
    if (sale.id != null && seen.has(String(sale.id))) return;
    if (sale.id != null) seen.add(String(sale.id));
    areas.set(area, areas.get(area) + 1);
  });
  const groups = [...companies].sort(([a], [b]) => a.localeCompare(b)).map(([name, areas]) => ({
    name,
    areas: [...areas].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count })),
    total: [...areas.values()].reduce((sum, count) => sum + count, 0),
  }));
  const areaTotals = new Map();
  groups.forEach((company) => company.areas.forEach((area) => {
    areaTotals.set(area.name, (areaTotals.get(area.name) || 0) + area.count);
  }));
  const areaNames = [...areaTotals.keys()]
    .filter((area) => !hideEmptyAreas || areaTotals.get(area) > 0)
    .sort((a, b) => Number(areaTotals.get(a) === 0) - Number(areaTotals.get(b) === 0) || a.localeCompare(b));
  const width = areaNames.length + 2;
  const rows = [{ type: "header", cells: ["Company / Area", ...areaNames, "Total pending"] }];
  groups.forEach((company) => {
    const counts = new Map(company.areas.map((area) => [area.name, area.count]));
    rows.push({ type: "counts", cells: [company.name, ...areaNames.map((area) => counts.get(area) || 0), company.total] });
  });
  const total = groups.reduce((sum, company) => sum + company.total, 0);
  rows.push({ type: "total", cells: ["Area totals", ...areaNames.map((area) => areaTotals.get(area)), total] });
  rows.push({ type: "spacer", cells: [] });
  rows.push({ type: "section", cells: ["All Companies — Pending Summary"] });
  rows.push({ type: "header", cells: ["Company", "Pending bills"] });
  groups.forEach((company) => rows.push({ type: "summary", cells: [company.name, company.total] }));
  rows.push({ type: "total", cells: ["All companies total", total] });
  return { rows, width, total, companyCount: groups.length };
}

export const deliveryLogColors = {
  section: "DBEAFE", header: "16DFE3", counts: "FFFFFF",
  total: "FEF3C7", summary: "FFFFFF", spacer: "F8FAFC",
};

export async function createDeliveryLogWorkbook(report) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Delivery Log");
  sheet.getColumn(1).width = 34;
  for (let column = 2; column <= report.width; column += 1) sheet.getColumn(column).width = 22;
  const title = sheet.addRow(["Delivery Log — Pending Deliveries"]);
  sheet.mergeCells(title.number, 1, title.number, report.width);
  title.font = { bold: true, size: 16, color: { argb: "FF1E3A5F" } };
  title.height = 30;
  sheet.addRow(["All companies • Packed and returned bills awaiting delivery"]);
  sheet.mergeCells(2, 1, 2, report.width);
  sheet.getRow(2).height = 30;
  sheet.getRow(2).alignment = { wrapText: true, vertical: "middle" };
  report.rows.forEach(({ type, cells }) => {
    const row = sheet.addRow(cells);
    row.height = type === "spacer" ? 12 : 38;
    if (type === "section") sheet.mergeCells(row.number, 1, row.number, 2);
    const styledColumns = type === "section" ? 2 : type === "spacer" ? report.width : cells.length;
    for (let column = 1; column <= styledColumns; column += 1) {
      const cell = row.getCell(column);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${deliveryLogColors[type]}` } };
      cell.font = { name: "Calibri", size: 11, bold: ["section", "header", "total"].includes(type) };
      cell.alignment = { vertical: "middle", horizontal: column === 1 ? "left" : "center", wrapText: true };
      if (type !== "spacer") cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
      if (typeof cell.value === "number") cell.numFmt = "0";
    }
  });
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return workbook;
}

export async function downloadDeliveryLog(report) {
  const workbook = await createDeliveryLogWorkbook(report);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "Delivery_Log.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
