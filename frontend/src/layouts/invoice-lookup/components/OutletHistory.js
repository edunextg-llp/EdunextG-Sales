// Every invoice of one outlet, with totals (Invoice Lookup): Tailwind CSS (no MUI). Loading and expand logic unchanged.
import { Fragment, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Badge, Card, Icon } from "components/tw";

import InvoiceDetails from "./InvoiceDetails";
import {
  API,
  PAYMENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  fetchJson,
  formatCurrency,
  formatDate,
} from "../format";

// format.js status colours (MUI names) -> Badge tones.
const TONE = { default: "slate", warning: "amber", info: "blue", primary: "violet", success: "green", error: "red", secondary: "slate" };

const COLUMN_COUNT = 11;

function SummaryTile({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`block text-[18px] font-bold tabular-nums ${tone || "text-slate-900"}`}>{value}</span>
    </div>
  );
}
SummaryTile.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.node.isRequired, tone: PropTypes.string };
SummaryTile.defaultProps = { tone: "" };

function ExpandedInvoice({ entry }) {
  if (!entry || entry.loading) {
    return <div className="my-3 h-1 overflow-hidden rounded bg-blue-100"><div className="h-full w-1/3 animate-pulse bg-blue-600" /></div>;
  }
  if (entry.error) {
    return <p className="m-0 py-3 text-[13px] font-medium text-red-700">{entry.error}</p>;
  }
  return <InvoiceDetails details={entry.data} embedded />;
}
ExpandedInvoice.propTypes = { entry: PropTypes.object };
ExpandedInvoice.defaultProps = { entry: null };

