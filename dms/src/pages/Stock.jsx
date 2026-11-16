import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MdArrowDownward,
  MdArrowUpward,
  MdCheckCircle,
  MdClose,
  MdError,
  MdInventory2,
  MdLayers,
  MdRefresh,
  MdSearch,
  MdWarning,
} from "react-icons/md";
import { apiFetch } from "../auth";
import { COMPANY_TYPES, ExcelButton, PageHeader, readJson, useCompanies } from "../components/ui";
import { downloadExcel, fileSafe } from "../utils/excel";
import { qty, rupees } from "../utils/purchaseCalc";

// Stock: every product's current stock (physical minus DMS, the same figure as the
// main site's Current Stock), one row per item. When an item was bought at more than
// one MRP on its latest invoice, each price is listed under it.

const num = (v) => Number(v) || 0;

// Out at 0 pcs; low when less than one box is left.
const stateOf = (it) => {
  const pcs = num(it.total_current_stock_in_pcs);
  const perBox = num(it.pcs_per_box);
  if (pcs <= 0) return "out";
  if (perBox > 0 && pcs < perBox) return "low";
  return "in";
};
const STATE = {
  in: { label: "In stock", badge: "badge-success", dot: "bg-success" },
  low: { label: "Low", badge: "badge-warning", dot: "bg-warning" },
  out: { label: "Out of stock", badge: "badge-error", dot: "bg-error" },
};

const boxesText = (pcs, perBox) => {
  const total = num(pcs);
  const box = num(perBox);
  if (!box || total <= 0) return null;
  const full = Math.floor(total / box);
  const loose = Math.round((total - full * box) * 100) / 100;
  return `${qty(full)} box${loose ? ` + ${qty(loose)}` : ""}`;
};

// Distinct MRPs of an item (lines at the same MRP are added together).
const pricesOf = (it) => {
  const map = new Map();
  (it.price_lines || []).forEach((p) => {
    const key = num(p.mrp).toFixed(2);
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, pcs: prev.pcs + num(p.pcs) } : { mrp: num(p.mrp), dp: num(p.dp_price), cost: num(p.price_per_piece), pcs: num(p.pcs) });
  });
  return [...map.values()].sort((a, b) => a.mrp - b.mrp);
};

const itemName = (it) => it.variant_name || it.product_name || "";

const SORTS = {
  name: (a, b) => itemName(a).localeCompare(itemName(b)),
  company: (a, b) => a.company.name.localeCompare(b.company.name) || itemName(a).localeCompare(itemName(b)),
  stock: (a, b) => num(a.total_current_stock_in_pcs) - num(b.total_current_stock_in_pcs),
  cost: (a, b) => num(a.price_per_piece) - num(b.price_per_piece),
  value: (a, b) => num(a.total_value) - num(b.total_value),
};

// Clickable summary card that doubles as the status filter.
function StatusCard({ label, value, icon, tone, active, onClick, note }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex flex-col items-start rounded-box border bg-base-100 px-4 py-3 text-left transition ${
        active ? "border-primary ring-2 ring-primary/15" : "border-base-300 hover:border-primary/40"
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-base-content/60">
        <span className={`flex ${tone}`}>{icon}</span>
        {label}
      </span>
      <span className="mt-1 text-xl font-semibold tabular-nums">{value}</span>
      {note && <span className="text-[11px] text-base-content/50">{note}</span>}
    </button>
  );
}

