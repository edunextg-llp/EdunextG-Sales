import { useEffect, useMemo, useRef, useState } from "react";
import { MdAdd, MdArrowBack, MdCheck, MdClose, MdDeleteOutline, MdEdit, MdFileDownload, MdUploadFile } from "react-icons/md";
import { apiFetch } from "../../auth";
import { COMPANY_TYPES, ConfirmDialog, Field, readJson } from "../ui";
import ItemPicker from "./ItemPicker";
import {
  DRAFT_KEY,
  calcLine,
  dpAmtPerPiece,
  emptyLine,
  erpKey,
  isEverestCompany,
  itemFields,
  lineSnapshot,
  qty,
  rupees,
  showDate,
  todayLocal,
  validateLine,
} from "../../utils/purchaseCalc";

const lineKey = (l) => `${erpKey(l.productErpId)}|${(Math.round((Number(l.mrp) || 0) * 100) / 100).toFixed(2)}`;

const jsonPost = (path, body, method = "POST") =>
  apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function SlipRow({ label, value, strong, muted }) {
  return (
    <div className={`flex items-baseline gap-2 py-1 text-sm ${muted ? "text-base-content/55" : ""}`}>
      <span className="shrink-0">{label}</span>
      <span className="mb-1 flex-1 border-b border-dotted border-base-300" />
      <span className={`tabular-nums ${strong ? "text-base font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

/** Grey, non-editable box for values that come from the item or are calculated. */
function ReadBox({ label, value, mono, strong }) {
  return (
    <Field label={label}>
      <input
        readOnly
        tabIndex={-1}
        title={value || ""}
        value={value || ""}
        placeholder="—"
        className={`input w-full cursor-default bg-base-200/70 ${mono ? "font-mono text-xs" : ""} ${
          strong ? "font-semibold" : ""
        }`}
      />
    </Field>
  );
}

/** Sale price minus DP amt (DP + GST) per piece; red when below it. */
function MarginBox({ label, price, cost }) {
  const p = Number(price);
  if (!(p > 0)) return <ReadBox label={label} value="" />;
  const margin = p - cost;
  return (
    <Field label={label}>
      <input
        readOnly
        tabIndex={-1}
        value={`${rupees(margin)}${cost > 0 ? ` (${((margin / cost) * 100).toFixed(1)}%)` : ""}`}
        className={`input w-full bg-base-200/60 tabular-nums ${margin < 0 ? "text-error font-semibold" : "text-success"}`}
      />
    </Field>
  );
}

const pct = (v) => `${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;

/**
 * Full-page purchase entry. Keeps a draft in localStorage (same key and shape as
 * the main site) so a refresh, or "edit invoice" from Purchase History, lands here.
 */
export default function PurchaseEntry({ companies, draft, onClose, onSaved, onStockChanged, showFlash }) {
  const lineIdRef = useRef(0);
  const nextLineId = () => {
    lineIdRef.current += 1;
    return `line-${Date.now()}-${lineIdRef.current}`;
  };

  const [companyId, setCompanyId] = useState(draft?.manualCompanyId || "");
  const [companyType, setCompanyType] = useState("");
  const [sellerId, setSellerId] = useState(draft?.manualSellerId || "");
  const [invoiceNumber, setInvoiceNumber] = useState(draft?.manualInvoiceNumber || "");
  const [invoiceDate, setInvoiceDate] = useState(String(draft?.manualUploadDate || todayLocal()).slice(0, 10));
  const [line, setLine] = useState(() => ({ ...emptyLine(), ...(draft?.manualItem || {}) }));
  const [lines, setLines] = useState(() =>
    (Array.isArray(draft?.pendingItems) ? draft.pendingItems : []).map((l) => ({ ...l, id: l.id || nextLineId() }))
  );
  const [editingId, setEditingId] = useState(null);

  const [sellers, setSellers] = useState([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [sellerItems, setSellerItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [excelFile, setExcelFile] = useState(null);
  const [toRemove, setToRemove] = useState(null);
  const fileRef = useRef(null);

  const company = companies.find((c) => String(c.id) === String(companyId));
  const type = company?.type || companyType;
  // EVEREST / EVEREST (NEEVAN): Trade + Primary + Cash discount. Others: one Discount %.
  const everest = isEverestCompany(company?.name);
  // "Create sale bills?" = Yes on Add Company: wholesale / retail prices are entered here.
  const saleBill = Boolean(company) && Number(company.creates_sale_bill ?? 1) !== 0;
  const hasSavedLines = lines.some((l) => l.sourceDmsItemId);

  // Keep the draft up to date while this screen is open.
  useEffect(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        manualCompanyId: companyId,
        manualSellerId: sellerId,
        manualUploadDate: invoiceDate,
        manualInvoiceNumber: invoiceNumber,
        manualItem: line,
        pendingItems: lines,
        selectedSellerItemId: line.sourceItemId ? String(line.sourceItemId) : "",
      })
    );
  }, [companyId, sellerId, invoiceDate, invoiceNumber, line, lines]);

  useEffect(() => {
    if (!companyId) {
      setSellers([]);
      return;
    }
    setLoadingSellers(true);
    apiFetch(`/staff/purchase-sellers/company/${companyId}`)
      .then(readJson)
      .then((data) => setSellers(Array.isArray(data) ? data : []))
      .catch(() => setSellers([]))
      .finally(() => setLoadingSellers(false));
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !sellerId) {
      setSellerItems([]);
      return;
    }
    setLoadingItems(true);
    apiFetch(`/staff/seller-items?${new URLSearchParams({ companyId, sellerId })}`)
      .then(readJson)
      .then((data) => setSellerItems(Array.isArray(data) ? data : []))
      .catch(() => setSellerItems([]))
      .finally(() => setLoadingItems(false));
  }, [companyId, sellerId]);

  const changeCompany = (id) => {
    setCompanyId(id);
    setSellerId("");
    setLine(emptyLine());
    setEditingId(null);
    setError("");
  };

  const changeSeller = (id) => {
    setSellerId(id);
    setLine(emptyLine());
    setEditingId(null);
    setError("");
  };

  const set = (field) => (e) => {
    setError("");
    setLine((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // The seller item that matches the line being edited (for the picker label).
  const pickedItem = useMemo(() => {
    if (!line.productErpId) return null;
    return (
      sellerItems.find((it) => line.sourceItemId && String(it.id) === String(line.sourceItemId)) ||
      sellerItems.find((it) => erpKey(it.product_erp_id) === erpKey(line.productErpId)) || {
        id: "current",
        product_erp_id: line.productErpId,
        sku_name: line.productName,
        variant_name: line.variantName,
      }
    );
  }, [line.productErpId, line.productName, line.sourceItemId, line.variantName, sellerItems]);

  const pickItem = (item) => {
    setError("");
    if (!item) {
      setLine(emptyLine());
      return;
    }
    // Keep numbers already typed in; replace only what belongs to the item.
    setLine((prev) => ({ ...prev, ...itemFields(item) }));
    if (!saleBill || !item.product_erp_id) return;
    // Prefill wholesale / retail with the item's last prices (only boxes still empty).
    const picked = item.product_erp_id;
    apiFetch(`/staff/dms-stock/last-sale-prices?${new URLSearchParams({ companyId, erpId: picked })}`)
      .then(readJson)
      .then((data) =>
        setLine((prev) =>
          erpKey(prev.productErpId) !== erpKey(picked)
            ? prev
            : {
                ...prev,
                wholesalePrice: prev.wholesalePrice || (data?.wholesalePrice ? String(data.wholesalePrice) : ""),
                retailPrice: prev.retailPrice || (data?.retailPrice ? String(data.retailPrice) : ""),
              }
        )
      )
      .catch(() => {});
  };

  const calc = calcLine(line, everest);
  // DP amt / pc = DP + GST. Wholesale / retail margin = sale price - DP amt.
  const dpAmt = dpAmtPerPiece(line);
  const belowDp = (p) => p !== "" && p != null && dpAmt > 0 && Number(p) < dpAmt - 0.00005;

  const resetLine = () => {
    setLine(emptyLine());
    setEditingId(null);
    setError("");
  };

  const addLine = async (e) => {
    e?.preventDefault();
    if (!companyId) return setError("Select a company.");
    if (!sellerId) return setError("Select a seller.");
    const problem = validateLine(line, everest);
    if (problem) return setError(problem);

    // A line is the item at one MRP: the same item at a new MRP gets its own line;
    // the same item at the same MRP replaces the earlier line. Stock adds them up per item.
    const key = lineKey(line);
    const replacing = lines.some((l) => lineKey(l) === key && l.id !== editingId);
    const snapshot = lineSnapshot(line, everest, replacing);

    // Lines that came from a saved invoice are updated in the database straight away.
    if (snapshot.sourceDmsItemId) {
      setBusy("line");
      try {
        const res = await jsonPost(`/staff/dms-stock/items/${snapshot.sourceDmsItemId}`, snapshot, "PUT");
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || "Could not save this line.");
        onStockChanged(data);
      } catch (err) {
        setError(err.message);
        return undefined;
      } finally {
        setBusy("");
      }
    }

    setLines((prev) => {
      if (editingId) return prev.map((l) => (l.id === editingId ? { ...snapshot, id: editingId } : l));
      return [...prev.filter((l) => lineKey(l) !== key), { ...snapshot, id: nextLineId() }];
    });
    showFlash(
      true,
      snapshot.sourceDmsItemId
        ? `${snapshot.productErpId} saved.`
        : replacing
          ? `${snapshot.productErpId} at MRP ${snapshot.mrp} replaced in the list.`
          : `${snapshot.productErpId} added to the invoice.`
    );
    resetLine();
    return undefined;
  };

  const editLine = (l) => {
    setLine({ ...emptyLine(), ...l });
    setEditingId(l.id);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeLine = async (l) => {
    if (l.sourceDmsItemId) {
      setBusy("remove");
      try {
        const res = await apiFetch(`/staff/dms-stock/items/${l.sourceDmsItemId}`, { method: "DELETE" });
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || "Could not delete this line.");
        onStockChanged(data);
      } catch (err) {
        showFlash(false, err.message);
        setBusy("");
        setToRemove(null);
        return;
      }
      setBusy("");
    }
    setLines((prev) => prev.filter((x) => x.id !== l.id));
    if (editingId === l.id) resetLine();
    setToRemove(null);
  };

  const savePurchase = async () => {
    if (!companyId) return setError("Select a company.");
    if (!lines.length) return setError("Add at least one item.");
    setBusy("save");
    setError("");
    try {
      const res = await jsonPost("/staff/dms-stock/manual", {
        companyId,
        sellerId,
        invoiceNumber: invoiceNumber.trim(),
        uploadDate: invoiceDate,
        items: lines.map(({ id, ...rest }) => rest),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Could not save the purchase.");
      onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
    return undefined;
  };

  const downloadTemplate = async () => {
    setBusy("template");
    setError("");
    try {
      const res = await apiFetch(`/staff/dms-stock/manual-template?${new URLSearchParams({ companyId, sellerId })}`);
      if (!res.ok) throw new Error((await readJson(res)).error || "Could not download the template.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "DMS_Stock_Upload_Template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const uploadExcel = async () => {
    const body = new FormData();
    body.append("file", excelFile);
    body.append("companyId", companyId);
    body.append("sellerId", sellerId);
    body.append("invoiceNumber", invoiceNumber.trim());
    body.append("uploadDate", invoiceDate);
    setBusy("excel");
    setError("");
    try {
      const res = await apiFetch("/staff/dms-stock/manual-upload", { method: "POST", body });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Could not upload the Excel file.");
      onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const totals = lines.reduce(
    (sum, l) => ({
      pcs: sum.pcs + (Number(l.totalCurrentStockInPcs) || 0),
      boxes: sum.boxes + (Number(l.currentStockInCase) || 0),
      value: sum.value + (Number(l.totalValue) || 0),
      net: sum.net + (Number(l.price) || 0),
      taxable: sum.taxable + (Number(l.taxableAmount) || 0),
      gst: sum.gst + (Number(l.cgstAmount) || 0) + (Number(l.sgstAmount) || 0),
    }),
    { pcs: 0, boxes: 0, value: 0, net: 0, taxable: 0, gst: 0 }
  );

  const ready = Boolean(companyId && sellerId);
  const anyBusy = Boolean(busy);

  return (
    <div className="pb-20">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-base-300 pb-4">
        <div>
          <button type="button" className="btn btn-ghost btn-xs -ml-2 mb-1 gap-1 font-normal" onClick={onClose}>
            <MdArrowBack size={14} /> Purchases
          </button>
          <h1 className="text-2xl font-semibold">{hasSavedLines ? "Edit purchase" : "New purchase"}</h1>
        </div>
        <p className="max-w-md text-sm text-base-content/60">
          Fill the invoice details, add each item from the bill, then save. Your entry is kept if you refresh the page.
        </p>
      </header>

      {/* Invoice details */}
      <section className="mb-5 rounded-box border border-base-300 bg-base-100">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_160px_1fr]">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-base-content/80">Company type</span>
            <div className="join">
              {COMPANY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`btn join-item btn-sm h-10 min-w-24 ${type === t.value ? "btn-primary" : "btn-outline field-border"}`}
                  onClick={() => {
                    setCompanyType(t.value);
                    if (company && company.type !== t.value) changeCompany("");
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Company" required>
            <select className="select w-full" value={companyId} disabled={!type} onChange={(e) => changeCompany(e.target.value)}>
              <option value="">{type ? "Select company" : "Choose a type first"}</option>
              {companies
                .filter((c) => c.type === type || String(c.id) === String(companyId))
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Seller" required>
            <select
              className="select w-full"
              value={sellerId}
              disabled={!companyId || loadingSellers}
              onChange={(e) => changeSeller(e.target.value)}
            >
              <option value="">
                {loadingSellers ? "Loading sellers…" : companyId && !sellers.length ? "No sellers" : "Select seller"}
              </option>
              {sellers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.seller_name}
                  {s.seller_code ? ` (${s.seller_code})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Invoice date" required>
            <input type="date" className="input w-full" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
          <Field label="Invoice number">
            <input className="input w-full" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-base-300 px-4 py-2.5 text-sm">
          <span className="mr-1 text-base-content/60">
            Have the bill as Excel?{!ready && <span className="text-base-content/45"> Select company and seller first.</span>}
          </span>
          <button
            type="button"
            className="btn btn-soft btn-primary btn-sm"
            disabled={!ready || anyBusy}
            title={ready ? undefined : "Select company and seller first"}
            onClick={downloadTemplate}
          >
            {busy === "template" ? <span className="loading loading-spinner loading-xs" /> : <MdFileDownload size={16} />}
            Download template
          </button>
          <button
            type="button"
            className="btn btn-soft btn-primary btn-sm"
            disabled={!ready || anyBusy}
            title={ready ? undefined : "Select company and seller first"}
            onClick={() => fileRef.current?.click()}
          >
            <MdUploadFile size={16} />
            {excelFile ? "Change Excel" : "Choose Excel"}
          </button>
          {excelFile && <span className="max-w-56 truncate font-medium">{excelFile.name}</span>}
          {excelFile && (
            <button type="button" className="btn btn-primary btn-sm" disabled={anyBusy} onClick={uploadExcel}>
              {busy === "excel" && <span className="loading loading-spinner loading-xs" />}
              Upload and save invoice
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
          />
          <span className="basis-full text-xs text-base-content/50">
            Rows are matched to this seller&apos;s items by ERP ID, or by SKU and variant name. Only boxes and MRP are
            required.
          </span>
        </div>
      </section>

      {/* Line entry */}
      <form onSubmit={addLine} className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_270px]">
        <section className={`rounded-box border bg-base-100 ${editingId ? "border-accent" : "border-base-300"}`}>
          <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
            <h2 className="font-semibold">{editingId ? "Edit line" : "Add item"}</h2>
            {editingId && <span className="badge badge-accent badge-sm">Editing</span>}
          </div>
          <fieldset disabled={!ready || busy === "line"} className="space-y-4 p-4 disabled:opacity-60">
            <div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-3 xl:grid-cols-[minmax(11rem,1.3fr)_0.8fr_1fr_1fr_1.2fr_1.2fr]">
                <Field label="Item name" required className="col-span-2 md:col-span-3 xl:col-span-1">
                  <ItemPicker items={sellerItems} value={pickedItem} onPick={pickItem} disabled={!ready} loading={loadingItems} />
                </Field>
                {[
                  ["HSN code", pickedItem?.hsn_code || line.hsnCode, true],
                  ["Item code", pickedItem?.item_code || line.itemCode, true],
                  ["Product ERP ID", line.productErpId, true],
                  ["SKU name", line.productName],
                  ["Variant name", line.variantName],
                ].map(([label, value, mono]) => (
                  <Field key={label} label={label}>
                    <input
                      readOnly
                      tabIndex={-1}
                      title={value || ""}
                      value={value || ""}
                      placeholder="—"
                      className={`input w-full cursor-default bg-base-200/70 ${mono ? "font-mono text-xs" : ""}`}
                    />
                  </Field>
                ))}
              </div>
            </div>

            {/* MFG / expiry / batch */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-3">
              <Field label="MFG date">
                <input type="date" className="input w-full" value={line.mfgDate} onChange={set("mfgDate")} />
              </Field>
              <Field label="Expiry date">
                <input type="date" className="input w-full" value={line.expiryDate} onChange={set("expiryDate")} />
              </Field>
              <Field label="Batch no.">
                <input className="input w-full" value={line.batchNumber} onChange={set("batchNumber")} />
              </Field>
            </div>

            {/* Quantity and amount */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-dashed border-base-300 pt-4 md:grid-cols-4 xl:grid-cols-7">
              <ReadBox label="1 box = pcs" value={line.pcsPerBox ? String(Math.trunc(Number(line.pcsPerBox))) : ""} />
              <Field label="MRP" required>
                <input type="number" min="0" step="0.01" className="input w-full" value={line.mrp} onChange={set("mrp")} />
              </Field>
              <Field label="DP price / pc" required>
                <input type="number" min="0" step="0.0001" className="input w-full" value={line.dpPrice} onChange={set("dpPrice")} />
              </Field>
              <Field label="No. of boxes" required>
                <input type="number" min="0" step="1" className="input w-full" value={line.currentStockInCase} onChange={set("currentStockInCase")} />
              </Field>
              <Field label="No. of pcs (loose)">
                <input type="number" min="0" step="1" className="input w-full" value={line.currentStockInPcs} onChange={set("currentStockInPcs")} />
              </Field>
              <ReadBox label="Qty (pcs)" value={calc.qty ? qty(calc.qty) : ""} />
              <ReadBox label="Net amt (DP × pcs)" value={calc.net ? rupees(calc.net) : ""} strong />
            </div>

            {/* Discount and GST */}
            <div
              className={`grid grid-cols-2 gap-x-3 gap-y-3 border-t border-dashed border-base-300 pt-4 ${
                everest ? "md:grid-cols-5 2xl:grid-cols-9" : "md:grid-cols-3 xl:grid-cols-6"
              }`}
            >
              {everest ? (
                <>
                  <Field label="Trade disc %">
                    <input type="number" min="0" max="100" step="0.01" className="input w-full" value={line.tradeDiscountPercent} onChange={set("tradeDiscountPercent")} />
                  </Field>
                  <Field label="Primary disc %">
                    <input type="number" min="0" max="100" step="0.01" className="input w-full" value={line.primaryDiscountPercent} onChange={set("primaryDiscountPercent")} />
                  </Field>
                  <Field label="Cash disc %">
                    <input type="number" min="0" max="100" step="0.01" className="input w-full" value={line.cashDiscountPercent} onChange={set("cashDiscountPercent")} />
                  </Field>
                  <ReadBox label="Total disc %" value={pct(calc.discountPercent)} strong />
                </>
              ) : (
                <Field label="Discount %">
                  <input type="number" min="0" max="100" step="0.01" className="input w-full" value={line.discountPercent} onChange={set("discountPercent")} />
                </Field>
              )}
              <ReadBox label="GST %" value={pct(calc.gstPercent)} />
              <ReadBox label="CGST" value={calc.cgst ? rupees(calc.cgst) : ""} />
              <ReadBox label="SGST" value={calc.sgst ? rupees(calc.sgst) : ""} />
              <ReadBox label="Total GST" value={calc.totalGst ? rupees(calc.totalGst) : ""} strong />
              {/* Net amt after discount + GST = the line total */}
              <ReadBox label="Total amt (Net + GST)" value={calc.total ? rupees(calc.total) : ""} strong />
            </div>

            {/* Sale prices: only for companies that make sale bills */}
            {saleBill && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-dashed border-base-300 pt-4 md:grid-cols-5">
                {/* DP per piece with GST on top (no discount) */}
                <ReadBox
                  label={`DP amt (DP + ${pct(calc.gstPercent)} GST) / pc`}
                  value={dpAmt ? rupees(dpAmt, 4) : ""}
                  strong
                />
                <Field label="Wholesale price / pc">
                  <input type="number" min={dpAmt ? dpAmt.toFixed(2) : "0"} step="0.01" className={`input w-full ${belowDp(line.wholesalePrice) ? "input-error" : ""}`} placeholder="Last price if blank" value={line.wholesalePrice} onChange={set("wholesalePrice")} />
                </Field>
                <MarginBox label="Wholesale margin / pc" price={line.wholesalePrice} cost={dpAmt} />
                <Field label="Retail price / pc">
                  <input type="number" min={dpAmt ? dpAmt.toFixed(2) : "0"} step="0.01" className={`input w-full ${belowDp(line.retailPrice) ? "input-error" : ""}`} placeholder="Last price if blank" value={line.retailPrice} onChange={set("retailPrice")} />
                </Field>
                <MarginBox label="Retail margin / pc" price={line.retailPrice} cost={dpAmt} />
              </div>
            )}
          </fieldset>
        </section>

        {/* Calculation slip */}
        <aside className="self-start rounded-box border border-base-300 bg-base-100 lg:sticky lg:top-20">
          <div className="border-b border-base-300 px-4 py-3">
            <h2 className="font-semibold">Calculation</h2>
            <p className="text-xs text-base-content/55">Updates as you type</p>
          </div>
          <div className="px-4 py-2">
            <SlipRow label="Qty" value={`${qty(calc.qty)} pcs`} />
            <SlipRow label="Net amt (DP × qty)" value={rupees(calc.net)} />
            {everest && (
              <>
                <SlipRow label={`Trade ${pct(line.tradeDiscountPercent)}`} value="" muted />
                <SlipRow label={`Primary ${pct(line.primaryDiscountPercent)}`} value="" muted />
                <SlipRow label={`Cash ${pct(line.cashDiscountPercent)}`} value="" muted />
              </>
            )}
            <SlipRow label={`Discount ${pct(calc.discountPercent)}`} value={`− ${rupees(calc.discountAmount)}`} muted />
            <SlipRow label="Taxable" value={rupees(calc.taxable)} />
            <SlipRow label={`CGST ${pct(calc.gstPercent / 2)}`} value={rupees(calc.cgst)} muted />
            <SlipRow label={`SGST ${pct(calc.gstPercent / 2)}`} value={rupees(calc.sgst)} muted />
            <SlipRow label="Total GST" value={rupees(calc.totalGst)} />
            <div className="my-1 border-t border-base-300" />
            <SlipRow label="Line total" value={rupees(calc.total)} strong />
            <div className="mt-2 rounded bg-base-200/70 px-2 py-1">
              <SlipRow label="Cost per pc (incl. GST)" value={rupees(calc.costPerPieceWithGst, 4)} strong />
              <SlipRow label="Cost per pc (excl. GST)" value={rupees(calc.costPerPiece, 4)} muted />
            </div>
            {saleBill && (Number(line.wholesalePrice) > 0 || Number(line.retailPrice) > 0) && (
              <div className="mt-2">
                {Number(line.wholesalePrice) > 0 && (
                  <SlipRow label="Wholesale / pc" value={rupees(line.wholesalePrice)} />
                )}
                {Number(line.retailPrice) > 0 && <SlipRow label="Retail / pc" value={rupees(line.retailPrice)} />}
              </div>
            )}
          </div>
          {error && <p className="px-4 pb-1 text-sm text-error">{error}</p>}
          <div className="flex gap-2 border-t border-base-300 bg-base-200/50 px-4 py-3">
            <button type="button" className="btn btn-ghost btn-sm" disabled={anyBusy} onClick={resetLine}>
              {editingId ? "Cancel edit" : "Clear"}
            </button>
            <button type="submit" className="btn btn-primary btn-sm flex-1" disabled={!ready || anyBusy}>
              {busy === "line" ? <span className="loading loading-spinner loading-xs" /> : editingId ? <MdCheck size={17} /> : <MdAdd size={18} />}
              {editingId ? "Update line" : "Add to invoice"}
            </button>
          </div>
        </aside>
      </form>

      {/* Lines */}
      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
          <h2 className="font-semibold">
            Items on this invoice <span className="font-normal text-base-content/55">({lines.length})</span>
          </h2>
        </div>
        {lines.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">Nothing added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm whitespace-nowrap">
              <thead>
                <tr className="bg-base-200/60 text-base-content/70">
                  <th className="w-10 text-right">Sr</th>
                  <th>Item</th>
                  <th>Batch</th>
                  <th className="text-right">Boxes</th>
                  <th className="text-right">Loose</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">MRP</th>
                  <th className="text-right">DP</th>
                  <th className="text-right">Net amt</th>
                  <th className="text-right">Disc %</th>
                  <th className="text-right">Taxable</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Line total</th>
                  <th className="text-right" title="DP + GST per piece">DP amt</th>
                  {saleBill && <th className="text-right">Wholesale</th>}
                  {saleBill && <th className="text-right">Retail</th>}
                  <th>MFG</th>
                  <th>Expiry</th>
                  <th className="w-20">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id} className={editingId === l.id ? "bg-accent/10" : "hover:bg-base-200/50"}>
                    <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                    <td className="max-w-64">
                      <div className="truncate font-medium" title={l.variantName || l.productName}>
                        {l.variantName || l.productName}
                      </div>
                      <div className="truncate text-xs text-base-content/55">
                        <span className="font-mono">{l.productErpId}</span>
                        {l.isUpdate && <span className="ml-2 text-info">replaces earlier line</span>}
                        {l.sourceDmsItemId && <span className="ml-2 text-secondary">saved</span>}
                      </div>
                    </td>
                    <td className="text-xs">{l.batchNumber || "—"}</td>
                    <td className="text-right tabular-nums">{qty(l.currentStockInCase)}</td>
                    <td className="text-right tabular-nums">{qty(l.currentStockInPcs)}</td>
                    <td className="text-right tabular-nums">{qty(l.totalCurrentStockInPcs)}</td>
                    <td className="text-right tabular-nums">{rupees(l.mrp)}</td>
                    <td className="text-right tabular-nums">{rupees(l.dpPrice || l.mrp, 4)}</td>
                    <td className="text-right tabular-nums">{rupees(l.price)}</td>
                    <td className="text-right tabular-nums" title={
                      l.tradeDiscountPercent !== undefined && l.tradeDiscountPercent !== ""
                        ? `Trade ${pct(l.tradeDiscountPercent)} + Primary ${pct(l.primaryDiscountPercent)} + Cash ${pct(l.cashDiscountPercent)}`
                        : undefined
                    }>
                      {pct(l.discountPercent)}
                    </td>
                    <td className="text-right tabular-nums">{rupees(l.taxableAmount)}</td>
                    <td className="text-right tabular-nums">{rupees(Number(l.cgstAmount || 0) + Number(l.sgstAmount || 0))}</td>
                    <td className="text-right font-semibold tabular-nums">{rupees(l.totalValue)}</td>
                    <td className="text-right tabular-nums">{rupees(dpAmtPerPiece({ ...l, dpPrice: l.dpPrice || l.mrp }), 4)}</td>
                    {saleBill && (
                      <td className="text-right tabular-nums">
                        {Number(l.wholesalePrice) > 0 ? rupees(l.wholesalePrice) : <span className="text-base-content/45">last</span>}
                      </td>
                    )}
                    {saleBill && (
                      <td className="text-right tabular-nums">
                        {Number(l.retailPrice) > 0 ? rupees(l.retailPrice) : <span className="text-base-content/45">last</span>}
                      </td>
                    )}
                    <td className="text-xs">{showDate(l.mfgDate)}</td>
                    <td className="text-xs">{showDate(l.expiryDate)}</td>
                    <td className="text-right">
                      {editingId === l.id ? (
                        <button type="button" className="btn btn-ghost btn-xs btn-square" title="Cancel edit" onClick={resetLine}>
                          <MdClose size={16} />
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-square"
                            title="Edit"
                            disabled={Boolean(editingId) || anyBusy}
                            onClick={() => editLine(l)}
                          >
                            <MdEdit size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-square text-error"
                            title="Remove"
                            disabled={Boolean(editingId) || anyBusy}
                            onClick={() => setToRemove(l)}
                          >
                            <MdDeleteOutline size={17} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-base-300 text-sm text-base-content">
                  <td />
                  <td colSpan={2} className="font-semibold">
                    Total
                  </td>
                  <td className="text-right tabular-nums">{qty(totals.boxes)}</td>
                  <td />
                  <td className="text-right font-semibold tabular-nums">{qty(totals.pcs)}</td>
                  <td colSpan={2} />
                  <td className="text-right tabular-nums">{rupees(totals.net)}</td>
                  <td />
                  <td className="text-right tabular-nums">{rupees(totals.taxable)}</td>
                  <td className="text-right tabular-nums">{rupees(totals.gst)}</td>
                  <td className="text-right font-semibold tabular-nums">{rupees(totals.value)}</td>
                  <td colSpan={saleBill ? 6 : 4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Save bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-base-300 bg-base-100/95 backdrop-blur min-[1200px]:left-[250px]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-3 px-6 py-3">
          <p className="mr-auto text-sm text-base-content/70">
            {lines.length} item{lines.length === 1 ? "" : "s"} · {qty(totals.pcs)} pcs ·{" "}
            <b className="text-base-content">{rupees(totals.value)}</b>
            {company && <span className="ml-2 text-base-content/50">{company.name}</span>}
          </p>
          <button type="button" className="btn btn-ghost btn-sm" disabled={anyBusy} onClick={onClose}>
            Discard
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={anyBusy || !lines.length} onClick={savePurchase}>
            {busy === "save" && <span className="loading loading-spinner loading-xs" />}
            Save purchase
          </button>
        </div>
      </div>

      {toRemove && (
        <ConfirmDialog
          title="Remove this line?"
          confirmLabel="Remove"
          busy={busy === "remove"}
          onCancel={() => setToRemove(null)}
          onConfirm={() => removeLine(toRemove)}
        >
          <b className="text-base-content">{toRemove.variantName || toRemove.productName}</b> (
          <span className="font-mono">{toRemove.productErpId}</span>)
          {toRemove.sourceDmsItemId
            ? " is already saved on this invoice and will be deleted from the database."
            : " will be taken off this invoice."}
        </ConfirmDialog>
      )}
    </div>
  );
}
