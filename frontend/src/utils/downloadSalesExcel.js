export const sortSalesByInvoice = (rows) => [...rows].sort((a, b) => {
  const left = String(a.invoice_number ?? "").trim();
  const right = String(b.invoice_number ?? "").trim();
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" });
});

export async function createSalesWorkbook(rows, columns) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sales", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns || [
    { header: "Staff Name", key: "staff_name", width: 25 },
    { header: "Company", key: "company_name", width: 30 },
    { header: "Outlet Name", key: "outlet_name", width: 35 },
    { header: "Area", key: "location_name", width: 25 },
    { header: "Sale Date", key: "sale_date", width: 16 },
    { header: "Invoice No", key: "invoice_number", width: 22 },
    { header: "Price", key: "price", width: 16 },
  ];
  sortSalesByInvoice(rows).forEach((row) => {
    const date = String(row.sale_date || "").split(/[T ]/)[0];
    const price = row.price === null || row.price === undefined || row.price === ""
      ? null : Number(row.price);
    sheet.addRow({
      staff_name: String(row.staff_name || ""),
      company_name: String(row.company_name || ""),
      outlet_name: String(row.outlet_name || ""),
      location_name: String(row.location_name || ""),
      sale_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("-") : date,
      invoice_number: String(row.invoice_number ?? ""),
      price: Number.isFinite(price) ? price : null,
    });
  });
  sheet.getColumn("invoice_number").numFmt = "@";
  sheet.getColumn("price").numFmt = "#,##0.00";
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
  return workbook;
}

export async function downloadSalesExcel(rows, filename, columns) {
  const workbook = await createSalesWorkbook(rows, columns);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
