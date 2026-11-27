import { useEffect, useMemo, useState } from "react";
import { useAuth } from "context/AuthContext";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import { downloadWorkbook } from "utils/downloadSalesExcel";

const API = process.env.REACT_APP_API_URL;
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const money = (value) => currency.format(Number(value) || 0);
const deliveryLabels = {
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
  packing_done: "Packing complete",
};
const modes = [["cash", "Cash"], ["cheque", "Cheque"], ["upi", "UPI"]];
const collectionFields = [["total", "Total collected"], ...modes];
const deliveryStatus = (bill) => Number(bill.in_suspense) === 1
  ? "Suspense" : deliveryLabels[bill.packaging_status] || "Assigned";
const assigneeKey = (bill) => bill.delivery_staff_id
  ? `staff-${bill.delivery_staff_id}` : `delivery-${bill.delivery_boy_id}`;
const assigneeRole = (bill) => bill.delivery_staff_id ? "Marketing staff" : "Delivery boy";
const assigneeLabel = (bill) => bill.delivery_boy_name || `${assigneeRole(bill)} #${bill.delivery_staff_id || bill.delivery_boy_id}`;

function paymentStatus(bill) {
  if (Number(bill.balance_amount) <= 0 && Number(bill.paid_amount) > 0) return "Paid";
  if (Number(bill.credit_count) > 0 || bill.payment_mode === "credit") {
    return Number(bill.paid_amount) > 0 ? "Partial payment · Credit" : "Credit";
  }
  return Number(bill.paid_amount) > 0 ? "Partial payment" : "Unpaid";
}

