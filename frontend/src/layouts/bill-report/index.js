import { Fragment, useCallback, useEffect, useState } from "react";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";

const API = process.env.REACT_APP_API_URL;
const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => formatDate(new Date());
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return formatDate(d); };

const statuses = [
  ["No add sales", "#fb8585", "Invoice not entered in Add Sales"], ["Add sales", "#6c7400", "Bill added"],
  ["Packing", "#0794c7", "Bill being packed"], ["Delivery", "#e456db", "Out for delivery"],
  ["Out of delivery", "#f18b61", "Delivery completed"], ["Cancel the material", "#a1a1a1", "Bill cancelled"],
  ["Payment credit", "#242424", "Credit payment recorded"], ["Payment done", "#18810a", "Bill fully paid"],
  ["Suspense", "#fa5a5c", "Bill is in suspense"], ["Delivery done but not update payment", "#995700", "Delivered; payment still due"],
];
function getStatus(sale) {
  if (Number(sale.in_suspense) === 1) return 8;
  if (sale.packaging_status === "cancelled") return 5;
  if (sale.packaging_status === "delivered") return Number(sale.balance_amount) <= 0 ? 7 : 9;
  if (["out_for_delivery", "returned", "packing_done"].includes(sale.packaging_status)) return 3;
  if (sale.packaging_status === "packing") return 2;
  if (Number(sale.balance_amount) <= 0 && Number(sale.payment_count) > 0) return 7;
  if (sale.payment_mode === "credit") return 6;
  return 1;
}

