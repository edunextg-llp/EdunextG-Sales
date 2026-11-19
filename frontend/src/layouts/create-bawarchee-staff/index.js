// Bawarchee Staff (Delivery Boy / Packaging Staff logins): Tailwind CSS (no MUI).
// The data loading, create / edit, credentials, active switch and delete logic is unchanged.
import { useState, useEffect } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { COMPANY_TYPES } from "utils/companyTypes";
import {
  Card, Field, Icon, Modal, PageHeader, Spinner, StatBox, Toggle, btn, fieldClass, initialsOf, td, th,
} from "components/tw";

function CreateBawarcheeStaff() {
  const [name, setName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [aadharNo, setAadharNo] = useState("");
  const [companyIds, setCompanyIds] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyType, setCompanyType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [role, setRole] = useState("delivery_boy");
  const [showInactive, setShowInactive] = useState(false);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [credentialStaff, setCredentialStaff] = useState(null);
  const [loginId, setLoginId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);

  const API = (process.env.REACT_APP_API_URL);

  const fetchCompanyOptions = async () => {
    try {
      const response = await fetch(`${API}/staff/companies`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCompanyOptions(data);
      }
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  const fetchDeliveryBoys = async () => {
    try {
      const response = await fetch(`${API}/delivery-boy?includeInactive=${showInactive}`);
      if (response.ok) {
        const data = await response.json();
        setDeliveryBoys(data);
      }
    } catch (error) {
      console.error("Error fetching delivery boys:", error);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchCompanyOptions();
  }, []);

  useEffect(() => {
    fetchDeliveryBoys();
  }, [showInactive]);

  const resetForm = () => {
    setCompanyIds([]);
    setName("");
    setContactNo("");
    setAadharNo("");
    setEditingId(null);
    setRole("delivery_boy");
  };

  const parseCompanyIds = (boy) =>
    String(boy.company_ids || boy.company_id || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

  const openDeliveryModal = () => {
    resetForm();
    setDeliveryModalOpen(true);
  };

  const closeDeliveryModal = () => {
    setDeliveryModalOpen(false);
    resetForm();
  };

  const startEditDeliveryBoy = (boy) => {
    setEditingId(boy.id);
    setName(boy.name || "");
    setContactNo(boy.contact_no || "");
    setAadharNo(boy.aadhar_no || "");
    setCompanyIds(parseCompanyIds(boy));
    setRole(boy.role || "delivery_boy");
    setDeliveryModalOpen(true);
  };

  const handleSubmit = async () => {
    if (companyIds.length === 0 || !name.trim() || !contactNo.trim()) {
      alert("Please choose Company Name and enter both Name and Contact Number.");
      return;
    }

    if (aadharNo && aadharNo.length !== 12) {
      alert("Aadhar number must be 12 digits.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        editingId ? `${API}/delivery-boy/${editingId}` : `${API}/delivery-boy`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            contactNo,
            companyIds,
            role,
            aadharNo: aadharNo || null,
          }),
        }
      );

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        if (editingId) {
          alert("Staff updated successfully!");
        } else {
          alert(
            `Staff created successfully!\n\nLogin ID: ${data.deliveryLoginId}\nPassword: ${data.passcode}\n\nSave this password now. It is generated only once.`
          );
        }
        closeDeliveryModal();
        await fetchDeliveryBoys();
      } else {
        alert(data.error || `Failed to ${editingId ? "update" : "create"} staff.`);
      }
    } catch (error) {
      console.error(`Error ${editingId ? "updating" : "creating"} Delivery Boy:`, error);
      alert("Error submitting form.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (boy) => {
    try {
      const response = await fetch(`${API}/delivery-boy/${boy.id}/toggle-active`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (response.ok) {
        await fetchDeliveryBoys();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update status.");
      }
    } catch (error) {
      console.error("Error toggling active status:", error);
    }
  };

  const handleGeneratePreviousCredentials = async (boy) => {
    if (!window.confirm(`Generate ID and password one time for "${boy.name}"?`)) return;
    try {
      const response = await fetch(`${API}/delivery-boy/${boy.id}/credentials`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to generate credentials.");
      alert(
        `Credentials generated successfully!\n\nLogin ID: ${data.deliveryLoginId}\nPassword: ${data.passcode}\n\nThese credentials are stored and cannot be regenerated again.`
      );
      await fetchDeliveryBoys();
    } catch (error) {
      alert(error.message || "Unable to generate credentials.");
    }
  };

  const openCredentialsModal = (boy) => {
    setCredentialStaff(boy);
    setLoginId(boy.delivery_login_id || "");
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
      const response = await fetch(`${API}/delivery-boy/${credentialStaff.id}/credentials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: loginId.trim(), password: newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update credentials.");
      alert("Login ID and password updated successfully.");
      closeCredentialsModal();
      fetchDeliveryBoys();
    } catch (error) {
      alert(error.message || "Unable to update credentials.");
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleDeleteDeliveryBoy = async (boy) => {
    if (!window.confirm(`Delete delivery boy "${boy.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API}/delivery-boy/${boy.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        alert("Delivery Boy deleted successfully!");
        if (editingId === boy.id) {
          closeDeliveryModal();
        }
        await fetchDeliveryBoys();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to delete Delivery Boy.");
      }
    } catch (error) {
      console.error("Error deleting Delivery Boy:", error);
      alert("Error deleting Delivery Boy.");
    }
  };

  const roleName = (value) => (value === "packaging_staff" ? "Packaging Staff" : "Delivery Boy");
  const activeCount = deliveryBoys.filter((boy) => boy.is_active === 1).length;
  const packagingCount = deliveryBoys.filter((boy) => boy.role === "packaging_staff").length;
  const visibleCompanies = companyOptions.filter((company) => !companyType || company.type === companyType || companyIds.includes(company.id));
  const toggleCompany = (id) => setCompanyIds((list) => (list.includes(id) ? list.filter((value) => value !== id) : [...list, id]));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Bawarchee Staff"
          description="Delivery Boy and Packaging Staff logins: create them, set their companies, manage their Login ID and password."
          actions={(
            <>
              <label className="mr-1 flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-600">
                <Toggle checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} label="Show inactive" />
                Show inactive
              </label>
              <button type="button" className={btn.primary} onClick={openDeliveryModal}>
                <Icon name="person_add" className="text-[18px]" />Create Bawarchee Staff
              </button>
            </>
          )}
        />

        {!loadingList && (
          <div className="mb-5 flex flex-wrap gap-2">
            <StatBox label={showInactive ? "Staff (incl. inactive)" : "Staff"} value={deliveryBoys.length} icon="groups" />
            <StatBox label="Active" value={activeCount} icon="check_circle" />
            <StatBox label="Packaging" value={packagingCount} icon="inventory" />
            <StatBox label="Delivery" value={deliveryBoys.length - packagingCount} icon="local_shipping" />
          </div>
        )}

        <Card>
          {loadingList ? (
            <div className="flex justify-center py-16"><Spinner className="size-7" /></div>
          ) : deliveryBoys.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Icon name="badge" className="text-[34px] text-slate-300" />
              <p className="m-0 text-[13px] text-slate-500">No staff added yet. Click &quot;Create Bawarchee Staff&quot; to add one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className={th}>Staff</th>
                    <th className={th}>Company</th>
                    <th className={th}>Contact number</th>
                    <th className={th}>Login ID</th>
                    <th className={th}>Passcode</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryBoys.map((boy) => {
                    const inactive = boy.is_active === 0;
                    return (
                      <tr key={boy.id} className={`border-t border-slate-100 hover:bg-slate-50/70 ${inactive ? "opacity-55" : ""}`}>
                        <td className={td}>
                          <span className="flex items-center gap-3">
                            <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${boy.role === "packaging_staff" ? "bg-violet-600" : "bg-cyan-600"}`}>
                              {initialsOf(boy.name)}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold text-slate-800">{boy.name}</span>
                              <span className="block text-[11.5px] text-slate-500">{roleName(boy.role)}</span>
                            </span>
                          </span>
                        </td>
                        <td className={`${td} max-w-56`}>{boy.company_name || "—"}</td>
                        <td className={`${td} tabular-nums`}>{boy.contact_no}</td>
                        <td className={td}>
                          {boy.delivery_login_id
                            ? <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[12px] font-semibold text-slate-800">{boy.delivery_login_id}</span>
                            : <span className="text-slate-400">N/A</span>}
                        </td>
                        <td className={td}>
                          {boy.delivery_passcode
                            ? <span className="font-mono text-[12px] font-semibold text-slate-800">{boy.delivery_passcode}</span>
                            : <span className="text-slate-400">N/A</span>}
                        </td>
                        <td className={td}>
                          <label className="flex cursor-pointer items-center gap-2">
                            <Toggle checked={boy.is_active === 1} onChange={() => handleToggleActive(boy)} label={`${boy.name} active`} />
                            <span className={`text-[12px] font-semibold ${inactive ? "text-slate-400" : "text-emerald-700"}`}>{inactive ? "Inactive" : "Active"}</span>
                          </label>
                        </td>
                        <td className={`${td} text-right`}>
                          <span className="inline-flex items-center gap-0.5">
                            {!boy.delivery_passcode && (
                              <button type="button" className={`${btn.icon} hover:text-blue-700`} title="Generate ID and password one time" aria-label="Generate ID and password one time" onClick={() => handleGeneratePreviousCredentials(boy)}>
                                <Icon name="key" className="text-[19px]" />
                              </button>
                            )}
                            <button type="button" className={`${btn.icon} hover:text-blue-700`} title="Update Login ID and Password" aria-label="Update Login ID and Password" onClick={() => openCredentialsModal(boy)}>
                              <Icon name="manage_accounts" className="text-[19px]" />
                            </button>
                            <button type="button" className={`${btn.icon} hover:text-amber-700`} title="Edit" aria-label={`Edit ${boy.name}`} onClick={() => startEditDeliveryBoy(boy)}>
                              <Icon name="edit" className="text-[19px]" />
                            </button>
                            <button type="button" className={`${btn.icon} hover:bg-red-50 hover:text-red-600`} title="Delete" aria-label={`Delete ${boy.name}`} onClick={() => handleDeleteDeliveryBoy(boy)}>
                              <Icon name="delete_outline" className="text-[19px]" />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={credentialsModalOpen} onClose={closeCredentialsModal} locked={savingCredentials} title="Update Login ID & Password"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeCredentialsModal} disabled={savingCredentials}>Cancel</button>
            <button type="button" className={btn.primary} onClick={handleUpdateCredentials} disabled={savingCredentials}>
              {savingCredentials ? "Updating..." : "Update Credentials"}
            </button>
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

      <Modal
        open={deliveryModalOpen} onClose={closeDeliveryModal} locked={submitting} title={editingId ? "Edit Bawarchee Staff" : "Create Bawarchee Staff"}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeDeliveryModal} disabled={submitting}>Cancel</button>
            <button type="button" className={btn.primary} onClick={handleSubmit} disabled={submitting}>
              {submitting ? (editingId ? "Updating..." : "Creating...") : (editingId ? "Update Bawarchee Staff" : "Create Bawarchee Staff")}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Role</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Role">
              {[["delivery_boy", "Delivery Boy", "local_shipping"], ["packaging_staff", "Packaging Staff", "inventory"]].map(([value, label, icon]) => (
                <button
                  key={value} type="button" role="radio" aria-checked={role === value} onClick={() => setRole(value)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${role === value ? "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  <Icon name={icon} className="text-[19px]" />{label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Company type" width="w-full">
            <select className={fieldClass} value={companyType} onChange={(e) => setCompanyType(e.target.value)}>
              <option value="">All types</option>
              {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </Field>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Company name</span>
            <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-slate-300 p-1">
              {visibleCompanies.map((company) => {
                const on = companyIds.includes(company.id);
                return (
                  <label key={company.id} className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] ${on ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}>
                    <input type="checkbox" className="size-4 accent-blue-600" checked={on} onChange={() => toggleCompany(company.id)} />
                    {company.name}
                  </label>
                );
              })}
              {companyOptions.length === 0 && <p className="m-0 px-2.5 py-2 text-[13px] text-slate-400">No staff company assigned</p>}
            </div>
            <p className="m-0 mt-1 text-[11.5px] text-slate-500">
              {companyIds.length ? `${companyIds.length} selected: ${companyIds.map((id) => companyOptions.find((c) => c.id === id)?.name).filter(Boolean).join(", ")}` : "Choose one or more companies."}
            </p>
          </div>
          <Field label="Name" width="w-full">
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Contact number" width="w-full">
              <input className={fieldClass} inputMode="numeric" value={contactNo} onChange={(e) => setContactNo(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Aadhar number (optional)" width="w-full" hint="12 digits — no document needed">
              <input className={fieldClass} inputMode="numeric" value={aadharNo} maxLength={12} onChange={(e) => setAadharNo(e.target.value.replace(/\D/g, "").slice(0, 12))} />
            </Field>
          </div>
        </div>
      </Modal>

      <Footer />
    </DashboardLayout>
  );
}

export default CreateBawarcheeStaff;
