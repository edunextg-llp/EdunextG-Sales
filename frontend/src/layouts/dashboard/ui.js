// Dashboard building blocks: plain Tailwind CSS (no MUI, no daisyUI) + Apache ECharts.
import { useMemo } from "react";
import PropTypes from "prop-types";
import EChart, { CHART_TEXT } from "components/EChart";

export const COMPANY_NAME = "Bawarchee Food Packaging";

// Payment modes: fixed categorical order (validated: CVD-safe for 3 series, both modes).
// Slot 3 is below 3:1 on white, so every chart also shows the values as text.
export const MODE_COLORS = { cash: "#2a78d6", upi: "#eb6834", cheque: "#1baf7a" };
const MODE_ORDER = [
  { key: "cash", label: "Cash" },
  { key: "online", label: "Online", colorKey: "upi" },
  { key: "cheque", label: "Cheque" },
];
// Status colours are reserved for state and always come with an icon + label.
export const STATUS_COLORS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };

const rs = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Axis ticks: 1.2L / 35K style so the axis stays quiet.
const compactRs = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
};
export const formatRs = rs;

export function Icon({ name, className }) {
  return <span className={`material-icons-round leading-none ${className}`} aria-hidden="true">{name}</span>;
}
Icon.propTypes = { name: PropTypes.string.isRequired, className: PropTypes.string };
Icon.defaultProps = { className: "text-[20px]" };

// ---------------------------------------------------------------------------------------------
// Form controls
const controlClass = "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export function SelectField({ label, value, onChange, options, placeholder, disabled, className }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select className={`${controlClass} pr-7`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
SelectField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })).isRequired,
  placeholder: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
  className: PropTypes.string,
};
SelectField.defaultProps = { disabled: false, className: "min-w-40" };

export function DateField({ label, value, onChange, min, invalid }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="date" className={`${controlClass} w-36 ${invalid ? "border-red-400 ring-2 ring-red-500/20" : ""}`}
        value={value} min={min || undefined} onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
DateField.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, min: PropTypes.string, invalid: PropTypes.bool };
DateField.defaultProps = { min: "", invalid: false };

export function IconAction({ icon, title, onClick, disabled, tone }) {
  const tones = { dark: "bg-slate-800 hover:bg-slate-900", blue: "bg-blue-600 hover:bg-blue-700" };
  return (
    <button
      type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={`mt-auto inline-flex size-9 items-center justify-center rounded-lg text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  );
}
IconAction.propTypes = { icon: PropTypes.string.isRequired, title: PropTypes.string.isRequired, onClick: PropTypes.func.isRequired, disabled: PropTypes.bool, tone: PropTypes.oneOf(["dark", "blue"]) };
IconAction.defaultProps = { disabled: false, tone: "dark" };

// ---------------------------------------------------------------------------------------------
// Layout pieces
export function Panel({ title, subtitle, icon, actions, loading, children, className }) {
  return (
    <section className={`flex flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 pb-3 pt-4">
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon name={icon} className="text-[19px]" />
          </span>
        )}
        <div className="min-w-0 grow">
          <h3 className="m-0 truncate text-[15px] font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">{subtitle}</p>}
        </div>
        {loading && <span className="mt-1 size-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" aria-label="Loading" />}
      </header>
      {actions && <div className="flex flex-wrap items-end gap-2 px-5 pt-3">{actions}</div>}
      <div className="grow px-3 pb-3 pt-2">{children}</div>
    </section>
  );
}
Panel.propTypes = { title: PropTypes.string.isRequired, subtitle: PropTypes.node, icon: PropTypes.string, actions: PropTypes.node, loading: PropTypes.bool, children: PropTypes.node.isRequired, className: PropTypes.string };
Panel.defaultProps = { subtitle: null, icon: "", actions: null, loading: false, className: "" };