export default function TodayReport() {
  const { token } = useAuth();
  const [date, setDate] = useState(today);
  const [reload, setReload] = useState(0);
  const [assignee, setAssignee] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    const request = new AbortController();
    setReport(null);
    setError("");
    setExportError("");
    if (!date || !token) return undefined;
    fetch(`${API}/staff/reports/today?${new URLSearchParams({ date })}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: request.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load Today Report.");
        if (!request.signal.aborted) setReport({ ...body, date });
      })
      .catch((err) => {
        if (!request.signal.aborted) setError(err.message);
      });
    return () => request.abort();
  }, [date, reload, token]);

  const staff = useMemo(() => {
    const names = new Map();
    for (const bill of report?.bills || []) {
      names.set(assigneeKey(bill), `${assigneeLabel(bill)} · ${assigneeRole(bill)}`);
    }
    return [...names].sort((left, right) => left[1].localeCompare(right[1]));
  }, [report]);
  const bills = (report?.bills || []).filter((bill) => !assignee || assigneeKey(bill) === assignee);

  const exportExcel = async () => {
    if (report?.date !== date || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const assigned = workbook.addWorksheet("Assigned Bills", { views: [{ state: "frozen", ySplit: 1 }] });
      const amountFormat = "#,##0.00";
      assigned.columns = [
        { header: "Date", width: 14 },
        { header: "Bill", width: 22 },
        { header: "Company", width: 26 },
        { header: "Outlet", width: 30 },
        { header: "Assigned to", width: 24 },
        { header: "Role", width: 19 },
        { header: "Delivery status", width: 20 },
        { header: "Payment status", width: 26 },
        ...[...modes.map(([, label]) => label), "Collected on date", "Balance due"]
          .map((header) => ({ header, width: 20, style: { numFmt: amountFormat } })),
      ];
      assigned.addRows(bills.map((bill) => [
        date, String(bill.invoice_number || bill.sticker_number || `#${bill.id}`),
        bill.company_name || "", bill.outlet_name || "", assigneeLabel(bill), assigneeRole(bill),
        deliveryStatus(bill), paymentStatus(bill), ...modes.map(([key]) => Number(bill.collections[key]) || 0),
        Number(bill.collections.total) || 0, Number(bill.balance_amount) || 0,
      ]));
      assigned.getRow(1).font = { bold: true };
      assigned.autoFilter = `A1:M${assigned.rowCount}`;

      const summary = workbook.addWorksheet("Daily Collections");
      summary.columns = [
        { header: "Date", width: 14 }, { header: "Payment mode", width: 23 },
        { header: "Amount (INR)", width: 18, style: { numFmt: amountFormat } },
      ];
      summary.addRows(collectionFields.map(([key, label]) => [date, label, Number(report.collections[key]) || 0]));
      summary.getRow(1).font = { bold: true };
      summary.addRow([]);
      summary.addRow(["Includes all collections recorded on the selected date."]);
      await downloadWorkbook(workbook, `Today_Report_${date}`);
    } catch {
      setExportError("Unable to download Today Report. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <main className="py-6 text-slate-800">
        <header className="mb-5">
          <h1 className="m-0 text-2xl font-bold">Today Report</h1>
          <p className="m-0 mt-1 text-sm text-slate-500">Bill assignments, delivery progress, and collections by date.</p>
        </header>
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Report date
            <input type="date" className="input input-sm" value={date} onChange={(event) => {
              setDate(event.target.value);
              setAssignee("");
            }} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Assigned to
            <select className="select select-sm" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <option value="">All assigned staff</option>
              {staff.map(([id, name]) => <option value={id} key={id}>{name}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-outline btn-sm" disabled={!date} onClick={() => {
            setAssignee("");
            setReload((value) => value + 1);
          }}>Refresh</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={report?.date !== date || exporting} onClick={exportExcel}>
            {exporting ? "Preparing Excel…" : "Download Excel"}
          </button>
        </div>

        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        {exportError && <p role="alert" className="text-sm font-medium text-red-700">{exportError}</p>}
        {!date && <p className="text-sm text-slate-500">Choose a report date.</p>}
        {date && !report && !error && <p role="status" className="text-sm text-slate-500">Loading Today Report…</p>}
        {report && (
          <>
            <section className="mb-5" aria-labelledby="collection-heading">
              <h2 id="collection-heading" className="m-0 text-lg font-bold">Collections</h2>
              <p className="mb-3 mt-1 text-xs text-slate-500">All payments recorded on the selected date, including payments on earlier bills.</p>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {collectionFields.map(([key, label]) => (
                  <div key={key} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <dt className="text-sm text-slate-600">{label}</dt>
                    <dd className="m-0 mt-1 text-lg font-bold tabular-nums">{money(report.collections[key])}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="assigned-heading">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 id="assigned-heading" className="m-0 text-lg font-bold">Assigned bills ({bills.length})</h2>
              </div>
              {bills.length ? (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead><tr>
                      <th scope="col">Bill</th><th scope="col">Company</th><th scope="col">Outlet</th><th scope="col">Assigned to</th>
                      <th scope="col">Delivery status</th><th scope="col">Payment status</th>
                      <th scope="col" className="text-right">Collected on date</th>
                      <th scope="col" className="text-right">Balance due</th>
                    </tr></thead>
                    <tbody>
                      {bills.map((bill) => (
                        <tr key={bill.id}>
                          <th scope="row" className="whitespace-nowrap font-semibold">
                            {bill.invoice_number || bill.sticker_number || `#${bill.id}`}
                          </th>
                          <td>{bill.company_name || "—"}</td>
                          <td>{bill.outlet_name || "—"}</td>
                          <td>{assigneeLabel(bill)}<span className="block text-xs text-slate-500">{assigneeRole(bill)}</span></td>
                          <td>{deliveryStatus(bill)}</td>
                          <td>{paymentStatus(bill)}</td>
                          <td className="whitespace-nowrap text-right tabular-nums">
                            {money(bill.collections.total)}
                            {modes.map(([key, label]) => bill.collections[key] !== 0 && (
                              <span key={key} className="block text-xs text-slate-500">{label} {money(bill.collections[key])}</span>
                            ))}
                          </td>
                          <td className="whitespace-nowrap text-right tabular-nums">{money(bill.balance_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="m-0 p-4 text-sm text-slate-500">No assigned bills for this selection.</p>}
            </section>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
