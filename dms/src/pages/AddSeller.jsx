import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdAdd, MdDeleteOutline, MdEdit, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { CompanyPicker, ConfirmDialog, EditDialog, ExcelButton, Field, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";
import { downloadExcel, fileSafe } from "../utils/excel";
import { INDIAN_STATES, lookupPincode, matchState } from "../utils/pincode";

// Uses the same backend endpoints as the main site's Add Seller page
// (frontend/src/layouts/add-seller), so both screens stay in sync.

const emptyForm = () => ({
  sellerName: "",
  contact: "",
  address: "",
  city: "",
  district: "",
  state: "",
  pinCode: "",
  hasGst: false,
  gstin: "",
});

const fromSeller = (s) => ({
  sellerName: s.seller_name || "",
  contact: s.contact || "",
  address: s.address || "",
  city: s.city || "",
  district: s.district || "",
  state: s.state || "",
  pinCode: s.in_code || "",
  hasGst: Boolean(s.has_gst),
  gstin: s.gstin || "",
});

const toPayload = (f, companyId) => ({
  companyId: Number(companyId),
  sellerName: f.sellerName.trim(),
  address: f.address.trim(),
  city: f.city.trim(),
  district: f.district.trim(),
  contact: f.contact.replace(/\D/g, ""),
  hasGst: f.hasGst,
  gstin: f.hasGst ? f.gstin.trim().toUpperCase() : "",
  state: f.state.trim(),
  pinCode: f.pinCode.replace(/\D/g, ""),
});

const validate = (f) => {
  if (!f.sellerName.trim()) return "Seller name is required.";
  if (!f.contact.trim()) return "Contact number is required.";
  if (f.hasGst) {
    if (!f.gstin.trim()) return "GSTIN is required for a GST registered seller.";
    if (!f.state.trim()) return "State is required for a GST registered seller.";
    if (!/^\d{6}$/.test(f.pinCode)) return "A 6-digit pin code is required for a GST registered seller.";
  }
  return "";
};

// Fills city / district / state from the pin code. Only overwrites a field if it
// is empty or still holds what the previous lookup put there, so anything the
// user typed by hand is kept.
function usePincodeFill(setForm) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState(null);
  const lastPin = useRef("");
  const filled = useRef({});

  const putValues = (next) => {
    const before = filled.current;
    const pick = (prev, field) => (!prev[field] || prev[field] === before[field] ? next[field] : prev[field]);
    setForm((prev) => ({
      ...prev,
      city: pick(prev, "city"),
      district: pick(prev, "district"),
      state: pick(prev, "state"),
    }));
    filled.current = next;
  };

  const onPinChange = async (value) => {
    const pin = value.replace(/\D/g, "").slice(0, 6);
    setForm((prev) => ({ ...prev, pinCode: pin }));

    if (pin.length !== 6) {
      setNote(null);
      if (lastPin.current) {
        lastPin.current = "";
        putValues({ city: "", district: "", state: "" });
      }
      return;
    }
    if (pin === lastPin.current) return;

    lastPin.current = pin;
    setLoading(true);
    setNote(null);
    const result = await lookupPincode(pin);
    if (lastPin.current !== pin) return; // pin changed while we were waiting
    setLoading(false);

    if (!result) {
      lastPin.current = "";
      putValues({ city: "", district: "", state: "" });
      setNote({ ok: false, text: "Pin code not found. Fill district and state by hand." });
      return;
    }
    const values = { city: result.city || "", district: result.district || "", state: matchState(result.state) };
    putValues(values);
    setNote({ ok: true, text: [values.district, values.state].filter(Boolean).join(", ") });
  };

  // Called when the edit dialog opens with an existing seller.
  const reset = (form) => {
    lastPin.current = form.pinCode || "";
    filled.current = form.pinCode ? { city: form.city, district: form.district, state: form.state } : {};
    setLoading(false);
    setNote(null);
  };

  return { loading, note, onPinChange, reset };
}

