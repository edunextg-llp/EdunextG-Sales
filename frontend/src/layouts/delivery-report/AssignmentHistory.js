import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Dialog, DialogTitle, DialogContent, DialogActions, Table, TableHead, TableBody, TableRow, TableCell, TableContainer, MenuItem, Checkbox, Chip, Grid } from '@mui/material';
import MDBox from 'components/MDBox';
import MDTypography from 'components/MDTypography';
import MDInput from 'components/MDInput';
import MDButton from 'components/MDButton';
import { notifySalesUpdated, useSalesPolling } from 'utils/salesSync';
import { groupAssignments, invoiceValue, printAssignmentSheetPdf, isEditableAssignment, assignmentEditRequests } from 'utils/assignmentReport';

const money = (value) => Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const STATUS_LABEL = { out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' };
const STATUS_COLOR = { out_for_delivery: 'warning', delivered: 'success', cancelled: 'error', returned: 'default' };
const statusKey = (row) => String(row.packaging_status || '').trim().toLowerCase();
function formatInvoiceDate(value) {
  if (!value) return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[3] + '-' + match[2] + '-' + match[1] : '—';
}

export default function AssignmentHistory({ api, onViewBill, areaOrder, boys }) {
  const [date, setDate] = useState(today);
  const [result, setResult] = useState({ date: '', rows: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [bitField, setBitField] = useState('location_name');
  const [downloadError, setDownloadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editBoy, setEditBoy] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editVehicle, setEditVehicle] = useState('');
  const [keepIds, setKeepIds] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useSalesPolling(reload);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    if (!date) { setResult({ date: '', rows: [] }); setLoading(false); return () => controller.abort(); }
    setLoading(true);
    fetch(`${api}/staff/sales/by-date?scope=assignments&date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error('Unable to load assignments. Please retry.'); return response.json(); })
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error('Invalid assignment response.');
        if (!controller.signal.aborted) setResult((previous) =>
          previous.date === date && JSON.stringify(previous.rows) === JSON.stringify(rows)
            ? previous : { date, rows });
      })
      .catch((err) => { if (!controller.signal.aborted) setError(`${err.message} Previously loaded data, if shown, may be out of date.`); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, date, refresh]);
  const groups = useMemo(() => groupAssignments(result.date === date ? result.rows : [], areaOrder), [result, date, areaOrder]);
  const selected = groups.find((group) => group.id === employee);
  const editableRows = (selected?.rows || []).filter(isEditableAssignment);
  const closeDialog = () => { if (!editSaving) { setEmployee(null); setEditing(false); setEditMessage(''); } };
  const startEdit = () => {
    setEditMessage('');
    if (!editableRows.length) {
      setDownloadError('Nothing to edit: every bill here is already delivered, cancelled or returned. Only bills that are still out for delivery can be changed.');
      return;
    }
    setEditBoy(String(selected.id));
    setEditDate(date);
    setEditVehicle(editableRows[0]?.vehicle_no || '');
    setKeepIds(editableRows.map((row) => String(row.id)));
    setDownloadError(''); setEditMessage('');
    setEditing(true);
  };
  const toggleKeep = (id) => setKeepIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  const saveEdit = async () => {
    if (editSaving) return;
    setDownloadError(''); setEditMessage('');
    if (keepIds.length && (!editBoy || !editDate || !editVehicle.trim())) {
      setDownloadError('Select the delivery boy, delivery date and vehicle number.');
      return;
    }
    const requests = assignmentEditRequests(editableRows, { boy: editBoy, date: editDate, vehicle: editVehicle, keepIds });
    if (!requests.length) { setEditing(false); setEditMessage('No changes to save.'); return; }
    setEditSaving(true);
    const failed = [];
    for (const { row, body } of requests) {
      try {
        const response = await fetch(`${api}/staff/sales/${row.id}/packaging`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Update failed'); }
      } catch (err) { failed.push(`${row.invoice_number || row.id}: ${err.message}`); }
    }
    setEditSaving(false);
    notifySalesUpdated();
    reload();
    const removed = requests.filter(({ body }) => body.packagingStatus === 'packing_done').length;
    const moved = requests.length - removed;
    if (failed.length) {
      setDownloadError(`Some bills were not updated (they may have been delivered or changed meanwhile): ${failed.join('; ')}`);
      return;
    }
    setEditing(false);
    const summary = [moved && `${moved} bill(s) updated`, removed && `${removed} bill(s) returned to the report`].filter(Boolean).join(' · ');
    // The bills may now belong to another delivery boy or date, so close the popup.
    if (String(editBoy) !== String(selected.id) || editDate !== date || !keepIds.length) {
      setEmployee(null);
      setEditMessage('');
      setError('');
      setNotice(summary);
    } else {
      setEditMessage(summary);
    }
  };
  const download = () => {
    setDownloadError('');
    try { printAssignmentSheetPdf(selected, date, bitField); }
    catch (err) { setDownloadError(err?.message || 'Unable to download PDF. Please try again.'); }
  };
  return <MDBox mt={3} p={2} sx={{ border: '1px solid #cbd5e1' }}>
    <MDTypography variant="h6">Date-wise Assigned Orders</MDTypography>
    <MDBox display="flex" gap={2} alignItems="center" my={2}>
      <MDInput type="date" label="Assignment Date" InputLabelProps={{ shrink: true }} value={date} onChange={(event) => { setDate(event.target.value); setEmployee(null); }} />
      <MDButton color="info" variant="outlined" onClick={reload} disabled={loading || !date}>Refresh</MDButton>
    </MDBox>
    <MDTypography variant="caption">Shows saved employee assignments for the selected date, including previous dates.</MDTypography>
    {error && <MDTypography color="error" variant="body2" role="alert">{error}</MDTypography>}
    {notice && <MDTypography color="success" variant="body2" role="status">{notice}</MDTypography>}
    {loading && result.date !== date ? <MDTypography variant="body2" role="status">Loading assignments…</MDTypography> : <>
      <TableContainer><Table size="small"><TableHead sx={{ display: 'table-header-group' }}><TableRow>
        {['Date', 'Employee', 'Assigned Orders', 'Invoice Value', 'Action'].map((label) => <TableCell key={label}>{label}</TableCell>)}
      </TableRow></TableHead><TableBody>
        {groups.map((group) => <TableRow key={group.id}><TableCell>{date}</TableCell><TableCell>{group.name}</TableCell><TableCell>{group.rows.length}</TableCell><TableCell>{money(group.total)}</TableCell><TableCell><MDButton size="small" color="info" onClick={() => { setEmployee(group.id); setDownloadError(''); setEditing(false); setEditMessage(''); setNotice(''); }}>View</MDButton></TableCell></TableRow>)}
        {!groups.length && <TableRow><TableCell colSpan={5}>{date ? 'No assigned orders for this date.' : 'Choose an assignment date.'}</TableCell></TableRow>}
      </TableBody></Table></TableContainer>
      <MDTypography variant="button">Total: {groups.reduce((sum, group) => sum + group.rows.length, 0)} orders · Invoice Value: {money(groups.reduce((sum, group) => sum + group.total, 0))}</MDTypography>
    </>}
    <Dialog open={Boolean(employee)} onClose={closeDialog} fullWidth maxWidth="lg">
      <DialogTitle><MDBox display="flex" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap">
        <MDTypography variant="h6">{selected?.name || 'Employee'} — {date}</MDTypography>
        <MDBox display="flex" gap={1}>
          {!editing && <MDButton color="info" variant="outlined" onClick={startEdit} disabled={!selected}>Edit</MDButton>}
          <MDButton color="success" variant="gradient" onClick={download} disabled={!selected || editing}>Download PDF</MDButton>
        </MDBox>
      </MDBox></DialogTitle>
      <DialogContent dividers>
        <MDInput select label="BIT column" value={bitField} onChange={(event) => setBitField(event.target.value)} fullWidth sx={{ mb: 2 }}>
          <MenuItem value="location_name">Area / route name</MenuItem><MenuItem value="sticker_number">Sticker number</MenuItem>
        </MDInput>
        {editing && <MDBox mb={2} p={1.5} sx={{ border: '1px solid #93c5fd', borderRadius: 1, backgroundColor: '#eff6ff' }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <MDInput select label="Delivery Boy / Company Staff" value={editBoy} onChange={(event) => setEditBoy(event.target.value)} fullWidth disabled={editSaving}>
                {boys.map((person) => <MenuItem key={person.id} value={String(person.id)}>{person.name}</MenuItem>)}
                {!boys.some((person) => String(person.id) === String(selected?.id)) && selected && <MenuItem value={String(selected.id)}>{selected.name}</MenuItem>}
              </MDInput>
            </Grid>
            <Grid item xs={12} md={4}>
              <MDInput type="date" label="Delivery Date" InputLabelProps={{ shrink: true }} value={editDate} onChange={(event) => setEditDate(event.target.value)} fullWidth disabled={editSaving} />
            </Grid>
            <Grid item xs={12} md={4}>
              <MDInput label="Vehicle Number" value={editVehicle} onChange={(event) => setEditVehicle(event.target.value)} fullWidth disabled={editSaving} />
            </Grid>
          </Grid>
          <MDTypography variant="caption" display="block" mt={1}>
            Changes apply to ticked bills that are still out for delivery. Untick a bill to remove it from this assignment and send it back to the report. Delivered, cancelled and returned bills can&apos;t be changed.
          </MDTypography>
        </MDBox>}
        {editMessage && <MDTypography variant="body2" color="success">{editMessage}</MDTypography>}
        {downloadError && <MDTypography variant="body2" color="error">{downloadError}</MDTypography>}
        {error && <MDTypography variant="body2" color="error">{error}</MDTypography>}
        <TableContainer><Table size="small"><TableHead sx={{ display: 'table-header-group' }}><TableRow>
          {editing && <TableCell padding="checkbox">Keep</TableCell>}
          {['Sr. No.', 'Invoice No.', 'Invoice Date', 'Company Name', 'BIT', 'Outlet Name', 'Invoice Amount', 'Status', 'Details'].map((label) => <TableCell key={label}>{label}</TableCell>)}
        </TableRow></TableHead><TableBody>
          {(selected?.rows || []).map((row, index) => <TableRow key={row.id}>{editing && <TableCell padding="checkbox">{isEditableAssignment(row)
            ? <Checkbox size="small" checked={keepIds.includes(String(row.id))} disabled={editSaving} onChange={() => toggleKeep(String(row.id))} inputProps={{ 'aria-label': `Keep invoice ${row.invoice_number || row.id} in this assignment` }} />
            : <MDTypography variant="caption" color="text">Locked</MDTypography>}</TableCell>}<TableCell>{index + 1}</TableCell><TableCell>{row.invoice_number || row.id}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatInvoiceDate(row.sale_date)}</TableCell><TableCell>{row.company_name || '—'}</TableCell><TableCell>{row[bitField] || '—'}</TableCell><TableCell>{row.outlet_name}</TableCell><TableCell>{money(invoiceValue(row))}</TableCell><TableCell><Chip size="small" variant="outlined" color={STATUS_COLOR[statusKey(row)] || 'default'} label={STATUS_LABEL[statusKey(row)] || row.packaging_status || '—'} /></TableCell><TableCell><MDButton size="small" color="info" onClick={() => onViewBill({ row, draft: { name: selected.name, date, vehicle: row.vehicle_no } })}>View</MDButton></TableCell></TableRow>)}
          <TableRow>{editing && <TableCell />}<TableCell colSpan={6}>Total Invoice Value</TableCell><TableCell>{money(selected?.total || 0)}</TableCell><TableCell /><TableCell /></TableRow>
        </TableBody></Table></TableContainer>
      </DialogContent><DialogActions>
        {editing ? <>
          <MDButton color="secondary" onClick={() => { setEditing(false); setDownloadError(''); }} disabled={editSaving}>Cancel</MDButton>
          <MDButton color="info" variant="gradient" onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save changes'}</MDButton>
        </> : <MDButton color="secondary" onClick={closeDialog}>Close</MDButton>}
      </DialogActions>
    </Dialog>
  </MDBox>;
}
AssignmentHistory.propTypes = { api: PropTypes.string.isRequired, onViewBill: PropTypes.func.isRequired, areaOrder: PropTypes.arrayOf(PropTypes.string), boys: PropTypes.arrayOf(PropTypes.object) };
AssignmentHistory.defaultProps = { areaOrder: [], boys: [] };
