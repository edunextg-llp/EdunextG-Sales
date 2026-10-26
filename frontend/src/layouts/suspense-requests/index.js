import { useCallback, useEffect, useState } from "react";
import {
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { formatDateTime, money } from "layouts/overdue-requests/components/ReviewDialog";

const API = (process.env.REACT_APP_API_URL);

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved (moved)" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];
const STATUS_BADGE = {
  pending: { label: "Pending", color: "warning" },
  approved: { label: "Moved to Suspense", color: "success" },
  rejected: { label: "Rejected", color: "error" },
};
const headSx = { color: "#6b7280", fontSize: "0.75rem", fontWeight: 600, borderBottom: "1px solid #e5e7eb", px: 2, py: 1.5, whiteSpace: "nowrap" };
const cellSx = { px: 2, py: 1.5, verticalAlign: "top", fontSize: "0.8rem" };
// Companies of the bills in a request ("A, B" names count for each company).
const requestCompanies = (request) => [...new Set((request.bills_summary || [])
  .flatMap((bill) => String(bill.company_name || "").split(","))
  .map((name) => name.trim())
  .filter(Boolean))].sort((a, b) => a.localeCompare(b));
const billsTotal = (request) => (request.bills_summary || []).reduce((sum, bill) => sum + (Number(bill.price) || 0), 0);

function SuspenseRequests() {
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [review, setReview] = useState({ request: null, action: "approve", note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`${API}/staff/suspense-requests?status=${status}`);
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
  }, [status]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const closeReview = () => { if (!saving) setReview({ request: null, action: "approve", note: "" }); };
  const submitReview = async () => {
    const approving = review.action === "approve";
    if (!approving && !review.note.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`${API}/staff/suspense-requests/${review.request.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: review.action, note: review.note.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update the request.");
      setNotice(`Request #${review.request.id}: ${data.message}`);
      setReview({ request: null, action: "approve", note: "" });
      load(true);
    } catch (err) {
      setNotice(`Request #${review.request.id}: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const approving = review.action === "approve";
  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={2} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <MDBox>
              <MDTypography variant="h6">Suspense Requests</MDTypography>
              <MDTypography variant="caption" color="text">
                Requests to move bills from Pending Deliveries to Suspense. Bills move only after you approve.
                {counts.pending ? ` ${counts.pending} waiting for review.` : ""}
              </MDTypography>
            </MDBox>
            <MDBox display="flex" gap={1} alignItems="center">
              <FormControl size="small" sx={{ minWidth: 200 }}>
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

          {notice && <MDBox px={2} pb={2}><MDTypography variant="button" color="info">{notice}</MDTypography></MDBox>}
          {error && <MDBox px={2} pb={2}><MDTypography variant="button" color="error">{error}</MDTypography></MDBox>}

          <TableContainer sx={{ boxShadow: "none" }}>
            <Table>
              <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                <TableRow>
                  {["Sr. No.", "Requested", "Company", "Requested by", "Reason", "Bills", "Status", "Actions"].map((heading) => (
                    <TableCell key={heading} sx={headSx}>{heading}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ ...cellSx, textAlign: "center", py: 4 }}>No requests here.</TableCell>
                  </TableRow>
                )}
                {requests.map((request, index) => {
                  const badge = STATUS_BADGE[request.status] || { label: request.status, color: "secondary" };
                  const expanded = expandedId === request.id;
                  const bills = request.bills_summary || [];
                  return [
                    <TableRow key={request.id}>
                      <TableCell sx={cellSx}>{index + 1}</TableCell>
                      <TableCell sx={cellSx}>#{request.id}<br />{formatDateTime(request.created_at)}</TableCell>
                      <TableCell sx={cellSx}>
                        {requestCompanies(request).map((name) => <strong key={name} style={{ display: "block" }}>{name}</strong>)}
                        {!requestCompanies(request).length && "—"}
                      </TableCell>
                      <TableCell sx={cellSx}><strong>{request.requested_by_name || "—"}</strong></TableCell>
                      <TableCell sx={{ ...cellSx, maxWidth: 280, whiteSpace: "pre-wrap" }}>{request.reason}</TableCell>
                      <TableCell sx={cellSx}>
                        <strong>{bills.map((bill) => bill.invoice_number || bill.id).slice(0, 4).join(", ")}{bills.length > 4 ? ` +${bills.length - 4} more` : ""}</strong>
                        <br />
                        {bills.length} bill(s) · {money(billsTotal(request))}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <MDBadge badgeContent={badge.label} color={badge.color} variant="gradient" size="sm" container />
                        {request.reviewed_by_name && (
                          <MDTypography variant="caption" display="block" color="text" mt={0.5}>
                            {request.reviewed_by_name} · {formatDateTime(request.reviewed_at)}
                          </MDTypography>
                        )}
                        {request.review_note && <MDTypography variant="caption" display="block" color="text">{request.review_note}</MDTypography>}
                        {request.status === "approved" && request.skipped_ids?.length > 0 && (
                          <MDTypography variant="caption" display="block" color="warning">
                            {request.skipped_ids.length} bill(s) skipped (no longer pending delivery)
                          </MDTypography>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                        <Tooltip title={expanded ? "Hide bills" : "View bills"}>
                          <IconButton size="small" color="info" onClick={() => setExpandedId(expanded ? null : request.id)}>
                            <Icon>{expanded ? "expand_less" : "receipt_long"}</Icon>
                          </IconButton>
                        </Tooltip>
                        {request.status === "pending" && (
                          <>
                            <Tooltip title="Approve & move to Suspense">
                              <IconButton size="small" color="success" onClick={() => setReview({ request, action: "approve", note: "" })}>
                                <Icon>check_circle</Icon>
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject">
                              <IconButton size="small" color="error" onClick={() => setReview({ request, action: "reject", note: "" })}>
                                <Icon>cancel</Icon>
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </TableCell>
                    </TableRow>,
                    expanded && (
                      <TableRow key={`${request.id}-bills`}>
                        <TableCell colSpan={8} sx={{ ...cellSx, backgroundColor: "#fffbeb" }}>
                          <Table size="small">
                            <TableHead sx={{ display: "table-header-group" }}>
                              <TableRow>
                                {["Invoice No.", "Sales Date", "Company", "Staff", "Outlet", "Area", "Boxes", "Packets", "Amount"].map((heading) => (
                                  <TableCell key={heading} sx={{ fontSize: "0.75rem", fontWeight: 600 }}>{heading}</TableCell>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {bills.map((bill) => (
                                <TableRow key={bill.id}>
                                  <TableCell sx={{ fontSize: "0.75rem" }}>{bill.invoice_number || bill.id}</TableCell>
                                  <TableCell sx={{ fontSize: "0.75rem" }}>{bill.sale_date || "—"}</TableCell>
                                  <TableCell sx={{ fontSize: "0.75rem" }}>{bill.company_name || "—"}</TableCell>
                                  <TableCell sx={{ fontSize: "0.75rem" }}>{bill.staff_name || "—"}</TableCell>
                                  <TableCell sx={{ fontSize: "0.75rem" }}>{bill.outlet_name || "—"}</TableCell>
                                  <TableCell sx={{ fontSize: "0.75rem" }}>{bill.area || "—"}</TableCell>
                                  <TableCell sx={{ fontSize: "0.75rem" }}>{bill.box_count ?? "—"}</TableCell>
                                  <TableCell sx={{ fontSize: "0.75rem" }}>{bill.packet_count ?? "—"}</TableCell>
                                  <TableCell sx={{ fontSize: "0.75rem" }}>{money(bill.price)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
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

      <Dialog open={Boolean(review.request)} onClose={closeReview} maxWidth="sm" fullWidth>
        <DialogTitle>{approving ? "Approve — move to Suspense" : "Reject request"}</DialogTitle>
        <DialogContent dividers>
          {review.request && (
            <MDTypography variant="body2" color="text" mb={2}>
              {review.request.requested_by_name || "User"} wants to move <strong>{(review.request.bills_summary || []).length} bill(s)</strong>
              {requestCompanies(review.request).length ? <> of <strong>{requestCompanies(review.request).join(", ")}</strong></> : ""}{" "}
              ({money(billsTotal(review.request))}) to Suspense. Reason: <strong>{review.request.reason}</strong>
              {approving ? ". Bills that are no longer pending delivery will be skipped." : ". The bills will stay in Pending Deliveries."}
            </MDTypography>
          )}
          <MDInput
            label={approving ? "Note (optional)" : "Reason for rejecting *"}
            fullWidth
            multiline
            rows={2}
            value={review.note}
            onChange={(e) => setReview((prev) => ({ ...prev, note: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" variant="outlined" onClick={closeReview} disabled={saving}>Cancel</MDButton>
          <MDButton color={approving ? "success" : "error"} variant="gradient" onClick={submitReview} disabled={saving || (!approving && !review.note.trim())}>
            {saving ? "Saving..." : approving ? "Approve & move" : "Reject"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default SuspenseRequests;
