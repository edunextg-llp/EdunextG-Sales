import { useState, useEffect, useCallback } from "react";
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
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useSalesPolling } from "utils/salesSync";
import { formatBpSaleId } from "utils/saleId";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingSaleIds, setUpdatingSaleIds] = useState(new Set());
  const [cancelReportOpen, setCancelReportOpen] = useState(false);
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

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useSalesPolling(fetchSales);

  const filteredSales = salesData.filter((row) => {
    const st = row.packaging_status;
    if (st !== 'out_for_delivery' && st !== 'delivered' && st !== 'cancelled' && st !== 'returned') return false;

    const search = searchQuery.toLowerCase();
    const outletName = row.outlet_name ? row.outlet_name.toLowerCase() : "";
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    const staffName = row.staff_name ? row.staff_name.toLowerCase() : "";
    const saleId = formatBpSaleId(row).toLowerCase();
    return (
      outletName.includes(search) ||
      outletErpId.includes(search) ||
      staffName.includes(search) ||
      saleId.includes(search)
    );
  });

  const deliveredTotal = filteredSales.filter((row) => row.packaging_status === "delivered").length;
  const cancelledTotal = filteredSales.filter((row) => row.packaging_status === "cancelled").length;
  const returnedTotal = filteredSales.filter((row) => row.packaging_status === "returned").length;
  const cancelledSales = filteredSales.filter((row) => row.packaging_status === "cancelled");
  const cancelledAmount = cancelledSales.reduce(
    (total, row) => total + (Number(row.price) || 0),
    0
  );

  const handleDownloadCancelReport = () => {
    const rowsHtml = cancelledSales
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.staff_name || "N/A")}</td>
            <td>${escapeHtml(row.delivery_boy_name || "N/A")}</td>
            <td>${escapeHtml(formatDate(row.delivery_date || row.status_updated_at || row.sale_date))}</td>
            <td>${escapeHtml(row.outlet_erp_id || "N/A")}</td>
            <td>${escapeHtml(row.outlet_name || "N/A")}</td>
            <td>${escapeHtml(row.google_location || "N/A")}</td>
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
            .sub { color: #4b5563; margin-bottom: 14px; font-size: 13px; }
            .total { display: inline-block; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; padding: 10px 12px; border-radius: 6px; font-weight: 700; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; vertical-align: top; }
            th { background: #fef2f2; font-weight: 700; color: #7f1d1d; }
            .right { text-align: right; white-space: nowrap; }
            .empty { padding: 24px; text-align: center; color: #6b7280; border: 1px solid #d1d5db; }
            @media print { body { margin: 12mm; } }
          </style>
        </head>
        <body>
          <h1>Cancelled Invoice Report</h1>
          <div class="sub">Cancelled invoices in the current list.</div>
          <div class="total">Total Cancel Amount: Rs. ${cancelledAmount.toFixed(2)}</div>
          ${
            cancelledSales.length > 0
              ? `<table>
                  <thead>
                    <tr>
                      <th>Sr No</th>
                      <th>Staff Name</th>
                      <th>Delivery Boy</th>
                      <th>Cancel Date</th>
                      <th>ERP ID</th>
                      <th>Outlet Name</th>
                      <th>Outlet Location</th>
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
        const updated = data.sale;
        setSalesData((prevData) =>
          prevData.map((row) => (row.id === saleId ? { ...row, ...updated } : row))
        );
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
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center">
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Delivered Items
                </MDTypography>
              </MDBox>
              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      type="text"
                      label="Search by Outlet Name, ID, Staff Name, or Sale ID"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={8}>
                    <MDBox display="flex" gap={2} justifyContent={{ xs: "flex-start", md: "flex-end" }} flexWrap="wrap">
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
                        onClick={() => setCancelReportOpen(true)}
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

                <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
                  <Table sx={{ minWidth: 650 }}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell
                          align="center"
                          sx={{
                            color: "#6b7280",
                            borderBottom: "1px solid #e5e7eb",
                            py: 1.5,
                            fontWeight: 500,
                            width: 56,
                          }}
                        >
                          Sr No
                        </TableCell>
                        <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Staff Name
                        </TableCell>
                        <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Outlet Name
                        </TableCell>
                        <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          ERP ID
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Sale ID
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Invoice No
                        </TableCell>
                        <TableCell align="right" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Price
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          No. of Item
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Packing Item
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          No. of Box
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Delivery Boy
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Vehicle
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Delivery Date
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Status
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredSales.length > 0 ? (
                        filteredSales.map((row, index) => (
                          <TableRow
                            key={row.id}
                            sx={{
                              backgroundColor: row.packaging_status === 'cancelled' ? '#fef2f2' : row.packaging_status === 'returned' ? '#fff7ed' : row.packaging_status === 'delivered' ? '#f0fdf4' : '#f8fafc',
                              "&:last-child td, &:last-child th": { border: 0 }
                            }}
                          >
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {index + 1}
                            </TableCell>
                            <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.staff_name}</TableCell>
                            <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2, fontWeight: "medium" }}>{row.outlet_name}</TableCell>
                            <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.outlet_erp_id}</TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, fontWeight: "bold" }}>{formatBpSaleId(row)}</TableCell>
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
                              {row.delivery_boy_name || 'N/A'}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                              {row.vehicle_no || 'N/A'}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                              {formatDate(row.delivery_date)}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {row.packaging_status === 'cancelled' ? (
                                <Chip label="Cancelled" color="error" variant="outlined" size="small" />
                              ) : row.packaging_status === 'returned' ? (
                                <Chip label="Returned" color="warning" variant="outlined" size="small" />
                              ) : row.packaging_status === 'delivered' ? (
                                <Chip label="Delivered" color="success" variant="outlined" size="small" />
                              ) : row.packaging_status === 'out_for_delivery' ? (
                                <Chip label="In Transit" color="warning" variant="outlined" size="small" />
                              ) : (
                                <Chip label={row.packaging_status || "Unknown"} color="default" variant="outlined" size="small" />
                              )}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {row.packaging_status === 'out_for_delivery' ? (
                                <MDBox display="flex" gap={1} justifyContent="center" flexWrap="wrap">
                                  <MDButton color="error" variant="contained" size="small" onClick={() => handleUpdateStatus(row.id, 'cancelled', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}>
                                    Cancel
                                  </MDButton>
                                  <MDButton color="success" variant="contained" size="small" onClick={() => handleUpdateStatus(row.id, 'delivered', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}>
                                    Deliver
                                  </MDButton>
                                  <MDButton color="dark" variant="gradient" size="small" onClick={() => handleUpdateStatus(row.id, 'returned', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}>
                                    Return
                                  </MDButton>
                                </MDBox>
                              ) : (
                                <MDButton
                                  color="info"
                                  variant="outlined"
                                  size="small"
                                  onClick={() => handleUpdateStatus(row.id, 'out_for_delivery', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}
                                >
                                  Edit
                                </MDButton>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={15} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No delivered items found.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Dialog open={cancelReportOpen} onClose={() => setCancelReportOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Cancelled Invoice Report</DialogTitle>
        <DialogContent dividers>
          <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
            <MDTypography variant="body2" color="text">
              Cancelled invoices in the current list.
            </MDTypography>
            <MDTypography variant="h6" color="error" fontWeight="bold">
              Total Cancel Amount: ₹{cancelledAmount.toFixed(2)}
            </MDTypography>
          </MDBox>
          <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #fecaca" }}>
            <Table size="small">
              <TableHead sx={{ display: "table-header-group", backgroundColor: "#fef2f2" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Sr No</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Outlet Name</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>Invoice No</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>Cancel Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cancelledSales.map((row, index) => (
                  <TableRow key={`cancelled-${row.id}`}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{row.outlet_name || "N/A"}</TableCell>
                    <TableCell align="center">{row.invoice_number || "N/A"}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      ₹{Number(row.price || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                {cancelledSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
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
