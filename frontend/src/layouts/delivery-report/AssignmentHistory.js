import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Dialog, DialogTitle, DialogContent, DialogActions, Table, TableHead, TableBody, TableRow, TableCell, TableContainer, MenuItem } from '@mui/material';
import MDBox from 'components/MDBox';
import MDTypography from 'components/MDTypography';
import MDInput from 'components/MDInput';
import MDButton from 'components/MDButton';
import { useSalesPolling } from 'utils/salesSync';
import { groupAssignments, invoiceValue, downloadAssignmentSheet } from 'utils/assignmentReport';

const money = (value) => Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
export default function AssignmentHistory({ api, onViewBill }) {
  const [date, setDate] = useState(today);
  const [result, setResult] = useState({ date: '', rows: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [bitField, setBitField] = useState('location_name');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useSalesPolling(reload);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    if (!date) { setResult({ date: '', rows: [] }); setLoading(false); return () => controller.abort(); }
    setLoading(true);
    fetch(`${api}/staff/sales/by-date?scope=assignments&date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error('Unable to load assignments. Please retry.'); return response.json(); })
      .then((rows) => { if (!Array.isArray(rows)) throw new Error('Invalid assignment response.'); if (!controller.signal.aborted) setResult({ date, rows }); })
      .catch((err) => { if (!controller.signal.aborted) { setError(err.message); setResult({ date, rows: [] }); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, date, refresh]);
  const groups = useMemo(() => groupAssignments(result.date === date ? result.rows : []), [result, date]);
  const selected = groups.find((group) => group.id === employee);
  const download = async () => {
    setDownloading(true); setDownloadError('');
    try { await downloadAssignmentSheet(selected, date, bitField); }
    catch (_err) { setDownloadError('Unable to download sheet. Please try again.'); }
    finally { setDownloading(false); }
  };
  return <MDBox mt={3} p={2} sx={{ border: '1px solid #cbd5e1' }}>
    <MDTypography variant="h6">Date-wise Assigned Orders</MDTypography>
    <MDBox display="flex" gap={2} alignItems="center" my={2}>
      <MDInput type="date" label="Assignment Date" InputLabelProps={{ shrink: true }} value={date} onChange={(event) => { setDate(event.target.value); setEmployee(null); }} />
      <MDButton color="info" variant="outlined" onClick={reload} disabled={loading || !date}>Refresh</MDButton>
    </MDBox>
    <MDTypography variant="caption">Shows saved employee assignments for the selected date, including previous dates.</MDTypography>
    {error && <MDTypography color="error" variant="body2" role="alert">{error}</MDTypography>}
    {loading ? <MDTypography variant="body2" role="status">Loading assignments…</MDTypography> : <>
      <TableContainer><Table size="small"><TableHead sx={{ display: 'table-header-group' }}><TableRow>
        {['Date', 'Employee', 'Assigned Orders', 'Invoice Value', 'Action'].map((label) => <TableCell key={label}>{label}</TableCell>)}
      </TableRow></TableHead><TableBody>
        {groups.map((group) => <TableRow key={group.id}><TableCell>{date}</TableCell><TableCell>{group.name}</TableCell><TableCell>{group.rows.length}</TableCell><TableCell>{money(group.total)}</TableCell><TableCell><MDButton size="small" color="info" onClick={() => { setEmployee(group.id); setDownloadError(''); }}>View</MDButton></TableCell></TableRow>)}
        {!groups.length && <TableRow><TableCell colSpan={5}>{date ? 'No assigned orders for this date.' : 'Choose an assignment date.'}</TableCell></TableRow>}
      </TableBody></Table></TableContainer>
      <MDTypography variant="button">Total: {groups.reduce((sum, group) => sum + group.rows.length, 0)} orders · Invoice Value: {money(groups.reduce((sum, group) => sum + group.total, 0))}</MDTypography>
    </>}
    <Dialog open={Boolean(employee)} onClose={() => setEmployee(null)} fullWidth maxWidth="lg">
      <DialogTitle><MDBox display="flex" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
        <MDTypography variant="h6">{selected?.name || 'Employee'} — {date}</MDTypography>
        <MDButton color="success" variant="gradient" onClick={download} disabled={downloading || loading || !selected}>{downloading ? 'Downloading…' : 'Download Sheet'}</MDButton>
      </MDBox></DialogTitle>
      <DialogContent dividers>
        <MDInput select label="BIT column" value={bitField} onChange={(event) => setBitField(event.target.value)} fullWidth sx={{ mb: 2 }}>
          <MenuItem value="location_name">Area / route name</MenuItem><MenuItem value="sticker_number">Sticker number</MenuItem>
        </MDInput>
        {downloadError && <MDTypography variant="body2" color="error">{downloadError}</MDTypography>}
        {error && <MDTypography variant="body2" color="error">{error}</MDTypography>}
        <TableContainer><Table size="small"><TableHead sx={{ display: 'table-header-group' }}><TableRow>
          {['Sr. No.', 'Invoice No.', 'BIT', 'Outlet Name', 'Invoice Amount', 'Details'].map((label) => <TableCell key={label}>{label}</TableCell>)}
        </TableRow></TableHead><TableBody>
          {(selected?.rows || []).map((row, index) => <TableRow key={row.id}><TableCell>{index + 1}</TableCell><TableCell>{row.invoice_number || row.id}</TableCell><TableCell>{row[bitField] || '—'}</TableCell><TableCell>{row.outlet_name}</TableCell><TableCell>{money(invoiceValue(row))}</TableCell><TableCell><MDButton size="small" color="info" onClick={() => onViewBill({ row, draft: { name: selected.name, date, vehicle: row.vehicle_no } })}>View</MDButton></TableCell></TableRow>)}
          <TableRow><TableCell colSpan={4}>Total Invoice Value</TableCell><TableCell>{money(selected?.total || 0)}</TableCell><TableCell /></TableRow>
        </TableBody></Table></TableContainer>
      </DialogContent><DialogActions><MDButton color="secondary" onClick={() => setEmployee(null)}>Close</MDButton></DialogActions>
    </Dialog>
  </MDBox>;
}
AssignmentHistory.propTypes = { api: PropTypes.string.isRequired, onViewBill: PropTypes.func.isRequired };
