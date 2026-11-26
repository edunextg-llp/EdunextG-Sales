import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { LineChart } from "@mui/x-charts/LineChart";
import { ScatterChart } from "@mui/x-charts/ScatterChart";
import { apiFetch } from "../auth";
import { Panel } from "../components/DashboardCards";
import { readJson } from "../components/ui";
import { qty, rupees } from "../utils/purchaseCalc";

const itemKey = (value) => String(value || "").trim().toLowerCase();
const colors = ["#2563eb", "#0f766e", "#b45309"];
const axes = { "& .MuiChartsAxis-tickLabel": { fontSize: "11px !important" } };
const chartMargin = { left: 66, right: 20, top: 35, bottom: 32 };
const formatDays = (value) => Number(value.toFixed(1)).toLocaleString("en-IN");

function monthKeys(asOf) {
  const [year, month] = asOf.split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 12 + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

function buildItems({ sales, purchases }, stock) {
  const items = new Map();
  const get = (key, name) => {
    if (!items.has(key)) {
      items.set(key, { key, name, sales: new Map(), purchases: new Map(), units: 0, recent: { 30: 0, 60: 0, 90: 0 }, stock: null });
    }
    return items.get(key);
  };
  for (const row of sales) {
    const item = get(row.item_key, row.item_name);
    item.sales.set(row.month_key, { units: Number(row.units), amount: Number(row.amount) });
    item.units += Number(row.units);
    for (const days of [30, 60, 90]) item.recent[days] += Number(row[`units_${days}`]);
  }
  for (const row of purchases) get(row.item_key, row.item_name).purchases.set(row.month_key, Number(row.units));
  for (const row of stock) {
    const key = itemKey(row.product_erp_id);
    if (!key) continue;
    const item = get(key, row.variant_name || row.product_name || row.product_erp_id);
    item.stock = (item.stock ?? 0) + (Number(row.total_current_stock_in_pcs) || 0);
  }
  return [...items.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
}

function ChartEmpty({ children }) {
  return <Typography color="text.secondary" variant="body2" textAlign="center" py={4}>{children}</Typography>;
}

function StockRisk({ items, available }) {
  const risk = items.filter((item) => item.stock !== null && item.recent[30] > 0)
    .map((item) => ({ ...item, days: Math.max(0, item.stock) * 30 / item.recent[30] }))
    .filter((item) => item.days <= 14)
    .sort((a, b) => a.days - b.days || b.recent[30] - a.recent[30])
    .slice(0, 10);
  if (!available) return <ChartEmpty>Current stock is unavailable for this company.</ChartEmpty>;
  if (!risk.length) return <ChartEmpty>No tracked items with 14 estimated days of stock or less.</ChartEmpty>;
  return (
    <Box>
      {risk.map((item) => (
        <Box key={item.key} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(55px, 30%) auto", alignItems: "center", gap: 1.5, py: 0.75 }}>
          <Box>
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{item.name}</Typography>
            <Typography variant="caption" color="text.secondary">{qty(item.stock)} pcs in stock · {qty(item.recent[30])} pcs sold</Typography>
          </Box>
          <Box aria-hidden="true" sx={{ position: "relative", height: 2, bgcolor: "#e2e8f0", mx: 0.5 }}>
            <Box sx={{ position: "absolute", height: 2, width: `${item.days / 14 * 100}%`, bgcolor: item.days <= 3 ? "#b91c1c" : "#b45309" }} />
            <Box sx={{ position: "absolute", top: "50%", left: `${item.days / 14 * 100}%`, width: 9, height: 9, borderRadius: "50%", transform: "translate(-50%, -50%)", bgcolor: item.days <= 3 ? "#b91c1c" : "#b45309" }} />
          </Box>
          <Typography variant="caption" fontWeight={700} sx={{ whiteSpace: "nowrap" }}>{formatDays(item.days)} days</Typography>
        </Box>
      ))}
    </Box>
  );
}

function SlowStock({ items, available }) {
  const [days, setDays] = useState(30);
  const slow = items.filter((item) => item.stock > 0 && item.recent[days] <= 5)
    .sort((a, b) => b.stock - a.stock || a.name.localeCompare(b.name))
    .slice(0, 30);
  if (!available) return <ChartEmpty>Current stock is unavailable for this company.</ChartEmpty>;
  return (
    <>
      <TextField select size="small" label="Sales window" value={days} onChange={(event) => setDays(Number(event.target.value))} sx={{ minWidth: 135 }}>
        {[30, 60, 90].map((window) => <MenuItem key={window} value={window}>Last {window} days</MenuItem>)}
      </TextField>
      {slow.length ? (
        <ScatterChart
          height={285}
          margin={{ left: 72, right: 20, top: 15, bottom: 55 }}
          xAxis={[{ label: "Pieces sold", min: -0.25, max: 5.25, tickInterval: [0, 1, 2, 3, 4, 5] }]}
          yAxis={[{ label: "Pieces in stock", min: 0 }]}
          series={[{
            data: slow.map((item) => ({ id: item.key, x: item.recent[days], y: item.stock })),
            color: "#7c3aed",
            valueFormatter: (point, { dataIndex }) => `${slow[dataIndex].name} · ${qty(point.x)} sold · ${qty(point.y)} in stock`,
          }]}
          grid={{ horizontal: true, vertical: true }}
          slotProps={{ legend: { hidden: true } }}
          sx={axes}
        />
      ) : <ChartEmpty>No stocked items sold five pieces or fewer in this window.</ChartEmpty>}
    </>
  );
}

function CompanyInsights({ row }) {
  const id = String(row.company.id);
  const [result, setResult] = useState(null);
  const [trendSelection, setTrendSelection] = useState(null);
  const [comparisonKey, setComparisonKey] = useState("");
  const [metric, setMetric] = useState("units");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await apiFetch(`/staff/dms-sales/item-stock-insights?companyId=${encodeURIComponent(id)}`, { signal: controller.signal });
        const body = await readJson(response);
        if (!response.ok) throw new Error(body.error || "Unable to load stock insights.");
        if (!controller.signal.aborted) setResult(body);
      } catch (error) {
        if (!controller.signal.aborted) setResult({ error: error.message });
      }
    }
    void load();
    return () => controller.abort();
  }, [id]);
  const items = useMemo(() => result?.asOf ? buildItems(result, row.items) : [], [result, row.items]);
  if (!result) return <Skeleton variant="rounded" height={240} />;
  if (result.error) return <Alert severity="error">{result.error}</Alert>;

  const months = monthKeys(result.asOf);
  const monthAxis = [{
    scaleType: "point",
    data: months,
    valueFormatter: (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
  }];
  const salesItems = items.filter((item) => item.sales.size);
  const comparisonItems = items.filter((item) => item.sales.size || item.purchases.size);
  const trendItems = trendSelection ?? salesItems.slice(0, 3);
  const comparison = comparisonItems.find((item) => item.key === comparisonKey)
    || comparisonItems.find((item) => item.sales.size && item.purchases.size) || comparisonItems[0] || null;
  const itemLabel = (item) => `${item.name} (${item.key.toUpperCase()})`;
  const formatMetric = (value) => metric === "amount" ? rupees(value) : `${qty(value)} pcs`;

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} lg={6}>
        <Panel title="Item sales trend" subtitle="Compare up to three products across 12 months, including this month.">
          <Box display="flex" flexWrap="wrap" gap={1}>
            <Autocomplete multiple size="small" options={salesItems} value={trendItems}
              onChange={(_, value) => setTrendSelection(value)}
              getOptionDisabled={(item) => trendItems.length >= 3 && !trendItems.some((selected) => selected.key === item.key)}
              getOptionLabel={itemLabel} isOptionEqualToValue={(a, b) => a.key === b.key}
              renderInput={(params) => <TextField {...params} label="Products" />} sx={{ flex: "1 1 250px" }} />
            <TextField select size="small" label="Measure" value={metric} onChange={(event) => setMetric(event.target.value)} sx={{ minWidth: 120 }}>
              <MenuItem value="units">Quantity</MenuItem>
              <MenuItem value="amount">Sales value</MenuItem>
            </TextField>
          </Box>
          {trendItems.length ? <LineChart
            height={285} margin={chartMargin} xAxis={monthAxis} grid={{ horizontal: true }} sx={axes}
            yAxis={[{ min: 0, valueFormatter: formatMetric }]}
            series={trendItems.map((item, index) => ({
              id: item.key, label: itemLabel(item), color: colors[index], curve: "linear",
              data: months.map((month) => item.sales.get(month)?.[metric] || 0), valueFormatter: formatMetric,
            }))}
            slotProps={{ legend: { hidden: true } }}
          /> : <ChartEmpty>{salesItems.length ? "Select products to compare." : "No item sales in the last 12 months."}</ChartEmpty>}
          {trendItems.map((item, index) => (
            <Typography key={item.key} component="div" variant="caption" sx={{ fontWeight: 600, color: colors[index] }}>{itemLabel(item)}</Typography>
          ))}
        </Panel>
      </Grid>
      <Grid item xs={12} lg={6}>
        <Panel title="Purchases vs. sales" subtitle="Pieces purchased on recorded purchase invoices and pieces sold each month.">
          <Autocomplete size="small" options={comparisonItems} value={comparison}
            onChange={(_, item) => setComparisonKey(item?.key || "")} disableClearable={Boolean(comparison)}
            getOptionLabel={itemLabel} isOptionEqualToValue={(a, b) => a.key === b.key}
            renderInput={(params) => <TextField {...params} label="Product" />} />
          {comparison ? <LineChart
            height={285} margin={chartMargin} xAxis={monthAxis} grid={{ horizontal: true }} sx={axes}
            yAxis={[{ min: 0, valueFormatter: (value) => qty(value) }]}
            series={[
              { label: "Purchased", data: months.map((month) => comparison.purchases.get(month) || 0), color: "#2563eb", area: true, showMark: false, curve: "linear" },
              { label: "Sold", data: months.map((month) => comparison.sales.get(month)?.units || 0), color: "#b45309", area: true, showMark: false, curve: "linear" },
            ]}
          /> : <ChartEmpty>No purchase or sales item history in the last 12 months.</ChartEmpty>}
        </Panel>
      </Grid>
      <Grid item xs={12} lg={6}>
        <Panel title="Stock at risk" subtitle="Up to 10 items with 14 days of stock or less, estimated from the last 30 days of sales.">
          <StockRisk items={items} available={row.available} />
        </Panel>
      </Grid>
      <Grid item xs={12} lg={6}>
        <Panel title="Slow-moving stock" subtitle="Up to 30 items with stock on hand and five or fewer pieces sold, prioritised by stock on hand.">
          <SlowStock items={items} available={row.available} />
        </Panel>
      </Grid>
    </Grid>
  );
}

export default function ItemStockInsights({ companies }) {
  const [selected, setSelected] = useState("");
  const row = companies.find((entry) => String(entry.company.id) === selected)
    || companies.find((entry) => entry.available) || companies[0];
  if (!row) return null;
  return (
    <Box component="section" aria-label="Item stock insights" sx={{ mt: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
        <Typography component="h2" variant="h6" fontWeight={700}>Item stock insights</Typography>
        <TextField select size="small" label="Company" value={String(row.company.id)} onChange={(event) => setSelected(event.target.value)}
          sx={{ bgcolor: "#fff", minWidth: 180 }}>
          {companies.map(({ company }) => <MenuItem value={String(company.id)} key={company.id}>{company.name}</MenuItem>)}
        </TextField>
      </Box>
      <CompanyInsights key={row.company.id} row={row} />
    </Box>
  );
}
