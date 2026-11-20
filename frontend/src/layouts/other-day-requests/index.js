// Approvals > Other Day Bit Requests: Tailwind CSS (no MUI). Loading and review logic unchanged.
import { useCallback, useEffect, useState } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { formatDate, formatDateTime } from "layouts/overdue-requests/components/ReviewDialog";
import {
  Badge, Card, EmptyState, Icon, Modal, Notice, PageHeader, Segmented, Spinner, btn, fieldClass, td, th,
} from "components/tw";

const API = process.env.REACT_APP_API_URL;

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved (not used yet)" },
  { value: "used", label: "Used" },
  { value: "rejected", label: "Rejected" },
  // Billed with "Own Permission (Other-Day Bit)": no admin approval, reason given by the user.
  { value: "own_permission", label: "Own permission" },
  { value: "all", label: "All" },
];
// Status badge: [label, tone].
const STATUS_BADGE = {
  pending: ["Pending", "amber"],
  approved: ["Approved", "green"],
  used: ["Sale added", "blue"],
  rejected: ["Rejected", "red"],
};
const HEADINGS = ["#", "Requested", "Staff", "Sale date", "Outlet", "Bit", "Requested by", "Reason", "Status", ""];

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
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Other Day Bit Requests"
          description={`Add Sales users can bill only today's bit. Approve a request to let them add one sale entry for another day's outlet on the requested date.${counts.pending ? ` ${counts.pending} waiting for review.` : ""}`}
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
                  <tr className="bg-slate-50">{HEADINGS.map((heading) => <th key={heading} className={th}>{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {requests.map((request, index) => {
                    const [label, tone] = Number(request.own_permission) === 1
                      ? ["Own permission", "violet"]
                      : STATUS_BADGE[request.status] || [request.status, "slate"];
                    return (
                      <tr key={request.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                        <td className={`${td} text-slate-400`}>{index + 1}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          <span className="block font-mono text-[12px] text-slate-500">#{request.id}</span>
                          <span className="block text-[12.5px]">{formatDateTime(request.created_at)}</span>
                        </td>
                        <td className={`${td} font-semibold text-slate-800`}>{request.staff_name || `Staff #${request.staff_id}`}</td>
                        <td className={`${td} whitespace-nowrap`}>{formatDate(request.sale_date)}</td>
                        <td className={td}>
                          <span className="block font-semibold text-slate-800">{request.outlet_name || "—"}</span>
                          <span className="block font-mono text-[11.5px] text-slate-400">{request.outlet_erp_id || "—"}</span>
                        </td>
                        <td className={`${td} whitespace-nowrap`}>
                          <span className="block font-semibold">{request.outlet_day || "—"}</span>
                          {request.request_day && <span className="block text-[11.5px] text-slate-500">asked on {request.request_day}</span>}
                        </td>
                        <td className={td}>{request.requested_by_name || "—"}</td>
                        <td className={`${td} max-w-64 whitespace-pre-wrap text-[12.5px] text-slate-600`}>{request.request_note}</td>
                        <td className={td}>
                          <Badge tone={tone}>{label}</Badge>
                          {request.reviewed_by_name && (
                            <span className="mt-1 block text-[11.5px] text-slate-500">{request.reviewed_by_name} · {formatDateTime(request.reviewed_at)}</span>
                          )}
                          {request.review_note && <span className="block text-[11.5px] text-slate-500">{request.review_note}</span>}
                        </td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          {request.status === "pending" && (
                            <>
                              <button type="button" className={`${btn.icon} text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700`} title="Approve" aria-label="Approve" onClick={() => setReview({ request, action: "approve", note: "" })}>
                                <Icon name="check_circle" className="text-[20px]" />
                              </button>
                              <button type="button" className={`${btn.icon} text-red-500 hover:bg-red-50 hover:text-red-600`} title="Reject" aria-label="Reject" onClick={() => setReview({ request, action: "reject", note: "" })}>
                                <Icon name="cancel" className="text-[20px]" />
                              </button>
                            </>
                          )}
                          {request.status !== "pending" && <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={Boolean(review.request)} onClose={closeReview} locked={saving} size="lg" title={approving ? "Approve other-day bit sale" : "Reject request"}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeReview} disabled={saving}>Cancel</button>
            <button
              type="button" disabled={saving || (!approving && !review.note.trim())} onClick={submitReview}
              className={`${btn.primary} ${approving ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
            >
              <Icon name={approving ? "check_circle" : "block"} className="text-[18px]" />
              {saving ? "Saving..." : approving ? "Approve" : "Reject"}
            </button>
          </>
        )}
      >
        {review.request && (
          <p className="m-0 mb-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">
            {review.request.requested_by_name || "User"} wants to add a sale for{" "}
            <b className="text-slate-900">{review.request.outlet_name}</b> ({review.request.outlet_day} bit) under{" "}
            <b className="text-slate-900">{review.request.staff_name}</b> on <b className="text-slate-900">{formatDate(review.request.sale_date)}</b>.
            Reason: <b className="text-slate-900">{review.request.request_note}</b>
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

export default OtherDayRequests;
