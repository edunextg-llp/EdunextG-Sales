import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { BarChart } from "@mui/x-charts/BarChart";
import { MdLocalOffer, MdPercent, MdReceiptLong, MdRefresh, MdShoppingCart, MdStorefront } from "react-icons/md";
import { apiFetch } from "../auth";
import { readJson, useFlash } from "../components/ui";

// Dashboard > Purchase tab. Moved here from the main site's Dashboard ("Purchase Dashboard"
// tab). Same data: GET /staff/purchase-reports?startDate&endDate.

const SINGLE = "#2a78d6";
const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", grid: "#e1e0d9" };
// How an invoice's gross value splits: discounts, cash discount, taxable value, GST.
const PART = { discount: "#eb6834", cash: "#eda100", taxable: "#2a78d6", gst: "#1baf7a" };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrCompact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
const count = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const num = (v) => Number(v) || 0;
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : "—");

const EMPTY = {
  summary: {
    total_purchase: 0,
    total_invoices: 0,
    total_gross_amount: 0,
    total_trader_discount: 0,
    total_primary_discount: 0,
    total_secondary_discount: 0,
    total_cash_discount: 0,
    total_taxable_value: 0,
    total_sgst_amount: 0,
    total_cgst_amount: 0,
    total_gst_amount: 0,
    seller_count: 0,
    average_purchase: 0,
  },
  purchasesByPeriod: { monthly: [], yearly: [] },
};

// Indian financial years (April to March): this one and the one before.
function financialYearOptions() {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return [0, 1].map((i) => {
    const y = startYear - i;
    return { value: `${y}-${y + 1}`, label: `FY ${y}-${String(y + 1).slice(2)}`, startDate: `${y}-04-01`, endDate: `${y + 1}-03-31` };
  });
}

// The 12 months (Apr..Mar) of a financial year such as "2026-2027".
function monthOptions(financialYear) {
  const startYear = Number(String(financialYear || "").split("-")[0]);
  if (!startYear) return [];
  return Array.from({ length: 12 }, (_, i) => {
    const month = i < 9 ? i + 4 : i - 8;
    const year = i < 9 ? startYear : startYear + 1;
    const value = `${year}-${String(month).padStart(2, "0")}`;
    return {
      value,
      label: new Date(year, month - 1, 1).toLocaleString("en-GB", { month: "short", year: "numeric" }),
      startDate: `${value}-01`,
      endDate: `${value}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`,
    };
  });
}

const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

// ---------------------------------------------------------------------------

