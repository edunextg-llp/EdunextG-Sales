import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdAdd, MdAssignmentInd, MdCheck, MdClose, MdDeleteOutline, MdEdit, MdRefresh, MdSave, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { COMPANY_TYPES, ConfirmDialog, EditDialog, ExcelButton, Field, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";
import ItemPicker from "../components/purchase/ItemPicker";
import { physicalStockByAssignment } from "../menu";
import { downloadExcel, fileSafe } from "../utils/excel";
import { erpKey, qty, rupees, showDate, todayLocal } from "../utils/purchaseCalc";

// Physical Stock: count what is on the shelf, laid out like Add Purchase.
// Company comes first and its type (Distributor / CNF) is filled in from it.
// Only quantities are entered here: no DP, sale prices or margins.
// Saved through the main site's /physical-stock/manual, which also makes the count the
// item's current stock.

const num = (v) => Number(v) || 0;

const emptyLine = () => ({
  productErpId: "",
  productName: "",
  variantName: "",
  hsnCode: "",
  itemCode: "",
  pcsPerBox: "",
  mrp: "",
  batchNumber: "",
  mfgDate: "",
  expiryDate: "",
  boxes: "",
  loose: "",
});

// DATE columns arrive as UTC timestamps (e.g. 2026-11-10T18:30:00Z for 11 Nov in India):
// read them back as the local calendar day.
const localDay = (value) => {
  if (!value) return "";
  const s = String(value);
  if (!s.includes("T")) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// A line is one item at one MRP, batch and expiry (a lot). Stock that came in on another
// date with another expiry or batch is its own lot; the lines add up into the item's one
// stock row when saved. Same rule as backend/src/utils/stockLots.js.
const mrpKey = (v) => (Math.round(num(v) * 100) / 100).toFixed(2);
const batchKey = (v) => String(v || "").trim().toLowerCase();
const expKey = (v) => String(v || "").slice(0, 10);
const lotPart = (m) => `${mrpKey(m.mrp)}|${batchKey(m.batchNumber)}|${expKey(m.expiryDate)}`;
const lineKey = (l) => `${erpKey(l.productErpId)}|${lotPart(l)}`;
// Selling order: earliest expiry, then lowest MRP, then received first.
const lotOrder = (a, b) => {
  const ea = expKey(a.expiryDate || a.exp);
  const eb = expKey(b.expiryDate || b.exp);
  if (ea !== eb) return !ea ? 1 : !eb ? -1 : ea < eb ? -1 : 1;
  const byMrp = num(a.mrp) - num(b.mrp);
  if (byMrp) return byMrp;
  const ra = expKey(a.receivedDate || a.rcvd);
  const rb = expKey(b.receivedDate || b.rcvd);
  if (ra !== rb) return !ra ? 1 : !rb ? -1 : ra < rb ? -1 : 1;
  return 0;
};

// MRP / batch split of a saved count (raw_data.mrpLines from the backend).
const mrpSplit = (ps) => {
  const map = new Map();
  (ps?.mrp_lines || []).forEach((m) => {
    const k = lotPart(m);
    map.set(k, {
      mrp: num(m.mrp),
      batch: String(m.batchNumber || "").trim(),
      mfg: m.mfgDate || map.get(k)?.mfg || "",
      exp: m.expiryDate || map.get(k)?.exp || "",
      rcvd: map.get(k)?.rcvd || m.receivedDate || "",
      pcs: (map.get(k)?.pcs || 0) + num(m.pcs),
    });
  });
  return [...map.values()].sort(lotOrder);
};

// The item's saved MRP / batch lines (last count) as list entries, one per MRP + batch.
const savedLines = (it) => {
  const map = new Map();
  (it?.physical_stock?.mrp_lines || []).forEach((m) => {
    const k = lotPart(m);
    const prev = map.get(k);
    map.set(k, {
      mrp: String(num(m.mrp)),
      batchNumber: String(m.batchNumber || "").trim(),
      mfgDate: m.mfgDate || prev?.mfgDate || "",
      expiryDate: m.expiryDate || prev?.expiryDate || "",
      receivedDate: prev?.receivedDate || m.receivedDate || "",
      boxes: (prev ? num(prev.boxes) : 0) + num(m.boxes),
      loose: (prev ? num(prev.loose) : 0) + num(m.loose),
      pcs: (prev ? num(prev.pcs) : 0) + num(m.pcs),
    });
  });
  return [...map.values()].filter((m) => m.pcs > 0).sort(lotOrder);
};

// Pieces sold since the last count: sales lower the item's total but not its MRP split.
const soldSinceCount = (it) => {
  const split = savedLines(it).reduce((t, m) => t + m.pcs, 0);
  return Math.max(0, Math.round((split - num(it?.physical_stock?.total_physical_stock_in_pcs)) * 100) / 100);
};

const sameSaved = (m, l) => Boolean(num(l.mrp)) && lotPart(m) === lotPart(l);

// Lines of one item kept together, items in the order they were first added.
const groupByItem = (list) => {
  const order = [];
  const byItem = new Map();
  list.forEach((l) => {
    const k = erpKey(l.productErpId);
    if (!byItem.has(k)) {
      byItem.set(k, []);
      order.push(k);
    }
    byItem.get(k).push(l);
  });
  return order.flatMap((k) => byItem.get(k));
};

const lineQty = (l) => num(l.pcsPerBox) * num(l.boxes) + num(l.loose);

const boxesText = (pcs, perBox) => {
  const total = num(pcs);
  const box = num(perBox);
  if (!box || total <= 0) return null;
  const full = Math.floor(total / box);
  const loose = Math.round((total - full * box) * 100) / 100;
  return `${qty(full)} box${loose ? ` + ${qty(loose)}` : ""}`;
};

function ReadBox({ label, value, mono, strong }) {
  return (
    <Field label={label}>
      <input
        readOnly
        tabIndex={-1}
        title={value || ""}
        value={value || ""}
        placeholder="—"
        className={`input w-full cursor-default bg-base-200/70 ${mono ? "font-mono text-xs" : ""} ${strong ? "font-semibold" : ""}`}
      />
    </Field>
  );
}

function SlipRow({ label, value, strong, muted }) {
  return (
    <div className={`flex items-baseline gap-2 py-1 text-sm ${muted ? "text-base-content/55" : ""}`}>
      <span className="shrink-0">{label}</span>
      <span className="mb-1 flex-1 border-b border-dotted border-base-300" />
      <span className={`tabular-nums ${strong ? "text-base font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

const changeText = (now, before) => {
  const d = num(now) - num(before);
  if (!d) return "no change";
  return `${d > 0 ? "+" : "−"}${qty(Math.abs(d))} pcs`;
};

const showDateTime = (value) => {
  if (!value) return "";
  const [day, time = ""] = String(value).split(" ");
  return `${showDate(day)}${time ? ` ${time.slice(0, 5)}` : ""}`;
};

const ASSIGNEE_ROLES = ["Marketing Staff", "Bawarchee Staff", "Packaging Staff", "Delivery Boy"];

// "12/11/2026" or "12/11/2026 – 15/11/2026".
const rangeText = (a) =>
  !a?.start_date ? "" : a.start_date === a.end_date ? showDate(a.start_date) : `${showDate(a.start_date)} – ${showDate(a.end_date)}`;

const WINDOW_BADGE = {
  upcoming: { label: "Upcoming", className: "badge-info" },
  active: { label: "Active", className: "badge-success" },
  expired: { label: "Expired", className: "badge-error" },
};

function RangeBadge({ a }) {
  if (!a?.start_date) return null;
  const badge = WINDOW_BADGE[a.window_state] || WINDOW_BADGE.active;
  return (
    <span className="inline-flex items-center gap-1.5 text-base-content/70">
      {rangeText(a)}
      <span className={`badge badge-sm ${badge.className}`}>{badge.label}</span>
    </span>
  );
}

const assigneeKey = (a) => (a ? `${a.type || a.assignee_type}:${a.id ?? a.assignee_id}` : "");

export default function PhysicalStock({ user }) {
  // Without the Physical Stock permission the page works only on the companies assigned to
  // this user, through /api/my-physical-stock.
  const byAssignment = physicalStockByAssignment(user);
  const api = byAssignment ? "/my-physical-stock" : "/staff/physical-stock";
  const allCompanies = useCompanies(!byAssignment);
  const [show, flashNode] = useFlash();
  const [companyId, setCompanyId] = useState("");
  const [countDate, setCountDate] = useState(todayLocal());
  const [data, setData] = useState(null); // { dmsImportId, items }
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [line, setLine] = useState(emptyLine());
  const [lines, setLines] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toRemove, setToRemove] = useState(null);
  const lineId = useRef(0);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");

  // Assignments: the admin assigns a company's count to someone.
  const [assignments, setAssignments] = useState([]);
  const [canAssign, setCanAssign] = useState(false);
  const [assignees, setAssignees] = useState([]);
  const [assignForm, setAssignForm] = useState(null); // { id?, role, assignee, startDate, endDate, note }
  const [assignError, setAssignError] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [toClose, setToClose] = useState(null); // { assignment, status }
  // The assigned-staff list under the company is hidden unless opened (remembered).
  const [showStaff, setShowStaff] = useState(() => localStorage.getItem("dms_ps_show_staff") === "1");
  const toggleStaff = () =>
    setShowStaff((v) => {
      localStorage.setItem("dms_ps_show_staff", v ? "0" : "1");
      return !v;
    });

  // Assignment mode: only the assigned companies, and the first one opens by itself.
  const companies = useMemo(
    () =>
      byAssignment
        ? assignments.map((a) => ({ id: a.company_id, name: a.company_name, type: a.company_type, code: a.company_code }))
        : allCompanies,
    [byAssignment, assignments, allCompanies]
  );
  useEffect(() => {
    if (!byAssignment) return;
    const stillAssigned = companies.some((c) => String(c.id) === String(companyId));
    if (!stillAssigned) setCompanyId(companies[0] ? String(companies[0].id) : "");
  }, [byAssignment, companies, companyId]);

  useEffect(() => {
    if (!byAssignment) return;
    const a = assignments.find((x) => String(x.company_id) === String(companyId));
    if (!a?.start_date) return;
    const max = a.end_date < todayLocal() ? a.end_date : todayLocal();
    setCountDate((d) => (d < a.start_date ? a.start_date : d > max ? max : d));
  }, [byAssignment, assignments, companyId]);

  const company = companies.find((c) => String(c.id) === String(companyId));
  const typeLabel = COMPANY_TYPES.find((t) => t.value === company?.type)?.label || "";

  const load = useCallback(async () => {
    if (!companyId) {
      setData(null);
      return;
    }
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`${api}/company?${new URLSearchParams({ companyId, companyWide: "1" })}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load this company's items.");
      setData({ dmsImportId: body.dmsImportId, items: Array.isArray(body.items) ? body.items : [] });
    } catch (err) {
      setData(null);
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadAssignments = useCallback(async () => {
    try {
      const res = await apiFetch(byAssignment ? api : `${api}/assignments`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load assignments.");
      setAssignments(Array.isArray(body.assignments) ? body.assignments : []);
      setCanAssign(Boolean(body.canAssign));
    } catch (err) {
      setAssignments([]);
    }
  }, [byAssignment, api]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // A company can have several staff assigned, one assignment each.
  const companyAssignments = useMemo(
    () => assignments.filter((a) => String(a.company_id) === String(companyId)),
    [assignments, companyId]
  );
  // Staff of one Assign ID (same company + dates) shown together.
  const assignGroups = useMemo(() => {
    const map = new Map();
    companyAssignments.forEach((a) => {
      const code = a.assign_code || `#${a.id}`;
      if (!map.has(code)) map.set(code, { code, list: [], erps: new Set() });
      const g = map.get(code);
      g.list.push(a);
      (a.items || []).forEach((x) => g.erps.add(erpKey(x.product_erp_id)));
    });
    return [...map.values()]
      .map((g) => ({ ...g, updated: g.erps.size }))
      .sort((x, y) => String(x.list[0].start_date).localeCompare(String(y.list[0].start_date)) || x.code.localeCompare(y.code));
  }, [companyAssignments]);
  // The signed-in user's own one (assignment mode: it sets which days they can fill).
  const assignment = companyAssignments.find((a) => a.is_mine) || (byAssignment ? companyAssignments[0] || null : null);
  const myAssignments = assignments.filter((a) => a.is_mine);

  // existing: reassign that one. group: add staff to that Assign ID (same dates).
  // A new assignment starts on the count date (today if that is past).
  const openAssign = async (existing, group = null) => {
    setAssignError("");
    const startFrom = countDate && countDate >= todayLocal() ? countDate : todayLocal();
    const dates = existing || group;
    setAssignForm({
      id: existing?.id,
      assignee: existing ? assigneeKey(existing) : "",
      // New assignment: tick one or more staff.
      picked: [],
      groupCode: group?.assign_code || "",
      startDate: dates?.start_date || startFrom,
      endDate: dates?.end_date || dates?.start_date || startFrom,
      note: existing?.note || "",
    });
    // Marketing staff depend on the company, so load the list fresh each time.
    setAssignees(null);
    try {
      const res = await apiFetch(`/staff/physical-stock/assignees?${new URLSearchParams({ companyId })}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load people to assign.");
      setAssignees(Array.isArray(body.assignees) ? body.assignees : []);
    } catch (err) {
      setAssignees([]);
      setAssignError(err.message);
    }
  };

  const saveAssign = async (e) => {
    e.preventDefault();
    const editing = assignForm.id != null;
    if (editing ? !assignForm.assignee : !assignForm.picked.length) return setAssignError("Choose who to assign.");
    if (!assignForm.startDate) return setAssignError("Choose the From date.");
    if (assignForm.endDate && assignForm.endDate < assignForm.startDate) {
      return setAssignError("The To date must be on or after the From date.");
    }
    const [assigneeType, assigneeId] = (assignForm.assignee || "").split(":");
    setAssignBusy(true);
    setAssignError("");
    try {
      const res = await apiFetch(`/staff/physical-stock/assignments${editing ? `/${assignForm.id}` : ""}`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          assigneeType,
          assigneeId,
          assignees: editing
            ? undefined
            : assignForm.picked.map((key) => {
                const [type, id] = key.split(":");
                return { assigneeType: type, assigneeId: id };
              }),
          startDate: assignForm.startDate,
          endDate: assignForm.endDate || assignForm.startDate,
          note: assignForm.note,
        }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not save the assignment.");
      show(true, body.message || "Assigned.");
      setAssignForm(null);
      loadAssignments();
    } catch (err) {
      setAssignError(err.message);
    } finally {
      setAssignBusy(false);
    }
    return undefined;
  };

  const closeAssign = async () => {
    if (!toClose) return;
    setAssignBusy(true);
    try {
      const url = byAssignment ? `${api}/${toClose.assignment.id}/done` : `${api}/assignments/${toClose.assignment.id}/close`;
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toClose.status }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not close the assignment.");
      show(true, body.message || "Assignment closed.");
      setToClose(null);
      loadAssignments();
    } catch (err) {
      show(false, err.message);
    } finally {
      setAssignBusy(false);
    }
  };

  const items = useMemo(() => data?.items || [], [data]);
  const byErp = useMemo(() => new Map(items.map((it) => [erpKey(it.product_erp_id), it])), [items]);
  // Sr no. of each item in the company's full list (stays the same when the list is filtered).
  const srByErp = useMemo(() => new Map(items.map((it, i) => [erpKey(it.product_erp_id), i + 1])), [items]);


  // Shape the picker expects (same as Add Purchase's seller items).
  const pickerItems = useMemo(
    () =>
      items.map((it, i) => ({
        id: it.product_erp_id,
        product_erp_id: it.product_erp_id,
        sku_name: it.product_name,
        variant_name: it.variant_name,
        hsn_code: it.hsn_code,
        item_code: it.item_code,
        sr: i + 1,
      })),
    [items]
  );

  const changeCompany = (id) => {
    if (lines.length && !window.confirm("Change company? Items not saved yet will be cleared.")) return;
    setCompanyId(id);
    setLines([]);
    setLine(emptyLine());
    setEditingId(null);
    setError("");
  };

  const set = (field) => (e) => {
    setError("");
    setLine((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const fillFromItem = (it, keep = {}) => ({
    ...emptyLine(),
    productErpId: it.product_erp_id || "",
    productName: it.product_name || "",
    variantName: it.variant_name || "",
    hsnCode: it.hsn_code || "",
    itemCode: it.item_code || "",
    pcsPerBox: it.pcs_per_box ? String(Math.trunc(num(it.pcs_per_box))) : "",
    mrp: it.mrp ? String(it.mrp) : "",
    ...keep,
  });

  const pickItem = (picked) => {
    setError("");
    if (!picked) {
      setLine(emptyLine());
      return;
    }
    const it = byErp.get(erpKey(picked.product_erp_id));
    if (it) setLine((prev) => fillFromItem(it, { boxes: prev.boxes, loose: prev.loose }));
  };

  const pickedItem = line.productErpId
    ? pickerItems.find((p) => erpKey(p.product_erp_id) === erpKey(line.productErpId)) || null
    : null;

  const current = byErp.get(erpKey(line.productErpId));
  const lastCount = current?.physical_stock;
  const total = lineQty(line);
  // This item's other MRP lines already in the list (not the one being edited).
  const otherLines = lines.filter(
    (l) => erpKey(l.productErpId) === erpKey(line.productErpId) && l.id !== editingId && lineKey(l) !== lineKey(line)
  );
  const itemTotal = total + otherLines.reduce((t, l) => t + num(l.qty), 0);

  const resetLine = () => {
    setLine(emptyLine());
    setEditingId(null);
    setError("");
  };

  const addLine = (e) => {
    e.preventDefault();
    if (!companyId) return setError("Select a company.");
    if (!line.productErpId) return setError("Pick an item first.");
    if (line.boxes === "" && line.loose === "") return setError("Enter boxes or loose pieces (0 if none).");
    if (num(line.boxes) < 0 || num(line.loose) < 0) return setError("Quantities can't be negative.");
    if (!(num(line.mrp) > 0)) return setError("Enter a valid MRP.");
    if (line.mfgDate && line.expiryDate && line.mfgDate > line.expiryDate) return setError("Expiry date must be after MFG date.");
    if (num(line.boxes) > 0 && !num(line.pcsPerBox)) {
      return setError("This item has no '1 box = pieces' value. Enter loose pieces, or set it on Add Item.");
    }
    // Same item + same MRP replaces the earlier line; a new MRP is a new line.
    const key = lineKey(line);
    const entry = { ...line, qty: total, kept: false, id: editingId ?? ++lineId.current };
    const replaced = lines.some((l) => lineKey(l) === key && l.id !== editingId);
    // Saving replaces the item's whole count. So on the item's first line, its other MRP /
    // batch lines from the last count come into the list too (marked "Kept") instead of
    // being lost. Edit or remove any that are no longer on the shelf.
    const firstOfItem = editingId == null && !lines.some((l) => erpKey(l.productErpId) === erpKey(line.productErpId));
    const it = byErp.get(erpKey(line.productErpId));
    const kept = firstOfItem
      ? savedLines(it)
          .filter((m) => !sameSaved(m, line))
          .map((m) => ({
            ...fillFromItem(it),
            mrp: m.mrp,
            batchNumber: m.batchNumber,
            mfgDate: m.mfgDate,
            expiryDate: m.expiryDate,
            boxes: String(m.boxes),
            loose: String(m.loose),
            qty: m.pcs,
            kept: true,
            id: ++lineId.current,
          }))
      : [];
    setLines((prev) => groupByItem((() => {
      if (editingId != null) {
        return prev.filter((l) => lineKey(l) !== key || l.id === editingId).map((l) => (l.id === editingId ? entry : l));
      }
      // Same item + MRP already in the list: replace it where it is.
      const same = prev.findIndex((l) => lineKey(l) === key);
      if (same >= 0) return prev.map((l, i) => (i === same ? entry : l));
      // Another MRP of an item already in the list goes right under that item's lines,
      // so all lines of one item stay together.
      let at = prev.length;
      prev.forEach((l, i) => {
        if (erpKey(l.productErpId) === erpKey(line.productErpId)) at = i + 1;
      });
      return [...prev.slice(0, at), entry, ...kept, ...prev.slice(at)];
    })()));
    const sold = kept.length ? soldSinceCount(it) : 0;
    const keptText = kept.map((k) => `MRP ${rupees(k.mrp)}${k.batchNumber ? ` (${k.batchNumber})` : ""}`).join(", ");
    show(
      true,
      replaced
        ? `${line.productErpId} at MRP ${rupees(line.mrp)}${line.batchNumber ? `, batch ${line.batchNumber}` : ""} replaced in the list.`
        : editingId != null
          ? "Line updated."
          : kept.length
            ? `Added. Kept from last count: ${keptText}.${
                sold ? ` ${qty(sold)} pcs were sold since then, so check these quantities.` : " Edit or remove any that are gone."
              }`
            : "Added to the list."
    );
    resetLine();
    return undefined;
  };

  const editLine = (l) => {
    setLine({ ...emptyLine(), ...l });
    setEditingId(l.id);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveAll = async () => {
    if (!lines.length || !data?.dmsImportId) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${api}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dmsImportId: data.dmsImportId,
          // One entry per item; its MRP lines are added up by the backend.
          items: [...new Set(lines.map((l) => erpKey(l.productErpId)))].map((key) => {
            const group = lines.filter((l) => erpKey(l.productErpId) === key);
            return {
              productErpId: group[0].productErpId,
              stockUpdateDate: countDate,
              mrpLines: group.map((l) => ({
                mrp: num(l.mrp),
                batchNumber: String(l.batchNumber || "").trim(),
                mfgDate: l.mfgDate || "",
                expiryDate: l.expiryDate || "",
                physicalStockInCase: num(l.boxes),
                physicalStockInPcs: num(l.loose),
              })),
            };
          }),
        }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not save physical stock.");
      const itemCount = new Set(lines.map((l) => erpKey(l.productErpId))).size;
      show(true, `${itemCount} item${itemCount === 1 ? "" : "s"} saved.`);
      setLines([]);
      resetLine();
      load();
      loadAssignments();
    } catch (err) {
      show(false, err.message);
    } finally {
      setSaving(false);
    }
  };

  const totals = useMemo(
    () => lines.reduce((t, l) => ({ boxes: t.boxes + num(l.boxes), pcs: t.pcs + num(l.qty) }), { boxes: 0, pcs: 0 }),
    [lines]
  );

  // ---- company item list ----
  // Updated (green) / not updated (red): with an open assignment, an item is updated once it
  // is saved after the assignment was made; without one, once it has any count at all.
  // Several staff on one company: an item is updated when any of them (or anyone) saved it;
  // the latest save shows who.
  const updatedByErp = useMemo(() => {
    const map = new Map();
    companyAssignments
      .flatMap((a) => a.items || [])
      .forEach((x) => {
        const k = erpKey(x.product_erp_id);
        if (!map.has(k) || String(x.counted_at) > String(map.get(k).counted_at)) map.set(k, x);
      });
    return map;
  }, [companyAssignments]);
  const hasAssignments = companyAssignments.length > 0;
  const isUpdated = useCallback(
    (it) => (hasAssignments ? updatedByErp.has(erpKey(it.product_erp_id)) : Boolean(it.physical_stock)),
    [hasAssignments, updatedByErp]
  );

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((it) => {
      if (filter === "counted" && !isUpdated(it)) return false;
      if (filter === "not" && isUpdated(it)) return false;
      if (!words.length) return true;
      const hay = [it.product_erp_id, it.product_name, it.variant_name, it.hsn_code, it.item_code].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, search, filter, isUpdated]);

  const countedCount = items.filter(isUpdated).length;
  const progress = items.length ? Math.round((countedCount / items.length) * 100) : 0;

  // Stock report: one row per lot (MRP + batch + expiry) of every counted item, value at MRP,
  // with the total stock value in the bottom corner. From / To limit it to items counted on
  // those dates (empty: all).
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const reportRows = useMemo(
    () =>
      items.flatMap((it) => {
        const ps = it.physical_stock;
        if (!ps) return [];
        const day = localDay(ps.stock_update_date);
        if (reportFrom && (!day || day < reportFrom)) return [];
        if (reportTo && (!day || day > reportTo)) return [];
        const perBox = num(it.pcs_per_box || ps.pcs_per_box);
        const lots = savedLines(it);
        const parts = lots.length
          ? lots
          : num(ps.total_physical_stock_in_pcs) > 0
            ? [{ mrp: ps.mrp || it.mrp, mfgDate: "", expiryDate: "", pcs: num(ps.total_physical_stock_in_pcs) }]
            : [];
        return parts.map((m) => {
          const pcs = num(m.pcs);
          const boxes = perBox > 0 ? Math.floor(pcs / perBox) : 0;
          return {
            date: localDay(ps.stock_update_date),
            itemCode: it.item_code || "",
            skuName: it.product_name || "",
            variantName: it.variant_name || "",
            mfgDate: m.mfgDate || "",
            expiryDate: m.expiryDate || "",
            boxes,
            loose: Math.round((pcs - boxes * perBox) * 100) / 100,
            qty: pcs,
            mrp: num(m.mrp),
            value: Math.round(pcs * num(m.mrp) * 100) / 100,
          };
        });
      }),
    [items, reportFrom, reportTo]
  );
  const reportValue = reportRows.reduce((t, r) => t + r.value, 0);

  const exportStockReport = () =>
    downloadExcel({
      fileName: [
        `Physical_Stock_Report_${fileSafe(company?.name)}`,
        reportFrom || reportTo ? `${reportFrom || "start"}_to_${reportTo || todayLocal()}` : "",
      ]
        .filter(Boolean)
        .join("_"),
      title: `Physical stock report · ${company?.name || ""}${
        reportFrom || reportTo
          ? ` · counted ${reportFrom ? showDate(reportFrom) : "up to"}${reportFrom && reportTo ? " to " : " "}${
              reportTo ? showDate(reportTo) : "onwards"
            }`
          : ""
      }`,
      sheets: [
        {
          name: "Stock report",
          rows: reportRows,
          totalLabel: "Total stock value",
          columns: [
            { header: "Sr No.", value: (_, i) => i + 1, width: 8, type: "number" },
            { header: "Date", key: "date", width: 12, type: "date" },
            { header: "Generated Product ID", key: "itemCode", width: 20 },
            { header: "SKU Name", key: "skuName", width: 30 },
            { header: "Variant Name", key: "variantName", width: 30 },
            { header: "MFG Date", key: "mfgDate", width: 12, type: "date" },
            { header: "Exp Date", key: "expiryDate", width: 12, type: "date" },
            { header: "Box", key: "boxes", width: 8, type: "number", total: true },
            { header: "Pcs", key: "loose", width: 8, type: "number", total: true },
            { header: "Total Qty", key: "qty", width: 11, type: "number", total: true },
            { header: "MRP", key: "mrp", width: 10, type: "money" },
            { header: "Total Value", key: "value", width: 14, type: "money", total: true },
          ],
        },
      ],
    });

  const exportExcel = () =>
    downloadExcel({
      fileName: `Physical_Stock_${fileSafe(company?.name)}`,
      title: `Physical stock · ${company?.name || ""}`,
      sheets: [
        {
          name: "Physical stock",
          rows: shown,
          columns: [
            { header: "Sr", value: (r) => srByErp.get(erpKey(r.product_erp_id)) ?? null, width: 6, type: "number" },
            { header: "Item code", key: "item_code", width: 14 },
            { header: "Product ERP ID", key: "product_erp_id", width: 16 },
            { header: "SKU name", key: "product_name", width: 28 },
            { header: "Variant", key: "variant_name", width: 28 },
            { header: "HSN", key: "hsn_code", width: 10 },
            { header: "1 box = pcs", key: "pcs_per_box", width: 10, type: "number" },
            { header: "MRP", key: "mrp", width: 10, type: "money" },
            { header: "Boxes", value: (r) => r.physical_stock?.physical_stock_in_case ?? null, width: 9, type: "number", total: true },
            { header: "Loose pcs", value: (r) => r.physical_stock?.physical_stock_in_pcs ?? null, width: 10, type: "number", total: true },
            { header: "Total pcs", value: (r) => r.physical_stock?.total_physical_stock_in_pcs ?? null, width: 11, type: "number", total: true },
            { header: "Count date", value: (r) => localDay(r.physical_stock?.stock_update_date) || null, width: 12, type: "date" },
            { header: "Status", value: (r) => (isUpdated(r) ? "Updated" : "Not updated"), width: 13 },
            ...(hasAssignments
              ? [{ header: "Updated by", value: (r) => updatedByErp.get(erpKey(r.product_erp_id))?.counted_by_name || null, width: 20 }]
              : []),
          ],
        },
        {
          name: "MRP split",
          rows: shown.flatMap((r) =>
            (r.physical_stock?.mrp_lines || []).map((m) => ({ ...m, erp: r.product_erp_id, name: r.variant_name || r.product_name }))
          ),
          columns: [
            { header: "Product ERP ID", key: "erp", width: 16 },
            { header: "Item", key: "name", width: 30 },
            { header: "MRP", key: "mrp", width: 10, type: "money" },
            { header: "Batch no.", key: "batchNumber", width: 14 },
            { header: "MFG date", key: "mfgDate", width: 12, type: "date" },
            { header: "Expiry date", key: "expiryDate", width: 12, type: "date" },
            { header: "Boxes", key: "boxes", width: 9, type: "number", total: true },
            { header: "Loose pcs", key: "loose", width: 10, type: "number", total: true },
            { header: "Pcs", key: "pcs", width: 10, type: "number", total: true },
          ],
        },
      ],
    });

  const groups = COMPANY_TYPES.map((t) => ({ ...t, list: companies.filter((c) => c.type === t.value) }));
  const untyped = companies.filter((c) => !COMPANY_TYPES.some((t) => t.value === c.type));
  // Assignment mode: entries only on the assigned days.
  const assignedState = byAssignment ? assignment?.window_state : "active";
  const canFill = !byAssignment || assignedState === "active";
  const ready = Boolean(companyId && data && canFill);
  const countMin = byAssignment && assignment?.start_date ? assignment.start_date : undefined;
  const countMax =
    byAssignment && assignment?.end_date && assignment.end_date < todayLocal() ? assignment.end_date : todayLocal();

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Stock" title="Physical Stock">
        Pick the company, count each item on the shelf and save. Same item at another MRP: add it again with that MRP.
        The item&apos;s other MRPs from the last count stay in the list (marked Kept): edit or remove any that are gone.
      </PageHeader>

      {/* Counts assigned to the signed-in user */}
      {myAssignments.length > 0 && (
        <section className="mb-5 rounded-box border border-info/40 bg-info/10">
          <div className="flex items-center gap-2 border-b border-info/30 px-4 py-2 text-sm font-semibold">
            <MdAssignmentInd size={18} /> Assigned to you
          </div>
          <ul className="divide-y divide-info/20">
            {myAssignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
                {a.assign_code && <span className="badge badge-outline badge-sm font-mono">{a.assign_code}</span>}
                <span className="font-medium">{a.company_name}</span>
                <span className="text-base-content/60">{a.items.length} item{a.items.length === 1 ? "" : "s"} updated</span>
                <RangeBadge a={a} />
                {a.note && <span className="text-base-content/60">“{a.note}”</span>}
                <span className="ml-auto flex gap-2">
                  {String(a.company_id) !== String(companyId) && (
                    <button type="button" className="btn btn-soft btn-primary btn-xs" onClick={() => changeCompany(String(a.company_id))}>
                      Open
                    </button>
                  )}
                  <button type="button" className="btn btn-soft btn-success btn-xs" onClick={() => setToClose({ assignment: a, status: "done" })}>
                    <MdCheck size={15} /> Mark done
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Company first; its type fills in by itself */}
      <section className="mb-5 rounded-box border border-base-300 bg-base-100">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-[1fr_180px_180px]">
          <Field label="Company" required>
            <select className="select w-full" value={companyId} onChange={(e) => changeCompany(e.target.value)}>
              <option value="">Select company</option>
              {groups.map(
                (g) =>
                  g.list.length > 0 && (
                    <optgroup key={g.value} label={g.label}>
                      {g.list.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                          {c.code ? ` (${c.code})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  )
              )}
              {untyped.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <ReadBox label="Company type" value={company ? typeLabel || "Not set" : ""} strong />
          <Field label="Count date" required>
            <input type="date" className="input w-full" value={countDate} min={countMin} max={countMax} onChange={(e) => setCountDate(e.target.value)} />
          </Field>
        </div>
        {companyId && (companyAssignments.length > 0 || canAssign) && (
          <div className="border-t border-base-300 text-sm">
            {/* One line: how many staff, Show / Hide, Assign. */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <MdAssignmentInd size={18} className="text-base-content/50" />
              {companyAssignments.length ? (
                <span className="text-base-content/70">
                  <b className="text-base-content">{companyAssignments.length}</b> staff assigned
                  {assignGroups.length ? ` · ${assignGroups.map((g) => g.code).join(", ")}` : ""}
                </span>
              ) : (
                <span className="text-base-content/60">Nobody is assigned to count this company.</span>
              )}
              <span className="ml-auto flex gap-2">
                {companyAssignments.length > 0 && (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={toggleStaff} aria-expanded={showStaff}>
                    {showStaff ? "Hide staff" : "Show staff"}
                  </button>
                )}
                {canAssign && (
                  <button type="button" className="btn btn-soft btn-primary btn-xs" onClick={() => openAssign(null)}>
                    <MdAssignmentInd size={15} /> {companyAssignments.length ? "New assignment" : "Assign"}
                  </button>
                )}
              </span>
            </div>
            {showStaff && assignGroups.map((group) => (
              <div key={group.code} className="border-b border-base-200">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-base-200/50 px-4 py-1.5">
                  <span className="badge badge-primary badge-sm font-mono">{group.code}</span>
                  <RangeBadge a={group.list[0]} />
                  <span className="text-xs text-base-content/60">
                    {group.list.length} staff · {group.updated} item{group.updated === 1 ? "" : "s"} updated
                  </span>
                  {canAssign && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs ml-auto"
                      title={`Add staff to ${group.code} (same dates)`}
                      onClick={() => openAssign(null, group.list[0])}
                    >
                      <MdAdd size={15} /> Add staff
                    </button>
                  )}
                </div>
            {group.list.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-base-200 px-4 py-2.5 pl-8">
                <MdAssignmentInd size={18} className="text-base-content/50" />
                <span>
                  Assigned to <b>{a.assignee_name}</b>
                  {a.is_mine && <span className="badge badge-info badge-sm ml-2">You</span>}
                </span>
                <span className="text-base-content/60">
                  {a.items.length} item{a.items.length === 1 ? "" : "s"} updated
                </span>
                {a.note && <span className="text-base-content/60">“{a.note}”</span>}
                <span className="text-base-content/60">
                  {a.assigned_by_name ? `by ${a.assigned_by_name} · ` : ""}
                  {showDateTime(a.created_at)}
                </span>
                <span className="ml-auto flex gap-2">
                  {canAssign && (
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => openAssign(a)}>
                      <MdEdit size={15} /> Reassign
                    </button>
                  )}
                  {(canAssign || a.is_mine) && (
                    <button type="button" className="btn btn-soft btn-success btn-xs" onClick={() => setToClose({ assignment: a, status: "done" })}>
                      <MdCheck size={15} /> Mark done
                    </button>
                  )}
                  {canAssign && (
                    <button type="button" className="btn btn-ghost btn-xs text-error" onClick={() => setToClose({ assignment: a, status: "cancelled" })}>
                      <MdClose size={15} /> Cancel
                    </button>
                  )}
                </span>
              </div>
            ))}
              </div>
            ))}
          </div>
        )}
        {byAssignment && assignment && !canFill && (
          <p className="border-t border-base-300 bg-warning/15 px-4 py-2 text-sm">
            {assignedState === "upcoming"
              ? `This count is assigned for ${rangeText(assignment)}. You can fill entries from ${showDate(assignment.start_date)}.`
              : `This count was assigned for ${rangeText(assignment)} only. Ask the admin to extend the dates.`}
          </p>
        )}
        {loadError && <p className="border-t border-base-300 px-4 py-2 text-sm text-error">{loadError}</p>}
      </section>

      {/* Count entry */}
      <form onSubmit={addLine} className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_270px]">
        <section className="rounded-box border border-base-300 bg-base-100">
          <div className="border-b border-base-300 px-4 py-3">
            <h2 className="font-semibold">{editingId != null ? "Edit item" : "Add item"}</h2>
            {!companyId && <p className="text-xs text-base-content/55">Select a company first.</p>}
          </div>
          <fieldset disabled={!ready || saving} className="flex flex-col gap-4 p-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-4 xl:grid-cols-[minmax(220px,1.6fr)_repeat(3,minmax(0,1fr))]">
              <Field label="Item name" required className="col-span-2 md:col-span-4 xl:col-span-1">
                <ItemPicker items={pickerItems} value={pickedItem} onPick={pickItem} disabled={!ready} loading={loading} />
              </Field>
              <ReadBox label="HSN code" value={line.hsnCode} mono />
              <ReadBox label="Item code" value={line.itemCode} mono />
              <ReadBox label="Product ERP ID" value={line.productErpId} mono />
            </div>

            {/* SKU / variant with MFG / expiry on the same line */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-4">
              <ReadBox label="SKU name" value={line.productName} />
              <ReadBox label="Variant name" value={line.variantName} />
              <Field label="MFG date">
                <input type="date" className="input w-full" value={line.mfgDate} onChange={set("mfgDate")} />
              </Field>
              <Field label="Expiry date">
                <input type="date" className="input w-full" value={line.expiryDate} onChange={set("expiryDate")} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-dashed border-base-300 pt-4 md:grid-cols-3 xl:grid-cols-6">
              <Field label="Batch no.">
                <input className="input w-full" maxLength={100} value={line.batchNumber} onChange={set("batchNumber")} />
              </Field>
              <ReadBox label="1 box = pcs" value={line.pcsPerBox} />
              <Field label="MRP" required>
                <input type="number" min="0" step="0.01" className="input w-full" value={line.mrp} onChange={set("mrp")} />
              </Field>
              <Field label="No. of boxes">
                <input type="number" min="0" step="1" className="input w-full" value={line.boxes} onChange={set("boxes")} />
              </Field>
              <Field label="No. of pcs (loose)">
                <input type="number" min="0" step="1" className="input w-full" value={line.loose} onChange={set("loose")} />
              </Field>
              <ReadBox label="Qty (pcs)" value={line.boxes !== "" || line.loose !== "" ? qty(total) : ""} strong />
            </div>
          </fieldset>
        </section>

        <aside className="self-start rounded-box border border-base-300 bg-base-100 lg:sticky lg:top-20">
          <div className="border-b border-base-300 px-4 py-3">
            <h2 className="font-semibold">Count</h2>
            <p className="text-xs text-base-content/55">Compared with the last count</p>
          </div>
          <div className="px-4 py-2">
            <SlipRow label="Boxes" value={`${qty(line.boxes)} × ${qty(line.pcsPerBox)}`} muted />
            <SlipRow label="Loose" value={`${qty(line.loose)} pcs`} muted />
            <SlipRow label={`Qty${num(line.mrp) ? ` @ MRP ${rupees(line.mrp)}` : ""}`} value={`${qty(total)} pcs`} strong />
            {otherLines.map((l) => (
              <SlipRow key={l.id} label={`+ MRP ${rupees(l.mrp)}${l.batchNumber ? ` · ${l.batchNumber}` : ""}`} value={`${qty(l.qty)} pcs`} muted />
            ))}
            {otherLines.length > 0 && <SlipRow label="Item total" value={`${qty(itemTotal)} pcs`} strong />}
            <div className="my-1 border-t border-base-300" />
            <SlipRow
              label="Last count"
              value={lastCount ? `${qty(lastCount.total_physical_stock_in_pcs)} pcs` : "—"}
            />
            {lastCount?.stock_update_date && <SlipRow label="Counted on" value={showDate(localDay(lastCount.stock_update_date))} muted />}
            {savedLines(current).map((m) => (
              <SlipRow
                key={lotPart(m)}
                label={`${sameSaved(m, line) ? "\u25B8 " : ""}MRP ${rupees(m.mrp)}${m.batchNumber ? ` · ${m.batchNumber}` : ""}${
                  m.expiryDate ? ` · exp ${showDate(m.expiryDate)}` : ""
                }${m.receivedDate ? ` · rcvd ${showDate(m.receivedDate)}` : ""}`}
                value={`${qty(m.pcs)} pcs`}
                muted={!sameSaved(m, line)}
                strong={sameSaved(m, line)}
              />
            ))}
            {current && soldSinceCount(current) > 0 && (
              <SlipRow label="Sold since count" value={`\u2212${qty(soldSinceCount(current))} pcs`} muted />
            )}
            {line.productErpId && lastCount && (
              <SlipRow label="Change" value={changeText(itemTotal, lastCount.total_physical_stock_in_pcs)} strong />
            )}
          </div>
          {line.productErpId && savedLines(current).some((m) => sameSaved(m, line)) && (
            <p className="px-4 pb-2 text-xs text-warning">
              MRP {rupees(line.mrp)} was in the last count. Enter everything on the shelf at this MRP now (old + new
              stock): this line replaces it.
            </p>
          )}
          {line.productErpId &&
            savedLines(current).length > 0 &&
            !lines.some((l) => erpKey(l.productErpId) === erpKey(line.productErpId)) && (
              <p className="px-4 pb-2 text-xs text-base-content/60">
                The other MRPs from the last count stay in the list when you add this line.
              </p>
            )}
          {error && <p className="px-4 pb-1 text-sm text-error">{error}</p>}
          <div className="flex gap-2 border-t border-base-300 bg-base-200/50 px-4 py-3">
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={resetLine}>
              {editingId != null ? "Cancel edit" : "Clear"}
            </button>
            <button type="submit" className="btn btn-primary btn-sm flex-1" disabled={!ready || saving}>
              {editingId != null ? <MdCheck size={17} /> : <MdAdd size={18} />}
              {editingId != null ? "Update line" : "Add to list"}
            </button>
          </div>
        </aside>
      </form>

      {/* Items counted, not saved yet */}
      <section className="mb-5 rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
          <h2 className="font-semibold">
            Items to save <span className="font-normal text-base-content/55">({lines.length})</span>
          </h2>
          <button type="button" className="btn btn-primary btn-sm" disabled={!lines.length || saving || !canFill} onClick={saveAll}>
            {saving ? <span className="loading loading-spinner loading-xs" /> : <MdSave size={17} />}
            Save physical stock
          </button>
        </div>
        {lines.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">Nothing added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm whitespace-nowrap">
              <thead>
                <tr className="bg-base-200/60 text-base-content/70">
                  <th className="w-10 text-right">Sr</th>
                  <th>Item</th>
                  <th className="text-right">1 box = pcs</th>
                  <th className="text-right">MRP</th>
                  <th>Batch</th>
                  <th>MFG</th>
                  <th>Expiry</th>
                  <th className="text-right">Boxes</th>
                  <th className="text-right">Loose</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Last count</th>
                  <th className="text-right">Change</th>
                  <th className="w-20">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const key = erpKey(l.productErpId);
                  const before = byErp.get(key)?.physical_stock;
                  const group = lines.filter((x) => erpKey(x.productErpId) === key);
                  const firstOfItem = group[0].id === l.id;
                  const groupTotal = group.reduce((t, x) => t + num(x.qty), 0);
                  return (
                    <tr key={l.id} className={editingId === l.id ? "bg-accent/10" : "hover:bg-base-200/50"}>
                      <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                      <td className="max-w-64">
                        <div className="truncate font-medium">
                          {l.variantName || l.productName}
                          {l.kept && (
                            <span className="badge badge-warning badge-sm ml-2" title="From the last count. Edit or remove it if this stock is gone.">
                              Kept
                            </span>
                          )}
                        </div>
                        <div className="truncate font-mono text-xs text-base-content/55">{l.productErpId}</div>
                      </td>
                      <td className="text-right tabular-nums">{qty(l.pcsPerBox)}</td>
                      <td className="text-right tabular-nums">{num(l.mrp) ? rupees(l.mrp) : "—"}</td>
                      <td className="text-xs">{l.batchNumber || "—"}</td>
                      <td className="text-xs">{l.mfgDate ? showDate(l.mfgDate) : "—"}</td>
                      <td className="text-xs">{l.expiryDate ? showDate(l.expiryDate) : "—"}</td>
                      <td className="text-right tabular-nums">{qty(l.boxes)}</td>
                      <td className="text-right tabular-nums">{qty(l.loose)}</td>
                      <td className="text-right font-semibold tabular-nums">{qty(l.qty)}</td>
                      <td className="text-right tabular-nums text-base-content/60">
                        {!firstOfItem ? "″" : before ? qty(before.total_physical_stock_in_pcs) : "—"}
                      </td>
                      <td className="text-right tabular-nums" title={group.length > 1 ? `All ${group.length} MRPs: ${qty(groupTotal)} pcs` : undefined}>
                        {!firstOfItem ? "″" : before ? changeText(groupTotal, before.total_physical_stock_in_pcs) : "new"}
                      </td>
                      <td className="text-right">
                        {editingId === l.id ? (
                          <button type="button" className="btn btn-ghost btn-xs btn-square" title="Cancel edit" onClick={resetLine}>
                            <MdClose size={16} />
                          </button>
                        ) : (
                          <>
                            <button type="button" className="btn btn-ghost btn-xs btn-square" title="Edit" disabled={editingId != null || saving} onClick={() => editLine(l)}>
                              <MdEdit size={16} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-xs btn-square text-error" title="Remove" disabled={editingId != null || saving} onClick={() => setToRemove(l)}>
                              <MdDeleteOutline size={17} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-base-300 text-sm text-base-content">
                  <td />
                  <td colSpan={6} className="font-semibold">Total</td>
                  <td className="text-right tabular-nums">{qty(totals.boxes)}</td>
                  <td />
                  <td className="text-right font-semibold tabular-nums">{qty(totals.pcs)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* The company's items and their last count */}
      {companyId && (
        <section className="rounded-box border border-base-300 bg-base-100">
          <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
            <div className="mr-auto">
              <h2 className="font-semibold">{company?.name} items</h2>
              <p className="text-xs text-base-content/55">
                <span className="font-semibold text-success">{countedCount} updated</span>
                {" · "}
                <span className="font-semibold text-error">{items.length - countedCount} not updated</span>
                {" · "}
                {hasAssignments
                  ? `since assigned to ${companyAssignments.map((a) => a.assignee_name).join(", ")}`
                  : `of ${items.length}`}
              </p>
              <progress className="progress progress-success mt-1 h-1.5 w-56" value={progress} max={100} title={`${progress}%`} />
            </div>
            <label className="input input-sm w-60">
              <MdSearch size={16} className="opacity-50" />
              <input placeholder="Search item, ERP ID, code" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
            <select className="select select-sm w-40" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All items</option>
              <option value="counted">Updated</option>
              <option value="not">Not updated</option>
            </select>
            <button type="button" className="btn btn-ghost btn-sm btn-square" title="Refresh" disabled={loading} onClick={load}>
              <MdRefresh size={18} />
            </button>
            <ExcelButton disabled={!shown.length} onExport={exportExcel} onError={(err) => show(false, err.message)} />
            <label className="flex items-center gap-1 text-xs text-base-content/60" title="Report: items counted from this date">
              From
              <input
                type="date"
                className="input input-sm w-36"
                value={reportFrom}
                max={reportTo || todayLocal()}
                onChange={(e) => setReportFrom(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-base-content/60" title="Report: items counted up to this date">
              To
              <input
                type="date"
                className="input input-sm w-36"
                value={reportTo}
                min={reportFrom || undefined}
                max={todayLocal()}
                onChange={(e) => setReportTo(e.target.value)}
              />
            </label>
            {(reportFrom || reportTo) && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                title="All dates"
                onClick={() => {
                  setReportFrom("");
                  setReportTo("");
                }}
              >
                <MdClose size={14} />
              </button>
            )}
            <span className="text-sm text-base-content/70" title="Counted stock at MRP (for the dates chosen)">
              Stock value <b className="text-base-content">{rupees(reportValue)}</b>
            </span>
            <ExcelButton
              label="Stock report"
              disabled={!reportRows.length}
              onExport={exportStockReport}
              onError={(err) => show(false, err.message)}
            />
          </div>
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-base-content/55">
              <span className="loading loading-spinner loading-sm" />
            </p>
          ) : shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-base-content/55">
              {items.length ? "No items match." : "This company has no items yet. Add them on Add Item."}
            </p>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="table table-sm table-pin-rows whitespace-nowrap">
                <thead>
                  <tr className="bg-base-200 text-base-content/70">
                    <th className="w-10 text-right">Sr</th>
                    <th>Item</th>
                    <th>HSN</th>
                    <th className="text-right">1 box = pcs</th>
                    <th className="text-right">MRP</th>
                    <th className="text-right">Physical stock</th>
                    <th>Counted on</th>
                    <th>Status</th>
                    <th className="w-24">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((it) => {
                    const ps = it.physical_stock;
                    const updated = isUpdated(it);
                    const by = updatedByErp.get(erpKey(it.product_erp_id));
                    return (
                      <tr
                        key={it.product_erp_id}
                        className={updated ? "bg-success/10 hover:bg-success/20" : "bg-error/10 hover:bg-error/20"}
                      >
                        <td className={`border-l-4 text-right tabular-nums text-base-content/50 ${updated ? "border-success" : "border-error"}`}>
                          {srByErp.get(erpKey(it.product_erp_id))}
                        </td>
                        <td className="max-w-72">
                          <div className="truncate font-medium">{it.variant_name || it.product_name}</div>
                          <div className="truncate text-xs text-base-content/55">
                            <span className="font-mono">{it.product_erp_id}</span>
                            {it.item_code && <span className="ml-2 font-mono">{it.item_code}</span>}
                          </div>
                        </td>
                        <td className="font-mono text-xs">{it.hsn_code || "—"}</td>
                        <td className="text-right tabular-nums">{num(it.pcs_per_box) ? qty(it.pcs_per_box) : "—"}</td>
                        <td className="text-right tabular-nums">{num(it.mrp) ? rupees(it.mrp) : "—"}</td>
                        <td className="text-right tabular-nums">
                          {ps ? (
                            <>
                              <div className="font-semibold">{qty(ps.total_physical_stock_in_pcs)} pcs</div>
                              <div className="text-xs text-base-content/55">{boxesText(ps.total_physical_stock_in_pcs, it.pcs_per_box)}</div>
                              {(mrpSplit(ps).length > 1 || mrpSplit(ps).some((m) => m.batch || m.exp)) &&
                                mrpSplit(ps).map((m) => (
                                  <div key={`${m.mrp}|${m.batch}|${m.exp}`} className="text-xs text-base-content/60">
                                    MRP {rupees(m.mrp)}
                                    {m.batch ? ` · ${m.batch}` : ""}
                                    {m.exp ? ` · exp ${showDate(m.exp)}` : ""}
                                    {m.rcvd ? ` · rcvd ${showDate(m.rcvd)}` : ""} · {qty(m.pcs)} pcs
                                  </div>
                                ))}
                            </>
                          ) : (
                            <span className="badge badge-ghost badge-sm">Not counted</span>
                          )}
                        </td>
                        <td className="text-xs">{ps?.stock_update_date ? showDate(localDay(ps.stock_update_date)) : "—"}</td>
                        <td>
                          {updated ? (
                            <span className="badge badge-success badge-sm">Updated</span>
                          ) : (
                            <span className="badge badge-error badge-sm">Not updated</span>
                          )}
                          {by && (
                            <div className="mt-0.5 text-xs text-base-content/60">
                              {by.counted_by_name || "—"} · {showDateTime(by.counted_at)}
                            </div>
                          )}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn btn-soft btn-primary btn-xs"
                            disabled={saving || editingId != null}
                            onClick={() => {
                              setLine(fillFromItem(it));
                              setError("");
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Count
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {toRemove && (
        <ConfirmDialog
          title="Remove item?"
          confirmLabel="Remove"
          onCancel={() => setToRemove(null)}
          onConfirm={() => {
            setLines((prev) => prev.filter((l) => l.id !== toRemove.id));
            setToRemove(null);
          }}
        >
          {toRemove.variantName || toRemove.productName} will be taken off the list. Nothing is saved yet.
        </ConfirmDialog>
      )}
      {assignForm && (
        <EditDialog
          title={assignForm.id != null ? "Reassign physical stock" : "Assign physical stock"}
          subtitle={company?.name}
          busy={assignBusy}
          error={assignError}
          onClose={() => setAssignForm(null)}
          onSubmit={saveAssign}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
            <Field label="Staff type">
              <select
                className="select w-full"
                value={assignForm.role || ""}
                disabled={assignees === null}
                onChange={(e) => {
                  const role = e.target.value;
                  setAssignForm((f) => {
                    const picked = (assignees || []).find((a) => assigneeKey(a) === f.assignee);
                    return { ...f, role, assignee: !role || picked?.role === role ? f.assignee : "" };
                  });
                }}
              >
                <option value="">All ({(assignees || []).length})</option>
                {ASSIGNEE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role} ({(assignees || []).filter((a) => a.role === role).length})
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Assign to"
              required
              hint={`Marketing staff are only those of ${company?.name || "this company"}.`}
            >
              {assignForm.id != null ? (
                <select
                  className="select w-full"
                  value={assignForm.assignee}
                  disabled={assignees === null}
                  onChange={(e) => setAssignForm((f) => ({ ...f, assignee: e.target.value }))}
                >
                  <option value="">{assignees === null ? "Loading…" : "Select staff"}</option>
                  {(assignees || [])
                    .filter((a) => !assignForm.role || a.role === assignForm.role)
                    .map((a) => (
                      <option key={assigneeKey(a)} value={assigneeKey(a)}>
                        {a.name}
                        {assignForm.role ? "" : ` · ${a.role}`}
                      </option>
                    ))}
                </select>
              ) : assignees === null ? (
                <p className="py-2 text-sm text-base-content/60">Loading…</p>
              ) : (
                // New assignment: tick one or more staff; each gets their own assignment.
                <div className="max-h-56 overflow-y-auto rounded-box border border-base-300">
                  {assignees
                    .filter((a) => !assignForm.role || a.role === assignForm.role)
                    .map((a) => {
                      const key = assigneeKey(a);
                      const taken = companyAssignments.some((x) => assigneeKey(x) === key);
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-2 border-b border-base-200 px-3 py-1.5 text-sm last:border-b-0 ${
                            taken ? "opacity-50" : "cursor-pointer hover:bg-base-200/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            disabled={taken}
                            checked={taken || assignForm.picked.includes(key)}
                            onChange={(e) =>
                              setAssignForm((f) => ({
                                ...f,
                                picked: e.target.checked ? [...f.picked, key] : f.picked.filter((k) => k !== key),
                              }))
                            }
                          />
                          <span className="flex-1">{a.name}</span>
                          <span className="text-xs text-base-content/55">{taken ? "Already assigned" : a.role}</span>
                        </label>
                      );
                    })}
                  {!assignees.some((a) => !assignForm.role || a.role === assignForm.role) && (
                    <p className="px-3 py-2 text-sm text-base-content/60">No staff of this type.</p>
                  )}
                </div>
              )}
              {assignForm.id == null && assignForm.picked.length > 0 && (
                <p className="mt-1 text-xs text-base-content/60">{assignForm.picked.length} selected</p>
              )}
            </Field>
            <Field label="From date" required>
              <input
                type="date"
                className="input w-full"
                min={assignForm.id != null && assignForm.startDate < todayLocal() ? assignForm.startDate : todayLocal()}
                value={assignForm.startDate}
                onChange={(e) => {
                  const startDate = e.target.value;
                  // Keep To on or after From (a single day: both the same).
                  setAssignForm((f) => ({ ...f, startDate, endDate: !f.endDate || f.endDate < startDate ? startDate : f.endDate }));
                }}
              />
            </Field>
            <Field label="To date" required hint="Same as From for a single day.">
              <input
                type="date"
                className="input w-full"
                min={assignForm.startDate || todayLocal()}
                value={assignForm.endDate}
                onChange={(e) => setAssignForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </Field>
            <Field label="Note" className="sm:col-span-2">
              <input
                className="input w-full"
                maxLength={500}
                placeholder="e.g. Count the godown shelves first"
                value={assignForm.note}
                onChange={(e) => setAssignForm((f) => ({ ...f, note: e.target.value }))}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-base-content/60">
            The assigned staff can fill entries only on these days
            {assignForm.startDate
              ? ` (${rangeText({ start_date: assignForm.startDate, end_date: assignForm.endDate || assignForm.startDate })})`
              : ""}
            .{assignForm.id != null ? " Items already updated stay green after reassigning." : ""}
          </p>
          {(() => {
            // Same company + same dates share one Assign ID; other dates get a new one.
            const end = assignForm.endDate || assignForm.startDate;
            const self = assignForm.id != null ? companyAssignments.find((a) => a.id === assignForm.id) : null;
            const keeps = self && self.start_date === assignForm.startDate && self.end_date === end && self.assign_code;
            const match = keeps ? { code: self.assign_code } : assignGroups.find(
              (g) => g.list[0].start_date === assignForm.startDate && g.list[0].end_date === end
                && !(assignForm.id != null && g.list.length === 1 && g.list[0].id === assignForm.id)
            );
            return (
              <p className="mt-1 text-xs font-medium">
                Assign ID:{" "}
                {match ? (
                  <span className="font-mono">{match.code}</span>
                ) : (
                  <span className="text-base-content/60">a new one will be created for these dates</span>
                )}
              </p>
            );
          })()}
        </EditDialog>
      )}

      {toClose && (
        <ConfirmDialog
          title={toClose.status === "done" ? "Mark count as done?" : "Cancel assignment?"}
          confirmLabel={toClose.status === "done" ? "Mark done" : "Cancel assignment"}
          busy={assignBusy}
          onCancel={() => setToClose(null)}
          onConfirm={closeAssign}
        >
          {toClose.assignment.assign_code ? `${toClose.assignment.assign_code} · ` : ""}
          {toClose.assignment.company_name}: {toClose.assignment.items.length} item
          {toClose.assignment.items.length === 1 ? "" : "s"} updated by {toClose.assignment.assignee_name}&apos;s assignment.
          {toClose.status === "done" ? " The assignment closes." : " The assignment is removed; saved counts are kept."}
        </ConfirmDialog>
      )}
      {flashNode}
    </div>
  );
}
