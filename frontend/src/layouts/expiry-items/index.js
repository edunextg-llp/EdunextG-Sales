import { useEffect, useMemo, useState } from "react";

import Card from "@mui/material/Card";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

import MDBox from "components/MDBox";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = "https://bawarchee.edunextg.co/api";
const dayMs = 86400000;
const cellSx = { px: 1.5, py: 1, whiteSpace: "nowrap", fontSize: "0.75rem" };
const headSx = { ...cellSx, fontWeight: 700, backgroundColor: "#dbeafe", color: "#334155" };

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

const number = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const expiryDetails = (value) => {
  const expiry = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / dayMs);
  if (days < 0) return { days, label: "Expired", color: "#991b1b", bg: "#fee2e2" };
  if (days <= 30) return { days, label: "Expiring ≤30 Days", color: "#9a3412", bg: "#ffedd5" };
  if (days <= 90) return { days, label: "Expiring ≤90 Days", color: "#854d0e", bg: "#fef9c3" };
  return { days, label: "Valid", color: "#166534", bg: "#dcfce7" };
};

function ExpiryItems() {
  const [imports, setImports] = useState([]);
  const [selectedImportId, setSelectedImportId] = useState("");
  const [stockImport, setStockImport] = useState(null);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/staff/dms-stock/imports`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Unable to load DMS uploads.");
        setImports(data.imports || []);
      })
      .catch((fetchError) => setError(fetchError.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const query = selectedImportId ? `?importId=${selectedImportId}` : "";
    fetch(`${API}/staff/dms-stock${query}`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Unable to load expiry items.");
        setStockImport(data.import || null);
        setItems(data.items || []);
      })
      .catch((fetchError) => setError(fetchError.message))
      .finally(() => setLoading(false));
  }, [selectedImportId]);

  const expiryItems = useMemo(() => items
    .filter((item) => item.expiry_date)
    .map((item) => ({ ...item, expiry: expiryDetails(item.expiry_date) }))
    .filter((item) => {
      const query = search.trim().toLowerCase();
      const matchesSearch = !query || [item.product_erp_id, item.product_name, item.batch_number]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = status === "all"
        || (status === "expired" && item.expiry.days < 0)
        || (status === "30" && item.expiry.days >= 0 && item.expiry.days <= 30)
        || (status === "90" && item.expiry.days > 30 && item.expiry.days <= 90)
        || (status === "valid" && item.expiry.days > 90);
      return matchesSearch && matchesStatus;
    })
    .sort((left, right) => String(left.expiry_date).localeCompare(String(right.expiry_date))), [items, search, status]);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h5" fontWeight="medium" color="dark">Expiry Items</MDTypography>
                <MDTypography variant="caption" color="text">
                  Monitor expired and upcoming-expiry stock from each DMS upload.
                </MDTypography>
              </MDBox>
              <MDBox px={3} pb={3}>
                <Grid container spacing={2} mb={2} alignItems="center">
                  <Grid item xs={12} md={4}>
                    <FormControl size="small" fullWidth>
                      <Select displayEmpty value={selectedImportId} onChange={(event) => setSelectedImportId(event.target.value)} sx={{ height: 44, backgroundColor: "#fff" }}>
                        <MenuItem value="">Latest DMS Upload</MenuItem>
                        {imports.map((entry) => (
                          <MenuItem key={entry.id} value={String(entry.id)}>
                            {formatDate(entry.upload_date)}{entry.company_name ? ` — ${entry.company_name}` : ""}{entry.invoice_number ? ` — Inv: ${entry.invoice_number}` : ""}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}><MDInput label="Search product, ERP or batch" fullWidth value={search} onChange={(event) => setSearch(event.target.value)} /></Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl size="small" fullWidth>
                      <Select value={status} onChange={(event) => setStatus(event.target.value)} sx={{ height: 44, backgroundColor: "#fff" }}>
                        <MenuItem value="all">All Expiry Statuses</MenuItem>
                        <MenuItem value="expired">Expired</MenuItem>
                        <MenuItem value="30">Expiring Within 30 Days</MenuItem>
                        <MenuItem value="90">Expiring Within 90 Days</MenuItem>
                        <MenuItem value="valid">Valid Over 90 Days</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                {stockImport && <MDTypography variant="caption" color="text" display="block" mb={1}>DMS upload: {formatDate(stockImport.upload_date || stockImport.created_at)}{stockImport.company_name ? ` — ${stockImport.company_name}` : ""}</MDTypography>}
                {error && <MDTypography color="error" variant="button">{error}</MDTypography>}
                {loading && <LinearProgress color="info" sx={{ mb: 2 }} />}
                <TableContainer component={Paper} sx={{ maxHeight: "68vh", border: "1px solid #e5e7eb" }}>
                  <Table size="small" stickyHeader sx={{ minWidth: 1150 }}>
                    <TableHead sx={{ display: "table-header-group" }}><TableRow>{["Sr No", "ERP ID", "SKU Name", "Company", "Variant", "Batch", "MFG Date", "Expiry Date", "Days Remaining", "Status", "Current Stock"].map((heading) => <TableCell key={heading} align={["Days Remaining", "Current Stock"].includes(heading) ? "right" : "left"} sx={headSx}>{heading}</TableCell>)}</TableRow></TableHead>
                    <TableBody>
                      {!loading && expiryItems.length === 0 && <TableRow><TableCell colSpan={11} align="center" sx={cellSx}>No expiry items match the selected filters.</TableCell></TableRow>}
                      {expiryItems.map((item, index) => (
                        <TableRow key={item.id} hover>
                          <TableCell sx={cellSx}>{index + 1}</TableCell><TableCell sx={cellSx}>{item.product_erp_id}</TableCell><TableCell sx={{ ...cellSx, minWidth: 200 }}>{item.product_name}</TableCell><TableCell sx={cellSx}>{item.company_name || stockImport?.company_name || item.product_division || "N/A"}</TableCell><TableCell sx={cellSx}>{item.variant_name || "—"}</TableCell><TableCell sx={cellSx}>{item.batch_number || "—"}</TableCell><TableCell sx={cellSx}>{formatDate(item.mfg_date)}</TableCell><TableCell sx={{ ...cellSx, fontWeight: 700 }}>{formatDate(item.expiry_date)}</TableCell><TableCell align="right" sx={cellSx}>{item.expiry.days < 0 ? `${Math.abs(item.expiry.days)} days ago` : `${item.expiry.days} days`}</TableCell>
                          <TableCell sx={cellSx}><MDBox component="span" px={1} py={0.5} sx={{ display: "inline-block", borderRadius: 1, color: item.expiry.color, backgroundColor: item.expiry.bg, fontSize: "0.7rem", fontWeight: 700 }}>{item.expiry.label}</MDBox></TableCell><TableCell align="right" sx={{ ...cellSx, fontWeight: 700 }}>{number(item.total_current_stock_in_pcs)}</TableCell>
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

export default ExpiryItems;
