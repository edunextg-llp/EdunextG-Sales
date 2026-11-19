// Add Company: Tailwind CSS (no MUI). Add / edit / delete / filter logic unchanged.
import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { Card, Field, Icon, Modal, Notice, PageHeader, Spinner, StatBox, btn, fieldClass, td, th } from "components/tw";

const API = (process.env.REACT_APP_API_URL);

const MAX_WORDS = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Chip input: type an email and press Enter / comma / Tab (or click away) to add it.
function EmailChipsInput({ value, onChange, onError }) {
  const [inputValue, setInputValue] = useState("");

  const commit = (rawItems) => {
    const next = [...value];
    const invalid = [];
    rawItems
      .flatMap((item) => String(item || "").split(/[,;\s]+/))
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .forEach((email) => {
        if (!EMAIL_PATTERN.test(email)) invalid.push(email);
        else if (!next.includes(email)) next.push(email);
      });
    onError(invalid.length ? `Invalid email: ${invalid.join(", ")}` : "");
    onChange(next);
    setInputValue(invalid.join(", "));
  };

  const remove = (email) => {
    onError("");
    onChange(value.filter((item) => item !== email));
  };

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email IDs (optional)</span>
      <span className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
        {value.map((email) => (
          <span key={email} className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-blue-800">
            {email}
            <button type="button" onClick={() => remove(email)} aria-label={`Remove ${email}`} className="rounded-full p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-800">
              <Icon name="close" className="text-[14px]" />
            </button>
          </span>
        ))}
        <input
          type="email" className="min-w-40 grow border-0 bg-transparent p-0.5 text-[13px] text-slate-800 outline-none placeholder:text-slate-400"
          placeholder={value.length ? "Add another email" : "Type email and press Enter"}
          value={inputValue}
          onChange={(event) => {
            const next = event.target.value;
            if (/[,;\s]$/.test(next)) { commit([next]); return; }
            setInputValue(next);
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === "Tab") && inputValue.trim()) {
              if (event.key === "Enter") event.preventDefault();
              commit([inputValue]);
            } else if (event.key === "Backspace" && !inputValue && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => { if (inputValue.trim()) commit([inputValue]); }}
        />
      </span>
      <span className="text-[11.5px] text-slate-500">Add as many email IDs as needed — press Enter or comma after each.</span>
    </label>
  );
}
EmailChipsInput.propTypes = { value: PropTypes.arrayOf(PropTypes.string).isRequired, onChange: PropTypes.func.isRequired, onError: PropTypes.func.isRequired };

function EmailList({ emails }) {
  if (!emails || emails.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {emails.map((email) => (
        <a key={email} href={`mailto:${email}`} className="break-all text-[12.5px] text-slate-600 hover:text-blue-700 hover:underline">{email}</a>
      ))}
    </span>
  );
}
EmailList.propTypes = { emails: PropTypes.arrayOf(PropTypes.string) };
EmailList.defaultProps = { emails: [] };

// "Create sale bills?" Yes / No, used in the add form and the edit dialog.
function SaleBillSelect({ value, onChange, hint }) {
  return (
    <Field label="Create sale bills? *" width="w-full" hint={hint}>
      <select className={fieldClass} value={value ? "yes" : "no"} onChange={(e) => onChange(e.target.value === "yes")}>
        <option value="yes">Yes, make sale bills</option>
        <option value="no">No sale bills</option>
      </select>
    </Field>
  );
}
SaleBillSelect.propTypes = { value: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired, hint: PropTypes.node };
SaleBillSelect.defaultProps = { hint: null };

