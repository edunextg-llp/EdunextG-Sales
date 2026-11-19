// Add Location (day-wise areas per staff): Tailwind CSS (no MUI). Loading and saving logic unchanged.
import { useEffect, useState } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useAuth } from "context/AuthContext";
import { Card, Field, Icon, Notice, PageHeader, SearchSelect, Spinner, btn, fieldClass } from "components/tw";

const API = (process.env.REACT_APP_API_URL);
const normalizeAreaName = (name) => String(name || "").trim().replace(/\s+/g, " ").toUpperCase();
const routeDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const emptyAssignments = () => ({
  Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], CNF: [],
});

function LocationAssignments() {
  const { user } = useAuth();
  const isSelfService = user?.role === "staff";
  const [staffType, setStaffType] = useState("");
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [staff, setStaff] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [assignments, setAssignments] = useState(emptyAssignments());
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [areas, setAreas] = useState([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [areasError, setAreasError] = useState("");
  const [outletCounts, setOutletCounts] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    const loadAreas = async () => {
      setAreasLoading(true);
      try {
        const response = await fetch(`${API}/staff/areas/options`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data)) throw new Error(data.error || "Unable to load areas.");
        setAreas(data);
        setAreasError("");
      } catch (error) {
        if (!controller.signal.aborted) setAreasError(error.message);
      } finally {
        if (!controller.signal.aborted) setAreasLoading(false);
      }
    };
    void loadAreas();
    window.addEventListener("focus", loadAreas);
    return () => { controller.abort(); window.removeEventListener("focus", loadAreas); };
  }, []);

  // Outlets mapped to each area for this staff; they follow the area to its day on save.
  const loadOutletCounts = async (staffId) => {
    try {
      const response = await fetch(`${API}/staff/${staffId}/all-counters`);
      const data = await response.json();
      if (!response.ok || !Array.isArray(data)) throw new Error();
      const outletsByArea = {};
      data.forEach((outlet) => {
        const area = normalizeAreaName(outlet.location_name);
        if (!area) return;
        outletsByArea[area] = outletsByArea[area] || new Set();
        outletsByArea[area].add(outlet.outlet_erp_id || outlet.id);
      });
      setOutletCounts(Object.fromEntries(Object.entries(outletsByArea).map(([area, ids]) => [area, ids.size])));
    } catch {
      setOutletCounts({});
    }
  };

  useEffect(() => {
    if (!isSelfService || !user?.staffId) return;
    void loadOutletCounts(user.staffId);
    setLoading(true);
    fetch(`${API}/staff/${user.staffId}`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Unable to load your assignments.");
        setStaffType(data.staff_type || user.staffType || "distributor");
        setSelectedStaff(data);
        setAssignments({ ...emptyAssignments(), ...(data.assignments || {}) });
      })
      .catch((error) => alert(error.message))
      .finally(() => setLoading(false));
  }, [isSelfService, user?.staffId, user?.staffType]);

  const resetStaffSelection = () => {
    setStaff([]);
    setSelectedStaff(null);
    setAssignments(emptyAssignments());
    setActiveTab(0);
  };

  const selectStaffType = async (value) => {
    setStaffType(value);
    setSelectedCompany(null);
    setCompanies([]);
    resetStaffSelection();
    if (!value) return;

    try {
      const response = await fetch(`${API}/staff/companies?type=${value}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load companies.");
      setCompanies(Array.isArray(data) ? data : []);
    } catch (error) {
      alert(error.message);
    }
  };

  const selectCompany = async (value) => {
    setSelectedCompany(value);
    resetStaffSelection();
    if (!value) return;

    try {
      const response = await fetch(`${API}/staff?companyId=${value.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load staff.");
      setStaff((Array.isArray(data) ? data : []).filter(
        (employee) => (employee.staff_type || "distributor") === staffType
      ));
    } catch (error) {
      alert(error.message);
    }
  };

  const selectStaff = async (value) => {
    setSelectedStaff(value);
    setAssignments(emptyAssignments());
    setOutletCounts({});
    setActiveTab(0);
    if (!value) return;

    void loadOutletCounts(value.id);
    setLoading(true);
    try {
      const response = await fetch(`${API}/staff/${value.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load assignments.");
      setSelectedStaff((current) => current ? { ...current, staff_type: data.staff_type } : current);
      setAssignments({ ...emptyAssignments(), ...(data.assignments || {}) });
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const days = selectedStaff?.staff_type === "cnf" ? ["CNF"] : routeDays;

  const addLocation = (day) => {
    setAssignments((current) => ({
      ...current,
      [day]: [...(current[day] || []), { locationName: "" }],
    }));
  };

  const updateLocation = (day, index, value) => {
    setAssignments((current) => ({
      ...current,
      [day]: current[day].map((location, locationIndex) =>
        locationIndex === index ? { ...location, locationName: value } : location
      ),
    }));
  };

  const removeLocation = (day, index) => {
    setAssignments((current) => ({
      ...current,
      [day]: current[day].filter((_, locationIndex) => locationIndex !== index),
    }));
  };

  const saveAssignments = async () => {
    if (!selectedStaff) return;
    if (days.some((day) => (assignments[day] || []).some((location) => !areas.includes(normalizeAreaName(location.locationName))))) {
      alert("Select an area for every row, or remove empty rows.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/locations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ assignments }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save assignments.");
      const sharedNote = data.sharedAreas?.length
        ? `\n\nOutlets not moved for areas assigned to more than one day: ${data.sharedAreas.join(", ")}.`
        : "";
      alert(`Location assignments saved successfully. ${data.outletsMoved || 0} outlet(s) moved to their area's new day.${sharedNote}`);
      void loadOutletCounts(selectedStaff.id);
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const currentTab = Math.min(activeTab, days.length - 1);
  const totalAssigned = days.reduce((sum, day) => sum + (assignments[day] || []).length, 0);
  const areaOptionsFor = (day, index) => areas.map((area) => ({
    value: area,
    label: area,
    disabled: (assignments[day] || []).some((entry, entryIndex) => entryIndex !== index && normalizeAreaName(entry.locationName) === area),
  }));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title={isSelfService ? "My Day-wise Locations" : "Location Assignments"}
          description={isSelfService
            ? "Search and select saved areas for each working day."
            : "Choose a staff member, then search and select areas from Create Area for each day. On save, each area's outlets move to the day the area is assigned to."}
        />
        {areasError && <Notice tone="error" className="mb-4">{areasError} Refresh the page to retry.</Notice>}

        {!isSelfService && (
          <Card className="mb-5">
            <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
              <Field label="1 · Staff type" width="w-full">
                <select className={fieldClass} value={staffType} onChange={(event) => selectStaffType(event.target.value)}>
                  <option value="" disabled>Choose staff type</option>
                  <option value="distributor">Distributor</option>
                  <option value="cnf">CNF</option>
                </select>
              </Field>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">2 · Company</span>
                <SearchSelect
                  label="Select company" placeholder={staffType ? "Select company" : "Choose staff type first"} disabled={!staffType}
                  options={companies.map((company) => ({ value: company.id, label: company.name || "" }))}
                  value={selectedCompany?.id ?? null}
                  onChange={(id) => selectCompany(companies.find((company) => company.id === id) || null)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">3 · Staff</span>
                <SearchSelect
                  label="Select staff" placeholder={selectedCompany ? "Select staff" : "Choose company first"} disabled={!selectedCompany}
                  options={staff.map((employee) => ({ value: employee.id, label: employee.name || "" }))}
                  value={selectedStaff?.id ?? null}
                  onChange={(id) => selectStaff(staff.find((employee) => employee.id === id) || null)}
                  noOptionsText="No staff of this type in the company."
                />
              </div>
            </div>
          </Card>
        )}

        {!selectedStaff && !isSelfService && (
          <Card>
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Icon name="person_search" className="text-[36px] text-slate-300" />
              <p className="m-0 text-[13px] text-slate-500">Choose a staff type, company and staff member to see their day-wise areas.</p>
            </div>
          </Card>
        )}

        {selectedStaff && (
          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-slate-800 text-[12px] font-bold text-white">
                {String(selectedStaff.name || "?").trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 grow">
                <span className="block text-[14px] font-semibold text-slate-900">{selectedStaff.name}</span>
                <span className="block text-[12px] text-slate-500">{totalAssigned} area{totalAssigned === 1 ? "" : "s"} across {days.length === 1 ? "CNF" : "the week"}</span>
              </span>
            </div>

            {/* Day tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3 pt-2" role="tablist">
              {days.map((day, dayIndex) => {
                const count = (assignments[day] || []).length;
                const on = currentTab === dayIndex;
                return (
                  <button
                    key={day} type="button" role="tab" aria-selected={on} onClick={() => setActiveTab(dayIndex)}
                    className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition ${on ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                  >
                    {day}
                    <span className={`rounded-full px-1.5 text-[11px] ${on ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="flex justify-center py-14"><Spinner className="size-7" /></div>
            ) : days.map((day, dayIndex) => (
              <div key={day} hidden={currentTab !== dayIndex} className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="m-0 text-[14px] font-semibold text-slate-800">Assigned locations for {day}</h3>
                  <button type="button" className={btn.outline} disabled={areasLoading || Boolean(areasError) || saving} onClick={() => addLocation(day)}>
                    <Icon name="add" className="text-[18px]" />Assign Area
                  </button>
                </div>
                {(assignments[day] || []).length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-[13px] text-slate-400">No locations assigned.</div>
                )}
                <ol className="m-0 list-none space-y-2 p-0">
                  {(assignments[day] || []).map((location, index) => (
                    <li key={`${day}-${index}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-[11.5px] font-bold text-slate-500 ring-1 ring-slate-200">{index + 1}</span>
                      <div className="min-w-0 grow">
                        <SearchSelect
                          label={`Area ${index + 1} for ${day}`} placeholder="Search and select area"
                          options={areaOptionsFor(day, index)} loading={areasLoading}
                          disabled={areasLoading || saving || Boolean(areasError)}
                          value={normalizeAreaName(location.locationName) || null}
                          onChange={(value) => updateLocation(day, index, value || "")}
                          noOptionsText="No matching areas. Add new areas in Create Area."
                        />
                      </div>
                      {location.locationName && (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-slate-600 ring-1 ring-slate-200">
                          {outletCounts[normalizeAreaName(location.locationName)] || 0} outlet(s)
                        </span>
                      )}
                      <button type="button" className={`${btn.icon} hover:bg-red-50 hover:text-red-600`} onClick={() => removeLocation(day, index)} aria-label={`Remove area ${index + 1}`}>
                        <Icon name="delete_outline" className="text-[19px]" />
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}

            <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-5 py-3">
              <button type="button" className={btn.primary} disabled={loading || saving || areasLoading || Boolean(areasError)} onClick={saveAssignments}>
                <Icon name="save" className="text-[18px]" />{saving ? "Saving..." : "Save Assignments"}
              </button>
            </div>
          </Card>
        )}
      </div>
      <Footer />
    </DashboardLayout>
  );
}

export default LocationAssignments;
