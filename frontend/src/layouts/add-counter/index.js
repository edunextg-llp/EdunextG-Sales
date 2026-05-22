import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import { MenuItem, Select, FormControl, InputLabel } from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

function AddCounter() {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [outlets, setOutlets] = useState([]);

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

  // Fetch locations when staff or day changes
  useEffect(() => {
    if (selectedStaff && selectedDay) {
      const fetchLocations = async () => {
        try {
          const response = await fetch(
            `${API}/staff/${selectedStaff.id}/locations?day=${selectedDay}`
          );
          const data = await response.json();
          setAvailableLocations(data);
          setSelectedLocation("");
        } catch (error) {
          console.error("Error fetching locations:", error);
        }
      };
      fetchLocations();
    } else {
      setAvailableLocations([]);
    }
  }, [selectedStaff, selectedDay]);

  const addOutletField = () => {
    setOutlets([...outlets, { outletErpId: "", outletName: "", contactNumber: "" }]);
  };

  const removeOutletField = (index) => {
    const updated = [...outlets];
    updated.splice(index, 1);
    setOutlets(updated);
  };

  const handleOutletChange = (index, field, value) => {
    const updated = [...outlets];
    updated[index][field] = value;
    setOutlets(updated);
  };

  const handleSubmit = async () => {
    if (!selectedStaff || !selectedDay || !selectedLocation || outlets.length === 0) {
      alert("Please fill in all details and add at least one outlet.");
      return;
    }

    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/counters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          day: selectedDay,
          location: selectedLocation,
          counters: outlets,
        }),
      });

      if (response.ok) {
        alert("Outlets added successfully!");
        setOutlets([]);
        setSelectedLocation("");
      } else {
        alert("Failed to add outlets.");
      }
    } catch (error) {
      console.error("Error submitting outlets:", error);
      alert("Error submitting form.");
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container justifyContent="center">
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
                  Add Outlets to Staff
                </MDTypography>
              </MDBox>
              <MDBox pt={4} pb={3} px={3}>
                <Grid container spacing={3}>
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
                  {selectedStaff && (
                    <Grid item xs={12} md={6}>
                      <MDBox
                        p={2}
                        sx={{
                          backgroundColor: "#f0f2f5",
                          borderRadius: "10px",
                          border: "1px solid #ddd",
                        }}
                      >
                        <MDTypography variant="button" fontWeight="bold">
                          Staff Details:
                        </MDTypography>
                        <MDTypography variant="body2">Name: {selectedStaff.name}</MDTypography>
                        <MDTypography variant="body2">
                          Contact: {selectedStaff.contact_no}
                        </MDTypography>
                      </MDBox>
                    </Grid>
                  )}
                </Grid>

                {selectedStaff && (
                  <MDBox mt={4}>
                    <Grid container spacing={3}>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                          <InputLabel>Select Day</InputLabel>
                          <Select
                            value={selectedDay}
                            label="Select Day"
                            onChange={(e) => setSelectedDay(e.target.value)}
                            sx={{ height: "45px" }}
                          >
                            {days.map((day) => (
                              <MenuItem key={day} value={day}>
                                {day}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth disabled={!selectedDay}>
                          <InputLabel>Select Location</InputLabel>
                          <Select
                            value={selectedLocation}
                            label="Select Location"
                            onChange={(e) => setSelectedLocation(e.target.value)}
                            sx={{ height: "45px" }}
                          >
                            {availableLocations.map((loc) => (
                              <MenuItem key={loc.id} value={loc.location_name}>
                                {loc.location_name}
                              </MenuItem>
                            ))}
                            {selectedDay && availableLocations.length === 0 && (
                              <MenuItem disabled>No locations assigned for this day</MenuItem>
                            )}
                          </Select>
                        </FormControl>
                      </Grid>
                    </Grid>
                  </MDBox>
                )}

                {selectedLocation && (
                  <MDBox mt={4}>
                    <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <MDTypography variant="h6">Add Outlets for {selectedLocation}</MDTypography>
                      <MDButton
                        variant="gradient"
                        color="dark"
                        size="small"
                        onClick={addOutletField}
                      >
                        <Icon sx={{ mr: 1 }}>add</Icon> Add Outlet
                      </MDButton>
                    </MDBox>

                    {outlets.map((outlet, index) => (
                      <MDBox
                        key={index}
                        mb={2}
                        p={2}
                        sx={{
                          backgroundColor: "#f8f9fa",
                          borderRadius: "10px",
                          border: "1px solid #e9ecef",
                        }}
                      >
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={12} sm={6} md={3}>
                            <MDInput
                              label="ERP Id"
                              fullWidth
                              value={outlet.outletErpId}
                              onChange={(e) =>
                                handleOutletChange(index, "outletErpId", e.target.value)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={4}>
                            <MDInput
                              label="Outlet Name"
                              fullWidth
                              value={outlet.outletName}
                              onChange={(e) =>
                                handleOutletChange(index, "outletName", e.target.value)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={3}>
                            <MDInput
                              label="Contact"
                              fullWidth
                              value={outlet.contactNumber}
                              onChange={(e) =>
                                handleOutletChange(index, "contactNumber", e.target.value)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={2}>
                            <MDButton
                              color="error"
                              variant="text"
                              fullWidth
                              onClick={() => removeOutletField(index)}
                            >
                              <Icon sx={{ mr: 1 }}>delete</Icon> Remove
                            </MDButton>
                          </Grid>
                        </Grid>
                      </MDBox>
                    ))}

                    <MDBox mt={4}>
                      <MDButton variant="gradient" color="info" fullWidth onClick={handleSubmit}>
                        Save Outlets
                      </MDButton>
                    </MDBox>
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

export default AddCounter;
