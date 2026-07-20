import { useEffect, useMemo, useRef, useState } from "react";

import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
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
const DMS_STOCK_TEMPLATE_URL =
  "https://res.cloudinary.com/ddwp5cuhl/raw/upload/v1782977868/DMS_Stock_-_Copy_cgba8i.xlsx";

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
  const [erpSearch, setErpSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [stockListImportFilter, setStockListImportFilter] = useState("");
  const [importDates, setImportDates] = useState([]);
  const [uploadDate, setUploadDate] = useState(() => getTodayLocalDate());
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API}/staff/companies`);
      if (response.ok) {
        setCompanies(await response.json());
      }
    } catch (fetchError) {
      console.error("Error fetching companies:", fetchError);
    }
  };

  const fetchImportDates = async () => {
    try {
      const response = await fetch(`${API}/staff/dms-stock/imports`);
      const data = await response.json();
      if (response.ok) {
        setImportDates(data.imports || []);
      }
    } catch (fetchError) {
      console.error("Error fetching DMS stock dates:", fetchError);
    }
  };

  const fetchLatestStock = async (importFilter = stockListImportFilter) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (importFilter) {
        params.set("importId", importFilter);
      }
      const query = params.toString();
      const response = await fetch(`${API}/staff/dms-stock${query ? `?${query}` : ""}`);
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
    fetchImportDates();
    fetchCompanies();
  }, []);

  useEffect(() => {
    fetchLatestStock(stockListImportFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockListImportFilter]);

  const uploadDisabled = useMemo(
    () => !selectedFile || !uploadDate || !selectedCompanyId || uploading,
    [selectedFile, uploadDate, selectedCompanyId, uploading]
  );

  const filteredItems = useMemo(() => {
    const normalizedErpSearch = erpSearch.trim().toLowerCase();
    const normalizedProductSearch = productSearch.trim().toLowerCase();

    return items.filter((item) => {
      const matchesErp =
        !normalizedErpSearch ||
        String(item.product_erp_id || "").toLowerCase().includes(normalizedErpSearch);
      const matchesProduct =
        !normalizedProductSearch ||
        String(item.product_name || "").toLowerCase().includes(normalizedProductSearch);

      return matchesErp && matchesProduct;
    });
  }, [erpSearch, items, productSearch]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setMessage("");
    setError("");
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setSelectedCompanyId("");
    setMessage("");
    setError("");
    setUploadDate(getTodayLocalDate());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openUploadModal = () => {
    resetUploadForm();
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    resetUploadForm();
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError("Please choose a CSV or Excel file.");
      return;
    }
    if (!selectedCompanyId) {
      setError("Please select a company.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("uploadDate", uploadDate);
    formData.append("companyId", selectedCompanyId);

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
      await fetchImportDates();
      if (data.import?.id) {
        setStockListImportFilter(String(data.import.id));
      }
      setUploadModalOpen(false);
      resetUploadForm();
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
          {stockImport && (
            <Grid item xs={12}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Upload Date" value={formatUploadDate(getImportUploadDate(stockImport))} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Company" value={stockImport.company_name || "N/A"} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Rows Stored" value={unitFormat(stockImport.row_count)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Stock Cases" value={unitFormat(stockImport.total_stock_cases)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Loose Stock Pcs" value={unitFormat(stockImport.total_stock_pcs)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Total Value" value={money(stockImport.total_value)} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Total Current Stock Pcs" value={unitFormat(stockImport.total_pieces)} />
                </Grid>
              </Grid>
            </Grid>
          )}

          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
                <MDBox>
                  <MDTypography variant="h5" fontWeight="medium" color="dark">
                    DMS Stock
                  </MDTypography>
                  <MDTypography variant="caption" color="text" display="block" mt={0.5}>
                    Showing up to 200 saved rows per upload. Use the date filter to view a specific upload.
                  </MDTypography>
                  {stockImport && (
                    <MDTypography variant="caption" color="text" display="block" mt={0.5}>
                      Upload Date: {formatUploadDate(getImportUploadDate(stockImport))}
                      {stockImport.company_name ? ` | Company: ${stockImport.company_name}` : ""}
                      {stockImport.file_name ? ` | File: ${stockImport.file_name}` : ""}
                    </MDTypography>
                  )}
                </MDBox>
                <MDBox display="flex" gap={1} flexWrap="wrap" justifyContent="flex-end">
                  <MDButton
                    color="info"
                    variant="outlined"
                    component="a"
                    href={DMS_STOCK_TEMPLATE_URL}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <Icon sx={{ mr: 1 }}>download</Icon>
                    Download Template
                  </MDButton>
                  <MDButton color="dark" variant="outlined" onClick={() => fetchLatestStock()} disabled={loading}>
                    <Icon sx={{ mr: 1 }}>refresh</Icon>
                    Refresh
                  </MDButton>
                  <MDButton color="info" variant="gradient" onClick={openUploadModal}>
                    <Icon sx={{ mr: 1 }}>add</Icon>
                    Add DMS Stock
                  </MDButton>
                </MDBox>
              </MDBox>
              <MDBox px={3} pb={3}>
                <Grid container spacing={2} mb={2} alignItems="center">
                  <Grid item xs={12} md={3}>
                    <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value={stockListImportFilter}
                        onChange={(event) => setStockListImportFilter(event.target.value)}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="">Latest Upload</MenuItem>
                        {importDates.map((entry) => (
                          <MenuItem key={entry.id} value={String(entry.id)}>
                            {formatUploadDate(entry.upload_date)}
                            {entry.company_name ? ` - ${entry.company_name}` : ""}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={2}>
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
                        setStockListImportFilter("");
                        setErpSearch("");
                        setProductSearch("");
                      }}
                    >
                      <Icon sx={{ mr: 1 }}>filter_alt_off</Icon>
                      Clear
                    </MDButton>
                  </Grid>
                </Grid>
                <TableContainer component={Paper} sx={stickyTableContainerSx}>
                  <Table sx={stickyTableSx(1280)}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={stickyColumnSx(0, { isHead: true, baseSx: tableHeadSx })}>Sr No</TableCell>
                        <TableCell sx={stickyColumnSx(1, { isHead: true, baseSx: tableHeadSx })}>Product ERP ID</TableCell>
                        <TableCell sx={stickyColumnSx(2, { isHead: true, baseSx: tableHeadSx })}>SKU Name</TableCell>
                        <TableCell sx={stickyColumnSx(3, { isHead: true, baseSx: tableHeadSx })}>Company</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Upload Date</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Variant Name</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Pcs/Box</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Current Stock In Case</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Current Stock In Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Total Current Stock In Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Price/Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>MRP</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Total Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={13} align="center" sx={tableBodySx}>
                            <MDTypography variant="button" color="text">
                              No DMS stock uploaded yet. Click &quot;Add DMS Stock&quot; to upload.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
                      )}
                      {items.length > 0 && filteredItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={13} align="center" sx={tableBodySx}>
                            <MDTypography variant="button" color="text">
                              No stock rows match the selected filters.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredItems.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell sx={stickyColumnSx(0, { baseSx: tableBodySx })}>{index + 1}</TableCell>
                          <TableCell sx={stickyColumnSx(1, { baseSx: tableBodySx })}>{item.product_erp_id}</TableCell>
                          <TableCell sx={stickyColumnSx(2, { baseSx: { ...tableBodySx, overflow: "hidden", textOverflow: "ellipsis" } })}>{item.product_name}</TableCell>
                          <TableCell sx={stickyColumnSx(3, { baseSx: tableBodySx })}>
                            {item.company_name || stockImport?.company_name || item.product_division || "N/A"}
                          </TableCell>
                          <TableCell sx={tableBodySx}>
                            {formatUploadDate(item.upload_date || getImportUploadDate(stockImport))}
                          </TableCell>
                          <TableCell sx={tableBodySx}>{item.variant_name}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.pcs_per_box)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.current_stock_in_case)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.current_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.total_current_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.price_per_piece)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.mrp)}</TableCell>
                          <TableCell align="right" sx={{ ...tableBodySx, fontWeight: 700 }}>{money(item.total_value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {loading && (
                  <MDBox mt={2}>
                    <LinearProgress color="info" />
                  </MDBox>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <Dialog open={uploadModalOpen} onClose={closeUploadModal} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          Add DMS Stock
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <MDTypography variant="caption" color="text" fontWeight="medium" mb={0.5}>
                    Company
                  </MDTypography>
                  <Select
                    displayEmpty
                    value={selectedCompanyId}
                    onChange={(event) => setSelectedCompanyId(event.target.value)}
                    sx={{ height: 44, backgroundColor: "#fff" }}
                  >
                    <MenuItem value="" disabled>
                      Choose Company
                    </MenuItem>
                    {companies.map((company) => (
                      <MenuItem key={company.id} value={String(company.id)}>
                        {company.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
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
              <Grid item xs={12}>
                <MDInput
                  type="date"
                  label="Upload Date"
                  fullWidth
                  value={uploadDate}
                  onChange={(event) => setUploadDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              {uploading && (
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
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <MDButton color="dark" variant="outlined" onClick={closeUploadModal} disabled={uploading}>
            Cancel
          </MDButton>
          <MDButton color="info" variant="gradient" onClick={handleUpload} disabled={uploadDisabled}>
            <Icon sx={{ mr: 1 }}>cloud_upload</Icon>
            {uploading ? "Uploading" : "Upload Stock"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default DmsStock;
