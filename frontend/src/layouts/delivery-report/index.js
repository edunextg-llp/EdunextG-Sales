// Delivery Manager > Report: Tailwind CSS (no MUI). Route selection, drafts, assign / submit and suspense logic unchanged.
import { reportAreaName } from "utils/areaName";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { notifySalesUpdated, useSalesPolling } from "utils/salesSync";
import { boxCount, packetCount, buildDeliveryLog, deliveryLogColors } from "utils/deliveryLog";
import PackBadges from "./PackBadges";
import { printDeliveryAssignmentsPdf } from "utils/printDeliveryAssignmentsPdf";
import BillDetailsDialog from "./BillDetailsDialog";
import AssignmentHistory from "./AssignmentHistory";
import DeliveryStatusReport from "./DeliveryStatusReport";
import PendingDeliveries from "./PendingDeliveries";
import DeliveryTransfers from "./DeliveryTransfers";
import { selectedAssignments, remainingAssignments, toggleAssignmentSelection } from "utils/deliveryAssignmentSelection";
import { COMPANY_TYPES, useCompanyTypeLookup } from "utils/companyTypes";
import {
  Card, Field, Icon, Modal, Notice, PageHeader, Segmented, StatBox, TriCheck, btn, fieldClass,
} from "components/tw";

