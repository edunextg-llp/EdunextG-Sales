// Approvals > Suspense Requests: Tailwind CSS (no MUI). Loading and review logic unchanged.
import { Fragment, useCallback, useEffect, useState } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { formatDateTime, money } from "layouts/overdue-requests/components/ReviewDialog";
import {
  Badge, Card, EmptyState, Icon, Modal, Notice, PageHeader, Segmented, Spinner, btn, fieldClass, td, th,
} from "components/tw";

const API = (process.env.REACT_APP_API_URL);

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved (moved)" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];
// Status badge: [label, tone].
const STATUS_BADGE = {
  pending: ["Pending", "amber"],
  approved: ["Moved to Suspense", "green"],
  rejected: ["Rejected", "red"],
};
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
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Suspense Requests"
          description={`Requests to move bills from Pending Deliveries to Suspense. Bills move only after you approve.${counts.pending ? ` ${counts.pending} waiting for review.` : ""}`}
          actions={(
            <button type="button" className={btn.outline} onClick={() => load()} disabled={loading}>
              <Icon name="refresh" className="text-[18px]" />Refresh
            </button>
          )}
        />
        {notice && <Notice tone="info" className="mb-4" onClose={() => setNotice("")}>{notice}</Notice>}
        {error && <Notice tone="error" className="mb-4">{error}</Notice>}

        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <Segmented
              label="Status" value={status} onChange={setStatus}
              options={STATUS_OPTIONS.map((option) => [option.value, `${option.label}${option.value !== "all" && counts[option.value] ? ` (${counts[option.value]})` : ""}`])}
            />
          </div>
          {loading ? (
            <div className="flex justify-center py-14"><Spinner className="size-7" /></div>
          ) : requests.length === 0 ? (
            <EmptyState icon="task_alt" text="No requests here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["#", "Requested", "Company", "Requested by", "Reason", "Bills", "Status", ""].map((heading) => <th key={heading} className={th}>{heading}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request, index) => {
                    const [label, tone] = STATUS_BADGE[request.status] || [request.status, "slate"];
                    const expanded = expandedId === request.id;
                    const bills = request.bills_summary || [];
                    return (
                      <Fragment key={request.id}>
                        <tr className={`border-t border-slate-100 align-top hover:bg-slate-50/70 ${expanded ? "bg-amber-50/40" : ""}`}>
                          <td className={`${td} text-slate-400`}>{index + 1}</td>
                          <td className={`${td} whitespace-nowrap`}>
                            <span className="block font-mono text-[12px] text-slate-500">#{request.id}</span>
                            <span className="block text-[12.5px]">{formatDateTime(request.created_at)}</span>
                          </td>
                          <td className={td}>
                            {requestCompanies(request).map((name) => <span key={name} className="block font-semibold text-slate-800">{name}</span>)}
                            {!requestCompanies(request).length && "—"}
                          </td>
                          <td className={`${td} font-semibold text-slate-800`}>{request.requested_by_name || "—"}</td>
                          <td className={`${td} max-w-72 whitespace-pre-wrap text-[12.5px] text-slate-600`}>{request.reason}</td>
                          <td className={td}>
                            <span className="block font-mono text-[12px] font-semibold text-slate-800">
                              {bills.map((bill) => bill.invoice_number || bill.id).slice(0, 4).join(", ")}{bills.length > 4 ? ` +${bills.length - 4} more` : ""}
                            </span>
                            <span className="block text-[12px] text-slate-500">{bills.length} bill(s) · {money(billsTotal(request))}</span>
                          </td>
                          <td className={td}>
                            <Badge tone={tone}>{label}</Badge>
                          {request.reviewed_by_name && (
                            <span className="mt-1 block text-[11.5px] text-slate-500">{request.reviewed_by_name} · {formatDateTime(request.reviewed_at)}</span>
                          )}
                          {request.review_note && <span className="block text-[11.5px] text-slate-500">{request.review_note}</span>}
                            {request.status === "approved" && request.skipped_ids?.length > 0 && (
                              <span className="block text-[11.5px] font-semibold text-amber-700">{request.skipped_ids.length} bill(s) skipped (no longer pending delivery)</span>
                            )}
                          </td>
                          <td className={`${td} whitespace-nowrap text-right`}>
                            <button type="button" className={`${btn.icon} hover:text-blue-700`} title={expanded ? "Hide bills" : "View bills"} aria-label={expanded ? "Hide bills" : "View bills"} onClick={() => setExpandedId(expanded ? null : request.id)}>
                              <Icon name={expanded ? "expand_less" : "receipt_long"} className="text-[19px]" />
                            </button>
                          {request.status === "pending" && (
                            <>
                              <button type="button" className={`${btn.icon} text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700`} title="Approve & move to Suspense" aria-label="Approve & move to Suspense" onClick={() => setReview({ request, action: "approve", note: "" })}>
                                <Icon name="check_circle" className="text-[20px]" />
                              </button>
                              <button type="button" className={`${btn.icon} text-red-500 hover:bg-red-50 hover:text-red-600`} title="Reject" aria-label="Reject" onClick={() => setReview({ request, action: "reject", note: "" })}>
                                <Icon name="cancel" className="text-[20px]" />
                              </button>
                            </>
                          )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-amber-50/40">
                            <td colSpan={8} className="px-4 pb-4">
                              <div className="overflow-x-auto rounded-xl border border-amber-200 bg-white">
                                <table className="w-full border-collapse text-[12.5px]">
                                  <thead>
                                    <tr className="bg-amber-50 text-left text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                                      {["Invoice no", "Sales date", "Company", "Staff", "Outlet", "Area", "Boxes", "Packets", "Amount"].map((heading) => <th key={heading} className="px-3 py-2">{heading}</th>)}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bills.map((bill) => (
                                      <tr key={bill.id} className="border-t border-amber-100">
                                        <td className="px-3 py-1.5 font-mono font-semibold">{bill.invoice_number || bill.id}</td>
                                        <td className="px-3 py-1.5">{bill.sale_date || "—"}</td>
                                        <td className="px-3 py-1.5">{bill.company_name || "—"}</td>
                                        <td className="px-3 py-1.5">{bill.staff_name || "—"}</td>
                                        <td className="px-3 py-1.5">{bill.outlet_name || "—"}</td>
                                        <td className="px-3 py-1.5">{bill.area || "—"}</td>
                                        <td className="px-3 py-1.5 tabular-nums">{bill.box_count ?? "—"}</td>
                                        <td className="px-3 py-1.5 tabular-nums">{bill.packet_count ?? "—"}</td>
                                        <td className="px-3 py-1.5 tabular-nums font-semibold">{money(bill.price)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(review.request)} onClose={closeReview} locked={saving} size="lg" title={approving ? "Approve — move to Suspense" : "Reject request"}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeReview} disabled={saving}>Cancel</button>
            <button
              type="button" disabled={saving || (!approving && !review.note.trim())} onClick={submitReview}
              className={`${btn.primary} ${approving ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              <Icon name={approving ? "check_circle" : "block"} className="text-[18px]" />
              {saving ? "Saving..." : approving ? "Approve & move" : "Reject"}
            </button>
          </>
        )}
      >
        {review.request && (
          <p className="m-0 mb-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">
            {review.request.requested_by_name || "User"} wants to move <b className="text-slate-900">{(review.request.bills_summary || []).length} bill(s)</b>
            {requestCompanies(review.request).length ? <> of <b className="text-slate-900">{requestCompanies(review.request).join(", ")}</b></> : ""}{" "}
            ({money(billsTotal(review.request))}) to Suspense. Reason: <b className="text-slate-900">{review.request.reason}</b>
            {approving ? ". Bills that are no longer pending delivery will be skipped." : ". The bills will stay in Pending Deliveries."}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{approving ? "Note (optional)" : "Reason for rejecting *"}</span>
          <textarea rows={3} className={`${fieldClass} h-auto py-2`} value={review.note} onChange={(e) => setReview((prev) => ({ ...prev, note: e.target.value }))} />
        </label>
      </Modal>

      <Footer />
    </DashboardLayout>
  );
}

export default SuspenseRequests;
