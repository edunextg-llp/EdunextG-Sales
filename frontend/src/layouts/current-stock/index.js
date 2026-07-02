import { useEffect, useMemo, useState } from "react";

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
import { stickyColumnSx, stickyHeadRowSx, stickyTableContainerSx, stickyTableSx } from "utils/stickyProductColumns";

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

const sourceCellSx = {
  ...tableBodySx,
  backgroundColor: "#f8fafc",
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

const formatExpiredStockDate = (value) => {
  if (!value) return "N/A";
  const s = String(value).trim();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Expected DB format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yStr, mStr, dStr] = s.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (m >= 1 && m <= 12) return `${d}-${months[m - 1]}-${String(y).slice(-2)}`;
  }

  // Fallback for other date strings
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return s;
  const d = dt.getDate();
  const m = dt.getMonth();
  const y = dt.getFullYear();
  return `${d}-${months[m]}-${String(y).slice(-2)}`;
};

const resolveDmsImportId = (uploadDate, imports) => {
  if (!imports.length) return "";
  if (!uploadDate) return String(imports[0].id);
  const match = imports.find((entry) => entry.upload_date === uploadDate);
  return match ? String(match.id) : "";
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
  const [dmsImports, setDmsImports] = useState([]);
  const [stockImport, setStockImport] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [erpSearch, setErpSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [stockListDateFilter, setStockListDateFilter] = useState("");

  const selectedDmsImportId = useMemo(
    () => resolveDmsImportId(stockListDateFilter, dmsImports),
    [stockListDateFilter, dmsImports]
  );

  const selectedDmsImport = useMemo(
    () => dmsImports.find((item) => String(item.id) === String(selectedDmsImportId)) || null,
    [dmsImports, selectedDmsImportId]
  );

  const fetchDmsImports = async () => {
    try {
      const response = await fetch(`${API}/staff/dms-stock/imports`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch DMS stock dates.");
      setDmsImports(data.imports || []);
    } catch (fetchError) {
      setError(fetchError.message);
    }
  };

  const fetchCurrentStock = async (dmsImportId = selectedDmsImportId) => {
    if (!dmsImportId) {
      setStockImport(null);
      setItems([]);
      setMessage("");
      return;
    }
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${API}/staff/current-stock?dmsImportId=${dmsImportId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch current stock.");
      setStockImport(data.import || null);
      setItems(data.items || []);
      setMessage("Current stock calculated as Physical Stock minus DMS Stock.");
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

  useEffect(() => {
    if (!dmsImports.length) return;
    fetchCurrentStock(selectedDmsImportId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockListDateFilter, dmsImports]);

  const handleDateChange = (event) => {
    setStockListDateFilter(event.target.value);
    setMessage("");
    setError("");
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
                    Calculated as Physical Stock minus DMS Stock for the selected DMS date.
                  </MDTypography>
                </MDBox>
                <MDButton color="dark" variant="outlined" onClick={() => fetchCurrentStock()} disabled={!selectedDmsImportId || loading}>
                  <Icon sx={{ mr: 1 }}>refresh</Icon>
                  Calculate
                </MDButton>
              </MDBox>

              <MDBox px={3} pb={3}>
                {loading && <LinearProgress color="info" sx={{ mb: 2 }} />}
                {message && <MDTypography variant="button" color="success" fontWeight="medium" display="block" mb={1}>{message}</MDTypography>}
                {error && <MDTypography variant="button" color="error" fontWeight="medium" display="block">{error}</MDTypography>}
              </MDBox>
            </Card>
          </Grid>

          {stockImport && (
            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}><Metric label="DMS Stock Date" value={formatDate(stockImport.dms_upload_date)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Products Compared" value={unitFormat(stockImport.row_count)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Physical Total Pcs" value={unitFormat(stockImport.total_physical_pieces)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="DMS Total Pcs" value={unitFormat(stockImport.total_dms_pieces)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Current Stock Cases" value={unitFormat(stockImport.total_cases)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Current Stock Loose Pcs" value={unitFormat(stockImport.total_loose_pcs)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Current Stock Total Pcs" value={unitFormat(stockImport.total_pieces)} /></Grid>
                <Grid item xs={12} sm={6} md={3}><Metric label="Current Stock Total Value" value={money(stockImport.total_value)} /></Grid>
              </Grid>
            </Grid>
          )}

          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h6" fontWeight="medium">Current Stock Items</MDTypography>
                <MDTypography variant="caption" color="text" display="block">
                  Use the date filter to calculate Current Stock for a specific DMS upload.
                </MDTypography>
                {selectedDmsImport && (
                  <MDTypography variant="caption" color="text" display="block" mt={0.5}>
                    DMS date: {formatDate(selectedDmsImport.upload_date)}
                    {selectedDmsImport.file_name ? ` | File: ${selectedDmsImport.file_name}` : ""}
                  </MDTypography>
                )}
                <MDTypography variant="caption" color="info" display="block" mt={0.5}>
                  Blue columns show Current Stock = Physical Stock minus DMS Stock.
                </MDTypography>
              </MDBox>
              <MDBox px={3} pb={3}>
                <Grid container spacing={2} mb={2} alignItems="center">
                  <Grid item xs={12} md={2}>
                    <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value={stockListDateFilter}
                        onChange={handleDateChange}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="">Latest Upload</MenuItem>
                        {dmsImports.map((stock) => (
                          <MenuItem key={stock.id} value={stock.upload_date}>
                            {formatDate(stock.upload_date)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl size="small" fullWidth>
                      <Select displayEmpty value={divisionFilter} onChange={(event) => setDivisionFilter(event.target.value)} sx={{ height: 44, backgroundColor: "#fff" }}>
                        <MenuItem value="">All Divisions</MenuItem>
                        {divisionOptions.map((division) => <MenuItem key={division} value={division}>{division}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}><MDInput label="Search ERP ID" fullWidth value={erpSearch} onChange={(event) => setErpSearch(event.target.value)} /></Grid>
                  <Grid item xs={12} md={3}><MDInput label="Search Product" fullWidth value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /></Grid>
                  <Grid item xs={12} md={2}>
                    <MDButton color="dark" variant="outlined" fullWidth onClick={() => { setStockListDateFilter(""); setDivisionFilter(""); setErpSearch(""); setProductSearch(""); }}>
                      <Icon sx={{ mr: 1 }}>filter_alt_off</Icon>Clear
                    </MDButton>
                  </Grid>
                </Grid>

                <TableContainer component={Paper} sx={stickyTableContainerSx}>
                  <Table sx={stickyTableSx(1950)}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={stickyColumnSx(0, { isHead: true, baseSx: tableHeadSx })}>Sr No</TableCell>
                        <TableCell sx={stickyColumnSx(1, { isHead: true, baseSx: tableHeadSx })}>Product ERP ID</TableCell>
                        <TableCell sx={stickyColumnSx(2, { isHead: true, baseSx: tableHeadSx })}>SKU Name</TableCell>
                        <TableCell sx={stickyColumnSx(3, { isHead: true, baseSx: tableHeadSx })}>Product Division</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Variant Name</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Pcs/Box</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Expired Stock</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#f1f5f9")}>Physical Case</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#f1f5f9")}>Physical Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#f1f5f9")}>Physical Total Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#fef3c7")}>DMS Case</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#fef3c7")}>DMS Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#fef3c7")}>DMS Total Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#dbeafe")}>Current Case</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#dbeafe")}>Current Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#dbeafe")}>Current Total Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Price/Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#dbeafe")}>Current Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.length === 0 && (
                        <TableRow><TableCell colSpan={17} align="center" sx={tableBodySx}><MDTypography variant="button" color="text">{selectedDmsImportId ? "Upload Physical Stock for this DMS date, then calculate Current Stock." : "Choose a DMS stock date first."}</MDTypography></TableCell></TableRow>
                      )}
                      {items.length > 0 && filteredItems.length === 0 && (
                        <TableRow><TableCell colSpan={17} align="center" sx={tableBodySx}><MDTypography variant="button" color="text">No rows match the selected filters.</MDTypography></TableCell></TableRow>
                      )}
                      {filteredItems.map((item, index) => (
                        <TableRow key={`${item.product_erp_id}-${index}`}>
                          <TableCell sx={stickyColumnSx(0, { baseSx: tableBodySx })}>{index + 1}</TableCell>
                          <TableCell sx={stickyColumnSx(1, { baseSx: tableBodySx })}>{item.product_erp_id}</TableCell>
                          <TableCell sx={stickyColumnSx(2, { baseSx: { ...tableBodySx, overflow: "hidden", textOverflow: "ellipsis" } })}>{item.product_name}</TableCell>
                          <TableCell sx={stickyColumnSx(3, { baseSx: tableBodySx })}>{item.product_division}</TableCell>
                          <TableCell sx={tableBodySx}>{item.variant_name}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.pcs_per_box)}</TableCell>
                          <TableCell sx={tableBodySx}>{formatExpiredStockDate(item.expired_stock_date)}</TableCell>
                          <TableCell align="right" sx={sourceCellSx}>{unitFormat(item.physical_stock_in_case)}</TableCell>
                          <TableCell align="right" sx={sourceCellSx}>{unitFormat(item.physical_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={sourceCellSx}>{unitFormat(item.total_physical_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={{ ...sourceCellSx, backgroundColor: "#fffbeb" }}>{unitFormat(item.dms_stock_in_case)}</TableCell>
                          <TableCell align="right" sx={{ ...sourceCellSx, backgroundColor: "#fffbeb" }}>{unitFormat(item.dms_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={{ ...sourceCellSx, backgroundColor: "#fffbeb" }}>{unitFormat(item.total_dms_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={calculatedCellSx}>{unitFormat(item.current_stock_in_case)}</TableCell>
                          <TableCell align="right" sx={calculatedCellSx}>{unitFormat(item.current_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={calculatedCellSx}>{unitFormat(item.total_current_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.price_per_piece)}</TableCell>
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
