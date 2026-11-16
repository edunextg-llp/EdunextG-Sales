import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdAdd, MdCloudUpload, MdFileDownload, MdFilterAltOff, MdRefresh, MdSearch, MdUploadFile } from "react-icons/md";
import { apiFetch } from "../auth";
import { COMPANY_TYPES, ExcelButton, Field, readJson, useCompanies, useFlash } from "../components/ui";
import { downloadExcel, fileSafe } from "../utils/excel";
import PurchaseEntry from "../components/purchase/PurchaseEntry";
import { DMS_STOCK_TEMPLATE_URL, DRAFT_KEY, loadDraft, qty, rupees, showDate, todayLocal } from "../utils/purchaseCalc";

// "Add Purchase" (was "Item List"): saved DMS stock purchases + new purchase entry.
// Same endpoints as the main site's Item List page (frontend/src/layouts/dms-stock).

const purchaseRate = (it) => Number(it.purchase_price ?? it.price_per_piece) || 0;
const dpAfter = (it) => Number(it.dp_price || 0) * (1 - Number(it.discount_percent || 0) / 100);

// Pinned columns: fixed inner widths + fixed padding so each one's left offset is exact
// (Sr 32+24 = 56px, ERP 112+24 = 136px -> SKU starts at 192px). Cells are opaque so
// nothing shows through while scrolling sideways.
const PIN = {
  sr: "sticky left-0 px-3",
  erp: "sticky left-[56px] px-3",
  sku: "sticky left-[192px] px-3 shadow-[inset_-1px_0_0_var(--color-base-300)]",
};

// Excel export of the stock table (raw numbers, same columns as on screen).
const EXPORT_COLUMNS = [
  { header: "Sr No", width: 7, type: "number", value: (_, i) => i + 1 },
  { header: "Product ERP ID", key: "product_erp_id", width: 18 },
  { header: "SKU Name", key: "product_name", width: 32 },
  { header: "Variant", key: "variant_name", width: 28 },
  { header: "HSN Code", key: "hsn_code", width: 12 },
  { header: "Company", key: "company_name", width: 22 },
  { header: "Invoice Date", key: "upload_date", width: 12, type: "date" },
  { header: "Batch", key: "batch_number", width: 14 },
  { header: "MFG Date", key: "mfg_date", width: 12, type: "date" },
  { header: "Expiry Date", key: "expiry_date", width: 12, type: "date" },
  { header: "Pcs / Box", key: "pcs_per_box", width: 9, type: "number" },
  { header: "Boxes", key: "current_stock_in_case", width: 8, type: "number", total: true },
  { header: "Loose Pcs", key: "current_stock_in_pcs", width: 9, type: "number", total: true },
  { header: "Total Pcs", key: "total_current_stock_in_pcs", width: 10, type: "number", total: true },
  { header: "Purchase Price / Pc", width: 12, type: "rate", value: (it) => purchaseRate(it) },
  { header: "Purchase Value", width: 14, type: "money", total: true, value: (it) => purchaseRate(it) * (Number(it.total_current_stock_in_pcs) || 0) },
  { header: "MRP", key: "mrp", width: 10, type: "money" },
  { header: "DP", key: "dp_price", width: 10, type: "rate" },
  { header: "Discount %", key: "discount_percent", width: 9, type: "percent" },
  { header: "DP - Discount", width: 12, type: "rate", value: (it) => dpAfter(it) },
  { header: "Discount Price", width: 13, type: "money", total: true, value: (it) => dpAfter(it) * Number(it.total_current_stock_in_pcs || 0) },
  { header: "GST %", key: "gst_percent", width: 7, type: "percent" },
  { header: "CGST", key: "cgst_amount", width: 11, type: "money", total: true },
  { header: "SGST", key: "sgst_amount", width: 11, type: "money", total: true },
  { header: "Total", key: "total_value", width: 13, type: "money", total: true },
];

