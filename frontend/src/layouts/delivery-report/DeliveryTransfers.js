// Report > Transfers tab: Tailwind CSS (no MUI). Loading, filters and PDF unchanged.
import { useCallback, useEffect, useMemo, useState } from 'react';
import ejs from 'ejs/ejs.min.js';
import PropTypes from 'prop-types';
import { invoiceValue } from 'utils/assignmentReport';
import { reportAreaName } from 'utils/areaName';
import { useSalesPolling } from 'utils/salesSync';
import { Badge, Field, Icon, Notice, btn, fieldClass } from 'components/tw';

const pad = (value) => String(value).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const money = (value) => Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// "2026-10-14 10:05" -> "14-10-2026 10:05"
const displayDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}${match[4]}` : '—';
};
const STATUS_LABEL = { out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' };
const STATUS_COLOR = { out_for_delivery: 'warning', delivered: 'success', cancelled: 'error', returned: 'default' };
const statusKey = (row) => String(row.packaging_status || '').trim().toLowerCase();

const COLUMNS = ['Sr.', 'Transferred On', 'From Delivery Boy', 'To Delivery Boy', 'Assignment Date', 'Company Name', 'Area', 'Invoice No.', 'Outlet Name', 'Invoice Amt', 'Reason', 'Current Status'];

function reportHtml(list, subtitle) {
  const rows = list.map((row, index) => ({
    sr: index + 1,
    at: displayDate(row.transferred_at),
    from: row.from_delivery_boy_name || '—',
    to: row.to_delivery_boy_name || '—',
    date: displayDate(row.delivery_date),
    company: row.company_name || '—',
    area: reportAreaName(row.location_name),
    invoice: String(row.invoice_number || row.sale_id),
    outlet: row.outlet_name || '—',
    amount: money(invoiceValue(row)),
    reason: row.reason || '—',
    status: STATUS_LABEL[statusKey(row)] || row.packaging_status || '—',
  }));
  const total = money(list.reduce((sum, row) => sum + invoiceValue(row), 0));
  return ejs.render(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Delivery_Transfers</title>
    <style>
      @page { size: A4 landscape; margin: 8mm; }
      body { font-family: Arial, sans-serif; color: #172033; font-size: 9.5px; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      p { color: #475569; margin: 0 0 8px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #94a3b8; padding: 4px; text-align: left; overflow-wrap: anywhere; vertical-align: top; }
      th { background: #dbeafe; }
      .sr { width: 3%; } .amt { text-align: right; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      .total td { font-weight: bold; background: #dbeafe; }
      button { padding: 10px 16px; margin-bottom: 16px; cursor: pointer; }
      @media print { button, .hint { display: none; } }
    </style></head><body>
      <button onclick="window.print()">Print / Save as PDF</button>
      <p class="hint">Choose Save as PDF in the print dialog to download this report.</p>
      <h1>Delivery Transfers</h1>
      <p><%= subtitle %> · <%= rows.length %> transfers · Invoice Amt: <%= total %></p>
      <table><thead><tr><th class="sr">Sr.</th><th>Transferred On</th><th>From Delivery Boy</th><th>To Delivery Boy</th><th>Assignment Date</th><th>Company Name</th><th>Area</th><th>Invoice No.</th><th>Outlet Name</th><th class="amt">Invoice Amt</th><th>Reason</th><th>Current Status</th></tr></thead>
      <tbody><% rows.forEach(function(row) { %>
        <tr><td><%= row.sr %></td><td><%= row.at %></td><td><%= row.from %></td><td><%= row.to %></td><td><%= row.date %></td><td><%= row.company %></td><td><%= row.area %></td><td><%= row.invoice %></td><td><%= row.outlet %></td><td class="amt"><%= row.amount %></td><td><%= row.reason %></td><td><%= row.status %></td></tr>
      <% }); %>
        <tr class="total"><td colspan="9">Total (<%= rows.length %> transfers)</td><td class="amt"><%= total %></td><td colspan="2"></td></tr>
      </tbody></table>
    </body></html>`, { rows, total, subtitle });
}