const createsSaleBill = (company) => Number(company?.creates_sale_bill ?? 1) !== 0;

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function AddCompany() {
  const [form, setForm] = useState({ type: "", name: "", about: "", emails: [], createsSaleBill: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [companies, setCompanies] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ type: "", name: "", about: "", code: "", emails: [], dailyRequisitionTarget: "", createsSaleBill: true });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const wordCount = countWords(form.about);
  const wordsLeft = MAX_WORDS - wordCount;
  const editWordCount = countWords(editForm.about);
  const editWordsLeft = MAX_WORDS - editWordCount;

  const fetchCompanies = useCallback(async () => {
    setLoadingList(true);
    try {
      const url = filterType
        ? `${API}/staff/companies?type=${filterType}`
        : `${API}/staff/companies`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      setCompanies([]);
    } finally {
      setLoadingList(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleChange = (field, value) => {
    setError("");
    setSuccess("");
    if (field === "about") {
      const words = value.trim() ? value.trim().split(/\s+/) : [];
      if (words.length > MAX_WORDS) return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditChange = (field, value) => {
    setEditError("");
    if (field === "about") {
      const words = value.trim() ? value.trim().split(/\s+/) : [];
      if (words.length > MAX_WORDS) return;
    }
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const openEditModal = (company) => {
    setEditingId(company.id);
    setEditForm({
      type: company.type || "",
      name: company.name || "",
      about: company.about || "",
      code: company.code || "",
      emails: Array.isArray(company.emails) ? company.emails : [],
      dailyRequisitionTarget: company.daily_requisition_target != null && Number(company.daily_requisition_target) > 0
        ? String(Number(company.daily_requisition_target))
        : "",
      createsSaleBill: createsSaleBill(company),
    });
    setEditError("");
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingId(null);
    setEditForm({ type: "", name: "", about: "", code: "", emails: [], dailyRequisitionTarget: "", createsSaleBill: true });
    setEditError("");
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    if (!form.type) return setError("Please select a company type.");
    if (!form.name.trim()) return setError("Company name is required.");

    setSaving(true);
    try {
      const res = await fetch(`${API}/staff/companies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          type: form.type,
          name: form.name.trim(),
          about: form.about.trim(),
          emails: form.emails,
          createsSaleBill: form.createsSaleBill,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add company.");
      } else {
        const codeLabel = data.code ? ` (Code: ${data.code})` : "";
        setSuccess(`Company "${form.name.trim()}" added successfully${codeLabel}.`);
        setForm({ type: "", name: "", about: "", emails: [], createsSaleBill: true });
        fetchCompanies();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setEditError("");
    if (!editForm.type) return setEditError("Please select a company type.");
    if (!editForm.name.trim()) return setEditError("Company name is required.");

    setSavingEdit(true);
    try {
      const res = await fetch(`${API}/staff/companies/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          type: editForm.type,
          name: editForm.name.trim(),
          about: editForm.about.trim(),
          emails: editForm.emails,
          dailyRequisitionTarget: String(editForm.dailyRequisitionTarget || "").trim(),
          createsSaleBill: editForm.createsSaleBill,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Failed to update company.");
      } else {
        closeEditModal();
        fetchCompanies();
        setSuccess(`Company "${data.name}" updated successfully.`);
      }
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete company "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API}/staff/companies/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (res.ok) {
        setCompanies((prev) => prev.filter((c) => c.id !== id));
        if (editingId === id) closeEditModal();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete company.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const typeChip = (type) => {
    if (type === "cnf") return <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11.5px] font-semibold text-blue-700">CNF</span>;
    if (type === "distributor") return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">Distributor</span>;
    return <span className="text-slate-300">—</span>;
  };
  const aboutField = (value, onChangeText, count, left) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">About (optional, max {MAX_WORDS} words)</span>
      <textarea rows={4} className={`${fieldClass} h-auto py-2`} value={value} onChange={(e) => onChangeText(e.target.value)} />
      <span className={`self-end text-[11.5px] ${left < 20 ? "font-semibold text-red-600" : "text-slate-500"}`}>{count} / {MAX_WORDS} words</span>
    </label>
  );
  const typeOptions = (
    <>
      <option value="" disabled>Choose type</option>
      <option value="distributor">Distributor</option>
      <option value="cnf">CNF</option>
    </>
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Companies"
          description="Companies added here will be available across the app (e.g., Add Sales, Create Staff). A unique company code is auto-generated for each company."
        />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          {/* Add company */}
          <Card className="xl:sticky xl:top-[88px] xl:self-start">
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white"><Icon name="add_business" className="text-[19px]" /></span>
              <h3 className="m-0 text-[15px] font-semibold text-slate-900">Add Company</h3>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Company type *" width="w-full">
                  <select className={fieldClass} value={form.type} onChange={(e) => handleChange("type", e.target.value)}>{typeOptions}</select>
                </Field>
                <SaleBillSelect value={form.createsSaleBill} onChange={(v) => handleChange("createsSaleBill", v)} />
              </div>
              <Field label="Company name *" width="w-full">
                <input className={fieldClass} value={form.name} onChange={(e) => handleChange("name", e.target.value)} />
              </Field>
              <EmailChipsInput
                value={form.emails}
                onChange={(emails) => { setSuccess(""); setForm((prev) => ({ ...prev, emails })); }}
                onError={setError}
              />
              {aboutField(form.about, (text) => handleChange("about", text), wordCount, wordsLeft)}
              {error && <Notice tone="error">{error}</Notice>}
              {success && <Notice tone="success" onClose={() => setSuccess("")}>{success}</Notice>}
              <button type="button" className={`${btn.primary} w-full justify-center`} disabled={saving} onClick={handleSubmit}>
                <Icon name="add_business" className="text-[18px]" />{saving ? "Adding..." : "Add Company"}
              </button>
            </div>
          </Card>

          {/* Existing companies */}
          <div className="min-w-0 space-y-4">
            {!loadingList && (
              <div className="flex flex-wrap gap-2">
                <StatBox label={filterType ? "Shown" : "Companies"} value={companies.length} icon="business" />
                <StatBox label="Distributor" value={companies.filter((c) => c.type === "distributor").length} icon="local_shipping" />
                <StatBox label="CNF" value={companies.filter((c) => c.type === "cnf").length} icon="warehouse" />
                <StatBox label="No sale bills" value={companies.filter((c) => !createsSaleBill(c)).length} icon="receipt_long" />
              </div>
            )}
            <Card>
              <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
                <h3 className="m-0 grow text-[15px] font-semibold text-slate-900">Existing Companies</h3>
                <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                  {[["", "All"], ["distributor", "Distributor"], ["cnf", "CNF"]].map(([value, label]) => (
                    <button
                      key={label} type="button" onClick={() => setFilterType(value)}
                      className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${filterType === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {loadingList ? (
                <div className="flex justify-center py-16"><Spinner className="size-7" /></div>
              ) : companies.length === 0 ? (
                <p className="m-0 py-16 text-center text-[13px] text-slate-400">No companies found. Add one on the left.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className={th}>Company</th>
                        <th className={th}>Type</th>
                        <th className={th}>Email IDs</th>
                        <th className={`${th} text-right`}>Daily target</th>
                        <th className={th}>Sale bills</th>
                        <th className={th}>About</th>
                        <th className={`${th} text-right`}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((company) => (
                        <tr key={company.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                          <td className={td}>
                            <span className="block font-semibold text-slate-800">{company.name}</span>
                            <span className="block font-mono text-[11.5px] font-semibold text-blue-700">{company.code || "—"}</span>
                          </td>
                          <td className={td}>{typeChip(company.type)}</td>
                          <td className={`${td} max-w-56`}><EmailList emails={company.emails} /></td>
                          <td className={`${td} text-right tabular-nums font-semibold`}>
                            {Number(company.daily_requisition_target) > 0
                              ? `₹${Number(company.daily_requisition_target).toLocaleString("en-IN")}`
                              : <span className="font-normal text-slate-300">—</span>}
                          </td>
                          <td className={td}>
                            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${createsSaleBill(company) ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                              {createsSaleBill(company) ? "Yes" : "No"}
                            </span>
                          </td>
                          <td className={`${td} max-w-60 text-[12.5px] text-slate-500`}>
                            {company.about
                              ? company.about.length > 100 ? `${company.about.slice(0, 100)}…` : company.about
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className={`${td} text-right`}>
                            <span className="inline-flex gap-0.5">
                              <button type="button" className={`${btn.icon} hover:text-blue-700`} onClick={() => openEditModal(company)} title="Edit company" aria-label={`Edit ${company.name}`}>
                                <Icon name="edit" className="text-[19px]" />
                              </button>
                              <button
                                type="button" className={`${btn.icon} hover:bg-red-50 hover:text-red-600`} disabled={deletingId === company.id}
                                onClick={() => handleDelete(company.id, company.name)} title="Delete company" aria-label={`Delete ${company.name}`}
                              >
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
          </div>
        </div>
      </div>

      <Modal
        open={editModalOpen} onClose={closeEditModal} locked={savingEdit} size="lg" title="Edit Company"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeEditModal} disabled={savingEdit}>Cancel</button>
            <button type="button" className={btn.primary} onClick={handleUpdate} disabled={savingEdit}>{savingEdit ? "Updating..." : "Update Company"}</button>
          </>
        )}
      >
        <div className="space-y-4">
          {editForm.code && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-[12px] text-slate-500">Company code (auto-generated, read-only)</span>
              <span className="ml-auto font-mono text-[13px] font-bold text-blue-700">{editForm.code}</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_3fr]">
            <Field label="Company type *" width="w-full">
              <select className={fieldClass} value={editForm.type} onChange={(e) => handleEditChange("type", e.target.value)}>{typeOptions}</select>
            </Field>
            <Field label="Company name *" width="w-full">
              <input className={fieldClass} value={editForm.name} onChange={(e) => handleEditChange("name", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SaleBillSelect
              value={editForm.createsSaleBill} onChange={(v) => handleEditChange("createsSaleBill", v)}
              hint="No: the company is hidden in Add Sales and its sale bills can't be saved."
            />
            <Field label="Daily requisition target (₹, optional)" width="w-full" hint="Each staff member's requisitions for a day must reach this value. Below it, the day needs Below Target approval. Leave blank for no target.">
              <input type="number" min={0} step="0.01" className={fieldClass} value={editForm.dailyRequisitionTarget} onChange={(e) => handleEditChange("dailyRequisitionTarget", e.target.value)} />
            </Field>
          </div>
          <EmailChipsInput value={editForm.emails} onChange={(emails) => setEditForm((prev) => ({ ...prev, emails }))} onError={setEditError} />
          {aboutField(editForm.about, (text) => handleEditChange("about", text), editWordCount, editWordsLeft)}
          {editError && <Notice tone="error">{editError}</Notice>}
        </div>
      </Modal>

      <Footer />
    </DashboardLayout>
  );
}

export default AddCompany;
