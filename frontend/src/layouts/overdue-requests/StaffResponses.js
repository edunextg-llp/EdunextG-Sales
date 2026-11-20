// Marketing staff: their outlets overdue 14+ days (reason + days to pay). Tailwind CSS (no MUI); logic unchanged.
import { useCallback, useEffect, useState } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { formatDate, money, overdueBalance } from "layouts/overdue-requests/components/ReviewDialog";
import { Badge, Card, EmptyState, Field, Icon, Notice, PageHeader, Spinner, btn, fieldClass } from "components/tw";

const API = process.env.REACT_APP_API_URL;
const DAYS = [1, 2, 3, 4, 5, 6, 7];
// Status badge: [label, tone].
const STATUS = {
  awaiting_staff: ["Your response needed", "amber"],
  pending: ["Waiting for approval", "blue"],
  approved: ["Approved", "green"],
  used: ["Approved, sale created", "green"],
  rejected: ["Rejected", "red"],
};

// Marketing staff: outlets overdue by 14+ days that need a reason and days to pay.
function StaffResponses() {
  const [requests, setRequests] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/staff/overdue-requests/my`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load overdue requests.");
      setRequests(data.requests || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setDraft = (id, change) => setDrafts((prev) => ({ ...prev, [id]: { reason: "", paymentDays: "", ...prev[id], ...change } }));

  const submit = async (request) => {
    const draft = drafts[request.id] || {};
    setSavingId(request.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API}/staff/overdue-requests/${request.id}/respond`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: draft.reason, paymentDays: Number(draft.paymentDays) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to submit your response.");
      setNotice(`${request.outlet_name}: ${data.message}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader title="Overdue Requests" description="Your outlets overdue by 14 days or more. Give the reason and how many days the payment will take." />
        {notice && <Notice tone="success" className="mb-4" onClose={() => setNotice("")}>{notice}</Notice>}
        {error && <Notice tone="error" className="mb-4">{error}</Notice>}
        {loading && <div className="flex justify-center py-14"><Spinner className="size-7" /></div>}
        {!loading && !error && requests.length === 0 && (
          <Card><EmptyState icon="task_alt" text="No overdue requests for your outlets." /></Card>
        )}
        <div className="space-y-3">
          {requests.map((request) => {
            const [label, tone] = STATUS[request.status] || [request.status, "slate"];
            const draft = drafts[request.id] || { reason: "", paymentDays: "" };
            const waiting = request.status === "awaiting_staff";
            return (
              <Card key={request.id} className={waiting ? "ring-2 ring-amber-300/60" : ""}>
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-600"><Icon name="storefront" /></span>
                    <span className="min-w-0 grow">
                      <span className="block text-[15px] font-semibold text-slate-900">{request.outlet_name}</span>
                      <span className="block font-mono text-[11.5px] text-slate-400">ERP {request.outlet_erp_id}</span>
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-red-50 px-3 py-2">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-red-400">Overdue</span>
                      <span className="block text-[14px] font-bold text-red-700">{request.max_overdue_days} day(s) · {money(overdueBalance(request))}</span>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">New invoice · {formatDate(request.sale_date)}</span>
                      <span className="block text-[13px] font-semibold text-slate-800">
                        {(request.sales_summary?.invoiceNumbers || []).join(", ") || "—"} for {money(request.sales_summary?.totalAmount)}
                      </span>
                    </div>
                  </div>
                  {waiting ? (
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <label className="flex min-w-72 grow flex-col gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reason of overdue *</span>
                        <textarea rows={2} maxLength={1000} className={`${fieldClass} h-auto py-2`} value={draft.reason} onChange={(event) => setDraft(request.id, { reason: event.target.value })} />
                      </label>
                      <Field label="Days to complete payment *" width="w-56">
                        <select className={fieldClass} value={draft.paymentDays} onChange={(event) => setDraft(request.id, { paymentDays: event.target.value })}>
                          <option value="" disabled>Choose days</option>
                          {DAYS.map((day) => <option key={day} value={day}>{day} day{day === 1 ? "" : "s"}</option>)}
                        </select>
                      </Field>
                      <button
                        type="button" className={btn.primary} onClick={() => submit(request)}
                        disabled={savingId === request.id || !draft.reason.trim() || !draft.paymentDays}
                      >
                        <Icon name="send" className="text-[17px]" />{savingId === request.id ? "Submitting..." : "Submit"}
                      </button>
                    </div>
                  ) : (
                    <p className="m-0 mt-3 text-[12.5px] text-slate-500">
                      Your reason: <span className="text-slate-700">{request.request_note}</span> · Pay within {request.payment_days} day(s)
                      {request.review_note ? ` · Note: ${request.review_note}` : ""}
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
      <Footer />
    </DashboardLayout>
  );
}

export default StaffResponses;