export default function DeliveryTransfers({ api }) {
  const [rows, setRows] = useState([]);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [boy, setBoy] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useSalesPolling(reload);

  useEffect(() => {
    if (from && to && from > to) { setError('From date must be on or before To date.'); return undefined; }
    const controller = new AbortController();
    const params = new URLSearchParams({ scope: 'delivery_transfers' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    setLoading(true);
    setError('');
    fetch(`${api}/staff/sales/by-date?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error((result && result.error) || 'Unable to load transfers.');
        if (!controller.signal.aborted) setRows(Array.isArray(result) ? result : []);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, from, to, refresh]);

  const boys = useMemo(() => [...new Set(rows.flatMap((row) => [row.from_delivery_boy_name, row.to_delivery_boy_name]).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => (!boy || row.from_delivery_boy_name === boy || row.to_delivery_boy_name === boy)
      && (!term || [row.invoice_number, row.outlet_name, row.location_name, row.company_name, row.reason]
        .some((value) => String(value || '').toLowerCase().includes(term))));
  }, [rows, boy, search]);
  const total = shown.reduce((sum, row) => sum + invoiceValue(row), 0);

  const download = () => {
    setError('');
    if (!shown.length) { setError('No transfers to download.'); return; }
    const period = from || to ? `${from ? displayDate(from) : 'Start'} to ${to ? displayDate(to) : 'Today'}` : 'All dates';
    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) { setError('Please allow popups to download the PDF.'); return; }
    printWindow.document.open();
    printWindow.document.write(reportHtml(shown, [boy || 'All delivery boys', period].join(' · ')));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { if (!printWindow.closed) printWindow.print(); }, 250);
  };

const TONE = { warning: "amber", success: "green", error: "red", default: "slate" };
  const th = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const td = "border-t border-slate-100 px-3 py-2 text-[12.5px] align-top";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="m-0 text-[15px] font-semibold text-slate-900">Delivery Transfers</h3>
        <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">Invoices a delivery boy transferred to another delivery boy from the app. Dates filter on the transfer date; clear both to see every transfer.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
        <Field label="Transferred from" width="w-36"><input type="date" className={fieldClass} value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="Transferred to" width="w-36"><input type="date" className={fieldClass} value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        <Field label="Delivery boy" width="w-48">
          <select className={fieldClass} value={boys.includes(boy) ? boy : ''} onChange={(event) => setBoy(event.target.value)}>
            <option value="">All delivery boys</option>
            {boys.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </Field>
        <Field label="Search" width="w-56"><input className={fieldClass} placeholder="Invoice / outlet / area" value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
        <button type="button" className={btn.outline} onClick={reload} disabled={loading}><Icon name="refresh" className="text-[18px]" />{loading ? 'Loading…' : 'Refresh'}</button>
        <button type="button" className={btn.primary} onClick={download} disabled={loading || !shown.length}><Icon name="picture_as_pdf" className="text-[18px]" />Download PDF</button>
      </div>
      {error && <div className="px-4 pt-3"><Notice tone="error">{error}</Notice></div>}
      <p className="m-0 px-4 py-2.5 text-[12.5px] text-slate-500"><b className="text-slate-800">{shown.length}</b> transfers · Invoice amt: <b className="text-slate-800">{money(total)}</b></p>
      <div className="max-h-[60vh] overflow-auto border-t border-slate-100">
        <table className="w-full min-w-[1200px] border-separate border-spacing-0">
          <thead><tr>{COLUMNS.map((label) => <th key={label} className={`${th} ${label === 'Invoice Amt' ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className={`${td} text-slate-400`}>{index + 1}</td>
                <td className={`${td} whitespace-nowrap`}>{displayDate(row.transferred_at)}</td>
                <td className={td}>{row.from_delivery_boy_name || '—'}</td>
                <td className={`${td} font-bold text-slate-900`}>{row.to_delivery_boy_name || '—'}</td>
                <td className={`${td} whitespace-nowrap`}>{displayDate(row.delivery_date)}</td>
                <td className={td}>{row.company_name || '—'}</td>
                <td className={td}>{reportAreaName(row.location_name)}</td>
                <td className={`${td} font-mono`}>{row.invoice_number || row.sale_id}</td>
                <td className={td}>{row.outlet_name || '—'}</td>
                <td className={`${td} whitespace-nowrap text-right font-semibold tabular-nums`}>{money(invoiceValue(row))}</td>
                <td className={`${td} max-w-56`}>{row.reason || '—'}</td>
                <td className={td}><Badge tone={TONE[STATUS_COLOR[statusKey(row)]] || 'slate'}>{STATUS_LABEL[statusKey(row)] || row.packaging_status || '—'}</Badge></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-[13px] text-slate-400">{loading ? 'Loading transfers…' : 'No transfers for these dates.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
DeliveryTransfers.propTypes = { api: PropTypes.string.isRequired };
