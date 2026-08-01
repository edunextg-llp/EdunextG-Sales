import { useEffect, useMemo, useRef, useState } from "react";

import Card from "@mui/material/Card";
import Autocomplete from "@mui/material/Autocomplete";
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
import TextField from "@mui/material/TextField";

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
const MANUAL_DMS_DRAFT_KEY = "dms-manual-stock-draft";
const INCLUDED_GST_FACTOR = 1.05;

const loadManualDmsDraft = () => {
  try {
    const saved = localStorage.getItem(MANUAL_DMS_DRAFT_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error("Unable to restore DMS manual-entry draft:", error);
    return null;
  }
};

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

const PENDING_TABLE_COLUMNS = [
  { width: 120, align: "left", head: "ERP ID" },
  { width: 160, align: "left", head: "SKU Name" },
  { width: 120, align: "left", head: "Variant" },
  { width: 100, align: "left", head: "Batch" },
  { width: 80, align: "right", head: "Pcs/Box" },
  { width: 70, align: "right", head: "Boxes" },
  { width: 70, align: "right", head: "Pcs" },
  { width: 90, align: "right", head: "Total Pcs" },
  { width: 100, align: "right", head: "Price/Pcs + GST" },
  { width: 90, align: "right", head: "MRP Incl. GST" },
  { width: 110, align: "right", head: "Total Incl. GST" },
  { width: 100, align: "right", head: "Purchase Price" },
  { width: 110, align: "right", head: "Actual +5% GST" },
  { width: 110, align: "left", head: "MFG Date" },
  { width: 120, align: "left", head: "Expiry Date" },
  { width: 100, align: "center", head: "Action" },
];

const PENDING_TABLE_WIDTH = PENDING_TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0);

const pendingTableContainerSx = {
  width: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  border: "1px solid #e5e7eb",
};

const pendingTableSx = {
  tableLayout: "fixed",
  width: PENDING_TABLE_WIDTH,
  minWidth: "100%",
};

const pendingCellSx = (width, align = "left", extra = {}) => ({
  px: 2,
  py: 1,
  width,
  minWidth: width,
  maxWidth: width,
  textAlign: align,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
  boxSizing: "border-box",
  ...extra,
});

const pendingHeadCellSx = (width, align = "left") => ({
  ...pendingCellSx(width, align),
  color: "#6b7280",
  fontSize: "0.72rem",
  fontWeight: 700,
  textTransform: "none",
  borderBottom: "2px solid #e5e7eb",
  backgroundColor: "#f1f5f9",
});

const pendingBodyCellSx = (width, align = "left") => ({
  ...pendingCellSx(width, align),
  fontSize: "0.78rem",
  color: "#374151",
  borderBottom: "1px solid #f3f4f6",
});

// alias – some cells previously used a different helper
const pendingBodyCellFullSx = pendingBodyCellSx;

const buildSellerItemOption = (item) => ({
  id: item.id,
  product_erp_id: item.product_erp_id || item.productErpId || "",
  sku_name: item.sku_name || item.productName || "",
  variant_name: item.variant_name || item.variantName || "",
  pcs_per_box: item.pcs_per_box ?? item.pcsPerBox ?? "",
});

