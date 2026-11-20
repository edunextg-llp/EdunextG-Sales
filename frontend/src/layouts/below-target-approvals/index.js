// Approvals > Below Target Approvals: Tailwind CSS (no MUI). Loading, print and approve / reject logic unchanged.
import { useCallback, useEffect, useMemo, useState } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useAuth } from "context/AuthContext";
import {
  printPurchaseRequisitionPdf,
  printPurchaseRequisitionsPdf,
} from "utils/printPurchaseRequisitionPdf";
import {
  Badge, Card, EmptyState, Icon, Modal, Notice, PageHeader, STATUS_TONE, Segmented, Spinner, TriCheck, btn, td, th,
} from "components/tw";

const API = process.env.REACT_APP_API_URL;
const auth = () => {
  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const money = (value) => Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const actorText = (name, loginId) => {
  if (!name) return "—";
  return name === "Admin" || !loginId ? name : `${name} (${loginId})`;
};
const isPendingRequisition = (row) => ["open", "pending"].includes(row.status || "pending");

/** One below-target day: its requisitions, a print checklist, and Approve / Reject. */
function RequestDialog({ request, isAdmin, canDecide, onClose, onDecide }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!request) return;
    setSelected([]);
    setLoading(true);
    const params = new URLSearchParams({
      staffId: String(request.staff_id),
      companyId: String(request.company_id),
      date: request.request_date,
    });
    fetch(`${API}/staff/purchase-requisitions?${params.toString()}`, { headers: auth() })
      .then((response) => (response.ok ? response.json() : { requisitions: [] }))
      .then((data) => setRows(Array.isArray(data.requisitions) ? data.requisitions : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [request]);

  if (!request) return null;
  const ids = rows.map((row) => String(row.id));
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  const pendingCount = rows.filter(isPendingRequisition).length;
  const short = Math.max(0, request.target_amount - request.achieved_amount);

  const decide = async (status) => {
    setBusy(true);
    try {
      const done = await onDecide(request, status);
      if (done) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} size="xl" locked={busy}
      title={`${request.staff_name} · ${request.company_name}`}
      actions={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button
            type="button" className={btn.outline} disabled={!selected.length}
            onClick={() => printPurchaseRequisitionsPdf(rows.filter((row) => selected.includes(String(row.id))))}
          >
            <Icon name="print" className="text-[18px]" />Print Selected ({selected.length})
          </button>
          {canDecide && request.status === "pending" && (
            <div className="flex gap-2">
              <button type="button" className={`${btn.outline} border-red-200 text-red-700 hover:bg-red-50`} disabled={busy} onClick={() => decide("rejected")}>
                <Icon name="block" className="text-[18px]" />Reject Request
              </button>
              <button type="button" className={`${btn.primary} bg-emerald-600 hover:bg-emerald-700`} disabled={busy} onClick={() => decide("approved")}>
                <Icon name="check_circle" className="text-[18px]" />Approve ({pendingCount} pending)
              </button>
            </div>
          )}
        </div>
      )}
    >
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[["Target", request.target_amount, "text-slate-900"], ["Done", request.achieved_amount, "text-emerald-700"], ["Short", short, "text-red-700"]].map(([label, value, cls]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
            <span className={`block text-[15px] font-bold tabular-nums ${cls}`}>₹{money(value)}</span>
          </div>
        ))}
      </div>
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[12.5px] text-slate-600">
        <span className="block font-semibold text-blue-800">
          {request.request_date} · Requested on {request.requested_at}
          {isAdmin && request.requested_by_name ? ` by ${actorText(request.requested_by_name, request.requested_by_login_id)}` : ""}
        </span>
        <span className="block">Reason: {request.note || "No reason given."}</span>
        {request.status !== "pending" && (
          <span className="block">
            {request.status === "approved" ? "Approved" : "Rejected"} on {request.reviewed_at}
            {isAdmin && request.reviewed_by_name ? ` by ${actorText(request.reviewed_by_name, request.reviewed_by_login_id)}` : ""}
            {request.review_note ? ` · ${request.review_note}` : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Spinner className="size-6" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className={`${th} w-10`}>
                  <TriCheck checked={allSelected} indeterminate={!allSelected && selected.length > 0} onChange={() => setSelected(allSelected ? [] : ids)} label="Select all requisitions" />
                </th>
                {["#", "Requisition no", "Outlet", "Area", "Items", "Total qty", "Value", "Status", ""].map((heading) => (
                  <th key={heading} className={th}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className={`border-t border-slate-100 ${row.status === "cancelled" ? "bg-red-50/70" : row.status === "approved" ? "bg-emerald-50/70" : ""}`}>
                  <td className={td}>
                    <input
                      type="checkbox" className="size-4 accent-blue-600" aria-label={`Select requisition ${row.requisition_number}`}
                      checked={selected.includes(String(row.id))}
                      onChange={() => setSelected((current) => (
                        current.includes(String(row.id))
                          ? current.filter((value) => value !== String(row.id))
                          : [...current, String(row.id)]
                      ))}
                    />
                  </td>
                  <td className={`${td} text-slate-400`}>{index + 1}</td>
                  <td className={`${td} font-mono text-[12.5px] font-semibold`}>{row.requisition_number}</td>
                  <td className={`${td} font-semibold text-slate-800`}>{row.outlet_name}</td>
                  <td className={td}>{row.location_name || "—"}</td>
                  <td className={`${td} tabular-nums`}>{row.item_count}</td>
                  <td className={`${td} tabular-nums`}>{Number(row.total_quantity || 0).toFixed(2)}</td>
                  <td className={`${td} tabular-nums font-semibold`}>{money(row.total_amount)}</td>
                  <td className={td}><Badge tone={STATUS_TONE[row.status || "pending"]}>{row.status || "pending"}</Badge></td>
                  <td className={td}>
                    <button type="button" className={`${btn.icon} hover:text-blue-700`} title="View / print" aria-label="View / print" onClick={() => printPurchaseRequisitionPdf(row)}>
                      <Icon name="visibility" className="text-[18px]" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/**
 * Approvals > Below Target Approvals. Days where a staff member's requisitions are below
 * the company's daily target (e.g. SIL Rs. 11,250) and that a Requisition Approval user
 * sent for approval. Open to Admin and to logins given the "Below Target Approvals" permission.
 */
function BelowTargetApprovals() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canDecide = isAdmin || user?.permissions?.includes("requisition_target_approval");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState("pending");
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/staff/purchase-requisitions/target-requests`, { headers: auth() });
      const data = await response.json().catch(() => ({}));
      setRequests(response.ok && Array.isArray(data.requests) ? data.requests : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    pending: requests.filter((row) => row.status === "pending").length,
    approved: requests.filter((row) => row.status === "approved").length,
    rejected: requests.filter((row) => row.status === "rejected").length,
    all: requests.length,
  }), [requests]);
  const visible = show === "all" ? requests : requests.filter((row) => row.status === show);

  const decide = async (request, status) => {
    const approving = status === "approved";
    const note = approving ? "" : window.prompt("Reason for rejecting (optional):", "");
    if (note === null) return false;
    if (approving && !window.confirm(`Approve ${request.staff_name}'s ${request.company_name} requisitions on ${request.request_date}? All pending requisitions of that day will be approved.`)) {
      return false;
    }
    const response = await fetch(`${API}/staff/purchase-requisitions/target-requests/${request.id}`, {
      method: "PUT",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.error || "Unable to update the request.");
      return false;
    }
    setMessage(data.message || "Request updated.");
    await load();
    return true;
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Below Target Approvals"
          description="Days where a staff member's requisitions are below the company's daily target, sent here for approval. Approving a request approves all pending requisitions of that day."
          actions={(
            <button type="button" className={btn.outline} onClick={load} disabled={loading}>
              <Icon name="refresh" className="text-[18px]" />Refresh
            </button>
          )}
        />
        {message && <Notice tone="success" className="mb-4" onClose={() => setMessage("")}>{message}</Notice>}

        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <Segmented
              label="Show requests" value={show} onChange={setShow}
              options={[["pending", `Pending (${counts.pending})`], ["approved", `Approved (${counts.approved})`], ["rejected", `Rejected (${counts.rejected})`], ["all", `All (${counts.all})`]]}
            />
          </div>
          {loading ? (
            <div className="flex justify-center py-14"><Spinner className="size-7" /></div>
          ) : visible.length === 0 ? (
            <EmptyState icon="task_alt" text="No requests here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {[
                      "#", "Date", "Employee", "Company", "Target", "Done", "Short", "Reason", "Requested on",
                      ...(isAdmin ? ["Requested by"] : []), "Status", ...(isAdmin ? ["Reviewed by"] : []), "",
                    ].map((heading) => <th key={heading} className={th}>{heading}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((request, index) => (
                    <tr key={request.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className={`${td} text-slate-400`}>{index + 1}</td>
                      <td className={`${td} whitespace-nowrap`}>{request.request_date}</td>
                      <td className={`${td} font-semibold text-slate-800`}>{request.staff_name}</td>
                      <td className={td}>{request.company_name}</td>
                      <td className={`${td} tabular-nums`}>{money(request.target_amount)}</td>
                      <td className={`${td} tabular-nums`}>{money(request.achieved_amount)}</td>
                      <td className={`${td} tabular-nums font-semibold text-red-700`}>{money(Math.max(0, request.target_amount - request.achieved_amount))}</td>
                      <td className={`${td} max-w-56 text-[12.5px] text-slate-500`}>{request.note || "—"}</td>
                      <td className={`${td} whitespace-nowrap text-[12.5px]`}>{request.requested_at}</td>
                      {isAdmin && <td className={`${td} text-[12.5px]`}>{actorText(request.requested_by_name, request.requested_by_login_id)}</td>}
                      <td className={td}><Badge tone={STATUS_TONE[request.status]}>{request.status}</Badge></td>
                      {isAdmin && (
                        <td className={`${td} text-[12.5px]`}>
                          {request.status === "pending" ? "—" : actorText(request.reviewed_by_name, request.reviewed_by_login_id)}
                        </td>
                      )}
                      <td className={`${td} text-right`}>
                        <button type="button" className={`${btn.outline} h-8 px-3`} onClick={() => setOpen(request)}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <RequestDialog
        request={open}
        isAdmin={isAdmin}
        canDecide={canDecide}
        onClose={() => setOpen(null)}
        onDecide={decide}
      />
      <Footer />
    </DashboardLayout>
  );
}

export default BelowTargetApprovals;
