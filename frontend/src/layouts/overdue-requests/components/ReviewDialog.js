import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel } from "@mui/material";

import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";

const API = (process.env.REACT_APP_API_URL);

export const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const formatDate = (value) => {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (value) => {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

export const overdueBalance = (request) =>
  (request?.overdue_details || []).reduce((total, credit) => total + (Number(credit.balanceAmount) || 0), 0);

// Approve / reject one overdue sale request (Admin, or the approver for its overdue amount).
function ReviewDialog({ request = null, action = "approve", onClose, onDone = undefined }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [createSales, setCreateSales] = useState(true);
  const open = Boolean(request);
  const approving = action === "approve";
  const hasInvoices = Array.isArray(request?.sales_payload?.sales) && request.sales_payload.sales.length > 0;
  // 14+ day requests always create the sale on approval, so there is no choice to offer.
  const sentToAdmin = request?.approval_level === "admin";
  const fromMarketingStaff = Boolean(request?.approval_level) && !sentToAdmin;

  useEffect(() => {
    if (open) { setNote(""); setCreateSales(true); }
  }, [open, request?.id, action]);

  const submit = async () => {
    const trimmed = note.trim();
    if (!approving && !trimmed) {
      alert("Enter a reason for rejecting.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API}/staff/overdue-requests/${request.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: trimmed, createSales: approving && hasInvoices && createSales }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update the request.");
      onDone?.(data.request, data);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{approving ? "Approve request" : "Reject request"}</DialogTitle>
      <DialogContent dividers>
        {request && (
          <MDTypography variant="body2" color="text" mb={2}>
            {request.requested_by_name || "User"} wants to add sales for <strong>{request.outlet_name}</strong> (ERP{" "}
            {request.outlet_erp_id}) under {request.staff_name || "staff"}
            {request.company_name ? <> (<strong>{request.company_name}</strong>)</> : ""} on {formatDate(request.sale_date)}. Overdue{" "}
            {request.max_overdue_days} day(s), {money(overdueBalance(request))} pending.
            {request.sales_summary && (
              <>
                {" "}New invoice: <strong>{(request.sales_summary.invoiceNumbers || []).join(", ") || "—"}</strong> for{" "}
                <strong>{money(request.sales_summary.totalAmount)}</strong>.
              </>
            )}
          </MDTypography>
        )}
        {fromMarketingStaff && (
          <MDTypography variant="body2" color="text" mb={2}>
            <strong>{request.marketing_staff_name || "Marketing staff"}</strong>: {request.request_note}
            <br />
            Will complete payment within <strong>{request.payment_days} day(s)</strong>.
          </MDTypography>
        )}
        {sentToAdmin && (
          <MDTypography variant="body2" color="text" mb={2}>
            <strong>Reason</strong>: {request.request_note}
          </MDTypography>
        )}
        {approving && (fromMarketingStaff || sentToAdmin) && (
          <MDTypography variant="caption" color="text" display="block" mb={2}>
            Approving creates the sale automatically (deducts stock, same as Add Sales).
          </MDTypography>
        )}
        {!approving && (fromMarketingStaff || sentToAdmin || request?.marketing_staff_id) && (
          <MDTypography variant="caption" color="text" display="block" mb={2}>
            Rejecting moves the invoice to Delivered → Cancelled Items. No stock is taken.
          </MDTypography>
        )}
        {approving && !fromMarketingStaff && !sentToAdmin && (
          <>
            <FormControlLabel
              control={<Checkbox checked={hasInvoices && createSales} disabled={!hasInvoices || saving} onChange={(e) => setCreateSales(e.target.checked)} />}
              label="Create the sales now (deducts stock, same as Add Sales)"
            />
            <MDTypography variant="caption" color="text" display="block" mb={2}>
              {hasInvoices
                ? "If the sales can't be created (for example not enough stock), the request stays approved and you can retry with Create sales."
                : "This request has no invoice details saved, so the sales must be added from Add Sales after approval."}
            </MDTypography>
          </>
        )}
        <MDInput
          label={approving ? "Note (optional)" : "Reason for rejecting *"}
          fullWidth
          multiline
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <MDButton color="secondary" variant="outlined" onClick={onClose} disabled={saving}>
          Cancel
        </MDButton>
        <MDButton
          color={approving ? "success" : "error"}
          variant="gradient"
          onClick={submit}
          disabled={saving || (!approving && !note.trim())}
        >
          {saving ? "Saving..." : approving ? (hasInvoices && createSales ? "Approve & create sales" : "Approve") : "Reject"}
        </MDButton>
      </DialogActions>
    </Dialog>
  );
}

ReviewDialog.propTypes = {
  request: PropTypes.shape({
    id: PropTypes.number,
    outlet_name: PropTypes.string,
    outlet_erp_id: PropTypes.string,
    company_name: PropTypes.string,
    sales_payload: PropTypes.shape({ sales: PropTypes.arrayOf(PropTypes.object) }),
    staff_name: PropTypes.string,
    sale_date: PropTypes.string,
    requested_by_name: PropTypes.string,
    approval_level: PropTypes.string,
    marketing_staff_id: PropTypes.number,
    marketing_staff_name: PropTypes.string,
    request_note: PropTypes.string,
    payment_days: PropTypes.number,
    max_overdue_days: PropTypes.number,
    sales_summary: PropTypes.shape({
      invoiceNumbers: PropTypes.arrayOf(PropTypes.string),
      totalAmount: PropTypes.number,
    }),
  }),
  action: PropTypes.oneOf(["approve", "reject"]),
  onClose: PropTypes.func.isRequired,
  onDone: PropTypes.func,
};

export default ReviewDialog;