const API = (process.env.REACT_APP_API_URL);
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
export default function DeliveryReport() {
  const [sales, setSales] = useState([]);
  const [boys, setBoys] = useState([]);
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [removeIds, setRemoveIds] = useState([]);
  const [viewBill, setViewBill] = useState(null);
  const [viewGroup, setViewGroup] = useState(null);
  const [boy, setBoy] = useState("");
  const [assigneeType, setAssigneeType] = useState("");
  const [assigneeCompany, setAssigneeCompany] = useState("");
  const [assigneeCompanyType, setAssigneeCompanyType] = useState("");
  const { matches: companyMatchesType } = useCompanyTypeLookup();
  const marketingStaff = boys.filter((person) => String(person.id).startsWith("staff:") && (!person.staff_category || person.staff_category === "company_staff"));
  const staffCompanyIds = (person) => String(person.company_ids || person.company_id || "").split(",").map((id) => id.trim()).filter(Boolean);
  const companyMap = new Map();
  marketingStaff.forEach((person) => {
    const names = String(person.company_name || "").split(",").map((name) => name.trim());
    staffCompanyIds(person).forEach((id, index) => companyMap.set(id, names[index] || `Company ${id}`));
  });
  const assigneeCompanies = [...companyMap.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .filter(([id]) => companyMatchesType(id, assigneeCompanyType));
  const eligibleAssignees = assigneeType === "delivery_boy"
    ? boys.filter((person) => !String(person.id).startsWith("staff:"))
    : marketingStaff.filter((person) => assigneeCompany && staffCompanyIds(person).includes(assigneeCompany));
  const [date, setDate] = useState(today);
  const [vehicle, setVehicle] = useState("");
  const [saving, setSaving] = useState(false);
  const [suspenseBusy, setSuspenseBusy] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [routeId, setRouteId] = useState("");
  const [suspenseFeedback, setSuspenseFeedback] = useState("");
  const [suspenseReason, setSuspenseReason] = useState("");
  const [message, setMessage] = useState("");
  const [historyTab, setHistoryTab] = useState("assignments");
  const busy = useRef(false);
  const load = useCallback(async () => {
    try {
      const responses = await Promise.all([fetch(API + "/staff/sales/by-date"), fetch(API + "/delivery-boy"), fetch(API + "/staff")]);
      if (responses.some((r) => !r.ok)) throw new Error("Unable to load delivery report");
      const [rows, staff, companyStaff] = await Promise.all(responses.map((r) => r.json()));
      setSales(rows.filter((row) => Number(row.in_suspense) !== 1)); setBoys([...staff.filter((b) => b.role === "delivery_boy" && Number(b.is_active) === 1), ...companyStaff.filter((person) => Number(person.is_active) === 1).map((person) => ({ ...person, id: "staff:" + person.id, name: person.name + " (Company staff)" }))]);
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const [routeError, setRouteError] = useState("");
  useEffect(() => {
    // Send the login token explicitly: this page may call a server other than
    // the one the global fetch interceptor adds tokens for.
    const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
    fetch(API + "/staff/routes", { headers: token ? { Authorization: "Bearer " + token } : {} })
      .then(async (response) => {
        const rows = await response.json().catch(() => null);
        if (!response.ok) throw new Error((rows && rows.error) || "server returned " + response.status);
        const list = Array.isArray(rows) ? rows : [];
        setRoutes(list);
        setRouteError(list.length ? "" : "No routes yet. Create them in Staff Management → Create Route.");
      })
      .catch((err) => { setRoutes([]); setRouteError("Routes could not be loaded: " + err.message); });
  }, []);
  useSalesPolling(load);
  const stagedIds = useMemo(() => new Set(drafts.flatMap((draft) => draft.rows.map((row) => String(row.id)))), [drafts]);
  const availableSales = useMemo(() => sales.filter((row) => !stagedIds.has(String(row.id))), [sales, stagedIds]);
  // Area delivery priority from routes: the selected route first, then the
  // other routes (R 1, R 2 ...), each in its area priority order.
  const areaOrder = useMemo(() => {
    const ordered = [...routes].sort((a, b) =>
      Number(String(b.id) === String(routeId)) - Number(String(a.id) === String(routeId))
      || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
    return [...new Set(ordered.flatMap((route) => (route.areas || []).map((area) => reportAreaName(area))))];
  }, [routes, routeId]);
  const areaRank = useMemo(() => new Map(areaOrder.map((area, index) => [area, index])), [areaOrder]);
  // Same priority without a selected route (R 1, R 2 ...) for saved assignments.
  const routeAreaOrder = useMemo(() => [...new Set([...routes]
    .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }))
    .flatMap((route) => (route.areas || []).map((area) => reportAreaName(area))))], [routes]);
  const byPriority = useCallback((a, b) => {
    const rankA = areaRank.has(reportAreaName(a.location_name)) ? areaRank.get(reportAreaName(a.location_name)) : Number.MAX_SAFE_INTEGER;
    const rankB = areaRank.has(reportAreaName(b.location_name)) ? areaRank.get(reportAreaName(b.location_name)) : Number.MAX_SAFE_INTEGER;
    return rankA - rankB || reportAreaName(a.location_name).localeCompare(reportAreaName(b.location_name));
  }, [areaRank]);
  const pending = useMemo(() => [...new Map(availableSales.filter((row) => ["packing_done", "returned"].includes(row.packaging_status)).map((row) => [String(row.id), row])).values()].sort(byPriority), [availableSales, byPriority]);
  const draftBoys = [...new Set(drafts.map((draft) => draft.boy))];
  const billsForRoute = (route) => {
    const areas = new Set((route?.areas || []).map((area) => reportAreaName(area)));
    return pending.filter((row) => areas.has(reportAreaName(row.location_name)));
  };
  // Choosing a route selects all its pending bills; then use Assign as usual.
  // To send one bill to another delivery boy, untick it (eye icon) before Assign.
  const selectRoute = (value) => {
    setRouteId(value);
    const route = routes.find((item) => String(item.id) === String(value));
    if (!route) return;
    const ids = billsForRoute(route).map((row) => String(row.id));
    setSelected(ids);
    setError("");
    setMessage(ids.length
      ? route.name + ": " + ids.length + " bills selected. Click Assign to choose the delivery boy or company staff."
      : route.name + " has no pending bills.");
  };
  const chosen = pending.filter((row) => selected.includes(String(row.id)));
  const selectedDrafts = selectedAssignments(drafts, removeIds);
  const selectedBillCount = selectedDrafts.reduce((sum, draft) => sum + draft.rows.length, 0);
  const cellBills = (type, cells, column) => {
    if (!column || !["counts", "summary", "total"].includes(type)) return [];
    const company = type === "counts" || type === "summary" ? cells[0] : null;
    const area = (type === "counts" || cells[0] === "Area totals") && column < report.width - 1 ? report.rows[0].cells[column] : null;
    return pending.filter((row) => (!company || String(row.company_name || "Company not assigned").trim() === company) && (!area || reportAreaName(row.location_name) === area));
  };
  const toggle = (rows) => { const ids = rows.map((row) => String(row.id)); setSelected((prev) => ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]); };
  const stage = () => {
    if (busy.current || !chosen.length) return;
    if (!assigneeType || !eligibleAssignees.some((person) => String(person.id) === boy)) { setError("Choose an assignment type and an employee from the selected company."); return; }
    if (!boy || !date || !vehicle.trim()) { setError("Select delivery boy or company staff, date and vehicle number."); return; }
    setDrafts((prev) => [...prev, { id: Date.now(), boy, name: boys.find((person) => String(person.id) === boy)?.name || "Delivery Boy", date, vehicle: vehicle.trim(), rows: chosen }]);
    setSelected([]); setRouteId(""); setOpen(false); setError("");
    setMessage(chosen.length + " bills added to View. Use Submit in View to send assignments.");
  };
  const toggleDraftArea = (ids) => {
    if (busy.current) return;
    setRemoveIds((prev) => toggleAssignmentSelection(prev, ids));
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
    if (busy.current || !selectedBillCount) return;
    busy.current = true; setSaving(true); setError(""); setMessage("");
    const moved = []; const failed = [];
    for (const draft of selectedDrafts) {
    for (const row of draft.rows) {
      try {
        const response = await fetch(API + "/staff/sales/" + row.id + "/packaging", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packagingStatus: "out_for_delivery", expectedStatus: row.packaging_status, deliveryBoyId: String(draft.boy).startsWith("staff:") ? null : Number(draft.boy), deliveryStaffId: String(draft.boy).startsWith("staff:") ? Number(String(draft.boy).slice(6)) : null, deliveryDate: draft.date, vehicleNo: draft.vehicle }),
        });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Assignment failed"); }
        moved.push(String(row.id));
      } catch (err) { failed.push(String(row.invoice_number || row.id) + ": " + err.message); }
    }
    }
    // Hide successful bills immediately, even if the refresh fails.
    setSales((prev) => prev.filter((row) => !moved.includes(String(row.id))));
    setDrafts((prev) => remainingAssignments(prev, moved, removeIds));
    setRemoveIds([]);
    setMessage(moved.length + " bills assigned and sent to the assigned employees’ apps.");
    if (failed.length) setError(failed.join("; "));
    notifySalesUpdated(); await load(); busy.current = false; setSaving(false);
  };
  const report = useMemo(() => buildDeliveryLog(availableSales, { hideEmptyAreas: true, areaOrder }), [availableSales, areaOrder]);
  const groupBills = viewGroup ? pending.filter((row) => viewGroup.ids.includes(String(row.id))) : [];
  const groupSelectedCount = groupBills.filter((row) => selected.includes(String(row.id))).length;
  const moveGroupToSuspense = async () => {
    const saleIds = groupBills.filter((row) => selected.includes(String(row.id))).map((row) => row.id);
    if (busy.current || !saleIds.length) return;
    if (!suspenseReason.trim()) { setSuspenseFeedback("Enter the reason for moving these bills to Suspense."); return; }
    busy.current = true;
    setSaving(true);
    setSuspenseBusy(true);
    setSuspenseFeedback("");
    try {
      const response = await fetch(`${API}/staff/sales/suspense`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ saleIds, suspense: true, reason: suspenseReason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to move bills to Suspense.");
      setSuspenseReason("");
      if (data.pendingApproval) {
        setSelected((current) => current.filter((id) => !saleIds.map(String).includes(String(id))));
        setSuspenseFeedback(data.message);
        setMessage(data.message);
        return;
      }
      const moved = new Set((data.movedIds || []).map(String));
      setSales((current) => current.filter((row) => !moved.has(String(row.id))));
      setSelected((current) => current.filter((id) => !moved.has(String(id))));
      const feedback = `${moved.size} bill(s) moved to Suspense.${data.skippedIds?.length ? ` ${data.skippedIds.length} skipped because their status changed.` : ""}`;
      setSuspenseFeedback(feedback);
      setMessage(feedback);
      notifySalesUpdated();
      await load();
    } catch (requestError) {
      setSuspenseFeedback(requestError.message || "Unable to move bills to Suspense.");
    } finally {
      busy.current = false;
      setSaving(false);
      setSuspenseBusy(false);
    }
  };
  const [error, setError] = useState("");
  const head = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const cell = "border-t border-slate-100 px-3 py-2 text-[12.5px]";
  const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const isIn = (row) => selected.includes(String(row.id));
  const closeGroup = () => { if (!saving) { setViewGroup(null); setSuspenseFeedback(""); } };
  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Delivery Report"
          description="Pending deliveries by company and area. Tick bills (or pick a route), Assign them to a delivery boy or company staff, then Submit from View."
          actions={(
            <>
              <Field label="Route" width="w-56">
                <select className={fieldClass} value={routeId} disabled={saving || !routes.length} onChange={(event) => selectRoute(event.target.value)}>
                  <option value="" disabled>Select route</option>
                  {routes.map((route) => <option key={route.id} value={String(route.id)}>{route.name} ({billsForRoute(route).length} bills)</option>)}
                </select>
              </Field>
              <button type="button" className={btn.outline} onClick={() => setViewOpen(true)}>
                <Icon name="visibility" className="text-[18px]" />View ({stagedIds.size})
              </button>
              <button type="button" className={btn.primary} disabled={saving || !chosen.length} onClick={() => { setError(""); setOpen(true); }}>
                <Icon name="local_shipping" className="text-[18px]" />Assign ({chosen.length})
              </button>
            </>
          )}
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <StatBox label="Pending bills" value={report.total} icon="receipt_long" />
          <StatBox label="Boxes" value={boxCount(pending)} icon="inventory_2" />
          <StatBox label="Packets" value={packetCount(pending)} icon="shopping_bag" />
          <StatBox label="Selected" value={chosen.length} icon="check_box" />
          <StatBox label="In drafts" value={stagedIds.size} icon="drafts" />
        </div>

        <div className="mb-4 space-y-2">
          {routeError && <Notice tone="warning">{routeError}</Notice>}
          {message && <Notice tone="success" onClose={() => setMessage("")}>{message}</Notice>}
          {error && <Notice tone="error" onClose={() => setError("")}>{error}</Notice>}
        </div>

        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="m-0 text-[15px] font-semibold text-slate-900">Pending Deliveries by company and area</h3>
              <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">All companies • Packed and returned bills awaiting delivery. Tick a cell to select its bills; the eye opens them one by one.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-500"><span className="size-3 rounded bg-green-100 ring-1 ring-green-300" />Has selected bills</span>
          </div>
          {!report.companyCount ? <p className="m-0 px-4 py-14 text-center text-[13px] text-slate-400">No delivery data available.</p> : (
            <div className="max-h-[72vh] overflow-auto">
              <table aria-label="Pending delivery bills by company and area" className="table-fixed border-collapse" style={{ width: 160 + (report.width - 1) * 95 }}>
                <colgroup>
                  <col style={{ width: 160 }} />
                  {Array.from({ length: report.width - 1 }, (_, index) => <col key={index} style={{ width: 95 }} />)}
                </colgroup>
                <tbody>
                  {report.rows.slice(0, report.rows.findIndex((row) => row.type === "spacer")).map(({ type, cells }, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={index}>
                      {(type === "section" || type === "spacer" ? [cells[0] || ""] : cells).map((value, column) => {
                        const bills = typeof value === "number" ? cellBills(type, cells, column) : [];
                        const selectedCount = bills.filter((row) => selected.includes(String(row.id))).length;
                        const where = `${cells[0]} / ${report.rows[0].cells[column] || "Total"}`;
                        return (
                          <td
                            // eslint-disable-next-line react/no-array-index-key
                            key={column}
                            colSpan={type === "section" ? 2 : type === "spacer" ? report.width : 1}
                            className={`px-1 text-[12px] leading-tight text-slate-800 [overflow-wrap:anywhere] ${type === "spacer" ? "border-0 py-0.5" : "border border-slate-300 py-1"} ${["section", "header", "total"].includes(type) ? "font-bold" : ""} ${column === 0 ? "text-left" : "text-center"} ${column === 0 && !["section", "spacer"].includes(type) ? "sticky left-0 z-[1] w-40" : ""}`}
                            style={{ backgroundColor: selectedCount > 0 ? "#dcfce7" : `#${deliveryLogColors[type]}` }}
                          >
                            {typeof value === "number" ? (
                              <div>
                                <div className="flex items-center justify-center gap-1">
                                  <TriCheck
                                    disabled={saving || value === 0}
                                    checked={value > 0 && bills.every(isIn)}
                                    indeterminate={bills.some(isIn) && !bills.every(isIn)}
                                    onChange={() => toggle(cellBills(type, cells, column))}
                                    label={"Select bills: " + where}
                                  />
                                  <span className="font-semibold tabular-nums">{value}</span>
                                  <button
                                    type="button" disabled={saving || value === 0} title="View and select bills" aria-label={`View bills: ${where}`}
                                    className="inline-flex size-5 items-center justify-center rounded text-slate-500 hover:bg-white/70 hover:text-blue-700 disabled:opacity-30"
                                    onClick={() => setViewGroup({ title: where, ids: cellBills(type, cells, column).map((row) => String(row.id)) })}
                                  >
                                    <Icon name="visibility" className="text-[15px]" />
                                  </button>
                                </div>
                                {value > 0 && <PackBadges rows={bills} compact />}
                                {selectedCount > 0 && <span className="mt-0.5 block whitespace-nowrap text-[10px] font-bold text-green-800">{selectedCount}/{bills.length} selected</span>}
                              </div>
                            ) : value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="mb-3">
          <Segmented
            label="Report sections" value={historyTab} onChange={setHistoryTab}
            options={[["assignments", "Date-wise Assigned Orders"], ["pending", "Pending Deliveries"], ["transfers", "Transfers"], ["download", "Download Report"]]}
          />
        </div>
        {historyTab === "assignments" && <AssignmentHistory api={API} onViewBill={setViewBill} areaOrder={routeAreaOrder} boys={boys} />}
        {historyTab === "pending" && <PendingDeliveries api={API} />}
        {historyTab === "transfers" && <DeliveryTransfers api={API} />}
        {historyTab === "download" && <DeliveryStatusReport api={API} />}
      </div>
      <Footer />

      {/* Bills of one report cell: select them or move them to Suspense */}
      <Modal
        open={Boolean(viewGroup)} onClose={closeGroup} locked={saving} size="xl" title={`${viewGroup?.title || ""} — Pending bills`}
        actions={(
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="mr-auto text-[12px] text-slate-500">
              Selected here: <b className="text-slate-800">{groupSelectedCount} / {groupBills.length}</b> · Boxes: {boxCount(groupBills.filter(isIn))} / {boxCount(groupBills)} · Packets: {packetCount(groupBills.filter(isIn))} / {packetCount(groupBills)} · Total selected: <b className="text-slate-800">{chosen.length}</b> ({boxCount(chosen)} boxes, {packetCount(chosen)} packets)
            </span>
            <button type="button" className={`${btn.primary} bg-amber-500 hover:bg-amber-600`} disabled={saving || !groupSelectedCount || !suspenseReason.trim()} onClick={moveGroupToSuspense}>
              <Icon name="pause_circle" className="text-[18px]" />{suspenseBusy ? "Moving…" : `Suspense (${groupSelectedCount})`}
            </button>
            <button type="button" className={btn.primary} disabled={saving} onClick={closeGroup}>Done</button>
          </div>
        )}
      >
        <p className="m-0 mb-1 text-[12.5px] text-slate-600">Select bills, then click Done to choose more from another area or company. When finished, use the Assign button at the top of the report.</p>
        <p className="m-0 mb-3 text-[12.5px] text-slate-600">Suspense moves only the selected bills in this window out of Pending Deliveries. A reason is required; unless you are admin, the request goes to admin and the bills move after approval.</p>
        <label className="mb-3 flex flex-col gap-1">
          <span className={label}>Reason for Suspense</span>
          <textarea rows={1} maxLength={1000} disabled={saving} className={`${fieldClass} h-auto py-2`} value={suspenseReason} onChange={(event) => setSuspenseReason(event.target.value)} />
        </label>
        {suspenseFeedback && <p role="status" className="m-0 mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700">{suspenseFeedback}</p>}
        <div className="max-h-[45vh] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[700px] border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${head} w-10`}>
                  <TriCheck
                    disabled={saving || !groupBills.length} checked={groupBills.length > 0 && groupSelectedCount === groupBills.length}
                    indeterminate={groupSelectedCount > 0 && groupSelectedCount < groupBills.length} onChange={() => toggle(groupBills)} label="Select all bills in this group"
                  />
                </th>
                {["Invoice number", "Outlet name", "Area"].map((h) => <th key={h} className={head}>{h}</th>)}
                <th className={`${head} text-center`}>Boxes</th>
                <th className={`${head} text-center`}>Packets</th>
                <th className={`${head} text-right`}>Price</th>
              </tr>
            </thead>
            <tbody>
              {groupBills.map((row) => (
                <tr key={row.id} className={isIn(row) ? "bg-blue-50/60" : "hover:bg-slate-50"}>
                  <td className={cell}><input type="checkbox" className="size-4 accent-blue-600" disabled={saving} checked={isIn(row)} onChange={() => toggle([row])} aria-label={`Select invoice ${row.invoice_number || row.id}`} /></td>
                  <td className={`${cell} font-mono`}>{row.invoice_number || "N/A"}</td>
                  <td className={`${cell} font-medium text-slate-800`}>{row.outlet_name || "Outlet not assigned"}</td>
                  <td className={cell}>{reportAreaName(row.location_name)}</td>
                  <td className={`${cell} text-center tabular-nums`}>{row.box_count ?? "—"}</td>
                  <td className={`${cell} text-center tabular-nums`}>{row.packet_count ?? "—"}</td>
                  <td className={`${cell} whitespace-nowrap text-right font-semibold tabular-nums`}>Rs. {Number(row.price || 0).toFixed(2)}</td>
                </tr>
              ))}
              {!groupBills.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-slate-400">No pending bills remain in this group.</td></tr>}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Assign the selected bills (adds them to a draft) */}
      <Modal
        open={open} onClose={() => setOpen(false)} locked={saving} title={`Assign ${chosen.length} bills`}
        actions={(
          <>
            <button type="button" className={btn.ghost} disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className={btn.primary} disabled={saving || !chosen.length} onClick={stage}>Add to View</button>
          </>
        )}
      >
        <div className="space-y-3">
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Assign to" width="w-full">
            <select className={fieldClass} value={assigneeType} disabled={saving} onChange={(event) => { setAssigneeType(event.target.value); setAssigneeCompany(""); setBoy(""); setError(""); }}>
              <option value="" disabled>Select</option>
              <option value="delivery_boy">Delivery Boy</option>
              <option value="marketing_staff">Marketing Staff</option>
            </select>
          </Field>
          {assigneeType === "marketing_staff" && (
            <Field label="Company type *" width="w-full">
              <select
                id="report-assignee-company-type" className={fieldClass} value={assigneeCompanyType} disabled={saving}
                onChange={(event) => {
                  const type = event.target.value;
                  setAssigneeCompanyType(type);
                  if (assigneeCompany && type && !companyMatchesType(assigneeCompany, type)) {
                    setAssigneeCompany("");
                    setBoy("");
                  }
                }}
              >
                <option value="">Select company type</option>
                {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </Field>
          )}
          {assigneeType === "marketing_staff" && (
            <Field label="Company" width="w-full">
              <select className={fieldClass} value={assigneeCompany} disabled={saving || !assigneeCompanyType} onChange={(event) => { setAssigneeCompany(event.target.value); setBoy(""); }}>
                <option value="" disabled>Select company</option>
                {assigneeCompanies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                {!assigneeCompanies.length && <option disabled>No {assigneeCompanyType === "cnf" ? "CNF" : "Distributor"} companies with active marketing staff</option>}
              </select>
            </Field>
          )}
          {(assigneeType === "delivery_boy" || (assigneeType === "marketing_staff" && assigneeCompany)) && (
            <Field label={assigneeType === "delivery_boy" ? "Delivery boy" : "Staff name"} width="w-full">
              <select className={fieldClass} value={boy} disabled={saving} onChange={(event) => setBoy(event.target.value)}>
                <option value="" disabled>Select</option>
                {eligibleAssignees.map((person) => <option key={person.id} value={String(person.id)}>{person.name.replace(/ \(Company staff\)$/, "")}</option>)}
                {!eligibleAssignees.length && <option disabled>No active staff available</option>}
              </select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Delivery date" width="w-full"><input type="date" className={fieldClass} value={date} disabled={saving} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Vehicle number" width="w-full"><input className={fieldClass} value={vehicle} disabled={saving} onChange={(event) => setVehicle(event.target.value)} /></Field>
          </div>
          <p className="m-0 text-[12px] text-slate-500">This adds bills to your draft. Open View and Submit to send them to the assigned employee’s app. Drafts remain here until you leave or reload this page.</p>
        </div>
      </Modal>

      {/* Draft assignments: review, untick, download PDF, submit */}
      <Modal
        open={viewOpen} onClose={() => setViewOpen(false)} locked={saving} size="xl" title="View Assignments"
        actions={(
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="mr-auto text-[12.5px] text-slate-600">
              Selected: <b>{selectedBillCount}</b> of {stagedIds.size} bills · {selectedDrafts.reduce((total, draft) => total + boxCount(draft.rows), 0)} boxes · {selectedDrafts.reduce((total, draft) => total + packetCount(draft.rows), 0)} packets
            </span>
            <button
              type="button" className={btn.outline} disabled={saving || !selectedBillCount}
              onClick={() => {
                try { setError(""); printDeliveryAssignmentsPdf(selectedDrafts); }
                catch (err) { setError(err.message); }
              }}
            >
              <Icon name="picture_as_pdf" className="text-[18px]" />Download PDF
            </button>
            <button type="button" className={btn.ghost} disabled={saving} onClick={() => setViewOpen(false)}>Back</button>
            <button type="button" className={btn.primary} disabled={saving || !selectedBillCount} onClick={submit}>{saving ? "Submitting…" : `Submit (${selectedBillCount})`}</button>
          </div>
        )}
      >
        <div className="mb-3 space-y-2">
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
        <p className="m-0 mb-2 text-[12.5px] text-slate-600">All bills are selected by default. Unselect any bill you do not want to assign. Submit assigns only selected bills and returns unselected bills to Report. Use the eye icon to view bill details and items.</p>
        <label className="mb-3 inline-flex items-center gap-2 text-[13px] font-semibold text-slate-700">
          <TriCheck
            disabled={saving || !stagedIds.size} checked={stagedIds.size > 0 && selectedBillCount === stagedIds.size}
            indeterminate={selectedBillCount > 0 && selectedBillCount < stagedIds.size}
            onChange={(event) => setRemoveIds(event.target.checked ? [] : [...stagedIds])} label="Select all draft bills"
          />
          Select all ({selectedBillCount}/{stagedIds.size})
        </label>
        {!drafts.length && <p className="m-0 py-8 text-center text-[13px] text-slate-400">No draft assignments. Select bills in Report and click Assign.</p>}
        <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
          {draftBoys.map((boyId) => {
            const batches = drafts.filter((draft) => draft.boy === boyId);
            const kept = (rows) => rows.filter((row) => !removeIds.includes(String(row.id)));
            return (
              <div key={boyId} className="flex min-w-[280px] flex-[1_0_280px] flex-col overflow-hidden rounded-xl border border-slate-200">
                <h4 className="m-0 flex items-center gap-2 bg-cyan-50 px-3 py-2 text-[13.5px] font-semibold text-cyan-900">
                  <Icon name="person" className="text-[18px]" />{batches[0].name}
                </h4>
                {batches.map((draft) => {
                  const groups = new Map();
                  draft.rows.forEach((row) => {
                    const company = String(row.company_name || "Company not assigned").trim();
                    const area = reportAreaName(row.location_name);
                    const key = JSON.stringify([company, area]);
                    const group = groups.get(key) || { company, area, count: 0, ids: [], rows: [] };
                    group.count += 1; group.ids.push(String(row.id)); group.rows.push(row); groups.set(key, group);
                  });
                  return (
                    <div key={draft.id} className="border-b border-slate-100 p-3">
                      <p className="m-0 mb-2 text-[11.5px] text-slate-500">Date: <b className="text-slate-700">{draft.date}</b> · Vehicle: <b className="text-slate-700">{draft.vehicle}</b></p>
                      {[...groups.entries()].map(([key, group]) => (
                        <div key={key} className="py-1">
                          <div className="flex items-start gap-2">
                            <TriCheck
                              disabled={saving} checked={group.ids.every((id) => !removeIds.includes(id))}
                              indeterminate={group.ids.some((id) => removeIds.includes(id)) && !group.ids.every((id) => removeIds.includes(id))}
                              onChange={() => toggleDraftArea(group.ids)} label={"Select " + group.area + " / " + group.company + " for " + draft.name + " on " + draft.date}
                            />
                            <span className="min-w-0 grow">
                              <span className="block text-[13px] font-semibold text-slate-900">{group.area}</span>
                              <span className="block text-[11.5px] text-slate-500">{group.company}</span>
                            </span>
                            <span className="text-right">
                              <span className="block whitespace-nowrap text-[12px] font-semibold text-slate-700">{group.ids.filter((id) => !removeIds.includes(id)).length}/{group.count} bills</span>
                              <PackBadges rows={kept(group.rows)} />
                            </span>
                          </div>
                          {group.rows.map((row) => (
                            <div key={row.id} className="flex items-center gap-2 py-1 pl-6">
                              <input type="checkbox" className="size-4 accent-blue-600" disabled={saving} checked={!removeIds.includes(String(row.id))} onChange={() => toggleDraftArea([String(row.id)])} aria-label={"Assign bill " + (row.invoice_number || row.id)} />
                              <span className="min-w-0 grow text-[11.5px] leading-tight">
                                <span className="block font-mono text-slate-700">Bill: {row.invoice_number || row.id}</span>
                                <span className="block truncate text-slate-500">{row.outlet_name || "Outlet not assigned"}</span>
                              </span>
                              <span className="whitespace-nowrap text-[11px] text-slate-500">{row.box_count ?? 0} box · {row.packet_count ?? 0} pkt</span>
                              <button type="button" className={`${btn.icon} size-7 hover:text-blue-700`} title="View bill details" aria-label={"View bill " + (row.invoice_number || row.id)} onClick={() => setViewBill({ row, draft })}>
                                <Icon name="visibility" className="text-[17px]" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ))}
                      <button type="button" className={`${btn.outline} mt-2 h-8 px-3 text-red-600`} disabled={saving || !draft.rows.some((row) => removeIds.includes(String(row.id)))} onClick={() => removeSelectedAreas(draft.id)}>
                        <Icon name="remove_circle_outline" className="text-[16px]" />Remove unselected bills
                      </button>
                    </div>
                  );
                })}
                <p className="m-0 mt-auto bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-900">
                  Selected: {batches.reduce((total, draft) => total + kept(draft.rows).length, 0)} bills · {batches.reduce((total, draft) => total + boxCount(kept(draft.rows)), 0)} boxes · {batches.reduce((total, draft) => total + packetCount(kept(draft.rows)), 0)} packets
                </p>
              </div>
            );
          })}
        </div>
      </Modal>

      <BillDetailsDialog bill={viewBill} onClose={() => setViewBill(null)} api={API} />
    </DashboardLayout>
  );
}
