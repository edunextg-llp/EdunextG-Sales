// Create Bill popup (Sales > Create Sales). Same form and rules as the main site's Add Sales >
// "Yes, Create Bill" (frontend/src/layouts/add-sales/components/SalesInvoiceDialog.js), in the DMS look.
import { useCallback, useEffect, useMemo, useState } from "react";
import { MdAdd, MdCheck, MdClose, MdDeleteOutline, MdEdit, MdInventory2, MdReceiptLong } from "react-icons/md";
import { lotKey, lotLabel, lotPrice, remainingLots, takeFromLots } from "../../utils/stockLots";
import { apiFetch } from "../../auth";
import ItemPicker from "../purchase/ItemPicker";
import { buildInvoiceNumber, getInvoicePrefix, getInvoiceSuffix } from "../../utils/invoicePrefix";

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


// Fixed default: a new [] on every render would re-run the reset effect and clear the form.
const NO_LINE_ITEMS = [];

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
  initialLineItems = NO_LINE_ITEMS,
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
  const [orderOffer, setOrderOffer] = useState(null);
  const [stockItems, setStockItems] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState("");
  // Free goods that could not be added in full (no / not enough stock of the free item).
  const [freeShort, setFreeShort] = useState([]);
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

  /* reset when dialog opens; clear when it closes */
  useEffect(() => {
    if (!open) {
      // Cleared on close too: on the next open the free-goods effect runs in the same pass as
      // this reset and would otherwise see (and put back) the previous bill's lines.
      setLineItems([]);
      setDraft({ ...emptyLineItem });
      setEditingIdx(null);
      setFreeShort([]);
      setOrderOffer(null);
      return;
    }
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
      const response = await apiFetch(`/staff/current-stock?${params.toString()}`);
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
    const controller = new AbortController();
    const params = new URLSearchParams({ companyName });
    if (selectedDate) params.set("date", selectedDate);
    setFreeSchemes([]);
    apiFetch(`/staff/free-goods/active?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { schemes: [] }))
      .then((data) => {
        if (!controller.signal.aborted) setFreeSchemes(Array.isArray(data.schemes) ? data.schemes : []);
      })
      .catch(() => { if (!controller.signal.aborted) setFreeSchemes([]); });
    return () => controller.abort();
  }, [open, companyName, selectedDate]);

  // Free lines follow the paid lines: for every full "buy" qty of an item, its free pieces
  // are added at rate 0 (taken from stock lot by lot; only what is in stock).
  // ERP IDs are matched ignoring case / spaces, as the backend does (the scheme's IDs come
  // from the seller items, the stock's from the uploads).
  useEffect(() => {
    if (!open || editMode) return;
    const key = (v) => String(v || "").trim().toLowerCase();
    const paid = lineItems.filter((it) => !it.isFree);
    const bought = new Map();
    paid.forEach((it) => bought.set(key(it.productErpId), (bought.get(key(it.productErpId)) || 0) + (Number(it.qty) || 0)));
    const free = [];
    const short = [];
    const code = requisitionNumber.trim().toUpperCase();
    const schemes = outlet?.buyerType === "distributor" && /^DRQ/.test(code)
      ? (orderOffer?.code === code ? orderOffer.schemes : [])
      : freeSchemes;
    schemes.forEach((scheme) => {
      const qty = bought.get(key(scheme.product_erp_id)) || 0;
      const sets = scheme.buy_qty > 0 ? Math.floor(qty / scheme.buy_qty) : 0;
      if (sets <= 0) return;
      const freeErp = scheme.free_product_erp_id || scheme.product_erp_id;
      const wanted = Math.min(sets * scheme.free_qty, scheme.max_free_qty ?? Infinity);
      const freeName = scheme.free_item_name || freeErp;
      const product = stockItems.find((x) => key(x.product_erp_id) === key(freeErp));
      if (!product) {
        short.push(`${freeName}: not in this company's current stock (${wanted} pcs free not added)`);
        return;
      }
      const lots = remainingLots(product, [...paid, ...free]);
      const taking = lots.length ? takeFromLots(lots, wanted) : { taken: [], short: wanted };
      const parts = taking.taken;
      if (taking.short > 0) {
        short.push(`${freeName}: only ${wanted - taking.short} of ${wanted} free pcs in stock`);
      }
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
        freeForErpId: key(scheme.product_erp_id),
        freeNote: scheme.free_note || `Free with ${scheme.item_name || scheme.product_erp_id} (buy ${scheme.buy_qty} get ${scheme.free_qty})`,
      }));
    });
    setFreeShort((prev) => (prev.join("\n") === short.join("\n") ? prev : short));
    // Each item's free lines go right under that item's last paid line (same order as the
    // saved bill and the print), so with many items it is clear which free goods are whose.
    const ordered = [];
    paid.forEach((it, i) => {
      ordered.push(it);
      const k = key(it.productErpId);
      if (paid.slice(i + 1).some((x) => key(x.productErpId) === k)) return;
      ordered.push(...free.filter((f) => f.freeForErpId === k));
    });
    const sig = (list) => list.map((it) => `${it.isFree ? "F" : "P"}|${it.productErpId}|${lotKey(it)}|${it.qty}|${it.rate}|${it.freeNote || ""}`).join(",");
    if (sig(lineItems) === sig(ordered)) return;
    setLineItems(ordered);
  }, [open, editMode, lineItems, freeSchemes, stockItems, outlet?.buyerType, requisitionNumber, orderOffer]);

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

  // A distributor's approved order (DMS Sales > Distributor Orders, number DRQ000001...).
  // Its items fill the bill at the order's price (retail / wholesale, or MRP for a CNF company's
  // distributors), lot by lot (earliest expiry, then lowest MRP);
  // free goods are then added by the free-goods effect. Items short of stock are added with
  // what is there and listed in an alert.
  const loadDistributorOrder = async (code) => {
    try {
      const params = new URLSearchParams({ distributorId: String(outlet.id) });
      const response = await apiFetch(`/staff/distributor-orders/requisition/${encodeURIComponent(code)}?${params}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Requisition not found.");
      const order = data.order;
      if (order.company_name && companyName
        && String(order.company_name).trim().toLowerCase() !== String(companyName).trim().toLowerCase()) {
        throw new Error(`Requisition ${order.requisition_number} is for ${order.company_name}. Choose that company to bill it.`);
      }
      const liveStock = await fetchCurrentStock();
      if (!liveStock?.length) throw new Error(`Current stock for ${companyName} could not be loaded. Please retry.`);
      const key = (v) => String(v || "").trim().toLowerCase();
      // The order's price: retail / wholesale, or MRP (CNF company's distributors).
      const atMrp = order.price_type === "mrp";
      const pt = order.price_type === "retail" ? "retail" : "wholesale";
      const pick = (retail, wholesale) => (pt === "retail" ? retail || wholesale : wholesale || retail);
      const rows = [];
      const short = [];
      // Paid lines use live stock. The bill preview applies the terms stored with the order.
      (order.items || []).filter((item) => !item.is_free).forEach((item) => {
        const wanted = Number(item.qty) || 0;
        const name = item.variant_name || item.product_name || item.product_erp_id;
        const product = liveStock.find((p) => key(p.product_erp_id) === key(item.product_erp_id));
        if (!product) {
          short.push(`${name}: not in stock (0 of ${wanted})`);
          return;
        }
        const base = {
          ...emptyLineItem,
          productErpId: product.product_erp_id,
          productName: product.product_name || "",
          productDivision: product.product_division || "",
          variantName: product.variant_name || "",
          availableStock: Number(product.total_current_stock_in_pcs) || 0,
          priceType: pt,
          requisitionNumber: order.requisition_number,
        };
        const lots = remainingLots(product, rows);
        if (!lots.length) {
          const qty = Math.min(wanted, Math.max(0, Number(product.total_current_stock_in_pcs) || 0));
          if (qty < wanted) short.push(`${name}: only ${qty} of ${wanted} pcs`);
          if (qty <= 0) return;
          const price = atMrp
            ? Number(product.mrp) || Number(product.price_per_piece) || 0
            : pick(Number(product.retail_price), Number(product.wholesale_price))
              || Number(product.mrp) || Number(product.price_per_piece) || 0;
          rows.push({
            ...base,
            qty: String(qty),
            retailPrice: Number(product.retail_price) || 0,
            wholesalePrice: Number(product.wholesale_price) || 0,
            rate: String(price),
          });
          return;
        }
        const { taken, short: missing } = takeFromLots(lots, wanted);
        if (missing > 0) short.push(`${name}: only ${wanted - missing} of ${wanted} pcs`);
        taken.forEach(({ lot, qty }) => rows.push({
          ...base,
          qty: String(qty),
          mrp: lot.mrp,
          batchNumber: lot.batchNumber || "",
          expiryDate: lot.expiryDate || "",
          retailPrice: Number(lot.retail_price) || Number(product.retail_price) || 0,
          wholesalePrice: Number(lot.wholesale_price) || Number(product.wholesale_price) || 0,
          // Same fallbacks as adding the item by hand: wholesale, retail, then MRP / price per piece.
          rate: String(atMrp
            ? Number(lot.mrp) || Number(product.mrp) || Number(product.price_per_piece) || 0
            : lotPrice(lot, pt)
            || pick(Number(product.retail_price), Number(product.wholesale_price))
            || Number(lot.mrp) || Number(product.mrp) || Number(product.price_per_piece) || 0
          ),
        }));
      });
      if (!rows.length) throw new Error(`None of the items of ${order.requisition_number} are in stock.\n${short.join("\n")}`);
      setRequisitionNumber(order.requisition_number);
      setOrderOffer({ code: order.requisition_number.toUpperCase(), schemes: order.freeSchemes || [] });
      setDraft({ ...emptyLineItem });
      setEditingIdx(null);
      setLineItems(rows);
      const noRate = [...new Set(rows.filter((r) => !(Number(r.rate) > 0)).map((r) => r.variantName || r.productName || r.productErpId))];
      const notes = [
        short.length ? `Some items are short of stock:\n${short.join("\n")}` : "",
        noRate.length ? `No price found for these items. Edit their rate on the bill:\n${noRate.join("\n")}` : "",
      ].filter(Boolean);
      if (notes.length) alert(`Loaded ${order.requisition_number}.\n\n${notes.join("\n\n")}`);
    } catch (error) {
      alert(error.message);
    }
    return undefined;
  };

  const loadRequisition = async (requestedNumber = requisitionNumber) => {
    const code = String(
      typeof requestedNumber === "string" ? requestedNumber : requisitionNumber || ""
    ).trim();
    if (!code) return alert("Enter a requisition number.");
    if (!outlet?.id) return alert("Choose the buyer first.");
    if (outlet.buyerType === "distributor") return loadDistributorOrder(code);
    try {
      const response = await apiFetch(
        `/staff/purchase-requisitions/${encodeURIComponent(code)}?outletId=${encodeURIComponent(outlet.id)}`
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
      setFlatDiscount(""); setRoundOff("0"); setRemarks(""); setRequisitionNumber("");
    }
  };

  /* ─────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────── */
  if (!open) return null;

  const pickerItems = companyStockItems.map((item, i) => ({
    id: item.product_erp_id,
    product_erp_id: item.product_erp_id,
    sku_name: item.product_name,
    variant_name: item.variant_name,
    item_code: item.item_code,
    pcs_per_box: item.pcs_per_box,
    sr: i + 1,
  }));
  const pickStock = (picked) => (picked ? companyStockItems.find((x) => x.product_erp_id === picked.product_erp_id) || null : null);
  const buyerName = outlet?.distributor_name || outlet?.outlet_name || "";
  const buyerCode = outlet?.login_id || outlet?.outlet_erp_id || "";
  const editDraft = editPopup.draft;

  return (
    <div data-theme="bill" className="fixed inset-0 z-[1300] flex items-start justify-center overflow-y-auto bg-neutral/60 p-2 backdrop-blur-[2px] sm:p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[1180px] overflow-hidden rounded-xl bg-base-100 shadow-2xl ring-1 ring-black/5">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 bg-primary px-4 pb-1 pt-2.5 text-primary-content">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-content shadow-sm">
            <MdReceiptLong size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{editMode ? "Edit Bill" : "Create Bill"}</h2>
              {companyName && <span className="badge badge-secondary badge-sm">{companyName}</span>}
              <span className="badge badge-sm border-0 bg-white/15 text-white">{formatDisplayDate(selectedDate)}</span>
            </div>
            <p className="truncate text-xs text-primary-content/80">
              <b className="text-primary-content">{buyerName}</b>
              {buyerCode ? <span className="font-mono text-xs"> · {buyerCode}</span> : null}
              {address ? <span> · {address}</span> : null}
            </p>
          </div>
          <button type="button" aria-label="Close" className="btn btn-ghost btn-sm btn-circle text-primary-content hover:bg-primary-content/15" onClick={onClose} disabled={submitting}>
            <MdClose size={20} />
          </button>
        </div>

        {/* ── Bill details ── */}
        <div className="grid grid-cols-1 gap-2 bg-primary px-4 pb-2.5 pt-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#dbeafe]">
              Bill No. <span className="text-[#ffb4b4]">*</span>
            </span>
            <span className="input input-xs h-7 w-full">
              {invoicePrefix && <span className="font-mono text-xs text-base-content/60">{invoicePrefix}</span>}
              <input
                className="grow"
                value={getInvoiceSuffix(billNo, invoicePrefix)}
                onChange={(e) => setBillNo(invoicePrefix ? buildInvoiceNumber(e.target.value, invoicePrefix) : e.target.value)}
                placeholder="Invoice number"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#dbeafe]">Requisition No. (optional)</span>
            <span className="join w-full">
              <input
                className="input input-xs h-7 join-item w-full font-mono"
                value={requisitionNumber}
                onChange={(e) => setRequisitionNumber(e.target.value)}
                placeholder={outlet?.buyerType === "distributor" ? "DRQ000001" : "PRQ000001"}
              />
              <button type="button" className="btn btn-xs h-7 join-item btn-info" onClick={() => loadRequisition()}>
                Load
              </button>
            </span>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#dbeafe]">Date</span>
            <span className="input input-xs h-7 w-full bg-[#eef3fc] text-[#444]">{formatDisplayDate(selectedDate)}</span>
          </div>
        </div>

        {/* ── Add item ── */}
        <div className="bg-secondary px-4 py-2">
          {stockError && <p className="mb-2 text-xs font-medium text-error">{stockError}</p>}
          {!editMode && freeShort.length > 0 && (
            <p className="mb-2 rounded-sm bg-warning/15 px-2 py-1 text-xs font-medium text-warning-content">
              Free goods: {freeShort.join(" · ")}
            </p>
          )}
          <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-4 xl:grid-cols-[minmax(220px,2.4fr)_0.8fr_0.7fr_1.3fr_0.9fr_auto]">
            <label className="col-span-2 flex flex-col gap-1 md:col-span-4 xl:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#0f2a5a]">Item</span>
              <ItemPicker
                items={pickerItems}
                value={pickerItems.find((p) => p.product_erp_id === draft.productErpId) || null}
                onPick={(picked) => handleProductChange(pickStock(picked))}
                loading={loadingStock}
                compact
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#0f2a5a]">Available</span>
              <span className={`input input-xs h-7 w-full bg-[#eef3fc] font-semibold tabular-nums ${draft.productErpId && !availableStock ? "text-error" : ""}`}>
                {draft.productErpId ? `${availableStock} pcs` : "—"}
              </span>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#0f2a5a]">Qty (pcs)</span>
              <input
                type="number"
                min="1"
                max={availableStock || undefined}
                className="input input-xs h-7 w-full tabular-nums"
                value={draft.qty}
                onChange={(e) => setDraft((p) => ({ ...p, qty: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#0f2a5a]">Price type</span>
              <div className="join w-full">
                {[
                  ["retail", "Retail"],
                  ["wholesale", "Wholesale"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!draft.productErpId}
                    className={`btn btn-xs h-7 join-item flex-1 ${(draft.priceType || "retail") === value ? "btn-neutral" : "btn-outline border-neutral/40 bg-base-100 text-neutral"}`}
                    onClick={() => handlePriceTypeChange(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#0f2a5a]">Rate (before GST)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input input-xs h-7 w-full tabular-nums"
                value={draft.rate}
                onChange={(e) => setDraft((p) => ({ ...p, rate: e.target.value, rateEdited: true }))}
                onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
              />
            </label>
            <button type="button" className={`btn btn-sm ${editingIdx != null ? "btn-warning" : "btn-neutral"}`} onClick={handleAddItem}>
              <MdAdd size={18} /> {editingIdx != null ? "Update" : "Add"}
            </button>
          </div>
          {draft.productErpId && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary-content">
              <span>
                {draft.productName}
                {draft.variantName ? ` · ${draft.variantName}` : ""}
              </span>
              <span>
                Total <b className="tabular-nums text-base-content">₹{fmt(draftCalc.total)}</b>
              </span>
              <span>
                GST 5% <b className="tabular-nums text-base-content">₹{fmt(draftCalc.gst)}</b>
              </span>
              <span>
                Net <b className="tabular-nums text-base-content">₹{fmt(draftCalc.netTotal)}</b>
              </span>
              {draftLots.length > 1 && (
                <span className="basis-full">
                  Sells in this order (earliest expiry, then lowest MRP):{" "}
                  {draftLots.map((lot, i) => (
                    <span key={lotKey(lot)}>
                      {i > 0 ? " → " : ""}
                      <b>{lotLabel(lot)}</b> ({lot.pcs} pcs)
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Items + summary ── */}
        <div className="flex flex-col lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col bg-[#f5f8fd] p-3">
            <div className="max-h-[42vh] min-h-[200px] flex-1 overflow-auto rounded-sm border-t border-[#dfe6f2] bg-white">
              <table className="table table-xs table-pin-rows whitespace-nowrap">
                <thead>
                  <tr className="border-b-2 border-[#f97316] bg-[#ffedd5] text-[11px] font-bold text-[#0f2a5a]">
                    <th className="w-10 text-right">#</th>
                    <th>Item</th>
                    <th className="text-right">MRP</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">GST</th>
                    <th className="text-right">Net total</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {lineItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center">
                        <MdInventory2 size={28} className="mx-auto mb-1 text-base-content/25" />
                        <p className="text-sm text-base-content/55">No items yet. Search an item above and add it.</p>
                      </td>
                    </tr>
                  ) : (
                    lineItems.map((item, i) => {
                      const c = calcLine(item);
                      return (
                        <tr key={`${item.productErpId}-${i}`} className={item.isFree ? "bg-success/10" : i % 2 ? "border-[#dfe6f2] bg-[#f8fafe] hover:bg-[#eaf1fd]" : "border-[#dfe6f2] bg-white hover:bg-[#eaf1fd]"}>
                          <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                          <td className="max-w-72">
                            <div className="truncate font-medium">
                              {item.isFree && (
                                <>
                                  <span className="mr-1 text-success">↳</span>
                                  <span className="badge badge-success badge-sm mr-2">FREE</span>
                                </>
                              )}
                              {item.productName}
                              {item.variantName ? <span className="text-base-content/60">, {item.variantName}</span> : null}
                            </div>
                            <div className="truncate font-mono text-xs text-base-content/50">
                              {item.productErpId}
                              {item.isFree && item.freeNote ? ` · ${item.freeNote}` : ""}
                            </div>
                          </td>
                          <td className="text-right tabular-nums" title={Number(item.mrp) > 0 ? lotLabel(item) : ""}>
                            {Number(item.mrp) > 0 ? `₹${fmt(item.mrp)}` : "—"}
                            {item.expiryDate ? <div className="text-xs text-base-content/50">exp {formatDisplayDate(item.expiryDate)}</div> : null}
                          </td>
                          <td className="text-right font-semibold tabular-nums">{item.qty}</td>
                          <td className="text-right tabular-nums">{fmt(c.rate)}</td>
                          <td className="text-right tabular-nums">{fmt(c.total)}</td>
                          <td className="text-right tabular-nums">{fmt(c.gst)}</td>
                          <td className="text-right font-semibold tabular-nums">{fmt(c.netTotal)}</td>
                          <td className="text-right">
                            {item.isFree ? (
                              <span className="text-xs text-base-content/50" title={item.freeNote || "Free goods"}>
                                auto
                              </span>
                            ) : (
                              <span className="inline-flex gap-1">
                                <button type="button" className="btn btn-ghost btn-xs btn-square text-info" title="Edit" onClick={() => handleEdit(i)}>
                                  <MdEdit size={15} />
                                </button>
                                <button type="button" className="btn btn-ghost btn-xs btn-square text-error" title="Remove" onClick={() => handleDelete(i)}>
                                  <MdDeleteOutline size={16} />
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <aside className="flex w-full shrink-0 flex-col gap-2 bg-[#0f2a5a] p-3 text-xs text-white lg:w-[250px]">
            <h3 className="text-sm font-semibold">Summary</h3>
            <div>
              {[
                ["Amount", totals.amount],
                ["Discount", totals.flatDisc],
                ["Taxable", totals.discountedTaxable],
                ["CGST 2.5%", totals.cgst],
                ["SGST 2.5%", totals.sgst],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-0.5 text-[#cfdcf3]">
                  <span>{k}</span>
                  <span className="tabular-nums">{k === "Discount" && v ? "−" : ""}₹{fmt(v)}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-white/30 pt-1 font-semibold text-white">
                <span>Grand total</span>
                <span className="tabular-nums">₹{fmt(totals.grandTotal)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#cfdcf3]">Flat discount %</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="input input-xs h-7 w-full bg-white tabular-nums text-[#0f1d33]"
                  value={flatDiscount}
                  onChange={(e) => setFlatDiscount(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#cfdcf3]">Round off</span>
                <input type="number" className="input input-xs h-7 w-full bg-white tabular-nums text-[#0f1d33]" value={roundOff} onChange={(e) => setRoundOff(e.target.value)} />
              </label>
            </div>
            <div className="rounded-box bg-[#0b1f44] px-3 py-2 text-white">
              <div className="text-xs opacity-80">Net payable</div>
              <div className="text-xl font-bold tabular-nums">₹{fmt(totals.netPayable)}</div>
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <button type="button" className="btn btn-sm border-0 bg-[#22c55e] text-white hover:bg-[#16a34a]" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <span className="loading loading-spinner loading-sm" /> : <MdCheck size={18} />}
                {submitting ? (editMode ? "Updating…" : "Submitting…") : editMode ? "Update" : "Submit & print"}
              </button>
              {!editMode && (
                <button type="button" className="btn btn-outline btn-sm border-white/60 text-white hover:border-white hover:bg-white/10" onClick={handleAddAnother} disabled={submitting}>
                  Submit &amp; add another
                </button>
              )}
            </div>
          </aside>
        </div>

        {/* ── Footer: totals + remarks ── */}
        <div className="flex flex-wrap items-center gap-4 bg-primary px-4 py-2 text-white">
          <span className="text-[11px] font-bold text-[#dbeafe]">
            Total Items <b className="ml-1.5 text-xs font-black tabular-nums text-white">{totals.items}</b>
          </span>
          <span className="text-[11px] font-bold text-[#dbeafe]">
            Total Quantity <b className="ml-1.5 text-xs font-black tabular-nums text-white">{totals.qty}</b>
          </span>
          <label className="flex min-w-60 flex-1 items-center gap-2">
            <span className="whitespace-nowrap text-[11px] font-bold text-[#dbeafe]">Remarks</span>
            <input className="input input-xs h-7 w-full bg-white text-[#0f1d33]" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional note on the bill" />
          </label>
        </div>
      </div>

      {/* ── Edit item ── */}
      {editPopup.open && (
        <div className="modal modal-open z-[1400]" role="dialog">
          <div className="modal-box max-w-xl overflow-visible">
            <h3 className="font-semibold text-neutral">Edit item</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-base-content/70">Item</span>
                <ItemPicker
                  items={pickerItems}
                  value={pickerItems.find((p) => p.product_erp_id === editDraft.productErpId) || null}
                  onPick={(picked) => handleEditPopupProductChange(pickStock(picked))}
                  loading={loadingStock}
                compact
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-base-content/70">Available</span>
                <span className="input input-xs h-7 w-full bg-base-200/60 tabular-nums">{editPopupStock} pcs</span>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-base-content/70">Qty (pcs)</span>
                <input
                  type="number"
                  min="1"
                  max={editPopupStock || undefined}
                  className="input input-xs h-7 w-full tabular-nums"
                  value={editDraft.qty}
                  onChange={(e) => setEditPopup((prev) => ({ ...prev, draft: { ...prev.draft, qty: e.target.value } }))}
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-base-content/70">Price type</span>
                <div className="join w-full">
                  {[
                    ["retail", "Retail"],
                    ["wholesale", "Wholesale"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`btn btn-xs h-7 join-item flex-1 ${(editDraft.priceType || "retail") === value ? "btn-primary" : "btn-outline field-border"}`}
                      onClick={() =>
                        setEditPopup((prev) => ({
                          ...prev,
                          draft: { ...prev.draft, priceType: value, rate: value === "wholesale" ? prev.draft.wholesalePrice : prev.draft.retailPrice },
                        }))
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-base-content/70">Rate (before GST)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input input-xs h-7 w-full tabular-nums"
                  value={editDraft.rate}
                  onChange={(e) => setEditPopup((prev) => ({ ...prev, draft: { ...prev.draft, rate: e.target.value } }))}
                />
              </label>
              <p className="col-span-2 text-sm text-base-content/70">
                Net total <b className="tabular-nums text-base-content">₹{fmt(editPopupCalc.netTotal)}</b>
              </p>
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeEditPopup}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveEditPopup}>
                Update item
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={closeEditPopup} />
        </div>
      )}
    </div>
  );
}
