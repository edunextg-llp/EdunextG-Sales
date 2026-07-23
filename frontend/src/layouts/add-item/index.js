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

const API = "https://bawarchee.edunextg.co/api";

const emptyForm = () => ({
  productErpId: "",
  skuName: "",
  variantName: "",
  hsnCode: "",
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

function AddItem() {
  const [companies, setCompanies] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm());
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
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

  const fetchItems = useCallback(async (companyId, sellerId) => {
    if (!companyId || !sellerId) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    try {
      const params = new URLSearchParams({
        companyId: String(companyId),
        sellerId: String(sellerId),
      });
      const res = await fetch(`${API}/staff/seller-items?${params.toString()}`, {
        headers: authHeaders,
      });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    setSelectedSellerId("");
    setForm(emptyForm());
    setError("");
    setSuccess("");
    fetchSellers(selectedCompanyId);
  }, [selectedCompanyId, fetchSellers]);

  useEffect(() => {
    setForm(emptyForm());
    setError("");
    setSuccess("");
    fetchItems(selectedCompanyId, selectedSellerId);
  }, [selectedCompanyId, selectedSellerId, fetchItems]);

  const handleChange = (field, value) => {
    setError("");
    setSuccess("");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field, value) => {
    setEditError("");
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (data) => {
    if (!selectedCompanyId) return "Please choose a company first.";
    if (!selectedSellerId) return "Please choose a seller.";
    if (!data.productErpId.trim()) return "Product ERP ID is required.";
    if (!data.skuName.trim()) return "SKU Name is required.";
    return "";
  };

  const buildPayload = (data) => ({
    companyId: Number(selectedCompanyId),
    sellerId: Number(selectedSellerId),
    productErpId: data.productErpId.trim(),
    skuName: data.skuName.trim(),
    variantName: data.variantName.trim(),
    hsnCode: data.hsnCode.trim().toUpperCase(),
  });

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
      const res = await fetch(`${API}/staff/seller-items`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add item.");
      } else {
        setSuccess(`Item "${form.productErpId.trim()}" added successfully.`);
        setForm(emptyForm());
        fetchItems(selectedCompanyId, selectedSellerId);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (item) => {
    setEditingId(item.id);
    setEditForm({
      productErpId: item.product_erp_id || "",
      skuName: item.sku_name || "",
      variantName: item.variant_name || "",
      hsnCode: item.hsn_code || "",
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
      const res = await fetch(`${API}/staff/seller-items/${editingId}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify(buildPayload(editForm)),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Failed to update item.");
      } else {
        closeEditModal();
        setSuccess(`Item "${editForm.productErpId.trim() || editForm.skuName.trim()}" updated successfully.`);
        fetchItems(selectedCompanyId, selectedSellerId);
      }
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete item "${item.product_erp_id}"?`)) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(`${API}/staff/seller-items/${item.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((prev) => prev.filter((row) => row.id !== item.id));
        if (editingId === item.id) closeEditModal();
        setSuccess(`Item "${item.product_erp_id}" deleted.`);
      } else {
        alert(data.error || "Failed to delete item.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const selectedCompany = companies.find((c) => String(c.id) === String(selectedCompanyId));
  const selectedSeller = sellers.find((s) => String(s.id) === String(selectedSellerId));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12} lg={10}>
            <Card sx={{ boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
              <MDBox p={3} pb={2} borderBottom="1px solid #e5e7eb">
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Add Item
                </MDTypography>
                <MDTypography variant="body2" color="text" mt={0.5}>
                  Choose company, then seller, then add product items linked to that seller.
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

                  <Grid item xs={12} md={4}>
                    <FormControl fullWidth size="small" required disabled={!selectedCompanyId || loadingSellers}>
                      <InputLabel id="seller-select-label">Seller *</InputLabel>
                      <Select
                        labelId="seller-select-label"
                        value={selectedSellerId}
                        label="Seller *"
                        onChange={(e) => setSelectedSellerId(e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                      >
                        <MenuItem value="">
                          <em>Select Seller</em>
                        </MenuItem>
                        {sellers.map((seller) => (
                          <MenuItem key={seller.id} value={String(seller.id)}>
                            {seller.seller_name}
                            {seller.seller_code ? ` (${seller.seller_code})` : ""}
                          </MenuItem>
                        ))}
                        {selectedCompanyId && !loadingSellers && sellers.length === 0 && (
                          <MenuItem disabled>No sellers found for this company</MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  </Grid>

                  {selectedSeller && (
                    <Grid item xs={12} md={4} display="flex" alignItems="center">
                      <Chip
                        icon={<Icon sx={{ fontSize: "16px !important" }}>inventory_2</Icon>}
                        label={`${selectedSeller.seller_code || "Seller"} · ${selectedSeller.seller_name}`}
                        color="info"
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                      />
                    </Grid>
                  )}

                  {selectedSellerId && (
                    <>
                      <Grid item xs={12}>
                        <MDTypography variant="button" fontWeight="medium" color="dark">
                          Item Details
                        </MDTypography>
                      </Grid>

                      <Grid item xs={12} md={3}>
                        <MDInput
                          label="Product ERP ID *"
                          fullWidth
                          value={form.productErpId}
                          onChange={(e) => handleChange("productErpId", e.target.value)}
                        />
                      </Grid>

                      <Grid item xs={12} md={3}>
                        <MDInput
                          label="SKU Name *"
                          fullWidth
                          value={form.skuName}
                          onChange={(e) => handleChange("skuName", e.target.value)}
                        />
                      </Grid>

                      <Grid item xs={12} md={3}>
                        <MDInput
                          label="Variant Name"
                          fullWidth
                          value={form.variantName}
                          onChange={(e) => handleChange("variantName", e.target.value)}
                        />
                      </Grid>

                      <Grid item xs={12} md={3}>
                        <MDInput
                          label="HSN Code"
                          fullWidth
                          value={form.hsnCode}
                          onChange={(e) => handleChange("hsnCode", e.target.value.toUpperCase())}
                        />
                      </Grid>
                    </>
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

                  {selectedSellerId && (
                    <Grid item xs={12} display="flex" justifyContent="flex-end">
                      <MDButton
                        variant="gradient"
                        color="info"
                        disabled={saving}
                        onClick={handleSubmit}
                        startIcon={<Icon>add</Icon>}
                      >
                        {saving ? "Saving..." : "Add Item"}
                      </MDButton>
                    </Grid>
                  )}
                </Grid>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} lg={10}>
            <Card sx={{ boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}>
              <MDBox p={3} pb={2} borderBottom="1px solid #e5e7eb">
                <MDTypography variant="h6" fontWeight="medium" color="dark">
                  Items
                  {selectedCompany && selectedSeller && (
                    <MDTypography component="span" variant="body2" color="text" sx={{ ml: 1 }}>
                      for {selectedCompany.name} · {selectedSeller.seller_name}
                    </MDTypography>
                  )}
                </MDTypography>
              </MDBox>

              <MDBox>
                {!selectedCompanyId || !selectedSellerId ? (
                  <MDBox p={4} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      Select a company and seller to view and manage items.
                    </MDTypography>
                  </MDBox>
                ) : loadingItems ? (
                  <MDBox p={4} textAlign="center">
                    <MDTypography variant="body2" color="text">Loading items...</MDTypography>
                  </MDBox>
                ) : items.length === 0 ? (
                  <MDBox p={4} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      No items found for this seller. Add one above.
                    </MDTypography>
                  </MDBox>
                ) : (
                  <TableContainer sx={{ boxShadow: "none", backgroundColor: "transparent" }}>
                    <Table>
                      <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                        <TableRow>
                          <TableCell sx={tableHeadSx}>#</TableCell>
                          <TableCell sx={tableHeadSx}>Product ERP ID</TableCell>
                          <TableCell sx={tableHeadSx}>SKU Name</TableCell>
                          <TableCell sx={tableHeadSx}>Variant Name</TableCell>
                          <TableCell sx={tableHeadSx}>HSN Code</TableCell>
                          <TableCell sx={{ ...tableHeadSx, textAlign: "center" }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {items.map((item, index) => (
                          <TableRow
                            key={item.id}
                            sx={{ backgroundColor: index % 2 !== 0 ? "#fafafa" : "inherit" }}
                          >
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", color: "#9ca3af" }}>
                              {index + 1}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontWeight: 600, fontFamily: "monospace" }}>
                              {item.product_erp_id}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {item.sku_name}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {item.variant_name || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                              {item.hsn_code || "—"}
                            </TableCell>
                            <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", textAlign: "center" }}>
                              <MDBox display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                                <MDButton
                                  size="small"
                                  color="info"
                                  variant="text"
                                  onClick={() => openEditModal(item)}
                                  sx={{ minWidth: 0, p: 0.5 }}
                                  title="Edit item"
                                >
                                  <Icon sx={{ fontSize: "1.5rem !important" }}>edit</Icon>
                                </MDButton>
                                <MDButton
                                  size="small"
                                  color="error"
                                  variant="text"
                                  disabled={deletingId === item.id}
                                  onClick={() => handleDelete(item)}
                                  sx={{ minWidth: 0, p: 0.5 }}
                                  title="Delete item"
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
          Edit Item
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <MDInput
                  label="Product ERP ID *"
                  fullWidth
                  value={editForm.productErpId}
                  onChange={(e) => handleEditChange("productErpId", e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <MDInput
                  label="SKU Name *"
                  fullWidth
                  value={editForm.skuName}
                  onChange={(e) => handleEditChange("skuName", e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <MDInput
                  label="Variant Name"
                  fullWidth
                  value={editForm.variantName}
                  onChange={(e) => handleEditChange("variantName", e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <MDInput
                  label="HSN Code"
                  fullWidth
                  value={editForm.hsnCode}
                  onChange={(e) => handleEditChange("hsnCode", e.target.value.toUpperCase())}
                />
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
            {savingEdit ? "Updating..." : "Update Item"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default AddItem;
