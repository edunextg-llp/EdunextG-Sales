import { useEffect, useMemo, useRef, useState } from "react";

import Card from "@mui/material/Card";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
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
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = "https://bawarchee.edunextg.co/api";

const tableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 700,
  borderBottom: "1px solid #e5e7eb",
  px: 2,
  py: 1.5,
  whiteSpace: "nowrap",
};

const tableBodySx = {
  px: 2,
  py: 1.5,
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const calculatedCellSx = {
  ...tableBodySx,
  backgroundColor: "#eff6ff",
  fontWeight: 700,
};

const numberFormat = (value, decimals = 2) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const unitFormat = (value) =>
  Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const money = (value) => `Rs. ${numberFormat(value)}`;

const formatDate = (value) => {
  if (!value) return "N/A";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

function Metric({ label, value }) {
  return (
    <MDBox p={2} sx={{ border: "1px solid #e5e7eb", borderRadius: 1, backgroundColor: "#fff" }}>
      <MDTypography variant="caption" color="text" fontWeight="medium">
        {label}
      </MDTypography>
      <MDTypography variant="h6" color="dark" fontWeight="bold">
        {value}
      </MDTypography>
    </MDBox>
  );
}

function CurrentStock() {
  const fileInputRef = useRef(null);
  const [dmsImports, setDmsImports] = useState([]);
  const [selectedDmsImportId, setSelectedDmsImportId] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [stockImport, setStockImport] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [erpSearch, setErpSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const selectedDmsImport = useMemo(
    () => dmsImports.find((item) => String(item.id) === String(selectedDmsImportId)) || null,
    [dmsImports, selectedDmsImportId]
  );

  const fetchDmsImports = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/staff/dms-stock/imports`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch DMS stock dates.");
      setDmsImports(data.imports || []);
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentStock = async (dmsImportId = selectedDmsImportId) => {
    if (!dmsImportId) {
      setStockImport(null);
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/staff/current-stock?dmsImportId=${dmsImportId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch current stock.");
      setStockImport(data.import || null);
      setItems(data.items || []);
    } catch (fetchError) {
      setError(fetchError.message);
      setStockImport(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDmsImports();
  }, []);

  const handleDateChange = (event) => {
    const dmsImportId = event.target.value;
    setSelectedDmsImportId(dmsImportId);
    setSelectedFile(null);
    setMessage("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchCurrentStock(dmsImportId);
  };

  const handleUpload = async () => {
    if (!selectedDmsImportId) {
      setError("Please choose a DMS stock date first.");
      return;
    }
    if (!selectedFile) {
      setError("Please choose a Current Stock Excel or CSV file.");
      return;
    }

    const formData = new FormData();
    formData.append("dmsImportId", selectedDmsImportId);
    formData.append("file", selectedFile);
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${API}/staff/current-stock/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Current stock upload failed.");
      setStockImport(data.import || null);
      setItems(data.items || []);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage(data.message || "Current stock uploaded and calculated successfully.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  };

  const divisionOptions = useMemo(
    () => [...new Set(items.map((item) => item.product_division).filter(Boolean))].sort(),
    [items]
  );

  const filteredItems = useMemo(() => {
    const normalizedErp = erpSearch.trim().toLowerCase();
    const normalizedProduct = productSearch.trim().toLowerCase();
    return items.filter((item) =>
      (!divisionFilter || item.product_division === divisionFilter) &&
      (!normalizedErp || String(item.product_erp_id || "").toLowerCase().includes(normalizedErp)) &&
      (!normalizedProduct || String(item.product_name || "").toLowerCase().includes(normalizedProduct))
    );
  }, [divisionFilter, erpSearch, items, productSearch]);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center">
                <MDBox>
                  <MDTypography variant="h5" fontWeight="medium" color="dark">
                    Current Stock
                  </MDTypography>
                  <MDTypography variant="caption" color="text">
                    Choose a DMS upload date first, then upload the matching Current Stock file.
                  </MDTypography>
                </MDBox>
                <MDButton color="dark" variant="outlined" onClick={() => fetchCurrentStock()} disabled={!selectedDmsImportId || loading}>
                  <Icon sx={{ mr: 1 }}>refresh</Icon>
                  Fetch Data
                </MDButton>
              </MDBox>

              <MDBox px={3} pb={3}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={4}>
                    <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value={selectedDmsImportId}
                        onChange={handleDateChange}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="">Choose DMS Stock Date</MenuItem>
                        {dmsImports.map((stock) => (
                          <MenuItem key={stock.id} value={stock.id}>
                            {formatDate(stock.upload_date)} — {stock.file_name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={5}>
                    <MDBox display="flex" alignItems="center" gap={1.5} sx={{ border: "1px dashed #94a3b8", borderRadius: 1, p: 1.5, backgroundColor: "#f8fafc" }}>
                      <MDButton color="info" variant="outlined" onClick={() => fileInputRef.current?.click()} disabled={!selectedDmsImportId}>
                        <Icon sx={{ mr: 1 }}>upload_file</Icon>
                        Choose File
                      </MDButton>
                      <MDTypography variant="button" color="dark" sx={{ overflowWrap: "anywhere" }}>
                        {selectedFile ? selectedFile.name : "CSV, XLS, or XLSX"}
                      </MDTypography>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xls,.xlsx"
                        onChange={(event) => {
                          setSelectedFile(event.target.files?.[0] || null);
                          setMessage("");
                          setError("");
                        }}
                        style={{ display: "none" }}
                      />
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDButton color="info" variant="gradient" fullWidth onClick={handleUpload} disabled={!selectedDmsImportId || !selectedFile || uploading}>
                      <Icon sx={{ mr: 1 }}>cloud_upload</Icon>
                      {uploading ? "Uploading" : "Upload & Calculate"}
                    </MDButton>
                  </Grid>
                  {(loading || uploading) && <Grid item xs={12}><LinearProgress color="info" /></Grid>}
                  {message && <Grid item xs={12}><MDTypography variant="button" color="success" fontWeight="medium">{message}</MDTypography></Grid>}
                  {error && <Grid item xs={12}><MDTypography variant="button" color="error" fontWeight="medium">{error}</MDTypography></Grid>}
                </Grid>
              </MDBox>
            </Card>
          </Grid>

          {stockImport && (
            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}><Metric label="DMS Stock Date" value={formatDate(stockImport.dms_upload_date)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Rows Stored" value={unitFormat(stockImport.row_count)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Stock Cases" value={unitFormat(stockImport.total_cases)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Loose Stock Pcs" value={unitFormat(stockImport.total_loose_pcs)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Calculated Total Pcs" value={unitFormat(stockImport.total_pieces)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Calculated Total Value" value={money(stockImport.total_value)} /></Grid>
              </Grid>
            </Grid>
          )}

          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h6" fontWeight="medium">Current Stock Items</MDTypography>
                <MDTypography variant="caption" color="text" display="block">
                  {selectedDmsImport
                    ? `DMS date: ${formatDate(selectedDmsImport.upload_date)} | ${selectedDmsImport.file_name}`
                    : "Choose a DMS stock date to fetch saved Current Stock data."}
                </MDTypography>
                <MDTypography variant="caption" color="info" display="block" mt={0.5}>
                  Blue columns are automatically calculated from Case, Pcs/Box, loose Pcs, and Price/Pcs.
                </MDTypography>
              </MDBox>
              <MDBox px={3} pb={3}>
                <Grid container spacing={2} mb={2} alignItems="center">
                  <Grid item xs={12} md={3}>
                    <FormControl size="small" fullWidth>
                      <Select displayEmpty value={divisionFilter} onChange={(event) => setDivisionFilter(event.target.value)} sx={{ height: 44, backgroundColor: "#fff" }}>
                        <MenuItem value="">All Divisions</MenuItem>
                        {divisionOptions.map((division) => <MenuItem key={division} value={division}>{division}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}><MDInput label="Search ERP ID" fullWidth value={erpSearch} onChange={(event) => setErpSearch(event.target.value)} /></Grid>
                  <Grid item xs={12} md={4}><MDInput label="Search Product" fullWidth value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /></Grid>
                  <Grid item xs={12} md={2}>
                    <MDButton color="dark" variant="outlined" fullWidth onClick={() => { setDivisionFilter(""); setErpSearch(""); setProductSearch(""); }}>
                      <Icon sx={{ mr: 1 }}>filter_alt_off</Icon>Clear
                    </MDButton>
                  </Grid>
                </Grid>

                <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
                  <Table sx={{ minWidth: 1450 }}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={tableHeadSx}>Sr No</TableCell>
                        <TableCell sx={tableHeadSx}>Product ERP ID</TableCell>
                        <TableCell sx={tableHeadSx}>SKU Name</TableCell>
                        <TableCell sx={tableHeadSx}>Product Division</TableCell>
                        <TableCell sx={tableHeadSx}>Variant Name</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Pcs/Box</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Current Stock In Case</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Current Stock In Pcs</TableCell>
                        <TableCell align="right" sx={{ ...tableHeadSx, backgroundColor: "#dbeafe" }}>Total Current Stock In Pcs</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Price/Pcs</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>MRP</TableCell>
                        <TableCell align="right" sx={{ ...tableHeadSx, backgroundColor: "#dbeafe" }}>Total Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.length === 0 && (
                        <TableRow><TableCell colSpan={12} align="center" sx={tableBodySx}><MDTypography variant="button" color="text">{selectedDmsImportId ? "No Current Stock uploaded for this DMS date." : "Choose a DMS stock date first."}</MDTypography></TableCell></TableRow>
                      )}
                      {items.length > 0 && filteredItems.length === 0 && (
                        <TableRow><TableCell colSpan={12} align="center" sx={tableBodySx}><MDTypography variant="button" color="text">No rows match the selected filters.</MDTypography></TableCell></TableRow>
                      )}
                      {filteredItems.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell sx={tableBodySx}>{index + 1}</TableCell>
                          <TableCell sx={tableBodySx}>{item.product_erp_id}</TableCell>
                          <TableCell sx={{ ...tableBodySx, minWidth: 220 }}>{item.product_name}</TableCell>
                          <TableCell sx={tableBodySx}>{item.product_division}</TableCell>
                          <TableCell sx={tableBodySx}>{item.variant_name}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.pcs_per_box)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.current_stock_in_case)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.current_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={calculatedCellSx}>{unitFormat(item.total_current_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.price_per_piece)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.mrp)}</TableCell>
                          <TableCell align="right" sx={calculatedCellSx}>{money(item.total_value)}</TableCell>
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

export default CurrentStock;
