import { useState, useEffect, useCallback } from "react";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = "https://bawarche.edunextg.co/api";

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

const MAX_WORDS = 200;

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function AddCompany() {
  const [form, setForm] = useState({ type: "", name: "", about: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [companies, setCompanies] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ type: "", name: "", about: "", code: "" });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const wordCount = countWords(form.about);
  const wordsLeft = MAX_WORDS - wordCount;
  const editWordCount = countWords(editForm.about);
  const editWordsLeft = MAX_WORDS - editWordCount;

  const fetchCompanies = useCallback(async () => {
    setLoadingList(true);
    try {
      const url = filterType
        ? `${API}/staff/companies?type=${filterType}`
        : `${API}/staff/companies`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      setCompanies([]);
    } finally {
      setLoadingList(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleChange = (field, value) => {
    setError("");
    setSuccess("");
    if (field === "about") {
      const words = value.trim() ? value.trim().split(/\s+/) : [];
      if (words.length > MAX_WORDS) return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field, value) => {
    setEditError("");
    if (field === "about") {
      const words = value.trim() ? value.trim().split(/\s+/) : [];
      if (words.length > MAX_WORDS) return;
    }
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const openEditModal = (company) => {
    setEditingId(company.id);
    setEditForm({
      type: company.type || "",
      name: company.name || "",
      about: company.about || "",
      code: company.code || "",
    });
    setEditError("");
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingId(null);
    setEditForm({ type: "", name: "", about: "", code: "" });
    setEditError("");
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    if (!form.type) return setError("Please select a company type.");
    if (!form.name.trim()) return setError("Company name is required.");

    setSaving(true);
    try {
      const res = await fetch(`${API}/staff/companies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          type: form.type,
          name: form.name.trim(),
          about: form.about.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add company.");
      } else {
        const codeLabel = data.code ? ` (Code: ${data.code})` : "";
        setSuccess(`Company "${form.name.trim()}" added successfully${codeLabel}.`);
        setForm({ type: "", name: "", about: "" });
        fetchCompanies();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setEditError("");
    if (!editForm.type) return setEditError("Please select a company type.");
    if (!editForm.name.trim()) return setEditError("Company name is required.");

    setSavingEdit(true);
    try {
      const res = await fetch(`${API}/staff/companies/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          type: editForm.type,
          name: editForm.name.trim(),
          about: editForm.about.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Failed to update company.");
      } else {
        closeEditModal();
        fetchCompanies();
        setSuccess(`Company "${data.name}" updated successfully.`);
      }
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete company "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API}/staff/companies/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (res.ok) {
        setCompanies((prev) => prev.filter((c) => c.id !== id));
        if (editingId === id) closeEditModal();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete company.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const typeChip = (type) => {
    if (type === "cnf") {
      return (
        <Chip
          label="CNF"
          size="small"
          sx={{
            fontSize: "0.7rem",
            fontWeight: 600,
            backgroundColor: "#dbeafe",
            color: "#1d4ed8",
            border: "none",
          }}
        />
      );
    }
    if (type === "distributor") {
      return (
        <Chip
          label="Distributor"
          size="small"
          sx={{
            fontSize: "0.7rem",
            fontWeight: 600,
            backgroundColor: "#dcfce7",
            color: "#15803d",
            border: "none",
          }}
        />
      );
    }
    return (
      <span style={{ fontStyle: "italic", color: "#d1d5db" }}>—</span>
    );
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">

          {/* ── Add Company Form ── */}
          <Grid item xs={12} lg={8}>
            <Card sx={{ boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
              <MDBox p={3} pb={2} borderBottom="1px solid #e5e7eb">
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Add Company
                </MDTypography>
                <MDTypography variant="body2" color="text" mt={0.5}>
                  Companies added here will be available across the app (e.g., Add Sales, Create Staff).
                  A unique company code is auto-generated for each company.
                </MDTypography>
              </MDBox>

              <MDBox p={3}>
                <Grid container spacing={2.5}>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="company-type-label">Company Type *</InputLabel>
                      <Select
                        labelId="company-type-label"
                        value={form.type}
                        label="Company Type *"
                        onChange={(e) => handleChange("type", e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                      >
                        <MenuItem value="distributor">Distributor</MenuItem>
                        <MenuItem value="cnf">CNF</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={8}>
                    <MDInput
                      label="Company Name *"
                      fullWidth
                      value={form.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <MDInput
                      label={`About (optional, max ${MAX_WORDS} words)`}
                      fullWidth
                      multiline
                      rows={4}
                      value={form.about}
                      onChange={(e) => handleChange("about", e.target.value)}
                    />
                    <MDTypography
                      variant="caption"
                      sx={{
                        color: wordsLeft < 20 ? "#ef4444" : "#6b7280",
                        display: "block",
                        textAlign: "right",
                        mt: 0.5,
                      }}
                    >
                      {wordCount} / {MAX_WORDS} words
                    </MDTypography>
                  </Grid>

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
                      disabled={saving}
                      onClick={handleSubmit}
                      startIcon={<Icon>add_business</Icon>}
                    >
                      {saving ? "Adding..." : "Add Company"}
                    </MDButton>
                  </Grid>
                </Grid>
              </MDBox>
            </Card>
          </Grid>

          {/* ── Existing Companies List ── */}
          <Grid item xs={12} lg={8}>
            <Card sx={{ boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
              <MDBox
                p={3}
                pb={2}
                borderBottom="1px solid #e5e7eb"
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={1}
              >
                <MDTypography variant="h6" fontWeight="medium" color="dark">
                  Existing Companies
                  {companies.length > 0 && (
                    <MDTypography
                      component="span"
                      variant="caption"
                      sx={{
                        ml: 1,
                        px: 1,
                        py: 0.25,
                        borderRadius: "12px",
                        border: "1px solid #e5e7eb",
                        backgroundColor: "#f9fafb",
                        color: "#374151",
                        fontWeight: 500,
                      }}
                    >
                      {companies.length}
                    </MDTypography>
                  )}
                </MDTypography>

                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="filter-type-label">Filter by Type</InputLabel>
                  <Select
                    labelId="filter-type-label"
                    value={filterType}
                    label="Filter by Type"
                    onChange={(e) => setFilterType(e.target.value)}
                    sx={{ height: 40 }}
                  >
                    <MenuItem value=""><em>All Types</em></MenuItem>
                    <MenuItem value="distributor">Distributor</MenuItem>
                    <MenuItem value="cnf">CNF</MenuItem>
                  </Select>
                </FormControl>
              </MDBox>

              <MDBox>
                {loadingList ? (
                  <MDBox p={4} textAlign="center">
                    <MDTypography variant="body2" color="text">Loading companies...</MDTypography>
                  </MDBox>
                ) : companies.length === 0 ? (
                  <MDBox p={4} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      No companies found. Add one above.
                    </MDTypography>
                  </MDBox>
                ) : (
                  <TableContainer sx={{ boxShadow: "none", backgroundColor: "transparent" }}>
                    <Table>
                      <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                        <TableRow>
                          <TableCell sx={{ ...tableHeadSx, width: "4%" }}>#</TableCell>
                          <TableCell sx={{ ...tableHeadSx, width: "12%" }}>Code</TableCell>
                          <TableCell sx={{ ...tableHeadSx, width: "14%" }}>Type</TableCell>
                          <TableCell sx={{ ...tableHeadSx, width: "22%" }}>Company Name</TableCell>
                          <TableCell sx={{ ...tableHeadSx }}>About</TableCell>
                          <TableCell sx={{ ...tableHeadSx, width: "12%", textAlign: "center" }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {companies.map((company, i) => (
                          <TableRow
                            key={company.id}
                            sx={{ backgroundColor: i % 2 !== 0 ? "#fafafa" : "inherit" }}
                          >
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", color: "#9ca3af" }}>
                              {i + 1}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#1d4ed8", fontFamily: "monospace" }}>
                              {company.code || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {typeChip(company.type)}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontWeight: 500 }}>
                              {company.name}
                            </TableCell>
                            <TableCell
                              sx={{
                                ...tableBodySx,
                                borderBottom: "1px solid #e5e7eb",
                                color: "#6b7280",
                                maxWidth: 240,
                              }}
                            >
                              {company.about
                                ? company.about.length > 100
                                  ? company.about.slice(0, 100) + "…"
                                  : company.about
                                : <span style={{ fontStyle: "italic", color: "#d1d5db" }}>—</span>}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", textAlign: "center" }}>
                              <MDBox display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                                <MDButton
                                  size="small"
                                  color="info"
                                  variant="text"
                                  onClick={() => openEditModal(company)}
                                  sx={{ minWidth: 0, p: 0.5 }}
                                  title="Edit company"
                                >
                                  <Icon sx={{ fontSize: "1.5rem !important" }}>edit</Icon>
                                </MDButton>
                                <MDButton
                                  size="small"
                                  color="error"
                                  variant="text"
                                  disabled={deletingId === company.id}
                                  onClick={() => handleDelete(company.id, company.name)}
                                  sx={{ minWidth: 0, p: 0.5 }}
                                  title="Delete company"
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

      <Dialog open={editModalOpen} onClose={closeEditModal} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          Edit Company
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1}>
            {editForm.code && (
              <MDBox mb={2}>
                <MDTypography variant="caption" color="text" display="block" mb={0.5}>
                  Company Code (auto-generated, read-only)
                </MDTypography>
                <MDTypography variant="body2" fontWeight="bold" sx={{ color: "#1d4ed8", fontFamily: "monospace" }}>
                  {editForm.code}
                </MDTypography>
              </MDBox>
            )}

            <Grid container spacing={2}>
              <Grid item xs={12} sm={5}>
                <FormControl fullWidth size="small">
                  <InputLabel id="edit-company-type-label">Company Type *</InputLabel>
                  <Select
                    labelId="edit-company-type-label"
                    value={editForm.type}
                    label="Company Type *"
                    onChange={(e) => handleEditChange("type", e.target.value)}
                    sx={{ minHeight: 44 }}
                  >
                    <MenuItem value="distributor">Distributor</MenuItem>
                    <MenuItem value="cnf">CNF</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={7}>
                <MDInput
                  label="Company Name *"
                  fullWidth
                  value={editForm.name}
                  onChange={(e) => handleEditChange("name", e.target.value)}
                />
              </Grid>

              <Grid item xs={12}>
                <MDInput
                  label={`About (optional, max ${MAX_WORDS} words)`}
                  fullWidth
                  multiline
                  rows={4}
                  value={editForm.about}
                  onChange={(e) => handleEditChange("about", e.target.value)}
                />
                <MDTypography
                  variant="caption"
                  sx={{
                    color: editWordsLeft < 20 ? "#ef4444" : "#6b7280",
                    display: "block",
                    textAlign: "right",
                    mt: 0.5,
                  }}
                >
                  {editWordCount} / {MAX_WORDS} words
                </MDTypography>
              </Grid>

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
            {savingEdit ? "Updating..." : "Update Company"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default AddCompany;
