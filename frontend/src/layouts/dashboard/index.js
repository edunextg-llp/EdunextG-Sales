import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSalesPolling } from "utils/salesSync";

// @mui material components (the detail dialogs; the main view is Tailwind + ECharts, see ./ui.js)
import Grid from "@mui/material/Grid";
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
} from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { COMPANY_TYPES, useCompanyTypeLookup } from "utils/companyTypes";
import AssignDialog from "./AssignDialog";
import OutletAnalysis from "./OutletAnalysis";
import {
  COMPANY_NAME, MODE_COLORS, Icon as TwIcon, SelectField, DateField, IconAction, Panel, KpiCard, CollectionSplit,
  MonthlySalesChart, PaymentModeDonut, CollectionByPeriodChart, SalesStatusBars,
  WeeklySalesTrend, RankedBars, CreditAgeingChart, ChequeStatusList,
} from "./ui";

const API = (process.env.REACT_APP_API_URL);

const emptyReportData = {
  summary: {
    total_sales: 0,
    total_delivered_sales: 0,
    total_delivered_no_payment: 0,
    delivered_no_payment_count: 0,
    total_cancelled_sales: 0,
    total_pending_sales: 0,
    total_delivered_collection: 0,
    total_delivered_credit: 0,
    total_delivered_outstanding: 0,
    total_delivered_cash: 0,
    total_delivered_upi: 0,
    total_delivered_cheque: 0,
    total_paid: 0,
    total_collection: 0,
    total_outstanding: 0,
  },
  creditDuesSummary: { total_credit_dues: 0, credit_dues_count: 0 },
  collectionByMode: [],
  collectionDetails: [],
  todayCollection: [],
  todayCollectionDetails: [],
  todayCollectionSplit: { new_bill_amount: 0, new_bill_count: 0, old_credit_amount: 0, old_credit_count: 0 },
  monthlyCollection: [],
  yearlyCollection: [],
  salesByPeriod: { weekly: [], monthly: [], quarterly: [], yearly: [] },
  chequeReports: [],
  pendingChequeReports: [],
  duesReport: [],
  staffCollectionByDate: [],
  deliveredCancellationDetails: [],
  deliveredOutstandingDetails: [],
};

const modeLabels = {
  cash: "Cash",
  upi: "Online",
  cheque: "Cheque",
};

const modePieColors = MODE_COLORS;

