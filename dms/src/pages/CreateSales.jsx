import { useCallback, useEffect, useMemo, useState } from "react";
import { MdAdd, MdBlock, MdDeleteOutline, MdPayments, MdPrint, MdRefresh, MdSave, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { CompanyPicker, ConfirmDialog, EditDialog, ExcelButton, Field, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";
import ItemPicker from "../components/purchase/ItemPicker";
import { downloadExcel } from "../utils/excel";
import { qty as showQty, rupees, showDate, todayLocal } from "../utils/purchaseCalc";
import { printInvoice } from "../utils/dmsInvoice";

// Sales > Create Sales: a bill to a distributor / CNF (Add Distributor) or to an outlet.
// Rates are GST-inclusive wholesale prices of each MRP lot (editable). Same item at several
// MRPs is taken lot by lot (earliest expiry, then lowest MRP), one line per lot; free goods
// come as their own lines at ₹0. Saving takes the stock off; the bill can be printed.

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "credit", label: "Credit (pay later)" },
];

// ---- MRP lots (same rules as backend/src/utils/stockLots.js) ----
const lotKey = (l) =>
  `${(Math.round(num(l?.mrp) * 100) / 100).toFixed(2)}|${String(l?.batchNumber || "").trim().toLowerCase()}|${String(l?.expiryDate || "").slice(0, 10)}`;
const takeFromLots = (lots, want, preferred = null) => {
  let left = num(want);
  const taken = [];
  const queue = preferred
    ? [...lots.filter((l) => lotKey(l) === lotKey(preferred)), ...lots.filter((l) => lotKey(l) !== lotKey(preferred))]
    : lots;
  queue.forEach((lot) => {
    if (left <= 0) return;
    const take = Math.min(num(lot.pcs), left);
    if (take <= 0) return;
    lot.pcs = num(lot.pcs) - take;
    left -= take;
    taken.push({ lot, qty: take });
  });
  return { taken, short: left };
};
const remainingLots = (product, lines, skip = -1) => {
  const lots = (product?.lots || []).map((l) => ({ ...l }));
  lines.forEach((line, i) => {
    if (i === skip || line.productErpId !== product?.product_erp_id) return;
    takeFromLots(lots, num(line.qty), num(line.mrp) > 0 ? line : null);
  });
  return lots;
};
const lotLabel = (l) =>
  [`₹${num(l.mrp).toFixed(2).replace(/\.00$/, "")}`, l.batchNumber, l.expiryDate ? `exp ${showDate(l.expiryDate)}` : ""]
    .filter(Boolean)
    .join(" · ");

// Amount (incl. GST), taxable and GST of a line.
const lineMoney = (line) => {
  const amount = round2(num(line.qty) * num(line.rate));
  const taxable = round2(amount / (1 + num(line.gstPercent || 5) / 100));
  return { amount, taxable, gst: round2(amount - taxable) };
};

const emptyDraft = () => ({ productErpId: "", qty: "", rate: "", rateEdited: false });

