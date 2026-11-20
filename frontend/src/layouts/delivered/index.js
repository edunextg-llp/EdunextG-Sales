// Delivery Manager > Delivered: Tailwind CSS (no MUI). Status updates, cancel / return, invoice PDFs and reports unchanged.
import { useState, useEffect, useCallback, useMemo } from "react";

import SalesExcelButton from "components/SalesExcelButton";
import CompanyFilter from "components/CompanyFilter";
import { matchesSaleCompany } from "utils/companyFilter";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useSalesPolling } from "utils/salesSync";
import { ROWS_PER_PAGE } from "utils/tablePagination";
import { printSalesInvoicePdf } from "utils/printSalesInvoicePdf";
import { COMPANY_TYPES, useCompanyTypeLookup } from "utils/companyTypes";
import { useAuth } from "context/AuthContext";
import {
  Badge, Card, Field, Icon, Modal, PageHeader, Pagination, SearchBox, Segmented, btn, fieldClass,
} from "components/tw";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function Delivered() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [salesData, setSalesData] = useState([]);
  const [cancelledSalesData, setCancelledSalesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyType, setCompanyType] = useState("");
  const { matches: companyMatchesType } = useCompanyTypeLookup();
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const [cancelRangeStart, setCancelRangeStart] = useState("");
  const [cancelRangeEnd, setCancelRangeEnd] = useState("");
  const [deliveryRangeStart, setDeliveryRangeStart] = useState("");
  const [deliveryRangeEnd, setDeliveryRangeEnd] = useState("");
  const [updatingSaleIds, setUpdatingSaleIds] = useState(new Set());
  const [cancelReportOpen, setCancelReportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("delivered");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);
  const API = (process.env.REACT_APP_API_URL);

  const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    const dateOnly = String(value).split("T")[0].split(" ")[0];
    const parts = dateOnly.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return value;
  };

  const getDateOnly = (value) => {
    if (!value) return "";
    return String(value).split("T")[0].split(" ")[0];
  };

  const getCompanyIds = (row) =>
    String(row?.company_ids || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

  const fetchSales = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fetch(`${API}/staff/sales/by-date`);
      if (response.ok) {
        const data = await response.json();
        setSalesData(data);
      } else if (!silent) {
        setSalesData([]);
      }
    } catch (error) {
      if (!silent) {
        console.error("Error fetching global sales:", error);
      }
    }
  }, [API]);

  const fetchCancelledSales = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fetch(`${API}/staff/sales/cancelled`);
      if (response.ok) {
        const data = await response.json();
        setCancelledSalesData(data);
      } else if (!silent) {
        setCancelledSalesData([]);
      }
    } catch (error) {
      if (!silent) {
        console.error("Error fetching cancelled sales:", error);
      }
    }
  }, [API]);

  useEffect(() => {
    fetchSales();
    fetchCancelledSales();
  }, [fetchSales, fetchCancelledSales]);

  useSalesPolling(() => {
    fetchSales({ silent: true });
    fetchCancelledSales({ silent: true });
  });

  useEffect(() => {
    setPage(1);
  }, [
    activeTab,
    searchQuery,
    companyFilter,
    selectedCompanyId,
    selectedStaffId,
    selectedArea,
    cancelRangeStart,
    cancelRangeEnd,
    deliveryRangeStart,
    deliveryRangeEnd,
    rowsPerPage,
  ]);

  const companyOptions = useMemo(() => {
    const companies = new Map();

    cancelledSalesData.forEach((row) => {
      const ids = getCompanyIds(row);
      const names = String(row.company_name || "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);

      ids.forEach((id, index) => {
        if (!companies.has(id)) {
          companies.set(id, names[index] || names[0] || `Company ${id}`);
        }
      });
    });

    return [...companies.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cancelledSalesData]);

  const staffOptions = useMemo(() => {
    const staff = new Map();

    cancelledSalesData.forEach((row) => {
      if (!row.staff_id) return;
      if (selectedCompanyId && !getCompanyIds(row).includes(Number(selectedCompanyId))) return;
      if (!staff.has(row.staff_id)) {
        staff.set(row.staff_id, row.staff_name || `Staff ${row.staff_id}`);
      }
    });

    return [...staff.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cancelledSalesData, selectedCompanyId]);

  const selectedCompanyName =
    companyOptions.find((company) => company.id === Number(selectedCompanyId))?.name || "";
  const selectedStaffName =
    staffOptions.find((staff) => staff.id === Number(selectedStaffId))?.name || "";

  const areaOptions = useMemo(() => [...new Set(cancelledSalesData
    .filter((row) => !selectedCompanyId || getCompanyIds(row).includes(Number(selectedCompanyId)))
    .filter((row) => !selectedStaffId || Number(row.staff_id) === Number(selectedStaffId))
    .map((row) => row.location_name)
    .filter(Boolean))].sort(), [cancelledSalesData, selectedCompanyId, selectedStaffId]);

  const handleCompanyChange = (value) => {
    setSelectedCompanyId(value);
    setSelectedStaffId("");
    setSelectedArea("");
  };

  const typedCompanyOptions = companyOptions.filter((company) =>
    companyMatchesType(company, companyType)
  );

  const handleCompanyTypeChange = (type) => {
    setCompanyType(type);
    if (selectedCompanyId && type && !companyMatchesType(selectedCompanyId, type)) {
      handleCompanyChange("");
    }
  };

  const matchesDeliveryDateRange = (row) => {
    const deliveryDate = getDateOnly(row.delivery_date);
    if (deliveryRangeStart && (!deliveryDate || deliveryDate < deliveryRangeStart)) {
      return false;
    }
    if (deliveryRangeEnd && (!deliveryDate || deliveryDate > deliveryRangeEnd)) {
      return false;
    }
    return true;
  };

  const filteredSales = salesData.filter((row) => {
    if (!matchesSaleCompany(row, companyFilter)) return false;
    const st = row.packaging_status;
    if (st !== 'out_for_delivery' && st !== 'delivered' && st !== 'returned') return false;
    if (!matchesDeliveryDateRange(row)) return false;

    const search = searchQuery.toLowerCase();
    const outletName = row.outlet_name ? row.outlet_name.toLowerCase() : "";
    const outletArea = row.location_name ? row.location_name.toLowerCase() : "";
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    const staffName = row.staff_name ? row.staff_name.toLowerCase() : "";
    const companyName = row.company_name ? row.company_name.toLowerCase() : "";
    const saleId = row.sticker_number ? row.sticker_number.toLowerCase() : "";
    const invoiceNumber = row.invoice_number ? String(row.invoice_number).toLowerCase() : "";
    return (
      outletName.includes(search) ||
      outletArea.includes(search) ||
      outletErpId.includes(search) ||
      staffName.includes(search) ||
      companyName.includes(search) ||
      saleId.includes(search) ||
      invoiceNumber.includes(search)
    );
  });

  const filteredCancelledSales = cancelledSalesData.filter((row) => {
    if (selectedCompanyId && !getCompanyIds(row).includes(Number(selectedCompanyId))) {
      return false;
    }
    if (selectedStaffId && Number(row.staff_id) !== Number(selectedStaffId)) {
      return false;
    }
    if (selectedArea && row.location_name !== selectedArea) {
      return false;
    }

    const cancelDate = getDateOnly(row.delivery_date || row.status_updated_at);
    if (cancelRangeStart && (!cancelDate || cancelDate < cancelRangeStart)) {
      return false;
    }
    if (cancelRangeEnd && (!cancelDate || cancelDate > cancelRangeEnd)) {
      return false;
    }

    const search = searchQuery.toLowerCase();
    const outletName = row.outlet_name ? row.outlet_name.toLowerCase() : "";
    const outletArea = row.location_name ? row.location_name.toLowerCase() : "";
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    const staffName = row.staff_name ? row.staff_name.toLowerCase() : "";
    const saleId = row.sticker_number ? row.sticker_number.toLowerCase() : "";
    const companyName = row.company_name ? row.company_name.toLowerCase() : "";
    const invoiceNumber = row.invoice_number ? String(row.invoice_number).toLowerCase() : "";
    return (
      outletName.includes(search) ||
      outletArea.includes(search) ||
      outletErpId.includes(search) ||
      staffName.includes(search) ||
      saleId.includes(search) ||
      companyName.includes(search) ||
      invoiceNumber.includes(search)
    );
  });

  const deliveredTotal = filteredSales.filter((row) => row.packaging_status === "delivered").length;
  const pendingDeliveryTotal = filteredSales.filter((row) => row.packaging_status === "out_for_delivery").length;
  const cancelledTotal = filteredCancelledSales.length;
  const returnedSales = filteredSales
    .filter((row) => row.packaging_status === "returned")
    .sort((a, b) =>
      getDateOnly(a.delivery_date || a.status_updated_at).localeCompare(
        getDateOnly(b.delivery_date || b.status_updated_at)
      )
    );
  const returnedTotal = returnedSales.length;
  const pendingSales = filteredSales.filter((row) => row.packaging_status === "out_for_delivery");
  const cancelledSales = filteredCancelledSales;
  const activeList =
    activeTab === "cancelled"
      ? cancelledSales
      : activeTab === "pending"
        ? pendingSales
        : activeTab === "returned"
          ? returnedSales
          : filteredSales;
  const totalPages = Math.max(1, Math.ceil(activeList.length / rowsPerPage));
  const paginatedActiveList = activeList.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );
  const cancelledAmount = cancelledSales.reduce(
    (total, row) => total + (Number(row.price) || 0),
    0
  );
  const reportCompanyLabel = selectedCompanyName || "All Companies";
  const reportStaffLabel = selectedStaffName || "All Staff";
  const reportAreaLabel = selectedArea || "All Areas";
  const reportRangeLabel =
    cancelRangeStart || cancelRangeEnd
      ? `${cancelRangeStart ? formatDate(cancelRangeStart) : "Start"} to ${cancelRangeEnd ? formatDate(cancelRangeEnd) : "Today"
      }`
      : "All Dates";
  const deliveryRangeLabel =
    deliveryRangeStart || deliveryRangeEnd
      ? `${deliveryRangeStart ? formatDate(deliveryRangeStart) : "Start"} to ${deliveryRangeEnd ? formatDate(deliveryRangeEnd) : "Today"
      }`
      : "All Dates";

  const mapSaleForInvoicePdf = (row) => ({
    invoiceNumber: row.invoice_number,
    stickerNumber: row.sticker_number,
    itemCount: row.item_count ?? row.packed_item_count ?? "",
    amount: row.price,
    lineItems: [],
    outletId: row.outlet_id,
    shopName: row.outlet_name,
    outletErpId: row.outlet_erp_id || "",
    locationName: row.location_name || "",
    staffName: row.staff_name || "",
  });

  const downloadOutletInvoicePdf = (row) => {
    const outletSales = filteredSales
      .filter((sale) => Number(sale.outlet_id) === Number(row.outlet_id))
      .map(mapSaleForInvoicePdf);

    if (!outletSales.length) {
      alert("No invoices found for this outlet.");
      return;
    }

    printSalesInvoicePdf({
      outletName: row.outlet_name,
      outletErpId: row.outlet_erp_id || "",
      locationName: row.location_name || "",
      saleDate: formatDate(row.delivery_date || row.sale_date) || deliveryRangeLabel,
      staffName: row.staff_name || "",
      companyName: row.company_name || "",
      invoices: outletSales,
    });
  };

  const downloadAllDeliveredInvoicePdfs = () => {
    const sourceRows =
      activeTab === "pending"
        ? pendingSales
        : activeTab === "returned"
          ? returnedSales
          : filteredSales.filter(
          (row) =>
            row.packaging_status === "delivered" ||
            row.packaging_status === "returned" ||
            row.packaging_status === "out_for_delivery"
        );

    const byOutlet = new Map();
    sourceRows.forEach((row) => {
      const key = String(row.outlet_id ?? "");
      if (!byOutlet.has(key)) byOutlet.set(key, []);
      byOutlet.get(key).push(row);
    });

    const groups = Array.from(byOutlet.values());
    if (!groups.length) {
      alert("No invoices available to download.");
      return;
    }

    groups.forEach((outletRows, index) => {
      const first = outletRows[0];
      setTimeout(() => {
        printSalesInvoicePdf({
          outletName: first.outlet_name,
          outletErpId: first.outlet_erp_id || "",
          locationName: first.location_name || "",
          saleDate: formatDate(first.delivery_date || first.sale_date) || deliveryRangeLabel,
          staffName: first.staff_name || "",
          companyName: first.company_name || "",
          invoices: outletRows.map(mapSaleForInvoicePdf),
        });
      }, index * 500);
    });
  };

  const buildSummary = (rows, getKey) => {
    const summary = new Map();
    rows.forEach((row) => {
      const key = getKey(row) || "N/A";
      const current = summary.get(key) || { name: key, count: 0, amount: 0 };
      current.count += 1;
      current.amount += Number(row.price) || 0;
      summary.set(key, current);
    });
    return [...summary.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  const staffCancelSummary = buildSummary(cancelledSales, (row) => row.staff_name || "Unknown Staff");
  const companyCancelSummary = buildSummary(cancelledSales, (row) => row.company_name || "Unknown Company");
  const areaCancelSummary = buildSummary(cancelledSales, (row) => row.location_name || "Unknown Area");
  const rangeCancelSummary = buildSummary(cancelledSales, (row) =>
    formatDate(row.delivery_date || row.status_updated_at)
  );

  const renderSummaryRows = (summary) =>
    summary
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.name)}</td>
            <td class="right">${row.count}</td>
            <td class="right">Rs. ${row.amount.toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

  const renderSummaryTable = (title, label, summary) => `
    <div class="summary-block">
      <h2>${escapeHtml(title)}</h2>
      ${summary.length > 0
      ? `<table>
              <thead>
                <tr>
                  <th>Sr No</th>
                  <th>${escapeHtml(label)}</th>
                  <th class="right">Cancel Count</th>
                  <th class="right">Cancel Amount</th>
                </tr>
              </thead>
              <tbody>${renderSummaryRows(summary)}</tbody>
            </table>`
      : `<div class="empty">No cancelled invoices found.</div>`
    }
    </div>
  `;

  const handleDownloadCancelReport = () => {
    const rowsHtml = cancelledSales
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.sticker_number || "N/A")}</td>
            <td>${escapeHtml(row.staff_name || "N/A")}</td>
            <td>${escapeHtml(row.company_name || "N/A")}</td>
            <td>${escapeHtml(formatDate(row.sale_date))}</td>
            <td>${escapeHtml(formatDate(row.delivery_date || row.status_updated_at))}</td>
            <td>${escapeHtml(row.outlet_erp_id || "N/A")}</td>
            <td>${escapeHtml(row.outlet_name || "N/A")}</td>
            <td>${escapeHtml(row.location_name || "N/A")}</td>
            <td>${escapeHtml(row.invoice_number || "N/A")}</td>
            <td class="right">Rs. ${Number(row.price || 0).toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) {
      alert("Please allow popups to download the report.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Cancelled Invoice Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
            h1 { font-size: 22px; margin: 0 0 6px; }
            h2 { color: #7f1d1d; font-size: 15px; margin: 18px 0 8px; }
            .sub { color: #4b5563; margin-bottom: 14px; font-size: 13px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 20px; margin-bottom: 14px; font-size: 12px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
            .meta strong { display: inline-block; min-width: 90px; color: #4b5563; }
            .total { display: inline-block; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; padding: 10px 12px; border-radius: 6px; font-weight: 700; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; vertical-align: top; }
            th { background: #fef2f2; font-weight: 700; color: #7f1d1d; }
            .right { text-align: right; white-space: nowrap; }
            .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
            .summary-block { page-break-inside: avoid; }
            .empty { padding: 24px; text-align: center; color: #6b7280; border: 1px solid #d1d5db; }
            @media print { body { margin: 12mm; } .summary-grid { display: block; } }
          </style>
        </head>
        <body>
          <h1>Cancelled Invoice Report</h1>
          <div class="sub">Company-wise, staff-wise, area-wise, and date-wise cancelled invoice totals.</div>
          <div class="meta">
            <div><strong>Company:</strong> ${escapeHtml(reportCompanyLabel)}</div>
            <div><strong>Staff:</strong> ${escapeHtml(reportStaffLabel)}</div>
            <div><strong>Area:</strong> ${escapeHtml(reportAreaLabel)}</div>
            <div><strong>Range:</strong> ${escapeHtml(reportRangeLabel)}</div>
            <div><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString("en-GB"))}</div>
          </div>
          <div class="total">Total Cancel Amount: Rs. ${cancelledAmount.toFixed(2)}</div>
          <div class="summary-grid">
            ${renderSummaryTable("Staff Wise Total", "Staff Name", staffCancelSummary)}
            ${renderSummaryTable("Company Wise Total", "Company Name", companyCancelSummary)}
            ${renderSummaryTable("Area Wise Total", "Area Name", areaCancelSummary)}
            ${renderSummaryTable("Range Wise Total", "Cancel Date", rangeCancelSummary)}
          </div>
          <h2>Cancelled Invoice Details</h2>
          ${cancelledSales.length > 0
        ? `<table>
                  <thead>
                    <tr>
                      <th>Sr No</th>
                      <th>Sale ID</th>
                      <th>Staff Name</th>
                      <th>Company</th>
                      <th>Invoice Date</th>
                      <th>Cancel Date</th>
                      <th>ERP ID</th>
                      <th>Outlet Name</th>
                      <th>Area</th>
                      <th>Invoice No</th>
                      <th class="right">Cancel Amount</th>
                    </tr>
                  </thead>
                  <tbody>${rowsHtml}</tbody>
                </table>`
        : `<div class="empty">No cancelled invoices found.</div>`
      }
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const returnedAmount = returnedSales.reduce((total, row) => total + (Number(row.price) || 0), 0);
  // Keyed by ISO date so the summary sorts chronologically, then formatted for display.
  const dateReturnSummary = buildSummary(returnedSales, (row) =>
    getDateOnly(row.delivery_date || row.status_updated_at)
  ).map((row) => ({ ...row, name: formatDate(row.name) }));

  const handleDownloadReturnReport = () => {
    if (!returnedSales.length) {
      alert("No returned items found for the selected filters.");
      return;
    }

    const summaryHtml = dateReturnSummary
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.name)}</td>
            <td class="right">${row.count}</td>
            <td class="right">Rs. ${row.amount.toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

    const rowsHtml = returnedSales
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(formatDate(row.delivery_date || row.status_updated_at))}</td>
            <td>${escapeHtml(row.sticker_number || "N/A")}</td>
            <td>${escapeHtml(row.staff_name || "N/A")}</td>
            <td>${escapeHtml(row.company_name || "N/A")}</td>
            <td>${escapeHtml(row.outlet_erp_id || "N/A")}</td>
            <td>${escapeHtml(row.outlet_name || "N/A")}</td>
            <td>${escapeHtml(row.location_name || "N/A")}</td>
            <td>${escapeHtml(row.invoice_number || "N/A")}</td>
            <td>${escapeHtml(row.delivery_boy_name || "N/A")}</td>
            <td class="right">Rs. ${Number(row.price || 0).toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) {
      alert("Please allow popups to download the report.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Date Wise Return Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
            h1 { font-size: 22px; margin: 0 0 6px; }
            h2 { color: #9a3412; font-size: 15px; margin: 18px 0 8px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 20px; margin-bottom: 14px; font-size: 12px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
            .meta strong { display: inline-block; min-width: 90px; color: #4b5563; }
            .total { display: inline-block; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; padding: 10px 12px; border-radius: 6px; font-weight: 700; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; vertical-align: top; }
            th { background: #fff7ed; font-weight: 700; color: #9a3412; }
            .right { text-align: right; white-space: nowrap; }
            tfoot td { font-weight: 700; background: #f8fafc; }
            @media print { body { margin: 12mm; } }
          </style>
        </head>
        <body>
          <h1>Date Wise Return Report</h1>
          <div class="meta">
            <div><strong>Date Range:</strong> ${escapeHtml(deliveryRangeLabel)}</div>
            <div><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString("en-GB"))}</div>
          </div>
          <div class="total">Total Returned: ${returnedSales.length} | Amount: Rs. ${returnedAmount.toFixed(2)}</div>
          <h2>Date Wise Total</h2>
          <table>
            <thead>
              <tr>
                <th>Sr No</th>
                <th>Return Date</th>
                <th class="right">Return Count</th>
                <th class="right">Return Amount</th>
              </tr>
            </thead>
            <tbody>${summaryHtml}</tbody>
            <tfoot>
              <tr>
                <td></td>
                <td>Total</td>
                <td class="right">${returnedSales.length}</td>
                <td class="right">Rs. ${returnedAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <h2>Returned Invoice Details</h2>
          <table>
            <thead>
              <tr>
                <th>Sr No</th>
                <th>Return Date</th>
                <th>Sale ID</th>
                <th>Staff Name</th>
                <th>Company</th>
                <th>ERP ID</th>
                <th>Outlet Name</th>
                <th>Area</th>
                <th>Invoice No</th>
                <th>Delivery Boy</th>
                <th class="right">Return Amount</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleUpdateStatus = async (saleId, newStatus, currentDeliveryBoy, currentVehicle, currentDeliveryDate) => {
    if (updatingSaleIds.has(saleId)) return;

    const currentRow = salesData.find((row) => row.id === saleId);
    if (!currentRow) return;

    let cancellationReason = "";
    if (newStatus === "cancelled") {
      cancellationReason = String(window.prompt("Enter cancellation reason:") || "").trim();
      if (!cancellationReason) {
        alert("Cancellation reason is required.");
        return;
      }
    }

    setUpdatingSaleIds((prev) => new Set(prev).add(saleId));

    try {
      const payload = {
        packagingStatus: newStatus,
        deliveryBoyId: currentDeliveryBoy || null,
        vehicleNo: currentVehicle || null,
        deliveryDate:
          newStatus === "out_for_delivery" || newStatus === "delivered" || newStatus === "cancelled" || newStatus === "returned"
            ? currentDeliveryDate || getTodayLocalDate()
            : null,
        expectedStatus: currentRow.packaging_status,
        cancellationReason,
      };

      const response = await fetch(`${API}/staff/sales/${saleId}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (newStatus === "packing_done" || newStatus === "cancelled") {
          // packing_done → Delivery; cancelled → cancelled report only (not Add Sales).
          setSalesData((prevData) => prevData.filter((row) => row.id !== saleId));
          if (newStatus === "cancelled") {
            fetchCancelledSales({ silent: true });
            setActiveTab("cancelled");
          }
        } else {
          const updated = data.sale;
          setSalesData((prevData) =>
            prevData.map((row) => (row.id === saleId ? { ...row, ...updated } : row))
          );
        }
      } else if (response.status === 409) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "This record was updated by another user.");
        fetchSales();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || "Failed to update status.");
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setUpdatingSaleIds((prev) => {
        const next = new Set(prev);
        next.delete(saleId);
        return next;
      });
    }
  };

  const handleReturnCancelled = async (row) => {
    if (updatingSaleIds.has(row.id)) return;
    const input = window.prompt(`Enter the reason for returning invoice ${row.invoice_number || row.sticker_number} to Pending Deliveries:`);
    if (input === null) return;
    const reason = input.trim();
    if (!reason) {
      alert("Return reason is required.");
      return;
    }

    setUpdatingSaleIds((prev) => new Set(prev).add(row.id));
    try {
      const response = await fetch(`${API}/staff/sales/${row.id}/undo-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setCancelledSalesData((prev) => prev.filter((sale) => sale.id !== row.id));
        fetchSales({ silent: true });
        alert(data.message || "Invoice returned.");
      } else {
        alert(data.error || "Unable to return this invoice.");
        fetchCancelledSales({ silent: true });
      }
    } catch (error) {
      console.error("Error returning cancelled invoice:", error);
      alert("Unable to return this invoice.");
    } finally {
      setUpdatingSaleIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const head = "sticky top-0 z-[1] whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide";
  const cell = "border-t px-3 py-2.5 text-[12.5px]";
  const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const mini = "whitespace-nowrap bg-red-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-red-800";
  const miniTd = "border-t border-red-100 px-3 py-2 text-[12.5px]";
  const statusBadge = (status) => (status === "returned" ? <Badge tone="amber" icon="undo">Returned</Badge>
    : status === "delivered" ? <Badge tone="green" icon="check_circle">Delivered</Badge>
      : status === "out_for_delivery" ? <Badge tone="blue" icon="local_shipping">Pending Delivery</Badge>
        : <Badge>{status || "Unknown"}</Badge>);
  const tile = (title, value, icon, tone, onClick) => (
    <button
      type="button" onClick={onClick} disabled={!onClick}
      className={`flex min-w-40 items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left transition enabled:cursor-pointer enabled:hover:shadow-sm ${tone}`}
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-current/10"><Icon name={icon} className="text-[22px]" /></span>
      <span>
        <span className="block text-[22px] font-bold leading-none tabular-nums text-slate-900">{value}</span>
        <span className="mt-1 block text-[12px] font-medium text-slate-500">{title}</span>
      </span>
    </button>
  );
  const companyTypeSelect = (id) => (
    <Field label="Company type" width="w-36">
      <select id={id} className={fieldClass} value={companyType} onChange={(e) => handleCompanyTypeChange(e.target.value)}>
        <option value="">All types</option>
        {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
    </Field>
  );
  const cancelFilters = (prefix) => (
    <>
      {companyTypeSelect(`${prefix}-company-type`)}
      <Field label="Company" width="w-44">
        <select className={fieldClass} value={selectedCompanyId} onChange={(e) => handleCompanyChange(e.target.value)}>
          <option value="">All companies</option>
          {typedCompanyOptions.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </Field>
      <Field label="Staff" width="w-44">
        <select className={fieldClass} value={selectedStaffId} onChange={(e) => { setSelectedStaffId(e.target.value); setSelectedArea(""); }}>
          <option value="">All staff</option>
          {staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
        </select>
      </Field>
      <Field label="Area" width="w-40">
        <select className={fieldClass} value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}>
          <option value="">All areas</option>
          {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
        </select>
      </Field>
      <Field label="Cancel from" width="w-36"><input type="date" className={fieldClass} value={cancelRangeStart} onChange={(e) => setCancelRangeStart(e.target.value)} /></Field>
      <Field label="Cancel to" width="w-36"><input type="date" className={fieldClass} value={cancelRangeEnd} onChange={(e) => setCancelRangeEnd(e.target.value)} /></Field>
    </>
  );
  const actionIcon = (title, icon, color, onClick, disabled = false) => (
    <button type="button" className={`${btn.icon} ${color}`} title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      <Icon name={icon} className="text-[19px]" />
    </button>
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Delivered Items"
          description="Bills out for delivery, delivered, returned and cancelled. Mark deliveries, cancel or return bills, and download invoice PDFs and reports."
          actions={<SalesExcelButton rows={activeList} filename={activeTab === "pending" ? "Pending_Delivery" : activeTab === "returned" ? "Returned_Deliveries" : activeTab === "cancelled" ? "Cancelled_Deliveries" : "Active_Deliveries"} />}
        />

        <div className="mb-5 flex flex-wrap gap-3">
          {tile("Pending delivery", pendingDeliveryTotal, "local_shipping", "border-blue-200 text-blue-600", () => setActiveTab("pending"))}
          {tile("Total delivered", deliveredTotal, "check_circle", "border-emerald-200 text-emerald-600", null)}
          {tile("Total returned", returnedTotal, "undo", "border-amber-200 text-amber-600", () => setActiveTab("returned"))}
          {tile("Total cancelled", cancelledTotal, "cancel", "border-red-200 text-red-600", () => { setActiveTab("cancelled"); setCancelReportOpen(true); })}
        </div>

        <Card>
          <div className="space-y-3 border-b border-slate-100 px-4 py-3">
            <Segmented
              label="Delivered lists" value={activeTab} onChange={setActiveTab}
              options={[
                ["delivered", "Active Deliveries"],
                ["pending", `Pending Delivery (${pendingDeliveryTotal})`],
                ["returned", `Returned Items (${returnedTotal})`],
                ["cancelled", `Cancelled Items (${cancelledTotal})`],
              ]}
            />
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-64 grow flex-col gap-1">
                <span className={label}>Search</span>
                <SearchBox value={searchQuery} onChange={setSearchQuery} className="w-full" placeholder="Outlet, area, ERP ID, staff, sale ID or invoice no." />
              </div>
              {activeTab !== "cancelled" ? (
                <>
                  <div className="w-full sm:w-96"><CompanyFilter id="delivered-company-filter" rows={salesData} value={companyFilter} onChange={setCompanyFilter} /></div>
                  <Field label="Delivery from" width="w-36"><input type="date" className={fieldClass} value={deliveryRangeStart} onChange={(e) => setDeliveryRangeStart(e.target.value)} /></Field>
                  <Field label="Delivery to" width="w-36"><input type="date" className={fieldClass} value={deliveryRangeEnd} onChange={(e) => setDeliveryRangeEnd(e.target.value)} /></Field>
                </>
              ) : cancelFilters("cancel-page")}
            </div>
          </div>

          {activeTab !== "cancelled" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-[12.5px] text-slate-500">
                  {(deliveryRangeStart || deliveryRangeEnd) && (
                    <>
                      Delivery date: <b className="text-slate-700">{deliveryRangeLabel}</b>
                      {activeTab === "pending" ? " · Pending only" : activeTab === "returned" ? " · Returned only" : " · Delivered, pending, and returned"}
                    </>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === "returned" && (
                    <>
                      <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-[12.5px] font-semibold text-amber-800">
                        Total: {returnedTotal} · Amount: ₹{returnedAmount.toFixed(2)}
                      </span>
                      <button type="button" className={`${btn.primary} bg-amber-500 hover:bg-amber-600`} onClick={handleDownloadReturnReport}>
                        <Icon name="picture_as_pdf" className="text-[18px]" />Date Wise Return Report
                      </button>
                    </>
                  )}
                  <button type="button" className={btn.outline} onClick={downloadAllDeliveredInvoicePdfs}>
                    <Icon name="picture_as_pdf" className="text-[18px] text-blue-600" />Download Invoice PDF
                  </button>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-auto border-t border-slate-100">
                <table className="w-full min-w-[1400px] border-separate border-spacing-0">
                  <thead>
                    <tr className="[&>th]:bg-slate-50 [&>th]:text-slate-500">
                      <th className={`${head} text-center`}>#</th>
                      {["Staff", "Company", "Outlet", "Area", "ERP ID"].map((h) => <th key={h} className={`${head} text-left`}>{h}</th>)}
                      <th className={`${head} text-center`}>Sale ID</th>
                      <th className={`${head} text-center`}>Invoice no</th>
                      <th className={`${head} text-right`}>Price</th>
                      {["Items", "Packed", "Boxes", "Packets", "Delivery boy", "Vehicle", "Delivery date", "Status", "Action"].map((h) => <th key={h} className={`${head} text-center`}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedActiveList.length > 0 ? paginatedActiveList.map((row, index) => {
                      const td = `${cell} border-slate-200/70`;
                      const rowBg = row.packaging_status === "returned" ? "bg-amber-50/60" : row.packaging_status === "delivered" ? "bg-emerald-50/50" : "bg-white";
                      return (
                        <tr key={row.id} className={`${rowBg} hover:bg-slate-50`}>
                          <td className={`${td} text-center text-slate-400`}>{(page - 1) * rowsPerPage + index + 1}</td>
                          <td className={`${td} whitespace-nowrap`}>{row.staff_name}</td>
                          <td className={`${td} whitespace-nowrap`}>{row.company_name || "N/A"}</td>
                          <td className={`${td} font-semibold text-slate-900`}>{row.outlet_name}</td>
                          <td className={`${td} whitespace-nowrap`}>{row.location_name || "N/A"}</td>
                          <td className={`${td} whitespace-nowrap font-mono text-[11.5px]`}>{row.outlet_erp_id}</td>
                          <td className={`${td} text-center font-bold text-slate-900`}>{row.sticker_number}</td>
                          <td className={`${td} text-center font-mono`}>{row.invoice_number}</td>
                          <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums text-slate-900`}>₹{Number(row.price).toFixed(2)}</td>
                          <td className={`${td} text-center tabular-nums`}>{row.item_count || "N/A"}</td>
                          <td className={`${td} text-center tabular-nums`}>{row.packed_item_count || row.item_count || "N/A"}</td>
                          <td className={`${td} text-center tabular-nums`}>{row.box_count || "N/A"}</td>
                          <td className={`${td} text-center tabular-nums`}>{row.packet_count || "N/A"}</td>
                          <td className={`${td} whitespace-nowrap text-center`}>{row.delivery_boy_name || "N/A"}</td>
                          <td className={`${td} whitespace-nowrap text-center`}>{row.vehicle_no || "N/A"}</td>
                          <td className={`${td} whitespace-nowrap text-center`}>{formatDate(row.delivery_date)}</td>
                          <td className={`${td} text-center`}>{statusBadge(row.packaging_status)}</td>
                          <td className={`${td} text-center`}>
                            <span className="inline-flex gap-0.5">
                              {actionIcon("Download invoice PDF", "picture_as_pdf", "text-blue-600 hover:bg-blue-50 hover:text-blue-700", () => downloadOutletInvoicePdf(row))}
                              {row.packaging_status === "out_for_delivery" ? (
                                <>
                                  {actionIcon("Cancel", "cancel", "text-red-500 hover:bg-red-50 hover:text-red-600", () => handleUpdateStatus(row.id, "cancelled", row.delivery_boy_id, row.vehicle_no, row.delivery_date), updatingSaleIds.has(row.id))}
                                  {actionIcon("Deliver", "check_circle", "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700", () => handleUpdateStatus(row.id, "delivered", row.delivery_boy_id, row.vehicle_no, row.delivery_date), updatingSaleIds.has(row.id))}
                                  {actionIcon("Return", "undo", "text-slate-600 hover:bg-slate-100", () => handleUpdateStatus(row.id, "packing_done", row.delivery_boy_id, row.vehicle_no, row.delivery_date), updatingSaleIds.has(row.id))}
                                </>
                              ) : actionIcon("Revert to Out for Delivery", "edit", "text-amber-600 hover:bg-amber-50 hover:text-amber-700", () => handleUpdateStatus(row.id, "out_for_delivery", row.delivery_boy_id, row.vehicle_no, row.delivery_date), updatingSaleIds.has(row.id))}
                            </span>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={18} className="px-4 py-14 text-center text-[13px] text-slate-400">
                          {activeTab === "pending" ? "No pending delivery items found." : activeTab === "returned" ? "No returned items found." : "No delivered items found."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-[12.5px] text-slate-500">{reportCompanyLabel} / {reportStaffLabel} / {reportRangeLabel}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-red-50 px-3 py-1.5 text-[12.5px] font-semibold text-red-700">
                    Total: {cancelledTotal} · Amount: ₹{cancelledAmount.toFixed(2)}
                  </span>
                  <button type="button" className={btn.outline} onClick={() => setCancelReportOpen(true)}>
                    <Icon name="summarize" className="text-[18px]" />Report
                  </button>
                  <button type="button" className={btn.danger} onClick={handleDownloadCancelReport}>
                    <Icon name="picture_as_pdf" className="text-[18px]" />Download PDF
                  </button>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-auto border-t border-red-100">
                <table className="w-full min-w-[1300px] border-separate border-spacing-0">
                  <thead>
                    <tr className="[&>th]:bg-red-50 [&>th]:text-red-800">
                      <th className={`${head} text-center`}>#</th>
                      {["Staff", "Company", "Outlet", "Area", "ERP ID"].map((h) => <th key={h} className={`${head} text-left`}>{h}</th>)}
                      {["Sale ID", "Invoice no", "Invoice date", "Cancel date"].map((h) => <th key={h} className={`${head} text-center`}>{h}</th>)}
                      <th className={`${head} text-right`}>Cancel amount</th>
                      <th className={`${head} text-left`}>Reason</th>
                      <th className={`${head} text-center`}>Status</th>
                      {isAdmin && <th className={`${head} text-center`}>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedActiveList.length > 0 ? paginatedActiveList.map((row, index) => {
                      const td = `${cell} border-red-100`;
                      return (
                        <tr key={`cancelled-page-${row.id}`} className="bg-white hover:bg-red-50/40">
                          <td className={`${td} text-center text-slate-400`}>{(page - 1) * rowsPerPage + index + 1}</td>
                          <td className={`${td} whitespace-nowrap`}>{row.staff_name || "N/A"}</td>
                          <td className={`${td} whitespace-nowrap`}>{row.company_name || "N/A"}</td>
                          <td className={`${td} font-semibold text-slate-900`}>{row.outlet_name || "N/A"}</td>
                          <td className={`${td} whitespace-nowrap`}>{row.location_name || "N/A"}</td>
                          <td className={`${td} whitespace-nowrap font-mono text-[11.5px]`}>{row.outlet_erp_id || "N/A"}</td>
                          <td className={`${td} text-center font-bold text-slate-900`}>{row.sticker_number}</td>
                          <td className={`${td} text-center font-mono`}>{row.invoice_number || "N/A"}</td>
                          <td className={`${td} whitespace-nowrap text-center`}>{formatDate(row.sale_date)}</td>
                          <td className={`${td} whitespace-nowrap text-center`}>{formatDate(row.delivery_date || row.status_updated_at)}</td>
                          <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums text-slate-900`}>₹{Number(row.price || 0).toFixed(2)}</td>
                          <td className={`${td} max-w-60`}>{row.cancellation_reason || "—"}</td>
                          <td className={`${td} text-center`}><Badge tone="red" icon="cancel">Cancelled</Badge></td>
                          {isAdmin && (
                            <td className={`${td} text-center`}>
                              <button type="button" className={`${btn.outline} h-8 px-3`} title="Return to Pending Deliveries" disabled={updatingSaleIds.has(row.id)} onClick={() => handleReturnCancelled(row)}>
                                <Icon name="undo" className="text-[16px]" />Return
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={isAdmin ? 14 : 13} className="px-4 py-14 text-center text-[13px] text-slate-400">No cancelled delivered items found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Pagination page={page} totalPages={totalPages} total={activeList.length} onPageChange={setPage} limit={rowsPerPage} onLimitChange={setRowsPerPage} />
        </Card>
      </div>

      {/* Cancelled invoice report */}
      <Modal
        open={cancelReportOpen} onClose={() => setCancelReportOpen(false)} size="xl" title="Cancelled Invoice Report"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={() => setCancelReportOpen(false)}>Close</button>
            <button type="button" className={btn.danger} onClick={handleDownloadCancelReport}>
              <Icon name="picture_as_pdf" className="text-[18px]" />Download PDF
            </button>
          </>
        )}
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">{cancelFilters("cancel")}</div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] text-slate-500">{reportCompanyLabel} / {reportStaffLabel} / {reportAreaLabel} / {reportRangeLabel}</span>
          <span className="rounded-lg bg-red-50 px-3 py-1.5 text-[13px] font-bold text-red-700">
            Total cancel: {cancelledTotal} · Amount: Rs. {cancelledAmount.toFixed(2)}
          </span>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {[
            { title: "Staff Wise Total", rows: staffCancelSummary },
            { title: "Company Wise Total", rows: companyCancelSummary },
            { title: "Area Wise Total", rows: areaCancelSummary },
            { title: "Range Wise Total", rows: rangeCancelSummary },
          ].map((section) => (
            <div key={section.title} className="rounded-xl border border-red-100 bg-red-50/40 p-3">
              <h4 className="m-0 mb-1.5 text-[12.5px] font-bold text-red-800">{section.title}</h4>
              {section.rows.length > 0 ? (
                <div className="max-h-40 space-y-1 overflow-auto">
                  {section.rows.map((row) => (
                    <div key={`${section.title}-${row.name}`} className="flex justify-between gap-2 text-[12px]">
                      <span className="truncate text-slate-600">{row.name}</span>
                      <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">{row.count} / Rs. {row.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="m-0 text-[12px] text-slate-400">No cancelled invoices found.</p>}
            </div>
          ))}
        </div>
        <div className="max-h-[40vh] overflow-auto rounded-xl border border-red-100">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr>
                {["#", "Sale ID", "Staff", "Company", "Outlet", "Area", "Invoice date", "Cancel date", "Invoice no"].map((h) => <th key={h} className={mini}>{h}</th>)}
                <th className={`${mini} text-right`}>Cancel amount</th>
              </tr>
            </thead>
            <tbody>
              {cancelledSales.map((row, index) => (
                <tr key={`cancelled-${row.id}`}>
                  <td className={`${miniTd} text-slate-400`}>{index + 1}</td>
                  <td className={`${miniTd} font-bold`}>{row.sticker_number}</td>
                  <td className={miniTd}>{row.staff_name || "N/A"}</td>
                  <td className={miniTd}>{row.company_name || "N/A"}</td>
                  <td className={miniTd}>{row.outlet_name || "N/A"}</td>
                  <td className={miniTd}>{row.location_name || "N/A"}</td>
                  <td className={`${miniTd} whitespace-nowrap`}>{formatDate(row.sale_date)}</td>
                  <td className={`${miniTd} whitespace-nowrap`}>{formatDate(row.delivery_date || row.status_updated_at)}</td>
                  <td className={`${miniTd} font-mono`}>{row.invoice_number || "N/A"}</td>
                  <td className={`${miniTd} text-right font-bold tabular-nums`}>₹{Number(row.price || 0).toFixed(2)}</td>
                </tr>
              ))}
              {cancelledSales.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-[13px] text-slate-400">No cancelled invoices found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>
      <Footer />
    </DashboardLayout>
  );
}

export default Delivered;
