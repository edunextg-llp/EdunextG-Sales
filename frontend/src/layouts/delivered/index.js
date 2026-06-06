import { useState, useEffect } from "react";
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

function Delivered() {
  const [salesData, setSalesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [historyDialog, setHistoryDialog] = useState({ open: false, sale: null, history: [] });
  const API = "https://bawarchee.edunextg.co/api";

  const statusLabels = {
    not_packing: "Not Packing",
    packing: "Packing In Progress",
    packing_done: "Packing Done",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

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

  const formatDateTime = (value) => {
    if (!value) return "N/A";
    const [datePart, timePart = ""] = String(value).split(/[T ]/);
    return `${formatDate(datePart)}${timePart ? ` ${timePart.slice(0, 5)}` : ""}`;
  };

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const response = await fetch(`${API}/staff/sales/by-date`);
        if (response.ok) {
          const data = await response.json();
          setSalesData(data);
        } else {
          setSalesData([]);
        }
      } catch (error) {
        console.error("Error fetching global sales:", error);
      }
    };
    fetchSales();
  }, []);

  const filteredSales = salesData.filter((row) => {
    const st = row.packaging_status;
    if (st !== 'out_for_delivery' && st !== 'delivered' && st !== 'cancelled') return false;

    const search = searchQuery.toLowerCase();
    const outletName = row.outlet_name ? row.outlet_name.toLowerCase() : "";
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    const staffName = row.staff_name ? row.staff_name.toLowerCase() : "";
    return outletName.includes(search) || outletErpId.includes(search) || staffName.includes(search);
  });

  const handleUpdateStatus = async (saleId, newStatus, currentDeliveryBoy, currentVehicle, currentDeliveryDate) => {
    try {
      const payload = {
        packagingStatus: newStatus,
        deliveryBoyId: currentDeliveryBoy || null,
        vehicleNo: currentVehicle || null,
        deliveryDate:
          newStatus === 'out_for_delivery' || newStatus === 'delivered' || newStatus === 'cancelled'
            ? currentDeliveryDate || getTodayLocalDate()
            : null
      };

      const response = await fetch(`${API}/staff/sales/${saleId}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        // Find local index and mutate state instantly to avoid roundtrip UI jumps
        setSalesData((prevData) =>
          prevData.map((row) =>
            row.id === saleId
              ? {
                  ...row,
                  packaging_status: newStatus,
                  delivery_date: payload.deliveryDate,
                  status_updated_at: data.sale?.status_updated_at || row.status_updated_at,
                }
              : row
          )
        );
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || "Failed to update status.");
      }
    } catch (error) {
      console.error("Error updating status:", error);
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
                      label="Search by Outlet Name, ID, or Staff Name"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
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
                          Invoice No
                        </TableCell>
                        <TableCell align="right" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Price
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
                          Status Date
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
                              backgroundColor: row.packaging_status === 'cancelled' ? '#fef2f2' : row.packaging_status === 'delivered' ? '#f0fdf4' : '#f8fafc',
                              "&:last-child td, &:last-child th": { border: 0 }
                            }}
                          >
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {index + 1}
                            </TableCell>
                            <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.staff_name}</TableCell>
                            <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2, fontWeight: "medium" }}>{row.outlet_name}</TableCell>
                            <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.outlet_erp_id}</TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>{row.invoice_number}</TableCell>
                            <TableCell align="right" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, fontWeight: "bold" }}>
                              ₹{Number(row.price).toFixed(2)}
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
                              ) : row.packaging_status === 'delivered' ? (
                                <Chip label="Delivered" color="success" variant="outlined" size="small" />
                              ) : row.packaging_status === 'out_for_delivery' ? (
                                <Chip label="In Transit" color="warning" variant="outlined" size="small" />
                              ) : (
                                <Chip label={row.packaging_status || "Unknown"} color="default" variant="outlined" size="small" />
                              )}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, color: '#334155' }}>
                              {formatDateTime(row.status_updated_at)}
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
                                  <MDButton color="dark" variant="gradient" size="small" onClick={() => handleUpdateStatus(row.id, 'packing_done', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}>
                                    Return
                                  </MDButton>
                                  <MDButton color="info" variant="outlined" size="small" onClick={() => handleViewHistory(row.id)}>
                                    View
                                  </MDButton>
                                </MDBox>
                              ) : (
                                <MDBox display="flex" gap={1} justifyContent="center" flexWrap="wrap">
                                  <MDButton
                                    color="info"
                                    variant="outlined"
                                    size="small"
                                    onClick={() => handleUpdateStatus(row.id, 'out_for_delivery', row.delivery_boy_id, row.vehicle_no, row.delivery_date)}
                                  >
                                    Edit
                                  </MDButton>
                                  <MDButton color="dark" variant="outlined" size="small" onClick={() => handleViewHistory(row.id)}>
                                    View
                                  </MDButton>
                                </MDBox>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={12} align="center" sx={{ py: 3, borderBottom: 0 }}>
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
      <Footer />

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

export default Delivered;
