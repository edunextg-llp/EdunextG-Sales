import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import {
  BarChart,
  PieChart,
  ChartsTooltipPaper,
  ChartsTooltipTable,
  ChartsTooltipRow,
  ChartsTooltipCell,
  ChartsTooltipMark,
} from "@mui/x-charts";
import Typography from "@mui/material/Typography";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import TextField from "@mui/material/TextField";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
} from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ReportsBarChart from "examples/Charts/BarCharts/ReportsBarChart";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";

const API = "https://bawarchee.edunextg.co/api";

const emptyReportData = {
  summary: { total_sales: 0, total_paid: 0, total_collection: 0, total_outstanding: 0 },
  creditDuesSummary: { total_credit_dues: 0, credit_dues_count: 0 },
  collectionByMode: [],
  collectionDetails: [],
  todayCollection: [],
  todayCollectionDetails: [],
  monthlyCollection: [],
  yearlyCollection: [],
  salesByPeriod: { weekly: [], monthly: [], quarterly: [], yearly: [] },
  chequeReports: [],
  pendingChequeReports: [],
  duesReport: [],
  staffCollectionByDate: [],
};

const emptyPurchaseReportData = {
  summary: {
    total_purchase: 0,
    total_gross_amount: 0,
    total_trader_discount: 0,
    total_primary_discount: 0,
    total_secondary_discount: 0,
    total_cash_discount: 0,
    total_taxable_value: 0,
    total_cgst_amount: 0,
    total_sgst_amount: 0,
    total_gst_amount: 0,
    total_invoices: 0,
    seller_count: 0,
    average_purchase: 0,
    today_purchase: 0,
    today_invoices: 0,
  },
  purchasesByPeriod: { monthly: [], yearly: [] },
};

const modeLabels = {
  cash: "Cash",
  upi: "Online",
  cheque: "Cheque",
};

const modePieColors = {
  cash: "#2e7d32",
  upi: "#0288d1",
  cheque: "#ed6c02",
};

function monthLabel(period) {
  const match = String(period || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return period;

  const monthIndex = Number(match[2]) - 1;
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    monthIndex
  ];
}

function getFinancialYearOptions() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const startYear = currentMonth >= 4 ? currentYear : currentYear - 1;

  return Array.from({ length: 6 }, (_, index) => {
    const year = startYear - index;
    return {
      value: `${year}-${year + 1}`,
      label: `${year}-${year + 1}`,
      startDate: `${year}-04-01`,
      endDate: `${year + 1}-03-31`,
    };
  });
}

function getMonthOptions(financialYear) {
  if (!financialYear) return [];
  const startYear = Number(String(financialYear).split("-")[0]);
  if (!startYear) return [];

  return Array.from({ length: 12 }, (_, index) => {
    const month = index < 9 ? index + 4 : index - 8;
    const year = index < 9 ? startYear : startYear + 1;
    const value = `${year}-${String(month).padStart(2, "0")}`;
    return {
      value,
      label: new Date(year, month - 1, 1).toLocaleString("en-US", {
        month: "short",
        year: "numeric",
      }),
      startDate: `${value}-01`,
      endDate: `${value}-${new Date(year, month, 0).getDate()}`,
    };
  });
}

function money(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function shortMoney(value) {
  return money(value);
}

function formatDate(value) {
  if (!value) return "N/A";
  const dateOnly = String(value).split("T")[0].split(" ")[0];
  const parts = dateOnly.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return value;
}

function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStartLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

const compactDateFieldSx = {
  width: 128,
  backgroundColor: "#fff",
  borderRadius: 1,
  "& .MuiInputBase-input": { fontSize: "0.8rem", py: 0.75 },
  "& .MuiInputLabel-root": { fontSize: "0.8rem" },
};

function sumRows(rows, field = "total_amount") {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

const DEMO_YEARLY_YEARS = [2022, 2023, 2024, 2025];

function emptyYearlyRow(period) {
  return {
    period,
    cash_amount: 0,
    upi_amount: 0,
    cheque_amount: 0,
    total_amount: 0,
  };
}

function buildYearlyCollectionRows(apiRows = []) {
  const currentYear = new Date().getFullYear();
  const byYear = new Map();

  for (const row of apiRows) {
    const period = Number(row.period);
    byYear.set(period, {
      period,
      cash_amount: Number(row.cash_amount) || 0,
      upi_amount: Number(row.upi_amount) || 0,
      cheque_amount: Number(row.cheque_amount) || 0,
      total_amount: Number(row.total_amount) || 0,
    });
  }

  const rows = DEMO_YEARLY_YEARS.map((year) =>
    year === currentYear ? byYear.get(year) || emptyYearlyRow(year) : emptyYearlyRow(year)
  );

  if (!DEMO_YEARLY_YEARS.includes(currentYear)) {
    rows.push(byYear.get(currentYear) || emptyYearlyRow(currentYear));
  }

  const includedYears = new Set(rows.map((row) => row.period));
  [...byYear.keys()]
    .filter((year) => !includedYears.has(year))
    .sort((a, b) => a - b)
    .forEach((year) => {
      rows.push(byYear.get(year));
    });

  return rows;
}

function emptyMonthlyRow(period) {
  return {
    period,
    cash_amount: 0,
    upi_amount: 0,
    cheque_amount: 0,
    total_amount: 0,
  };
}

const tooltipTextSx = { fontSize: "0.65rem", lineHeight: 1.25 };

const collectionChartSlots = {
  axisContent: CollectionAxisTooltipContent,
};

const collectionChartTooltip = {
  trigger: "axis",
};

function CollectionAxisTooltipContent({ series, axis, dataIndex, axisValue, sx, classes }) {
  if (dataIndex == null) {
    return null;
  }

  const axisFormatter =
    axis.valueFormatter ?? ((value) => (value == null ? "" : String(value)));

  const rows = [];
  let total = 0;

  for (const item of series) {
    const rawValue = item.data?.[dataIndex] ?? 0;
    const amount = Number(rawValue) || 0;
    const formattedValue = item.valueFormatter?.(rawValue, { dataIndex });

    if (formattedValue == null) {
      continue;
    }

    total += amount;
    rows.push({
      id: item.id,
      label: typeof item.label === "function" ? item.label("tooltip") : item.label,
      formattedValue,
      color: item.getColor?.(dataIndex),
    });
  }

  return (
    <ChartsTooltipPaper sx={sx} className={classes?.paper}>
      <ChartsTooltipTable className={classes?.table}>
        {axisValue != null && !axis.hideTooltip && (
          <thead>
            <ChartsTooltipRow>
              <ChartsTooltipCell colSpan={3}>
                <Typography sx={{ ...tooltipTextSx, fontWeight: 600 }}>
                  {axisFormatter(axisValue, { location: "tooltip" })}
                </Typography>
              </ChartsTooltipCell>
            </ChartsTooltipRow>
          </thead>
        )}
        <tbody>
          {rows.map((row) => (
            <ChartsTooltipRow key={row.id} className={classes?.row}>
              <ChartsTooltipCell className={classes?.markCell}>
                {row.color ? <ChartsTooltipMark color={row.color} className={classes?.mark} /> : null}
              </ChartsTooltipCell>
              <ChartsTooltipCell className={classes?.labelCell}>
                <Typography sx={tooltipTextSx}>{row.label}</Typography>
              </ChartsTooltipCell>
              <ChartsTooltipCell className={classes?.valueCell}>
                <Typography sx={tooltipTextSx}>{row.formattedValue}</Typography>
              </ChartsTooltipCell>
            </ChartsTooltipRow>
          ))}
          <ChartsTooltipRow className={classes?.row}>
            <ChartsTooltipCell className={classes?.markCell} />
            <ChartsTooltipCell className={classes?.labelCell}>
              <Typography sx={{ ...tooltipTextSx, fontWeight: 700 }}>Total</Typography>
            </ChartsTooltipCell>
            <ChartsTooltipCell className={classes?.valueCell}>
              <Typography sx={{ ...tooltipTextSx, fontWeight: 700 }}>{money(total)}</Typography>
            </ChartsTooltipCell>
          </ChartsTooltipRow>
        </tbody>
      </ChartsTooltipTable>
    </ChartsTooltipPaper>
  );
}

function buildMonthlyCollectionRows(apiRows = [], startDate = null, endDate = null) {
  const byPeriod = new Map();

  for (const row of apiRows) {
    const period = String(row.period);
    byPeriod.set(period, {
      period,
      cash_amount: Number(row.cash_amount) || 0,
      upi_amount: Number(row.upi_amount) || 0,
      cheque_amount: Number(row.cheque_amount) || 0,
      total_amount: Number(row.total_amount) || 0,
    });
  }

  const rangeStart = startDate ? new Date(`${startDate}T00:00:00`) : new Date(new Date().getFullYear(), 0, 1);
  const rangeEnd = endDate ? new Date(`${endDate}T00:00:00`) : new Date(new Date().getFullYear(), 11, 1);
  const months = [];
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const last = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);

  while (cursor <= last && months.length < 12) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months.map((period) => {
    return byPeriod.get(period) || emptyMonthlyRow(period);
  });
}

function MonthlyCollectionChart({ rows }) {
  const currentYear = new Date().getFullYear();
  const formattedDataset = useMemo(
    () =>
      rows.map((row) => ({
        month: monthLabel(row.period),
        cash: Number(row.cash_amount) || 0,
        online: Number(row.upi_amount) || 0,
        cheque: Number(row.cheque_amount) || 0,
      })),
    [rows]
  );

  const chartSetting = {
    yAxis: [
      {
        label: "collection (Rs.)",
        valueFormatter: (value) => shortMoney(value).replace("Rs. ", ""),
      },
    ],
    height: 360,
    slotProps: {
      legend: {
        direction: "row",
        position: { vertical: "top", horizontal: "center" },
        padding: 16,
      },
    },
  };

  const currencyFormatter = (value) => money(value);

  return (
    <Card sx={{ height: 460, display: "flex", flexDirection: "column", mt: 3 }}>
      <MDBox p={3} pb={1}>
        <MDTypography variant="h6" fontWeight="medium">
          Month Wise Collection
        </MDTypography>
        <MDTypography variant="button" color="text">
          All {currentYear} months · live data where available
        </MDTypography>
      </MDBox>
      <MDBox height="360px" px={3} pb={3} flexGrow={1}>
        <BarChart
          dataset={formattedDataset}
          slots={collectionChartSlots}
          tooltip={collectionChartTooltip}
          xAxis={[
            {
              scaleType: "band",
              dataKey: "month",
              categoryGapRatio: 0.3,
            },
          ]}
          series={[
            { dataKey: "cash", label: "Cash", color: "#2e7d32", valueFormatter: currencyFormatter },
            { dataKey: "online", label: "Online", color: "#0288d1", valueFormatter: currencyFormatter },
            { dataKey: "cheque", label: "Cheque", color: "#ed6c02", valueFormatter: currencyFormatter },
          ]}
          {...chartSetting}
        />
      </MDBox>
    </Card>
  );
}

MonthlyCollectionChart.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function YearlyCollectionChart({ rows }) {
  const currentYear = new Date().getFullYear();
  const formattedDataset = useMemo(
    () =>
      rows.map((row) => ({
        year: String(row.period),
        cash: Number(row.cash_amount) || 0,
        online: Number(row.upi_amount) || 0,
        cheque: Number(row.cheque_amount) || 0,
        total: Number(row.total_amount) || 0,
      })),
    [rows]
  );

  const currencyFormatter = (value) => money(value);
  const chartHeight = 360;

  return (
    <Card sx={{ height: 460, display: "flex", flexDirection: "column", mt: 3 }}>
      <MDBox p={3} pb={1}>
        <MDTypography variant="h6" fontWeight="medium">
          Year Wise Collections
        </MDTypography>
        <MDTypography variant="button" color="text">
          2022–2025 demo · live data for {currentYear} and other years
        </MDTypography>
      </MDBox>
      <MDBox height="360px" px={3} pb={3} flexGrow={1}>
        <BarChart
          height={chartHeight}
          layout="horizontal"
          slots={collectionChartSlots}
          tooltip={collectionChartTooltip}
          dataset={formattedDataset}
          yAxis={[
            {
              scaleType: "band",
              dataKey: "year",
              width: 56,
            },
          ]}
          xAxis={[
            {
              valueFormatter: (value) => shortMoney(value).replace("Rs. ", ""),
            },
          ]}
          series={[
            {
              dataKey: "cash",
              label: "Cash",
              color: "#2e7d32",
              stack: "collection",
              valueFormatter: currencyFormatter,
            },
            {
              dataKey: "online",
              label: "Online",
              color: "#0288d1",
              stack: "collection",
              valueFormatter: currencyFormatter,
            },
            {
              dataKey: "cheque",
              label: "Cheque",
              color: "#ed6c02",
              stack: "collection",
              valueFormatter: currencyFormatter,
            },
          ]}
          slotProps={{
            legend: {
              direction: "row",
              position: { vertical: "top", horizontal: "center" },
              padding: 16,
            },
          }}
        />
      </MDBox>
    </Card>
  );
}

YearlyCollectionChart.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
};

