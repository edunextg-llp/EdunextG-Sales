// Create Staff (company staff, Bawarchee staff, operators): Tailwind CSS (no MUI).
// Staff list, create / edit, documents, permissions and credentials logic unchanged.
import { useState, useEffect } from "react";
import PropTypes from "prop-types";

import {
  STAFF_PERMISSION_GROUPS,
  BAWARCHEE_ROLE_OPTIONS,
  BAWARCHEE_ROLE_PRESETS,
  bawarcheeRoleLabel,
  normalizeStaffPermissions,
} from "utils/staffPermissions";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  formatDateLabel,
  isImageDocument,
  uploadStaffDocument,
} from "utils/uploadStaffDocument";
import {
  Card, Field, Icon, Modal, PageHeader, StatBox, Toggle, TriCheck, btn, fieldClass, initialsOf, td, th,
} from "components/tw";

const createEmptyAssignments = () => ({
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: [],
  Saturday: [],
  CNF: [],
});

const createEmptyFormData = () => ({
  name: "",
  contactNo: "",
  whatsappNumber: "",
  whatsappSameAsContact: false,
  email: "",
  dob: "",
  aadharNo: "",
  aadharDocumentUrl: "",
  pccCertificateUrl: "",
  selectedCompanies: [],
  staffCategory: "company_staff",
  staffType: "distributor",
  bawarcheeRole: "",
  permissions: [],
  assignments: createEmptyAssignments(),
});

function SectionTitle({ children, aside }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h4 className="m-0 text-[11.5px] font-bold uppercase tracking-[0.1em] text-slate-500">{children}</h4>
      {aside && <span className="text-[12px] text-slate-500">{aside}</span>}
    </div>
  );
}
SectionTitle.propTypes = { children: PropTypes.node.isRequired, aside: PropTypes.node };
SectionTitle.defaultProps = { aside: null };

function DocumentPreview({ title, url }) {
  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[12.5px] text-slate-400">
        No {title} uploaded
      </div>
    );
  }
  if (isImageDocument(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt={title} className="max-h-56 w-full rounded-xl border border-slate-200 object-cover" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`${btn.outline} w-full justify-center`}>
      <Icon name="picture_as_pdf" className="text-[18px] text-red-600" />View {title}
    </a>
  );
}
DocumentPreview.propTypes = { title: PropTypes.string.isRequired, url: PropTypes.string };
DocumentPreview.defaultProps = { url: "" };

// "Upload" button around a hidden file input.
function UploadButton({ label, busyLabel, busy, onChange, done }) {
  return (
    <div>
      <label className={`${btn.outline} w-full cursor-pointer justify-center ${busy ? "pointer-events-none opacity-50" : ""}`}>
        <Icon name="upload_file" className="text-[18px] text-blue-600" />{busy ? busyLabel : label}
        <input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onChange} disabled={busy} />
      </label>
      <p className="m-0 mt-1 text-[11.5px] text-slate-500">JPG, PNG, WebP or PDF · max 1 MB</p>
      {done && <p className="m-0 mt-0.5 flex items-center gap-1 text-[11.5px] font-semibold text-emerald-700"><Icon name="check_circle" className="text-[14px]" />{done}</p>}
    </div>
  );
}
UploadButton.propTypes = { label: PropTypes.string.isRequired, busyLabel: PropTypes.string.isRequired, busy: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired, done: PropTypes.string };
UploadButton.defaultProps = { done: "" };

const CATEGORY_LABELS = { company_staff: "Company Staff", bawarchee_staff: "Bawarchee Staff", operator: "Operator" };
const categoryTone = (category) => (category === "bawarchee_staff" ? "bg-violet-600" : category === "operator" ? "bg-amber-600" : "bg-blue-600");

const getStaffTypeLabel = (staff) => {
  if (!staff) return "—";
  if (staff.staff_category === "bawarchee_staff") return bawarcheeRoleLabel(staff.bawarchee_role) || "—";
  return (staff.staff_type || "distributor") === "cnf" ? "CNF" : "Distributor";
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(String(text || ""));
  } catch (error) {
    console.error("Copy failed:", error);
  }
};

