// Dashboard > Company Insights: five company-wise views of the current month.
//   1. Employee target vs achieved   (target = company daily target x Mon-Sat working days;
//                                     achieved = outlet orders, cancelled left out)
//   2. Distributors per company       (active / inactive)
//   3. Outlets per bit                (bit = outlet area)
//   4. Outlet performance             (outlets that ordered this month vs not, top outlets)
//   5. Employee growth                (outlet orders per month, last 6 months)
// Data: GET /api/staff/reports/company-insights. Tailwind CSS + Apache ECharts.
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import EChart, { CHART_TEXT } from "components/EChart";
import { Icon, KpiCard, Panel, SelectField, STATUS_COLORS, formatRs } from "./ui";

const API = process.env.REACT_APP_API_URL;

// Categorical slots in fixed order (validated: adjacent pairs CVD-safe; slots 3-5 are under
// 3:1 on white, so the growth chart also has a table view).
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const MAIN = SERIES[0];
const RECEDE = "#cbd5e1"; // "inactive" / "no order": the rest of the bar, not a series hue
const MAX_LINES = SERIES.length;
const MAX_BITS = 15;

const compactRs = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
};
const monthName = (ym, long = false) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" });
};
const escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const axisLabel = { color: CHART_TEXT.secondary, fontSize: 11 };
const valueAxis = {
  type: "value",
  axisLabel: { ...axisLabel, color: CHART_TEXT.muted },
  splitLine: { lineStyle: { color: CHART_TEXT.grid } },
  axisLine: { show: false },
  axisTick: { show: false },
};
const legend = { top: 0, left: "center", icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: CHART_TEXT.secondary, fontSize: 12 } };

function Empty({ text }) {
  return (
    <div className="flex h-36 flex-col items-center justify-center gap-1 text-[13px] text-slate-500">
      <Icon name="insights" className="text-[26px] text-slate-300" />
      {text}
    </div>
  );
}
Empty.propTypes = { text: PropTypes.string.isRequired };

// Two-way switch (chart / table).
function Toggle({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group">
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
Toggle.propTypes = { value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, options: PropTypes.arrayOf(PropTypes.object).isRequired };

// ---------- 1. Target vs achieved ----------

// One row per employee: achieved bar against the month target, with a tick where they should
// be by today. Status always shows an icon + word, the colour only backs it up.
function TargetRow({ emp }) {
  const hasTarget = emp.target > 0;
  const pct = hasTarget ? (emp.achieved / emp.target) * 100 : 0;
  const expectedPct = hasTarget ? Math.min((emp.targetToDate / emp.target) * 100, 100) : 0;
  const onTrack = hasTarget && emp.achieved >= emp.targetToDate;
  const status = !hasTarget ? null : emp.achieved >= emp.target
    ? { text: "Target met", icon: "check_circle", color: STATUS_COLORS.good }
    : onTrack
      ? { text: "On track", icon: "trending_up", color: STATUS_COLORS.good }
      : { text: "Behind", icon: "warning_amber", color: STATUS_COLORS.serious };
  const tip = hasTarget
    ? `${emp.name}: ${formatRs(emp.achieved)} of ${formatRs(emp.target)} (${pct.toFixed(1)}%). Expected by today: ${formatRs(emp.targetToDate)}. Orders: ${emp.orders}.`
    : `${emp.name}: ${formatRs(emp.achieved)} in ${emp.orders} orders. No target set for this company.`;

  return (
    <li className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50" title={tip}>
      <span className="truncate text-[13px] font-medium text-slate-800">{emp.name}</span>
      <span className="min-w-0">
        {hasTarget ? (
          <span className="relative block h-2.5 rounded-full bg-slate-100">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: MAIN }} />
            {/* where they should be by today */}
            <span className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-slate-700" style={{ left: `calc(${expectedPct}% - 1px)` }} />
          </span>
        ) : (
          <span className="block text-[12px] text-slate-400">No target set</span>
        )}
        <span className="mt-1 block text-[11.5px] tabular-nums text-slate-500">
          {formatRs(emp.achieved)}
          {hasTarget && <> of {formatRs(emp.target)} · {pct.toFixed(0)}%</>}
          {` · ${emp.orders} order${emp.orders === 1 ? "" : "s"}`}
        </span>
      </span>
      {status ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-slate-700">
          <span className="inline-flex" style={{ color: status.color }}><Icon name={status.icon} className="text-[16px]" /></span>
          {status.text}
        </span>
      ) : <span />}
    </li>
  );
}
TargetRow.propTypes = { emp: PropTypes.object.isRequired };

