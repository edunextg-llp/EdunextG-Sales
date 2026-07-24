import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Autocomplete,
  Icon,
} from "@mui/material";
import { FaRegEdit } from "react-icons/fa";
import { CiTrash } from "react-icons/ci";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

/* ─────────────────────────────────────────────────────────────
   THEME TOKENS  (matches the reference screenshot precisely)
───────────────────────────────────────────────────────────── */
const PURPLE = "#6b3fa0";       // header / footer bar
const PURPLE_DARK = "#5a3285";       // right-panel sidebar
const GOLD_BAR = "#c9a252";       // product-entry bar
const GOLD_LIGHT = "#e8d49e";       // table header row
const WHITE = "#ffffff";
const FIELD_BG = "#f5f0fa";       // table-area background

/* ─────────────────────────────────────────────────────────────
   SHARED INPUT STYLES
   All inputs look like the on-screen fields: white bg, purple
   label/border, small font.
───────────────────────────────────────────────────────────── */
const mkInput = (bgColor = WHITE) => ({
  "& .MuiInputBase-root": {
    backgroundColor: bgColor,
    borderRadius: "3px !important",
    fontSize: "0.78rem",
    height: 26,
  },
  "& .MuiInputBase-input": {
    color: "#1a1a2e !important",
    fontSize: "0.78rem",
    padding: "2px 6px !important",
  },
  "& .MuiInputBase-input.Mui-disabled": {
    color: "#444 !important",
    WebkitTextFillColor: "#444 !important",
  },
  "& .MuiInputBase-root.Mui-disabled": {
    backgroundColor: "#ede8f5 !important",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "#b39ddb !important",
    borderWidth: "1px !important",
  },
  "& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: PURPLE + " !important",
  },
  "& .MuiInputLabel-root": {
    color: "#7c4dab !important",
    fontSize: "0.72rem !important",
    top: "-4px",
    fontWeight: 600,
  },
  "& .MuiInputLabel-shrink": {
    top: "0px",
    fontSize: "0.72rem !important",
    backgroundColor: bgColor,
    padding: "0 3px",
  },
});

const headerInput = mkInput(WHITE);
const goldInput = mkInput(WHITE);
const sidebarInput = mkInput(WHITE);

/* small bold label used above each input column in gold bar */
const colLabelSx = {
  fontSize: "0.65rem",
  fontWeight: 700,
  color: PURPLE_DARK,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  mb: 0.3,
  whiteSpace: "nowrap",
};

/* table header cell */
const TH = {
  backgroundColor: `${GOLD_LIGHT} !important`,
  fontWeight: 700,
  fontSize: "0.68rem",
  color: "#4a2d7a",
  borderBottom: `2px solid ${GOLD_BAR}`,
  py: 0.8,
  px: 1,
  whiteSpace: "nowrap",
};

