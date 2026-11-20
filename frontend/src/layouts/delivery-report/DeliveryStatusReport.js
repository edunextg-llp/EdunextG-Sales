// Report > Download Report tab: Tailwind CSS (no MUI). Loading, timeline and PDF unchanged.
import { useEffect, useState } from 'react';
import ejs from 'ejs/ejs.min.js';
import PropTypes from 'prop-types';
import { invoiceValue } from 'utils/assignmentReport';
import { reportAreaName } from 'utils/areaName';
import { COMPANY_TYPES } from 'utils/companyTypes';
import { Badge, Field, Icon, Notice, btn, fieldClass } from 'components/tw';

const pad = (value) => String(value).padStart(2, '0');
const toIso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const today = () => toIso(new Date());
const money = (value) => Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusKey = (row) => String(row.packaging_status || '').trim().toLowerCase();
const STATUS_LABEL = { delivered: 'Delivered', cancelled: 'Cancelled', out_for_delivery: 'Out for delivery', returned: 'Returned', packing_done: 'Packing done', packing: 'Packing', not_packing: 'Not packed' };
const STATUS_COLOR = { delivered: 'success', cancelled: 'error', out_for_delivery: 'warning', returned: 'default' };
const STATUS_FILTERS = {
  delivered_cancelled: { label: 'Delivered & Cancelled', keep: ['delivered', 'cancelled'] },
  delivered: { label: 'Delivered only', keep: ['delivered'] },
  cancelled: { label: 'Cancelled only', keep: ['cancelled'] },
  all: { label: 'All statuses', keep: null },
};
// "2026-10-14..." -> "14-10-2026"
const displayDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};
const dayNumber = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 : null;
};
// Whole calendar days between two dates; null when either is missing.
const daysBetween = (start, end) => {
  const a = dayNumber(start); const b = dayNumber(end);
  return a === null || b === null ? null : b - a;
};
const dayLabel = (days) => (days === null ? '' : `${days} day${days === 1 ? '' : 's'}`);

// Sales date -> delivered / cancelled date, and the total days between them.
export function timeline(row) {
  const status = statusKey(row);
  const saleDay = row.sale_day || row.sale_date;
  const completedAt = status === 'cancelled' ? row.cancelled_at : status === 'delivered' ? (row.delivered_at || row.delivery_date) : null;
  return {
    saleDate: displayDate(saleDay) || '—',
    completed: displayDate(completedAt) || '—',
    totalDays: dayLabel(daysBetween(saleDay, completedAt)),
  };
}

const COLUMNS = ['Sr.', 'Invoice No.', 'Outlet Name', 'Area', 'Staff Name', 'Delivery Boy / Staff', 'Amount', 'Sales Date', 'Delivered / Cancelled', 'Total Days', 'Status'];

