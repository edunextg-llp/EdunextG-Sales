// Overdue requests list (opened from Add Sales): Tailwind CSS (no MUI). Filter, search, create and review logic unchanged.
import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Icon, Modal, SearchBox, btn } from "components/tw";
import { formatDate, formatDateTime, money, overdueBalance } from "layouts/overdue-requests/components/ReviewDialog";

// Status look: card accent (left border) + pill.
const STATUS = {
  awaiting_staff: { label: "With marketing staff", accent: "border-l-blue-600", pill: "bg-blue-50 text-blue-700" },
  pending: { label: "Pending", accent: "border-l-amber-500", pill: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", accent: "border-l-emerald-600", pill: "bg-emerald-50 text-emerald-700" },
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
];

const overdueTone = (days) => {
  if (days >= 30) return "bg-red-50 text-red-700";
  if (days >= 10) return "bg-orange-50 text-orange-700";
  return "bg-slate-100 text-slate-700";
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

function RequestCard({ request, isAdmin, creating, onCreate, onReview }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS[request.status] || STATUS.pending;
  const days = Number(request.max_overdue_days) || 0;
  const tone = overdueTone(days);
  const note = String(request.request_note || "").trim();
  const longNote = note.length > 140;
  const invoices = (request.sales_summary?.invoiceNumbers || []).join(", ") || "—";

  return (
    <div className={`rounded-xl border border-l-4 border-slate-200 bg-white p-4 transition hover:shadow-sm ${status.accent}`}>
      {/* Outlet + status */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="m-0 text-[14.5px] font-semibold leading-snug text-slate-900">{request.outlet_name || "Outlet"}</h4>
          <span className="text-[12px] text-slate-500">ERP {request.outlet_erp_id || "—"} · Request #{request.id}</span>
        </div>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${status.pill}`}>{status.label}</span>
      </div>

      {/* Key facts */}
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3">
        <Fact label="Staff">{request.staff_name || `Staff #${request.staff_id}`}</Fact>
        <Fact label="Sale date">{formatDate(request.sale_date)}</Fact>
        <Fact label="Invoice" sub={request.sales_summary ? money(request.sales_summary.totalAmount) : null}>{invoices}</Fact>
        <div>
          <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Overdue</span>
          <span className={`inline-block rounded-md px-2 py-0.5 text-[12px] font-bold ${tone}`}>{days} day{days === 1 ? "" : "s"}</span>
          <span className="block text-[11.5px] text-slate-500">Due {money(overdueBalance(request))}</span>
        </div>
      </div>

      {/* Reason */}
      {note && (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
          <div className="flex items-start gap-1.5">
            <Icon name="format_quote" className="mt-0.5 text-[16px] text-slate-400" />
            <span className={`whitespace-pre-wrap break-words text-[12.5px] text-slate-700 ${!expanded && longNote ? "line-clamp-2" : ""}`}>{note}</span>
          </div>
          {longNote && (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="ml-6 mt-1 cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold text-blue-600">
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[12px] text-slate-500">
          <Icon name="person" className="text-[15px]" />
          {request.requested_by_name || "—"} · {formatDateTime(request.created_at)}
          {request.status === "approved" && request.reviewed_by_name ? ` · approved by ${request.reviewed_by_name}` : ""}
        </span>
        <div className="flex gap-2">
          {request.status === "approved" && (
            <button type="button" className={`${btn.primary} h-8 bg-emerald-600 px-3 hover:bg-emerald-700`} disabled={creating} onClick={() => onCreate(request)}>
              <Icon name="add_task" className="text-[16px]" />{creating ? "Creating..." : "Create invoice"}
            </button>
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
    <Modal
      open={open} onClose={onClose} size="xl"
        title={(
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Icon name="pending_actions" className="text-[20px]" /></span>
              <span>
                <span className="block leading-tight">Overdue Requests</span>
                <span className="block text-[12px] font-normal text-slate-500">{counts.pending} waiting for admin · {counts.approved} approved, ready to create</span>
              </span>
            </span>
            <button type="button" className={btn.icon} title="Refresh" aria-label="Refresh" onClick={onRefresh}><Icon name="refresh" className="text-[20px]" /></button>
          </span>
        )}
      actions={<button type="button" className={btn.ghost} onClick={onClose}>Close</button>}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Request filter">
          {FILTERS.map((option) => {
            const active = filter === option.value;
            return (
              <button
                key={option.value} type="button" role="tab" aria-selected={active} onClick={() => setFilter(option.value)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {option.label} <span className="opacity-60">({counts[option.value]})</span>
              </button>
            );
          })}
        </div>
        <SearchBox value={search} onChange={setSearch} placeholder="Search outlet, staff, invoice" className="w-full sm:w-64" />
      </div>
      {visible.length === 0 ? (
        <div className="py-12 text-center">
          <Icon name="task_alt" className="text-[40px] text-slate-300" />
          <p className="m-0 mt-1 text-[13px] text-slate-500">{requests.length === 0 ? "No overdue requests right now." : "Nothing matches this filter."}</p>
        </div>
      ) : (
        <div className="space-y-3">
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
        </div>
      )}
    </Modal>
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
