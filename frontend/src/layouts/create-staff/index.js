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
  Autocomplete,
  Checkbox,
  FormControlLabel,
  Chip,
  RadioGroup,
  Radio,
  FormLabel,
  Switch,
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
import {
  formatDateLabel,
  isImageDocument,
  uploadStaffDocument,
} from "utils/uploadStaffDocument";


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

const createEmptyFormData = () => ({
  name: "",
  contactNo: "",
  whatsappNumber: "",
  whatsappSameAsContact: false,
  dob: "",
  aadharNo: "",
  aadharDocumentUrl: "",
  pccCertificateUrl: "",
  selectedCompanies: [],
  staffCategory: "company_staff",
  staffType: "distributor",
  assignments: createEmptyAssignments(),
});

const sectionLabelSx = {
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
  mb: 1.5,
};

function DocumentPreview({ title, url }) {
  if (!url) {
    return (
      <MDBox
        p={2}
        sx={{
          border: "1px dashed #cbd5e1",
          borderRadius: "10px",
          backgroundColor: "#f8fafc",
          textAlign: "center",
        }}
      >
        <MDTypography variant="caption" color="text">
          No {title} uploaded
        </MDTypography>
      </MDBox>
    );
  }

  if (isImageDocument(url)) {
    return (
      <MDBox
        component="a"
        href={url}
        target="_blank"
        rel="noreferrer"
        sx={{ display: "block", textDecoration: "none" }}
      >
        <MDBox
          component="img"
          src={url}
          alt={title}
          sx={{
            width: "100%",
            maxHeight: 220,
            objectFit: "cover",
            borderRadius: "10px",
            border: "1px solid #e2e8f0",
          }}
        />
      </MDBox>
    );
  }

  return (
    <MDButton
      component="a"
      href={url}
      target="_blank"
      rel="noreferrer"
      variant="outlined"
      color="info"
      fullWidth
      startIcon={<Icon>picture_as_pdf</Icon>}
    >
      View {title}
    </MDButton>
  );
}

