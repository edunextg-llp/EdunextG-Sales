import { useState, useEffect } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, FormControl, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

function Delivery() {
  const [salesData, setSalesData] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const API = "http://localhost:5000/api";

  const handleOpenDetails = (saleId) => {
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
  }, []);

  const fetchSales = async () => {
    try {
      const response = await fetch(`${API}/staff/sales/by-date`);
      if (response.ok) {
        const data = await response.json();
        const enhancedData = data.map(r => ({ ...r, original_packaging_status: r.packaging_status }));
        setSalesData(enhancedData);
      } else {
        setSalesData([]);
      }
    } catch (error) {
      console.error("Error fetching global sales:", error);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const handleRowChange = (saleId, field, value) => {
    const newData = [...salesData];
    const index = newData.findIndex(r => r.id === saleId);
    if (index === -1) return;
    newData[index] = { ...newData[index], [field]: value };
    setSalesData(newData);
  };

  const handleSaveDelivery = async (saleId) => {
    const row = salesData.find(r => r.id === saleId);
    if (!row) return;
    try {
      if ((row.packaging_status === 'out_for_delivery' || row.packaging_status === 'delivered') && (!row.delivery_boy_id || !row.vehicle_no)) {
        alert("Please assign a Delivery Boy and Vehicle No via 'Assign Details' before marking this item.");
        return;
      }

      let finalStatus = row.packaging_status || 'packing_done';

      const payload = {
        packagingStatus: finalStatus,
        deliveryBoyId: row.delivery_boy_id || null,
        vehicleNo: row.vehicle_no || null
      };

      const response = await fetch(`${API}/staff/sales/${row.id}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        alert("Delivery status updated!");
        fetchSales();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update delivery status.");
      }
    } catch (error) {
      console.error("Error saving delivery info:", error);
      alert("Error saving delivery status.");
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

  const filteredSales = salesData.filter((row) => {
    // Delivery page strictly tracks unassigned items.
    const status = row.original_packaging_status || row.packaging_status || 'not_packing';
    if (status !== 'packing_done') {
      return false;
    }

    const search = searchQuery.toLowerCase();
    const outletName = row.outlet_name ? row.outlet_name.toLowerCase() : "";
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    return outletName.includes(search) || outletErpId.includes(search);
  });

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center">
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Delivery Management
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
                          Status
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Delivery Details
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredSales.length > 0 ? (
                        filteredSales.map((row, index) => {
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
                                {index + 1}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.staff_name}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor, fontWeight: "medium" }}>
                                {row.outlet_name}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.outlet_erp_id}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.invoice_number}
                              </TableCell>
                              <TableCell align="right" sx={{ borderBottom: borderCol, py: 2, color: txColor, fontWeight: "bold" }}>
                                ₹{Number(row.price).toFixed(2)}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
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
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                <MDButton color="info" variant="text" size="small" onClick={() => handleOpenDetails(row.id)}>
                                  {(row.delivery_boy_id && row.vehicle_no) ? "Edit Details" : "Assign Details"}
                                </MDButton>
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2 }}>
                                <MDButton color="dark" variant="gradient" size="small" onClick={() => handleSaveDelivery(row.id)}>
                                  Save
                                </MDButton>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={9} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No deliveries found.
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
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton onClick={handleCloseDetails} color="dark">Done</MDButton>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default Delivery;