export default function CreateSales() {
  const companies = useCompanies();
  const [show, flashNode] = useFlash();

  // Buyer
  const [buyerType, setBuyerType] = useState("distributor");
  const [companyType, setCompanyType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const company = companies.find((c) => String(c.id) === String(companyId));
  const [distributors, setDistributors] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [buyerId, setBuyerId] = useState("");
  const [outletSearch, setOutletSearch] = useState("");

  // Bill
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [saleDate, setSaleDate] = useState(todayLocal());
  const [stock, setStock] = useState([]);
  const [stockError, setStockError] = useState("");
  const [loadingStock, setLoadingStock] = useState(false);
  const [schemes, setSchemes] = useState([]);
  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState(emptyDraft());
  const [paymentMode, setPaymentMode] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Bills list
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [listFrom, setListFrom] = useState("");
  const [listTo, setListTo] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [payFor, setPayFor] = useState(null); // { sale, amount, mode, date, reference }
  const [payError, setPayError] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [toCancel, setToCancel] = useState(null); // { sale, reason }
  const [cancelBusy, setCancelBusy] = useState(false);

  const resetBill = () => {
    setLines([]);
    setDraft(emptyDraft());
    setPaidAmount("");
    setPaymentReference("");
    setRemarks("");
    setInvoiceNumber("");
    setError("");
  };

  // Company: its stock, free goods, distributors and outlets.
  const loadStock = useCallback(async () => {
    setStock([]);
    setStockError("");
    if (!company) return;
    setLoadingStock(true);
    try {
      const res = await apiFetch(`/staff/current-stock?${new URLSearchParams({ companyName: company.name })}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load stock.");
      setStock((Array.isArray(body.items) ? body.items : []).filter((it) => num(it.total_current_stock_in_pcs) > 0));
    } catch (err) {
      setStockError(err.message);
    } finally {
      setLoadingStock(false);
    }
  }, [company]);

  useEffect(() => {
    resetBill();
    setBuyerId("");
    setDistributors([]);
    setOutlets([]);
    setSchemes([]);
    loadStock();
    if (!companyId) return;
    apiFetch(`/staff/distributors?${new URLSearchParams({ companyId })}`)
      .then(readJson)
      .then((b) => setDistributors((b.distributors || []).filter((d) => d.is_active)))
      .catch(() => {});
    apiFetch(`/staff/dms-sales/outlets?${new URLSearchParams({ companyId })}`)
      .then(readJson)
      .then((b) => setOutlets(b.outlets || []))
      .catch(() => {});
    apiFetch(`/staff/free-goods/active?${new URLSearchParams({ companyId })}`)
      .then(readJson)
      .then((b) => setSchemes(b.schemes || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const stockByErp = useMemo(() => new Map(stock.map((it) => [it.product_erp_id, it])), [stock]);
  const pickerItems = useMemo(
    () =>
      stock.map((it, i) => ({
        id: it.product_erp_id,
        product_erp_id: it.product_erp_id,
        sku_name: it.product_name,
        variant_name: it.variant_name,
        item_code: it.item_code,
        pcs_per_box: it.pcs_per_box,
        sr: i + 1,
      })),
    [stock]
  );

  const buyer =
    buyerType === "distributor"
      ? distributors.find((d) => String(d.id) === String(buyerId))
      : outlets.find((o) => String(o.id) === String(buyerId));

  // ---- lines ----
  const paidLines = lines.filter((l) => !l.isFree);
  const draftProduct = stockByErp.get(draft.productErpId);
  const draftLots = draftProduct ? remainingLots(draftProduct, lines).filter((l) => num(l.pcs) > 0) : [];
  const draftAvailable = draftLots.reduce((t, l) => t + num(l.pcs), 0);

  const pickItem = (it) => {
    setError("");
    if (!it) return setDraft(emptyDraft());
    const product = stockByErp.get(it.product_erp_id);
    const first = product ? remainingLots(product, lines).find((l) => num(l.pcs) > 0) : null;
    setDraft((d) => ({
      ...d,
      productErpId: it.product_erp_id,
      rate: String(num(first?.wholesale_price) || num(product?.wholesale_price) || ""),
      rateEdited: false,
    }));
    return undefined;
  };

  const addLine = (e) => {
    e?.preventDefault();
    if (!draftProduct) return setError("Choose an item.");
    const want = num(draft.qty);
    if (!(want > 0)) return setError("Enter the quantity.");
    if (want > draftAvailable) return setError(`Only ${showQty(draftAvailable)} pcs of this item are in stock.`);
    if (draft.rate === "" || num(draft.rate) < 0) return setError("Enter the rate.");
    const lots = remainingLots(draftProduct, lines);
    const { taken } = takeFromLots(lots, want);
    const add = (taken.length ? taken : [{ lot: { mrp: draftProduct.mrp }, qty: want }]).map(({ lot, qty }) => ({
      productErpId: draftProduct.product_erp_id,
      itemCode: draftProduct.item_code || "",
      productName: draftProduct.product_name || "",
      variantName: draftProduct.variant_name || "",
      hsnCode: draftProduct.hsn_code || "",
      gstPercent: num(draftProduct.gst_percent) || 5,
      mrp: lot.mrp,
      batchNumber: lot.batchNumber || "",
      expiryDate: lot.expiryDate || "",
      qty,
      // Each lot its own wholesale price, unless a rate was typed.
      rate: draft.rateEdited ? num(draft.rate) : num(lot.wholesale_price) || num(draft.rate),
    }));
    setLines((prev) => [...prev.filter((l) => !l.isFree), ...add]);
    setDraft(emptyDraft());
    setError("");
    return undefined;
  };

  // Free lines follow the paid lines (the server works them out again on save).
  useEffect(() => {
    const paid = lines.filter((l) => !l.isFree);
    const bought = new Map();
    paid.forEach((l) => bought.set(l.productErpId, (bought.get(l.productErpId) || 0) + num(l.qty)));
    const free = [];
    schemes.forEach((s) => {
      const sets = s.buy_qty > 0 ? Math.floor((bought.get(s.product_erp_id) || 0) / s.buy_qty) : 0;
      if (sets <= 0) return;
      const product = stockByErp.get(s.free_product_erp_id || s.product_erp_id);
      if (!product) return;
      takeFromLots(remainingLots(product, [...paid, ...free]), sets * s.free_qty).taken.forEach(({ lot, qty }) =>
        free.push({
          productErpId: product.product_erp_id,
          itemCode: product.item_code || "",
          productName: product.product_name || "",
          variantName: product.variant_name || "",
          hsnCode: product.hsn_code || "",
          gstPercent: num(product.gst_percent) || 5,
          mrp: lot.mrp,
          batchNumber: lot.batchNumber || "",
          expiryDate: lot.expiryDate || "",
          qty,
          rate: 0,
          isFree: true,
          freeNote: `Buy ${s.buy_qty} get ${s.free_qty} free`,
        })
      );
    });
    const sig = (list) => list.map((l) => `${l.productErpId}|${lotKey(l)}|${l.qty}`).join(",");
    if (sig(lines.filter((l) => l.isFree)) !== sig(free)) setLines([...paid, ...free]);
  }, [lines, schemes, stockByErp]);

  const setLineRate = (index, value) =>
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, rate: value === "" ? "" : num(value) } : l)));

  const totals = useMemo(() => {
    const t = lines.reduce(
      (acc, l) => {
        const m = lineMoney(l);
        return { qty: acc.qty + num(l.qty), amount: acc.amount + m.amount, taxable: acc.taxable + m.taxable, gst: acc.gst + m.gst };
      },
      { qty: 0, amount: 0, taxable: 0, gst: 0 }
    );
    const total = Math.round(t.amount);
    return { ...t, total, roundOff: round2(total - t.amount) };
  }, [lines]);
  const paid = Math.min(num(paidAmount), totals.total);

  const save = async () => {
    if (!company) return setError("Choose the company.");
    if (!buyer) return setError(buyerType === "distributor" ? "Choose the distributor." : "Choose the outlet.");
    if (!invoiceNumber.trim()) return setError("Enter the invoice number.");
    if (!paidLines.length) return setError("Add at least one item.");
    if (paidLines.some((l) => l.rate === "" || num(l.rate) < 0)) return setError("Every line needs a rate.");
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/staff/dms-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: Number(companyId),
          buyerType,
          distributorId: buyerType === "distributor" ? Number(buyerId) : undefined,
          outletId: buyerType === "outlet" ? Number(buyerId) : undefined,
          invoiceNumber: invoiceNumber.trim(),
          saleDate,
          lines: paidLines.map((l) => ({
            productErpId: l.productErpId,
            qty: num(l.qty),
            rate: num(l.rate),
            mrp: l.mrp,
            batchNumber: l.batchNumber,
            expiryDate: l.expiryDate,
          })),
          paymentMode,
          paidAmount: paymentMode === "credit" ? 0 : paid,
          paymentReference,
          remarks,
        }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not save the bill.");
      show(true, body.message || "Saved.");
      const savedId = body.id;
      resetBill();
      loadStock();
      loadSales();
      if (savedId) openPrint(savedId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  // ---- bills ----
  const loadSales = useCallback(async () => {
    setLoadingSales(true);
    try {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      if (listFrom) params.set("from", listFrom);
      if (listTo) params.set("to", listTo);
      if (dueOnly) params.set("due", "1");
      const res = await apiFetch(`/staff/dms-sales?${params}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load bills.");
      setSales(Array.isArray(body.sales) ? body.sales : []);
    } catch (err) {
      setSales([]);
      show(false, err.message);
    } finally {
      setLoadingSales(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, listFrom, listTo, dueOnly]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const openPrint = async (id) => {
    try {
      const res = await apiFetch(`/staff/dms-sales/${id}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load the bill.");
      printInvoice(body);
    } catch (err) {
      show(false, err.message);
    }
  };

  const savePayment = async (e) => {
    e.preventDefault();
    if (!(num(payFor.amount) > 0)) return setPayError("Enter the amount received.");
    setPayBusy(true);
    setPayError("");
    try {
      const res = await apiFetch(`/staff/dms-sales/${payFor.sale.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: num(payFor.amount), paymentMode: payFor.mode, paymentDate: payFor.date, reference: payFor.reference }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not record the payment.");
      show(true, body.message);
      setPayFor(null);
      loadSales();
    } catch (err) {
      setPayError(err.message);
    } finally {
      setPayBusy(false);
    }
    return undefined;
  };

  const cancelBill = async () => {
    if (!toCancel.reason.trim()) return show(false, "Enter why the bill is cancelled.");
    setCancelBusy(true);
    try {
      const res = await apiFetch(`/staff/dms-sales/${toCancel.sale.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: toCancel.reason }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not cancel the bill.");
      show(true, body.message);
      setToCancel(null);
      loadSales();
      loadStock();
    } catch (err) {
      show(false, err.message);
    } finally {
      setCancelBusy(false);
    }
    return undefined;
  };

  const shownSales = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return sales;
    return sales.filter((s) => {
      const hay = [s.invoice_number, s.buyer_name, s.buyer_code, s.company_name].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [sales, search]);
  const dueTotal = shownSales.filter((s) => s.status === "active").reduce((t, s) => t + num(s.balance_amount), 0);

  const exportSales = () =>
    downloadExcel({
      fileName: "DMS_Sales",
      title: `Sales${company ? ` · ${company.name}` : ""}`,
      sheets: [
        {
          name: "Sales",
          rows: shownSales,
          totalLabel: "Total",
          columns: [
            { header: "Sr No.", value: (_, i) => i + 1, width: 8, type: "number" },
            { header: "Date", key: "sale_date", width: 12, type: "date" },
            { header: "Invoice", key: "invoice_number", width: 14 },
            { header: "Company", key: "company_name", width: 18 },
            { header: "Buyer type", value: (s) => (s.buyer_type === "outlet" ? "Outlet" : "Distributor / CNF"), width: 16 },
            { header: "Buyer", key: "buyer_name", width: 28 },
            { header: "Code", key: "buyer_code", width: 12 },
            { header: "Qty", key: "total_qty", width: 9, type: "number", total: true },
            { header: "Taxable", key: "taxable_amount", width: 13, type: "money", total: true },
            { header: "GST", key: "gst_amount", width: 11, type: "money", total: true },
            { header: "Total", key: "total_amount", width: 13, type: "money", total: true },
            { header: "Paid", key: "paid_amount", width: 12, type: "money", total: true },
            { header: "Balance", key: "balance_amount", width: 12, type: "money", total: true },
            { header: "Status", value: (s) => (s.status === "cancelled" ? "Cancelled" : num(s.balance_amount) > 0 ? "Due" : "Paid"), width: 10 },
          ],
        },
      ],
    });

  const outletsShown = useMemo(() => {
    const words = outletSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return outlets.filter((o) => {
      if (!words.length) return true;
      const hay = [o.outlet_name, o.outlet_erp_id, o.location_name, o.staff_name].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [outlets, outletSearch]);

  const ready = Boolean(company && buyer);

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Sales" title="Create Sales">
        Bill a distributor / CNF or an outlet. Rates are wholesale prices incl. GST (editable); free goods are added at ₹0.
      </PageHeader>

      {/* Buyer type */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-medium text-base-content/80">Sell to</span>
        <div className="join">
          {[
            ["distributor", "Distributor / CNF"],
            ["outlet", "Outlet"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`btn join-item btn-sm min-w-36 ${buyerType === value ? "btn-primary" : "btn-outline field-border"}`}
              onClick={() => {
                setBuyerType(value);
                setBuyerId("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <CompanyPicker
        companies={companies}
        type={companyType}
        onTypeChange={(t) => {
          setCompanyType(t);
          setCompanyId("");
        }}
        companyId={companyId}
        onCompanyChange={setCompanyId}
      >
        {buyerType === "distributor" ? (
          <Field label={companyType === "cnf" ? "CNF" : "Distributor"} className="min-w-64 flex-1 sm:max-w-sm">
            <select className="select select-sm w-full" value={buyerId} disabled={!company} onChange={(e) => setBuyerId(e.target.value)}>
              <option value="">{!company ? "Choose the company first" : distributors.length ? "Select" : "None added on Add Distributor"}</option>
              {distributors.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.distributor_name} ({d.login_id})
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Find outlet" className="w-48">
              <input className="input input-sm w-full" disabled={!company} placeholder="Name, ERP ID, staff" value={outletSearch} onChange={(e) => setOutletSearch(e.target.value)} />
            </Field>
            <Field label="Outlet" className="min-w-64 flex-1 sm:max-w-sm">
              <select className="select select-sm w-full" value={buyerId} disabled={!company} onChange={(e) => setBuyerId(e.target.value)}>
                <option value="">{!company ? "Choose the company first" : outletsShown.length ? "Select outlet" : "No outlets"}</option>
                {outletsShown.slice(0, 500).map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.outlet_name}
                    {o.outlet_erp_id ? ` (${o.outlet_erp_id})` : ""}
                    {o.staff_name ? ` · ${o.staff_name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </CompanyPicker>

      {/* Bill */}
      <section className="mb-5 rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <div className="mr-auto">
            <h2 className="font-semibold">New bill{buyer ? ` · ${buyer.distributor_name || buyer.outlet_name}` : ""}</h2>
            {buyer && (
              <p className="text-xs text-base-content/55">
                {buyer.login_id || buyer.outlet_erp_id || ""}
                {buyer.gstin ? ` · GSTIN ${buyer.gstin}` : ""}
                {buyer.contact_no || buyer.contact_number ? ` · ${buyer.contact_no || buyer.contact_number}` : ""}
              </p>
            )}
            {!ready && <p className="text-xs text-base-content/55">Choose the company and the {buyerType === "outlet" ? "outlet" : "distributor"} first.</p>}
            {stockError && <p className="text-xs text-error">{stockError}</p>}
          </div>
          <Field label="Invoice no." required className="w-44">
            <input className="input input-sm w-full" maxLength={50} disabled={!ready} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
          <Field label="Date" required className="w-40">
            <input type="date" className="input input-sm w-full" max={todayLocal()} disabled={!ready} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          </Field>
        </div>

        <form onSubmit={addLine}>
          <fieldset disabled={!ready || saving} className="grid grid-cols-2 gap-x-3 gap-y-3 border-b border-base-300 p-4 md:grid-cols-[minmax(260px,2fr)_repeat(3,minmax(0,1fr))_auto]">
            <Field label="Item" className="col-span-2 md:col-span-1">
              <ItemPicker items={pickerItems} value={pickerItems.find((p) => p.product_erp_id === draft.productErpId) || null} onPick={pickItem} loading={loadingStock} />
            </Field>
            <Field label="In stock">
              <input readOnly tabIndex={-1} className="input w-full bg-base-200/70" value={draftProduct ? `${showQty(draftAvailable)} pcs` : ""} />
            </Field>
            <Field label="Qty (pcs)" required>
              <input type="number" min="1" step="1" className="input w-full" value={draft.qty} onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))} />
            </Field>
            <Field label="Rate (incl. GST)" required hint={draft.rateEdited ? "Typed: used for every lot" : "Wholesale of each lot"}>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input w-full"
                value={draft.rate}
                onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value, rateEdited: true }))}
              />
            </Field>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary btn-sm">
                <MdAdd size={18} /> Add
              </button>
            </div>
            {draftLots.length > 1 && (
              <p className="col-span-2 text-xs text-base-content/60 md:col-span-5">
                Sells in this order:{" "}
                {draftLots.map((l, i) => (
                  <span key={lotKey(l)}>
                    {i > 0 ? " → " : ""}
                    <b>{lotLabel(l)}</b> ({showQty(l.pcs)} pcs, {rupees(l.wholesale_price)})
                  </span>
                ))}
              </p>
            )}
          </fieldset>
        </form>

        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-base-content/55">No items yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm whitespace-nowrap">
              <thead>
                <tr className="bg-base-200/60 text-base-content/70">
                  <th className="w-10 text-right">Sr</th>
                  <th>Item</th>
                  <th>HSN</th>
                  <th className="text-right">MRP</th>
                  <th>Batch / Exp</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">GST %</th>
                  <th className="text-right">Taxable</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Amount</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const m = lineMoney(l);
                  return (
                    <tr key={`${l.productErpId}|${lotKey(l)}|${l.isFree ? "f" : "p"}|${i}`} className={l.isFree ? "bg-success/10" : "hover:bg-base-200/50"}>
                      <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                      <td className="max-w-64">
                        <div className="truncate font-medium">
                          {l.isFree && <span className="badge badge-success badge-sm mr-2">FREE</span>}
                          {l.variantName || l.productName}
                        </div>
                        <div className="truncate font-mono text-xs text-base-content/55">
                          {l.itemCode || l.productErpId}
                          {l.isFree ? ` · ${l.freeNote}` : ""}
                        </div>
                      </td>
                      <td className="font-mono text-xs">{l.hsnCode || "—"}</td>
                      <td className="text-right tabular-nums">{num(l.mrp) ? rupees(l.mrp) : "—"}</td>
                      <td className="text-xs">
                        {[l.batchNumber, l.expiryDate ? `exp ${showDate(l.expiryDate)}` : ""].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="text-right font-semibold tabular-nums">{showQty(l.qty)}</td>
                      <td className="text-right">
                        {l.isFree ? (
                          <span className="tabular-nums">₹0</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input input-xs w-24 text-right"
                            value={l.rate}
                            onChange={(e) => setLineRate(i, e.target.value)}
                          />
                        )}
                      </td>
                      <td className="text-right tabular-nums">{num(l.gstPercent)}</td>
                      <td className="text-right tabular-nums">{rupees(m.taxable)}</td>
                      <td className="text-right tabular-nums">{rupees(m.gst)}</td>
                      <td className="text-right font-semibold tabular-nums">{rupees(m.amount)}</td>
                      <td>
                        {!l.isFree && (
                          <button type="button" className="btn btn-ghost btn-xs btn-square text-error" title="Remove" onClick={() => setLines((p) => p.filter((_, x) => x !== i))}>
                            <MdDeleteOutline size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals + payment */}
        <div className="grid grid-cols-1 gap-5 border-t border-base-300 p-4 lg:grid-cols-[1fr_320px]">
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-3">
            <Field label="Payment">
              <select className="select w-full" value={paymentMode} disabled={!ready} onChange={(e) => setPaymentMode(e.target.value)}>
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Paid now" hint={paymentMode === "credit" ? "Credit: all due" : undefined}>
              <div className="join w-full">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input join-item w-full"
                  disabled={!ready || paymentMode === "credit"}
                  value={paymentMode === "credit" ? "" : paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
                <button type="button" className="btn join-item" disabled={!ready || paymentMode === "credit" || !totals.total} onClick={() => setPaidAmount(String(totals.total))}>
                  Full
                </button>
              </div>
            </Field>
            <Field label="Reference">
              <input className="input w-full" maxLength={255} disabled={!ready} placeholder="UPI / cheque no." value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
            </Field>
            <Field label="Remarks" className="sm:col-span-3">
              <input className="input w-full" maxLength={1000} disabled={!ready} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          </div>
          <div className="rounded-box border border-base-300 bg-base-200/40 p-3 text-sm">
            {[
              ["Items", `${lines.length} lines · ${showQty(totals.qty)} pcs`],
              ["Taxable", rupees(totals.taxable)],
              ["CGST", rupees(totals.gst / 2)],
              ["SGST", rupees(totals.gst / 2)],
              ["Round off", rupees(totals.roundOff)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-0.5 text-base-content/70">
                <span>{k}</span>
                <span className="tabular-nums">{v}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t border-base-300 pt-1.5 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{rupees(totals.total)}</span>
            </div>
            <div className="flex justify-between py-0.5 text-base-content/70">
              <span>Paid</span>
              <span className="tabular-nums">{rupees(paymentMode === "credit" ? 0 : paid)}</span>
            </div>
            <div className="flex justify-between py-0.5 font-semibold text-error">
              <span>Balance due</span>
              <span className="tabular-nums">{rupees(totals.total - (paymentMode === "credit" ? 0 : paid))}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-base-300 bg-base-200/50 px-4 py-3">
          {error && <p className="text-sm text-error">{error}</p>}
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={resetBill}>
              Clear
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!ready || saving || !paidLines.length} onClick={save}>
              {saving ? <span className="loading loading-spinner loading-xs" /> : <MdSave size={17} />}
              Save &amp; print
            </button>
          </span>
        </div>
      </section>

      {/* Bills */}
      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <div className="mr-auto">
            <h2 className="font-semibold">Bills{company ? ` · ${company.name}` : ""}</h2>
            <p className="text-xs text-base-content/55">
              {shownSales.length} bill{shownSales.length === 1 ? "" : "s"} · due <b className="text-error">{rupees(dueTotal)}</b>
            </p>
          </div>
          <label className="flex items-center gap-1 text-xs text-base-content/60">
            From
            <input type="date" className="input input-sm w-36" value={listFrom} max={listTo || undefined} onChange={(e) => setListFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-xs text-base-content/60">
            To
            <input type="date" className="input input-sm w-36" value={listTo} min={listFrom || undefined} onChange={(e) => setListTo(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-sm" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
            Due only
          </label>
          <label className="input input-sm w-56">
            <MdSearch size={16} className="opacity-50" />
            <input placeholder="Invoice, buyer, code" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="btn btn-ghost btn-sm btn-square" title="Refresh" disabled={loadingSales} onClick={loadSales}>
            <MdRefresh size={18} />
          </button>
          <ExcelButton disabled={!shownSales.length} onExport={exportSales} onError={(err) => show(false, err.message)} />
        </div>
        {loadingSales ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">
            <span className="loading loading-spinner loading-sm" />
          </p>
        ) : shownSales.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">No bills yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm whitespace-nowrap">
              <thead>
                <tr className="bg-base-200/60 text-base-content/70">
                  <th className="w-10 text-right">Sr</th>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Buyer</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                  <th>Status</th>
                  <th className="w-48">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shownSales.map((s, i) => {
                  const cancelled = s.status === "cancelled";
                  const due = num(s.balance_amount) > 0;
                  return (
                    <tr key={s.id} className={cancelled ? "opacity-55" : "hover:bg-base-200/50"}>
                      <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                      <td>{showDate(s.sale_date)}</td>
                      <td className="font-mono text-xs font-semibold">{s.invoice_number}</td>
                      <td className="max-w-64">
                        <div className="truncate font-medium">{s.buyer_name}</div>
                        <div className="truncate text-xs text-base-content/55">
                          {s.buyer_type === "outlet" ? "Outlet" : "Distributor / CNF"}
                          {s.buyer_code ? ` · ${s.buyer_code}` : ""}
                          {!companyId && s.company_name ? ` · ${s.company_name}` : ""}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">{showQty(s.total_qty)}</td>
                      <td className="text-right font-semibold tabular-nums">{rupees(s.total_amount)}</td>
                      <td className="text-right tabular-nums">{rupees(s.paid_amount)}</td>
                      <td className={`text-right tabular-nums ${due && !cancelled ? "font-semibold text-error" : ""}`}>{rupees(s.balance_amount)}</td>
                      <td>
                        {cancelled ? (
                          <span className="badge badge-ghost badge-sm" title={s.cancel_reason || ""}>Cancelled</span>
                        ) : due ? (
                          <span className="badge badge-error badge-sm">Due</span>
                        ) : (
                          <span className="badge badge-success badge-sm">Paid</span>
                        )}
                      </td>
                      <td className="text-right">
                        <button type="button" className="btn btn-ghost btn-xs" title="Print / PDF" onClick={() => openPrint(s.id)}>
                          <MdPrint size={15} /> Print
                        </button>
                        {!cancelled && due && (
                          <button
                            type="button"
                            className="btn btn-soft btn-success btn-xs"
                            onClick={() => {
                              setPayError("");
                              setPayFor({ sale: s, amount: String(num(s.balance_amount)), mode: "cash", date: todayLocal(), reference: "" });
                            }}
                          >
                            <MdPayments size={15} /> Receive
                          </button>
                        )}
                        {!cancelled && (
                          <button type="button" className="btn btn-ghost btn-xs btn-square text-error" title="Cancel bill" onClick={() => setToCancel({ sale: s, reason: "" })}>
                            <MdBlock size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payFor && (
        <EditDialog
          title="Receive payment"
          subtitle={`${payFor.sale.invoice_number} · ${payFor.sale.buyer_name} · due ${rupees(payFor.sale.balance_amount)}`}
          busy={payBusy}
          error={payError}
          onClose={() => setPayFor(null)}
          onSubmit={savePayment}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Amount" required>
              <input type="number" min="0" step="0.01" className="input w-full" value={payFor.amount} onChange={(e) => setPayFor((p) => ({ ...p, amount: e.target.value }))} />
            </Field>
            <Field label="Date" required>
              <input type="date" className="input w-full" max={todayLocal()} value={payFor.date} onChange={(e) => setPayFor((p) => ({ ...p, date: e.target.value }))} />
            </Field>
            <Field label="Mode">
              <select className="select w-full" value={payFor.mode} onChange={(e) => setPayFor((p) => ({ ...p, mode: e.target.value }))}>
                {MODES.filter((m) => m.value !== "credit").map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference">
              <input className="input w-full" maxLength={255} value={payFor.reference} onChange={(e) => setPayFor((p) => ({ ...p, reference: e.target.value }))} />
            </Field>
          </div>
        </EditDialog>
      )}

      {toCancel && (
        <ConfirmDialog title="Cancel this bill?" confirmLabel="Cancel bill" busy={cancelBusy} onCancel={() => setToCancel(null)} onConfirm={cancelBill}>
          <p>
            {toCancel.sale.invoice_number} · {toCancel.sale.buyer_name} · {rupees(toCancel.sale.total_amount)}. Its stock goes back.
          </p>
          <input
            className="input input-sm mt-3 w-full"
            placeholder="Reason (required)"
            maxLength={500}
            value={toCancel.reason}
            onChange={(e) => setToCancel((c) => ({ ...c, reason: e.target.value }))}
          />
        </ConfirmDialog>
      )}
      {flashNode}
    </div>
  );
}
