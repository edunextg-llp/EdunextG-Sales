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
  FormControl,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  InputLabel,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  enhanceDeliveryRow,
  isDeliveryRowDirty,
  mergeSalesRows,
  useSalesPolling,
} from "utils/salesSync";
import { formatBpSaleId } from "utils/saleId";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";
import { IoSaveOutline } from "react-icons/io5";
import { FaEye } from "react-icons/fa";

const getTodayLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function Delivery() {
  const [salesData, setSalesData] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const [historyDialog, setHistoryDialog] = useState({ open: false, sale: null, history: [] });
  const [savingSaleIds, setSavingSaleIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);

  // Tab State
  const [activeTab, setActiveTab] = useState("pending");

  // Log Tab Filters State
  const [logStartDate, setLogStartDate] = useState(getTodayLocalDate());
  const [logEndDate, setLogEndDate] = useState(getTodayLocalDate());
  const [logStaffId, setLogStaffId] = useState("");

  const API = "https://bawarche.edunextg.co/api";

  const statusLabels = {
    not_packing: "Not Packing",
    packing: "Packing In Progress",
    packing_done: "Packing Done",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    const dateOnly = String(value).split("T")[0].split(" ")[0];
    const parts = dateOnly.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return value;
  };

  const formatDateTime = (value) => {
    if (!value) return "N/A";
    const [datePart, timePart = ""] = String(value).split(/[T ]/);
    return `${formatDate(datePart)}${timePart ? ` ${timePart.slice(0, 5)}` : ""}`;
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const handlePrintPdf = () => {
    const staffLabel = logStaffId
      ? staffOptions.find((s) => s.id === Number(logStaffId))?.name || "Selected Staff"
      : "All Staff";
    const generatedOn = new Date().toLocaleString("en-GB");
    const totalAmount = filteredLogSales.reduce((sum, row) => sum + (Number(row.price) || 0), 0);

    const rowsHtml = filteredLogSales
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.staff_name || "N/A")}</td>
            <td>${escapeHtml(row.company_name || "N/A")}</td>
            <td>${escapeHtml(row.outlet_name || "N/A")}</td>
            <td>${escapeHtml(row.location_name || "N/A")}</td>
            <td>${escapeHtml(row.outlet_erp_id || "N/A")}</td>
            <td>${escapeHtml(row.sticker_number || "N/A")}</td>
            <td>${escapeHtml(row.invoice_number || "N/A")}</td>
            <td class="right">Rs. ${Number(row.price || 0).toFixed(2)}</td>
            <td>${row.item_count || "N/A"}</td>
            <td>${escapeHtml(row.delivery_boy_name || "N/A")}</td>
            <td>${escapeHtml(row.vehicle_no || "N/A")}</td>
            <td>${escapeHtml(formatDate(row.delivery_date))}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Out for Delivery Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
            h1 { font-size: 22px; margin: 0 0 12px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 18px; font-size: 13px; }
            .meta strong { display: inline-block; min-width: 110px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; font-weight: 700; }
            .right { text-align: right; }
            .total { margin-top: 14px; text-align: right; font-size: 16px; font-weight: 700; }
            .empty { padding: 24px; text-align: center; color: #6b7280; border: 1px solid #d1d5db; }
            @media print {
              body { margin: 16mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Out for Delivery Report</h1>
          <div class="meta">
            <div><strong>Staff Collector:</strong> ${escapeHtml(staffLabel)}</div>
            <div><strong>Period:</strong> ${escapeHtml(formatDate(logStartDate))} to ${escapeHtml(formatDate(logEndDate))}</div>
            <div><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
            <div><strong>Total Orders:</strong> ${filteredLogSales.length} (Rs. ${totalAmount.toFixed(2)})</div>
          </div>
          ${filteredLogSales.length > 0
        ? `<table>
        <thead>
          <tr>
            <th>Sr No</th>
            <th>Staff Name</th>
            <th>Company</th>
            <th>Outlet Name</th>
            <th>Area</th>
            <th>ERP ID</th>
            <th>Sale ID</th>
            <th>Invoice No</th>
            <th class="right">Price</th>
            <th>Items</th>
            <th>Delivery Boy</th>
            <th>Vehicle No</th>
            <th>Delivery Date</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>`
        : `<div class="empty">No "Out for Delivery" records found for this selection.</div>`
      }
          <div class="total">Total Amount: Rs. ${totalAmount.toFixed(2)}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleOpenDetails = (saleId) => {
    setSalesData((prev) =>
      prev.map((row) =>
        row.id === saleId && !row.delivery_date
          ? { ...row, delivery_date: getTodayLocalDate(), _localDirty: true }
          : row
      )
    );
    setActiveRowId(saleId);
    setDetailsModalOpen(true);
  };

  const handleCloseDetails = () => {
    setDetailsModalOpen(false);
    setActiveRowId(null);
  };

  useEffect(() => {
    const fetchDeliveryBoys = async () => {
      try {
        const response = await fetch(`${API}/delivery-boy`);
        if (response.ok) {
          const data = await response.json();
          setDeliveryBoys(data);
        }
      } catch (error) {
        console.error("Error fetching delivery boys:", error);
      }
    };
    fetchDeliveryBoys();
  }, [API]);

  const fetchSales = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fetch(`${API}/staff/sales/by-date`);
      if (response.ok) {
        const data = await response.json();
        setSalesData((prev) =>
          mergeSalesRows(data, prev, enhanceDeliveryRow, isDeliveryRowDirty)
        );
      } else if (!silent) {
        setSalesData([]);
      }
    } catch (error) {
      if (!silent) {
        console.error("Error fetching global sales:", error);
      }
    }
  }, [API]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, logStartDate, logEndDate, logStaffId, rowsPerPage]);

  useSalesPolling(fetchSales);

  const handleRowChange = (saleId, field, value) => {
    const newData = [...salesData];
    const index = newData.findIndex(r => r.id === saleId);
    if (index === -1) return;
    newData[index] = { ...newData[index], [field]: value, _localDirty: true };
    setSalesData(newData);
  };

  const handleSaveDelivery = async (saleId) => {
    const row = salesData.find(r => r.id === saleId);
    if (!row || savingSaleIds.has(saleId)) return;

    if ((row.packaging_status === "out_for_delivery" || row.packaging_status === "delivered") && (!row.delivery_boy_id || !row.vehicle_no || !row.delivery_date)) {
      alert("Please assign a Delivery Boy, Vehicle No, and Delivery Date via 'Assign Details' before marking this item.");
      return;
    }

    setSavingSaleIds((prev) => new Set(prev).add(saleId));

    try {
      const finalStatus = row.packaging_status || "packing_done";

      const payload = {
        packagingStatus: finalStatus,
        deliveryBoyId: row.delivery_boy_id || null,
        vehicleNo: row.vehicle_no || null,
        deliveryDate: row.delivery_date || null,
        expectedStatus: row.original_packaging_status,
      };

      const response = await fetch(`${API}/staff/sales/${row.id}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const updated = enhanceDeliveryRow(data.sale);
        // Only remove if it is completely out of Delivery module (e.g. delivered, cancelled, not_packing)
        if (updated.packaging_status !== "packing_done" && updated.packaging_status !== "out_for_delivery") {
          setSalesData((prev) => prev.filter((item) => item.id !== saleId));
        } else {
          setSalesData((prev) =>
            prev.map((item) =>
              item.id === saleId
                ? { ...updated, packing_date: item.packing_date || updated.packing_date }
                : item
            )
          );
        }
      } else if (response.status === 409) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "This record was updated by another user.");
        fetchSales();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update delivery status.");
      }
    } catch (error) {
      console.error("Error saving delivery info:", error);
      alert("Error saving delivery status.");
    } finally {
      setSavingSaleIds((prev) => {
        const next = new Set(prev);
        next.delete(saleId);
        return next;
      });
    }
  };

  const handleViewHistory = async (saleId) => {
    try {
      const response = await fetch(`${API}/staff/sales/${saleId}/status-history`);
      if (response.ok) {
        const data = await response.json();
        setHistoryDialog({ open: true, sale: data.sale, history: data.history || [] });
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to load status dates.");
      }
    } catch (error) {
      console.error("Error loading status history:", error);
      alert("Error loading status dates.");
    }
  };

  const getRowColor = (status) => {
    if (status === 'out_for_delivery') return '#dcfce7'; // green
    if (status === 'packing_done') return '#e0f2fe'; // light blue
    return '#ffebeb';
  };

  const getTextColor = (status) => {
    if (status === 'out_for_delivery') return '#166534'; // dark green
    if (status === 'packing_done') return '#075985'; // dark blue
    return '#991b1b';
  };

  // Staff options dynamic list from fetched sales data
  const staffOptions = useMemo(() => {
    const staff = new Map();
    salesData.forEach((row) => {
      if (!row.staff_id) return;
      if (!staff.has(row.staff_id)) {
        staff.set(row.staff_id, row.staff_name || `Staff ${row.staff_id}`);
      }
    });
    return [...staff.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [salesData]);

  // Filter 1: Pending Deliveries (status = packing_done)
  const filteredSales = salesData.filter((row) => {
    const status = row.original_packaging_status || row.packaging_status || "not_packing";
    if (status !== "packing_done") {
      return false;
    }

    const search = searchQuery.toLowerCase();
    const outletName = row.outlet_name ? row.outlet_name.toLowerCase() : "";
    const outletArea = row.location_name ? row.location_name.toLowerCase() : "";
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    const staffName = row.staff_name ? row.staff_name.toLowerCase() : "";
    const companyName = row.company_name ? row.company_name.toLowerCase() : "";
    const saleId = formatBpSaleId(row).toLowerCase();
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

  // Filter 2: Out for Delivery Log (status = out_for_delivery)
  const filteredLogSales = salesData.filter((row) => {
    const status = row.original_packaging_status || row.packaging_status || "not_packing";
    if (status !== "out_for_delivery") {
      return false;
    }

    if (logStaffId && Number(row.staff_id) !== Number(logStaffId)) {
      return false;
    }

    const deliveryDate = row.delivery_date ? row.delivery_date.split("T")[0] : "";
    if (logStartDate && (!deliveryDate || deliveryDate < logStartDate)) {
      return false;
    }
    if (logEndDate && (!deliveryDate || deliveryDate > logEndDate)) {
      return false;
    }

    const search = searchQuery.toLowerCase();
    const outletName = row.outlet_name ? row.outlet_name.toLowerCase() : "";
    const outletArea = row.location_name ? row.location_name.toLowerCase() : "";
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    const staffName = row.staff_name ? row.staff_name.toLowerCase() : "";
    const companyName = row.company_name ? row.company_name.toLowerCase() : "";
    const saleId = formatBpSaleId(row).toLowerCase();
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

  const activeList = activeTab === "pending" ? filteredSales : filteredLogSales;
  const totalPages = Math.max(1, Math.ceil(activeList.length / rowsPerPage));
  const paginatedSales = activeList.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h5" fontWeight="medium" color="dark" mb={2}>
                  Delivery Management
                </MDTypography>
                <Tabs
                  value={activeTab}
                  onChange={(_, value) => setActiveTab(value)}
                  sx={{
                    minHeight: 40,
                    "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 },
                  }}
                >
                  <Tab label={`Pending Deliveries (${filteredSales.length})`} value="pending" />
                  <Tab label={`Out for Delivery Log (${filteredLogSales.length})`} value="out_for_delivery" />
                </Tabs>
              </MDBox>
              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={activeTab === "pending" ? 12 : 3}>
                    <MDInput
                      type="text"
                      label="Search by Outlet Name, Area, ID, Staff Name, Sale ID, or Invoice No."
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  {activeTab === "out_for_delivery" && (
                    <>
                      <Grid item xs={12} md={2}>
                        <MDInput
                          type="date"
                          label="From Date"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={logStartDate}
                          onChange={(e) => setLogStartDate(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <MDInput
                          type="date"
                          label="To Date"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={logEndDate}
                          onChange={(e) => setLogEndDate(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={2.5}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="log-staff-filter-label">Staff</InputLabel>
                          <Select
                            labelId="log-staff-filter-label"
                            value={logStaffId}
                            label="Staff"
                            onChange={(e) => setLogStaffId(e.target.value)}
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
                      <Grid item xs={12} md={2.5} display="flex" alignItems="center">
                        <MDButton
                          color="info"
                          variant="gradient"
                          fullWidth
                          onClick={handlePrintPdf}
                          disabled={filteredLogSales.length === 0}
                          sx={{ height: 44 }}
                        >
                          Print PDF
                        </MDButton>
                      </Grid>
                    </>
                  )}
                </Grid>

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
                        {activeTab === "out_for_delivery" && (
                          <>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Delivery Boy</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Vehicle</TableCell>
                          </>
                        )}
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>Status</TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>Delivery Date</TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>Packing Date</TableCell>
                        {activeTab === "pending" && (
                          <>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Delivery Details</TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>Action</TableCell>
                          </>
                        )}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedSales.length > 0 ? (
                        paginatedSales.map((row, index) => {
                          const bgColor = getRowColor(row.packaging_status);
                          const txColor = getTextColor(row.packaging_status);
                          const borderCol = `1px solid ${txColor}`;
                          return (
                            <TableRow
                              key={row.id}
                              sx={{
                                backgroundColor: bgColor,
                                "&:last-child td, &:last-child th": { border: 0 }
                              }}
                            >
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {(page - 1) * rowsPerPage + index + 1}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.staff_name}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.company_name || "N/A"}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor, fontWeight: "medium" }}>
                                {row.outlet_name}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.location_name || "N/A"}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.outlet_erp_id}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor, fontWeight: "bold" }}>
                                {row.sticker_number}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.invoice_number}
                              </TableCell>
                              <TableCell align="right" sx={{ borderBottom: borderCol, py: 2, color: txColor, fontWeight: "bold" }}>
                                ₹{Number(row.price).toFixed(2)}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.item_count || "N/A"}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.packed_item_count || row.item_count || "N/A"}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.box_count || "N/A"}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.packet_count || "N/A"}
                              </TableCell>

                              {activeTab === "out_for_delivery" && (
                                <>
                                  <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                    {row.delivery_boy_name || "N/A"}
                                  </TableCell>
                                  <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                    {row.vehicle_no || "N/A"}
                                  </TableCell>
                                </>
                              )}

                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {activeTab === "pending" ? (
                                  <FormControl size="small" sx={{ minWidth: 160 }}>
                                    <Select
                                      value={row.packaging_status === 'packing_done' ? '' : row.packaging_status}
                                      displayEmpty
                                      onChange={(e) => handleRowChange(row.id, "packaging_status", e.target.value)}
                                      sx={{ height: "36px", fontSize: "0.875rem", backgroundColor: "#fff" }}
                                    >
                                      <MenuItem value="" disabled>Select Status</MenuItem>
                                      <MenuItem value="out_for_delivery">Out for Delivery</MenuItem>
                                    </Select>
                                  </FormControl>
                                ) : (
                                  statusLabels[row.packaging_status] || row.packaging_status
                                )}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {formatDate(row.delivery_date)}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {formatDate(row.packing_date)}
                              </TableCell>
                              {activeTab === "pending" && (
                                <>
                                  <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                    <MDButton color="info" variant="text" size="small" onClick={() => handleOpenDetails(row.id)}>
                                      {(row.delivery_boy_id && row.vehicle_no && row.delivery_date) ? "Edit Details" : "Assign Details"}
                                    </MDButton>
                                  </TableCell>
                                  <TableCell align="center" sx={{ borderBottom: borderCol, py: 2 }}>
                                    <MDBox display="flex" gap={1} justifyContent="center" flexWrap="wrap" sx={{ backgroundColor: "#f0fdfa", padding: "8px 12px", borderRadius: "8px", border: "1px solid #99f6e4" }}>
                                      <IoSaveOutline onClick={() => handleSaveDelivery(row.id)} style={{ cursor: "pointer" }} color="#059669" size={20} />
                                      <FaEye onClick={() => handleViewHistory(row.id)} style={{ cursor: "pointer" }} color="#E0E388" size={20} />
                                    </MDBox>
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          )
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={17} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No deliveries found.
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
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />

      <Dialog open={detailsModalOpen} onClose={handleCloseDetails} fullWidth maxWidth="xs">
        <DialogTitle>Assign Delivery Details</DialogTitle>
        <DialogContent dividers>
          <MDBox display="flex" flexDirection="column" gap={2} mt={1}>
            <FormControl size="small" fullWidth>
              <Select
                value={
                  activeRowId
                    ? salesData.find((r) => r.id === activeRowId)?.delivery_boy_id || ""
                    : ""
                }
                displayEmpty
                onChange={(e) => handleRowChange(activeRowId, "delivery_boy_id", e.target.value)}
                sx={{ height: "44px", width: "100%" }}
              >
                <MenuItem value="" disabled>Select Delivery Boy</MenuItem>
                {deliveryBoys.map((boy) => (
                  <MenuItem key={boy.id} value={boy.id}>
                    {boy.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <MDInput
              type="text"
              label="Vehicle No"
              fullWidth
              value={
                activeRowId
                  ? salesData.find((r) => r.id === activeRowId)?.vehicle_no || ""
                  : ""
              }
              onChange={(e) => handleRowChange(activeRowId, "vehicle_no", e.target.value)}
            />
            <MDInput
              type="date"
              label="Delivery Date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={
                activeRowId
                  ? salesData.find((r) => r.id === activeRowId)?.delivery_date || ""
                  : ""
              }
              onChange={(e) => handleRowChange(activeRowId, "delivery_date", e.target.value)}
            />
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton onClick={handleCloseDetails} color="dark">Done</MDButton>
        </DialogActions>
      </Dialog>

      <Dialog
        open={historyDialog.open}
        onClose={() => setHistoryDialog({ open: false, sale: null, history: [] })}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Status Update Dates</DialogTitle>
        <DialogContent dividers>
          <MDBox mb={2}>
            <MDTypography variant="button" fontWeight="medium">
              Sale ID: {historyDialog.sale ? formatBpSaleId(historyDialog.sale) : "N/A"}
            </MDTypography>
            <MDTypography display="block" variant="button" fontWeight="medium">
              Invoice: {historyDialog.sale?.invoice_number || "N/A"}
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Invoice Date: {formatDate(historyDialog.sale?.sale_date)}
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Outlet: {historyDialog.sale?.outlet_name || "N/A"}
            </MDTypography>
          </MDBox>
          <Table size="small">
            <TableHead sx={{ display: "table-header-group" }}>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell align="center">Update Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historyDialog.history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{statusLabels[item.status] || item.status}</TableCell>
                  <TableCell align="center">{formatDateTime(item.changed_at)}</TableCell>
                </TableRow>
              ))}
              {historyDialog.history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} align="center">
                    No status update dates found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" onClick={() => setHistoryDialog({ open: false, sale: null, history: [] })}>
            Close
          </MDButton>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default Delivery;
