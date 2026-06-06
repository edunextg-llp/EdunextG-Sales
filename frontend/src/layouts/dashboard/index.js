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

function money(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function shortMoney(value) {
  return money(value);
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

function buildMonthlyCollectionRows(apiRows = []) {
  const currentYear = new Date().getFullYear();
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

  return Array.from({ length: 12 }, (_, index) => {
    const period = `${currentYear}-${String(index + 1).padStart(2, "0")}`;
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
    height: 300,
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
    <Card>
      <MDBox p={3} pb={1}>
        <MDTypography variant="h6" fontWeight="medium">
          Month Wise Collection
        </MDTypography>
        <MDTypography variant="button" color="text">
          All {currentYear} months · live data where available
        </MDTypography>
      </MDBox>
      <MDBox height="300px" px={3} pb={3}>
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
  const chartHeight = Math.max(220, formattedDataset.length * 56);

  return (
    <Card>
      <MDBox p={3} pb={1}>
        <MDTypography variant="h6" fontWeight="medium">
          Year Wise Collection
        </MDTypography>
        <MDTypography variant="button" color="text">
          2022–2025 demo · live data for {currentYear} and other years
        </MDTypography>
      </MDBox>
      <MDBox px={3} pb={3}>
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
            <MDTypography variant="caption" color="text" sx={{ fontSize: "0.7rem" }}>
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
                <MDTypography variant="caption" color="text" sx={{ fontSize: "0.65rem", lineHeight: 1.2 }}>
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
  const [reportData, setReportData] = useState(emptyReportData);

  const fetchReports = async () => {
    try {
      const response = await fetch(`${API}/staff/reports`);
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
  }, []);

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
    () => buildMonthlyCollectionRows(reportData.monthlyCollection),
    [reportData.monthlyCollection]
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
                  color="success"
                  icon="payments"
                  title="Total Collection"
                  count={shortMoney(reportData.summary.total_collection)}
                  percentage={{
                    color: "success",
                    amount: "",
                    label: "Cash, online, cheque",
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
                  percentage={{
                    color: chequeAlarmCount > 0 ? "warning" : "success",
                    amount: chequeAlarmCount,
                    label: "cheque alarms",
                  }}
                />
              </MDBox>
            </Grid>
          </Grid>
        </MDBox>

        <MDBox mt={4.5}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6} lg={4}>
              <MDBox mb={3}>
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
            <Grid item xs={12} md={6} lg={4}>
              <MDBox mb={3}>
                <PaymentModePieChart
                  data={collectionModePieData}
                  title="Total Collection"
                  icon="donut_small"
                  iconColor="warning"
                />
              </MDBox>
            </Grid>
          </Grid>
        </MDBox>

        <MDBox mt={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} lg={8}>
              <MDBox mb={3}>
                <MonthlyCollectionChart rows={monthlyCollectionRows} />
              </MDBox>
            </Grid>
            <Grid item xs={12} lg={4}>
              <MDBox mb={3}>
                <PaymentModePieChart
                  data={todayCollectionPieData}
                  title="today collection"
                  icon="today"
                  iconColor="success"
                />
              </MDBox>
            </Grid>
            <Grid item xs={12} lg={5}>
              <MDBox mb={3}>
                <YearlyCollectionChart rows={yearlyCollectionRows} />
              </MDBox>
            </Grid>
          </Grid>
        </MDBox>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card>
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
      <Footer />
    </DashboardLayout>
  );
}

export default Dashboard;