const findSellerItemByErp = (items, productErpId) =>
  items.find(
    (entry) => normalizeErpKey(entry.product_erp_id) === normalizeErpKey(productErpId)
  ) || null;

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
  batchNumber: "",
  mfgDate: "",
  expiryDate: "",
  dpPrice: "",
  discountPercent: "0",
  gstPercent: "5",
  price: "",
  discountAmount: "",
  taxableAmount: "",
  dpPriceAfterDiscount: "",
  cgstAmount: "",
  sgstAmount: "",
  retailPrice: "",
  wholesalePrice: "",
  retailMargin: "",
  wholesaleMargin: "",
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
    purchasePrice: "",
    batchNumber: "",
    mfgDate: "",
    expiryDate: "",
    dpPrice: "",
    discountPercent: "0",
    gstPercent: "5",
    price: "",
    discountAmount: "",
    taxableAmount: "",
    dpPriceAfterDiscount: "",
    cgstAmount: "",
    sgstAmount: "",
    retailPrice: "",
    wholesalePrice: "",
    retailMargin: "",
    wholesaleMargin: "",
    mrp: "",
    totalValue: "",
    priceWithGst: "",
    purchasePriceWithGst: "",
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
  const dpPrice = Number(item.dpPrice) || 0;
  const discountPercent = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
  const retailPrice = Number(item.retailPrice) || 0;
  const wholesalePrice = Number(item.wholesalePrice) || 0;
  const retailPriceExcludingGst = retailPrice / INCLUDED_GST_FACTOR;
  const wholesalePriceExcludingGst = wholesalePrice / INCLUDED_GST_FACTOR;

  const totalCurrentStockInPcs = (pcsPerBox * currentStockInCase) + currentStockInPcs;
  const priceWithGst = pricePerPiece * 1.05;
  const purchasePriceWithGst = purchasePrice * 1.05;
  const price = dpPrice * totalCurrentStockInPcs;
  const discountAmount = price * discountPercent / 100;
  const taxableAmount = price - discountAmount;
  const dpPriceAfterDiscount = dpPrice * (1 - discountPercent / 100);
  const cgstAmount = taxableAmount * 0.025;
  const sgstAmount = taxableAmount * 0.025;
  const totalValue = taxableAmount + cgstAmount + sgstAmount;

  return {
    totalCurrentStockInPcs: totalCurrentStockInPcs ? String(totalCurrentStockInPcs) : "",
    totalValue: totalValue ? totalValue.toFixed(4) : "",
    priceWithGst: pricePerPiece ? priceWithGst.toFixed(2) : "",
    purchasePriceWithGst: purchasePrice ? purchasePriceWithGst.toFixed(2) : "",
    price: price ? price.toFixed(2) : "",
    discountAmount: discountAmount ? discountAmount.toFixed(2) : "0.00",
    taxableAmount: taxableAmount ? taxableAmount.toFixed(2) : "",
    dpPriceAfterDiscount: dpPrice ? dpPriceAfterDiscount.toFixed(4) : "",
    cgstAmount: cgstAmount ? cgstAmount.toFixed(2) : "",
    sgstAmount: sgstAmount ? sgstAmount.toFixed(2) : "",
    retailMargin: retailPrice && dpPrice ? (retailPriceExcludingGst - dpPrice).toFixed(2) : "",
    wholesaleMargin: wholesalePrice && dpPrice
      ? (wholesalePriceExcludingGst - dpPrice).toFixed(2)
      : "",
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
  const restoredDraftRef = useRef(loadManualDmsDraft());
  const restoredDraft = restoredDraftRef.current;
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
  const [manualModalOpen, setManualModalOpen] = useState(Boolean(restoredDraft));
  const [manualCompanyId, setManualCompanyId] = useState(restoredDraft?.manualCompanyId || "");
  const [manualSellerId, setManualSellerId] = useState(restoredDraft?.manualSellerId || "");
  const [manualUploadDate, setManualUploadDate] = useState(
    restoredDraft?.manualUploadDate || getTodayLocalDate()
  );
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState(
    restoredDraft?.manualInvoiceNumber || ""
  );
  const [manualItem, setManualItem] = useState(restoredDraft?.manualItem || emptyManualItem());
  const [pendingItems, setPendingItems] = useState(
    Array.isArray(restoredDraft?.pendingItems) ? restoredDraft.pendingItems : []
  );
  const [savingManual, setSavingManual] = useState(false);
  const [isEditingPending, setIsEditingPending] = useState(false);
  const [editingPendingId, setEditingPendingId] = useState(null);
  const [sellers, setSellers] = useState([]);
  const [sellerItems, setSellerItems] = useState([]);
  const [selectedSellerItemId, setSelectedSellerItemId] = useState(
    restoredDraft?.selectedSellerItemId || ""
  );
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
    if (!manualModalOpen) {
      localStorage.removeItem(MANUAL_DMS_DRAFT_KEY);
      return;
    }

    localStorage.setItem(MANUAL_DMS_DRAFT_KEY, JSON.stringify({
      manualCompanyId,
      manualSellerId,
      manualUploadDate,
      manualInvoiceNumber,
      manualItem,
      pendingItems,
      selectedSellerItemId,
    }));
  }, [
    manualCompanyId,
    manualInvoiceNumber,
    manualItem,
    manualModalOpen,
    manualSellerId,
    manualUploadDate,
    pendingItems,
    selectedSellerItemId,
  ]);

  useEffect(() => {
    if (!manualModalOpen || !restoredDraft) return;
    pendingIdRef.current = pendingItems.length;
    if (manualCompanyId) fetchManualSellers(manualCompanyId);
    if (manualCompanyId && manualSellerId) {
      fetchManualSellerItems(manualCompanyId, manualSellerId);
    }
    // Restore remote dropdown choices once after a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLatestStock(stockListImportFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockListImportFilter]);

  const uploadDisabled = useMemo(
    () => !selectedFile || !uploadDate || !selectedCompanyId || uploading,
    [selectedFile, uploadDate, selectedCompanyId, uploading]
  );

  const sellerItemOptions = useMemo(() => {
    const options = [...sellerItems];
    if (!manualItem.productErpId) return options;

    const hasSelectedMatch = selectedSellerItemId
      && options.some((entry) => String(entry.id) === String(selectedSellerItemId));
    const hasErpMatch = options.some(
      (entry) => normalizeErpKey(entry.product_erp_id) === normalizeErpKey(manualItem.productErpId)
    );

    if (!hasSelectedMatch && !hasErpMatch && manualItem.productName) {
      options.unshift(buildSellerItemOption({
        id: selectedSellerItemId || `edit-${normalizeErpKey(manualItem.productErpId)}`,
        productErpId: manualItem.productErpId,
        productName: manualItem.productName,
        variantName: manualItem.variantName,
        pcsPerBox: manualItem.pcsPerBox,
      }));
    }

    return options;
  }, [manualItem, selectedSellerItemId, sellerItems]);

  const selectedSellerItem = useMemo(() => {
    if (!manualItem.productErpId) return null;

    if (selectedSellerItemId) {
      const selectedMatch = sellerItemOptions.find(
        (entry) => String(entry.id) === String(selectedSellerItemId)
      );
      if (selectedMatch) return selectedMatch;
    }

    return findSellerItemByErp(sellerItemOptions, manualItem.productErpId)
      || sellerItemOptions.find(
        (entry) => String(entry.id) === `edit-${normalizeErpKey(manualItem.productErpId)}`
      )
      || null;
  }, [manualItem.productErpId, selectedSellerItemId, sellerItemOptions]);

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
    setManualInvoiceNumber("");
    setManualItem(emptyManualItem());
    setPendingItems([]);
    setSellers([]);
    setSellerItems([]);
    setSelectedSellerItemId("");
    setIsEditingPending(false);
    setEditingPendingId(null);
    setMessage("");
    setError("");
  };

  const cancelPendingEdit = () => {
    setManualItem(emptyManualItem());
    setSelectedSellerItemId("");
    setIsEditingPending(false);
    setEditingPendingId(null);
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
    setIsEditingPending(false);
    setEditingPendingId(null);
    setMessage("");
    setError("");
    fetchManualSellers(companyId);
  };

  const handleManualSellerChange = (sellerId) => {
    setManualSellerId(sellerId);
    setSelectedSellerItemId("");
    setManualItem(emptyManualItem());
    setIsEditingPending(false);
    setEditingPendingId(null);
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
    if (!manualInvoiceNumber.trim()) {
      setError("Please enter the invoice number.");
      return;
    }
    if (!manualSellerId) {
      setError("Please select a seller.");
      return;
    }
    if (!manualItem.productErpId.trim()) {
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
    if (!manualItem.batchNumber.trim() || !manualItem.mfgDate || !manualItem.expiryDate) {
      setError("Please enter Batch Number, MFG Date, and Expiry Date.");
      return;
    }
    if (manualItem.mfgDate > manualItem.expiryDate) {
      setError("Expiry Date must be after MFG Date.");
      return;
    }
    if (!manualItem.mrp || Number(manualItem.mrp) <= 0) {
      setError("Please enter a valid MRP.");
      return;
    }
    if ((Number(manualItem.retailPrice) / INCLUDED_GST_FACTOR) < Number(manualItem.dpPrice)
      || (Number(manualItem.wholesalePrice) / INCLUDED_GST_FACTOR) < Number(manualItem.dpPrice)) {
      setError("Retail and Wholesale Price excluding included 5% GST must be at least DP Price.");
      return;
    }

    const totals = calcManualTotals(manualItem);
    const erpKey = normalizeErpKey(manualItem.productErpId);
    const replacingExisting = erpKey && pendingItems.some(
      (item) => normalizeErpKey(item.productErpId) === erpKey && item.id !== editingPendingId
    );
    const snapshot = {
      productErpId: String(manualItem.productErpId || "").trim(),
      productName: String(manualItem.productName || "").trim(),
      variantName: String(manualItem.variantName || "").trim(),
      pcsPerBox: manualItem.pcsPerBox,
      currentStockInCase: manualItem.currentStockInCase,
      currentStockInPcs: manualItem.currentStockInPcs,
      totalCurrentStockInPcs: totals.totalCurrentStockInPcs,
      pricePerPiece: manualItem.dpPrice,
      purchasePrice: manualItem.dpPrice,
      batchNumber: manualItem.batchNumber,
      mfgDate: manualItem.mfgDate,
      expiryDate: manualItem.expiryDate,
      dpPrice: manualItem.dpPrice,
      discountPercent: manualItem.discountPercent,
      gstPercent: "5",
      price: totals.price,
      discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      retailPrice: manualItem.retailPrice,
      wholesalePrice: manualItem.wholesalePrice,
      retailMargin: totals.retailMargin,
      wholesaleMargin: totals.wholesaleMargin,
      mrp: manualItem.mrp,
      totalValue: totals.totalValue,
      sourceItemId: manualItem.sourceItemId || null,
      sourceDmsItemId: manualItem.sourceDmsItemId || null,
      isUpdate: replacingExisting,
    };

    setPendingItems((prev) => {
      if (editingPendingId) {
        return prev.map((item) => (
          item.id === editingPendingId ? { ...snapshot, id: editingPendingId } : item
        ));
      }

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
    setIsEditingPending(false);
    setEditingPendingId(null);
    setMessage(
      snapshot.isUpdate
        ? `ERP ID ${snapshot.productErpId} updated in list. Save to apply changes.`
        : `Item added. Add more items or click Save Stock.`
    );
  };

  const handleEditPendingItem = (item) => {
    const restored = { ...emptyManualItem(), ...item };
    const totals = calcManualTotals(restored);
    setManualItem({ ...restored, ...totals });

    const itemId = item.sourceItemId != null ? String(item.sourceItemId) : "";
    setSelectedSellerItemId(itemId);

    // Ensure the option exists in the dropdown even if sellerItems wasn't cached
    if (itemId) {
      setSellerItems((prev) => {
        if (prev.some((si) => String(si.id) === itemId)) return prev;
        return [...prev, {
          id: item.sourceItemId,
          product_erp_id: item.productErpId,
          sku_name: item.productName,
          variant_name: item.variantName,
          pcs_per_box: item.pcsPerBox,
        }];
      });
    }

    setIsEditingPending(true);
    setEditingPendingId(item.id);
    setMessage(`Editing "${item.productName || item.productErpId}" — update fields and click Save.`);
  };

  const handleRemovePendingItem = async (item) => {
    if (item.sourceDmsItemId) {
      if (!window.confirm(`Delete ${item.productName} from this invoice?`)) return;
      try {
        const response = await fetch(`${API}/staff/dms-stock/items/${item.sourceDmsItemId}`, {
          method: "DELETE",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to delete item.");
        setStockImport(data.import || null);
        setItems(data.items || []);
      } catch (deleteError) {
        setError(deleteError.message);
        return;
      }
    }
    setPendingItems((prev) => prev.filter((entry) => entry.id !== item.id));
  };

  const handleSaveManualStock = async () => {
    if (!manualCompanyId) {
      setError("Please select a company.");
      return;
    }
    if (!manualInvoiceNumber.trim()) {
      setError("Please enter the invoice number.");
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
          sellerId: manualSellerId,
          invoiceNumber: manualInvoiceNumber.trim(),
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
                  <Metric label="Entry Code" value={stockImport.entry_code || "N/A"} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Metric label="Invoice Number" value={stockImport.invoice_number || "N/A"} />
                </Grid>
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
                    Item List
                  </MDTypography>
                  <MDTypography variant="caption" color="text" display="block" mt={0.5}>
                    Showing up to 200 saved rows per upload. Use the date filter to view a specific upload.
                  </MDTypography>
                  {stockImport && (
                    <MDTypography variant="caption" color="text" display="block" mt={0.5}>
                      Invoice Date: {formatUploadDate(getImportUploadDate(stockImport))}
                      {stockImport.invoice_number ? ` | Invoice No: ${stockImport.invoice_number}` : ""}
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
                            {entry.invoice_number ? ` - Inv: ${entry.invoice_number}` : ""}
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
                  <Table sx={stickyTableSx(2900)}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={stickyColumnSx(0, { isHead: true, baseSx: tableHeadSx })}>Sr No</TableCell>
                        <TableCell sx={stickyColumnSx(1, { isHead: true, baseSx: tableHeadSx })}>Product ERP ID</TableCell>
                        <TableCell sx={stickyColumnSx(2, { isHead: true, baseSx: tableHeadSx })}>SKU Name</TableCell>
                        <TableCell sx={stickyColumnSx(3, { isHead: true, baseSx: tableHeadSx })}>Company</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Invoice Date</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Variant Name</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Batch Number</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>MFG Date</TableCell>
                        <TableCell sx={stickyHeadRowSx(tableHeadSx)}>Expiry Date</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Pcs/Box</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>No. of Boxes</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Current Stock In Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Total Current Stock In Pcs</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>MRP</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Discount Price</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>DP Price - Discount %</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>DP Price</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Discount %</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>GST %</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>CGST</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>SGST</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Total Price</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Retail Price (Incl. GST)</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Wholesale Price (Incl. GST)</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Retail Margin (Excl. GST)</TableCell>
                        <TableCell align="right" sx={stickyHeadRowSx(tableHeadSx)}>Wholesale Margin (Excl. GST)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={26} align="center" sx={tableBodySx}>
                            <MDTypography variant="button" color="text">
                              No DMS stock uploaded yet. Click &quot;Upload File&quot; or &quot;Manual Entry&quot; to add stock.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
                      )}
                      {items.length > 0 && filteredItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={26} align="center" sx={tableBodySx}>
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
                          <TableCell sx={tableBodySx}>{item.batch_number || "—"}</TableCell>
                          <TableCell sx={tableBodySx}>{formatUploadDate(item.mfg_date)}</TableCell>
                          <TableCell sx={tableBodySx}>{formatUploadDate(item.expiry_date)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.pcs_per_box)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.current_stock_in_case)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.current_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.total_current_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.mrp)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>
                            {money(
                              Number(item.dp_price)
                              * Number(item.total_current_stock_in_pcs || 0)
                              * (1 - Number(item.discount_percent || 0) / 100)
                            )}
                          </TableCell>
                          <TableCell align="right" sx={tableBodySx}>
                            {(
                              Number(item.dp_price)
                              * (1 - Number(item.discount_percent || 0) / 100)
                            ).toFixed(4)}
                          </TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.dp_price)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{numberFormat(item.discount_percent)}%</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{numberFormat(item.gst_percent)}%</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.cgst_amount)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.sgst_amount)}</TableCell>
                          <TableCell align="right" sx={{ ...tableBodySx, fontWeight: 700 }}>{money(item.total_value)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.retail_price)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.wholesale_price)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.retail_margin)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{money(item.wholesale_margin)}</TableCell>
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

      <Dialog
        open={manualModalOpen}
        onClose={closeManualModal}
        fullWidth
        maxWidth="xl"
        PaperProps={{ sx: { width: "95vw", maxWidth: "95vw", mx: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: "bold", color: "#1e3a5f", backgroundColor: "#dbeafe", borderBottom: "1px solid #93c5fd" }}>
          DMS Stock Entry
        </DialogTitle>
        <DialogContent dividers sx={{ backgroundColor: "#f8fafc" }}>
          <MDBox sx={entryFormSx} mt={1}>
            <MDTypography variant="h6" fontWeight="bold" color="dark" mb={2}>
              Stock Entry
            </MDTypography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
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
              <Grid item xs={12} md={3}>
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
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>
                  Invoice Number{requiredMark}
                </MDTypography>
                <MDInput
                  fullWidth
                  placeholder="Enter invoice number"
                  value={manualInvoiceNumber}
                  onChange={(event) => setManualInvoiceNumber(event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
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

              <Grid item xs={12} md={4}>
                <MDTypography sx={fieldLabelSx}>
                  Select Item{requiredMark}
                </MDTypography>
                <Autocomplete
                  fullWidth
                  size="small"
                  disabled={!manualSellerId || loadingSellerItems}
                  loading={loadingSellerItems}
                  options={sellerItemOptions}
                  value={selectedSellerItem}
                  getOptionLabel={(item) => formatSellerItemLabel(item)}
                  isOptionEqualToValue={(option, value) => (
                    String(option.id) === String(value.id)
                    || (
                      normalizeErpKey(option.product_erp_id) === normalizeErpKey(value.product_erp_id)
                      && (option.sku_name || "") === (value.sku_name || "")
                    )
                  )}
                  onChange={(event, item) => handleSellerItemSelect(item?.id || "")}
                  noOptionsText={manualSellerId ? "No matching items" : "Select seller first"}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder={loadingSellerItems
                        ? "Loading items..."
                        : "Search ERP ID, item name, or variant"}
                      sx={{
                        backgroundColor: "#fff",
                        "& .MuiOutlinedInput-root": { height: 40 },
                      }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} md={3}>
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
              <Grid item xs={12} md={2}>
                <MDTypography sx={fieldLabelSx}>
                  SKU Name{requiredMark}
                </MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.productName}
                  disabled
                  inputProps={{ title: manualItem.productName }}
                  sx={{
                    "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 },
                    "& input": { overflow: "hidden", textOverflow: "ellipsis" },
                  }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Variant Name</MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.variantName}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>

              <Grid item xs={6} md={1}>
                <MDTypography sx={fieldLabelSx}>
                  1 Box = Pieces
                </MDTypography>
                <MDInput
                  fullWidth
                  value={manualItem.pcsPerBox ? Math.trunc(Number(manualItem.pcsPerBox)) : ""}
                  disabled
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 36 } }}
                />
              </Grid>
              <Grid item xs={6} md={1}>
                <MDTypography sx={fieldLabelSx}>No. of Boxes{requiredMark}</MDTypography>
                <MDInput
                  fullWidth
                  type="number"
                  inputProps={{ min: 0, step: 1 }}
                  placeholder="0"
                  value={manualItem.currentStockInCase}
                  onChange={(event) => updateManualItem("currentStockInCase", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 36 } }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>Batch Number</MDTypography>
                <MDInput fullWidth value={manualItem.batchNumber}
                  onChange={(event) => updateManualItem("batchNumber", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <MDTypography sx={fieldLabelSx}>MFG Date{requiredMark}</MDTypography>
                <MDInput
                  fullWidth
                  type="date"
                  value={manualItem.mfgDate}
                  onChange={(event) => updateManualItem("mfgDate", event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }}
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
                <MDTypography sx={fieldLabelSx}>Expiry Date{requiredMark}</MDTypography>
                <MDInput fullWidth type="date" value={manualItem.expiryDate}
                  onChange={(event) => updateManualItem("expiryDate", event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }} />
              </Grid>

              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>MRP{requiredMark}</MDTypography>
                <MDInput fullWidth type="number" value={manualItem.mrp}
                  onChange={(event) => updateManualItem("mrp", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>DP Price</MDTypography>
                <MDInput fullWidth type="number" value={manualItem.dpPrice}
                  onChange={(event) => updateManualItem("dpPrice", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>Discount %</MDTypography>
                <MDInput fullWidth type="number" inputProps={{ min: 0, max: 100 }}
                  value={manualItem.discountPercent}
                  onChange={(event) => updateManualItem("discountPercent", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>DP Price - Discount %</MDTypography>
                <MDInput
                  fullWidth
                  disabled
                  value={
                    manualItem.dpPriceAfterDiscount !== ""
                      && manualItem.dpPriceAfterDiscount != null
                      ? manualItem.dpPriceAfterDiscount
                      : ""
                  }
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>
              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>Price (DP × Qty)</MDTypography>
                <MDInput
                  fullWidth
                  disabled
                  value={manualItem.price !== "" && manualItem.price != null ? `Rs. ${manualItem.price}` : ""}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>

              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>Discount Price</MDTypography>
                <MDInput
                  fullWidth
                  disabled
                  value={
                    manualItem.taxableAmount !== "" && manualItem.taxableAmount != null
                      ? `Rs. ${manualItem.taxableAmount}`
                      : ""
                  }
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }}
                />
              </Grid>

              {[
                ["GST", "5%"],
                ["CGST (2.5%)", manualItem.cgstAmount ? `Rs. ${manualItem.cgstAmount}` : ""],
                ["SGST (2.5%)", manualItem.sgstAmount ? `Rs. ${manualItem.sgstAmount}` : ""],
                ["Total Price", manualItem.totalValue ? `Rs. ${manualItem.totalValue}` : ""],
              ].map(([label, value]) => (
                <Grid item xs={6} md={2} key={label}>
                  <MDTypography sx={fieldLabelSx}>{label}</MDTypography>
                  <MDInput fullWidth disabled value={value}
                    sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }} />
                </Grid>
              ))}
              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>Retail Price (Incl. 5% GST)</MDTypography>
                <MDInput fullWidth type="number" value={manualItem.retailPrice}
                  onChange={(event) => updateManualItem("retailPrice", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>Wholesale Price (Incl. 5% GST)</MDTypography>
                <MDInput fullWidth type="number" value={manualItem.wholesalePrice}
                  onChange={(event) => updateManualItem("wholesalePrice", event.target.value)}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#fff", height: 40 } }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>Retail Margin (Excl. GST)</MDTypography>
                <MDInput fullWidth disabled value={manualItem.retailMargin ? `Rs. ${manualItem.retailMargin}` : ""}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }} />
              </Grid>
              <Grid item xs={6} md={2}>
                <MDTypography sx={fieldLabelSx}>Wholesale Margin (Excl. GST)</MDTypography>
                <MDInput fullWidth disabled value={manualItem.wholesaleMargin ? `Rs. ${manualItem.wholesaleMargin}` : ""}
                  sx={{ "& .MuiInputBase-root": { backgroundColor: "#f1f5f9", height: 40 } }} />
              </Grid>
            </Grid>

            <MDBox display="flex" justifyContent="flex-end" gap={1} mt={3}>
              <MDButton type="button" color="dark" variant="outlined" onClick={() => {
                if (isEditingPending) {
                  cancelPendingEdit();
                  return;
                }
                setManualItem(emptyManualItem());
                setSelectedSellerItemId("");
              }}>
                {isEditingPending ? "Cancel Edit" : "Clear Row"}
              </MDButton>
              <MDButton
                type="button"
                color={isEditingPending ? "success" : "info"}
                variant="gradient"
                onClick={handleAddManualItem}
              >
                <Icon sx={{ mr: 0.5 }}>{isEditingPending ? "save" : "add"}</Icon>
                {isEditingPending ? "Save" : "Add"}
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
                    {PENDING_TABLE_COLUMNS.map((column) => (
                      <col key={column.head} style={{ width: column.width }} />
                    ))}
                  </colgroup>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#f1f5f9" }}>
                      {PENDING_TABLE_COLUMNS.map((column) => (
                        <TableCell key={column.head} sx={pendingHeadCellSx(column.width, column.align)}>
                          {column.head}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pendingItems.map((item) => (
                      <TableRow
                        key={item.id}
                        sx={editingPendingId === item.id ? { backgroundColor: "#eff6ff" } : undefined}
                      >
                        <TableCell sx={pendingBodyCellFullSx(120)} title={item.productErpId}>
                          {item.productErpId}
                          {editingPendingId === item.id && (
                            <MDTypography variant="caption" color="success" display="block">
                              Editing
                            </MDTypography>
                          )}
                          {item.isUpdate && editingPendingId !== item.id && (
                            <MDTypography variant="caption" color="info" display="block">
                              Update
                            </MDTypography>
                          )}
                        </TableCell>
                        <TableCell sx={pendingBodyCellFullSx(160)} title={item.productName}>
                          {item.productName}
                        </TableCell>
                        <TableCell sx={pendingBodyCellFullSx(120)} title={item.variantName || ""}>
                          {item.variantName || "—"}
                        </TableCell>
                        <TableCell sx={pendingBodyCellFullSx(100)} title={item.batchNumber || ""}>
                          {item.batchNumber || "—"}
                        </TableCell>
                        <TableCell sx={pendingBodyCellSx(80, "right")}>
                          {item.pcsPerBox ? Math.trunc(Number(item.pcsPerBox)) : 0}
                        </TableCell>
                        <TableCell sx={pendingBodyCellSx(70, "right")}>{item.currentStockInCase}</TableCell>
                        <TableCell sx={pendingBodyCellSx(70, "right")}>{item.currentStockInPcs || 0}</TableCell>
                        <TableCell sx={pendingBodyCellSx(90, "right")}>{item.totalCurrentStockInPcs}</TableCell>
                        <TableCell sx={pendingBodyCellSx(100, "right")}>{money(item.pricePerPiece)}</TableCell>
                        <TableCell sx={pendingBodyCellSx(90, "right")}>{money(item.mrp)}</TableCell>
                        <TableCell sx={{ ...pendingBodyCellSx(110, "right"), fontWeight: 700 }}>
                          {money(item.totalValue)}
                        </TableCell>
                        <TableCell sx={pendingBodyCellSx(100, "right")}>{money(item.purchasePrice)}</TableCell>
                        <TableCell sx={pendingBodyCellSx(110, "right")}>
                          {money(Number(item.purchasePrice) * 1.05)}
                        </TableCell>
                        <TableCell sx={pendingBodyCellFullSx(110)}>{formatUploadDate(item.mfgDate)}</TableCell>
                        <TableCell sx={pendingBodyCellFullSx(120)}>{formatUploadDate(item.expiryDate)}</TableCell>
                        <TableCell sx={pendingBodyCellSx(100, "center")}>
                          {editingPendingId === item.id ? (
                            <>
                              <MDButton
                                color="success"
                                variant="text"
                                size="small"
                                onClick={handleAddManualItem}
                                title="Save changes"
                              >
                                <Icon fontSize="small">save</Icon>
                              </MDButton>
                              <MDButton
                                color="dark"
                                variant="text"
                                size="small"
                                onClick={cancelPendingEdit}
                                title="Cancel edit"
                              >
                                <Icon fontSize="small">close</Icon>
                              </MDButton>
                            </>
                          ) : (
                            <>
                              <MDButton
                                color="info"
                                variant="text"
                                size="small"
                                onClick={() => handleEditPendingItem(item)}
                                disabled={Boolean(editingPendingId)}
                              >
                                <Icon fontSize="small">edit</Icon>
                              </MDButton>
                              <MDButton
                                color="error"
                                variant="text"
                                size="small"
                                onClick={() => handleRemovePendingItem(item)}
                                disabled={Boolean(editingPendingId)}
                              >
                                <Icon fontSize="small">delete</Icon>
                              </MDButton>
                            </>
                          )}
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
