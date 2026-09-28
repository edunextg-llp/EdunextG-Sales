import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import MDInput from "components/MDInput";
import { notifySalesUpdated, useSalesPolling } from "utils/salesSync";
import { Dialog, DialogTitle, DialogContent, DialogActions, TableContainer, Table, TableBody, TableRow, TableCell, Checkbox, FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import { buildDeliveryLog, deliveryLogColors } from "utils/deliveryLog";
import { printDeliveryAssignmentsPdf } from "utils/printDeliveryAssignmentsPdf";

const API = "https://bawarchee.edunextg.co/api";
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
export default function DeliveryReport() {
  const [sales, setSales] = useState([]);
  const [boys, setBoys] = useState([]);
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [removeIds, setRemoveIds] = useState([]);
  const [boy, setBoy] = useState("");
  const [date, setDate] = useState(today);
  const [vehicle, setVehicle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const load = useCallback(async () => {
    try {
      const responses = await Promise.all([fetch(API + "/staff/sales/by-date"), fetch(API + "/delivery-boy")]);
      if (responses.some((r) => !r.ok)) throw new Error("Unable to load delivery report");
      const [rows, staff] = await Promise.all(responses.map((r) => r.json()));
      setSales(rows); setBoys(staff.filter((b) => b.role === "delivery_boy" && Number(b.is_active) === 1));
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useSalesPolling(load);
  const stagedIds = useMemo(() => new Set(drafts.flatMap((draft) => draft.rows.map((row) => String(row.id)))), [drafts]);
  const availableSales = useMemo(() => sales.filter((row) => !stagedIds.has(String(row.id))), [sales, stagedIds]);
  const pending = useMemo(() => [...new Map(availableSales.filter((row) => ["packing_done", "returned"].includes(row.packaging_status)).map((row) => [String(row.id), row])).values()], [availableSales]);
  const draftBoys = [...new Set(drafts.map((draft) => draft.boy))];
  const chosen = pending.filter((row) => selected.includes(String(row.id)));
  const cellBills = (type, cells, column) => {
    if (!column || !["counts", "summary", "total"].includes(type)) return [];
    const company = type === "counts" || type === "summary" ? cells[0] : null;
    const area = (type === "counts" || cells[0] === "Area totals") && column < report.width - 1 ? report.rows[0].cells[column] : null;
    return pending.filter((row) => (!company || String(row.company_name || "Company not assigned").trim() === company) && (!area || String(row.location_name || "Area not assigned").trim() === area));
  };
  const toggle = (rows) => { const ids = rows.map((row) => String(row.id)); setSelected((prev) => ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]); };
  const stage = () => {
    if (busy.current || !chosen.length) return;
    if (!boy || !date || !vehicle.trim()) { setError("Select delivery boy, date and vehicle number."); return; }
    setDrafts((prev) => [...prev, { id: Date.now(), boy, name: boys.find((person) => String(person.id) === boy)?.name || "Delivery Boy", date, vehicle: vehicle.trim(), rows: chosen }]);
    setSelected([]); setOpen(false); setError("");
    setMessage(chosen.length + " bills added to View. Use Submit in View to send assignments.");
  };
  const toggleDraftArea = (ids) => {
    if (busy.current) return;
    setRemoveIds((prev) => ids.every((id) => prev.includes(id))
      ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  };
  const removeSelectedAreas = (draftId) => {
    if (busy.current) return;
    const ids = drafts.find((draft) => draft.id === draftId)?.rows
      .map((row) => String(row.id)).filter((id) => removeIds.includes(id)) || [];
    if (!ids.length) return;
    setDrafts((prev) => prev.map((draft) => draft.id === draftId
      ? { ...draft, rows: draft.rows.filter((row) => !ids.includes(String(row.id))) } : draft)
      .filter((draft) => draft.rows.length));
    setRemoveIds((prev) => prev.filter((id) => !ids.includes(id)));
    setError("");
    setMessage(ids.length + " bills removed from this draft and returned to Report for reassignment.");
  };
  const submit = async () => {
    if (busy.current || !drafts.length) return;
    busy.current = true; setSaving(true); setError(""); setMessage("");
    setRemoveIds([]);
    const moved = []; const failed = [];
    for (const draft of drafts) {
    for (const row of draft.rows) {
      try {
        const response = await fetch(API + "/staff/sales/" + row.id + "/packaging", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packagingStatus: "out_for_delivery", expectedStatus: row.packaging_status, deliveryBoyId: Number(draft.boy), deliveryDate: draft.date, vehicleNo: draft.vehicle }),
        });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Assignment failed"); }
        moved.push(String(row.id));
      } catch (err) { failed.push(String(row.invoice_number || row.id) + ": " + err.message); }
    }
    }
    // Hide successful bills immediately, even if the refresh fails.
    setSales((prev) => prev.filter((row) => !moved.includes(String(row.id))));
    setDrafts((prev) => prev.map((draft) => ({ ...draft, rows: draft.rows.filter((row) => !moved.includes(String(row.id))) })).filter((draft) => draft.rows.length));
    setMessage(moved.length + " bills assigned and sent to the delivery boys’ apps.");
    if (failed.length) setError(failed.join("; "));
    notifySalesUpdated(); await load(); busy.current = false; setSaving(false);
  };
  const report = useMemo(() => buildDeliveryLog(availableSales, { hideEmptyAreas: true }), [availableSales]);
  const [error, setError] = useState("");
  return (
    <DashboardLayout><DashboardNavbar /><MDBox py={3} sx={{ backgroundColor: "#fff" }}>
      <DialogTitle id="delivery-log-title" sx={{ py: 0.5, px: 1, backgroundColor: "#dbeafe", borderBottom: "1px solid #93c5fd" }}>
        <MDBox display="flex" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
          <MDTypography variant="h6" color="dark">Report — Pending Deliveries</MDTypography>
          <MDBox display="flex" gap={1}>
            <MDButton size="small" color="info" variant="outlined" onClick={() => setViewOpen(true)}>View ({stagedIds.size})</MDButton>
            <MDButton size="small" color="info" variant="gradient" disabled={saving || !chosen.length} onClick={() => { setError(""); setOpen(true); }}>Assign ({chosen.length})</MDButton>
          </MDBox>
        </MDBox>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <MDBox px={1} py={0.5} bgColor="#eff6ff">
          <MDTypography variant="caption">All companies • Packed and returned bills awaiting delivery • {report.total} pending bills</MDTypography>
          {message && <MDTypography variant="caption" display="block" color="success">{message}</MDTypography>}
          {error && <MDTypography variant="caption" display="block" color="error">{error}</MDTypography>}
        </MDBox>
        {!report.companyCount ? <MDBox p={3}><MDTypography variant="button">No delivery data available.</MDTypography></MDBox> : (
          <TableContainer sx={{ maxHeight: "72vh" }}>
            <Table size="small" aria-label="Pending delivery bills by company and area" sx={{ tableLayout: "fixed", width: 160 + (report.width - 1) * 95, borderCollapse: "collapse" }}>
              <colgroup>
                <col style={{ width: 160 }} />
                {Array.from({ length: report.width - 1 }, (_, index) => <col key={index} style={{ width: 95 }} />)}
              </colgroup>
              <TableBody>
                {report.rows.slice(0, report.rows.findIndex((row) => row.type === "spacer")).map(({ type, cells }, index) => (
                  <TableRow key={index}>
                    {(type === "section" || type === "spacer" ? [cells[0] || ""] : cells).map((value, column) => (
                      <TableCell key={column} colSpan={type === "section" ? 2 : type === "spacer" ? report.width : 1} sx={{
                        px: 0.5, py: type === "spacer" ? 0.25 : 0.35, fontSize: "0.75rem", lineHeight: 1.2, color: "#172033",
                        border: type === "spacer" ? 0 : "1px solid #cbd5e1",
                        backgroundColor: `#${deliveryLogColors[type]}`,
                        fontWeight: ["section", "header", "total"].includes(type) ? 700 : 400,
                        textAlign: column === 0 ? "left" : "center", overflowWrap: "anywhere",
                        ...(column === 0 && !["section", "spacer"].includes(type) ? { position: "sticky", left: 0, zIndex: 1, width: 160 } : {}),
                      }}>{typeof value === "number" ? <MDBox display="flex" alignItems="center" justifyContent="center" gap={0.25}>
                        <Checkbox size="small" sx={{ p: 0, "& .MuiSvgIcon-root": { fontSize: 15 } }} disabled={saving || value === 0} checked={value > 0 && cellBills(type, cells, column).every((row) => selected.includes(String(row.id)))} indeterminate={cellBills(type, cells, column).some((row) => selected.includes(String(row.id))) && !cellBills(type, cells, column).every((row) => selected.includes(String(row.id)))} onChange={() => toggle(cellBills(type, cells, column))} inputProps={{ "aria-label": "Select bills: " + cells[0] + " / " + (report.rows[0].cells[column] || "Total") }} />{value}
                      </MDBox> : value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <Dialog open={open} onClose={() => { if (!saving) setOpen(false); }} fullWidth maxWidth="sm">
        <DialogTitle>Assign {chosen.length} bills</DialogTitle>
        <DialogContent dividers><MDBox display="flex" flexDirection="column" gap={2}>
          {error && <MDTypography variant="body2" color="error">{error}</MDTypography>}
          <FormControl fullWidth><InputLabel id="report-boy-label">Delivery Boy</InputLabel><Select labelId="report-boy-label" label="Delivery Boy" value={boy} disabled={saving} onChange={(event) => setBoy(event.target.value)} sx={{ height: 44 }}>{boys.map((person) => <MenuItem key={person.id} value={String(person.id)}>{person.name}</MenuItem>)}</Select></FormControl>
          <MDInput type="date" label="Delivery Date" InputLabelProps={{ shrink: true }} value={date} disabled={saving} onChange={(event) => setDate(event.target.value)} />
          <MDInput label="Vehicle Number" value={vehicle} disabled={saving} onChange={(event) => setVehicle(event.target.value)} />
          <MDTypography variant="caption">This adds bills to your draft. Open View and Submit to send them to the delivery boy’s app. Drafts remain here until you leave or reload this page.</MDTypography>
        </MDBox></DialogContent>
        <DialogActions><MDButton color="secondary" disabled={saving} onClick={() => setOpen(false)}>Cancel</MDButton><MDButton color="info" variant="gradient" disabled={saving || !chosen.length} onClick={stage}>Add to View</MDButton></DialogActions>
      </Dialog>
      <Dialog open={viewOpen} onClose={() => { if (!saving) setViewOpen(false); }} fullWidth maxWidth="lg">
        <DialogTitle>View Assignments</DialogTitle>
        <DialogContent dividers>
          {message && <MDTypography variant="body2" color="success">{message}</MDTypography>}
          {error && <MDTypography variant="body2" color="error">{error}</MDTypography>}
          <MDTypography variant="caption">Select area rows and click Remove selected areas to return those bills to Report. Submit sends all remaining bills below to their apps.</MDTypography>
          {!drafts.length && <MDTypography variant="body2" py={2}>No draft assignments. Select bills in Report and click Assign.</MDTypography>}
          <MDBox display="flex" sx={{ overflowX: "auto", mt: 1, alignItems: "stretch" }}>
            {draftBoys.map((boyId) => {
              const batches = drafts.filter((draft) => draft.boy === boyId);
              return <MDBox key={boyId} sx={{ minWidth: 260, flex: "1 0 260px", border: "1px solid #cbd5e1", display: "flex", flexDirection: "column" }}>
                <MDTypography variant="h6" sx={{ backgroundColor: "#16dfe3", p: 1 }}>{batches[0].name}</MDTypography>
                {batches.map((draft) => {
                  const groups = new Map();
                  draft.rows.forEach((row) => {
                    const company = String(row.company_name || "Company not assigned").trim();
                    const area = String(row.location_name || "Area not assigned").trim();
                    const key = JSON.stringify([company, area]);
                    const group = groups.get(key) || { company, area, count: 0, ids: [] };
                    group.count += 1; group.ids.push(String(row.id)); groups.set(key, group);
                  });
                  return <MDBox key={draft.id} p={1} sx={{ borderBottom: "1px solid #cbd5e1" }}>
                    <MDTypography variant="caption" display="block">Date: {draft.date} · Vehicle: {draft.vehicle}</MDTypography>
                    {[...groups.entries()].map(([key, group]) => <MDBox key={key} display="flex" justifyContent="space-between" gap={1} py={0.5}>
                      <Checkbox size="small" disabled={saving}
                        checked={group.ids.every((id) => removeIds.includes(id))}
                        indeterminate={group.ids.some((id) => removeIds.includes(id)) && !group.ids.every((id) => removeIds.includes(id))}
                        onChange={() => toggleDraftArea(group.ids)}
                        inputProps={{ "aria-label": "Select " + group.area + " / " + group.company + " for " + draft.name + " on " + draft.date }} />
                      <MDBox><MDTypography variant="button" display="block">{group.area}</MDTypography><MDTypography variant="caption">{group.company}</MDTypography></MDBox>
                      <MDTypography variant="button" sx={{ whiteSpace: "nowrap" }}>{group.count} bills</MDTypography>
                    </MDBox>)}
                    <MDButton size="small" color="error" disabled={saving || !draft.rows.some((row) => removeIds.includes(String(row.id)))} onClick={() => removeSelectedAreas(draft.id)}>Remove selected areas</MDButton>
                  </MDBox>;
                })}
                <MDTypography variant="button" sx={{ mt: "auto", p: 1, backgroundColor: "#fef3c7", fontWeight: 700 }}>Total: {batches.reduce((total, draft) => total + draft.rows.length, 0)} bills</MDTypography>
              </MDBox>;
            })}
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDTypography variant="button" sx={{ mr: "auto", pl: 1 }}>Total: {stagedIds.size} bills</MDTypography>
          <MDButton color="info" variant="outlined" disabled={saving || !drafts.length} onClick={() => {
            try { setError(""); printDeliveryAssignmentsPdf(drafts); }
            catch (err) { setError(err.message); }
          }}>Download PDF</MDButton>
          <MDButton color="secondary" disabled={saving} onClick={() => setViewOpen(false)}>Back</MDButton>
          <MDButton color="info" variant="gradient" disabled={saving || !drafts.length} onClick={submit}>{saving ? "Submitting…" : "Submit"}</MDButton>
        </DialogActions>
      </Dialog>
    </MDBox><Footer /></DashboardLayout>
  );
}
