import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

function AddSales() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [salesData, setSalesData] = useState({}); // { outletId: price }

  const API = "http://localhost:5000/api";

  // Search staff
  const handleSearch = async (query) => {
    if (!query) return;
    try {
      const response = await fetch(`${API}/staff/search?query=${query}`);
      const data = await response.json();
      setStaffOptions(data);
    } catch (error) {
      console.error("Error searching staff:", error);
    }
  };

  // Fetch outlets when staff or date changes
  useEffect(() => {
    if (selectedStaff && selectedDate) {
      const fetchOutlets = async () => {
        try {
          const response = await fetch(
            `${API}/staff/${selectedStaff.id}/outlets-by-date?date=${selectedDate}`
          );
          const data = await response.json();
          setOutlets(data);
          // Initialize salesData with empty strings for each outlet
          const initialSales = {};
          data.forEach((outlet) => {
            initialSales[outlet.id] = "";
          });
          setSalesData(initialSales);
        } catch (error) {
          console.error("Error fetching outlets:", error);
        }
      };
      fetchOutlets();
    } else {
      setOutlets([]);
    }
  }, [selectedStaff, selectedDate]);

  const handlePriceChange = (outletId, value) => {
    setSalesData((prev) => ({
      ...prev,
      [outletId]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!selectedStaff || !selectedDate || Object.keys(salesData).length === 0) {
      alert("Please select staff, date, and enter prices.");
      return;
    }

    const payload = {
      date: selectedDate,
      sales: Object.entries(salesData).map(([outletId, price]) => ({
        outletId: parseInt(outletId),
        price: parseFloat(price) || 0,
      })),
    };

    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        alert("Sales recorded successfully!");
        setSalesData({});
        setOutlets([]);
        setSelectedStaff(null);
      } else {
        alert("Failed to record sales.");
      }
    } catch (error) {
      console.error("Error submitting sales:", error);
      alert("Error submitting form.");
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12} lg={10} mx="auto">
            <Card>
              <MDBox
                variant="gradient"
                bgColor="info"
                borderRadius="lg"
                coloredShadow="info"
                mx={2}
                mt={-3}
                p={3}
                mb={1}
                textAlign="center"
              >
                <MDTypography variant="h4" fontWeight="medium" color="white" mt={1}>
                  Daily Outlet Price Entry
                </MDTypography>
              </MDBox>
              <MDBox pt={4} pb={3} px={3}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <MDBox mb={2}>
                      <MDInput
                        type="date"
                        label="Select Date"
                        fullWidth
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <MDBox mb={2}>
                      <Autocomplete
                        options={staffOptions}
                        getOptionLabel={(option) => option.name}
                        onChange={(event, newValue) => setSelectedStaff(newValue)}
                        onInputChange={(event, newInputValue) => handleSearch(newInputValue)}
                        renderInput={(params) => (
                          <MDInput {...params} label="Search Staff Name" fullWidth />
                        )}
                      />
                    </MDBox>
                  </Grid>
                </Grid>

                {selectedStaff && outlets.length > 0 && (
                  <MDBox mt={4}>
                    <MDTypography variant="h6" mb={2}>
                      Enter Prices for {new Date(selectedDate).toLocaleDateString()}
                    </MDTypography>
                    <TableContainer
                      component={Paper}
                      sx={{ boxShadow: "none", backgroundColor: "transparent" }}
                    >
                      <Table>
                        <TableHead sx={{ display: "table-header-group" }}>
                          <TableRow>
                            <TableCell sx={{ fontWeight: "bold" }}>Outlet Name</TableCell>
                            <TableCell sx={{ fontWeight: "bold" }}>ERP ID</TableCell>
                            <TableCell align="right" sx={{ fontWeight: "bold" }}>
                              Price
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {outlets.map((outlet) => (
                            <TableRow key={outlet.id}>
                              <TableCell>{outlet.outlet_name}</TableCell>
                              <TableCell>{outlet.outlet_erp_id}</TableCell>
                              <TableCell align="right">
                                <MDInput
                                  type="number"
                                  label="Price"
                                  size="small"
                                  value={salesData[outlet.id] || ""}
                                  onChange={(e) => handlePriceChange(outlet.id, e.target.value)}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    <MDBox mt={4}>
                      <MDButton variant="gradient" color="info" fullWidth onClick={handleSubmit}>
                        Submit Prices
                      </MDButton>
                    </MDBox>
                  </MDBox>
                )}

                {selectedStaff && outlets.length === 0 && (
                  <MDBox mt={4} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      No outlets assigned for this staff on this day of the week.
                    </MDTypography>
                  </MDBox>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default AddSales;
