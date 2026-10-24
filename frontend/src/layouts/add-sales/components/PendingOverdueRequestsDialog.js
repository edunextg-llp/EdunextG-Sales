import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Dialog, DialogContent, DialogTitle, IconButton, InputAdornment, TextField, Tooltip } from "@mui/material";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import { formatDate, formatDateTime, money, overdueBalance } from "layouts/overdue-requests/components/ReviewDialog";

const STATUS = {
  pending: { label: "Pending", accent: "#f59e0b", bg: "#fffbeb", text: "#b45309" },
  approved: { label: "Approved", accent: "#16a34a", bg: "#f0fdf4", text: "#15803d" },
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
];

const overdueTone = (days) => {
  if (days >= 30) return { bg: "#fef2f2", text: "#b91c1c" };
  if (days >= 10) return { bg: "#fff7ed", text: "#c2410c" };
  return { bg: "#f3f4f6", text: "#374151" };
};

function Fact({ label, value, sub }) {
  return (
    <MDBox minWidth={0}>
      <MDTypography variant="caption" sx={{ color: "#9ca3af", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </MDTypography>
      <MDTypography variant="button" display="block" fontWeight="medium" color="dark" sx={{ wordBreak: "break-word", lineHeight: 1.35, textTransform: "none" }}>
        {value}
      </MDTypography>
      {sub && (
        <MDTypography variant="caption" display="block" sx={{ color: "#6b7280" }}>
          {sub}
        </MDTypography>
      )}
    </MDBox>
  );
}

Fact.defaultProps = { sub: null };
Fact.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.node.isRequired, sub: PropTypes.node };

function RequestCard({ request, isAdmin, creating, onCreate, onReview }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS[request.status] || STATUS.pending;
  const days = Number(request.max_overdue_days) || 0;
  const tone = overdueTone(days);
  const note = String(request.request_note || "").trim();
  const longNote = note.length > 140;
  const invoices = (request.sales_summary?.invoiceNumbers || []).join(", ") || "—";

  return (
    <MDBox
      sx={{
        border: "1px solid #e5e7eb",
        borderLeft: `4px solid ${status.accent}`,
        borderRadius: "10px",
        backgroundColor: "#fff",
        p: 2,
        "&:hover": { boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)" },
      }}
    >
      {/* Outlet + status */}
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

      {/* Key facts */}
      <MDBox
        mt={1.5}
        sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
      >
        <Fact label="Staff" value={request.staff_name || `Staff #${request.staff_id}`} />
        <Fact label="Sale date" value={formatDate(request.sale_date)} />
        <Fact
          label="Invoice"
          value={invoices}
          sub={request.sales_summary ? money(request.sales_summary.totalAmount) : null}
        />
        <MDBox>
          <MDTypography variant="caption" sx={{ color: "#9ca3af", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Overdue
          </MDTypography>
          <MDBox display="flex" alignItems="center" gap={0.75} flexWrap="wrap">
            <MDBox
              component="span"
              sx={{ px: 1, py: 0.25, borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, backgroundColor: tone.bg, color: tone.text }}
            >
              {days} day{days === 1 ? "" : "s"}
            </MDBox>
          </MDBox>
          <MDTypography variant="caption" display="block" sx={{ color: "#6b7280" }}>
            Due {money(overdueBalance(request))}
          </MDTypography>
        </MDBox>
      </MDBox>

      {/* Reason */}
      {note && (
        <MDBox mt={1.5} p={1.25} sx={{ backgroundColor: "#f9fafb", borderRadius: "8px", border: "1px solid #f1f5f9" }}>
          <MDBox display="flex" gap={0.75} alignItems="flex-start">
            <Icon sx={{ fontSize: "1rem !important", color: "#9ca3af", mt: "2px" }}>format_quote</Icon>
            <MDTypography
              variant="caption"
              sx={{
                color: "#374151",
                fontSize: "0.8rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                ...(!expanded && longNote
                  ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }
                  : {}),
              }}
            >
              {note}
            </MDTypography>
          </MDBox>
          {longNote && (
            <MDTypography
              component="button"
              type="button"
              variant="caption"
              onClick={() => setExpanded((value) => !value)}
              sx={{ border: 0, background: "none", p: 0, ml: 3, mt: 0.5, color: "#1A73E8", fontWeight: 600, cursor: "pointer" }}
            >
              {expanded ? "Show less" : "Show more"}
            </MDTypography>
          )}
        </MDBox>
      )}

      {/* Footer */}
      <MDBox mt={1.5} display="flex" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
        <MDTypography variant="caption" sx={{ color: "#6b7280" }}>
          <Icon sx={{ fontSize: "0.9rem !important", verticalAlign: "middle", mr: 0.5 }}>person</Icon>
          {request.requested_by_name || "—"} · {formatDateTime(request.created_at)}
          {request.status === "approved" && request.reviewed_by_name ? ` · approved by ${request.reviewed_by_name}` : ""}
        </MDTypography>
        <MDBox display="flex" gap={1}>
          {request.status === "approved" && (
            <MDButton size="small" variant="gradient" color="success" disabled={creating} onClick={() => onCreate(request)}>
              <Icon sx={{ mr: 0.5 }}>add_task</Icon>
              {creating ? "Creating..." : "Create invoice"}
            </MDButton>
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
  creating: PropTypes.bool.isRequired,
  onCreate: PropTypes.func.isRequired,
  onReview: PropTypes.func.isRequired,
};

function PendingOverdueRequestsDialog({ open, onClose, requests, onRefresh, isAdmin, creatingRequestId, onCreate, onReview }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
  }), [requests]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests
      .filter((r) => filter === "all" || r.status === filter)
      .filter((r) => !q || [
        r.outlet_name, r.outlet_erp_id, r.staff_name, r.requested_by_name,
        ...(r.sales_summary?.invoiceNumbers || []),
      ].some((value) => String(value || "").toLowerCase().includes(q)))
      // Approved first (ready to create), then oldest pending first.
      .sort((a, b) => (a.status === b.status
        ? String(a.created_at).localeCompare(String(b.created_at))
        : a.status === "approved" ? -1 : 1));
  }, [requests, filter, search]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: "14px" } }}>
      <DialogTitle sx={{ pb: 1.5 }}>
        <MDBox display="flex" alignItems="center" justifyContent="space-between" gap={1}>
          <MDBox display="flex" alignItems="center" gap={1.25}>
            <MDBox
              sx={{ width: 36, height: 36, borderRadius: "10px", backgroundColor: "#fff7ed", display: "grid", placeItems: "center" }}
            >
              <Icon sx={{ color: "#f59e0b" }}>pending_actions</Icon>
            </MDBox>
            <MDBox>
              <MDTypography variant="h6" lineHeight={1.2}>Overdue Requests</MDTypography>
              <MDTypography variant="caption" sx={{ color: "#6b7280" }}>
                {counts.pending} waiting for admin · {counts.approved} approved, ready to create
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
          <MDBox display="flex" gap={0.75} sx={{ backgroundColor: "#f3f4f6", p: 0.5, borderRadius: "10px" }}>
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
                    px: 1.5,
                    py: 0.6,
                    borderRadius: "8px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
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
            placeholder="Search outlet, staff, invoice"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: { xs: "100%", sm: 260 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Icon sx={{ color: "#9ca3af" }}>search</Icon>
                </InputAdornment>
              ),
            }}
          />
        </MDBox>
      </DialogTitle>

      <DialogContent dividers sx={{ backgroundColor: "#f8fafc", p: 2 }}>
        {visible.length === 0 ? (
          <MDBox py={6} textAlign="center">
            <Icon sx={{ fontSize: "2.5rem !important", color: "#d1d5db" }}>task_alt</Icon>
            <MDTypography variant="button" display="block" color="text" mt={1}>
              {requests.length === 0 ? "No overdue requests right now." : "Nothing matches this filter."}
            </MDTypography>
          </MDBox>
        ) : (
          <MDBox display="flex" flexDirection="column" gap={1.5}>
            {visible.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                isAdmin={isAdmin}
                creating={creatingRequestId === request.id}
                onCreate={onCreate}
                onReview={onReview}
              />
            ))}
          </MDBox>
        )}
      </DialogContent>
    </Dialog>
  );
}

PendingOverdueRequestsDialog.defaultProps = {
  creatingRequestId: null,
};

PendingOverdueRequestsDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  requests: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRefresh: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired,
  creatingRequestId: PropTypes.number,
  onCreate: PropTypes.func.isRequired,
  onReview: PropTypes.func.isRequired,
};

export default PendingOverdueRequestsDialog;
