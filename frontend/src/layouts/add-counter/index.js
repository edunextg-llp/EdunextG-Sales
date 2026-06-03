import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";

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
  const [savedOutlets, setSavedOutlets] = useState([]);
  const [editingOutletId, setEditingOutletId] = useState(null);
  const [editFormData, setEditFormData] = useState({ outletErpId: "", outletName: "", contactNumber: "" });

  const API = "http://localhost:5000/api";

  const fetchStaffOptions = async (query = "") => {
    try {
      const endpoint = query.trim()
        ? `${API}/staff/search?query=${encodeURIComponent(query)}`
        : `${API}/staff`;
      const response = await fetch(endpoint);
      if (!response.ok) return;
      const data = await response.json();
      setStaffOptions(data);
    } catch (error) {
      console.error("Error searching staff:", error);
    }
  };

  useEffect(() => {
    fetchStaffOptions();
  }, []);

  const fetchSavedOutlets = async (staffId, day) => {
    try {
      const response = await fetch(`${API}/staff/${staffId}/outlets-by-day?day=${day}`);
      const data = await response.json();
      setSavedOutlets(data);
    } catch (error) {
      console.error("Error fetching saved outlets:", error);
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
      fetchSavedOutlets(selectedStaff.id, selectedDay);
    } else {
      setAvailableLocations([]);
      setSavedOutlets([]);
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
        fetchSavedOutlets(selectedStaff.id, selectedDay);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to add outlets.");
      }
    } catch (error) {
      console.error("Error submitting outlets:", error);
      alert("Error submitting form.");
    }
  };

  const handleDeleteSavedOutlet = async (counterId) => {
    if (!window.confirm("Are you sure you want to delete this outlet?")) return;
    try {
      const response = await fetch(`${API}/staff/counter/${counterId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        alert("Outlet deleted successfully!");
        fetchSavedOutlets(selectedStaff.id, selectedDay);
      } else {
        alert("Failed to delete outlet.");
      }
    } catch (error) {
      console.error("Error deleting outlet:", error);
    }
  };

  const handleEditClick = (outlet) => {
    setEditingOutletId(outlet.id);
    setEditFormData({
      outletErpId: outlet.outlet_erp_id,
      outletName: outlet.outlet_name,
      contactNumber: outlet.contact_number,
    });
  };

  const handleCancelEdit = () => {
    setEditingOutletId(null);
    setEditFormData({ outletErpId: "", outletName: "", contactNumber: "" });
  };

  const handleSaveEdit = async (counterId) => {
    try {
      const response = await fetch(`${API}/staff/counter/${counterId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(editFormData),
      });

      if (response.ok) {
        alert("Outlet updated successfully!");
        setEditingOutletId(null);
        fetchSavedOutlets(selectedStaff.id, selectedDay);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update outlet.");
      }
    } catch (error) {
      console.error("Error updating outlet:", error);
      alert("Error updating outlet.");
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container justifyContent="center">
          <Grid item xs={12}>
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
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        onChange={(event, newValue) => setSelectedStaff(newValue)}
                        onOpen={() => {
                          if (staffOptions.length === 0) {
                            fetchStaffOptions();
                          }
                        }}
                        onInputChange={(event, newInputValue) => fetchStaffOptions(newInputValue)}
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
                        <MDTypography variant="body2">
                          Company: {selectedStaff.company_name}
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
                        <FormControl fullWidth size="small">
                          <InputLabel id="select-day-label">Select Day</InputLabel>
                          <Select
                            labelId="select-day-label"
                            id="select-day"
                            value={selectedDay}
                            label="Select Day"
                            onChange={(e) => setSelectedDay(e.target.value)}
                            sx={{ minHeight: 48, height: 48 }}
                          >
                            <MenuItem value="">
                              <em>None</em>
                            </MenuItem>
                            {days.map((day) => (
                              <MenuItem key={day} value={day}>
                                {day}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth size="small" disabled={!selectedDay}>
                          <InputLabel id="select-location-label">Select Location</InputLabel>
                          <Select
                            labelId="select-location-label"
                            id="select-location"
                            value={selectedLocation}
                            label="Select Location"
                            onChange={(e) => setSelectedLocation(e.target.value)}
                            sx={{ minHeight: 48 }}
                          >
                            <MenuItem value="">
                              <em>None</em>
                            </MenuItem>
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
                        p={3}
                        sx={{
                          backgroundColor: "#f8f9fa",
                          borderRadius: "10px",
                          border: "1px solid #e9ecef",
                          minHeight: 110,
                        }}
                      >
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={12} sm={6} md={3}>
                            <MDInput
                              label="ERP Id"
                              fullWidth
                              InputProps={{ sx: { minHeight: 48 } }}
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
                              InputProps={{ sx: { minHeight: 48 } }}
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
                              InputProps={{ sx: { minHeight: 48 } }}
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
                              sx={{ minHeight: 48 }}
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

                {savedOutlets.length > 0 && (
                  <MDBox mt={5}>
                    <MDTypography variant="h6" mb={2}>Saved Outlets for {selectedDay}</MDTypography>
                    {savedOutlets.map((saved) => (
                      <MDBox
                        key={saved.id}
                        mb={2}
                        p={2}
                        sx={{
                          backgroundColor: "#f8f9fa",
                          borderRadius: "10px",
                          border: "1px solid #e9ecef",
                        }}
                      >
                        {editingOutletId === saved.id ? (
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={6} md={3}>
                              <MDInput
                                label="ERP Id"
                                fullWidth
                                value={editFormData.outletErpId}
                                onChange={(e) => setEditFormData({ ...editFormData, outletErpId: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <MDInput
                                label="Outlet Name"
                                fullWidth
                                value={editFormData.outletName}
                                onChange={(e) => setEditFormData({ ...editFormData, outletName: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <MDInput
                                label="Contact"
                                fullWidth
                                value={editFormData.contactNumber}
                                onChange={(e) => setEditFormData({ ...editFormData, contactNumber: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} md={2}>
                              <MDBox display="flex" flexDirection="column" gap={1}>
                                <MDButton color="success" variant="gradient" size="small" onClick={() => handleSaveEdit(saved.id)}>
                                  Save
                                </MDButton>
                                <MDButton color="secondary" variant="gradient" size="small" onClick={handleCancelEdit}>
                                  Cancel
                                </MDButton>
                              </MDBox>
                            </Grid>
                          </Grid>
                        ) : (
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={6} md={3}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.outlet_erp_id}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={4}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.outlet_name}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.contact_number}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} md={2}>
                              <MDBox display="flex" gap={1}>
                                <MDButton color="info" variant="text" size="small" onClick={() => handleEditClick(saved)}>
                                  <Icon>edit</Icon> Edit
                                </MDButton>
                                <MDButton color="error" variant="text" size="small" onClick={() => handleDeleteSavedOutlet(saved.id)}>
                                  <Icon>delete</Icon> Delete
                                </MDButton>
                              </MDBox>
                            </Grid>
                          </Grid>
                        )}
                      </MDBox>
                    ))}
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