export default function BillReport() {
  const [from, setFrom] = useState("2026-05-26"); const [to, setTo] = useState(today());
  const [companyId, setCompanyId] = useState(""); const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState(""); const [stepFilter, setStepFilter] = useState("all");
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); const [open, setOpen] = useState({});
  const [paymentHistory, setPaymentHistory] = useState({}); const [paymentLoading, setPaymentLoading] = useState({});
  useEffect(() => {
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    fetch(`${API}/staff/companies`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (response) => {
        const body = await response.json().catch(() => []);
        if (!response.ok) throw new Error("Unable to load companies.");
        setCompanies(Array.isArray(body) ? body : body.companies || []);
      })
      .catch(() => setCompanies([]));
  }, []);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ scope: "bill_report", from, to });
      if (companyId) params.set("companyId", companyId);
      const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
      const response = await fetch(`${API}/staff/sales/by-date?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = await response.json().catch(() => []);
      if (!response.ok) throw new Error(body.error || "Unable to load bill report.");
      setRows(Array.isArray(body) ? body : []);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [from, to, companyId]);
  useEffect(() => { void load(); }, [load]);
  const toggleBill = async (sale) => {
    const isOpen = Boolean(open[sale.id]);
    setOpen(isOpen ? {} : { [sale.id]: true });
    if (!isOpen && !paymentHistory[sale.id] && !paymentLoading[sale.id]) {
      setPaymentLoading((previous) => ({ ...previous, [sale.id]: true }));
      try {
        const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
        const response = await fetch(`${API}/staff/sales/${sale.id}/payments`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load payment history.");
        setPaymentHistory((previous) => ({ ...previous, [sale.id]: body }));
      } catch (err) {
        setPaymentHistory((previous) => ({ ...previous, [sale.id]: { error: err.message, payments: [] } }));
      } finally { setPaymentLoading((previous) => ({ ...previous, [sale.id]: false })); }
    }
  };
  const visibleRows = rows.filter((sale) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [sale.invoice_number, sale.sticker_number, sale.outlet_name, sale.staff_name, sale.company_name]
      .some((value) => String(value || "").toLowerCase().includes(query));
    return matchesSearch && (stepFilter === "all" || String(getStatus(sale)) === stepFilter);
  });

  return <DashboardLayout><DashboardNavbar /><main className="py-6 text-slate-800">
    <header className="mb-5"><h1 className="m-0 text-2xl font-bold">Bill Report</h1><p className="m-0 mt-1 text-sm text-slate-500">Bills and their Add Sales, packing, delivery, and payment progress.</p></header>
    <section className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow">
      <label className="flex flex-col gap-1 text-xs text-slate-500">From<input className="input input-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">To<input className="input input-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">Company<select className="select select-sm min-w-48" value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}</select></label>
      <label className="flex flex-col gap-1 text-xs text-slate-500">Step filter<select className="select select-sm min-w-48" value={stepFilter} onChange={(e) => setStepFilter(e.target.value)}><option value="all">All steps</option>{statuses.map(([label], index) => <option key={label} value={String(index)}>{label}</option>)}</select></label>
      <label className="flex min-w-56 flex-col gap-1 text-xs text-slate-500">Search bills<input className="input input-sm" type="search" placeholder="Bill number, outlet, employee…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <button type="button" className="btn btn-sm btn-primary" onClick={load} disabled={loading}>{loading ? "Loading…" : "Show report"}</button><span className="ml-auto text-sm text-slate-500">{visibleRows.length} of {rows.length} bills</span>
    </section>
    {error && <div role="alert" className="alert alert-error mb-4">{error}</div>}
    <section className="overflow-hidden rounded-lg bg-white shadow"><div className="overflow-x-auto"><table className="table table-sm">
      <thead><tr><th>SR</th><th>Bill No</th><th>Date</th><th>Outlet</th><th>Status</th><th>Payment</th><th>View</th></tr></thead>
      <tbody>{!visibleRows.length && <tr><td colSpan="7" className="py-8 text-center text-slate-500">{loading ? "Loading bills…" : "No bills match these filters."}</td></tr>}
        {visibleRows.map((sale, index) => { const [label, color] = statuses[getStatus(sale)]; const expanded = Boolean(open[sale.id]);
          const delivered = sale.packaging_status === "delivered"; const packed = Boolean(sale.packed_by_name || sale.packing_done_at || ["packing_done", "out_for_delivery", "delivered", "returned"].includes(sale.packaging_status));
          const assigned = Boolean(sale.delivery_boy_name || sale.delivery_staff_id || sale.delivery_boy_id);
          const paid = Number(sale.balance_amount) <= 0 && (Number(sale.payment_count) > 0 || Number(sale.paid_amount) > 0);
          const steps = [
            ["Add Sales", sale.staff_name || "Employee not recorded", sale.sale_day || sale.sale_date, true],
            ["Packing", sale.packed_by_name || "Not recorded", sale.packing_done_at || sale.packing_at, packed],
            ["Delivery assigned", sale.delivery_boy_name || "Not assigned", "", assigned],
            ["Delivered", sale.delivery_boy_name || "Pending", sale.delivered_at || "", delivered],
            ["Payment", paid ? "Payment complete" : `${Number(sale.payment_count) || 0} entries · Balance ₹${Number(sale.balance_amount || 0).toLocaleString("en-IN")}`, "", paid],
          ];
          return <Fragment key={sale.id}>
          <tr style={{ backgroundColor: `${color}22` }}><td>{String(index + 1).padStart(2, "0")}</td><td className="font-semibold">{sale.invoice_number || sale.sticker_number || `#${sale.id}`}</td><td>{sale.sale_day || sale.sale_date || "—"}</td><td>{sale.outlet_name || "—"}</td><td><span className="badge border-0 text-white" style={{ backgroundColor: color }}>{label}</span></td><td>{Number(sale.payment_count) > 0 || Number(sale.paid_amount) > 0 ? <span className="badge badge-success badge-outline">Updated</span> : <span className="text-xs text-slate-500">Not updated</span>}</td><td><button type="button" className="btn btn-ghost btn-xs" aria-expanded={expanded} onClick={() => toggleBill(sale)}>{expanded ? "Hide details" : "View details"}</button></td></tr>
          {expanded && <tr><td colSpan="7" className="bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="m-0 text-base font-bold text-slate-800">Bill progress</p><p className="m-0 mt-0.5 text-xs text-slate-500">{sale.company_name || "Company not recorded"}{sale.outlet_name ? ` · ${sale.outlet_name}` : ""}</p></div><span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: color }}>{label}</span></div>
            <div className="grid gap-2 md:grid-cols-5">{steps.map(([title, person, date, complete], stepIndex) => <div key={title} className={`relative rounded-lg border p-3 ${complete ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
              <div className="mb-2 flex items-center gap-2"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${complete ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>{complete ? "✓" : stepIndex + 1}</span><span className="text-xs font-bold text-slate-800">{title}</span></div>
              <p className="m-0 text-xs font-medium text-slate-700">{person}</p><p className="m-0 mt-1 text-[11px] text-slate-500">{date || (complete ? "Completed" : "Pending")}</p>
            </div>)}</div>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><div><h3 className="m-0 text-sm font-bold text-slate-800">Payment history</h3><p className="m-0 mt-0.5 text-xs text-slate-500">All payment and credit entries recorded for this bill</p></div>{paymentHistory[sale.id]?.summary && <span className="text-xs text-slate-600">Paid ₹{Number(paymentHistory[sale.id].summary.paidAmount || 0).toLocaleString("en-IN")} · Balance ₹{Number(paymentHistory[sale.id].summary.balanceAmount || 0).toLocaleString("en-IN")}</span>}</div>
              {paymentLoading[sale.id] ? <p className="m-0 px-4 py-5 text-sm text-slate-500">Loading payment history…</p> : paymentHistory[sale.id]?.error ? <p role="alert" className="m-0 px-4 py-5 text-sm text-red-600">{paymentHistory[sale.id].error}</p> : (paymentHistory[sale.id]?.payments || []).length ? <div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Collected by</th><th>Reference</th></tr></thead><tbody>{paymentHistory[sale.id].payments.map((payment) => <tr key={payment.id}><td>{payment.payment_date || "—"}</td><td className="capitalize">{payment.parent_credit_payment_id ? `Credit collection · ${payment.payment_mode}` : payment.payment_mode === "credit" ? "Credit given" : payment.payment_mode}</td><td>₹{Number(payment.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td><td>{payment.collector_name || payment.collector_staff_name || "—"}</td><td>{payment.reference_no || payment.cash_details || "—"}</td></tr>)}</tbody></table></div> : <p className="m-0 px-4 py-5 text-sm text-slate-500">No payment history recorded for this bill.</p>}
            </div>
          </td></tr>}</Fragment>; })}
      </tbody></table></div></section>
  </main></DashboardLayout>;
}
