// Create Route: Tailwind CSS (no MUI). Area selection, priority order, save and delete logic unchanged.
import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  Card, Field, Icon, Modal, Notice, PageHeader, Spinner, StatBox, TriCheck, btn, fieldClass, td, th,
} from "components/tw";

const API = (process.env.REACT_APP_API_URL);

const jsonHeaders = { "Content-Type": "application/json" };

// Suggest the next "R n" name based on existing routes (R 1, ROUTE 2, R3 ...).
const suggestRouteName = (routes) => {
  const numbers = routes
    .map((route) => String(route.name).match(/^(?:R|ROUTE)\s*-?\s*(\d+)$/i))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return `R ${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
};

export default function CreateRoute() {
  const [areas, setAreas] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [editingRoute, setEditingRoute] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      fetch(`${API}/staff/areas`, { signal: controller.signal }),
      fetch(`${API}/staff/routes`, { signal: controller.signal }),
    ])
      .then(async ([areaResponse, routeResponse]) => {
        const areaData = await areaResponse.json();
        const routeData = await routeResponse.json();
        if (!areaResponse.ok) throw new Error(areaData.error || "Unable to load areas.");
        if (!routeResponse.ok) throw new Error(routeData.error || "Unable to load routes.");
        setAreas(Array.isArray(areaData) ? areaData : []);
        setRoutes(Array.isArray(routeData) ? routeData : []);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);

  // area name -> route names it already belongs to
  const routesByArea = useMemo(() => {
    const map = new Map();
    routes.forEach((route) => {
      route.areas.forEach((areaName) => {
        if (!map.has(areaName)) map.set(areaName, []);
        map.get(areaName).push(route);
      });
    });
    return map;
  }, [routes]);

  const visibleAreas = areas.filter((area) =>
    area.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const selectedSet = new Set(selected);
  // Areas already used by another route cannot be picked (one route per area).
  const otherRouteOf = (areaName) =>
    (routesByArea.get(areaName) || []).find((route) => route.id !== editingRoute?.id) || null;
  const selectableVisible = visibleAreas.filter((area) => !otherRouteOf(area.name));
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((area) => selectedSet.has(area.name));

  const toggleArea = (areaName) => {
    if (otherRouteOf(areaName)) return;
    setSelected((current) =>
      current.includes(areaName) ? current.filter((name) => name !== areaName) : [...current, areaName]
    );
  };

  const toggleAllVisible = () => {
    const visibleNames = selectableVisible.map((area) => area.name);
    setSelected((current) =>
      allVisibleSelected
        ? current.filter((name) => !visibleNames.includes(name))
        : [...new Set([...current, ...visibleNames])]
    );
  };

  // selected is kept in delivery priority order (1 = deliver first).
  const moveArea = (index, delta) => {
    setSelected((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const clearSelection = () => {
    setSelected([]);
    setEditingRoute(null);
  };

  const openCreateDialog = () => {
    // keep chosen order; areas ticked later are added at the end
    setRouteName(editingRoute ? editingRoute.name : suggestRouteName(routes));
    setSaveError("");
    setDialogOpen(true);
  };

  const startEdit = (route) => {
    setEditingRoute(route);
    setSelected(route.areas);
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveRoute = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(
        editingRoute ? `${API}/staff/routes/${editingRoute.id}` : `${API}/staff/routes`,
        {
          method: editingRoute ? "PUT" : "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ name: routeName, areas: selected }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save route.");
      setSuccess(
        `${data.name} ${editingRoute ? "updated" : "created"} with ${data.areas.length} area${data.areas.length === 1 ? "" : "s"}.`
      );
      setDialogOpen(false);
      clearSelection();
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setSaveError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRoute = async (route) => {
    if (!window.confirm(`Delete route "${route.name}"? The areas themselves are not deleted.`)) return;
    setDeletingId(route.id);
    setSuccess("");
    setError("");
    try {
      const response = await fetch(`${API}/staff/routes/${route.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete route.");
      if (editingRoute?.id === route.id) clearSelection();
      setSuccess(`${route.name} deleted.`);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  };

  const areasInRoutes = new Set(routes.flatMap((route) => route.areas)).size;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title={editingRoute ? `Edit Route: ${editingRoute.name}` : "Create Route"}
          description={`An area can belong to only one route; areas already in another route are greyed out. Select the areas for this route, then click ${editingRoute ? "Save Route" : "Create Route"} and give it a name such as R 1.`}
          actions={(
            <>
              {(selected.length > 0 || editingRoute) && (
                <button type="button" className={btn.outline} onClick={clearSelection} disabled={saving}>
                  <Icon name="close" className="text-[18px]" />{editingRoute ? "Cancel Edit" : "Clear"}
                </button>
              )}
              <button type="button" className={btn.primary} disabled={!selected.length || loading} onClick={openCreateDialog}>
                <Icon name={editingRoute ? "save" : "alt_route"} className="text-[18px]" />
                {editingRoute ? "Save Route" : "Create Route"}{selected.length ? ` (${selected.length})` : ""}
              </button>
            </>
          )}
        />

        {!loading && (
          <div className="mb-5 flex flex-wrap gap-2">
            <StatBox label="Routes" value={routes.length} icon="alt_route" />
            <StatBox label="Areas" value={areas.length} icon="map" />
            <StatBox label="Areas in a route" value={areasInRoutes} icon="check_circle" />
            <StatBox label="Not in a route" value={Math.max(0, areas.length - areasInRoutes)} icon="radio_button_unchecked" />
          </div>
        )}

        {success && <Notice tone="success" className="mb-4" onClose={() => setSuccess("")}>{success}</Notice>}
        {error && <Notice tone="error" className="mb-4" onClose={() => setError("")}>{error}</Notice>}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          {/* Areas to pick */}
          <Card className={editingRoute ? "ring-2 ring-blue-500/30" : ""}>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
              <div className="relative w-full max-w-xs">
                <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search areas" aria-label="Search areas" className={`${fieldClass} pl-8`} />
              </div>
              <span className="ml-auto text-[12.5px] text-slate-500">
                <b className="text-slate-800">{selected.length}</b> selected · {visibleAreas.length} of {areas.length} areas
              </span>
            </div>
            {loading ? (
              <div className="flex justify-center py-16"><Spinner className="size-7" /></div>
            ) : (
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full border-collapse" aria-label="Areas">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50">
                      <th className={`${th} w-12`}>
                        <TriCheck
                          checked={allVisibleSelected}
                          indeterminate={!allVisibleSelected && selectableVisible.some((area) => selectedSet.has(area.name))}
                          disabled={!selectableVisible.length}
                          onChange={toggleAllVisible}
                          label="Select all visible areas"
                        />
                      </th>
                      <th className={th}>Area name</th>
                      <th className={`${th} text-center`}>Priority</th>
                      <th className={`${th} text-right`}>Outlets</th>
                      <th className={th}>Route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAreas.map((area) => {
                      const inRoutes = (routesByArea.get(area.name) || []).filter((route) => route.id !== editingRoute?.id);
                      const locked = inRoutes.length > 0;
                      const isSelected = selectedSet.has(area.name);
                      return (
                        <tr
                          key={area.name} onClick={() => toggleArea(area.name)}
                          className={`border-t border-slate-100 transition ${locked ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-slate-50"} ${isSelected ? "bg-blue-50/70 hover:bg-blue-50" : ""}`}
                        >
                          <td className={`${td} w-12`}>
                            <input
                              type="checkbox" className="size-[18px] cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
                              checked={isSelected} disabled={locked} aria-label={`Select ${area.name}`}
                              onClick={(event) => event.stopPropagation()} onChange={() => toggleArea(area.name)}
                            />
                          </td>
                          <td className={`${td} font-semibold text-slate-800`}>{area.name}</td>
                          <td className={`${td} text-center`}>
                            {isSelected && (
                              <span className="inline-flex size-6 items-center justify-center rounded-full bg-blue-600 text-[11.5px] font-bold text-white">
                                {selected.indexOf(area.name) + 1}
                              </span>
                            )}
                          </td>
                          <td className={`${td} text-right tabular-nums`}>{area.outlet_count}</td>
                          <td className={td}>
                            <span className="flex flex-wrap gap-1">
                              {inRoutes.map((route) => (
                                <span key={route.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-600">{route.name}</span>
                              ))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!visibleAreas.length && (
                      <tr><td colSpan={5} className="px-4 py-12 text-center text-[13px] text-slate-400">No areas found. Add areas in Create Area first.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Existing routes */}
          <Card className="xl:self-start">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="m-0 text-[15px] font-semibold text-slate-900">Routes</h3>
              <button type="button" className={btn.ghost} disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
                <Icon name="refresh" className="text-[18px]" />Refresh
              </button>
            </div>
            <div className="max-h-[620px] space-y-3 overflow-y-auto p-4">
              {!loading && !routes.length && <p className="m-0 py-8 text-center text-[13px] text-slate-400">No routes yet.</p>}
              {routes.map((route) => {
                const editing = editingRoute?.id === route.id;
                return (
                  <div key={route.id} className={`rounded-xl border p-3 transition ${editing ? "border-blue-400 bg-blue-50/50 ring-2 ring-blue-500/20" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white"><Icon name="alt_route" className="text-[17px]" /></span>
                      <span className="min-w-0 grow">
                        <span className="block text-[14px] font-bold text-slate-900">{route.name}</span>
                        <span className="block text-[11.5px] text-slate-500">{route.areas.length} area{route.areas.length === 1 ? "" : "s"}</span>
                      </span>
                      <button type="button" className={`${btn.icon} hover:text-blue-700`} onClick={() => startEdit(route)} disabled={saving} title={`Edit ${route.name}`} aria-label={`Edit ${route.name}`}>
                        <Icon name="edit" className="text-[18px]" />
                      </button>
                      {deletingId === route.id ? (
                        <Spinner className="mx-2 size-4" />
                      ) : (
                        <button type="button" className={`${btn.icon} hover:bg-red-50 hover:text-red-600`} onClick={() => deleteRoute(route)} title={`Delete ${route.name}`} aria-label={`Delete ${route.name}`}>
                          <Icon name="delete_outline" className="text-[19px]" />
                        </button>
                      )}
                    </div>
                    <ol className="m-0 mt-2.5 flex list-none flex-wrap gap-1.5 p-0">
                      {route.areas.map((areaName, index) => (
                        <li key={areaName} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-0.5 pr-2 text-[11.5px] font-medium text-slate-700">
                          <span className="flex size-5 items-center justify-center rounded-full bg-slate-100 text-[10.5px] font-bold text-slate-600">{index + 1}</span>
                          {areaName}
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={dialogOpen} onClose={() => setDialogOpen(false)} locked={saving} title={editingRoute ? "Save Route" : "Name this Route"}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</button>
            <button type="submit" form="route-form" className={btn.primary} disabled={saving || !routeName.trim()}>
              {saving ? "Saving…" : editingRoute ? "Save Route" : "Create Route"}
            </button>
          </>
        )}
      >
        <form id="route-form" onSubmit={saveRoute} className="space-y-4">
          <Field label="Route name" width="w-full" hint="For example R 1 or ROUTE 1. Saved in uppercase.">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input className={fieldClass} value={routeName} onChange={(event) => setRouteName(event.target.value)} required autoFocus disabled={saving} maxLength={100} />
          </Field>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Area priority ({selected.length} area{selected.length === 1 ? "" : "s"})
            </span>
            <p className="m-0 mt-0.5 text-[12px] text-slate-500">
              1 is delivered first. Use the arrows to change the order. Bills from higher-priority areas come first in Report — Pending Deliveries.
            </p>
            <ol className="m-0 mt-2 max-h-80 list-none overflow-y-auto rounded-xl border border-slate-200 p-0">
              {selected.map((areaName, index) => (
                <li key={areaName} className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 last:border-0">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[12px] font-bold text-white">{index + 1}</span>
                  <span className="grow text-[13px] font-medium text-slate-800">{areaName}</span>
                  <button type="button" className={btn.icon} disabled={saving || index === 0} onClick={() => moveArea(index, -1)} aria-label={`Move ${areaName} up`}>
                    <Icon name="arrow_upward" className="text-[18px]" />
                  </button>
                  <button type="button" className={btn.icon} disabled={saving || index === selected.length - 1} onClick={() => moveArea(index, 1)} aria-label={`Move ${areaName} down`}>
                    <Icon name="arrow_downward" className="text-[18px]" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
          {saveError && <Notice tone="error">{saveError}</Notice>}
        </form>
      </Modal>
      <Footer />
    </DashboardLayout>
  );
}
