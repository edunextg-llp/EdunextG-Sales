import { useEffect, useMemo, useState } from "react";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import {
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

import ejs from "ejs/ejs.min.js";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";

const PAYMENT_LABELS = {
  cash: "Cash",
  upi: "UPI",
  cheque: "Cheque",
  credit: "Credit",
};

const PAYMENT_COLORS = {
  cash: "success",
  upi: "info",
  cheque: "warning",
  credit: "secondary",
};

const CASH_DENOMINATIONS = [
  ["500 Note", "note_500", 500],
  ["200 Note", "note_200", 200],
  ["100 Note", "note_100", 100],
  ["50 Note", "note_50", 50],
  ["20 Note", "note_20", 20],
  ["10 Note", "note_10", 10],
  ["20 Coin", "coin_20", 20],
  ["10 Coin", "coin_10", 10],
  ["5 Coin", "coin_5", 5],
  ["2 Coin", "coin_2", 2],
  ["1 Coin", "coin_1", 1],
  ["Paisa", "paisa", 0.01],
];

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "N/A";
  const dateOnly = String(value).split("T")[0].split(" ")[0];
  const parts = dateOnly.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return value;
}

function getPaymentDetails(row) {
  if (row.payment_mode === "cash") {
    const details = row.cash_details || {};
    const parts = CASH_DENOMINATIONS
      .map(([label, key, amount]) => {
        const count = Number(details[key]) || 0;
        if (!count) return null;
        return `${label}: ${count} (${formatCurrency(count * amount)})`;
      })
      .filter(Boolean);
    return parts.length ? parts.join(", ") : `Cash: ${formatCurrency(row.amount)}`;
  }

  if (row.payment_mode === "cheque") {
    return `Cheque No: ${row.reference_no || "N/A"}${row.reference_date ? ` | Date: ${formatDate(row.reference_date)}` : ""}`;
  }

  if (row.payment_mode === "upi") {
    return `UPI No: ${row.reference_no || "N/A"}`;
  }

  if (row.payment_mode === "credit") {
    return `Credit Days: ${row.credit_days || "N/A"}`;
  }

  return "N/A";
}

// Display order of payment modes in the View popup, and the per-mode totals.
const MODE_ORDER = ["cash", "credit", "upi", "cheque"];
const modeRank = (mode) => {
  const index = MODE_ORDER.indexOf(mode);
  return index === -1 ? MODE_ORDER.length : index;
};
const getModeTotals = (rows) => MODE_ORDER.map((mode) => ({
  mode,
  count: rows.filter((row) => row.payment_mode === mode).length,
  amount: rows.filter((row) => row.payment_mode === mode).reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
}));

// Credit is a promise to pay later, not money in hand, so it stays out of the collected totals.
function collectedAmount(row) {
  return row.payment_mode === "credit" ? 0 : Number(row.amount) || 0;
}

function getBalanceAfter(row) {
  // staff_sales.balance_amount only counts settled payments, so subtract this collection while it is still pending.
  const balance = Number(row.balance_amount) || 0;
  const pending = row.settled_at ? 0 : Number(row.amount) || 0;
  return Math.max(0, Math.round((balance - pending) * 100) / 100);
}

// Settled vs still-to-settle amounts (credit is left out, like the other collected totals).
function getSettlementTotals(rows) {
  return rows.reduce((totals, row) => {
    if (row.payment_mode === "credit") return totals;
    const key = row.settled_at ? "settled" : "pending";
    totals[key] += collectedAmount(row);
    totals[`${key}Count`] += 1;
    return totals;
  }, { settled: 0, settledCount: 0, pending: 0, pendingCount: 0 });
}

const INVOICE_TYPE_LABELS = { taken_bill: "Out Bill", delivery: "Same Day" };

