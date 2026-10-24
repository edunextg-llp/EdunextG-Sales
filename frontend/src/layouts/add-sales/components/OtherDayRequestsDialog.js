import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
} from "@mui/material";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import { formatDate, formatDateTime } from "layouts/overdue-requests/components/ReviewDialog";

const API = process.env.REACT_APP_API_URL;

const STATUS = {
  pending: { label: "Waiting for admin", accent: "#f59e0b", bg: "#fffbeb", text: "#b45309" },
  approved: { label: "Approved", accent: "#16a34a", bg: "#f0fdf4", text: "#15803d" },
  rejected: { label: "Rejected", accent: "#dc2626", bg: "#fef2f2", text: "#b91c1c" },
  used: { label: "Sale added", accent: "#64748b", bg: "#f1f5f9", text: "#475569" },
};

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "used", label: "Used" },
];

const matchesFilter = (request, filter) =>
  filter === "open" ? ["pending", "approved"].includes(request.status) : request.status === filter;

function Fact({ label, children }) {
  return (
    <MDBox minWidth={0}>
      <MDTypography variant="caption" sx={{ color: "#9ca3af", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </MDTypography>
      <MDTypography variant="button" display="block" fontWeight="medium" color="dark" sx={{ textTransform: "none", lineHeight: 1.35, wordBreak: "break-word" }}>
        {children}
      </MDTypography>
    </MDBox>
  );
}

Fact.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node.isRequired };

function RequestCard({ request, isAdmin, onReview }) {
  const status = STATUS[request.status] || STATUS.pending;
  return (
    <MDBox
      sx={{
        border: "1px solid #e5e7eb",
        borderLeft: `4px solid ${status.accent}`,
        borderRadius: "10px",
        backgroundColor: "#fff",
        p: 2,
      }}
    >
      <MDBox display="flex" justifyContent="space-between" alignItems="flex-start" gap={1.5} flexWrap="wrap">
        <MDBox minWidth={0}>
          <MDTypography variant="h6" sx={{ fontSize: "0.95rem", lineHeight: 1.3 }}>
            {request.outlet_name || "Outlet"}
          </MDTypography>
          <MDTypography variant="caption" sx={{ color: "#6b7280" }}>
            ERP {request.outlet_erp_id || "—"} · Request #{request.id}
          </MDTypography>
        </MDBox>
        <MDBox
          component="span"
          sx={{
            px: 1.25,
            py: 0.4,
            borderRadius: "999px",
            fontSize: "0.72rem",
            fontWeight: 700,
            backgroundColor: status.bg,
            color: status.text,
            border: `1px solid ${status.accent}33`,
            whiteSpace: "nowrap",
          }}
        >
          {status.label}
        </MDBox>
      </MDBox>

      <MDBox mt={1.5} sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
        <Fact label="Staff">{request.staff_name || `Staff #${request.staff_id}`}</Fact>
        <Fact label="Sale date">{formatDate(request.sale_date)}</Fact>
        <Fact label="Outlet bit">{request.outlet_day || "—"}</Fact>
        <Fact label="Asked on">{request.request_day ? `${request.request_day}, ` : ""}{formatDateTime(request.created_at)}</Fact>
      </MDBox>

      {request.request_note && (
        <MDBox mt={1.5} p={1.25} display="flex" gap={0.75} sx={{ backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #f1f5f9" }}>
          <Icon sx={{ fontSize: "1rem !important", color: "#9ca3af", mt: "2px" }}>format_quote</Icon>
          <MDTypography variant="caption" sx={{ color: "#374151", fontSize: "0.8rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {request.request_note}
          </MDTypography>
        </MDBox>
      )}

      {request.review_note && (
        <MDTypography variant="caption" display="block" mt={1} sx={{ color: request.status === "rejected" ? "#b91c1c" : "#15803d" }}>
          Admin: {request.review_note}
        </MDTypography>
      )}

      <MDBox mt={1.5} display="flex" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
        <MDTypography variant="caption" sx={{ color: "#6b7280" }}>
          <Icon sx={{ fontSize: "0.9rem !important", verticalAlign: "middle", mr: 0.5 }}>person</Icon>
          {request.requested_by_name || "—"}
          {request.reviewed_by_name ? ` · reviewed by ${request.reviewed_by_name}` : ""}
        </MDTypography>
        <MDBox display="flex" gap={1}>
          {request.status === "approved" && (
            <MDTypography variant="caption" fontWeight="bold" sx={{ color: "#15803d" }}>
              <Icon sx={{ fontSize: "0.95rem !important", verticalAlign: "middle", mr: 0.5 }}>check_circle</Icon>
              Ready — enter the bill in the list as usual
            </MDTypography>
          )}
          {isAdmin && request.status === "pending" && (
            <>
              <MDButton size="small" variant="outlined" color="error" onClick={() => onReview(request, "reject")}>
                Reject
              </MDButton>
              <MDButton size="small" variant="gradient" color="success" onClick={() => onReview(request, "approve")}>
                <Icon sx={{ mr: 0.5 }}>check</Icon>
                Approve
              </MDButton>
            </>
          )}
        </MDBox>
      </MDBox>
    </MDBox>
  );
}

RequestCard.propTypes = {
  request: PropTypes.object.isRequired,
  isAdmin: PropTypes.bool.isRequired,
  onReview: PropTypes.func.isRequired,
};

/**
 * Status of other-day bit / other-date approval requests, opened from Add Sales.
 * Users see their own requests; admin sees all and can approve or reject here.
 */
function OtherDayRequestsDialog({ open, onClose, requests, onRefresh, isAdmin }) {
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [review, setReview] = useState({ request: null, action: "approve", note: "" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const counts = useMemo(() => {
    const result = {};
    FILTERS.forEach((option) => { result[option.value] = requests.filter((r) => matchesFilter(r, option.value)).length; });
    return result;
  }, [requests]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests
      .filter((r) => matchesFilter(r, filter))
      .filter((r) => !q || [r.outlet_name, r.outlet_erp_id, r.staff_name, r.requested_by_name]
        .some((value) => String(value || "").toLowerCase().includes(q)));
  }, [requests, filter, search]);

  const closeReview = () => { if (!saving) setReview({ request: null, action: "approve", note: "" }); };
  const approving = review.action === "approve";
  const submitReview = async () => {
    if (!approving && !review.note.trim()) return;
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
      onRefresh();
    } catch (err) {
      setNotice(`Request #${review.request.id}: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: "14px" } }}>
        <DialogTitle sx={{ pb: 1.5 }}>
          <MDBox display="flex" alignItems="center" justifyContent="space-between" gap={1}>
            <MDBox display="flex" alignItems="center" gap={1.25}>
              <MDBox sx={{ width: 36, height: 36, borderRadius: "10px", backgroundColor: "#eff6ff", display: "grid", placeItems: "center" }}>
                <Icon sx={{ color: "#1A73E8" }}>event_busy</Icon>
              </MDBox>
              <MDBox>
                <MDTypography variant="h6" lineHeight={1.2}>Other Bit / Date Approvals</MDTypography>
                <MDTypography variant="caption" sx={{ color: "#6b7280" }}>
                  {counts.pending} waiting for admin · {counts.approved} approved, ready to add
                </MDTypography>
              </MDBox>
            </MDBox>
            <MDBox display="flex">
              <Tooltip title="Refresh">
                <IconButton size="small" onClick={onRefresh}><Icon>refresh</Icon></IconButton>
              </Tooltip>
              <Tooltip title="Close">
                <IconButton size="small" onClick={onClose}><Icon>close</Icon></IconButton>
              </Tooltip>
            </MDBox>
          </MDBox>

          <MDBox mt={2} display="flex" gap={1.5} alignItems="center" flexWrap="wrap" justifyContent="space-between">
            <MDBox display="flex" gap={0.5} flexWrap="wrap" sx={{ backgroundColor: "#f3f4f6", p: 0.5, borderRadius: "10px" }}>
              {FILTERS.map((option) => {
                const active = filter === option.value;
                return (
                  <MDBox
                    key={option.value}
                    component="button"
                    type="button"
                    onClick={() => setFilter(option.value)}
                    sx={{
                      border: 0,
                      cursor: "pointer",
                      px: 1.25,
                      py: 0.6,
                      borderRadius: "8px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      fontFamily: "inherit",
                      backgroundColor: active ? "#fff" : "transparent",
                      color: active ? "#111827" : "#6b7280",
                      boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    {option.label} <span style={{ opacity: 0.6 }}>({counts[option.value]})</span>
                  </MDBox>
                );
              })}
            </MDBox>
            <TextField
              size="small"
              placeholder="Search outlet, staff"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: { xs: "100%", sm: 220 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Icon sx={{ color: "#9ca3af" }}>search</Icon>
                  </InputAdornment>
                ),
              }}
            />
          </MDBox>
          {notice && (
            <MDTypography variant="caption" display="block" mt={1} color="info">{notice}</MDTypography>
          )}
        </DialogTitle>

        <DialogContent dividers sx={{ backgroundColor: "#f8fafc", p: 2 }}>
          {visible.length === 0 ? (
            <MDBox py={6} textAlign="center">
              <Icon sx={{ fontSize: "2.5rem !important", color: "#d1d5db" }}>task_alt</Icon>
              <MDTypography variant="button" display="block" color="text" mt={1}>
                {requests.length === 0 ? "No other bit or date requests yet." : "Nothing in this list."}
              </MDTypography>
            </MDBox>
          ) : (
            <MDBox display="flex" flexDirection="column" gap={1.5}>
              {visible.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  isAdmin={isAdmin}
                  onReview={(item, action) => setReview({ request: item, action, note: "" })}
                />
              ))}
            </MDBox>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(review.request)} onClose={closeReview} maxWidth="xs" fullWidth>
        <DialogTitle>{approving ? "Approve request" : "Reject request"}</DialogTitle>
        <DialogContent dividers>
          {review.request && (
            <MDTypography variant="body2" color="text" mb={2}>
              {review.request.requested_by_name || "User"} wants to add a sale for{" "}
              <strong>{review.request.outlet_name}</strong> ({review.request.outlet_day || "—"} bit) under{" "}
              <strong>{review.request.staff_name}</strong> on <strong>{formatDate(review.request.sale_date)}</strong>.
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
    </>
  );
}

OtherDayRequestsDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  requests: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRefresh: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired,
};

export default OtherDayRequestsDialog;