function reportHtml(list, { title, period, statusLabel }) {
  const rows = list.map((row, index) => ({
    sr: index + 1,
    invoice: String(row.invoice_number || row.id),
    outlet: row.outlet_name || '—',
    area: reportAreaName(row.location_name),
    staff: row.staff_name || '—',
    deliveryBoy: row.delivery_boy_name || '—',
    amount: money(invoiceValue(row)),
    status: STATUS_LABEL[statusKey(row)] || row.packaging_status || '—',
    statusClass: statusKey(row),
    ...timeline(row),
  }));
  const total = (items) => money(items.reduce((sum, row) => sum + invoiceValue(row), 0));
  const delivered = list.filter((row) => statusKey(row) === 'delivered');
  const cancelled = list.filter((row) => statusKey(row) === 'cancelled');
  const pending = list.filter((row) => !['delivered', 'cancelled'].includes(statusKey(row)));
  const fileName = `Delivery_Report_${title}_${period}`.replace(/[^a-z0-9_-]/gi, '_');
  return ejs.render(`<!doctype html>
    <html><head><meta charset="utf-8"><title><%= fileName %></title>
    <style>
      @page { size: A4 landscape; margin: 8mm; }
      body { font-family: Arial, sans-serif; color: #172033; font-size: 9.5px; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      p { color: #475569; margin: 0 0 8px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #94a3b8; padding: 4px 4px; text-align: left; overflow-wrap: anywhere; vertical-align: top; }
      th { background: #dbeafe; }
      .sr { width: 3%; } .inv { width: 9%; } .amt { width: 7%; text-align: right; } .d { width: 9%; } .tot { width: 7%; text-align: center; font-weight: bold; } .st { width: 6%; }
      .delivered { color: #166534; font-weight: bold; } .cancelled { color: #b91c1c; font-weight: bold; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      .total td { font-weight: bold; background: #dbeafe; }
      button { padding: 10px 16px; margin-bottom: 16px; cursor: pointer; }
      @media print { button, .hint { display: none; } }
    </style></head><body>
      <button onclick="window.print()">Print / Save as PDF</button>
      <p class="hint">Choose Save as PDF in the print dialog to download this report.</p>
      <h1>Delivery Report — <%= title %></h1>
      <p><%= period %> · <%= statusLabel %> · <%= rows.length %> bills · Delivered: <%= deliveredCount %> (<%= deliveredTotal %>) · Cancelled: <%= cancelledCount %> (<%= cancelledTotal %>)<% if (pendingCount) { %> · Not completed: <%= pendingCount %> (<%= pendingTotal %>)<% } %></p>
      <table><thead><tr><th class="sr">Sr.</th><th class="inv">Invoice No.</th><th>Outlet Name</th><th>Area</th><th>Staff Name</th><th>Delivery Boy / Staff</th><th class="amt">Amount</th><th class="d">Sales Date</th><th class="d">Delivered / Cancelled</th><th class="tot">Total Days</th><th class="st">Status</th></tr></thead>
      <tbody><% rows.forEach(function(row) { %>
        <tr><td><%= row.sr %></td><td><%= row.invoice %></td><td><%= row.outlet %></td><td><%= row.area %></td><td><%= row.staff %></td><td><%= row.deliveryBoy %></td><td class="amt"><%= row.amount %></td>
          <td><%= row.saleDate %></td>
          <td class="<%= row.statusClass %>"><%= row.completed %></td>
          <td class="tot"><%= row.totalDays || '—' %></td>
          <td class="<%= row.statusClass %>"><%= row.status %></td></tr>
      <% }); %>
        <tr class="total"><td colspan="6">Total (<%= rows.length %> bills)</td><td class="amt"><%= grandTotal %></td><td colspan="4"></td></tr>
      </tbody></table>
    </body></html>`, {
    rows, title, period, statusLabel, fileName,
    grandTotal: total(list), deliveredCount: delivered.length, deliveredTotal: total(delivered),
    cancelledCount: cancelled.length, cancelledTotal: total(cancelled),
    pendingCount: pending.length, pendingTotal: total(pending),
  });
}

