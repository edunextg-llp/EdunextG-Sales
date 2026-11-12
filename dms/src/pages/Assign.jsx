import { useCallback, useEffect, useMemo, useState } from "react";
import { MdRefresh, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { ExcelButton, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";
import { downloadExcel } from "../utils/excel";
import { showDate } from "../utils/purchaseCalc";

// Assign: every physical stock assignment, one row per Assign ID (a company + its assigned
// days) with the staff on it. Made on Physical Stock (Assign / Add staff).

const STATE = {
  upcoming: { label: "Upcoming", cls: "badge-info" },
  active: { label: "Active", cls: "badge-success" },
  expired: { label: "Expired", cls: "badge-error" },
  done: { label: "Done", cls: "badge-neutral" },
  cancelled: { label: "Cancelled", cls: "badge-ghost" },
};

const dayOf = (value) => String(value || "").slice(0, 10);
const showDateTime = (value) => {
  if (!value) return "";
  const [day, time = ""] = String(value).split(" ");
  return `${showDate(day)}${time ? ` ${time.slice(0, 5)}` : ""}`;
};

function StateBadge({ state }) {
  const s = STATE[state] || STATE.active;
  return <span className={`badge badge-sm ${s.cls}`}>{s.label}</span>;
}

export default function Assign() {
  const companies = useCompanies();
  const [show, flashNode] = useFlash();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status });
      if (companyId) params.set("companyId", companyId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await apiFetch(`/staff/physical-stock/assignments/all?${params}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load assignments.");
      setRows(Array.isArray(body.assignments) ? body.assignments : []);
    } catch (err) {
      setRows([]);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [status, companyId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // One row per Assign ID (company + dates), its staff inside.
  const groups = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const map = new Map();
    rows.forEach((r) => {
      const code = r.assign_code || `#${r.id}`;
      if (!map.has(code)) map.set(code, { code, staff: [] });
      map.get(code).staff.push(r);
    });
    return [...map.values()]
      .map((g) => {
        const first = g.staff[0];
        const open = g.staff.filter((s) => s.status === "open");
        return {
          ...g,
          companyName: first.company_name || "",
          startDate: first.start_date,
          endDate: first.end_date,
          // Earliest time any staff of this Assign ID was assigned.
          assignedOn: g.staff.map((s) => s.created_at).sort()[0],
          assignedBy: [...new Set(g.staff.map((s) => s.assigned_by_name).filter(Boolean))].join(", "),
          state: open.length ? open[0].window_state : g.staff.every((s) => s.status === "cancelled") ? "cancelled" : "done",
          items: g.staff.reduce((t, s) => t + (Number(s.items_updated) || 0), 0),
        };
      })
      .filter((g) => {
        if (!words.length) return true;
        const hay = [g.code, g.companyName, ...g.staff.map((s) => s.assignee_name)].join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => String(b.assignedOn).localeCompare(String(a.assignedOn)));
  }, [rows, search]);

  const staffCount = groups.reduce((t, g) => t + g.staff.length, 0);

  const exportExcel = () =>
    downloadExcel({
      fileName: "Physical_Stock_Assignments",
      title: "Physical stock assignments",
      sheets: [
        {
          name: "Assignments",
          // One line per assigned staff member.
          rows: groups.flatMap((g) => g.staff.map((s) => ({ ...s, group: g }))),
          columns: [
            { header: "Sr No.", value: (_, i) => i + 1, width: 8, type: "number" },
            { header: "Assign ID", value: (r) => r.group.code, width: 13 },
            { header: "Company", value: (r) => r.group.companyName, width: 24 },
            { header: "Assigned on", value: (r) => dayOf(r.created_at), width: 13, type: "date" },
            { header: "From", key: "start_date", width: 12, type: "date" },
            { header: "To", key: "end_date", width: 12, type: "date" },
            { header: "Assigned staff", key: "assignee_name", width: 26 },
            { header: "Status", value: (r) => (STATE[r.window_state] || STATE.active).label, width: 11 },
            { header: "Items updated", key: "items_updated", width: 13, type: "number", total: true },
            { header: "Assigned by", key: "assigned_by_name", width: 16 },
            { header: "Note", key: "note", width: 30 },
          ],
        },
      ],
    });

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Stock" title="Assign">
        Physical stock assignments: the company, the assigned days and the staff on each. Assign staff on Physical
        Stock.
      </PageHeader>

      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <div className="mr-auto">
            <h2 className="font-semibold">Assignments</h2>
            <p className="text-xs text-base-content/55">
              {groups.length} Assign ID{groups.length === 1 ? "" : "s"} · {staffCount} staff
            </p>
          </div>
          <select className="select select-sm w-48" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="select select-sm w-36" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All status</option>
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-base-content/60" title="Assigned days on or after">
            From
            <input type="date" className="input input-sm w-36" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-xs text-base-content/60" title="Assigned days on or before">
            To
            <input type="date" className="input input-sm w-36" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="input input-sm w-56">
            <MdSearch size={16} className="opacity-50" />
            <input placeholder="Assign ID, company, staff" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="btn btn-ghost btn-sm btn-square" title="Refresh" disabled={loading} onClick={load}>
            <MdRefresh size={18} />
          </button>
          <ExcelButton disabled={!groups.length} onExport={exportExcel} onError={(err) => show(false, err.message)} />
        </div>

        {error && <p className="border-b border-base-300 px-4 py-2 text-sm text-error">{error}</p>}

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">
            <span className="loading loading-spinner loading-sm" />
          </p>
        ) : groups.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">No assignments found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr className="bg-base-200/60 text-base-content/70">
                  <th className="w-10 text-right">Sr</th>
                  <th>Assign ID</th>
                  <th>Company</th>
                  <th>Assigned on</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Assigned staff</th>
                  <th className="text-right">Items updated</th>
                  <th>Assigned by</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, i) => (
                  <tr key={g.code} className="align-top hover:bg-base-200/50">
                    <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                    <td className="whitespace-nowrap font-mono text-xs font-semibold">{g.code}</td>
                    <td className="whitespace-nowrap font-medium">{g.companyName}</td>
                    <td className="whitespace-nowrap text-xs">{showDateTime(g.assignedOn)}</td>
                    <td className="whitespace-nowrap">{showDate(g.startDate)}</td>
                    <td className="whitespace-nowrap">{showDate(g.endDate)}</td>
                    <td>
                      <StateBadge state={g.state} />
                    </td>
                    <td className="min-w-64">
                      <ul className="flex flex-col gap-1">
                        {g.staff.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                            <span className="font-medium">{s.assignee_name}</span>
                            <span className="text-xs text-base-content/55">
                              {s.items_updated} item{s.items_updated === 1 ? "" : "s"}
                            </span>
                            {s.status !== "open" && <StateBadge state={s.status} />}
                            {s.note && <span className="text-xs text-base-content/55">“{s.note}”</span>}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="text-right tabular-nums">{g.items}</td>
                    <td className="whitespace-nowrap text-xs">{g.assignedBy || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {flashNode}
    </div>
  );
}
