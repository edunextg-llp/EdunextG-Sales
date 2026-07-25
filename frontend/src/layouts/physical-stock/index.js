import { useEffect, useMemo, useRef, useState } from "react";

import Autocomplete from "@mui/material/Autocomplete";
import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
import IconButton from "@mui/material/IconButton";
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
const PHYSICAL_STOCK_TEMPLATE_URL =
  "https://res.cloudinary.com/ddwp5cuhl/raw/upload/v1782977511/Physiscal_Stock_-_Copy_gjxvok.xlsx";

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

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatHistorySource = (entry) => {
  if (entry.source_type === "sale") return "Sales Deduction";
  if (entry.source_type === "upload") return entry.source_label || "File Upload";
  return entry.source_label || "Manual Entry";
};

const formatChangeType = (value) => {
  if (value === "create") return "Added";
  if (value === "deduct") return "Deducted";
  return "Updated";
};

const formatDmsImportLabel = (stock) => {
  const date = formatDate(stock.upload_date);
  const company = stock.company_name ? ` - ${stock.company_name}` : "";
  const source = stock.file_name ? ` (${stock.file_name})` : "";
  return `${date}${company}${source}`;
};

const resolveSelectedImportId = (importFilter, imports) => {
  if (!imports.length) return "";
  if (!importFilter) return String(imports[0].id);
  return String(importFilter);
};

const emptyStockForm = () => ({
  physicalStockInCase: "",
  physicalStockInPcs: "",
});

const calcPhysicalTotals = (product, stockForm) => {
  const pcsPerBox = Number(product?.pcs_per_box) || 0;
  const physicalStockInCase = Number(stockForm.physicalStockInCase) || 0;
  const physicalStockInPcs = Number(stockForm.physicalStockInPcs) || 0;
  const pricePerPiece = Number(product?.price_per_piece) || 0;

  const totalPhysicalStockInPcs = (pcsPerBox * physicalStockInCase) + physicalStockInPcs;
  const totalValue = totalPhysicalStockInPcs * pricePerPiece;

  return {
    totalPhysicalStockInPcs: totalPhysicalStockInPcs ? totalPhysicalStockInPcs.toFixed(2) : "",
    totalValue: totalValue ? totalValue.toFixed(2) : "",
  };
};

const entryFormSx = {
  border: "2px solid #7eb8da",
  borderRadius: 1,
  backgroundColor: "#e8f4fc",
  p: 3,
};

const fieldLabelSx = {
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#1e3a5f",
  mb: 0.5,
  display: "block",
};

const requiredMark = (
  <MDTypography component="span" color="error" fontSize="0.8rem">
    {" "}*
  </MDTypography>
);

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