function TargetPanel({ company, data }) {
  const rows = company.employees;
  const withTarget = rows.filter((e) => e.target > 0);
  const totalAchieved = rows.reduce((s, e) => s + e.achieved, 0);
  const totalTarget = withTarget.reduce((s, e) => s + e.target, 0);
  const behind = withTarget.filter((e) => e.achieved < e.targetToDate).length;
  const subtitle = company.dailyTarget
    ? `${monthName(data.month, true)} · daily target ${formatRs(company.dailyTarget)} × ${data.workingDays} working days (Mon–Sat). Tick = where they should be today (day ${data.workingDaysToDate} of ${data.workingDays}).`
    : `${monthName(data.month, true)} · this company has no daily target, so only the achieved orders are shown.`;

  return (
    <Panel className="lg:col-span-2" icon="flag" title={`Target vs Achieved — ${company.name}`} subtitle={subtitle}>
      {rows.length ? (
        <>
          <div className="mb-2 grid grid-cols-1 gap-2 px-2 pt-1 sm:grid-cols-3">
            <KpiCard label="Achieved this month" value={formatRs(totalAchieved)} icon="shopping_cart" tone="blue" hint="Outlet orders, cancelled left out" />
            <KpiCard
              label="Month target" value={totalTarget ? formatRs(totalTarget) : "Not set"} icon="flag" tone="slate"
              hint={totalTarget ? `${((totalAchieved / totalTarget) * 100).toFixed(1)}% achieved` : "Set a daily target on the company"}
            />
            <KpiCard
              label="Employees behind" value={totalTarget ? `${behind} of ${withTarget.length}` : "—"} icon="warning_amber" tone={behind ? "amber" : "green"}
              hint={totalTarget ? "Below where they should be today" : ""} hintTone={behind ? "bad" : "good"}
            />
          </div>
          <ul className="m-0 max-h-[420px] list-none overflow-y-auto p-0 [scrollbar-width:thin]">
            {rows.map((emp) => <TargetRow key={emp.id} emp={emp} />)}
          </ul>
        </>
      ) : <Empty text="No employees in this company." />}
    </Panel>
  );
}
TargetPanel.propTypes = { company: PropTypes.object.isRequired, data: PropTypes.object.isRequired };

// ---------- 2. Distributors per company ----------

