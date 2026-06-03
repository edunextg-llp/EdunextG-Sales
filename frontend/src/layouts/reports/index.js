import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { BarChart } from "@mui/x-charts";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Icon from "@mui/material/Icon";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = "https://bawarchee.edunextg.co/api";

const defaultReportData = {
  summary: { total_sales: 0, total_collection: 0, total_outstanding: 0 },
  collectionByMode: [],
  todayCollection: [],
  monthlyCollection: [],
  yearlyCollection: [],
  salesByPeriod: { weekly: [], monthly: [], quarterly: [], yearly: [] },
  chequeReports: [],
  duesReport: [],
};

const paymentLabels = {
  cash: "Cash",
  upi: "Online",
  cheque: "Cheque",
};

const chequeStatusLabels = {
  alarm: { label: "Alarm - next 2 days", color: "warning" },
  bank_submitted: { label: "Bank submitted", color: "info" },
  clearing_done: { label: "Clearing done", color: "success" },
};

const tableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  borderBottom: "1px solid #e5e7eb",
  backgroundColor: "#f9fafb",
  whiteSpace: "nowrap",
};

const tableBodySx = {
  borderBottom: "1px solid #e5e7eb",
  color: "#374151",
  fontSize: "0.875rem",
  whiteSpace: "nowrap",
};

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "N/A";
  const parts = String(value).split("-");
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