/* table body cell */
const TD = {
  fontSize: "0.73rem",
  color: "#1a1a2e",
  borderBottom: "1px solid #e8e0f5",
  py: 0.6,
  px: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const lineItemTableColWidths = ["4%", "22%", "6%", "6%", "6%", "8%", "8%", "6%", "12%", "10%", "12%"];

const lineItemTableHeadRowSx = {
  display: "table-header-group",
  backgroundColor: GOLD_LIGHT,
  "& .MuiTableCell-root": { backgroundColor: GOLD_LIGHT },
};

const LINE_ITEM_COLUMNS = [
  { label: "#", align: "center", width: "4%" },
  { label: "Item Name", align: "left", width: "22%" },
  { label: "Unit", align: "center", width: "6%" },
  { label: "HSN", align: "center", width: "6%" },
  { label: "Qty", align: "center", width: "6%" },
  { label: "Rate", align: "center", width: "8%" },
  { label: "Total", align: "center", width: "8%" },
  { label: "Disc.", align: "center", width: "6%" },
  { label: "Taxable Amount", align: "center", width: "12%" },
  { label: "Net Total", align: "center", width: "10%" },
  { label: "Action", align: "center", width: "12%" },
];

/* summary row inside right panel */
function SummaryRow({ label, value, highlight }) {
  return (
    <MDBox
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      sx={{
        py: 0.4,
        px: 0.5,
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        ...(highlight && {
          mt: 0.5,
          pt: 0.8,
          borderTop: "1px solid rgba(255,255,255,0.3)",
        }),
      }}
    >
      <MDTypography
        variant="caption"
        sx={{ color: "#e8d5f5", fontSize: "0.7rem", fontWeight: 600 }}
      >
        {label}
      </MDTypography>
      <MDTypography
        variant="caption"
        sx={{ color: WHITE, fontSize: "0.72rem", fontWeight: 700 }}
      >
        {value}
      </MDTypography>
    </MDBox>
  );
}

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
const emptyLineItem = {
  productErpId: "",
  productName: "",
  productDivision: "",
  variantName: "",
  availableStock: 0,
  qty: "",
  rate: "",
};

function fmt(v, d = 2) {
  return Number(v || 0).toFixed(d);
}

function formatDisplayDate(value) {
  if (!value) return "";
  const parts = String(value).split("T")[0].split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return value;
}

function calcLine(item) {
  const qty = Number(item.qty) || 0;
  const rate = Number(item.rate) || 0;
  const total = qty * rate;
  return { qty, rate, total, disc: 0, taxable: total, netTotal: total };
}

const API = "https://bawarchee.edunextg.co/api";

export default function SalesInvoiceDialog({
  open,
  onClose,
  outlet,
  selectedDate,
  companyName = "",
  invoiceNumber,
  prevBillNo = "",
  fetchNextBillNumber,
  editMode = false,
  initialItemCount = "",
  initialPrice = "",
  initialLineItems = [],
  submitting = false,
  onSubmit,
}) {
  /* ── state ── */
  const [billNo, setBillNo] = useState("");
  const [lineItems, setLineItems] = useState([]);
  const [draft, setDraft] = useState({ ...emptyLineItem });
  const [editingIdx, setEditingIdx] = useState(null);
  const [flatDiscount, setFlatDiscount] = useState("");
  const [roundOff, setRoundOff] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [stockItems, setStockItems] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState("");
  const [editPopup, setEditPopup] = useState({
    open: false,
    index: null,
    draft: { ...emptyLineItem },
  });

  const companyStockItems = useMemo(
    () => stockItems.filter((item) => String(item.product_erp_id || "").trim()),
    [stockItems]
  );

  const buildExistingSaleLine = (itemCount, price) => {
    const qty = Math.max(1, Number(itemCount) || 1);
    const net = Number(price) || 0;
    const rate = qty > 0 ? net / qty : net;
    return {
      productErpId: "__existing_sale__",
      productName: "Existing sale item(s)",
      productDivision: "",
      variantName: "",
      availableStock: 999999,
      qty: String(qty),
      rate: String(Number(rate).toFixed(2)),
    };
  };

  /* reset when dialog opens */
  useEffect(() => {
    if (!open) return;
    setBillNo(invoiceNumber || "");
    if (editMode) {
      if (Array.isArray(initialLineItems) && initialLineItems.length > 0) {
        setLineItems(initialLineItems.map((item) => ({ ...item })));
      } else {
        setLineItems([buildExistingSaleLine(initialItemCount, initialPrice)]);
      }
    } else {
      setLineItems([]);
    }
    setDraft({ ...emptyLineItem });
    setEditingIdx(null);
    setFlatDiscount("");
    setRoundOff("0");
    setRemarks("");
    setEditPopup({ open: false, index: null, draft: { ...emptyLineItem } });
  }, [open, invoiceNumber, editMode, initialItemCount, initialPrice, initialLineItems]);

  /* load Current Stock (Physical − DMS) for the selected company */
  const fetchCurrentStock = useCallback(async () => {
    const selectedCompany = String(companyName || "").trim();
    if (!selectedCompany) {
      setStockItems([]);
      setStockError("Select a company first to load current stock.");
      setLoadingStock(false);
      return;
    }

    setLoadingStock(true);
    setStockError("");

    try {
      const params = new URLSearchParams({ companyName: selectedCompany });
      const response = await fetch(`${API}/staff/current-stock?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load current stock");
      setStockItems(data.items || []);
      setStockError("");
    } catch (fetchError) {
      setStockItems([]);
      setStockError(fetchError.message || "Failed to load current stock");
    } finally {
      setLoadingStock(false);
    }
  }, [companyName]);

  useEffect(() => {
    if (!open) return undefined;
    fetchCurrentStock();
    return undefined;
  }, [open, fetchCurrentStock]);

  /* ── derived strings ── */
  // const saleTo  = outlet ? `${outlet.outlet_name || ""}${outlet.outlet_erp_id ? `, Class: 0 Section: 0 Adm. No. : ${outlet.outlet_erp_id}` : ""}` : "";
  const address = outlet
    ? `${outlet.address || outlet.location_name || ""}${outlet.contact_number ? ` Mobile:-${outlet.contact_number}` : ""}`
    : "";

  /* ── totals ── */
  const totals = useMemo(() => {
    const base = lineItems.reduce(
      (acc, it) => {
        const c = calcLine(it);
        acc.amount += c.total;
        acc.disc += c.disc;
        acc.taxable += c.taxable;
        acc.qty += c.qty;
        return acc;
      },
      { amount: 0, disc: 0, taxable: 0, qty: 0 }
    );
    const flatDisc = Number(flatDiscount) || 0;
    const grandTotal = Math.max(0, base.taxable - flatDisc);
    const round = Number(roundOff) || 0;
    const netPayable = Math.max(0, grandTotal + round);
    return { ...base, flatDisc, grandTotal, round, netPayable, items: lineItems.length };
  }, [lineItems, flatDiscount, roundOff]);

  /* ── available stock (minus already-added qty of same ERP) ── */
  const availableStock = useMemo(() => {
    if (!draft.productErpId) return 0;
    const p = stockItems.find((x) => x.product_erp_id === draft.productErpId);
    if (!p) return 0;
    const orig = Number(p.total_current_stock_in_pcs) || 0;
    const used = lineItems.reduce((s, it, i) => {
      if (i === editingIdx) return s;
      return it.productErpId === draft.productErpId ? s + (Number(it.qty) || 0) : s;
    }, 0);
    return Math.max(0, orig - used);
  }, [draft.productErpId, stockItems, lineItems, editingIdx]);

  const draftCalc = calcLine(draft);

  const editPopupStock = useMemo(() => {
    const { draft: editDraft, index: editIndex } = editPopup;
    if (!editDraft.productErpId) return 0;
    const p = stockItems.find((x) => x.product_erp_id === editDraft.productErpId);
    if (!p) return Number(editDraft.availableStock) || 0;
    const orig = Number(p.total_current_stock_in_pcs) || 0;
    const used = lineItems.reduce((s, it, i) => {
      if (i === editIndex) return s;
      return it.productErpId === editDraft.productErpId ? s + (Number(it.qty) || 0) : s;
    }, 0);
    return Math.max(0, orig - used);
  }, [editPopup, stockItems, lineItems]);

  const editPopupCalc = calcLine(editPopup.draft);

  /* ── handlers ── */
  const resetDraft = () => { setDraft({ ...emptyLineItem }); setEditingIdx(null); };

  const handleProductChange = (product) => {
    if (!product) { resetDraft(); return; }
    setDraft((prev) => ({
      ...prev,
      productErpId: product.product_erp_id || "",
      productName: product.product_name || "",
      productDivision: product.product_division || "",
      variantName: product.variant_name || "",
      availableStock: Number(product.total_current_stock_in_pcs) || 0,
      rate: product.mrp || product.price_per_piece || "",
    }));
  };

  const handleAddItem = () => {
    if (!draft.productErpId) return alert("Please select a product.");
    if (!draft.qty || Number(draft.qty) <= 0) return alert("Enter a valid quantity.");
    if (Number(draft.qty) > availableStock) return alert("Qty exceeds available stock.");
    if (!draft.rate || Number(draft.rate) < 0) return alert("Enter a valid rate.");

    const p = stockItems.find((x) => x.product_erp_id === draft.productErpId);
    const orig = p ? (Number(p.total_current_stock_in_pcs) || 0) : 0;
    const payload = { ...draft, availableStock: orig };

    if (editingIdx != null) {
      setLineItems((prev) => prev.map((it, i) => (i === editingIdx ? payload : it)));
    } else {
      setLineItems((prev) => [...prev, payload]);
    }
    resetDraft();
  };

  const closeEditPopup = () => {
    setEditPopup({ open: false, index: null, draft: { ...emptyLineItem } });
  };

  const handleEdit = (i) => {
    setEditPopup({
      open: true,
      index: i,
      draft: { ...lineItems[i] },
    });
  };

  const handleEditPopupProductChange = (product) => {
    if (!product) {
      setEditPopup((prev) => ({ ...prev, draft: { ...emptyLineItem } }));
      return;
    }
    setEditPopup((prev) => ({
      ...prev,
      draft: {
        ...prev.draft,
        productErpId: product.product_erp_id || "",
        productName: product.product_name || "",
        productDivision: product.product_division || "",
        variantName: product.variant_name || "",
        availableStock: Number(product.total_current_stock_in_pcs) || 0,
        rate: product.mrp || product.price_per_piece || prev.draft.rate || "",
      },
    }));
  };

  const handleSaveEditPopup = () => {
    const { draft: editDraft, index } = editPopup;
    if (index == null) return;
    if (!editDraft.productErpId) return alert("Please select a product.");
    if (!editDraft.qty || Number(editDraft.qty) <= 0) return alert("Enter a valid quantity.");
    const isExistingPlaceholder = editDraft.productErpId === "__existing_sale__";
    if (!isExistingPlaceholder && Number(editDraft.qty) > editPopupStock) {
      return alert("Qty exceeds available stock.");
    }
    if (!editDraft.rate || Number(editDraft.rate) < 0) return alert("Enter a valid rate.");

    const p = stockItems.find((x) => x.product_erp_id === editDraft.productErpId);
    const orig = p
      ? (Number(p.total_current_stock_in_pcs) || 0)
      : (Number(editDraft.availableStock) || 0);
    setLineItems((prev) =>
      prev.map((it, i) => (i === index ? { ...editDraft, availableStock: orig || 999999 } : it))
    );
    closeEditPopup();
  };

  const handleDelete = (i) => {
    setLineItems((prev) => prev.filter((_, j) => j !== i));
    if (editingIdx === i) resetDraft();
    if (editPopup.index === i) closeEditPopup();
  };

  const validateForm = () => {
    if (!billNo.trim()) { alert("Bill No. is required."); return false; }
    if (lineItems.length === 0) { alert("Add at least one item."); return false; }
    if (totals.netPayable <= 0) { alert("Net payable must be > 0."); return false; }
    return true;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    onSubmit({
      invoiceNumber: billNo.trim(),
      itemCount: totals.qty || lineItems.length,
      price: totals.netPayable,
      remarks,
      lineItems,
      totals,
      addAnother: false,
    });
  };

  const handleAddAnother = async () => {
    if (!validateForm()) return;
    const ok = await onSubmit({
      invoiceNumber: billNo.trim(),
      itemCount: totals.qty || lineItems.length,
      price: totals.netPayable,
      remarks,
      lineItems,
      totals,
      addAnother: true,
    });
    if (ok) {
      await fetchCurrentStock();
      const nextBillNo =
        typeof fetchNextBillNumber === "function" ? await fetchNextBillNumber() : "";
      setBillNo(nextBillNo);
      setLineItems([]); setDraft({ ...emptyLineItem }); setEditingIdx(null);
      setFlatDiscount(""); setRoundOff("0"); setRemarks("");
    }
  };

  /* ─────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────── */
  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullWidth
      maxWidth="xl"
      PaperProps={{
        sx: {
          borderRadius: "4px",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.4)",
          m: 1,
        },
      }}
    >
      {/* ══════════════════════════════════════════════
          ROW 1 — PURPLE HEADER  (Bill No, Sale To, Date)
      ══════════════════════════════════════════════ */}
      <MDBox sx={{ backgroundColor: PURPLE, px: 2, py: 1.2, position: "relative" }}>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          disabled={submitting}
          sx={{
            position: "absolute",
            top: 8,
            right: 8,
            color: WHITE,
            backgroundColor: "rgba(255,255,255,0.12)",
            "&:hover": { backgroundColor: "rgba(255,255,255,0.22)" },
            zIndex: 1,
          }}
        >
          <Icon sx={{ fontSize: "1.25rem !important" }}>close</Icon>
        </IconButton>
        <Grid container spacing={1.5} alignItems="flex-end" pr={4}>

          {/* Bill No + Prev Bill */}
          <Grid item xs={12} md={2.5}>
            <Grid container spacing={1}>
              <Grid item xs={12}>
                <MDTypography sx={{ ...colLabelSx, color: "#e2c9ff" }}>Bill No.</MDTypography>
                <MDInput
                  fullWidth
                  value={billNo}
                  onChange={(e) => setBillNo(e.target.value)}
                  disabled={!editMode}
                  sx={headerInput}
                />
              </Grid>
              {/* <Grid item xs={12}>
                <MDTypography sx={{ ...colLabelSx, color: "#e2c9ff" }}>Prev. Sold Bill No.</MDTypography>
                <MDInput fullWidth value={prevBillNo} disabled sx={headerInput} />
              </Grid> */}
            </Grid>
          </Grid>

          {/* Sale To + Address */}
          <Grid item xs={12} md={6.5}>
            <Grid container spacing={1}>
              {/* <Grid item xs={12}>
                <MDTypography sx={{ ...colLabelSx, color: "#e2c9ff" }}>Sale To</MDTypography>
                <MDInput fullWidth value={saleTo} disabled sx={headerInput} />
              </Grid> */}
              <Grid item xs={12}>
                <MDTypography sx={{ ...colLabelSx, color: "#e2c9ff" }}>Address</MDTypography>
                <MDInput fullWidth value={address} disabled sx={headerInput} />
              </Grid>
            </Grid>
          </Grid>

          {/* Date */}
          <Grid item xs={12} md={3}>
            <MDTypography sx={{ ...colLabelSx, color: "#e2c9ff" }}>Date</MDTypography>
            <MDInput
              fullWidth
              value={formatDisplayDate(selectedDate)}
              disabled
              sx={headerInput}
            />
          </Grid>

        </Grid>
      </MDBox>

      {/* ══════════════════════════════════════════════
          ROW 2 — GOLD PRODUCT ENTRY BAR
      ══════════════════════════════════════════════ */}
      <MDBox sx={{ backgroundColor: GOLD_BAR, px: 2, py: 1 }}>
        {stockError && (
          <MDTypography variant="caption" color="error" fontWeight="medium" display="block" mb={0.5}>
            {stockError}
          </MDTypography>
        )}
        <Grid container spacing={1} alignItems="flex-end">

          {/* Description (Autocomplete) */}
          <Grid item xs={12} md={3.5}>
            <MDTypography sx={colLabelSx}>Description Name</MDTypography>
            <Autocomplete
              options={companyStockItems}
              loading={loadingStock}
              size="small"
              value={companyStockItems.find((x) => x.product_erp_id === draft.productErpId) || null}
              onChange={(_, prod) => handleProductChange(prod)}
              getOptionLabel={(item) => {
                const orig = Number(item.total_current_stock_in_pcs) || 0;
                const used = lineItems.reduce((s, li, i) =>
                  i !== editingIdx && li.productErpId === item.product_erp_id
                    ? s + (Number(li.qty) || 0) : s, 0);
                return `${item.product_erp_id} — ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ""} [${Math.max(0, orig - used)}]`;
              }}
              isOptionEqualToValue={(o, v) => o.product_erp_id === v.product_erp_id}
              renderInput={(params) => (
                <MDInput {...params} placeholder="Search product from current stock…" fullWidth sx={goldInput} />
              )}
              sx={{
                "& .MuiAutocomplete-inputRoot": { height: 26, fontSize: "0.78rem" },
              }}
            />
          </Grid>

          {/* Selected Item (product name display) */}
          <Grid item xs={12} md={2}>
            <MDTypography sx={colLabelSx}>Selected Item</MDTypography>
            <MDInput fullWidth value={draft.productName} disabled sx={goldInput} />
          </Grid>

          {/* Avl. Stock */}
          <Grid item xs={6} md={1}>
            <MDTypography sx={colLabelSx}>Avl. Stock</MDTypography>
            <MDInput fullWidth value={availableStock} disabled sx={goldInput} />
          </Grid>

          {/* Qty */}
          <Grid item xs={6} md={0.7}>
            <MDTypography sx={colLabelSx}>Qty.</MDTypography>
            <MDInput
              fullWidth
              type="number"
              inputProps={{ min: 1, max: availableStock || undefined }}
              value={draft.qty}
              onChange={(e) => setDraft((p) => ({ ...p, qty: e.target.value }))}
              sx={goldInput}
            />
          </Grid>

          {/* Unit (static) */}
          <Grid item xs={6} md={0.7}>
            <MDTypography sx={colLabelSx}>Unit</MDTypography>
            <MDInput fullWidth value="PCS" disabled sx={goldInput} />
          </Grid>

          {/* Rate */}
          <Grid item xs={6} md={1}>
            <MDTypography sx={colLabelSx}>Rate</MDTypography>
            <MDInput
              fullWidth
              type="number"
              inputProps={{ min: 0, step: "0.01" }}
              value={draft.rate}
              onChange={(e) => setDraft((p) => ({ ...p, rate: e.target.value }))}
              sx={goldInput}
            />
          </Grid>

          {/* Total */}
          <Grid item xs={6} md={0.8}>
            <MDTypography sx={colLabelSx}>Total</MDTypography>
            <MDInput fullWidth value={fmt(draftCalc.total)} disabled sx={goldInput} />
          </Grid>

          {/* Disc.% */}
          <Grid item xs={6} md={0.7}>
            <MDTypography sx={colLabelSx}>Disc.(%)</MDTypography>
            <MDInput fullWidth value="0" disabled sx={goldInput} />
          </Grid>

          {/* Disc.(RS) */}
          <Grid item xs={6} md={0.7}>
            <MDTypography sx={colLabelSx}>Disc.(RS)</MDTypography>
            <MDInput fullWidth value={fmt(0)} disabled sx={goldInput} />
          </Grid>

          {/* Taxable */}
          <Grid item xs={6} md={0.8}>
            <MDTypography sx={colLabelSx}>Taxable</MDTypography>
            <MDInput fullWidth value={fmt(draftCalc.taxable)} disabled sx={goldInput} />
          </Grid>

          {/* Net Total */}
          <Grid item xs={6} md={0.8}>
            <MDTypography sx={colLabelSx}>Net Total</MDTypography>
            <MDInput fullWidth value={fmt(draftCalc.netTotal)} disabled sx={goldInput} />
          </Grid>

          {/* Add / Update button */}
          <Grid item xs={12} md="auto">
            <MDButton
              variant="gradient"
              color={editingIdx != null ? "warning" : "info"}
              size="small"
              onClick={handleAddItem}
              sx={{
                height: 26,
                minWidth: 52,
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "none",
                borderRadius: "3px",
                boxShadow: "none",
                mt: "auto",
              }}
            >
              {editingIdx != null ? "Update" : "Add"}
            </MDButton>
          </Grid>

        </Grid>
      </MDBox>

      {/* ══════════════════════════════════════════════
          ROW 3 — TABLE  (left) + SUMMARY PANEL (right)
      ══════════════════════════════════════════════ */}
      <MDBox display="flex" sx={{ minHeight: 420 }}>

        {/* ── TABLE AREA ── */}
        <MDBox flex={1} sx={{ backgroundColor: FIELD_BG, p: 1.5, minWidth: 0 }}>
          <TableContainer
            sx={{
              maxHeight: 400,
              backgroundColor: WHITE,
              borderRadius: "3px",
              boxShadow: "none",
              borderTop: "1px solid #e8e0f5",
              overflowX: "auto",
              overflowY: "auto",
            }}
          >
            <Table
              size="small"
              sx={{
                tableLayout: "fixed",
                width: "100%",
                minWidth: 960,
                "& .MuiTableCell-root": { overflow: "hidden" },
              }}
            >
              <colgroup>
                {lineItemTableColWidths.map((width, index) => (
                  <col key={`line-item-col-${index}`} style={{ width }} />
                ))}
              </colgroup>
              <TableHead sx={lineItemTableHeadRowSx}>
                <TableRow>
                  {LINE_ITEM_COLUMNS.map((column) => (
                    <TableCell
                      key={column.label}
                      align={column.align}
                      sx={{ ...TH, width: column.width }}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {lineItems.length > 0 ? lineItems.map((item, i) => {
                  const c = calcLine(item);
                  const itemName = `${item.productName}${item.variantName ? `, ${item.variantName}` : ""}`;
                  return (
                    <TableRow
                      key={`${item.productErpId}-${i}`}
                      sx={{
                        backgroundColor: i % 2 === 0 ? WHITE : "#faf7ff",
                        "&:hover": { backgroundColor: "#f3eeff" },
                      }}
                    >
                      <TableCell align="center" sx={{ ...TD, width: "4%", whiteSpace: "nowrap" }}>
                        {i + 1}
                      </TableCell>
                      <TableCell align="left" sx={{ ...TD, width: "22%", whiteSpace: "nowrap" }} title={itemName}>
                        {itemName}
                      </TableCell>
                      <TableCell align="center" sx={{ ...TD, width: "6%", whiteSpace: "nowrap" }}>
                        PCS
                      </TableCell>
                      <TableCell align="center" sx={{ ...TD, width: "6%", whiteSpace: "nowrap" }}>
                        NA
                      </TableCell>
                      <TableCell align="center" sx={{ ...TD, width: "6%", whiteSpace: "nowrap" }}>
                        {item.qty}
                      </TableCell>
                      <TableCell align="center" sx={{ ...TD, width: "8%", whiteSpace: "nowrap" }}>
                        {fmt(c.rate)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...TD, width: "8%", whiteSpace: "nowrap" }}>
                        {fmt(c.total)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...TD, width: "6%", whiteSpace: "nowrap" }}>
                        0
                      </TableCell>
                      <TableCell align="center" sx={{ ...TD, width: "12%", whiteSpace: "nowrap" }}>
                        {fmt(c.taxable)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...TD, width: "10%", whiteSpace: "nowrap", fontWeight: 700 }}>
                        {fmt(c.netTotal)}
                      </TableCell>
                      <TableCell align="center" sx={{ ...TD, width: "12%", whiteSpace: "nowrap" }}>
                        <MDBox display="flex" justifyContent="center" gap={0.5}>
                          <IconButton
                            size="small"
                            onClick={() => handleEdit(i)}
                            sx={{ p: 0.3, color: "#2563eb", "&:hover": { backgroundColor: "#dbeafe" } }}
                          >
                            <FaRegEdit size={12} />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(i)}
                            sx={{ p: 0.3, color: "#dc2626", "&:hover": { backgroundColor: "#fee2e2" } }}
                          >
                            <CiTrash size={14} />
                          </IconButton>
                        </MDBox>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={LINE_ITEM_COLUMNS.length} align="center" sx={{ py: 5, color: "#94a3b8", fontSize: "0.78rem" }}>
                      No items added yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </MDBox>

        {/* ── SUMMARY PANEL ── */}
        <MDBox
          sx={{
            width: 220,
            flexShrink: 0,
            backgroundColor: PURPLE_DARK,
            display: "flex",
            flexDirection: "column",
            p: 1.5,
            gap: 0.8,
            overflowY: "auto",
          }}
        >
          {/* Totals */}
          <SummaryRow label="Total Amount" value={fmt(totals.amount)} />
          <SummaryRow label="Total Discount" value={fmt(totals.disc)} />
          <SummaryRow label="Total Taxable" value={fmt(totals.taxable)} />
          <SummaryRow label="Total GST" value={fmt(0)} />
          <SummaryRow label="Grand. Total" value={fmt(totals.grandTotal)} highlight />

          {/* Flat Discount input */}
          <MDBox mt={0.5}>
            <MDTypography sx={{ ...colLabelSx, color: "#d8bfff", mb: 0.4 }}>Flat Discount</MDTypography>
            <MDInput
              fullWidth
              type="number"
              value={flatDiscount}
              onChange={(e) => setFlatDiscount(e.target.value)}
              sx={sidebarInput}
            />
          </MDBox>

          {/* Round Off input */}
          <MDBox>
            <MDTypography sx={{ ...colLabelSx, color: "#d8bfff", mb: 0.4 }}>Round of</MDTypography>
            <MDInput
              fullWidth
              type="number"
              value={roundOff}
              onChange={(e) => setRoundOff(e.target.value)}
              sx={sidebarInput}
            />
          </MDBox>

          {/* Net Payable */}
          <MDBox>
            <MDTypography sx={{ ...colLabelSx, color: "#d8bfff", mb: 0.4 }}>Net Paybale</MDTypography>
            <MDInput
              fullWidth
              value={fmt(totals.netPayable)}
              disabled
              sx={{
                ...sidebarInput,
                "& .MuiInputBase-root.Mui-disabled": {
                  backgroundColor: "#3b1f6e !important",
                },
                "& .MuiInputBase-input.Mui-disabled": {
                  color: "#fff !important",
                  WebkitTextFillColor: "#fff !important",
                  fontWeight: 700,
                },
              }}
            />
          </MDBox>

          {/* ── Buttons — always visible, not pushed off with mt=auto ── */}
          <MDBox display="flex" flexDirection="column" gap={1} pt={1}>
            <MDButton
              variant="contained"
              fullWidth
              onClick={handleSubmit}
              disabled={submitting}
              sx={{
                backgroundColor: "#22c55e",
                color: WHITE,
                fontWeight: 700,
                fontSize: "0.82rem",
                textTransform: "none",
                borderRadius: "3px",
                minHeight: 36,
                boxShadow: "none",
                "&:hover": { backgroundColor: "#16a34a" },
              }}
            >
              {submitting ? (editMode ? "Updating…" : "Submitting…") : editMode ? "Update" : "Submit"}
            </MDButton>

            {!editMode && (
              <MDButton
                variant="outlined"
                fullWidth
                onClick={handleAddAnother}
                disabled={submitting}
                sx={{
                  color: WHITE,
                  borderColor: "rgba(255,255,255,0.6)",
                  fontWeight: 600,
                  fontSize: "0.74rem",
                  textTransform: "none",
                  borderRadius: "3px",
                  minHeight: 32,
                  lineHeight: 1.3,
                  py: 0.6,
                  "&:hover": { backgroundColor: "rgba(255,255,255,0.12)", borderColor: WHITE },
                }}
              >
                Submit &amp; Add Another
              </MDButton>
            )}
          </MDBox>
        </MDBox>

      </MDBox>

      {/* ══════════════════════════════════════════════
          ROW 4 — PURPLE FOOTER  (totals + remarks)
      ══════════════════════════════════════════════ */}
      <MDBox
        sx={{
          backgroundColor: PURPLE,
          px: 2,
          py: 1,
          display: "flex",
          alignItems: "center",
          gap: 3,
        }}
      >
        <MDBox sx={{ display: "flex", alignItems: "center", gap: 0.8, whiteSpace: "nowrap" }}>
          <MDTypography sx={{ color: "#e2c9ff", fontSize: "0.7rem", fontWeight: 700 }}>
            Total Items
          </MDTypography>
          <MDTypography sx={{ color: WHITE, fontSize: "0.75rem", fontWeight: 900 }}>
            {String(totals.items).padStart(2, "0")}
          </MDTypography>
        </MDBox>

        <MDBox sx={{ display: "flex", alignItems: "center", gap: 0.8, whiteSpace: "nowrap" }}>
          <MDTypography sx={{ color: "#e2c9ff", fontSize: "0.7rem", fontWeight: 700 }}>
            Total Quantity
          </MDTypography>
          <MDTypography sx={{ color: WHITE, fontSize: "0.75rem", fontWeight: 900 }}>
            {totals.qty}
          </MDTypography>
        </MDBox>

        <MDBox sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
          <MDTypography sx={{ color: "#e2c9ff", fontSize: "0.7rem", fontWeight: 700, whiteSpace: "nowrap" }}>
            Remarks
          </MDTypography>
          <MDInput
            fullWidth
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            sx={{
              ...headerInput,
              "& .MuiInputBase-root": {
                ...headerInput["& .MuiInputBase-root"],
                height: 28,
                flex: 1,
              },
            }}
          />
        </MDBox>
      </MDBox>

      {/* Edit line-item popup */}
      <Dialog
        open={editPopup.open}
        onClose={closeEditPopup}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: "6px" } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: PURPLE_DARK, pb: 1 }}>
          Edit Item
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <MDTypography sx={colLabelSx}>Description Name</MDTypography>
              <Autocomplete
                options={companyStockItems}
                loading={loadingStock}
                size="small"
                value={companyStockItems.find((x) => x.product_erp_id === editPopup.draft.productErpId) || null}
                onChange={(_, prod) => handleEditPopupProductChange(prod)}
                getOptionLabel={(item) => {
                  const orig = Number(item.total_current_stock_in_pcs) || 0;
                  const used = lineItems.reduce((s, li, i) =>
                    i !== editPopup.index && li.productErpId === item.product_erp_id
                      ? s + (Number(li.qty) || 0) : s, 0);
                  return `${item.product_erp_id} — ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ""} [${Math.max(0, orig - used)}]`;
                }}
                isOptionEqualToValue={(o, v) => o.product_erp_id === v.product_erp_id}
                renderInput={(params) => (
                  <MDInput {...params} placeholder="Search product from current stock…" fullWidth sx={goldInput} />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <MDTypography sx={colLabelSx}>Selected Item</MDTypography>
              <MDInput fullWidth value={editPopup.draft.productName || ""} disabled sx={goldInput} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MDTypography sx={colLabelSx}>Avl. Stock</MDTypography>
              <MDInput fullWidth value={editPopupStock} disabled sx={goldInput} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <MDTypography sx={colLabelSx}>Unit</MDTypography>
              <MDInput fullWidth value="PCS" disabled sx={goldInput} />
            </Grid>
            <Grid item xs={6} sm={4}>
              <MDTypography sx={colLabelSx}>Qty.</MDTypography>
              <MDInput
                fullWidth
                type="number"
                inputProps={{ min: 1, max: editPopupStock || undefined }}
                value={editPopup.draft.qty}
                onChange={(e) =>
                  setEditPopup((prev) => ({
                    ...prev,
                    draft: { ...prev.draft, qty: e.target.value },
                  }))
                }
                sx={goldInput}
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <MDTypography sx={colLabelSx}>Rate</MDTypography>
              <MDInput
                fullWidth
                type="number"
                inputProps={{ min: 0, step: "0.01" }}
                value={editPopup.draft.rate}
                onChange={(e) =>
                  setEditPopup((prev) => ({
                    ...prev,
                    draft: { ...prev.draft, rate: e.target.value },
                  }))
                }
                sx={goldInput}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MDTypography sx={colLabelSx}>Net Total</MDTypography>
              <MDInput fullWidth value={fmt(editPopupCalc.netTotal)} disabled sx={goldInput} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <MDButton variant="outlined" color="dark" onClick={closeEditPopup}>
            Cancel
          </MDButton>
          <MDButton variant="gradient" color="info" onClick={handleSaveEditPopup}>
            Update Item
          </MDButton>
        </DialogActions>
      </Dialog>

    </Dialog>
  );
}