// Opens a printable report of the given collection rows; "Save as PDF" in the print dialog downloads it.
function downloadCollectionReport(rows, filename, title) {
  const sorted = [...rows].sort((a, b) => String(a.sale_company_name || "").localeCompare(String(b.sale_company_name || ""))
    || (a.settled_at ? 1 : 0) - (b.settled_at ? 1 : 0)
    || modeRank(a.payment_mode) - modeRank(b.payment_mode)
    || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const companies = [];
  sorted.forEach((row) => {
    const name = row.sale_company_name || "Company not assigned";
    let company = companies.find((item) => item.name === name);
    if (!company) {
      company = { name, rows: [] };
      companies.push(company);
    }
    company.rows.push({
      date: formatDate(row.collection_date || row.created_at),
      employee: row.delivery_boy_name || "",
      invoice: row.invoice_number || "N/A",
      saleId: `BP${row.sale_id}`,
      mode: PAYMENT_LABELS[row.payment_mode] || row.payment_mode || "",
      modeKey: row.payment_mode,
      type: INVOICE_TYPE_LABELS[row.collection_source] || "",
      outlet: row.outlet_name || "N/A",
      invoiceAmt: formatCurrency(row.price),
      collected: formatCurrency(row.amount),
      balance: formatCurrency(getBalanceAfter(row)),
      settled: Boolean(row.settled_at),
      raw: row,
    });
  });
  companies.forEach((company) => {
    const companyRows = company.rows.map((item) => item.raw);
    company.invoiceTotal = formatCurrency(companyRows.reduce((sum, row) => sum + (Number(row.price) || 0), 0));
    company.collectedTotal = formatCurrency(companyRows.reduce((sum, row) => sum + collectedAmount(row), 0));
    company.balanceTotal = formatCurrency(companyRows.reduce((sum, row) => sum + getBalanceAfter(row), 0));
    company.modes = getModeTotals(companyRows).map(({ mode, amount, count }) => ({ label: PAYMENT_LABELS[mode], amount: formatCurrency(amount), count }));
    const settlement = getSettlementTotals(companyRows);
    company.settled = formatCurrency(settlement.settled);
    company.pending = formatCurrency(settlement.pending);
  });
  const settlement = getSettlementTotals(sorted);
  const summary = [
    ...getModeTotals(sorted).map(({ mode, amount, count }) => ({ label: `${PAYMENT_LABELS[mode]} (${count})`, value: formatCurrency(amount) })),
    { label: `Settled (${settlement.settledCount})`, value: formatCurrency(settlement.settled), tone: "good" },
    { label: `Pending (${settlement.pendingCount})`, value: formatCurrency(settlement.pending), tone: "warn" },
    { label: "Total collected (excl. credit)", value: formatCurrency(sorted.reduce((sum, row) => sum + collectedAmount(row), 0)), tone: "total" },
  ];
  const generatedAt = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const html = ejs.render(`<!doctype html>
    <html><head><meta charset="utf-8"><title><%= filename %></title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; color: #172033; font-size: 11px; margin: 0; padding: 12px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .meta { color: #64748b; margin: 0 0 12px; }
      .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
      .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; min-width: 120px; }
      .box span { display: block; color: #64748b; font-size: 10px; }
      .box strong { font-size: 13px; }
      .box.good { border-color: #86efac; background: #f0fdf4; }
      .box.warn { border-color: #fcd34d; background: #fffbeb; }
      .box.total { border-color: #93c5fd; background: #eff6ff; }
      h2 { font-size: 14px; margin: 18px 0 6px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; }
      th { background: #dbeafe; font-size: 10px; }
      td.num, th.num { text-align: right; white-space: nowrap; }
      .sub { color: #64748b; font-size: 9px; display: block; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      .total-row td { font-weight: bold; background: #f8fafc; }
      .status { font-size: 10px; font-weight: bold; }
      .status.settled { color: #15803d; }
      .status.pending { color: #b45309; }
      .modes { margin-top: 4px; color: #475569; font-size: 10px; text-align: right; }
      button { padding: 8px 14px; margin-bottom: 12px; cursor: pointer; }
      @media print { button, .hint { display: none; } body { padding: 0; } }
    </style></head><body>
      <button onclick="window.print()">Print / Save as PDF</button>
      <span class="hint">Choose "Save as PDF" in the print dialog to download.</span>
      <h1><%= title %></h1>
      <p class="meta">Generated <%= generatedAt %> · <%= total %> bill<%= total === 1 ? "" : "s" %></p>
      <div class="summary">
        <% summary.forEach(function(item) { %>
          <div class="box <%= item.tone || "" %>"><span><%= item.label %></span><strong><%= item.value %></strong></div>
        <% }); %>
      </div>
      <% companies.forEach(function(company) { %>
        <h2>Company Name - <%= company.name %></h2>
        <table>
          <thead><tr>
            <th>SR</th><th>Date</th><th>Employee</th><th>Invoice No</th><th>Payment Mode</th><th>Invoice Type</th>
            <th>Outlet Name</th><th class="num">Invoice Amt</th><th class="num">Collected Amt</th><th class="num">Balance Amt</th><th>Status</th>
          </tr></thead>
          <tbody>
            <% company.rows.forEach(function(row, index) { %>
              <tr>
                <td><%= String(index + 1).padStart(2, "0") %></td>
                <td><%= row.date %></td>
                <td><%= row.employee %></td>
                <td><%= row.invoice %><span class="sub"><%= row.saleId %></span></td>
                <td><%= row.mode %></td>
                <td><%= row.type %></td>
                <td><%= row.outlet %></td>
                <td class="num"><%= row.invoiceAmt %></td>
                <td class="num"><%= row.collected %></td>
                <td class="num"><%= row.balance %></td>
                <td><span class="status <%= row.settled ? "settled" : "pending" %>"><%= row.settled ? "Settled" : "Pending" %></span></td>
              </tr>
            <% }); %>
            <tr class="total-row">
              <td colspan="7" style="text-align:right">Total</td>
              <td class="num"><%= company.invoiceTotal %></td>
              <td class="num"><%= company.collectedTotal %></td>
              <td class="num"><%= company.balanceTotal %></td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="modes">
          Settled: <b><%= company.settled %></b> · Pending: <b><%= company.pending %></b>
          <% company.modes.forEach(function(mode) { %> · <%= mode.label %>: <b><%= mode.amount %></b> (<%= mode.count %>)<% }); %>
        </div>
      <% }); %>
    </body></html>`, { title, filename, generatedAt, total: sorted.length, summary, companies });

  const printWindow = window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) throw new Error("Please allow popups to download the PDF report.");
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { if (!printWindow.closed) printWindow.print(); }, 300);
}

