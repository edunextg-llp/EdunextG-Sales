// Report > Date-wise Assigned Orders tab: Tailwind CSS (no MUI). Loading, edit and PDF logic unchanged.
import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { notifySalesUpdated, useSalesPolling } from 'utils/salesSync';
import { groupAssignments, invoiceValue, printAssignmentSheetPdf, isEditableAssignment, assignmentEditRequests, assignmentCompanies, companyReportRows, printCompanyReportPdf, ALL_COMPANIES } from 'utils/assignmentReport';
import { boxCount, packetCount } from 'utils/deliveryLog';
import { COMPANY_TYPES, useCompanyTypeLookup } from "utils/companyTypes";
import { Badge, Field, Icon, Modal, Notice, btn, fieldClass } from 'components/tw';

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
  const bitField = 'location_name';
  const [downloadError, setDownloadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editBoy, setEditBoy] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editVehicle, setEditVehicle] = useState('');
  const [keepIds, setKeepIds] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  const [companyOpen, setCompanyOpen] = useState(false);
  const [company, setCompany] = useState(ALL_COMPANIES);
  const [companyError, setCompanyError] = useState('');
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
  const companies = useMemo(() => assignmentCompanies(selected?.rows || []), [selected]);
  const [companyType, setCompanyType] = useState('');
  const { matches: companyMatchesType } = useCompanyTypeLookup();
  const typedCompanies = companies.filter((name) => companyMatchesType(name, companyType));
  const handleCompanyTypeChange = (type) => {
    setCompanyType(type);
    if (company !== ALL_COMPANIES && type && !companyMatchesType(company, type)) setCompany(ALL_COMPANIES);
  };
  const companyRows = selected ? companyReportRows(selected, date, company) : [];
  const openCompanyReport = () => {
    setCompany(companies.length === 1 ? companies[0] : ALL_COMPANIES);
    setCompanyError('');
    setCompanyOpen(true);
  };
  const downloadCompany = () => {
    setCompanyError('');
    try { printCompanyReportPdf(selected, date, company); }
    catch (err) { setCompanyError(err?.message || 'Unable to download the company report. Please try again.'); }
  };
  const closeDialog = () => { if (!editSaving) { setEmployee(null); setEditing(false); setEditMessage(''); setCompanyOpen(false); } };
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
const TONE = { warning: "amber", success: "green", error: "red", default: "slate" };
  const th = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const td = "border-t border-slate-100 px-3 py-2 text-[12.5px] align-top";
  const totals = {
    orders: groups.reduce((sum, group) => sum + group.rows.length, 0),
    boxes: groups.reduce((sum, group) => sum + boxCount(group.rows), 0),
    packets: groups.reduce((sum, group) => sum + packetCount(group.rows), 0),
    value: groups.reduce((sum, group) => sum + group.total, 0),
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
        <div className="grow">
          <h3 className="m-0 text-[15px] font-semibold text-slate-900">Date-wise Assigned Orders</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">Shows saved employee assignments for the selected date, including previous dates.</p>
        </div>
        <Field label="Assignment date" width="w-40">
          <input type="date" className={fieldClass} value={date} onChange={(event) => { setDate(event.target.value); setEmployee(null); }} />
        </Field>
        <button type="button" className={btn.outline} onClick={reload} disabled={loading || !date}><Icon name="refresh" className="text-[18px]" />Refresh</button>
      </div>
      {(error || notice) && (
        <div className="space-y-2 px-4 pt-3">
          {error && <Notice tone="error">{error}</Notice>}
          {notice && <Notice tone="success">{notice}</Notice>}
        </div>
      )}
      {loading && result.date !== date ? <p role="status" className="m-0 px-4 py-12 text-center text-[13px] text-slate-400">Loading assignments…</p> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead><tr>{['Date', 'Employee', 'Assigned orders', 'Boxes', 'Packets', 'Invoice value'].map((label) => <th key={label} className={th}>{label}</th>)}<th className={`${th} text-right`}>Action</th></tr></thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="hover:bg-slate-50">
                    <td className={`${td} whitespace-nowrap`}>{date}</td>
                    <td className={`${td} font-semibold text-slate-900`}>{group.name}</td>
                    <td className={`${td} tabular-nums`}>{group.rows.length}</td>
                    <td className={`${td} tabular-nums`}>{boxCount(group.rows)}</td>
                    <td className={`${td} tabular-nums`}>{packetCount(group.rows)}</td>
                    <td className={`${td} font-semibold tabular-nums`}>{money(group.total)}</td>
                    <td className={`${td} text-right`}>
                      <button type="button" className={`${btn.outline} h-8 px-3`} onClick={() => { setEmployee(group.id); setDownloadError(''); setEditing(false); setEditMessage(''); setNotice(''); }}>
                        <Icon name="visibility" className="text-[16px]" />View
                      </button>
                    </td>
                  </tr>
                ))}
                {!groups.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-[13px] text-slate-400">{date ? 'No assigned orders for this date.' : 'Choose an assignment date.'}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="m-0 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[12.5px] text-slate-600">
            Total: <b>{totals.orders}</b> orders · <b>{totals.boxes}</b> boxes · <b>{totals.packets}</b> packets · Invoice value: <b>{money(totals.value)}</b>
          </p>
        </>
      )}

      {/* One employee's assigned bills (view / edit / PDFs) */}
      <Modal
        open={Boolean(employee)} onClose={closeDialog} locked={editSaving} size="xl"
        title={(
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{selected?.name || 'Employee'} — {date}</span>
            <span className="flex flex-wrap gap-2">
              {!editing && <button type="button" className={`${btn.outline} h-8 px-3`} onClick={startEdit} disabled={!selected}><Icon name="edit" className="text-[16px]" />Edit</button>}
              <button type="button" className={`${btn.primary} h-8 px-3`} onClick={download} disabled={!selected || editing}><Icon name="picture_as_pdf" className="text-[16px]" />Download PDF</button>
              <button type="button" className={`${btn.outline} h-8 px-3`} onClick={openCompanyReport} disabled={!selected || editing}><Icon name="business" className="text-[16px]" />Company-wise</button>
            </span>
          </span>
        )}
        actions={editing ? (
          <>
            <button type="button" className={btn.ghost} onClick={() => { setEditing(false); setDownloadError(''); }} disabled={editSaving}>Cancel</button>
            <button type="button" className={btn.primary} onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save changes'}</button>
          </>
        ) : <button type="button" className={btn.ghost} onClick={closeDialog}>Close</button>}
      >
        {editing && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Delivery boy / company staff" width="w-full">
                <select className={fieldClass} value={editBoy} onChange={(event) => setEditBoy(event.target.value)} disabled={editSaving}>
                  {boys.map((person) => <option key={person.id} value={String(person.id)}>{person.name}</option>)}
                  {!boys.some((person) => String(person.id) === String(selected?.id)) && selected && <option value={String(selected.id)}>{selected.name}</option>}
                </select>
              </Field>
              <Field label="Delivery date" width="w-full"><input type="date" className={fieldClass} value={editDate} onChange={(event) => setEditDate(event.target.value)} disabled={editSaving} /></Field>
              <Field label="Vehicle number" width="w-full"><input className={fieldClass} value={editVehicle} onChange={(event) => setEditVehicle(event.target.value)} disabled={editSaving} /></Field>
            </div>
            <p className="m-0 mt-2 text-[12px] text-slate-600">
              Changes apply to ticked bills that are still out for delivery. Untick a bill to remove it from this assignment and send it back to the report. Delivered, cancelled and returned bills can&apos;t be changed.
            </p>
          </div>
        )}
        <div className="space-y-2">
          {editMessage && <Notice tone="success">{editMessage}</Notice>}
          {downloadError && <Notice tone="error">{downloadError}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr>
                {editing && <th className={th}>Keep</th>}
                {['Sr.', 'Invoice no', 'Invoice date', 'Company', 'BIT', 'Outlet', 'Boxes', 'Packets', 'Invoice amount', 'Status', 'Details'].map((label) => <th key={label} className={th}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {(selected?.rows || []).map((row, index) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  {editing && (
                    <td className={td}>
                      {isEditableAssignment(row)
                        ? <input type="checkbox" className="size-4 accent-blue-600" checked={keepIds.includes(String(row.id))} disabled={editSaving} onChange={() => toggleKeep(String(row.id))} aria-label={`Keep invoice ${row.invoice_number || row.id} in this assignment`} />
                        : <span className="text-[11px] font-semibold text-slate-400">Locked</span>}
                    </td>
                  )}
                  <td className={`${td} text-slate-400`}>{index + 1}</td>
                  <td className={`${td} font-mono`}>{row.invoice_number || row.id}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatInvoiceDate(row.sale_date)}</td>
                  <td className={td}>{row.company_name || '—'}</td>
                  <td className={td}>{row[bitField] || '—'}</td>
                  <td className={`${td} font-medium text-slate-800`}>{row.outlet_name}</td>
                  <td className={`${td} tabular-nums`}>{row.box_count ?? '—'}</td>
                  <td className={`${td} tabular-nums`}>{row.packet_count ?? '—'}</td>
                  <td className={`${td} whitespace-nowrap font-semibold tabular-nums`}>{money(invoiceValue(row))}</td>
                  <td className={td}><Badge tone={TONE[STATUS_COLOR[statusKey(row)]] || 'slate'}>{STATUS_LABEL[statusKey(row)] || row.packaging_status || '—'}</Badge></td>
                  <td className={td}>
                    <button type="button" className={`${btn.icon} hover:text-blue-700`} title="View bill" aria-label={`View bill ${row.invoice_number || row.id}`} onClick={() => onViewBill({ row, draft: { name: selected.name, date, vehicle: row.vehicle_no } })}>
                      <Icon name="visibility" className="text-[19px]" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold text-slate-900">
                {editing && <td className={td} />}
                <td colSpan={6} className={td}>Total</td>
                <td className={`${td} tabular-nums`}>{boxCount(selected?.rows || [])}</td>
                <td className={`${td} tabular-nums`}>{packetCount(selected?.rows || [])}</td>
                <td className={`${td} tabular-nums`}>{money(selected?.total || 0)}</td>
                <td className={td} />
                <td className={td} />
              </tr>
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Company-wise report for the selected employee */}
      <Modal
        open={companyOpen && Boolean(selected)} onClose={() => setCompanyOpen(false)} title={`Company-wise Report — ${selected?.name || ''} — ${date}`}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={() => setCompanyOpen(false)}>Close</button>
            <button type="button" className={btn.primary} onClick={downloadCompany} disabled={!companyRows.length}><Icon name="picture_as_pdf" className="text-[18px]" />Download PDF</button>
          </>
        )}
      >
        <div className="space-y-3">
          <Field label="Company type" width="w-full">
            <select id="company-report-company-type" className={fieldClass} value={companyType} onChange={(event) => handleCompanyTypeChange(event.target.value)}>
              <option value="">All types</option>
              {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </Field>
          <Field label="Company" width="w-full">
            <select className={fieldClass} value={company} onChange={(event) => { setCompany(event.target.value); setCompanyError(''); }}>
              <option value={ALL_COMPANIES}>All companies</option>
              {typedCompanies.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </Field>
          <p className="m-0 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-700">
            <b>{companyRows.length}</b> orders · <b>{companyRows.reduce((sum, row) => sum + row.boxes, 0)}</b> boxes · Invoice value: <b>{money(companyRows.reduce((sum, row) => sum + row.amount, 0))}</b>
          </p>
          <p className="m-0 text-[12px] text-slate-500">Columns: delivery boy, date, company, staff name, area, invoice number, outlet name, boxes and invoice amount.</p>
          {companyError && <Notice tone="error">{companyError}</Notice>}
        </div>
      </Modal>
    </section>
  );
}
AssignmentHistory.propTypes = { api: PropTypes.string.isRequired, onViewBill: PropTypes.func.isRequired, areaOrder: PropTypes.arrayOf(PropTypes.string), boys: PropTypes.arrayOf(PropTypes.object) };
AssignmentHistory.defaultProps = { areaOrder: [], boys: [] };
