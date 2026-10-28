import { useCallback, useEffect, useState } from "react";
import {
  Card,
  FormControl,
  Icon,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDBadge from "components/MDBadge";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ReviewDialog, {
  formatDate,
  formatDateTime,
  money,
  overdueBalance,
} from "layouts/overdue-requests/components/ReviewDialog";

const API = (process.env.REACT_APP_API_URL);

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved (not used yet)" },
  { value: "used", label: "Approved & sales created" },
  { value: "rejected", label: "Rejected" },
  { value: "self_approved", label: "Staff added with reason (7-day permission)" },
  { value: "all", label: "All" },
];

const STATUS_BADGE = {
  pending: { label: "Pending", color: "warning" },
  approved: { label: "Approved", color: "success" },
  used: { label: "Sales created", color: "info" },
  rejected: { label: "Rejected", color: "error" },
};

const headSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  borderBottom: "1px solid #e5e7eb",
  px: 2,
  py: 1.5,
  whiteSpace: "nowrap",
};
const cellSx = { px: 2, py: 1.5, verticalAlign: "top", fontSize: "0.8rem" };

function OverdueRequests() {
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [review, setReview] = useState({ request: null, action: "approve" });
  const [notice, setNotice] = useState(null);
  const [creatingId, setCreatingId] = useState(null);

  const showResult = (data) => {
    if (!data) return;
    setNotice({ color: data.salesError ? "warning" : "success", text: data.message });
  };

  const createSales = async (request) => {
    setCreatingId(request.id);
    setNotice(null);
    try {
      const response = await fetch(`${API}/staff/overdue-requests/${request.id}/create-sales`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to create the sales.");
      setNotice({ color: "success", text: `Request #${request.id}: ${data.message}` });
    } catch (err) {
      setNotice({ color: "error", text: `Request #${request.id}: ${err.message}` });
    } finally {
      setCreatingId(null);
      load(true);
    }
  };

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const response = await fetch(`${API}/staff/overdue-requests?status=${status}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Unable to load requests.");
        setRequests(data.requests || []);
        setCounts(data.counts || {});
        setError("");
      } catch (err) {
        setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [status]
  );

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 30000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={2} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <MDBox>
              <MDTypography variant="h6">Overdue Sale Requests</MDTypography>
              <MDTypography variant="caption" color="text">
                Requests to add sales for outlets with credit overdue by more than 3 days.
                {counts.pending ? ` ${counts.pending} waiting for review.` : ""}
                {counts.self_approved ? ` ${counts.self_approved} added by staff with the 7-day permission.` : ""}
              </MDTypography>
            </MDBox>
            <MDBox display="flex" gap={1} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} sx={{ height: 40 }}>
                  {STATUS_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                      {option.value !== "all" && counts[option.value] ? ` (${counts[option.value]})` : ""}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title="Refresh">
                <span>
                  <IconButton color="info" onClick={() => load()} disabled={loading}>
                    <Icon>refresh</Icon>
                  </IconButton>
                </span>
              </Tooltip>
            </MDBox>
          </MDBox>

          {notice && (
            <MDBox px={2} pb={2}>
              <MDTypography variant="button" color={notice.color}>
                {notice.text}
              </MDTypography>
            </MDBox>
          )}
          {error && (
            <MDBox px={2} pb={2}>
              <MDTypography variant="button" color="error">
                {error}
              </MDTypography>
            </MDBox>
          )}

          <TableContainer sx={{ boxShadow: "none" }}>
            <Table>
              <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                <TableRow>
                  {["Sr. No.", "Requested", "Staff / Sale date", "Company", "Outlet", "Overdue", "New sale", "Requested by", "Status", "Actions"].map(
                    (heading) => (
                      <TableCell key={heading} sx={headSx}>
                        {heading}
                      </TableCell>
                    )
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                      No requests here.
                    </TableCell>
                  </TableRow>
                )}
                {requests.map((request, index) => {
                  const badge = Number(request.self_approved)
                    ? { label: "7-day permission", color: "warning" }
                    : STATUS_BADGE[request.status] || { label: request.status, color: "secondary" };
                  const expanded = expandedId === request.id;
                  return [
                    <TableRow key={request.id}>
                      <TableCell sx={cellSx}>{index + 1}</TableCell>
                      <TableCell sx={cellSx}>
                        #{request.id}
                        <br />
                        {formatDateTime(request.created_at)}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <strong>{request.staff_name || `Staff #${request.staff_id}`}</strong>
                        <br />
                        {formatDate(request.sale_date)}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <strong>{request.company_name || "—"}</strong>
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <strong>{request.outlet_name || "—"}</strong>
                        <br />
                        ERP: {request.outlet_erp_id}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {request.max_overdue_days} day(s)
                        <br />
                        {money(overdueBalance(request))} in {(request.overdue_details || []).length} bill(s)
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {request.sales_summary ? (
                          <>
                            <strong>{(request.sales_summary.invoiceNumbers || []).join(", ") || "—"}</strong>
                            <br />
                            {money(request.sales_summary.totalAmount)} · {request.sales_summary.invoiceCount} invoice(s)
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, maxWidth: 260 }}>
                        <strong>{request.requested_by_name || "—"}</strong>
                        <br />
                        {request.request_note}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <MDBadge badgeContent={badge.label} color={badge.color} variant="gradient" size="sm" container />
                        {request.reviewed_by_name && (
                          <MDTypography variant="caption" display="block" color="text" mt={0.5}>
                            {request.reviewed_by_name} · {formatDateTime(request.reviewed_at)}
                          </MDTypography>
                        )}
                        {request.review_note && (
                          <MDTypography variant="caption" display="block" color="text">
                            {request.review_note}
                          </MDTypography>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                        <Tooltip title={expanded ? "Hide overdue bills" : "View overdue bills"}>
                          <IconButton size="small" color="info" onClick={() => setExpandedId(expanded ? null : request.id)}>
                            <Icon>{expanded ? "expand_less" : "receipt_long"}</Icon>
                          </IconButton>
                        </Tooltip>
                        {request.status === "approved" && request.sales_payload?.sales?.length > 0 && (
                          <Tooltip title="Create the approved sales now">
                            <span>
                              <IconButton size="small" color="success" disabled={creatingId === request.id} onClick={() => createSales(request)}>
                                <Icon>add_shopping_cart</Icon>
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                        {request.status === "pending" && (
                          <>
                            <Tooltip title="Approve & create sales">
                              <IconButton size="small" color="success" onClick={() => setReview({ request, action: "approve" })}>
                                <Icon>check_circle</Icon>
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject">
                              <IconButton size="small" color="error" onClick={() => setReview({ request, action: "reject" })}>
                                <Icon>cancel</Icon>
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </TableCell>
                    </TableRow>,
                    expanded && (
                      <TableRow key={`${request.id}-bills`}>
                        <TableCell colSpan={10} sx={{ ...cellSx, backgroundColor: "#fff7f7" }}>
                          {(request.overdue_details || []).map((credit) => (
                            <MDTypography key={credit.creditPaymentId} variant="caption" display="block" color="text">
                              Invoice {credit.invoiceNumber || "-"} | Balance {money(credit.balanceAmount)} | Due{" "}
                              {credit.dueDate || "-"} | Overdue {credit.overdueDays} day(s)
                              {credit.creditStaffName ? ` | Staff: ${credit.creditStaffName}` : ""}
                            </MDTypography>
                          ))}
                        </TableCell>
                      </TableRow>
                    ),
                  ];
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </MDBox>

      <ReviewDialog
        request={review.request}
        action={review.action}
        onClose={() => setReview({ request: null, action: "approve" })}
        onDone={(_, data) => { showResult(data); load(true); }}
      />

      <Footer />
    </DashboardLayout>
  );
}

export default OverdueRequests;
