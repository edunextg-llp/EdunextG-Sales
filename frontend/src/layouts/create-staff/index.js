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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
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
import { FaEye } from "react-icons/fa";
import { FaRegEdit } from "react-icons/fa";
import { CiTrash } from "react-icons/ci";


const tableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "none",
  borderBottom: "1px solid #e5e7eb",
  px: 2,
  py: 1.5,
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const tableBodySx = {
  px: 2,
  verticalAlign: "middle",
  py: 1.5,
};

const tableHeadRowSx = {
  display: "table-header-group",
  backgroundColor: "#f9fafb",
  "& .MuiTableCell-root": { backgroundColor: "#f9fafb" },
};

const routeDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const cnfRouteDay = "CNF";

const createEmptyAssignments = () => ({
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: [],
  Saturday: [],
  CNF: [],
});

function CreateStaff() {
  const [activeTab, setActiveTab] = useState(0);
  const [staffList, setStaffList] = useState([]);
  const [staffTypeFilter, setStaffTypeFilter] = useState("all");
  const [employeeSearchInput, setEmployeeSearchInput] = useState("");
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    contactNo: "",
    companyName: "",
    staffType: "distributor",
    assignments: createEmptyAssignments(),
  });

  const API = "https://bawarchee.edunextg.co/api";

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

  const handleStaffTypeChange = (e) => {
    const staffType = e.target.value;

    setFormData((prev) => ({
      ...prev,
      staffType,
      assignments: {
        ...createEmptyAssignments(),
        ...prev.assignments,
      },
    }));
    setActiveTab(0);
  };

  const filteredStaffList =
    staffList.filter((staff) => {
      const matchesType =
        staffTypeFilter === "all" || (staff.staff_type || "distributor") === staffTypeFilter;
      const searchText = employeeSearchInput.trim().toLowerCase();
      const matchesSearch =
        !searchText ||
        [staff.name, staff.company_name, staff.contact_no]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchText));

      return matchesType && matchesSearch;
    });

  const getCompanyNames = () => [
    ...new Set(
      String(formData.companyName || "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ];

  // Add Location
  const addLocation = (day) => {
    const updatedAssignments = { ...formData.assignments };
    updatedAssignments[day] = updatedAssignments[day] || [];

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
    updatedAssignments[day] = updatedAssignments[day] || [];

    updatedAssignments[day].splice(locIndex, 1);

    setFormData((prev) => ({
      ...prev,
      assignments: updatedAssignments,
    }));
  };

  // Location Change
  const handleLocationChange = (day, locIndex, value) => {
    const updatedAssignments = { ...formData.assignments };
    updatedAssignments[day] = updatedAssignments[day] || [];

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
        staffType: data.staff_type || "distributor",
        assignments: {
          ...createEmptyAssignments(),
          ...(data.assignments || {}),
        },
      });

      setEditingStaffId(staff.id);
      setStaffModalOpen(true);
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
      staffType: "distributor",
      assignments: createEmptyAssignments(),
    });

    setEditingStaffId(null);
    setActiveTab(0);
  };

  const openStaffModal = () => {
    resetForm();
    setStaffModalOpen(true);
  };

  const closeStaffModal = () => {
    setStaffModalOpen(false);
    resetForm();
  };

  // Submit
  const handleSubmit = async () => {
    try {
      const url = editingStaffId ? `${API}/staff/${editingStaffId}` : `${API}/staff`;

      const method = editingStaffId ? "PUT" : "POST";
      const companyNames = getCompanyNames();
      const activeAssignments =
        formData.staffType === "cnf"
          ? { [cnfRouteDay]: formData.assignments[cnfRouteDay] || [] }
          : routeDays.reduce(
              (acc, day) => ({
                ...acc,
                [day]: formData.assignments[day] || [],
              }),
              {}
            );

      const response = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          companyNames,
          companyName: formData.companyName,
          assignments: activeAssignments,
        }),
      });

      if (response.ok) {
        alert(editingStaffId ? "Staff updated successfully!" : "Staff created successfully!");

        closeStaffModal();
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
          <Grid item xs={12}>
            <Card>
              <MDBox p={3}>
                <MDBox
                  display="flex"
                  flexDirection={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ xs: "stretch", sm: "center" }}
                  gap={2}
                  mb={3}
                >
                  <MDTypography variant="h5" fontWeight="medium">
                    Employee List
                  </MDTypography>

                  <MDBox
                    display="flex"
                    flexDirection={{ xs: "column", md: "row" }}
                    alignItems={{ xs: "stretch", md: "center" }}
                    gap={1.5}
                    sx={{ width: { xs: "100%", sm: "auto" } }}
                  >
                    <MDButton color="info" variant="gradient" onClick={openStaffModal}>
                      <Icon sx={{ mr: 1 }}>add</Icon>
                      Create Staff
                    </MDButton>
                    <MDInput
                      type="text"
                      label="Search Employee"
                      value={employeeSearchInput}
                      onChange={(e) => setEmployeeSearchInput(e.target.value)}
                      sx={{ minWidth: { xs: "100%", md: 240 } }}
                    />
                    <FormControl size="small" sx={{ minWidth: { xs: "100%", md: 220 } }}>
                      <InputLabel id="staff-type-filter-label">Staff Type</InputLabel>
                      <Select
                        labelId="staff-type-filter-label"
                        value={staffTypeFilter}
                        label="Staff Type"
                        onChange={(e) => setStaffTypeFilter(e.target.value)}
                        sx={{ minHeight: 44 }}
                      >
                        <MenuItem value="all">All Staff</MenuItem>
                        <MenuItem value="distributor">Distributor</MenuItem>
                        <MenuItem value="cnf">CNF</MenuItem>
                      </Select>
                    </FormControl>
                  </MDBox>
                </MDBox>

                {staffList.length === 0 ? (
                  <MDTypography variant="body2" color="text">
                    No employees added yet. Click &quot;Create Staff&quot; to add one.
                  </MDTypography>
                ) : filteredStaffList.length === 0 ? (
                  <MDTypography variant="body2" color="text">
                    No staff found for this search.
                  </MDTypography>
                ) : (
                  <TableContainer
                    sx={{
                      boxShadow: "none",
                      borderTop: "1px solid #e5e7eb",
                      backgroundColor: "transparent",
                      mt: 2,
                      overflowX: "auto",
                    }}
                  >
                    <Table
                      sx={{
                        tableLayout: "fixed",
                        width: "100%",
                        minWidth: 680,
                        "& .MuiTableCell-root": { overflow: "hidden" },
                      }}
                    >
                      <colgroup>
                        <col style={{ width: "26%" }} />
                        <col style={{ width: "26%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "18%" }} />
                      </colgroup>
                      <TableHead sx={tableHeadRowSx}>
                        <TableRow>
                          <TableCell align="left" sx={{ ...tableHeadSx, width: "26%" }}>
                            Company Name
                          </TableCell>
                          <TableCell align="left" sx={{ ...tableHeadSx, width: "26%" }}>
                            Staff Name
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "12%" }}>
                            Type
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "18%" }}>
                            Phone Number
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "18%" }}>
                            Action
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredStaffList.map((staff) => (
                          <TableRow key={staff.id}>
                            <TableCell
                              align="left"
                              sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                            >
                              {staff.company_name || "—"}
                            </TableCell>
                            <TableCell
                              align="left"
                              sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                            >
                              {staff.name}
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                            >
                              {(staff.staff_type || "distributor") === "cnf" ? "CNF" : "Distributor"}
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                            >
                              {staff.contact_no}
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              <MDBox display="flex" gap={0.5} justifyContent="center" alignItems="center" flexWrap="wrap">
                                <FaEye   onClick={() => handleView(staff)} style={{ cursor: "pointer" }} color="#E0E388" size={20}/>
                                <FaRegEdit   onClick={() => handleEdit(staff)} style={{ cursor: "pointer" }} color="#E0E388" size={20}/>
                              </MDBox>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <Footer />

      <Dialog open={staffModalOpen} onClose={closeStaffModal} fullWidth maxWidth="md" scroll="paper">
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          {editingStaffId ? "Edit Staff" : "Create New Staff"}
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1} component="form" role="form">
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <MDBox mb={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="staff-type-label">Staff Type</InputLabel>
                    <Select
                      labelId="staff-type-label"
                      value={formData.staffType}
                      label="Staff Type"
                      onChange={handleStaffTypeChange}
                      sx={{ minHeight: 44 }}
                    >
                      <MenuItem value="distributor">Distributor</MenuItem>
                      <MenuItem value="cnf">CNF</MenuItem>
                    </Select>
                  </FormControl>
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6}>
                <MDBox mb={2}>
                  <MDInput
                    type="text"
                    label="Company Name"
                    name="companyName"
                    fullWidth
                    value={formData.companyName}
                    onChange={handleInputChange}
                    helperText="Use comma for multiple companies"
                  />
                </MDBox>
              </Grid>
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

            <MDBox mt={2} mb={2}>
              <MDTypography variant="h6" fontWeight="bold">
                Location Assignments
              </MDTypography>

              {formData.staffType === "distributor" ? (
                <>
                  <MDBox sx={{ borderBottom: 1, borderColor: "divider" }}>
                    <Tabs
                      value={activeTab}
                      onChange={handleTabChange}
                      variant="scrollable"
                      scrollButtons="auto"
                    >
                      {routeDays.map((day) => (
                        <Tab key={day} label={day} />
                      ))}
                    </Tabs>
                  </MDBox>

                  {routeDays.map((day, index) => (
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
                        <MDButton variant="gradient" color="dark" size="small" onClick={() => addLocation(day)}>
                          <Icon sx={{ mr: 1 }}>add</Icon>
                          Add Location
                        </MDButton>
                      </MDBox>

                      {(formData.assignments[day] || []).map((loc, locIndex) => (
                        <MDBox
                          key={locIndex}
                          mb={2}
                          p={2}
                          sx={{ backgroundColor: "#f8f9fa", borderRadius: "10px", border: "1px solid #e9ecef" }}
                        >
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={9}>
                              <MDInput
                                label="Location Name"
                                fullWidth
                                value={loc.locationName}
                                onChange={(e) => handleLocationChange(day, locIndex, e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                              <CiTrash onClick={() => removeLocation(day, locIndex)} style={{ cursor: "pointer" }} color="#FF0000" size={20} />
                            </Grid>
                          </Grid>
                        </MDBox>
                      ))}
                    </MDBox>
                  ))}
                </>
              ) : (
                <MDBox py={3}>
                  <MDBox
                    display="flex"
                    flexDirection={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    mb={2}
                    gap={2}
                  >
                    <MDTypography variant="subtitle2" color="text">
                      Assigned CNF Locations
                    </MDTypography>
                    <MDButton variant="gradient" color="dark" size="small" onClick={() => addLocation(cnfRouteDay)}>
                      <Icon sx={{ mr: 1 }}>add</Icon>
                      Add Location
                    </MDButton>
                  </MDBox>

                  {(formData.assignments[cnfRouteDay] || []).map((loc, locIndex) => (
                    <MDBox
                      key={locIndex}
                      mb={2}
                      p={2}
                      sx={{ backgroundColor: "#f8f9fa", borderRadius: "10px", border: "1px solid #e9ecef" }}
                    >
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={9}>
                          <MDInput
                            label="Location Name"
                            fullWidth
                            value={loc.locationName}
                            onChange={(e) => handleLocationChange(cnfRouteDay, locIndex, e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <CiTrash onClick={() => removeLocation(cnfRouteDay, locIndex)} style={{ cursor: "pointer" }} color="#FF0000" size={20} />
                        </Grid>
                      </Grid>
                    </MDBox>
                  ))}
                </MDBox>
              )}
            </MDBox>
          </MDBox>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <MDButton variant="outlined" color="dark" onClick={closeStaffModal}>
            Cancel
          </MDButton>
          <MDButton variant="gradient" color="info" onClick={handleSubmit}>
            {editingStaffId ? "Update Staff & Locations" : "Save Staff & Locations"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog open={viewModalOpen} onClose={handleCloseView} fullWidth maxWidth="sm">
        <DialogTitle>Employee Details</DialogTitle>
        <DialogContent dividers>
          {selectedStaffDetails ? (
            <MDBox>
              <MDTypography variant="subtitle2" fontWeight="bold">Name: <span style={{ fontWeight: 400 }}>{selectedStaffDetails.name}</span></MDTypography>
              <MDTypography variant="subtitle2" fontWeight="bold">Company: <span style={{ fontWeight: 400 }}>{selectedStaffDetails.company_name || '—'}</span></MDTypography>
              <MDTypography variant="subtitle2" fontWeight="bold">
                Type:{" "}
                <span style={{ fontWeight: 400 }}>
                  {(selectedStaffDetails.staff_type || "distributor") === "cnf" ? "CNF" : "Distributor"}
                </span>
              </MDTypography>
              <MDTypography variant="subtitle2" fontWeight="bold" mb={2}>Contact No: <span style={{ fontWeight: 400 }}>{selectedStaffDetails.contact_no}</span></MDTypography>
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