function SellerFields({ form, setForm, pin, disabled }) {
  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <fieldset disabled={disabled} className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 disabled:opacity-60">
      <Field label="Seller name" required>
        <input className="input w-full" value={form.sellerName} onChange={set("sellerName")} />
      </Field>
      <Field label="Contact number" required>
        <input
          className="input w-full"
          inputMode="numeric"
          value={form.contact}
          onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value.replace(/\D/g, "") }))}
        />
      </Field>

      <Field label="Address" className="sm:col-span-2">
        <textarea className="textarea w-full min-h-0" rows={2} value={form.address} onChange={set("address")} />
      </Field>

      <Field
        label="Pin code"
        hint={
          pin.note ? (
            <span className={`text-xs ${pin.note.ok ? "text-success" : "text-warning"}`}>{pin.note.text}</span>
          ) : (
            <span className="text-xs text-base-content/50">District and state fill in automatically</span>
          )
        }
      >
        <div className="input w-full">
          <input
            inputMode="numeric"
            className="tracking-widest"
            value={form.pinCode}
            onChange={(e) => pin.onPinChange(e.target.value)}
          />
          {pin.loading && <span className="loading loading-spinner loading-xs text-primary" />}
        </div>
      </Field>
      <Field label="City">
        <input className="input w-full" value={form.city} onChange={set("city")} />
      </Field>
      <Field label="District">
        <input className="input w-full" value={form.district} onChange={set("district")} />
      </Field>
      <Field label="State" required={form.hasGst}>
        <select className="select w-full" value={form.state} onChange={set("state")}>
          <option value="">Select state</option>
          {INDIAN_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <div className="sm:col-span-2 mt-1 flex flex-wrap items-end gap-4 border-t border-dashed border-base-300 pt-3">
        <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm">
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={form.hasGst}
            onChange={(e) => setForm((prev) => ({ ...prev, hasGst: e.target.checked }))}
          />
          GST registered
        </label>
        {form.hasGst && (
          <Field label="GSTIN" required className="min-w-56 flex-1">
            <input
              className="input w-full font-mono uppercase"
              maxLength={15}
              value={form.gstin}
              onChange={(e) => setForm((prev) => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
            />
          </Field>
        )}
      </div>
    </fieldset>
  );
}

export default function AddSeller() {
  const companies = useCompanies();
  const [companyType, setCompanyType] = useState("");
  const [companyId, setCompanyId] = useState("");

  const [sellers, setSellers] = useState([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const pin = usePincodeFill(setForm);

  const [editing, setEditing] = useState(null); // seller being edited
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const editPin = usePincodeFill(setEditForm);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [showFlash, flashNode] = useFlash();

  const loadSellers = useCallback(async (id) => {
    if (!id) {
      setSellers([]);
      return;
    }
    setLoadingSellers(true);
    try {
      const data = await readJson(await apiFetch(`/staff/purchase-sellers/company/${id}`));
      setSellers(Array.isArray(data) ? data : []);
    } catch {
      setSellers([]);
    } finally {
      setLoadingSellers(false);
    }
  }, []);

  useEffect(() => {
    setForm(emptyForm());
    pin.reset(emptyForm());
    setFormError("");
    setSearch("");
    loadSellers(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, loadSellers]);

  const company = companies.find((c) => String(c.id) === String(companyId));

  const shownSellers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter((s) =>
      [s.seller_name, s.seller_code, s.contact, s.city, s.district, s.gstin]
        .some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [sellers, search]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const res = await apiFetch("/staff/purchase-sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form, companyId)),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setFormError(data.error || "Could not add the seller.");
        return;
      }
      const code = data.seller?.seller_code ? ` as ${data.seller.seller_code}` : "";
      showFlash(true, `${form.sellerName.trim()} added${code}.`);
      setForm(emptyForm());
      pin.reset(emptyForm());
      loadSellers(companyId);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (seller) => {
    const f = fromSeller(seller);
    setEditing(seller);
    setEditForm(f);
    setEditError("");
    editPin.reset(f);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const problem = validate(editForm);
    if (problem) {
      setEditError(problem);
      return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      const res = await apiFetch(`/staff/purchase-sellers/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(editForm, companyId)),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setEditError(data.error || "Could not update the seller.");
        return;
      }
      showFlash(true, `${data.seller?.seller_name || editForm.sellerName} updated.`);
      setEditing(null);
      loadSellers(companyId);
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/staff/purchase-sellers/${toDelete.id}`, { method: "DELETE" });
      const data = await readJson(res);
      if (res.ok) {
        setSellers((prev) => prev.filter((s) => s.id !== toDelete.id));
        showFlash(true, `${toDelete.seller_name} deleted.`);
      } else {
        showFlash(false, data.error || "Could not delete the seller.");
      }
    } catch {
      showFlash(false, "Network error. Please try again.");
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  return (
    <div data-theme="dms" className="bg-transparent text-base-content">
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="Purchase masters" title="Sellers">
          Pick the company first. Sellers you add here show up in Purchase, Add Item and the stock screens for that
          company.
        </PageHeader>

        <CompanyPicker
          companies={companies}
          type={companyType}
          onTypeChange={(t) => {
            setCompanyType(t);
            setCompanyId("");
          }}
          companyId={companyId}
          onCompanyChange={setCompanyId}
        >
          {company && (
            <p className="pb-1.5 text-sm text-base-content/70">
              <span className="font-semibold text-base-content">{sellers.length}</span> seller
              {sellers.length === 1 ? "" : "s"} under {company.name}
            </p>
          )}
        </CompanyPicker>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[400px_1fr]">
          {/* New seller form */}
          <form
            onSubmit={handleAdd}
            className="self-start rounded-box border border-base-300 bg-base-100 xl:sticky xl:top-20"
          >
            <div className="border-b border-base-300 px-4 py-3">
              <h2 className="font-semibold">New seller</h2>
              {!company && <p className="text-xs text-base-content/60">Select a company above to start.</p>}
              {company && <p className="text-xs text-base-content/60">Adding under {company.name}</p>}
            </div>
            <div className="p-4">
              <SellerFields form={form} setForm={setForm} pin={pin} disabled={!companyId} />
              {formError && <p className="mt-3 text-sm text-error">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-base-300 bg-base-200/50 px-4 py-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!companyId || saving}
                onClick={() => {
                  setForm(emptyForm());
                  pin.reset(emptyForm());
                  setFormError("");
                }}
              >
                Clear
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={!companyId || saving}>
                {saving ? <span className="loading loading-spinner loading-xs" /> : <MdAdd size={18} />}
                Save seller
              </button>
            </div>
          </form>

          {/* Seller list */}
          <section className="min-w-0 rounded-box border border-base-300 bg-base-100">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
              <h2 className="font-semibold">Seller list</h2>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <label className="input input-sm w-full sm:w-64">
                  <MdSearch size={16} className="opacity-50" />
                  <input
                    type="search"
                    placeholder="Name, code, phone, GSTIN"
                    value={search}
                    disabled={!companyId}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <ExcelButton
                  disabled={!companyId || loadingSellers || !sellers.length}
                  onError={() => showFlash(false, "Could not create the Excel file.")}
                  onExport={() =>
                    downloadExcel({
                      fileName: `Sellers_${fileSafe(company?.name)}`,
                      title: `Sellers · ${company?.name || ""}`,
                      sheets: [
                        {
                          name: "Sellers",
                          rows: sellers,
                          columns: [
                            { header: "Sr No", width: 7, type: "number", value: (_, i) => i + 1 },
                            { header: "Seller Code", key: "seller_code", width: 13 },
                            { header: "Seller Name", key: "seller_name", width: 34 },
                            { header: "Contact", key: "contact", width: 14 },
                            { header: "Address", key: "address", width: 40 },
                            { header: "City", key: "city", width: 16 },
                            { header: "District", key: "district", width: 16 },
                            { header: "State", key: "state", width: 18 },
                            { header: "Pin Code", key: "in_code", width: 10 },
                            { header: "GST Registered", width: 10, value: (s) => (s.has_gst ? "Yes" : "No") },
                            { header: "GSTIN", key: "gstin", width: 18 },
                            { header: "Company", width: 24, value: () => company?.name },
                          ],
                        },
                      ],
                    })
                  }
                />
              </div>
            </div>

            {!companyId ? (
              <p className="px-4 py-12 text-center text-sm text-base-content/60">
                Sellers appear here once you pick a company.
              </p>
            ) : loadingSellers ? (
              <div className="flex justify-center py-12">
                <span className="loading loading-dots loading-md text-primary" />
              </div>
            ) : shownSellers.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-base-content/60">
                {search ? `Nothing matches "${search}".` : "No sellers yet for this company."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr className="bg-base-200/60 text-base-content/70">
                      <th className="w-12 text-right">Sr</th>
                      <th>Code</th>
                      <th>Seller</th>
                      <th>Location</th>
                      <th>GST</th>
                      <th className="w-20 text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownSellers.map((s, index) => (
                      <tr key={s.id} className="hover:bg-base-200/50">
                        <td className="text-right tabular-nums text-base-content/50">{index + 1}</td>
                        <td className="whitespace-nowrap font-mono text-xs font-semibold text-primary">
                          {s.seller_code || "—"}
                        </td>
                        <td>
                          <div className="font-medium">{s.seller_name}</div>
                          <div className="text-xs text-base-content/60">{s.contact || "No contact"}</div>
                        </td>
                        <td className="text-sm">
                          <div>{[s.city, s.district].filter(Boolean).join(", ") || "—"}</div>
                          <div className="text-xs text-base-content/60">
                            {[s.state, s.in_code].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td>
                          {s.has_gst ? (
                            <span className="font-mono text-xs">{s.gstin || "Registered"}</span>
                          ) : (
                            <span className="badge badge-ghost badge-sm">Unregistered</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-square"
                            title="Edit"
                            onClick={() => openEdit(s)}
                          >
                            <MdEdit size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-square text-error"
                            title="Delete"
                            onClick={() => setToDelete(s)}
                          >
                            <MdDeleteOutline size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {editing && (
        <EditDialog
          title="Edit seller"
          subtitle={editing.seller_code}
          busy={savingEdit}
          error={editError}
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
        >
          <SellerFields form={editForm} setForm={setEditForm} pin={editPin} disabled={savingEdit} />
        </EditDialog>
      )}

      {toDelete && (
        <ConfirmDialog title="Delete seller?" busy={deleting} onCancel={() => setToDelete(null)} onConfirm={handleDelete}>
          <b className="text-base-content">{toDelete.seller_name}</b>
          {toDelete.seller_code && <span className="font-mono"> ({toDelete.seller_code})</span>} will be removed. This
          can&apos;t be undone.
        </ConfirmDialog>
      )}

      {flashNode}
    </div>
  );
}
