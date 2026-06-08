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
} from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ReportsBarChart from "examples/Charts/BarCharts/ReportsBarChart";
import ReportsLineChart from "examples/Charts/LineCharts/ReportsLineChart";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";

const API = "https://bawarchee.edunextg.co/api";

const emptyReportData = {
  summary: { total_sales: 0, total_collection: 0, total_outstanding: 0 },
  creditDuesSummary: { total_credit_dues: 0, credit_dues_count: 0 },
  collectionByMode: [],
  todayCollection: [],
  monthlyCollection: [],
  yearlyCollection: [],
  salesByPeriod: { weekly: [], monthly: [], quarterly: [], yearly: [] },
  chequeReports: [],
  duesReport: [],
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

function sumRows(rows, field = "total_amount") {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function reverseRecent(rows, limit = 8) {
  return [...rows].slice(0, limit).reverse();
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
    <Card sx={{ height: 460, display: "flex", flexDirection: "column" }}>
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
    <Card sx={{ height: 460, display: "flex", flexDirection: "column" }}>
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

function PaymentModePieChart({ data, title, icon, iconColor = "info" }) {
  const total = useMemo(() => data.reduce((sum, item) => sum + pieSliceAmount(item.value), 0), [data]);
  const valueFormatter = (value) => money(pieSliceAmount(value));

  return (
    <Card sx={{ height: "100%" }}>
      <MDBox p={3}>
        <MDBox display="flex" alignItems="center" mb={1.5}>
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
};

function Dashboard() {
  const financialYearOptions = useMemo(() => getFinancialYearOptions(), []);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [reportData, setReportData] = useState(emptyReportData);
  const [chequeDialogOpen, setChequeDialogOpen] = useState(false);

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

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportStartDate, reportEndDate]);

  const handleFinancialYearChange = (value) => {
    setSelectedFinancialYear(value);
    setSelectedMonth("");
  };

  const todayCollectionTotal = useMemo(
    () => sumRows(reportData.todayCollection),
    [reportData.todayCollection]
  );

  const collectionModePieData = useMemo(
    () => buildPaymentModePieData(reportData.collectionByMode),
    [reportData.collectionByMode]
  );

  const todayCollectionPieData = useMemo(
    () => buildPaymentModePieData(reportData.todayCollection),
    [reportData.todayCollection]
  );

  const monthlySalesChart = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const salesByMonth = monthNames.map(() => 0);

    const monthlyList = reportData.salesByPeriod?.monthly || [];
    monthlyList.forEach((row) => {
      const match = String(row.period || "").match(/^(\d{4})-(\d{2})$/);
      if (match) {
        const monthIndex = Number(match[2]) - 1;
        salesByMonth[monthIndex] = Number(row.total_sales) || 0;
      }
    });

    return {
      labels: monthNames,
      datasets: {
        label: "Monthly Sales",
        data: salesByMonth,
      },
    };
  }, [reportData.salesByPeriod.monthly]);

  const weeklySalesRows = useMemo(
    () => reverseRecent(reportData.salesByPeriod.weekly || [], 8),
    [reportData.salesByPeriod.weekly]
  );

  const monthlyCollectionRows = useMemo(
    () => buildMonthlyCollectionRows(reportData.monthlyCollection, reportStartDate, reportEndDate),
    [reportData.monthlyCollection, reportStartDate, reportEndDate]
  );

  const yearlyCollectionRows = useMemo(
    () => buildYearlyCollectionRows(reportData.yearlyCollection),
    [reportData.yearlyCollection]
  );

  const weeklySalesChart = {
    labels: weeklySalesRows.map((row) => row.period),
    datasets: {
      label: "Weekly Sales",
      data: weeklySalesRows.map((row) => Number(row.total_sales) || 0),
    },
  };

  const chequeAlarmCount = reportData.chequeReports.filter(
    (row) => row.report_status === "alarm"
  ).length;
  const chequeAlarmRows = reportData.chequeReports.filter((row) => row.report_status === "alarm");

  const totalCreditDues = Number(reportData.creditDuesSummary?.total_credit_dues) || 0;
  const creditDuesCount = Number(reportData.creditDuesSummary?.credit_dues_count) || 0;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <MDBox mb={1}>
          <MDTypography variant="h4" fontWeight="medium" color="dark">
            Sales Dashboard
          </MDTypography>
          <MDTypography variant="body2" color="text">
            Live sales, collection, outstanding, cheque, and dues overview.
          </MDTypography>
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
                //   percentage={{
                //     color: chequeAlarmCount > 0 ? "warning" : "success",
                //     amount: chequeAlarmCount,
                //     label: "cheque alarms",
                //   }
                // }
                />
              </MDBox>
            </Grid>
            <Grid item xs={12} md={4}>
            <Card onClick={() => setChequeDialogOpen(true)} sx={{ cursor: "pointer" }}>
              <MDBox p={3}>
                <MDTypography variant="h6" fontWeight="medium">
                  Cheque Alarm
                </MDTypography>
                <MDTypography variant="h3" color={chequeAlarmCount > 0 ? "warning" : "success"}>
                  {chequeAlarmCount}
                </MDTypography>
                <MDTypography variant="body2" color="text">
                  Cheques due for deposit alert in next 2 days.
                </MDTypography>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" fontWeight="medium">
                  Payment Entries
                </MDTypography>
                <MDTypography variant="h3" color="info">
                  {reportData.collectionByMode.reduce((total, row) => total + Number(row.count || 0), 0)}
                </MDTypography>
                <MDTypography variant="body2" color="text">
                  Cash, online, and cheque collection entries.
                </MDTypography>
              </MDBox>
            </Card>
          </Grid>
          </Grid>
          
        </MDBox>

        <MDBox mt={4.5}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6} lg={4} display="flex">
              <MDBox mb={3} width="100%" height={380} sx={{ "& > div": { height: "100%" } }}>
                <ReportsBarChart
                  color="info"
                  title="monthly sales"
                  description="Invoice value by month"
                  date="all records"
                  chart={monthlySalesChart}
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
                <PaymentModePieChart
                  data={collectionModePieData}
                  title="Total Collection"
                  icon="donut_small"
                  iconColor="warning"
                />
              </MDBox>
            </Grid>
             <Grid item xs={12} md={6} lg={4} display="flex">
              <MDBox mb={3} width="100%" height={380}>
                <PaymentModePieChart
                  data={todayCollectionPieData}
                  title="today collection"
                  icon="today"
                  iconColor="success"
                />
              </MDBox>
            </Grid>
          </Grid>
        </MDBox>

        <MDBox mt={1}>
          <Grid container spacing={2} alignItems="center" mb={2}>
            <Grid item xs={12} md={4}>
              <FormControl size="small" fullWidth>
                <InputLabel id="dashboard-financial-year-label">Financial Year</InputLabel>
                <Select
                  labelId="dashboard-financial-year-label"
                  value={selectedFinancialYear}
                  label="Financial Year"
                  onChange={(event) => handleFinancialYearChange(event.target.value)}
                  sx={{ height: 44 }}
                >
                  <MenuItem value="">All Years</MenuItem>
                  {financialYearOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl size="small" fullWidth disabled={!selectedFinancialYear}>
                <InputLabel id="dashboard-month-label">Month</InputLabel>
                <Select
                  labelId="dashboard-month-label"
                  value={selectedMonth}
                  label="Month"
                  onChange={(event) => setSelectedMonth(event.target.value)}
                  sx={{ height: 44 }}
                >
                  <MenuItem value="">All Months</MenuItem>
                  {monthOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
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

      <Dialog open={chequeDialogOpen} onClose={() => setChequeDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Cheque Details</DialogTitle>
        <DialogContent dividers>
          <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
            <Table size="small">
              <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: "bold" }}>Deposit Date</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Outlet</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Invoice</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>Cheque No</TableCell>
                  <TableCell align="right" sx={{ fontWeight: "bold" }}>Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {chequeAlarmRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.deposit_date)}</TableCell>
                    <TableCell>{row.outlet_name || "N/A"}</TableCell>
                    <TableCell>{row.invoice_number || "N/A"}</TableCell>
                    <TableCell>{row.reference_no || "N/A"}</TableCell>
                    <TableCell align="right">{money(row.amount)}</TableCell>
                  </TableRow>
                ))}
                {chequeAlarmRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <MDTypography variant="body2" color="text">
                        No cheque alarms found.
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