function shortMoney(value) {
  const amount = Number(value || 0);
  if (amount >= 10000000) return `Rs. ${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `Rs. ${(amount / 100000).toFixed(2)} L`;
  if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)} K`;
  return formatMoney(amount);
}

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

  const currencyFormatter = (value) => formatMoney(value);
  const chartHeight = Math.max(300, formattedDataset.length * 56);

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
              stack: "collection",
              color: "#2e7d32",
              valueFormatter: currencyFormatter,
            },
            {
              dataKey: "online",
              label: "Online",
              stack: "collection",
              color: "#0288d1",
              valueFormatter: currencyFormatter,
            },
            {
              dataKey: "cheque",
              label: "Cheque",
              stack: "collection",
              color: "#ed6c02",
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

function SummaryCard({ icon, title, value, color }) {
  return (
    <Card>
      <MDBox p={2} display="flex" alignItems="center" gap={2}>
        <MDBox
          width="44px"
          height="44px"
          borderRadius="md"
          display="flex"
          alignItems="center"
          justifyContent="center"
          color="white"
          bgColor={color}
        >
          <Icon fontSize="small">{icon}</Icon>
        </MDBox>
        <MDBox minWidth={0}>
          <MDTypography variant="button" color="text" fontWeight="medium">
            {title}
          </MDTypography>
          <MDTypography variant="h5" fontWeight="bold" color="dark">
            {value}
          </MDTypography>
        </MDBox>
      </MDBox>
    </Card>
  );
}

function ReportTable({ title, children, empty, minWidth = 720 }) {
  return (
    <Card>
      <MDBox p={3} pb={2}>
        <MDTypography variant="h6" fontWeight="medium" color="dark">
          {title}
        </MDTypography>
      </MDBox>
      <MDBox px={3} pb={3}>
        <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
          <Table size="small" sx={{ minWidth }}>
            {children}
          </Table>
        </TableContainer>
        {empty && (
          <MDBox textAlign="center" py={3}>
            <MDTypography variant="body2" color="text">
              No records found.
            </MDTypography>
          </MDBox>
        )}
      </MDBox>
    </Card>
  );
}

function SalesPeriodRows({ rows, valueLabel }) {
  return rows.map((row) => (
    <TableRow key={row.period}>
      <TableCell sx={tableBodySx}>{row.period}</TableCell>
      <TableCell align="center" sx={tableBodySx}>
        {row.count}
      </TableCell>
      <TableCell align="right" sx={tableBodySx}>
        {formatMoney(row[valueLabel])}
      </TableCell>
    </TableRow>
  ));
}

function Reports() {
  const [startDate, setStartDate] = useState(localDate(-30));
  const [endDate, setEndDate] = useState(localDate());
  const [reportData, setReportData] = useState(defaultReportData);
  const [loading, setLoading] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const response = await fetch(`${API}/staff/reports?${params.toString()}`);

      if (response.ok) {
        const data = await response.json();
        setReportData({ ...defaultReportData, ...data });
      } else {
        setReportData(defaultReportData);
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
      setReportData(defaultReportData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayTotal = useMemo(() => sumRows(reportData.todayCollection), [reportData.todayCollection]);
  const yearlyCollectionRows = useMemo(
    () => buildYearlyCollectionRows(reportData.yearlyCollection),
    [reportData.yearlyCollection]
  );
  const chequeAlerts = reportData.chequeReports.filter((row) => row.report_status === "alarm");

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={5}>
                    <MDTypography variant="h4" fontWeight="medium" color="dark">
                      Reports
                    </MDTypography>
                    <MDTypography variant="body2" color="text">
                      Sales, collection, cheque, and dues reports for accounts.
                    </MDTypography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.5}>
                    <MDInput
                      type="date"
                      label="From Date"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.5}>
                    <MDInput
                      type="date"
                      label="To Date"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <MDButton
                      variant="gradient"
                      color="info"
                      fullWidth
                      onClick={fetchReports}
                      disabled={loading}
                    >
                      <Icon sx={{ mr: 1 }}>search</Icon>
                      {loading ? "Loading" : "Apply"}
                    </MDButton>
                  </Grid>
                </Grid>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} md={6} lg={3}>
            <SummaryCard
              icon="receipt_long"
              title="Total Sales"
              value={formatMoney(reportData.summary.total_sales)}
              color="info"
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <SummaryCard
              icon="payments"
              title="Total Collection"
              value={formatMoney(reportData.summary.total_collection)}
              color="success"
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <SummaryCard
              icon="account_balance_wallet"
              title="Total Outstanding"
              value={formatMoney(reportData.summary.total_outstanding)}
              color="warning"
            />
          </Grid>
          <Grid item xs={12} md={6} lg={3}>
            <SummaryCard
              icon="today"
              title="Today Collection"
              value={formatMoney(todayTotal)}
              color="dark"
            />
          </Grid>

          <Grid item xs={12} lg={5}>
            <ReportTable title="Date Range Collection - Cash / Online / Cheque" empty={!reportData.collectionByMode.length}>
              <TableHead sx={{ display: "table-header-group" }}>
                <TableRow>
                  <TableCell sx={tableHeadSx}>Mode</TableCell>
                  <TableCell align="center" sx={tableHeadSx}>
                    Count
                  </TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Amount
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reportData.collectionByMode.map((row) => (
                  <TableRow key={row.payment_mode}>
                    <TableCell sx={tableBodySx}>{paymentLabels[row.payment_mode]}</TableCell>
                    <TableCell align="center" sx={tableBodySx}>
                      {row.count}
                    </TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.total_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          </Grid>

          <Grid item xs={12} lg={7}>
            <ReportTable title="Month Wise Collection" empty={!reportData.monthlyCollection.length}>
              <TableHead sx={{ display: "table-header-group" }}>
                <TableRow>
                  <TableCell sx={tableHeadSx}>Month</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Cash
                  </TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Online
                  </TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Cheque
                  </TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Total
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reportData.monthlyCollection.map((row) => (
                  <TableRow key={row.period}>
                    <TableCell sx={tableBodySx}>{row.period}</TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.cash_amount)}
                    </TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.upi_amount)}
                    </TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.cheque_amount)}
                    </TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.total_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          </Grid>

          <Grid item xs={12} lg={5}>
            <YearlyCollectionChart rows={yearlyCollectionRows} />
          </Grid>

          <Grid item xs={12} lg={7}>
            <ReportTable title="Year Wise Collection" empty={!yearlyCollectionRows.length}>
              <TableHead sx={{ display: "table-header-group" }}>
                <TableRow>
                  <TableCell sx={tableHeadSx}>Year</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Cash
                  </TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Online
                  </TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Cheque
                  </TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Total
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {yearlyCollectionRows.map((row) => (
                  <TableRow key={row.period}>
                    <TableCell sx={tableBodySx}>{row.period}</TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.cash_amount)}
                    </TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.upi_amount)}
                    </TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.cheque_amount)}
                    </TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.total_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          </Grid>

          <Grid item xs={12}>
            <ReportTable title="Cheque Deposit Date Wise Report" empty={!reportData.chequeReports.length} minWidth={980}>
              <TableHead sx={{ display: "table-header-group" }}>
                <TableRow>
                  <TableCell sx={tableHeadSx}>Deposit Date</TableCell>
                  <TableCell sx={tableHeadSx}>Outlet</TableCell>
                  <TableCell sx={tableHeadSx}>Invoice</TableCell>
                  <TableCell sx={tableHeadSx}>Cheque No</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Amount
                  </TableCell>
                  <TableCell align="center" sx={tableHeadSx}>
                    Status
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reportData.chequeReports.map((row) => {
                  const status = chequeStatusLabels[row.report_status] || chequeStatusLabels.bank_submitted;
                  return (
                    <TableRow key={row.id}>
                      <TableCell sx={tableBodySx}>{formatDate(row.deposit_date)}</TableCell>
                      <TableCell sx={tableBodySx}>{row.outlet_name}</TableCell>
                      <TableCell sx={tableBodySx}>{row.invoice_number}</TableCell>
                      <TableCell sx={tableBodySx}>{row.reference_no || "N/A"}</TableCell>
                      <TableCell align="right" sx={tableBodySx}>
                        {formatMoney(row.amount)}
                      </TableCell>
                      <TableCell align="center" sx={tableBodySx}>
                        <Chip label={status.label} color={status.color} size="small" variant="outlined" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </ReportTable>
          </Grid>

          <Grid item xs={12} md={5}>
            <ReportTable title="Cheque Alarm - 2 Days Before" empty={!chequeAlerts.length}>
              <TableHead sx={{ display: "table-header-group" }}>
                <TableRow>
                  <TableCell sx={tableHeadSx}>Deposit Date</TableCell>
                  <TableCell sx={tableHeadSx}>Invoice</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Amount
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {chequeAlerts.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell sx={tableBodySx}>{formatDate(row.deposit_date)}</TableCell>
                    <TableCell sx={tableBodySx}>{row.invoice_number}</TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          </Grid>

          <Grid item xs={12} md={7}>
            <ReportTable title="Dues Report - 1 To 30 Days Credit" empty={!reportData.duesReport.length} minWidth={860}>
              <TableHead sx={{ display: "table-header-group" }}>
                <TableRow>
                  <TableCell sx={tableHeadSx}>Age</TableCell>
                  <TableCell sx={tableHeadSx}>Due Date</TableCell>
                  <TableCell sx={tableHeadSx}>Outlet</TableCell>
                  <TableCell sx={tableHeadSx}>Invoice</TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Credit
                  </TableCell>
                  <TableCell align="right" sx={tableHeadSx}>
                    Outstanding
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reportData.duesReport.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell sx={tableBodySx}>{row.credit_age_days} days</TableCell>
                    <TableCell sx={tableBodySx}>{formatDate(row.due_date)}</TableCell>
                    <TableCell sx={tableBodySx}>{row.outlet_name}</TableCell>
                    <TableCell sx={tableBodySx}>{row.invoice_number}</TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.credit_amount)}
                    </TableCell>
                    <TableCell align="right" sx={tableBodySx}>
                      {formatMoney(row.balance_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </ReportTable>
          </Grid>

          {[
            ["Weekly Sales Report", "weekly"],
            ["Monthly Sales Report", "monthly"],
            ["Quarterly Sales Report", "quarterly"],
            ["Yearly Sales Report", "yearly"],
          ].map(([title, key]) => (
            <Grid item xs={12} md={6} key={key}>
              <ReportTable title={title} empty={!reportData.salesByPeriod[key]?.length} minWidth={520}>
                <TableHead sx={{ display: "table-header-group" }}>
                  <TableRow>
                    <TableCell sx={tableHeadSx}>Period</TableCell>
                    <TableCell align="center" sx={tableHeadSx}>
                      Bills
                    </TableCell>
                    <TableCell align="right" sx={tableHeadSx}>
                      Total Sales
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <SalesPeriodRows rows={reportData.salesByPeriod[key] || []} valueLabel="total_sales" />
                </TableBody>
              </ReportTable>
            </Grid>
          ))}
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Reports;