// KPI tile. tone colours only the small icon chip; the number stays in ink.
const KPI_TONES = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  slate: "bg-slate-100 text-slate-700",
  violet: "bg-violet-50 text-violet-700",
};
export function KpiCard({ label, value, hint, icon, tone, onClick, hintTone }) {
  const Tag = onClick ? "button" : "div";
  const hintColor = { muted: "text-slate-500", good: "text-emerald-700", bad: "text-red-700" }[hintTone];
  return (
    <Tag
      type={onClick ? "button" : undefined} onClick={onClick}
      className={`group flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${onClick ? "cursor-pointer transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md" : ""}`}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${KPI_TONES[tone]}`}>
        <Icon name={icon} className="text-[20px]" />
      </span>
      <span className="min-w-0 grow">
        <span className="block text-[12px] font-medium text-slate-500">{label}</span>
        <span className="mt-0.5 block truncate text-[19px] font-bold tabular-nums tracking-tight text-slate-900">{value}</span>
        {hint && (
          <span className={`mt-0.5 flex items-center gap-1 text-[11.5px] ${hintColor}`}>
            {hint}
            {onClick && <Icon name="arrow_forward" className="text-[14px] opacity-0 transition group-hover:opacity-100" />}
          </span>
        )}
      </span>
    </Tag>
  );
}
KpiCard.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.node.isRequired, hint: PropTypes.string, icon: PropTypes.string.isRequired, tone: PropTypes.oneOf(Object.keys(KPI_TONES)), onClick: PropTypes.func, hintTone: PropTypes.oneOf(["muted", "good", "bad"]) };
KpiCard.defaultProps = { hint: "", tone: "slate", onClick: null, hintTone: "muted" };

// New bill collection vs collection against old credit bills.
export function CollectionSplit({ split }) {
  const data = split || {};
  const items = [
    { label: "New bill collection", amount: data.new_bill_amount, count: data.new_bill_count, cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    { label: "Old credit bill collection", amount: data.old_credit_amount, count: data.old_credit_count, cls: "border-orange-200 bg-orange-50 text-orange-800" },
  ];
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className={`rounded-xl border px-3 py-2 ${item.cls}`}>
          <div className="text-[11px] font-semibold">{item.label}</div>
          <div className="text-[13px] font-bold tabular-nums">{rs(item.amount)}</div>
          <div className="text-[11px]">{Number(item.count || 0)} bill{Number(item.count) === 1 ? "" : "s"}</div>
        </div>
      ))}
    </div>
  );
}
CollectionSplit.propTypes = { split: PropTypes.object };
CollectionSplit.defaultProps = { split: null };

// ---------------------------------------------------------------------------------------------
// Charts (Apache ECharts)
const axisCommon = {
  axisLine: { lineStyle: { color: CHART_TEXT.grid } },
  axisTick: { show: false },
  axisLabel: { color: CHART_TEXT.secondary, fontSize: 11 },
  splitLine: { lineStyle: { color: "#f1f5f9" } },
};

// Monthly invoice value: one series, so no legend; the title names it.
export function MonthlySalesChart({ dataset }) {
  const option = useMemo(() => ({
    grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(42,120,214,0.06)" } },
      formatter: (params) => `<div style="font-weight:600;margin-bottom:2px">${params[0].axisValue}</div>Sales: <b>${rs(params[0].value)}</b>`,
    },
    xAxis: { type: "category", data: dataset.map((d) => d.month), ...axisCommon },
    yAxis: { type: "value", ...axisCommon, axisLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, formatter: compactRs } },
    series: [{
      type: "bar", name: "Sales", data: dataset.map((d) => d.sales), barMaxWidth: 28,
      itemStyle: { color: MODE_COLORS.cash, borderRadius: [4, 4, 0, 0] },
      emphasis: { itemStyle: { color: "#1c5cab" } },
    }],
  }), [dataset]);
  return <EChart option={option} height={270} ariaLabel="Monthly sales bar chart" />;
}
MonthlySalesChart.propTypes = { dataset: PropTypes.arrayOf(PropTypes.object).isRequired };

// Cash / Online / Cheque donut + value list (values always visible as text).
export function PaymentModeDonut({ data }) {
  const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const option = useMemo(() => ({
    tooltip: { trigger: "item", formatter: (p) => `${p.marker}${p.name}: <b>${rs(p.value)}</b> (${p.percent}%)` },
    series: [{
      type: "pie", radius: ["58%", "82%"], center: ["50%", "50%"], avoidLabelOverlap: true,
      padAngle: 2, itemStyle: { borderRadius: 4, borderColor: "#fff", borderWidth: 2 },
      label: { show: false }, labelLine: { show: false },
      emphasis: { scale: true, scaleSize: 4 },
      data: total > 0
        ? data.map((d) => ({ name: d.label, value: Number(d.value) || 0, itemStyle: { color: d.color } }))
        : [{ name: "No collection", value: 1, itemStyle: { color: "#e2e8f0" }, tooltip: { show: false } }],
    }],
  }), [data, total]);
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <div className="relative w-44 shrink-0">
        <EChart option={option} height={176} ariaLabel="Collection by payment mode" />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-slate-500">Total</span>
          <span className="text-[14px] font-bold tabular-nums text-slate-900">{compactRs(total)}</span>
        </div>
      </div>
      <ul className="m-0 w-full list-none space-y-1.5 p-0">
        {data.map((item) => {
          const share = total > 0 ? Math.round(((Number(item.value) || 0) / total) * 100) : 0;
          return (
            <li key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="grow text-[13px] text-slate-600">{item.label}</span>
              <span className="text-[13px] font-semibold tabular-nums text-slate-900">{rs(item.value)}</span>
              <span className="w-9 text-right text-[11.5px] tabular-nums text-slate-500">{share}%</span>
            </li>
          );
        })}
        <li className="flex items-center gap-2 border-t border-slate-100 px-2 pt-2">
          <span className="grow text-[13px] font-semibold text-slate-700">Total</span>
          <span className="text-[13px] font-bold tabular-nums text-slate-900">{rs(total)}</span>
          <span className="w-9" />
        </li>
      </ul>
    </div>
  );
}
PaymentModeDonut.propTypes = { data: PropTypes.arrayOf(PropTypes.object).isRequired };

// Collection split by mode over periods: stacked bars, legend + total in the tooltip.
function stackedCollectionOption(rows, labelOf, horizontal) {
  const categories = rows.map(labelOf);
  const series = MODE_ORDER.map((mode, index) => ({
    type: "bar",
    name: mode.label,
    stack: "collection",
    barMaxWidth: horizontal ? 22 : 30,
    data: rows.map((r) => Number(r[mode.key]) || 0),
    itemStyle: {
      color: MODE_COLORS[mode.colorKey || mode.key],
      borderColor: "#fff",
      borderWidth: 1,
      // round only the outer end of the stack
      borderRadius: index === MODE_ORDER.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0,
    },
    emphasis: { focus: "series" },
  }));
  const valueAxis = { type: "value", ...axisCommon, axisLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, formatter: compactRs } };
  const categoryAxis = { type: "category", data: categories, ...axisCommon };
  return {
    legend: { top: 0, left: "center", icon: "roundRect", itemWidth: 10, itemHeight: 10, textStyle: { color: CHART_TEXT.secondary, fontSize: 12 } },
    grid: { left: 8, right: 16, top: 36, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(15,23,42,0.04)" } },
      formatter: (params) => {
        const total = params.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
        const lines = params.map((p) => `<div style="display:flex;justify-content:space-between;gap:16px">${p.marker}${p.seriesName}<b>${rs(p.value)}</b></div>`).join("");
        return `<div style="font-weight:600;margin-bottom:4px">${params[0].axisValue}</div>${lines}<div style="display:flex;justify-content:space-between;gap:16px;border-top:1px solid #e2e8f0;margin-top:4px;padding-top:4px"><b>Total</b><b>${rs(total)}</b></div>`;
      },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series,
  };
}

export function CollectionByPeriodChart({ rows, labelOf, horizontal, height }) {
  const normalized = useMemo(() => rows.map((row) => ({
    ...row,
    cash: Number(row.cash_amount) || 0,
    online: Number(row.upi_amount) || 0,
    cheque: Number(row.cheque_amount) || 0,
  })), [rows]);
  const option = useMemo(() => stackedCollectionOption(normalized, labelOf, horizontal), [normalized, labelOf, horizontal]);
  return <EChart option={option} height={height} ariaLabel="Collection by payment mode over time" />;
}
CollectionByPeriodChart.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired, labelOf: PropTypes.func.isRequired, horizontal: PropTypes.bool, height: PropTypes.number };
CollectionByPeriodChart.defaultProps = { horizontal: false, height: 320 };

// Delivered / pending / cancelled sales: status bars with icon + label (never colour alone).
export function SalesStatusBars({ delivered, pending, cancelled, total }) {
  const items = [
    { label: "Delivered", value: delivered, color: STATUS_COLORS.good, icon: "check_circle" },
    { label: "Pending delivery", value: pending, color: STATUS_COLORS.warning, icon: "schedule" },
    { label: "Cancelled", value: cancelled, color: STATUS_COLORS.critical, icon: "cancel" },
  ];
  const base = Math.max(Number(total) || 0, ...items.map((i) => Number(i.value) || 0), 1);
  return (
    <ul className="m-0 list-none space-y-4 p-0 pt-1">
      {items.map((item) => {
        const share = Math.round(((Number(item.value) || 0) / base) * 100);
        return (
          <li key={item.label} title={`${item.label}: ${rs(item.value)} (${share}% of total sales)`}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Icon name={item.icon} className="text-[16px] text-slate-500" />
              <span className="grow text-[13px] text-slate-600">{item.label}</span>
              <span className="text-[13px] font-semibold tabular-nums text-slate-900">{rs(item.value)}</span>
              <span className="w-10 text-right text-[11.5px] tabular-nums text-slate-500">{share}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, backgroundColor: item.color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
SalesStatusBars.propTypes = { delivered: PropTypes.number, pending: PropTypes.number, cancelled: PropTypes.number, total: PropTypes.number };
SalesStatusBars.defaultProps = { delivered: 0, pending: 0, cancelled: 0, total: 0 };

// Weekly sales trend: one series area line with a crosshair tooltip (latest weeks).
export function WeeklySalesTrend({ rows }) {
  const data = useMemo(() => rows.slice(-16), [rows]);
  const option = useMemo(() => {
    const label = (period) => {
      const [y, m, d] = String(period).split("-");
      return d ? `${d}/${m}` : String(period || y);
    };
    return {
      grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: CHART_TEXT.muted, type: "dashed" } },
        formatter: (p) => `<div style="font-weight:600;margin-bottom:2px">Week of ${p[0].axisValue}</div>Sales: <b>${rs(p[0].value)}</b><br/>Invoices: <b>${data[p[0].dataIndex]?.count ?? 0}</b>`,
      },
      xAxis: { type: "category", boundaryGap: false, data: data.map((r) => label(r.period)), ...axisCommon },
      yAxis: { type: "value", ...axisCommon, axisLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, formatter: compactRs } },
      series: [{
        type: "line", name: "Sales", smooth: 0.3, data: data.map((r) => Number(r.total_sales) || 0),
        symbol: "circle", symbolSize: 8, showSymbol: false,
        lineStyle: { width: 2, color: MODE_COLORS.cash },
        itemStyle: { color: MODE_COLORS.cash, borderColor: "#fff", borderWidth: 2 },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: "rgba(42,120,214,0.22)" }, { offset: 1, color: "rgba(42,120,214,0)" }],
          },
        },
      }],
    };
  }, [data]);
  if (!data.length) return <EmptyChart text="No sales in this period." />;
  return <EChart option={option} height={260} ariaLabel="Weekly sales trend" />;
}
WeeklySalesTrend.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired };

// Ranked horizontal bars (one series): staff / company by sales value. Values sit at the bar end.
export function RankedBars({ rows, nameKey, valueKey, countKey, limit, color }) {
  const top = useMemo(
    () => [...rows].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0)).slice(0, limit),
    [rows, valueKey, limit]
  );
  const option = useMemo(() => {
    const ordered = [...top].reverse(); // biggest at the top
    return {
      grid: { left: 8, right: 70, top: 4, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "item",
        formatter: (p) => `<div style="font-weight:600;margin-bottom:2px">${p.name}</div>Sales: <b>${rs(p.value)}</b>${countKey ? `<br/>Invoices: <b>${ordered[p.dataIndex]?.[countKey] ?? 0}</b>` : ""}`,
      },
      xAxis: { type: "value", show: false },
      yAxis: {
        type: "category", data: ordered.map((r) => r[nameKey] || "-"), ...axisCommon,
        axisLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, width: 120, overflow: "truncate" },
      },
      series: [{
        type: "bar", data: ordered.map((r) => Number(r[valueKey]) || 0), barMaxWidth: 16,
        itemStyle: { color, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", formatter: (p) => compactRs(p.value), color: CHART_TEXT.secondary, fontSize: 11 },
        emphasis: { itemStyle: { opacity: 0.85 } },
      }],
    };
  }, [top, nameKey, valueKey, countKey, color]);
  if (!top.length) return <EmptyChart text="No sales in this period." />;
  return <EChart option={option} height={Math.max(150, top.length * 30 + 20)} ariaLabel="Ranked sales bars" />;
}
RankedBars.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  nameKey: PropTypes.string.isRequired,
  valueKey: PropTypes.string.isRequired,
  countKey: PropTypes.string,
  limit: PropTypes.number,
  color: PropTypes.string,
};
RankedBars.defaultProps = { countKey: "", limit: 8, color: MODE_COLORS.cash };

// Credit ageing (open credit 1-30 days old): ordinal blue ramp, older = darker (validated ordinal ramp).
const AGE_BUCKETS = [
  { label: "1-7 days", max: 7, color: "#86b6ef" },
  { label: "8-14 days", max: 14, color: "#3987e5" },
  { label: "15-21 days", max: 21, color: "#256abf" },
  { label: "22-30 days", max: 30, color: "#104281" },
];
export function CreditAgeingChart({ dues }) {
  const buckets = useMemo(() => {
    const seen = new Set();
    const sums = AGE_BUCKETS.map((b) => ({ ...b, amount: 0, count: 0 }));
    dues.forEach((row) => {
      if (seen.has(row.sale_id)) return; // one open balance per invoice
      seen.add(row.sale_id);
      const age = Number(row.credit_age_days) || 0;
      const bucket = sums.find((b) => age <= b.max);
      if (!bucket) return;
      bucket.amount += Number(row.balance_amount) || 0;
      bucket.count += 1;
    });
    return sums;
  }, [dues]);
  const option = useMemo(() => ({
    grid: { left: 8, right: 12, top: 24, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (p) => `<div style="font-weight:600;margin-bottom:2px">${p.name}</div>Open credit: <b>${rs(p.value)}</b><br/>Invoices: <b>${buckets[p.dataIndex].count}</b>`,
    },
    xAxis: { type: "category", data: buckets.map((b) => b.label), ...axisCommon },
    yAxis: { type: "value", ...axisCommon, axisLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, formatter: compactRs } },
    series: [{
      type: "bar", barMaxWidth: 40,
      data: buckets.map((b) => ({ value: b.amount, itemStyle: { color: b.color, borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: "top", formatter: (p) => (p.value ? compactRs(p.value) : ""), color: CHART_TEXT.secondary, fontSize: 11 },
    }],
  }), [buckets]);
  if (!buckets.some((b) => b.count)) return <EmptyChart text="No open credit between 1 and 30 days." />;
  return <EChart option={option} height={240} ariaLabel="Credit ageing" />;
}
CreditAgeingChart.propTypes = { dues: PropTypes.arrayOf(PropTypes.object).isRequired };

// Pending cheques by deposit status: status colour + icon + label, never colour alone.
const CHEQUE_STATUSES = [
  { key: "missed", label: "Missed / not deposited", icon: "error", color: STATUS_COLORS.critical, match: (s) => s === "missed" || s === "clearing_done" },
  { key: "due_today", label: "Due today", icon: "warning", color: STATUS_COLORS.serious, match: (s) => s === "due_today" },
  { key: "alarm", label: "Due in 2 days", icon: "notifications_active", color: STATUS_COLORS.warning, match: (s) => s === "alarm" },
  { key: "upcoming", label: "Upcoming", icon: "event", color: "#94a3b8", match: () => true },
];
export function ChequeStatusList({ cheques, onOpen }) {
  const groups = useMemo(() => {
    const sums = CHEQUE_STATUSES.map((s) => ({ ...s, count: 0, amount: 0 }));
    cheques.forEach((row) => {
      const group = sums.find((s) => s.match(row.report_status));
      group.count += 1;
      group.amount += Number(row.amount) || 0;
    });
    return sums;
  }, [cheques]);
  const max = Math.max(1, ...groups.map((g) => g.count));
  return (
    <div className="space-y-3 px-2 pt-1">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-1 flex items-center gap-1.5">
            <Icon name={g.icon} className="text-[16px] text-slate-500" />
            <span className="grow text-[13px] text-slate-600">{g.label}</span>
            <span className="text-[13px] font-semibold tabular-nums text-slate-900">{g.count}</span>
            <span className="w-28 text-right text-[11.5px] tabular-nums text-slate-500">{rs(g.amount)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(g.count / max) * 100}%`, backgroundColor: g.color }} />
          </div>
        </div>
      ))}
      <button type="button" onClick={onOpen} className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-700 hover:text-blue-900">
        View all cheques <Icon name="arrow_forward" className="text-[15px]" />
      </button>
    </div>
  );
}
ChequeStatusList.propTypes = { cheques: PropTypes.arrayOf(PropTypes.object).isRequired, onOpen: PropTypes.func.isRequired };

function EmptyChart({ text }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-1 text-slate-400">
      <Icon name="insights" className="text-[28px]" />
      <span className="text-[12.5px]">{text}</span>
    </div>
  );
}
EmptyChart.propTypes = { text: PropTypes.string.isRequired };
