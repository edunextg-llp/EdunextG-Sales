// Approvals > Overdue Sale Requests: Tailwind CSS (no MUI). Loading, create sales and review logic unchanged.
import { Fragment, useCallback, useEffect, useState } from "react";

import { useAuth } from "context/AuthContext";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ReviewDialog, {
  formatDate,
  formatDateTime,
  money,
  overdueBalance,
} from "layouts/overdue-requests/components/ReviewDialog";
import { Badge, Card, EmptyState, Icon, Notice, PageHeader, Spinner, btn, fieldClass, td, th } from "components/tw";

const API = (process.env.REACT_APP_API_URL);

const APPROVER_LABEL = {
  up_to_1000: "Up to ₹1,000: Tanushree",
  up_to_2000: "₹1,001–₹2,000: Manager",
  above_2000: "Above ₹2,000: Admin",
  admin: "Sent directly to Admin",
};

const STATUS_OPTIONS = [
  { value: "awaiting_staff", label: "With marketing staff", adminOnly: true },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved (not used yet)" },
  { value: "used", label: "Approved & sales created" },
  { value: "rejected", label: "Rejected" },
  { value: "self_approved", label: "Staff added with reason (7-day permission)", adminOnly: true },
  { value: "own_permission", label: "Added on own permission (14+ days)", adminOnly: true },
  { value: "all", label: "All" },
];

// Status badge: [label, tone].
const STATUS_BADGE = {
  awaiting_staff: ["With marketing staff", "blue"],
  pending: ["Pending", "amber"],
  approved: ["Approved", "green"],
  used: ["Sales created", "blue"],
  rejected: ["Rejected", "red"],
};

