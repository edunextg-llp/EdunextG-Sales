import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Skeleton from "@mui/material/Skeleton";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { BarChart } from "@mui/x-charts/BarChart";
import { PieChart } from "@mui/x-charts/PieChart";
import { MdArrowDownward, MdArrowUpward, MdCheckCircle, MdError, MdFileDownload, MdInventory2, MdRefresh, MdShoppingCart, MdWarning } from "react-icons/md";
import { downloadExcel } from "../utils/excel";
import { apiFetch } from "../auth";
import { COMPANY_TYPES, readJson, useCompanies } from "../components/ui";
import { DashboardFilters, DashboardSectionHeading, DashboardSelect, Panel, StatTile, dashboardActionClass } from "../components/DashboardCards";
import { todayLocal } from "../utils/purchaseCalc";
import PurchaseDashboard from "./PurchaseDashboard";
import ItemStockInsights from "./ItemStockInsights";

// ---------------------------------------------------------------------------
// Colours (dataviz reference palette, validated on the card surface).
// Categorical slots follow the company (fixed by company id order), never its rank.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const ITEM_SALES_COLORS = [...SERIES, "#007b85", "#a75417"];
const SINGLE = SERIES[0]; // one-series bars
const OTHER = "#898781";
const STATUS = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" };
const INK = { primary: "#0f172a", secondary: "#475569", muted: "#64748b", grid: "#e2e8f0" };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});
const count = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const monthKey = (date) => String(date || "").slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};
const lastMonths = (n) => {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
};

// A product is out of stock at 0 pcs, and low when less than one box is left.
const stockState = (item) => {
  const pcs = Number(item.total_current_stock_in_pcs) || 0;
  const perBox = Number(item.pcs_per_box) || 0;
  if (pcs <= 0) return "out";
  if (perBox > 0 && pcs < perBox) return "low";
  return "in";
};

// ---------------------------------------------------------------------------
// Data: current stock for every company + all purchase invoices.

function useDashboardData(companies) {
  const [stock, setStock] = useState({}); // companyId -> { items, summary } | { error }
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    if (!companies.length) return;
    setLoading(true);
    const stockResults = await Promise.all(
      companies.map(async (c) => {
        try {
          const params = new URLSearchParams({ companyName: c.name, allowMissing: "1" });
          const res = await apiFetch(`/staff/current-stock?${params}`);
          const data = await readJson(res);
          if (!res.ok || data.error || !Array.isArray(data.items)) {
            return [c.id, { error: data.error || "No stock", status: res.status }];
          }
          return [c.id, { items: data.items, summary: data.import || {} }];
        } catch {
          return [c.id, { error: "Network error" }];
        }
      })
    );
    setStock(Object.fromEntries(stockResults));
    try {
      const data = await readJson(await apiFetch("/staff/dms-stock/imports"));
      setImports(Array.isArray(data.imports) ? data.imports : []);
    } catch {
      setImports([]);
    }
    setLoading(false);
    setLoadedOnce(true);
  }, [companies]);

  useEffect(() => {
    load();
  }, [load]);

  return { stock, imports, loading, loadedOnce, reload: load };
}

// ---------------------------------------------------------------------------
// Small pieces

function Delta({ current, previous }) {
  if (!previous) return <span>No purchases last month</span>;
  const change = ((current - previous) / previous) * 100;
  const up = change >= 0;
  return (
    <Box component="span" display="inline-flex" alignItems="center" gap={0.25}>
      <Box component="span" sx={{ display: "flex", color: up ? "#006300" : STATUS.critical }}>
        {up ? <MdArrowUpward size={14} /> : <MdArrowDownward size={14} />}
      </Box>
      <b style={{ color: INK.primary }}>{Math.abs(change).toFixed(1)}%</b>&nbsp;vs last month ({inrCompact.format(previous)})
    </Box>
  );
}

function Empty({ children }) {
  return (
    <Box py={6} textAlign="center">
      <Typography variant="body2" color={INK.secondary}>
        {children}
      </Typography>
    </Box>
  );
}

// One whole split into parts, at a glance (used when a single company is selected).
function SegmentedBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <Empty>No items.</Empty>;
  return (
    <Box>
      <Box display="flex" gap="2px" height={44} borderRadius={1} overflow="hidden">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => {
            const share = (p.value / total) * 100;
            return (
              <Tooltip key={p.label} title={`${p.label}: ${count.format(p.value)} items (${share.toFixed(0)}%)`}>
                <Box
                  sx={{
                    flexBasis: `${share}%`,
                    bgcolor: p.color,
                    color: p.ink,
                    display: "flex",
                    alignItems: "center",
                    px: 1,
                    fontSize: 13,
                    fontWeight: 600,
                    minWidth: 4,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                  }}
                >
                  {share >= 12 ? `${count.format(p.value)}` : ""}
                </Box>
              </Tooltip>
            );
          })}
      </Box>
      <Legend items={parts.map((p) => ({ label: `${p.label} · ${count.format(p.value)}`, color: p.color }))} />
    </Box>
  );
}

