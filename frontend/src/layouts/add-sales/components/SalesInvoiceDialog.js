// Sales invoice (detailed bill) popup: Tailwind CSS (no MUI). Stock, free goods, lots, requisition, totals and submit logic unchanged.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { lotKey, lotLabel, lotPrice, remainingLots, takeFromLots } from "utils/stockLots";
import { buildInvoiceNumber, getInvoicePrefix, getInvoiceSuffix } from "utils/invoicePrefix";
import { Icon, Modal, Notice, SearchSelect, btn, fieldClass } from "components/tw";

const lineItemTableColWidths = ["4%", "22%", "6%", "6%", "6%", "8%", "8%", "6%", "12%", "10%", "12%"];

const LINE_ITEM_COLUMNS = [
  { label: "#", align: "center", width: "4%" },
  { label: "Item Name", align: "left", width: "22%" },
  { label: "MRP", align: "center", width: "6%" },
  { label: "HSN", align: "center", width: "6%" },
  { label: "Qty", align: "center", width: "6%" },
  { label: "Rate", align: "center", width: "8%" },
  { label: "Total", align: "center", width: "8%" },
  { label: "Disc.", align: "center", width: "6%" },
  { label: "Taxable Amount", align: "center", width: "12%" },
  { label: "Net Total", align: "center", width: "10%" },
  { label: "Action", align: "center", width: "12%" },
];

