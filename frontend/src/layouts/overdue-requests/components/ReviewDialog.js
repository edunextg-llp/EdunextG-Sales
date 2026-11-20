// Approve / reject one overdue sale request: Tailwind CSS (no MUI). Also opened from Add Sales.
import { useEffect, useState } from "react";
import PropTypes from "prop-types";

import { Icon, Modal, btn, fieldClass } from "components/tw";

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
  const adminOverride = request?.status === "awaiting_staff";
  // 14+ day requests always create the sale on approval, so there is no choice to offer.
  const sentToAdmin = request?.approval_level === "admin";
  const fromMarketingStaff = Boolean(request?.approval_level) && !sentToAdmin;

  useEffect(() => {
    if (open) { setNote(""); setCreateSales(!adminOverride); }
  }, [open, request?.id, action, adminOverride]);

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

  const note2 = (cls, children) => <p className={`m-0 mb-3 rounded-xl px-3.5 py-2.5 text-[12.5px] ${cls}`}>{children}</p>;
  return (
    <Modal
      open={open} onClose={onClose} locked={saving} size="lg" title={approving ? "Approve request" : "Reject request"}
      actions={(
        <>
          <button type="button" className={btn.ghost} onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button" onClick={submit} disabled={saving || (!approving && !note.trim())}
            className={`${btn.primary} ${approving ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            <Icon name={approving ? "check_circle" : "block"} className="text-[18px]" />
            {saving ? "Saving..." : approving ? (adminOverride ? "Approve request" : hasInvoices && createSales ? "Approve & create sales" : "Approve") : "Reject"}
          </button>
        </>
      )}
    >
      {request && (
        <p className="m-0 mb-3 rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">
          {request.requested_by_name || "User"} wants to add sales for <b className="text-slate-900">{request.outlet_name}</b> (ERP{" "}
          {request.outlet_erp_id}) under {request.staff_name || "staff"}
          {request.company_name ? <> (<b className="text-slate-900">{request.company_name}</b>)</> : ""} on {formatDate(request.sale_date)}. Overdue{" "}
          {request.max_overdue_days} day(s), {money(overdueBalance(request))} pending.
          {request.sales_summary && (
            <>
              {" "}New invoice: <b className="text-slate-900">{(request.sales_summary.invoiceNumbers || []).join(", ") || "—"}</b> for{" "}
              <b className="text-slate-900">{money(request.sales_summary.totalAmount)}</b>.
            </>
          )}
        </p>
      )}
      {fromMarketingStaff && note2("border border-blue-200 bg-blue-50 text-slate-700", (
        <>
          <b>{request.marketing_staff_name || "Marketing staff"}</b>: {request.request_note}
          <br />
          Will complete payment within <b>{request.payment_days} day(s)</b>.
        </>
      ))}
      {sentToAdmin && note2("border border-blue-200 bg-blue-50 text-slate-700", <><b>Reason</b>: {request.request_note}</>)}
      {approving && (fromMarketingStaff || sentToAdmin) && note2("text-slate-500", "Approving creates the sale automatically (deducts stock, same as Add Sales).")}
      {!approving && (fromMarketingStaff || sentToAdmin || request?.marketing_staff_id) && note2("text-slate-500", "Rejecting moves the invoice to Delivered → Cancelled Items. No stock is taken.")}
      {approving && adminOverride && note2("border border-amber-200 bg-amber-50 text-amber-900", "This request is still assigned to marketing staff. Admin approval will approve it now; create the saved sales separately from the Approved list.")}
      {approving && !adminOverride && !fromMarketingStaff && !sentToAdmin && (
        <div className="mb-3">
          <label className={`flex items-center gap-2 text-[13px] font-medium ${hasInvoices ? "cursor-pointer text-slate-800" : "cursor-not-allowed text-slate-400"}`}>
            <input type="checkbox" className="size-4 accent-emerald-600" checked={hasInvoices && createSales} disabled={!hasInvoices || saving} onChange={(e) => setCreateSales(e.target.checked)} />
            Create the sales now (deducts stock, same as Add Sales)
          </label>
          <p className="m-0 mt-1 pl-6 text-[12px] text-slate-500">
            {hasInvoices
              ? "If the sales can't be created (for example not enough stock), the request stays approved and you can retry with Create sales."
              : "This request has no invoice details saved, so the sales must be added from Add Sales after approval."}
          </p>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{approving ? "Note (optional)" : "Reason for rejecting *"}</span>
        <textarea rows={3} className={`${fieldClass} h-auto py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
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
