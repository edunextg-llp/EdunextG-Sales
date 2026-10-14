import { useEffect, useState } from 'react';
import ejs from 'ejs/ejs.min.js';
import PropTypes from 'prop-types';
import { Table, TableHead, TableBody, TableRow, TableCell, TableContainer, FormControl, InputLabel, Select, MenuItem, Chip, Checkbox, FormControlLabel } from '@mui/material';
import MDBox from 'components/MDBox';
import MDTypography from 'components/MDTypography';
import MDInput from 'components/MDInput';
import MDButton from 'components/MDButton';
import { invoiceValue } from 'utils/assignmentReport';
import { reportAreaName } from 'utils/areaName';

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
  const invoiceQuery = invoice.trim();

  useEffect(() => {
    fetch(`${api}/staff/companies`)
      .then(async (response) => { if (!response.ok) throw new Error('Unable to load companies.'); return response.json(); })
      .then((list) => setCompanies((Array.isArray(list) ? list : []).map((item) => ({ id: String(item.id), name: String(item.name || '').trim() })).filter((item) => item.name).sort((a, b) => a.name.localeCompare(b.name))))
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

  return <MDBox mt={2} p={2} sx={{ border: '1px solid #cbd5e1' }}>
    <MDTypography variant="h6">Delivery Report Download</MDTypography>
    <MDTypography variant="caption" display="block">Choose a company, or search one invoice number. Each bill shows its sales date, delivered / cancelled date and the total days between them. Dates filter on the delivered / cancelled date; with All statuses, bills not yet delivered are included by their sales date.</MDTypography>
    <MDBox display="flex" gap={2} alignItems="center" my={2} flexWrap="wrap">
      <FormControl size="small" sx={{ minWidth: 220 }}>
        <InputLabel id="delivery-report-company-label">Company</InputLabel>
        <Select labelId="delivery-report-company-label" label="Company" value={companyId} disabled={Boolean(invoiceQuery)} onChange={(event) => { setCompanyId(event.target.value); setError(''); }} sx={{ height: 44 }}>
          {companies.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          {!companies.length && <MenuItem disabled>No companies found</MenuItem>}
        </Select>
      </FormControl>
      <MDInput type="date" label="From" InputLabelProps={{ shrink: true }} value={from} disabled={filtersOff || allTime} onChange={(event) => setFrom(event.target.value)} />
      <MDInput type="date" label="To" InputLabelProps={{ shrink: true }} value={to} disabled={filtersOff || allTime} onChange={(event) => setTo(event.target.value)} />
      <FormControlLabel label="All time" control={<Checkbox checked={allTime} disabled={filtersOff} onChange={(event) => setAllTime(event.target.checked)} />} />
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel id="delivery-report-status-label">Status</InputLabel>
        <Select labelId="delivery-report-status-label" label="Status" value={status} disabled={filtersOff} onChange={(event) => setStatus(event.target.value)} sx={{ height: 44 }}>
          {Object.entries(STATUS_FILTERS).map(([value, { label }]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </Select>
      </FormControl>
      <MDInput label="Or invoice number" value={invoice} onChange={(event) => { setInvoice(event.target.value); setError(''); }}
        onKeyDown={(event) => { if (event.key === 'Enter') load(); }} sx={{ minWidth: 200 }} />
      <MDButton color="info" variant="outlined" onClick={load} disabled={loading || (!invoiceQuery && !companyId)}>{loading ? 'Loading…' : 'Show'}</MDButton>
      <MDButton color="success" variant="gradient" onClick={download} disabled={loading || (!invoiceQuery && !companyId)}>Download PDF</MDButton>
    </MDBox>
    {error && <MDTypography color="error" variant="body2" role="alert">{error}</MDTypography>}
    {shown && shown.length > 0 && <>
      <MDTypography variant="button" display="block" mb={1}>
        {shown.length} bills · Amount: {money(sum(shown))} · Delivered: {delivered.length} ({money(sum(delivered))}) · Cancelled: {cancelled.length} ({money(sum(cancelled))}){pending.length > 0 && ` · Not completed: ${pending.length} (${money(sum(pending))})`}
      </MDTypography>
      <TableContainer sx={{ maxHeight: '60vh' }}><Table size="small" stickyHeader sx={{ '& .MuiTableCell-root': { fontSize: '0.78rem', verticalAlign: 'top' } }}><TableHead sx={{ display: 'table-header-group' }}><TableRow>
        {COLUMNS.map((label) => <TableCell key={label} sx={{ whiteSpace: 'nowrap' }}>{label}</TableCell>)}
      </TableRow></TableHead><TableBody>
        {shown.map((row, index) => {
          const step = timeline(row);
          return <TableRow key={row.id} hover>
            <TableCell>{index + 1}</TableCell>
            <TableCell>{row.invoice_number || row.id}</TableCell>
            <TableCell>{row.outlet_name || '—'}</TableCell>
            <TableCell>{reportAreaName(row.location_name)}</TableCell>
            <TableCell>{row.staff_name || '—'}</TableCell>
            <TableCell>{row.delivery_boy_name || '—'}</TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(invoiceValue(row))}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{step.saleDate}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{step.completed}</TableCell>
            <TableCell align="center" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{step.totalDays || '—'}</TableCell>
            <TableCell><Chip size="small" variant="outlined" color={STATUS_COLOR[statusKey(row)] || 'default'} label={STATUS_LABEL[statusKey(row)] || row.packaging_status || '—'} /></TableCell>
          </TableRow>;
        })}
      </TableBody></Table></TableContainer>
    </>}
    {shown && !shown.length && !invoiceQuery && <MDTypography variant="body2">No bills match this company, dates and status.</MDTypography>}
  </MDBox>;
}
DeliveryStatusReport.propTypes = { api: PropTypes.string.isRequired };
