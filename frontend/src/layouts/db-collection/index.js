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
  const [upiNumber, setUpiNumber] = useState("");
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
    if (["cheque", "cash", "upi"].includes(row.payment_mode)) {
      setSettlementCollection(row);
      setChequeDate(row.reference_date || "");
      setCashCounts(row.cash_details || {});
      setUpiNumber(row.reference_no || "");
      setSettlementError("");
    } else {
      settleCollection(row.id);
    }
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

  const totalAmount = useMemo(
    () => collections.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [collections]
  );

  const totalPages = Math.max(1, Math.ceil(collections.length / ROWS_PER_PAGE));
  const paginatedCollections = collections.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE
  );

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
                  Payments submitted from delivery-boy mobile accounts. Settle after reconciliation.
                </MDTypography>
              </MDBox>
              <MDBox display="flex" gap={1.5} alignItems="center" flexWrap="wrap">
                <MDTypography variant="button" fontWeight="medium" color="dark">
                  Total: {formatCurrency(totalAmount)}
                </MDTypography>
                <MDButton variant="outlined" color="info" size="small" onClick={() => fetchCollections()}>
                  <Icon sx={{ mr: 1 }}>refresh</Icon>
                  Refresh
                </MDButton>
              </MDBox>
            </MDBox>

            <MDBox mb={2} display="flex" gap={1.5} flexWrap="wrap" alignItems="center">
              <MDInput
                label="Search collections"
                placeholder="Outlet, invoice, delivery boy, payment mode, or sale ID"
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
              <Table
                stickyHeader
                size="small"
                sx={{
                  "& .MuiTableCell-root": {
                    fontSize: "0.75rem",
                    whiteSpace: "nowrap",
                    px: 1.25,
                    py: 1,
                  },
                  "& .MuiChip-root, & .MuiButton-root": {
                    fontSize: "0.75rem",
                  },
                }}
              >
                <TableHead sx={paginatedTableHeadSx()}>
                  <TableRow>
                    <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                      Sr No
                    </TableCell>
                    <TableCell align="left" sx={paginatedTableHeadCellSx}>Outlet Name</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Invoice No</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Sale ID</TableCell>
                    <TableCell align="left" sx={paginatedTableHeadCellSx}>Delivery Boy</TableCell>
                    <TableCell align="left" sx={paginatedTableHeadCellSx}>Payment Source</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Payment Status</TableCell>
                    <TableCell align="right" sx={paginatedTableHeadCellSx}>Amount</TableCell>
                    <TableCell align="left" sx={paginatedTableHeadCellSx}>Details</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Updated</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Settlement</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={11} align="center">
                        <MDTypography variant="button" color="text">Loading...</MDTypography>
                      </TableCell>
                    </TableRow>
                  ) : paginatedCollections.length > 0 ? (
                    paginatedCollections.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell align="center">{(page - 1) * ROWS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>{row.outlet_name || "N/A"}</TableCell>
                        <TableCell align="center">{row.invoice_number || "N/A"}</TableCell>
                        <TableCell align="center">BP{row.sale_id}</TableCell>
                        <TableCell>{row.delivery_boy_name || "N/A"}</TableCell>
                        <TableCell>
                          <Chip
                            label={row.collection_source === "taken_bill" ? "Out Bill" : row.collection_source === "delivery" ? "Same-day Delivery" : "Not recorded"}
                            color={row.collection_source === "taken_bill" ? "info" : row.collection_source === "delivery" ? "success" : "default"}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={PAYMENT_LABELS[row.payment_mode] || row.payment_mode || "N/A"}
                            color={PAYMENT_COLORS[row.payment_mode] || "default"}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                        <TableCell>
                          {row.payment_mode === "cash" ? (
                            <Tooltip title="View cash details">
                              <IconButton size="small" color="info" aria-label={`View cash details for ${row.outlet_name || `BP${row.sale_id}`}`}
                                onClick={() => setViewCollection(row)}>
                                <Icon fontSize="small">visibility</Icon>
                              </IconButton>
                            </Tooltip>
                          ) : getPaymentDetails(row)}
                        </TableCell>
                        <TableCell align="center">{formatDate(row.updated_at)}</TableCell>
                        <TableCell align="center">{row.settled_at ? <Chip label="Settled" color="success" size="small" variant="outlined" /> : <MDButton color="success" size="small" variant="gradient" disabled={settlingId !== null} onClick={() => requestSettlement(row)}>{settlingId === row.id ? "Settling..." : "Settle"}</MDButton>}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} align="center">
                        <MDTypography variant="button" color="text">
                          No delivery-boy collection updates found.
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
              total={collections.length}
              onPageChange={setPage}
            />
          </MDBox>
        </Card>
      </MDBox>
      <Dialog open={Boolean(settlementCollection)} onClose={() => { if (settlingId === null) setSettlementCollection(null); }} fullWidth maxWidth="xs">
        <DialogTitle>Settle {PAYMENT_LABELS[settlementCollection?.payment_mode]} collection</DialogTitle>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!settlementCollection || settlingId !== null) return;
          if (settlementCollection.payment_mode === "cash" && Math.round(cashTotal * 100) !== Math.round(Number(settlementCollection.amount) * 100)) {
            setSettlementError("Cash denomination total must equal the collection amount.");
            return;
          }
          const details = settlementCollection.payment_mode === "cash" ? { cashDetails: cashCounts }
            : settlementCollection.payment_mode === "upi" ? { referenceNo: upiNumber.trim() } : { chequeDate };
          settleCollection(settlementCollection.id, details);
        }}>
          <DialogContent>
            <MDTypography variant="button" display="block" mb={2}>
              {settlementCollection?.outlet_name} — {formatCurrency(settlementCollection?.amount)}
            </MDTypography>
            {settlementCollection?.payment_mode === "cheque" && <>
            <MDTypography variant="button" display="block" mb={2}>Cheque No: {settlementCollection.reference_no || "N/A"}</MDTypography>
            <MDInput label="Cheque date" type="date" required fullWidth
              value={chequeDate} onChange={(event) => setChequeDate(event.target.value)}
              disabled={settlingId !== null} InputLabelProps={{ shrink: true }}
              inputProps={{ min: "1000-01-01", max: "9999-12-31" }} />
            </>}
            {settlementCollection?.payment_mode === "upi" && <MDInput label="UPI number" required fullWidth
              value={upiNumber} onChange={(event) => setUpiNumber(event.target.value)} disabled={settlingId !== null}
              inputProps={{ maxLength: 255 }} />}
            {settlementCollection?.payment_mode === "cash" && <>
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
              || (settlementCollection?.payment_mode === "cheque" && !chequeDate)
              || (settlementCollection?.payment_mode === "upi" && !upiNumber.trim())
              || (settlementCollection?.payment_mode === "cash" && (cashTotal <= 0 || Math.round(cashTotal * 100) !== Math.round(Number(settlementCollection.amount) * 100)))}>
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
      <Footer />
    </DashboardLayout>
  );
}

export default DBCollection;