function DistributorsChart({ companies }) {
  const rows = useMemo(
    () => companies.filter((c) => c.distributors.total > 0).sort((a, b) => a.distributors.total - b.distributors.total),
    [companies]
  );
  const option = useMemo(() => ({
    legend,
    grid: { left: 8, right: 40, top: 30, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(15,23,42,0.04)" } },
      formatter: (params) => {
        const c = rows[params[0].dataIndex];
        return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(c.name)}</div>`
          + params.map((p) => `<div style="display:flex;justify-content:space-between;gap:16px">${p.marker}${p.seriesName}<b>${p.value}</b></div>`).join("")
          + `<div style="margin-top:4px;color:#475569">Total: <b>${c.distributors.total}</b></div>`;
      },
    },
    xAxis: { ...valueAxis, minInterval: 1 },
    yAxis: { type: "category", data: rows.map((c) => c.name), axisLabel: { ...axisLabel, width: 120, overflow: "truncate" }, axisLine: { show: false }, axisTick: { show: false } },
    series: [
      { name: "Active", type: "bar", stack: "d", data: rows.map((c) => c.distributors.active), barMaxWidth: 18, itemStyle: { color: MAIN, borderColor: "#fff", borderWidth: 1 } },
      {
        name: "Inactive", type: "bar", stack: "d", data: rows.map((c) => c.distributors.inactive), barMaxWidth: 18,
        itemStyle: { color: RECEDE, borderRadius: [0, 4, 4, 0], borderColor: "#fff", borderWidth: 1 },
        label: { show: true, position: "right", formatter: (p) => rows[p.dataIndex].distributors.total, color: CHART_TEXT.secondary, fontSize: 11 },
      },
    ],
  }), [rows]);
  if (!rows.length) return <Empty text="No distributors yet." />;
  return <EChart option={option} height={Math.max(160, rows.length * 34 + 40)} ariaLabel="Distributors per company, active and inactive" />;
}
DistributorsChart.propTypes = { companies: PropTypes.arrayOf(PropTypes.object).isRequired };

// ---------- 3. Outlets per bit ----------

function BitsChart({ company }) {
  const rows = useMemo(() => {
    const bits = company.outlets.bits;
    if (bits.length <= MAX_BITS) return bits;
    const rest = bits.slice(MAX_BITS - 1);
    return [...bits.slice(0, MAX_BITS - 1), { name: `Other ${rest.length} bits`, outlets: rest.reduce((s, b) => s + b.outlets, 0) }];
  }, [company]);
  const ordered = useMemo(() => [...rows].reverse(), [rows]);
  const option = useMemo(() => ({
    grid: { left: 8, right: 40, top: 4, bottom: 4, containLabel: true },
    tooltip: { trigger: "item", formatter: (p) => `<div style="font-weight:600;margin-bottom:2px">${escapeHtml(p.name)}</div>Outlets: <b>${p.value}</b>` },
    xAxis: { type: "value", show: false },
    yAxis: { type: "category", data: ordered.map((b) => b.name), axisLabel: { ...axisLabel, width: 130, overflow: "truncate" }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: "bar", data: ordered.map((b) => b.outlets), barMaxWidth: 16,
      itemStyle: { color: MAIN, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", color: CHART_TEXT.secondary, fontSize: 11 },
      emphasis: { itemStyle: { opacity: 0.85 } },
    }],
  }), [ordered]);
  if (!rows.length) return <Empty text="No outlets for this company." />;
  return <EChart option={option} height={Math.max(150, rows.length * 28 + 16)} ariaLabel={`Outlets per bit for ${company.name}`} />;
}
BitsChart.propTypes = { company: PropTypes.object.isRequired };

// ---------- 4. Outlet performance ----------

function OutletPerformanceChart({ companies }) {
  const rows = useMemo(
    () => companies.filter((c) => c.outlets.total > 0).sort((a, b) => a.outlets.total - b.outlets.total),
    [companies]
  );
  const option = useMemo(() => ({
    legend,
    grid: { left: 8, right: 56, top: 30, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(15,23,42,0.04)" } },
      formatter: (params) => {
        const c = rows[params[0].dataIndex];
        const share = c.outlets.total ? ((c.outlets.ordered / c.outlets.total) * 100).toFixed(1) : "0.0";
        return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(c.name)}</div>`
          + params.map((p) => `<div style="display:flex;justify-content:space-between;gap:16px">${p.marker}${p.seriesName}<b>${p.value}</b></div>`).join("")
          + `<div style="margin-top:4px;color:#475569">${share}% of ${c.outlets.total} outlets ordered</div>`;
      },
    },
    xAxis: { ...valueAxis, minInterval: 1 },
    yAxis: { type: "category", data: rows.map((c) => c.name), axisLabel: { ...axisLabel, width: 120, overflow: "truncate" }, axisLine: { show: false }, axisTick: { show: false } },
    series: [
      { name: "Ordered this month", type: "bar", stack: "o", data: rows.map((c) => c.outlets.ordered), barMaxWidth: 18, itemStyle: { color: MAIN, borderColor: "#fff", borderWidth: 1 } },
      {
        name: "No order yet", type: "bar", stack: "o", data: rows.map((c) => c.outlets.notOrdered), barMaxWidth: 18,
        itemStyle: { color: RECEDE, borderRadius: [0, 4, 4, 0], borderColor: "#fff", borderWidth: 1 },
        label: {
          show: true, position: "right", color: CHART_TEXT.secondary, fontSize: 11,
          formatter: (p) => {
            const c = rows[p.dataIndex];
            return c.outlets.total ? `${Math.round((c.outlets.ordered / c.outlets.total) * 100)}%` : "";
          },
        },
      },
    ],
  }), [rows]);
  if (!rows.length) return <Empty text="No outlets yet." />;
  return <EChart option={option} height={Math.max(160, rows.length * 34 + 40)} ariaLabel="Outlets that ordered this month, per company" />;
}
OutletPerformanceChart.propTypes = { companies: PropTypes.arrayOf(PropTypes.object).isRequired };

