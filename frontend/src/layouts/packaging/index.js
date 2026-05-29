import { useState, useEffect } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
// import Icon from "@mui/material/Icon";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, FormControl, Select, MenuItem } from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

function Packaging() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [salesData, setSalesData] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const API = "https://bawarchee.edunextg.co/api";

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
        console.error("Failed to fetch sales for packaging");
        setSalesData([]);
      }
    } catch (error) {
      console.error("Error fetching global sales:", error);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [selectedDate]);

  const handleRowChange = (saleId, field, value) => {
    const newData = [...salesData];
    const index = newData.findIndex(r => r.id === saleId);
    if (index === -1) return;
    newData[index] = { ...newData[index], [field]: value };
    setSalesData(newData);
  };

  const handleSavePackaging = async (saleId) => {
    const row = salesData.find(r => r.id === saleId);
    if (!row) return;
    try {
      const payload = {
        packagingStatus: row.packaging_status || 'not_packing',
      };

      const response = await fetch(`${API}/staff/sales/${row.id}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        alert("Packaging status updated!");
        fetchSales();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update packaging status.");
      }
    } catch (error) {
      console.error("Error saving packaging:", error);
      alert("Error saving packaging status.");
    }
  };

  const getRowColor = (status) => {
    if (status === 'packing_done') return '#dcfce7'; // green
    if (status === 'packing') return '#fef08a'; // yellow
    return '#ffebeb'; // default red
  };

  const getTextColor = (status) => {
    if (status === 'packing_done') return '#166534'; // dark green
    if (status === 'packing') return '#854d0e'; // dark yellow
    return '#991b1b'; // dark red
  };

  const filteredSales = salesData.filter((row) => {
    const status = row.original_packaging_status || row.packaging_status || 'not_packing';
    if (status === 'out_for_delivery' || status === 'delivered') return false; // moves to Delivery Sections

    if (statusFilter !== "all" && status !== statusFilter) {
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
                  Packaging - Daily Sales
                </MDTypography>
              </MDBox>
              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="text"
                      label="Search by Outlet Name or ID"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        sx={{ height: "44px", backgroundColor: "#fff" }}
                      >
                        <MenuItem value="all">All Progress</MenuItem>
                        <MenuItem value="not_packing">Not Started</MenuItem>
                        <MenuItem value="packing">In Progress</MenuItem>
                        <MenuItem value="packing_done">Packing Done</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
                  <Table sx={{ minWidth: 650 }}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Staff Name
                        </TableCell>
                        <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Outlet Name
                        </TableCell>
                        <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          ERP ID
                        </TableCell>
                        {/* <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Date
                        </TableCell> */}
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
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredSales.length > 0 ? (
                        filteredSales.map((row) => {
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
                                <FormControl size="small" sx={{ minWidth: 140 }}>
                                  <Select
                                    value={row.packaging_status || 'not_packing'}
                                    onChange={(e) => handleRowChange(row.id, "packaging_status", e.target.value)}
                                    sx={{ height: "36px", fontSize: "0.875rem", backgroundColor: "#fff" }}
                                  >
                                    <MenuItem value="not_packing">Not Packing</MenuItem>
                                    <MenuItem value="packing">Packing In Progress</MenuItem>
                                    <MenuItem value="packing_done">Packing Done</MenuItem>
                                  </Select>
                                </FormControl>
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2 }}>
                                <MDButton color="dark" variant="gradient" size="small" onClick={() => handleSavePackaging(row.id)}>
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
                              No sales found.
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

export default Packaging;
