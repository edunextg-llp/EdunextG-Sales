// Areas page: Tailwind CSS (no MUI). Loading, create, holiday edit, delete and Excel download are unchanged.
import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { Field, Icon, Modal, Notice, Spinner, StatBox, btn, fieldClass } from "components/tw";

const API = (process.env.REACT_APP_API_URL);
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const holidayList = (value) => String(value || "").split(",").map((day) => day.trim()).filter(Boolean);

// Pick zero or more weekdays as the area's weekly holiday (kept in Monday..Sunday order).
function HolidayPicker({ value, onChange, disabled, hint }) {
  const toggle = (day) => onChange(WEEKDAYS.filter((d) => (d === day ? !value.includes(d) : value.includes(d))));
  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Holiday day</span>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-7" role="group" aria-label="Holiday day">
        {WEEKDAYS.map((day) => {
          const on = value.includes(day);
          return (
            <button
              key={day} type="button" disabled={disabled} aria-pressed={on} onClick={() => toggle(day)} title={day}
              className={`rounded-lg border py-2 text-[12.5px] font-semibold transition disabled:opacity-50 ${on ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
            >
              {day.slice(0, 3)}
            </button>
          );
        })}
      </div>
      <p className="m-0 mt-1.5 text-[12px] text-slate-500">
        {value.length ? `Closed on ${value.join(", ")}.` : "No holiday."} {hint}
      </p>
    </div>
  );
}
HolidayPicker.propTypes = { value: PropTypes.arrayOf(PropTypes.string).isRequired, onChange: PropTypes.func.isRequired, disabled: PropTypes.bool, hint: PropTypes.string };
HolidayPicker.defaultProps = { disabled: false, hint: "Optional. Choose the weekday(s) this area is closed. Leave empty for no holiday." };

export default function Area() {
  const [areas, setAreas] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [holidayDays, setHolidayDays] = useState([]);
  const [editArea, setEditArea] = useState(null);
  const [editDays, setEditDays] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const openHolidayEdit = (area) => { setEditArea(area); setEditDays(holidayList(area.holiday_day)); setEditError(""); setSuccess(""); };
  const saveHoliday = async () => {
    setEditSaving(true);
    setEditError("");
    try {
      const response = await fetch(`${API}/staff/areas/holiday`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ name: editArea.name, holidayDays: editDays }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update holiday.");
      setSuccess(`${data.name}: holiday ${data.holiday_day ? `set to ${data.holiday_day}` : "removed"}.`);
      setEditArea(null);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setEditError(requestError.message);
    } finally {
      setEditSaving(false);
    }
  };
  const [createError, setCreateError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const deleteArea = async (area) => {
    if (!window.confirm(`Delete area "${area.name}"?`)) return;
    setDeleting(area.name);
    setDeleteError("");
    setSuccess("");
    try {
      const response = await fetch(`${API}/staff/areas`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ name: area.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete area.");
      setSuccess(`${area.name} deleted successfully.`);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setDeleteError(requestError.message);
    } finally {
      setDeleting("");
    }
  };

  const createArea = async (event) => {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setSuccess("");
    try {
      const response = await fetch(`${API}/staff/areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ name, holidayDays }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create area.");
      setSuccess(`${data.name} created successfully${data.holiday_day ? ` · Holiday: ${data.holiday_day}` : ""}.`);
      setName("");
      setHolidayDays([]);
      setShowCreate(false);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setCreateError(requestError.message);
    } finally {
      setCreating(false);
    }
  };

  const downloadExcel = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const response = await fetch(`${API}/staff/areas/export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) throw new Error("Unable to download areas. Please try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "areas.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setDownloadError(requestError.message);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`${API}/staff/areas`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load areas.");
        if (!Array.isArray(data)) throw new Error("Unable to load areas.");
        setAreas(data);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  const visibleAreas = areas.filter((area) => area.name.toLowerCase().includes(search.trim().toLowerCase()));
  const inUse = (area) => area.outlet_count > 0 || area.assignment_count > 0;
  const stats = {
    total: areas.length,
    holiday: areas.filter((area) => area.holiday_day).length,
    used: areas.filter(inUse).length,
  };
  const closeCreate = () => { setShowCreate(false); setCreateError(""); setHolidayDays([]); };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-end gap-4">
          <div className="min-w-0 grow">
            <h2 className="m-0 text-[22px] font-bold text-slate-900">Areas</h2>
            <p className="m-0 mt-1 max-w-3xl text-[13px] text-slate-500">
              All areas, including existing outlets and staff assignments, with each area&apos;s weekly holiday. Names are shown in uppercase; capitalization and extra spaces count as the same name.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn.ghost} disabled={loading} onClick={() => setRefresh((value) => value + 1)} title="Refresh">
              <Icon name="refresh" className="text-[18px]" />Refresh
            </button>
            <button type="button" className={btn.outline} disabled={downloading || loading || Boolean(error)} onClick={downloadExcel}>
              <Icon name="download" className="text-[18px] text-emerald-600" />{downloading ? "Downloading…" : "Download Excel"}
            </button>
            <button type="button" className={btn.primary} onClick={() => { setShowCreate(true); setSuccess(""); }}>
              <Icon name="add" className="text-[18px]" />Create Area
            </button>
          </div>
        </div>

        {!loading && !error && (
          <div className="mb-5 flex flex-wrap gap-2">
            <StatBox label="Areas" value={stats.total} icon="map" />
            <StatBox label="With holiday" value={stats.holiday} icon="event_busy" />
            <StatBox label="In use" value={stats.used} icon="storefront" />
            <StatBox label="Not used" value={stats.total - stats.used} icon="layers_clear" />
          </div>
        )}

        {success && <Notice tone="success" className="mb-4" onClose={() => setSuccess("")}>{success}</Notice>}
        {downloadError && <Notice tone="error" className="mb-4" onClose={() => setDownloadError("")}>{downloadError}</Notice>}
        {deleteError && <Notice tone="error" className="mb-4" onClose={() => setDeleteError("")}>{deleteError}</Notice>}

        {/* Area list */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
            <div className="relative w-full max-w-sm">
              <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
              <input
                type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search areas" aria-label="Search areas"
                className={`${fieldClass} pl-8`}
              />
            </div>
            <span className="ml-auto text-[12.5px] text-slate-500">{visibleAreas.length} of {areas.length} area names</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner className="size-7" /></div>
          ) : error ? (
            <div className="p-5"><Notice tone="error">{error}</Notice></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]" aria-label="All areas">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">Area name</th>
                    <th className="px-3 py-2.5">Holiday</th>
                    <th className="px-3 py-2.5 text-right">Outlets</th>
                    <th className="px-3 py-2.5 text-right">Staff assignments</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAreas.map((area) => {
                    const used = inUse(area);
                    return (
                      <tr key={area.name} className="border-t border-slate-100 hover:bg-slate-50/70">
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[12px] font-bold text-blue-700">
                              {area.name.trim().charAt(0) || "?"}
                            </span>
                            <span className="whitespace-pre-wrap font-semibold text-slate-800">{area.name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex flex-wrap items-center gap-1">
                            {holidayList(area.holiday_day).map((day) => (
                              <span key={day} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800">{day}</span>
                            ))}
                            {!area.holiday_day && <span className="text-[12px] text-slate-400">No holiday</span>}
                            <button type="button" className={btn.icon} onClick={() => openHolidayEdit(area)} title={`Edit holiday of ${area.name}`} aria-label={`Edit holiday of ${area.name}`}>
                              <Icon name="edit_calendar" className="text-[17px]" />
                            </button>
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-800">{area.outlet_count}</td>
                        <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-800">{area.assignment_count}</td>
                        <td className="px-3 py-3">
                          {used ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700"><Icon name="check_circle" className="text-[14px]" />In use</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-500"><Icon name="radio_button_unchecked" className="text-[14px]" />Not used</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {deleting === area.name ? (
                            <span className="text-[12px] text-slate-500">Deleting…</span>
                          ) : (
                            <button
                              type="button" className={`${btn.icon} hover:bg-red-50 hover:text-red-600`}
                              disabled={Boolean(deleting) || used} onClick={() => deleteArea(area)}
                              title={used ? "In use — reassign first" : `Delete ${area.name}`} aria-label={`Delete ${area.name}`}
                            >
                              <Icon name="delete_outline" className="text-[19px]" />
                            </button>
                          )}
                          {used && <span className="block text-[11px] text-slate-400">In use — reassign first</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleAreas.length && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-[13px] text-slate-400">No areas found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Create area */}
      <Modal
        open={showCreate} onClose={closeCreate} locked={creating} title="Create Area"
        actions={(
          <>
            <button type="button" className={btn.ghost} disabled={creating} onClick={closeCreate}>Cancel</button>
            <button type="submit" form="create-area-form" className={btn.primary} disabled={creating || !name.trim()}>
              <Icon name="save" className="text-[18px]" />{creating ? "Saving…" : "Save Area"}
            </button>
          </>
        )}
      >
        <form id="create-area-form" onSubmit={createArea} className="space-y-4">
          <Field label="New area name" width="w-full" hint="DUMDUM and dumdum are the same area. DUMDUM-1 is a different name.">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required disabled={creating} maxLength={255} autoFocus />
          </Field>
          <HolidayPicker value={holidayDays} onChange={setHolidayDays} disabled={creating} />
          {createError && <Notice tone="error">{createError}</Notice>}
        </form>
      </Modal>

      {/* Edit holiday */}
      <Modal
        open={Boolean(editArea)} onClose={() => setEditArea(null)} locked={editSaving} title={`Holiday — ${editArea?.name || ""}`}
        actions={(
          <>
            <button type="button" className={btn.ghost} disabled={editSaving} onClick={() => setEditArea(null)}>Cancel</button>
            <button type="button" className={btn.primary} disabled={editSaving} onClick={saveHoliday}>{editSaving ? "Saving…" : "Save"}</button>
          </>
        )}
      >
        <HolidayPicker value={editDays} onChange={setEditDays} disabled={editSaving} hint="Untick every day to remove the holiday." />
        {editError && <Notice tone="error" className="mt-3">{editError}</Notice>}
      </Modal>
      <Footer />
    </DashboardLayout>
  );
}