export default function DeliveryStatusReport({ api }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState('delivered_cancelled');
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [allTime, setAllTime] = useState(false);
  const [invoice, setInvoice] = useState('');
  const [rows, setRows] = useState(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const company = companies.find((item) => item.id === companyId)?.name || '';
  const [companyType, setCompanyType] = useState('');
  const typedCompanies = companies.filter((item) => !companyType || item.type === companyType);
  const handleCompanyTypeChange = (type) => {
    setCompanyType(type);
    if (companyId && type && companies.find((item) => item.id === companyId)?.type !== type) setCompanyId('');
  };
  const invoiceQuery = invoice.trim();

  useEffect(() => {
    fetch(`${api}/staff/companies`)
      .then(async (response) => { if (!response.ok) throw new Error('Unable to load companies.'); return response.json(); })
      .then((list) => setCompanies((Array.isArray(list) ? list : []).map((item) => ({ id: String(item.id), name: String(item.name || '').trim(), type: item.type || '' })).filter((item) => item.name).sort((a, b) => a.name.localeCompare(b.name))))
      .catch((err) => setError(err.message));
  }, [api]);

  const key = invoiceQuery ? `invoice|${invoiceQuery}` : `${companyId}|${allTime ? 'all' : `${from}|${to}`}|${status}`;
  const load = async () => {
    setError('');
    if (!invoiceQuery) {
      if (!companyId) { setError('Choose a company first, or enter an invoice number.'); return null; }
      if (!allTime && (!from || !to)) { setError('Choose both From and To dates, or tick All time.'); return null; }
      if (!allTime && from > to) { setError('From date must be on or before To date.'); return null; }
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope: 'delivery_report' });
      if (invoiceQuery) params.set('invoice', invoiceQuery);
      else {
        params.set('companyId', companyId);
        if (!allTime) { params.set('from', from); params.set('to', to); }
        const keep = STATUS_FILTERS[status].keep;
        if (keep) params.set('status', keep.join(','));
      }
      const response = await fetch(`${api}/staff/sales/by-date?${params}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error((result && result.error) || 'Unable to load the report.');
      const seen = new Set();
      const list = (Array.isArray(result) ? result : [])
        .filter((row) => !seen.has(String(row.id)) && seen.add(String(row.id)))
        .sort((a, b) => String(a.report_date || '').localeCompare(String(b.report_date || ''))
          || String(a.delivery_boy_name || '').localeCompare(String(b.delivery_boy_name || ''))
          || reportAreaName(a.location_name).localeCompare(reportAreaName(b.location_name)));
      setRows(list);
      setLoadedKey(key);
      if (invoiceQuery && !list.length) setError(`No bill found with invoice number ${invoiceQuery}.`);
      return list;
    } catch (err) {
      setError(err.message || 'Unable to load the report.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    const list = loadedKey === key && rows ? rows : await load();
    if (!list) return;
    if (!list.length) { setError(invoiceQuery ? `No bill found with invoice number ${invoiceQuery}.` : 'No bills match this company, dates and status.'); return; }
    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) { setError('Please allow popups to download the PDF.'); return; }
    printWindow.document.open();
    printWindow.document.write(reportHtml(list, invoiceQuery
      ? { title: `Invoice ${invoiceQuery}`, period: 'Invoice timeline', statusLabel: 'All statuses' }
      : { title: company, period: allTime ? 'All time' : `${displayDate(from)} to ${displayDate(to)}`, statusLabel: STATUS_FILTERS[status].label }));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { if (!printWindow.closed) printWindow.print(); }, 250);
  };

  const shown = loadedKey === key ? rows : null;
  const delivered = (shown || []).filter((row) => statusKey(row) === 'delivered');
  const cancelled = (shown || []).filter((row) => statusKey(row) === 'cancelled');
  const pending = (shown || []).filter((row) => !['delivered', 'cancelled'].includes(statusKey(row)));
  const sum = (list) => list.reduce((total, row) => total + invoiceValue(row), 0);
  const filtersOff = Boolean(invoiceQuery) || !companyId;

const TONE = { warning: "amber", success: "green", error: "red", default: "slate" };
  const th = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const td = "border-t border-slate-100 px-3 py-2 text-[12.5px] align-top";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="m-0 text-[15px] font-semibold text-slate-900">Delivery Report Download</h3>
        <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">Choose a company, or search one invoice number. Each bill shows its sales date, delivered / cancelled date and the total days between them. Dates filter on the delivered / cancelled date; with All statuses, bills not yet delivered are included by their sales date.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
        <Field label="Company type" width="w-36">
          <select id="delivery-report-company-type" className={fieldClass} value={companyType} disabled={Boolean(invoiceQuery)} onChange={(event) => handleCompanyTypeChange(event.target.value)}>
            <option value="">All types</option>
            {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </Field>
        <Field label="Company" width="w-52">
          <select className={fieldClass} value={companyId} disabled={Boolean(invoiceQuery)} onChange={(event) => { setCompanyId(event.target.value); setError(''); }}>
            <option value="" disabled>{typedCompanies.length ? 'Select company' : 'No companies found'}</option>
            {typedCompanies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="From" width="w-36"><input type="date" className={fieldClass} value={from} disabled={filtersOff || allTime} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To" width="w-36"><input type="date" className={fieldClass} value={to} disabled={filtersOff || allTime} onChange={(event) => setTo(event.target.value)} /></Field>
        <label className="flex h-10 items-center gap-2 text-[13px] font-medium text-slate-700">
          <input type="checkbox" className="size-4 accent-blue-600" checked={allTime} disabled={filtersOff} onChange={(event) => setAllTime(event.target.checked)} />All time
        </label>
        <Field label="Status" width="w-48">
          <select className={fieldClass} value={status} disabled={filtersOff} onChange={(event) => setStatus(event.target.value)}>
            {Object.entries(STATUS_FILTERS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Or invoice number" width="w-48">
          <input className={fieldClass} value={invoice} onChange={(event) => { setInvoice(event.target.value); setError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') load(); }} />
        </Field>
        <button type="button" className={btn.outline} onClick={load} disabled={loading || (!invoiceQuery && !companyId)}><Icon name="visibility" className="text-[18px]" />{loading ? 'Loading…' : 'Show'}</button>
        <button type="button" className={btn.primary} onClick={download} disabled={loading || (!invoiceQuery && !companyId)}><Icon name="picture_as_pdf" className="text-[18px]" />Download PDF</button>
      </div>
      {error && <div className="px-4 pt-3"><Notice tone="error">{error}</Notice></div>}
      {shown && shown.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 px-4 py-3 text-[12.5px]">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{shown.length} bills · {money(sum(shown))}</span>
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">Delivered: {delivered.length} ({money(sum(delivered))})</span>
            <span className="rounded-lg bg-red-50 px-2.5 py-1 font-semibold text-red-700">Cancelled: {cancelled.length} ({money(sum(cancelled))})</span>
            {pending.length > 0 && <span className="rounded-lg bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">Not completed: {pending.length} ({money(sum(pending))})</span>}
          </div>
          <div className="max-h-[60vh] overflow-auto border-t border-slate-100">
            <table className="w-full min-w-[1100px] border-separate border-spacing-0">
              <thead><tr>{COLUMNS.map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead>
              <tbody>
                {shown.map((row, index) => {
                  const step = timeline(row);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className={`${td} text-slate-400`}>{index + 1}</td>
                      <td className={`${td} font-mono`}>{row.invoice_number || row.id}</td>
                      <td className={`${td} font-medium text-slate-800`}>{row.outlet_name || '—'}</td>
                      <td className={td}>{reportAreaName(row.location_name)}</td>
                      <td className={td}>{row.staff_name || '—'}</td>
                      <td className={td}>{row.delivery_boy_name || '—'}</td>
                      <td className={`${td} whitespace-nowrap text-right font-semibold tabular-nums`}>{money(invoiceValue(row))}</td>
                      <td className={`${td} whitespace-nowrap`}>{step.saleDate}</td>
                      <td className={`${td} whitespace-nowrap`}>{step.completed}</td>
                      <td className={`${td} whitespace-nowrap text-center font-bold text-slate-900`}>{step.totalDays || '—'}</td>
                      <td className={td}><Badge tone={TONE[STATUS_COLOR[statusKey(row)]] || 'slate'}>{STATUS_LABEL[statusKey(row)] || row.packaging_status || '—'}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {shown && !shown.length && !invoiceQuery && <p className="m-0 px-4 py-10 text-center text-[13px] text-slate-400">No bills match this company, dates and status.</p>}
      {!shown && <p className="m-0 px-4 py-10 text-center text-[13px] text-slate-400">Choose a company or enter an invoice number, then press Show.</p>}
    </section>
  );
}
DeliveryStatusReport.propTypes = { api: PropTypes.string.isRequired };
