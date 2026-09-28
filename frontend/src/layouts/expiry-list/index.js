import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Autocomplete, Card, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  Grid, MenuItem, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from "@mui/material";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = "https://bawarchee.edunextg.co/api";
const emptyForm = () => ({ companyId: "", sellerId: "", staffId: "", area: "", outletId: "", productSource: "fetched",
  productErpId: "", productName: "", invoiceNumber: "", batchNumber: "", expiryDate: "", damageDescription: "", qty: "", amount: "" });
const cellSx = { px: 1.5, py: 1.25, fontSize: "0.8125rem", whiteSpace: "nowrap" };
const headSx = { ...cellSx, fontWeight: 700, color: "#475569", backgroundColor: "#f8fafc" };
const chooseSx = {
  height: 44,
  backgroundColor: "#fff",
  "& .MuiSelect-select": { display: "flex", alignItems: "center", minHeight: "44px !important", boxSizing: "border-box" },
};
const productInputSx = { "& .MuiInputBase-root": { height: 44, minHeight: 44, paddingTop: "0 !important", paddingBottom: "0 !important" } };
const formatDate = (value) => value ? String(value).slice(0, 10).split("-").reverse().join("-") : "—";

export default function ExpiryList({ mode = "expiry" }) {
  const isDamage = mode === "damage";
  const listPath = isDamage ? "damage-list" : "expiry-list";
  const [records, setRecords] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const loadRecords = useCallback(async () => {
    const response = await fetch(`${API}/staff/${listPath}`);
    if (response.ok) setRecords(await response.json());
  }, [listPath]);
  useEffect(() => {
    loadRecords();
    fetch(`${API}/staff/companies`).then((r) => r.ok ? r.json() : []).then((data) => setCompanies(Array.isArray(data) ? data : []));
  }, [loadRecords]);

  const changeCompany = async (companyId) => {
    setForm((old) => ({ ...old, companyId, sellerId: "", staffId: "", area: "", outletId: "", productErpId: "", productName: "" }));
    setOutlets([]); setProducts([]); setSellers([]);
    if (!companyId) return setStaff([]);
    const [staffResponse, productResponse, sellerResponse] = await Promise.all([
      fetch(`${API}/staff?companyId=${companyId}`),
      fetch(`${API}/staff/dms-stock/product-search?companyId=${companyId}&search=`),
      fetch(`${API}/staff/purchase-sellers/company/${companyId}`),
    ]);
    setStaff(staffResponse.ok ? await staffResponse.json() : []);
    const productData = productResponse.ok ? await productResponse.json() : {};
    setProducts(productData.products || []);
    setSellers(sellerResponse.ok ? await sellerResponse.json() : []);
  };
  const changeStaff = async (staffId) => {
    setForm((old) => ({ ...old, staffId, area: "", outletId: "" }));
    if (!staffId) return setOutlets([]);
    const response = await fetch(`${API}/staff/${staffId}/all-counters`);
    setOutlets(response.ok ? await response.json() : []);
  };
  const areas = useMemo(() => [...new Set(outlets.map((o) => o.location_name).filter(Boolean))].sort(), [outlets]);
  const areaOutlets = useMemo(() => outlets.filter((o) => o.location_name === form.area), [outlets, form.area]);

  const editRecord = async (record) => {
    const [staffResponse, sellerResponse, outletResponse, productResponse] = await Promise.all([
      fetch(`${API}/staff?companyId=${record.company_id}`),
      fetch(`${API}/staff/purchase-sellers/company/${record.company_id}`),
      fetch(`${API}/staff/${record.staff_id}/all-counters`),
      fetch(`${API}/staff/dms-stock/product-search?companyId=${record.company_id}&search=`),
    ]);
    setStaff(staffResponse.ok ? await staffResponse.json() : []);
    setSellers(sellerResponse.ok ? await sellerResponse.json() : []);
    setOutlets(outletResponse.ok ? await outletResponse.json() : []);
    const productData = productResponse.ok ? await productResponse.json() : {};
    setProducts(productData.products || []);
    setForm({ companyId: String(record.company_id), sellerId: String(record.seller_id), staffId: String(record.staff_id),
      area: record.location_name || "", outletId: String(record.outlet_id), productSource: record.product_source || "manual",
      productErpId: record.product_erp_id || "", productName: record.product_name || "",
      invoiceNumber: record.invoice_number || "", batchNumber: record.batch_number || "",
      expiryDate: record.expiry_date || "", damageDescription: record.damage_description || "",
      qty: String(record.qty || ""), amount: String(record.amount ?? "") });
    setEditingId(record.id);
    setOpen(true);
  };

  const save = async () => {
    const issueDetailMissing = isDamage ? !form.damageDescription.trim() : !form.expiryDate;
    if (!form.companyId || !form.sellerId || !form.staffId || !form.area || !form.outletId || !form.productName.trim() || !form.invoiceNumber.trim() || !form.batchNumber.trim() || issueDetailMissing || !form.qty || form.amount === "") {
      alert("Please complete all required fields, including invoice and batch number."); return;
    }
    setSaving(true);
    try {
      const response = await fetch(editingId ? `${API}/staff/${listPath}/${editingId}` : `${API}/staff/${listPath}`, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, companyId: Number(form.companyId), staffId: Number(form.staffId),
          sellerId: Number(form.sellerId), outletId: Number(form.outletId), qty: Number(form.qty), amount: Number(form.amount) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return alert(data.error || "Unable to save expiry item.");
      setOpen(false); setEditingId(null); setForm(emptyForm()); setStaff([]); setOutlets([]); setProducts([]); await loadRecords();
    } finally { setSaving(false); }
  };

  return <DashboardLayout><DashboardNavbar /><MDBox pt={6} pb={3}><Card>
    <MDBox p={3} display="flex" justifyContent="space-between" alignItems="center">
      <MDBox><MDTypography variant="h5">{isDamage ? "Damage List" : "Expiry List"}</MDTypography><MDTypography variant="caption" color="text">Outlet-wise product {isDamage ? "damage" : "expiry"} records.</MDTypography></MDBox>
      <MDButton color="info" variant="gradient" onClick={() => { setEditingId(null); setForm(emptyForm()); setOpen(true); }}>Add {isDamage ? "Damage" : "Expiry"}</MDButton>
    </MDBox><MDBox px={3} pb={3}><TableContainer component={Paper} sx={{ border: "1px solid #e5e7eb" }}><Table size="small">
      <TableHead sx={{ display: "table-header-group" }}><TableRow>{["Company", "Seller", "Staff", "Area", "Outlet", "Invoice No", "ERP ID", "Product", "Batch No", isDamage ? "Damage Description" : "Expiry Date", "Qty", "Amount", "Action"].map((h) => <TableCell key={h} sx={headSx}>{h}</TableCell>)}</TableRow></TableHead>
      <TableBody>{records.map((r) => <TableRow key={r.id}><TableCell sx={cellSx}>{r.company_name}</TableCell><TableCell sx={cellSx}>{r.seller_name}</TableCell><TableCell sx={cellSx}>{r.staff_name}</TableCell><TableCell sx={cellSx}>{r.location_name}</TableCell><TableCell sx={cellSx}>{r.outlet_name}</TableCell><TableCell sx={cellSx}>{r.invoice_number}</TableCell><TableCell sx={cellSx}>{r.product_erp_id || "Manual"}</TableCell><TableCell sx={cellSx}>{r.product_name}</TableCell><TableCell sx={cellSx}>{r.batch_number}</TableCell><TableCell sx={{ ...cellSx, whiteSpace: isDamage ? "normal" : "nowrap", minWidth: isDamage ? 180 : undefined }}>{isDamage ? r.damage_description : formatDate(r.expiry_date)}</TableCell><TableCell sx={cellSx}>{Number(r.qty)}</TableCell><TableCell sx={cellSx}>₹{Number(r.amount).toFixed(2)}</TableCell><TableCell sx={cellSx}><MDButton size="small" color="info" variant="outlined" onClick={() => editRecord(r)}>Edit</MDButton></TableCell></TableRow>)}
        {!records.length && <TableRow><TableCell colSpan={13} align="center" sx={cellSx}>No expiry records added yet.</TableCell></TableRow>}</TableBody>
    </Table></TableContainer></MDBox></Card></MDBox>
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="md"><DialogTitle>{editingId ? "Edit" : "Add"} {isDamage ? "Damage" : "Expiry"}</DialogTitle><DialogContent dividers><Grid container spacing={2}>
      <Grid item xs={12} md={6}><FormControl fullWidth size="small"><Select sx={chooseSx} displayEmpty value={form.companyId} onChange={(e) => changeCompany(e.target.value)}><MenuItem value="" disabled>Choose Company *</MenuItem>{companies.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12} md={6}><FormControl fullWidth size="small"><Select sx={chooseSx} displayEmpty disabled={!form.companyId} value={form.sellerId} onChange={(e) => setForm((old) => ({ ...old, sellerId: e.target.value }))}><MenuItem value="" disabled>Choose Seller *</MenuItem>{sellers.map((seller) => <MenuItem key={seller.id} value={String(seller.id)}>{seller.seller_name}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12} md={6}><FormControl fullWidth size="small"><Select sx={chooseSx} displayEmpty disabled={!form.companyId} value={form.staffId} onChange={(e) => changeStaff(e.target.value)}><MenuItem value="" disabled>Choose Staff *</MenuItem>{staff.map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12} md={6}><FormControl fullWidth size="small"><Select sx={chooseSx} displayEmpty disabled={!form.staffId} value={form.area} onChange={(e) => setForm((o) => ({ ...o, area: e.target.value, outletId: "" }))}><MenuItem value="" disabled>Choose Area *</MenuItem>{areas.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12} md={6}>
        <Autocomplete
          sx={productInputSx}
          size="small"
          disabled={!form.area}
          options={areaOutlets}
          value={areaOutlets.find((outlet) => String(outlet.id) === String(form.outletId)) || null}
          getOptionLabel={(outlet) => `${outlet.outlet_name || ""}${outlet.outlet_erp_id ? ` — ${outlet.outlet_erp_id}` : ""}`}
          isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
          onChange={(_, outlet) => setForm((old) => ({ ...old, outletId: outlet ? String(outlet.id) : "" }))}
          renderInput={(params) => <MDInput {...params} label="Search Outlet *" placeholder="Type outlet name or ERP ID" />}
        />
      </Grid>
      <Grid item xs={12} md={4}><FormControl fullWidth size="small"><Select sx={chooseSx} value={form.productSource} onChange={(e) => setForm((o) => ({ ...o, productSource: e.target.value, productErpId: "", productName: "" }))}><MenuItem value="fetched">Fetch Product</MenuItem><MenuItem value="manual">Manual Entry</MenuItem></Select></FormControl></Grid>
      <Grid item xs={12} md={8}>{form.productSource === "manual" ? <MDInput sx={productInputSx} label="Product Name *" fullWidth value={form.productName} onChange={(e) => setForm((o) => ({ ...o, productName: e.target.value }))} /> : <Autocomplete sx={productInputSx} size="small" options={products} value={products.find((p) => String(p.product_erp_id) === String(form.productErpId)) || null} getOptionLabel={(p) => `${p.product_name || ""}${p.product_erp_id ? ` — ${p.product_erp_id}` : ""}`} isOptionEqualToValue={(option, value) => String(option.product_erp_id) === String(value.product_erp_id)} onChange={(_, p) => setForm((o) => ({ ...o, productName: p?.product_name || "", productErpId: p?.product_erp_id || "" }))} renderInput={(params) => <MDInput {...params} label="Choose Product *" />} />}</Grid>
      <Grid item xs={12} md={6}><MDInput label="Invoice Number *" fullWidth value={form.invoiceNumber} onChange={(e) => setForm((o) => ({ ...o, invoiceNumber: e.target.value }))} /></Grid>
      <Grid item xs={12} md={6}><MDInput label="Batch Number *" fullWidth value={form.batchNumber} onChange={(e) => setForm((o) => ({ ...o, batchNumber: e.target.value }))} /></Grid>
      {isDamage ? <Grid item xs={12}><MDInput label="Damage Description *" fullWidth multiline rows={3} value={form.damageDescription} onChange={(e) => setForm((o) => ({ ...o, damageDescription: e.target.value }))} /></Grid> : <Grid item xs={12} md={4}><MDInput type="date" label="Expiry Date *" fullWidth InputLabelProps={{ shrink: true }} value={form.expiryDate} onChange={(e) => setForm((o) => ({ ...o, expiryDate: e.target.value }))} /></Grid>}
      <Grid item xs={12} md={isDamage ? 6 : 4}><MDInput type="number" label="Qty *" fullWidth inputProps={{ min: 0.01, step: "any" }} value={form.qty} onChange={(e) => setForm((o) => ({ ...o, qty: e.target.value }))} /></Grid>
      <Grid item xs={12} md={isDamage ? 6 : 4}><MDInput type="number" label="Amount *" fullWidth inputProps={{ min: 0, step: "0.01" }} value={form.amount} onChange={(e) => setForm((o) => ({ ...o, amount: e.target.value }))} /></Grid>
    </Grid></DialogContent><DialogActions><MDButton color="dark" variant="outlined" onClick={() => { setOpen(false); setEditingId(null); }} disabled={saving}>Cancel</MDButton><MDButton color="info" variant="gradient" onClick={save} disabled={saving}>{saving ? "Saving..." : `${editingId ? "Update" : "Save"} ${isDamage ? "Damage" : "Expiry"}`}</MDButton></DialogActions></Dialog>
    <Footer /></DashboardLayout>;
}

ExpiryList.propTypes = { mode: PropTypes.oneOf(["expiry", "damage"]) };