function CreateStaff() {
  const [staffList, setStaffList] = useState([]);
  const [staffTypeFilter, setStaffTypeFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [employeeSearchInput, setEmployeeSearchInput] = useState("");
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [selectedStaffDetails, setSelectedStaffDetails] = useState(null);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [uploadingAadhar, setUploadingAadhar] = useState(false);
  const [uploadingPcc, setUploadingPcc] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [credentialStaff, setCredentialStaff] = useState(null);
  const [loginId, setLoginId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [viewCredentials, setViewCredentials] = useState(null);
  const [showViewPassword, setShowViewPassword] = useState(false);

  const [formData, setFormData] = useState(createEmptyFormData());

  const API = (process.env.REACT_APP_API_URL);

  // Fetch Staff List
  const fetchStaffList = async (includeInactive = false) => {
    try {
      const url = includeInactive
        ? `${API}/staff?includeInactive=true`
        : `${API}/staff`;
      const response = await fetch(url);
      const data = await response.json();
      setStaffList(data);
    } catch (error) {
      console.error("Error fetching staff list:", error);
    }
  };

  useEffect(() => {
    fetchStaffList(showInactive);
  }, [showInactive]);

  const fetchCompanyOptions = async (staffType) => {
    try {
      const response = await fetch(`${API}/staff/companies?type=${staffType}`);
      if (!response.ok) return;
      const data = await response.json();
      setCompanyOptions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  useEffect(() => {
    if (staffModalOpen && formData.staffCategory === "company_staff") {
      fetchCompanyOptions(formData.staffType);
    }
  }, [staffModalOpen, formData.staffType, formData.staffCategory]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "contactNo" || name === "whatsappNumber" || name === "aadharNo") {
      const numericValue = value.replace(/\D/g, "");
      setFormData((prev) => {
        const updated = { ...prev, [name]: numericValue };
        if (name === "contactNo" && updated.whatsappSameAsContact) {
          updated.whatsappNumber = numericValue;
        }
        if (name === "aadharNo" && !numericValue) {
          updated.aadharDocumentUrl = "";
        }
        return updated;
      });
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleWhatsappSameAsContact = (checked) => {
    setFormData((prev) => ({
      ...prev,
      whatsappSameAsContact: checked,
      whatsappNumber: checked ? prev.contactNo || "" : prev.whatsappNumber,
    }));
  };

  const handleDocumentUpload = async (event, field, documentType, setUploading) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadStaffDocument(file, documentType);
      setFormData((prev) => ({
        ...prev,
        [field]: result.url,
      }));
    } catch (error) {
      alert(error.message || "Failed to upload document.");
    } finally {
      setUploading(false);
    }
  };

  const handleStaffCategoryChange = (event) => {
    const staffCategory = event.target.value;
    setFormData((prev) => ({
      ...prev,
      staffCategory,
      selectedCompanies: staffCategory === "company_staff" ? prev.selectedCompanies : [],
    }));
  };

  const handleBawarcheeRoleChange = (event) => {
    const bawarcheeRole = event.target.value;
    setFormData((prev) => ({
      ...prev,
      bawarcheeRole,
      permissions: normalizeStaffPermissions(BAWARCHEE_ROLE_PRESETS[bawarcheeRole] || []),
    }));
  };

  const togglePermission = (key, checked) => {
    setFormData((prev) => {
      const next = checked
        ? [...prev.permissions, key]
        : prev.permissions.filter((permission) => permission !== key);
      return { ...prev, permissions: normalizeStaffPermissions(next) };
    });
  };

  const toggleGroupPermissions = (group, checked) => {
    const keys = group.items.map(([key]) => key);
    setFormData((prev) => {
      const next = checked
        ? [...prev.permissions, ...keys]
        : prev.permissions.filter((permission) => !keys.includes(permission));
      return { ...prev, permissions: normalizeStaffPermissions(next) };
    });
  };

  const handleStaffTypeChange = (e) => {
    const staffType = e.target.value;

    setFormData((prev) => ({
      ...prev,
      staffType,
      selectedCompanies: prev.selectedCompanies.filter(
        (company) => !company.type || company.type === staffType
      ),
      assignments: {
        ...createEmptyAssignments(),
        ...prev.assignments,
      },
    }));
  };

  const filteredStaffList =
    staffList.filter((staff) => {
      const matchesType =
        staffTypeFilter === "all" ||
        (staff.staff_category !== "bawarchee_staff" &&
          (staff.staff_type || "distributor") === staffTypeFilter);
      const searchText = employeeSearchInput.trim().toLowerCase();
      const matchesSearch =
        !searchText ||
        [staff.name, staff.company_name, staff.contact_no, staff.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(searchText));

      return matchesType && matchesSearch;
    });

  const getCompanyNames = () =>
    formData.selectedCompanies.map((company) => company.name).filter(Boolean);

  const getCompanyIds = () =>
    formData.selectedCompanies.map((company) => company.id).filter(Boolean);

  const handleToggleActive = async (staff) => {
    const action = staff.is_active ? "deactivate" : "activate";
    if (!window.confirm(`Are you sure you want to ${action} "${staff.name}"?`)) return;
    try {
      const response = await fetch(`${API}/staff/${staff.id}/toggle-active`, { method: "PUT" });
      const data = await response.json();
      if (response.ok) {
        fetchStaffList(showInactive);
      } else {
        alert(data.error || `Failed to ${action} staff.`);
      }
    } catch (error) {
      console.error("Error toggling staff:", error);
      alert(`Error ${action}ing staff.`);
    }
  };

  const openCredentialsModal = (staff) => {
    setCredentialStaff(staff);
    setLoginId(staff.login_id || "");
    setNewPassword("");
    setCredentialsModalOpen(true);
  };

  const closeCredentialsModal = () => {
    setCredentialsModalOpen(false);
    setCredentialStaff(null);
    setLoginId("");
    setNewPassword("");
  };

  const handleUpdateCredentials = async () => {
    if (!credentialStaff) return;
    if (!loginId.trim() || newPassword.length < 8) {
      alert("Enter a Login ID and a password of at least 8 characters.");
      return;
    }

    setSavingCredentials(true);
    try {
      const response = await fetch(`${API}/staff/${credentialStaff.id}/credentials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: loginId.trim(), password: newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update credentials.");
      alert("Login ID and password updated successfully.");
      closeCredentialsModal();
      fetchStaffList(showInactive);
    } catch (error) {
      alert(error.message || "Unable to update credentials.");
    } finally {
      setSavingCredentials(false);
    }
  };

  // View Staff Location Details
  const handleView = async (staff) => {
    try {
      const response = await fetch(`${API}/staff/${staff.id}`);
      const data = await response.json();
      setSelectedStaffDetails(data);
      setViewCredentials(null);
      setShowViewPassword(false);
      setViewModalOpen(true);
      try {
        const credResponse = await fetch(`${API}/staff/${staff.id}/credentials`);
        const credData = await credResponse.json().catch(() => ({}));
        setViewCredentials(
          credResponse.ok
            ? { loginId: credData.loginId || null, password: credData.password || null }
            : { loginId: data.login_id || null, password: null, error: credData.error }
        );
      } catch (credError) {
        setViewCredentials({ loginId: data.login_id || null, password: null });
      }
    } catch (error) {
      console.error("Error fetching staff details:", error);
      alert("Error loading staff details.");
    }
  };

  const handleCloseView = () => {
    setViewModalOpen(false);
    setSelectedStaffDetails(null);
    setViewCredentials(null);
    setShowViewPassword(false);
  };

  // Edit Staff
  const handleEdit = async (staff) => {
    try {
      const response = await fetch(`${API}/staff/${staff.id}`);
      const data = await response.json();

      const companyIds = Array.isArray(data.companies)
        ? data.companies.map((company) => Number(company.id)).filter(Boolean)
        : [];
      const companyNames = Array.isArray(data.companies)
        ? data.companies.map((company) => company.name).filter(Boolean)
        : String(data.company_name || "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean);

      setFormData({
        name: data.name || "",
        contactNo: data.contact_no || "",
        whatsappNumber: data.whatsapp_number || data.contact_no || "",
        whatsappSameAsContact:
          Boolean(data.contact_no) &&
          String(data.whatsapp_number || data.contact_no) === String(data.contact_no),
        email: data.email || "",
        dob: data.dob ? String(data.dob).slice(0, 10) : "",
        aadharNo: data.aadhar_no || "",
        aadharDocumentUrl: data.aadhar_document_url || "",
        pccCertificateUrl: data.pcc_certificate_url || "",
        selectedCompanies: companyIds.map((id, index) => ({
          id,
          name: companyNames[index] || "",
          type: data.staff_type || "distributor",
        })),
        staffCategory: data.staff_category || "company_staff",
        staffType: data.staff_type || "distributor",
        bawarcheeRole: data.bawarchee_role || "",
        permissions: Array.isArray(data.permissions) ? data.permissions : [],
        assignments: {
          ...createEmptyAssignments(),
          ...(data.assignments || {}),
        },
      });

      setEditingStaffId(staff.id);
      setStaffModalOpen(true);
    } catch (error) {
      console.error("Error fetching staff details:", error);
      alert("Error loading staff details.");
    }
  };

  // Reset Form
  const resetForm = () => {
    setFormData(createEmptyFormData());
    setEditingStaffId(null);
    setUploadingAadhar(false);
    setUploadingPcc(false);
    setSavingStaff(false);
  };

  const openStaffModal = () => {
    resetForm();
    setStaffModalOpen(true);
  };

  const closeStaffModal = () => {
    setStaffModalOpen(false);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert("Please enter staff name.");
      return;
    }

    if (formData.staffCategory === "bawarchee_staff" && !formData.bawarcheeRole) {
      alert("Please choose a staff type: Admin, Manager, Accountant, Operator or HR.");
      return;
    }

    const trimmedEmail = formData.email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      alert("Please enter a valid email address.");
      return;
    }

    if (formData.aadharNo && formData.aadharNo.length !== 12) {
      alert("Aadhar number must be 12 digits.");
      return;
    }

    setSavingStaff(true);

    try {
      const url = editingStaffId ? `${API}/staff/${editingStaffId}` : `${API}/staff`;
      const method = editingStaffId ? "PUT" : "POST";
      const companyNames = formData.staffCategory === "company_staff" ? getCompanyNames() : [];
      const companyIds = formData.staffCategory === "company_staff" ? getCompanyIds() : [];
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          contactNo: formData.contactNo || null,
          whatsappNumber: formData.whatsappSameAsContact
            ? formData.contactNo
            : formData.whatsappNumber || null,
          email: formData.email.trim() || null,
          dob: formData.dob || null,
          aadharNo: formData.aadharNo || null,
          aadharDocumentUrl: formData.aadharNo ? formData.aadharDocumentUrl || null : null,
          pccCertificateUrl: formData.pccCertificateUrl || null,
          staffType: formData.staffCategory === "bawarchee_staff" ? null : formData.staffType,
          staffCategory: formData.staffCategory,
          bawarcheeRole:
            formData.staffCategory === "bawarchee_staff" ? formData.bawarcheeRole : null,
          permissions:
            formData.staffCategory === "bawarchee_staff" ? formData.permissions : null,
          companyNames,
          companyIds,
          companyName: companyNames.join(", "),
        }),
      });

      const responseData = await response.json().catch(() => ({}));
      if (response.ok) {
        if (!editingStaffId && responseData.credentials) {
          setCreatedCredentials({
            name: formData.name.trim(),
            loginId: responseData.credentials.loginId,
            password: responseData.credentials.password,
          });
        } else if (!editingStaffId) {
          alert("Staff created successfully!");
        } else {
          alert("Staff updated successfully!");
        }
        closeStaffModal();
        fetchStaffList(showInactive);
      } else {
        alert(responseData.error || "Operation failed.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Error submitting form.");
    } finally {
      setSavingStaff(false);
    }
  };

  const activeStaff = staffList.filter((staff) => staff.is_active).length;
  const bawarcheeCount = staffList.filter((staff) => staff.staff_category === "bawarchee_staff").length;
  const toggleCompany = (company) => setFormData((prev) => ({
    ...prev,
    selectedCompanies: prev.selectedCompanies.some((c) => c.id === company.id)
      ? prev.selectedCompanies.filter((c) => c.id !== company.id)
      : [...prev.selectedCompanies, company],
  }));
  const detail = (label, value, wide) => (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="block break-all text-[13.5px] font-medium text-slate-800">{value}</span>
    </div>
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Employee List"
          description="Company staff, Bawarchee staff and operators: their details, documents, login and (for Bawarchee staff) page permissions."
          actions={(
            <button type="button" className={btn.primary} onClick={openStaffModal}>
              <Icon name="person_add" className="text-[18px]" />Create Staff
            </button>
          )}
        />

        <div className="mb-5 flex flex-wrap gap-2">
          <StatBox label={showInactive ? "Staff (incl. inactive)" : "Staff"} value={staffList.length} icon="groups" />
          <StatBox label="Active" value={activeStaff} icon="check_circle" />
          <StatBox label="Bawarchee staff" value={bawarcheeCount} icon="badge" />
        </div>

        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
            <div className="relative w-full max-w-xs">
              <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
              <input
                type="search" value={employeeSearchInput} onChange={(e) => setEmployeeSearchInput(e.target.value)}
                placeholder="Search name, company, phone, email" aria-label="Search employee" className={`${fieldClass} pl-8`}
              />
            </div>
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
              {[["all", "All Staff"], ["distributor", "Distributor"], ["cnf", "CNF"]].map(([value, label]) => (
                <button
                  key={value} type="button" onClick={() => setStaffTypeFilter(value)}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${staffTypeFilter === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-600">
              <Toggle checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} label="Show inactive" />
              Show inactive
            </label>
          </div>

          {staffList.length === 0 ? (
            <p className="m-0 py-16 text-center text-[13px] text-slate-400">No employees added yet. Click &quot;Create Staff&quot; to add one.</p>
          ) : filteredStaffList.length === 0 ? (
            <p className="m-0 py-16 text-center text-[13px] text-slate-400">No staff found for this search.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className={th}>Staff</th>
                    <th className={th}>Company</th>
                    <th className={th}>Type</th>
                    <th className={th}>Phone</th>
                    <th className={th}>Email ID</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaffList.map((staff) => (
                    <tr key={staff.id} className={`border-t border-slate-100 hover:bg-slate-50/70 ${staff.is_active ? "" : "opacity-55"}`}>
                      <td className={td}>
                        <span className="flex items-center gap-3">
                          <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${categoryTone(staff.staff_category)}`}>
                            {initialsOf(staff.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-slate-800">{staff.name}</span>
                            <span className="block text-[11.5px] text-slate-500">{CATEGORY_LABELS[staff.staff_category] || "Company Staff"}</span>
                          </span>
                        </span>
                      </td>
                      <td className={`${td} max-w-56`}>
                        {staff.staff_category === "bawarchee_staff"
                          ? "Bawarchee Staff"
                          : staff.staff_category === "operator"
                            ? "Operator"
                            : staff.company_name || "—"}
                      </td>
                      <td className={td}>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700">{getStaffTypeLabel(staff)}</span>
                      </td>
                      <td className={`${td} tabular-nums`}>{staff.contact_no || "—"}</td>
                      <td className={`${td} max-w-52 truncate`} title={staff.email || ""}>{staff.email || "—"}</td>
                      <td className={td}>
                        <label className="flex cursor-pointer items-center gap-2">
                          <Toggle checked={Boolean(staff.is_active)} onChange={() => handleToggleActive(staff)} label={`${staff.name} active`} />
                          <span className={`text-[12px] font-semibold ${staff.is_active ? "text-emerald-700" : "text-red-600"}`}>{staff.is_active ? "Active" : "Inactive"}</span>
                        </label>
                      </td>
                      <td className={`${td} text-right`}>
                        <span className="inline-flex gap-0.5">
                          <button type="button" className={`${btn.icon} hover:text-blue-700`} title="View details" aria-label={`View ${staff.name}`} onClick={() => handleView(staff)}>
                            <Icon name="visibility" className="text-[19px]" />
                          </button>
                          <button type="button" className={`${btn.icon} hover:text-amber-700`} title="Edit" aria-label={`Edit ${staff.name}`} onClick={() => handleEdit(staff)}>
                            <Icon name="edit" className="text-[19px]" />
                          </button>
                          <button type="button" className={`${btn.icon} hover:text-blue-700`} title="Update Login ID and Password" aria-label="Update Login ID and Password" onClick={() => openCredentialsModal(staff)}>
                            <Icon name="key" className="text-[19px]" />
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
      </div>

      <Footer />

      {/* New staff: login shown once */}
      <Modal
        open={Boolean(createdCredentials)} onClose={() => setCreatedCredentials(null)} title="Staff Created Successfully"
        actions={(
          <>
            <button type="button" className={btn.outline} onClick={() => copyToClipboard(`Login ID: ${createdCredentials?.loginId}\nPassword: ${createdCredentials?.password}`)}>
              <Icon name="content_copy" className="text-[17px]" />Copy Both
            </button>
            <button type="button" className={btn.primary} onClick={() => setCreatedCredentials(null)}>Done</button>
          </>
        )}
      >
        <p className="m-0 mb-3 text-[13px] text-slate-600">Login credentials for <b>{createdCredentials?.name || "staff"}</b></p>
        {[["Login ID", createdCredentials?.loginId], ["Password", createdCredentials?.password]].map(([label, value]) => (
          <div key={label} className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
              <span className="block font-mono text-[14px] font-bold text-slate-900">{value || "—"}</span>
            </span>
            <button type="button" className={btn.ghost} onClick={() => copyToClipboard(value)}><Icon name="content_copy" className="text-[17px]" />Copy</button>
          </div>
        ))}
        <p className="m-0 mt-2 text-[12px] text-slate-500">You can view these anytime from the staff details (eye icon).</p>
      </Modal>

      <Modal
        open={credentialsModalOpen} onClose={closeCredentialsModal} locked={savingCredentials} title="Update Login ID & Password"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeCredentialsModal} disabled={savingCredentials}>Cancel</button>
            <button type="button" className={btn.primary} onClick={handleUpdateCredentials} disabled={savingCredentials}>{savingCredentials ? "Updating..." : "Update Credentials"}</button>
          </>
        )}
      >
        <p className="m-0 mb-4 text-[13px] font-semibold text-slate-800">{credentialStaff?.name || "Staff"}</p>
        <div className="space-y-3">
          <Field label="Login ID" width="w-full">
            <input className={fieldClass} value={loginId} onChange={(e) => setLoginId(e.target.value)} maxLength={50} autoComplete="username" />
          </Field>
          <Field label="New password" width="w-full" hint="Minimum 8 characters">
            <input type="password" className={fieldClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} autoComplete="new-password" />
          </Field>
        </div>
      </Modal>

      {/* Create / edit staff */}
      <Modal
        open={staffModalOpen} onClose={closeStaffModal} locked={savingStaff} size="xl" title={editingStaffId ? "Edit Staff" : "Create New Staff"}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeStaffModal} disabled={savingStaff}>Cancel</button>
            <button type="button" className={btn.primary} onClick={handleSubmit} disabled={savingStaff || uploadingAadhar || uploadingPcc}>
              <Icon name="save" className="text-[18px]" />{savingStaff ? "Saving..." : editingStaffId ? "Update Staff" : "Save Staff"}
            </button>
          </>
        )}
      >
        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          <section>
            <SectionTitle>Basic information</SectionTitle>
            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Staff category">
              {[["company_staff", "Company Staff", "business"], ["bawarchee_staff", "Bawarchee Staff", "badge"], ["operator", "Operator", "support_agent"]].map(([value, label, icon]) => (
                <button
                  key={value} type="button" role="radio" aria-checked={formData.staffCategory === value}
                  onClick={() => handleStaffCategoryChange({ target: { value } })}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${formData.staffCategory === value ? "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  <Icon name={icon} className="text-[19px]" />{label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {formData.staffCategory !== "bawarchee_staff" ? (
                <Field label="Staff type" width="w-full">
                  <select className={fieldClass} value={formData.staffType} onChange={handleStaffTypeChange}>
                    <option value="distributor">Distributor</option>
                    <option value="cnf">CNF</option>
                  </select>
                </Field>
              ) : (
                <Field label="Staff type" width="w-full" hint="Fills in this type's default pages below.">
                  <select className={fieldClass} value={formData.bawarcheeRole} onChange={handleBawarcheeRoleChange}>
                    <option value="" disabled>Choose staff type</option>
                    {BAWARCHEE_ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
              )}
              {formData.staffCategory === "company_staff" && (
                <div className="md:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Choose company</span>
                  <div className="mt-1 max-h-32 overflow-y-auto rounded-lg border border-slate-300 p-1">
                    {companyOptions.map((company) => {
                      const on = formData.selectedCompanies.some((c) => c.id === company.id);
                      return (
                        <label key={company.id} className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] ${on ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}>
                          <input type="checkbox" className="size-4 accent-blue-600" checked={on} onChange={() => toggleCompany(company)} />
                          {company.name}
                        </label>
                      );
                    })}
                    {companyOptions.length === 0 && <p className="m-0 px-2.5 py-2 text-[13px] text-slate-400">No companies found. Add companies first.</p>}
                  </div>
                  {formData.selectedCompanies.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {formData.selectedCompanies.map((company) => (
                        <span key={company.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-blue-800">
                          {company.name}
                          <button type="button" aria-label={`Remove ${company.name}`} onClick={() => toggleCompany(company)} className="rounded-full p-0.5 text-blue-500 hover:bg-blue-100"><Icon name="close" className="text-[14px]" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Field label="Staff name" width="w-full">
                <input className={fieldClass} name="name" value={formData.name} onChange={handleInputChange} />
              </Field>
              <Field label="Date of birth" width="w-full">
                <input type="date" className={fieldClass} name="dob" value={formData.dob} onChange={handleInputChange} />
              </Field>
              <Field label="Contact no" width="w-full">
                <input className={fieldClass} inputMode="numeric" name="contactNo" value={formData.contactNo} onChange={handleInputChange} />
              </Field>
              <Field label="WhatsApp number" width="w-full">
                <input className={fieldClass} inputMode="numeric" name="whatsappNumber" value={formData.whatsappNumber} disabled={formData.whatsappSameAsContact} onChange={handleInputChange} />
              </Field>
              <Field label="Email ID" width="w-full">
                <input type="email" className={fieldClass} name="email" value={formData.email} onChange={handleInputChange} maxLength={255} autoComplete="email" />
              </Field>
              <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-[13px] text-slate-600">
                <input type="checkbox" className="size-4 accent-blue-600" checked={Boolean(formData.whatsappSameAsContact)} onChange={(e) => handleWhatsappSameAsContact(e.target.checked)} />
                WhatsApp number same as contact number
              </label>
            </div>
          </section>

          {formData.staffCategory === "bawarchee_staff" && (
            <section className="border-t border-slate-100 pt-5">
              <SectionTitle aside={formData.bawarcheeRole
                ? `${formData.permissions.filter((key) => key !== "dms").length} pages selected`
                : "Choose a staff type to fill in its default permissions"}
              >
                Permissions
              </SectionTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {STAFF_PERMISSION_GROUPS.map((group) => {
                  const keys = group.items.map(([key]) => key);
                  const selectedCount = keys.filter((key) => formData.permissions.includes(key)).length;
                  return (
                    <div key={group.key} className={`rounded-xl border p-3 ${selectedCount ? "border-blue-200 bg-blue-50/30" : "border-slate-200"}`}>
                      <label className="mb-1.5 flex cursor-pointer items-center gap-2">
                        <TriCheck
                          checked={selectedCount === keys.length} indeterminate={selectedCount > 0 && selectedCount < keys.length}
                          onChange={(e) => toggleGroupPermissions(group, e.target.checked)} label={`All ${group.label}`}
                        />
                        <span className="grow text-[13px] font-semibold text-slate-800">{group.label}</span>
                        <span className="text-[11.5px] tabular-nums text-slate-500">{selectedCount}/{keys.length}</span>
                      </label>
                      <div className="space-y-0.5 pl-6">
                        {group.items.map(([key, label]) => {
                          const locked = ["overdue_7_days", "overdue_own_permission", "other_day_own_permission"].includes(key) && !formData.permissions.includes("add_sales");
                          return (
                            <label key={key} className={`flex items-center gap-2 rounded px-1 py-0.5 text-[12.5px] ${locked ? "cursor-not-allowed text-slate-300" : "cursor-pointer text-slate-600 hover:text-slate-900"}`}>
                              <input
                                type="checkbox" className="size-3.5 accent-blue-600" checked={formData.permissions.includes(key)} disabled={locked}
                                onChange={(e) => togglePermission(key, e.target.checked)}
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="border-t border-slate-100 pt-5">
            <SectionTitle>Documents</SectionTitle>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <Field label="Aadhar number" width="w-full" hint="12 digit Aadhar number">
                  <input className={fieldClass} inputMode="numeric" name="aadharNo" value={formData.aadharNo} onChange={handleInputChange} maxLength={12} />
                </Field>
                {formData.aadharNo ? (
                  <>
                    <UploadButton
                      label="Upload Aadhar" busyLabel="Uploading Aadhar..." busy={uploadingAadhar}
                      onChange={(e) => handleDocumentUpload(e, "aadharDocumentUrl", "aadhar", setUploadingAadhar)}
                      done={formData.aadharDocumentUrl ? "Aadhar uploaded" : ""}
                    />
                    <DocumentPreview title="Aadhar" url={formData.aadharDocumentUrl} />
                  </>
                ) : (
                  <p className="m-0 text-[12px] text-slate-400">Enter the Aadhar number to upload its document.</p>
                )}
              </div>
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">PCC certificate</span>
                <UploadButton
                  label="Upload PCC Certificate" busyLabel="Uploading PCC..." busy={uploadingPcc}
                  onChange={(e) => handleDocumentUpload(e, "pccCertificateUrl", "pcc", setUploadingPcc)}
                  done={formData.pccCertificateUrl ? "PCC certificate uploaded" : ""}
                />
                <DocumentPreview title="PCC Certificate" url={formData.pccCertificateUrl} />
              </div>
            </div>
          </section>
        </form>
      </Modal>

      {/* Employee details */}
      <Modal
        open={viewModalOpen} onClose={handleCloseView} size="lg" title="Employee Details"
        actions={<button type="button" className={btn.ghost} onClick={handleCloseView}>Close</button>}
      >
        {selectedStaffDetails ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className={`flex size-12 items-center justify-center rounded-full text-[15px] font-bold text-white ${categoryTone(selectedStaffDetails.staff_category)}`}>
                {initialsOf(selectedStaffDetails.name)}
              </span>
              <span className="min-w-0 grow">
                <span className="block text-[16px] font-bold text-slate-900">{selectedStaffDetails.name}</span>
                <span className="block text-[12.5px] text-slate-500">{CATEGORY_LABELS[selectedStaffDetails.staff_category] || "Company Staff"} · {getStaffTypeLabel(selectedStaffDetails)}</span>
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${selectedStaffDetails.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {selectedStaffDetails.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              {detail("Company", ["bawarchee_staff", "operator"].includes(selectedStaffDetails.staff_category) ? "—" : selectedStaffDetails.company_name || "—")}
              {detail("Date of birth", formatDateLabel(selectedStaffDetails.dob))}
              {detail("Contact no", selectedStaffDetails.contact_no || "—")}
              {detail("WhatsApp no", selectedStaffDetails.whatsapp_number || selectedStaffDetails.contact_no || "—")}
              {detail("Email ID", selectedStaffDetails.email || "—")}
              {detail("Aadhar number", selectedStaffDetails.aadhar_no || "—")}
            </div>

            <div>
              <SectionTitle>Login credentials</SectionTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Login ID</span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[13.5px] font-semibold text-slate-900">
                      {viewCredentials ? viewCredentials.loginId || selectedStaffDetails.login_id || "—" : "Loading..."}
                    </span>
                    {viewCredentials?.loginId && (
                      <button type="button" className={btn.icon} title="Copy Login ID" aria-label="Copy Login ID" onClick={() => copyToClipboard(viewCredentials.loginId)}>
                        <Icon name="content_copy" className="text-[16px]" />
                      </button>
                    )}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-200 px-3 py-2.5">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Password</span>
                  {!viewCredentials ? (
                    <span className="text-[13px] text-slate-500">Loading...</span>
                  ) : viewCredentials.password ? (
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[13.5px] font-semibold text-slate-900">{showViewPassword ? viewCredentials.password : "••••••••"}</span>
                      <button type="button" className={btn.icon} title={showViewPassword ? "Hide password" : "Show password"} aria-label={showViewPassword ? "Hide password" : "Show password"} onClick={() => setShowViewPassword((prev) => !prev)}>
                        <Icon name={showViewPassword ? "visibility_off" : "visibility"} className="text-[16px]" />
                      </button>
                      <button type="button" className={btn.icon} title="Copy password" aria-label="Copy password" onClick={() => copyToClipboard(viewCredentials.password)}>
                        <Icon name="content_copy" className="text-[16px]" />
                      </button>
                    </span>
                  ) : (
                    <span className="text-[12px] text-slate-500">{viewCredentials.error || "Not available. Set a new password from Update Credentials to view it here."}</span>
                  )}
                </div>
              </div>
            </div>

            {selectedStaffDetails.staff_category === "bawarchee_staff" && (
              <div>
                <SectionTitle>Permissions</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {STAFF_PERMISSION_GROUPS.flatMap((group) => group.items)
                    .filter(([key]) => (selectedStaffDetails.permissions || []).includes(key))
                    .map(([key, label]) => <span key={key} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[12px] font-medium text-blue-800">{label}</span>)}
                  {!(selectedStaffDetails.permissions || []).some((key) => key !== "dms") && <p className="m-0 text-[13px] text-slate-400">No permissions given yet.</p>}
                </div>
              </div>
            )}

            <div>
              <SectionTitle>Documents</SectionTitle>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {selectedStaffDetails.aadhar_no ? (
                  <div>
                    <span className="mb-1 block text-[12px] text-slate-500">Aadhar document</span>
                    <DocumentPreview title="Aadhar" url={selectedStaffDetails.aadhar_document_url} />
                  </div>
                ) : null}
                <div>
                  <span className="mb-1 block text-[12px] text-slate-500">PCC certificate</span>
                  <DocumentPreview title="PCC Certificate" url={selectedStaffDetails.pcc_certificate_url} />
                </div>
              </div>
            </div>

            <div>
              <SectionTitle>Assigned locations</SectionTitle>
              <div className="space-y-1.5">
                {Object.keys(selectedStaffDetails.assignments || {}).map((day) => {
                  const dayLocs = selectedStaffDetails.assignments[day];
                  if (!dayLocs || !dayLocs.length) return null;
                  return (
                    <div key={day} className="flex gap-3 text-[13px]">
                      <span className="w-24 shrink-0 font-semibold text-slate-800">{day}</span>
                      <span className="flex flex-wrap gap-1">
                        {dayLocs.map((l) => <span key={`${day}-${l.locationName}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px] text-slate-700">{l.locationName}</span>)}
                      </span>
                    </div>
                  );
                })}
                {Object.values(selectedStaffDetails.assignments || {}).every((locs) => !locs || locs.length === 0) && (
                  <p className="m-0 text-[13px] text-slate-400">No locations assigned to this staff yet.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="m-0 text-[13px] text-slate-500">Loading details...</p>
        )}
      </Modal>
    </DashboardLayout>
  );
}

export default CreateStaff;
