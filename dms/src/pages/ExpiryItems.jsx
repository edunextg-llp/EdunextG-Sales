import { useEffect, useMemo, useState } from "react";
import { MdRefresh, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { CompanyPicker, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";

// Expiry Items: view only. Shows the items of a DMS stock upload that have an expiry date,
// with how many days are left. Same data as the main site's Expiry Items page
// (/staff/dms-stock/imports and /staff/dms-stock?importId=). Nothing is saved or deducted.

const DAY_MS = 86400000;

const showDate = (value) => {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const qty = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const daysLeft = (value) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(`${String(value).slice(0, 10)}T00:00:00`).getTime() - today.getTime()) / DAY_MS);
};

const STATUSES = [
  { value: "all", label: "All" },
  { value: "expired", label: "Expired", badge: "badge-error", test: (d) => d < 0 },
  { value: "30", label: "≤ 30 days", badge: "badge-warning", test: (d) => d >= 0 && d <= 30 },
  { value: "90", label: "31–90 days", badge: "badge-accent", test: (d) => d > 30 && d <= 90 },
  { value: "valid", label: "Over 90 days", badge: "badge-success", test: (d) => d > 90 },
];
const statusOf = (days) => STATUSES.find((s) => s.test?.(days)) || STATUSES[4];

export default function ExpiryItems() {
  const [flash, flashNode] = useFlash();
  const allCompanies = useCompanies();
  // CNF or Distributor is chosen first; nothing loads until then.
  const [type, setType] = useState("");
  const [imports, setImports] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [importId, setImportId] = useState("");
  const [stockImport, setStockImport] = useState(null);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [reloadAt, setReloadAt] = useState(0);

  useEffect(() => {
    apiFetch("/staff/dms-stock/imports")
      .then(async (res) => {
        const body = await readJson(res);
        if (!res.ok) throw new Error(body.error || "Unable to load DMS uploads.");
        setImports(Array.isArray(body.imports) ? body.imports : []);
      })
      .catch((err) => flash(false, err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadAt]);

  useEffect(() => {
    if (!importId) {
      setStockImport(null);
      setItems([]);
      return;
    }
    setLoading(true);
    apiFetch(`/staff/dms-stock?importId=${importId}`)
      .then(async (res) => {
        const body = await readJson(res);
        if (!res.ok) throw new Error(body.error || "Unable to load expiry items.");
        setStockImport(body.import || null);
        setItems(Array.isArray(body.items) ? body.items : []);
      })
      .catch((err) => {
        setStockImport(null);
        setItems([]);
        flash(false, err.message);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId, reloadAt]);

  const typeOf = useMemo(() => new Map(allCompanies.map((c) => [String(c.id), c.type])), [allCompanies]);
  const typeImports = useMemo(
    () => (type ? imports.filter((e) => typeOf.get(String(e.company_id)) === type) : []),
    [imports, type, typeOf]
  );
  const companyImports = companyId ? typeImports.filter((e) => String(e.company_id) === companyId) : typeImports;

  // Type / company change: open the latest upload of that choice (uploads come newest first).
  useEffect(() => {
    setImportId(companyImports[0] ? String(companyImports[0].id) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, companyId, typeImports]);

  const withExpiry = useMemo(
    () =>
      items
        .filter((it) => it.expiry_date)
        .map((it) => ({ ...it, days: daysLeft(it.expiry_date) }))
        .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date))),
    [items]
  );
  const counts = Object.fromEntries(
    STATUSES.map((s) => [s.value, s.test ? withExpiry.filter((it) => s.test(it.days)).length : withExpiry.length])
  );

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const test = STATUSES.find((s) => s.value === status)?.test;
    return withExpiry.filter((it) => {
      if (test && !test(it.days)) return false;
      if (!words.length) return true;
      const hay = [it.product_erp_id, it.product_name, it.variant_name, it.batch_number, it.invoice_number, stockImport?.invoice_number]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [withExpiry, search, status, stockImport]);

  const expiredQty = withExpiry.filter((it) => it.days < 0).reduce((t, it) => t + Math.max(0, Number(it.total_current_stock_in_pcs) || 0), 0);

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Stock" title="Expiry Items">
        Expired and soon-to-expire stock from a DMS upload. View only: expiry does not change current stock.
      </PageHeader>

      <CompanyPicker
        companies={allCompanies}
        type={type}
        onTypeChange={(t) => {
          setType(t);
          setCompanyId("");
        }}
        companyId={companyId}
        onCompanyChange={setCompanyId}
        allLabel="All companies"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Expired", value: counts.expired, tone: "text-error" },
          { label: "Expiring in 30 days", value: counts["30"], tone: "text-warning" },
          { label: "Expiring in 31–90 days", value: counts["90"], tone: "text-accent" },
          { label: "Expired qty (pcs)", value: qty(expiredQty), tone: "text-error" },
        ].map((t) => (
          <div key={t.label} className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
            <div className="text-xs text-base-content/60">{t.label}</div>
            <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${t.tone}`}>{t.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <select
            className="select select-sm w-80"
            value={importId}
            disabled={!companyImports.length}
            onChange={(e) => setImportId(e.target.value)}
          >
            {!companyImports.length && <option value="">{type ? "No DMS uploads" : "Choose CNF or Distributor first"}</option>}
            {companyImports.map((e) => (
              <option key={e.id} value={String(e.id)}>
                {showDate(e.upload_date)}
                {e.company_name ? ` — ${e.company_name}` : ""}
                {e.invoice_number ? ` — Inv ${e.invoice_number}` : ""}
              </option>
            ))}
          </select>
          <label className="input input-sm ml-auto w-64">
            <MdSearch size={16} className="opacity-50" />
            <input placeholder="Product, ERP ID, batch, invoice" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReloadAt(Date.now())} disabled={loading} title="Reload">
            <MdRefresh size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-base-300 px-4 py-2">
          <div className="join">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`btn join-item btn-sm ${status === s.value ? "btn-primary" : "btn-outline field-border"}`}
                onClick={() => setStatus(s.value)}
              >
                {s.label}
                <span className="badge badge-sm ml-1">{counts[s.value]}</span>
              </button>
            ))}
          </div>
          {stockImport && (
            <span className="ml-auto text-xs text-base-content/60">
              Upload {showDate(stockImport.upload_date || stockImport.created_at)}
              {stockImport.company_name ? ` · ${stockImport.company_name}` : ""}
              {stockImport.invoice_number ? ` · Inv ${stockImport.invoice_number}` : ""}
            </span>
          )}
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center">
            <span className="loading loading-spinner loading-sm" />
          </p>
        ) : !type ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">Choose CNF or Distributor above to see expiry items.</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">No expiry items match the filters.</p>
        ) : (
          <div className="max-h-[68vh] overflow-auto">
            <table className="table table-sm table-pin-rows whitespace-nowrap">
              <thead>
                <tr className="bg-base-200 text-base-content/70">
                  <th className="text-right">#</th>
                  <th>Product</th>
                  <th>ERP ID</th>
                  <th>Company</th>
                  <th>Batch</th>
                  <th>Invoice</th>
                  <th>MFG</th>
                  <th>Expiry</th>
                  <th className="text-right">Days left</th>
                  <th>Status</th>
                  <th className="text-right">Qty (pcs)</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((it, i) => {
                  const st = statusOf(it.days);
                  return (
                    <tr key={it.id || `${it.product_erp_id}-${it.batch_number}-${i}`} className={it.days < 0 ? "bg-error/5" : "hover:bg-base-200/50"}>
                      <td className="text-right text-base-content/50">{i + 1}</td>
                      <td>
                        <div className="font-medium">{it.product_name}</div>
                        {it.variant_name ? <div className="text-xs text-base-content/55">{it.variant_name}</div> : null}
                      </td>
                      <td className="font-mono text-xs">{it.product_erp_id}</td>
                      <td className="text-xs">{it.company_name || stockImport?.company_name || it.product_division || "—"}</td>
                      <td className="font-mono text-xs">{it.batch_number || "—"}</td>
                      <td className="font-mono text-xs">{it.invoice_number || stockImport?.invoice_number || "—"}</td>
                      <td className="text-xs">{showDate(it.mfg_date)}</td>
                      <td className="text-xs font-semibold">{showDate(it.expiry_date)}</td>
                      <td className={`text-right tabular-nums ${it.days < 0 ? "text-error" : ""}`}>
                        {it.days < 0 ? `${Math.abs(it.days)} ago` : it.days}
                      </td>
                      <td>
                        <span className={`badge badge-sm ${st.badge}`}>{it.days < 0 ? "Expired" : st.label}</span>
                      </td>
                      <td className="text-right font-semibold tabular-nums">{qty(Math.max(0, Number(it.total_current_stock_in_pcs) || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {flashNode}
    </div>
  );
}