const defaultPaymentModes = [
  { payment_mode: "cash", total_amount: 0 },
  { payment_mode: "upi", total_amount: 0 },
  { payment_mode: "cheque", total_amount: 0 },
];

function buildMonthlySalesDataset(monthlyList, startDate, endDate) {
  const salesMap = {};
  (monthlyList || []).forEach((row) => {
    salesMap[String(row.period || "")] = Number(row.total_sales) || 0;
  });

  const periods = [];
  if (startDate && endDate) {
    const rangeStart = new Date(`${startDate}T00:00:00`);
    const rangeEnd = new Date(`${endDate}T00:00:00`);
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);

    while (cursor <= rangeEnd) {
      const period = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      periods.push(period);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return periods.map((period) => {
    const match = period.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return { month: period, sales: salesMap[period] || 0 };
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
      monthIndex
    ];

    return {
      month: periods.length > 12 ? `${monthName} ${String(year).slice(-2)}` : monthName,
      sales: salesMap[period] || 0,
    };
  });
}

function salesChartValueFormatter(value) {
  return money(Number(value) || 0);
}

function getCollectionAmountByMode(apiRows, mode) {
  const row = (apiRows || []).find((item) => item.payment_mode === mode);
  return Number(row?.total_amount || 0);
}

function buildPaymentModePieData(apiRows) {
  const rows = defaultPaymentModes.map((def) => {
    const found = (apiRows || []).find((r) => r.payment_mode === def.payment_mode);
    return {
      payment_mode: def.payment_mode,
      total_amount: found ? Number(found.total_amount) || 0 : 0,
    };
  });

  return rows.map((row) => ({
    id: row.payment_mode,
    value: Number(row.total_amount) || 0,
    label: modeLabels[row.payment_mode] || row.payment_mode,
    color: modePieColors[row.payment_mode],
  }));
}

function pieSliceAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && Number.isFinite(Number(value.value))) {
    return Number(value.value);
  }
  return 0;
}

function PaymentModePieChart({ data, title, icon, iconColor = "info", actions }) {
  const total = useMemo(() => data.reduce((sum, item) => sum + pieSliceAmount(item.value), 0), [data]);
  const valueFormatter = (value) => money(pieSliceAmount(value));

  return (
    <Card sx={{ height: "100%" }}>
      <MDBox p={3}>
        <MDBox display="flex" alignItems="center" mb={actions ? 1 : 1.5}>
          <MDBox
            width="3.25rem"
            height="3.25rem"
            bgColor={iconColor}
            variant="gradient"
            coloredShadow={iconColor}
            borderRadius="xl"
            display="flex"
            justifyContent="center"
            alignItems="center"
            color="white"
            mr={1.5}
          >
            <Icon sx={{ fontSize: "1.25rem" }}>{icon}</Icon>
          </MDBox>
          <MDBox>
            <MDTypography variant="h6" sx={{ fontSize: "1rem", lineHeight: 1.3 }}>
              {title}
            </MDTypography>
            <MDTypography variant="button" color="text" fontWeight="medium" sx={{ fontSize: "0.9rem" }}>
              {money(total)} · Cash / online / cheque
            </MDTypography>
          </MDBox>
        </MDBox>
        {actions ? <MDBox mb={1.5}>{actions}</MDBox> : null}
        <MDBox display="flex" flexDirection="column" alignItems="center">
          <PieChart
            series={[
              {
                data,
                innerRadius: 40,
                outerRadius: 80,
                paddingAngle: 2,
                cornerRadius: 3,
                highlightScope: { fade: "global", highlight: "item" },
                faded: { innerRadius: 32, additionalRadius: -20, color: "gray" },
                valueFormatter,
              },
            ]}
            width={200}
            height={200}
            margin={{ top: 8, bottom: 8, left: 8, right: 8 }}
            slotProps={{
              legend: { hidden: true },
              tooltip: { sx: { fontSize: "0.75rem" } },
            }}
          />
          <MDBox
            display="flex"
            justifyContent="center"
            alignItems="center"
            flexWrap="wrap"
            gap={1.5}
            mt={1.5}
            px={1}
            width="100%"
          >
            {data.map((item) => (
              <MDBox key={item.id} display="flex" alignItems="center" gap={0.5}>
                <MDBox
                  width={8}
                  height={8}
                  borderRadius="2px"
                  sx={{ backgroundColor: item.color, flexShrink: 0 }}
                />
                <MDTypography variant="button" color="text" fontWeight="medium" sx={{ fontSize: "0.82rem", lineHeight: 1.25 }}>
                  {item.label}: {money(pieSliceAmount(item.value))}
                </MDTypography>
              </MDBox>
            ))}
          </MDBox>
        </MDBox>
      </MDBox>
    </Card>
  );
}

PaymentModePieChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.object).isRequired,
  title: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  iconColor: PropTypes.string,
  actions: PropTypes.node,
};

