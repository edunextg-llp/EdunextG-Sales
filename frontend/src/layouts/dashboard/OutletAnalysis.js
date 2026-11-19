// Dashboard > Outlet Analysis: outlet-wise sales, invoices (orders) and growth against the previous
// period of the same length. Data: GET /api/staff/reports/outlets (cancelled invoices left out).
// Tailwind CSS + Apache ECharts.
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import EChart, { CHART_TEXT } from "components/EChart";
import { Icon, KpiCard, Panel, SelectField, STATUS_COLORS, formatRs } from "./ui";

const API = process.env.REACT_APP_API_URL;
const CURRENT = "#2a78d6"; // series slot 1
const PREVIOUS = "#94a3b8"; // the comparison period recedes (muted ink, not a series hue)

const compactRs = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
};
const showDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
};
const pct = (value) => (value == null ? "" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`);

// Growth badge: arrow + text, the colour only backs them up.
function GrowthBadge({ outlet }) {
  const map = {
    new: { text: "New", icon: "fiber_new", cls: "bg-blue-50 text-blue-700" },
    lost: { text: "No order", icon: "remove_circle_outline", cls: "bg-red-50 text-red-700" },
    up: { text: pct(outlet.growth_pct), icon: "trending_up", cls: "bg-emerald-50 text-emerald-700" },
    down: { text: pct(outlet.growth_pct), icon: "trending_down", cls: "bg-red-50 text-red-700" },
    flat: { text: "0.0%", icon: "trending_flat", cls: "bg-slate-100 text-slate-600" },
  };
  const b = map[outlet.trend] || map.flat;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${b.cls}`}>
      <Icon name={b.icon} className="text-[14px]" />
      {b.text}
    </span>
  );
}
GrowthBadge.propTypes = { outlet: PropTypes.object.isRequired };

// Top outlets: this period vs the previous one (grouped bars, legend + tooltip).
function TopOutletsChart({ outlets }) {
  const top = outlets.slice(0, 10).reverse();
  const option = useMemo(() => ({
    legend: { top: 0, left: "center", icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: CHART_TEXT.secondary, fontSize: 12 } },
    grid: { left: 8, right: 56, top: 32, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(15,23,42,0.04)" } },
      formatter: (params) => {
        const o = top[params[0].dataIndex];
        return `<div style="font-weight:600;margin-bottom:4px">${o.outlet_name}</div>`
          + `${params.map((p) => `<div style="display:flex;justify-content:space-between;gap:16px">${p.marker}${p.seriesName}<b>${formatRs(p.value)}</b></div>`).join("")}`
          + `<div style="margin-top:4px;color:#475569">Invoices: <b>${o.current_invoices}</b> now · <b>${o.previous_invoices}</b> before</div>`;
      },
    },
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category", data: top.map((o) => o.outlet_name || "-"),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: CHART_TEXT.secondary, fontSize: 11, width: 130, overflow: "truncate" },
    },
    series: [
      { type: "bar", name: "Previous period", data: top.map((o) => o.previous_sales), barMaxWidth: 10, barGap: "30%", itemStyle: { color: PREVIOUS, borderRadius: [0, 4, 4, 0] } },
      {
        type: "bar", name: "This period", data: top.map((o) => o.current_sales), barMaxWidth: 10, itemStyle: { color: CURRENT, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", formatter: (p) => compactRs(p.value), color: CHART_TEXT.secondary, fontSize: 11 },
      },
    ],
  }), [top]);
  if (!top.length) return <p className="m-0 py-10 text-center text-[13px] text-slate-400">No outlet sales in this period.</p>;
  return <EChart option={option} height={Math.max(220, top.length * 34 + 40)} ariaLabel="Top outlets this period against the previous period" />;
}
TopOutletsChart.propTypes = { outlets: PropTypes.arrayOf(PropTypes.object).isRequired };