// Category labels for the collection charts (stable references for memoised chart options).
const yearLabelOf = (row) => String(row.period);
// eslint-disable-next-line no-use-before-define
const monthLabelOf = (row) => monthLabel(row.period);

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

  return Array.from({ length: 2 }, (_, index) => {
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

function buildPendingCreditCompanyTotals(credits) {
  const companies = new Map();

  (credits || []).forEach((credit) => {
    const balance = Number(credit.balance_amount) || 0;
    if (balance <= 0) return;

    const companyIds = String(credit.company_ids || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const companyNames = String(credit.company_name || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const entries = companyIds.length
      ? companyIds.map((id, index) => ({ id: String(id), name: companyNames[index] || companyNames[0] || `Company ${id}` }))
      : [{ id: companyNames[0] || "unknown", name: companyNames[0] || "Unknown Company" }];

    entries.forEach((company) => {
      const current = companies.get(company.id) || { companyName: company.name, total: 0, count: 0 };
      current.total += balance;
      current.count += 1;
      companies.set(company.id, current);
    });
  });

  return [...companies.values()].sort((a, b) => b.total - a.total || a.companyName.localeCompare(b.companyName));
}


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

function Dashboard() {
  const financialYearOptions = useMemo(() => getFinancialYearOptions(), []);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [salesFromDate, setSalesFromDate] = useState("");
  const [salesToDate, setSalesToDate] = useState("");
  const [salesCompanies, setSalesCompanies] = useState([]);
  const [salesCompanyType, setSalesCompanyType] = useState("");
  const { matches: companyMatchesType } = useCompanyTypeLookup();
  const [selectedSalesCompanyId, setSelectedSalesCompanyId] = useState("");
  const typedSalesCompanies = salesCompanies.filter((company) =>
    companyMatchesType(company, salesCompanyType)
  );
  const handleSalesCompanyTypeChange = (type) => {
    setSalesCompanyType(type);
    if (selectedSalesCompanyId && type && !companyMatchesType(selectedSalesCompanyId, type)) {
      setSelectedSalesCompanyId("");
    }
  };
  const [reportData, setReportData] = useState(emptyReportData);
  const [activeDashboardTab] = useState("sales");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [chequeDialogOpen, setChequeDialogOpen] = useState(false);
  const [paidCollectionDialogOpen, setPaidCollectionDialogOpen] = useState(false);
  const [deliveredAmountDialogOpen, setDeliveredAmountDialogOpen] = useState(false);
  const [outstandingDialogOpen, setOutstandingDialogOpen] = useState(false);
  const [outstandingLoading, setOutstandingLoading] = useState(false);
  const [outstandingError, setOutstandingError] = useState("");
  const reportRequestId = useRef(0);
  const [companyCreditDialogOpen, setCompanyCreditDialogOpen] = useState(false);
  const [pendingCreditRows, setPendingCreditRows] = useState([]);
  const [loadingCompanyCredits, setLoadingCompanyCredits] = useState(false);
  const [collectionPrintDate, setCollectionPrintDate] = useState(getTodayLocalDate());
  const [totalCollectionFromDate, setTotalCollectionFromDate] = useState(getMonthStartLocalDate());
  const [totalCollectionToDate, setTotalCollectionToDate] = useState(getTodayLocalDate());
  const [collectionDateReportData, setCollectionDateReportData] = useState({
    todayCollection: [],
    todayCollectionDetails: [],
    todayCollectionEntries: [],
    todayCollectionSplit: { new_bill_amount: 0, new_bill_count: 0, old_credit_amount: 0, old_credit_count: 0 },
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
  const standardReportStartDate = selectedMonthOption?.startDate || selectedFinancialYearOption?.startDate || null;
  const standardReportEndDate = selectedMonthOption?.endDate || selectedFinancialYearOption?.endDate || null;
  const hasValidSalesDateRange = Boolean(
    salesFromDate && salesToDate && salesFromDate <= salesToDate
  );
  const reportStartDate = hasValidSalesDateRange ? salesFromDate : standardReportStartDate;
  const reportEndDate = hasValidSalesDateRange ? salesToDate : standardReportEndDate;

  const reportPeriodLabel = useMemo(() => {
    if (hasValidSalesDateRange) {
      return `${formatDate(salesFromDate)} to ${formatDate(salesToDate)}`;
    }
    if (selectedMonthOption) return selectedMonthOption.label;
    if (selectedFinancialYearOption) return selectedFinancialYearOption.label;
    return "All Records";
  }, [hasValidSalesDateRange, salesFromDate, salesToDate, selectedMonthOption, selectedFinancialYearOption]);

  const selectedCollectionStaffName =
    collectionStaffOptions.find((staff) => staff.id === Number(selectedCollectionStaffId))?.name ||
    "All Staff";

  const selectedSalesCompanyName =
    salesCompanies.find((company) => String(company.id) === String(selectedSalesCompanyId))?.name ||
    "All Companies";

  const selectedSalesStaffName =
    collectionStaffOptions.find((staff) => staff.id === Number(selectedSalesStaffId))?.name ||
    "All Staff";

  const paidCollectionBreakdown = useMemo(
    () => ({
      cash: Number(reportData.summary.total_delivered_cash) || 0,
      upi: Number(reportData.summary.total_delivered_upi) || 0,
      cheque: Number(reportData.summary.total_delivered_cheque) || 0,
    }),
    [reportData.summary]
  );

  const paidCollectionTotal =
    paidCollectionBreakdown.cash + paidCollectionBreakdown.upi + paidCollectionBreakdown.cheque;

  const deliveredCancellationTotal = useMemo(
    () => sumRows(reportData.deliveredCancellationDetails || [], "cancelled_amount"),
    [reportData.deliveredCancellationDetails]
  );
  const updatedDeliveredTotal = Number(reportData.summary.total_delivered_sales) || 0;
  const originalDeliveredTotal = updatedDeliveredTotal + deliveredCancellationTotal;
  const outstandingRows = reportData.deliveredOutstandingDetails || [];
  const noPaymentOutstandingRows = outstandingRows.filter((row) => row.category === "no_payment");
  const updatedPaymentOutstandingRows = outstandingRows.filter((row) => row.category === "payment_updated");
  const noPaymentOutstandingTotal = sumRows(noPaymentOutstandingRows, "outstanding_amount");
  const updatedPaymentOutstandingTotal = sumRows(updatedPaymentOutstandingRows, "outstanding_amount");

  const companyCreditTotals = useMemo(
    () => buildPendingCreditCompanyTotals(pendingCreditRows),
    [pendingCreditRows]
  );

  const pendingCreditTotal = useMemo(
    () => pendingCreditRows.reduce((total, credit) => total + (Number(credit.balance_amount) || 0), 0),
    [pendingCreditRows]
  );

  const fetchReports = useCallback(async () => {
    const requestId = ++reportRequestId.current;
    try {
      const params = new URLSearchParams();
      if (reportStartDate) params.set("startDate", reportStartDate);
      if (reportEndDate) params.set("endDate", reportEndDate);
      if (selectedSalesCompanyId) params.set("companyId", selectedSalesCompanyId);

      const query = params.toString();
      const response = await fetch(`${API}/staff/reports${query ? `?${query}` : ""}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (requestId !== reportRequestId.current) return;
        setReportData({ ...emptyReportData, ...data });
        setOutstandingError("");
      } else {
        throw new Error("Unable to refresh outstanding invoices. Please retry.");
      }
    } catch (error) {
      if (requestId !== reportRequestId.current) return;
      console.error("Error fetching dashboard reports:", error);
      setOutstandingError("Unable to refresh outstanding invoices. Please retry.");
    } finally {
      if (requestId === reportRequestId.current) setOutstandingLoading(false);
    }
  }, [API, reportStartDate, reportEndDate, selectedSalesCompanyId]);

  const refreshOutstanding = () => {
    setOutstandingLoading(true);
    setOutstandingError("");
    void fetchReports();
  };

  useSalesPolling(fetchReports);

  const fetchPendingCreditTracker = async () => {
    setLoadingCompanyCredits(true);
    try {
      const response = await fetch(`${API}/staff/credits/pending`);
      if (!response.ok) throw new Error("Unable to load pending credits.");
      const data = await response.json();
      setPendingCreditRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching pending credits for dashboard:", error);
      setPendingCreditRows([]);
    } finally {
      setLoadingCompanyCredits(false);
    }
  };

  const fetchCollectionDateReport = async (date) => {
    if (!date) {
      return { todayCollection: [], todayCollectionDetails: [], todayCollectionEntries: [], todayCollectionSplit: { new_bill_amount: 0, new_bill_count: 0, old_credit_amount: 0, old_credit_count: 0 } };
    }

    const params = new URLSearchParams({
      startDate: date,
      endDate: date,
    });
    if (selectedSalesCompanyId) params.set("companyId", selectedSalesCompanyId);
    const response = await fetch(`${API}/staff/reports?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Failed to fetch collection report.");
    }

    const data = await response.json();
    return {
      todayCollection: data.todayCollection || [],
      todayCollectionDetails: data.todayCollectionDetails || [],
      todayCollectionEntries: data.todayCollectionEntries || [],
      todayCollectionSplit: data.todayCollectionSplit || { new_bill_amount: 0, new_bill_count: 0, old_credit_amount: 0, old_credit_count: 0 },
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
    if (selectedSalesCompanyId) params.set("companyId", selectedSalesCompanyId);
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
    if (selectedSalesCompanyId) params.set("companyId", selectedSalesCompanyId);
    const response = await fetch(`${API}/staff/reports?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Failed to fetch sales chart report.");
    }

    const data = await response.json();
    return data.salesByPeriod?.monthly || [];
  };

  useEffect(() => {
    const fetchSalesCompanies = async () => {
      try {
        const response = await fetch(`${API}/staff/companies`);
        if (response.ok) {
          const data = await response.json();
          setSalesCompanies(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Error fetching dashboard companies:", error);
      }
    };

    fetchSalesCompanies();
    fetchPendingCreditTracker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchCollectionStaffOptions = async () => {
      try {
        const params = new URLSearchParams();
        if (selectedSalesCompanyId) params.set("companyId", selectedSalesCompanyId);
        const query = params.toString();
        const response = await fetch(`${API}/staff${query ? `?${query}` : ""}`);
        if (response.ok) {
          const data = await response.json();
          setCollectionStaffOptions(data);
          setSelectedCollectionStaffId("");
          setSelectedSalesStaffId("");
        }
      } catch (error) {
        console.error("Error fetching staff options:", error);
      }
    };

    fetchCollectionStaffOptions();
  }, [selectedSalesCompanyId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);


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
          setCollectionDateReportData({ todayCollection: [], todayCollectionDetails: [], todayCollectionEntries: [], todayCollectionSplit: { new_bill_amount: 0, new_bill_count: 0, old_credit_amount: 0, old_credit_count: 0 } });
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
  }, [collectionPrintDate, selectedSalesCompanyId]);

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
  }, [totalCollectionFromDate, totalCollectionToDate, selectedCollectionStaffId, selectedSalesCompanyId]);

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
  }, [salesChartFromDate, salesChartToDate, selectedSalesStaffId, selectedSalesCompanyId]);

  const handleFinancialYearChange = (value) => {
    setSelectedFinancialYear(value);
    setSelectedMonth("");
    setSalesFromDate("");
    setSalesToDate("");
  };

  const handleMonthChange = (value) => {
    setSelectedMonth(value);
    setSalesFromDate("");
    setSalesToDate("");
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

  // Company-wise collection sheet: one table per company, Cash first, then UPI, then Cheque.
  const writeCompanyCollectionPrintReport = (printWindow, entries, dateLabel, companyLabel) => {
    const MODES = [
      { key: "cash", label: "Cash" },
      { key: "upi", label: "UPI" },
      { key: "cheque", label: "Cheque" },
    ];
    const money = (value) => `Rs. ${(Number(value) || 0).toFixed(2)}`;
    const companies = new Map();
    entries.forEach((entry) => {
      const name = entry.company_name || "N/A";
      if (!companies.has(name)) companies.set(name, []);
      companies.get(name).push(entry);
    });
    const grand = { total: 0, cash: 0, upi: 0, cheque: 0, count: 0 };
    const overallRows = [];

    const companiesHtml = [...companies.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([companyName, rows]) => {
        let sr = 0;
        let companyTotal = 0;
        const companySummary = { name: companyName, cash: 0, upi: 0, cheque: 0, count: 0, total: 0 };
        overallRows.push(companySummary);
        const bodyHtml = MODES.map((mode) => {
          const modeRows = rows.filter((row) => row.payment_mode === mode.key);
          if (!modeRows.length) return "";
          const modeTotal = modeRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
          companyTotal += modeTotal;
          grand[mode.key] += modeTotal;
          grand.count += modeRows.length;
          companySummary[mode.key] += modeTotal;
          companySummary.count += modeRows.length;
          companySummary.total += modeTotal;
          const rowsHtml = modeRows
            .map((row) => {
              sr += 1;
              const reference = row.reference_no
                ? `<div class="sub">Ref: ${escapeHtml(row.reference_no)}${row.reference_date ? ` · ${escapeHtml(formatDate(row.reference_date))}` : ""}</div>`
                : row.reference_date ? `<div class="sub">${escapeHtml(formatDate(row.reference_date))}</div>` : "";
              return `
                <tr>
                  <td class="center">${sr}</td>
                  <td>${mode.label}${reference}</td>
                  <td>${escapeHtml(row.invoice_number || "-")}</td>
                  <td>${escapeHtml(row.outlet_name || "-")}${row.location_name ? `<div class="sub">${escapeHtml(row.location_name)}</div>` : ""}</td>
                  <td>${escapeHtml(row.collected_by || "-")}</td>
                  <td>${escapeHtml(row.settled_by || "-")}</td>
                  <td class="right">${money(row.amount)}</td>
                </tr>`;
            })
            .join("");
          return `${rowsHtml}
                <tr class="mode-total">
                  <td colspan="6">${mode.label} Total (${modeRows.length})</td>
                  <td class="right">${money(modeTotal)}</td>
                </tr>`;
        }).join("");
        grand.total += companyTotal;
        return `
          <section class="company">
            <h2>Company Name — ${escapeHtml(companyName)}</h2>
            <table>
              <thead>
                <tr>
                  <th class="center" style="width:44px">SR</th>
                  <th style="width:110px">Payment Mode</th>
                  <th style="width:130px">Invoice No.</th>
                  <th>Outlet</th>
                  <th style="width:150px">Collected By</th>
                  <th style="width:150px">Settled By</th>
                  <th class="right" style="width:120px">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${bodyHtml}
                <tr class="company-total">
                  <td colspan="6">${escapeHtml(companyName)} Total</td>
                  <td class="right">${money(companyTotal)}</td>
                </tr>
              </tbody>
            </table>
          </section>`;
      })
      .join("");

    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
      <html>
        <head>
          <title>Today Collection - ${escapeHtml(dateLabel)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 24px; font-size: 12px; }
            h1 { font-size: 20px; margin: 0 0 4px; }
            .meta { color: #4b5563; margin-bottom: 16px; }
            .company { margin-bottom: 22px; page-break-inside: auto; }
            h2 { font-size: 15px; margin: 0 0 8px; padding: 6px 10px; background: #f3f4f6; border-left: 4px solid #111827; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
            th { background: #111827; color: #fff; text-align: left; font-size: 11px; text-transform: uppercase; }
            tr { page-break-inside: avoid; }
            .right { text-align: right; }
            .center { text-align: center; }
            .sub { color: #6b7280; font-size: 10px; margin-top: 2px; }
            .mode-total td { background: #f9fafb; font-weight: bold; }
            .company-total td { background: #e5e7eb; font-weight: bold; font-size: 13px; }
            .overall { margin-top: 28px; page-break-inside: avoid; }
            .overall h2 { background: #111827; color: #fff; border-left-color: #f59e0b; }
            .overall .company-total td { background: #111827; color: #fff; font-size: 14px; }
            .empty { padding: 24px; text-align: center; color: #6b7280; border: 1px dashed #d1d5db; }
            @media print { body { margin: 10mm; } }
          </style>
        </head>
        <body>
          <h1>Today Collection</h1>
          <div class="meta">Date: ${escapeHtml(dateLabel)} · ${escapeHtml(companyLabel)} · Order: Cash → UPI → Cheque</div>
          ${companiesHtml || '<div class="empty">No cash, UPI or cheque collection on this date.</div>'}
          ${companiesHtml ? `
          <section class="company overall">
            <h2>Overall Collection</h2>
            <table>
              <thead>
                <tr>
                  <th class="center" style="width:44px">SR</th>
                  <th>Company</th>
                  <th class="center" style="width:80px">Entries</th>
                  <th class="right" style="width:130px">Cash</th>
                  <th class="right" style="width:130px">UPI</th>
                  <th class="right" style="width:130px">Cheque</th>
                  <th class="right" style="width:140px">Total</th>
                </tr>
              </thead>
              <tbody>
                ${overallRows.map((row, index) => `
                <tr>
                  <td class="center">${index + 1}</td>
                  <td>${escapeHtml(row.name)}</td>
                  <td class="center">${row.count}</td>
                  <td class="right">${money(row.cash)}</td>
                  <td class="right">${money(row.upi)}</td>
                  <td class="right">${money(row.cheque)}</td>
                  <td class="right"><strong>${money(row.total)}</strong></td>
                </tr>`).join("")}
                <tr class="company-total">
                  <td colspan="2">Overall Total</td>
                  <td class="center">${grand.count}</td>
                  <td class="right">${money(grand.cash)}</td>
                  <td class="right">${money(grand.upi)}</td>
                  <td class="right">${money(grand.cheque)}</td>
                  <td class="right">${money(grand.total)}</td>
                </tr>
              </tbody>
            </table>
          </section>` : ""}
          <script>window.onload = function () { window.print(); };</script>
        </body>
      </html>`);
    printWindow.document.close();
  };

  const handlePrintCompanyCollection = async () => {
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
      // Always fetch fresh so collections settled a moment ago are included.
      const data = await fetchCollectionDateReport(collectionPrintDate);
      writeCompanyCollectionPrintReport(
        printWindow,
        data.todayCollectionEntries || [],
        formatDate(collectionPrintDate),
        selectedSalesCompanyName
      );
    } catch (error) {
      console.error("Error printing company collection report:", error);
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

  const monthlyCollectionRows = useMemo(
    () => buildMonthlyCollectionRows(reportData.monthlyCollection, reportStartDate, reportEndDate),
    [reportData.monthlyCollection, reportStartDate, reportEndDate]
  );

  const yearlyCollectionRows = useMemo(
    () => buildYearlyCollectionRows(reportData.yearlyCollection),
    [reportData.yearlyCollection]
  );

  const pendingChequeRows = reportData.pendingChequeReports || [];
  const chequePendingCount = pendingChequeRows.length;
  const chequeMissedCount = pendingChequeRows.filter(
    (row) => row.report_status === "missed" || row.report_status === "clearing_done"
  ).length;


  const companyOptions = typedSalesCompanies.map((company) => ({ value: String(company.id), label: company.name }));
  const allCompanyOptions = salesCompanies.map((company) => ({ value: String(company.id), label: company.name }));
  const staffOptions = collectionStaffOptions.map((staff) => ({ value: String(staff.id), label: staff.name }));
  const paymentEntryCount = reportData.collectionByMode.reduce((total, row) => total + Number(row.count || 0), 0);
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        {/* Company header: plain, no background */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 grow">
            <h2 className="m-0 truncate text-[22px] font-bold leading-tight text-slate-900">{COMPANY_NAME}</h2>
            <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">Live sales, collection, outstanding, cheque and dues overview · {todayLabel}</p>
          </div>
          <button
            type="button" onClick={() => setAssignDialogOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <TwIcon name="assignment_ind" className="text-[18px]" />
            Assign
          </button>
        </div>

        <AssignDialog
          open={assignDialogOpen}
          onClose={() => setAssignDialogOpen(false)}
          companies={salesCompanies}
        />

        {/* Purchase Dashboard moved to Sales & Purchase (dms/src/pages/PurchaseDashboard.jsx). */}

        {activeDashboardTab === "sales" && (
          <>
            {/* Filters: one row above everything they control */}
            <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <span className="mr-1 flex items-center gap-1.5 self-center text-[13px] font-semibold text-slate-800">
                <TwIcon name="tune" className="text-[18px] text-slate-500" /> Filters
              </span>
              <SelectField
                label="Company type" value={salesCompanyType} onChange={handleSalesCompanyTypeChange}
                options={COMPANY_TYPES.map((t) => ({ value: t.value, label: t.label }))} placeholder="All types" className="min-w-36"
              />
              <SelectField label="Company" value={selectedSalesCompanyId} onChange={setSelectedSalesCompanyId} options={companyOptions} placeholder="All companies" className="min-w-48" />
              <SelectField label="Financial year" value={selectedFinancialYear} onChange={handleFinancialYearChange} options={financialYearOptions} placeholder="All years" />
              <SelectField label="Month" value={selectedMonth} onChange={handleMonthChange} options={monthOptions} placeholder="All months" disabled={!selectedFinancialYear} className="min-w-36" />
              <DateField label="From date" value={salesFromDate} onChange={setSalesFromDate} />
              <DateField
                label="To date" value={salesToDate} onChange={setSalesToDate} min={salesFromDate}
                invalid={Boolean(salesFromDate && salesToDate && salesFromDate > salesToDate)}
              />
            </div>

            {/* KPIs */}
            <h2 className="mb-2.5 mt-6 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">Sales</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Total Sales" value={shortMoney(reportData.summary.total_sales)} hint="All sales" icon="receipt_long" tone="blue" />
              <KpiCard label="Delivered Sales" value={shortMoney(reportData.summary.total_delivered_sales)} hint="Successfully delivered sales" icon="local_shipping" tone="green" />
              <KpiCard label="Cancelled Sales" value={shortMoney(reportData.summary.total_cancelled_sales)} hint="Cancelled sales" icon="cancel" tone="red" />
              <KpiCard label="Pending Sales" value={shortMoney(reportData.summary.total_pending_sales)} hint="Sales awaiting delivery" icon="pending_actions" tone="amber" />
            </div>

            <h2 className="mb-2.5 mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">Collection &amp; dues</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="Total Delivered Amount" value={shortMoney(reportData.summary.total_delivered_sales)} hint="Click for cancellation breakdown"
                icon="local_shipping" tone="green" onClick={() => setDeliveredAmountDialogOpen(true)}
              />
              <KpiCard
                label="Collection" value={shortMoney(reportData.summary.total_delivered_collection)} hint="Cash + UPI + Cheque"
                icon="payments" tone="green" onClick={() => setPaidCollectionDialogOpen(true)}
              />
              <KpiCard
                label="Credit" value={shortMoney(reportData.summary.total_delivered_credit)} hint="Pending credit on delivered sales"
                icon="credit_card" tone="red" hintTone={reportData.summary.total_delivered_credit > 0 ? "bad" : "good"}
              />
              <KpiCard
                label="Outstanding" value={shortMoney(reportData.summary.total_delivered_outstanding)} hint="Click for invoice breakdown"
                icon="account_balance_wallet" tone="amber" onClick={() => { setOutstandingDialogOpen(true); refreshOutstanding(); }}
              />
              <KpiCard label="Today Collection" value={shortMoney(todayCollectionTotal)} hint="Collected today" icon="today" tone="slate" />
              <KpiCard
                label="Pending Cheques" value={chequePendingCount} icon="account_balance" tone={chequePendingCount > 0 ? "amber" : "green"}
                hint={chequeMissedCount > 0 ? `incl. ${chequeMissedCount} missed` : "deposit pending"} hintTone={chequeMissedCount > 0 ? "bad" : "good"}
                onClick={() => setChequeDialogOpen(true)}
              />
              <KpiCard label="Payment Entries" value={paymentEntryCount} hint="Cash, online, and cheque entries" icon="receipt" tone="violet" hintTone="good" />
            </div>

            {/* Charts */}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Panel
                className="lg:col-span-2" icon="bar_chart" loading={salesChartLoading}
                title={`Monthly Sales · ${formatDate(salesChartFromDate)} to ${formatDate(salesChartToDate)}${selectedSalesStaffId ? ` · ${selectedSalesStaffName}` : ""}`}
                subtitle={<><span className="font-semibold text-slate-800">{money(monthlySalesTotal)}</span> · Invoice value by month</>}
                actions={(
                  <>
                    <SelectField label="Staff" value={selectedSalesStaffId} onChange={setSelectedSalesStaffId} options={staffOptions} placeholder="All staff" />
                    <DateField label="From" value={salesChartFromDate} onChange={setSalesChartFromDate} />
                    <DateField label="To" value={salesChartToDate} onChange={setSalesChartToDate} />
                  </>
                )}
              >
                <MonthlySalesChart dataset={monthlySalesDataset} />
              </Panel>

              <Panel icon="donut_large" title="Sales Status" subtitle="Share of total sales value">
                <div className="px-2">
                  <SalesStatusBars
                    total={Number(reportData.summary.total_sales) || 0}
                    delivered={Number(reportData.summary.total_delivered_sales) || 0}
                    pending={Number(reportData.summary.total_pending_sales) || 0}
                    cancelled={Number(reportData.summary.total_cancelled_sales) || 0}
                  />
                  <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-slate-500">Credit</div>
                      <div className="text-[13px] font-bold tabular-nums text-slate-900">{money(reportData.summary.total_delivered_credit)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-slate-500">Outstanding</div>
                      <div className="text-[13px] font-bold tabular-nums text-slate-900">{money(reportData.summary.total_delivered_outstanding)}</div>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel className="lg:col-span-2" icon="show_chart" title="Weekly Sales Trend" subtitle="Invoice value per week · latest 16 weeks of the selected period">
                <WeeklySalesTrend rows={reportData.salesByPeriod?.weekly || []} />
              </Panel>

              <Panel icon="account_balance" title="Pending Cheques" subtitle={`${chequePendingCount} cheque${chequePendingCount === 1 ? "" : "s"} waiting for deposit`}>
                <ChequeStatusList cheques={pendingChequeRows} onOpen={() => setChequeDialogOpen(true)} />
              </Panel>

              <Panel
                icon="donut_small" loading={totalCollectionLoading}
                title={`Total Collection · ${formatDate(totalCollectionFromDate)} to ${formatDate(totalCollectionToDate)}${selectedCollectionStaffId ? ` · ${selectedCollectionStaffName}` : ""}`}
                subtitle="Cash / online / cheque"
                actions={(
                  <>
                    <SelectField label="Staff" value={selectedCollectionStaffId} onChange={setSelectedCollectionStaffId} options={staffOptions} placeholder="All staff" className="min-w-36" />
                    <DateField label="From" value={totalCollectionFromDate} onChange={setTotalCollectionFromDate} />
                    <DateField label="To" value={totalCollectionToDate} onChange={setTotalCollectionToDate} />
                    <IconAction
                      icon="print" title="Print detailed collection report" onClick={handlePrintTotalCollection}
                      disabled={!totalCollectionFromDate || !totalCollectionToDate || totalCollectionFromDate > totalCollectionToDate || totalCollectionLoading}
                    />
                  </>
                )}
              >
                <div className="px-2 pt-1"><PaymentModeDonut data={collectionModePieData} /></div>
              </Panel>

              <Panel
                icon="today" loading={collectionDateLoading}
                title={`Today Collection · ${selectedSalesCompanyName}`}
                subtitle="Cash / online / cheque"
                actions={(
                  <>
                    <SelectField label="Company" value={selectedSalesCompanyId} onChange={setSelectedSalesCompanyId} options={allCompanyOptions} placeholder="All companies" className="min-w-36" />
                    <DateField label="Date" value={collectionPrintDate} onChange={setCollectionPrintDate} />
                    <IconAction
                      icon="receipt_long" tone="blue" title="Print company-wise collection sheet (Cash → UPI → Cheque)"
                      onClick={handlePrintCompanyCollection} disabled={!collectionPrintDate || collectionDateLoading}
                    />
                  </>
                )}
              >
                <div className="space-y-3 px-2 pt-1">
                  <CollectionSplit split={collectionDateReportData.todayCollectionSplit} />
                  <PaymentModeDonut data={todayCollectionPieData} />
                </div>
              </Panel>

              <Panel icon="stacked_bar_chart" title="Year Wise Collections" subtitle={`2022–2025 demo · live data for ${new Date().getFullYear()} and other years`}>
                <CollectionByPeriodChart rows={yearlyCollectionRows} labelOf={yearLabelOf} horizontal height={330} />
              </Panel>

              <Panel icon="groups" title="Top Staff by Sales" subtitle="Invoice value in the selected period">
                <RankedBars rows={reportData.staffSalesSummary || []} nameKey="staff_name" valueKey="total_sales" countKey="count" />
              </Panel>

              <Panel icon="business" title="Sales by Company" subtitle="Invoice value in the selected period">
                <RankedBars rows={reportData.companySalesSummary || []} nameKey="company_name" valueKey="total_sales" countKey="count" color="#6250d6" />
              </Panel>

              <Panel icon="hourglass_bottom" title="Credit Ageing" subtitle="Open credit 1–30 days old · older is darker">
                <CreditAgeingChart dues={reportData.duesReport || []} />
              </Panel>

              <Panel className="lg:col-span-3" icon="calendar_month" title="Month Wise Collection" subtitle={`All ${new Date().getFullYear()} months · live data where available`}>
                <CollectionByPeriodChart rows={monthlyCollectionRows} labelOf={monthLabelOf} height={340} />
              </Panel>
            </div>

            {/* Outlet-wise sales, orders and growth (same date range and company as the cards above) */}
            <OutletAnalysis
              startDate={reportStartDate || ""}
              endDate={reportEndDate || ""}
              companyId={selectedSalesCompanyId}
              staffOptions={staffOptions}
            />
          </>
        )}

      <Dialog
        open={outstandingDialogOpen}
        onClose={() => setOutstandingDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { width: "calc(100% - 24px)", maxWidth: 1000, m: 1.5 } }}
      >
        <DialogTitle sx={{ fontSize: "1rem", fontWeight: 600, px: 2, py: 1.5 }}>
          Delivered Outstanding Breakdown
        </DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="caption" color="text" mb={1.5} display="block">
            Period: {reportPeriodLabel} · Company: {selectedSalesCompanyName}
          </MDTypography>
          {outstandingLoading ? (
            <MDTypography role="status" variant="body2" py={3}>Refreshing current delivered invoices…</MDTypography>
          ) : outstandingError ? (
            <MDTypography role="alert" variant="body2" color="error" py={3}>{outstandingError}</MDTypography>
          ) : <>
          <Grid container spacing={1.5} mb={2}>
            {[
              { label: `No Payment Update (${noPaymentOutstandingRows.length} invoices)`, value: noPaymentOutstandingTotal },
              { label: `Payment Updated, Balance Left (${updatedPaymentOutstandingRows.length} invoices)`, value: updatedPaymentOutstandingTotal },
              { label: "Total Outstanding", value: noPaymentOutstandingTotal + updatedPaymentOutstandingTotal },
            ].map((item) => (
              <Grid item xs={12} sm={4} key={item.label}>
                <MDBox p={1.5} sx={{ border: "1px solid #e5e7eb", borderRadius: 2 }}>
                  <MDTypography variant="caption" color="text" sx={{ fontSize: "0.68rem" }}>{item.label}</MDTypography>
                  <MDTypography display="block" variant="button" fontWeight="bold" sx={{ fontSize: "0.82rem" }}>
                    {money(item.value)}
                  </MDTypography>
                </MDBox>
              </Grid>
            ))}
          </Grid>
          {outstandingRows.length > 0 ? (
            <TableContainer component={Paper} sx={{ maxHeight: 440, boxShadow: "none", border: "1px solid #e5e7eb" }}>
              <Table stickyHeader size="small" sx={{ width: "100%", tableLayout: "fixed", "& .MuiTableCell-root": { fontSize: "0.72rem", px: 1, py: 1 } }}>
                <TableHead sx={{ display: "table-header-group", "& .MuiTableCell-root": { backgroundColor: "#f1f5f9", fontWeight: 700, whiteSpace: "nowrap" } }}>
                  <TableRow>
                    <TableCell sx={{ width: "27%" }}>Invoice Number</TableCell>
                    <TableCell sx={{ width: "12%" }}>Sale ID</TableCell>
                    <TableCell sx={{ width: "24%" }}>Category</TableCell>
                    <TableCell align="right" sx={{ width: "18%" }}>Updated Amount</TableCell>
                    <TableCell align="right" sx={{ width: "19%" }}>Outstanding</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {outstandingRows.map((row) => (
                    <TableRow key={row.sale_id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{row.invoice_number || "N/A"}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{row.sticker_number || row.sale_id}</TableCell>
                      <TableCell>{row.category === "no_payment" ? "No Payment Update" : "Payment Updated"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{money(row.effective_price)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", fontWeight: 700 }}>{money(row.outstanding_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <MDBox py={4} textAlign="center">
              <MDTypography variant="body2" color="text">No outstanding delivered invoices for this filter.</MDTypography>
            </MDBox>
          )}
          </>}
        </DialogContent>
        <DialogActions>
          <MDButton color="info" variant="outlined" disabled={outstandingLoading} onClick={refreshOutstanding}>Refresh</MDButton>
          <MDButton color="dark" variant="outlined" onClick={() => setOutstandingDialogOpen(false)}>Close</MDButton>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deliveredAmountDialogOpen}
        onClose={() => setDeliveredAmountDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            width: "calc(100% - 24px)",
            maxWidth: 1000,
            m: 1.5,
            "& .MuiTableCell-root": { fontSize: "0.75rem", px: 1.25, py: 1 },
          },
        }}
      >
        <DialogTitle sx={{ fontSize: "1rem", fontWeight: 600, px: 2, py: 1.5 }}>
          Delivered Amount and Cancellation Breakdown
        </DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="caption" color="text" mb={1.5} display="block">
            Period: {reportPeriodLabel} · Company: {selectedSalesCompanyName}
          </MDTypography>
          <Grid container spacing={1.5} mb={2}>
            {[
              { label: "Original Delivered Amount", value: originalDeliveredTotal, color: "dark" },
              { label: "Cancelled Amount", value: deliveredCancellationTotal, color: "error" },
              { label: "Updated Delivered Amount", value: updatedDeliveredTotal, color: "success" },
              {
                label: `No Payment Update (${reportData.summary.delivered_no_payment_count || 0} invoices)`,
                value: reportData.summary.total_delivered_no_payment,
                color: "warning",
              },
            ].map((item) => (
              <Grid item xs={12} sm={6} md={3} key={item.label}>
                <MDBox p={1.5} sx={{ border: "1px solid #e5e7eb", borderRadius: 2, backgroundColor: "#fff" }}>
                  <MDTypography variant="caption" color="text" sx={{ fontSize: "0.68rem" }}>{item.label}</MDTypography>
                  <MDTypography display="block" variant="button" color={item.color} fontWeight="bold" sx={{ fontSize: "0.82rem" }}>
                    {money(item.value)}
                  </MDTypography>
                </MDBox>
              </Grid>
            ))}
          </Grid>

          {(reportData.deliveredCancellationDetails || []).length > 0 ? (
            <TableContainer component={Paper} sx={{ maxHeight: 440, boxShadow: "none", border: "1px solid #e5e7eb" }}>
              <Table stickyHeader size="small" sx={{ width: "100%", tableLayout: "fixed" }}>
                <TableHead
                  sx={{
                    display: "table-header-group",
                    "& .MuiTableCell-root": {
                      backgroundColor: "#f1f5f9",
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      lineHeight: 1.25,
                      whiteSpace: "nowrap",
                    },
                  }}
                >
                  <TableRow>
                    <TableCell sx={{ width: "28%" }}>Invoice Number</TableCell>
                    <TableCell sx={{ width: "14%" }}>Sale ID</TableCell>
                    <TableCell align="right" sx={{ width: "19%" }}>Invoice Amount</TableCell>
                    <TableCell align="right" sx={{ width: "20%" }}>Cancelled Amount</TableCell>
                    <TableCell align="right" sx={{ width: "19%" }}>Updated Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reportData.deliveredCancellationDetails.map((row) => (
                    <TableRow key={row.sale_id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{row.invoice_number || "N/A"}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{row.sticker_number || row.sale_id}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{money(row.price)}</TableCell>
                      <TableCell align="right">
                        <MDTypography variant="caption" color="error" fontWeight="medium" sx={{ whiteSpace: "nowrap" }}>
                          {money(row.cancelled_amount)}
                        </MDTypography>
                      </TableCell>
                      <TableCell align="right">
                        <MDTypography variant="caption" color="success" fontWeight="bold" sx={{ whiteSpace: "nowrap" }}>
                          {money(row.effective_price)}
                        </MDTypography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <MDBox py={4} textAlign="center">
              <MDTypography variant="body2" color="text">
                No delivered invoices with cancelled amounts for this filter.
              </MDTypography>
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" variant="outlined" onClick={() => setDeliveredAmountDialogOpen(false)}>
            Close
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog
        open={paidCollectionDialogOpen}
        onClose={() => setPaidCollectionDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delivered Collection Breakdown</DialogTitle>
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
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" variant="outlined" onClick={() => setPaidCollectionDialogOpen(false)}>
            Close
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog
        open={companyCreditDialogOpen}
        onClose={() => setCompanyCreditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Company-wise Credit Dues</DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="body2" color="text" mb={2}>
            Amounts are calculated from Pending Credits Tracker.
          </MDTypography>
          {loadingCompanyCredits ? (
            <MDBox py={4} textAlign="center">
              <MDTypography variant="body2" color="text">Loading pending credits...</MDTypography>
            </MDBox>
          ) : (
            <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
              <Table size="small" sx={{ width: "100%", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: "45%" }} />
                  <col style={{ width: "25%" }} />
                  <col style={{ width: "30%" }} />
                </colgroup>
                <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Company</TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Open Entries</TableCell>
                    <TableCell align="right" sx={{ fontWeight: "bold", whiteSpace: "nowrap" }}>Total Due</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {companyCreditTotals.map((company) => (
                    <TableRow key={company.companyName}>
                      <TableCell>{company.companyName}</TableCell>
                      <TableCell align="right">{company.count}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{money(company.total)}</TableCell>
                    </TableRow>
                  ))}
                  {!companyCreditTotals.length && (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                        <MDTypography variant="body2" color="text">No pending credits found.</MDTypography>
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow sx={{ "& td": { fontWeight: "bold", borderTop: "2px solid #e5e7eb" } }}>
                    <TableCell>Total Pending Credits</TableCell>
                    <TableCell align="right">{pendingCreditRows.length}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{money(pendingCreditTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" variant="outlined" onClick={() => setCompanyCreditDialogOpen(false)}>
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
      </div>
      <Footer />
    </DashboardLayout>
  );
}

export default Dashboard;