function getChequeDepositStatusLabel(status) {
  if (status === "missed" || status === "clearing_done") return "Missed / not deposited";
  if (status === "due_today") return "Due today";
  if (status === "alarm") return "Due in 2 days";
  return "Upcoming";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildMarketingStaffCollectionGroups(details) {
  const marketingGroups = new Map();

  details.forEach((row) => {
    const marketingKey = row.outlet_staff_id || row.outlet_staff_name || "unassigned";
    const marketingName = row.outlet_staff_name || "Unassigned";

    if (!marketingGroups.has(marketingKey)) {
      marketingGroups.set(marketingKey, {
        marketingName,
        outlets: new Map(),
        cash: 0,
        online: 0,
        cheque: 0,
        total: 0,
        companyStaffTotal: 0,
        bawarcheeStaffTotal: 0,
      });
    }

    const marketingGroup = marketingGroups.get(marketingKey);
    const outletKey = row.outlet_id || row.outlet_name || "unknown";

    if (!marketingGroup.outlets.has(outletKey)) {
      marketingGroup.outlets.set(outletKey, {
        outletName: row.outlet_name || "N/A",
        collectors: [],
        cash: 0,
        online: 0,
        cheque: 0,
        total: 0,
        companyStaffTotal: 0,
        bawarcheeStaffTotal: 0,
      });
    }

    const outletGroup = marketingGroup.outlets.get(outletKey);
    const cash = Number(row.cash_amount) || 0;
    const online = Number(row.upi_amount) || 0;
    const cheque = Number(row.cheque_amount) || 0;
    const total = Number(row.total_amount) || 0;
    const isBawarchee = row.collector_type === "bawarchee_staff";

    outletGroup.collectors.push({
      collectorType: isBawarchee ? "Bawarchee Staff" : "Company Staff",
      collectorName: isBawarchee
        ? row.bawarchee_collector_name || "N/A"
        : row.company_collector_name || marketingName,
      invoiceNumber: row.invoice_number || "N/A",
      cash,
      online,
      cheque,
      total,
    });

    outletGroup.cash += cash;
    outletGroup.online += online;
    outletGroup.cheque += cheque;
    outletGroup.total += total;
    if (isBawarchee) {
      outletGroup.bawarcheeStaffTotal += total;
      marketingGroup.bawarcheeStaffTotal += total;
    } else {
      outletGroup.companyStaffTotal += total;
      marketingGroup.companyStaffTotal += total;
    }

    marketingGroup.cash += cash;
    marketingGroup.online += online;
    marketingGroup.cheque += cheque;
    marketingGroup.total += total;
  });

  return [...marketingGroups.values()].sort((a, b) => a.marketingName.localeCompare(b.marketingName));
}

function PurchasePeriodTable({ title, rows, periodLabel }) {
  return (
    <Card sx={{ height: "100%" }}>
      <MDBox p={3} pb={1}>
        <MDTypography variant="h6" fontWeight="medium">
          {title}
        </MDTypography>
      </MDBox>
      <MDBox px={3} pb={3}>
        <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
          <Table size="small">
            <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }}>{periodLabel}</TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>Invoices</TableCell>
                <TableCell align="right" sx={{ fontWeight: "bold" }}>Purchase</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.period}>
                  <TableCell>{row.period}</TableCell>
                  <TableCell align="right">{Number(row.count) || 0}</TableCell>
                  <TableCell align="right">{money(row.total_purchase)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                    <MDTypography variant="body2" color="text">
                      No purchase records found.
                    </MDTypography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MDBox>
    </Card>
  );
}

PurchasePeriodTable.propTypes = {
  title: PropTypes.string.isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  periodLabel: PropTypes.string.isRequired,
};

