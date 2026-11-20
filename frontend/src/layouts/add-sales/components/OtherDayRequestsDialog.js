// Other bit / date approvals list (opened from Add Sales): Tailwind CSS (no MUI). Filter, search and review logic unchanged.
import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Icon, Modal, Notice, SearchBox, btn, fieldClass } from "components/tw";
import { formatDate, formatDateTime } from "layouts/overdue-requests/components/ReviewDialog";

const API = process.env.REACT_APP_API_URL;

// Status look: card accent (left border) + pill.
const STATUS = {
  pending: { label: "Waiting for admin", accent: "border-l-amber-500", pill: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", accent: "border-l-emerald-600", pill: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rejected", accent: "border-l-red-600", pill: "bg-red-50 text-red-700" },
  used: { label: "Sale added", accent: "border-l-slate-500", pill: "bg-slate-100 text-slate-600" },
  own_permission: { label: "Own permission", accent: "border-l-teal-600", pill: "bg-teal-50 text-teal-700" },
};

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "used", label: "Used" },
  { value: "own_permission", label: "Own permission" },
];

const isOwn = (request) => Number(request.own_permission) === 1;
const matchesFilter = (request, filter) => {
  if (filter === "open") return ["pending", "approved"].includes(request.status);
  if (filter === "own_permission") return isOwn(request);
  return request.status === filter;
};

function Fact({ label, children, sub }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="block break-words text-[13px] font-medium leading-snug text-slate-800">{children}</span>
      {sub && <span className="block text-[11.5px] text-slate-500">{sub}</span>}
    </div>
  );
}

Fact.defaultProps = { sub: null };
Fact.propTypes = { label: PropTypes.string.isRequired, children: PropTypes.node.isRequired, sub: PropTypes.node };

function RequestCard({ request, isAdmin, onReview }) {
  const status = (isOwn(request) ? STATUS.own_permission : STATUS[request.status]) || STATUS.pending;
  return (
    <div className={`rounded-xl border border-l-4 border-slate-200 bg-white p-4 ${status.accent}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="m-0 text-[14.5px] font-semibold leading-snug text-slate-900">{request.outlet_name || "Outlet"}</h4>
          <span className="text-[12px] text-slate-500">ERP {request.outlet_erp_id || "—"} · Request #{request.id}</span>
        </div>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${status.pill}`}>{status.label}</span>
      </div>

      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
        <Fact label="Staff">{request.staff_name || `Staff #${request.staff_id}`}</Fact>
        <Fact label="Sale date">{formatDate(request.sale_date)}</Fact>
        <Fact label="Outlet bit">{request.outlet_day || "—"}</Fact>
        <Fact label="Asked on">{request.request_day ? `${request.request_day}, ` : ""}{formatDateTime(request.created_at)}</Fact>
      </div>

      {request.request_note && (
        <div className="mt-3 flex gap-1.5 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
          <Icon name="format_quote" className="mt-0.5 text-[16px] text-slate-400" />
          <span className="whitespace-pre-wrap break-words text-[12.5px] text-slate-700">{request.request_note}</span>
        </div>
      )}

      {request.review_note && (
        <p className={`m-0 mt-2 text-[12px] font-medium ${request.status === "rejected" ? "text-red-700" : "text-emerald-700"}`}>Admin: {request.review_note}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
          <Icon name="person" className="text-[15px]" />
          {request.requested_by_name || "—"}
          {request.reviewed_by_name ? ` · reviewed by ${request.reviewed_by_name}` : ""}
        </span>
        <div className="flex gap-2">
          {request.status === "approved" && (
            <span className="inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700">
              <Icon name="check_circle" className="text-[16px]" />Ready — enter the bill in the list as usual
            </span>
          )}
          {isAdmin && request.status === "pending" && (
            <>
              <button type="button" className={`${btn.outline} h-8 px-3 text-red-600`} onClick={() => onReview(request, "reject")}>Reject</button>
              <button type="button" className={`${btn.primary} h-8 bg-emerald-600 px-3 hover:bg-emerald-700`} onClick={() => onReview(request, "approve")}>
                <Icon name="check" className="text-[16px]" />Approve
              </button>
            </>
          )}
        </div>
      </div>
    </div>
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
      <Modal
        open={open} onClose={onClose} size="xl"
        title={(
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon name="event_busy" className="text-[20px]" /></span>
              <span>
                <span className="block leading-tight">Other Bit / Date Approvals</span>
                <span className="block text-[12px] font-normal text-slate-500">{counts.pending} waiting for admin · {counts.approved} approved, ready to add</span>
              </span>
            </span>
            <button type="button" className={btn.icon} title="Refresh" aria-label="Refresh" onClick={onRefresh}><Icon name="refresh" className="text-[20px]" /></button>
          </span>
        )}
        actions={<button type="button" className={btn.ghost} onClick={onClose}>Close</button>}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Request filter">
            {FILTERS.map((option) => {
              const active = filter === option.value;
              return (
                <button
                  key={option.value} type="button" role="tab" aria-selected={active} onClick={() => setFilter(option.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {option.label} <span className="opacity-60">({counts[option.value]})</span>
                </button>
              );
            })}
          </div>
          <SearchBox value={search} onChange={setSearch} placeholder="Search outlet, staff" className="w-full sm:w-56" />
        </div>
        {notice && <Notice tone="info" className="mb-3" onClose={() => setNotice("")}>{notice}</Notice>}
        {visible.length === 0 ? (
          <div className="py-12 text-center">
            <Icon name="task_alt" className="text-[40px] text-slate-300" />
            <p className="m-0 mt-1 text-[13px] text-slate-500">{requests.length === 0 ? "No other bit or date requests yet." : "Nothing in this list."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                isAdmin={isAdmin}
                onReview={(item, action) => setReview({ request: item, action, note: "" })}
              />
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(review.request)} onClose={closeReview} locked={saving} title={approving ? "Approve request" : "Reject request"}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeReview} disabled={saving}>Cancel</button>
            <button type="button" className={approving ? `${btn.primary} bg-emerald-600 hover:bg-emerald-700` : btn.danger} onClick={submitReview} disabled={saving || (!approving && !review.note.trim())}>
              {saving ? "Saving..." : approving ? "Approve" : "Reject"}
            </button>
          </>
        )}
      >
        {review.request && (
          <p className="m-0 mb-3 text-[13px] text-slate-600">
            {review.request.requested_by_name || "User"} wants to add a sale for{" "}
            <strong>{review.request.outlet_name}</strong> ({review.request.outlet_day || "—"} bit) under{" "}
            <strong>{review.request.staff_name}</strong> on <strong>{formatDate(review.request.sale_date)}</strong>.
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{approving ? "Note (optional)" : "Reason for rejecting *"}</span>
          <textarea rows={2} className={`${fieldClass} h-auto py-2`} value={review.note} onChange={(e) => setReview((prev) => ({ ...prev, note: e.target.value }))} />
        </label>
      </Modal>
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
