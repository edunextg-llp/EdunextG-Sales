// Assign Task (documents assigned to me): Tailwind CSS (no MUI). Loading, print / save and mark done / cancel unchanged.
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { downloadAssignmentFile, printAssignmentFile, viewAssignmentFile } from "utils/assignmentFile";
import { Badge, Card, Icon, Notice, PageHeader, Segmented, StatBox, btn, td, th } from "components/tw";

const API = process.env.REACT_APP_API_URL;
const REFRESH_MS = 60 * 1000;
export const ASSIGNMENTS_CHANGED_EVENT = "document-assignments-changed";
const authHeaders = (extra = {}) => ({ Authorization: `Bearer ${localStorage.getItem("token")}`, ...extra });

// Status badge: [label, tone].
const STATUS = {
  assigned: ["Pending", "amber"],
  done: ["Done", "green"],
  cancelled: ["Cancelled", "red"],
};
const TYPE_LABEL = { pending: "Pending", printing: "Printing", add_sales: "Add Sales", pending_works: "Pending Works", others: "Others" };
function AssignTask() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("assigned");
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/my-document-assignments`, { headers: authHeaders() });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || "Unable to load assigned tasks.");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to load assigned tasks." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener(ASSIGNMENTS_CHANGED_EVENT, load);
    return () => { clearInterval(timer); window.removeEventListener(ASSIGNMENTS_CHANGED_EVENT, load); };
  }, [load]);

  const counts = useMemo(() => rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}), [rows]);
  const visible = useMemo(() => (tab === "all" ? rows : rows.filter((r) => r.status === tab)), [rows, tab]);

  const [fileBusy, setFileBusy] = useState(null);
  const handleFile = async (item, action) => {
    setFileBusy(`${item.id}:${action}`);
    setMessage(null);
    try {
      if (action === "print") await printAssignmentFile("mine", item.id);
      else if (action === "save") await downloadAssignmentFile("mine", item.id);
      else await viewAssignmentFile("mine", item.id);
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to open the document." });
    } finally {
      setFileBusy(null);
    }
  };

  const update = async (item, status) => {
    if (status === "cancelled" && !window.confirm(`Cancel this task?\n\n"${item.document_name}" will be marked as Cancelled and the admin will see it.`)) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      const res = await fetch(`${API}/my-document-assignments/${item.id}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to update task.");
      setRows((list) => list.map((r) => (r.id === item.id ? { ...r, status, completed_at: new Date().toISOString() } : r)));
      setMessage({ type: "success", text: status === "done" ? "Task marked as done." : "Task cancelled." });
      window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED_EVENT));
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to update task." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Assign Task"
          description="Documents assigned to you by the admin. Print or save them, then mark them as done."
          actions={(
            <button type="button" className={btn.outline} onClick={() => { setLoading(true); load(); }}>
              <Icon name="refresh" className="text-[18px]" />Refresh
            </button>
          )}
        />
        <div className="mb-5 flex flex-wrap gap-2">
          <StatBox label="Pending" value={counts.assigned || 0} icon="pending_actions" />
          <StatBox label="Done" value={counts.done || 0} icon="task_alt" />
          <StatBox label="Cancelled" value={counts.cancelled || 0} icon="block" />
          <StatBox label="Total" value={rows.length} icon="assignment_ind" />
        </div>
        {message && <Notice tone={message.type === "error" ? "error" : "success"} className="mb-4" onClose={() => setMessage(null)}>{message.text}</Notice>}

        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <Segmented
              label="Tasks" value={tab} onChange={setTab}
              options={[["assigned", `Pending (${counts.assigned || 0})`], ["done", `Done (${counts.done || 0})`], ["cancelled", `Cancelled (${counts.cancelled || 0})`], ["all", `All (${rows.length})`]]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {["#", "Date", "Document", "Type", "Company / area", "Marketing person", "Remarks", "Status"].map((label) => <th key={label} className={`${th} whitespace-nowrap`}>{label}</th>)}
                  <th className={`${th} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item, index) => {
                  const [statusLabel, tone] = STATUS[item.status] || STATUS.assigned;
                  const open = item.status === "assigned";
                  const busy = busyId === item.id;
                  return (
                    <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className={`${td} text-slate-400`}>{index + 1}</td>
                      <td className={`${td} whitespace-nowrap`}>{String(item.work_date).slice(0, 10)}</td>
                      <td className={`${td} max-w-64`}>
                        <a
                          href="#view" title={item.document_name || ""} onClick={(e) => { e.preventDefault(); handleFile(item, "view"); }}
                          className="flex items-center gap-1.5 font-semibold text-blue-700 hover:underline"
                        >
                          <Icon name="description" className="text-[17px] shrink-0" />
                          <span className="truncate">{item.document_name}</span>
                        </a>
                      </td>
                      <td className={td}><Badge tone="slate">{TYPE_LABEL[item.assignment_type] || item.assignment_type || "—"}</Badge></td>
                      <td className={td}>{item.company_name || "—"}{item.area ? ` · ${item.area}` : ""}</td>
                      <td className={td}>{item.marketing_staff_name || "—"}</td>
                      <td className={`${td} max-w-56 whitespace-pre-wrap break-words text-[12.5px] text-slate-500`}>{item.remarks || "—"}</td>
                      <td className={td}><Badge tone={tone}>{statusLabel}</Badge></td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        <span className="inline-flex gap-0.5">
                          <button type="button" className={btn.icon} title="Print" aria-label="Print" disabled={Boolean(fileBusy)} onClick={() => handleFile(item, "print")}><Icon name="print" className="text-[19px]" /></button>
                          <button type="button" className={btn.icon} title="Save document" aria-label="Save document" disabled={Boolean(fileBusy)} onClick={() => handleFile(item, "save")}><Icon name="download" className="text-[19px]" /></button>
                          {open && (
                            <>
                              <button type="button" className={`${btn.icon} text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700`} title="Mark done" aria-label="Mark done" disabled={busy} onClick={() => update(item, "done")}><Icon name="check_circle" className="text-[20px]" /></button>
                              <button type="button" className={`${btn.icon} text-red-500 hover:bg-red-50 hover:text-red-600`} title="Cancel task" aria-label="Cancel task" disabled={busy} onClick={() => update(item, "cancelled")}><Icon name="cancel" className="text-[20px]" /></button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!visible.length && (
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center text-[13px] text-slate-400">
                      {loading ? "Loading…" : tab === "assigned" ? "No pending tasks. You're all caught up." : "Nothing to show here."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Footer />
    </DashboardLayout>
  );
}

export default AssignTask;
