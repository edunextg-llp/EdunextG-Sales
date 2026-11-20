import { useCallback, useEffect, useMemo, useState } from "react";
import { MdCheck, MdClose, MdPrint, MdRefresh, MdSend, MdTaskAlt, MdVisibility } from "react-icons/md";
import { apiFetch } from "../auth";
import { ExcelButton, PageHeader, readJson, useFlash } from "../components/ui";
import { downloadExcel, fileSafe } from "../utils/excel";
import { printPurchaseRequisitionPdf, printPurchaseRequisitionsPdf } from "../utils/printPurchaseRequisitionPdf";

// Orders > Outlet Orders. Purchase requisitions that marketing staff raise for their outlets
// (e.g. SIL, EdunextG). Moved here from the main site's Approvals > Requisition Approvals; it
// uses the same API (/staff/purchase-requisitions) and the same permissions:
//   requisition_approval         approve / reject requisitions
//   requisition_target_approval  approve a day that is below the company's daily target
// One line per employee per company per day; View opens that day's requisitions.

const money = (value) =>
  Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isPending = (row) => ["open", "pending"].includes(row.status || "pending");

const payable = (row) => {
  const items = Array.isArray(row?.items) ? row.items : [];
  if (!items.length) return Number(row?.total_amount || 0) * 1.05;
  return items.reduce((total, item) => {
    const taxable = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
    return total + taxable + (taxable * (Number(item.gst_percent) || 5)) / 100;
  }, 0);
};

// Admin -> "Admin"; anyone else -> "Name (Login ID)".
const actorText = (name, loginId) => (!name ? "—" : name === "Admin" || !loginId ? name : `${name} (${loginId})`);

const ROW_CLASS = {
  invoiced: "bg-success/25",
  approved: "bg-success/10",
  cancelled: "bg-error/10",
};

const STATUS_BADGE = {
  pending: "badge-warning",
  open: "badge-warning",
  approved: "badge-success",
  invoiced: "badge-info",
  cancelled: "badge-error",
};

