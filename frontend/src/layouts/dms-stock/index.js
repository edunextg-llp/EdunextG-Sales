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

const pendingTableContainerSx = {
  width: "100%",
  overflowX: "auto",
  border: "1px solid #e5e7eb",
};

const pendingTableSx = {
  tableLayout: "fixed",
  width: "100%",
  minWidth: 980,
};

const pendingHeadCellSx = (width, align = "left") => ({
  ...tableHeadSx,
  width,
  minWidth: width,
  maxWidth: width,
  textAlign: align,
});

const pendingBodyCellSx = (width, align = "left") => ({
  ...tableBodySx,
  width,
  minWidth: width,
  maxWidth: width,
  textAlign: align,
  overflow: "hidden",
  textOverflow: "ellipsis",
});

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

const emptyManualItem = () => ({
  productErpId: "",
  productName: "",
  variantName: "",
  pcsPerBox: "",
  currentStockInCase: "",
  currentStockInPcs: "",
  totalCurrentStockInPcs: "",
  pricePerPiece: "",
  purchasePrice: "",
  mrp: "",
  totalValue: "",
  priceWithGst: "",
  purchasePriceWithGst: "",
  sourceItemId: null,
});

const formatSellerItemLabel = (item) => {
  const parts = [item.product_erp_id, item.sku_name].filter(Boolean);
  if (item.variant_name) parts.push(item.variant_name);
  return parts.join(" · ");
};

const mapSellerItemToManualItem = (sellerItem) => {
  if (!sellerItem) return emptyManualItem();

  return {
    productErpId: sellerItem.product_erp_id || "",
    productName: sellerItem.sku_name || "",
    variantName: sellerItem.variant_name || "",
    pcsPerBox: sellerItem.pcs_per_box != null ? String(sellerItem.pcs_per_box) : "",
    currentStockInCase: "",
    currentStockInPcs: "",
    totalCurrentStockInPcs: "",
    pricePerPiece: "",
    purchasePrice: sellerItem.purchase_price != null ? String(sellerItem.purchase_price) : "",
    mrp: "",
    totalValue: "",
    priceWithGst: "",
    purchasePriceWithGst: sellerItem.purchase_price != null
      ? (Number(sellerItem.purchase_price) * 1.05).toFixed(2)
      : "",
    sourceItemId: sellerItem.id || null,
  };
};

const normalizeErpKey = (value) => String(value || "").trim().toLowerCase();

const calcManualTotals = (item) => {
  const pcsPerBox = Number(item.pcsPerBox) || 0;
  const currentStockInCase = Number(item.currentStockInCase) || 0;
  const currentStockInPcs = Number(item.currentStockInPcs) || 0;
  const pricePerPiece = Number(item.pricePerPiece) || 0;
  const purchasePrice = Number(item.purchasePrice) || 0;

  const totalCurrentStockInPcs = (pcsPerBox * currentStockInCase) + currentStockInPcs;
  const priceWithGst = pricePerPiece * 1.05;
  const purchasePriceWithGst = purchasePrice * 1.05;
  const totalValue = totalCurrentStockInPcs * priceWithGst;

  return {
    totalCurrentStockInPcs: totalCurrentStockInPcs ? String(totalCurrentStockInPcs) : "",
    totalValue: totalValue ? totalValue.toFixed(2) : "",
    priceWithGst: pricePerPiece ? priceWithGst.toFixed(2) : "",
    purchasePriceWithGst: purchasePrice ? purchasePriceWithGst.toFixed(2) : "",
  };
};

