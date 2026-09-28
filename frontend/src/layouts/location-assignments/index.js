import { useEffect, useState } from "react";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
import { Autocomplete, FormControl, InputLabel, MenuItem, Select, Tab, Tabs } from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useAuth } from "context/AuthContext";

const API = "https://bawarchee.edunextg.co/api";
const routeDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const emptyAssignments = () => ({
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], CNF: [],
});

function LocationAssignments() {
  const { user } = useAuth();
  const isSelfService = user?.role === "staff";
  const [staffType, setStaffType] = useState("");
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [staff, setStaff] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [assignments, setAssignments] = useState(emptyAssignments());
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isSelfService || !user?.staffId) return;
    setLoading(true);
    fetch(`${API}/staff/${user.staffId}`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Unable to load your assignments.");
        setStaffType(data.staff_type || user.staffType || "distributor");
        setSelectedStaff(data);
        setAssignments({ ...emptyAssignments(), ...(data.assignments || {}) });
      })
      .catch((error) => alert(error.message))
      .finally(() => setLoading(false));
  }, [isSelfService, user?.staffId, user?.staffType]);

  const resetStaffSelection = () => {
    setStaff([]);
    setSelectedStaff(null);
    setAssignments(emptyAssignments());
    setActiveTab(0);
  };

  const selectStaffType = async (value) => {
    setStaffType(value);
    setSelectedCompany(null);
    setCompanies([]);
    resetStaffSelection();
    if (!value) return;

    try {
      const response = await fetch(`${API}/staff/companies?type=${value}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load companies.");
      setCompanies(Array.isArray(data) ? data : []);
    } catch (error) {
      alert(error.message);
    }
  };

  const selectCompany = async (value) => {
    setSelectedCompany(value);
    resetStaffSelection();
    if (!value) return;

    try {
      const response = await fetch(`${API}/staff?companyId=${value.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load staff.");
      setStaff((Array.isArray(data) ? data : []).filter(
        (employee) => (employee.staff_type || "distributor") === staffType
      ));
    } catch (error) {
      alert(error.message);
    }
  };

  const selectStaff = async (value) => {
    setSelectedStaff(value);
    setAssignments(emptyAssignments());
    setActiveTab(0);
    if (!value) return;

    setLoading(true);
    try {
      const response = await fetch(`${API}/staff/${value.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load assignments.");
      setSelectedStaff((current) => current ? { ...current, staff_type: data.staff_type } : current);
      setAssignments({ ...emptyAssignments(), ...(data.assignments || {}) });
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const days = selectedStaff?.staff_type === "cnf" ? ["CNF"] : routeDays;

  const addLocation = (day) => {
    setAssignments((current) => ({
      ...current,
      [day]: [...(current[day] || []), { locationName: "" }],
    }));
  };

  const updateLocation = (day, index, value) => {
    setAssignments((current) => ({
      ...current,
      [day]: current[day].map((location, locationIndex) =>
        locationIndex === index ? { ...location, locationName: value } : location
      ),
    }));
  };

  const removeLocation = (day, index) => {
    setAssignments((current) => ({
      ...current,
      [day]: current[day].filter((_, locationIndex) => locationIndex !== index),
    }));
  };

  const saveAssignments = async () => {
    if (!selectedStaff) return;
    setSaving(true);
    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/locations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save assignments.");
      alert("Location assignments saved successfully.");
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container justifyContent="center">
          <Grid item xs={12} lg={10}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h5" fontWeight="medium" mb={0.5}>
                  {isSelfService ? "My Day-wise Locations" : "Location Assignments"}
                </MDTypography>
                <MDTypography variant="body2" color="text" mb={3}>
                  {isSelfService
                    ? "Add and manage your own working locations for each day."
                    : "Choose the staff type, company, and staff member, then manage day-wise locations."}
                </MDTypography>

                {!isSelfService && <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="location-staff-type-label">Staff Type</InputLabel>
                      <Select
                        labelId="location-staff-type-label"
                        value={staffType}
                        label="Staff Type"
                        onChange={(event) => selectStaffType(event.target.value)}
                        sx={{ minHeight: 44 }}
                      >
                        <MenuItem value="distributor">Distributor</MenuItem>
                        <MenuItem value="cnf">CNF</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Autocomplete
                      disabled={!staffType}
                      options={companies}
                      value={selectedCompany}
                      onChange={(_, value) => selectCompany(value)}
                      getOptionLabel={(option) => option.name || ""}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      renderInput={(params) => <MDInput {...params} label="Select Company" />}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Autocomplete
                      disabled={!selectedCompany}
                      options={staff}
                      value={selectedStaff}
                      onChange={(_, value) => selectStaff(value)}
                      getOptionLabel={(option) => option.name || ""}
                      isOptionEqualToValue={(option, value) => option.id === value.id}
                      renderInput={(params) => <MDInput {...params} label="Select Staff" />}
                    />
                  </Grid>
                </Grid>}

                {selectedStaff && (
                  <MDBox mt={3}>
                    <Tabs
                      value={Math.min(activeTab, days.length - 1)}
                      onChange={(_, value) => setActiveTab(value)}
                      variant="scrollable"
                      scrollButtons="auto"
                    >
                      {days.map((day) => <Tab key={day} label={day} />)}
                    </Tabs>

                    {!loading && days.map((day, dayIndex) => (
                      <MDBox key={day} hidden={activeTab !== dayIndex} py={3}>
                        <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                          <MDTypography variant="subtitle2">Assigned Locations for {day}</MDTypography>
                          <MDButton size="small" color="dark" variant="gradient" onClick={() => addLocation(day)}>
                            <Icon sx={{ mr: 1 }}>add</Icon>Add Location
                          </MDButton>
                        </MDBox>

                        {(assignments[day] || []).length === 0 && (
                          <MDTypography variant="body2" color="text">No locations assigned.</MDTypography>
                        )}
                        {(assignments[day] || []).map((location, index) => (
                          <MDBox key={`${day}-${index}`} display="flex" gap={2} alignItems="center" mb={2}>
                            <MDInput
                              label="Location Name"
                              fullWidth
                              value={location.locationName}
                              onChange={(event) => updateLocation(day, index, event.target.value)}
                            />
                            <MDButton color="error" variant="text" onClick={() => removeLocation(day, index)}>
                              <Icon>delete</Icon>
                            </MDButton>
                          </MDBox>
                        ))}
                      </MDBox>
                    ))}

                    <MDBox display="flex" justifyContent="flex-end" mt={2}>
                      <MDButton color="info" variant="gradient" disabled={loading || saving} onClick={saveAssignments}>
                        {saving ? "Saving..." : "Save Assignments"}
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

export default LocationAssignments;
