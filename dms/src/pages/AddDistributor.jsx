import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdContentCopy, MdEdit, MdKey, MdLockReset, MdSearch, MdVisibility } from "react-icons/md";
import { apiFetch } from "../auth";
import { CompanyPicker, ConfirmDialog, EditDialog, ExcelButton, Field, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";
import { downloadExcel } from "../utils/excel";
import { INDIAN_STATES, lookupPincode, matchState } from "../utils/pincode";
import { showDate } from "../utils/purchaseCalc";

// Sales > Add Distributor. First CNF or Distributor, then a company of that type: the login
// is made under that company. Saving makes the login (ID BFPDD001, ... and a password); the
// password is kept encrypted on the server so it can be shown again here.

const typeLabel = (t) => (t === "cnf" ? "CNF" : "Distributor");

const emptyForm = () => ({
  distributorName: "",
  contactPerson: "",
  contactNo: "",
  email: "",
  address: "",
  city: "",
  district: "",
  state: "",
  pinCode: "",
  hasGst: false,
  gstin: "",
});

const fromRow = (d) => ({
  distributorName: d.distributor_name || "",
  contactPerson: d.contact_person || "",
  contactNo: d.contact_no || "",
  email: d.email || "",
  address: d.address || "",
  city: d.city || "",
  district: d.district || "",
  state: d.state || "",
  pinCode: d.pin_code || "",
  hasGst: Boolean(d.has_gst),
  gstin: d.gstin || "",
});

const validate = (f) => {
  if (!f.distributorName.trim()) return "Distributor name is required.";
  if (!/^\d{10}$/.test(f.contactNo.replace(/\D/g, ""))) return "Enter a 10-digit contact number.";
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return "Enter a valid email.";
  if (f.pinCode && !/^\d{6}$/.test(f.pinCode)) return "Pin code must be 6 digits.";
  if (f.hasGst && !/^[0-9A-Z]{15}$/.test(f.gstin.trim().toUpperCase())) return "Enter the 15-character GSTIN.";
  return "";
};

const showDateTime = (value) => {
  if (!value) return "";
  const [day, time = ""] = String(value).split(" ");
  return `${showDate(day)}${time ? ` ${time.slice(0, 5)}` : ""}`;
};

const copyText = async (value) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

// The form fields, shared by "Add" and the Edit dialog.
function DistributorFields({ form, setForm }) {
  const [pinNote, setPinNote] = useState("");
  const lastPin = useRef("");
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const onPin = async (value) => {
    const pin = value.replace(/\D/g, "").slice(0, 6);
    setForm((f) => ({ ...f, pinCode: pin }));
    if (pin.length !== 6 || pin === lastPin.current) return;
    lastPin.current = pin;
    setPinNote("Looking up pin code…");
    const found = await lookupPincode(pin);
    if (!found) {
      setPinNote("Pin code not found; fill city / district / state yourself.");
      return;
    }
    setPinNote("");
    setForm((f) => ({
      ...f,
      city: f.city || found.city || found.district || "",
      district: f.district || found.district || "",
      state: f.state || matchState(found.state) || "",
    }));
  };

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Distributor name" required className="sm:col-span-2">
        <input className="input w-full" maxLength={255} value={form.distributorName} onChange={set("distributorName")} />
      </Field>
      <Field label="Contact person">
        <input className="input w-full" maxLength={255} value={form.contactPerson} onChange={set("contactPerson")} />
      </Field>
      <Field label="Contact no." required>
        <input
          className="input w-full"
          inputMode="numeric"
          maxLength={10}
          value={form.contactNo}
          onChange={(e) => setForm((f) => ({ ...f, contactNo: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
        />
      </Field>
      <Field label="Email">
        <input type="email" className="input w-full" maxLength={255} value={form.email} onChange={set("email")} />
      </Field>
      <Field label="Address" className="sm:col-span-3">
        <input className="input w-full" maxLength={1000} value={form.address} onChange={set("address")} />
      </Field>
      <Field label="Pin code" hint={pinNote || undefined}>
        <input className="input w-full" inputMode="numeric" maxLength={6} value={form.pinCode} onChange={(e) => onPin(e.target.value)} />
      </Field>
      <Field label="City">
        <input className="input w-full" maxLength={100} value={form.city} onChange={set("city")} />
      </Field>
      <Field label="District">
        <input className="input w-full" maxLength={100} value={form.district} onChange={set("district")} />
      </Field>
      <Field label="State">
        <select className="select w-full" value={form.state} onChange={set("state")}>
          <option value="">Select state</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="GST">
        <label className="flex h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={form.hasGst}
            onChange={(e) => setForm((f) => ({ ...f, hasGst: e.target.checked }))}
          />
          GST registered
        </label>
      </Field>
      {form.hasGst && (
        <Field label="GSTIN" required>
          <input
            className="input w-full font-mono uppercase"
            maxLength={15}
            value={form.gstin}
            onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))}
          />
        </Field>
      )}
    </div>
  );
}

// Login ID + password, with copy buttons.
function CredentialsDialog({ data, onClose, onCopied }) {
  if (!data) return null;
  const { name, loginId, password, fresh } = data;
  const copy = async (value, what) => onCopied((await copyText(value)) ? `${what} copied.` : "Copy failed; select and copy it.");
  return (
    <div className="modal modal-open z-[1300]" role="dialog">
      <div className="modal-box max-w-md">
        <h3 className="flex items-center gap-2 font-semibold">
          <MdKey size={18} /> Login details
        </h3>
        <p className="mt-1 text-sm text-base-content/60">
          {name}
          {fresh ? " · new login" : ""}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {[
            ["Login ID", loginId],
            ["Password", password],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-2 rounded-box border border-base-300 bg-base-200/60 px-3 py-2">
              <span className="w-20 text-xs text-base-content/60">{label}</span>
              <span className="flex-1 select-all font-mono text-base font-semibold tracking-wide">{value}</span>
              <button type="button" className="btn btn-ghost btn-xs btn-square" title={`Copy ${label}`} onClick={() => copy(value, label)}>
                <MdContentCopy size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-soft btn-primary btn-sm"
            onClick={() => copy(`Login ID: ${loginId}\nPassword: ${password}`, "Login ID and password")}
          >
            <MdContentCopy size={15} /> Copy both
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}

export default function AddDistributor() {
  const companies = useCompanies();
  const [show, flashNode] = useFlash();
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  // CNF / Distributor first, then a company of that type.
  const [companyType, setCompanyType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const company = companies.find((c) => String(c.id) === String(companyId));

  const [creds, setCreds] = useState(null); // { name, loginId, password, fresh }
  const [editing, setEditing] = useState(null); // { row, form }
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [toReset, setToReset] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (companyType) params.set("type", companyType);
      if (companyId) params.set("companyId", companyId);
      const res = await apiFetch(`/staff/distributors?${params}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load distributors.");
      setRows(Array.isArray(body.distributors) ? body.distributors : []);
    } catch (err) {
      setRows([]);
      show(false, err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyType, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const payload = (f) => ({
    ...f,
    distributorName: f.distributorName.trim(),
    contactPerson: f.contactPerson.trim(),
    email: f.email.trim(),
    gstin: f.hasGst ? f.gstin.trim().toUpperCase() : "",
  });

  const add = async (e) => {
    e.preventDefault();
    if (!companyType) return setError("Choose CNF or Distributor.");
    if (!companyId) return setError("Select the company this login is for.");
    const problem = validate(form);
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/staff/distributors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(form), sellerType: companyType, companyId: Number(companyId) }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not add the distributor.");
      show(true, body.message || "Distributor added.");
      setCreds({ name: body.distributor?.distributor_name || form.distributorName, ...body.credentials, fresh: true });
      setForm(emptyForm());
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const viewLogin = async (row) => {
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/staff/distributors/${row.id}/credentials`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load the login details.");
      setCreds({ name: row.distributor_name, ...body.credentials });
    } catch (err) {
      show(false, err.message);
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async () => {
    const row = toReset;
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/staff/distributors/${row.id}/reset-password`, { method: "POST" });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not make a new password.");
      setToReset(null);
      setCreds({ name: row.distributor_name, ...body.credentials, fresh: true });
    } catch (err) {
      show(false, err.message);
    } finally {
      setBusyId(null);
    }
  };

  const setActive = async (row, isActive) => {
    setBusyId(row.id);
    try {
      const res = await apiFetch(`/staff/distributors/${row.id}/active`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not change the distributor.");
      show(true, body.message);
      load();
    } catch (err) {
      show(false, err.message);
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const problem = validate(editing.form);
    if (problem) return setEditError(problem);
    setEditBusy(true);
    setEditError("");
    try {
      const res = await apiFetch(`/staff/distributors/${editing.row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(editing.form)),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not save the changes.");
      show(true, body.message || "Saved.");
      setEditing(null);
      load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditBusy(false);
    }
    return undefined;
  };

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((d) => {
      if (!words.length) return true;
      const hay = [d.login_id, d.distributor_name, d.contact_person, d.contact_no, d.city, d.company_name, d.gstin]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, search]);

  const exportExcel = () =>
    downloadExcel({
      fileName: `Distributors${company ? `_${company.name.replace(/[^\w]+/g, "_")}` : ""}`,
      title: `Distributors${company ? ` · ${company.name}` : companyType ? ` · ${typeLabel(companyType)}` : ""}`,
      sheets: [
        {
          name: "Distributors",
          rows: shown,
          columns: [
            { header: "Sr No.", value: (_, i) => i + 1, width: 8, type: "number" },
            { header: "Login ID", key: "login_id", width: 12 },
            { header: "Type", value: (d) => typeLabel(d.seller_type), width: 12 },
            { header: "Distributor", key: "distributor_name", width: 30 },
            { header: "Contact person", key: "contact_person", width: 20 },
            { header: "Contact no.", key: "contact_no", width: 14 },
            { header: "Email", key: "email", width: 24 },
            { header: "Company", key: "company_name", width: 20 },
            { header: "Address", key: "address", width: 30 },
            { header: "City", key: "city", width: 14 },
            { header: "District", key: "district", width: 14 },
            { header: "State", key: "state", width: 16 },
            { header: "Pin code", key: "pin_code", width: 10 },
            { header: "GSTIN", key: "gstin", width: 18 },
            { header: "Status", value: (d) => (d.is_active ? "Active" : "Inactive"), width: 10 },
            { header: "Added on", value: (d) => String(d.created_at || "").slice(0, 10), width: 12, type: "date" },
          ],
        },
      ],
    });

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Sales" title="Add Distributor">
        Add a distributor. Saving makes their login ID and password; you can view the login details again from the list.
      </PageHeader>

      <CompanyPicker
        companies={companies}
        type={companyType}
        onTypeChange={(t) => {
          setCompanyType(t);
          setCompanyId("");
          setError("");
        }}
        companyId={companyId}
        onCompanyChange={(id) => {
          setCompanyId(id);
          setError("");
        }}
      >
        {company && (
          <p className="pb-1.5 text-sm text-base-content/70">
            <span className="font-semibold text-base-content">{rows.length}</span> {typeLabel(companyType)} login
            {rows.length === 1 ? "" : "s"} under {company.name}
          </p>
        )}
      </CompanyPicker>

      <form onSubmit={add} className="mb-5 rounded-box border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-4 py-3">
          <h2 className="font-semibold">
            New {companyType ? typeLabel(companyType) : "distributor"}
            {company ? <span className="font-normal text-base-content/60"> under {company.name}</span> : null}
          </h2>
          {!company && <p className="text-xs text-base-content/55">Choose CNF or Distributor and the company first.</p>}
        </div>
        <fieldset disabled={saving || !company} className="p-4">
          <DistributorFields form={form} setForm={(fn) => { setError(""); setForm(fn); }} />
        </fieldset>
        <div className="flex items-center gap-3 border-t border-base-300 bg-base-200/50 px-4 py-3">
          {error && <p className="text-sm text-error">{error}</p>}
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => { setForm(emptyForm()); setError(""); }}>
              Clear
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !company}>
              {saving ? <span className="loading loading-spinner loading-xs" /> : <MdKey size={16} />}
              Save &amp; make login
            </button>
          </span>
        </div>
      </form>

      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <div className="mr-auto">
            <h2 className="font-semibold">
              {company ? `${company.name} logins` : companyType ? `All ${typeLabel(companyType)} logins` : "All logins"}
            </h2>
            <p className="text-xs text-base-content/55">
              {shown.length} of {rows.length}
            </p>
          </div>
          <label className="input input-sm w-60">
            <MdSearch size={16} className="opacity-50" />
            <input placeholder="Login ID, name, contact, city" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <ExcelButton disabled={!shown.length} onExport={exportExcel} onError={(err) => show(false, err.message)} />
        </div>
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">
            <span className="loading loading-spinner loading-sm" />
          </p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">{rows.length ? "No distributors match." : "No distributors yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm whitespace-nowrap">
              <thead>
                <tr className="bg-base-200/60 text-base-content/70">
                  <th className="w-10 text-right">Sr</th>
                  <th>Login ID</th>
                  <th>Type</th>
                  <th>Distributor</th>
                  <th>Contact</th>
                  <th>Company</th>
                  <th>City / State</th>
                  <th>GSTIN</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th className="w-56">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d, i) => (
                  <tr key={d.id} className={d.is_active ? "hover:bg-base-200/50" : "opacity-60 hover:bg-base-200/50"}>
                    <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                    <td className="font-mono text-xs font-semibold">{d.login_id}</td>
                    <td>
                      <span className={`badge badge-sm ${d.seller_type === "cnf" ? "badge-secondary" : "badge-primary"} badge-outline`}>
                        {typeLabel(d.seller_type)}
                      </span>
                    </td>
                    <td className="max-w-64">
                      <div className="truncate font-medium">{d.distributor_name}</div>
                      {d.contact_person && <div className="truncate text-xs text-base-content/55">{d.contact_person}</div>}
                    </td>
                    <td className="text-xs">
                      <div className="tabular-nums">{d.contact_no}</div>
                      {d.email && <div className="text-base-content/55">{d.email}</div>}
                    </td>
                    <td className="text-xs">{d.company_name || "—"}</td>
                    <td className="text-xs">{[d.city, d.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="font-mono text-xs">{d.gstin || "—"}</td>
                    <td>
                      <span className={`badge badge-sm ${d.is_active ? "badge-success" : "badge-ghost"}`}>{d.is_active ? "Active" : "Inactive"}</span>
                    </td>
                    <td className="text-xs">{showDateTime(d.created_at)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-soft btn-primary btn-xs"
                        disabled={busyId === d.id}
                        title="Show login ID and password"
                        onClick={() => viewLogin(d)}
                      >
                        <MdVisibility size={14} /> Login
                      </button>
                      <button type="button" className="btn btn-ghost btn-xs btn-square" title="Edit" onClick={() => { setEditError(""); setEditing({ row: d, form: fromRow(d) }); }}>
                        <MdEdit size={16} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-xs btn-square" title="Make a new password" disabled={busyId === d.id} onClick={() => setToReset(d)}>
                        <MdLockReset size={16} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-xs" disabled={busyId === d.id} onClick={() => setActive(d, !d.is_active)}>
                        {d.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <EditDialog
          title="Edit distributor"
          subtitle={`${editing.row.login_id} · ${typeLabel(editing.row.seller_type)} · ${editing.row.company_name || "No company"}`}
          busy={editBusy}
          error={editError}
          onClose={() => setEditing(null)}
          onSubmit={saveEdit}
        >
          <DistributorFields
            form={editing.form}
            setForm={(fn) => setEditing((e) => ({ ...e, form: typeof fn === "function" ? fn(e.form) : fn }))}
          />
        </EditDialog>
      )}

      {toReset && (
        <ConfirmDialog
          title="Make a new password?"
          confirmLabel="New password"
          busy={busyId === toReset.id}
          onCancel={() => setToReset(null)}
          onConfirm={resetPassword}
        >
          {toReset.distributor_name} ({toReset.login_id}) gets a new password; the old one stops working.
        </ConfirmDialog>
      )}

      <CredentialsDialog data={creds} onClose={() => setCreds(null)} onCopied={(msg) => show(true, msg)} />
      {flashNode}
    </div>
  );
}