const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  "Content-Type": "application/json",
});

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
  const pendingIdRef = useRef(0);
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
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualCompanyId, setManualCompanyId] = useState("");
  const [manualSellerId, setManualSellerId] = useState("");
  const [manualUploadDate, setManualUploadDate] = useState(() => getTodayLocalDate());
  const [manualItem, setManualItem] = useState(emptyManualItem);
  const [pendingItems, setPendingItems] = useState([]);
  const [savingManual, setSavingManual] = useState(false);
  const [sellers, setSellers] = useState([]);
  const [sellerItems, setSellerItems] = useState([]);
  const [selectedSellerItemId, setSelectedSellerItemId] = useState("");
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [loadingSellerItems, setLoadingSellerItems] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API}/staff/companies`, { headers: getAuthHeaders() });
      if (response.ok) {
        setCompanies(await response.json());
      }
    } catch (fetchError) {
      console.error("Error fetching companies:", fetchError);
    }
  };

  const fetchManualSellers = async (companyId) => {
    if (!companyId) {
      setSellers([]);
      return;
    }

    setLoadingSellers(true);
    try {
      const response = await fetch(`${API}/staff/purchase-sellers/company/${companyId}`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      setSellers(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error("Error fetching sellers:", fetchError);
      setSellers([]);
    } finally {
      setLoadingSellers(false);
    }
  };

  const fetchManualSellerItems = async (companyId, sellerId) => {
    if (!companyId || !sellerId) {
      setSellerItems([]);
      return;
    }

    setLoadingSellerItems(true);
    try {
      const params = new URLSearchParams({
        companyId: String(companyId),
        sellerId: String(sellerId),
      });
      const response = await fetch(`${API}/staff/seller-items?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      setSellerItems(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error("Error fetching seller items:", fetchError);
      setSellerItems([]);
    } finally {
      setLoadingSellerItems(false);
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

  const resetManualForm = () => {
    pendingIdRef.current = 0;
    setManualCompanyId("");
    setManualSellerId("");
    setManualUploadDate(getTodayLocalDate());
    setManualItem(emptyManualItem());
    setPendingItems([]);
    setSellers([]);
    setSellerItems([]);
    setSelectedSellerItemId("");
    setMessage("");
    setError("");
  };

  const openManualModal = () => {
    resetManualForm();
    setManualModalOpen(true);
  };

  const closeManualModal = () => {
    setManualModalOpen(false);
    resetManualForm();
  };

  const handleManualCompanyChange = (companyId) => {
    setManualCompanyId(companyId);
    setManualSellerId("");
    setSelectedSellerItemId("");
    setSellerItems([]);
    setManualItem(emptyManualItem());
    setMessage("");
    setError("");
    fetchManualSellers(companyId);
  };

  const handleManualSellerChange = (sellerId) => {
    setManualSellerId(sellerId);
    setSelectedSellerItemId("");
    setManualItem(emptyManualItem());
    setMessage("");
    setError("");
    fetchManualSellerItems(manualCompanyId, sellerId);
  };

  const handleSellerItemSelect = (itemId) => {
    setSelectedSellerItemId(itemId);
    const sellerItem = sellerItems.find((item) => String(item.id) === String(itemId));
    setManualItem(mapSellerItemToManualItem(sellerItem));
    setMessage("Item details loaded. Enter stock and price fields below.");
  };

  const updateManualItem = (field, value) => {
    setManualItem((prev) => {
      const next = { ...prev, [field]: value };
      const totals = calcManualTotals(next);
      return { ...next, ...totals };
    });
  };

  const handleAddManualItem = () => {
    setError("");
    if (!manualCompanyId) {
      setError("Please select a company.");
      return;
    }
    if (!manualSellerId) {
      setError("Please select a seller.");
      return;
    }
    if (!selectedSellerItemId || !manualItem.productErpId.trim()) {
      setError("Please select an item.");
      return;
    }
    if (!manualItem.pcsPerBox) {
      setError("Please set '1 Box = Pieces' for this item on the Add Item page.");
      return;
    }
    if (!manualItem.currentStockInCase) {
      setError("Please enter the number of boxes.");
      return;
    }
    if (!manualItem.pricePerPiece) {
      setError("Please enter Price/Pcs.");
      return;
    }

    const totals = calcManualTotals(manualItem);
    const erpKey = normalizeErpKey(manualItem.productErpId);
    const replacingExisting = erpKey && pendingItems.some(
      (item) => normalizeErpKey(item.productErpId) === erpKey
    );
    const snapshot = {
      productErpId: String(manualItem.productErpId || "").trim(),
      productName: String(manualItem.productName || "").trim(),
      variantName: String(manualItem.variantName || "").trim(),
      pcsPerBox: manualItem.pcsPerBox,
      currentStockInCase: manualItem.currentStockInCase,
      currentStockInPcs: manualItem.currentStockInPcs,
      totalCurrentStockInPcs: totals.totalCurrentStockInPcs,
      pricePerPiece: totals.priceWithGst,
      purchasePrice: totals.purchasePriceWithGst,
      mrp: manualItem.mrp,
      totalValue: totals.totalValue,
      sourceItemId: manualItem.sourceItemId || null,
      isUpdate: replacingExisting,
    };

    setPendingItems((prev) => {
      const withoutSameErp = erpKey
        ? prev.filter((item) => normalizeErpKey(item.productErpId) !== erpKey)
        : prev;

      pendingIdRef.current += 1;
      return [
        ...withoutSameErp,
        {
          ...snapshot,
          id: `pending-${pendingIdRef.current}`,
        },
      ];
    });
    setManualItem(emptyManualItem());
    setSelectedSellerItemId("");
    setMessage(
      snapshot.isUpdate
        ? `ERP ID ${snapshot.productErpId} updated in list. Save to apply changes.`
        : `Item added. Add more items or click Save Stock.`
    );
  };

  const handleRemovePendingItem = (itemId) => {
    setPendingItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSaveManualStock = async () => {
    if (!manualCompanyId) {
      setError("Please select a company.");
      return;
    }
    if (!pendingItems.length) {
      setError("Please add at least one stock item.");
      return;
    }

    setSavingManual(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API}/staff/dms-stock/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: manualCompanyId,
          uploadDate: manualUploadDate,
          items: pendingItems.map(({ id, ...item }) => item),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save stock.");
      }

      setStockImport(data.import || null);
      setItems(data.items || []);
      setMessage(data.message || "DMS stock saved successfully.");
      await fetchImportDates();
      if (data.import?.id) {
        setStockListImportFilter(String(data.import.id));
      }
      closeManualModal();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingManual(false);
    }
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
                  <Metric label="Invoice Date" value={formatUploadDate(getImportUploadDate(stockImport))} />
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
                      Invoice Date: {formatUploadDate(getImportUploadDate(stockImport))}
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
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Invoice Date</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Variant Name</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Pcs/Box</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>No. of Boxes</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Current Stock In Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Total Current Stock In Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Price/Pcs (Incl. GST)</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>MRP (Incl. GST)</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Total Value (Incl. GST)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={13} align="center" sx={tableBodySx}>
                            <MDTypography variant="button" color="text">
                              No DMS stock uploaded yet. Click &quot;Upload File&quot; or &quot;Manual Entry&quot; to add stock.
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
          Upload DMS Stock
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
                  label="Invoice Date"
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

      <Dialog open={manualModalOpen} onClose={closeManualModal} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontWeight: "bold", color: "#1e3a5f", backgroundColor: "#dbeafe", borderBottom: "1px solid #93c5fd" }}>
          DMS Stock Entry
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: "#f8fafc" }}>
          <MDBox sx={entryFormSx} mt={1}>
            <MDTypography variant="h6" fontWeight="bold" color="dark" mb={2}>
              Stock Entry
            </MDTypography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>
                  Company{requiredMark}
                </MDTypography>
                <FormControl fullWidth size="small">
                  <Select
                    displayEmpty
                    value={manualCompanyId}
                    onChange={(event) => handleManualCompanyChange(event.target.value)}
                    sx={{ backgroundColor: "#fff", height: 40 }}
                  >
                    <MenuItem value="" disabled>
                      Select Company
                    </MenuItem>
                    {companies.map((company) => (
                      <MenuItem key={company.id} value={String(company.id)}>
                        {company.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>
                  Seller{requiredMark}
                </MDTypography>
                <FormControl fullWidth size="small" disabled={!manualCompanyId || loadingSellers}>
                  <Select
                    displayEmpty
                    value={manualSellerId}
                    onChange={(event) => handleManualSellerChange(event.target.value)}
                    sx={{ backgroundColor: "#fff", height: 40 }}
                  >
                    <MenuItem value="" disabled>
                      {loadingSellers ? "Loading sellers..." : "Select Seller"}
                    </MenuItem>
                    {sellers.map((seller) => (
                      <MenuItem key={seller.id} value={String(seller.id)}>
                        {seller.seller_name}
                        {seller.seller_code ? ` (${seller.seller_code})` : ""}
                      </MenuItem>
                    ))}
                    {manualCompanyId && !loadingSellers && sellers.length === 0 && (
                      <MenuItem disabled>No sellers found</MenuItem>
                    )}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>
                  Invoice Date{requiredMark}
                </MDTypography>
                <MDInput
                  type="date"
                  fullWidth
                  value={manualUploadDate}
                  onChange={(event) => setManualUploadDate(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
                />
              </Grid>

              <Grid item xs={12}>
                <MDTypography sx={fieldLabelSx}>
                  Select Item{requiredMark}
                </MDTypography>
                <FormControl fullWidth size="small" disabled={!manualSellerId || loadingSellerItems}>
                  <Select
                    displayEmpty
                    value={selectedSellerItemId}
                    onChange={(event) => handleSellerItemSelect(event.target.value)}
                    sx={{ backgroundColor: "#fff", height: 40 }}
                  >
                    <MenuItem value="" disabled>
                      {loadingSellerItems ? "Loading items..." : "Select Item"}
                    </MenuItem>
                    {sellerItems.map((item) => (
                      <MenuItem key={item.id} value={String(item.id)}>
                        {formatSellerItemLabel(item)}
                      </MenuItem>
                    ))}
                    {manualSellerId && !loadingSellerItems && sellerItems.length === 0 && (
                      <MenuItem disabled>No items found for this seller</MenuItem>
                    )}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>
                  Product ERP ID{requiredMark}
                </MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.productErpId}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>
                  SKU Name{requiredMark}
                </MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.productName}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>Variant Name</MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.variantName}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>
                  1 Box = Pieces
                </MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.pcsPerBox}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>No. of Boxes{requiredMark}</MDTypography>
                <MDInput
                  fullWidth
                  type="number"
                  inputProps={{ min: 0, step: 1 }}
                  placeholder="0"
                  value={manualItem.currentStockInCase}
                  onChange={(event) => updateManualItem("currentStockInCase", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Purchase Price (Incl. 5% GST)</MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.purchasePriceWithGst ? `Rs. ${manualItem.purchasePriceWithGst}` : ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Current Stock In Pcs</MDTypography>
                <MDInput
                  fullWidth
                  type="number"
                  placeholder="0"
                  value={manualItem.currentStockInPcs}
                  onChange={(event) => updateManualItem("currentStockInPcs", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Total Current Stock In Pcs</MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.totalCurrentStockInPcs}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>

              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>
                  Base Price/Pcs{requiredMark}
                </MDTypography>
                <MDInput
                  fullWidth
                  type="number"
                  placeholder="0.00"
                  value={manualItem.pricePerPiece}
                  onChange={(event) => updateManualItem("pricePerPiece", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Price/Pcs (Incl. 5% GST)</MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.priceWithGst ? `Rs. ${manualItem.priceWithGst}` : ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>
                  MRP (Incl. GST){requiredMark}
                </MDTypography>
                <MDInput
                  fullWidth
                  type="number"
                  placeholder="0.00"
                  value={manualItem.mrp}
                  onChange={(event) => updateManualItem("mrp", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Total Value (Incl. 5% GST)</MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.totalValue ? `Rs. ${manualItem.totalValue}` : ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
            </Grid>

            <MDBox display="flex" justifyContent="flex-end" gap={1} mt={3}>
              <MDButton type="button" color="dark" variant="outlined" onClick={() => {
                setManualItem(emptyManualItem());
                setSelectedSellerItemId("");
              }}>
                Clear Row
              </MDButton>
              <MDButton type="button" color="info" variant="gradient" onClick={handleAddManualItem}>
                <Icon sx={{ mr: 0.5 }}>add</Icon>
                Add
              </MDButton>
            </MDBox>
          </MDBox>

          {pendingItems.length > 0 && (
            <MDBox mt={3}>
              <MDTypography variant="button" fontWeight="bold" color="dark" mb={1} display="block">
                Items to Save ({pendingItems.length})
              </MDTypography>
              <TableContainer component={Paper} variant="outlined" sx={pendingTableContainerSx}>
                <Table size="small" sx={pendingTableSx}>
                  <colgroup>
                    <col style={{ width: 100 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 70 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 70 }} />
                  </colgroup>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#f1f5f9" }}>
                      <TableCell sx={pendingHeadCellSx(100)}>ERP ID</TableCell>
                      <TableCell sx={pendingHeadCellSx(140)}>SKU Name</TableCell>
                      <TableCell sx={pendingHeadCellSx(100)}>Variant</TableCell>
                      <TableCell sx={pendingHeadCellSx(80, "right")}>Pcs/Box</TableCell>
                      <TableCell sx={pendingHeadCellSx(70, "right")}>Boxes</TableCell>
                      <TableCell sx={pendingHeadCellSx(70, "right")}>Pcs</TableCell>
                      <TableCell sx={pendingHeadCellSx(90, "right")}>Total Pcs</TableCell>
                      <TableCell sx={pendingHeadCellSx(100, "right")}>Price/Pcs + GST</TableCell>
                      <TableCell sx={pendingHeadCellSx(90, "right")}>MRP Incl. GST</TableCell>
                      <TableCell sx={pendingHeadCellSx(110, "right")}>Total Incl. GST</TableCell>
                      <TableCell sx={pendingHeadCellSx(70, "center")}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pendingItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell sx={pendingBodyCellSx(100)} title={item.productErpId}>
                          {item.productErpId}
                          {item.isUpdate && (
                            <MDTypography variant="caption" color="info" display="block">
                              Update
                            </MDTypography>
                          )}
                        </TableCell>
                        <TableCell sx={pendingBodyCellSx(140)} title={item.productName}>
                          {item.productName}
                        </TableCell>
                        <TableCell sx={pendingBodyCellSx(100)} title={item.variantName || ""}>
                          {item.variantName || "—"}
                        </TableCell>
                        <TableCell sx={pendingBodyCellSx(80, "right")}>{item.pcsPerBox}</TableCell>
                        <TableCell sx={pendingBodyCellSx(70, "right")}>{item.currentStockInCase}</TableCell>
                        <TableCell sx={pendingBodyCellSx(70, "right")}>{item.currentStockInPcs || 0}</TableCell>
                        <TableCell sx={pendingBodyCellSx(90, "right")}>{item.totalCurrentStockInPcs}</TableCell>
                        <TableCell sx={pendingBodyCellSx(100, "right")}>{money(item.pricePerPiece)}</TableCell>
                        <TableCell sx={pendingBodyCellSx(90, "right")}>{money(item.mrp)}</TableCell>
                        <TableCell sx={{ ...pendingBodyCellSx(110, "right"), fontWeight: 700 }}>
                          {money(item.totalValue)}
                        </TableCell>
                        <TableCell sx={pendingBodyCellSx(70, "center")}>
                          <MDButton
                            color="error"
                            variant="text"
                            size="small"
                            onClick={() => handleRemovePendingItem(item.id)}
                          >
                            <Icon fontSize="small">delete</Icon>
                          </MDButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </MDBox>
          )}

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
            disabled={savingManual || !pendingItems.length}
          >
            <Icon sx={{ mr: 1 }}>save</Icon>
            {savingManual ? "Saving..." : "Save Stock"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default DmsStock;
