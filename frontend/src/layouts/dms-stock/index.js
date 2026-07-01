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

const API = "http://localhost:5001/api";

const tableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 700,
  textTransform: "none",
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

const metricBoxSx = {
  border: "1px solid #e5e7eb",
  borderRadius: 1,
  backgroundColor: "#fff",
  height: "100%",
};

const numberFormat = (value, decimals = 2) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const unitFormat = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });

const money = (value) => `Rs. ${numberFormat(value)}`;

const formatUploadDate = (value) => {
  if (!value) return "N/A";
  const dateOnly = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getTodayLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getImportUploadDate = (stockImport) =>
  stockImport?.upload_date || stockImport?.created_at || null;

function Metric({ label, value }) {
  return (
    <MDBox p={2} sx={metricBoxSx}>
      <MDTypography variant="caption" color="text" fontWeight="medium">
        {label}
      </MDTypography>
      <MDTypography variant="h6" color="dark" fontWeight="bold">
        {value}
      </MDTypography>
    </MDBox>
  );
}

function DmsStock() {
  const fileInputRef = useRef(null);
  const [stockImport, setStockImport] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [erpSearch, setErpSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [uploadDate, setUploadDate] = useState(() => getTodayLocalDate());

  const fetchLatestStock = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/staff/dms-stock`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch DMS stock.");
      }
      setStockImport(data.import || null);
      setItems(data.items || []);
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestStock();
  }, []);

  const uploadDisabled = useMemo(
    () => !selectedFile || !uploadDate || uploading,
    [selectedFile, uploadDate, uploading]
  );

  const divisionOptions = useMemo(
    () =>
      [...new Set(items.map((item) => item.product_division).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [items]
  );

  const filteredItems = useMemo(() => {
    const normalizedErpSearch = erpSearch.trim().toLowerCase();
    const normalizedProductSearch = productSearch.trim().toLowerCase();

    return items.filter((item) => {
      const matchesDivision = !divisionFilter || item.product_division === divisionFilter;
      const matchesErp =
        !normalizedErpSearch ||
        String(item.product_erp_id || "").toLowerCase().includes(normalizedErpSearch);
      const matchesProduct =
        !normalizedProductSearch ||
        String(item.product_name || "").toLowerCase().includes(normalizedProductSearch);

      return matchesDivision && matchesErp && matchesProduct;
    });
  }, [divisionFilter, erpSearch, items, productSearch]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setMessage("");
    setError("");
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please choose a CSV or Excel file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("uploadDate", uploadDate);

    setUploading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${API}/staff/dms-stock/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }
      setStockImport(data.import || null);
      setItems(data.items || []);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage(data.message || "DMS stock uploaded successfully.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  };

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
                    DMS Stock
                  </MDTypography>
                  {stockImport && (
                    <MDTypography variant="caption" color="text" display="block" mt={0.5}>
                      Upload Date: {formatUploadDate(getImportUploadDate(stockImport))} | File: {stockImport.file_name}
                    </MDTypography>
                  )}
                </MDBox>
                <MDButton color="dark" variant="outlined" onClick={fetchLatestStock} disabled={loading}>
                  <Icon sx={{ mr: 1 }}>refresh</Icon>
                  Refresh
                </MDButton>
              </MDBox>

              <MDBox px={3} pb={3}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={5}>
                    <MDBox
                      display="flex"
                      alignItems="center"
                      gap={1.5}
                      sx={{
                        border: "1px dashed #94a3b8",
                        borderRadius: 1,
                        p: 2,
                        backgroundColor: "#f8fafc",
                      }}
                    >
                      <MDButton
                        color="info"
                        variant="outlined"
                        onClick={() => fileInputRef.current?.click()}
                      >
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
                        onChange={handleFileChange}
                        style={{ display: "none" }}
                      />
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="date"
                      label="Upload Date"
                      fullWidth
                      value={uploadDate}
                      onChange={(event) => setUploadDate(event.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDBox display="flex" justifyContent={{ xs: "flex-start", md: "flex-end" }} gap={1}>
                      <MDButton
                        color="info"
                        variant="gradient"
                        onClick={handleUpload}
                        disabled={uploadDisabled}
                      >
                        <Icon sx={{ mr: 1 }}>cloud_upload</Icon>
                        {uploading ? "Uploading" : "Upload Stock"}
                      </MDButton>
                    </MDBox>
                  </Grid>
                  {(uploading || loading) && (
                    <Grid item xs={12}>
                      <LinearProgress color="info" />
                    </Grid>
                  )}
                  {message && (
                    <Grid item xs={12}>
                      <MDTypography variant="button" color="success" fontWeight="medium">
                        {message}
                      </MDTypography>
                    </Grid>
                  )}
                  {error && (
                    <Grid item xs={12}>
                      <MDTypography variant="button" color="error" fontWeight="medium">
                        {error}
                      </MDTypography>
                    </Grid>
                  )}
                </Grid>
              </MDBox>
            </Card>
          </Grid>

          {stockImport && (
            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Upload Date" value={formatUploadDate(getImportUploadDate(stockImport))} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Rows Stored" value={unitFormat(stockImport.row_count)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Purchase Stock" value={unitFormat(stockImport.total_purchase_units)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Closing Stock" value={unitFormat(stockImport.total_closing_units)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Total Value" value={money(stockImport.total_value)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Purchase Value" value={money(stockImport.total_purchase_value)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Invoiced Value" value={money(stockImport.total_invoiced_value)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="In Transit Units" value={unitFormat(stockImport.total_in_transit_units)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Total Pieces" value={unitFormat(stockImport.total_pieces)} />
                </Grid>
              </Grid>
            </Grid>
          )}

          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
                <MDBox>
                  <MDTypography variant="h6" fontWeight="medium">
                    Stock Ledger Preview
                  </MDTypography>
                  <MDTypography variant="caption" color="text" display="block">
                    Showing up to 200 saved rows from the latest upload.
                  </MDTypography>
                  {stockImport && (
                    <MDTypography variant="caption" color="text" display="block" mt={0.5}>
                      Upload Date: {formatUploadDate(getImportUploadDate(stockImport))}
                      {stockImport.file_name ? ` | File: ${stockImport.file_name}` : ""}
                    </MDTypography>
                  )}
                </MDBox>
              </MDBox>
              <MDBox px={3} pb={3}>
                <Grid container spacing={2} mb={2} alignItems="center">
                  <Grid item xs={12} md={3}>
                    <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value={divisionFilter}
                        onChange={(event) => setDivisionFilter(event.target.value)}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="">All Divisions</MenuItem>
                        {divisionOptions.map((division) => (
                          <MenuItem key={division} value={division}>
                            {division}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="Search ERP ID"
                      fullWidth
                      value={erpSearch}
                      onChange={(event) => setErpSearch(event.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      label="Search Product"
                      fullWidth
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <MDButton
                      color="dark"
                      variant="outlined"
                      fullWidth
                      onClick={() => {
                        setDivisionFilter("");
                        setErpSearch("");
                        setProductSearch("");
                      }}
                    >
                      <Icon sx={{ mr: 1 }}>filter_alt_off</Icon>
                      Clear
                    </MDButton>
                  </Grid>
                </Grid>
                <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
                  <Table sx={{ minWidth: 1680 }}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={tableHeadSx}>Sr No</TableCell>
                        <TableCell sx={tableHeadSx}>Upload Date</TableCell>
                        <TableCell sx={tableHeadSx}>ERP ID</TableCell>
                        <TableCell sx={tableHeadSx}>Product</TableCell>
                        <TableCell sx={tableHeadSx}>Division</TableCell>
                        <TableCell sx={tableHeadSx}>Variant</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Purchase Unit</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Purchase Value</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>DP/Unit</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Invoiced Unit</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Invoiced Value</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Closing Unit</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Closing Value</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Transit Unit</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Transit Value</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Total Pieces</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Total Value</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Purchase Price</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={18} align="center" sx={tableBodySx}>
                            <MDTypography variant="button" color="text">
                              No DMS stock uploaded yet.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
                      )}
                      {items.length > 0 && filteredItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={18} align="center" sx={tableBodySx}>
                            <MDTypography variant="button" color="text">
                              No stock rows match the selected filters.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredItems.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell sx={tableBodySx}>{index + 1}</TableCell>
                          <TableCell sx={tableBodySx}>
                            {formatUploadDate(getImportUploadDate(stockImport))}
                          </TableCell>
                          <TableCell sx={tableBodySx}>{item.product_erp_id}</TableCell>
                          <TableCell sx={{ ...tableBodySx, minWidth: 220 }}>{item.product_name}</TableCell>
                          <TableCell sx={tableBodySx}>{item.product_division}</TableCell>
                          <TableCell sx={tableBodySx}>{item.variant_name}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.total_purchases_in_stock_unit)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.purchases_in_stock_value)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{numberFormat(item.dp_per_unit_stock, 4)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.total_invoiced_stock_unit)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.invoiced_stock_value)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.total_closing_stock_unit)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.closing_stock_value)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.total_in_transit_stock_quantity_unit)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.in_transit_stock_value)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.total_pieces)}</TableCell>
                          <TableCell align="right" sx={{ ...tableBodySx, fontWeight: 700 }}>{money(item.total_value)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>
                            {item.purchase_price === null ? "N/A" : numberFormat(item.purchase_price, 4)}
                          </TableCell>
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

export default DmsStock;
