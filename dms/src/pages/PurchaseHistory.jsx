import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MdClose, MdEdit, MdFilterAltOff, MdRefresh, MdSearch, MdVisibility } from "react-icons/md";
import { apiFetch } from "../auth";
import { COMPANY_TYPES, ExcelButton, Field, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";
import { downloadExcel, fileSafe } from "../utils/excel";
import { visibleMenu } from "../menu";
import { DRAFT_KEY, qty, rupees, showDate } from "../utils/purchaseCalc";

// Saved purchase invoices (DMS stock imports). "Edit" opens the invoice in Add Purchase.
// Same data as the main site's DMS Purchase History page.

const num = (v) => Number(v) || 0;
const parseRaw = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};
const str = (v) => (v == null ? "" : String(v));

// A saved invoice line -> a line on the Add Purchase screen.
// MRP-priced lines come back as MRP lines (with Everest's three discounts);
// older DP-priced lines keep their DP and sale prices so re-saving them changes nothing.
function toEntryLine(item) {
  const raw = parseRaw(item.raw_data);
  const mrpMode = raw["Pricing Mode"] === "mrp";
  const taxable = num(item.total_value) - num(item.cgst_amount) - num(item.sgst_amount);
  const base = {
    id: `invoice-item-${item.id}`,
    sourceDmsItemId: item.id,
    productErpId: item.product_erp_id || "",
    productName: item.product_name || "",
    variantName: item.variant_name || "",
    hsnCode: item.hsn_code || "",
    pcsPerBox: str(item.pcs_per_box || ""),
    currentStockInCase: str(item.current_stock_in_case || ""),
    currentStockInPcs: str(item.current_stock_in_pcs || ""),
    totalCurrentStockInPcs: str(item.total_current_stock_in_pcs || ""),
    batchNumber: item.batch_number || "",
    mfgDate: item.mfg_date || "",
    expiryDate: item.expiry_date || "",
    mrp: str(item.mrp || ""),
    discountPercent: str(item.discount_percent || 0),
    gstPercent: str(item.gst_percent || 5),
    price: str(num(item.dp_price) * num(item.total_current_stock_in_pcs)),
    taxableAmount: str(taxable),
    cgstAmount: str(item.cgst_amount || 0),
    sgstAmount: str(item.sgst_amount || 0),
    totalValue: num(item.total_value).toFixed(4),
    isUpdate: true,
  };
  if (mrpMode) {
    return {
      ...base,
      pricingMode: "mrp",
      dpPrice: str(item.dp_price || item.mrp || ""),
      tradeDiscountPercent: str(raw["Trade Discount %"]),
      primaryDiscountPercent: str(raw["Primary Discount %"]),
      cashDiscountPercent: str(raw["Cash Discount %"]),
      pricePerPiece: str(item.purchase_price ?? item.price_per_piece),
      purchasePrice: str(item.purchase_price ?? item.price_per_piece),
    };
  }
  return {
    ...base,
    dpPrice: str(item.dp_price || ""),
    pricePerPiece: str(item.dp_price || ""),
    purchasePrice: str(item.dp_price || ""),
    retailPrice: str(item.retail_price || ""),
    wholesalePrice: str(item.wholesale_price || ""),
    retailMargin: str(item.retail_margin || ""),
    wholesaleMargin: str(item.wholesale_margin || ""),
  };
}

