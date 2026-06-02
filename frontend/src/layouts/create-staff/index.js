import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import {
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
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

function CreateStaff() {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const [activeTab, setActiveTab] = useState(0);
  const [staffList, setStaffList] = useState([]);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    contactNo: "",
    companyName: "",
    assignments: {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
    },
  });

  const API = "http://localhost:5000/api";

  // Fetch Staff List
  const fetchStaffList = async () => {
    try {
      const response = await fetch(`${API}/staff`);
      const data = await response.json();
      setStaffList(data);
    } catch (error) {
      console.error("Error fetching staff list:", error);
    }
  };

  useEffect(() => {
    fetchStaffList();
  }, []);

  // Tabs
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  // Input Change
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Only numbers for contact number
    if (name === "contactNo") {
      const numericValue = value.replace(/\D/g, "");

      setFormData((prev) => ({
        ...prev,
        [name]: numericValue,
      }));

      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Add Location
  const addLocation = (day) => {
    const updatedAssignments = { ...formData.assignments };

    updatedAssignments[day].push({
      locationName: "",
    });

    setFormData((prev) => ({
      ...prev,
      assignments: updatedAssignments,
    }));
  };

  // Remove Location
  const removeLocation = (day, locIndex) => {
    const updatedAssignments = { ...formData.assignments };

    updatedAssignments[day].splice(locIndex, 1);

    setFormData((prev) => ({
      ...prev,
      assignments: updatedAssignments,
    }));
  };

  // Location Change
  const handleLocationChange = (day, locIndex, value) => {
    const updatedAssignments = { ...formData.assignments };

    updatedAssignments[day][locIndex].locationName = value;

    setFormData((prev) => ({
      ...prev,
      assignments: updatedAssignments,
    }));
  };

  // View Staff Location Details
  const handleView = async (staff) => {
    try {
      const response = await fetch(`${API}/staff/${staff.id}`);
      const data = await response.json();
      setSelectedStaffDetails(data);
      setViewModalOpen(true);
    } catch (error) {
      console.error("Error fetching staff details:", error);
      alert("Error loading staff details.");
    }
  };

  const handleCloseView = () => {
    setViewModalOpen(false);
    setSelectedStaffDetails(null);
  };

  // Edit Staff
  const handleEdit = async (staff) => {
    try {
      const response = await fetch(`${API}/staff/${staff.id}`);
      const data = await response.json();

      setFormData({
        name: data.name || "",
        contactNo: data.contact_no || "",
        companyName: data.company_name || "",
        assignments: data.assignments || {
          Monday: [],
          Tuesday: [],
          Wednesday: [],
          Thursday: [],
          Friday: [],
          Saturday: [],
        },
      });

      setEditingStaffId(staff.id);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      console.error("Error fetching staff details:", error);
      alert("Error loading staff details.");
    }
  };

  // Reset Form
  const resetForm = () => {
    setFormData({
      name: "",
      contactNo: "",
      companyName: "",
      assignments: {
        Monday: [],
        Tuesday: [],
        Wednesday: [],
        Thursday: [],
        Friday: [],
        Saturday: [],
      },
    });

    setEditingStaffId(null);
  };

  // Submit
  const handleSubmit = async () => {
    try {
      const url = editingStaffId ? `${API}/staff/${editingStaffId}` : `${API}/staff`;

      const method = editingStaffId ? "PUT" : "POST";

      const response = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        alert(editingStaffId ? "Staff updated successfully!" : "Staff created successfully!");

        resetForm();
        fetchStaffList();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Operation failed.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Error submitting form.");
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />

      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          {/* FORM */}
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
                  {editingStaffId ? "Edit Staff" : "Create New Staff"}
                </MDTypography>
              </MDBox>

              <MDBox pt={4} pb={3} px={3}>
                <MDBox component="form" role="form">
                  <Grid container spacing={3}>
                    {/* Company Name */}
                    <Grid item xs={12} md={6}>
                      <MDBox mb={2}>
                        <MDInput
                          type="text"
                          label="Company Name"
                          name="companyName"
                          fullWidth
                          value={formData.companyName}
                          onChange={handleInputChange}
                        />
                      </MDBox>
                    </Grid>

                    {/* Staff Name */}
                    <Grid item xs={12} md={6}>
                      <MDBox mb={2}>
                        <MDInput
                          type="text"
                          label="Staff Name"
                          name="name"
                          fullWidth
                          value={formData.name}
                          onChange={handleInputChange}
                        />
                      </MDBox>
                    </Grid>

                    {/* Contact No */}
                    <Grid item xs={12} md={6}>
                      <MDBox mb={2}>
                        <MDInput
                          type="number"
                          label="Contact No"
                          name="contactNo"
                          fullWidth
                          value={formData.contactNo}
                          onChange={handleInputChange}
                        />
                      </MDBox>
                    </Grid>
                  </Grid>

                  {/* Assignments */}
                  <MDBox mt={4} mb={2}>
                    <MDTypography variant="h6" fontWeight="bold">
                      Location Assignments
                    </MDTypography>

                    <MDBox sx={{ borderBottom: 1, borderColor: "divider" }}>
                      <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        variant="scrollable"
                        scrollButtons="auto"
                      >
                        {days.map((day) => (
                          <Tab key={day} label={day} />
                        ))}
                      </Tabs>
                    </MDBox>

                    {days.map((day, index) => (
                      <MDBox key={day} hidden={activeTab !== index} py={3}>
                        <MDBox
                          display="flex"
                          flexDirection={{ xs: "column", sm: "row" }}
                          justifyContent="space-between"
                          alignItems={{ xs: "flex-start", sm: "center" }}
                          mb={2}
                          gap={2}
                        >
                          <MDTypography variant="subtitle2" color="text">
                            Assigned Locations for {day}
                          </MDTypography>

                          <MDButton
                            variant="gradient"
                            color="dark"
                            size="small"
                            onClick={() => addLocation(day)}
                          >
                            <Icon sx={{ mr: 1 }}>add</Icon>
                            Add Location
                          </MDButton>
                        </MDBox>

                        {formData.assignments[day].map((loc, locIndex) => (
                          <MDBox
                            key={locIndex}
                            mb={2}
                            p={2}
                            sx={{
                              backgroundColor: "#f8f9fa",
                              borderRadius: "10px",
                              border: "1px solid #e9ecef",
                            }}
                          >
                            <Grid container spacing={2} alignItems="center">
                              <Grid item xs={12} sm={9}>
                                <MDInput
                                  label="Location Name"
                                  fullWidth
                                  value={loc.locationName}
                                  onChange={(e) =>
                                    handleLocationChange(day, locIndex, e.target.value)
                                  }
                                />
                              </Grid>

                              <Grid item xs={12} sm={3}>
                                <MDButton
                                  color="error"
                                  variant="text"
                                  fullWidth
                                  onClick={() => removeLocation(day, locIndex)}
                                >
                                  <Icon sx={{ mr: 1 }}>delete</Icon>
                                  Remove
                                </MDButton>
                              </Grid>
                            </Grid>
                          </MDBox>
                        ))}
                      </MDBox>
                    ))}
                  </MDBox>

                  {/* Buttons */}
                  <MDBox mt={4} mb={1} display="flex" gap={2}>
                    <MDButton variant="gradient" color="info" fullWidth onClick={handleSubmit}>
                      {editingStaffId ? "Update Staff & Locations" : "Save Staff & Locations"}
                    </MDButton>

                    {editingStaffId && (
                      <MDButton variant="outlined" color="dark" fullWidth onClick={resetForm}>
                        Cancel Edit
                      </MDButton>
                    )}
                  </MDBox>
                </MDBox>
              </MDBox>
            </Card>
          </Grid>

          {/* EMPLOYEE LIST */}
          <Grid item xs={12} mt={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h5" fontWeight="medium" mb={3}>
                  Employee List
                </MDTypography>

                <TableContainer component={Paper} sx={{ boxShadow: "none" }}>
                  <Table>
                    {/* Table Head */}
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: "bold" }}>Company Name</TableCell>

                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Staff Name
                        </TableCell>

                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Phone Number
                        </TableCell>

                        <TableCell align="right" sx={{ fontWeight: "bold" }}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>

                    {/* Table Body */}
                    <TableBody>
                      {staffList.map((staff) => (
                        <TableRow key={staff.id}>
                          <TableCell>{staff.company_name || "—"}</TableCell>

                          <TableCell align="center">{staff.name}</TableCell>

                          <TableCell align="center">{staff.contact_no}</TableCell>

                          <TableCell align="right">
                            <MDButton variant="text" color="dark" onClick={() => handleView(staff)}>
                              <Icon>visibility</Icon>&nbsp;View
                            </MDButton>
                            <MDButton variant="text" color="info" onClick={() => handleEdit(staff)}>
                              <Icon>edit</Icon>&nbsp;Edit
                            </MDButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <Footer />

      <Dialog open={viewModalOpen} onClose={handleCloseView} fullWidth maxWidth="sm">
        <DialogTitle>Employee Details</DialogTitle>
        <DialogContent dividers>
          {selectedStaffDetails ? (
            <MDBox>
              <MDTypography variant="subtitle2" fontWeight="bold">Name: <span style={{fontWeight: 400}}>{selectedStaffDetails.name}</span></MDTypography>
              <MDTypography variant="subtitle2" fontWeight="bold">Company: <span style={{fontWeight: 400}}>{selectedStaffDetails.company_name || '—'}</span></MDTypography>
              <MDTypography variant="subtitle2" fontWeight="bold" mb={2}>Contact No: <span style={{fontWeight: 400}}>{selectedStaffDetails.contact_no}</span></MDTypography>
              <Divider />
              <MDTypography variant="h6" fontWeight="bold" mt={2} mb={1}>Assigned Locations</MDTypography>
              {Object.keys(selectedStaffDetails.assignments || {}).map((day) => {
                const dayLocs = selectedStaffDetails.assignments[day];
                if (dayLocs && dayLocs.length > 0) {
                  return (
                    <MDBox key={day} mb={1} display="flex">
                      <MDTypography variant="button" fontWeight="bold" sx={{ minWidth: 100 }}>{day}: </MDTypography>
                      <MDTypography variant="button" color="text">
                        {dayLocs.map(l => l.locationName).join(', ')}
                      </MDTypography>
                    </MDBox>
                  );
                }
                return null;
              })}
              {Object.values(selectedStaffDetails.assignments || {}).every(locs => !locs || locs.length === 0) && (
                <MDTypography variant="body2" color="text">No locations assigned to this staff yet.</MDTypography>
              )}
            </MDBox>
          ) : (
            <MDTypography variant="body2">Loading details...</MDTypography>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton onClick={handleCloseView} variant="text" color="dark">Close</MDButton>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default CreateStaff;
