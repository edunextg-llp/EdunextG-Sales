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
  const cnfRouteDay = "CNF";
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaffType, setSelectedStaffType] = useState("");
  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [savedOutlets, setSavedOutlets] = useState([]);
  const [editingOutletId, setEditingOutletId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    outletErpId: "",
    outletName: "",
    contactNumber: "",
    googleLocation: "",
  });

  const API = "https://bawarchee.eunextg.co/api";
  const isCnfStaff = selectedStaff?.staff_type === "cnf";
  const routeDay = isCnfStaff ? cnfRouteDay : selectedDay;

  const getStaffCompanies = (staff) =>
    String(staff?.company_name || "")
      .split(",")
      .map((company) => company.trim())
      .filter(Boolean);

  const companyOptions = [
    ...new Set(
      staffOptions
        .filter((staff) => !selectedStaffType || (staff.staff_type || "distributor") === selectedStaffType)
        .flatMap(getStaffCompanies)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filteredStaffOptions = staffOptions.filter((staff) => {
    const matchesType = !selectedStaffType || (staff.staff_type || "distributor") === selectedStaffType;
    const matchesCompany =
      !selectedCompanyName || getStaffCompanies(staff).includes(selectedCompanyName);
    return matchesType && matchesCompany;
  });

  const normalizeText = (value) => String(value || "").trim().toLowerCase();

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

  useEffect(() => {
    setSelectedCompanyName("");
    setSelectedStaff(null);
  }, [selectedStaffType]);

  useEffect(() => {
    setSelectedStaff(null);
  }, [selectedCompanyName]);

  const fetchSavedOutlets = async (staffId, day) => {
    try {
      const response = await fetch(`${API}/staff/${staffId}/outlets-by-day?day=${day}`);
      const data = await response.json();
      setSavedOutlets(data);
    } catch (error) {
      console.error("Error fetching saved outlets:", error);
    }
  };

  useEffect(() => {
    if (!selectedStaff) {
      setSelectedDay("");
      setSelectedLocation("");
      setAvailableLocations([]);
      setOutlets([]);
      setSavedOutlets([]);
      return;
    }

    setSelectedLocation("");
    setAvailableLocations([]);
    setOutlets([]);
    setSavedOutlets([]);

    if (selectedStaff.staff_type === "cnf") {
      setSelectedDay(cnfRouteDay);
    } else if (selectedDay === cnfRouteDay) {
      setSelectedDay("");
    }
  }, [selectedStaff, selectedDay]);

  // Fetch locations when staff or route day changes
  useEffect(() => {
    if (selectedStaff && routeDay) {
      const fetchLocations = async () => {
        try {
          const response = await fetch(
            `${API}/staff/${selectedStaff.id}/locations?day=${routeDay}`
          );
          const data = await response.json();
          setAvailableLocations(data);
          setSelectedLocation("");
        } catch (error) {
          console.error("Error fetching locations:", error);
        }
      };
      fetchLocations();
      fetchSavedOutlets(selectedStaff.id, routeDay);
    } else {
      setAvailableLocations([]);
      setSavedOutlets([]);
    }
  }, [selectedStaff, routeDay]);

  const addOutletField = () => {
    setOutlets([...outlets, { outletErpId: "", outletName: "", contactNumber: "", googleLocation: "" }]);
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
    if (!selectedStaff || !routeDay || !selectedLocation || outlets.length === 0) {
      alert("Please fill in all details and add at least one outlet.");
      return;
    }

    const erpIds = outlets.map((outlet) => normalizeText(outlet.outletErpId)).filter(Boolean);
    const missingGoogleLocation = outlets.some((outlet) => !String(outlet.googleLocation || "").trim());
    const savedErpIds = new Set(savedOutlets.map((outlet) => normalizeText(outlet.outlet_erp_id)));
    const hasDuplicateErp =
      erpIds.some((erpId, index) => erpIds.indexOf(erpId) !== index) ||
      erpIds.some((erpId) => savedErpIds.has(erpId));

    if (hasDuplicateErp) {
      alert("Same ERP Id already exists. Please use a unique ERP Id.");
      return;
    }

    if (missingGoogleLocation) {
      alert("Please enter Google Location for every outlet.");
      return;
    }

    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/counters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          day: routeDay,
          location: selectedLocation,
          counters: outlets,
        }),
      });

      if (response.ok) {
        alert("Outlets added successfully!");
        setOutlets([]);
        setSelectedLocation("");
        fetchSavedOutlets(selectedStaff.id, routeDay);
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
        fetchSavedOutlets(selectedStaff.id, routeDay);
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
      googleLocation: outlet.google_location || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingOutletId(null);
    setEditFormData({ outletErpId: "", outletName: "", contactNumber: "", googleLocation: "" });
  };

  const handleSaveEdit = async (counterId) => {
    const editErpId = normalizeText(editFormData.outletErpId);
    const hasDuplicateSavedOutlet = savedOutlets.some(
      (outlet) =>
        outlet.id !== counterId &&
        normalizeText(outlet.outlet_erp_id) === editErpId
    );

    if (hasDuplicateSavedOutlet) {
      alert("Same ERP Id already exists. Please use a unique ERP Id.");
      return;
    }

    if (!String(editFormData.googleLocation || "").trim()) {
      alert("Please enter Google Location.");
      return;
    }

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
        fetchSavedOutlets(selectedStaff.id, routeDay);
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
                  <Grid item xs={12} md={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="staff-type-filter-label">Staff Type</InputLabel>
                      <Select
                        labelId="staff-type-filter-label"
                        value={selectedStaffType}
                        label="Staff Type"
                        onChange={(e) => setSelectedStaffType(e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                      >
                        <MenuItem value="">
                          <em>Select Staff Type</em>
                        </MenuItem>
                        <MenuItem value="distributor">Distributor</MenuItem>
                        <MenuItem value="cnf">CNF</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={4}>
                    <FormControl fullWidth size="small" disabled={!selectedStaffType}>
                      <InputLabel id="company-filter-label">Company Name</InputLabel>
                      <Select
                        labelId="company-filter-label"
                        value={selectedCompanyName}
                        label="Company Name"
                        onChange={(e) => setSelectedCompanyName(e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                      >
                        <MenuItem value="">
                          <em>Select Company</em>
                        </MenuItem>
                        {companyOptions.map((companyName) => (
                          <MenuItem key={companyName} value={companyName}>
                            {companyName}
                          </MenuItem>
                        ))}
                        {selectedStaffType && companyOptions.length === 0 && (
                          <MenuItem disabled>
                            No {selectedStaffType === "cnf" ? "CNF" : "Distributor"} company found
                          </MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={4}>
                    <MDBox mb={2}>
                      <Autocomplete
                        options={filteredStaffOptions}
                        value={selectedStaff}
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        onChange={(event, newValue) => setSelectedStaff(newValue)}
                        onOpen={() => {
                          if (staffOptions.length === 0) {
                            fetchStaffOptions();
                          }
                        }}
                        onInputChange={(event, newInputValue) => fetchStaffOptions(newInputValue)}
                        disabled={!selectedStaffType || !selectedCompanyName}
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
                        <MDTypography variant="body2">
                          Type: {isCnfStaff ? "CNF" : "Distributor"}
                        </MDTypography>
                      </MDBox>
                    </Grid>
                  )}
                </Grid>

                {selectedStaff && (
                  <MDBox mt={4}>
                    <Grid container spacing={3}>
                      {!isCnfStaff && (
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
                      )}
                      <Grid item xs={12} md={6}>
                        <FormControl fullWidth size="small" disabled={!routeDay}>
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
                            {routeDay && availableLocations.length === 0 && (
                              <MenuItem disabled>
                                {isCnfStaff
                                  ? "No CNF locations assigned"
                                  : "No locations assigned for this day"}
                              </MenuItem>
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
                          <Grid item xs={12} sm={6} md={3}>
                            <MDInput
                              label="Google Location"
                              fullWidth
                              InputProps={{ sx: { minHeight: 48 } }}
                              value={outlet.googleLocation}
                              onChange={(e) =>
                                handleOutletChange(index, "googleLocation", e.target.value)
                              }
                            />
                          </Grid>
                          <Grid item xs={12} sm={6} md={12}>
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
                    <MDTypography variant="h6" mb={2}>
                      Saved Outlets for {isCnfStaff ? "CNF" : selectedDay}
                    </MDTypography>
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
                          <Grid container spacing={1.5} alignItems="center">
                            <Grid item xs={12} sm={6} md={2}>
                              <MDInput
                                label="ERP Id"
                                fullWidth
                                value={editFormData.outletErpId}
                                onChange={(e) => setEditFormData({ ...editFormData, outletErpId: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <MDInput
                                label="Outlet Name"
                                fullWidth
                                value={editFormData.outletName}
                                onChange={(e) => setEditFormData({ ...editFormData, outletName: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDInput
                                label="Contact"
                                fullWidth
                                value={editFormData.contactNumber}
                                onChange={(e) => setEditFormData({ ...editFormData, contactNumber: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <MDInput
                                label="Google Location"
                                fullWidth
                                value={editFormData.googleLocation}
                                onChange={(e) => setEditFormData({ ...editFormData, googleLocation: e.target.value })}
                              />
                            </Grid>
                            <Grid item xs={12} md={2}>
                              <MDBox display="flex" gap={1} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
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
                          <Grid container spacing={1.5} alignItems="center">
                            <Grid item xs={12} sm={6} md={2}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.outlet_erp_id}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.outlet_name}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.contact_number}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                              {saved.google_location ? (
                                <MDTypography
                                  component="a"
                                  href={saved.google_location}
                                  target="_blank"
                                  rel="noreferrer"
                                  variant="body2"
                                  fontWeight="medium"
                                  color="info"
                                >
                                  <Icon fontSize="small" sx={{ mr: 0.5, verticalAlign: "middle" }}>map</Icon>
                                  Google Location
                                </MDTypography>
                              ) : (
                                <MDTypography variant="body2" color="text" display="flex" alignItems="center" gap={0.5}>
                                  <Icon fontSize="small">map</Icon>
                                  No Google Location
                                </MDTypography>
                              )}
                            </Grid>
                            <Grid item xs={12} md={2}>
                              <MDBox display="flex" gap={1} justifyContent={{ xs: "flex-start", md: "flex-end" }}>
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
