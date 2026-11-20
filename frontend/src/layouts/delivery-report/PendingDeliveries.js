// Report > Pending Deliveries tab: Tailwind CSS (no MUI). Loading, filters and PDF unchanged.
import { useCallback, useEffect, useMemo, useState } from 'react';
import ejs from 'ejs/ejs.min.js';
import PropTypes from 'prop-types';
import { invoiceValue } from 'utils/assignmentReport';
import { reportAreaName } from 'utils/areaName';
import { useSalesPolling } from 'utils/salesSync';
import { COMPANY_TYPES } from 'utils/companyTypes';
import { Field, Icon, Notice, btn, fieldClass } from 'components/tw';

const money = (value) => Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// "2026-10-14..." -> "14-10-2026"
const displayDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '—';
};
const boyName = (row) => String(row.delivery_boy_name || 'Not assigned').trim();
const companyName = (row) => String(row.company_name || 'Company not assigned').trim();

const COLUMNS = ['Sr.', 'Delivery Boy Name', 'Assignment Date', 'Company Name', 'Area', 'Invoice No.', 'Outlet Name', 'Invoice Amt'];

function reportHtml(list, { subtitle }) {
  const rows = list.map((row, index) => ({
    sr: index + 1,
    boy: boyName(row),
    date: displayDate(row.delivery_date),
    company: companyName(row),
    area: reportAreaName(row.location_name),
    invoice: String(row.invoice_number || row.id),
    outlet: row.outlet_name || '—',
    amount: money(invoiceValue(row)),
  }));
  const total = money(list.reduce((sum, row) => sum + invoiceValue(row), 0));
  return ejs.render(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Pending_Deliveries</title>
    <style>
      @page { size: A4 landscape; margin: 8mm; }
      body { font-family: Arial, sans-serif; color: #172033; font-size: 10px; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      p { color: #475569; margin: 0 0 8px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #94a3b8; padding: 4px; text-align: left; overflow-wrap: anywhere; vertical-align: top; }
      th { background: #dbeafe; }
      .sr { width: 4%; } .d { width: 9%; } .inv { width: 10%; } .amt { width: 10%; text-align: right; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      .total td { font-weight: bold; background: #dbeafe; }
      button { padding: 10px 16px; margin-bottom: 16px; cursor: pointer; }
      @media print { button, .hint { display: none; } }
    </style></head><body>
      <button onclick="window.print()">Print / Save as PDF</button>
      <p class="hint">Choose Save as PDF in the print dialog to download this report.</p>
      <h1>Pending Deliveries</h1>
      <p><%= subtitle %> · <%= rows.length %> bills · Invoice Amt: <%= total %></p>
      <table><thead><tr><th class="sr">Sr.</th><th>Delivery Boy Name</th><th class="d">Assignment Date</th><th>Company Name</th><th>Area</th><th class="inv">Invoice No.</th><th>Outlet Name</th><th class="amt">Invoice Amt</th></tr></thead>
      <tbody><% rows.forEach(function(row) { %>
        <tr><td><%= row.sr %></td><td><%= row.boy %></td><td><%= row.date %></td><td><%= row.company %></td><td><%= row.area %></td><td><%= row.invoice %></td><td><%= row.outlet %></td><td class="amt"><%= row.amount %></td></tr>
      <% }); %>
        <tr class="total"><td colspan="7">Total (<%= rows.length %> bills)</td><td class="amt"><%= total %></td></tr>
      </tbody></table>
    </body></html>`, { rows, total, subtitle });
}

export default function PendingDeliveries({ api }) {
  const [rows, setRows] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [boy, setBoy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [companyType, setCompanyType] = useState('');
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useSalesPolling(reload);

  useEffect(() => {
    fetch(`${api}/staff/companies`)
      .then(async (response) => { if (!response.ok) throw new Error('Unable to load companies.'); return response.json(); })
      .then((list) => setCompanies((Array.isArray(list) ? list : []).map((item) => ({ id: String(item.id), name: String(item.name || '').trim(), type: item.type || '' })).filter((item) => item.name).sort((a, b) => a.name.localeCompare(b.name))))
      .catch((err) => setError(err.message));
  }, [api]);

  useEffect(() => {
    if (from && to && from > to) { setError('From date must be on or before To date.'); return undefined; }
    const controller = new AbortController();
    const params = new URLSearchParams({ scope: 'pending_deliveries' });
    if (companyId) params.set('companyId', companyId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    setLoading(true);
    setError('');
    fetch(`${api}/staff/sales/by-date?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error((result && result.error) || 'Unable to load pending deliveries.');
        const seen = new Set();
        const list = (Array.isArray(result) ? result : [])
          .filter((row) => !seen.has(String(row.id)) && seen.add(String(row.id)))
          .sort((a, b) => boyName(a).localeCompare(boyName(b))
            || String(a.delivery_date || '').localeCompare(String(b.delivery_date || ''))
            || companyName(a).localeCompare(companyName(b))
            || reportAreaName(a.location_name).localeCompare(reportAreaName(b.location_name))
            || String(a.invoice_number || '').localeCompare(String(b.invoice_number || ''), undefined, { numeric: true }));
        if (!controller.signal.aborted) setRows(list);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, companyId, from, to, refresh]);

  const boys = useMemo(() => [...new Set(rows.map(boyName))].sort((a, b) => a.localeCompare(b)), [rows]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => (!boy || boyName(row) === boy)
      && (!term || [row.invoice_number, row.outlet_name, row.location_name, row.delivery_boy_name, row.company_name]
        .some((value) => String(value || '').toLowerCase().includes(term))));
  }, [rows, boy, search]);
  const total = shown.reduce((sum, row) => sum + invoiceValue(row), 0);

  const download = () => {
    setError('');
    if (!shown.length) { setError('No pending deliveries to download.'); return; }
    const company = companies.find((item) => item.id === companyId)?.name || 'All companies';
    const period = from || to ? `${from ? displayDate(from) : 'Start'} to ${to ? displayDate(to) : 'Today'}` : 'All dates';
    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) { setError('Please allow popups to download the PDF.'); return; }
    printWindow.document.open();
    printWindow.document.write(reportHtml(shown, { subtitle: [company, boy || 'All delivery boys', period].join(' · ') }));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { if (!printWindow.closed) printWindow.print(); }, 250);
  };

  const th = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const td = "border-t border-slate-100 px-3 py-2 text-[12.5px] align-top";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="m-0 text-[15px] font-semibold text-slate-900">Pending Deliveries</h3>
        <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">Bills assigned to a delivery boy or company staff that are still out for delivery. Dates filter on the assignment date; leave them empty to see every pending bill.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
        <Field label="Company type" width="w-36">
          <select
            id="pending-company-type" className={fieldClass} value={companyType}
            onChange={(event) => {
              const type = event.target.value;
              setCompanyType(type);
              if (companyId && type && companies.find((item) => item.id === companyId)?.type !== type) setCompanyId('');
            }}
          >
            <option value="">All types</option>
            {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </Field>
        <Field label="Company" width="w-48">
          <select className={fieldClass} value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">All companies</option>
            {companies.filter((item) => !companyType || item.type === companyType).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Delivery boy" width="w-48">
          <select className={fieldClass} value={boys.includes(boy) ? boy : ''} onChange={(event) => setBoy(event.target.value)}>
            <option value="">All delivery boys</option>
            {boys.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </Field>
        <Field label="Assigned from" width="w-36"><input type="date" className={fieldClass} value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="Assigned to" width="w-36"><input type="date" className={fieldClass} value={to} onChange={(event) => setTo(event.target.value)} /></Field>
        <Field label="Search" width="w-56"><input className={fieldClass} placeholder="Invoice / outlet / area" value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
        <button type="button" className={btn.outline} onClick={reload} disabled={loading}><Icon name="refresh" className="text-[18px]" />{loading ? 'Loading…' : 'Refresh'}</button>
        <button type="button" className={btn.primary} onClick={download} disabled={loading || !shown.length}><Icon name="picture_as_pdf" className="text-[18px]" />Download PDF</button>
      </div>
      {error && <div className="px-4 pt-3"><Notice tone="error">{error}</Notice></div>}
      <p className="m-0 px-4 py-2.5 text-[12.5px] text-slate-500"><b className="text-slate-800">{shown.length}</b> pending bills · Invoice amt: <b className="text-slate-800">{money(total)}</b></p>
      <div className="max-h-[60vh] overflow-auto border-t border-slate-100">
        <table className="w-full min-w-[900px] border-separate border-spacing-0">
          <thead><tr>{COLUMNS.map((label) => <th key={label} className={`${th} ${label === 'Invoice Amt' ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className={`${td} text-slate-400`}>{index + 1}</td>
                <td className={`${td} font-medium text-slate-800`}>{boyName(row)}</td>
                <td className={`${td} whitespace-nowrap`}>{displayDate(row.delivery_date)}</td>
                <td className={td}>{companyName(row)}</td>
                <td className={td}>{reportAreaName(row.location_name)}</td>
                <td className={`${td} font-mono`}>{row.invoice_number || row.id}</td>
                <td className={td}>{row.outlet_name || '—'}</td>
                <td className={`${td} whitespace-nowrap text-right font-semibold tabular-nums`}>{money(invoiceValue(row))}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-[13px] text-slate-400">{loading ? 'Loading pending deliveries…' : 'No pending deliveries.'}</td></tr>}
            {shown.length > 0 && (
              <tr className="bg-slate-50 font-bold text-slate-900">
                <td colSpan={7} className={td}>Total ({shown.length} bills)</td>
                <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{money(total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
PendingDeliveries.propTypes = { api: PropTypes.string.isRequired };
