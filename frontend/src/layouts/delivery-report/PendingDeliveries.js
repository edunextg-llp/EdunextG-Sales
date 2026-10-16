import { useCallback, useEffect, useMemo, useState } from 'react';
import ejs from 'ejs/ejs.min.js';
import PropTypes from 'prop-types';
import { Table, TableHead, TableBody, TableRow, TableCell, TableContainer, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import MDBox from 'components/MDBox';
import MDTypography from 'components/MDTypography';
import MDInput from 'components/MDInput';
import MDButton from 'components/MDButton';
import { invoiceValue } from 'utils/assignmentReport';
import { reportAreaName } from 'utils/areaName';
import { useSalesPolling } from 'utils/salesSync';

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
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useSalesPolling(reload);

  useEffect(() => {
    fetch(`${api}/staff/companies`)
      .then(async (response) => { if (!response.ok) throw new Error('Unable to load companies.'); return response.json(); })
      .then((list) => setCompanies((Array.isArray(list) ? list : []).map((item) => ({ id: String(item.id), name: String(item.name || '').trim() })).filter((item) => item.name).sort((a, b) => a.name.localeCompare(b.name))))
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

  return <MDBox mt={2} p={2} sx={{ border: '1px solid #cbd5e1' }}>
    <MDTypography variant="h6">Pending Deliveries</MDTypography>
    <MDTypography variant="caption" display="block">Bills assigned to a delivery boy or company staff that are still out for delivery. Dates filter on the assignment date; leave them empty to see every pending bill.</MDTypography>
    <MDBox display="flex" gap={2} alignItems="center" my={2} flexWrap="wrap">
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel id="pending-company-label">Company</InputLabel>
        <Select labelId="pending-company-label" label="Company" value={companyId} onChange={(event) => setCompanyId(event.target.value)} sx={{ height: 44 }}>
          <MenuItem value="">All companies</MenuItem>
          {companies.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 200 }}>
        <InputLabel id="pending-boy-label">Delivery Boy</InputLabel>
        <Select labelId="pending-boy-label" label="Delivery Boy" value={boys.includes(boy) ? boy : ''} onChange={(event) => setBoy(event.target.value)} sx={{ height: 44 }}>
          <MenuItem value="">All delivery boys</MenuItem>
          {boys.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </Select>
      </FormControl>
      <MDInput type="date" label="Assigned From" InputLabelProps={{ shrink: true }} value={from} onChange={(event) => setFrom(event.target.value)} />
      <MDInput type="date" label="Assigned To" InputLabelProps={{ shrink: true }} value={to} onChange={(event) => setTo(event.target.value)} />
      <MDInput label="Search invoice / outlet / area" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ minWidth: 220 }} />
      <MDButton color="info" variant="outlined" onClick={reload} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</MDButton>
      <MDButton color="success" variant="gradient" onClick={download} disabled={loading || !shown.length}>Download PDF</MDButton>
    </MDBox>
    {error && <MDTypography color="error" variant="body2" role="alert">{error}</MDTypography>}
    <MDTypography variant="button" display="block" mb={1}>{shown.length} pending bills · Invoice Amt: {money(total)}</MDTypography>
    <TableContainer sx={{ maxHeight: '60vh' }}><Table size="small" stickyHeader sx={{ '& .MuiTableCell-root': { fontSize: '0.8rem' } }}>
      <TableHead sx={{ display: 'table-header-group' }}><TableRow>
        {COLUMNS.map((label) => <TableCell key={label} align={label === 'Invoice Amt' ? 'right' : 'left'} sx={{ whiteSpace: 'nowrap' }}>{label}</TableCell>)}
      </TableRow></TableHead>
      <TableBody>
        {shown.map((row, index) => <TableRow key={row.id} hover>
          <TableCell>{index + 1}</TableCell>
          <TableCell>{boyName(row)}</TableCell>
          <TableCell sx={{ whiteSpace: 'nowrap' }}>{displayDate(row.delivery_date)}</TableCell>
          <TableCell>{companyName(row)}</TableCell>
          <TableCell>{reportAreaName(row.location_name)}</TableCell>
          <TableCell>{row.invoice_number || row.id}</TableCell>
          <TableCell>{row.outlet_name || '—'}</TableCell>
          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(invoiceValue(row))}</TableCell>
        </TableRow>)}
        {!shown.length && <TableRow><TableCell colSpan={COLUMNS.length}>{loading ? 'Loading pending deliveries…' : 'No pending deliveries.'}</TableCell></TableRow>}
        {shown.length > 0 && <TableRow><TableCell colSpan={7} sx={{ fontWeight: 700 }}>Total ({shown.length} bills)</TableCell><TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(total)}</TableCell></TableRow>}
      </TableBody>
    </Table></TableContainer>
  </MDBox>;
}
PendingDeliveries.propTypes = { api: PropTypes.string.isRequired };