function SortHeader({ id, label, sort, onSort, align = "left", className = "" }) {
  const active = sort.key === id;
  const Arrow = sort.dir === "asc" ? MdArrowUpward : MdArrowDownward;
  return (
    <th className={`bg-base-200 ${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(id)}
        className={`inline-flex items-center gap-1 hover:text-primary ${active ? "text-primary" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <Arrow size={13} className={active ? "opacity-100" : "opacity-0 group-hover:opacity-40"} />
      </button>
    </th>
  );
}

export default function Stock() {
  const companies = useCompanies();
  const [stock, setStock] = useState({}); // companyId -> { items } | { error }
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [multiOnly, setMultiOnly] = useState(false);
  const [sort, setSort] = useState({ key: "company", dir: "asc" });

  const load = useCallback(async () => {
    if (!companies.length) return;
    setLoading(true);
    const results = await Promise.all(
      companies.map(async (c) => {
        try {
          const res = await apiFetch(`/staff/current-stock?companyName=${encodeURIComponent(c.name)}`);
          const data = await readJson(res);
          if (!res.ok || !Array.isArray(data.items)) return [c.id, { error: data.error || "No stock yet" }];
          return [c.id, { items: data.items }];
        } catch {
          return [c.id, { error: "Network error" }];
        }
      })
    );
    setStock(Object.fromEntries(results));
    setLoading(false);
  }, [companies]);

  useEffect(() => {
    load();
  }, [load]);

  const scoped = companies.filter((c) => (!type || c.type === type) && (!companyId || String(c.id) === companyId));
  const missing = scoped.filter((c) => stock[c.id]?.error);
  const single = Boolean(companyId);

  const allItems = useMemo(
    () =>
      scoped.flatMap((c) =>
        (stock[c.id]?.items || []).map((it) => ({ ...it, company: c, state: stateOf(it), prices: pricesOf(it) }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stock, type, companyId, companies]
  );

  const rows = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = allItems.filter(
      (it) =>
        (!status || it.state === status) &&
        (!multiOnly || it.prices.length > 1) &&
        (!words.length ||
          words.every((w) =>
            [it.product_erp_id, it.product_name, it.variant_name, it.hsn_code, it.company.name].join(" ").toLowerCase().includes(w)
          ))
    );
    const cmp = SORTS[sort.key] || SORTS.company;
    return [...list].sort((a, b) => (sort.dir === "asc" ? cmp(a, b) : cmp(b, a)));
  }, [allItems, search, status, multiOnly, sort]);

  const sumOf = (list) =>
    list.reduce(
      (t, it) => ({
        items: t.items + 1,
        in: t.in + (it.state === "in" ? 1 : 0),
        low: t.low + (it.state === "low" ? 1 : 0),
        out: t.out + (it.state === "out" ? 1 : 0),
        multi: t.multi + (it.prices.length > 1 ? 1 : 0),
        pcs: t.pcs + Math.max(0, num(it.total_current_stock_in_pcs)),
        value: t.value + num(it.total_value),
      }),
      { items: 0, in: 0, low: 0, out: 0, multi: 0, pcs: 0, value: 0 }
    );
  const totals = sumOf(allItems);
  const shown = sumOf(rows);

  // Per-company split, shown when more than one company is in scope.
  const byCompany = useMemo(() => {
    if (single) return [];
    return scoped
      .filter((c) => stock[c.id]?.items?.length)
      .map((c) => ({ company: c, ...sumOf(allItems.filter((it) => it.company.id === c.id)) }))
      .sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, single]);

  const onSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "company" ? "asc" : "desc" }));

  const hasFilters = Boolean(type || companyId || search || status || multiOnly);
  const clearFilters = () => {
    setType("");
    setCompanyId("");
    setSearch("");
    setStatus("");
    setMultiOnly(false);
  };

  const exportExcel = () => {
    const scopeName = companyId ? scoped[0]?.name : type ? COMPANY_TYPES.find((t) => t.value === type)?.label : "All companies";
    return downloadExcel({
      fileName: `Stock_${fileSafe(scopeName)}`,
      title: `Stock · ${scopeName}`,
      sheets: [
        {
          name: "Stock",
          rows,
          columns: [
            { header: "Sr No", width: 7, type: "number", value: (_, i) => i + 1 },
            { header: "Company", width: 22, value: (it) => it.company.name },
            { header: "Product ERP ID", key: "product_erp_id", width: 18 },
            { header: "SKU Name", key: "product_name", width: 30 },
            { header: "Variant", key: "variant_name", width: 28 },
            { header: "HSN Code", key: "hsn_code", width: 12 },
            { header: "Status", width: 12, value: (it) => STATE[it.state].label },
            { header: "Pcs / Box", key: "pcs_per_box", width: 9, type: "number" },
            { header: "Physical Pcs", key: "total_physical_stock_in_pcs", width: 11, type: "number", total: true },
            { header: "DMS Pcs", key: "total_dms_stock_in_pcs", width: 10, type: "number", total: true },
            { header: "Current Pcs", key: "total_current_stock_in_pcs", width: 11, type: "number", total: true },
            { header: "MRPs", width: 18, value: (it) => it.prices.map((p) => p.mrp.toFixed(2)).join(" / ") || (num(it.mrp) ? num(it.mrp).toFixed(2) : "") },
            { header: "Cost / Pc (avg)", key: "price_per_piece", width: 12, type: "rate" },
            { header: "Stock Value", key: "total_value", width: 13, type: "money", total: true },
          ],
        },
        {
          name: "Price split",
          rows: rows.flatMap((it) => it.prices.map((p) => ({ it, p }))),
          columns: [
            { header: "Company", width: 22, value: ({ it }) => it.company.name },
            { header: "Product ERP ID", width: 18, value: ({ it }) => it.product_erp_id },
            { header: "Item", width: 32, value: ({ it }) => it.variant_name || it.product_name },
            { header: "MRP", width: 10, type: "money", value: ({ p }) => p.mrp },
            { header: "DP / Pc", width: 10, type: "rate", value: ({ p }) => p.dp },
            { header: "Cost / Pc", width: 10, type: "rate", value: ({ p }) => p.cost },
            { header: "Pcs on latest invoice", width: 14, type: "number", total: true, value: ({ p }) => p.pcs },
            { header: "Item current stock (all prices)", width: 16, type: "number", value: ({ it }) => it.total_current_stock_in_pcs },
          ],
        },
      ],
    });
  };

  const colCount = single ? 7 : 8;

  return (
    <div data-theme="dms" className="bg-transparent text-base-content">
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Inventory" title="Stock">
          Current stock of every product. Items bought at more than one MRP show each price under the same item.
        </PageHeader>

        {/* Headline: total value + status cards (click to filter) */}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 flex flex-col justify-between rounded-box bg-primary px-4 py-3 text-primary-content md:col-span-1 lg:col-span-2">
            <span className="text-xs font-medium text-primary-content/75">Stock value</span>
            <span className="mt-1 text-2xl font-semibold tabular-nums">{loading && !allItems.length ? "—" : rupees(totals.value)}</span>
            <span className="text-[11px] text-primary-content/70">
              {qty(totals.pcs)} pcs in hand across {qty(totals.items)} items
            </span>
          </div>
          <StatusCard
            label="All items"
            value={qty(totals.items)}
            icon={<MdInventory2 size={15} />}
            tone="text-primary"
            active={!status && !multiOnly}
            onClick={() => {
              setStatus("");
              setMultiOnly(false);
            }}
          />
          <StatusCard
            label="In stock"
            value={qty(totals.in)}
            icon={<MdCheckCircle size={15} />}
            tone="text-success"
            active={status === "in"}
            onClick={() => setStatus((s) => (s === "in" ? "" : "in"))}
          />
          <StatusCard
            label="Low"
            value={qty(totals.low)}
            note="under 1 box"
            icon={<MdWarning size={15} />}
            tone="text-warning"
            active={status === "low"}
            onClick={() => setStatus((s) => (s === "low" ? "" : "low"))}
          />
          <StatusCard
            label="Out of stock"
            value={qty(totals.out)}
            icon={<MdError size={15} />}
            tone="text-error"
            active={status === "out"}
            onClick={() => setStatus((s) => (s === "out" ? "" : "out"))}
          />
        </div>

        {/* Filters */}
        <section className="mb-4 rounded-box border border-base-300 bg-base-100">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3">
            <label className="input input-sm w-full sm:max-w-sm sm:flex-1">
              <MdSearch size={17} className="opacity-50" />
              <input type="search" placeholder="Search ERP ID, name, variant, HSN, company" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
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
            <select className="select select-sm w-full sm:w-56" value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company">
              <option value="">All companies</option>
              {companies
                .filter((c) => !type || c.type === type)
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            <button
              type="button"
              className={`btn btn-sm ${multiOnly ? "btn-primary" : "btn-outline field-border"}`}
              onClick={() => setMultiOnly((v) => !v)}
              title="Only items bought at more than one MRP"
            >
              <MdLayers size={16} />
              2+ prices
              <span className={`badge badge-xs ${multiOnly ? "bg-primary-content/20 border-0 text-primary-content" : "badge-ghost"}`}>{qty(totals.multi)}</span>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" className="btn btn-ghost btn-sm btn-square" title="Refresh" disabled={loading} onClick={load}>
                <MdRefresh size={18} className={loading ? "animate-spin" : ""} />
              </button>
              <ExcelButton disabled={loading || !rows.length} onExport={exportExcel} />
            </div>
          </div>
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2 border-t border-base-300 bg-base-200/50 px-4 py-2 text-xs">
              <span className="text-base-content/60">
                Showing <b className="text-base-content">{qty(rows.length)}</b> of {qty(totals.items)} items
              </span>
              {status && <span className={`badge badge-sm badge-soft ${STATE[status].badge}`}>{STATE[status].label}</span>}
              {multiOnly && <span className="badge badge-sm badge-soft badge-primary">2+ prices</span>}
              {search && <span className="badge badge-sm badge-ghost">“{search}”</span>}
              <button type="button" className="btn btn-ghost btn-xs ml-auto text-primary" onClick={clearFilters}>
                <MdClose size={14} />
                Clear filters
              </button>
            </div>
          )}
        </section>

        {/* Company split */}
        {byCompany.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {byCompany.map((c) => (
              <button
                key={c.company.id}
                type="button"
                onClick={() => setCompanyId(String(c.company.id))}
                className="min-w-44 shrink-0 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-left transition hover:border-primary/40"
                title={`Show only ${c.company.name}`}
              >
                <div className="truncate text-sm font-medium">{c.company.name}</div>
                <div className="mt-0.5 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums text-primary">{rupees(c.value)}</span>
                  <span className="text-[11px] text-base-content/55">{qty(c.items)} items</span>
                </div>
                <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-base-200">
                  {["in", "low", "out"].map((k) =>
                    c[k] ? <span key={k} className={STATE[k].dot} style={{ width: `${(c[k] / c.items) * 100}%` }} title={`${STATE[k].label}: ${c[k]}`} /> : null
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {missing.length > 0 && !loading && (
          <div role="alert" className="alert alert-warning alert-soft mb-4 py-2 text-sm">
            <MdWarning size={18} />
            <span>
              No current stock yet for <b>{missing.map((c) => c.name).join(", ")}</b>. Add their physical stock first.
            </span>
          </div>
        )}

        <section className="min-w-0 overflow-hidden rounded-box border border-base-300 bg-base-100">
          {loading && !allItems.length ? (
            <div className="divide-y divide-base-300">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <div className="skeleton h-4 w-6" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-4 w-1/3" />
                    <div className="skeleton h-3 w-1/5" />
                  </div>
                  <div className="skeleton h-5 w-16" />
                  <div className="skeleton h-4 w-20" />
                  <div className="skeleton h-4 w-24" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <MdInventory2 size={36} className="text-base-content/25" />
              <p className="text-sm text-base-content/60">{allItems.length ? "No items match these filters." : "No stock for this selection."}</p>
              {hasFilters && (
                <button type="button" className="btn btn-soft btn-primary btn-xs" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className={`max-h-[72vh] overflow-auto ${loading ? "opacity-60" : ""}`}>
              <table className="table table-sm table-pin-rows">
                <thead>
                  <tr className="group text-base-content/70">
                    <th className="w-10 bg-base-200 text-right">Sr</th>
                    <SortHeader id="name" label="Item" sort={sort} onSort={onSort} />
                    {!single && <SortHeader id="company" label="Company" sort={sort} onSort={onSort} />}
                    <th className="bg-base-200">Status</th>
                    <SortHeader id="stock" label="Current stock" sort={sort} onSort={onSort} align="right" />
                    <th className="bg-base-200">
                      Price (MRP · DP)
                      <span className="block text-[11px] font-normal text-base-content/50">pcs on latest invoice</span>
                    </th>
                    <SortHeader id="cost" label="Cost / pc" sort={sort} onSort={onSort} align="right" />
                    <SortHeader id="value" label="Value" sort={sort} onSort={onSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it, i) => {
                    const multi = it.prices.length > 1;
                    return (
                      <tr
                        key={`${it.company.id}-${it.product_erp_id}`}
                        className={`align-top hover:bg-base-200/50 ${it.state === "out" ? "bg-error/[0.03]" : multi ? "bg-primary/[0.03]" : ""}`}
                      >
                        <td className="text-right tabular-nums text-base-content/45">{i + 1}</td>
                        <td className="max-w-80">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${STATE[it.state].dot}`} />
                            <span className="truncate font-medium" title={itemName(it)}>
                              {itemName(it)}
                            </span>
                          </div>
                          <div className="truncate pl-4 text-xs text-base-content/55">
                            <span className="font-mono">{it.product_erp_id}</span>
                            {it.hsn_code && <span> · HSN {it.hsn_code}</span>}
                            {it.variant_name && it.product_name && <span> · {it.product_name}</span>}
                          </div>
                        </td>
                        {!single && (
                          <td className="whitespace-nowrap text-sm">
                            <button type="button" className="hover:text-primary hover:underline" onClick={() => setCompanyId(String(it.company.id))}>
                              {it.company.name}
                            </button>
                          </td>
                        )}
                        <td>
                          <span className={`badge badge-sm badge-soft ${STATE[it.state].badge} whitespace-nowrap`}>{STATE[it.state].label}</span>
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <div className={`font-semibold tabular-nums ${it.state === "out" ? "text-error" : it.state === "low" ? "text-warning" : ""}`}>
                            {qty(it.total_current_stock_in_pcs)} pcs
                          </div>
                          <div className="text-xs text-base-content/55">
                            {boxesText(it.total_current_stock_in_pcs, it.pcs_per_box) ||
                              (num(it.pcs_per_box) ? `1 box = ${qty(it.pcs_per_box)}` : "")}
                          </div>
                          <div
                            className="text-[11px] text-base-content/40 tabular-nums"
                            title="Physical stock − DMS stock"
                          >
                            {qty(it.total_physical_stock_in_pcs)} − {qty(it.total_dms_stock_in_pcs)}
                          </div>
                        </td>
                        <td className="min-w-56">
                          {it.prices.length === 0 ? (
                            <span className="tabular-nums">{num(it.mrp) ? `MRP ${rupees(it.mrp)}` : "—"}</span>
                          ) : (
                            <ul className={multi ? "space-y-1 rounded border border-primary/15 bg-base-100 px-2 py-1.5" : ""}>
                              {it.prices.map((p) => (
                                <li key={p.mrp} className="flex items-baseline gap-2 whitespace-nowrap text-sm">
                                  {multi && <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-primary" />}
                                  <span className="font-medium tabular-nums">MRP {rupees(p.mrp)}</span>
                                  <span className="text-base-content/55 tabular-nums">DP {rupees(p.dp, p.dp % 1 ? 4 : 2)}</span>
                                  {multi && <span className="ml-auto text-xs text-base-content/55 tabular-nums">{qty(p.pcs)} pcs</span>}
                                </li>
                              ))}
                              {multi && <li className="pt-0.5 text-[11px] text-primary">{it.prices.length} prices · one stock</li>}
                            </ul>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {rupees(it.price_per_piece, 4)}
                          {multi && <div className="text-[11px] text-base-content/50">average</div>}
                        </td>
                        <td className="whitespace-nowrap text-right font-medium tabular-nums">{rupees(it.total_value)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 z-[1]">
                  <tr className="border-t border-base-300 bg-base-200 text-sm font-semibold text-base-content">
                    <td colSpan={colCount - 4} className="bg-base-200">
                      Total · {qty(shown.items)} items
                    </td>
                    <td className="bg-base-200 text-right tabular-nums">{qty(shown.pcs)} pcs</td>
                    <td className="bg-base-200" colSpan={2} />
                    <td className="bg-base-200 text-right tabular-nums text-primary">{rupees(shown.value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
        <p className="mt-2 text-xs text-base-content/50">
          Current stock = physical stock minus DMS, as on the Current Stock page. Sales aren&apos;t recorded per MRP, so the
          pieces next to each price are what came in on the item&apos;s latest invoice, not what is left at that price.
        </p>
      </div>
    </div>
  );
}