function Dashboard() {
  const financialYearOptions = useMemo(() => getFinancialYearOptions(), []);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [reportData, setReportData] = useState(emptyReportData);
  const [purchaseReportData, setPurchaseReportData] = useState(emptyPurchaseReportData);
  const [activeDashboardTab, setActiveDashboardTab] = useState("purchase");
  const [chequeDialogOpen, setChequeDialogOpen] = useState(false);
  const [paidCollectionDialogOpen, setPaidCollectionDialogOpen] = useState(false);
  const [collectionPrintDate, setCollectionPrintDate] = useState(getTodayLocalDate());
  const [totalCollectionFromDate, setTotalCollectionFromDate] = useState(getMonthStartLocalDate());
  const [totalCollectionToDate, setTotalCollectionToDate] = useState(getTodayLocalDate());
  const [collectionDateReportData, setCollectionDateReportData] = useState({
    todayCollection: [],
    todayCollectionDetails: [],
  });
  const [totalCollectionReportData, setTotalCollectionReportData] = useState({
    collectionByMode: [],
    collectionDetails: [],
    staffCollectionByDate: [],
  });
  const [collectionDateLoading, setCollectionDateLoading] = useState(false);
  const [totalCollectionLoading, setTotalCollectionLoading] = useState(false);
  const [collectionStaffOptions, setCollectionStaffOptions] = useState([]);
  const [selectedCollectionStaffId, setSelectedCollectionStaffId] = useState("");
  const [salesChartFromDate, setSalesChartFromDate] = useState("2026-01-01");
  const [salesChartToDate, setSalesChartToDate] = useState(getTodayLocalDate());
  const [selectedSalesStaffId, setSelectedSalesStaffId] = useState("");
  const [salesChartMonthlyData, setSalesChartMonthlyData] = useState([]);
  const [salesChartLoading, setSalesChartLoading] = useState(false);

  const monthOptions = useMemo(
    () => getMonthOptions(selectedFinancialYear),
    [selectedFinancialYear]
  );

  const selectedFinancialYearOption = financialYearOptions.find(
    (option) => option.value === selectedFinancialYear
  );
  const selectedMonthOption = monthOptions.find((option) => option.value === selectedMonth);
  const reportStartDate = selectedMonthOption?.startDate || selectedFinancialYearOption?.startDate || null;
  const reportEndDate = selectedMonthOption?.endDate || selectedFinancialYearOption?.endDate || null;

  const reportPeriodLabel = useMemo(() => {
    if (selectedMonthOption) return selectedMonthOption.label;
    if (selectedFinancialYearOption) return selectedFinancialYearOption.label;
    return "All Records";
  }, [selectedMonthOption, selectedFinancialYearOption]);

  const selectedCollectionStaffName =
    collectionStaffOptions.find((staff) => staff.id === Number(selectedCollectionStaffId))?.name ||
    "All Staff";

  const selectedSalesStaffName =
    collectionStaffOptions.find((staff) => staff.id === Number(selectedSalesStaffId))?.name ||
    "All Staff";

  const paidCollectionBreakdown = useMemo(
    () => ({
      cash: getCollectionAmountByMode(reportData.collectionByMode, "cash"),
      upi: getCollectionAmountByMode(reportData.collectionByMode, "upi"),
      cheque: getCollectionAmountByMode(reportData.collectionByMode, "cheque"),
    }),
    [reportData.collectionByMode]
  );

  const paidCollectionTotal =
    paidCollectionBreakdown.cash + paidCollectionBreakdown.upi + paidCollectionBreakdown.cheque;

  const fetchReports = async () => {
    try {
      const params = new URLSearchParams();
      if (reportStartDate) params.set("startDate", reportStartDate);
      if (reportEndDate) params.set("endDate", reportEndDate);

      const query = params.toString();
      const response = await fetch(`${API}/staff/reports${query ? `?${query}` : ""}`);
      if (response.ok) {
        const data = await response.json();
        setReportData({ ...emptyReportData, ...data });
      } else {
        setReportData(emptyReportData);
      }
    } catch (error) {
      console.error("Error fetching dashboard reports:", error);
      setReportData(emptyReportData);
    }
  };

  const fetchPurchaseReports = async () => {
    try {
      const params = new URLSearchParams();
      if (reportStartDate) params.set("startDate", reportStartDate);
      if (reportEndDate) params.set("endDate", reportEndDate);

      const query = params.toString();
      const response = await fetch(`${API}/staff/purchase-reports${query ? `?${query}` : ""}`);
      if (response.ok) {
        const data = await response.json();
        setPurchaseReportData({ ...emptyPurchaseReportData, ...data });
      } else {
        setPurchaseReportData(emptyPurchaseReportData);
      }
    } catch (error) {
      console.error("Error fetching purchase dashboard reports:", error);
      setPurchaseReportData(emptyPurchaseReportData);
    }
  };

  const fetchCollectionDateReport = async (date) => {
    if (!date) {
      return { todayCollection: [], todayCollectionDetails: [] };
    }

    const params = new URLSearchParams({
      startDate: date,
      endDate: date,
    });
    const response = await fetch(`${API}/staff/reports?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Failed to fetch collection report.");
    }

    const data = await response.json();
    return {
      todayCollection: data.todayCollection || [],
      todayCollectionDetails: data.todayCollectionDetails || [],
    };
  };

  const fetchTotalCollectionReport = async (startDate, endDate, staffId = "") => {
    if (!startDate || !endDate) {
      return { collectionByMode: [], collectionDetails: [], staffCollectionByDate: [] };
    }

    const params = new URLSearchParams({ startDate, endDate });
    if (staffId) {
      params.set("staffId", staffId);
    }
    const response = await fetch(`${API}/staff/reports?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Failed to fetch total collection report.");
    }

    const data = await response.json();
    return {
      collectionByMode: data.collectionByMode || [],
      collectionDetails: data.collectionDetails || [],
      staffCollectionByDate: data.staffCollectionByDate || [],
    };
  };

  const fetchSalesChartReport = async (startDate, endDate, staffId = "") => {
    if (!startDate || !endDate) {
      return [];
    }

    const params = new URLSearchParams({ startDate, endDate });
    if (staffId) {
      params.set("staffId", staffId);
    }
    const response = await fetch(`${API}/staff/reports?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Failed to fetch sales chart report.");
    }

    const data = await response.json();
    return data.salesByPeriod?.monthly || [];
  };

  useEffect(() => {
    const fetchCollectionStaffOptions = async () => {
      try {
        const response = await fetch(`${API}/staff`);
        if (response.ok) {
          const data = await response.json();
          setCollectionStaffOptions(data);
        }
      } catch (error) {
        console.error("Error fetching staff options:", error);
      }
    };

    fetchCollectionStaffOptions();
  }, []);

  useEffect(() => {
    fetchReports();
    fetchPurchaseReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportStartDate, reportEndDate]);

  useEffect(() => {
    let ignore = false;

    const loadCollectionDateReport = async () => {
      setCollectionDateLoading(true);
      try {
        const data = await fetchCollectionDateReport(collectionPrintDate);
        if (!ignore) {
          setCollectionDateReportData(data);
        }
      } catch (error) {
        console.error("Error fetching collection date report:", error);
        if (!ignore) {
          setCollectionDateReportData({ todayCollection: [], todayCollectionDetails: [] });
        }
      } finally {
        if (!ignore) {
          setCollectionDateLoading(false);
        }
      }
    };

    loadCollectionDateReport();

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPrintDate]);

  useEffect(() => {
    let ignore = false;

    const loadTotalCollectionReport = async () => {
      if (!totalCollectionFromDate || !totalCollectionToDate) {
        setTotalCollectionReportData({ collectionByMode: [], collectionDetails: [], staffCollectionByDate: [] });
        return;
      }

      if (totalCollectionFromDate > totalCollectionToDate) {
        setTotalCollectionReportData({ collectionByMode: [], collectionDetails: [], staffCollectionByDate: [] });
        return;
      }

      setTotalCollectionLoading(true);
      try {
        const data = await fetchTotalCollectionReport(
          totalCollectionFromDate,
          totalCollectionToDate,
          selectedCollectionStaffId
        );
        if (!ignore) {
          setTotalCollectionReportData(data);
        }
      } catch (error) {
        console.error("Error fetching total collection report:", error);
        if (!ignore) {
          setTotalCollectionReportData({ collectionByMode: [], collectionDetails: [], staffCollectionByDate: [] });
        }
      } finally {
        if (!ignore) {
          setTotalCollectionLoading(false);
        }
      }
    };

    loadTotalCollectionReport();

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCollectionFromDate, totalCollectionToDate, selectedCollectionStaffId]);

  useEffect(() => {
    let ignore = false;

    const loadSalesChartReport = async () => {
      if (!salesChartFromDate || !salesChartToDate) {
        setSalesChartMonthlyData([]);
        return;
      }

      if (salesChartFromDate > salesChartToDate) {
        setSalesChartMonthlyData([]);
        return;
      }

      setSalesChartLoading(true);
      try {
        const data = await fetchSalesChartReport(
          salesChartFromDate,
          salesChartToDate,
          selectedSalesStaffId
        );
        if (!ignore) {
          setSalesChartMonthlyData(data);
        }
      } catch (error) {
        console.error("Error fetching sales chart report:", error);
        if (!ignore) {
          setSalesChartMonthlyData([]);
        }
      } finally {
        if (!ignore) {
          setSalesChartLoading(false);
        }
      }
    };

    loadSalesChartReport();

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesChartFromDate, salesChartToDate, selectedSalesStaffId]);

  const handleFinancialYearChange = (value) => {
    setSelectedFinancialYear(value);
    setSelectedMonth("");
  };

  const todayCollectionTotal = useMemo(
    () => sumRows(reportData.todayCollection),
    [reportData.todayCollection]
  );

  const collectionModePieData = useMemo(
    () => buildPaymentModePieData(totalCollectionReportData.collectionByMode),
    [totalCollectionReportData.collectionByMode]
  );

  const todayCollectionPieData = useMemo(
    () => buildPaymentModePieData(collectionDateReportData.todayCollection),
    [collectionDateReportData.todayCollection]
  );

  const writeCollectionPrintReport = (printWindow, details, periodLabel) => {
    const cashTotal = details.reduce((total, row) => total + (Number(row.cash_amount) || 0), 0);
    const chequeTotal = details.reduce((total, row) => total + (Number(row.cheque_amount) || 0), 0);
    const onlineTotal = details.reduce((total, row) => total + (Number(row.upi_amount) || 0), 0);
    const grandTotal = cashTotal + chequeTotal + onlineTotal;
    const amountBoxClass = (value) => `box ${Number(value || 0) > 0 ? "box-active" : ""}`;
    const marketingGroups = buildMarketingStaffCollectionGroups(details);

    const staffBoxesHtml = marketingGroups
      .map(
        (marketingGroup) => {
          const outletsHtml = [...marketingGroup.outlets.values()]
            .sort((a, b) => a.outletName.localeCompare(b.outletName))
            .map(
              (outletGroup) => `
                <div class="outlet-block">
                  <h3>Outlet: ${escapeHtml(outletGroup.outletName)}</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Collector Type</th>
                        <th>Collector Name</th>
                        <th>Invoice</th>
                        <th class="right">Cash</th>
                        <th class="right">Online</th>
                        <th class="right">Cheque</th>
                        <th class="right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${outletGroup.collectors
                  .map(
                    (collector) => `
                            <tr>
                              <td>${escapeHtml(collector.collectorType)}</td>
                              <td>${escapeHtml(collector.collectorName)}</td>
                              <td>${escapeHtml(collector.invoiceNumber)}</td>
                              <td class="right">Rs. ${collector.cash.toFixed(2)}</td>
                              <td class="right">Rs. ${collector.online.toFixed(2)}</td>
                              <td class="right">Rs. ${collector.cheque.toFixed(2)}</td>
                              <td class="right">Rs. ${collector.total.toFixed(2)}</td>
                            </tr>
                          `
                  )
                  .join("")}
                      <tr class="outlet-total-row">
                        <td colspan="3"><strong>Outlet Total</strong></td>
                        <td class="right"><strong>Rs. ${outletGroup.cash.toFixed(2)}</strong></td>
                        <td class="right"><strong>Rs. ${outletGroup.online.toFixed(2)}</strong></td>
                        <td class="right"><strong>Rs. ${outletGroup.cheque.toFixed(2)}</strong></td>
                        <td class="right"><strong>Rs. ${outletGroup.total.toFixed(2)}</strong></td>
                      </tr>
                      <tr class="split-total-row">
                        <td colspan="6">Company Staff Collection</td>
                        <td class="right">Rs. ${outletGroup.companyStaffTotal.toFixed(2)}</td>
                      </tr>
                      <tr class="split-total-row">
                        <td colspan="6">Bawarchee Staff Collection</td>
                        <td class="right">Rs. ${outletGroup.bawarcheeStaffTotal.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              `
            )
            .join("");

          return `
          <section class="staff-card">
            <div class="staff-header">
              <h2>Company Staff: ${escapeHtml(marketingGroup.marketingName)}</h2>
              <span>${marketingGroup.outlets.size} outlet${marketingGroup.outlets.size === 1 ? "" : "s"}</span>
            </div>
            <div class="totals staff-totals">
              <div class="${amountBoxClass(marketingGroup.cash)}"><div class="label">Cash</div><div class="value">Rs. ${marketingGroup.cash.toFixed(2)}</div></div>
              <div class="${amountBoxClass(marketingGroup.online)}"><div class="label">Online</div><div class="value">Rs. ${marketingGroup.online.toFixed(2)}</div></div>
              <div class="${amountBoxClass(marketingGroup.cheque)}"><div class="label">Cheque</div><div class="value">Rs. ${marketingGroup.cheque.toFixed(2)}</div></div>
              <div class="${amountBoxClass(marketingGroup.total)}"><div class="label">Total</div><div class="value">Rs. ${marketingGroup.total.toFixed(2)}</div></div>
            </div>
            <div class="split-summary">
              <span>Company Staff: Rs. ${marketingGroup.companyStaffTotal.toFixed(2)}</span>
              <span>Bawarchee Staff: Rs. ${marketingGroup.bawarcheeStaffTotal.toFixed(2)}</span>
              <span><strong>Combined Total: Rs. ${marketingGroup.total.toFixed(2)}</strong></span>
            </div>
            ${outletsHtml}
          </section>
        `;
        }
      )
      .join("");

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Collection Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
            h1 { font-size: 22px; margin: 0 0 6px; }
            h2 { font-size: 16px; margin: 0; }
            .sub { color: #4b5563; margin-bottom: 18px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; font-weight: 700; }
            .right { text-align: right; }
            .totals { margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
            .box { border: 1px solid #d1d5db; padding: 10px; border-radius: 6px; background: #fff; }
            .box-active { border-color: #1d4ed8; background: #eff6ff; }
            .label { color: #6b7280; font-size: 12px; }
            .box-active .label { color: #1e40af; }
            .value { font-weight: 700; font-size: 16px; margin-top: 4px; }
            .box-active .value { color: #1d4ed8; }
            .staff-card { border: 1px solid #d1d5db; border-radius: 8px; padding: 14px; margin-top: 16px; break-inside: avoid; }
            .staff-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
            .staff-header span { color: #6b7280; font-size: 12px; }
            .staff-totals { margin: 0 0 12px; }
            .split-summary { display: flex; flex-wrap: wrap; gap: 16px; margin: 0 0 14px; font-size: 12px; color: #374151; }
            .outlet-block { margin-top: 14px; }
            .outlet-block h3 { font-size: 14px; margin: 0 0 8px; color: #1f2937; }
            .outlet-total-row { background: #f8fafc; }
            .split-total-row { background: #f9fafb; color: #4b5563; }
            .empty { padding: 24px; text-align: center; color: #6b7280; border: 1px solid #d1d5db; }
            @media print { body { margin: 16mm; } }
          </style>
        </head>
        <body>
          <h1>Collection Report</h1>
          <div class="sub">Period: ${escapeHtml(periodLabel)} | Grouped by company staff (marketing person), with bawarchee staff collector breakdown per outlet</div>
          ${details.length > 0
        ? staffBoxesHtml
        : `<div class="empty">No collection found for this period.</div>`
      }
          <div class="totals">
            <div class="${amountBoxClass(cashTotal)}"><div class="label">Total Cash</div><div class="value">Rs. ${cashTotal.toFixed(2)}</div></div>
            <div class="${amountBoxClass(chequeTotal)}"><div class="label">Total Cheque</div><div class="value">Rs. ${chequeTotal.toFixed(2)}</div></div>
            <div class="${amountBoxClass(onlineTotal)}"><div class="label">Total Online</div><div class="value">Rs. ${onlineTotal.toFixed(2)}</div></div>
            <div class="${amountBoxClass(grandTotal)}"><div class="label">Grand Total</div><div class="value">Rs. ${grandTotal.toFixed(2)}</div></div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handlePrintTodayCollection = async () => {
    if (!collectionPrintDate) {
      alert("Please choose a date.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }

    printWindow.document.write("<p style=\"font-family: Arial, sans-serif; padding: 24px;\">Preparing collection report...</p>");
    printWindow.document.close();

    try {
      const data =
        collectionDateReportData.todayCollectionDetails.length > 0 || collectionDateReportData.todayCollection.length > 0
          ? collectionDateReportData
          : await fetchCollectionDateReport(collectionPrintDate);
      writeCollectionPrintReport(
        printWindow,
        data.todayCollectionDetails || [],
        formatDate(collectionPrintDate)
      );
    } catch (error) {
      console.error("Error printing collection report:", error);
      printWindow.document.open();
      printWindow.document.write("<p style=\"font-family: Arial, sans-serif; padding: 24px;\">Unable to load collection report.</p>");
      printWindow.document.close();
    }
  };

  const handlePrintTotalCollection = async () => {
    if (!totalCollectionFromDate || !totalCollectionToDate) {
      alert("Please choose from and to dates.");
      return;
    }

    if (totalCollectionFromDate > totalCollectionToDate) {
      alert("From date cannot be after to date.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }

    printWindow.document.write("<p style=\"font-family: Arial, sans-serif; padding: 24px;\">Preparing collection report...</p>");
    printWindow.document.close();

    const periodLabel = `${formatDate(totalCollectionFromDate)} to ${formatDate(totalCollectionToDate)}${selectedCollectionStaffId ? ` | ${selectedCollectionStaffName}` : ""
      }`;

    try {
      const data =
        totalCollectionReportData.collectionDetails.length > 0 ||
          totalCollectionReportData.collectionByMode.length > 0
          ? totalCollectionReportData
          : await fetchTotalCollectionReport(
            totalCollectionFromDate,
            totalCollectionToDate,
            selectedCollectionStaffId
          );

      writeCollectionPrintReport(printWindow, data.collectionDetails || [], periodLabel);
    } catch (error) {
      console.error("Error printing total collection report:", error);
      printWindow.document.open();
      printWindow.document.write("<p style=\"font-family: Arial, sans-serif; padding: 24px;\">Unable to load collection report.</p>");
      printWindow.document.close();
    }
  };

  const monthlySalesDataset = useMemo(
    () => buildMonthlySalesDataset(salesChartMonthlyData, salesChartFromDate, salesChartToDate),
    [salesChartMonthlyData, salesChartFromDate, salesChartToDate]
  );

  const monthlySalesTotal = useMemo(
    () => monthlySalesDataset.reduce((sum, row) => sum + (Number(row.sales) || 0), 0),
    [monthlySalesDataset]
  );

  const monthlyPurchaseChart = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const purchasesByMonth = monthNames.map(() => 0);

    const monthlyList = purchaseReportData.purchasesByPeriod?.monthly || [];
    monthlyList.forEach((row) => {
      const match = String(row.period || "").match(/^(\d{4})-(\d{2})$/);
      if (match) {
        const monthIndex = Number(match[2]) - 1;
        purchasesByMonth[monthIndex] = Number(row.total_purchase) || 0;
      }
    });

    return {
      labels: monthNames,
      datasets: {
        label: "Monthly Purchase",
        data: purchasesByMonth,
      },
    };
  }, [purchaseReportData.purchasesByPeriod?.monthly]);

  const monthlyCollectionRows = useMemo(
    () => buildMonthlyCollectionRows(reportData.monthlyCollection, reportStartDate, reportEndDate),
    [reportData.monthlyCollection, reportStartDate, reportEndDate]
  );

  const yearlyCollectionRows = useMemo(
    () => buildYearlyCollectionRows(reportData.yearlyCollection),
    [reportData.yearlyCollection]
  );

  // const monthlyPurchaseRows = purchaseReportData.purchasesByPeriod?.monthly || [];
  // const yearlyPurchaseRows = purchaseReportData.purchasesByPeriod?.yearly || [];
  const purchaseSummaryCards = [
    {
      color: "info",
      icon: "payments",
      title: "Total Gross",
      count: shortMoney(purchaseReportData.summary.total_gross_amount),
      label: "Gross purchase value",
    },
    {
      color: "error",
      icon: "local_offer",
      title: "Trader Discount",
      count: shortMoney(purchaseReportData.summary.total_trader_discount),
      label: "Trader discount total",
    },
    {
      color: "error",
      icon: "discount",
      title: "Primary Discount",
      count: shortMoney(purchaseReportData.summary.total_primary_discount),
      label: "Primary discount total",
    },
    {
      color: "error",
      icon: "sell",
      title: "Secondary Discount",
      count: shortMoney(purchaseReportData.summary.total_secondary_discount),
      label: "Secondary discount total",
    },
    {
      color: "error",
      icon: "sell",
      // title: "Trader Discount+Primary Discount+Secondary Discount",
      count: shortMoney(purchaseReportData.summary.total_trader_discount + purchaseReportData.summary.total_primary_discount + purchaseReportData.summary.total_secondary_discount),
      label: "Trader discount + primary discount + secondary discount total",
    },
    {
      color: "error",
      icon: "money_off",
      title: "Cash Discount",
      count: shortMoney(purchaseReportData.summary.total_cash_discount),
      label: "Cash discount total",
    },
    {
      color: "warning",
      icon: "summarize",
      title: "Taxable Value",
      count: shortMoney(purchaseReportData.summary.total_taxable_value),
      label: "After discounts",
    },
    {
      color: "success",
      icon: "percent",
      title: "Total SGST",
      count: shortMoney(purchaseReportData.summary.total_sgst_amount),
      label: "SGST amount",
    },
    {
      color: "success",
      icon: "percent",
      title: "Total CGST",
      count: shortMoney(purchaseReportData.summary.total_cgst_amount),
      label: "CGST amount",
    },
    {
      color: "success",
      icon: "receipt",
      title: "Total GST",
      count: shortMoney(purchaseReportData.summary.total_gst_amount),
      label: "SGST + CGST",
    },
    {
      color: "dark",
      icon: "receipt_long",
      title: "Total Amount",
      count: shortMoney(purchaseReportData.summary.total_purchase),
      amount: purchaseReportData.summary.total_invoices,
      label: "purchase invoices",
    },
    {
      color: "dark",
      icon: "store",
      title: "Purchase Sellers",
      count: (purchaseReportData.summary.seller_count),
      // amount: purchaseReportData.summary.seller_count,
      label: "Sellers included in the selected period.",
    }
  ];

  const pendingChequeRows = reportData.pendingChequeReports || [];
  const chequePendingCount = pendingChequeRows.length;
  const chequeMissedCount = pendingChequeRows.filter(
    (row) => row.report_status === "missed" || row.report_status === "clearing_done"
  ).length;

  const totalCreditDues = Number(reportData.creditDuesSummary?.total_credit_dues) || 0;
  const creditDuesCount = Number(reportData.creditDuesSummary?.credit_dues_count) || 0;
  const totalPaidAmount = Number(reportData.summary.total_paid) || 0;
  const netCollection = totalPaidAmount - totalCreditDues;

  return (
    <DashboardLayout>
      <DashboardNavbar />

      <MDBox pt={3} px={1}>
        <Card sx={{ display: "inline-flex", p: 0.5, boxShadow: "none", border: "1px solid #e5e7eb" }}>
          <Tabs
            value={activeDashboardTab}
            onChange={(_, value) => setActiveDashboardTab(value)}
            textColor="primary"
            indicatorColor="primary"
            sx={{
              minHeight: 42,
              "& .MuiTab-root": {
                minHeight: 42,
                px: 2.5,
                fontSize: "0.8rem",
                fontWeight: 700,
                textTransform: "none",
              },
            }}
          >
            <Tab value="purchase" icon={<Icon>inventory_2</Icon>} iconPosition="start" label="Purchase Dashboard" />
            <Tab value="sales" icon={<Icon>query_stats</Icon>} iconPosition="start" label="Sales Dashboard" />
          </Tabs>
        </Card>
      </MDBox>

      {activeDashboardTab === "purchase" && (
        <MDBox py={3}>
          <MDBox
            mb={1}
            display="flex"
            justifyContent="space-between"
            alignItems="flex-start"
            flexWrap="wrap"
            gap={2}
          >
            <MDBox>
              <MDTypography variant="h4" fontWeight="medium" color="dark">
                Purchase Dashboard
              </MDTypography>
              <MDTypography variant="body2" color="text">
                Live purchase invoice, taxable value, GST, and seller overview.
              </MDTypography>
            </MDBox>
            <MDBox display="flex" gap={1.5} flexWrap="wrap" alignItems="center" sx={{ ml: { xs: 0, md: "auto" } }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="purchase-dashboard-financial-year-label">Financial Year</InputLabel>
                <Select
                  labelId="purchase-dashboard-financial-year-label"
                  value={selectedFinancialYear}
                  label="Financial Year"
                  onChange={(event) => handleFinancialYearChange(event.target.value)}
                  sx={{ height: 44, backgroundColor: "#fff" }}
                >
                  <MenuItem value="">All Years</MenuItem>
                  {financialYearOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }} disabled={!selectedFinancialYear}>
                <InputLabel id="purchase-dashboard-month-label">Month</InputLabel>
                <Select
                  labelId="purchase-dashboard-month-label"
                  value={selectedMonth}
                  label="Month"
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  sx={{ height: 44, backgroundColor: "#fff" }}
                >
                  <MenuItem value="">All Months</MenuItem>
                  {monthOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </MDBox>
          </MDBox>

          <MDBox mt={4}>
            <Grid container spacing={3}>
              {purchaseSummaryCards.map((card) => (
                <Grid item xs={12} md={6} lg={3} key={card.title}>
                  <MDBox mb={1.5}>
                    <ComplexStatisticsCard
                      color={card.color}
                      icon={card.icon}
                      title={card.title}
                      count={card.count}
                      percentage={{
                        color: card.color,
                        amount: card.amount ?? "",
                        label: card.label,
                      }}
                    />
                  </MDBox>
                </Grid>
              ))}
              {/* <Grid item xs={12} md={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" fontWeight="medium">
                  Purchase Sellers
                </MDTypography>
                <MDTypography variant="h3" color="success">
                  {purchaseReportData.summary.seller_count}
                </MDTypography>
                <MDTypography variant="body2" color="text">
                  Sellers included in the selected period.
                </MDTypography>
              </MDBox>
            </Card>
          </Grid> */}
              {/* <Grid item xs={12} md={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" fontWeight="medium">
                  Average Purchase
                </MDTypography>
                <MDTypography variant="h3" color="info">
                  {shortMoney(purchaseReportData.summary.average_purchase)}
                </MDTypography>
                <MDTypography variant="body2" color="text">
                  Average rounded invoice total.
                </MDTypography>
              </MDBox>
            </Card>
          </Grid> */}
            </Grid>

          </MDBox>

          <MDBox mt={4.5}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6} lg={4} display="flex">
                <MDBox mb={3} width="100%" height={380} sx={{ "& > div": { height: "100%" } }}>
                  <ReportsBarChart
                    color="info"
                    title="monthly purchase"
                    description="Purchase invoice value by month"
                    date="all records"
                    chart={monthlyPurchaseChart}
                  />
                </MDBox>
              </Grid>
              {/* <Grid item xs={12} md={6} lg={4}>
              <MDBox mb={3}>
                <ReportsLineChart
                  color="success"
                  title="weekly sales"
                  description="Recent week-wise sales trend"
                  date="all records"
                  chart={weeklySalesChart}
                />
              </MDBox>
            </Grid> */}
              <Grid item xs={12} md={6} lg={4} display="flex">
                <MDBox mb={3} width="100%" height={380}>
                  <Card sx={{ height: "100%" }}>
                    <MDBox p={3}>
                      <MDBox display="flex" alignItems="center" mb={1.5}>
                        <MDBox
                          width="3.25rem"
                          height="3.25rem"
                          bgColor="warning"
                          variant="gradient"
                          coloredShadow="warning"
                          borderRadius="xl"
                          display="flex"
                          justifyContent="center"
                          alignItems="center"
                          color="white"
                          mr={1.5}
                        >
                          <Icon sx={{ fontSize: "1.25rem" }}>receipt</Icon>
                        </MDBox>
                        <MDBox>
                          <MDTypography variant="h6" sx={{ fontSize: "1rem", lineHeight: 1.3 }}>
                            Purchase Invoices
                          </MDTypography>
                          <MDTypography variant="button" color="text" fontWeight="medium" sx={{ fontSize: "0.9rem" }}>
                            {purchaseReportData.summary.total_invoices} invoices in selected period
                          </MDTypography>
                        </MDBox>
                      </MDBox>
                      <MDTypography variant="h3" color="dark">
                        {purchaseReportData.summary.total_invoices}
                      </MDTypography>
                      <MDTypography variant="body2" color="text">
                        Filtered by invoice date, with created date used when invoice date is missing.
                      </MDTypography>
                    </MDBox>
                  </Card>
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={4} display="flex">
                <MDBox mb={3} width="100%" height={380}>
                  <Card sx={{ height: "100%" }}>
                    <MDBox p={3}>
                      <MDBox display="flex" alignItems="center" mb={1.5}>
                        <MDBox
                          width="3.25rem"
                          height="3.25rem"
                          bgColor="success"
                          variant="gradient"
                          coloredShadow="success"
                          borderRadius="xl"
                          display="flex"
                          justifyContent="center"
                          alignItems="center"
                          color="white"
                          mr={1.5}
                        >
                          <Icon sx={{ fontSize: "1.25rem" }}>store</Icon>
                        </MDBox>
                        <MDBox>
                          <MDTypography variant="h6" sx={{ fontSize: "1rem", lineHeight: 1.3 }}>
                            Seller Coverage
                          </MDTypography>
                          <MDTypography variant="button" color="text" fontWeight="medium" sx={{ fontSize: "0.9rem" }}>
                            {purchaseReportData.summary.seller_count} sellers with purchases
                          </MDTypography>
                        </MDBox>
                      </MDBox>
                      <MDTypography variant="h3" color="dark">
                        {purchaseReportData.summary.seller_count}
                      </MDTypography>
                      <MDTypography variant="body2" color="text">
                        Distinct sellers counted from saved purchase invoices.
                      </MDTypography>
                    </MDBox>
                  </Card>
                </MDBox>
              </Grid>
            </Grid>
          </MDBox>

          <MDBox mt={1}>
            {/* <Grid container spacing={3}>
            <Grid item xs={12} lg={6} display="flex">
              <MDBox mb={3} width="100%">
                <PurchasePeriodTable
                  title="Month Wise Purchase"
                  rows={monthlyPurchaseRows}
                  periodLabel="Month"
                />
              </MDBox>
            </Grid>
           
            <Grid item xs={12} lg={6} display="flex">
              <MDBox mb={3} width="100%">
                <PurchasePeriodTable
                  title="Year Wise Purchase"
                  rows={yearlyPurchaseRows}
                  periodLabel="Year"
                />
              </MDBox>
            </Grid>
          </Grid> */}
          </MDBox>

          <Grid container spacing={3}>

            {/* <Grid item xs={12} md={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" fontWeight="medium">
                  Credit Dues
                </MDTypography>
                <MDTypography variant="h3" color={totalCreditDues > 0 ? "error" : "success"}>
                  {shortMoney(totalCreditDues)}
                </MDTypography>
                <MDTypography variant="body2" color="text">
                  {creditDuesCount} open credit {creditDuesCount === 1 ? "entry" : "entries"} with unpaid balance.
                </MDTypography>
              </MDBox>
            </Card>
          </Grid> */}

          </Grid>
        </MDBox>
      )}




      {/* //sales dashboard */}

      {activeDashboardTab === "sales" && (
        <MDBox py={3}>
          <MDBox
            mb={1}
            display="flex"
            justifyContent="space-between"
            alignItems="flex-start"
            flexWrap="wrap"
            gap={2}
          >
            <MDBox>
              <MDTypography variant="h4" fontWeight="medium" color="dark">
                Sales Dashboard
              </MDTypography>
              <MDTypography variant="body2" color="text">
                Live sales, collection, outstanding, cheque, and dues overview.
              </MDTypography>
            </MDBox>
            <MDBox display="flex" gap={1.5} flexWrap="wrap" alignItems="center" sx={{ ml: { xs: 0, md: "auto" } }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="dashboard-financial-year-label">Financial Year</InputLabel>
                <Select
                  labelId="dashboard-financial-year-label"
                  value={selectedFinancialYear}
                  label="Financial Year"
                  onChange={(event) => handleFinancialYearChange(event.target.value)}
                  sx={{ height: 44, backgroundColor: "#fff" }}
                >
                  <MenuItem value="">All Years</MenuItem>
                  {financialYearOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }} disabled={!selectedFinancialYear}>
                <InputLabel id="dashboard-month-label">Month</InputLabel>
                <Select
                  labelId="dashboard-month-label"
                  value={selectedMonth}
                  label="Month"
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  sx={{ height: 44, backgroundColor: "#fff" }}
                >
                  <MenuItem value="">All Months</MenuItem>
                  {monthOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </MDBox>
          </MDBox>

          <MDBox mt={4}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="info"
                    icon="receipt_long"
                    title="Total Sales"
                    count={shortMoney(reportData.summary.total_sales)}
                    percentage={{
                      color: "info",
                      amount: "",
                      label: "All sales",
                    }}
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5} position="relative">
                  <ComplexStatisticsCard
                    color="success"
                    icon="payments"
                    title="Total Paid"
                    count={shortMoney(reportData.summary.total_paid)}
                    percentage={{
                      color: "success",
                      amount: "",
                      label: "Paid invoice amount",
                    }}
                  />
                  <MDBox
                    position="absolute"
                    bottom={14}
                    right={16}
                    display="flex"
                    alignItems="center"
                    onClick={() => setPaidCollectionDialogOpen(true)}
                    sx={{ cursor: "pointer", color: "#7b809a", "&:hover": { color: "#344767" } }}
                    title="View collection breakdown"
                  >
                    <Icon sx={{ fontSize: "1.1rem" }}>visibility</Icon>
                  </MDBox>
                </MDBox>
              </Grid>


              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="error"
                    icon="credit_card"
                    title="Total Credit Dues"
                    count={shortMoney(totalCreditDues)}
                    percentage={{
                      color: creditDuesCount > 0 ? "error" : "success",
                      amount: creditDuesCount,
                      label: "open credit entries",
                    }}
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="primary"
                    icon="savings"
                    title="Collection"
                    count={shortMoney(netCollection)}
                    percentage={{
                      color: netCollection >= 0 ? "success" : "error",
                      amount: "",
                      label: "Total Paid - Credit Dues",
                    }}
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="warning"
                    icon="account_balance_wallet"
                    title="Outstanding"
                    count={shortMoney(reportData.summary.total_outstanding)}
                    percentage={{
                      color: "warning",
                      amount: "",
                      label: "Unpaid invoice balance",
                    }}
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="dark"
                    icon="today"
                    title="Today Collection"
                    count={shortMoney(todayCollectionTotal)}
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5} onClick={() => setChequeDialogOpen(true)} sx={{ cursor: "pointer" }}>
                  <ComplexStatisticsCard
                    color={chequePendingCount > 0 ? "warning" : "success"}
                    icon="account_balance"
                    title="Pending Cheques"
                    count={chequePendingCount}
                    percentage={{
                      color: chequeMissedCount > 0 ? "error" : "success",
                      amount: "",
                      label: chequeMissedCount > 0 ? `incl. ${chequeMissedCount} missed` : "deposit pending",
                    }}
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={3}>
                <MDBox mb={1.5}>
                  <ComplexStatisticsCard
                    color="info"
                    icon="receipt"
                    title="Payment Entries"
                    count={reportData.collectionByMode.reduce((total, row) => total + Number(row.count || 0), 0)}
                    percentage={{
                      color: "success",
                      amount: "",
                      label: "Cash, online, and cheque entries",
                    }}
                  />
                </MDBox>
              </Grid>
            </Grid>
          </MDBox>

          <MDBox mt={4.5}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6} lg={4} display="flex">
                <MDBox mb={3} width="100%" height={460}>
                  <Card sx={{ height: "100%" }}>
                    <MDBox p={3}>
                      <MDBox display="flex" alignItems="center" mb={1.5}>
                        <MDBox
                          width="3.25rem"
                          height="3.25rem"
                          bgColor="info"
                          variant="gradient"
                          coloredShadow="info"
                          borderRadius="xl"
                          display="flex"
                          justifyContent="center"
                          alignItems="center"
                          color="white"
                          mr={1.5}
                        >
                          <Icon sx={{ fontSize: "1.25rem" }}>bar_chart</Icon>
                        </MDBox>
                        <MDBox>
                          <MDTypography variant="h6" sx={{ fontSize: "1rem", lineHeight: 1.3 }}>
                            {`Monthly Sales · ${formatDate(salesChartFromDate)} to ${formatDate(salesChartToDate)}${selectedSalesStaffId ? ` · ${selectedSalesStaffName}` : ""
                              }`}
                          </MDTypography>
                          <MDTypography variant="button" color="text" fontWeight="medium" sx={{ fontSize: "0.9rem" }}>
                            {money(monthlySalesTotal)} · Invoice value by month
                          </MDTypography>
                        </MDBox>
                      </MDBox>
                      {salesChartLoading && (
                        <MDTypography variant="caption" color="text" display="block" mb={1}>
                          Loading sales for selected period...
                        </MDTypography>
                      )}
                      <MDBox display="flex" gap={0.75} alignItems="center" flexWrap="wrap" mb={2}>
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                          <InputLabel id="sales-chart-staff-label">Staff</InputLabel>
                          <Select
                            labelId="sales-chart-staff-label"
                            value={selectedSalesStaffId}
                            label="Staff"
                            onChange={(event) => setSelectedSalesStaffId(event.target.value)}
                            sx={{ height: 36, fontSize: "0.8125rem", backgroundColor: "#fff" }}
                          >
                            <MenuItem value="">All Staff</MenuItem>
                            {collectionStaffOptions.map((staff) => (
                              <MenuItem key={`sales-staff-${staff.id}`} value={String(staff.id)}>
                                {staff.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <TextField
                          type="date"
                          size="small"
                          label="From"
                          value={salesChartFromDate}
                          onChange={(event) => setSalesChartFromDate(event.target.value)}
                          InputLabelProps={{ shrink: true }}
                          sx={compactDateFieldSx}
                        />
                        <MDTypography variant="button" color="text" sx={{ px: 0.25 }}>
                          to
                        </MDTypography>
                        <TextField
                          type="date"
                          size="small"
                          label="To"
                          value={salesChartToDate}
                          onChange={(event) => setSalesChartToDate(event.target.value)}
                          InputLabelProps={{ shrink: true }}
                          sx={compactDateFieldSx}
                        />
                      </MDBox>
                      <MDBox width="100%">
                        <BarChart
                          dataset={monthlySalesDataset}
                          xAxis={[{ dataKey: "month", scaleType: "band", tickLabelPlacement: "middle" }]}
                          yAxis={[{ label: "Sales (Rs.)", width: 72 }]}
                          series={[
                            {
                              dataKey: "sales",
                              label: "Monthly Sales",
                              valueFormatter: salesChartValueFormatter,
                              color: "#1A73E8",
                            },
                          ]}
                          height={260}
                          margin={{ left: 0, top: 10, right: 10, bottom: 30 }}
                        />
                      </MDBox>
                    </MDBox>
                  </Card>
                </MDBox>
              </Grid>
              {/* <Grid item xs={12} md={6} lg={4}>
              <MDBox mb={3}>
                <ReportsLineChart
                  color="success"
                  title="weekly sales"
                  description="Recent week-wise sales trend"
                  date="all records"
                  chart={weeklySalesChart}
                />
              </MDBox>
            </Grid> */}
              <Grid item xs={12} md={6} lg={4} display="flex">
                <MDBox mb={3} width="100%" height={460} sx={{ "& > div": { height: "100%" } }}>
                  <PaymentModePieChart
                    data={collectionModePieData}
                    title={`Total Collection · ${formatDate(totalCollectionFromDate)} to ${formatDate(totalCollectionToDate)}${selectedCollectionStaffId ? ` · ${selectedCollectionStaffName}` : ""
                      }`}
                    icon="donut_small"
                    iconColor="warning"
                    actions={
                      <>
                        {totalCollectionLoading && (
                          <MDTypography variant="caption" color="text" display="block" mb={1}>
                            Loading collection for selected period...
                          </MDTypography>
                        )}
                        <MDBox display="flex" gap={0.75} alignItems="center" flexWrap="wrap">
                          <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel id="total-collection-staff-label">Staff</InputLabel>
                            <Select
                              labelId="total-collection-staff-label"
                              value={selectedCollectionStaffId}
                              label="Staff"
                              onChange={(event) => setSelectedCollectionStaffId(event.target.value)}
                              sx={{ height: 36, fontSize: "0.8125rem", backgroundColor: "#fff" }}
                            >
                              <MenuItem value="">All Staff</MenuItem>
                              {collectionStaffOptions.map((staff) => (
                                <MenuItem key={staff.id} value={String(staff.id)}>
                                  {staff.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <TextField
                            type="date"
                            size="small"
                            label="From"
                            value={totalCollectionFromDate}
                            onChange={(event) => setTotalCollectionFromDate(event.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={compactDateFieldSx}
                          />
                          <MDTypography variant="button" color="text" sx={{ px: 0.25 }}>
                            to
                          </MDTypography>
                          <TextField
                            type="date"
                            size="small"
                            label="To"
                            value={totalCollectionToDate}
                            onChange={(event) => setTotalCollectionToDate(event.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={compactDateFieldSx}
                          />
                          <MDButton
                            color="dark"
                            variant="contained"
                            size="small"
                            onClick={handlePrintTotalCollection}
                            disabled={
                              !totalCollectionFromDate ||
                              !totalCollectionToDate ||
                              totalCollectionFromDate > totalCollectionToDate ||
                              totalCollectionLoading
                            }
                            sx={{ minWidth: 44, p: 1.2 }}
                            title="Print detailed collection report"
                          >
                            <Icon>print</Icon>
                          </MDButton>
                        </MDBox>
                      </>
                    }
                  />
                </MDBox>
              </Grid>
              <Grid item xs={12} md={6} lg={4} display="flex">
                <MDBox mb={3} width="100%" height={460} sx={{ "& > div": { height: "100%" } }}>
                  <PaymentModePieChart
                    data={todayCollectionPieData}
                    title={`collection ${formatDate(collectionPrintDate)}`}
                    icon="today"
                    iconColor="success"
                    actions={
                      <>
                        {collectionDateLoading && (
                          <MDTypography variant="caption" color="text" display="block" mb={1}>
                            Loading collection for selected date...
                          </MDTypography>
                        )}
                        <MDBox display="flex" gap={0.75} alignItems="center">
                          <TextField
                            type="date"
                            size="small"
                            label="Date"
                            value={collectionPrintDate}
                            onChange={(event) => setCollectionPrintDate(event.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={compactDateFieldSx}
                          />
                          <MDButton
                            color="dark"
                            variant="contained"
                            size="small"
                            onClick={handlePrintTodayCollection}
                            disabled={!collectionPrintDate || collectionDateLoading}
                            sx={{ minWidth: 44, p: 1.2, ml: "auto" }}
                          >
                            <Icon>print</Icon>
                          </MDButton>
                        </MDBox>
                      </>
                    }
                  />
                </MDBox>
              </Grid>
            </Grid>
          </MDBox>

          <MDBox mt={1}>
            <Grid container spacing={3}>
              <Grid item xs={12} lg={6} display="flex">
                <MDBox mb={3} width="100%">
                  <MonthlyCollectionChart rows={monthlyCollectionRows} />
                </MDBox>
              </Grid>

              <Grid item xs={12} lg={6} display="flex">
                <MDBox mb={3} width="100%">
                  <YearlyCollectionChart rows={yearlyCollectionRows} />
                </MDBox>
              </Grid>
            </Grid>
          </MDBox>

          <Grid container spacing={3}>

            {/* <Grid item xs={12} md={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" fontWeight="medium">
                  Credit Dues
                </MDTypography>
                <MDTypography variant="h3" color={totalCreditDues > 0 ? "error" : "success"}>
                  {shortMoney(totalCreditDues)}
                </MDTypography>
                <MDTypography variant="body2" color="text">
                  {creditDuesCount} open credit {creditDuesCount === 1 ? "entry" : "entries"} with unpaid balance.
                </MDTypography>
              </MDBox>
            </Card>
          </Grid> */}

          </Grid>
        </MDBox>
      )}

      <Dialog
        open={paidCollectionDialogOpen}
        onClose={() => setPaidCollectionDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Collection Breakdown</DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="body2" color="text" mb={2}>
            Period: {reportPeriodLabel}
          </MDTypography>
          <MDBox display="flex" flexDirection="column" gap={1.5}>
            <MDBox display="flex" justifyContent="space-between" alignItems="center">
              <MDTypography variant="button" color="text">
                Total Cash Collection
              </MDTypography>
              <MDTypography variant="button" fontWeight="bold" color="success">
                {money(paidCollectionBreakdown.cash)}
              </MDTypography>
            </MDBox>
            <MDBox display="flex" justifyContent="space-between" alignItems="center">
              <MDTypography variant="button" color="text">
                Total UPI Collection
              </MDTypography>
              <MDTypography variant="button" fontWeight="bold" color="info">
                {money(paidCollectionBreakdown.upi)}
              </MDTypography>
            </MDBox>
            <MDBox display="flex" justifyContent="space-between" alignItems="center">
              <MDTypography variant="button" color="text">
                Total Cheque Collection
              </MDTypography>
              <MDTypography variant="button" fontWeight="bold" color="warning">
                {money(paidCollectionBreakdown.cheque)}
              </MDTypography>
            </MDBox>
            <MDBox
              mt={1}
              pt={1.5}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              sx={{ borderTop: "1px solid #e5e7eb" }}
            >
              <MDTypography variant="button" fontWeight="medium" color="dark">
                Total Collection
              </MDTypography>
              <MDTypography variant="button" fontWeight="bold" color="dark">
                {money(paidCollectionTotal)}
              </MDTypography>
            </MDBox>
            <MDBox display="flex" justifyContent="space-between" alignItems="center">
              <MDTypography variant="button" color="text">
                Total Paid
              </MDTypography>
              <MDTypography variant="button" fontWeight="bold" color="success">
                {money(totalPaidAmount)}
              </MDTypography>
            </MDBox>
            <MDBox display="flex" justifyContent="space-between" alignItems="center">
              <MDTypography variant="button" color="text">
                Total Credit Dues
              </MDTypography>
              <MDTypography variant="button" fontWeight="bold" color="error">
                {money(totalCreditDues)}
              </MDTypography>
            </MDBox>
            <MDBox
              mt={1}
              pt={1.5}
              display="flex"
              justifyContent="space-between"
              alignItems="center"
              sx={{ borderTop: "1px solid #e5e7eb" }}
            >
              <MDTypography variant="button" fontWeight="medium" color="dark">
                Collection (Paid - Credit Dues)
              </MDTypography>
              <MDTypography variant="button" fontWeight="bold" color="primary">
                {money(netCollection)}
              </MDTypography>
            </MDBox>
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" variant="outlined" onClick={() => setPaidCollectionDialogOpen(false)}>
            Close
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog open={chequeDialogOpen} onClose={() => setChequeDialogOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Pending Cheque Deposit</DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="body2" color="text" mb={2}>
            All cheques not yet submitted in bank deposit, including previous missed ones.
          </MDTypography>
          <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
            <Table size="small">
              <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>Deposit Date</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Outlet</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Invoice</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Cheque No</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Staff</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: "bold" }}>Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(reportData.pendingChequeReports || []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.deposit_date)}</TableCell>
                    <TableCell>{row.outlet_name || "N/A"}</TableCell>
                    <TableCell>{row.invoice_number || "N/A"}</TableCell>
                    <TableCell>{row.reference_no || "N/A"}</TableCell>
                    <TableCell>{row.staff_name || "N/A"}</TableCell>
                    <TableCell>{getChequeDepositStatusLabel(row.report_status)}</TableCell>
                    <TableCell align="right">{money(row.amount)}</TableCell>
                  </TableRow>
                ))}
                {(reportData.pendingChequeReports || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                      <MDTypography variant="body2" color="text">
                        No pending cheques found.
                      </MDTypography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <MDBox px={1} pb={1}>
            <MDTypography
              variant="button"
              color="info"
              fontWeight="medium"
              sx={{ cursor: "pointer" }}
              onClick={() => setChequeDialogOpen(false)}
            >
              Close
            </MDTypography>
          </MDBox>
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}

export default Dashboard;