function authHeaders() {
  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token") || localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function DBCollection() {
  const [collections, setCollections] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterError, setFilterError] = useState("");
  const [loading, setLoading] = useState(false);
  const [settlingId, setSettlingId] = useState(null);
  const [settlementCollection, setSettlementCollection] = useState(null);
  const [chequeDate, setChequeDate] = useState("");
  const [cashCounts, setCashCounts] = useState({});
  const [viewCollection, setViewCollection] = useState(null);
  const [viewGroupKey, setViewGroupKey] = useState(null);
  const [confirmSettle, setConfirmSettle] = useState(null);
  // "Settle as" override: e.g. the app recorded UPI but the money actually came in cash.
  const [settleMode, setSettleMode] = useState("");
  const [upiNumber, setUpiNumber] = useState("");
  // Amount to settle; the office can correct it if the app recorded the wrong figure.
  const [settleAmount, setSettleAmount] = useState("");
  const settleAmountValid = /^\d+(\.\d{1,2})?$/.test(settleAmount.trim()) && Number(settleAmount) > 0;
  const cashTotal = CASH_DENOMINATIONS.reduce((total, [, key, value]) => total + (Number(cashCounts[key]) || 0) * Math.round(value * 100), 0) / 100;
  const [settlementError, setSettlementError] = useState("");
  const [page, setPage] = useState(1);
  const API = "https://bawarchee.edunextg.co/api";

  const fetchCollections = async (search = searchQuery) => {
    if (fromDate && toDate && fromDate > toDate) {
      setFilterError("From date must be on or before To date.");
      setCollections([]);
      return;
    }
    setFilterError("");
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const normalizedSearch = String(search || "").trim();
      if (normalizedSearch) {
        params.set("search", normalizedSearch);
      }
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const query = params.toString();
      const response = await fetch(`${API}/delivery-boy/collections${query ? `?${query}` : ""}`, { headers: authHeaders() });
      if (response.ok) {
        setCollections(await response.json());
      } else {
        setCollections([]);
        const data = await response.json();
        setFilterError(data.error || "Unable to load collections");
      }
    } catch (error) {
      console.error("Error fetching delivery boy collections:", error);
      setCollections([]);
      setFilterError("Unable to load collections");
    } finally {
      setLoading(false);
    }
  };

  const settleCollection = async (id, details = {}) => {
    setSettlingId(id);
    setSettlementError("");
    try {
      const response = await fetch(`${API}/delivery-boy/collections/${id}/settle`, {
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        method: "PUT",
        body: JSON.stringify(details),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to settle collection");
      setSettlementCollection(null);
      await fetchCollections();
    } catch (error) {
      if (settlementCollection) setSettlementError(error.message || "Unable to settle collection");
      else alert(error.message || "Unable to settle collection");
    }
    finally { setSettlingId(null); }
  };

  const requestSettlement = (row) => {
    // Every mode opens the settle form so the amount can be checked or corrected;
    // cheque and UPI also need their details there.
    setSettlementCollection(row);
    setChequeDate(row.reference_date || "");
    setCashCounts(row.cash_details || {});
    setUpiNumber(row.reference_no || "");
    setSettleMode(row.payment_mode);
    setSettleAmount(String(Number(row.amount) || ""));
    setSettlementError("");
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCollections(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, fromDate, toDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
  }, [searchQuery, fromDate, toDate]);

  const runDownload = (rows, filename, title) => {
    try {
      downloadCollectionReport(rows, filename, title);
    } catch (error) {
      console.error("Report download failed:", error);
      alert(error.message || "Unable to create the report. Please try again.");
    }
  };

  // One row per employee per day: delivery boys show BAWARCHEE, company staff show their own company.
  const groups = useMemo(() => {
    const map = new Map();
    collections.forEach((row) => {
      const isStaff = row.collector_type === "company_staff";
      const collectorId = isStaff ? row.staff_id : row.delivery_boy_id;
      const date = row.collection_date || String(row.created_at || "").split(" ")[0];
      const key = `${date}|${row.collector_type}|${collectorId}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          date,
          collectorType: row.collector_type,
          companyName: row.collector_company_name || (isStaff ? "Company not assigned" : "BAWARCHEE"),
          employeeName: row.delivery_boy_name || "N/A",
          rows: [],
          total: 0,
          pending: 0,
        });
      }
      const group = map.get(key);
      group.rows.push(row);
      group.total += collectedAmount(row);
      if (!row.settled_at) group.pending += 1;
    });
    // Newest date first (today on top); within a day, groups with bills still
    // to settle come before fully settled ones.
    return [...map.values()].sort((a, b) => (b.date || "").localeCompare(a.date || "")
      || (a.pending > 0 ? 0 : 1) - (b.pending > 0 ? 0 : 1)
      || a.employeeName.localeCompare(b.employeeName));
  }, [collections]);

  const viewGroup = useMemo(
    () => groups.find((group) => group.key === viewGroupKey) || null,
    [groups, viewGroupKey]
  );

  // Inside the popup, split the employee's collections by the invoice's company (Everest, SIL, ...).
  const companySections = useMemo(() => {
    if (!viewGroup) return [];
    const map = new Map();
    viewGroup.rows.forEach((row) => {
      const name = row.sale_company_name || "Company not assigned";
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(row);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, rows]) => ({
        name,
        // Unsettled bills on top, settled ones at the bottom.
        // Unsettled first; within that Cash, Credit, UPI, Cheque; then oldest first.
        rows: [...rows].sort((a, b) => (a.settled_at ? 1 : 0) - (b.settled_at ? 1 : 0)
          || modeRank(a.payment_mode) - modeRank(b.payment_mode)
          || String(a.created_at).localeCompare(String(b.created_at))),
        modeTotals: getModeTotals(rows),
        settlement: getSettlementTotals(rows),
        invoiceTotal: rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0),
        collectedTotal: rows.reduce((sum, row) => sum + collectedAmount(row), 0),
        balanceTotal: rows.reduce((sum, row) => sum + getBalanceAfter(row), 0),
      }));
  }, [viewGroup]);

  const totalPages = Math.max(1, Math.ceil(groups.length / ROWS_PER_PAGE));
  const paginatedGroups = groups.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE
  );

  const detailTableSx = {
    "& .MuiTableCell-root": { fontSize: "0.75rem", whiteSpace: "nowrap", px: 1.25, py: 1 },
    "& .MuiChip-root, & .MuiButton-root": { fontSize: "0.75rem" },
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={3}>
            <MDBox
              display="flex"
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              gap={2}
              flexDirection={{ xs: "column", md: "row" }}
              mb={3}
            >
              <MDBox>
                <MDTypography variant="h5" fontWeight="medium">
                  D.B. Collection
                </MDTypography>
                <MDTypography variant="button" color="text">
                  Payments submitted by delivery boys and company staff, grouped by employee and day. Open a row to settle.
                </MDTypography>
              </MDBox>
              <MDBox display="flex" gap={1.5} alignItems="center" flexWrap="wrap">
                <MDButton variant="outlined" color="info" size="small" onClick={() => fetchCollections()}>
                  <Icon sx={{ mr: 1 }}>refresh</Icon>
                  Refresh
                </MDButton>
              </MDBox>
            </MDBox>

            <MDBox mb={2} display="flex" gap={1.5} flexWrap="wrap" alignItems="center">
              <MDInput
                label="Search collections"
                placeholder="Employee, company, outlet, invoice or sale ID"
                sx={{ width: { xs: "100%", md: 340 }, flexShrink: 1 }}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <MDInput label="From date" type="date" value={fromDate} sx={{ width: 160 }}
                onChange={(event) => setFromDate(event.target.value)} InputLabelProps={{ shrink: true }}
                inputProps={{ min: "1000-01-01", max: toDate || "9999-12-31" }} />
              <MDInput label="To date" type="date" value={toDate} sx={{ width: 160 }}
                onChange={(event) => setToDate(event.target.value)} InputLabelProps={{ shrink: true }}
                inputProps={{ min: fromDate || "1000-01-01", max: "9999-12-31" }} />
              <MDButton color="secondary" variant="outlined" size="small" disabled={!fromDate && !toDate}
                onClick={() => { setFromDate(""); setToDate(""); }}>Clear dates</MDButton>
            </MDBox>
            {filterError && <Alert severity="error" sx={{ mb: 2 }}>{filterError}</Alert>}
            <TableContainer component={Paper} sx={paginatedTableContainerSx}>
              <Table stickyHeader size="small" sx={detailTableSx}>
                <TableHead sx={paginatedTableHeadSx()}>
                  <TableRow>
                    <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>Sr No</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Date</TableCell>
                    <TableCell align="left" sx={paginatedTableHeadCellSx}>Company Name</TableCell>
                    <TableCell align="left" sx={paginatedTableHeadCellSx}>Employee Name</TableCell>
                    <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 80 }}>View</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <MDTypography variant="button" color="text">Loading...</MDTypography>
                      </TableCell>
                    </TableRow>
                  ) : paginatedGroups.length > 0 ? (
                    paginatedGroups.map((group, index) => (
                      <TableRow key={group.key} hover>
                        <TableCell align="center">{(page - 1) * ROWS_PER_PAGE + index + 1}</TableCell>
                        <TableCell align="center">{formatDate(group.date)}</TableCell>
                        <TableCell>
                          <Chip
                            label={group.companyName}
                            size="small"
                            variant="outlined"
                            color={group.collectorType === "company_staff" ? "info" : "warning"}
                          />
                        </TableCell>
                        <TableCell>
                          {group.employeeName}
                          <MDTypography display="block" variant="caption" color="text">
                            {group.collectorType === "company_staff" ? "Company Staff" : "Delivery Boy"}
                            {" · "}{group.rows.length} bill{group.rows.length === 1 ? "" : "s"}
                            {group.pending > 0 ? ` · ${group.pending} to settle` : " · all settled"}
                          </MDTypography>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="View collections">
                            <IconButton size="small" color="info" aria-label={`View collections of ${group.employeeName} on ${formatDate(group.date)}`}
                              onClick={() => setViewGroupKey(group.key)}>
                              <Icon fontSize="small">visibility</Icon>
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <MDTypography variant="button" color="text">
                          No collection updates found.
                        </MDTypography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePaginationFooter
              page={page}
              totalPages={totalPages}
              total={groups.length}
              onPageChange={setPage}
            />
          </MDBox>
        </Card>
      </MDBox>
      <Dialog open={Boolean(viewGroup)} onClose={() => setViewGroupKey(null)} fullWidth maxWidth="lg">
        <DialogTitle>
          {viewGroup?.employeeName}
          <MDTypography display="block" variant="button" color="text" fontWeight="regular">
            {viewGroup?.companyName} · {viewGroup?.collectorType === "company_staff" ? "Company Staff" : "Delivery Boy"} · {formatDate(viewGroup?.date)}
          </MDTypography>
        </DialogTitle>
        <DialogContent dividers>
          {companySections.map((section) => (
            <MDBox key={section.name} mb={3}>
              <MDTypography variant="h6" fontWeight="medium" mb={1}>
                Company Name - {section.name}
              </MDTypography>
              <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid", borderColor: "grey.300" }}>
                <Table size="small" sx={detailTableSx}>
                  <TableHead sx={{ display: "table-header-group" }}>
                    <TableRow>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>SR</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Date</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Invoice No</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Payment Mode</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Invoice Type</TableCell>
                      <TableCell align="left" sx={{ fontWeight: 600 }}>Outlet Name</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Invoice Amt</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Collected Amt</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Balance Amt</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Settle</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {section.rows.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell align="center">{String(index + 1).padStart(2, "0")}</TableCell>
                        <TableCell align="center">{formatDate(row.created_at)}</TableCell>
                        <TableCell align="center">
                          {row.invoice_number || "N/A"}
                          <MDTypography display="block" variant="caption" color="text">BP{row.sale_id}</MDTypography>
                        </TableCell>
                        <TableCell align="center">
                          <MDBox display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                            <Chip
                              label={PAYMENT_LABELS[row.payment_mode] || row.payment_mode || "N/A"}
                              color={PAYMENT_COLORS[row.payment_mode] || "default"}
                              size="small"
                              variant="outlined"
                            />
                            {row.payment_mode === "cash" && (
                              <Tooltip title="View cash details">
                                <IconButton size="small" color="info" aria-label={`View cash details for ${row.outlet_name || `BP${row.sale_id}`}`}
                                  onClick={() => setViewCollection(row)}>
                                  <Icon fontSize="small">payments</Icon>
                                </IconButton>
                              </Tooltip>
                            )}
                          </MDBox>
                          {!["cash", "credit"].includes(row.payment_mode) && (
                            <MDTypography display="block" variant="caption" color="text">{getPaymentDetails(row)}</MDTypography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={row.collection_source === "taken_bill" ? "Out Bill" : row.collection_source === "delivery" ? "Same Day" : "Not recorded"}
                            color={row.collection_source === "taken_bill" ? "info" : row.collection_source === "delivery" ? "success" : "default"}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{row.outlet_name || "N/A"}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(row.price)}
                          {!row.settled_at && (Number(row.price) || 0) - (Number(row.balance_amount) || 0) > 0.009 && (
                            <MDTypography display="block" variant="caption" color="text">
                              Earlier paid: {formatCurrency((Number(row.price) || 0) - (Number(row.balance_amount) || 0))}
                            </MDTypography>
                          )}
                        </TableCell>
                        <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                        <TableCell align="right">{formatCurrency(getBalanceAfter(row))}</TableCell>
                        <TableCell align="center">
                          {row.settled_at ? (
                            <Chip label="Settled" color="success" size="small" variant="outlined" />
                          ) : (
                            <MDButton color="success" size="small" variant="gradient" disabled={settlingId !== null}
                              onClick={() => requestSettlement(row)}>
                              {settlingId === row.id ? "Settling..." : "Settle"}
                            </MDButton>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ "& .MuiTableCell-root": { fontWeight: 700, borderTop: "2px solid", borderColor: "grey.400" } }}>
                      <TableCell colSpan={6} align="right">Total</TableCell>
                      <TableCell align="right">{formatCurrency(section.invoiceTotal)}</TableCell>
                      <TableCell align="right">{formatCurrency(section.collectedTotal)}</TableCell>
                      <TableCell align="right">{formatCurrency(section.balanceTotal)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={10} sx={{ backgroundColor: "#f8fafc" }}>
                        <MDBox display="flex" gap={1} flexWrap="wrap" justifyContent="flex-end">
                          <Chip size="small" color="success" label={`Settled: ${formatCurrency(section.settlement.settled)} (${section.settlement.settledCount})`} sx={{ fontWeight: 600 }} />
                          <Chip size="small" color="warning" label={`Pending: ${formatCurrency(section.settlement.pending)} (${section.settlement.pendingCount})`} sx={{ fontWeight: 600 }} />
                          {section.modeTotals.map(({ mode, count, amount }) => (
                            <Chip
                              key={mode}
                              size="small"
                              variant="outlined"
                              color={count ? PAYMENT_COLORS[mode] : "default"}
                              label={`${PAYMENT_LABELS[mode]}: ${formatCurrency(amount)} (${count})`}
                              sx={{ fontWeight: 600, opacity: count ? 1 : 0.6 }}
                            />
                          ))}
                        </MDBox>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </MDBox>
          ))}
          {viewGroup && (
            <MDBox textAlign="right">
              <MDBox display="flex" gap={2} flexWrap="wrap" justifyContent="flex-end" mb={0.5}>
                {getModeTotals(viewGroup.rows).map(({ mode, amount }) => (
                  <MDTypography key={mode} variant="button" color="text">
                    {PAYMENT_LABELS[mode]}: <strong>{formatCurrency(amount)}</strong>
                  </MDTypography>
                ))}
              </MDBox>
              <MDBox display="flex" gap={2} flexWrap="wrap" justifyContent="flex-end" mb={0.5}>
                <MDTypography variant="button" sx={{ color: "#15803d" }}>
                  Settled: <strong>{formatCurrency(getSettlementTotals(viewGroup.rows).settled)}</strong>
                </MDTypography>
                <MDTypography variant="button" sx={{ color: "#b45309" }}>
                  Pending: <strong>{formatCurrency(getSettlementTotals(viewGroup.rows).pending)}</strong>
                </MDTypography>
              </MDBox>
              <MDTypography variant="button" fontWeight="bold" display="block">
                Grand total collected: {formatCurrency(viewGroup.total)}
              </MDTypography>
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton variant="outlined" color="info" disabled={!viewGroup}
            onClick={() => runDownload(viewGroup.rows, `DB_Collection_${viewGroup.employeeName}_${viewGroup.date}`,
              `D.B. Collection — ${viewGroup.employeeName} (${viewGroup.companyName}) — ${formatDate(viewGroup.date)}`)}>
            <Icon sx={{ mr: 0.5 }}>download</Icon>Download PDF
          </MDButton>
          <MDButton color="secondary" onClick={() => setViewGroupKey(null)}>Close</MDButton>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(settlementCollection)} onClose={() => { if (settlingId === null) setSettlementCollection(null); }} fullWidth maxWidth="xs">
        <DialogTitle>Settle {PAYMENT_LABELS[settlementCollection?.payment_mode]} collection</DialogTitle>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!settlementCollection || settlingId !== null) return;
          if (!settleAmountValid) {
            setSettlementError("Enter a valid amount greater than zero with at most two decimal places.");
            return;
          }
          const recordedMode = settlementCollection.payment_mode;
          const details = settleMode === "cash" && recordedMode !== "cash" ? { settleMode: "cash" }
            : settleMode === "upi" ? { referenceNo: upiNumber.trim() }
              : settleMode === "cheque" ? { chequeDate } : {};
          if (Math.abs(Number(settleAmount) - Number(settlementCollection.amount)) > 0.001) {
            details.amount = Number(settleAmount);
          }
          setConfirmSettle({ row: settlementCollection, details });
        }}>
          <DialogContent>
            <MDTypography variant="button" display="block" mb={2}>
              {settlementCollection?.outlet_name} — {formatCurrency(settlementCollection?.amount)}
            </MDTypography>
            <MDTypography variant="caption" color="text" display="block" mb={0.75}>Settle as</MDTypography>
            <MDBox display="flex" gap={1} mb={2} flexWrap="wrap">
              {(["upi", "cheque"].includes(settlementCollection?.payment_mode) ? [settlementCollection.payment_mode, "cash"] : [settlementCollection?.payment_mode]).filter(Boolean).map((mode) => (
                <Chip
                  key={mode}
                  clickable
                  disabled={settlingId !== null}
                  onClick={() => { setSettleMode(mode); setSettlementError(""); }}
                  color={settleMode === mode ? PAYMENT_COLORS[mode] : "default"}
                  variant={settleMode === mode ? "filled" : "outlined"}
                  label={mode === settlementCollection?.payment_mode ? `${PAYMENT_LABELS[mode]} (as recorded)` : PAYMENT_LABELS[mode]}
                />
              ))}
            </MDBox>
            <MDInput label="Amount (Rs.)" required fullWidth type="number"
              value={settleAmount} disabled={settlingId !== null}
              onChange={(event) => { setSettleAmount(event.target.value); setSettlementError(""); }}
              inputProps={{ min: 0.01, step: "0.01" }}
              error={settleAmount !== "" && !settleAmountValid}
              helperText={settleAmountValid && Math.abs(Number(settleAmount) - Number(settlementCollection?.amount)) > 0.001
                ? `Corrected from ${formatCurrency(settlementCollection?.amount)} recorded in the app`
                : "Change this if the recorded amount is wrong."}
              sx={{ mb: 2 }} />
            {settleMode === "cash" && settlementCollection?.payment_mode !== "cash" && (
              <Alert severity="info" sx={{ mb: 1 }}>
                This will be settled as a cash payment of {formatCurrency(settleAmountValid ? Number(settleAmount) : settlementCollection?.amount)} instead of {PAYMENT_LABELS[settlementCollection?.payment_mode]}.
              </Alert>
            )}
            {settleMode === "cheque" && <>
            <MDTypography variant="button" display="block" mb={2}>Cheque No: {settlementCollection?.reference_no || "N/A"}</MDTypography>
            <MDInput label="Cheque date" type="date" required fullWidth
              value={chequeDate} onChange={(event) => setChequeDate(event.target.value)}
              disabled={settlingId !== null} InputLabelProps={{ shrink: true }}
              inputProps={{ min: "1000-01-01", max: "9999-12-31" }} />
            </>}
            {settleMode === "upi" && <MDInput label="UPI number" required fullWidth
              value={upiNumber} onChange={(event) => setUpiNumber(event.target.value)} disabled={settlingId !== null}
              inputProps={{ maxLength: 255 }} />}
            {false && <>
              <MDBox display="grid" gridTemplateColumns="1fr 1fr" gap={2} mt={1}>
                {CASH_DENOMINATIONS.map(([label, key, value]) => <MDInput key={key} label={key === "paisa" ? "Paisa (100 = ₹1)" : `${label} × count`}
                  type="number" value={cashCounts[key] ?? ""} disabled={settlingId !== null}
                  onChange={(event) => setCashCounts((previous) => ({ ...previous, [key]: event.target.value }))}
                  inputProps={{ min: 0, step: 1 }} helperText={formatCurrency((Number(cashCounts[key]) || 0) * value)} />)}
              </MDBox>
              <MDTypography variant="button" display="block" mt={2}>Counted total: {formatCurrency(cashTotal)}</MDTypography>
              <MDTypography variant="caption">The counted total must match the collection amount.</MDTypography>
            </>}
            {settlementError && <Alert severity="error" sx={{ mt: 2 }}>{settlementError}</Alert>}
          </DialogContent>
          <DialogActions>
            <MDButton color="secondary" disabled={settlingId !== null} onClick={() => setSettlementCollection(null)}>Cancel</MDButton>
            <MDButton type="submit" color="success" variant="gradient" disabled={settlingId !== null
              || !settleAmountValid
              || (settleMode === "cheque" && !chequeDate)
              || (settleMode === "upi" && !upiNumber.trim())}>
              {settlingId !== null ? "Settling..." : "Settle"}
            </MDButton>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog open={Boolean(viewCollection)} onClose={() => setViewCollection(null)} fullWidth maxWidth="xs">
        <DialogTitle>Cash details</DialogTitle>
        <DialogContent>
          <MDTypography variant="button" display="block" mb={2}>
            {viewCollection?.outlet_name} — {formatCurrency(viewCollection?.amount)}
          </MDTypography>
          {CASH_DENOMINATIONS.filter(([, key]) => Number(viewCollection?.cash_details?.[key]) > 0)
            .map(([label, key, value]) => (
              <MDTypography key={key} variant="button" display="block" mb={1}>
                {label}: {viewCollection.cash_details[key]} ({formatCurrency(Number(viewCollection.cash_details[key]) * value)})
              </MDTypography>
            ))}
          {!CASH_DENOMINATIONS.some(([, key]) => Number(viewCollection?.cash_details?.[key]) > 0) && (
            <MDTypography variant="button">Cash denomination counts have not been recorded yet.</MDTypography>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" onClick={() => setViewCollection(null)}>Close</MDButton>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(confirmSettle)} onClose={() => setConfirmSettle(null)} fullWidth maxWidth="xs">
        <DialogTitle>Are you sure you want to submit?</DialogTitle>
        <DialogContent>
          <MDTypography variant="button" display="block" mb={1}>
            {confirmSettle?.row?.outlet_name || "N/A"} — {formatCurrency(confirmSettle?.details?.amount ?? confirmSettle?.row?.amount)}
          </MDTypography>
          {confirmSettle?.details?.amount != null && (
            <MDTypography variant="button" color="warning" display="block" mb={1}>
              Amount corrected from {formatCurrency(confirmSettle?.row?.amount)} recorded in the app
            </MDTypography>
          )}
          <MDTypography variant="button" color="text" display="block">
            {confirmSettle?.details?.settleMode && confirmSettle.details.settleMode !== confirmSettle?.row?.payment_mode
              ? `Settle as ${PAYMENT_LABELS[confirmSettle.details.settleMode]} (recorded as ${PAYMENT_LABELS[confirmSettle.row.payment_mode]})`
              : PAYMENT_LABELS[confirmSettle?.row?.payment_mode] || confirmSettle?.row?.payment_mode} · {confirmSettle?.row?.invoice_number || `BP${confirmSettle?.row?.sale_id}`}
          </MDTypography>
          <MDTypography variant="caption" color="text" display="block" mt={1}>
            This settlement will be recorded as a payment and cannot be undone here.
          </MDTypography>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" onClick={() => setConfirmSettle(null)}>No</MDButton>
          <MDButton color="success" variant="gradient" disabled={settlingId !== null} onClick={() => {
            const { row, details } = confirmSettle;
            setConfirmSettle(null);
            settleCollection(row.id, details);
          }}>
            Yes, Settle
          </MDButton>
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}

export default DBCollection;