// Columns of the saved-stock table. The first three stay put while scrolling sideways.
const COLUMNS = [
  { head: "Company", cell: (it, imp) => it.company_name || imp?.company_name || it.product_division || "—" },
  { head: "Invoice date", cell: (it, imp) => showDate(it.upload_date || imp?.upload_date || imp?.created_at) },
  { head: "Variant", cell: (it) => it.variant_name || "—" },
  { head: "Batch", cell: (it) => it.batch_number || "—" },
  { head: "MFG", cell: (it) => showDate(it.mfg_date) },
  { head: "Expiry", cell: (it) => showDate(it.expiry_date) },
  { head: "Pcs/box", num: true, cell: (it) => qty(it.pcs_per_box) },
  { head: "Boxes", num: true, cell: (it) => qty(it.current_stock_in_case) },
  { head: "Loose pcs", num: true, cell: (it) => qty(it.current_stock_in_pcs) },
  { head: "Total pcs", num: true, strong: true, cell: (it) => qty(it.total_current_stock_in_pcs) },
  { head: "Purchase / pc", num: true, tint: true, cell: (it) => rupees(purchaseRate(it)) },
  {
    head: "Purchase value",
    num: true,
    tint: true,
    strong: true,
    cell: (it) => rupees(purchaseRate(it) * (Number(it.total_current_stock_in_pcs) || 0)),
  },
  { head: "MRP", num: true, cell: (it) => rupees(it.mrp) },
  { head: "DP", num: true, cell: (it) => rupees(it.dp_price) },
  { head: "Disc %", num: true, cell: (it) => `${qty(it.discount_percent)}%` },
  { head: "DP − disc", num: true, cell: (it) => dpAfter(it).toFixed(4) },
  { head: "Discount price", num: true, cell: (it) => rupees(dpAfter(it) * Number(it.total_current_stock_in_pcs || 0)) },
  { head: "GST %", num: true, cell: (it) => `${qty(it.gst_percent)}%` },
  { head: "CGST", num: true, cell: (it) => rupees(it.cgst_amount) },
  { head: "SGST", num: true, cell: (it) => rupees(it.sgst_amount) },
  { head: "Total", num: true, strong: true, cell: (it) => rupees(it.total_value) },
];

