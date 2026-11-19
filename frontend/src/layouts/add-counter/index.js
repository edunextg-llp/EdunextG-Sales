// Add Outlet: Tailwind CSS (no MUI). Staff / day / location selection, new outlets, Excel upload and
// download, edit and delete logic unchanged.
import { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { formatGoogleMapsLocation, isValidGoogleMapsShortUrl } from "utils/googleMapsLocation";
import { useAuth } from "context/AuthContext";
import { Card, Field, Icon, Modal, PageHeader, SearchSelect, btn, fieldClass } from "components/tw";

const GOOGLE_MAPS_HELPER_TEXT = "Use Google Maps Share link, e.g. https://maps.app.goo.gl/T9zxVHUGoiYcBX2s8";

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const createWeeklySchedule = () => Object.fromEntries(WEEK_DAYS.map((day) => [day, {
  isOff: false, firstHalfStart: "", firstHalfEnd: "", secondHalfStart: "", secondHalfEnd: "",
}]));

const createTimingTemplate = () => ({
  firstHalfStart: "",
  firstHalfEnd: "",
  secondHalfStart: "",
  secondHalfEnd: "",
});

const parseWeeklySchedule = (value) => {
  try {
    const stored = typeof value === "string" ? JSON.parse(value) : value;
    return WEEK_DAYS.reduce((schedule, day) => ({ ...schedule, [day]: { ...schedule[day], ...(stored?.[day] || {}) } }), createWeeklySchedule());
  } catch { return createWeeklySchedule(); }
};

const createEmptyOutlet = () => ({
  outletErpId: "",
  outletName: "",
  contactNumber: "",
  whatsappNumber: "",
  whatsappSameAsContact: false,
  hasGst: "no",
  gstNumber: "",
  address: "",
  googleLocation: "",
  priorityNumber: "",
  timingTemplate: createTimingTemplate(),
  operatingHours: createWeeklySchedule(),
});

const createEmptyEditForm = () => ({
  outletErpId: "",
  outletName: "",
  contactNumber: "",
  whatsappNumber: "",
  whatsappSameAsContact: false,
  hasGst: "no",
  gstNumber: "",
  address: "",
  googleLocation: "",
  serialNo: "",
  priorityNumber: "",
  operatingHours: createWeeklySchedule(),
});

const TIME_FIELDS = [["firstHalfStart", "First start"], ["firstHalfEnd", "First end"], ["secondHalfStart", "Second start"], ["secondHalfEnd", "Second end"]];

function SectionTitle({ children }) {
  return <h4 className="m-0 mb-3 text-[11.5px] font-bold uppercase tracking-[0.1em] text-slate-500">{children}</h4>;
}
SectionTitle.propTypes = { children: PropTypes.node.isRequired };

// Weekly opening hours: per day an Off box and two opening periods.
function WeeklyHours({ hours, onOff, onTime }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2">Day</th>
            <th className="px-3 py-2">Off</th>
            {TIME_FIELDS.map(([, label]) => <th key={label} className="px-2 py-2">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {WEEK_DAYS.map((day) => {
            const h = hours[day];
            return (
              <tr key={day} className={`border-t border-slate-100 ${h.isOff ? "bg-slate-50/70" : ""}`}>
                <td className="px-3 py-1.5 font-semibold text-slate-700">{day}</td>
                <td className="px-3 py-1.5">
                  <input type="checkbox" className="size-4 accent-blue-600" checked={h.isOff} onChange={(e) => onOff(day, e.target.checked)} aria-label={`${day} off`} />
                </td>
                {TIME_FIELDS.map(([field, label]) => (
                  <td key={field} className="px-2 py-1.5">
                    <input type="time" className={`${fieldClass} h-8`} disabled={h.isOff} value={h[field]} onChange={(e) => onTime(day, field, e.target.value)} aria-label={`${day} ${label}`} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
WeeklyHours.propTypes = { hours: PropTypes.object.isRequired, onOff: PropTypes.func.isRequired, onTime: PropTypes.func.isRequired };

function GstChoice({ value, onChange }) {
  return (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Outlet has GST">
      {[["yes", "Yes"], ["no", "No"]].map(([v, label]) => (
        <button
          key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded-lg px-4 py-1.5 text-[12.5px] font-semibold transition ${value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
GstChoice.propTypes = { value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired };

function AddCounter() {
  const { user } = useAuth();
  const isSelfService = user?.role === "staff";
  const userCompanyName = user?.companies?.[0]?.name || "";
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const cnfRouteDay = "CNF";
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaffType, setSelectedStaffType] = useState("");
  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedDay, setSelectedDay] = useState("");
  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [savedOutlets, setSavedOutlets] = useState([]);
  const [allStaffOutlets, setAllStaffOutlets] = useState([]);
  const [outletSearchQuery, setOutletSearchQuery] = useState("");
  const [exportingOutlets, setExportingOutlets] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [uploadingOutlets, setUploadingOutlets] = useState(false);
  const outletUploadInputRef = useRef(null);
  const [editingOutletId, setEditingOutletId] = useState(null);
  const [editFormData, setEditFormData] = useState(createEmptyEditForm());

  const API = (process.env.REACT_APP_API_URL);
  const isCnfStaff = selectedStaff?.staff_type === "cnf";
  const routeDay = isCnfStaff ? cnfRouteDay : selectedDay;

  const getStaffCompanies = (staff) =>
    String(staff?.company_name || "")
      .split(",")
      .map((company) => company.trim())
      .filter(Boolean);

  const companyOptions = [
    ...new Set(
      staffOptions
        .filter((staff) => !selectedStaffType || (staff.staff_type || "distributor") === selectedStaffType)
        .flatMap(getStaffCompanies)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filteredStaffOptions = staffOptions.filter((staff) => {
    const matchesType = !selectedStaffType || (staff.staff_type || "distributor") === selectedStaffType;
    const matchesCompany =
      !selectedCompanyName || getStaffCompanies(staff).includes(selectedCompanyName);
    return matchesType && matchesCompany;
  });

  const normalizeText = (value) => String(value || "").trim().toLowerCase();

  const displayedSavedOutlets = selectedLocation
    ? savedOutlets.filter(
      (outlet) => normalizeText(outlet.location_name) === normalizeText(selectedLocation)
    )
    : savedOutlets;

  const outletsAvailableForEditing = isSelfService ? allStaffOutlets : displayedSavedOutlets;
  const filteredOutletsForEditing = outletsAvailableForEditing.filter((outlet) => (
    normalizeText(outlet.outlet_name).includes(normalizeText(outletSearchQuery))
  ));

  const locationSavedSerialMax = displayedSavedOutlets.reduce(
    (max, outlet) => Math.max(max, Number(outlet.serial_no) || 0),
    0
  );

  const getPendingSerial = (index) => locationSavedSerialMax + index + 1;

  const fetchStaffOptions = async (query = "") => {
    try {
      const endpoint = query.trim()
        ? `${API}/staff/search?query=${encodeURIComponent(query)}`
        : `${API}/staff`;
      const response = await fetch(endpoint);
      if (!response.ok) return;
      const data = await response.json();
      setStaffOptions(data);
    } catch (error) {
      console.error("Error searching staff:", error);
    }
  };

  useEffect(() => {
    if (!isSelfService) {
      fetchStaffOptions();
      return;
    }
    fetch(`${API}/staff/${user.staffId}`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Unable to load your employee profile.");
        const companyName = getStaffCompanies(data)[0] || userCompanyName;
        setStaffOptions([data]);
        setSelectedStaffType(data.staff_type || user.staffType || "distributor");
        setSelectedCompanyName(companyName);
        setSelectedStaff(data);
      })
      .catch((error) => alert(error.message));
  }, [isSelfService, user?.staffId, user?.staffType, userCompanyName]);

  useEffect(() => {
    if (isSelfService) return;
    setSelectedCompanyName("");
    setSelectedStaff(null);
  }, [selectedStaffType, isSelfService]);

  useEffect(() => {
    if (isSelfService) return;
    setSelectedStaff(null);
  }, [selectedCompanyName, isSelfService]);

  const fetchSavedOutlets = async (staffId, day) => {
    try {
      const response = await fetch(`${API}/staff/${staffId}/outlets-by-day?day=${day}`);
      const data = await response.json();
      setSavedOutlets(data);
    } catch (error) {
      console.error("Error fetching saved outlets:", error);
    }
  };

  const fetchAllStaffOutlets = async (staffId) => {
    try {
      const response = await fetch(`${API}/staff/${staffId}/all-counters`);
      if (!response.ok) throw new Error("Unable to load all outlets.");
      const data = await response.json();
      setAllStaffOutlets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching all staff outlets:", error);
      setAllStaffOutlets([]);
    }
  };

  useEffect(() => {
    if (isSelfService && selectedStaff?.id) {
      fetchAllStaffOutlets(selectedStaff.id);
    } else {
      setAllStaffOutlets([]);
    }
  }, [isSelfService, selectedStaff?.id]);

  const downloadOutletsExcel = async () => {
    setExportingOutlets(true);
    try {
      const response = await fetch(`${API}/staff/outlets-export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to download outlets.");
      }
      const file = await response.blob();
      const url = window.URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "all_outlets.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message || "Failed to download outlets.");
    } finally {
      setExportingOutlets(false);
    }
  };

  const downloadOutletTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const response = await fetch(`${API}/staff/outlets-template`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to download outlet template.");
      }
      const file = await response.blob();
      const url = window.URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Add_Outlet_Upload_Template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message || "Failed to download outlet template.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const uploadOutletsExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedStaff || !selectedCompanyName || !routeDay || !selectedLocation) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyName", selectedCompanyName);
    formData.append("day", routeDay);
    formData.append("location", selectedLocation);

    setUploadingOutlets(true);
    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/outlets-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to upload outlets.");
      alert(data.message || "Outlets uploaded successfully.");
      setOutlets([]);
      fetchSavedOutlets(selectedStaff.id, routeDay);
      if (isSelfService) fetchAllStaffOutlets(selectedStaff.id);
    } catch (error) {
      alert(error.message || "Failed to upload outlets.");
    } finally {
      setUploadingOutlets(false);
    }
  };

  useEffect(() => {
    if (!selectedStaff) {
      setSelectedDay("");
      setSelectedLocation("");
      setAvailableLocations([]);
      setOutlets([]);
      setSavedOutlets([]);
      return;
    }

    setSelectedLocation("");
    setAvailableLocations([]);
    setOutlets([]);
    setSavedOutlets([]);

    if (selectedStaff.staff_type === "cnf") {
      setSelectedDay(cnfRouteDay);
    } else if (selectedDay === cnfRouteDay) {
      setSelectedDay("");
    }
  }, [selectedStaff, selectedDay]);

  // Fetch locations when staff or route day changes
  useEffect(() => {
    if (selectedStaff && routeDay) {
      const fetchLocations = async () => {
        try {
          const response = await fetch(
            `${API}/staff/${selectedStaff.id}/locations?day=${routeDay}`
          );
          const data = await response.json();
          setAvailableLocations(data);
          setSelectedLocation("");
        } catch (error) {
          console.error("Error fetching locations:", error);
        }
      };
      fetchLocations();
      fetchSavedOutlets(selectedStaff.id, routeDay);
    } else {
      setAvailableLocations([]);
      setSavedOutlets([]);
    }
  }, [selectedStaff, routeDay]);

  const addOutletField = () => {
    setOutlets([...outlets, createEmptyOutlet()]);
  };

  const removeOutletField = (index) => {
    const updated = [...outlets];
    updated.splice(index, 1);
    setOutlets(updated);
  };

  const handleOutletChange = (index, field, value) => {
    const updated = [...outlets];
    const nextValue = field === "contactNumber" || field === "whatsappNumber"
      ? String(value || "").replace(/\D/g, "")
      : field === "gstNumber"
        ? String(value || "").toUpperCase()
        : value;

    updated[index][field] = nextValue;

    if (field === "hasGst" && value === "no") {
      updated[index].gstNumber = "";
    }

    if (field === "contactNumber" && updated[index].whatsappSameAsContact) {
      updated[index].whatsappNumber = nextValue;
    }

    setOutlets(updated);
  };

  const handleWhatsappSameAsContact = (index, checked) => {
    const updated = [...outlets];
    updated[index].whatsappSameAsContact = checked;
    if (checked) {
      updated[index].whatsappNumber = updated[index].contactNumber || "";
    }
    setOutlets(updated);
  };

  const handleTimingTemplateChange = (index, field, value) => {
    setOutlets((current) => current.map((outlet, outletIndex) => (
      outletIndex === index
        ? { ...outlet, timingTemplate: { ...outlet.timingTemplate, [field]: value } }
        : outlet
    )));
  };

  const applyTimingTemplateToWorkingDays = (index) => {
    setOutlets((current) => current.map((outlet, outletIndex) => {
      if (outletIndex !== index) return outlet;
      const template = outlet.timingTemplate || createTimingTemplate();
      const operatingHours = Object.fromEntries(WEEK_DAYS.map((day) => {
        const hours = outlet.operatingHours[day];
        return [day, hours.isOff ? hours : { ...hours, ...template }];
      }));
      return { ...outlet, operatingHours };
    }));
  };

  const handleOutletGoogleLocationBlur = (index) => {
    const updated = [...outlets];
    updated[index].googleLocation = formatGoogleMapsLocation(updated[index].googleLocation);
    setOutlets(updated);
  };

  const handleEditGoogleLocationBlur = () => {
    setEditFormData((prev) => ({
      ...prev,
      googleLocation: formatGoogleMapsLocation(prev.googleLocation),
    }));
  };

  const handleSubmit = async () => {
    if (!selectedStaff || !routeDay || !selectedLocation || outlets.length === 0) {
      alert("Please fill in all details and add at least one outlet.");
      return;
    }

    const erpIds = outlets.map((outlet) => normalizeText(outlet.outletErpId)).filter(Boolean);
    const formattedOutlets = outlets.map((outlet) => ({
      outletErpId: outlet.outletErpId,
      outletName: outlet.outletName,
      contactNumber: outlet.contactNumber,
      whatsappNumber: outlet.whatsappSameAsContact
        ? outlet.contactNumber
        : outlet.whatsappNumber,
      hasGst: outlet.hasGst === "yes",
      gstNumber: outlet.hasGst === "yes" ? String(outlet.gstNumber || "").trim().toUpperCase() : "",
      address: String(outlet.address || "").trim(),
      googleLocation: formatGoogleMapsLocation(outlet.googleLocation),
      priorityNumber: outlet.priorityNumber,
      operatingHours: outlet.operatingHours,
    }));
    const missingGstNumber = formattedOutlets.some(
      (outlet) => outlet.hasGst && !outlet.gstNumber
    );
    const missingGoogleLocation = formattedOutlets.some((outlet) => !String(outlet.googleLocation || "").trim());
    const invalidGoogleLocation = formattedOutlets.find(
      (outlet) => outlet.googleLocation && !isValidGoogleMapsShortUrl(outlet.googleLocation)
    );
    const savedErpIds = new Set(savedOutlets.map((outlet) => normalizeText(outlet.outlet_erp_id)));
    const hasDuplicateErp =
      erpIds.some((erpId, index) => erpIds.indexOf(erpId) !== index) ||
      erpIds.some((erpId) => savedErpIds.has(erpId));

    if (erpIds.length !== outlets.length) {
      alert("ERP ID is mandatory for every outlet.");
      return;
    }

    if (hasDuplicateErp) {
      alert("Same ERP Id already exists. Please use a unique ERP Id.");
      return;
    }

    if (missingGstNumber) {
      alert("Please enter GST number for outlets with GST enabled.");
      return;
    }

    if (missingGoogleLocation) {
      alert("Please enter Google Location for every outlet.");
      return;
    }

    if (invalidGoogleLocation) {
      alert(`Google Location must be a short link like https://maps.app.goo.gl/T9zxVHUGoiYcBX2s8`);
      return;
    }

    setOutlets((prev) =>
      prev.map((outlet, index) => ({
        ...outlet,
        googleLocation: formattedOutlets[index].googleLocation,
        whatsappNumber: formattedOutlets[index].whatsappNumber,
      }))
    );

    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/counters`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          day: routeDay,
          location: selectedLocation,
          counters: formattedOutlets,
        }),
      });

      if (response.ok) {
        alert("Outlets added successfully!");
        setOutlets([]);
        setSelectedLocation("");
        fetchSavedOutlets(selectedStaff.id, routeDay);
        if (isSelfService) fetchAllStaffOutlets(selectedStaff.id);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to add outlets.");
      }
    } catch (error) {
      console.error("Error submitting outlets:", error);
      alert("Error submitting form.");
    }
  };

  const handleDeleteSavedOutlet = async (counterId) => {
    if (!window.confirm("Are you sure you want to delete this outlet?")) return;
    try {
      const response = await fetch(`${API}/staff/counter/${counterId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        alert("Outlet deleted successfully!");
        fetchSavedOutlets(selectedStaff.id, routeDay);
        if (isSelfService) fetchAllStaffOutlets(selectedStaff.id);
      } else {
        alert("Failed to delete outlet.");
      }
    } catch (error) {
      console.error("Error deleting outlet:", error);
    }
  };

  const handleEditClick = (outlet) => {
    const contactNumber = outlet.contact_number || "";
    const whatsappNumber = outlet.whatsapp_number || contactNumber;
    setEditingOutletId(outlet.id);
    setEditFormData({
      outletErpId: outlet.outlet_erp_id,
      outletName: outlet.outlet_name,
      contactNumber,
      whatsappNumber,
      whatsappSameAsContact: Boolean(contactNumber) && contactNumber === whatsappNumber,
      hasGst: outlet.has_gst ? "yes" : "no",
      gstNumber: outlet.gst_number || "",
      address: outlet.address || "",
      googleLocation: outlet.google_location || "",
      serialNo: outlet.serial_no != null ? String(outlet.serial_no) : "",
      priorityNumber: outlet.priority_number != null ? String(outlet.priority_number) : "",
      operatingHours: parseWeeklySchedule(outlet.operating_hours),
    });
  };

  const handleCancelEdit = () => {
    setEditingOutletId(null);
    setEditFormData(createEmptyEditForm());
  };

  const handleEditFormChange = (field, value) => {
    const nextValue = field === "contactNumber" || field === "whatsappNumber"
      ? String(value || "").replace(/\D/g, "")
      : field === "gstNumber"
        ? String(value || "").toUpperCase()
        : value;

    setEditFormData((prev) => {
      const updated = { ...prev, [field]: nextValue };
      if (field === "contactNumber" && updated.whatsappSameAsContact) {
        updated.whatsappNumber = nextValue;
      }
      if (field === "hasGst" && value === "no") {
        updated.gstNumber = "";
      }
      return updated;
    });
  };

  const handleEditWhatsappSameAsContact = (checked) => {
    setEditFormData((prev) => ({
      ...prev,
      whatsappSameAsContact: checked,
      whatsappNumber: checked ? prev.contactNumber || "" : prev.whatsappNumber,
    }));
  };

  const handleSaveEdit = async (counterId) => {
    if (editFormData.hasGst === "yes" && !String(editFormData.gstNumber || "").trim()) {
      alert("Please enter GST number when GST is enabled.");
      return;
    }

    if (!String(editFormData.googleLocation || "").trim()) {
      alert("Please enter Google Location.");
      return;
    }

    const formattedGoogleLocation = formatGoogleMapsLocation(editFormData.googleLocation);
    if (!isValidGoogleMapsShortUrl(formattedGoogleLocation)) {
      alert("Google Location must be a short link like https://maps.app.goo.gl/T9zxVHUGoiYcBX2s8");
      return;
    }

    try {
      const response = await fetch(`${API}/staff/counter/${counterId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outletErpId: editFormData.outletErpId,
          outletName: editFormData.outletName,
          contactNumber: editFormData.contactNumber,
          whatsappNumber: editFormData.whatsappSameAsContact
            ? editFormData.contactNumber
            : editFormData.whatsappNumber,
          hasGst: editFormData.hasGst === "yes",
          gstNumber: editFormData.hasGst === "yes"
            ? String(editFormData.gstNumber || "").trim().toUpperCase()
            : "",
          address: String(editFormData.address || "").trim(),
          googleLocation: formattedGoogleLocation,
          serialNo: editFormData.serialNo,
          priorityNumber: editFormData.priorityNumber,
          operatingHours: editFormData.operatingHours,
        }),
      });

      if (response.ok) {
        alert("Outlet updated successfully!");
        setEditingOutletId(null);
        fetchSavedOutlets(selectedStaff.id, routeDay);
        if (isSelfService) fetchAllStaffOutlets(selectedStaff.id);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update outlet.");
      }
    } catch (error) {
      console.error("Error updating outlet:", error);
      alert("Error updating outlet.");
    }
  };

  const editingOutlet = editingOutletId ? outletsAvailableForEditing.find((outlet) => outlet.id === editingOutletId) : null;
  const sameAsContactBox = (checked, onChange) => (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-slate-600">
      <input type="checkbox" className="size-4 accent-blue-600" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      WhatsApp number same as contact number
    </label>
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title={isSelfService ? "My Day-wise Outlets" : "Add Outlets to Staff"}
          description={isSelfService
            ? "Select a day and one of your saved locations, then add outlets."
            : "Choose a staff member, the day and the location, then add their outlets one by one or upload an Excel sheet."}
          actions={(
            <>
              <button type="button" className={btn.outline} onClick={downloadOutletTemplate} disabled={downloadingTemplate}>
                <Icon name="download" className="text-[18px] text-blue-600" />{downloadingTemplate ? "Preparing Template..." : "Add Outlet Template"}
              </button>
              {!isSelfService && (
                <button type="button" className={btn.outline} onClick={downloadOutletsExcel} disabled={exportingOutlets}>
                  <Icon name="table_view" className="text-[18px] text-emerald-600" />{exportingOutlets ? "Preparing Excel..." : "All Outlets Excel"}
                </button>
              )}
            </>
          )}
        />

        {/* Who, which day, which location */}
        <Card className="mb-5">
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
            {!isSelfService && (
              <>
                <Field label="1 · Staff type" width="w-full">
                  <select className={fieldClass} value={selectedStaffType} onChange={(e) => setSelectedStaffType(e.target.value)}>
                    <option value="">Select staff type</option>
                    <option value="distributor">Distributor</option>
                    <option value="cnf">CNF</option>
                  </select>
                </Field>
                <Field label="2 · Company name" width="w-full">
                  <select className={fieldClass} value={selectedCompanyName} disabled={!selectedStaffType} onChange={(e) => setSelectedCompanyName(e.target.value)}>
                    <option value="">{selectedStaffType && companyOptions.length === 0 ? `No ${selectedStaffType === "cnf" ? "CNF" : "Distributor"} company found` : "Select company"}</option>
                    {companyOptions.map((companyName) => <option key={companyName} value={companyName}>{companyName}</option>)}
                  </select>
                </Field>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">3 · Staff</span>
                  <SearchSelect
                    label="Search staff name" placeholder={!selectedStaffType || !selectedCompanyName ? "Choose type and company first" : "Search staff name"}
                    disabled={!selectedStaffType || !selectedCompanyName}
                    options={filteredStaffOptions.map((staff) => ({ value: staff.id, label: staff.name || "" }))}
                    value={selectedStaff?.id ?? null}
                    onChange={(id) => setSelectedStaff(filteredStaffOptions.find((staff) => staff.id === id) || null)}
                  />
                </div>
              </>
            )}
            {isSelfService && selectedStaff && (
              <div className="md:col-span-3">
                <span className="block text-[14px] font-semibold text-slate-900">{selectedStaff.name} — {selectedCompanyName}</span>
                <span className="block text-[12.5px] text-slate-500">Select a day and one of your saved locations, then add outlets.</span>
              </div>
            )}
            {selectedStaff && !isCnfStaff && (
              <Field label={isSelfService ? "Day" : "4 · Day"} width="w-full">
                <select className={fieldClass} value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
                  <option value="">Select day</option>
                  {days.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
              </Field>
            )}
            {selectedStaff && (
              <Field label={isSelfService ? "Location" : "5 · Location"} width="w-full">
                <select className={fieldClass} value={selectedLocation} disabled={!routeDay} onChange={(e) => setSelectedLocation(e.target.value)}>
                  <option value="">
                    {routeDay && availableLocations.length === 0
                      ? (isCnfStaff ? "No CNF locations assigned" : "No locations assigned for this day")
                      : "Select location"}
                  </option>
                  {availableLocations.map((loc) => <option key={loc.id} value={loc.location_name}>{loc.location_name}</option>)}
                </select>
              </Field>
            )}
          </div>
        </Card>

        {/* New outlets for the chosen location */}
        {selectedLocation && (
          <Card className="mb-5">
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
              <div className="min-w-0 grow">
                <h3 className="m-0 text-[15px] font-semibold text-slate-900">Add Outlets</h3>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-slate-500">
                  Location
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-semibold text-blue-800">
                    <Icon name="place" className="text-[14px]" />{selectedLocation}
                  </span>
                  {outlets.length > 0 && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">{outlets.length} outlet{outlets.length > 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
              <button type="button" className={btn.outline} onClick={() => outletUploadInputRef.current?.click()} disabled={uploadingOutlets}>
                <Icon name="upload_file" className="text-[18px] text-blue-600" />{uploadingOutlets ? "Uploading..." : "Upload Excel"}
              </button>
              <input ref={outletUploadInputRef} type="file" accept=".xls,.xlsx" hidden onChange={uploadOutletsExcel} />
              <button type="button" className={btn.primary} onClick={addOutletField}>
                <Icon name="add" className="text-[18px]" />Add Outlet
              </button>
            </div>

            <div className="space-y-5 p-5">
              {outlets.length === 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                  <Icon name="storefront" className="text-[38px] text-slate-300" />
                  <p className="m-0 text-[13.5px] font-semibold text-slate-600">No outlets added yet</p>
                  <p className="m-0 mb-3 text-[12.5px] text-slate-500">Click &quot;Add Outlet&quot; to start adding outlet details for this location.</p>
                  <button type="button" className={btn.outline} onClick={addOutletField}><Icon name="add" className="text-[18px]" />Add First Outlet</button>
                </div>
              ) : outlets.map((outlet, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={index} className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500 text-[12px] font-bold text-white">{getPendingSerial(index)}</span>
                    <span className="grow text-[13.5px] font-semibold text-slate-800">Outlet {getPendingSerial(index)}{outlet.outletName ? ` · ${outlet.outletName}` : ""}</span>
                    <button type="button" className={`${btn.icon} hover:bg-red-50 hover:text-red-600`} onClick={() => removeOutletField(index)} title="Remove outlet" aria-label={`Remove outlet ${getPendingSerial(index)}`}>
                      <Icon name="delete_outline" className="text-[19px]" />
                    </button>
                  </div>
                  <div className="space-y-5 p-4">
                    <section>
                      <SectionTitle>Outlet details</SectionTitle>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
                        <Field label="ERP Id" width="w-full">
                          <input className={fieldClass} value={outlet.outletErpId} onChange={(e) => handleOutletChange(index, "outletErpId", e.target.value)} />
                        </Field>
                        <Field label="Outlet name" width="w-full">
                          <input className={fieldClass} value={outlet.outletName} onChange={(e) => handleOutletChange(index, "outletName", e.target.value)} />
                        </Field>
                      </div>
                    </section>
                    <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                      <div>
                        <SectionTitle>GST</SectionTitle>
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outlet has GST?</span>
                            <GstChoice value={outlet.hasGst} onChange={(v) => handleOutletChange(index, "hasGst", v)} />
                          </div>
                          {outlet.hasGst === "yes" && (
                            <Field label="GST no *" width="w-56">
                              <input className={fieldClass} value={outlet.gstNumber} onChange={(e) => handleOutletChange(index, "gstNumber", e.target.value)} />
                            </Field>
                          )}
                        </div>
                      </div>
                      <div>
                        <SectionTitle>Contact</SectionTitle>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Contact number" width="w-full">
                            <input className={fieldClass} inputMode="numeric" value={outlet.contactNumber} onChange={(e) => handleOutletChange(index, "contactNumber", e.target.value)} />
                          </Field>
                          <Field label="WhatsApp number" width="w-full">
                            <input className={fieldClass} inputMode="numeric" value={outlet.whatsappNumber} disabled={outlet.whatsappSameAsContact} onChange={(e) => handleOutletChange(index, "whatsappNumber", e.target.value)} />
                          </Field>
                        </div>
                        <div className="mt-2">{sameAsContactBox(outlet.whatsappSameAsContact, (checked) => handleWhatsappSameAsContact(index, checked))}</div>
                      </div>
                    </section>
                    <section>
                      <SectionTitle>Location</SectionTitle>
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Address</span>
                          <textarea rows={2} className={`${fieldClass} h-auto py-2`} value={outlet.address} onChange={(e) => handleOutletChange(index, "address", e.target.value)} />
                        </label>
                        <Field label="Google location" width="w-full" hint={GOOGLE_MAPS_HELPER_TEXT}>
                          <input className={fieldClass} value={outlet.googleLocation} onChange={(e) => handleOutletChange(index, "googleLocation", e.target.value)} onBlur={() => handleOutletGoogleLocationBlur(index)} />
                        </Field>
                      </div>
                    </section>
                    <section>
                      <SectionTitle>Visit schedule (optional)</SectionTitle>
                      <Field label="Priority number (optional)" width="w-48">
                        <input type="number" min={1} className={fieldClass} value={outlet.priorityNumber} onChange={(e) => handleOutletChange(index, "priorityNumber", e.target.value)} />
                      </Field>
                    </section>
                    <section>
                      <SectionTitle>Weekly outlet timings (optional)</SectionTitle>
                      <p className="m-0 mb-3 text-[12.5px] text-slate-500">Leave this section blank, or set two opening periods for each day.</p>
                      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <span className="w-full text-[12.5px] font-semibold text-slate-700">Timings for all working days</span>
                        {[["firstHalfStart", "First half start"], ["firstHalfEnd", "First half end"], ["secondHalfStart", "Second half start"], ["secondHalfEnd", "Second half end"]].map(([field, label]) => (
                          <Field key={field} label={label} width="w-36">
                            <input type="time" className={fieldClass} value={outlet.timingTemplate?.[field] || ""} onChange={(e) => handleTimingTemplateChange(index, field, e.target.value)} />
                          </Field>
                        ))}
                        <button type="button" className={btn.outline} onClick={() => applyTimingTemplateToWorkingDays(index)}>
                          <Icon name="done_all" className="text-[18px] text-blue-600" />Apply to All Days
                        </button>
                      </div>
                      <WeeklyHours
                        hours={outlet.operatingHours}
                        onOff={(day, checked) => { const updated = [...outlets]; updated[index].operatingHours[day].isOff = checked; setOutlets(updated); }}
                        onTime={(day, field, value) => { const updated = [...outlets]; updated[index].operatingHours[day][field] = value; setOutlets(updated); }}
                      />
                    </section>
                  </div>
                </div>
              ))}
            </div>

            {outlets.length > 0 && (
              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                <button type="button" className={btn.ghost} onClick={() => setOutlets([])}>Clear All</button>
                <button type="button" className={btn.primary} onClick={handleSubmit}>
                  <Icon name="save" className="text-[18px]" />Save {outlets.length} Outlet{outlets.length > 1 ? "s" : ""}
                </button>
              </div>
            )}
          </Card>
        )}

        {/* Saved outlets */}
        {outletsAvailableForEditing.length > 0 && (
          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
              <h3 className="m-0 grow text-[15px] font-semibold text-slate-900">
                {isSelfService
                  ? `All My Outlets (${filteredOutletsForEditing.length}/${outletsAvailableForEditing.length})`
                  : `Saved Outlets for ${isCnfStaff ? "CNF" : selectedDay}${selectedLocation ? ` — ${selectedLocation}` : ""}`}
              </h3>
              <div className="relative w-full max-w-xs">
                <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                <input type="search" value={outletSearchQuery} onChange={(event) => setOutletSearchQuery(event.target.value)} placeholder="Search outlet name" aria-label="Search outlet name" className={`${fieldClass} pl-8`} />
              </div>
            </div>
            {filteredOutletsForEditing.length === 0 ? (
              <p className="m-0 py-12 text-center text-[13px] text-slate-400">No outlet name matches “{outletSearchQuery}”.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {isSelfService && <th className="px-4 py-2.5">Day / location</th>}
                      <th className="px-4 py-2.5">Sr</th>
                      <th className="px-3 py-2.5">Priority</th>
                      <th className="px-3 py-2.5">Outlet</th>
                      <th className="px-3 py-2.5">Contact</th>
                      <th className="px-3 py-2.5">Address</th>
                      <th className="px-3 py-2.5">GST</th>
                      <th className="px-3 py-2.5">Map</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOutletsForEditing.map((saved) => (
                      <tr key={saved.id} className={`border-t border-slate-100 align-top hover:bg-slate-50/70 ${editingOutletId === saved.id ? "bg-blue-50/50" : ""}`}>
                        {isSelfService && <td className="px-4 py-2.5 font-semibold text-slate-700">{saved.day || "—"} · {saved.location_name || "—"}</td>}
                        <td className="px-4 py-2.5">
                          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-100 text-[12px] font-bold text-slate-700">{saved.serial_no || "—"}</span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-slate-600">{saved.priority_number || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className="block font-semibold text-slate-800">{saved.outlet_name}</span>
                          <span className="block font-mono text-[11.5px] text-slate-400">{saved.outlet_erp_id}</span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <span className="block text-slate-700">{saved.contact_number}</span>
                          <span className="block text-[11.5px] text-slate-500">WA: {saved.whatsapp_number || saved.contact_number || "-"}</span>
                        </td>
                        <td className="max-w-56 px-3 py-2.5 text-[12.5px] text-slate-500">{saved.address || "-"}</td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${saved.has_gst ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{saved.has_gst ? "Yes" : "No"}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {saved.google_location ? (
                            <a href={saved.google_location} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
                              <Icon name="map" className="text-[16px]" />Open
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400"><Icon name="map" className="text-[16px]" />None</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="inline-flex gap-0.5">
                            <button type="button" className={`${btn.icon} hover:text-amber-700`} onClick={() => handleEditClick(saved)} title="Edit outlet" aria-label={`Edit ${saved.outlet_name}`}>
                              <Icon name="edit" className="text-[19px]" />
                            </button>
                            <button type="button" className={`${btn.icon} hover:bg-red-50 hover:text-red-600`} onClick={() => handleDeleteSavedOutlet(saved.id)} title="Delete outlet" aria-label={`Delete ${saved.outlet_name}`}>
                              <Icon name="delete_outline" className="text-[19px]" />
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Edit a saved outlet */}
      <Modal
        open={Boolean(editingOutletId)} onClose={handleCancelEdit} size="xl" title={`Edit Outlet${editingOutlet ? ` · ${editingOutlet.outlet_name}` : ""}`}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={handleCancelEdit}>Cancel</button>
            <button type="button" className={btn.primary} onClick={() => handleSaveEdit(editingOutletId)}><Icon name="save" className="text-[18px]" />Save</button>
          </>
        )}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Sr no" width="w-full">
              <input type="number" min={1} className={fieldClass} value={editFormData.serialNo} onChange={(e) => handleEditFormChange("serialNo", e.target.value)} />
            </Field>
            <Field label="Priority (optional)" width="w-full">
              <input type="number" min={1} className={fieldClass} value={editFormData.priorityNumber} onChange={(e) => handleEditFormChange("priorityNumber", e.target.value)} />
            </Field>
            <Field label="ERP Id" width="w-full">
              <input className={fieldClass} value={editFormData.outletErpId} onChange={(e) => handleEditFormChange("outletErpId", e.target.value)} />
            </Field>
            <Field label="Outlet name" width="w-full">
              <input className={fieldClass} value={editFormData.outletName} onChange={(e) => handleEditFormChange("outletName", e.target.value)} />
            </Field>
            <Field label="Contact" width="w-full">
              <input className={fieldClass} inputMode="numeric" value={editFormData.contactNumber} onChange={(e) => handleEditFormChange("contactNumber", e.target.value)} />
            </Field>
            <Field label="WhatsApp number" width="w-full">
              <input className={fieldClass} inputMode="numeric" value={editFormData.whatsappNumber} disabled={editFormData.whatsappSameAsContact} onChange={(e) => handleEditFormChange("whatsappNumber", e.target.value)} />
            </Field>
            <div className="col-span-2 self-end pb-2">{sameAsContactBox(editFormData.whatsappSameAsContact, handleEditWhatsappSameAsContact)}</div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">GST?</span>
              <GstChoice value={editFormData.hasGst} onChange={(v) => handleEditFormChange("hasGst", v)} />
            </div>
            {editFormData.hasGst === "yes" && (
              <Field label="GST no *" width="w-56">
                <input className={fieldClass} value={editFormData.gstNumber} onChange={(e) => handleEditFormChange("gstNumber", e.target.value)} />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Address</span>
              <textarea rows={2} className={`${fieldClass} h-auto py-2`} value={editFormData.address} onChange={(e) => handleEditFormChange("address", e.target.value)} />
            </label>
            <Field label="Google location" width="w-full" hint={GOOGLE_MAPS_HELPER_TEXT}>
              <input className={fieldClass} value={editFormData.googleLocation} onChange={(e) => handleEditFormChange("googleLocation", e.target.value)} onBlur={handleEditGoogleLocationBlur} />
            </Field>
          </div>
          <div>
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Weekly outlet timings</span>
            <WeeklyHours
              hours={editFormData.operatingHours}
              onOff={(day, checked) => setEditFormData((prev) => ({ ...prev, operatingHours: { ...prev.operatingHours, [day]: { ...prev.operatingHours[day], isOff: checked } } }))}
              onTime={(day, field, value) => setEditFormData((prev) => ({ ...prev, operatingHours: { ...prev.operatingHours, [day]: { ...prev.operatingHours[day], [field]: value } } }))}
            />
          </div>
        </div>
      </Modal>
      <Footer />
    </DashboardLayout>
  );
}

export default AddCounter;
