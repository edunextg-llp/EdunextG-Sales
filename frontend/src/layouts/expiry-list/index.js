import { useEffect, useMemo, useState } from "react";
import { Autocomplete, Card, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  Grid, MenuItem, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from "@mui/material";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = "http://localhost:5001/api";
const emptyForm = () => ({ companyId: "", staffId: "", area: "", outletId: "", productSource: "fetched",
  productErpId: "", productName: "", expiryDate: "", qty: "", amount: "" });
const cellSx = { px: 1.5, py: 1.25, fontSize: "0.8125rem", whiteSpace: "nowrap" };
const headSx = { ...cellSx, fontWeight: 700, color: "#475569", backgroundColor: "#f8fafc" };
const chooseSx = {
  height: 44,
  backgroundColor: "#fff",
  "& .MuiSelect-select": { display: "flex", alignItems: "center", minHeight: "44px !important", boxSizing: "border-box" },
};
const productInputSx = { "& .MuiInputBase-root": { height: 44, minHeight: 44, paddingTop: "0 !important", paddingBottom: "0 !important" } };
const formatDate = (value) => value ? String(value).slice(0, 10).split("-").reverse().join("-") : "—";

export default function ExpiryList() {
  const [records, setRecords] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [staff, setStaff] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRecords = async () => {
    const response = await fetch(`${API}/staff/expiry-list`);
    if (response.ok) setRecords(await response.json());
  };
  useEffect(() => {
    loadRecords();
    fetch(`${API}/staff/companies`).then((r) => r.ok ? r.json() : []).then((data) => setCompanies(Array.isArray(data) ? data : []));
  }, []);

  const changeCompany = async (companyId) => {
    setForm((old) => ({ ...old, companyId, staffId: "", area: "", outletId: "", productErpId: "", productName: "" }));
    setOutlets([]); setProducts([]);
    if (!companyId) return setStaff([]);
    const [staffResponse, productResponse] = await Promise.all([
      fetch(`${API}/staff?companyId=${companyId}`),
      fetch(`${API}/staff/dms-stock/product-search?companyId=${companyId}&search=`),
    ]);
    setStaff(staffResponse.ok ? await staffResponse.json() : []);
    const productData = productResponse.ok ? await productResponse.json() : {};
    setProducts(productData.products || []);
  };
  const changeStaff = async (staffId) => {
    setForm((old) => ({ ...old, staffId, area: "", outletId: "" }));
    if (!staffId) return setOutlets([]);
    const response = await fetch(`${API}/staff/${staffId}/all-counters`);
    setOutlets(response.ok ? await response.json() : []);
  };
  const areas = useMemo(() => [...new Set(outlets.map((o) => o.location_name).filter(Boolean))].sort(), [outlets]);
  const areaOutlets = useMemo(() => outlets.filter((o) => o.location_name === form.area), [outlets, form.area]);

  const save = async () => {
    if (!form.companyId || !form.staffId || !form.area || !form.outletId || !form.productName.trim() || !form.expiryDate || !form.qty || form.amount === "") {
      alert("Please complete company, staff, area, outlet, product, expiry date, quantity, and amount."); return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API}/staff/expiry-list`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, companyId: Number(form.companyId), staffId: Number(form.staffId),
          outletId: Number(form.outletId), qty: Number(form.qty), amount: Number(form.amount) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return alert(data.error || "Unable to save expiry item.");
      setOpen(false); setForm(emptyForm()); setStaff([]); setOutlets([]); setProducts([]); await loadRecords();
    } finally { setSaving(false); }
  };

  return <DashboardLayout><DashboardNavbar /><MDBox pt={6} pb={3}><Card>
    <MDBox p={3} display="flex" justifyContent="space-between" alignItems="center">
      <MDBox><MDTypography variant="h5">Expiry List</MDTypography><MDTypography variant="caption" color="text">Outlet-wise product expiry records.</MDTypography></MDBox>
      <MDButton color="info" variant="gradient" onClick={() => setOpen(true)}>Add Expiry</MDButton>
    </MDBox><MDBox px={3} pb={3}><TableContainer component={Paper} sx={{ border: "1px solid #e5e7eb" }}><Table size="small">
      <TableHead sx={{ display: "table-header-group" }}><TableRow>{["Company", "Staff", "Area", "Outlet", "ERP ID", "Product", "Expiry Date", "Qty", "Amount"].map((h) => <TableCell key={h} sx={headSx}>{h}</TableCell>)}</TableRow></TableHead>
      <TableBody>{records.map((r) => <TableRow key={r.id}><TableCell sx={cellSx}>{r.company_name}</TableCell><TableCell sx={cellSx}>{r.staff_name}</TableCell><TableCell sx={cellSx}>{r.location_name}</TableCell><TableCell sx={cellSx}>{r.outlet_name}</TableCell><TableCell sx={cellSx}>{r.product_erp_id || "Manual"}</TableCell><TableCell sx={cellSx}>{r.product_name}</TableCell><TableCell sx={cellSx}>{formatDate(r.expiry_date)}</TableCell><TableCell sx={cellSx}>{Number(r.qty)}</TableCell><TableCell sx={cellSx}>₹{Number(r.amount).toFixed(2)}</TableCell></TableRow>)}
        {!records.length && <TableRow><TableCell colSpan={9} align="center" sx={cellSx}>No expiry records added yet.</TableCell></TableRow>}</TableBody>
    </Table></TableContainer></MDBox></Card></MDBox>
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="md"><DialogTitle>Add Expiry</DialogTitle><DialogContent dividers><Grid container spacing={2}>
      <Grid item xs={12} md={6}><FormControl fullWidth size="small"><Select sx={chooseSx} displayEmpty value={form.companyId} onChange={(e) => changeCompany(e.target.value)}><MenuItem value="" disabled>Choose Company *</MenuItem>{companies.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12} md={6}><FormControl fullWidth size="small"><Select sx={chooseSx} displayEmpty disabled={!form.companyId} value={form.staffId} onChange={(e) => changeStaff(e.target.value)}><MenuItem value="" disabled>Choose Staff *</MenuItem>{staff.map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12} md={6}><FormControl fullWidth size="small"><Select sx={chooseSx} displayEmpty disabled={!form.staffId} value={form.area} onChange={(e) => setForm((o) => ({ ...o, area: e.target.value, outletId: "" }))}><MenuItem value="" disabled>Choose Area *</MenuItem>{areas.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12} md={6}><FormControl fullWidth size="small"><Select sx={chooseSx} displayEmpty disabled={!form.area} value={form.outletId} onChange={(e) => setForm((o) => ({ ...o, outletId: e.target.value }))}><MenuItem value="" disabled>Choose Outlet *</MenuItem>{areaOutlets.map((o) => <MenuItem key={o.id} value={String(o.id)}>{o.outlet_name}{o.outlet_erp_id ? ` — ${o.outlet_erp_id}` : ""}</MenuItem>)}</Select></FormControl></Grid>
      <Grid item xs={12} md={4}><FormControl fullWidth size="small"><Select sx={chooseSx} value={form.productSource} onChange={(e) => setForm((o) => ({ ...o, productSource: e.target.value, productErpId: "", productName: "" }))}><MenuItem value="fetched">Fetch Product</MenuItem><MenuItem value="manual">Manual Entry</MenuItem></Select></FormControl></Grid>
      <Grid item xs={12} md={8}>{form.productSource === "manual" ? <MDInput sx={productInputSx} label="Product Name *" fullWidth value={form.productName} onChange={(e) => setForm((o) => ({ ...o, productName: e.target.value }))} /> : <Autocomplete sx={productInputSx} size="small" options={products} getOptionLabel={(p) => `${p.product_name || ""}${p.product_erp_id ? ` — ${p.product_erp_id}` : ""}`} onChange={(_, p) => setForm((o) => ({ ...o, productName: p?.product_name || "", productErpId: p?.product_erp_id || "" }))} renderInput={(params) => <MDInput {...params} label="Choose Product *" />} />}</Grid>
      <Grid item xs={12} md={4}><MDInput type="date" label="Expiry Date *" fullWidth InputLabelProps={{ shrink: true }} value={form.expiryDate} onChange={(e) => setForm((o) => ({ ...o, expiryDate: e.target.value }))} /></Grid>
      <Grid item xs={12} md={4}><MDInput type="number" label="Qty *" fullWidth inputProps={{ min: 0.01, step: "any" }} value={form.qty} onChange={(e) => setForm((o) => ({ ...o, qty: e.target.value }))} /></Grid>
      <Grid item xs={12} md={4}><MDInput type="number" label="Amount *" fullWidth inputProps={{ min: 0, step: "0.01" }} value={form.amount} onChange={(e) => setForm((o) => ({ ...o, amount: e.target.value }))} /></Grid>
    </Grid></DialogContent><DialogActions><MDButton color="dark" variant="outlined" onClick={() => setOpen(false)} disabled={saving}>Cancel</MDButton><MDButton color="info" variant="gradient" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Expiry"}</MDButton></DialogActions></Dialog>
    <Footer /></DashboardLayout>;
}