// How outlets moved: new / growing / flat / declining / no order this period.
function OutletMovement({ summary, total }) {
  const rows = [
    { label: "New outlets (ordered now, not before)", value: summary.new_outlets, color: "#2a78d6", icon: "fiber_new" },
    { label: "Growing", value: summary.growing_outlets, color: STATUS_COLORS.good, icon: "trending_up" },
    { label: "Declining", value: summary.declining_outlets, color: STATUS_COLORS.serious, icon: "trending_down" },
    { label: "No order this period", value: summary.lost_outlets, color: STATUS_COLORS.critical, icon: "remove_circle_outline" },
  ];
  const max = Math.max(1, total);
  return (
    <ul className="m-0 list-none space-y-3.5 p-0 px-2 pt-1">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <Icon name={r.icon} className="text-[16px] text-slate-500" />
            <span className="grow text-[13px] text-slate-600">{r.label}</span>
            <span className="text-[13px] font-semibold tabular-nums text-slate-900">{r.value}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
OutletMovement.propTypes = { summary: PropTypes.object.isRequired, total: PropTypes.number.isRequired };

const VIEWS = [
  { key: "top", label: "Top sales", test: (o) => o.current_invoices > 0, sort: (a, b) => b.current_sales - a.current_sales },
  { key: "growing", label: "Fastest growing", test: (o) => o.trend === "up", sort: (a, b) => b.growth_pct - a.growth_pct },
  { key: "declining", label: "Declining", test: (o) => o.trend === "down", sort: (a, b) => a.growth_pct - b.growth_pct },
  { key: "new", label: "New", test: (o) => o.trend === "new", sort: (a, b) => b.current_sales - a.current_sales },
  { key: "lost", label: "No order now", test: (o) => o.trend === "lost", sort: (a, b) => b.previous_sales - a.previous_sales },
];
const PAGE = 15;

function OutletAnalysis({ startDate, endDate, companyId, staffOptions }) {
  const [staffId, setStaffId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("top");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (companyId) params.set("companyId", companyId);
    if (staffId) params.set("staffId", staffId);
    setLoading(true);
    setError("");
    fetch(`${API}/staff/reports/outlets?${params}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Unable to load the outlet analysis.");
        if (!cancelled) setData(body);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate, companyId, staffId]);

  useEffect(() => { setShown(PAGE); }, [view, search, data]);

  const outlets = useMemo(() => data?.outlets || [], [data]);
  const s = data?.summary;
  const list = useMemo(() => {
    const v = VIEWS.find((x) => x.key === view);
    const words = search.trim().toUpperCase().split(/\s+/).filter(Boolean);
    return outlets
      .filter(v.test)
      .filter((o) => words.every((w) => `${o.outlet_name} ${o.outlet_erp_id} ${o.staff_names}`.toUpperCase().includes(w)))
      .sort(v.sort);
  }, [outlets, view, search]);
  const topBySales = useMemo(() => outlets.filter((o) => o.current_invoices > 0), [outlets]);
  const periodText = data
    ? `${showDate(data.period.current.from)} – ${showDate(data.period.current.to)} vs ${showDate(data.period.previous.from)} – ${showDate(data.period.previous.to)} (${data.period.days} days each)`
    : "";
  const activeDelta = s ? s.active_outlets - s.previous_active_outlets : 0;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 grow">
          <h2 className="m-0 text-[17px] font-semibold text-slate-900">Outlet Analysis</h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">
            Outlet-wise sales, orders (invoices) and growth against the previous period{periodText ? ` · ${periodText}` : ""}. Cancelled invoices are not counted.
          </p>
        </div>
        <SelectField label="Staff" value={staffId} onChange={setStaffId} options={staffOptions} placeholder="All staff" />
        {loading && <span className="mb-2.5 size-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" aria-label="Loading" />}
      </div>

      {error && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          <Icon name="error_outline" className="text-[18px]" /> {error}
        </div>
      )}

      {s && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Active outlets" value={s.active_outlets} icon="storefront" tone="blue"
              hint={`${activeDelta >= 0 ? "+" : ""}${activeDelta} vs ${s.previous_active_outlets} before`} hintTone={activeDelta >= 0 ? "good" : "bad"}
            />
            <KpiCard
              label="Orders (invoices)" value={s.current_invoices} icon="receipt_long" tone="violet"
              hint={`${s.previous_invoices} in the previous period`}
            />
            <KpiCard
              label="Outlet sales" value={formatRs(s.current_sales)} icon="payments" tone="green"
              hint={s.growth_pct == null ? "No sales before to compare" : `${pct(s.growth_pct)} vs previous period`}
              hintTone={s.growth_pct == null ? "muted" : s.growth_pct >= 0 ? "good" : "bad"}
            />
            <KpiCard label="Average order value" value={formatRs(s.avg_invoice_value)} icon="shopping_bag" tone="amber" hint="Sales ÷ invoices this period" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel className="lg:col-span-2" icon="leaderboard" title="Top 10 Outlets" subtitle="Sales this period against the previous period">
              <TopOutletsChart outlets={topBySales} />
            </Panel>
            <Panel icon="swap_vert" title="Outlet Movement" subtitle={`${s.active_outlets + s.lost_outlets} outlets ordered in one of the two periods`}>
              <OutletMovement summary={s} total={s.active_outlets + s.lost_outlets} />
            </Panel>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
              <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                {VIEWS.map((v) => (
                  <button
                    key={v.key} type="button" onClick={() => setView(v.key)}
                    className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${view === v.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="grow" />
              <label className="relative">
                <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                <input
                  type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search outlet, ERP id, staff"
                  className="h-9 w-64 rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">Outlet</th>
                    <th className="px-3 py-2.5">Staff</th>
                    <th className="px-3 py-2.5 text-right">Orders now</th>
                    <th className="px-3 py-2.5 text-right">Orders before</th>
                    <th className="px-3 py-2.5 text-right">Sales now</th>
                    <th className="px-3 py-2.5 text-right">Sales before</th>
                    <th className="px-3 py-2.5">Growth</th>
                    <th className="px-3 py-2.5 text-right">Avg order</th>
                    <th className="px-5 py-2.5">Last order</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, shown).map((o) => (
                    <tr key={o.outlet_key} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="max-w-64 px-5 py-2.5">
                        <span className="block truncate font-semibold text-slate-800">{o.outlet_name}</span>
                        {o.outlet_erp_id && <span className="block text-[11.5px] text-slate-400">{o.outlet_erp_id}</span>}
                      </td>
                      <td className="max-w-48 truncate px-3 py-2.5 text-slate-600">{o.staff_names}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800">{o.current_invoices}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{o.previous_invoices}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800">{formatRs(o.current_sales)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{formatRs(o.previous_sales)}</td>
                      <td className="px-3 py-2.5"><GrowthBadge outlet={o} /></td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {o.current_invoices ? formatRs(o.current_sales / o.current_invoices) : "-"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{showDate(o.last_sale_date)}</td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr><td colSpan={9} className="px-5 py-10 text-center text-[13px] text-slate-400">No outlets in this list.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-2.5 text-[12px] text-slate-500">
              <span>Showing {Math.min(shown, list.length)} of {list.length} outlets</span>
              {shown < list.length && (
                <button type="button" onClick={() => setShown((n) => n + PAGE * 2)} className="font-semibold text-blue-700 hover:text-blue-900">
                  Show more
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

OutletAnalysis.propTypes = {
  startDate: PropTypes.string,
  endDate: PropTypes.string,
  companyId: PropTypes.string,
  staffOptions: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })).isRequired,
};
OutletAnalysis.defaultProps = { startDate: "", endDate: "", companyId: "" };

export default OutletAnalysis;