function UploadDmsDialog({ companies, onClose, onUploaded }) {
  const [type, setType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const upload = async (e) => {
    e.preventDefault();
    const body = new FormData();
    body.append("file", file);
    body.append("uploadDate", date);
    body.append("companyId", companyId);
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/staff/dms-stock/upload", { method: "POST", body });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      onUploaded(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal modal-open z-[1300]" role="dialog">
      <form onSubmit={upload} className="modal-box max-w-md p-0">
        <div className="border-b border-base-300 px-5 py-3">
          <h3 className="font-semibold">Upload DMS stock file</h3>
          <p className="text-xs text-base-content/60">The full DMS export for one company (CSV, XLS or XLSX).</p>
        </div>
        <fieldset disabled={busy} className="space-y-3 p-5">
          <div className="join w-full">
            {COMPANY_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`btn join-item btn-sm flex-1 ${type === t.value ? "btn-primary" : "btn-outline field-border"}`}
                onClick={() => {
                  setType(t.value);
                  setCompanyId("");
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Field label="Company" required>
            <select className="select w-full" value={companyId} disabled={!type} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">{type ? "Select company" : "Choose a type first"}</option>
              {companies
                .filter((c) => c.type === type)
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Invoice date" required>
            <input type="date" className="input w-full" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-box border border-dashed border-base-300 bg-base-200/40 px-4 py-5 text-sm hover:border-primary"
          >
            <MdUploadFile size={24} className="text-primary" />
            {file ? <span className="break-all font-medium">{file.name}</span> : <span className="text-base-content/60">Choose file</span>}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {error && <p className="text-sm text-error">{error}</p>}
        </fieldset>
        <div className="flex justify-end gap-2 border-t border-base-300 bg-base-200/50 px-5 py-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !file || !companyId || !date}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : <MdCloudUpload size={17} />}
            Upload
          </button>
        </div>
      </form>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-base-content/55">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{children}</dd>
    </div>
  );
}

export default function AddPurchase() {
  const companies = useCompanies();
  const [showFlash, flashNode] = useFlash();

  // A saved draft (refresh mid-entry, or "edit invoice" from Purchase History) opens the entry screen.
  const [entryDraft, setEntryDraft] = useState(() => loadDraft());
  const [entryOpen, setEntryOpen] = useState(() => Boolean(loadDraft()));
  const [uploadOpen, setUploadOpen] = useState(false);

  const [imports, setImports] = useState([]);
  const [importId, setImportId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState("");
  const [stockImport, setStockImport] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [erpSearch, setErpSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const loadImports = useCallback(async () => {
    try {
      const data = await readJson(await apiFetch("/staff/dms-stock/imports"));
      setImports(Array.isArray(data.imports) ? data.imports : []);
    } catch {
      setImports([]);
    }
  }, []);

  const loadStock = useCallback(async (id) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/staff/dms-stock${id ? `?importId=${id}` : ""}`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Could not load stock.");
      setStockImport(data.import || null);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImports();
  }, [loadImports]);

  useEffect(() => {
    loadStock(importId);
  }, [importId, loadStock]);

  // After any save/upload: show what came back and jump the filter to that invoice.
  const applyResult = (data, message) => {
    setStockImport(data.import || null);
    setItems(Array.isArray(data.items) ? data.items : []);
    loadImports();
    if (data.import?.id) {
      setImportId(String(data.import.id));
      if (data.import.company_id) {
        setFilterCompanyId(String(data.import.company_id));
        setFilterType(companies.find((c) => String(c.id) === String(data.import.company_id))?.type || "");
      }
    }
    if (message) showFlash(true, data.message || message);
  };

  const openEntry = () => {
    localStorage.removeItem(DRAFT_KEY);
    setEntryDraft(null);
    setEntryOpen(true);
    window.scrollTo({ top: 0 });
  };

  const closeEntry = () => {
    localStorage.removeItem(DRAFT_KEY);
    setEntryOpen(false);
    setEntryDraft(null);
  };

  const shown = useMemo(() => {
    const erp = erpSearch.trim().toLowerCase();
    const product = productSearch.trim().toLowerCase();
    return items.filter(
      (it) =>
        (!erp || String(it.product_erp_id || "").toLowerCase().includes(erp)) &&
        (!product || [it.product_name, it.variant_name].some((v) => String(v || "").toLowerCase().includes(product)))
    );
  }, [items, erpSearch, productSearch]);

  const shownTotals = useMemo(
    () =>
      shown.reduce(
        (sum, it) => {
          const pcs = Number(it.total_current_stock_in_pcs) || 0;
          return { pcs: sum.pcs + pcs, value: sum.value + pcs * purchaseRate(it) };
        },
        { pcs: 0, value: 0 }
      ),
    [shown]
  );

  if (entryOpen) {
    return (
      <div data-theme="dms" className="bg-transparent text-base-content">
        <div className="mx-auto max-w-7xl">
          <PurchaseEntry
            companies={companies}
            draft={entryDraft}
            onClose={closeEntry}
            onSaved={(data) => {
              closeEntry();
              applyResult(data, "Purchase saved.");
            }}
            onStockChanged={(data) => applyResult(data)}
            showFlash={showFlash}
          />
        </div>
        {flashNode}
      </div>
    );
  }

  const filtersOn = Boolean(importId || filterType || erpSearch || productSearch);
  const filterCompanies = companies.filter((c) => c.type === filterType);
  // Entries (newest first, as the API returns them) for the chosen company.
  const companyImports = filterCompanyId
    ? imports.filter((imp) => String(imp.company_id) === String(filterCompanyId))
    : imports;
  const noCompanyEntries = Boolean(filterCompanyId) && companyImports.length === 0;

  const chooseType = (type) => {
    setFilterType(type);
    setFilterCompanyId("");
    setImportId("");
  };
  // Picking a company opens its latest entry straight away.
  const chooseCompany = (id) => {
    setFilterCompanyId(id);
    const latest = id ? imports.find((imp) => String(imp.company_id) === String(id)) : null;
    setImportId(latest ? String(latest.id) : "");
  };

  return (
    <div data-theme="dms" className="bg-transparent text-base-content">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-base-300 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-secondary">Stock in</p>
            <h1 className="mt-0.5 text-2xl font-semibold">Add Purchase</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-soft btn-primary btn-sm" href={DMS_STOCK_TEMPLATE_URL} target="_blank" rel="noreferrer" download>
              <MdFileDownload size={17} /> DMS template
            </a>
            <button type="button" className="btn btn-soft btn-primary btn-sm" onClick={() => setUploadOpen(true)}>
              <MdCloudUpload size={17} /> Upload DMS file
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={openEntry}>
              <MdAdd size={18} /> New purchase
            </button>
          </div>
        </header>

        {/* Invoice in view */}
        {stockImport && !noCompanyEntries && (
          <section className="mb-5 rounded-box border border-base-300 bg-base-100">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Entry code">
                <span className="font-mono text-primary">{stockImport.entry_code || "—"}</span>
              </Stat>
              <Stat label="Invoice no.">{stockImport.invoice_number || "—"}</Stat>
              <Stat label="Invoice date">{showDate(stockImport.upload_date || stockImport.created_at)}</Stat>
              <Stat label="Company">{stockImport.company_name || "—"}</Stat>
              <Stat label="Rows">{qty(stockImport.row_count)}</Stat>
              <Stat label="Boxes">{qty(stockImport.total_stock_cases)}</Stat>
              <Stat label="Loose pcs">{qty(stockImport.total_stock_pcs)}</Stat>
              <Stat label="Total pcs">{qty(stockImport.total_pieces)}</Stat>
              <Stat label="Invoice value">{rupees(stockImport.total_value)}</Stat>
              {stockImport.file_name && <Stat label="File">{stockImport.file_name}</Stat>}
            </dl>
          </section>
        )}

        <section className="min-w-0 rounded-box border border-base-300 bg-base-100">
          <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-base-content/80">Company type</span>
              <div className="join">
                {COMPANY_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`btn join-item btn-sm min-w-24 ${filterType === t.value ? "btn-primary" : "btn-outline field-border"}`}
                    onClick={() => chooseType(filterType === t.value ? "" : t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Company" className="w-full sm:w-56">
              <select
                className="select select-sm w-full"
                value={filterCompanyId}
                disabled={!filterType}
                onChange={(e) => chooseCompany(e.target.value)}
              >
                <option value="">{filterType ? "All companies" : "Choose a type first"}</option>
                {filterCompanies.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Entry date" className="w-full sm:w-72">
              <select
                className="select select-sm w-full"
                value={importId}
                disabled={noCompanyEntries}
                onChange={(e) => setImportId(e.target.value)}
              >
                {noCompanyEntries ? (
                  <option value="">No entries for this company</option>
                ) : (
                  !filterCompanyId && <option value="">Latest (any company)</option>
                )}
                {companyImports.map((imp) => (
                  <option key={imp.id} value={String(imp.id)}>
                    {showDate(imp.upload_date)}
                    {!filterCompanyId && imp.company_name ? ` · ${imp.company_name}` : ""}
                    {imp.invoice_number ? ` · Inv ${imp.invoice_number}` : ""}
                    {imp.seller_name ? ` · ${imp.seller_name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <div className="basis-full" />
            <label className="input input-sm w-full sm:w-44">
              <MdSearch size={16} className="opacity-50" />
              <input type="search" placeholder="ERP ID" value={erpSearch} onChange={(e) => setErpSearch(e.target.value)} />
            </label>
            <label className="input input-sm w-full sm:w-60">
              <MdSearch size={16} className="opacity-50" />
              <input
                type="search"
                placeholder="Product or variant"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </label>
            {filtersOn && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setImportId("");
                  setFilterType("");
                  setFilterCompanyId("");
                  setErpSearch("");
                  setProductSearch("");
                }}
              >
                <MdFilterAltOff size={16} /> Clear
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              title="Refresh"
              disabled={loading}
              onClick={() => {
                loadImports();
                loadStock(importId);
              }}
            >
              <MdRefresh size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <ExcelButton
              disabled={loading || !shown.length || noCompanyEntries}
              onError={() => showFlash(false, "Could not create the Excel file.")}
              onExport={() => {
                const label = [stockImport?.company_name, stockImport?.invoice_number && `Inv ${stockImport.invoice_number}`]
                  .filter(Boolean)
                  .join(" · ");
                return downloadExcel({
                  fileName: `Purchase_${fileSafe(stockImport?.company_name || "stock")}${
                    stockImport?.invoice_number ? `_${fileSafe(stockImport.invoice_number)}` : ""
                  }`,
                  title: `Purchase stock${label ? ` · ${label}` : ""}${
                    stockImport?.upload_date ? ` · ${showDate(stockImport.upload_date)}` : ""
                  }`,
                  sheets: [
                    {
                      name: "Stock",
                      rows: shown.map((it) => ({
                        ...it,
                        company_name: it.company_name || stockImport?.company_name || it.product_division,
                        upload_date: it.upload_date || stockImport?.upload_date,
                      })),
                      columns: EXPORT_COLUMNS,
                    },
                  ],
                });
              }}
            />
            <p className="ml-auto text-right text-sm leading-tight">
              <span className="block text-xs text-base-content/55">Showing {shown.length} rows</span>
              <span className="tabular-nums">
                {qty(shownTotals.pcs)} pcs · <b>{rupees(shownTotals.value)}</b>
              </span>
            </p>
          </div>

          {noCompanyEntries ? (
            <p className="px-4 py-12 text-center text-sm text-base-content/60">
              No purchases saved for this company yet.
            </p>
          ) : loadError ? (
            <p className="px-4 py-10 text-center text-sm text-error">{loadError}</p>
          ) : loading && !items.length ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-dots loading-md text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-base-content/60">
              No purchases yet. Use <b>New purchase</b> or <b>Upload DMS file</b>.
            </p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-base-content/60">No rows match these filters.</p>
          ) : (
            <div className={`max-h-[70vh] overflow-auto ${loading ? "opacity-60" : ""}`}>
              <table className="table table-sm table-pin-rows whitespace-nowrap">
                <thead>
                  <tr className="text-base-content/70">
                    <th className={`${PIN.sr} z-20 bg-base-200`}>
                      <div className="w-8 text-right">Sr</div>
                    </th>
                    <th className={`${PIN.erp} z-20 bg-base-200`}>
                      <div className="w-28">ERP ID</div>
                    </th>
                    <th className={`${PIN.sku} z-20 bg-base-200`}>
                      <div className="w-56">SKU name</div>
                    </th>
                    {COLUMNS.map((c) => (
                      <th key={c.head} className={`bg-base-200 ${c.num ? "text-right" : ""} ${c.tint ? "text-primary" : ""}`}>
                        {c.head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((it, i) => (
                    <tr key={it.id} className="group">
                      <td className={`${PIN.sr} z-10 bg-base-100 group-hover:bg-base-200`}>
                        <div className="w-8 text-right tabular-nums text-base-content/50">{i + 1}</div>
                      </td>
                      <td className={`${PIN.erp} z-10 bg-base-100 group-hover:bg-base-200`}>
                        <div className="w-28 truncate font-mono text-xs" title={it.product_erp_id}>
                          {it.product_erp_id}
                        </div>
                      </td>
                      <td className={`${PIN.sku} z-10 bg-base-100 group-hover:bg-base-200`}>
                        <div className="w-56 truncate" title={it.product_name}>
                          {it.product_name}
                        </div>
                      </td>
                      {COLUMNS.map((c) => (
                        <td
                          key={c.head}
                          className={`group-hover:bg-base-200/60 ${c.num ? "text-right tabular-nums" : ""} ${
                            c.tint ? "bg-primary/5" : ""
                          } ${c.strong ? "font-semibold" : ""}`}
                        >
                          {c.cell(it, stockImport)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {uploadOpen && (
        <UploadDmsDialog
          companies={companies}
          onClose={() => setUploadOpen(false)}
          onUploaded={(data) => {
            setUploadOpen(false);
            applyResult(data, "DMS stock uploaded.");
          }}
        />
      )}
      {flashNode}
    </div>
  );
}