const LINE_COLUMNS = [
  { header: "Sr No", width: 7, type: "number", value: (_, i) => i + 1 },
  { header: "Product ERP ID", key: "product_erp_id", width: 18 },
  { header: "SKU Name", key: "product_name", width: 30 },
  { header: "Variant", key: "variant_name", width: 28 },
  { header: "HSN Code", key: "hsn_code", width: 12 },
  { header: "Batch", key: "batch_number", width: 14 },
  { header: "MFG Date", key: "mfg_date", width: 12, type: "date" },
  { header: "Expiry Date", key: "expiry_date", width: 12, type: "date" },
  { header: "Pcs / Box", key: "pcs_per_box", width: 9, type: "number" },
  { header: "Boxes", key: "current_stock_in_case", width: 8, type: "number", total: true },
  { header: "Loose Pcs", key: "current_stock_in_pcs", width: 9, type: "number", total: true },
  { header: "Qty (Pcs)", key: "total_current_stock_in_pcs", width: 10, type: "number", total: true },
  { header: "MRP", key: "mrp", width: 10, type: "money" },
  { header: "DP / Pc", key: "dp_price", width: 10, type: "rate" },
  { header: "Trade Disc %", width: 9, type: "percent", value: (it) => parseRaw(it.raw_data)["Trade Discount %"] },
  { header: "Primary Disc %", width: 9, type: "percent", value: (it) => parseRaw(it.raw_data)["Primary Discount %"] },
  { header: "Cash Disc %", width: 9, type: "percent", value: (it) => parseRaw(it.raw_data)["Cash Discount %"] },
  { header: "Total Disc %", key: "discount_percent", width: 9, type: "percent" },
  { header: "Taxable", width: 13, type: "money", total: true, value: (it) => num(it.total_value) - num(it.cgst_amount) - num(it.sgst_amount) },
  { header: "GST %", key: "gst_percent", width: 7, type: "percent" },
  { header: "CGST", key: "cgst_amount", width: 11, type: "money", total: true },
  { header: "SGST", key: "sgst_amount", width: 11, type: "money", total: true },
  { header: "Total", key: "total_value", width: 13, type: "money", total: true },
  { header: "Cost / Pc (excl. GST)", width: 12, type: "rate", value: (it) => it.purchase_price ?? it.price_per_piece },
];

const INVOICE_COLUMNS = [
  { header: "Sr No", width: 7, type: "number", value: (_, i) => i + 1 },
  { header: "Entry Code", key: "entry_code", width: 16 },
  { header: "Invoice No.", key: "invoice_number", width: 16 },
  { header: "Invoice Date", key: "upload_date", width: 12, type: "date" },
  { header: "Company", key: "company_name", width: 24 },
  { header: "Seller", width: 30, value: (imp) => imp.seller_name || "DMS file upload" },
  { header: "Lines", key: "row_count", width: 8, type: "number", total: true },
  { header: "Pieces", key: "total_pieces", width: 10, type: "number", total: true },
  { header: "Amount (after discount)", key: "discounted_amount", width: 15, type: "money", total: true },
  { header: "CGST", key: "total_cgst", width: 12, type: "money", total: true },
  { header: "SGST", key: "total_sgst", width: 12, type: "money", total: true },
  { header: "Total incl. GST", key: "total_value", width: 15, type: "money", total: true },
];

const invoiceName = (inv) =>
  [inv.company_name, inv.invoice_number ? `Inv ${inv.invoice_number}` : inv.entry_code, showDate(inv.upload_date)]
    .filter(Boolean)
    .join(" · ");

const downloadInvoice = (invoice, items) =>
  downloadExcel({
    fileName: `Invoice_${fileSafe(invoice.company_name)}_${fileSafe(invoice.invoice_number || invoice.entry_code || invoice.id)}`,
    title: `Purchase invoice · ${invoiceName(invoice)}${invoice.seller_name ? ` · ${invoice.seller_name}` : ""}`,
    sheets: [{ name: "Lines", rows: items, columns: LINE_COLUMNS }],
  });

const monthTitle = (ymd) => {
  const [y, m] = String(ymd || "").split("-").map(Number);
  if (!y || !m) return "No date";
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};

