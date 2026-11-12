import { useCallback, useEffect, useMemo, useState } from "react";
import { MdAdd, MdCheck, MdEdit, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { CompanyPicker, EditDialog, Field, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";
import ItemPicker from "../components/purchase/ItemPicker";

// Sales > Free Goods: for an item of a company, "buy 100 pcs, get 30 pcs free". On orders
// (requisitions, web and app) and bills (Add Sales) the free pieces come as their own line
// at price 0, for every full "buy" qty (100 -> 30, 250 -> 60).

const emptyForm = () => ({
  productErpId: "",
  sameItem: true,
  freeProductErpId: "",
  buyQty: "",
  freeQty: "",
  note: "",
});

const fromScheme = (s) => ({
  productErpId: s.product_erp_id,
  sameItem: !s.free_product_erp_id || s.free_product_erp_id === s.product_erp_id,
  freeProductErpId: s.free_product_erp_id || "",
  buyQty: String(s.buy_qty),
  freeQty: String(s.free_qty),
  note: s.note || "",
});

const validate = (f) => {
  if (!f.productErpId) return "Choose the item.";
  if (!f.sameItem && !f.freeProductErpId) return "Choose the free item.";
  if (!(Math.floor(Number(f.buyQty)) > 0)) return "Enter how many pieces they must buy.";
  if (!(Math.floor(Number(f.freeQty)) > 0)) return "Enter how many pieces are free.";
  return "";
};

// Item picker list shape (same as Add Purchase's seller items).
const toPicker = (items) =>
  items.map((it) => ({
    id: it.product_erp_id,
    product_erp_id: it.product_erp_id,
    sku_name: it.sku_name,
    variant_name: it.variant_name,
    item_code: it.item_code,
    pcs_per_box: it.pcs_per_box,
  }));

function SchemeFields({ form, setForm, pickerItems, loading }) {
  const find = (erp) => pickerItems.find((p) => p.product_erp_id === erp) || null;
  const buy = Math.floor(Number(form.buyQty)) || 0;
  const free = Math.floor(Number(form.freeQty)) || 0;
  const freeName = form.sameItem
    ? find(form.productErpId)?.variant_name || find(form.productErpId)?.sku_name
    : find(form.freeProductErpId)?.variant_name || find(form.freeProductErpId)?.sku_name;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-[minmax(240px,2fr)_1fr_1fr]">
        <Field label="Item" required>
          <ItemPicker
            items={pickerItems}
            value={find(form.productErpId)}
            onPick={(it) => setForm((f) => ({ ...f, productErpId: it?.product_erp_id || "" }))}
            loading={loading}
          />
        </Field>
        <Field label="If they buy (pcs)" required>
          <input
            type="number"
            min="1"
            step="1"
            className="input w-full"
            value={form.buyQty}
            onChange={(e) => setForm((f) => ({ ...f, buyQty: e.target.value }))}
          />
        </Field>
        <Field label="Free (pcs)" required>
          <input
            type="number"
            min="1"
            step="1"
            className="input w-full"
            value={form.freeQty}
            onChange={(e) => setForm((f) => ({ ...f, freeQty: e.target.value }))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-[minmax(240px,2fr)_2fr]">
        <Field label="Free item">
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={form.sameItem}
              onChange={(e) => setForm((f) => ({ ...f, sameItem: e.target.checked, freeProductErpId: "" }))}
            />
            Same item
          </label>
          {!form.sameItem && (
            <ItemPicker
              items={pickerItems}
              value={find(form.freeProductErpId)}
              onPick={(it) => setForm((f) => ({ ...f, freeProductErpId: it?.product_erp_id || "" }))}
              loading={loading}
            />
          )}
        </Field>
        <Field label="Note">
          <input className="input w-full" maxLength={500} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </Field>
      </div>

      {buy > 0 && free > 0 && (
        <div className="rounded-box border border-success/30 bg-success/10 px-3 py-2 text-sm">
          Buy <b>{buy}</b> pcs → <b>{free}</b> pcs {freeName ? <b>{freeName}</b> : "of the item"} free at <b>₹0</b>.
          <span className="ml-2 text-xs text-base-content/60">
            e.g. {buy} → {free} free · {buy * 2 + Math.floor(buy / 2)} → {free * 2} free · {buy - 1} → none
          </span>
        </div>
      )}
    </div>
  );
}

export default function FreeGoods() {
  const companies = useCompanies();
  const [show, flashNode] = useFlash();
  const [companyType, setCompanyType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const company = companies.find((c) => String(c.id) === String(companyId));

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { id, form }
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [search, setSearch] = useState("");

  const pickerItems = useMemo(() => toPicker(items), [items]);

  useEffect(() => {
    setItems([]);
    setForm(emptyForm());
    if (!companyId) return;
    setLoadingItems(true);
    apiFetch(`/staff/free-goods/items?${new URLSearchParams({ companyId })}`)
      .then(readJson)
      .then((body) => setItems(Array.isArray(body.items) ? body.items : []))
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false));
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (companyType) params.set("type", companyType);
      if (companyId) params.set("companyId", companyId);
      const res = await apiFetch(`/staff/free-goods?${params}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load the schemes.");
      setSchemes(Array.isArray(body.schemes) ? body.schemes : []);
    } catch (err) {
      setSchemes([]);
      show(false, err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyType, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const toBody = (f) => ({
    companyId: Number(companyId),
    productErpId: f.productErpId,
    freeProductErpId: f.sameItem ? f.productErpId : f.freeProductErpId,
    buyQty: Math.floor(Number(f.buyQty)),
    freeQty: Math.floor(Number(f.freeQty)),
    note: f.note,
  });

  const save = async (e) => {
    e.preventDefault();
    if (!companyId) return setError("Choose CNF or Distributor and the company first.");
    const problem = validate(form);
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/staff/free-goods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBody(form)),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not save the scheme.");
      show(true, body.message || "Saved.");
      setForm(emptyForm());
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const problem = validate(editing.form);
    if (problem) return setEditError(problem);
    setEditBusy(true);
    setEditError("");
    try {
      const res = await apiFetch(`/staff/free-goods/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBody(editing.form)),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not save the scheme.");
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

  const setActive = async (s, isActive) => {
    try {
      const res = await apiFetch(`/staff/free-goods/${s.id}/active`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not change the scheme.");
      show(true, body.message);
      load();
    } catch (err) {
      show(false, err.message);
    }
  };

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return schemes;
    return schemes.filter((s) => {
      const hay = [s.product_erp_id, s.item_name, s.free_item_name, s.company_name, s.note].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [schemes, search]);

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Sales" title="Free Goods">
        Set free pieces on an item: buy 100 pcs, get 30 pcs free. Orders and bills then add the free pieces as their own
        line at price ₹0.
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
            <span className="font-semibold text-base-content">{items.length}</span> items ·{" "}
            <span className="font-semibold text-base-content">{schemes.filter((s) => s.is_active).length}</span> running scheme
            {schemes.filter((s) => s.is_active).length === 1 ? "" : "s"}
          </p>
        )}
      </CompanyPicker>

      <form onSubmit={save} className="mb-5 rounded-box border border-base-300 bg-base-100">
        <div className="border-b border-base-300 px-4 py-3">
          <h2 className="font-semibold">
            New free goods scheme
            {company ? <span className="font-normal text-base-content/60"> · {company.name}</span> : null}
          </h2>
          {!company && <p className="text-xs text-base-content/55">Choose CNF or Distributor and the company first.</p>}
        </div>
        <fieldset disabled={saving || !company} className="p-4">
          <SchemeFields form={form} setForm={(fn) => { setError(""); setForm(fn); }} pickerItems={pickerItems} loading={loadingItems} />
        </fieldset>
        <div className="flex items-center gap-3 border-t border-base-300 bg-base-200/50 px-4 py-3">
          {error && <p className="text-sm text-error">{error}</p>}
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={() => { setForm(emptyForm()); setError(""); }}>
              Clear
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !company}>
              {saving ? <span className="loading loading-spinner loading-xs" /> : <MdAdd size={17} />}
              Save scheme
            </button>
          </span>
        </div>
      </form>

      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <div className="mr-auto">
            <h2 className="font-semibold">{company ? `${company.name} schemes` : "All schemes"}</h2>
            <p className="text-xs text-base-content/55">
              {shown.length} of {schemes.length}
            </p>
          </div>
          <label className="input input-sm w-60">
            <MdSearch size={16} className="opacity-50" />
            <input placeholder="Item, ERP ID, company" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">
            <span className="loading loading-spinner loading-sm" />
          </p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">No free goods schemes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm whitespace-nowrap">
              <thead>
                <tr className="bg-base-200/60 text-base-content/70">
                  <th className="w-10 text-right">Sr</th>
                  <th>Company</th>
                  <th>Item</th>
                  <th className="text-right">Buy</th>
                  <th className="text-right">Free</th>
                  <th>Free item</th>
                  <th className="text-right">Price</th>
                  <th>Status</th>
                  <th className="w-40">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s, i) => (
                  <tr key={s.id} className={s.is_active ? "hover:bg-base-200/50" : "opacity-60 hover:bg-base-200/50"}>
                    <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                    <td className="text-xs">{s.company_name}</td>
                    <td className="max-w-64">
                      <div className="truncate font-medium">{s.item_name}</div>
                      <div className="truncate font-mono text-xs text-base-content/55">{s.product_erp_id}</div>
                      {s.note && <div className="truncate text-xs text-base-content/55">“{s.note}”</div>}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{s.buy_qty}</td>
                    <td className="text-right font-semibold tabular-nums text-success">+{s.free_qty}</td>
                    <td className="max-w-56 truncate text-xs">
                      {!s.free_product_erp_id || s.free_product_erp_id === s.product_erp_id ? "Same item" : s.free_item_name}
                    </td>
                    <td className="text-right tabular-nums">₹0</td>
                    <td>
                      {s.is_active ? (
                        <span className="badge badge-success badge-sm">Running</span>
                      ) : (
                        <span className="badge badge-ghost badge-sm">Stopped</span>
                      )}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs btn-square"
                        title="Edit"
                        disabled={String(s.company_id) !== String(companyId)}
                        onClick={() => { setEditError(""); setEditing({ id: s.id, form: fromScheme(s) }); }}
                      >
                        <MdEdit size={16} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setActive(s, !s.is_active)}>
                        {s.is_active ? "Stop" : (
                          <>
                            <MdCheck size={14} /> Start
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!companyId && schemes.length > 0 && (
          <p className="border-t border-base-300 px-4 py-2 text-xs text-base-content/55">Choose the company above to edit its schemes.</p>
        )}
      </section>

      {editing && (
        <EditDialog title="Edit free goods scheme" subtitle={company?.name} busy={editBusy} error={editError} onClose={() => setEditing(null)} onSubmit={saveEdit}>
          <SchemeFields
            form={editing.form}
            setForm={(fn) => setEditing((e) => ({ ...e, form: typeof fn === "function" ? fn(e.form) : fn }))}
            pickerItems={pickerItems}
            loading={loadingItems}
          />
        </EditDialog>
      )}
      {flashNode}
    </div>
  );
}
