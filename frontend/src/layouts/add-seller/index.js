import { useCallback, useEffect, useState } from "react";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { lookupPincode } from "utils/pincodeLookup";

const API = "https://bawarche.edunextg.co/api";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const emptyForm = () => ({
  sellerName: "",
  address: "",
  city: "",
  district: "",
  contact: "",
  hasGst: "no",
  gstin: "",
  state: "",
  pinCode: "",
});

const tableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "none",
  borderBottom: "1px solid #e5e7eb",
  px: 2,
  py: 1.5,
  whiteSpace: "nowrap",
};

const tableBodySx = {
  px: 2,
  py: 1.25,
  fontSize: "0.875rem",
  color: "#374151",
  borderBottom: "none",
  verticalAlign: "middle",
};

function AddSeller() {
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [sellers, setSellers] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm());
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editPincodeLoading, setEditPincodeLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const authHeaders = {
    Authorization: `Bearer ${localStorage.getItem("token")}`,
    "Content-Type": "application/json",
  };

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const res = await fetch(`${API}/staff/companies`, { headers: authHeaders });
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  const fetchSellers = useCallback(async (companyId) => {
    if (!companyId) {
      setSellers([]);
      return;
    }
    setLoadingSellers(true);
    try {
      const res = await fetch(`${API}/staff/purchase-sellers/company/${companyId}`, {
        headers: authHeaders,
      });
      const data = await res.json();
      setSellers(Array.isArray(data) ? data : []);
    } catch {
      setSellers([]);
    } finally {
      setLoadingSellers(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    setForm(emptyForm());
    setError("");
    setSuccess("");
    fetchSellers(selectedCompanyId);
  }, [selectedCompanyId, fetchSellers]);

  const handleChange = (field, value) => {
    setError("");
    setSuccess("");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field, value) => {
    setEditError("");
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const applyPincodeLookup = async (pinCode, setter, setLoading) => {
    const clean = String(pinCode || "").replace(/\D/g, "");
    if (clean.length !== 6) return;

    setLoading(true);
    const result = await lookupPincode(clean);
    setLoading(false);

    if (!result) return;

    setter((prev) => ({
      ...prev,
      pinCode: clean,
      district: result.district || prev.district,
      state: result.state || prev.state,
      city: prev.city || result.city,
      address: prev.address || result.area || prev.address,
    }));
  };

  const buildPayload = (data, companyId) => ({
    companyId: Number(companyId),
    sellerName: data.sellerName.trim(),
    address: data.address.trim(),
    city: data.city.trim(),
    district: data.district.trim(),
    contact: data.contact.replace(/\D/g, ""),
    hasGst: data.hasGst === "yes",
    gstin: data.hasGst === "yes" ? data.gstin.trim().toUpperCase() : "",
    state: data.state.trim(),
    pinCode: data.pinCode.replace(/\D/g, ""),
  });

  const validateForm = (data) => {
    if (!selectedCompanyId) return "Please choose a company first.";
    if (!data.sellerName.trim()) return "Seller name is required.";
    if (!data.contact.trim()) return "Contact number is required.";
    if (data.hasGst === "yes") {
      if (!data.gstin.trim()) return "GSTIN is required when GST is enabled.";
      if (!data.state.trim()) return "State is required when GST is enabled.";
      if (!/^\d{6}$/.test(data.pinCode.replace(/\D/g, ""))) {
        return "Valid 6-digit pin code is required when GST is enabled.";
      }
    }
    return "";
  };

  const handleSubmit = async () => {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API}/staff/purchase-sellers`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(buildPayload(form, selectedCompanyId)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add seller.");
      } else {
        const codeLabel = data.seller?.seller_code ? ` (${data.seller.seller_code})` : "";
        setSuccess(`Seller "${form.sellerName.trim()}" added successfully${codeLabel}.`);
        setForm(emptyForm());
        fetchSellers(selectedCompanyId);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (seller) => {
    setEditingId(seller.id);
    setEditForm({
      sellerName: seller.seller_name || "",
      address: seller.address || "",
      city: seller.city || "",
      district: seller.district || "",
      contact: seller.contact || "",
      hasGst: seller.has_gst ? "yes" : "no",
      gstin: seller.gstin || "",
      state: seller.state || "",
      pinCode: seller.in_code || "",
    });
    setEditError("");
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingId(null);
    setEditForm(emptyForm());
    setEditError("");
  };

  const handleUpdate = async () => {
    const validationError = validateForm(editForm);
    if (validationError) {
      setEditError(validationError);
      return;
    }

    setSavingEdit(true);
    setEditError("");
    try {
      const res = await fetch(`${API}/staff/purchase-sellers/${editingId}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify(buildPayload(editForm, selectedCompanyId)),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Failed to update seller.");
      } else {
        closeEditModal();
        setSuccess(`Seller "${data.seller?.seller_name || editForm.sellerName}" updated successfully.`);
        fetchSellers(selectedCompanyId);
      }
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (seller) => {
    if (!window.confirm(`Delete seller "${seller.seller_name}"?`)) return;
    setDeletingId(seller.id);
    try {
      const res = await fetch(`${API}/staff/purchase-sellers/${seller.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSellers((prev) => prev.filter((item) => item.id !== seller.id));
        if (editingId === seller.id) closeEditModal();
        setSuccess(`Seller "${seller.seller_name}" deleted.`);
      } else {
        alert(data.error || "Failed to delete seller.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const selectedCompany = companies.find((c) => String(c.id) === String(selectedCompanyId));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12} lg={10}>
            <Card sx={{ boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
              <MDBox p={3} pb={2} borderBottom="1px solid #e5e7eb">
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Add Seller
                </MDTypography>
                <MDTypography variant="body2" color="text" mt={0.5}>
                  Choose a company first, then add sellers under that company. Pin code auto-fills district and state.
                </MDTypography>
              </MDBox>

              <MDBox p={3}>
                <Grid container spacing={2.5}>
                  <Grid item xs={12} md={4}>
                    <FormControl fullWidth size="small" required>
                      <InputLabel id="company-select-label">Company *</InputLabel>
                      <Select
                        labelId="company-select-label"
                        value={selectedCompanyId}
                        label="Company *"
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                        disabled={loadingCompanies}
                      >
                        <MenuItem value="">
                          <em>Select Company</em>
                        </MenuItem>
                        {companies.map((company) => (
                          <MenuItem key={company.id} value={String(company.id)}>
                            {company.name}
                            {company.code ? ` (${company.code})` : ""}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  {selectedCompany && (
                    <Grid item xs={12} md={8} display="flex" alignItems="center">
                      <Chip
                        icon={<Icon sx={{ fontSize: "16px !important" }}>business</Icon>}
                        label={`Adding seller under ${selectedCompany.name}`}
                        color="info"
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                      />
                    </Grid>
                  )}

                  <Grid item xs={12}>
                    <MDTypography variant="button" fontWeight="medium" color="dark">
                      Seller Details
                    </MDTypography>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <MDInput
                      label="Seller Name *"
                      fullWidth
                      value={form.sellerName}
                      onChange={(e) => handleChange("sellerName", e.target.value)}
                      disabled={!selectedCompanyId}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <MDInput
                      label="Contact Number *"
                      fullWidth
                      value={form.contact}
                      onChange={(e) => handleChange("contact", e.target.value.replace(/\D/g, ""))}
                      disabled={!selectedCompanyId}
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <MDTypography variant="button" fontWeight="medium" color="dark">
                      Address
                    </MDTypography>
                  </Grid>

                  <Grid item xs={12}>
                    <MDInput
                      label="Address"
                      fullWidth
                      multiline
                      rows={2}
                      value={form.address}
                      onChange={(e) => handleChange("address", e.target.value)}
                      disabled={!selectedCompanyId}
                    />
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="City"
                      fullWidth
                      value={form.city}
                      onChange={(e) => handleChange("city", e.target.value)}
                      disabled={!selectedCompanyId}
                    />
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="District"
                      fullWidth
                      value={form.district}
                      onChange={(e) => handleChange("district", e.target.value)}
                      disabled={!selectedCompanyId}
                      helperText="Auto-filled from pin code"
                    />
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small" disabled={!selectedCompanyId}>
                      <InputLabel id="state-select-label">State</InputLabel>
                      <Select
                        labelId="state-select-label"
                        value={form.state}
                        label="State"
                        onChange={(e) => handleChange("state", e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                      >
                        <MenuItem value="">
                          <em>Select State</em>
                        </MenuItem>
                        {INDIAN_STATES.map((state) => (
                          <MenuItem key={state} value={state}>
                            {state}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="Pin Code"
                      fullWidth
                      value={form.pinCode}
                      onChange={(e) => handleChange("pinCode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onBlur={() => applyPincodeLookup(form.pinCode, setForm, setPincodeLoading)}
                      disabled={!selectedCompanyId}
                      InputProps={{
                        endAdornment: pincodeLoading ? <CircularProgress size={18} /> : null,
                      }}
                      helperText="Enter 6-digit pin code to auto-detect district & state"
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <FormControl disabled={!selectedCompanyId}>
                      <MDTypography variant="caption" color="text" display="block" mb={0.5}>
                        GST Registered?
                      </MDTypography>
                      <RadioGroup
                        row
                        value={form.hasGst}
                        onChange={(e) => handleChange("hasGst", e.target.value)}
                      >
                        <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
                        <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
                      </RadioGroup>
                    </FormControl>
                  </Grid>

                  {form.hasGst === "yes" && (
                    <Grid item xs={12} md={4}>
                      <MDInput
                        label="GSTIN *"
                        fullWidth
                        value={form.gstin}
                        onChange={(e) => handleChange("gstin", e.target.value.toUpperCase())}
                        disabled={!selectedCompanyId}
                      />
                    </Grid>
                  )}

                  {error && (
                    <Grid item xs={12}>
                      <MDTypography variant="body2" color="error">
                        {error}
                      </MDTypography>
                    </Grid>
                  )}
                  {success && (
                    <Grid item xs={12}>
                      <MDTypography variant="body2" sx={{ color: "#16a34a" }}>
                        {success}
                      </MDTypography>
                    </Grid>
                  )}

                  <Grid item xs={12} display="flex" justifyContent="flex-end">
                    <MDButton
                      variant="gradient"
                      color="info"
                      disabled={saving || !selectedCompanyId}
                      onClick={handleSubmit}
                      startIcon={<Icon>person_add</Icon>}
                    >
                      {saving ? "Saving..." : "Add Seller"}
                    </MDButton>
                  </Grid>
                </Grid>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} lg={10}>
            <Card sx={{ boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
              <MDBox p={3} pb={2} borderBottom="1px solid #e5e7eb">
                <MDTypography variant="h6" fontWeight="medium" color="dark">
                  Sellers
                  {selectedCompany && (
                    <MDTypography component="span" variant="body2" color="text" sx={{ ml: 1 }}>
                      for {selectedCompany.name}
                    </MDTypography>
                  )}
                </MDTypography>
              </MDBox>

              <MDBox>
                {!selectedCompanyId ? (
                  <MDBox p={4} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      Select a company to view and manage its sellers.
                    </MDTypography>
                  </MDBox>
                ) : loadingSellers ? (
                  <MDBox p={4} textAlign="center">
                    <MDTypography variant="body2" color="text">Loading sellers...</MDTypography>
                  </MDBox>
                ) : sellers.length === 0 ? (
                  <MDBox p={4} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      No sellers found for this company. Add one above.
                    </MDTypography>
                  </MDBox>
                ) : (
                  <TableContainer sx={{ boxShadow: "none", backgroundColor: "transparent" }}>
                    <Table>
                      <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                        <TableRow>
                          <TableCell sx={tableHeadSx}>#</TableCell>
                          <TableCell sx={tableHeadSx}>Seller ID</TableCell>
                          <TableCell sx={tableHeadSx}>Seller Name</TableCell>
                          <TableCell sx={tableHeadSx}>Contact</TableCell>
                          <TableCell sx={tableHeadSx}>City</TableCell>
                          <TableCell sx={tableHeadSx}>District</TableCell>
                          <TableCell sx={tableHeadSx}>State</TableCell>
                          <TableCell sx={tableHeadSx}>GST</TableCell>
                          <TableCell sx={tableHeadSx}>GSTIN</TableCell>
                          <TableCell sx={tableHeadSx}>Pin Code</TableCell>
                          <TableCell sx={{ ...tableHeadSx, textAlign: "center" }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sellers.map((seller, index) => (
                          <TableRow
                            key={seller.id}
                            sx={{ backgroundColor: index % 2 !== 0 ? "#fafafa" : "inherit" }}
                          >
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", color: "#9ca3af" }}>
                              {index + 1}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#1d4ed8", fontFamily: "monospace" }}>
                              {seller.seller_code || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontWeight: 500 }}>
                              {seller.seller_name}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {seller.contact || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {seller.city || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {seller.district || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {seller.state || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {seller.has_gst ? "Yes" : "No"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {seller.gstin || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {seller.in_code || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", textAlign: "center" }}>
                              <MDBox display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                                <MDButton
                                  size="small"
                                  color="info"
                                  variant="text"
                                  onClick={() => openEditModal(seller)}
                                  sx={{ minWidth: 0, p: 0.5 }}
                                  title="Edit seller"
                                >
                                  <Icon sx={{ fontSize: "1.5rem !important" }}>edit</Icon>
                                </MDButton>
                                <MDButton
                                  size="small"
                                  color="error"
                                  variant="text"
                                  disabled={deletingId === seller.id}
                                  onClick={() => handleDelete(seller)}
                                  sx={{ minWidth: 0, p: 0.5 }}
                                  title="Delete seller"
                                >
                                  <Icon sx={{ fontSize: "1.5rem !important" }}>delete_outline</Icon>
                                </MDButton>
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

      <Dialog open={editModalOpen} onClose={closeEditModal} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          Edit Seller
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <MDInput
                  label="Seller Name *"
                  fullWidth
                  value={editForm.sellerName}
                  onChange={(e) => handleEditChange("sellerName", e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <MDInput
                  label="Contact Number *"
                  fullWidth
                  value={editForm.contact}
                  onChange={(e) => handleEditChange("contact", e.target.value.replace(/\D/g, ""))}
                />
              </Grid>
              <Grid item xs={12}>
                <MDInput
                  label="Address"
                  fullWidth
                  multiline
                  rows={2}
                  value={editForm.address}
                  onChange={(e) => handleEditChange("address", e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDInput
                  label="City"
                  fullWidth
                  value={editForm.city}
                  onChange={(e) => handleEditChange("city", e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDInput
                  label="District"
                  fullWidth
                  value={editForm.district}
                  onChange={(e) => handleEditChange("district", e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="edit-state-select-label">State</InputLabel>
                  <Select
                    labelId="edit-state-select-label"
                    value={editForm.state}
                    label="State"
                    onChange={(e) => handleEditChange("state", e.target.value)}
                    sx={{ minHeight: 44 }}
                  >
                    <MenuItem value="">
                      <em>Select State</em>
                    </MenuItem>
                    {INDIAN_STATES.map((state) => (
                      <MenuItem key={state} value={state}>
                        {state}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <MDInput
                  label="Pin Code"
                  fullWidth
                  value={editForm.pinCode}
                  onChange={(e) =>
                    handleEditChange("pinCode", e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  onBlur={() => applyPincodeLookup(editForm.pinCode, setEditForm, setEditPincodeLoading)}
                  InputProps={{
                    endAdornment: editPincodeLoading ? <CircularProgress size={18} /> : null,
                  }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <MDTypography variant="caption" color="text" display="block" mb={0.5}>
                    GST Registered?
                  </MDTypography>
                  <RadioGroup
                    row
                    value={editForm.hasGst}
                    onChange={(e) => handleEditChange("hasGst", e.target.value)}
                  >
                    <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
                    <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
                  </RadioGroup>
                </FormControl>
              </Grid>
              {editForm.hasGst === "yes" && (
                <Grid item xs={12} md={4}>
                  <MDInput
                    label="GSTIN *"
                    fullWidth
                    value={editForm.gstin}
                    onChange={(e) => handleEditChange("gstin", e.target.value.toUpperCase())}
                  />
                </Grid>
              )}
              {editError && (
                <Grid item xs={12}>
                  <MDTypography variant="body2" color="error">
                    {editError}
                  </MDTypography>
                </Grid>
              )}
            </Grid>
          </MDBox>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <MDButton variant="outlined" color="dark" onClick={closeEditModal} disabled={savingEdit}>
            Cancel
          </MDButton>
          <MDButton variant="gradient" color="info" onClick={handleUpdate} disabled={savingEdit}>
            {savingEdit ? "Updating..." : "Update Seller"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default AddSeller;