function CreateStaff() {
  const [activeTab, setActiveTab] = useState(0);
  const [staffList, setStaffList] = useState([]);
  const [staffTypeFilter, setStaffTypeFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [employeeSearchInput, setEmployeeSearchInput] = useState("");
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [uploadingAadhar, setUploadingAadhar] = useState(false);
  const [uploadingPcc, setUploadingPcc] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);

  const [formData, setFormData] = useState(createEmptyFormData());

  const API = "https://bawarchee.edunextg.co/api";

  // Fetch Staff List
  const fetchStaffList = async (includeInactive = false) => {
    try {
      const url = includeInactive
        ? `${API}/staff?includeInactive=true`
        : `${API}/staff`;
      const response = await fetch(url);
      const data = await response.json();
      setStaffList(data);
    } catch (error) {
      console.error("Error fetching staff list:", error);
    }
  };

  useEffect(() => {
    fetchStaffList(showInactive);
  }, [showInactive]);

  const fetchCompanyOptions = async (staffType) => {
    try {
      const response = await fetch(`${API}/staff/companies?type=${staffType}`);
      if (!response.ok) return;
      const data = await response.json();
      setCompanyOptions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  useEffect(() => {
    if (staffModalOpen && formData.staffCategory === "company_staff") {
      fetchCompanyOptions(formData.staffType);
    }
  }, [staffModalOpen, formData.staffType, formData.staffCategory]);

  // Tabs
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "contactNo" || name === "whatsappNumber" || name === "aadharNo") {
      const numericValue = value.replace(/\D/g, "");
      setFormData((prev) => {
        const updated = { ...prev, [name]: numericValue };
        if (name === "contactNo" && updated.whatsappSameAsContact) {
          updated.whatsappNumber = numericValue;
        }
        if (name === "aadharNo" && !numericValue) {
          updated.aadharDocumentUrl = "";
        }
        return updated;
      });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleWhatsappSameAsContact = (checked) => {
    setFormData((prev) => ({
      ...prev,
      whatsappSameAsContact: checked,
      whatsappNumber: checked ? prev.contactNo || "" : prev.whatsappNumber,
    }));
  };

  const handleDocumentUpload = async (event, field, documentType, setUploading) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadStaffDocument(file, documentType);
      setFormData((prev) => ({
        ...prev,
        [field]: result.url,
      }));
    } catch (error) {
      alert(error.message || "Failed to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const handleStaffCategoryChange = (event) => {
    const staffCategory = event.target.value;
    setFormData((prev) => ({
      ...prev,
      staffCategory,
      selectedCompanies: staffCategory === "company_staff" ? prev.selectedCompanies : [],
    }));
  };

  const handleStaffTypeChange = (e) => {
    const staffType = e.target.value;

    setFormData((prev) => ({
      ...prev,
      staffType,
      selectedCompanies: prev.selectedCompanies.filter(
        (company) => !company.type || company.type === staffType
      ),
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

  const getCompanyNames = () =>
    formData.selectedCompanies.map((company) => company.name).filter(Boolean);

  const getCompanyIds = () =>
    formData.selectedCompanies.map((company) => company.id).filter(Boolean);

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

  const handleToggleActive = async (staff) => {
    const action = staff.is_active ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${action} "${staff.name}"?`)) return;
    try {
      const response = await fetch(`${API}/staff/${staff.id}/toggle-active`, { method: "PUT" });
      const data = await response.json();
      if (response.ok) {
        fetchStaffList(showInactive);
      } else {
        alert(data.error || `Failed to ${action} staff.`);
      }
    } catch (error) {
      console.error("Error toggling staff:", error);
      alert(`Error ${action}ing staff.`);
    }
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

      const companyIds = Array.isArray(data.companies)
        ? data.companies.map((company) => Number(company.id)).filter(Boolean)
        : [];
      const companyNames = Array.isArray(data.companies)
        ? data.companies.map((company) => company.name).filter(Boolean)
        : String(data.company_name || "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);

      setFormData({
        name: data.name || "",
        contactNo: data.contact_no || "",
        whatsappNumber: data.whatsapp_number || data.contact_no || "",
        whatsappSameAsContact:
          Boolean(data.contact_no) &&
          String(data.whatsapp_number || data.contact_no) === String(data.contact_no),
        dob: data.dob ? String(data.dob).slice(0, 10) : "",
        aadharNo: data.aadhar_no || "",
        aadharDocumentUrl: data.aadhar_document_url || "",
        pccCertificateUrl: data.pcc_certificate_url || "",
        selectedCompanies: companyIds.map((id, index) => ({
          id,
          name: companyNames[index] || "",
          type: data.staff_type || "distributor",
        })),
        staffCategory: data.staff_category || "company_staff",
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
    setFormData(createEmptyFormData());
    setEditingStaffId(null);
    setActiveTab(0);
    setUploadingAadhar(false);
    setUploadingPcc(false);
    setSavingStaff(false);
  };

  const openStaffModal = () => {
    resetForm();
    setStaffModalOpen(true);
  };

  const closeStaffModal = () => {
    setStaffModalOpen(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert("Please enter staff name.");
      return;
    }

    if (!formData.contactNo.trim()) {
      alert("Please enter contact number.");
      return;
    }

    if (formData.staffCategory === "company_staff" && formData.selectedCompanies.length === 0) {
      alert("Please select at least one company.");
      return;
    }

    if (formData.aadharNo && formData.aadharNo.length !== 12) {
      alert("Aadhar number must be 12 digits.");
      return;
    }

    setSavingStaff(true);

    try {
      const url = editingStaffId ? `${API}/staff/${editingStaffId}` : `${API}/staff`;
      const method = editingStaffId ? "PUT" : "POST";
      const companyNames = formData.staffCategory === "company_staff" ? getCompanyNames() : [];
      const companyIds = formData.staffCategory === "company_staff" ? getCompanyIds() : [];
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
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          contactNo: formData.contactNo,
          whatsappNumber: formData.whatsappSameAsContact
            ? formData.contactNo
            : formData.whatsappNumber,
          dob: formData.dob || null,
          aadharNo: formData.aadharNo || null,
          aadharDocumentUrl: formData.aadharNo ? formData.aadharDocumentUrl || null : null,
          pccCertificateUrl: formData.pccCertificateUrl || null,
          staffType: formData.staffType,
          staffCategory: formData.staffCategory,
          companyNames,
          companyIds,
          companyName: companyNames.join(", "),
          assignments: activeAssignments,
        }),
      });

      if (response.ok) {
        alert(editingStaffId ? "Staff updated successfully!" : "Staff created successfully!");
        closeStaffModal();
        fetchStaffList(showInactive);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Operation failed.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Error submitting form.");
    } finally {
      setSavingStaff(false);
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
                    <FormControlLabel
                      control={
                        <Switch
                          checked={showInactive}
                          onChange={(e) => setShowInactive(e.target.checked)}
                          size="small"
                        />
                      }
                      label={
                        <MDTypography variant="caption" color="text">
                          Show Inactive
                        </MDTypography>
                      }
                      sx={{ ml: 0 }}
                    />
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
                        minWidth: 720,
                        "& .MuiTableCell-root": { overflow: "hidden" },
                      }}
                    >
                      <colgroup>
                        <col style={{ width: "6%" }} />
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "14%" }} />
                      </colgroup>
                      <TableHead sx={tableHeadRowSx}>
                        <TableRow>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "6%" }}>
                            Sr No
                          </TableCell>
                          <TableCell align="left" sx={{ ...tableHeadSx, width: "22%" }}>
                            Company Name
                          </TableCell>
                          <TableCell align="left" sx={{ ...tableHeadSx, width: "20%" }}>
                            Staff Name
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "10%" }}>
                            Type
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "14%" }}>
                            Phone Number
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "14%" }}>
                            Status
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "14%" }}>
                            Action
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredStaffList.map((staff, index) => (
                          <TableRow key={staff.id} sx={{ opacity: staff.is_active ? 1 : 0.5 }}>
                            <TableCell
                              align="center"
                              sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                            >
                              {index + 1}
                            </TableCell>
                            <TableCell
                              align="left"
                              sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                            >
                              {staff.staff_category === "bawarchee_staff"
                                ? "Bawarchee Staff"
                                : staff.company_name || "—"}
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
                              <MDBox display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                                <Switch
                                  checked={Boolean(staff.is_active)}
                                  onChange={() => handleToggleActive(staff)}
                                  size="small"
                                  color={staff.is_active ? "success" : "default"}
                                />
                                <Chip
                                  label={staff.is_active ? "Active" : "Inactive"}
                                  size="small"
                                  sx={{
                                    fontSize: "0.7rem",
                                    fontWeight: 600,
                                    backgroundColor: staff.is_active ? "#dcfce7" : "#fee2e2",
                                    color: staff.is_active ? "#15803d" : "#dc2626",
                                    border: "none",
                                  }}
                                />
                              </MDBox>
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              <MDBox display="flex" gap={0.5} justifyContent="center" alignItems="center" flexWrap="wrap">
                                <FaEye onClick={() => handleView(staff)} style={{ cursor: "pointer" }} color="#E0E388" size={20} />
                                <FaRegEdit onClick={() => handleEdit(staff)} style={{ cursor: "pointer" }} color="#E0E388" size={20} />
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

      <Dialog open={staffModalOpen} onClose={closeStaffModal} fullWidth maxWidth="lg" scroll="paper">
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          {editingStaffId ? "Edit Staff" : "Create New Staff"}
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1} component="form" role="form">
            <MDTypography sx={sectionLabelSx}>Basic Information</MDTypography>
            <Grid container spacing={2.5} mb={3}>
              <Grid item xs={12}>
                <FormControl>
                  <FormLabel sx={{ fontSize: "0.875rem", color: "#344767", mb: 1 }}>
                    Staff Category
                  </FormLabel>
                  <RadioGroup
                    row
                    value={formData.staffCategory}
                    onChange={handleStaffCategoryChange}
                  >
                    <FormControlLabel
                      value="company_staff"
                      control={<Radio size="small" />}
                      label={<MDTypography variant="body2">Company Staff</MDTypography>}
                    />
                    <FormControlLabel
                      value="bawarchee_staff"
                      control={<Radio size="small" />}
                      label={<MDTypography variant="body2">Bawarchee Staff</MDTypography>}
                    />
                  </RadioGroup>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
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
              </Grid>
              {formData.staffCategory === "company_staff" && (
                <Grid item xs={12} md={8}>
                  <Autocomplete
                    multiple
                    options={companyOptions}
                    value={formData.selectedCompanies}
                    onChange={(event, newValue) =>
                      setFormData((prev) => ({ ...prev, selectedCompanies: newValue }))
                    }
                    getOptionLabel={(option) => option.name || ""}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => (
                        <Chip
                          {...getTagProps({ index })}
                          key={option.id}
                          label={option.name}
                          size="small"
                        />
                      ))
                    }
                    renderInput={(params) => (
                      <MDInput
                        {...params}
                        label="Choose Company"
                        placeholder={
                          companyOptions.length === 0
                            ? "No companies found. Add companies first."
                            : "Select company"
                        }
                      />
                    )}
                  />
                </Grid>
              )}
              <Grid item xs={12} md={4}>
                <MDInput
                  type="text"
                  label="Staff Name"
                  name="name"
                  fullWidth
                  value={formData.name}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDInput
                  type="date"
                  label="Date of Birth"
                  name="dob"
                  fullWidth
                  value={formData.dob}
                  onChange={handleInputChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDInput
                  type="text"
                  label="Contact No"
                  name="contactNo"
                  fullWidth
                  value={formData.contactNo}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDInput
                  type="text"
                  label="WhatsApp Number"
                  name="whatsappNumber"
                  fullWidth
                  value={formData.whatsappNumber}
                  disabled={formData.whatsappSameAsContact}
                  onChange={handleInputChange}
                />
              </Grid>
              <Grid item xs={12} md={8}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={Boolean(formData.whatsappSameAsContact)}
                      onChange={(e) => handleWhatsappSameAsContact(e.target.checked)}
                    />
                  }
                  label={
                    <MDTypography variant="body2" color="text">
                      WhatsApp number same as contact number
                    </MDTypography>
                  }
                />
              </Grid>
            </Grid>

            <Divider sx={{ mb: 3 }} />

            <MDTypography sx={sectionLabelSx}>Documents</MDTypography>
            <Grid container spacing={2.5} mb={3}>
              <Grid item xs={12} md={4}>
                <MDInput
                  type="text"
                  label="Aadhar Number"
                  name="aadharNo"
                  fullWidth
                  value={formData.aadharNo}
                  onChange={handleInputChange}
                  inputProps={{ maxLength: 12 }}
                  helperText="12 digit Aadhar number (optional)"
                />
              </Grid>
              {formData.aadharNo ? (
                <>
                  <Grid item xs={12} md={4}>
                    <MDBox>
                      <MDButton
                        component="label"
                        variant="outlined"
                        color="info"
                        fullWidth
                        disabled={uploadingAadhar}
                        startIcon={<Icon>upload_file</Icon>}
                        sx={{ minHeight: 44 }}
                      >
                        {uploadingAadhar ? "Uploading Aadhar..." : "Upload Aadhar"}
                        <input
                          hidden
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) =>
                            handleDocumentUpload(e, "aadharDocumentUrl", "aadhar", setUploadingAadhar)
                          }
                        />
                      </MDButton>
                      {formData.aadharDocumentUrl && (
                        <MDTypography variant="caption" color="success" display="block" mt={0.75}>
                          Aadhar uploaded
                        </MDTypography>
                      )}
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <MDTypography variant="caption" color="text" display="block" mb={0.75}>
                      Aadhar Preview
                    </MDTypography>
                    <DocumentPreview title="Aadhar" url={formData.aadharDocumentUrl} />
                  </Grid>
                </>
              ) : null}
              <Grid item xs={12} md={4}>
                <MDBox>
                  <MDButton
                    component="label"
                    variant="outlined"
                    color="info"
                    fullWidth
                    disabled={uploadingPcc}
                    startIcon={<Icon>upload_file</Icon>}
                    sx={{ minHeight: 44 }}
                  >
                    {uploadingPcc ? "Uploading PCC..." : "Upload PCC Certificate"}
                    <input
                      hidden
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) =>
                        handleDocumentUpload(e, "pccCertificateUrl", "pcc", setUploadingPcc)
                      }
                    />
                  </MDButton>
                  {formData.pccCertificateUrl && (
                    <MDTypography variant="caption" color="success" display="block" mt={0.75}>
                      PCC certificate uploaded
                    </MDTypography>
                  )}
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6}>
                <MDTypography variant="caption" color="text" display="block" mb={0.75}>
                  PCC Preview
                </MDTypography>
                <DocumentPreview title="PCC Certificate" url={formData.pccCertificateUrl} />
              </Grid>
            </Grid>

            <Divider sx={{ mb: 3 }} />

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
          <MDButton variant="outlined" color="dark" onClick={closeStaffModal} disabled={savingStaff}>
            Cancel
          </MDButton>
          <MDButton
            variant="gradient"
            color="info"
            onClick={handleSubmit}
            disabled={savingStaff || uploadingAadhar || uploadingPcc}
          >
            {savingStaff
              ? "Saving..."
              : editingStaffId
                ? "Update Staff & Locations"
                : "Save Staff & Locations"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog open={viewModalOpen} onClose={handleCloseView} fullWidth maxWidth="md">
        <DialogTitle>Employee Details</DialogTitle>
        <DialogContent dividers>
          {selectedStaffDetails ? (
            <MDBox>
              <MDBox display="flex" alignItems="center" gap={1} mb={2}>
                <Chip
                  label={selectedStaffDetails.is_active ? "Active" : "Inactive"}
                  size="small"
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    backgroundColor: selectedStaffDetails.is_active ? "#dcfce7" : "#fee2e2",
                    color: selectedStaffDetails.is_active ? "#15803d" : "#dc2626",
                  }}
                />
              </MDBox>

              <Grid container spacing={2} mb={2}>
                <Grid item xs={12} sm={6}>
                  <MDTypography variant="caption" color="text">Name</MDTypography>
                  <MDTypography variant="body2" fontWeight="medium">{selectedStaffDetails.name}</MDTypography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDTypography variant="caption" color="text">Staff Category</MDTypography>
                  <MDTypography variant="body2" fontWeight="medium">
                    {(selectedStaffDetails.staff_category || "company_staff") === "bawarchee_staff"
                      ? "Bawarchee Staff"
                      : "Company Staff"}
                  </MDTypography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDTypography variant="caption" color="text">Company</MDTypography>
                  <MDTypography variant="body2" fontWeight="medium">
                    {(selectedStaffDetails.staff_category || "company_staff") === "bawarchee_staff"
                      ? "—"
                      : selectedStaffDetails.company_name || "—"}
                  </MDTypography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDTypography variant="caption" color="text">Type</MDTypography>
                  <MDTypography variant="body2" fontWeight="medium">
                    {(selectedStaffDetails.staff_type || "distributor") === "cnf" ? "CNF" : "Distributor"}
                  </MDTypography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDTypography variant="caption" color="text">Date of Birth</MDTypography>
                  <MDTypography variant="body2" fontWeight="medium">
                    {formatDateLabel(selectedStaffDetails.dob)}
                  </MDTypography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDTypography variant="caption" color="text">Contact No</MDTypography>
                  <MDTypography variant="body2" fontWeight="medium">{selectedStaffDetails.contact_no}</MDTypography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDTypography variant="caption" color="text">WhatsApp No</MDTypography>
                  <MDTypography variant="body2" fontWeight="medium">
                    {selectedStaffDetails.whatsapp_number || selectedStaffDetails.contact_no || "—"}
                  </MDTypography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDTypography variant="caption" color="text">Aadhar Number</MDTypography>
                  <MDTypography variant="body2" fontWeight="medium">
                    {selectedStaffDetails.aadhar_no || "—"}
                  </MDTypography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <MDTypography variant="subtitle2" fontWeight="bold" mb={1.5}>
                Documents
              </MDTypography>
              <Grid container spacing={2} mb={2}>
                {selectedStaffDetails.aadhar_no ? (
                  <Grid item xs={12} md={6}>
                    <MDTypography variant="caption" color="text" display="block" mb={0.75}>
                      Aadhar Document
                    </MDTypography>
                    <DocumentPreview title="Aadhar" url={selectedStaffDetails.aadhar_document_url} />
                  </Grid>
                ) : null}
                <Grid item xs={12} md={6}>
                  <MDTypography variant="caption" color="text" display="block" mb={0.75}>
                    PCC Certificate
                  </MDTypography>
                  <DocumentPreview title="PCC Certificate" url={selectedStaffDetails.pcc_certificate_url} />
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              <MDTypography variant="h6" fontWeight="bold" mb={1}>Assigned Locations</MDTypography>
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