function TopOutletsTable({ company }) {
  const rows = company.outlets.top;
  if (!rows.length) return <Empty text="No outlet orders this month." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-2 py-2 font-semibold">#</th>
            <th className="px-2 py-2 font-semibold">Outlet</th>
            <th className="px-2 py-2 font-semibold">Bit</th>
            <th className="px-2 py-2 text-right font-semibold">Orders</th>
            <th className="px-2 py-2 text-right font-semibold">Order value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o, i) => (
            <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
              <td className="max-w-48 truncate px-2 py-1.5 font-medium text-slate-800" title={o.name}>{o.name}</td>
              <td className="max-w-32 truncate px-2 py-1.5 text-slate-500" title={o.bit}>{o.bit}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">{o.orders}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900">{formatRs(o.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
TopOutletsTable.propTypes = { company: PropTypes.object.isRequired };

// ---------- 5. Employee growth ----------

function GrowthPanel({ company, months }) {
  const [view, setView] = useState("chart");
  // Top employees by 6-month total; colours follow the employee (fixed by that order).
  const ranked = useMemo(
    () => company.employees
      .map((e) => ({ ...e, total: e.monthly.reduce((s, v) => s + v, 0) }))
      .filter((e) => e.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    [company]
  );
  const shown = ranked.slice(0, MAX_LINES);
  const labels = months.map((m) => monthName(m));

  const option = useMemo(() => ({
    legend: { ...legend, type: "scroll" },
    grid: { left: 8, right: 16, top: 36, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: CHART_TEXT.muted, type: "dashed" } },
      formatter: (params) => `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>`
        + [...params].sort((a, b) => b.value - a.value)
          .map((p) => `<div style="display:flex;justify-content:space-between;gap:16px">${p.marker}${escapeHtml(p.seriesName)}<b>${formatRs(p.value)}</b></div>`).join(""),
    },
    xAxis: { type: "category", data: labels, boundaryGap: false, axisLabel, axisLine: { lineStyle: { color: CHART_TEXT.grid } }, axisTick: { show: false } },
    yAxis: { ...valueAxis, axisLabel: { ...valueAxis.axisLabel, formatter: compactRs } },
    series: shown.map((e, i) => ({
      name: e.name,
      type: "line",
      data: e.monthly,
      symbol: "circle",
      symbolSize: 8,
      lineStyle: { width: 2 },
      itemStyle: { color: SERIES[i], borderColor: "#fff", borderWidth: 2 },
      emphasis: { focus: "series" },
      // Name at the end of each line, so identity is not colour alone.
      endLabel: { show: shown.length <= 4, formatter: (p) => p.seriesName, color: CHART_TEXT.secondary, fontSize: 11 },
    })),
  }), [shown, labels]);

  const more = ranked.length - shown.length;
  const subtitle = `Outlet orders per month, ${labels[0]} – ${labels[labels.length - 1]}${more > 0 ? ` · top ${shown.length} of ${ranked.length} employees (see the table for all)` : ""}`;

  return (
    <Panel
      className="lg:col-span-2" icon="show_chart" title={`Employee Growth — ${company.name}`} subtitle={subtitle}
      actions={ranked.length ? <Toggle value={view} onChange={setView} options={[{ value: "chart", label: "Chart" }, { value: "table", label: "Table" }]} /> : null}
    >
      {!ranked.length && <Empty text="No outlet orders in the last 6 months." />}
      {ranked.length > 0 && view === "chart" && <EChart option={option} height={320} ariaLabel={`Monthly outlet orders per employee for ${company.name}`} />}
      {ranked.length > 0 && view === "table" && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">Employee</th>
                {labels.map((l) => <th key={l} className="whitespace-nowrap px-2 py-2 text-right font-semibold">{l}</th>)}
                <th className="px-2 py-2 text-right font-semibold">vs last month</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((e, i) => {
                const [prev, cur] = e.monthly.slice(-2);
                const growth = prev > 0 ? ((cur - prev) / prev) * 100 : null;
                return (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="whitespace-nowrap px-2 py-1.5 font-medium text-slate-800">
                      <span className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: i < MAX_LINES ? SERIES[i] : RECEDE }} />
                      {e.name}
                    </td>
                    {e.monthly.map((v, j) => <td key={months[j]} className="px-2 py-1.5 text-right tabular-nums text-slate-700">{v ? compactRs(v) : "–"}</td>)}
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums text-slate-700">
                      {growth == null ? (cur > 0 ? "New" : "–") : (
                        <span className="inline-flex items-center gap-0.5">
                          <Icon name={growth >= 0 ? "trending_up" : "trending_down"} className="text-[15px]" />
                          {`${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
GrowthPanel.propTypes = { company: PropTypes.object.isRequired, months: PropTypes.arrayOf(PropTypes.string).isRequired };

// ---------- section ----------

function CompanyInsights({ companyId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(companyId || "");

  // Follow the dashboard's company filter when it changes.
  useEffect(() => { if (companyId) setPicked(companyId); }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`${API}/staff/reports/company-insights`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Unable to load the company insights.");
        if (!cancelled) setData(body);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const companies = useMemo(() => data?.companies || [], [data]);
  const options = useMemo(() => companies.map((c) => ({ value: String(c.id), label: c.name })), [companies]);
  // No company picked: the busiest one (most employees, then outlets).
  const company = useMemo(() => {
    if (!companies.length) return null;
    return companies.find((c) => String(c.id) === picked)
      || [...companies].sort((a, b) => b.employees.length - a.employees.length || b.outlets.total - a.outlets.total)[0];
  }, [companies, picked]);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 grow">
          <h2 className="m-0 text-[17px] font-semibold text-slate-900">Company Insights</h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">
            Company-wise targets, distributors, outlets and employee growth{data ? ` · ${monthName(data.month, true)}` : ""}. Orders = outlet orders (requisitions); cancelled orders are not counted.
          </p>
        </div>
        {options.length > 0 && (
          <SelectField label="Company" value={company ? String(company.id) : ""} onChange={setPicked} options={options} placeholder="Select company" className="min-w-48" />
        )}
        {loading && <span className="mb-2.5 size-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" aria-label="Loading" />}
      </div>

      {error && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          <Icon name="error_outline" className="text-[18px]" /> {error}
        </div>
      )}

      {data && company && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TargetPanel company={company} data={data} />

          <Panel icon="local_shipping" title="Distributors by Company" subtitle="All companies · active and inactive">
            <DistributorsChart companies={companies} />
          </Panel>

          <Panel
            icon="storefront" title={`Outlets by Bit — ${company.name}`}
            subtitle={`${company.outlets.total} outlets in ${company.outlets.bits.length} bit${company.outlets.bits.length === 1 ? "" : "s"}`}
          >
            <BitsChart company={company} />
          </Panel>

          <Panel icon="leaderboard" title="Outlet Performance by Company" subtitle={`All companies · outlets that placed an order in ${monthName(data.month, true)}; % = share that ordered`}>
            <OutletPerformanceChart companies={companies} />
          </Panel>

          <Panel
            icon="emoji_events" title={`Top Outlets — ${company.name}`}
            subtitle={`${company.outlets.ordered} of ${company.outlets.total} outlets ordered this month · top ${company.outlets.top.length} by order value`}
          >
            <TopOutletsTable company={company} />
          </Panel>

          <GrowthPanel company={company} months={data.months} />
        </div>
      )}
    </section>
  );
}

CompanyInsights.propTypes = { companyId: PropTypes.string };
CompanyInsights.defaultProps = { companyId: "" };

export default CompanyInsights;
