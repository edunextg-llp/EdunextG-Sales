import { useCallback, useEffect, useMemo, useState } from 'react';
import ejs from 'ejs/ejs.min.js';
import PropTypes from 'prop-types';
import { Table, TableHead, TableBody, TableRow, TableCell, TableContainer, FormControl, InputLabel, Select, MenuItem, Chip } from '@mui/material';
import MDBox from 'components/MDBox';
import MDTypography from 'components/MDTypography';
import MDInput from 'components/MDInput';
import MDButton from 'components/MDButton';
import { invoiceValue } from 'utils/assignmentReport';
import { reportAreaName } from 'utils/areaName';
import { useSalesPolling } from 'utils/salesSync';

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

  return <MDBox mt={2} p={2} sx={{ border: '1px solid #cbd5e1' }}>
    <MDTypography variant="h6">Delivery Transfers</MDTypography>
    <MDTypography variant="caption" display="block">Invoices a delivery boy transferred to another delivery boy from the app. Dates filter on the transfer date; clear both to see every transfer.</MDTypography>
    <MDBox display="flex" gap={2} alignItems="center" my={2} flexWrap="wrap">
      <MDInput type="date" label="Transferred From" InputLabelProps={{ shrink: true }} value={from} onChange={(event) => setFrom(event.target.value)} />
      <MDInput type="date" label="Transferred To" InputLabelProps={{ shrink: true }} value={to} onChange={(event) => setTo(event.target.value)} />
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel id="transfer-boy-label">Delivery Boy</InputLabel>
        <Select labelId="transfer-boy-label" label="Delivery Boy" value={boys.includes(boy) ? boy : ''} onChange={(event) => setBoy(event.target.value)} sx={{ height: 44 }}>
          <MenuItem value="">All delivery boys</MenuItem>
          {boys.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </Select>
      </FormControl>
      <MDInput label="Search invoice / outlet / area" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: 220 }} />
      <MDButton color="info" variant="outlined" onClick={reload} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</MDButton>
      <MDButton color="success" variant="gradient" onClick={download} disabled={loading || !shown.length}>Download PDF</MDButton>
    </MDBox>
    {error && <MDTypography color="error" variant="body2" role="alert">{error}</MDTypography>}
    <MDTypography variant="button" display="block" mb={1}>{shown.length} transfers · Invoice Amt: {money(total)}</MDTypography>
    <TableContainer sx={{ maxHeight: '60vh' }}><Table size="small" stickyHeader sx={{ '& .MuiTableCell-root': { fontSize: '0.8rem', verticalAlign: 'top' } }}>
      <TableHead sx={{ display: 'table-header-group' }}><TableRow>
        {COLUMNS.map((label) => <TableCell key={label} align={label === 'Invoice Amt' ? 'right' : 'left'} sx={{ whiteSpace: 'nowrap' }}>{label}</TableCell>)}
      </TableRow></TableHead>
      <TableBody>
        {shown.map((row, index) => <TableRow key={row.id} hover>
          <TableCell>{index + 1}</TableCell>
          <TableCell sx={{ whiteSpace: 'nowrap' }}>{displayDate(row.transferred_at)}</TableCell>
          <TableCell>{row.from_delivery_boy_name || '—'}</TableCell>
          <TableCell sx={{ fontWeight: 700 }}>{row.to_delivery_boy_name || '—'}</TableCell>
          <TableCell sx={{ whiteSpace: 'nowrap' }}>{displayDate(row.delivery_date)}</TableCell>
          <TableCell>{row.company_name || '—'}</TableCell>
          <TableCell>{reportAreaName(row.location_name)}</TableCell>
          <TableCell>{row.invoice_number || row.sale_id}</TableCell>
          <TableCell>{row.outlet_name || '—'}</TableCell>
          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(invoiceValue(row))}</TableCell>
          <TableCell>{row.reason || '—'}</TableCell>
          <TableCell><Chip size="small" variant="outlined" color={STATUS_COLOR[statusKey(row)] || 'default'} label={STATUS_LABEL[statusKey(row)] || row.packaging_status || '—'} /></TableCell>
        </TableRow>)}
        {!shown.length && <TableRow><TableCell colSpan={COLUMNS.length}>{loading ? 'Loading transfers…' : 'No transfers for these dates.'}</TableCell></TableRow>}
      </TableBody>
    </Table></TableContainer>
  </MDBox>;
}
DeliveryTransfers.propTypes = { api: PropTypes.string.isRequired };