function Legend({ items }) {
  return (
    <Box display="flex" flexWrap="wrap" gap={2} mt={1.5}>
      {items.map((it) => (
        <Box key={it.label} display="flex" alignItems="center" gap={0.75}>
          <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: it.color }} />
          <Typography variant="caption" color={INK.secondary}>
            {it.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

const chartSx = {
  "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: "#c3c2b7 !important" },
  "& .MuiChartsAxis-tickLabel": { fill: `${INK.muted} !important`, fontSize: "12px !important" },
  "& .MuiChartsGrid-line": { stroke: INK.grid },
};

const noLegend = { legend: { hidden: true } };
const filterSx = { bgcolor: "#fff", minWidth: 180 };

// ---------------------------------------------------------------------------

function StockDashboard({ user }) {
  const companies = useCompanies();
  const sortedCompanies = useMemo(() => [...companies].sort((a, b) => a.id - b.id), [companies]);
  const { stock, imports, loading, loadedOnce, reload } = useDashboardData(sortedCompanies);

  const [type, setType] = useState("all");
  const [companyId, setCompanyId] = useState("all");
  const [months, setMonths] = useState(6);
  const [listTab, setListTab] = useState("out");

  // Fixed colour per company (by id order), so filtering never repaints anyone.
  const colorOf = useMemo(() => {
    const map = new Map();
    sortedCompanies.forEach((c, i) => map.set(c.id, i < SERIES.length ? SERIES[i] : OTHER));
    return (id) => map.get(id) || OTHER;
  }, [sortedCompanies]);

  const scoped = sortedCompanies.filter(
    (c) => (type === "all" || c.type === type) && (companyId === "all" || String(c.id) === String(companyId))
  );
  const single = companyId !== "all";

  // Per-company stock figures
  const rows = useMemo(
    () =>
      scoped.map((c) => {
        const s = stock[c.id];
        const items = s?.items || [];
        const states = items.map(stockState);
        return {
          company: c,
          available: Boolean(s?.items),
          error: s?.error,
          status: s?.status,
          items,
          value: Number(s?.summary?.totalValue) || items.reduce((t, it) => t + (Number(it.total_value) || 0), 0),
          pieces: Number(s?.summary?.totalPieces) || 0,
          inStock: states.filter((x) => x === "in").length,
          low: states.filter((x) => x === "low").length,
          out: states.filter((x) => x === "out").length,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stock, type, companyId, sortedCompanies]
  );
  const withStock = rows.filter((r) => r.available);
  const totals = withStock.reduce(
    (t, r) => ({
      value: t.value + r.value,
      pieces: t.pieces + r.pieces,
      items: t.items + r.items.length,
      inStock: t.inStock + r.inStock,
      low: t.low + r.low,
      out: t.out + r.out,
    }),
    { value: 0, pieces: 0, items: 0, inStock: 0, low: 0, out: 0 }
  );

  // Purchases by month (growth)
  const monthKeys = useMemo(() => lastMonths(months), [months]);
  const scopedIds = new Set(scoped.map((c) => c.id));
  const purchaseImports = imports.filter((imp) => scopedIds.has(imp.company_id));
  const purchaseByCompany = scoped.map((c) => ({
    company: c,
    data: monthKeys.map((k) =>
      purchaseImports
        .filter((imp) => imp.company_id === c.id && monthKey(imp.upload_date) === k)
        .reduce((t, imp) => t + (Number(imp.total_value) || 0), 0)
    ),
  }));
  const purchaseSeries = purchaseByCompany.filter((p) => p.data.some((v) => v > 0));
  const monthTotals = monthKeys.map((_, i) => purchaseByCompany.reduce((t, p) => t + p.data[i], 0));
  const thisMonth = monthTotals[monthTotals.length - 1] || 0;
  const lastMonth = monthTotals[monthTotals.length - 2] || 0;
  const periodTotal = monthTotals.reduce((a, b) => a + b, 0);

  // Item lists
  const allItems = withStock.flatMap((r) => r.items.map((it) => ({ ...it, company: r.company })));
  const outItems = allItems.filter((it) => stockState(it) === "out");
  const lowItems = allItems
    .filter((it) => stockState(it) === "low")
    .sort((a, b) => Number(a.total_current_stock_in_pcs) - Number(b.total_current_stock_in_pcs));
  const topItems = [...allItems]
    .filter((it) => Number(it.total_value) > 0)
    .sort((a, b) => Number(b.total_value) - Number(a.total_value))
    .slice(0, 10);
  const listItems = listTab === "out" ? outItems : lowItems;

  const byValue = [...withStock].sort((a, b) => b.value - a.value);
  const byHealth = [...withStock].sort((a, b) => b.items.length - a.items.length);
  const noAccess = loadedOnce && rows.length > 0 && rows.every((r) => r.error && [401, 403].includes(r.status));


  const [exporting, setExporting] = useState(false);
  const exportReport = async () => {
    setExporting(true);
    const stateLabel = { in: "In stock", low: "Low", out: "Out of stock" };
    const itemColumns = [
      { header: "Sr No", width: 7, type: "number", value: (_, i) => i + 1 },
      { header: "Company", width: 22, value: (it) => it.company.name },
      { header: "Product ERP ID", key: "product_erp_id", width: 18 },
      { header: "SKU Name", key: "product_name", width: 30 },
      { header: "Variant", key: "variant_name", width: 28 },
      { header: "Status", width: 12, value: (it) => stateLabel[stockState(it)] },
      { header: "Pcs / Box", key: "pcs_per_box", width: 9, type: "number" },
      { header: "Physical Pcs", key: "total_physical_stock_in_pcs", width: 11, type: "number", total: true },
      { header: "DMS Pcs", key: "total_dms_stock_in_pcs", width: 10, type: "number", total: true },
      { header: "Current Pcs", key: "total_current_stock_in_pcs", width: 11, type: "number", total: true },
      { header: "Price / Pc", key: "price_per_piece", width: 11, type: "rate" },
      { header: "MRP", key: "mrp", width: 10, type: "money" },
      { header: "Stock Value", key: "total_value", width: 13, type: "money", total: true },
    ];
    const scopeLabel = single
      ? scoped[0]?.name
      : type === "all"
        ? "All companies"
        : COMPANY_TYPES.find((t) => t.value === type)?.label;
    try {
      await downloadExcel({
        fileName: `DMS_Dashboard_${String(scopeLabel || "").replace(/[^A-Za-z0-9]+/g, "_")}`,
        title: `DMS stock report · ${scopeLabel}`,
        sheets: [
          {
            name: "Company summary",
            rows,
            columns: [
              { header: "Company", width: 26, value: (r) => r.company.name },
              { header: "Type", width: 12, value: (r) => COMPANY_TYPES.find((t) => t.value === r.company.type)?.label },
              { header: "Items", width: 8, type: "number", total: true, value: (r) => (r.available ? r.items.length : null) },
              { header: "In Stock", width: 9, type: "number", total: true, value: (r) => (r.available ? r.inStock : null) },
              { header: "Low", width: 8, type: "number", total: true, value: (r) => (r.available ? r.low : null) },
              { header: "Out of Stock", width: 11, type: "number", total: true, value: (r) => (r.available ? r.out : null) },
              { header: "Pieces", width: 11, type: "number", total: true, value: (r) => (r.available ? r.pieces : null) },
              { header: "Stock Value", width: 14, type: "money", total: true, value: (r) => (r.available ? r.value : null) },
              {
                header: `Purchases (${months} months)`,
                width: 15,
                type: "money",
                total: true,
                value: (r) => purchaseByCompany.find((p) => p.company.id === r.company.id)?.data.reduce((a, b) => a + b, 0) || 0,
              },
              { header: "Note", width: 40, value: (r) => (r.available ? "" : r.error || "No current stock") },
            ],
          },
          { name: "Out of stock", rows: outItems, columns: itemColumns },
          { name: "Low stock", rows: lowItems, columns: itemColumns },
          { name: "All current stock", rows: allItems, columns: itemColumns },
          {
            name: "Purchases by month",
            rows: monthKeys.map((k, i) => ({ k, i })),
            columns: [
              { header: "Month", width: 12, value: (m) => monthLabel(m.k) },
              ...purchaseByCompany.map((p) => ({
                header: p.company.name,
                width: 16,
                type: "money",
                total: true,
                value: (m) => p.data[m.i],
              })),
              { header: "Total", width: 16, type: "money", total: true, value: (m) => monthTotals[m.i] },
            ],
          },
        ],
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box>
      <DashboardFilters>
        <DashboardSelect label="Company type" value={type} onChange={(value) => { setType(value); setCompanyId("all"); }}>
          <option value="all">All types</option>
          {COMPANY_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </DashboardSelect>
        <DashboardSelect label="Company" value={companyId} onChange={setCompanyId}>
          <option value="all">All companies</option>
          {sortedCompanies.filter((c) => type === "all" || c.type === type)
            .map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </DashboardSelect>
        <DashboardSelect label="Purchase period" value={months} onChange={(value) => setMonths(Number(value))}>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </DashboardSelect>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={exportReport}
            disabled={!loadedOnce || exporting || noAccess}
            className={`${dashboardActionClass} bg-blue-600 text-white hover:bg-blue-700`}
          >
            <MdFileDownload size={18} aria-hidden="true" />
            {exporting ? "Preparing Excel…" : "Download Excel"}
          </button>
          <button type="button" onClick={reload} disabled={loading} aria-label="Refresh stock" title="Refresh stock"
            className={`${dashboardActionClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            <MdRefresh size={19} aria-hidden="true" />
          </button>
        </div>
      </DashboardFilters>

      {loading && loadedOnce && <LinearProgress sx={{ mb: 1, height: 2 }} />}

      {!loadedOnce ? (
        <Grid container spacing={2}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Grid item xs={12} sm={6} lg key={i}>
              <Skeleton variant="rounded" height={104} />
            </Grid>
          ))}
          <Grid item xs={12} md={6}>
            <Skeleton variant="rounded" height={300} />
          </Grid>
          <Grid item xs={12} md={6}>
            <Skeleton variant="rounded" height={300} />
          </Grid>
        </Grid>
      ) : noAccess ? (
        <Panel title="No stock access">
          <Empty>Your account can&apos;t view current stock. Ask an admin for the Current Stock permission.</Empty>
        </Panel>
      ) : (
        <Box sx={{ opacity: loading ? 0.6 : 1, transition: "opacity .2s" }}>
          <DashboardSectionHeading>Stock overview</DashboardSectionHeading>
          <Grid container spacing={2} mb={2}>
            <Grid item xs={12} sm={6} lg>
              <StatTile
                label="Current stock value"
                icon={<MdInventory2 size={20} />}
                value={inrCompact.format(totals.value)}
                note={`${inr.format(totals.value)} · ${count.format(totals.pieces)} pcs`}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg>
              <StatTile
                label="Items in stock"
                icon={<MdCheckCircle size={16} />}
                tone={STATUS.good}
                value={count.format(totals.inStock)}
                note={`of ${count.format(totals.items)} items tracked`}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg>
              <StatTile
                label="Low stock"
                icon={<MdWarning size={16} />}
                tone="#c48a1b"
                value={count.format(totals.low)}
                note="Less than 1 box left"
              />
            </Grid>
            <Grid item xs={12} sm={6} lg>
              <StatTile
                label="Out of stock"
                icon={<MdError size={16} />}
                tone={STATUS.critical}
                value={count.format(totals.out)}
                note={totals.items ? `${((totals.out / totals.items) * 100).toFixed(1)}% of items` : "—"}
              />
            </Grid>
            <Grid item xs={12} sm={6} lg>
              <StatTile
                label="Purchases this month"
                icon={<MdShoppingCart size={20} />}
                value={inrCompact.format(thisMonth)}
                note={<Delta current={thisMonth} previous={lastMonth} />}
              />
            </Grid>
          </Grid>

          <DashboardSectionHeading>Stock and purchase performance</DashboardSectionHeading>
          <Grid container spacing={2} mb={2}>
            {/* Stock value by company */}
            {!single && (
              <Grid item xs={12} md={6}>
                <Panel title="Current stock value by company" subtitle="Purchase price × pieces in hand">
                  {byValue.length === 0 ? (
                    <Empty>No current stock yet. Add DMS and physical stock first.</Empty>
                  ) : (
                    <BarChart
                      layout="horizontal"
                      height={56 + byValue.length * 40}
                      margin={{ left: 150, right: 24, top: 8, bottom: 32 }}
                      yAxis={[{ scaleType: "band", data: byValue.map((r) => r.company.name), categoryGapRatio: 0.35 }]}
                      xAxis={[{ valueFormatter: (v) => inrCompact.format(v), tickNumber: 4 }]}
                      series={[{ data: byValue.map((r) => r.value), color: SINGLE, label: "Stock value", valueFormatter: (v) => inr.format(v) }]}
                      grid={{ vertical: true }}
                      borderRadius={4}
                      slotProps={noLegend}
                      sx={chartSx}
                    />
                  )}
                </Panel>
              </Grid>
            )}

            {/* Stock health */}
            <Grid item xs={12} md={single ? 12 : 6}>
              <Panel
                title={single ? `Stock health · ${scoped[0]?.name || ""}` : "Stock health by company"}
                subtitle="Items in stock, low (under 1 box) and out of stock"
              >
                {withStock.length === 0 ? (
                  <Empty>No current stock for this selection.</Empty>
                ) : single ? (
                  <SegmentedBar
                    parts={[
                      { label: "In stock", value: totals.inStock, color: STATUS.good, ink: "#fff" },
                      { label: "Low", value: totals.low, color: STATUS.warning, ink: INK.primary },
                      { label: "Out of stock", value: totals.out, color: STATUS.critical, ink: "#fff" },
                    ]}
                  />
                ) : (
                  <>
                    <BarChart
                      layout="horizontal"
                      height={56 + byHealth.length * 40}
                      margin={{ left: 150, right: 24, top: 8, bottom: 32 }}
                      yAxis={[{ scaleType: "band", data: byHealth.map((r) => r.company.name), categoryGapRatio: 0.35 }]}
                      xAxis={[{ tickNumber: 4, valueFormatter: (v) => count.format(v) }]}
                      series={[
                        { data: byHealth.map((r) => r.inStock), label: "In stock", stack: "s", color: STATUS.good },
                        { data: byHealth.map((r) => r.low), label: "Low", stack: "s", color: STATUS.warning },
                        { data: byHealth.map((r) => r.out), label: "Out of stock", stack: "s", color: STATUS.critical },
                      ].map((s) => ({ ...s, valueFormatter: (v) => `${count.format(v || 0)} items` }))}
                      grid={{ vertical: true }}
                      slotProps={noLegend}
                      sx={{ ...chartSx, "& .MuiBarElement-root": { stroke: "#fff", strokeWidth: 2 } }}
                    />
                    <Legend
                      items={[
                        { label: "In stock", color: STATUS.good },
                        { label: "Low (under 1 box)", color: STATUS.warning },
                        { label: "Out of stock", color: STATUS.critical },
                      ]}
                    />
                  </>
                )}
              </Panel>
            </Grid>
          </Grid>

          {/* Purchases growth */}
          <Box mb={2}>
            <Panel
              title="Purchases by month"
              subtitle={`Invoice value incl. GST · ${inr.format(periodTotal)} in the last ${months} months`}
            >
              {purchaseSeries.length === 0 ? (
                <Empty>No purchases in this period.</Empty>
              ) : (
                <>
                  <BarChart
                    height={300}
                    margin={{ left: 64, right: 16, top: 16, bottom: 32 }}
                    xAxis={[{ scaleType: "band", data: monthKeys.map(monthLabel), categoryGapRatio: 0.4 }]}
                    yAxis={[{ valueFormatter: (v) => inrCompact.format(v), tickNumber: 5 }]}
                    series={purchaseSeries.map((p) => ({
                      data: p.data,
                      label: p.company.name,
                      color: purchaseSeries.length === 1 ? SINGLE : colorOf(p.company.id),
                      stack: "m",
                      valueFormatter: (v) => (v ? inr.format(v) : "—"),
                    }))}
                    grid={{ horizontal: true }}
                    slotProps={noLegend}
                    tooltip={{ trigger: "axis" }}
                    sx={{ ...chartSx, "& .MuiBarElement-root": { stroke: "#fff", strokeWidth: 2 } }}
                  />
                  {purchaseSeries.length > 1 && (
                    <Legend items={purchaseSeries.map((p) => ({ label: p.company.name, color: colorOf(p.company.id) }))} />
                  )}
                </>
              )}
            </Panel>
          </Box>

          <Grid container spacing={2} mb={2}>
            {/* Top items */}
            <Grid item xs={12} lg={6}>
              <Panel title="Top 10 items by stock value" subtitle={single ? scoped[0]?.name : "Across the selected companies"}>
                {topItems.length === 0 ? (
                  <Empty>No items with stock value.</Empty>
                ) : (
                  <BarChart
                    layout="horizontal"
                    height={56 + topItems.length * 34}
                    margin={{ left: 190, right: 24, top: 8, bottom: 32 }}
                    yAxis={[
                      {
                        scaleType: "band",
                        data: topItems.map((it) => {
                          const name = it.variant_name || it.product_name || it.product_erp_id;
                          return name.length > 26 ? `${name.slice(0, 25)}…` : name;
                        }),
                        categoryGapRatio: 0.3,
                      },
                    ]}
                    xAxis={[{ valueFormatter: (v) => inrCompact.format(v), tickNumber: 4 }]}
                    series={[
                      {
                        data: topItems.map((it) => Number(it.total_value)),
                        color: SINGLE,
                        label: "Stock value",
                        valueFormatter: (v, { dataIndex }) =>
                          `${inr.format(v)} · ${count.format(topItems[dataIndex].total_current_stock_in_pcs)} pcs · ${topItems[dataIndex].company.name}`,
                      },
                    ]}
                    grid={{ vertical: true }}
                    borderRadius={4}
                    slotProps={noLegend}
                    sx={chartSx}
                  />
                )}
              </Panel>
            </Grid>

            {/* Out of stock / low stock list */}
            <Grid item xs={12} lg={6}>
              <Panel
                title="Needs re-order"
                action={
                  <Tabs value={listTab} onChange={(_, v) => setListTab(v)} sx={{ minHeight: 32, "& .MuiTab-root": { minHeight: 32, py: 0, textTransform: "none" } }}>
                    <Tab value="out" label={`Out of stock (${outItems.length})`} />
                    <Tab value="low" label={`Low (${lowItems.length})`} />
                  </Tabs>
                }
              >
                {listItems.length === 0 ? (
                  <Empty>{listTab === "out" ? "Nothing is out of stock." : "No low-stock items."}</Empty>
                ) : (
                  <TableContainer sx={{ maxHeight: 380 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ bgcolor: "#f5f8fd" }}>Item</TableCell>
                          {!single && <TableCell sx={{ bgcolor: "#f5f8fd" }}>Company</TableCell>}
                          <TableCell align="right" sx={{ bgcolor: "#f5f8fd" }}>
                            In hand
                          </TableCell>
                          <TableCell align="right" sx={{ bgcolor: "#f5f8fd" }}>
                            MRP
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {listItems.slice(0, 200).map((it) => (
                          <TableRow key={`${it.company.id}-${it.product_erp_id}`} hover>
                            <TableCell sx={{ maxWidth: 260 }}>
                              <Typography variant="body2" noWrap title={it.variant_name || it.product_name}>
                                {it.variant_name || it.product_name}
                              </Typography>
                              <Typography variant="caption" color={INK.muted} fontFamily="monospace">
                                {it.product_erp_id}
                              </Typography>
                            </TableCell>
                            {!single && (
                              <TableCell>
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={it.company.name}
                                  sx={{ borderColor: "#dfe6f2", "& .MuiChip-label": { px: 1 } }}
                                  icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: colorOf(it.company.id), ml: "8px !important" }} />}
                                />
                              </TableCell>
                            )}
                            <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                              {count.format(Number(it.total_current_stock_in_pcs) || 0)} pcs
                              {Number(it.pcs_per_box) > 0 && (
                                <Typography variant="caption" display="block" color={INK.muted}>
                                  1 box = {count.format(it.pcs_per_box)}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                              {Number(it.mrp) ? inr.format(it.mrp) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Panel>
            </Grid>
          </Grid>

          {/* Table view of every number above, per company */}
          <Panel title="Company summary" subtitle="The figures behind the charts">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Company</TableCell>
                    <TableCell align="right">Items</TableCell>
                    <TableCell align="right">In stock</TableCell>
                    <TableCell align="right">Low</TableCell>
                    <TableCell align="right">Out of stock</TableCell>
                    <TableCell align="right">Pieces</TableCell>
                    <TableCell align="right">Stock value</TableCell>
                    <TableCell align="right">Purchases ({months} mo)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => {
                    const bought = purchaseByCompany.find((p) => p.company.id === r.company.id)?.data.reduce((a, b) => a + b, 0) || 0;
                    return (
                      <TableRow key={r.company.id} hover>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: colorOf(r.company.id) }} />
                            {r.company.name}
                          </Box>
                        </TableCell>
                        {r.available ? (
                          <>
                            <TableCell align="right">{count.format(r.items.length)}</TableCell>
                            <TableCell align="right">{count.format(r.inStock)}</TableCell>
                            <TableCell align="right">{count.format(r.low)}</TableCell>
                            <TableCell align="right" sx={{ color: r.out ? STATUS.critical : undefined, fontWeight: r.out ? 600 : 400 }}>
                              {count.format(r.out)}
                            </TableCell>
                            <TableCell align="right">{count.format(r.pieces)}</TableCell>
                            <TableCell align="right">{inr.format(r.value)}</TableCell>
                          </>
                        ) : (
                          <TableCell colSpan={6} sx={{ color: INK.muted }}>
                            {r.error || "No current stock"}
                          </TableCell>
                        )}
                        <TableCell align="right">{bought ? inr.format(bought) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>
        </Box>
      )}
      {canSeeSales(user) && (
        <>
          <ItemSalesSection />
          <ItemStockInsights companies={rows} />
        </>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
function ItemSalesRanking({ title, subtitle, companyId, month, metric, chart = "column" }) {
  const params = new URLSearchParams({ metric });
  if (companyId !== "all") params.set("companyId", companyId);
  if (month) params.set("month", month);
  const query = params.toString();
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await apiFetch(`/staff/dms-sales/item-ranking?${query}`, { signal: controller.signal });
        const body = await readJson(response);
        if (!response.ok) throw new Error(body.error || "Unable to load item sales.");
        if (!controller.signal.aborted) setResult({ query, items: body.items || [] });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ query, error: error.message });
      }
    };
    void load();
    return () => controller.abort();
  }, [query]);

  const current = result?.query === query ? result : null;
  const items = current?.items || [];
  const byAmount = metric === "amount";
  const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
  const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
  const itemLabel = (item) => `${item.item_name} · ${item.company_name}`;
  const itemValue = (item) => Number(byAmount ? item.amount_sold : item.quantity_sold);
  const formatValue = (value) => byAmount ? currency.format(value) : `${quantity.format(value)} pcs`;
  const isDonut = chart === "donut";
  const slices = isDonut ? items.map((item, index) => ({
    id: `${item.company_id}:${item.product_erp_id}`,
    label: itemLabel(item),
    value: itemValue(item),
    color: ITEM_SALES_COLORS[index],
  })) : [];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const share = (value) => `${(100 * value / total).toFixed(1)}%`;

  return (
    <Panel title={title} subtitle={subtitle}>
      {!current ? (
        <Skeleton variant="rounded" height={180} />
      ) : current.error ? (
        <Typography role="alert" color="error" variant="body2">{current.error}</Typography>
      ) : items.length === 0 ? (
        <Empty>No item sales for this period.</Empty>
      ) : (<>
        {isDonut ? (
        total > 0 ? (
          <Box display="flex" alignItems="center" justifyContent="center" minHeight={245}>
            <PieChart
              width={190}
              height={190}
              margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
              series={[{
                data: slices.filter((slice) => slice.value > 0),
                innerRadius: 52,
                outerRadius: 87,
                paddingAngle: 2,
                cornerRadius: 3,
                arcLabel: ({ value }) => share(value),
                arcLabelMinAngle: 25,
                valueFormatter: ({ value }) => `${formatValue(value)} · ${share(value)}`,
              }]}
              slotProps={noLegend}
              sx={{ "& .MuiPieArcLabel-root": { fill: "#fff", fontSize: 11, fontWeight: 700, paintOrder: "stroke", stroke: "#222", strokeWidth: 2 } }}
            />
          </Box>
        ) : <Empty>No positive sales for this measure.</Empty>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Box sx={{ minWidth: 360 }}>
            <BarChart
              height={245}
              margin={{ left: 65, right: 16, top: 14, bottom: 35 }}
              xAxis={[{
                scaleType: "band",
                data: items.map((_, index) => String(index)),
                valueFormatter: (key, { location }) => location === "tick" ? String(Number(key) + 1) : itemLabel(items[Number(key)]),
                categoryGapRatio: 0.3,
              }]}
              yAxis={[{ valueFormatter: (value) => (byAmount ? inrCompact : quantity).format(value), tickNumber: 4 }]}
              series={[{
                data: items.map(itemValue),
                label: byAmount ? "Sales value" : "Quantity sold",
                valueFormatter: (_, { dataIndex }) => {
                  const item = items[dataIndex];
                  return `${quantity.format(item.quantity_sold)} pcs · ${currency.format(item.amount_sold)}`;
                },
                color: SINGLE,
              }]}
              grid={{ horizontal: true }}
              borderRadius={4}
              slotProps={noLegend}
              sx={chartSx}
            />
          </Box>
        </Box>
        )}
        <TableContainer sx={{ mt: 1, border: "1px solid #dfe6f2", borderRadius: 1 }}>
          <Table size="small" aria-label={title} sx={{ "& .MuiTableCell-root": { px: 1, py: 0.85, fontSize: "0.75rem" } }}>
            <TableHead sx={{ bgcolor: "#f2f5fa" }}>
              <TableRow>
                <TableCell align="center">Rank</TableCell>
                <TableCell>Product</TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>Company</TableCell>
                <TableCell align="right">{byAmount ? "Sales value" : "Quantity"}</TableCell>
                {isDonut && <TableCell align="right">Share</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={`${item.company_id}:${item.product_erp_id}`} hover sx={{ "&:last-child td, &:last-child th": { borderBottom: 0 } }}>
                  <TableCell align="center">
                    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                      {isDonut && <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: slices[index].color }} />}
                      {index + 1}
                    </Box>
                  </TableCell>
                  <TableCell component="th" scope="row" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>
                    {item.item_name}
                    <Box component="span" sx={{ display: { xs: "block", sm: "none" }, color: INK.secondary, fontWeight: 400 }}>
                      {item.company_name}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", sm: "table-cell" }, color: INK.secondary }}>{item.company_name}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatValue(itemValue(item))}</TableCell>
                  {isDonut && <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{total > 0 ? share(itemValue(item)) : "—"}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </>)}
    </Panel>
  );
}

function ItemSalesSection() {
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState("all");
  const [month, setMonth] = useState(() => monthKey(todayLocal()));
  const [metric, setMetric] = useState("quantity");

  return (
    <Box component="section" aria-label="Item-wise sales" sx={{ mt: 3 }}>
      <Box display="flex" flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={2} mb={2.5}>
        <Box>
          <Typography component="h2" variant="h6" fontWeight={700} color={INK.primary}>Item-wise sales</Typography>
          <Typography variant="body2" color={INK.secondary}>Sales rankings exclude cancelled bills and free goods.</Typography>
        </Box>
        <Box display="flex" flexWrap="wrap" alignItems="center" gap={1.5}>
          <FormControl size="small" sx={filterSx}>
            <InputLabel id="item-sales-company">Company</InputLabel>
            <Select labelId="item-sales-company" label="Company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <MenuItem value="all">All companies</MenuItem>
              {companies.map((company) => <MenuItem key={company.id} value={String(company.id)}>{company.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="month"
            label="Sales month"
            value={month}
            onChange={(e) => { if (e.target.value) setMonth(e.target.value); }}
            InputLabelProps={{ shrink: true }}
            sx={{ bgcolor: "#fff" }}
          />
          <ToggleButtonGroup
            size="small"
            exclusive
            aria-label="Rank items by"
            value={metric}
            onChange={(_, value) => { if (value) setMetric(value); }}
            sx={{ bgcolor: "#fff" }}
          >
            <ToggleButton value="quantity">Quantity</ToggleButton>
            <ToggleButton value="amount">Sales value</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
      <Grid container spacing={2}>
        <Grid item xs={12} lg={6}>
          <ItemSalesRanking title="Top 10 items by month" subtitle={monthLabel(month)} companyId={companyId} month={month} metric={metric} />
        </Grid>
        <Grid item xs={12} lg={6}>
          <ItemSalesRanking title="Top 10 items overall" subtitle="Share of the top 10 across all sale dates" companyId={companyId} metric={metric} chart="donut" />
        </Grid>
      </Grid>
    </Box>
  );
}

const canSeePurchase = (user) => (user?.role || "admin") === "admin" || (user?.permissions || []).includes("dashboard");
const canSeeSales = (user) => user?.role === "admin" || (user?.permissions || []).includes("create_sales");

export default function Dashboard({ user }) {
  const showPurchase = canSeePurchase(user);
  const [tab, setTab] = useState("stock");
  const current = showPurchase ? tab : "stock";

  return (
    <Box sx={{ maxWidth: 1600, mx: "auto" }}>
      <header className="mb-5">
        <h1 className="m-0 text-[22px] font-bold leading-tight text-slate-900">Bawarchee Food Packaging Pvt. Ltd.</h1>
        <p className="m-0 mt-1 text-[12.5px] text-slate-500">
          {current === "stock"
            ? "Stock and item sales overview · Current stock is physical stock minus DMS, per company"
            : "Purchase invoices, supplier discounts, taxable value and GST"}
        </p>
      </header>
      {showPurchase && (
        <Box sx={{ mb: 2, overflowX: "auto" }}>
          <Tabs
            value={current}
            onChange={(_, v) => setTab(v)}
            aria-label="Dashboard views"
            sx={{
              display: "inline-flex",
              minHeight: 42,
              p: 0.5,
              bgcolor: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 3,
              "& .MuiTabs-indicator": { display: "none" },
              "& .MuiTab-root": { minHeight: 34, minWidth: 0, textTransform: "none", fontSize: 13, fontWeight: 600, px: { xs: 1, sm: 2 }, py: 0.5, borderRadius: 2, color: "#475569" },
              "& .MuiTab-root.Mui-selected": { bgcolor: "#eff6ff", color: "#1d4ed8" },
            }}
          >
            <Tab id="stock-dashboard-tab" aria-controls="stock-dashboard-panel" value="stock" label="Stock Dashboard" />
            <Tab id="purchase-dashboard-tab" aria-controls="purchase-dashboard-panel" value="purchase" label="Purchase Dashboard" />
          </Tabs>
        </Box>
      )}
      <Box id="stock-dashboard-panel" role={showPurchase ? "tabpanel" : undefined} aria-labelledby={showPurchase ? "stock-dashboard-tab" : undefined} hidden={current !== "stock"}>
        <StockDashboard user={user} />
      </Box>
      {showPurchase && (
        <Box id="purchase-dashboard-panel" role="tabpanel" aria-labelledby="purchase-dashboard-tab" hidden={current !== "purchase"}>
          <PurchaseDashboard />
        </Box>
      )}
    </Box>
  );
}