/** One group per employee per company per day; below the daily target = "Below Target". */
function groupRequisitionDays(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const date = row.requisition_date || String(row.created_at || "").slice(0, 10) || "unknown";
    const key = `${date}|${row.staff_id}|${row.company_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date,
        staffId: row.staff_id,
        staffName: row.staff_name,
        companyId: row.company_id,
        companyName: row.company_name,
        target: Number(row.company_daily_target) || 0,
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  });
  return [...groups.values()]
    .map((group) => {
      const active = group.rows.filter((row) => row.status !== "cancelled");
      const value = active.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0);
      return {
        ...group,
        count: group.rows.length,
        items: group.rows.reduce((sum, row) => sum + (Number(row.item_count) || 0), 0),
        quantity: group.rows.reduce((sum, row) => sum + (Number(row.total_quantity) || 0), 0),
        value,
        pending: group.rows.filter(isPending).length,
        belowTarget: group.target > 0 && value < group.target,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.staffName).localeCompare(String(b.staffName)));
}

const dayKey = (request) => `${request.request_date}|${request.staff_id}|${request.company_id}`;

function TargetBadge({ group }) {
  if (!group.target) return <span className="text-base-content/40">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-xs font-medium tabular-nums">
        ₹{money(group.value)} / ₹{money(group.target)}
      </span>
      <span className={`badge badge-sm ${group.belowTarget ? "badge-error" : "badge-success"}`}>
        {group.belowTarget ? `Short ₹${money(group.target - group.value)}` : "Target met"}
      </span>
    </span>
  );
}

/** Small modal asking for an optional note. Resolves to the text, or null when cancelled. */
function NoteDialog({ ask, onDone }) {
  const [text, setText] = useState("");
  if (!ask) return null;
  return (
    <div className="modal modal-open z-[1350]" role="dialog">
      <form
        className="modal-box max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          onDone(text);
          setText("");
        }}
      >
        <h3 className="font-semibold">{ask.title}</h3>
        {ask.text && <p className="mt-1 text-sm text-base-content/70">{ask.text}</p>}
        <textarea
          className="textarea mt-3 w-full"
          rows={3}
          maxLength={500}
          autoFocus
          placeholder="Reason (optional)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onDone(null);
              setText("");
            }}
          >
            Cancel
          </button>
          <button type="submit" className={`btn btn-sm ${ask.danger ? "btn-error" : "btn-primary"}`}>
            {ask.button}
          </button>
        </div>
      </form>
      <div className="modal-backdrop" />
    </div>
  );
}

function RequestPanel({ group, request, lastRejected, isAdmin, canApprove, canApproveBelowTarget, busy, onRequest, onReviewRequest }) {
  if (!group.belowTarget || group.pending === 0) return null;

  if (request) {
    return (
      <div className="mb-3 rounded-box border border-info/30 bg-info/10 px-3 py-2">
        <p className="text-sm font-semibold text-info">
          Below Target approval requested{request.requested_at ? ` on ${request.requested_at}` : ""}
          {isAdmin && request.requested_by_name ? ` by ${actorText(request.requested_by_name, request.requested_by_login_id)}` : ""}
        </p>
        {request.note ? <p className="text-xs text-base-content/70">Reason: {request.note}</p> : null}
        {canApproveBelowTarget ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn btn-success btn-xs" disabled={busy} onClick={() => onReviewRequest(request, "approved")}>
              Approve Request (approves all {group.pending} pending)
            </button>
            <button type="button" className="btn btn-outline btn-error btn-xs" disabled={busy} onClick={() => onReviewRequest(request, "rejected")}>
              Reject Request
            </button>
          </div>
        ) : (
          <p className="text-xs text-base-content/60">Waiting for Admin or a Below Target Approval user.</p>
        )}
      </div>
    );
  }

  if (canApproveBelowTarget || !canApprove) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-base-content/70">
        {lastRejected
          ? `The last request for this day was rejected${lastRejected.review_note ? `: ${lastRejected.review_note}` : "."} You can send it again.`
          : "You can't approve this day yourself. Send it for Below Target approval."}
      </p>
      <button type="button" className="btn btn-info btn-xs" disabled={busy} onClick={() => onRequest(group)}>
        <MdSend size={14} /> Request Below Target Approval
      </button>
    </div>
  );
}

function DayDialog({ group, onClose, canApprove, canApproveBelowTarget, onReview, isAdmin, request, lastRejected, onRequest, onReviewRequest }) {
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSelected([]), [group?.key]);

  if (!group) return null;
  const ids = group.rows.map((row) => String(row.id));
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  const blocked = group.belowTarget && !canApproveBelowTarget;
  const pendingRows = group.rows.filter(isPending);

  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]));

  const run = async (task) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };

  const review = (rowsToReview, status) => {
    if (!rowsToReview.length) return;
    const action = status === "approved" ? "approve" : "reject";
    const label = rowsToReview.length === 1 ? `requisition ${rowsToReview[0].requisition_number}` : `${rowsToReview.length} pending requisitions`;
    if (!window.confirm(`Are you sure you want to ${action} ${label}?`)) return;
    run(() => onReview(rowsToReview, status));
  };

  const headings = [
    "#", "Requisition No.", "Outlet", "Area", "Items", "Total Qty", "Value", "Total Payable", "Status",
    ...(isAdmin ? ["Approved / Rejected By"] : []), "Invoice No.", "View", ...(canApprove ? ["Action"] : []),
  ];

  return (
    <div className="modal modal-open z-[1300]" role="dialog">
      <div className="modal-box flex max-h-[90vh] w-11/12 max-w-6xl flex-col p-0">
        <div className="flex items-start justify-between gap-3 border-b border-base-300 px-5 py-3">
          <div>
            <h3 className="font-semibold">
              {group.staffName} · {group.companyName}
            </h3>
            <p className="text-xs text-base-content/60">
              {group.date} · {group.count} requisition{group.count === 1 ? "" : "s"} · Value ₹{money(group.value)}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={onClose} aria-label="Close">
            <MdClose size={18} />
          </button>
        </div>

        <div className="overflow-auto px-5 py-3">
          {group.target > 0 && (
            <div className={`mb-3 rounded-box border px-3 py-2 ${group.belowTarget ? "border-error/30 bg-error/10" : "border-success/30 bg-success/10"}`}>
              <p className={`text-sm font-semibold ${group.belowTarget ? "text-error" : "text-success"}`}>
                {group.belowTarget
                  ? `Below daily target: ₹${money(group.value)} of ₹${money(group.target)} (short ₹${money(group.target - group.value)})`
                  : `Daily target met: ₹${money(group.value)} of ₹${money(group.target)}`}
              </p>
              {blocked && (
                <p className="text-xs text-base-content/70">Approving this day needs Below Target approval. Send a request below, or reject requisitions.</p>
              )}
            </div>
          )}

          <RequestPanel
            group={group}
            request={request}
            lastRejected={lastRejected}
            isAdmin={isAdmin}
            canApprove={canApprove}
            canApproveBelowTarget={canApproveBelowTarget}
            busy={busy}
            onRequest={(day) => run(() => onRequest(day))}
            onReviewRequest={(item, status) => run(() => onReviewRequest(item, status))}
          />

          <table className="table table-sm whitespace-nowrap">
            <thead>
              <tr className="bg-base-200/60 text-base-content/70">
                <th>
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : ids)}
                    aria-label="Select all requisitions"
                  />
                </th>
                {headings.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row, index) => (
                <tr key={row.id} className={ROW_CLASS[row.status] || ""}>
                  <td>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={selected.includes(String(row.id))}
                      onChange={() => toggle(String(row.id))}
                      aria-label={`Select requisition ${row.requisition_number}`}
                    />
                  </td>
                  <td className="text-base-content/50">{index + 1}</td>
                  <td className="font-mono text-xs font-semibold">{row.requisition_number}</td>
                  <td>{row.outlet_name}</td>
                  <td className="text-xs">{row.location_name || "—"}</td>
                  <td className="tabular-nums">{row.item_count}</td>
                  <td className="tabular-nums">{Number(row.total_quantity || 0).toFixed(2)}</td>
                  <td className="tabular-nums">{money(row.total_amount)}</td>
                  <td className="font-semibold tabular-nums">{money(payable(row))}</td>
                  <td>
                    <span className={`badge badge-sm ${STATUS_BADGE[row.status || "pending"] || ""}`}>{row.status || "pending"}</span>
                  </td>
                  {isAdmin && (
                    <td className="text-xs">
                      {actorText(row.reviewed_by_name, row.reviewed_by_login_id)}
                      {row.reviewed_by_name && row.reviewed_at_label ? <div className="text-base-content/55">{row.reviewed_at_label}</div> : null}
                    </td>
                  )}
                  <td className="font-mono text-xs">{row.invoiced_invoice_number || "—"}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-xs btn-square text-info" title="View / print requisition" onClick={() => printPurchaseRequisitionPdf(row)}>
                      <MdVisibility size={16} />
                    </button>
                  </td>
                  {canApprove && (
                    <td>
                      {isPending(row) ? (
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            className="btn btn-success btn-xs btn-square"
                            disabled={busy || blocked}
                            title={blocked ? "Below target: needs Below Target Approval" : "Approve"}
                            onClick={() => review([row], "approved")}
                          >
                            <MdCheck size={14} />
                          </button>
                          <button type="button" className="btn btn-outline btn-error btn-xs btn-square" disabled={busy} title="Reject" onClick={() => review([row], "cancelled")}>
                            <MdClose size={14} />
                          </button>
                        </span>
                      ) : (
                        <MdTaskAlt size={16} className="text-success" title="Reviewed" />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 px-5 py-3">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={!selected.length}
            onClick={() => printPurchaseRequisitionsPdf(group.rows.filter((row) => selected.includes(String(row.id))))}
          >
            <MdPrint size={16} /> Print Selected ({selected.length})
          </button>
          {canApprove && (
            <span className="inline-flex gap-2">
              <button type="button" className="btn btn-outline btn-error btn-sm" disabled={busy || !pendingRows.length} onClick={() => review(pendingRows, "cancelled")}>
                Reject All Pending ({pendingRows.length})
              </button>
              <button
                type="button"
                className="btn btn-success btn-sm"
                disabled={busy || blocked || !pendingRows.length}
                title={blocked ? "Below target: needs Below Target Approval" : ""}
                onClick={() => review(pendingRows, "approved")}
              >
                {busy ? <span className="loading loading-spinner loading-xs" /> : null}
                Approve All Pending ({pendingRows.length})
              </button>
            </span>
          )}
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}

const SHOW_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "below", label: "Below Target" },
  { value: "requests", label: "Approval Requests" },
];

export default function OutletOrders({ user }) {
  const [flash, flashNode] = useFlash();
  const isAdmin = (user?.role || "admin") === "admin";
  const permissions = user?.permissions || [];
  const canApprove = isAdmin || permissions.includes("requisition_approval");
  const canApproveBelowTarget = isAdmin || permissions.includes("requisition_target_approval");

  const [rows, setRows] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [staff, setStaff] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [show, setShow] = useState("all");
  const [openKey, setOpenKey] = useState(null);
  const [ask, setAsk] = useState(null); // { title, text, button, danger, resolve }

  const askNote = (opts) => new Promise((resolve) => setAsk({ ...opts, resolve }));

  // Filters use the staff / company management APIs, which only admins may call.
  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([apiFetch("/staff/companies").then(readJson), apiFetch("/staff").then(readJson)])
      .then(([companyRows, staffRows]) => {
        setCompanies(Array.isArray(companyRows) ? companyRows : []);
        setStaff(Array.isArray(staffRows) ? staffRows : []);
      })
      .catch(() => {});
  }, [isAdmin]);

  const loadRequests = useCallback(async () => {
    try {
      const res = await apiFetch("/staff/purchase-requisitions/target-requests");
      const body = await readJson(res);
      setRequests(res.ok && Array.isArray(body.requests) ? body.requests : []);
    } catch {
      setRequests([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (staffId) params.set("staffId", staffId);
      if (companyId) params.set("companyId", companyId);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await apiFetch(`/staff/purchase-requisitions?${params}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load outlet orders.");
      setRows(Array.isArray(body.requisitions) ? body.requisitions : []);
    } catch (err) {
      setRows([]);
      flash(false, err.message);
    } finally {
      setLoading(false);
    }
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, companyId, fromDate, toDate, loadRequests]);

  useEffect(() => {
    load();
  }, [load]);

  const staffForCompany = staff.filter((row) => {
    if (!companyId) return true;
    return String(row.company_ids || row.company_id || "")
      .split(",")
      .map((id) => id.trim())
      .includes(String(companyId));
  });

  const groups = useMemo(() => groupRequisitionDays(rows), [rows]);
  const pendingRequests = useMemo(() => {
    const map = new Map();
    requests.filter((r) => r.status === "pending").forEach((r) => map.set(dayKey(r), r));
    return map;
  }, [requests]);
  const rejectedRequests = useMemo(() => {
    const map = new Map();
    // Newest first from the server, so keep the first rejected request per day.
    requests.filter((r) => r.status === "rejected").forEach((r) => {
      if (!map.has(dayKey(r))) map.set(dayKey(r), r);
    });
    return map;
  }, [requests]);

  const countFor = {
    all: groups.length,
    pending: groups.filter((g) => g.pending > 0).length,
    below: groups.filter((g) => g.belowTarget && g.pending > 0).length,
    requests: groups.filter((g) => g.pending > 0 && pendingRequests.has(g.key)).length,
  };
  const visible = groups.filter((g) =>
    show === "pending" ? g.pending > 0
      : show === "below" ? g.belowTarget && g.pending > 0
        : show === "requests" ? g.pending > 0 && pendingRequests.has(g.key)
          : true
  );
  const openGroup = groups.find((g) => g.key === openKey) || null;
  const totals = visible.reduce(
    (sum, g) => ({ count: sum.count + g.count, quantity: sum.quantity + g.quantity, value: sum.value + g.value }),
    { count: 0, quantity: 0, value: 0 }
  );

  // Excel: what is on screen (tab + filters) as three sheets: day summary, requisitions, item lines.
  const SHOW_LABEL = { all: "All", pending: "Pending", below: "Below Target", requests: "Approval Requests" };
  const exportExcel = () => {
    const companyName = companies.find((c) => String(c.id) === String(companyId))?.name || "";
    const staffName = staff.find((s) => String(s.id) === String(staffId))?.name || "";
    const rangeText = fromDate && toDate ? (fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`)
      : fromDate ? `from ${fromDate}` : toDate ? `up to ${toDate}` : "All dates";
    const filterText = [SHOW_LABEL[show], companyName, staffName, rangeText].filter(Boolean).join(" · ");
    const requisitions = visible.flatMap((g) => g.rows);
    const itemLines = requisitions.flatMap((row) =>
      (Array.isArray(row.items) ? row.items : []).map((item) => {
        const quantity = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const gst = Number(item.gst_percent) || 5;
        const taxable = quantity * rate;
        return { row, item, quantity, rate, gst, taxable, payable: taxable + (taxable * gst) / 100 };
      })
    );
    const sheets = [
      {
        name: "Day summary",
        rows: visible,
        columns: [
          { header: "Date", key: "date", width: 12, type: "date" },
          { header: "Employee", key: "staffName", width: 24 },
          { header: "Company", key: "companyName", width: 18 },
          { header: "Requisitions", key: "count", width: 12, type: "number", total: true },
          { header: "Items", key: "items", width: 8, type: "number", total: true },
          { header: "Total Qty", key: "quantity", width: 11, type: "number", total: true },
          { header: "Value", key: "value", width: 14, type: "money", total: true },
          { header: "Daily Target", value: (g) => g.target || null, width: 13, type: "money" },
          { header: "Short By", value: (g) => (g.belowTarget ? g.target - g.value : null), width: 12, type: "money" },
          { header: "Target", value: (g) => (!g.target ? "—" : g.belowTarget ? "Below target" : "Target met"), width: 13 },
          { header: "Pending", key: "pending", width: 9, type: "number", total: true },
          { header: "Approval Request", value: (g) => (g.pending > 0 && pendingRequests.has(g.key) ? "Request sent" : ""), width: 15 },
        ],
      },
      {
        name: "Requisitions",
        rows: requisitions,
        columns: [
          { header: "Date", value: (r) => r.requisition_date || String(r.created_at || "").slice(0, 10) || null, width: 12, type: "date" },
          { header: "Requisition No.", key: "requisition_number", width: 20 },
          { header: "Employee", key: "staff_name", width: 22 },
          { header: "Company", key: "company_name", width: 16 },
          { header: "Outlet", key: "outlet_name", width: 28 },
          { header: "Outlet ERP ID", key: "outlet_erp_id", width: 14 },
          { header: "Area", key: "location_name", width: 18 },
          { header: "Items", key: "item_count", width: 8, type: "number", total: true },
          { header: "Total Qty", key: "total_quantity", width: 11, type: "number", total: true },
          { header: "Value", key: "total_amount", width: 13, type: "money", total: true },
          { header: "Total Payable", value: (r) => Math.round(payable(r) * 100) / 100, width: 14, type: "money", total: true },
          { header: "Status", value: (r) => r.status || "pending", width: 11 },
          ...(isAdmin
            ? [
                { header: "Approved / Rejected By", value: (r) => (r.reviewed_by_name ? actorText(r.reviewed_by_name, r.reviewed_by_login_id) : null), width: 24 },
                { header: "Reviewed At", key: "reviewed_at_label", width: 18 },
              ]
            : []),
          { header: "Invoice No.", key: "invoiced_invoice_number", width: 20 },
        ],
      },
    ];
    if (itemLines.length) {
      sheets.push({
        name: "Items",
        rows: itemLines,
        columns: [
          { header: "Date", value: (l) => l.row.requisition_date || String(l.row.created_at || "").slice(0, 10) || null, width: 12, type: "date" },
          { header: "Requisition No.", value: (l) => l.row.requisition_number, width: 20 },
          { header: "Employee", value: (l) => l.row.staff_name, width: 22 },
          { header: "Outlet", value: (l) => l.row.outlet_name, width: 26 },
          { header: "Product", value: (l) => l.item.product_name || l.item.productName, width: 28 },
          { header: "Variant", value: (l) => l.item.variant_name || l.item.variantName, width: 24 },
          { header: "HSN", value: (l) => l.item.hsn_code || l.item.hsnCode, width: 10 },
          { header: "MRP", value: (l) => l.item.mrp, width: 10, type: "money" },
          { header: "Qty", key: "quantity", width: 9, type: "number", total: true },
          { header: "Rate", key: "rate", width: 11, type: "money" },
          { header: "Taxable", value: (l) => Math.round(l.taxable * 100) / 100, width: 13, type: "money", total: true },
          { header: "GST %", key: "gst", width: 8, type: "number" },
          { header: "Payable", value: (l) => Math.round(l.payable * 100) / 100, width: 13, type: "money", total: true },
          { header: "Status", value: (l) => l.row.status || "pending", width: 11 },
        ],
      });
    }
    return downloadExcel({
      fileName: `Outlet_Orders_${fileSafe([SHOW_LABEL[show], companyName, staffName, fromDate, toDate && toDate !== fromDate ? `to ${toDate}` : ""].filter(Boolean).join(" "))}`,
      title: `Outlet orders · ${filterText}`,
      sheets,
    });
  };

  // Approve / reject one or more requisitions from the day view.
  const reviewRequisitions = async (rowsToReview, status) => {
    const failures = [];
    for (const row of rowsToReview) {
      try {
        const res = await apiFetch(`/staff/purchase-requisitions/${row.id}/status`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const body = await readJson(res);
        if (!res.ok) failures.push(`${row.requisition_number}: ${body.error || "Unable to update."}`);
      } catch (err) {
        failures.push(`${row.requisition_number}: ${err.message || "Unable to update."}`);
      }
    }
    await load();
    if (failures.length) flash(false, failures.slice(0, 3).join(" · "));
    else flash(true, `${rowsToReview.length} requisition${rowsToReview.length === 1 ? "" : "s"} ${status === "approved" ? "approved" : "rejected"}.`);
  };

  const sendTargetRequest = async (group) => {
    const note = await askNote({
      title: "Request Below Target approval",
      text: `${group.staffName}'s ${group.companyName} requisitions on ${group.date}.`,
      button: "Send request",
    });
    if (note === null) return;
    const res = await apiFetch("/staff/purchase-requisitions/target-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffId: group.staffId, companyId: group.companyId, date: group.date, note }),
    });
    const body = await readJson(res);
    flash(res.ok, res.ok ? "Request sent." : body.error || "Unable to send the request.");
    await loadRequests();
  };

  const reviewTargetRequest = async (request, status) => {
    let note = "";
    if (status === "approved") {
      if (!window.confirm("Approve this request? All pending requisitions of that day will be approved.")) return;
    } else {
      note = await askNote({ title: "Reject Below Target request", button: "Reject request", danger: true });
      if (note === null) return;
    }
    const res = await apiFetch(`/staff/purchase-requisitions/target-requests/${request.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    const body = await readJson(res);
    if (!res.ok) flash(false, body.error || "Unable to update the request.");
    await load();
  };

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Orders" title="Outlet Orders">
        Orders (purchase requisitions) raised by marketing staff for their outlets. One line per employee per company per
        day; open View to approve, reject or print that day&apos;s requisitions.
      </PageHeader>

      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <div className="join">
            {SHOW_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`btn join-item btn-sm ${show === t.value ? "btn-primary" : "btn-outline field-border"}`}
                onClick={() => setShow(t.value)}
              >
                {t.label}
                <span className="badge badge-sm ml-1">{countFor[t.value]}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            {isAdmin && (
              <>
                <select
                  className="select select-sm w-44"
                  value={companyId}
                  onChange={(e) => {
                    setCompanyId(e.target.value);
                    setStaffId("");
                  }}
                >
                  <option value="">All companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select className="select select-sm w-48" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                  <option value="">All employees</option>
                  {staffForCompany.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.login_id ? ` (${s.login_id})` : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label className="flex flex-col gap-0.5 text-xs text-base-content/60">
              From
              <input
                type="date"
                className="input input-sm w-40"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-base-content/60">
              To
              <input
                type="date"
                className="input input-sm w-40"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>
            {(fromDate || toDate) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                }}
                title="Show all dates"
              >
                Clear
              </button>
            )}
            <ExcelButton disabled={loading || !visible.length} onExport={exportExcel} onError={(err) => flash(false, err.message || "Could not download the Excel file.")} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading} title="Reload">
              <MdRefresh size={18} />
            </button>
          </div>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center">
            <span className="loading loading-spinner loading-sm" />
          </p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">No outlet orders found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table table-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-base-200/60 text-base-content/70">
                    <th className="text-right">#</th>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Company</th>
                    <th className="text-right">Requisitions</th>
                    <th className="text-right">Items</th>
                    <th className="text-right">Total Qty</th>
                    <th className="text-right">Value</th>
                    <th>Daily Target</th>
                    <th>Pending</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((g, index) => (
                    <tr key={g.key} className={g.belowTarget && g.pending > 0 ? "bg-warning/10" : "hover:bg-base-200/50"}>
                      <td className="text-right text-base-content/50">{index + 1}</td>
                      <td className="text-xs">{g.date}</td>
                      <td className="font-medium">{g.staffName}</td>
                      <td className="text-xs">{g.companyName}</td>
                      <td className="text-right tabular-nums">{g.count}</td>
                      <td className="text-right tabular-nums">{g.items}</td>
                      <td className="text-right tabular-nums">{g.quantity.toFixed(2)}</td>
                      <td className="text-right font-semibold tabular-nums">{money(g.value)}</td>
                      <td>
                        <TargetBadge group={g} />
                      </td>
                      <td>
                        <span className="inline-flex flex-wrap gap-1">
                          {g.pending > 0 ? (
                            <span className="badge badge-warning badge-sm">{g.pending} pending</span>
                          ) : (
                            <span className="badge badge-success badge-outline badge-sm">Done</span>
                          )}
                          {g.pending > 0 && pendingRequests.has(g.key) && <span className="badge badge-info badge-sm">Request sent</span>}
                        </span>
                      </td>
                      <td className="text-right">
                        <button type="button" className="btn btn-primary btn-xs" onClick={() => setOpenKey(g.key)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-base-300 px-4 py-2 text-xs text-base-content/60">
              Total: {totals.count} requisitions · {totals.quantity.toFixed(2)} qty · Value ₹{money(totals.value)}
            </p>
          </>
        )}
      </section>

      <DayDialog
        group={openGroup}
        onClose={() => setOpenKey(null)}
        canApprove={canApprove}
        canApproveBelowTarget={canApproveBelowTarget}
        onReview={reviewRequisitions}
        isAdmin={isAdmin}
        request={openGroup ? pendingRequests.get(openGroup.key) || null : null}
        lastRejected={openGroup ? rejectedRequests.get(openGroup.key) || null : null}
        onRequest={sendTargetRequest}
        onReviewRequest={reviewTargetRequest}
      />

      <NoteDialog
        ask={ask}
        onDone={(value) => {
          ask?.resolve(value);
          setAsk(null);
        }}
      />
      {flashNode}
    </div>
  );
}
