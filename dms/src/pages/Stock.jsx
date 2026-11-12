import { useCallback, useEffect, useMemo, useState } from "react";
import { MdRefresh, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { COMPANY_TYPES, ExcelButton, Field, PageHeader, readJson, useCompanies } from "../components/ui";
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
  in: { label: "In stock", badge: "badge-success" },
  low: { label: "Low", badge: "badge-warning" },
  out: { label: "Out of stock", badge: "badge-error" },
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

export default function Stock() {
  const companies = useCompanies();
  const [stock, setStock] = useState({}); // companyId -> { items } | { error }
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [multiOnly, setMultiOnly] = useState(false);

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
    return allItems.filter(
      (it) =>
        (!status || it.state === status) &&
        (!multiOnly || it.prices.length > 1) &&
        (!words.length ||
          words.every((w) =>
            [it.product_erp_id, it.product_name, it.variant_name, it.hsn_code, it.company.name].join(" ").toLowerCase().includes(w)
          ))
    );
  }, [allItems, search, status, multiOnly]);

  const totals = allItems.reduce(
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

  const single = Boolean(companyId);

  return (
    <div data-theme="dms" className="bg-transparent text-base-content">
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Inventory" title="Stock">
          Current stock of every product. Items bought at more than one MRP show each price under the same item.
        </PageHeader>

        {/* Filters */}
        <section className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-box border border-base-300 bg-base-100 px-4 py-3">
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
          <Field label="Company" className="w-full sm:w-56">
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
          <Field label="Status" className="w-full sm:w-40">
            <select className="select select-sm w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="in">In stock</option>
              <option value="low">Low (under 1 box)</option>
              <option value="out">Out of stock</option>
            </select>
          </Field>
          <label className="input input-sm w-full sm:w-64">
            <MdSearch size={16} className="opacity-50" />
            <input type="search" placeholder="ERP ID, name, variant, HSN" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-sm">
            <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={multiOnly} onChange={(e) => setMultiOnly(e.target.checked)} />
            Only items with 2+ prices
          </label>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm btn-square" title="Refresh" disabled={loading} onClick={load}>
              <MdRefresh size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <ExcelButton disabled={loading || !rows.length} onExport={exportExcel} />
          </div>
        </section>

        {/* Totals */}
        <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-box border border-base-300 bg-base-300 sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["Items", qty(totals.items)],
            ["In stock", qty(totals.in), "text-success"],
            ["Low", qty(totals.low), "text-warning"],
            ["Out of stock", qty(totals.out), "text-error"],
            ["With 2+ prices", qty(totals.multi)],
            ["Pieces in hand", qty(totals.pcs)],
            ["Stock value", rupees(totals.value), "text-primary font-semibold"],
          ].map(([label, value, tone]) => (
            <div key={label} className="bg-base-100 px-4 py-3">
              <dt className="text-xs text-base-content/55">{label}</dt>
              <dd className={`mt-0.5 text-lg font-medium ${tone || ""}`}>{value}</dd>
            </div>
          ))}
        </dl>

        {missing.length > 0 && !loading && (
          <p className="mb-3 rounded-box border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
            No current stock yet for <b>{missing.map((c) => c.name).join(", ")}</b>. Add their physical stock first.
          </p>
        )}

        <section className="min-w-0 rounded-box border border-base-300 bg-base-100">
          {loading && !allItems.length ? (
            <div className="flex justify-center py-14">
              <span className="loading loading-dots loading-md text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-14 text-center text-sm text-base-content/60">
              {allItems.length ? "No items match these filters." : "No stock for this selection."}
            </p>
          ) : (
            <div className={`max-h-[72vh] overflow-auto ${loading ? "opacity-60" : ""}`}>
              <table className="table table-sm table-pin-rows">
                <thead>
                  <tr className="text-base-content/70">
                    <th className="w-10 bg-base-200 text-right">Sr</th>
                    <th className="bg-base-200">Item</th>
                    {!single && <th className="bg-base-200">Company</th>}
                    <th className="bg-base-200">Status</th>
                    <th className="bg-base-200 text-right">Current stock</th>
                    <th className="bg-base-200">
                      Price (MRP · DP)
                      <span className="block text-[11px] font-normal text-base-content/50">pcs on latest invoice</span>
                    </th>
                    <th className="bg-base-200 text-right">Cost / pc</th>
                    <th className="bg-base-200 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it, i) => {
                    const multi = it.prices.length > 1;
                    return (
                      <tr key={`${it.company.id}-${it.product_erp_id}`} className={`align-top hover:bg-base-200/40 ${multi ? "bg-primary/[0.03]" : ""}`}>
                        <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                        <td className="max-w-80">
                          <div className="truncate font-medium" title={it.variant_name || it.product_name}>
                            {it.variant_name || it.product_name}
                          </div>
                          <div className="truncate text-xs text-base-content/55">
                            <span className="font-mono">{it.product_erp_id}</span>
                            {it.hsn_code && <span> · HSN {it.hsn_code}</span>}
                            {it.variant_name && it.product_name && <span> · {it.product_name}</span>}
                          </div>
                        </td>
                        {!single && <td className="whitespace-nowrap text-sm">{it.company.name}</td>}
                        <td>
                          <span className={`badge badge-sm badge-soft ${STATE[it.state].badge} whitespace-nowrap`}>{STATE[it.state].label}</span>
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <div className={`font-semibold tabular-nums ${it.state === "out" ? "text-error" : ""}`}>
                            {qty(it.total_current_stock_in_pcs)} pcs
                          </div>
                          <div className="text-xs text-base-content/55">
                            {boxesText(it.total_current_stock_in_pcs, it.pcs_per_box) ||
                              (num(it.pcs_per_box) ? `1 box = ${qty(it.pcs_per_box)}` : "")}
                          </div>
                        </td>
                        <td className="min-w-56">
                          {it.prices.length === 0 ? (
                            <span className="tabular-nums">{num(it.mrp) ? `MRP ${rupees(it.mrp)}` : "—"}</span>
                          ) : (
                            <ul className={multi ? "space-y-1" : ""}>
                              {it.prices.map((p) => (
                                <li key={p.mrp} className="flex items-baseline gap-2 whitespace-nowrap text-sm">
                                  {multi && <span className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-primary" />}
                                  <span className="font-medium tabular-nums">MRP {rupees(p.mrp)}</span>
                                  <span className="text-base-content/55 tabular-nums">DP {rupees(p.dp, p.dp % 1 ? 4 : 2)}</span>
                                  {multi && <span className="ml-auto text-xs text-base-content/55 tabular-nums">{qty(p.pcs)} pcs</span>}
                                </li>
                              ))}
                              {multi && (
                                <li className="pt-0.5 text-[11px] text-primary">
                                  {it.prices.length} prices · one stock
                                </li>
                              )}
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