function OverdueRequests() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [status, setStatus] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [review, setReview] = useState({ request: null, action: "approve" });
  const [notice, setNotice] = useState(null);
  const [creatingId, setCreatingId] = useState(null);

  const showResult = (data) => {
    if (!data) return;
    setNotice({ color: data.salesError ? "warning" : "success", text: data.message });
  };

  const createSales = async (request) => {
    setCreatingId(request.id);
    setNotice(null);
    try {
      const response = await fetch(`${API}/staff/overdue-requests/${request.id}/create-sales`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to create the sales.");
      setNotice({ color: "success", text: `Request #${request.id}: ${data.message}` });
    } catch (err) {
      setNotice({ color: "error", text: `Request #${request.id}: ${err.message}` });
    } finally {
      setCreatingId(null);
      load(true);
    }
  };

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const scope = isAdmin ? "" : "&scope=approver";
        const response = await fetch(`${API}/staff/overdue-requests?status=${status}${scope}`);
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
    },
    [status, isAdmin]
  );

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const noticeTone = { success: "success", error: "error", warning: "info" };
  const iconAction = (title, icon, tone, onClick, disabled) => (
    <button
      type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={`${btn.icon} ${tone === "green" ? "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" : tone === "red" ? "text-red-500 hover:bg-red-50 hover:text-red-600" : "hover:text-blue-700"}`}
    >
      <Icon name={icon} className="text-[20px]" />
    </button>
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Overdue Sale Requests"
          description={`${isAdmin
            ? "Requests to add sales for outlets with credit overdue by more than 3 days."
            : "Outlets overdue by 14 days or more that you can approve. Approving creates the sale."}${counts.pending ? ` ${counts.pending} waiting for review.` : ""}${isAdmin && counts.self_approved ? ` ${counts.self_approved} added by staff with the 7-day permission.` : ""}${isAdmin && counts.own_permission ? ` ${counts.own_permission} added on own permission (14+ days).` : ""}`}
          actions={(
            <>
              <select className={`${fieldClass} w-auto min-w-64`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                {STATUS_OPTIONS.filter((option) => isAdmin || !option.adminOnly).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}{option.value !== "all" && counts[option.value] ? ` (${counts[option.value]})` : ""}
                  </option>
                ))}
              </select>
              <button type="button" className={btn.outline} onClick={() => load()} disabled={loading}>
                <Icon name="refresh" className="text-[18px]" />Refresh
              </button>
            </>
          )}
        />
        {notice && <Notice tone={noticeTone[notice.color] || "info"} className="mb-4" onClose={() => setNotice(null)}>{notice.text}</Notice>}
        {error && <Notice tone="error" className="mb-4">{error}</Notice>}

        <Card>
          {loading ? (
            <div className="flex justify-center py-14"><Spinner className="size-7" /></div>
          ) : requests.length === 0 ? (
            <EmptyState icon="task_alt" text="No requests here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["#", "Requested", "Staff / sale date", "Company", "Outlet", "Overdue", "New sale", "Requested by", "Status", ""].map((heading) => <th key={heading} className={`${th} whitespace-nowrap`}>{heading}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request, index) => {
                    const selfKind = Number(request.self_approved);
                    const [label, tone] = selfKind === 2
                      ? ["Own permission", "red"]
                      : selfKind === 1
                        ? ["7-day permission", "amber"]
                        : STATUS_BADGE[request.status] || [request.status, "slate"];
                    const expanded = expandedId === request.id;
                    return (
                      <Fragment key={request.id}>
                        <tr className={`border-t border-slate-100 align-top hover:bg-slate-50/70 ${expanded ? "bg-red-50/30" : ""}`}>
                          <td className={`${td} text-slate-400`}>{index + 1}</td>
                          <td className={`${td} whitespace-nowrap`}>
                            <span className="block font-mono text-[12px] text-slate-500">#{request.id}</span>
                            <span className="block text-[12.5px]">{formatDateTime(request.created_at)}</span>
                          </td>
                          <td className={td}>
                            <span className="block font-semibold text-slate-800">{request.staff_name || `Staff #${request.staff_id}`}</span>
                            <span className="block text-[12px] text-slate-500">{formatDate(request.sale_date)}</span>
                          </td>
                          <td className={`${td} font-semibold text-slate-800`}>{request.company_name || "—"}</td>
                          <td className={td}>
                            <span className="block font-semibold text-slate-800">{request.outlet_name || "—"}</span>
                            <span className="block font-mono text-[11.5px] text-slate-400">ERP: {request.outlet_erp_id}</span>
                          </td>
                          <td className={`${td} whitespace-nowrap`}>
                            <span className="block font-bold text-red-700">{request.max_overdue_days} day(s)</span>
                            <span className="block text-[12px] text-slate-500">{money(overdueBalance(request))} in {(request.overdue_details || []).length} bill(s)</span>
                          </td>
                          <td className={td}>
                            {request.sales_summary ? (
                              <>
                                <span className="block font-mono text-[12px] font-semibold text-slate-800">{(request.sales_summary.invoiceNumbers || []).join(", ") || "—"}</span>
                                <span className="block text-[12px] text-slate-500">{money(request.sales_summary.totalAmount)} · {request.sales_summary.invoiceCount} invoice(s)</span>
                              </>
                            ) : "—"}
                          </td>
                          <td className={`${td} max-w-64`}>
                            <span className="block text-[12.5px]">
                              <b className="text-slate-800">{request.requested_by_name || "—"}</b>
                              {request.marketing_staff_name && <> · Marketing: <b className="text-slate-800">{request.marketing_staff_name}</b></>}
                            </span>
                            <span className="block text-[12px] text-slate-500">{request.request_note}</span>
                            {request.payment_days && <span className="block text-[11.5px] font-semibold text-slate-700">Pay within {request.payment_days} day(s)</span>}
                            {APPROVER_LABEL[request.approval_level] && <span className="block text-[11.5px] text-slate-500">{APPROVER_LABEL[request.approval_level]}</span>}
                          </td>
                          <td className={td}>
                            <Badge tone={tone}>{label}</Badge>
                            {request.reviewed_by_name && <span className="mt-1 block text-[11.5px] text-slate-500">{request.reviewed_by_name} · {formatDateTime(request.reviewed_at)}</span>}
                            {request.review_note && <span className="block text-[11.5px] text-slate-500">{request.review_note}</span>}
                          </td>
                          <td className={`${td} whitespace-nowrap text-right`}>
                            {iconAction(expanded ? "Hide overdue bills" : "View overdue bills", expanded ? "expand_less" : "receipt_long", "", () => setExpandedId(expanded ? null : request.id))}
                            {request.status === "approved" && request.sales_payload?.sales?.length > 0
                              && iconAction("Create the approved sales now", "add_shopping_cart", "green", () => createSales(request), creatingId === request.id)}
                            {request.status === "pending" && (
                              <>
                                {iconAction("Approve & create sales", "check_circle", "green", () => setReview({ request, action: "approve" }))}
                                {iconAction("Reject", "cancel", "red", () => setReview({ request, action: "reject" }))}
                              </>
                            )}
                            {isAdmin && request.status === "awaiting_staff" && (
                              <>
                                {iconAction("Admin approve & create sales", "check_circle", "green", () => setReview({ request, action: "approve" }))}
                                {iconAction("Reject request", "cancel", "red", () => setReview({ request, action: "reject" }))}
                              </>
                            )}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-red-50/30">
                            <td colSpan={10} className="px-4 pb-4">
                              <div className="overflow-hidden rounded-xl border border-red-200 bg-white">
                                <table className="w-full border-collapse text-[12.5px]">
                                  <thead>
                                    <tr className="bg-red-50 text-left text-[11px] font-semibold uppercase tracking-wide text-red-800">
                                      {["Invoice", "Balance", "Due", "Overdue", "Staff"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(request.overdue_details || []).map((credit) => (
                                      <tr key={credit.creditPaymentId} className="border-t border-red-100">
                                        <td className="px-3 py-1.5 font-mono font-semibold">{credit.invoiceNumber || "-"}</td>
                                        <td className="px-3 py-1.5 tabular-nums font-semibold">{money(credit.balanceAmount)}</td>
                                        <td className="px-3 py-1.5">{credit.dueDate || "-"}</td>
                                        <td className="px-3 py-1.5 font-semibold text-red-700">{credit.overdueDays} day(s)</td>
                                        <td className="px-3 py-1.5">{credit.creditStaffName || "—"}</td>
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

      <ReviewDialog
        request={review.request}
        action={review.action}
        onClose={() => setReview({ request: null, action: "approve" })}
        onDone={(_, data) => { showResult(data); load(true); }}
      />

      <Footer />
    </DashboardLayout>
  );
}

export default OverdueRequests;
