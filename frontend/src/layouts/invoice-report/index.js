// Report > Invoice Report.
// "Add Sales" tasks from Dashboard > Assign show here as soon as the invoice PDF is uploaded.
// Invoice PDFs uploaded on Dashboard > Assign are read for their invoice numbers (e.g.
// IN-5125-554 counts as IN5125554). Each number is checked against Add Sales: created or
// not, delivered / cancelled / returned / pending, and whether its payment is updated.
import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
import {
  Alert,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import { viewAssignmentFile } from "utils/assignmentFile";

const API = process.env.REACT_APP_API_URL;

const isoDate = (date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
};
const showDate = (value) => {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return d && m && y ? `${d}-${m}-${y}` : value;
};
const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COLOR = {
  not_created: { bg: "#fee2e2", fg: "#b91c1c" },
  delivered: { bg: "#dcfce7", fg: "#15803d" },
  cancelled: { bg: "#fde2e2", fg: "#991b1b" },
  returned: { bg: "#ede9fe", fg: "#6d28d9" },
  out_for_delivery: { bg: "#dbeafe", fg: "#1d4ed8" },
  packing_done: { bg: "#e0f2fe", fg: "#0369a1" },
  packing: { bg: "#fef3c7", fg: "#b45309" },
  not_packing: { bg: "#f1f5f9", fg: "#475569" },
};
const statusChip = (invoice) => {
  const c = STATUS_COLOR[invoice.status] || STATUS_COLOR.not_packing;
  return <Chip size="small" label={invoice.statusLabel} sx={{ fontWeight: 700, backgroundColor: c.bg, color: c.fg }} />;
};

// Filter chips: [key, label, test].
const FILTERS = [
  ["all", "All", () => true],
  ["not_created", "Not created", (i) => !i.created],
  ["created", "Created", (i) => i.created],
  ["delivered", "Delivered", (i) => i.status === "delivered"],
  ["cancelled", "Cancelled", (i) => i.status === "cancelled"],
  ["returned", "Returned", (i) => i.status === "returned"],
  ["pending", "Not delivered yet", (i) => i.created && !["delivered", "cancelled", "returned"].includes(i.status)],
  ["paid", "Payment updated", (i) => i.paymentUpdated],
  ["unpaid", "Payment not updated", (i) => i.created && !i.paymentUpdated && i.status !== "cancelled"],
];
const FILTER_TEST = Object.fromEntries(FILTERS.map(([key, , test]) => [key, test]));

const SUMMARY_TILES = [
  ["total", "Invoices in PDFs", "description", "#1A73E8", "all"],
  ["created", "Created in Add Sales", "task_alt", "#0f766e", "created"],
  ["notCreated", "Not created", "error_outline", "#dc2626", "not_created"],
  ["delivered", "Delivered", "local_shipping", "#16a34a", "delivered"],
  ["cancelled", "Cancelled", "cancel", "#991b1b", "cancelled"],
  ["returned", "Returned", "keyboard_return", "#6d28d9", "returned"],
  ["pending", "Not delivered yet", "schedule", "#d97706", "pending"],
  ["paymentUpdated", "Payment updated", "payments", "#0369a1", "paid"],
];

// Auto Add Sales result of an invoice not created yet.
const AUTO_WAITING = ["needs_own", "waiting", "waiting_date"];
const AUTO_LABEL = {
  needs_own: "Waiting for own approval",
  waiting: "Waiting for approval",
  waiting_date: "Waiting for invoice date",
  failed: "Not auto-created",
  rejected: "Rejected",
};

const headSx = { fontWeight: 700, fontSize: "0.72rem", color: "#475569", backgroundColor: "#f8fafc", whiteSpace: "nowrap", py: 1 };
const cellSx = { fontSize: "0.8rem", py: 0.75 };

function InvoiceReport() {
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(isoDate(new Date()));
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState({});
  const [rereading, setRereading] = useState(null);

  useEffect(() => {
    fetch(`${API}/staff/companies`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setCompanies(Array.isArray(list) ? list : list.companies || []))
      .catch(() => setCompanies([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (companyId) params.set("companyId", companyId);
      const res = await fetch(`${API}/staff/invoice-report?${params}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Unable to load the report.");
      setData(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, companyId]);

  useEffect(() => {
    load();
    // Load once on open; later loads use the Show button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reread = async (assignment) => {
    setRereading(assignment.id);
    try {
      const res = await fetch(`${API}/staff/invoice-report/${assignment.id}/reread`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The PDF could not be read.");
      await load();
    } catch (err) {
      setError(`${assignment.documentName}: ${err.message}`);
    } finally {
      setRereading(null);
    }
  };

  const openPdf = (assignment) => viewAssignmentFile("admin", assignment.id).catch((err) => setError(err.message));

  const assignments = useMemo(() => data?.assignments || [], [data]);
  const totals = useMemo(() => assignments.reduce((sum, a) => {
    Object.entries(a.summary).forEach(([key, value]) => { sum[key] = (sum[key] || 0) + value; });
    return sum;
  }, {}), [assignments]);

  const words = search.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const matches = (invoice) => FILTER_TEST[filter](invoice) && words.every((w) => [
    invoice.invoiceNumber, invoice.outletName, invoice.staffName,
  ].join(" ").toUpperCase().replace(/[^A-Z0-9 ]/g, "").includes(w));

  const shown = assignments
    .map((a) => ({ ...a, rows: a.invoices.filter(matches) }))
    .filter((a) => a.rows.length || (filter === "all" && !words.length));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <MDBox mb={2.5}>
          <MDTypography variant="h4" fontWeight="bold">Invoice Report</MDTypography>
          <MDTypography variant="button" color="text" fontWeight="regular">
            Add Sales tasks from Dashboard &gt; Assign, as soon as the invoice PDF is uploaded. Invoice numbers
            read from the PDF are checked against Add Sales: created or not, delivered, cancelled, and payment updated.
            Invoices not in Add Sales yet are created automatically from the PDF (invoice no., date, outlet, amount,
            no. of items) with the Add Sales rules: only today&apos;s invoice date, and another day&apos;s bit or overdue
            credit needs approval (own permission in the assignee&apos;s portal, else a request). Not for SIL for now.
          </MDTypography>
        </MDBox>

        {/* Filters */}
        <Card sx={{ mb: 2.5 }}>
          <MDBox p={2} display="flex" gap={1.5} flexWrap="wrap" alignItems="center">
            <TextField size="small" type="date" label="From (work date)" value={from} onChange={(e) => setFrom(e.target.value)}
              InputLabelProps={{ shrink: true }} />
            <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" select label="Company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}
              sx={{ minWidth: 200 }} SelectProps={{ sx: { height: 40 } }}>
              <MenuItem value="">All companies</MenuItem>
              {companies.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
            </TextField>
            <MDButton variant="gradient" color="info" onClick={load} disabled={loading}>
              {loading ? <CircularProgress size={16} color="inherit" sx={{ mr: 1 }} /> : <Icon sx={{ mr: 0.75 }}>search</Icon>}
              Show
            </MDButton>
            <MDBox flexGrow={1} />
            <TextField size="small" label="Search invoice / outlet / staff" value={search} onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 240 }} />
          </MDBox>
          {loading && (
            <MDBox px={2} pb={1.5}>
              <MDTypography variant="caption" color="text">
                Reading the invoice PDFs. New PDFs are read once, so the first load can take a little while.
              </MDTypography>
            </MDBox>
          )}
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

        {data && (
          <>
            {/* Totals: click a tile to filter */}
            <Grid container spacing={1.5} mb={2.5}>
              {SUMMARY_TILES.map(([key, label, icon, colour, filterKey]) => (
                <Grid item xs={6} sm={4} md={3} xl={1.5} key={key}>
                  <Card onClick={() => setFilter(filterKey)}
                    sx={{
                      cursor: "pointer", height: "100%", boxShadow: "none",
                      border: filter === filterKey ? `2px solid ${colour}` : "1px solid #e2e8f0",
                    }}>
                    <MDBox p={1.5} display="flex" alignItems="center" gap={1.25}>
                      <MDBox display="flex" alignItems="center" justifyContent="center"
                        sx={{ width: 36, height: 36, borderRadius: "10px", backgroundColor: `${colour}1a`, color: colour, flexShrink: 0 }}>
                        <Icon fontSize="small">{icon}</Icon>
                      </MDBox>
                      <MDBox minWidth={0}>
                        <MDTypography variant="h5" fontWeight="bold" lineHeight={1.1}>{totals[key] || 0}</MDTypography>
                        <MDTypography variant="caption" color="text" display="block" lineHeight={1.2}>{label}</MDTypography>
                      </MDBox>
                    </MDBox>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <MDBox display="flex" gap={0.75} flexWrap="wrap" mb={2}>
              {FILTERS.map(([key, label]) => (
                <Chip key={key} label={label} size="small" clickable onClick={() => setFilter(key)}
                  color={filter === key ? "info" : "default"} variant={filter === key ? "filled" : "outlined"} />
              ))}
            </MDBox>

            {!assignments.length && (
              <Alert severity="info">No Add Sales tasks with an invoice PDF were assigned for these dates.</Alert>
            )}
            {assignments.length > 0 && !shown.length && <Alert severity="info">No invoices match this filter.</Alert>}

            {shown.map((a) => {
              const isOpen = open[a.id] ?? true;
              return (
                <Card key={a.id} sx={{ mb: 2, boxShadow: "none", border: "1px solid #e2e8f0" }}>
                  <MDBox display="flex" alignItems="center" gap={1.25} px={2} py={1.25} flexWrap="wrap"
                    sx={{ backgroundColor: "#f8fafc", borderBottom: isOpen ? "1px solid #e2e8f0" : 0, borderRadius: "12px 12px 0 0" }}>
                    <IconButton size="small" onClick={() => setOpen((o) => ({ ...o, [a.id]: !isOpen }))}>
                      <Icon>{isOpen ? "expand_less" : "expand_more"}</Icon>
                    </IconButton>
                    <MDBox flexGrow={1} minWidth={0}>
                      <MDTypography variant="button" fontWeight="bold" display="block">
                        {a.companyName} · {showDate(a.workDate)} · {a.area}
                      </MDTypography>
                      <MDTypography variant="caption" color="text" display="block">
                        {a.documentName}{a.assigneeName ? ` · Assigned to ${a.assigneeName}` : ""}
                        {a.marketingStaffName ? ` · Marketing: ${a.marketingStaffName}` : ""}
                      </MDTypography>
                    </MDBox>
                    <MDBox display="flex" gap={0.5} flexWrap="wrap">
                      <Chip size="small" label={`${a.summary.total} invoices`} />
                      <Chip size="small" label={`${a.summary.created} created`} sx={{ backgroundColor: "#ccfbf1", color: "#0f766e" }} />
                      {a.summary.notCreated > 0 && <Chip size="small" label={`${a.summary.notCreated} not created`} sx={{ backgroundColor: "#fee2e2", color: "#b91c1c" }} />}
                      <Chip size="small" label={`${a.summary.delivered} delivered`} sx={{ backgroundColor: "#dcfce7", color: "#15803d" }} />
                      {a.summary.cancelled > 0 && <Chip size="small" label={`${a.summary.cancelled} cancelled`} sx={{ backgroundColor: "#fde2e2", color: "#991b1b" }} />}
                      <Chip size="small" label={`${a.summary.paymentUpdated} paid`} sx={{ backgroundColor: "#e0f2fe", color: "#0369a1" }} />
                      {a.summary.autoCreated > 0 && <Chip size="small" label={`${a.summary.autoCreated} auto-created`} sx={{ backgroundColor: "#ede9fe", color: "#5b21b6" }} />}
                      {a.autoSalesOff && <Chip size="small" variant="outlined" label="Auto Add Sales off for SIL" />}
                    </MDBox>
                    <Tooltip title="Open the PDF">
                      <IconButton size="small" onClick={() => openPdf(a)}><Icon>picture_as_pdf</Icon></IconButton>
                    </Tooltip>
                    <Tooltip title="Read the PDF again">
                      <span>
                        <IconButton size="small" onClick={() => reread(a)} disabled={rereading === a.id}>
                          {rereading === a.id ? <CircularProgress size={16} /> : <Icon>refresh</Icon>}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </MDBox>
                  <Collapse in={isOpen}>
                    {a.readError && (
                      <Alert severity="warning" sx={{ m: 1.5 }}>The PDF could not be read: {a.readError}</Alert>
                    )}
                    {!a.readError && !a.invoices.length && (
                      <Alert severity="info" sx={{ m: 1.5 }}>No invoice numbers were found in this PDF.</Alert>
                    )}
                    {a.rows.length > 0 && (
                      <TableContainer>
                        <Table size="small">
                          <TableHead sx={{ display: "table-header-group" }}>
                            <TableRow>
                              {["#", "Invoice no.", "Add Sales", "Sale date", "Outlet", "Staff", "Amount", "Status", "Payment", "Paid", "Balance"].map((h) => (
                                <TableCell key={h} sx={headSx}>{h}</TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {a.rows.map((inv, index) => (
                              <TableRow key={inv.invoiceNumber} hover sx={!inv.created ? { backgroundColor: "#fff7f7" } : undefined}>
                                <TableCell sx={cellSx}>{index + 1}</TableCell>
                                <TableCell sx={{ ...cellSx, fontFamily: "monospace", fontWeight: 600 }}>
                                  {inv.invoiceNumber}
                                  {inv.created && inv.savedAs && inv.savedAs !== inv.invoiceNumber && (
                                    <MDTypography variant="caption" color="text" display="block">saved as {inv.savedAs}</MDTypography>
                                  )}
                                </TableCell>
                                <TableCell sx={cellSx}>
                                  {inv.created ? (
                                    <Chip size="small" label={inv.duplicates > 1 ? `Created (${inv.duplicates}x)` : "Created"} sx={{ backgroundColor: "#ccfbf1", color: "#0f766e", fontWeight: 700 }} />
                                  ) : (
                                    <Chip size="small" label="Not created" sx={{ backgroundColor: "#fee2e2", color: "#b91c1c", fontWeight: 700 }} />
                                  )}
                                  {inv.created && inv.autoCreated && (
                                    <MDTypography variant="caption" display="block" sx={{ color: "#0f766e", fontWeight: 600 }}>Auto from PDF</MDTypography>
                                  )}
                                  {!inv.created && inv.autoError && (
                                    <MDTypography variant="caption" display="block"
                                      sx={{ color: AUTO_WAITING.includes(inv.autoStatus) ? "#b45309" : "#b91c1c", maxWidth: 240, whiteSpace: "normal" }}>
                                      {AUTO_LABEL[inv.autoStatus] || "Auto Add Sales"}: {inv.autoError}
                                    </MDTypography>
                                  )}
                                </TableCell>
                                <TableCell sx={cellSx}>{showDate(inv.saleDate)}</TableCell>
                                <TableCell sx={cellSx}>{inv.outletName || ""}</TableCell>
                                <TableCell sx={cellSx}>{inv.staffName || ""}</TableCell>
                                <TableCell sx={{ ...cellSx, textAlign: "right" }}>{inv.created ? rupees(inv.amount) : ""}</TableCell>
                                <TableCell sx={cellSx}>
                                  {inv.created ? statusChip(inv) : ""}
                                  {inv.status === "cancelled" && inv.cancellationReason && (
                                    <MDTypography variant="caption" color="text" display="block">{inv.cancellationReason}</MDTypography>
                                  )}
                                  {inv.status === "delivered" && inv.deliveryDate && (
                                    <MDTypography variant="caption" color="text" display="block">on {showDate(inv.deliveryDate)}</MDTypography>
                                  )}
                                </TableCell>
                                <TableCell sx={cellSx}>
                                  {inv.created && (inv.paymentUpdated ? (
                                    <Chip size="small" label={`Updated${inv.lastPaymentDate ? ` · ${showDate(inv.lastPaymentDate)}` : ""}`} sx={{ backgroundColor: "#e0f2fe", color: "#0369a1", fontWeight: 700 }} />
                                  ) : (
                                    <Chip size="small" label="Not updated" variant="outlined" />
                                  ))}
                                </TableCell>
                                <TableCell sx={{ ...cellSx, textAlign: "right" }}>{inv.created ? rupees(inv.paidAmount) : ""}</TableCell>
                                <TableCell sx={{ ...cellSx, textAlign: "right" }}>{inv.created ? rupees(inv.balanceAmount) : ""}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Collapse>
                </Card>
              );
            })}
            {data.skippedNonPdf > 0 && (
              <MDTypography variant="caption" color="text">
                {data.skippedNonPdf} uploaded file(s) are images, not PDFs, so they are not in this report.
              </MDTypography>
            )}
          </>
        )}
      </MDBox>
    </DashboardLayout>
  );
}

export default InvoiceReport;
