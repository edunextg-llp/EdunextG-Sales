// Report > Invoice Report.
// "Add Sales" tasks from Dashboard > Assign show here as soon as the invoice PDF is uploaded.
// Invoice PDFs uploaded on Dashboard > Assign are read for their invoice numbers (e.g.
// IN-5125-554 counts as IN5125554). Each number is checked against Add Sales: created or
// not, delivered / cancelled / returned / pending, and whether its payment is updated.
// UI: Tailwind CSS 4 + daisyUI 5 (no MUI on this page; only the shared layout still uses it).
import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import { viewAssignmentFile } from "utils/assignmentFile";

const API = process.env.REACT_APP_API_URL;

const isoDate = (date) => {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
};
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
};
const showDate = (value) => {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return d && m && y ? `${d}-${m}-${y}` : value;
};
const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COLOR = {
  not_created: { bg: "#fee2e2", fg: "#b91c1c" },
  delivered: { bg: "#dcfce7", fg: "#15803d" },
  cancelled: { bg: "#fde2e2", fg: "#991b1b" },
  returned: { bg: "#ede9fe", fg: "#6d28d9" },
  out_for_delivery: { bg: "#dbeafe", fg: "#1d4ed8" },
  packing_done: { bg: "#e0f2fe", fg: "#0369a1" },
  packing: { bg: "#fef3c7", fg: "#b45309" },
  not_packing: { bg: "#f1f5f9", fg: "#475569" },
};
// Material Icons font (already loaded by public/index.html), same icons as before.
function MaterialIcon({ name }) {
  return <span className="material-icons-round text-[20px] leading-none" aria-hidden="true">{name}</span>;
}
MaterialIcon.propTypes = { name: PropTypes.string.isRequired };

// Small coloured badge (was an MUI Chip).
const PILL_TONES = {
  grey: "bg-slate-100 text-slate-700",
  teal: "bg-[#ccfbf1] text-[#0f766e]",
  red: "bg-[#fee2e2] text-[#b91c1c]",
  green: "bg-[#dcfce7] text-[#15803d]",
  rose: "bg-[#fde2e2] text-[#991b1b]",
  sky: "bg-[#e0f2fe] text-[#0369a1]",
  violet: "bg-[#ede9fe] text-[#5b21b6]",
};
function Pill({ tone, bold, children }) {
  return <span className={`badge badge-sm whitespace-nowrap border-0 ${PILL_TONES[tone]} ${bold ? "font-bold" : ""}`}>{children}</span>;
}
Pill.propTypes = { tone: PropTypes.oneOf(Object.keys(PILL_TONES)), bold: PropTypes.bool, children: PropTypes.node.isRequired };
Pill.defaultProps = { tone: "grey", bold: false };

const statusChip = (invoice) => {
  const c = STATUS_COLOR[invoice.status] || STATUS_COLOR.not_packing;
  return (
    <span className="badge badge-sm whitespace-nowrap border-0 font-bold" style={{ backgroundColor: c.bg, color: c.fg }}>
      {invoice.statusLabel}
    </span>
  );
};

// Filter chips: [key, label, test].
const FILTERS = [
  ["all", "All", () => true],
  ["not_created", "Not created", (i) => !i.created],
  ["created", "Created", (i) => i.created],
  ["delivered", "Delivered", (i) => i.status === "delivered"],
  ["cancelled", "Cancelled", (i) => i.status === "cancelled"],
  ["returned", "Returned", (i) => i.status === "returned"],
  ["pending", "Not delivered yet", (i) => i.created && !["delivered", "cancelled", "returned"].includes(i.status)],
  ["paid", "Payment updated", (i) => i.paymentUpdated],
  ["unpaid", "Payment not updated", (i) => i.created && !i.paymentUpdated && i.status !== "cancelled"],
];
const FILTER_TEST = Object.fromEntries(FILTERS.map(([key, , test]) => [key, test]));

