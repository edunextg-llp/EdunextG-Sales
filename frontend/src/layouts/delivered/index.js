import { useState, useEffect } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip } from "@mui/material";

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
  const API = "https://bawarchee.edunextg.co/api";

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
    return outletName.includes(search) || outletErpId.includes(search);
  });

  const handleUpdateStatus = async (saleId, newStatus, currentDeliveryBoy, currentVehicle) => {
    try {
      const payload = {
        packagingStatus: newStatus,
        deliveryBoyId: currentDeliveryBoy || null,
        vehicleNo: currentVehicle || null
      };

      const response = await fetch(`${API}/staff/sales/${saleId}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        // Find local index and mutate state instantly to avoid roundtrip UI jumps
        setSalesData((prevData) =>
          prevData.map((row) =>
            row.id === saleId ? { ...row, packaging_status: newStatus } : row
          )
        );
      } else {
        alert("Failed to update status.");
      }
    } catch (error) {
      console.error("Error updating status:", error);
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
                      label="Search by Outlet Name or ID"
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
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {row.packaging_status === 'cancelled' ? (
                                <Chip label="Cancelled" color="error" variant="outlined" size="small" />
                              ) : row.packaging_status === 'delivered' ? (
                                <Chip label="Delivered" color="success" variant="outlined" size="small" />
                              ) : (
                                <Chip label="In Transit" color="warning" variant="outlined" size="small" />
                              )}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              <MDBox display="flex" gap={1} justifyContent="center" flexWrap="wrap">
                                {row.packaging_status === 'out_for_delivery' && (
                                  <>
                                    <MDButton color="error" variant="contained" size="small" onClick={() => handleUpdateStatus(row.id, 'cancelled', row.delivery_boy_id, row.vehicle_no)}>
                                      Cancel
                                    </MDButton>
                                    <MDButton color="success" variant="contained" size="small" onClick={() => handleUpdateStatus(row.id, 'delivered', row.delivery_boy_id, row.vehicle_no)}>
                                      Deliver
                                    </MDButton>
                                    <MDButton color="dark" variant="gradient" size="small" onClick={() => handleUpdateStatus(row.id, 'packing_done', row.delivery_boy_id, row.vehicle_no)}>
                                      Return
                                    </MDButton>
                                  </>
                                )}

                              </MDBox>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={10} align="center" sx={{ py: 3, borderBottom: 0 }}>
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
