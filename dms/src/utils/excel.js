// One Excel export for every DMS page.
// exceljs loads only when someone downloads, so it stays out of the main bundle.
//
// downloadExcel({
//   fileName: "Sellers_EVEREST",          // date + .xlsx are added
//   title: "Sellers · EVEREST",           // optional first line on each sheet
//   sheets: [{ name: "Sellers", columns: [{ header, key, width, type }], rows: [...] }],
//   (a sheet may set totalLabel: the first cell of its totals row, "Total" by default)
// })
// column type: "text" (default, kept as text so codes like 0910 stay intact),
//              "number", "money", "rate" (4 decimals), "percent", "date"

const FORMATS = {
  number: "#,##0.##",
  money: "#,##0.00",
  rate: "#,##0.0000",
  percent: "0.##\"%\"",
  date: "dd-mm-yyyy",
  text: "@",
};

const toCell = (value, type) => {
  if (value == null || value === "") return null;
  if (type === "number" || type === "money" || type === "rate" || type === "percent") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "date") {
    const s = String(value);
    const ymd = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      const [y, m, d] = ymd.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    const date = new Date(s.replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? s : date;
  }
  return String(value);
};

const safeSheetName = (name, used) => {
  let base = String(name || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
  let n = 2;
  let out = base;
  while (used.has(out)) out = `${base.slice(0, 28)} ${n++}`;
  used.add(out);
  return out;
};

export const fileSafe = (text) =>
  String(text || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40);

export async function downloadExcel({ fileName, title, sheets }) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const used = new Set();

  sheets.forEach((sheetDef) => {
    const { columns, rows } = sheetDef;
    const sheet = workbook.addWorksheet(safeSheetName(sheetDef.name, used));
    let headerRowNo = 1;

    if (title) {
      sheet.addRow([title]);
      sheet.getRow(1).font = { bold: true, size: 13 };
      sheet.addRow([`Downloaded ${new Date().toLocaleString("en-GB")}`]);
      sheet.getRow(2).font = { italic: true, color: { argb: "FF5B6B85" } };
      sheet.addRow([]);
      headerRowNo = 4;
    }

    const header = sheet.addRow(columns.map((c) => c.header));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    header.alignment = { vertical: "middle", wrapText: true };
    header.height = 22;

    columns.forEach((c, i) => {
      const col = sheet.getColumn(i + 1);
      col.width = c.width || Math.max(10, Math.min(40, String(c.header).length + 4));
      col.numFmt = FORMATS[c.type || "text"];
      if (c.type && c.type !== "text" && c.type !== "date") col.alignment = { horizontal: "right" };
    });

    rows.forEach((row, index) => {
      sheet.addRow(
        columns.map((c) => {
          const raw = typeof c.value === "function" ? c.value(row, index) : row[c.key];
          return toCell(raw, c.type);
        })
      );
    });

    // Totals row for columns marked `total: true`
    if (rows.length && columns.some((c) => c.total)) {
      const firstData = headerRowNo + 1;
      const lastData = headerRowNo + rows.length;
      const totalRow = sheet.addRow(
        columns.map((c, i) => {
          if (i === 0) return sheetDef.totalLabel || "Total";
          if (!c.total) return null;
          const letter = sheet.getColumn(i + 1).letter;
          return { formula: `SUM(${letter}${firstData}:${letter}${lastData})` };
        })
      );
      totalRow.font = { bold: true };
      totalRow.border = { top: { style: "thin", color: { argb: "FF8A9AB5" } } };
    }

    sheet.views = [{ state: "frozen", ySplit: headerRowNo }];
    sheet.autoFilter = {
      from: { row: headerRowNo, column: 1 },
      to: { row: headerRowNo, column: columns.length },
    };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const today = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${[fileName, today].filter(Boolean).join("_")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