function InvoicePanel({ invoice, canEdit, onClose, onEdit }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError("");
    apiFetch(`/staff/dms-stock?importId=${invoice.id}`)
      .then(async (res) => {
        const data = await readJson(res);
        if (!alive) return;
        if (!res.ok) setError(data.error || "Could not load the invoice.");
        else setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => alive && setError("Network error."));
    return () => {
      alive = false;
    };
  }, [invoice.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1300] flex justify-end" role="dialog" aria-label="Invoice details">
      <div className="absolute inset-0 bg-neutral/40" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-4xl flex-col bg-base-100 shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-base-300 px-5 py-4">
          <div>
            <p className="font-mono text-xs text-primary">{invoice.entry_code || `#${invoice.id}`}</p>
            <h2 className="text-lg font-semibold">
              {invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : "Invoice without number"}
            </h2>
            <p className="text-sm text-base-content/60">
              {showDate(invoice.upload_date)} · {invoice.company_name || "—"}
              {invoice.seller_name ? ` · ${invoice.seller_name}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <ExcelButton label="Excel" disabled={!items?.length} onExport={() => downloadInvoice(invoice, items)} />
            {canEdit && invoice.seller_id && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onEdit(invoice)}>
                <MdEdit size={16} /> Edit
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm btn-square" title="Close" onClick={onClose}>
              <MdClose size={18} />
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-x-4 gap-y-2 border-b border-base-300 px-5 py-3 text-sm sm:grid-cols-6">
          {[
            ["Items", qty(invoice.row_count)],
            ["Pieces", qty(invoice.total_pieces)],
            ["Amount", rupees(invoice.discounted_amount)],
            ["CGST", rupees(invoice.total_cgst)],
            ["SGST", rupees(invoice.total_sgst)],
            ["Total", rupees(invoice.total_value)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-base-content/55">{label}</dt>
              <dd className={`tabular-nums ${label === "Total" ? "font-semibold" : ""}`}>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <p className="p-8 text-center text-sm text-error">{error}</p>
          ) : !items ? (
            <div className="flex justify-center p-10">
              <span className="loading loading-dots loading-md text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm text-base-content/60">This invoice has no lines.</p>
          ) : (
            <table className="table table-sm table-pin-rows whitespace-nowrap">
              <thead>
                <tr className="text-base-content/70">
                  <th className="bg-base-200 text-right">Sr</th>
                  <th className="bg-base-200">Item</th>
                  <th className="bg-base-200">Batch</th>
                  <th className="bg-base-200">Expiry</th>
                  <th className="bg-base-200 text-right">Qty</th>
                  <th className="bg-base-200 text-right">MRP</th>
                  <th className="bg-base-200 text-right">Disc %</th>
                  <th className="bg-base-200 text-right">GST</th>
                  <th className="bg-base-200 text-right">Total</th>
                  <th className="bg-base-200 text-right">Cost / pc</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const raw = parseRaw(it.raw_data);
                  const split = raw["Pricing Mode"] === "mrp" && raw["Trade Discount %"] !== "" && raw["Trade Discount %"] != null;
                  return (
                    <tr key={it.id} className="hover:bg-base-200/50">
                      <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                      <td className="max-w-72">
                        <div className="truncate font-medium" title={it.variant_name || it.product_name}>
                          {it.variant_name || it.product_name}
                        </div>
                        <div className="font-mono text-xs text-base-content/55">{it.product_erp_id}</div>
                      </td>
                      <td className="text-xs">{it.batch_number || "—"}</td>
                      <td className="text-xs">{showDate(it.expiry_date)}</td>
                      <td className="text-right tabular-nums">
                        {qty(it.total_current_stock_in_pcs)}
                        <div className="text-xs text-base-content/50">
                          {qty(it.current_stock_in_case)} box{num(it.current_stock_in_pcs) ? ` + ${qty(it.current_stock_in_pcs)}` : ""}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">{rupees(it.mrp)}</td>
                      <td
                        className="text-right tabular-nums"
                        title={
                          split
                            ? `Trade ${raw["Trade Discount %"]}% + Primary ${raw["Primary Discount %"]}% + Cash ${raw["Cash Discount %"]}%`
                            : undefined
                        }
                      >
                        {qty(it.discount_percent)}%{split && <span className="text-base-content/40"> *</span>}
                      </td>
                      <td className="text-right tabular-nums">{rupees(num(it.cgst_amount) + num(it.sgst_amount))}</td>
                      <td className="text-right font-semibold tabular-nums">{rupees(it.total_value)}</td>
                      <td className="text-right tabular-nums">{rupees(it.purchase_price ?? it.price_per_piece, 4)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <p className="border-t border-base-300 px-5 py-2 text-xs text-base-content/50">
          * Total of Trade + Primary + Cash discount. Hover to see the split. Cost / pc is before GST.
        </p>
      </aside>
    </div>
  );
}

export default function PurchaseHistory({ user }) {
  const navigate = useNavigate();
  // Editing happens on Add Purchase, so only offer it to users who can open that page.
  const canEdit = visibleMenu(user).some((item) => item.path === "/add-purchase");
  const companies = useCompanies();
  const [showFlash, flashNode] = useFlash();

  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [sellers, setSellers] = useState([]);
  const [sellerId, setSellerId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState(null);
  const [opening, setOpening] = useState(null);

  const load = () => {
    setLoading(true);
    apiFetch("/staff/dms-stock/imports")
      .then(readJson)
      .then((data) => setImports(Array.isArray(data.imports) ? data.imports : []))
      .catch(() => setImports([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    setSellerId("");
    if (!companyId) {
      setSellers([]);
      return;
    }
    apiFetch(`/staff/purchase-sellers/company/${companyId}`)
      .then(readJson)
      .then((data) => setSellers(Array.isArray(data) ? data : []))
      .catch(() => setSellers([]));
  }, [companyId]);

  const typeOf = useMemo(() => new Map(companies.map((c) => [c.id, c.type])), [companies]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return imports.filter(
      (imp) =>
        (!type || typeOf.get(imp.company_id) === type) &&
        (!companyId || String(imp.company_id) === companyId) &&
        (!sellerId || String(imp.seller_id) === sellerId) &&
        (!from || String(imp.upload_date) >= from) &&
        (!to || String(imp.upload_date) <= to) &&
        (!q ||
          [imp.invoice_number, imp.entry_code, imp.seller_name, imp.company_name].some((v) =>
            String(v || "").toLowerCase().includes(q)
          ))
    );
  }, [imports, type, typeOf, companyId, sellerId, from, to, search]);

  // Newest first (API order), grouped by month with subtotals.
  const groups = useMemo(() => {
    const out = [];
    rows.forEach((imp) => {
      const key = String(imp.upload_date || "").slice(0, 7);
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, rows: [], total: 0, amount: 0, gst: 0 };
        out.push(g);
      }
      g.rows.push(imp);
      g.total += num(imp.total_value);
      g.amount += num(imp.discounted_amount);
      g.gst += num(imp.total_cgst) + num(imp.total_sgst);
    });
    return out;
  }, [rows]);

  const sum = rows.reduce(
    (t, imp) => ({
      items: t.items + num(imp.row_count),
      amount: t.amount + num(imp.discounted_amount),
      cgst: t.cgst + num(imp.total_cgst),
      sgst: t.sgst + num(imp.total_sgst),
      total: t.total + num(imp.total_value),
    }),
    { items: 0, amount: 0, cgst: 0, sgst: 0, total: 0 }
  );

  const editInvoice = async (invoice) => {
    setOpening(invoice.id);
    try {
      const res = await apiFetch(`/staff/dms-stock?importId=${invoice.id}`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Could not open the invoice.");
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          manualCompanyId: String(invoice.company_id),
          manualSellerId: String(invoice.seller_id),
          manualUploadDate: invoice.upload_date,
          manualInvoiceNumber: invoice.invoice_number || "",
          selectedSellerItemId: "",
          manualItem: null,
          pendingItems: (data.items || []).map(toEntryLine),
        })
      );
      navigate("/add-purchase");
    } catch (err) {
      showFlash(false, err.message);
      setOpening(null);
    }
  };

  const filtersOn = Boolean(type || companyId || sellerId || from || to || search);
  let sr = 0;

  return (
    <div data-theme="dms" className="bg-transparent text-base-content">
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Stock in" title="Purchase history">
          Every saved purchase invoice. Open one to see its lines, or edit it in Add Purchase.
        </PageHeader>

        {/* Filters */}
        <section className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-box border border-base-300 bg-base-100 px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-base-content/80">Company type</span>
            <div className="join">
              {[{ value: "", label: "All" }, ...COMPANY_TYPES].map((t) => (
                <button
                  key={t.value || "all"}
                  type="button"
                  className={`btn join-item btn-sm min-w-16 ${type === t.value ? "btn-primary" : "btn-outline field-border"}`}
                  onClick={() => {
                    setType(t.value);
                    setCompanyId("");
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Company" className="w-full sm:w-52">
            <select className="select select-sm w-full" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">All companies</option>
              {companies
                .filter((c) => !type || c.type === type)
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Seller" className="w-full sm:w-52">
            <select
              className="select select-sm w-full"
              value={sellerId}
              disabled={!companyId}
              onChange={(e) => setSellerId(e.target.value)}
            >
              <option value="">{companyId ? "All sellers" : "Choose a company first"}</option>
              {sellers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.seller_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input type="date" className="input input-sm w-36" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className="input input-sm w-36" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <label className="input input-sm w-full sm:w-52">
            <MdSearch size={16} className="opacity-50" />
            <input type="search" placeholder="Invoice no. or entry code" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          {filtersOn && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setType("");
                setCompanyId("");
                setFrom("");
                setTo("");
                setSearch("");
              }}
            >
              <MdFilterAltOff size={16} /> Clear
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm btn-square ml-auto" title="Refresh" disabled={loading} onClick={load}>
            <MdRefresh size={18} className={loading ? "animate-spin" : ""} />
          </button>
          <ExcelButton
            disabled={!rows.length}
            onError={() => showFlash(false, "Could not create the Excel file.")}
            onExport={async () => {
              // Sheet 1: the invoice list. Sheet 2: every line of those invoices.
              const details = await Promise.all(
                rows.map((imp) =>
                  apiFetch(`/staff/dms-stock?importId=${imp.id}`)
                    .then(readJson)
                    .then((data) => (data.items || []).map((it) => ({ ...it, invoice: imp })))
                    .catch(() => [])
                )
              );
              const lines = details.flat();
              return downloadExcel({
                fileName: `Purchase_History${companyId ? `_${fileSafe(companies.find((c) => String(c.id) === companyId)?.name)}` : ""}`,
                title: `Purchase history${from || to ? ` · ${from ? showDate(from) : "start"} to ${to ? showDate(to) : "today"}` : ""}`,
                sheets: [
                  { name: "Invoices", rows, columns: INVOICE_COLUMNS },
                  {
                    name: "Invoice lines",
                    rows: lines,
                    columns: [
                      { header: "Invoice No.", width: 16, value: (it) => it.invoice.invoice_number || it.invoice.entry_code },
                      { header: "Invoice Date", width: 12, type: "date", value: (it) => it.invoice.upload_date },
                      { header: "Company", width: 22, value: (it) => it.invoice.company_name },
                      { header: "Seller", width: 26, value: (it) => it.invoice.seller_name || "DMS file upload" },
                      ...LINE_COLUMNS.slice(1),
                    ],
                  },
                ],
              });
            }}
          />
        </section>

        {/* Totals for what's shown */}
        <dl className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Invoices", qty(rows.length)],
            ["Lines", qty(sum.items)],
            ["Amount (after discount)", rupees(sum.amount)],
            ["CGST", rupees(sum.cgst)],
            ["SGST", rupees(sum.sgst)],
            ["Total incl. GST", rupees(sum.total)],
          ].map(([label, value], i) => (
            <div key={label} className="bg-base-100 px-4 py-3">
              <dt className="text-xs text-base-content/55">{label}</dt>
              <dd className={`mt-0.5 text-lg ${i === 5 ? "font-semibold text-primary" : "font-medium"}`}>{value}</dd>
            </div>
          ))}
        </dl>

        <section className="min-w-0 rounded-box border border-base-300 bg-base-100">
          {loading && !imports.length ? (
            <div className="flex justify-center py-14">
              <span className="loading loading-dots loading-md text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-14 text-center text-sm text-base-content/60">
              {imports.length ? "No invoices match these filters." : "No purchases saved yet."}
            </p>
          ) : (
            <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
              <table className="table table-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-base-200/60 text-base-content/70">
                    <th className="w-10 text-right">Sr</th>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Company · Seller</th>
                    <th className="text-right">Lines</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">CGST</th>
                    <th className="text-right">SGST</th>
                    <th className="text-right">Total</th>
                    <th className="w-24">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.key}>
                    <tr className="border-y border-base-300 bg-base-200/40">
                      <td />
                      <td colSpan={4} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-secondary">
                        {monthTitle(`${g.key}-01`)}
                        <span className="ml-2 font-normal normal-case tracking-normal text-base-content/50">
                          {g.rows.length} invoice{g.rows.length === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-xs tabular-nums text-base-content/60">{rupees(g.amount)}</td>
                      <td colSpan={2} className="py-1.5 text-right text-xs tabular-nums text-base-content/60">
                        GST {rupees(g.gst)}
                      </td>
                      <td className="py-1.5 text-right text-xs font-semibold tabular-nums">{rupees(g.total)}</td>
                      <td />
                    </tr>
                    {g.rows.map((imp) => {
                      sr += 1;
                      return (
                        <tr key={imp.id} className="cursor-pointer hover:bg-base-200/50" onClick={() => setViewing(imp)}>
                          <td className="text-right tabular-nums text-base-content/50">{sr}</td>
                          <td>
                            <div className="font-medium">{imp.invoice_number || <span className="text-base-content/40">No number</span>}</div>
                            <div className="font-mono text-xs text-primary">{imp.entry_code || `#${imp.id}`}</div>
                          </td>
                          <td className="text-sm">{showDate(imp.upload_date)}</td>
                          <td className="max-w-72">
                            <div className="truncate">{imp.company_name || "—"}</div>
                            <div className="truncate text-xs text-base-content/55">
                              {imp.seller_name || <span className="italic">DMS file upload</span>}
                            </div>
                          </td>
                          <td className="text-right tabular-nums">{qty(imp.row_count)}</td>
                          <td className="text-right tabular-nums">{rupees(imp.discounted_amount)}</td>
                          <td className="text-right tabular-nums text-base-content/70">{rupees(imp.total_cgst)}</td>
                          <td className="text-right tabular-nums text-base-content/70">{rupees(imp.total_sgst)}</td>
                          <td className="text-right font-semibold tabular-nums">{rupees(imp.total_value)}</td>
                          <td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="btn btn-ghost btn-xs btn-square" title="View lines" onClick={() => setViewing(imp)}>
                              <MdVisibility size={16} />
                            </button>
                            {canEdit && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs btn-square"
                              title={imp.seller_id ? "Edit in Add Purchase" : "DMS file uploads can't be edited here"}
                              disabled={!imp.seller_id || opening === imp.id}
                              onClick={() => editInvoice(imp)}
                            >
                              {opening === imp.id ? <span className="loading loading-spinner loading-xs" /> : <MdEdit size={16} />}
                            </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </section>
      </div>

      {viewing && <InvoicePanel invoice={viewing} canEdit={canEdit} onClose={() => setViewing(null)} onEdit={editInvoice} />}
      {flashNode}
    </div>
  );
}
