import { matchesSaleCompany } from "utils/companyFilter";

export const unupdatedPaymentColumns = [
  { header: "Invoice Number", key: "invoice_number", width: 22 },
  { header: "Staff Name", key: "staff_name", width: 25 },
  { header: "Area", key: "location_name", width: 25 },
  { header: "Outlet Name", key: "outlet_name", width: 35 },
  { header: "Invoice Price", key: "price", width: 18 },
];

export const getUnupdatedPaymentSales = (rows, companyId) => rows.filter((row) =>
  Boolean(companyId) &&
  matchesSaleCompany(row, companyId) &&
  row.packaging_status === "delivered" &&
  Number(row.payment_count) === 0 &&
  Number(row.paid_amount || 0) === 0
);
