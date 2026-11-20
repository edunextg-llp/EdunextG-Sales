// Approvals > Backdated Payment Approvals: Tailwind CSS (no MUI). Loading and review logic unchanged.
import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { Badge, Card, EmptyState, Icon, Notice, PageHeader, STATUS_TONE, Segmented, Spinner, btn, td, th } from "components/tw";

const API = process.env.REACT_APP_API_URL;

const modeLabels = { cash: "Cash", upi: "UPI", cheque: "Cheque", credit: "Credit" };
const formatDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
};

export default function BackdatedPaymentRequests() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/staff/backdated-payment-requests`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load backdated payment requests.");
      setRows((Array.isArray(data) ? data : []).filter((row) => status === "all" || row.status === status));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (row, action) => {
    const note = window.prompt(action === "approve" ? "Approval note (optional):" : "Rejection reason:", "");
    if (note === null || (action === "reject" && !note.trim())) return;
    try {
      const response = await fetch(`${API}/staff/backdated-payment-requests/${row.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to review this request.");
      setMessage(data.message);
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Backdated Payment Approvals"
          description="Payments with an earlier date entered by staff. The payment is added to the invoice only after approval."
          actions={(
            <button type="button" className={btn.outline} onClick={load} disabled={loading}>
              <Icon name="refresh" className="text-[18px]" />Refresh
            </button>
          )}
        />
        {message && <Notice tone="info" className="mb-4" onClose={() => setMessage("")}>{message}</Notice>}

        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <Segmented label="Status" value={status} onChange={setStatus} options={[["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]]} />
          </div>
          {loading ? (
            <div className="flex justify-center py-14"><Spinner className="size-7" /></div>
          ) : !rows.length ? (
            <EmptyState icon="task_alt" text={`No ${status === "all" ? "" : status} backdated payment requests.`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["#", "Requested", "Invoice / outlet", "Payment date", "Mode"].map((heading) => <th key={heading} className={th}>{heading}</th>)}
                    <th className={`${th} text-right`}>Amount</th>
                    <th className={th}>Status</th>
                    <th className={th} aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                      <td className={`${td} text-slate-400`}>{index + 1}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="block text-[12.5px]">{row.created_at_display}</span>
                        <span className="block text-[11.5px] text-slate-500">{row.requested_by_name || "—"}</span>
                      </td>
                      <td className={td}>
                        <span className="block font-mono text-[12.5px] font-semibold text-slate-800">{row.invoice_number}</span>
                        <span className="block text-[12px] text-slate-500">{row.outlet_name || "—"}</span>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="block">{formatDate(row.payment_date)}</span>
                        <span className="block text-[11.5px] text-slate-500">{row.action === "edit" ? "Edit of existing payment" : "New payment"}</span>
                      </td>
                      <td className={td}>
                        <Badge tone="blue">{modeLabels[row.payment_mode] || row.payment_mode}</Badge>
                        {row.reference_no && <span className="mt-1 block text-[11.5px] text-slate-500">Ref: {row.reference_no}</span>}
                        {row.payment_mode === "credit" && row.credit_days && <span className="block text-[11.5px] text-slate-500">{row.credit_days} day(s)</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap text-right font-semibold tabular-nums text-slate-900`}>₹{Number(row.amount).toFixed(2)}</td>
                        <td className={td}>
                          <Badge tone={STATUS_TONE[row.status]}><span className="capitalize">{row.status}</span></Badge>
                          {row.status !== "pending" && row.reviewed_by_name && <span className="mt-1 block text-[11.5px] text-slate-500">by {row.reviewed_by_name}</span>}
                          {row.status !== "pending" && row.review_note && <span className="block text-[11.5px] text-slate-500">{row.review_note}</span>}
                        </td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          {row.status === "pending" && (
                            <span className="inline-flex gap-1.5">
                              <button type="button" className={`${btn.primary} h-8 bg-emerald-600 px-3 hover:bg-emerald-700`} onClick={() => review(row, "approve")}>Approve</button>
                              <button type="button" className={`${btn.outline} h-8 border-red-200 px-3 text-red-700 hover:bg-red-50`} onClick={() => review(row, "reject")}>Reject</button>
                            </span>
                          )}
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <Footer />
    </DashboardLayout>
  );
}
