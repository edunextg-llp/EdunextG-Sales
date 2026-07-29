import { useState, useEffect, useRef } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import { Checkbox, Chip, Divider, FormControl, FormControlLabel, FormLabel, IconButton, Radio, RadioGroup } from "@mui/material";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
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
import { FaRegEdit } from "react-icons/fa";
import { CiTrash } from "react-icons/ci";
import { formatGoogleMapsLocation, isValidGoogleMapsShortUrl } from "utils/googleMapsLocation";

const GOOGLE_MAPS_HELPER_TEXT = "Use Google Maps Share link, e.g. https://maps.app.goo.gl/T9zxVHUGoiYcBX2s8";

const sectionLabelSx = {
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
  mb: 1.5,
};

const outletCardSx = {
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
  backgroundColor: "#fff",
};

const createEmptyOutlet = () => ({
  outletErpId: "",
  outletName: "",
  contactNumber: "",
  whatsappNumber: "",
  whatsappSameAsContact: false,
  hasGst: "no",
  gstNumber: "",
  address: "",
  googleLocation: "",
});

const createEmptyEditForm = () => ({
  outletErpId: "",
  outletName: "",
  contactNumber: "",
  whatsappNumber: "",
  whatsappSameAsContact: false,
  hasGst: "no",
  gstNumber: "",
  address: "",
  googleLocation: "",
});

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
  const [exportingOutlets, setExportingOutlets] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [uploadingOutlets, setUploadingOutlets] = useState(false);
  const outletUploadInputRef = useRef(null);
  const [editingOutletId, setEditingOutletId] = useState(null);
  const [editFormData, setEditFormData] = useState(createEmptyEditForm());

  const API = "https://bawarchee.edunextg.co/api";
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

  const downloadOutletsExcel = async () => {
    setExportingOutlets(true);
    try {
      const response = await fetch(`${API}/staff/outlets-export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to download outlets.");
      }
      const file = await response.blob();
      const url = window.URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "all_outlets.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message || "Failed to download outlets.");
    } finally {
      setExportingOutlets(false);
    }
  };

  const downloadOutletTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const response = await fetch(`${API}/staff/outlets-template`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to download outlet template.");
      }
      const file = await response.blob();
      const url = window.URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Add_Outlet_Upload_Template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message || "Failed to download outlet template.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const uploadOutletsExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedStaff || !selectedCompanyName || !routeDay || !selectedLocation) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyName", selectedCompanyName);
    formData.append("day", routeDay);
    formData.append("location", selectedLocation);

    setUploadingOutlets(true);
    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/outlets-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to upload outlets.");
      alert(data.message || "Outlets uploaded successfully.");
      setOutlets([]);
      fetchSavedOutlets(selectedStaff.id, routeDay);
    } catch (error) {
      alert(error.message || "Failed to upload outlets.");
    } finally {
      setUploadingOutlets(false);
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
    setOutlets([...outlets, createEmptyOutlet()]);
  };

  const removeOutletField = (index) => {
    const updated = [...outlets];
    updated.splice(index, 1);
    setOutlets(updated);
  };

  const handleOutletChange = (index, field, value) => {
    const updated = [...outlets];
    const nextValue = field === "contactNumber" || field === "whatsappNumber"
      ? String(value || "").replace(/\D/g, "")
      : field === "gstNumber"
        ? String(value || "").toUpperCase()
        : value;

    updated[index][field] = nextValue;

    if (field === "hasGst" && value === "no") {
      updated[index].gstNumber = "";
    }

    if (field === "contactNumber" && updated[index].whatsappSameAsContact) {
      updated[index].whatsappNumber = nextValue;
    }

    setOutlets(updated);
  };

  const handleWhatsappSameAsContact = (index, checked) => {
    const updated = [...outlets];
    updated[index].whatsappSameAsContact = checked;
    if (checked) {
      updated[index].whatsappNumber = updated[index].contactNumber || "";
    }
    setOutlets(updated);
  };

  const handleOutletGoogleLocationBlur = (index) => {
    const updated = [...outlets];
    updated[index].googleLocation = formatGoogleMapsLocation(updated[index].googleLocation);
    setOutlets(updated);
  };

  const handleEditGoogleLocationBlur = () => {
    setEditFormData((prev) => ({
      ...prev,
      googleLocation: formatGoogleMapsLocation(prev.googleLocation),
    }));
  };

  const handleSubmit = async () => {
    if (!selectedStaff || !routeDay || !selectedLocation || outlets.length === 0) {
      alert("Please fill in all details and add at least one outlet.");
      return;
    }

    const erpIds = outlets.map((outlet) => normalizeText(outlet.outletErpId)).filter(Boolean);
    const formattedOutlets = outlets.map((outlet) => ({
      outletErpId: outlet.outletErpId,
      outletName: outlet.outletName,
      contactNumber: outlet.contactNumber,
      whatsappNumber: outlet.whatsappSameAsContact
        ? outlet.contactNumber
        : outlet.whatsappNumber,
      hasGst: outlet.hasGst === "yes",
      gstNumber: outlet.hasGst === "yes" ? String(outlet.gstNumber || "").trim().toUpperCase() : "",
      address: String(outlet.address || "").trim(),
      googleLocation: formatGoogleMapsLocation(outlet.googleLocation),
    }));
    const missingGstNumber = formattedOutlets.some(
      (outlet) => outlet.hasGst && !outlet.gstNumber
    );
    const missingGoogleLocation = formattedOutlets.some((outlet) => !String(outlet.googleLocation || "").trim());
    const invalidGoogleLocation = formattedOutlets.find(
      (outlet) => outlet.googleLocation && !isValidGoogleMapsShortUrl(outlet.googleLocation)
    );
    const savedErpIds = new Set(savedOutlets.map((outlet) => normalizeText(outlet.outlet_erp_id)));
    const hasDuplicateErp =
      erpIds.some((erpId, index) => erpIds.indexOf(erpId) !== index) ||
      erpIds.some((erpId) => savedErpIds.has(erpId));

    if (erpIds.length !== outlets.length) {
      alert("ERP ID is mandatory for every outlet.");
      return;
    }

    if (hasDuplicateErp) {
      alert("Same ERP Id already exists. Please use a unique ERP Id.");
      return;
    }

    if (missingGstNumber) {
      alert("Please enter GST number for outlets with GST enabled.");
      return;
    }

    if (missingGoogleLocation) {
      alert("Please enter Google Location for every outlet.");
      return;
    }

    if (invalidGoogleLocation) {
      alert(`Google Location must be a short link like https://maps.app.goo.gl/T9zxVHUGoiYcBX2s8`);
      return;
    }

    setOutlets((prev) =>
      prev.map((outlet, index) => ({
        ...outlet,
        googleLocation: formattedOutlets[index].googleLocation,
        whatsappNumber: formattedOutlets[index].whatsappNumber,
      }))
    );

    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/counters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          day: routeDay,
          location: selectedLocation,
          counters: formattedOutlets,
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
    const contactNumber = outlet.contact_number || "";
    const whatsappNumber = outlet.whatsapp_number || contactNumber;
    setEditingOutletId(outlet.id);
    setEditFormData({
      outletErpId: outlet.outlet_erp_id,
      outletName: outlet.outlet_name,
      contactNumber,
      whatsappNumber,
      whatsappSameAsContact: Boolean(contactNumber) && contactNumber === whatsappNumber,
      hasGst: outlet.has_gst ? "yes" : "no",
      gstNumber: outlet.gst_number || "",
      address: outlet.address || "",
      googleLocation: outlet.google_location || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingOutletId(null);
    setEditFormData(createEmptyEditForm());
  };

  const handleEditFormChange = (field, value) => {
    const nextValue = field === "contactNumber" || field === "whatsappNumber"
      ? String(value || "").replace(/\D/g, "")
      : field === "gstNumber"
        ? String(value || "").toUpperCase()
        : value;

    setEditFormData((prev) => {
      const updated = { ...prev, [field]: nextValue };
      if (field === "contactNumber" && updated.whatsappSameAsContact) {
        updated.whatsappNumber = nextValue;
      }
      if (field === "hasGst" && value === "no") {
        updated.gstNumber = "";
      }
      return updated;
    });
  };

  const handleEditWhatsappSameAsContact = (checked) => {
    setEditFormData((prev) => ({
      ...prev,
      whatsappSameAsContact: checked,
      whatsappNumber: checked ? prev.contactNumber || "" : prev.whatsappNumber,
    }));
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

    if (editFormData.hasGst === "yes" && !String(editFormData.gstNumber || "").trim()) {
      alert("Please enter GST number when GST is enabled.");
      return;
    }

    if (!String(editFormData.googleLocation || "").trim()) {
      alert("Please enter Google Location.");
      return;
    }

    const formattedGoogleLocation = formatGoogleMapsLocation(editFormData.googleLocation);
    if (!isValidGoogleMapsShortUrl(formattedGoogleLocation)) {
      alert("Google Location must be a short link like https://maps.app.goo.gl/T9zxVHUGoiYcBX2s8");
      return;
    }

    try {
      const response = await fetch(`${API}/staff/counter/${counterId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletErpId: editFormData.outletErpId,
          outletName: editFormData.outletName,
          contactNumber: editFormData.contactNumber,
          whatsappNumber: editFormData.whatsappSameAsContact
            ? editFormData.contactNumber
            : editFormData.whatsappNumber,
          hasGst: editFormData.hasGst === "yes",
          gstNumber: editFormData.hasGst === "yes"
            ? String(editFormData.gstNumber || "").trim().toUpperCase()
            : "",
          address: String(editFormData.address || "").trim(),
          googleLocation: formattedGoogleLocation,
        }),
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
                  {/* {selectedStaff && (
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
                  )} */}
                </Grid>

                <MDBox mt={2} display="flex" justifyContent="flex-end" gap={1} flexWrap="wrap">
                  <MDButton
                    variant="outlined"
                    color="info"
                    size="small"
                    onClick={downloadOutletTemplate}
                    disabled={downloadingTemplate}
                    startIcon={<Icon>download</Icon>}
                  >
                    {downloadingTemplate ? "Preparing Template..." : "Download Add Outlet Template"}
                  </MDButton>
                  <MDButton
                    variant="gradient"
                    color="success"
                    size="small"
                    onClick={downloadOutletsExcel}
                    disabled={exportingOutlets}
                    startIcon={<Icon>download</Icon>}
                  >
                    {exportingOutlets ? "Preparing Excel..." : "Download All Outlets Excel"}
                  </MDButton>
                </MDBox>

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
                    <Card sx={{ boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)", border: "1px solid #e5e7eb" }}>
                      <MDBox
                        px={3}
                        py={2.5}
                        display="flex"
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        flexDirection={{ xs: "column", sm: "row" }}
                        gap={2}
                        sx={{ borderBottom: "1px solid #e5e7eb", backgroundColor: "#f8fafc" }}
                      >
                        <MDBox>
                          <MDTypography variant="h6" fontWeight="medium" color="dark">
                            Add Outlets
                          </MDTypography>
                          <MDBox display="flex" alignItems="center" gap={1} mt={0.75} flexWrap="wrap">
                            <MDTypography variant="body2" color="text">
                              Location:
                            </MDTypography>
                            <Chip
                              icon={<Icon sx={{ fontSize: "16px !important" }}>place</Icon>}
                              label={selectedLocation}
                              size="small"
                              color="info"
                              variant="outlined"
                              sx={{ fontWeight: 600 }}
                            />
                            {outlets.length > 0 && (
                              <Chip
                                label={`${outlets.length} outlet${outlets.length > 1 ? "s" : ""}`}
                                size="small"
                                sx={{ backgroundColor: "#e0f2fe", color: "#0369a1", fontWeight: 600 }}
                              />
                            )}
                          </MDBox>
                        </MDBox>
                        <MDButton
                          variant="gradient"
                          color="dark"
                          size="small"
                          onClick={addOutletField}
                          startIcon={<Icon>add</Icon>}
                          sx={{ flexShrink: 0 }}
                        >
                          Add Outlet
                        </MDButton>
                        <MDButton
                          variant="outlined"
                          color="info"
                          size="small"
                          onClick={() => outletUploadInputRef.current?.click()}
                          disabled={uploadingOutlets}
                          startIcon={<Icon>upload_file</Icon>}
                          sx={{ flexShrink: 0 }}
                        >
                          {uploadingOutlets ? "Uploading..." : "Upload Excel"}
                        </MDButton>
                        <input
                          ref={outletUploadInputRef}
                          type="file"
                          accept=".xls,.xlsx"
                          hidden
                          onChange={uploadOutletsExcel}
                        />
                      </MDBox>

                      <MDBox p={3}>
                        {outlets.length === 0 ? (
                          <MDBox
                            py={5}
                            px={2}
                            textAlign="center"
                            sx={{
                              border: "2px dashed #cbd5e1",
                              borderRadius: "12px",
                              backgroundColor: "#f8fafc",
                            }}
                          >
                            <Icon sx={{ fontSize: 40, color: "#94a3b8", mb: 1 }}>storefront</Icon>
                            <MDTypography variant="body2" color="text" fontWeight="medium">
                              No outlets added yet
                            </MDTypography>
                            <MDTypography variant="caption" color="text" display="block" mt={0.5} mb={2}>
                              Click &quot;Add Outlet&quot; to start adding outlet details for this location.
                            </MDTypography>
                            <MDButton
                              variant="outlined"
                              color="info"
                              size="small"
                              onClick={addOutletField}
                              startIcon={<Icon>add</Icon>}
                            >
                              Add First Outlet
                            </MDButton>
                          </MDBox>
                        ) : (
                          outlets.map((outlet, index) => (
                            <MDBox key={index} mb={index < outlets.length - 1 ? 3 : 0} sx={outletCardSx}>
                              <MDBox
                                px={2.5}
                                py={1.5}
                                display="flex"
                                justifyContent="space-between"
                                alignItems="center"
                                sx={{ backgroundColor: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}
                              >
                                <MDBox display="flex" alignItems="center" gap={1}>
                                  <MDBox
                                    sx={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: "8px",
                                      backgroundColor: "#0ea5e9",
                                      color: "#fff",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: "0.8rem",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {index + 1}
                                  </MDBox>
                                  <MDTypography variant="button" fontWeight="medium" color="dark">
                                    Outlet {index + 1}
                                  </MDTypography>
                                </MDBox>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => removeOutletField(index)}
                                  title="Remove outlet"
                                >
                                  <Icon fontSize="small">delete_outline</Icon>
                                </IconButton>
                              </MDBox>

                              <MDBox p={2.5}>
                                <MDTypography sx={sectionLabelSx}>Outlet Details</MDTypography>
                                <Grid container spacing={2} mb={2.5}>
                                  <Grid item xs={12} sm={6} md={4}>
                                    <MDInput
                                      label="ERP Id"
                                      fullWidth
                                      InputProps={{ sx: { minHeight: 44 } }}
                                      value={outlet.outletErpId}
                                      onChange={(e) =>
                                        handleOutletChange(index, "outletErpId", e.target.value)
                                      }
                                    />
                                  </Grid>
                                  <Grid item xs={12} sm={6} md={8}>
                                    <MDInput
                                      label="Outlet Name"
                                      fullWidth
                                      InputProps={{ sx: { minHeight: 44 } }}
                                      value={outlet.outletName}
                                      onChange={(e) =>
                                        handleOutletChange(index, "outletName", e.target.value)
                                      }
                                    />
                                  </Grid>
                                </Grid>

                                <Divider sx={{ mb: 2.5 }} />

                                <MDTypography sx={sectionLabelSx}>GST</MDTypography>
                                <Grid container spacing={2} mb={2.5}>
                                  <Grid item xs={12}>
                                    <FormControl>
                                      <MDTypography variant="caption" color="text" display="block" mb={0.5}>
                                        Outlet has GST?
                                      </MDTypography>
                                      <RadioGroup
                                        row
                                        value={outlet.hasGst}
                                        onChange={(e) =>
                                          handleOutletChange(index, "hasGst", e.target.value)
                                        }
                                      >
                                        <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
                                        <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
                                      </RadioGroup>
                                    </FormControl>
                                  </Grid>
                                  {outlet.hasGst === "yes" && (
                                    <Grid item xs={12} sm={6} md={4}>
                                      <MDInput
                                        label="GST No *"
                                        fullWidth
                                        InputProps={{ sx: { minHeight: 44 } }}
                                        value={outlet.gstNumber}
                                        onChange={(e) =>
                                          handleOutletChange(index, "gstNumber", e.target.value)
                                        }
                                      />
                                    </Grid>
                                  )}
                                </Grid>

                                <Divider sx={{ mb: 2.5 }} />

                                <MDTypography sx={sectionLabelSx}>Contact</MDTypography>
                                <Grid container spacing={2} mb={1}>
                                  <Grid item xs={12} sm={6}>
                                    <MDInput
                                      label="Contact Number"
                                      fullWidth
                                      InputProps={{ sx: { minHeight: 44 } }}
                                      value={outlet.contactNumber}
                                      onChange={(e) =>
                                        handleOutletChange(index, "contactNumber", e.target.value)
                                      }
                                    />
                                  </Grid>
                                  <Grid item xs={12} sm={6}>
                                    <MDInput
                                      label="WhatsApp Number"
                                      fullWidth
                                      InputProps={{ sx: { minHeight: 44 } }}
                                      value={outlet.whatsappNumber}
                                      disabled={outlet.whatsappSameAsContact}
                                      onChange={(e) =>
                                        handleOutletChange(index, "whatsappNumber", e.target.value)
                                      }
                                    />
                                  </Grid>
                                  <Grid item xs={12}>
                                    <FormControlLabel
                                      control={
                                        <Checkbox
                                          size="small"
                                          checked={Boolean(outlet.whatsappSameAsContact)}
                                          onChange={(e) =>
                                            handleWhatsappSameAsContact(index, e.target.checked)
                                          }
                                        />
                                      }
                                      label={
                                        <MDTypography variant="body2" color="text">
                                          WhatsApp number same as contact number
                                        </MDTypography>
                                      }
                                      sx={{ ml: 0 }}
                                    />
                                  </Grid>
                                </Grid>

                                <Divider sx={{ mb: 2.5 }} />

                                <MDTypography sx={sectionLabelSx}>Location</MDTypography>
                                <Grid container spacing={2}>
                                  <Grid item xs={12}>
                                    <MDInput
                                      label="Address"
                                      fullWidth
                                      multiline
                                      rows={2}
                                      value={outlet.address}
                                      onChange={(e) =>
                                        handleOutletChange(index, "address", e.target.value)
                                      }
                                    />
                                  </Grid>
                                  <Grid item xs={12}>
                                    <MDInput
                                      label="Google Location"
                                      fullWidth
                                      InputProps={{ sx: { minHeight: 44 } }}
                                      value={outlet.googleLocation}
                                      onChange={(e) =>
                                        handleOutletChange(index, "googleLocation", e.target.value)
                                      }
                                      onBlur={() => handleOutletGoogleLocationBlur(index)}
                                      helperText={GOOGLE_MAPS_HELPER_TEXT}
                                    />
                                  </Grid>
                                </Grid>
                              </MDBox>
                            </MDBox>
                          ))
                        )}

                        {outlets.length > 0 && (
                          <MDBox mt={3} pt={2.5} display="flex" justifyContent="flex-end" gap={1.5} sx={{ borderTop: "1px solid #e5e7eb" }}>
                            <MDButton
                              variant="outlined"
                              color="dark"
                              onClick={() => setOutlets([])}
                            >
                              Clear All
                            </MDButton>
                            <MDButton
                              variant="gradient"
                              color="info"
                              onClick={handleSubmit}
                              startIcon={<Icon>save</Icon>}
                            >
                              Save {outlets.length} Outlet{outlets.length > 1 ? "s" : ""}
                            </MDButton>
                          </MDBox>
                        )}
                      </MDBox>
                    </Card>
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
                                onChange={(e) => handleEditFormChange("outletErpId", e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDInput
                                label="Outlet Name"
                                fullWidth
                                value={editFormData.outletName}
                                onChange={(e) => handleEditFormChange("outletName", e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDInput
                                label="Contact"
                                fullWidth
                                value={editFormData.contactNumber}
                                onChange={(e) => handleEditFormChange("contactNumber", e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDInput
                                label="WhatsApp Number"
                                fullWidth
                                value={editFormData.whatsappNumber}
                                disabled={editFormData.whatsappSameAsContact}
                                onChange={(e) => handleEditFormChange("whatsappNumber", e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDInput
                                label="Address"
                                fullWidth
                                multiline
                                rows={2}
                                value={editFormData.address}
                                onChange={(e) => handleEditFormChange("address", e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <FormControl fullWidth>
                                <FormLabel sx={{ fontSize: "0.75rem", mb: 0.5 }}>GST?</FormLabel>
                                <RadioGroup
                                  row
                                  value={editFormData.hasGst}
                                  onChange={(e) => handleEditFormChange("hasGst", e.target.value)}
                                >
                                  <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
                                  <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
                                </RadioGroup>
                              </FormControl>
                            </Grid>
                            {editFormData.hasGst === "yes" && (
                              <Grid item xs={12} sm={6} md={2}>
                                <MDInput
                                  label="GST No *"
                                  fullWidth
                                  value={editFormData.gstNumber}
                                  onChange={(e) => handleEditFormChange("gstNumber", e.target.value)}
                                />
                              </Grid>
                            )}
                            <Grid item xs={12} sm={6} md={2}>
                              <MDInput
                                label="Google Location"
                                fullWidth
                                value={editFormData.googleLocation}
                                onChange={(e) => handleEditFormChange("googleLocation", e.target.value)}
                                onBlur={handleEditGoogleLocationBlur}
                                helperText={GOOGLE_MAPS_HELPER_TEXT}
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
                            <Grid item xs={12}>
                              <MDBox display="flex" alignItems="center">
                                <Checkbox
                                  checked={Boolean(editFormData.whatsappSameAsContact)}
                                  onChange={(e) => handleEditWhatsappSameAsContact(e.target.checked)}
                                />
                                <MDTypography variant="body2">
                                  WhatsApp number same as contact number
                                </MDTypography>
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
                            <Grid item xs={12} sm={6} md={2}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.outlet_name}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.contact_number}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDTypography variant="body2" fontWeight="medium">
                                WA: {saved.whatsapp_number || saved.contact_number || "-"}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.address || "-"}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={1}>
                              <MDTypography variant="body2" fontWeight="medium">
                                GST: {saved.has_gst ? "Yes" : "No"}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
                              <MDTypography variant="body2" fontWeight="medium">
                                {saved.has_gst ? saved.gst_number || "-" : "—"}
                              </MDTypography>
                            </Grid>
                            <Grid item xs={12} sm={6} md={2}>
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
                                {/* <MDButton color="info" variant="text" size="small" onClick={() => handleEditClick(saved)}>
                                  <Icon>edit</Icon> Edit
                                </MDButton>
                                <MDButton color="error" variant="text" size="small" onClick={() => handleDeleteSavedOutlet(saved.id)}>
                                  <Icon>delete</Icon> Delete
                                </MDButton> */}
                                <FaRegEdit onClick={() => handleEditClick(saved)} style={{ cursor: "pointer" }} color="#E0E388" size={20} />
                                <CiTrash onClick={() => handleDeleteSavedOutlet(saved.id)} style={{ cursor: "pointer" }} color="#FF0000" size={20} />
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
