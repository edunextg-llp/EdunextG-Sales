import { useState, useEffect, useCallback, useMemo } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Icon,
  Tooltip,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useSalesPolling } from "utils/salesSync";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadCellErrorSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";
import { printSalesInvoicePdf } from "utils/printSalesInvoicePdf";
// import { formatBpSaleId } from "utils/saleId";
// import { IoSaveOutline } from "react-icons/io5";
import { FaRegEdit } from "react-icons/fa";
import { MdCancel, MdCheckCircle, MdUndo } from "react-icons/md";

const tableActionBoxSx = {
  flexWrap: "nowrap",
  minWidth: "fit-content",
};
// import { CiTrash } from "react-icons/ci";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function Delivered() {
  const [salesData, setSalesData] = useState([]);
  const [cancelledSalesData, setCancelledSalesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
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
  const API = "https://bawarchee.edunextg.co/api";

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

  const csvValue = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const downloadCSV = (filename, csvContent) => {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
  const returnedTotal = filteredSales.filter((row) => row.packaging_status === "returned").length;
  const pendingSales = filteredSales.filter((row) => row.packaging_status === "out_for_delivery");
  const cancelledSales = filteredCancelledSales;
  const activeList =
    activeTab === "cancelled"
      ? cancelledSales
      : activeTab === "pending"
        ? pendingSales
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

  const handleDownloadCancelCSV = () => {
    let csv =
      "Report Type,Name,Cancel Count,Cancel Amount\n" +
      staffCancelSummary
        .map((row) => `Staff Wise,${csvValue(row.name)},${row.count},${row.amount.toFixed(2)}`)
        .join("\n");

    csv += "\n\nReport Type,Name,Cancel Count,Cancel Amount\n";
    csv += companyCancelSummary
      .map((row) => `Company Wise,${csvValue(row.name)},${row.count},${row.amount.toFixed(2)}`)
      .join("\n");

    csv += "\n\nReport Type,Area,Cancel Count,Cancel Amount\n";
    csv += areaCancelSummary
      .map((row) => `Area Wise,${csvValue(row.name)},${row.count},${row.amount.toFixed(2)}`)
      .join("\n");

    csv += "\n\nReport Type,Date,Cancel Count,Cancel Amount\n";
    csv += rangeCancelSummary
      .map((row) => `Range Wise,${csvValue(row.name)},${row.count},${row.amount.toFixed(2)}`)
      .join("\n");

    csv += "\n\nSr No,Sale ID,Staff Name,Company,Invoice Date,Cancel Date,ERP ID,Outlet Name,Area,Invoice No,Cancel Amount\n";
    cancelledSales.forEach((row, index) => {
      csv +=
        `${index + 1},` +
        `${csvValue(row.sticker_number || "N/A")},` +
        `${csvValue(row.staff_name || "N/A")},` +
        `${csvValue(row.company_name || "N/A")},` +
        `${csvValue(formatDate(row.sale_date))},` +
        `${csvValue(formatDate(row.delivery_date || row.status_updated_at))},` +
        `${csvValue(row.outlet_erp_id || "N/A")},` +
        `${csvValue(row.outlet_name || "N/A")},` +
        `${csvValue(row.location_name || "N/A")},` +
        `${csvValue(row.invoice_number || "N/A")},` +
        `${Number(row.price || 0).toFixed(2)}\n`;
    });
    csv += `,,,,,,,,Total,${cancelledAmount.toFixed(2)}\n`;

    downloadCSV("Cancelled_Invoice_Report.csv", csv);
  };

  const handleUpdateStatus = async (saleId, newStatus, currentDeliveryBoy, currentVehicle, currentDeliveryDate) => {
    if (updatingSaleIds.has(saleId)) return;

    const currentRow = salesData.find((row) => row.id === saleId);
    if (!currentRow) return;

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

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h5" fontWeight="medium" color="dark" mb={2}>
                  Delivered Items
                </MDTypography>
                <Tabs
                  value={activeTab}
                  onChange={(_, value) => setActiveTab(value)}
                  sx={{
                    minHeight: 40,
                    "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 },
                  }}
                >
                  <Tab label="Active Deliveries" value="delivered" />
                  <Tab label={`Pending Delivery (${pendingDeliveryTotal})`} value="pending" />
                  <Tab
                    label={`Cancelled Items (${cancelledTotal})`}
                    value="cancelled"
                    sx={{ color: activeTab === "cancelled" ? "error.main" : undefined }}
                  />
                </Tabs>
              </MDBox>
              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={activeTab === "cancelled" ? 2 : 4}>
                    <MDInput
                      type="text"
                      label="Search by Outlet Name, Area, ID, Staff Name, Sale ID, or Invoice No."
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  {activeTab !== "cancelled" && (
                    <>
                      <Grid item xs={12} md={2}>
                        <MDInput
                          type="date"
                          label="Delivery From"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={deliveryRangeStart}
                          onChange={(e) => setDeliveryRangeStart(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <MDInput
                          type="date"
                          label="Delivery To"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={deliveryRangeEnd}
                          onChange={(e) => setDeliveryRangeEnd(e.target.value)}
                        />
                      </Grid>
                    </>
                  )}
                  {activeTab === "cancelled" && (
                    <>
                      <Grid item xs={12} md={2}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="cancel-page-company-label">Company</InputLabel>
                          <Select
                            labelId="cancel-page-company-label"
                            value={selectedCompanyId}
                            label="Company"
                            onChange={(e) => handleCompanyChange(e.target.value)}
                            sx={{ height: 44 }}
                          >
                            <MenuItem value="">All Companies</MenuItem>
                            {companyOptions.map((company) => (
                              <MenuItem key={company.id} value={company.id}>
                                {company.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="cancel-page-staff-label">Staff</InputLabel>
                          <Select
                            labelId="cancel-page-staff-label"
                            value={selectedStaffId}
                            label="Staff"
                            onChange={(e) => {
                              setSelectedStaffId(e.target.value);
                              setSelectedArea("");
                            }}
                            sx={{ height: 44 }}
                          >
                            <MenuItem value="">All Staff</MenuItem>
                            {staffOptions.map((staff) => (
                              <MenuItem key={staff.id} value={staff.id}>
                                {staff.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="cancel-page-area-label">Area</InputLabel>
                          <Select
                            labelId="cancel-page-area-label"
                            value={selectedArea}
                            label="Area"
                            onChange={(e) => setSelectedArea(e.target.value)}
                            sx={{ height: 44 }}
                          >
                            <MenuItem value="">All Areas</MenuItem>
                            {areaOptions.map((area) => <MenuItem key={area} value={area}>{area}</MenuItem>)}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <MDInput
                          type="date"
                          label="Cancel From"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={cancelRangeStart}
                          onChange={(e) => setCancelRangeStart(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <MDInput
                          type="date"
                          label="Cancel To"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={cancelRangeEnd}
                          onChange={(e) => setCancelRangeEnd(e.target.value)}
                        />
                      </Grid>
                    </>
                  )}
                  <Grid item xs={12} md={activeTab === "cancelled" ? 12 : 12}>
                    <MDBox display="flex" gap={2} justifyContent={{ xs: "flex-start", md: "flex-end" }} flexWrap="wrap">
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        onClick={() => setActiveTab("pending")}
                        sx={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", cursor: "pointer" }}
                      >
                        <MDTypography variant="caption" color="text">
                          Pending Delivery
                        </MDTypography>
                        <MDTypography variant="h5" color="info" fontWeight="bold">
                          {pendingDeliveryTotal}
                        </MDTypography>
                      </MDBox>
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        sx={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}
                      >
                        <MDTypography variant="caption" color="text">
                          Total Delivered
                        </MDTypography>
                        <MDTypography variant="h5" color="success" fontWeight="bold">
                          {deliveredTotal}
                        </MDTypography>
                      </MDBox>
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        onClick={() => {
                          setActiveTab("cancelled");
                          setCancelReportOpen(true);
                        }}
                        sx={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", cursor: "pointer" }}
                      >
                        <MDTypography variant="caption" color="text">
                          Total Cancel
                        </MDTypography>
                        <MDTypography variant="h5" color="error" fontWeight="bold">
                          {cancelledTotal}
                        </MDTypography>
                      </MDBox>
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        sx={{ backgroundColor: "#fff7ed", border: "1px solid #fed7aa" }}
                      >
                        <MDTypography variant="caption" color="text">
                          Total Returned
                        </MDTypography>
                        <MDTypography variant="h5" color="warning" fontWeight="bold">
                          {returnedTotal}
                        </MDTypography>
                      </MDBox>
                    </MDBox>
                  </Grid>
                </Grid>

                {activeTab !== "cancelled" ? (
                  <>
                    {(deliveryRangeStart || deliveryRangeEnd) && (
                      <MDTypography variant="body2" color="text" mb={2}>
                        Delivery date: {deliveryRangeLabel}
                        {activeTab === "pending" ? " · Pending only" : " · Delivered, pending, and returned"}
                      </MDTypography>
                    )}
                    <MDBox display="flex" justifyContent="flex-end" mb={2}>
                      <MDButton
                        color="info"
                        variant="outlined"
                        size="small"
                        onClick={downloadAllDeliveredInvoicePdfs}
                      >
                        <Icon sx={{ mr: 1 }}>picture_as_pdf</Icon>
                        Download Invoice PDF
                      </MDButton>
                    </MDBox>
                    <TableContainer component={Paper} sx={paginatedTableContainerSx}>
                      <Table stickyHeader sx={{ minWidth: 650 }}>
                        <TableHead sx={paginatedTableHeadSx()}>
                          <TableRow>
                            <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                              Sr No
                            </TableCell>
                            <TableCell sx={paginatedTableHeadCellSx}>Staff Name</TableCell>
                            <TableCell sx={paginatedTableHeadCellSx}>Company</TableCell>
                            <TableCell sx={paginatedTableHeadCellSx}>Outlet Name</TableCell>
                            <TableCell sx={paginatedTableHeadCellSx}>Area</TableCell>
                            <TableCell sx={paginatedTableHeadCellSx}>ERP ID</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Sale ID</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Invoice No</TableCell>
                            <TableCell align="right" sx={paginatedTableHeadCellSx}>Price</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>No. of Item</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Packing Item</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>No. of Box</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>No. of Packet</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Delivery Boy</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Vehicle</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Delivery Date</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Status</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {paginatedActiveList.length > 0 ? (
                            paginatedActiveList.map((row, index) => (
                              <TableRow
                                key={row.id}
                                sx={{
                                  backgroundColor: row.packaging_status === 'returned' ? '#fff7ed' : row.packaging_status === 'delivered' ? '#f0fdf4' : '#f8fafc',
                                  "&:last-child td, &:last-child th": { border: 0 }
                                }}
                              >
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                  {(page - 1) * rowsPerPage + index + 1}
                                </TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.staff_name}</TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.company_name || "N/A"}</TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2, fontWeight: "medium" }}>{row.outlet_name}</TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.location_name || "N/A"}</TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.outlet_erp_id}</TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, fontWeight: "bold" }}>{row.sticker_number}</TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.invoice_number}</TableCell>
                                <TableCell align="right" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, fontWeight: "bold" }}>
                                  ₹{Number(row.price).toFixed(2)}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                                  {row.item_count || "N/A"}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                                  {row.packed_item_count || row.item_count || "N/A"}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                                  {row.box_count || "N/A"}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                                  {row.packet_count || "N/A"}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                                  {row.delivery_boy_name || 'N/A'}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                                  {row.vehicle_no || 'N/A'}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                                  {formatDate(row.delivery_date)}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                  {row.packaging_status === 'returned' ? (
                                    <Chip label="Returned" color="warning" variant="outlined" size="small" />
                                  ) : row.packaging_status === 'delivered' ? (
                                    <Chip label="Delivered" color="success" variant="outlined" size="small" />
                                  ) : row.packaging_status === 'out_for_delivery' ? (
                                    <Chip label="Pending Delivery" color="warning" variant="outlined" size="small" />
                                  ) : (
                                    <Chip label={row.packaging_status || "Unknown"} color="default" variant="outlined" size="small" />
                                  )}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, minWidth: 160 }}>
                                  {row.packaging_status === 'out_for_delivery' ? (
                                    <MDBox
                                      display="flex"
                                      flexDirection="row"
                                      gap={0.75}
                                      justifyContent="center"
                                      alignItems="center"
                                      sx={tableActionBoxSx}
                                    >
                                      <Tooltip title="Download Invoice PDF">
                                        <Icon
                                          onClick={() => downloadOutletInvoicePdf(row)}
                                          sx={{ cursor: "pointer", color: "#2563eb", fontSize: 22 }}
                                        >
                                          picture_as_pdf
                                        </Icon>
                                      </Tooltip>
                                      <Tooltip title="Cancel">
                                        <MDButton
                                          color="error"
                                          variant="outlined"
                                          size="small"
                                          iconOnly
                                          onClick={() => handleUpdateStatus(row.id, 'cancelled', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}
                                        >
                                          <MdCancel size={18} />
                                        </MDButton>
                                      </Tooltip>
                                      <Tooltip title="Deliver">
                                        <MDButton
                                          color="success"
                                          variant="outlined"
                                          size="small"
                                          iconOnly
                                          onClick={() => handleUpdateStatus(row.id, 'delivered', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}
                                        >
                                          <MdCheckCircle size={18} />
                                        </MDButton>
                                      </Tooltip>
                                      <Tooltip title="Return">
                                        <MDButton
                                          color="dark"
                                          variant="outlined"
                                          size="small"
                                          iconOnly
                                          onClick={() => handleUpdateStatus(row.id, 'packing_done', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}
                                        >
                                          <MdUndo size={18} />
                                        </MDButton>
                                      </Tooltip>
                                    </MDBox>
                                  ) : (
                                    <MDBox
                                      display="flex"
                                      flexDirection="row"
                                      gap={0.75}
                                      justifyContent="center"
                                      alignItems="center"
                                      sx={tableActionBoxSx}
                                    >
                                      <Tooltip title="Download Invoice PDF">
                                        <Icon
                                          onClick={() => downloadOutletInvoicePdf(row)}
                                          sx={{ cursor: "pointer", color: "#2563eb", fontSize: 22 }}
                                        >
                                          picture_as_pdf
                                        </Icon>
                                      </Tooltip>
                                      <Tooltip title="Revert to Out for Delivery">
                                        <span>
                                          <FaRegEdit
                                            onClick={() => handleUpdateStatus(row.id, 'out_for_delivery', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}
                                            style={{ cursor: "pointer" }}
                                            color="#E0E388"
                                            size={20}
                                          />
                                        </span>
                                      </Tooltip>
                                    </MDBox>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={17} align="center" sx={{ py: 3, borderBottom: 0 }}>
                                <MDTypography variant="body2" color="text">
                                  {activeTab === "pending"
                                    ? "No pending delivery items found."
                                    : "No delivered items found."}
                                </MDTypography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <TablePaginationFooter
                      page={page}
                      totalPages={totalPages}
                      total={activeList.length}
                      onPageChange={setPage}
                      limit={rowsPerPage}
                      onLimitChange={setRowsPerPage}
                    />
                  </>
                ) : (
                  <MDBox>
                    <MDBox
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      mb={2}
                      flexWrap="wrap"
                      gap={1}
                    >
                      <MDTypography variant="body2" color="text">
                        {reportCompanyLabel} / {reportStaffLabel} / {reportRangeLabel}
                      </MDTypography>
                      <MDBox display="flex" gap={1} flexWrap="wrap">
                        <MDTypography variant="h6" color="error" fontWeight="bold">
                          Total: {cancelledTotal} | Amount: ₹{cancelledAmount.toFixed(2)}
                        </MDTypography>
                        <MDButton color="dark" variant="outlined" size="small" onClick={handleDownloadCancelCSV}>
                          Download CSV
                        </MDButton>
                        <MDButton color="error" variant="contained" size="small" onClick={handleDownloadCancelReport}>
                          Download PDF
                        </MDButton>
                      </MDBox>
                    </MDBox>
                    <TableContainer component={Paper} sx={{ ...paginatedTableContainerSx, border: "1px solid #fecaca" }}>
                      <Table stickyHeader sx={{ minWidth: 650 }}>
                        <TableHead sx={paginatedTableHeadSx("#fef2f2")}>
                          <TableRow>
                            <TableCell align="center" sx={{ ...paginatedTableHeadCellErrorSx, width: 56 }}>
                              Sr No
                            </TableCell>
                            <TableCell sx={paginatedTableHeadCellErrorSx}>Staff Name</TableCell>
                            <TableCell sx={paginatedTableHeadCellErrorSx}>Company</TableCell>
                            <TableCell sx={paginatedTableHeadCellErrorSx}>Outlet Name</TableCell>
                            <TableCell sx={paginatedTableHeadCellErrorSx}>Area</TableCell>
                            <TableCell sx={paginatedTableHeadCellErrorSx}>ERP ID</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellErrorSx}>Sale ID</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellErrorSx}>Invoice No</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellErrorSx}>Invoice Date</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellErrorSx}>Cancel Date</TableCell>
                            <TableCell align="right" sx={paginatedTableHeadCellErrorSx}>Cancel Amount</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellErrorSx}>Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {paginatedActiveList.length > 0 ? (
                            paginatedActiveList.map((row, index) => (
                              <TableRow
                                key={`cancelled-page-${row.id}`}
                                sx={{ backgroundColor: "#fff7f7", "&:last-child td, &:last-child th": { border: 0 } }}
                              >
                                <TableCell align="center" sx={{ borderBottom: "1px solid #fecaca", py: 2 }}>
                                  {(page - 1) * rowsPerPage + index + 1}
                                </TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #fecaca", py: 2 }}>
                                  {row.staff_name || "N/A"}
                                </TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #fecaca", py: 2 }}>
                                  {row.company_name || "N/A"}
                                </TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #fecaca", py: 2, fontWeight: "medium" }}>
                                  {row.outlet_name || "N/A"}
                                </TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #fecaca", py: 2 }}>
                                  {row.location_name || "N/A"}
                                </TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #fecaca", py: 2 }}>
                                  {row.outlet_erp_id || "N/A"}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #fecaca", py: 2, fontWeight: "bold" }}>
                                  {row.sticker_number}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #fecaca", py: 2 }}>
                                  {row.invoice_number || "N/A"}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #fecaca", py: 2 }}>
                                  {formatDate(row.sale_date)}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #fecaca", py: 2 }}>
                                  {formatDate(row.delivery_date || row.status_updated_at)}
                                </TableCell>
                                <TableCell align="right" sx={{ borderBottom: "1px solid #fecaca", py: 2, fontWeight: "bold" }}>
                                  ₹{Number(row.price || 0).toFixed(2)}
                                </TableCell>
                                <TableCell align="center" sx={{ borderBottom: "1px solid #fecaca", py: 2 }}>
                                  <Chip label="Cancelled" color="error" variant="outlined" size="small" />
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={11} align="center" sx={{ py: 3, borderBottom: 0 }}>
                                <MDTypography variant="body2" color="text">
                                  No cancelled delivered items found.
                                </MDTypography>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <TablePaginationFooter
                      page={page}
                      totalPages={totalPages}
                      total={activeList.length}
                      onPageChange={setPage}
                      limit={rowsPerPage}
                      onLimitChange={setRowsPerPage}
                    />
                  </MDBox>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Dialog open={cancelReportOpen} onClose={() => setCancelReportOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Cancelled Invoice Report</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} mb={2}>
            <Grid item xs={12} md={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="cancel-company-filter-label">Company</InputLabel>
                <Select
                  labelId="cancel-company-filter-label"
                  value={selectedCompanyId}
                  label="Company"
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  sx={{ height: 44 }}
                >
                  <MenuItem value="">All Companies</MenuItem>
                  {companyOptions.map((company) => (
                    <MenuItem key={company.id} value={company.id}>
                      {company.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="cancel-staff-filter-label">Staff</InputLabel>
                <Select
                  labelId="cancel-staff-filter-label"
                  value={selectedStaffId}
                  label="Staff"
                  onChange={(e) => {
                    setSelectedStaffId(e.target.value);
                    setSelectedArea("");
                  }}
                  sx={{ height: 44 }}
                >
                  <MenuItem value="">All Staff</MenuItem>
                  {staffOptions.map((staff) => (
                    <MenuItem key={staff.id} value={staff.id}>
                      {staff.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="cancel-area-filter-label">Area</InputLabel>
                <Select labelId="cancel-area-filter-label" value={selectedArea} label="Area" onChange={(e) => setSelectedArea(e.target.value)} sx={{ height: 44 }}>
                  <MenuItem value="">All Areas</MenuItem>
                  {areaOptions.map((area) => <MenuItem key={area} value={area}>{area}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <MDInput
                type="date"
                label="Cancel From"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={cancelRangeStart}
                onChange={(e) => setCancelRangeStart(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <MDInput
                type="date"
                label="Cancel To"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={cancelRangeEnd}
                onChange={(e) => setCancelRangeEnd(e.target.value)}
              />
            </Grid>
          </Grid>
          <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
            <MDTypography variant="body2" color="text">
              {reportCompanyLabel} / {reportStaffLabel} / {reportAreaLabel} / {reportRangeLabel}
            </MDTypography>
            <MDTypography variant="h6" color="error" fontWeight="bold">
              Total Cancel: {cancelledTotal} | Amount: Rs. {cancelledAmount.toFixed(2)}
            </MDTypography>
          </MDBox>
          <Grid container spacing={2} mb={2}>
            {[
              { title: "Staff Wise Total", rows: staffCancelSummary },
              { title: "Company Wise Total", rows: companyCancelSummary },
              { title: "Area Wise Total", rows: areaCancelSummary },
              { title: "Range Wise Total", rows: rangeCancelSummary },
            ].map((section) => (
              <Grid item xs={12} md={6} key={section.title}>
                <MDBox p={1.5} borderRadius="lg" sx={{ border: "1px solid #fecaca", backgroundColor: "#fff7f7" }}>
                  <MDTypography variant="button" color="error" fontWeight="bold">
                    {section.title}
                  </MDTypography>
                  {section.rows.length > 0 ? (
                    section.rows.map((row) => (
                      <MDBox key={`${section.title}-${row.name}`} display="flex" justifyContent="space-between" mt={0.75} gap={1}>
                        <MDTypography variant="caption" color="text">
                          {row.name}
                        </MDTypography>
                        <MDTypography variant="caption" color="dark" fontWeight="bold" sx={{ whiteSpace: "nowrap" }}>
                          {row.count} / Rs. {row.amount.toFixed(2)}
                        </MDTypography>
                      </MDBox>
                    ))
                  ) : (
                    <MDTypography variant="caption" color="text">
                      No cancelled invoices found.
                    </MDTypography>
                  )}
                </MDBox>
              </Grid>
            ))}
          </Grid>
          <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #fecaca" }}>
            <Table size="small">
              <TableHead sx={{ display: "table-header-group", backgroundColor: "#fef2f2" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Sr No</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Sale ID</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Staff</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Company</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Outlet Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Area</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Invoice Date</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Cancel Date</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Invoice No</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Cancel Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cancelledSales.map((row, index) => (
                  <TableRow key={`cancelled-${row.id}`}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell align="center" sx={{ fontWeight: "bold" }}>
                      {row.sticker_number}
                    </TableCell>
                    <TableCell>{row.staff_name || "N/A"}</TableCell>
                    <TableCell>{row.company_name || "N/A"}</TableCell>
                    <TableCell>{row.outlet_name || "N/A"}</TableCell>
                    <TableCell>{row.location_name || "N/A"}</TableCell>
                    <TableCell align="center">{formatDate(row.sale_date)}</TableCell>
                    <TableCell align="center">{formatDate(row.delivery_date || row.status_updated_at)}</TableCell>
                    <TableCell align="center">{row.invoice_number || "N/A"}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      ₹{Number(row.price || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                {cancelledSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                      <MDTypography variant="body2" color="text">
                        No cancelled invoices found.
                      </MDTypography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" variant="outlined" onClick={handleDownloadCancelCSV}>
            Download CSV
          </MDButton>
          <MDButton color="error" variant="contained" onClick={handleDownloadCancelReport}>
            Download PDF
          </MDButton>
          <MDButton color="dark" variant="outlined" onClick={() => setCancelReportOpen(false)}>
            Close
          </MDButton>
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}

export default Delivered;