/* summary row inside the totals panel */
function SummaryRow({ label, value, highlight }) {
  return (
    <div className={`flex items-center justify-between gap-2 py-1.5 text-[12.5px] ${highlight ? "mt-1 border-t border-slate-300 pt-2.5 font-bold text-slate-900" : "border-b border-slate-100 text-slate-600"}`}>
      <span>{label}</span>
      <span className="font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
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
  priceType: "retail",
  retailPrice: 0,
  wholesalePrice: 0,
  // MRP lot of the line (same item at several MRPs / batches).
  mrp: "",
  batchNumber: "",
  expiryDate: "",
  rateEdited: false,
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
  const taxable = total;
  const cgst = taxable * 0.025;
  const sgst = taxable * 0.025;
  const gst = cgst + sgst;
  const netTotal = taxable + gst;
  return { qty, rate, total, disc: 0, taxable, cgst, sgst, gst, netTotal };
}

const API = (process.env.REACT_APP_API_URL);

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
  initialRequisitionNumber = "",
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
  const [requisitionNumber, setRequisitionNumber] = useState("");
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
  const invoicePrefix = getInvoicePrefix(companyName);
  const showEditableInvoiceSuffix = Boolean(invoicePrefix);
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
    setRequisitionNumber(initialRequisitionNumber || "");
    setEditPopup({ open: false, index: null, draft: { ...emptyLineItem } });
  }, [open, invoiceNumber, editMode, initialItemCount, initialPrice, initialLineItems, initialRequisitionNumber]);

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
      const items = data.items || [];
      setStockItems(items);
      setStockError("");
      return items;
    } catch (fetchError) {
      setStockItems([]);
      setStockError(fetchError.message || "Failed to load current stock");
      return [];
    } finally {
      setLoadingStock(false);
    }
  }, [companyName]);

  useEffect(() => {
    if (!open) return undefined;
    fetchCurrentStock();
    return undefined;
  }, [open, fetchCurrentStock]);

  /* Free goods (DMS Sales > Free Goods): running schemes of this company. */
  const [freeSchemes, setFreeSchemes] = useState([]);
  useEffect(() => {
    if (!open || !String(companyName || "").trim()) {
      setFreeSchemes([]);
      return;
    }
    fetch(`${API}/staff/free-goods/active?${new URLSearchParams({ companyName })}`)
      .then((res) => (res.ok ? res.json() : { schemes: [] }))
      .then((data) => setFreeSchemes(Array.isArray(data.schemes) ? data.schemes : []))
      .catch(() => setFreeSchemes([]));
  }, [open, companyName]);

  // Free lines follow the paid lines: for every full "buy" qty of an item, its free pieces
  // are added at rate 0 (taken from stock lot by lot; only what is in stock).
  useEffect(() => {
    if (!open || editMode || loadingStock) return;
    const paid = lineItems.filter((it) => !it.isFree);
    const bought = new Map();
    paid.forEach((it) => bought.set(it.productErpId, (bought.get(it.productErpId) || 0) + (Number(it.qty) || 0)));
    const free = [];
    freeSchemes.forEach((scheme) => {
      const qty = bought.get(scheme.product_erp_id) || 0;
      const sets = scheme.buy_qty > 0 ? Math.floor(qty / scheme.buy_qty) : 0;
      if (sets <= 0) return;
      const freeErp = scheme.free_product_erp_id || scheme.product_erp_id;
      const product = stockItems.find((x) => x.product_erp_id === freeErp);
      if (!product) return;
      const lots = remainingLots(product, [...paid, ...free]);
      const wanted = sets * scheme.free_qty;
      // Free goods must come from physical stock lots; never create a free line from
      // catalogue price data when no stock lot is available.
      const parts = lots.length ? takeFromLots(lots, wanted).taken : [];
      parts.forEach(({ lot, qty: freeQty }) => free.push({
        ...emptyLineItem,
        productErpId: product.product_erp_id,
        productName: product.product_name || "",
        productDivision: product.product_division || "",
        variantName: product.variant_name || "",
        availableStock: Number(product.total_current_stock_in_pcs) || 0,
        qty: String(freeQty),
        rate: "0",
        priceType: "free",
        mrp: lot.mrp || "",
        batchNumber: lot.batchNumber || "",
        expiryDate: lot.expiryDate || "",
        isFree: true,
        freeNote: `Buy ${scheme.buy_qty} get ${scheme.free_qty} free`,
      }));
    });
    const sig = (list) => list.map((it) => `${it.productErpId}|${lotKey(it)}|${it.qty}`).join(",");
    const current = lineItems.filter((it) => it.isFree);
    if (sig(current) === sig(free)) return;
    setLineItems([...paid, ...free]);
  }, [open, editMode, loadingStock, lineItems, freeSchemes, stockItems]);

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
        acc.cgst += c.cgst;
        acc.sgst += c.sgst;
        acc.gst += c.gst;
        acc.netTotal += c.netTotal;
        acc.qty += c.qty;
        return acc;
      },
      { amount: 0, disc: 0, taxable: 0, cgst: 0, sgst: 0, gst: 0, netTotal: 0, qty: 0 }
    );
    const flatDiscountPercent = Math.min(100, Math.max(0, Number(flatDiscount) || 0));
    const flatDisc = base.taxable * flatDiscountPercent / 100;
    const discountedTaxable = Math.max(0, base.taxable - flatDisc);
    const cgst = discountedTaxable * 0.025;
    const sgst = discountedTaxable * 0.025;
    const gst = cgst + sgst;
    const grandTotal = discountedTaxable + gst;
    const round = Number(roundOff) || 0;
    const netPayable = Math.max(0, grandTotal + round);
    return {
      ...base,
      flatDiscountPercent,
      flatDisc,
      discountedTaxable,
      cgst,
      sgst,
      gst,
      grandTotal,
      round,
      netPayable,
      items: lineItems.length,
    };
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

  // The selected product's lots still free on this bill, in selling order.
  const draftLots = useMemo(() => {
    const p = stockItems.find((x) => x.product_erp_id === draft.productErpId);
    return p ? remainingLots(p, lineItems, editingIdx).filter((l) => Number(l.pcs) > 0) : [];
  }, [draft.productErpId, stockItems, lineItems, editingIdx]);

  const editPopupStock = useMemo(() => {
    const { draft: editDraft, index: editIndex } = editPopup;
    if (!editDraft.productErpId) return 0;
    const p = stockItems.find((x) => x.product_erp_id === editDraft.productErpId);
    if (!p) return Number(editDraft.availableStock) || 0;
    // A line of one MRP lot can take only what is left of that lot.
    if (Number(editDraft.mrp) > 0 && p.lots?.length) {
      const lot = remainingLots(p, lineItems, editIndex).find((l) => lotKey(l) === lotKey(editDraft));
      return Math.max(0, Number(lot?.pcs) || 0);
    }
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
    // The rate shown is the first lot's (earliest expiry, then lowest MRP).
    const firstLot = remainingLots(product, lineItems, editingIdx).find((l) => Number(l.pcs) > 0);
    const retail = Number(firstLot?.retail_price) || Number(product.retail_price) || 0;
    const wholesale = Number(firstLot?.wholesale_price) || Number(product.wholesale_price) || 0;
    setDraft((prev) => ({
      ...prev,
      productErpId: product.product_erp_id || "",
      productName: product.product_name || "",
      productDivision: product.product_division || "",
      variantName: product.variant_name || "",
      availableStock: Number(product.total_current_stock_in_pcs) || 0,
      priceType: "retail",
      retailPrice: retail,
      wholesalePrice: wholesale,
      rate: retail || product.mrp || product.price_per_piece || "",
      rateEdited: false,
    }));
  };

  const handlePriceTypeChange = (priceType) => {
    setDraft((prev) => ({
      ...prev,
      priceType,
      rate: priceType === "wholesale" ? prev.wholesalePrice : prev.retailPrice,
      rateEdited: false,
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
    } else if (p?.lots?.length) {
      // Same item at several MRPs: the qty is taken lot by lot (earliest expiry, then lowest
      // MRP) and each lot becomes its own line at that lot's MRP and rate.
      const lots = remainingLots(p, lineItems);
      const { taken, short } = takeFromLots(lots, Number(draft.qty));
      if (short > 0) return alert("Qty exceeds available stock.");
      const lines = taken.map(({ lot, qty }) => ({
        ...payload,
        qty: String(qty),
        mrp: lot.mrp,
        batchNumber: lot.batchNumber || "",
        expiryDate: lot.expiryDate || "",
        retailPrice: Number(lot.retail_price) || draft.retailPrice,
        wholesalePrice: Number(lot.wholesale_price) || draft.wholesalePrice,
        // A rate typed by hand applies to every lot; otherwise each lot has its own.
        rate: draft.rateEdited ? draft.rate : String(lotPrice(lot, draft.priceType) || draft.rate),
      }));
      setLineItems((prev) => {
        // A lot already on the bill at the same price type and rate: add to that line.
        const next = [...prev];
        lines.forEach((line) => {
          const same = next.findIndex((it) => it.productErpId === line.productErpId
            && Number(it.mrp) > 0 && lotKey(it) === lotKey(line)
            && it.priceType === line.priceType && Number(it.rate) === Number(line.rate));
          if (same >= 0) next[same] = { ...next[same], qty: String(Number(next[same].qty) + Number(line.qty)) };
          else next.push(line);
        });
        return next;
      });
    } else {
      setLineItems((prev) => [...prev, payload]);
    }
    resetDraft();
    return undefined;
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
        priceType: "retail",
        retailPrice: Number(product.retail_price) || 0,
        wholesalePrice: Number(product.wholesale_price) || 0,
        rate: product.retail_price || product.mrp || product.price_per_piece || prev.draft.rate || "",
        mrp: "",
        batchNumber: "",
        expiryDate: "",
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

  const loadRequisition = async (requestedNumber = requisitionNumber) => {
    const code = String(
      typeof requestedNumber === "string" ? requestedNumber : requisitionNumber || ""
    ).trim();
    if (!code) return alert("Enter a requisition number.");
    if (!outlet?.id) return alert("Select an outlet before loading a requisition.");
    try {
      const response = await fetch(
        `${API}/staff/purchase-requisitions/${encodeURIComponent(code)}?outletId=${encodeURIComponent(outlet.id)}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Requisition not found.");
      if (Number(data.requisition.outlet_id) !== Number(outlet.id)) {
        throw new Error(`This requisition belongs to ${data.requisition.outlet_name || "a different outlet"}.`);
      }
      const requisitionCompany = String(data.requisition.company_name || "").trim();
      if (requisitionCompany && companyName
        && requisitionCompany.toLowerCase() !== String(companyName).trim().toLowerCase()) {
        throw new Error(
          `This requisition is for ${requisitionCompany}, but this bill is for ${companyName}. `
          + `Close this bill, select ${requisitionCompany} in Company Name and load the requisition there.`
        );
      }
      setRequisitionNumber(data.requisition.requisition_number || code);
      const liveStockItems = await fetchCurrentStock();
      if (!liveStockItems?.length) {
        throw new Error(`Current stock for ${companyName} could not be loaded. Please retry, or check that its stock has been uploaded.`);
      }
      const liveStockByErp = new Map(
        liveStockItems.map((item) => [String(item.product_erp_id || "").trim().toLowerCase(), item])
      );
      const rows = (data.requisition.items || []).map((item) => ({
        productErpId: item.product_erp_id,
        productName: item.product_name,
        productDivision: item.product_division || "",
        variantName: item.variant_name || "",
        hsnCode: item.hsn_code || "",
        availableStock: Number(
          liveStockByErp.get(String(item.product_erp_id || "").trim().toLowerCase())
            ?.total_current_stock_in_pcs
        ) || 0,
        qty: String(item.quantity),
        priceType: item.priceType || "retail",
        retailPrice: Number(item.retail_price) || 0,
        wholesalePrice: Number(item.wholesale_price) || 0,
        rate: String(item.rate || 0),
        mrp: Number(item.mrp) || "",
        batchNumber: item.batch_number || "",
        expiryDate: item.expiry_date || "",
        isFree: Boolean(item.is_free),
        freeNote: item.free_note || "",
        requisitionNumber: data.requisition.requisition_number,
      }));
      const unavailableItem = rows.find((item) => Number(item.qty) > Number(item.availableStock));
      if (unavailableItem) {
        throw new Error(
          `Insufficient current stock for ${unavailableItem.productErpId}. Available: ${unavailableItem.availableStock}, requested: ${unavailableItem.qty}.`
        );
      }
      setLineItems(rows);
    } catch (error) {
      alert(error.message);
    }
  };

  useEffect(() => {
    if (open && !editMode && initialRequisitionNumber) {
      loadRequisition(initialRequisitionNumber);
    }
    // The request is intentionally triggered only when this dialog opens with a new requisition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editMode, initialRequisitionNumber]);

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
      requisitionNumber: requisitionNumber.trim(),
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
      requisitionNumber: requisitionNumber.trim(),
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
  // Product option text: "ERP — name (variant) [stock left]" (stock minus qty already on this bill).
  const productLabel = (item, skipIndex) => {
    const orig = Number(item.total_current_stock_in_pcs) || 0;
    const used = lineItems.reduce((s, li, i) =>
      i !== skipIndex && li.productErpId === item.product_erp_id
        ? s + (Number(li.qty) || 0) : s, 0);
    return `${item.product_erp_id} — ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ""} [${Math.max(0, orig - used)}]`;
  };
  const productOptions = (skipIndex) => companyStockItems.map((item) => ({ value: item.product_erp_id, label: productLabel(item, skipIndex) }));
  const findProduct = (erpId) => companyStockItems.find((x) => x.product_erp_id === erpId) || null;

  // Close on Escape like a dialog (not while saving, and not while the Edit Item popup is open).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !submitting && !editPopup.open) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting, editPopup.open, onClose]);

  if (!open) return null;

  const lbl = "mb-1 block whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-wide text-slate-500";
  const inp = `${fieldClass} h-9 text-[12.5px]`;
  const readOnly = "flex h-9 items-center truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[12.5px] tabular-nums text-slate-700";
  const th = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-2 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500";
  const td = "overflow-hidden text-ellipsis whitespace-nowrap border-t border-slate-100 px-2 py-2 text-[12.5px] text-slate-700";

  return createPortal((
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-2 sm:p-4">
      <button type="button" aria-label="Close" onClick={() => { if (!submitting) onClose(); }} className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-label="Sales invoice" className="relative flex max-h-[96vh] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl bg-white font-[Poppins,Roboto,sans-serif] text-slate-700 shadow-2xl">

        {/* ROW 1 — header: bill no, requisition, address, date */}
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <span className="mt-5 hidden size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 sm:flex"><Icon name="receipt_long" className="text-[22px]" /></span>
          <div className="grid min-w-0 grow gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.3fr_1.6fr_0.8fr]">
            <div>
              <span className={lbl}>Bill no.</span>
              <span className="relative block">
                {invoicePrefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-600">{invoicePrefix}</span>}
                <input
                  className={inp} style={invoicePrefix ? { paddingLeft: `${invoicePrefix.length * 7.5 + 16}px` } : undefined}
                  value={getInvoiceSuffix(billNo, invoicePrefix)}
                  onChange={(e) => setBillNo(
                    invoicePrefix ? buildInvoiceNumber(e.target.value, invoicePrefix) : e.target.value
                  )}
                  disabled={!editMode && !showEditableInvoiceSuffix}
                />
              </span>
            </div>
            <div>
              <span className={lbl}>Requisition no. (optional)</span>
              <span className="flex gap-1.5">
                <input className={inp} value={requisitionNumber} onChange={(e) => setRequisitionNumber(e.target.value)} placeholder="PRQ000001" />
                <button type="button" className={`${btn.outline} h-9 px-3`} onClick={() => loadRequisition()}>Load</button>
              </span>
            </div>
            <div className="min-w-0">
              <span className={lbl}>Outlet / address</span>
              <span className={readOnly} title={address}>
                {outlet?.outlet_name ? <b className="mr-1.5 text-slate-900">{outlet.outlet_name}</b> : null}{address || "—"}
              </span>
            </div>
            <div>
              <span className={lbl}>Date</span>
              <span className={readOnly}>{formatDisplayDate(selectedDate)}</span>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={submitting} className={`${btn.icon} shrink-0`}>
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>

        {/* ROW 2 — product entry bar */}
        <div className="border-b border-blue-100 bg-blue-50/50 px-5 py-3">
          {stockError && <Notice tone="error" className="mb-2">{stockError}</Notice>}
          <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4 xl:grid-cols-[2.6fr_1.6fr_0.8fr_0.7fr_0.6fr_1fr_0.9fr_0.8fr_0.6fr_0.7fr_0.8fr_0.8fr_auto]">
            <div className="col-span-2 sm:col-span-4 xl:col-span-1">
              <span className={lbl}>Description name</span>
              <SearchSelect
                label="Search product from current stock" placeholder="Search product from current stock…" loading={loadingStock}
                options={productOptions(editingIdx)} value={draft.productErpId || null}
                onChange={(erpId) => handleProductChange(findProduct(erpId))}
                noOptionsText="No products in current stock"
              />
            </div>
            <div className="col-span-2 sm:col-span-2 xl:col-span-1"><span className={lbl}>Selected item</span><span className={readOnly} title={draft.productName}>{draft.productName || "—"}</span></div>
            <div><span className={lbl}>Avl. stock</span><span className={readOnly}>{availableStock}</span></div>
            <div>
              <span className={lbl}>Qty.</span>
              <input type="number" min={1} max={availableStock || undefined} className={inp} value={draft.qty} onChange={(e) => setDraft((p) => ({ ...p, qty: e.target.value }))} />
            </div>
            <div><span className={lbl}>Unit</span><span className={readOnly}>PCS</span></div>
            <div>
              <span className={lbl}>Price type</span>
              <select className={inp} value={draft.priceType || "retail"} onChange={(e) => handlePriceTypeChange(e.target.value)} disabled={!draft.productErpId}>
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
              </select>
            </div>
            <div>
              <span className={lbl}>Rate</span>
              <input type="number" min={0} step="0.01" className={inp} value={draft.rate} onChange={(e) => setDraft((p) => ({ ...p, rate: e.target.value, rateEdited: true }))} />
            </div>
            <div><span className={lbl}>Total</span><span className={readOnly}>{fmt(draftCalc.total)}</span></div>
            <div><span className={lbl}>Disc. %</span><span className={readOnly}>0</span></div>
            <div><span className={lbl}>Disc. ₹</span><span className={readOnly}>{fmt(0)}</span></div>
            <div><span className={lbl}>Taxable</span><span className={readOnly}>{fmt(draftCalc.taxable)}</span></div>
            <div><span className={lbl}>Net total</span><span className={`${readOnly} font-semibold text-slate-900`}>{fmt(draftCalc.netTotal)}</span></div>
            <button
              type="button" onClick={handleAddItem}
              className={`${btn.primary} h-9 ${editingIdx != null ? "bg-amber-500 hover:bg-amber-600" : ""}`}
            >
              <Icon name={editingIdx != null ? "check" : "add"} className="text-[18px]" />{editingIdx != null ? "Update" : "Add"}
            </button>
          </div>
          {draftLots.length > 1 && (
            <p className="m-0 mt-2 text-[11.5px] text-slate-600">
              Sells in this order (earliest expiry, then lowest MRP):{" "}
              {draftLots.map((lot, i) => (
                <span key={lotKey(lot)}>
                  {i > 0 ? " → " : ""}
                  <b>{lotLabel(lot)}</b> ({lot.pcs} pcs)
                </span>
              ))}
            </p>
          )}
        </div>

        {/* ROW 3 — items table + totals panel */}
        <div className="flex min-h-0 grow flex-col lg:flex-row">
          <div className="min-h-[260px] min-w-0 grow overflow-auto">
            <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0">
              <colgroup>
                {lineItemTableColWidths.map((width, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <col key={`line-item-col-${index}`} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {LINE_ITEM_COLUMNS.map((column) => (
                    <th key={column.label} className={`${th} ${column.align === "left" ? "text-left" : "text-center"}`}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.length > 0 ? lineItems.map((item, i) => {
                  const c = calcLine(item);
                  const itemName = `${item.productName}${item.variantName ? `, ${item.variantName}` : ""}`;
                  return (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={`${item.productErpId}-${i}`} className={item.isFree ? "bg-emerald-50/50" : "hover:bg-slate-50"}>
                      <td className={`${td} text-center text-slate-400`}>{i + 1}</td>
                      <td className={`${td} font-medium text-slate-900`} title={item.isFree ? `${itemName} · ${item.freeNote || "Free"}` : itemName}>
                        {item.isFree ? <span className="mr-1.5 rounded bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-700">FREE</span> : null}
                        {itemName}
                      </td>
                      <td className={`${td} text-center`} title={Number(item.mrp) > 0 ? lotLabel(item) : ""}>
                        {Number(item.mrp) > 0 ? `₹${fmt(item.mrp)}` : "—"}
                        {item.expiryDate ? <span className="block text-[10.5px] text-slate-500">exp {formatDisplayDate(item.expiryDate)}</span> : null}
                      </td>
                      <td className={`${td} text-center text-slate-400`}>NA</td>
                      <td className={`${td} text-center tabular-nums`}>{item.qty}</td>
                      <td className={`${td} text-center tabular-nums`}>{fmt(c.rate)}</td>
                      <td className={`${td} text-center tabular-nums`}>{fmt(c.total)}</td>
                      <td className={`${td} text-center tabular-nums`}>0</td>
                      <td className={`${td} text-center tabular-nums`}>{fmt(c.taxable)}</td>
                      <td className={`${td} text-center font-bold tabular-nums text-slate-900`}>{fmt(c.netTotal)}</td>
                      <td className={`${td} text-center`}>
                        {item.isFree ? (
                          <span className="text-[11px] text-slate-500" title={item.freeNote || "Free goods"}>auto</span>
                        ) : (
                          <span className="inline-flex gap-0.5">
                            <button type="button" className={`${btn.icon} size-7 text-blue-600 hover:bg-blue-50`} title="Edit item" aria-label="Edit item" onClick={() => handleEdit(i)}>
                              <Icon name="edit" className="text-[16px]" />
                            </button>
                            <button type="button" className={`${btn.icon} size-7 text-red-500 hover:bg-red-50 hover:text-red-600`} title="Remove item" aria-label="Remove item" onClick={() => handleDelete(i)}>
                              <Icon name="delete" className="text-[16px]" />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={LINE_ITEM_COLUMNS.length} className="px-4 py-16 text-center text-[13px] text-slate-400">
                      <Icon name="inventory_2" className="block text-[32px] text-slate-300" />
                      No items added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* totals panel */}
          <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-slate-200 bg-slate-50/70 p-4 lg:w-72 lg:border-l lg:border-t-0">
            <div>
              <SummaryRow label="Total amount" value={fmt(totals.amount)} />
              <SummaryRow label="Total discount" value={fmt(totals.disc)} />
              <SummaryRow label="Taxable after discount" value={fmt(totals.discountedTaxable)} />
              <SummaryRow label="CGST (2.5%)" value={fmt(totals.cgst)} />
              <SummaryRow label="SGST (2.5%)" value={fmt(totals.sgst)} />
              <SummaryRow label="Total GST (5%)" value={fmt(totals.gst)} />
              <SummaryRow label="Grand total" value={fmt(totals.grandTotal)} highlight />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label><span className={lbl}>Flat discount (%)</span><input type="number" min={0} max={100} step="0.01" className={inp} value={flatDiscount} onChange={(e) => setFlatDiscount(e.target.value)} /></label>
              <label><span className={lbl}>Round off</span><input type="number" className={inp} value={roundOff} onChange={(e) => setRoundOff(e.target.value)} /></label>
            </div>
            <div className="rounded-xl bg-blue-600 px-4 py-3 text-white">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">Net payable</span>
              <span className="block text-[24px] font-bold leading-tight tabular-nums">₹{fmt(totals.netPayable)}</span>
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={handleSubmit} disabled={submitting} className={`${btn.primary} h-10 justify-center bg-emerald-600 text-[14px] hover:bg-emerald-700`}>
                <Icon name="check_circle" className="text-[18px]" />
                {submitting ? (editMode ? "Updating…" : "Submitting…") : editMode ? "Update" : "Submit"}
              </button>
              {!editMode && (
                <button type="button" onClick={handleAddAnother} disabled={submitting} className={`${btn.outline} h-10 justify-center`}>
                  <Icon name="add_circle_outline" className="text-[18px]" />Submit &amp; Add Another
                </button>
              )}
            </div>
          </aside>
        </div>

        {/* ROW 4 — footer: totals + remarks */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200 bg-slate-50 px-5 py-2.5">
          <span className="whitespace-nowrap text-[12.5px] text-slate-500">Total items <b className="ml-1 text-[14px] tabular-nums text-slate-900">{String(totals.items).padStart(2, "0")}</b></span>
          <span className="whitespace-nowrap text-[12.5px] text-slate-500">Total quantity <b className="ml-1 text-[14px] tabular-nums text-slate-900">{totals.qty}</b></span>
          <label className="flex min-w-64 grow items-center gap-2">
            <span className="whitespace-nowrap text-[12.5px] text-slate-500">Remarks</span>
            <input className={inp} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
        </div>
      </div>

      {/* Edit line-item popup */}
      <Modal
        open={editPopup.open} onClose={closeEditPopup} size="lg" title="Edit Item"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeEditPopup}>Cancel</button>
            <button type="button" className={btn.primary} onClick={handleSaveEditPopup}>Update Item</button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <div className="col-span-2 sm:col-span-6">
            <span className={lbl}>Description name</span>
            <SearchSelect
              label="Search product from current stock" placeholder="Search product from current stock…" loading={loadingStock}
              options={productOptions(editPopup.index)} value={editPopup.draft.productErpId || null}
              onChange={(erpId) => handleEditPopupProductChange(findProduct(erpId))}
              noOptionsText="No products in current stock"
            />
          </div>
          <div className="col-span-2 sm:col-span-3"><span className={lbl}>Selected item</span><span className={readOnly}>{editPopup.draft.productName || "—"}</span></div>
          <div className="sm:col-span-2"><span className={lbl}>Avl. stock</span><span className={readOnly}>{editPopupStock}</span></div>
          <div><span className={lbl}>Unit</span><span className={readOnly}>PCS</span></div>
          <div className="sm:col-span-2">
            <span className={lbl}>Qty.</span>
            <input
              type="number" min={1} max={editPopupStock || undefined} className={inp} value={editPopup.draft.qty}
              onChange={(e) =>
                setEditPopup((prev) => ({
                  ...prev,
                  draft: { ...prev.draft, qty: e.target.value },
                }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <span className={lbl}>Price type</span>
            <select
              className={inp} value={editPopup.draft.priceType || "retail"}
              onChange={(e) => setEditPopup((prev) => ({
                ...prev,
                draft: {
                  ...prev.draft,
                  priceType: e.target.value,
                  rate: e.target.value === "wholesale"
                    ? prev.draft.wholesalePrice
                    : prev.draft.retailPrice,
                },
              }))}
            >
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <span className={lbl}>Rate</span>
            <input
              type="number" min={0} step="0.01" className={inp} value={editPopup.draft.rate}
              onChange={(e) =>
                setEditPopup((prev) => ({
                  ...prev,
                  draft: { ...prev.draft, rate: e.target.value },
                }))
              }
            />
          </div>
          <div className="col-span-2 sm:col-span-6"><span className={lbl}>Net total</span><span className={`${readOnly} font-semibold text-slate-900`}>{fmt(editPopupCalc.netTotal)}</span></div>
        </div>
      </Modal>
    </div>
  ), document.body);
}
