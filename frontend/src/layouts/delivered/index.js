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

function Delivered() {
  const [salesData, setSalesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingSaleIds, setUpdatingSaleIds] = useState(new Set());
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
    if (st !== 'out_for_delivery' && st !== 'delivered' && st !== 'cancelled') return false;

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
          newStatus === "out_for_delivery" || newStatus === "delivered" || newStatus === "cancelled"
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
                        sx={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}
                      >
                        <MDTypography variant="caption" color="text">
                          Total Cancel
                        </MDTypography>
                        <MDTypography variant="h5" color="error" fontWeight="bold">
                          {cancelledTotal}
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
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2, fontWeight: "bold" }}>{formatBpSaleId(row)}</TableCell>
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
    </DashboardLayout>
  );
}

export default Delivered;