// Every invoice of one outlet (all counters sharing its ERP ID), with totals.
// Full invoice details are loaded only when a row is opened.
function OutletHistory({ outletKey, currentSaleId = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set());
  const [details, setDetails] = useState({});

  useEffect(() => {
    if (!outletKey) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    setExpanded(new Set());
    setDetails({});
    setFilter("all");

    fetchJson(`${API}/staff/sales/lookup/outlet-invoices?outletKey=${encodeURIComponent(outletKey)}`, controller.signal)
      .then(setData)
      .catch((fetchError) => {
        if (fetchError.name === "AbortError") return;
        console.error("Outlet invoice history failed:", fetchError);
        setError(fetchError.message || "Failed to load outlet invoices.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [outletKey]);

  const loadDetails = async (saleId) => {
    setDetails((prev) => ({ ...prev, [saleId]: { loading: true } }));
    try {
      const result = await fetchJson(`${API}/staff/sales/lookup?saleId=${saleId}`);
      const entry = result.results?.[0];
      setDetails((prev) => ({
        ...prev,
        [saleId]: entry ? { data: entry } : { error: "Invoice details not found." },
      }));
    } catch (fetchError) {
      setDetails((prev) => ({ ...prev, [saleId]: { error: fetchError.message || "Failed to load invoice." } }));
    }
  };

  const toggleRow = (saleId) => {
    const opening = !expanded.has(saleId);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (opening) next.add(saleId);
      else next.delete(saleId);
      return next;
    });
    if (opening && (!details[saleId] || details[saleId].error)) loadDetails(saleId);
  };

  if (loading) {
    return (
      <Card className="mb-5">
        <div className="px-5 py-4">
          <p className="m-0 mb-2 text-[13px] text-slate-500">Loading outlet invoices...</p>
          <div className="h-1 overflow-hidden rounded bg-blue-100"><div className="h-full w-1/3 animate-pulse bg-blue-600" /></div>
        </div>
      </Card>
    );
  }
  if (error) {
    return <Card className="mb-5"><p className="m-0 px-5 py-4 text-[13px] font-medium text-red-700">{error}</p></Card>;
  }
  if (!data) return null;

  const { outlet, invoices, summary } = data;
  // outlet_names can be empty for outlets saved without a name.
  const names = String(outlet.outlet_names || "").split(" | ").filter(Boolean);
  const isUnpaid = (invoice) => invoice.packaging_status !== "cancelled" && Number(invoice.balance_amount) > 0;
  const visibleInvoices = invoices.filter((invoice) => {
    if (filter === "unpaid") return isUnpaid(invoice);
    if (filter === "paid") return invoice.packaging_status !== "cancelled" && !isUnpaid(invoice);
    return true;
  });

  return (
    <Card className="mb-5">
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon name="storefront" className="text-[24px]" /></span>
        <div className="min-w-0 grow">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[17px] font-bold text-slate-900">{names[0] || "Unnamed outlet"}</h3>
            <span className="rounded-md border border-slate-200 px-1.5 py-0.5 font-mono text-[11.5px] text-slate-600">ERP {outlet.outlet_erp_id}</span>
          </div>
          {names.length > 1 && <p className="m-0 text-[12px] text-slate-500">Also saved as: {names.slice(1).join(", ")}</p>}
          <p className="m-0 mt-1 text-[12.5px] text-slate-600">
            {[
              outlet.locations && `Area: ${outlet.locations}`,
              outlet.staff_names && `Staff: ${outlet.staff_names}`,
              outlet.contacts && `Contact: ${outlet.contacts}`,
              outlet.visit_days && `Visit: ${outlet.visit_days}`,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryTile label="Total bills" value={summary.invoiceCount} />
        <SummaryTile label="Total billed" value={formatCurrency(summary.billed)} />
        <SummaryTile label="Total paid" value={formatCurrency(summary.paid)} tone="text-emerald-700" />
        <SummaryTile label="Outstanding" value={formatCurrency(summary.outstanding)} tone={summary.outstanding > 0 ? "text-red-700" : "text-emerald-700"} />
        <SummaryTile label="Unpaid bills" value={summary.unpaidCount} tone={summary.unpaidCount ? "text-red-700" : ""} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
        <div>
          <h4 className="m-0 text-[14px] font-semibold text-slate-900">{currentSaleId ? "All Invoices of this Outlet" : "Invoices"}</h4>
          <p className="m-0 text-[12px] text-slate-500">
            Click a row to see its full journey and payment history.
            {summary.cancelledCount > 0 && ` Cancelled bills (${summary.cancelledCount}) are not counted in the totals.`}
          </p>
        </div>
        <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Invoice filter">
          {[["all", `All (${invoices.length})`], ["unpaid", `Unpaid (${summary.unpaidCount})`], ["paid", "Paid"]].map(([value, text]) => (
            <button
              key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${filter === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {visibleInvoices.length === 0 ? (
        <p className="m-0 px-5 py-10 text-center text-[13px] text-slate-400">No invoices to show.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr>
                <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-12" />
                {["Date", "Invoice no", "Company", "Staff", "Status"].map((h) => <th key={h} className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>)}
                <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-right">Bill</th>
                <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-right">Paid</th>
                <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-right">Balance</th>
                <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last payment</th>
                <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mode</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map((invoice) => {
                const isCurrent = Number(invoice.id) === Number(currentSaleId);
                const isOpen = expanded.has(invoice.id);
                const paid = Number(invoice.paid_amount) || 0;
                const balance = Number(invoice.balance_amount) || 0;
                const cancelled = invoice.packaging_status === "cancelled";
                return (
                  <Fragment key={invoice.id}>
                    <tr
                      onClick={isCurrent ? undefined : () => toggleRow(invoice.id)}
                      className={`${isCurrent ? "bg-blue-50" : "cursor-pointer hover:bg-slate-50"} ${cancelled ? "opacity-60" : ""}`}
                    >
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700">
                        {isCurrent ? <Badge tone="blue">Viewing</Badge> : (
                          <span aria-label={isOpen ? "Hide invoice" : "Show invoice"} className="inline-flex size-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                            <Icon name={isOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"} className="text-[20px]" />
                          </span>
                        )}
                      </td>
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 whitespace-nowrap">{formatDate(invoice.sale_date)}</td>
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 whitespace-nowrap font-mono font-semibold text-slate-900">{invoice.invoice_number}</td>
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700">{invoice.company_name || "—"}</td>
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700">{invoice.staff_name || "—"}</td>
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700"><Badge tone={TONE[STATUS_COLORS[invoice.packaging_status]] || "slate"}>{STATUS_LABELS[invoice.packaging_status] || invoice.packaging_status}</Badge></td>
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 whitespace-nowrap text-right tabular-nums">{formatCurrency(paid + balance)}</td>
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 whitespace-nowrap text-right tabular-nums text-emerald-700">{formatCurrency(paid)}</td>
                      <td className={`border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 whitespace-nowrap text-right font-bold tabular-nums ${balance > 0 && !cancelled ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(balance)}</td>
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 whitespace-nowrap">
                        {invoice.last_payment_date ? formatDate(invoice.last_payment_date) : "—"}
                        {Number(invoice.payment_count) > 0 && (
                          <span className="block text-[11px] text-slate-500">{invoice.payment_count} entr{Number(invoice.payment_count) === 1 ? "y" : "ies"}</span>
                        )}
                      </td>
                      <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700">
                        {PAYMENT_LABELS[invoice.payment_mode] || invoice.payment_mode || "—"}
                        {invoice.credit_days ? ` · ${invoice.credit_days}d` : ""}
                      </td>
                    </tr>
                    {!isCurrent && isOpen && (
                      <tr>
                        <td colSpan={COLUMN_COUNT} className="border-t border-slate-100 bg-slate-50 px-4 pb-1 pt-4">
                          <ExpandedInvoice entry={details[invoice.id]} />
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
  );
}

OutletHistory.propTypes = { outletKey: PropTypes.string.isRequired, currentSaleId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]) };
OutletHistory.defaultProps = { currentSaleId: null };

export default OutletHistory;