function PhysicalStock() {
  const fileInputRef = useRef(null);
  const [dmsImports, setDmsImports] = useState([]);
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
  const [stockListImportFilter, setStockListImportFilter] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDmsImportFilter, setUploadDmsImportFilter] = useState("");
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualDmsImportFilter, setManualDmsImportFilter] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [stockForm, setStockForm] = useState(emptyStockForm);
  const [savingManual, setSavingManual] = useState(false);
  const [erpOptions, setErpOptions] = useState([]);
  const [erpSearchLoading, setErpSearchLoading] = useState(false);
  const [selectedErpOption, setSelectedErpOption] = useState(null);
  const [erpInputValue, setErpInputValue] = useState("");
  const erpSearchTimerRef = useRef(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const selectedDmsImportId = useMemo(
    () => resolveSelectedImportId(stockListImportFilter, dmsImports),
    [stockListImportFilter, dmsImports]
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
      const imports = data.imports || [];
      setDmsImports(imports);
      return imports;
    } catch (fetchError) {
      setError(fetchError.message);
      return [];
    }
  };

  const fetchPhysicalStock = async (dmsImportId = selectedDmsImportId) => {
    if (!dmsImportId) {
      setStockImport(null);
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/staff/physical-stock?dmsImportId=${dmsImportId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch physical stock.");
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

  useEffect(() => {
    if (!dmsImports.length) return;
    fetchPhysicalStock(selectedDmsImportId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockListImportFilter, dmsImports]);

  const handleImportFilterChange = (event) => {
    setStockListImportFilter(event.target.value);
    setSelectedFile(null);
    setMessage("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadDmsImportId = useMemo(
    () => resolveSelectedImportId(uploadDmsImportFilter, dmsImports),
    [uploadDmsImportFilter, dmsImports]
  );

  const manualDmsImportId = useMemo(
    () => resolveSelectedImportId(manualDmsImportFilter, dmsImports),
    [manualDmsImportFilter, dmsImports]
  );

  const stockTotals = useMemo(
    () => calcPhysicalTotals(selectedProduct, stockForm),
    [selectedProduct, stockForm]
  );

  const isProductLoaded = Boolean(selectedProduct?.product_erp_id);

  const resetUploadForm = () => {
    setSelectedFile(null);
    setMessage("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openUploadModal = () => {
    resetUploadForm();
    setUploadDmsImportFilter(stockListImportFilter);
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    resetUploadForm();
  };

  const resetManualForm = () => {
    setManualDmsImportFilter("");
    setSelectedProduct(null);
    setStockForm(emptyStockForm());
    setErpOptions([]);
    setSelectedErpOption(null);
    setErpInputValue("");
    setMessage("");
    setError("");
  };

  const openManualModal = async () => {
    resetManualForm();
    const imports = await fetchDmsImports();
    const defaultImportId = stockListImportFilter || (imports[0]?.id ? String(imports[0].id) : "");
    setManualDmsImportFilter(defaultImportId);
    if (defaultImportId) {
      const products = await fetchDmsProducts(defaultImportId);
      if (!products.length) {
        setMessage("No products found in selected DMS stock. Add DMS stock for this company first.");
      } else {
        setMessage(`${products.length} product(s) available. Select Product ERP ID.`);
      }
    }
    setManualModalOpen(true);
  };

  const closeManualModal = () => {
    setManualModalOpen(false);
    resetManualForm();
  };

  const handleEditPhysicalItem = async (item) => {
    if (!selectedDmsImportId) {
      setError("Please select an invoice first.");
      return;
    }
    resetManualForm();
    setManualDmsImportFilter(String(selectedDmsImportId));
    setManualModalOpen(true);
    try {
      const products = await fetchDmsProducts(String(selectedDmsImportId));
      const product = await loadProductFromBackend(
        String(selectedDmsImportId),
        item.product_erp_id
      );
      setErpOptions(products);
      applyProductToForm(product);
      setStockForm({
        physicalStockInCase: String(item.physical_stock_in_case ?? ""),
        physicalStockInPcs: String(item.physical_stock_in_pcs ?? ""),
      });
      setMessage(`Editing ${item.product_name}. Update the quantity and save.`);
    } catch (editError) {
      setError(editError.message);
    }
  };

  const closeHistoryModal = () => {
    setHistoryModalOpen(false);
    setHistoryItem(null);
    setHistoryRows([]);
    setHistoryError("");
  };

  const handleViewItemHistory = async (item) => {
    if (!selectedDmsImportId || !item?.product_erp_id) return;

    setHistoryItem(item);
    setHistoryModalOpen(true);
    setHistoryRows([]);
    setHistoryError("");
    setLoadingHistory(true);

    try {
      const params = new URLSearchParams({
        dmsImportId: String(selectedDmsImportId),
        erpId: String(item.product_erp_id),
      });
      const response = await fetch(`${API}/staff/physical-stock/item-history?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch item history.");
      }
      setHistoryRows(Array.isArray(data.history) ? data.history : []);
    } catch (fetchError) {
      setHistoryError(fetchError.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const groupedHistory = useMemo(() => {
    const groups = new Map();
    historyRows.forEach((entry) => {
      const key = String(entry.update_date || entry.created_at || "").slice(0, 10) || "unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [historyRows]);

  const updateStockForm = (field, value) => {
    setStockForm((prev) => ({ ...prev, [field]: value }));
  };

  const fetchDmsProducts = async (dmsImportId, search = "") => {
    if (!dmsImportId) {
      setErpOptions([]);
      return [];
    }

    setErpSearchLoading(true);
    try {
      const params = new URLSearchParams({
        dmsImportId: String(dmsImportId),
        search: String(search || "").trim(),
      });
      const response = await fetch(`${API}/staff/physical-stock/dms-products?${params}`);
      const data = await response.json();
      if (response.ok) {
        const products = data.products || [];
        setErpOptions(products);
        return products;
      }
    } catch (fetchError) {
      console.error("Error fetching DMS products:", fetchError);
    } finally {
      setErpSearchLoading(false);
    }
    return [];
  };

  const loadProductFromBackend = async (dmsImportId, erpId) => {
    const params = new URLSearchParams({
      dmsImportId: String(dmsImportId),
      erpId: String(erpId || "").trim(),
    });
    const response = await fetch(`${API}/staff/physical-stock/product-lookup?${params}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Product not found in selected DMS stock.");
    }
    return data.product;
  };

  const applyProductToForm = (product) => {
    setSelectedProduct(product);
    setStockForm({
      physicalStockInCase: "",
      physicalStockInPcs: "",
    });
    setErpInputValue(product.product_erp_id || "");
    setSelectedErpOption(product);
    setMessage("Product details loaded from DMS stock. Enter physical stock quantity and save.");
  };

  const handleManualDmsImportChange = async (importId) => {
    setManualDmsImportFilter(importId);
    setSelectedProduct(null);
    setStockForm(emptyStockForm());
    setSelectedErpOption(null);
    setErpInputValue("");
    setError("");

    if (!importId) {
      setErpOptions([]);
      return;
    }

    const products = await fetchDmsProducts(String(importId));
    if (!products.length) {
      setMessage("No items found in the selected invoice.");
    } else {
      setMessage(`${products.length} item(s) available. Select an item.`);
    }
  };

  const handleErpOptionSelect = async (event, option) => {
    if (!option) {
      setSelectedErpOption(null);
      setSelectedProduct(null);
      setStockForm(emptyStockForm());
      setErpInputValue("");
      return;
    }

    if (!manualDmsImportId) {
      setError("Please select an invoice number first.");
      return;
    }

    try {
      setError("");
      const product = await loadProductFromBackend(manualDmsImportId, option.product_erp_id);
      applyProductToForm(product);
    } catch (lookupError) {
      setError(lookupError.message);
    }
  };

  const handleErpInputChange = (event, value, reason) => {
    setErpInputValue(value);
    if (reason === "clear") {
      setSelectedErpOption(null);
      setSelectedProduct(null);
      setStockForm(emptyStockForm());
      return;
    }

    if (reason === "input") {
      setSelectedErpOption(null);

      if (erpSearchTimerRef.current) {
        clearTimeout(erpSearchTimerRef.current);
      }

      if (!manualDmsImportId) {
        setErpOptions([]);
        return;
      }

      erpSearchTimerRef.current = setTimeout(() => {
        fetchDmsProducts(manualDmsImportId, value);
      }, 300);
    }
  };

  useEffect(() => {
    if (!manualModalOpen || !manualDmsImportId) {
      return undefined;
    }

    fetchDmsProducts(manualDmsImportId);

    return () => {
      if (erpSearchTimerRef.current) {
        clearTimeout(erpSearchTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualDmsImportId, manualModalOpen]);

  const handleSaveManualStock = async () => {
    if (!manualDmsImportId) {
      setError("Please select an invoice number.");
      return;
    }
    if (!selectedProduct?.product_erp_id) {
      setError("Please select an item from the invoice.");
      return;
    }
    if (!stockForm.physicalStockInCase && !stockForm.physicalStockInPcs) {
      setError("Please enter physical stock quantity (Cases or Pcs).");
      return;
    }

    setSavingManual(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API}/staff/physical-stock/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dmsImportId: manualDmsImportId,
          items: [{
            productErpId: selectedProduct.product_erp_id,
            physicalStockInCase: stockForm.physicalStockInCase,
            physicalStockInPcs: stockForm.physicalStockInPcs,
            expiredStockDate: selectedProduct.expiry_date || "",
          }],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save physical stock.");
      }

      setStockImport(data.import || null);
      setItems(data.items || []);
      setMessage(data.message || "Physical stock saved successfully.");
      if (data.import?.dms_import_id) {
        setStockListImportFilter(String(data.import.dms_import_id));
      }
      closeManualModal();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingManual(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadDmsImportId) {
      setError("Please choose a DMS stock date first.");
      return;
    }
    if (!selectedFile) {
      setError("Please choose a Physical Stock Excel or CSV file.");
      return;
    }

    const formData = new FormData();
    formData.append("dmsImportId", uploadDmsImportId);
    formData.append("file", selectedFile);
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`${API}/staff/physical-stock/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Physical stock upload failed.");
      setStockImport(data.import || null);
      setItems(data.items || []);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage(data.message || "Physical stock uploaded and calculated successfully.");
      if (data.import?.dms_import_id) {
        setStockListImportFilter(String(data.import.dms_import_id));
      }
      setUploadModalOpen(false);
      resetUploadForm();
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
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
                <MDBox>
                  <MDTypography variant="h5" fontWeight="medium" color="dark">
                    Physical Stock
                  </MDTypography>
                  <MDTypography variant="caption" color="text" display="block">
                    Use the date filter to view a specific upload. Blue columns are automatically calculated from Case, Pcs/Box, loose Pcs, and Price/Pcs.
                  </MDTypography>
                  {selectedDmsImport && (
                    <MDTypography variant="caption" color="text" display="block" mt={0.5}>
                      DMS: {formatDmsImportLabel(selectedDmsImport)}
                    </MDTypography>
                  )}
                </MDBox>
                <MDBox display="flex" gap={1} flexWrap="wrap" justifyContent="flex-end">
                  <MDButton
                    color="info"
                    variant="outlined"
                    component="a"
                    href={PHYSICAL_STOCK_TEMPLATE_URL}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    <Icon sx={{ mr: 1 }}>download</Icon>
                    Download Template
                  </MDButton>
                  <MDButton
                    color="dark"
                    variant="outlined"
                    onClick={() => fetchPhysicalStock()}
                    disabled={!selectedDmsImportId || loading}
                  >
                    <Icon sx={{ mr: 1 }}>refresh</Icon>
                    Fetch Data
                  </MDButton>
                  <MDButton color="info" variant="gradient" onClick={openUploadModal}>
                    <Icon sx={{ mr: 1 }}>cloud_upload</Icon>
                    Upload File
                  </MDButton>
                  <MDButton color="info" variant="gradient" onClick={openManualModal}>
                    <Icon sx={{ mr: 1 }}>add</Icon>
                    Manual Entry
                  </MDButton>
                </MDBox>
              </MDBox>
              <MDBox px={3} pb={3}>
                <Grid container spacing={2} mb={2} alignItems="center">
                  <Grid item xs={12} md={2}>
                    <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value={stockListImportFilter}
                        onChange={handleImportFilterChange}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="">Latest DMS Upload</MenuItem>
                        {dmsImports.map((stock) => (
                          <MenuItem key={stock.id} value={String(stock.id)}>
                            {formatDmsImportLabel(stock)}
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
                    <MDButton color="dark" variant="outlined" fullWidth onClick={() => { setStockListImportFilter(""); setDivisionFilter(""); setErpSearch(""); setProductSearch(""); }}>
                      <Icon sx={{ mr: 1 }}>filter_alt_off</Icon>Clear
                    </MDButton>
                  </Grid>
                </Grid>

                <TableContainer component={Paper} sx={stickyTableContainerSx}>
                  <Table sx={stickyTableSx(1720)}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={stickyColumnSx(0, { isHead: true, baseSx: tableHeadSx })}>Sr No</TableCell>
                        <TableCell sx={stickyColumnSx(1, { isHead: true, baseSx: tableHeadSx })}>Product ERP ID</TableCell>
                        <TableCell sx={stickyColumnSx(2, { isHead: true, baseSx: tableHeadSx })}>SKU Name</TableCell>
                        <TableCell sx={stickyColumnSx(3, { isHead: true, baseSx: tableHeadSx })}>Product Division</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Variant Name</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Pcs/Box</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Expiry Date</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Physical Stock In Case</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Physical Stock In Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#dbeafe")}>Total Physical Stock In Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Price/Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>MRP</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx, "#dbeafe")}>Total Value</TableCell>
                        <TableCell align="center" sx={stickyHeadRowSx(tableHeadSx)}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.length === 0 && (
                        <TableRow><TableCell colSpan={14} align="center" sx={tableBodySx}><MDTypography variant="button" color="text">{selectedDmsImportId ? "No Physical Stock for this DMS date. Use Upload File or Manual Entry." : "Choose a DMS stock date first."}</MDTypography></TableCell></TableRow>
                      )}
                      {items.length > 0 && filteredItems.length === 0 && (
                        <TableRow><TableCell colSpan={14} align="center" sx={tableBodySx}><MDTypography variant="button" color="text">No rows match the selected filters.</MDTypography></TableCell></TableRow>
                      )}
                      {filteredItems.map((item, index) => (
                        <TableRow key={item.id}>
                          <TableCell sx={stickyColumnSx(0, { baseSx: tableBodySx })}>{index + 1}</TableCell>
                          <TableCell sx={stickyColumnSx(1, { baseSx: tableBodySx })}>{item.product_erp_id}</TableCell>
                          <TableCell sx={stickyColumnSx(2, { baseSx: { ...tableBodySx, overflow: "hidden", textOverflow: "ellipsis" } })}>{item.product_name}</TableCell>
                          <TableCell sx={stickyColumnSx(3, { baseSx: tableBodySx })}>{item.product_division}</TableCell>
                          <TableCell sx={tableBodySx}>{item.variant_name}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.pcs_per_box)}</TableCell>
                          <TableCell sx={tableBodySx}>{formatExpiredStockDate(item.expired_stock_date)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.physical_stock_in_case)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.physical_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={calculatedCellSx}>{unitFormat(item.total_physical_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.price_per_piece)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.mrp)}</TableCell>
                          <TableCell align="right" sx={calculatedCellSx}>{money(item.total_value)}</TableCell>
                          <TableCell align="center" sx={tableBodySx}>
                            <IconButton
                              color="info"
                              size="small"
                              title="View stock history"
                              onClick={() => handleViewItemHistory(item)}
                            >
                              <Icon fontSize="small">visibility</Icon>
                            </IconButton>
                            <MDButton
                              color="info"
                              variant="text"
                              size="small"
                              onClick={() => handleEditPhysicalItem(item)}
                            >
                              <Icon fontSize="small">edit</Icon>
                            </MDButton>
                          </TableCell>
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
          Upload Physical Stock
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12}>
                <MDTypography variant="caption" color="text" display="block" mb={1}>
                  Choose the DMS stock upload (company + date), then upload the matching Physical Stock file.
                </MDTypography>
                <FormControl size="small" fullWidth>
                  <Select
                    displayEmpty
                    value={uploadDmsImportFilter}
                    onChange={(event) => {
                      setUploadDmsImportFilter(event.target.value);
                      setSelectedFile(null);
                      setMessage("");
                      setError("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    sx={{ height: 44, backgroundColor: "#fff" }}
                  >
                    <MenuItem value="">Latest DMS Upload</MenuItem>
                    {dmsImports.map((stock) => (
                      <MenuItem key={stock.id} value={String(stock.id)}>
                        {formatDmsImportLabel(stock)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <MDBox display="flex" alignItems="center" gap={1.5} sx={{ border: "1px dashed #94a3b8", borderRadius: 1, p: 1.5, backgroundColor: "#f8fafc" }}>
                  <MDButton color="info" variant="outlined" onClick={() => fileInputRef.current?.click()} disabled={!uploadDmsImportId}>
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
              {uploading && (
                <Grid item xs={12}>
                  <LinearProgress color="info" />
                </Grid>
              )}
              {message && (
                <Grid item xs={12}>
                  <MDTypography variant="button" color="success" fontWeight="medium">{message}</MDTypography>
                </Grid>
              )}
              {error && (
                <Grid item xs={12}>
                  <MDTypography variant="button" color="error" fontWeight="medium">{error}</MDTypography>
                </Grid>
              )}
            </Grid>
          </MDBox>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <MDButton color="dark" variant="outlined" onClick={closeUploadModal} disabled={uploading}>
            Cancel
          </MDButton>
          <MDButton
            color="info"
            variant="gradient"
            onClick={handleUpload}
            disabled={!uploadDmsImportId || !selectedFile || uploading}
          >
            <Icon sx={{ mr: 1 }}>cloud_upload</Icon>
            {uploading ? "Uploading" : "Upload & Calculate"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog open={manualModalOpen} onClose={closeManualModal} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontWeight: "bold", color: "#1e3a5f", backgroundColor: "#dbeafe", borderBottom: "1px solid #93c5fd" }}>
          Physical Stock Entry
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: "#f8fafc" }}>
          <MDBox sx={entryFormSx} mt={1}>
            <MDTypography variant="h6" fontWeight="bold" color="dark" mb={2}>
              Stock Entry
            </MDTypography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <MDTypography sx={fieldLabelSx}>
                  Invoice Number{requiredMark}
                </MDTypography>
                <FormControl fullWidth size="small">
                  <Select
                    displayEmpty
                    value={manualDmsImportFilter}
                    onChange={(event) => handleManualDmsImportChange(event.target.value)}
                    sx={{ backgroundColor: "#fff", height: 40 }}
                  >
                    <MenuItem value="" disabled>
                      Select Invoice Number
                    </MenuItem>
                    {dmsImports.filter((stock) => stock.invoice_number).map((stock) => (
                      <MenuItem key={stock.id} value={String(stock.id)}>
                        {stock.invoice_number}
                        {stock.company_name ? ` - ${stock.company_name}` : ""}
                        {stock.seller_name ? ` - ${stock.seller_name}` : ""}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <MDTypography sx={fieldLabelSx}>
                  Item{requiredMark}
                </MDTypography>
                <Autocomplete
                  options={erpOptions}
                  loading={erpSearchLoading}
                  value={selectedErpOption}
                  inputValue={erpInputValue}
                  onChange={handleErpOptionSelect}
                  onInputChange={handleErpInputChange}
                  disabled={!manualDmsImportId || erpSearchLoading}
                  noOptionsText={
                    manualDmsImportId
                      ? "No items found in selected invoice"
                      : "Select invoice number first"
                  }
                  getOptionLabel={(option) =>
                    `${option.product_erp_id || ""} - ${option.product_name || ""}`
                  }
                  isOptionEqualToValue={(option, value) =>
                    option.product_erp_id === value.product_erp_id
                  }
                  filterOptions={(options) => options}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id || option.product_erp_id}>
                      <MDBox>
                        <MDTypography variant="button" fontWeight="bold" color="dark">
                          {option.product_erp_id}
                        </MDTypography>
                        <MDTypography variant="caption" color="text" display="block">
                          {option.product_name}
                          {option.variant_name ? ` | ${option.variant_name}` : ""}
                          {option.pcs_per_box ? ` | ${option.pcs_per_box} pcs/box` : ""}
                        </MDTypography>
                      </MDBox>
                    </li>
                  )}
                  renderInput={(params) => (
                    <MDInput
                      {...params}
                      placeholder={
                        manualDmsImportId
                          ? "Search or select item"
                          : "Select invoice number first"
                      }
                      sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>SKU Name{requiredMark}</MDTypography>
                <MDInput
                  fullWidth
                  value={selectedProduct?.product_name || ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>Product Division</MDTypography>
                <MDInput
                  fullWidth
                  value={selectedProduct?.product_division || ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>Variant Name</MDTypography>
                <MDInput
                  fullWidth
                  value={selectedProduct?.variant_name || ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>

              {[
                ["Invoice Number", selectedProduct?.invoice_number],
                ["Seller Name", selectedProduct?.seller_name],
                ["Batch Number", selectedProduct?.batch_number],
                ["MFG Date", selectedProduct?.mfg_date],
                ["Expiry Date", selectedProduct?.expiry_date],
                ["DP Price", selectedProduct?.dp_price],
                ["Discount %", selectedProduct?.discount_percent],
                ["GST %", selectedProduct?.gst_percent],
                ["CGST", selectedProduct?.cgst_amount],
                ["SGST", selectedProduct?.sgst_amount],
                ["Retail Price", selectedProduct?.retail_price],
                ["Wholesale Price", selectedProduct?.wholesale_price],
                ["Retail Margin", selectedProduct?.retail_margin],
                ["Wholesale Margin", selectedProduct?.wholesale_margin],
              ].map(([label, value]) => (
                <Grid item xs={6} md={2} key={label}>
                  <MDTypography sx={fieldLabelSx}>{label}</MDTypography>
                  <MDInput
                    fullWidth
                    value={value ?? ""}
                    disabled
                    sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 38 } }}
                  />
                </Grid>
              ))}

              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Pcs/Box{requiredMark}</MDTypography>
                <MDInput
                  fullWidth
                  value={selectedProduct?.pcs_per_box ?? ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Physical Stock In Case{requiredMark}</MDTypography>
                <MDInput
                  fullWidth
                  type="number"
                  placeholder="0"
                  value={stockForm.physicalStockInCase}
                  onChange={(event) => updateStockForm("physicalStockInCase", event.target.value)}
                  disabled={!isProductLoaded}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Physical Stock In Pcs</MDTypography>
                <MDInput
                  fullWidth
                  type="number"
                  placeholder="0"
                  value={stockForm.physicalStockInPcs}
                  onChange={(event) => updateStockForm("physicalStockInPcs", event.target.value)}
                  disabled={!isProductLoaded}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>Total Physical Stock In Pcs</MDTypography>
                <MDInput
                  fullWidth
                  value={stockTotals.totalPhysicalStockInPcs}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#eff6ff", height: 40, fontWeight: 700 } }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>Price/Pcs{requiredMark}</MDTypography>
                <MDInput
                  fullWidth
                  value={selectedProduct?.price_per_piece ?? ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>MRP{requiredMark}</MDTypography>
                <MDInput
                  fullWidth
                  value={selectedProduct?.mrp ?? ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>Total Value</MDTypography>
                <MDInput
                  fullWidth
                  value={stockTotals.totalValue ? `Rs. ${stockTotals.totalValue}` : ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#eff6ff", height: 40, fontWeight: 700 } }}
                />
              </Grid>
            </Grid>

            <MDBox display="flex" justifyContent="flex-end" gap={1} mt={3}>
              <MDButton
                type="button"
                color="dark"
                variant="outlined"
                onClick={() => {
                  setSelectedProduct(null);
                  setStockForm(emptyStockForm());
                  setSelectedErpOption(null);
                  setErpInputValue("");
                }}
              >
                Clear
              </MDButton>
            </MDBox>
          </MDBox>

          {savingManual && (
            <MDBox mt={2}>
              <LinearProgress color="info" />
            </MDBox>
          )}
          {message && (
            <MDBox mt={2}>
              <MDTypography variant="button" color="success" fontWeight="medium">
                {message}
              </MDTypography>
            </MDBox>
          )}
          {error && (
            <MDBox mt={2}>
              <MDTypography variant="button" color="error" fontWeight="medium">
                {error}
              </MDTypography>
            </MDBox>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, backgroundColor: "#f8fafc" }}>
          <MDButton type="button" color="dark" variant="outlined" onClick={closeManualModal} disabled={savingManual}>
            Cancel
          </MDButton>
          <MDButton
            type="button"
            color="info"
            variant="gradient"
            onClick={handleSaveManualStock}
            disabled={savingManual || !isProductLoaded}
          >
            <Icon sx={{ mr: 1 }}>save</Icon>
            {savingManual ? "Saving..." : "Save Stock"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog open={historyModalOpen} onClose={closeHistoryModal} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontWeight: "bold", color: "#1e3a5f", backgroundColor: "#dbeafe", borderBottom: "1px solid #93c5fd" }}>
          Physical Stock History
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: "#f8fafc" }}>
          {historyItem && (
            <MDBox mb={2}>
              <MDTypography variant="button" fontWeight="bold" color="dark">
                {historyItem.product_erp_id} — {historyItem.product_name}
              </MDTypography>
              <MDTypography variant="caption" color="text" display="block">
                {historyItem.product_division}
                {historyItem.variant_name ? ` | ${historyItem.variant_name}` : ""}
              </MDTypography>
              <MDTypography variant="caption" color="text" display="block" mt={0.5}>
                Current stock: {unitFormat(historyItem.physical_stock_in_case)} cases, {unitFormat(historyItem.physical_stock_in_pcs)} pcs
                ({unitFormat(historyItem.total_physical_stock_in_pcs)} total pcs)
              </MDTypography>
            </MDBox>
          )}

          {loadingHistory && (
            <MDBox py={2}>
              <LinearProgress color="info" />
            </MDBox>
          )}

          {historyError && (
            <MDTypography variant="button" color="error" fontWeight="medium">
              {historyError}
            </MDTypography>
          )}

          {!loadingHistory && !historyError && groupedHistory.length === 0 && (
            <MDTypography variant="body2" color="text">
              No update history found for this item.
            </MDTypography>
          )}

          {!loadingHistory && !historyError && groupedHistory.map(([dateKey, rows]) => (
            <MDBox key={dateKey} mb={3}>
              <MDTypography variant="button" fontWeight="bold" color="dark" mb={1} display="block">
                {dateKey === "unknown" ? "Unknown Date" : formatDate(dateKey)}
              </MDTypography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                    <TableRow>
                      {["Time", "Change", "Source", "Cases", "Pcs", "Total Pcs", "Total Value"].map((heading) => (
                        <TableCell
                          key={heading}
                          align={heading === "Cases" || heading === "Pcs" || heading === "Total Pcs" || heading === "Total Value" ? "right" : "left"}
                          sx={{ ...tableHeadSx, py: 1 }}
                        >
                          {heading}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((entry) => (
                      <TableRow key={entry.id || `${entry.created_at}-${entry.change_type}`}>
                        <TableCell sx={tableBodySx}>{formatDateTime(entry.created_at)}</TableCell>
                        <TableCell sx={tableBodySx}>{formatChangeType(entry.change_type)}</TableCell>
                        <TableCell sx={tableBodySx}>{formatHistorySource(entry)}</TableCell>
                        <TableCell align="right" sx={tableBodySx}>{unitFormat(entry.physical_stock_in_case)}</TableCell>
                        <TableCell align="right" sx={tableBodySx}>{unitFormat(entry.physical_stock_in_pcs)}</TableCell>
                        <TableCell align="right" sx={calculatedCellSx}>{unitFormat(entry.total_physical_stock_in_pcs)}</TableCell>
                        <TableCell align="right" sx={tableBodySx}>{money(entry.total_value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </MDBox>
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, backgroundColor: "#f8fafc" }}>
          <MDButton color="dark" variant="outlined" onClick={closeHistoryModal}>
            Close
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default PhysicalStock;
