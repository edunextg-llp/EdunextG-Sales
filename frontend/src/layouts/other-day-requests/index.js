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
import { formatDate, formatDateTime } from "layouts/overdue-requests/components/ReviewDialog";

const API = process.env.REACT_APP_API_URL;

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved (not used yet)" },
  { value: "used", label: "Used" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];
const STATUS_BADGE = {
  pending: { label: "Pending", color: "warning" },
  approved: { label: "Approved", color: "success" },
  used: { label: "Sale added", color: "info" },
  rejected: { label: "Rejected", color: "error" },
};
const HEADINGS = ["Requested", "Staff", "Sale Date", "Outlet", "Bit", "Requested by", "Reason", "Status", "Actions"];
const headSx = { color: "#6b7280", fontSize: "0.75rem", fontWeight: 600, borderBottom: "1px solid #e5e7eb", px: 2, py: 1.5, whiteSpace: "nowrap" };
const cellSx = { px: 2, py: 1.5, verticalAlign: "top", fontSize: "0.8rem" };

function OtherDayRequests() {
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState({ request: null, action: "approve", note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`${API}/staff/other-day-requests?status=${status}`);
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
    const approvingNow = review.action === "approve";
    if (!approvingNow && !review.note.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`${API}/staff/other-day-requests/${review.request.id}/review`, {
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
              <MDTypography variant="h6">Other Day Bit Requests</MDTypography>
              <MDTypography variant="caption" color="text">
                Add Sales users can bill only today&apos;s bit. Approve a request to let them add one sale entry
                for another day&apos;s outlet on the requested date.
                {counts.pending ? ` ${counts.pending} waiting for review.` : ""}
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

          {notice && <MDBox px={2} pb={2}><MDTypography variant="button" color="info">{notice}</MDTypography></MDBox>}
          {error && <MDBox px={2} pb={2}><MDTypography variant="button" color="error">{error}</MDTypography></MDBox>}

          <TableContainer sx={{ boxShadow: "none" }}>
            <Table>
              <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                <TableRow>
                  {HEADINGS.map((heading) => <TableCell key={heading} sx={headSx}>{heading}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={HEADINGS.length} sx={{ ...cellSx, textAlign: "center", py: 4 }}>No requests here.</TableCell>
                  </TableRow>
                )}
                {requests.map((request) => {
                  const badge = STATUS_BADGE[request.status] || { label: request.status, color: "secondary" };
                  return (
                    <TableRow key={request.id}>
                      <TableCell sx={cellSx}>#{request.id}<br />{formatDateTime(request.created_at)}</TableCell>
                      <TableCell sx={cellSx}><strong>{request.staff_name || `Staff #${request.staff_id}`}</strong></TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>{formatDate(request.sale_date)}</TableCell>
                      <TableCell sx={cellSx}>
                        <strong>{request.outlet_name || "—"}</strong>
                        <br />
                        {request.outlet_erp_id || "—"}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                        <strong>{request.outlet_day || "—"}</strong>
                        {request.request_day && (
                          <MDTypography variant="caption" display="block" color="text">asked on {request.request_day}</MDTypography>
                        )}
                      </TableCell>
                      <TableCell sx={cellSx}>{request.requested_by_name || "—"}</TableCell>
                      <TableCell sx={{ ...cellSx, maxWidth: 260, whiteSpace: "pre-wrap" }}>{request.request_note}</TableCell>
                      <TableCell sx={cellSx}>
                        <MDBadge badgeContent={badge.label} color={badge.color} variant="gradient" size="sm" container />
                        {request.reviewed_by_name && (
                          <MDTypography variant="caption" display="block" color="text" mt={0.5}>
                            {request.reviewed_by_name} · {formatDateTime(request.reviewed_at)}
                          </MDTypography>
                        )}
                        {request.review_note && <MDTypography variant="caption" display="block" color="text">{request.review_note}</MDTypography>}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                        {request.status === "pending" ? (
                          <>
                            <Tooltip title="Approve">
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
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </MDBox>

      <Dialog open={Boolean(review.request)} onClose={closeReview} maxWidth="sm" fullWidth>
        <DialogTitle>{approving ? "Approve other-day bit sale" : "Reject request"}</DialogTitle>
        <DialogContent dividers>
          {review.request && (
            <MDTypography variant="body2" color="text" mb={2}>
              {review.request.requested_by_name || "User"} wants to add a sale for{" "}
              <strong>{review.request.outlet_name}</strong> ({review.request.outlet_day} bit) under{" "}
              <strong>{review.request.staff_name}</strong> on <strong>{formatDate(review.request.sale_date)}</strong>.
              Reason: <strong>{review.request.request_note}</strong>
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
            {saving ? "Saving..." : approving ? "Approve" : "Reject"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default OtherDayRequests;