function Panel({ title, subtitle, action, children }) {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderColor: "#dfe6f2", borderRadius: 2 }}>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={2} mb={1.5}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600} color={INK.primary} lineHeight={1.3}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color={INK.secondary}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Box>
        {children}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, note, icon, tone }) {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderColor: "#dfe6f2", borderRadius: 2 }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box display="flex" alignItems="center" gap={0.75}>
          {icon && <Box component="span" sx={{ color: tone, display: "flex" }}>{icon}</Box>}
          <Typography variant="body2" color={INK.secondary}>
            {label}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 28, fontWeight: 600, color: INK.primary, mt: 0.5, lineHeight: 1.2 }}>{value}</Typography>
        {note && (
          <Typography variant="caption" color={INK.secondary} component="div" mt={0.5}>
            {note}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// One line of the gross-to-payable breakdown.
function Line({ label, value, share, color, strong, minus, indent }) {
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={1}
      py={0.75}
      pl={indent ? 2.5 : 0}
      sx={{ borderTop: strong ? `1px solid ${INK.grid}` : "none" }}
    >
      {color ? <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: color, flexShrink: 0 }} /> : <Box sx={{ width: 10 }} />}
      <Typography variant="body2" color={strong ? INK.primary : INK.secondary} fontWeight={strong ? 600 : 400} flexGrow={1}>
        {label}
      </Typography>
      {share && (
        <Typography variant="caption" color={INK.muted} sx={{ minWidth: 48, textAlign: "right" }}>
          {share}
        </Typography>
      )}
      <Typography
        variant="body2"
        fontWeight={strong ? 600 : 500}
        color={INK.primary}
        sx={{ minWidth: 130, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
      >
        {minus ? "− " : ""}
        {inr2.format(value)}
      </Typography>
    </Box>
  );
}

const chartSx = {
  "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: "#c3c2b7 !important" },
  "& .MuiChartsAxis-tickLabel": { fill: `${INK.muted} !important`, fontSize: "12px !important" },
  "& .MuiChartsGrid-line": { stroke: INK.grid },
};

const filterSx = { minWidth: 150, bgcolor: "#fff" };

// ---------------------------------------------------------------------------

export default function PurchaseDashboard({ user }) {
  const [flash, flashNode] = useFlash();
  const years = useMemo(() => financialYearOptions(), []);
  const [financialYear, setFinancialYear] = useState(years[0].value);
  const [month, setMonth] = useState("");
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);

  const months = useMemo(() => monthOptions(financialYear), [financialYear]);
  const yearOption = years.find((y) => y.value === financialYear);
  const monthOption = months.find((m) => m.value === month);
  const startDate = monthOption?.startDate || yearOption?.startDate || "";
  const endDate = monthOption?.endDate || yearOption?.endDate || "";
  const periodText = monthOption ? monthOption.label : yearOption ? yearOption.label : "All years";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await apiFetch(`/staff/purchase-reports?${params}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load the purchase report.");
      setData({
        summary: { ...EMPTY.summary, ...(body.summary || {}) },
        purchasesByPeriod: { monthly: body.purchasesByPeriod?.monthly || [], yearly: body.purchasesByPeriod?.yearly || [] },
      });
    } catch (err) {
      setData(EMPTY);
      flash(false, err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data.summary;
  const gross = num(s.total_gross_amount);
  const trader = num(s.total_trader_discount);
  const primary = num(s.total_primary_discount);
  const secondary = num(s.total_secondary_discount);
  const discounts = trader + primary + secondary;
  const cash = num(s.total_cash_discount);
  const taxable = num(s.total_taxable_value);
  const gst = num(s.total_gst_amount);
  const total = num(s.total_purchase);

  // Split bar: gross value = discounts + cash discount + taxable value; GST comes on top.
  const parts = [
    { key: "discount", label: "Discounts", value: discounts, color: PART.discount },
    { key: "cash", label: "Cash discount", value: cash, color: PART.cash },
    { key: "taxable", label: "Taxable value", value: taxable, color: PART.taxable },
    { key: "gst", label: "GST", value: gst, color: PART.gst },
  ];
  const partsTotal = parts.reduce((t, p) => t + p.value, 0);

  // Month bars: the chosen month, the 12 months (Apr..Mar) of the chosen financial year, or
  // every month with purchases when all years are shown.
  const chart = useMemo(() => {
    const monthly = (data.purchasesByPeriod.monthly || []).filter((r) => /^\d{4}-\d{2}$/.test(String(r.period)));
    const byMonth = new Map(monthly.map((r) => [String(r.period), num(r.total_purchase)]));
    const keys = monthOption ? [monthOption.value] : months.length ? months.map((m) => m.value) : [...byMonth.keys()].sort();
    return { labels: keys.map(monthLabel), values: keys.map((k) => byMonth.get(k) || 0) };
  }, [data.purchasesByPeriod.monthly, months, monthOption]);
  const chartHasData = chart.values.some((v) => v > 0);
  const best = chartHasData ? chart.values.indexOf(Math.max(...chart.values)) : -1;

  return (
    <Box sx={{ maxWidth: 1400, mx: "auto" }}>
      <Box display="flex" flexWrap="wrap" alignItems="flex-end" justifyContent="space-between" gap={2} mb={2.5}>
        <Box>
          <Typography variant="overline" color="#c2410c" fontWeight={700} lineHeight={1.5}>
            Purchase report
          </Typography>
          <Typography variant="h5" fontWeight={600} color={INK.primary}>
            Purchase Dashboard
          </Typography>
          <Typography variant="body2" color={INK.secondary}>
            Welcome, {user?.username || "User"}. Purchase invoices, discounts, taxable value and GST · {periodText}
          </Typography>
        </Box>
        <Box display="flex" flexWrap="wrap" alignItems="center" gap={1.5}>
          <FormControl size="small" sx={filterSx}>
            <InputLabel>Financial year</InputLabel>
            <Select
              label="Financial year"
              value={financialYear}
              onChange={(e) => {
                setFinancialYear(e.target.value);
                setMonth("");
              }}
            >
              <MenuItem value="">All years</MenuItem>
              {years.map((y) => (
                <MenuItem key={y.value} value={y.value}>
                  {y.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={filterSx} disabled={!financialYear}>
            <InputLabel>Month</InputLabel>
            <Select label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
              <MenuItem value="">All months</MenuItem>
              {months.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title="Reload">
            <span>
              <IconButton onClick={load} disabled={loading} size="small">
                <MdRefresh />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Box height={4} mb={2}>
        {loading && <LinearProgress sx={{ borderRadius: 1 }} />}
      </Box>

      {/* Headline numbers */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} lg={3}>
          <StatTile
            label="Total purchase"
            value={inrCompact.format(total)}
            note={`${inr.format(total)} payable, GST included`}
            icon={<MdShoppingCart size={18} />}
            tone={SINGLE}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatTile
            label="Purchase invoices"
            value={count.format(num(s.total_invoices))}
            note={`Average ${inr.format(num(s.average_purchase))} per invoice`}
            icon={<MdReceiptLong size={18} />}
            tone="#6250d6"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatTile
            label="Total discount"
            value={inrCompact.format(discounts + cash)}
            note={`${pct(discounts + cash, gross)} of gross ${inrCompact.format(gross)}`}
            icon={<MdLocalOffer size={18} />}
            tone={PART.discount}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatTile
            label="Sellers"
            value={count.format(num(s.seller_count))}
            note="Distinct sellers on purchase invoices"
            icon={<MdStorefront size={18} />}
            tone={PART.gst}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2} mt={0}>
        {/* Monthly trend */}
        <Grid item xs={12} lg={7}>
          <Panel
            title="Purchase by month"
            subtitle={best >= 0 ? `Highest: ${chart.labels[best]} · ${inr.format(chart.values[best])}` : periodText}
          >
            {chartHasData ? (
              <BarChart
                height={320}
                xAxis={[{ scaleType: "band", data: chart.labels }]}
                yAxis={[{ valueFormatter: (v) => inrCompact.format(v) }]}
                series={[{ data: chart.values, color: SINGLE, label: "Purchase", valueFormatter: (v) => inr.format(v || 0) }]}
                grid={{ horizontal: true }}
                borderRadius={4}
                margin={{ left: 70, right: 10, top: 10, bottom: 30 }}
                slotProps={{ legend: { hidden: true } }}
                sx={chartSx}
              />
            ) : (
              <Box py={10} textAlign="center">
                <Typography variant="body2" color={INK.secondary}>
                  No purchases in this period.
                </Typography>
              </Box>
            )}
          </Panel>
        </Grid>

        {/* Gross -> payable */}
        <Grid item xs={12} lg={5}>
          <Panel title="From gross to payable" subtitle="Where the invoice value goes">
            {partsTotal > 0 ? (
              <>
                <Box display="flex" gap="2px" height={14} borderRadius={1} overflow="hidden" mb={1.5}>
                  {parts
                    .filter((p) => p.value > 0)
                    .map((p) => (
                      <Tooltip key={p.key} title={`${p.label}: ${inr2.format(p.value)} (${pct(p.value, partsTotal)})`}>
                        <Box sx={{ flexBasis: `${(p.value / partsTotal) * 100}%`, bgcolor: p.color, minWidth: 3 }} />
                      </Tooltip>
                    ))}
                </Box>
                <Line label="Gross value" value={gross} />
                <Line label="Trader discount" value={trader} share={pct(trader, gross)} color={PART.discount} minus indent />
                <Line label="Primary discount" value={primary} share={pct(primary, gross)} color={PART.discount} minus indent />
                <Line label="Secondary discount" value={secondary} share={pct(secondary, gross)} color={PART.discount} minus indent />
                <Line label="Cash discount" value={cash} share={pct(cash, gross)} color={PART.cash} minus indent />
                <Line label="Taxable value" value={taxable} color={PART.taxable} strong />
                <Line label="SGST" value={num(s.total_sgst_amount)} color={PART.gst} indent />
                <Line label="CGST" value={num(s.total_cgst_amount)} color={PART.gst} indent />
                <Line label="Total payable" value={total} strong />
              </>
            ) : (
              <Box py={10} textAlign="center">
                <Typography variant="body2" color={INK.secondary}>
                  No purchases in this period.
                </Typography>
              </Box>
            )}
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={2} mt={0}>
        <Grid item xs={12} sm={4}>
          <StatTile label="Taxable value" value={inrCompact.format(taxable)} note={`${pct(taxable, gross)} of gross, after all discounts`} tone={PART.taxable} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatTile
            label="Total GST"
            value={inrCompact.format(gst)}
            note={`SGST ${inrCompact.format(num(s.total_sgst_amount))} · CGST ${inrCompact.format(num(s.total_cgst_amount))}`}
            icon={<MdPercent size={18} />}
            tone={PART.gst}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatTile label="Gross value" value={inrCompact.format(gross)} note="Before any discount" />
        </Grid>
      </Grid>
      {flashNode}
    </Box>
  );
}