const SUMMARY_TILES = [
  ["total", "Invoices in PDFs", "description", "#1A73E8", "all"],
  ["created", "Created in Add Sales", "task_alt", "#0f766e", "created"],
  ["notCreated", "Not created", "error_outline", "#dc2626", "not_created"],
  ["delivered", "Delivered", "local_shipping", "#16a34a", "delivered"],
  ["cancelled", "Cancelled", "cancel", "#991b1b", "cancelled"],
  ["returned", "Returned", "keyboard_return", "#6d28d9", "returned"],
  ["pending", "Not delivered yet", "schedule", "#d97706", "pending"],
  ["paymentUpdated", "Payment updated", "payments", "#0369a1", "paid"],
];

// Auto Add Sales result of an invoice not created yet.
const AUTO_WAITING = ["needs_own", "waiting", "waiting_date"];
const AUTO_LABEL = {
  needs_own: "Waiting for own approval",
  waiting: "Waiting for approval",
  waiting_date: "Waiting for invoice date",
  failed: "Not auto-created",
  rejected: "Rejected",
};

function InvoiceReport() {
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(isoDate(new Date()));
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState({});
  const [rereading, setRereading] = useState(null);

  useEffect(() => {
    fetch(`${API}/staff/companies`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setCompanies(Array.isArray(list) ? list : list.companies || []))
      .catch(() => setCompanies([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      if (companyId) params.set("companyId", companyId);
      const res = await fetch(`${API}/staff/invoice-report?${params}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Unable to load the report.");
      setData(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, companyId]);

  useEffect(() => {
    load();
    // Load once on open; later loads use the Show button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reread = async (assignment) => {
    setRereading(assignment.id);
    try {
      const res = await fetch(`${API}/staff/invoice-report/${assignment.id}/reread`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "The PDF could not be read.");
      await load();
    } catch (err) {
      setError(`${assignment.documentName}: ${err.message}`);
    } finally {
      setRereading(null);
    }
  };

  const openPdf = (assignment) => viewAssignmentFile("admin", assignment.id).catch((err) => setError(err.message));

  const assignments = useMemo(() => data?.assignments || [], [data]);
  const totals = useMemo(() => assignments.reduce((sum, a) => {
    Object.entries(a.summary).forEach(([key, value]) => { sum[key] = (sum[key] || 0) + value; });
    return sum;
  }, {}), [assignments]);

  const words = search.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const matches = (invoice) => FILTER_TEST[filter](invoice) && words.every((w) => [
    invoice.invoiceNumber, invoice.outletName, invoice.staffName,
  ].join(" ").toUpperCase().replace(/[^A-Z0-9 ]/g, "").includes(w));

  const shown = assignments
    .map((a) => ({ ...a, rows: a.invoices.filter(matches) }))
    .filter((a) => a.rows.length || (filter === "all" && !words.length));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="py-6 text-slate-700">
        <div className="mb-5">
          <h1 className="m-0 text-2xl font-bold text-slate-800">Invoice Report</h1>
          <p className="m-0 mt-1 text-sm text-slate-500">
            Add Sales tasks from Dashboard &gt; Assign, as soon as the invoice PDF is uploaded. Invoice numbers
            read from the PDF are checked against Add Sales: created or not, delivered, cancelled, and payment updated.
            Invoices not in Add Sales yet are created automatically from the PDF (invoice no., date, outlet, amount,
            no. of items) with the Add Sales rules: only today&apos;s invoice date, and another day&apos;s bit or overdue
            credit needs approval (own permission in the assignee&apos;s portal, else a request). Not for SIL for now.
          </p>
        </div>

        {/* Filters */}
        <div className="card mb-5 bg-white shadow-md">
          <div className="flex flex-wrap items-end gap-3 p-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              From (work date)
              <input type="date" className="input input-sm w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              To
              <input type="date" className="input input-sm w-40" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              Company
              <select className="select select-sm w-52" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">All companies</option>
                {companies.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-sm btn-info text-white" onClick={load} disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-xs" /> : <MaterialIcon name="search" />}
              Show
            </button>
            <div className="grow" />
            <input
              type="search" className="input input-sm w-64" placeholder="Search invoice / outlet / staff"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {loading && (
            <p className="m-0 px-4 pb-3 text-xs text-slate-500">
              Reading the invoice PDFs. New PDFs are read once, so the first load can take a little while.
            </p>
          )}
        </div>

        {error && (
          <div role="alert" className="alert alert-error alert-soft mb-4">
            <MaterialIcon name="error_outline" />
            <span className="grow">{error}</span>
            <button type="button" className="btn btn-ghost btn-xs" aria-label="Close" onClick={() => setError("")}>
              <MaterialIcon name="close" />
            </button>
          </div>
        )}

        {data && (
          <>
            {/* Totals: click a tile to filter */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8">
              {SUMMARY_TILES.map(([key, label, icon, colour, filterKey]) => (
                <button
                  type="button" key={key} onClick={() => setFilter(filterKey)}
                  className="card cursor-pointer flex-row items-center gap-2.5 bg-white p-3 text-left"
                  style={{ border: filter === filterKey ? `2px solid ${colour}` : "1px solid #e2e8f0" }}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ backgroundColor: `${colour}1a`, color: colour }}
                  >
                    <MaterialIcon name={icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xl font-bold leading-tight text-slate-800">{totals[key] || 0}</span>
                    <span className="block text-xs leading-tight text-slate-500">{label}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5">
              {FILTERS.map(([key, label]) => (
                <button
                  type="button" key={key} onClick={() => setFilter(key)}
                  className={`badge cursor-pointer ${filter === key ? "badge-info text-white" : "badge-outline text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {!assignments.length && (
              <div role="alert" className="alert alert-info alert-soft">No Add Sales tasks with an invoice PDF were assigned for these dates.</div>
            )}
            {assignments.length > 0 && !shown.length && (
              <div role="alert" className="alert alert-info alert-soft">No invoices match this filter.</div>
            )}

            {shown.map((a) => {
              const isOpen = open[a.id] ?? true;
              return (
                <div key={a.id} className="card mb-4 border border-slate-200 bg-white">
                  <div className={`flex flex-wrap items-center gap-2.5 rounded-t-xl bg-slate-50 px-4 py-2.5 ${isOpen ? "border-b border-slate-200" : ""}`}>
                    <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setOpen((o) => ({ ...o, [a.id]: !isOpen }))}>
                      <MaterialIcon name={isOpen ? "expand_less" : "expand_more"} />
                    </button>
                    <div className="min-w-0 grow">
                      <div className="text-sm font-bold text-slate-800">
                        {a.companyName} · {showDate(a.workDate)} · {a.area}
                      </div>
                      <div className="text-xs text-slate-500">
                        {a.documentName}{a.assigneeName ? ` · Assigned to ${a.assigneeName}` : ""}
                        {a.marketingStaffName ? ` · Marketing: ${a.marketingStaffName}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Pill>{`${a.summary.total} invoices`}</Pill>
                      <Pill tone="teal">{`${a.summary.created} created`}</Pill>
                      {a.summary.notCreated > 0 && <Pill tone="red">{`${a.summary.notCreated} not created`}</Pill>}
                      <Pill tone="green">{`${a.summary.delivered} delivered`}</Pill>
                      {a.summary.cancelled > 0 && <Pill tone="rose">{`${a.summary.cancelled} cancelled`}</Pill>}
                      <Pill tone="sky">{`${a.summary.paymentUpdated} paid`}</Pill>
                      {a.summary.autoCreated > 0 && <Pill tone="violet">{`${a.summary.autoCreated} auto-created`}</Pill>}
                      {a.autoSalesOff && <span className="badge badge-sm badge-outline">Auto Add Sales off for SIL</span>}
                    </div>
                    <div className="tooltip" data-tip="Open the PDF">
                      <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => openPdf(a)}>
                        <MaterialIcon name="picture_as_pdf" />
                      </button>
                    </div>
                    <div className="tooltip" data-tip="Read the PDF again">
                      <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => reread(a)} disabled={rereading === a.id}>
                        {rereading === a.id ? <span className="loading loading-spinner loading-xs" /> : <MaterialIcon name="refresh" />}
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <>
                      {a.readError && (
                        <div role="alert" className="alert alert-warning alert-soft m-3">The PDF could not be read: {a.readError}</div>
                      )}
                      {!a.readError && !a.invoices.length && (
                        <div role="alert" className="alert alert-info alert-soft m-3">No invoice numbers were found in this PDF.</div>
                      )}
                      {a.rows.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="table table-sm">
                            <thead>
                              <tr className="bg-slate-50">
                                {["#", "Invoice no.", "Add Sales", "Sale date", "Outlet", "Staff", "Amount", "Status", "Payment", "Paid", "Balance"].map((h) => (
                                  <th key={h} className="whitespace-nowrap text-[0.72rem] font-bold text-slate-600">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="text-[0.8rem]">
                              {a.rows.map((inv, index) => (
                                <tr key={inv.invoiceNumber} className={`hover:bg-slate-50 ${!inv.created ? "bg-[#fff7f7]" : ""}`}>
                                  <td>{index + 1}</td>
                                  <td className="font-mono font-semibold">
                                    {inv.invoiceNumber}
                                    {inv.created && inv.savedAs && inv.savedAs !== inv.invoiceNumber && (
                                      <span className="block font-sans text-xs font-normal text-slate-500">saved as {inv.savedAs}</span>
                                    )}
                                  </td>
                                  <td>
                                    {inv.created ? (
                                      <Pill tone="teal" bold>{inv.duplicates > 1 ? `Created (${inv.duplicates}x)` : "Created"}</Pill>
                                    ) : (
                                      <Pill tone="red" bold>Not created</Pill>
                                    )}
                                    {inv.created && inv.autoCreated && (
                                      <span className="block text-xs font-semibold text-teal-700">Auto from PDF</span>
                                    )}
                                    {!inv.created && inv.autoError && (
                                      <span className={`block max-w-60 whitespace-normal text-xs ${AUTO_WAITING.includes(inv.autoStatus) ? "text-amber-700" : "text-red-700"}`}>
                                        {AUTO_LABEL[inv.autoStatus] || "Auto Add Sales"}: {inv.autoError}
                                      </span>
                                    )}
                                  </td>
                                  <td>{showDate(inv.saleDate)}</td>
                                  <td>{inv.outletName || ""}</td>
                                  <td>{inv.staffName || ""}</td>
                                  <td className="text-right">{inv.created ? rupees(inv.amount) : ""}</td>
                                  <td>
                                    {inv.created ? statusChip(inv) : ""}
                                    {inv.status === "cancelled" && inv.cancellationReason && (
                                      <span className="block text-xs text-slate-500">{inv.cancellationReason}</span>
                                    )}
                                    {inv.status === "delivered" && inv.deliveryDate && (
                                      <span className="block text-xs text-slate-500">on {showDate(inv.deliveryDate)}</span>
                                    )}
                                  </td>
                                  <td>
                                    {inv.created && (inv.paymentUpdated ? (
                                      <Pill tone="sky" bold>{`Updated${inv.lastPaymentDate ? ` · ${showDate(inv.lastPaymentDate)}` : ""}`}</Pill>
                                    ) : (
                                      <span className="badge badge-sm badge-outline whitespace-nowrap">Not updated</span>
                                    ))}
                                  </td>
                                  <td className="text-right">{inv.created ? rupees(inv.paidAmount) : ""}</td>
                                  <td className="text-right">{inv.created ? rupees(inv.balanceAmount) : ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {data.skippedNonPdf > 0 && (
              <p className="m-0 text-xs text-slate-500">
                {data.skippedNonPdf} uploaded file(s) are images, not PDFs, so they are not in this report.
              </p>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

export default InvoiceReport;
