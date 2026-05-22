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
  const [formData, setFormData] = useState({
    name: "",
    contactNo: "",
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

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const addLocation = (day) => {
    const updatedAssignments = { ...formData.assignments };
    updatedAssignments[day].push({
      locationName: "",
    });
    setFormData((prev) => ({ ...prev, assignments: updatedAssignments }));
  };

  const removeLocation = (day, locIndex) => {
    const updatedAssignments = { ...formData.assignments };
    updatedAssignments[day].splice(locIndex, 1);
    setFormData((prev) => ({ ...prev, assignments: updatedAssignments }));
  };

  const handleLocationChange = (day, locIndex, value) => {
    const updatedAssignments = { ...formData.assignments };
    updatedAssignments[day][locIndex].locationName = value;
    setFormData((prev) => ({ ...prev, assignments: updatedAssignments }));
  };

  const handleEdit = async (staff) => {
    try {
      const response = await fetch(`${API}/staff/${staff.id}`);
      const data = await response.json();
      setFormData({
        name: data.name,
        contactNo: data.contact_no,
        assignments: data.assignments,
      });
      setEditingStaffId(staff.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Error fetching staff details:", error);
      alert("Error loading staff details.");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      contactNo: "",
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
        alert("Operation failed.");
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
                  {editingStaffId ? "Edit Staff" : "Create New Staff"}
                </MDTypography>
              </MDBox>
              <MDBox pt={4} pb={3} px={3}>
                <MDBox component="form" role="form">
                  <Grid container spacing={3}>
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
                    <Grid item xs={12} md={6}>
                      <MDBox mb={2}>
                        <MDInput
                          type="text"
                          label="Contact No"
                          name="contactNo"
                          fullWidth
                          value={formData.contactNo}
                          onChange={handleInputChange}
                        />
                      </MDBox>
                    </Grid>
                  </Grid>

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
                            <Icon sx={{ mr: 1 }}>add</Icon> Add Location
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
                                  <Icon sx={{ mr: 1 }}>delete</Icon> Remove
                                </MDButton>
                              </Grid>
                            </Grid>
                          </MDBox>
                        ))}
                      </MDBox>
                    ))}
                  </MDBox>

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

          <Grid item xs={12} lg={10} mx="auto" mt={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h5" fontWeight="medium" mb={3}>
                  Employee List
                </MDTypography>
                <TableContainer component={Paper} sx={{ boxShadow: "none" }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: "bold" }}>Name</TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Contact No
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: "bold" }}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {staffList.map((staff) => (
                        <TableRow key={staff.id}>
                          <TableCell>{staff.name}</TableCell>
                          <TableCell align="center">{staff.contact_no}</TableCell>
                          <TableCell align="right">
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
    </DashboardLayout>
  );
}

export default CreateStaff;
