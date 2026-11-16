import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdAdd, MdDeleteOutline, MdEdit, MdFileDownload, MdSearch, MdUploadFile } from "react-icons/md";
import { apiFetch } from "../auth";
import { downloadItemsExcel } from "../utils/itemExcel";
import { CompanyPicker, ConfirmDialog, EditDialog, ExcelButton, Field, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";

// Uses the same backend endpoints as the main site's Add Item page
// (frontend/src/layouts/add-item), so both screens stay in sync.

const GST_SLABS = ["0", "5", "12", "18", "28"];

const emptyForm = () => ({
  productErpId: "",
  skuName: "",
  variantName: "",
  hsnCode: "",
  gstPercent: "5",
  pcsPerBox: "",
});

// MySQL DECIMAL columns come back as text like "420.0000"; show them as 420.
const trimDecimal = (value) => {
  if (value == null || value === "") return "";
  const num = Number(value);
  return Number.isFinite(num) ? String(num) : String(value);
};

const pct = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? `${num}%` : "—";
};

const fromItem = (item) => ({
  productErpId: item.product_erp_id || "",
  skuName: item.sku_name || "",
  variantName: item.variant_name || "",
  hsnCode: item.hsn_code || "",
  gstPercent: item.gst_percent != null ? trimDecimal(item.gst_percent) : "5",
  pcsPerBox: item.pcs_per_box != null ? trimDecimal(item.pcs_per_box) : "",
});

const validate = (f) => {
  if (!f.productErpId.trim()) return "Product ERP ID is required.";
  if (!f.variantName.trim()) return "Variant name is required.";
  if (!String(f.gstPercent).trim() || Number.isNaN(Number(f.gstPercent)) || Number(f.gstPercent) < 0) {
    return "GST must be a valid percentage.";
  }
  if (!Number.isInteger(Number(f.pcsPerBox)) || Number(f.pcsPerBox) <= 0) {
    return "Pieces per box must be a whole number above zero.";
  }
  return "";
};

const toPayload = (f, companyId, sellerId) => ({
  companyId: Number(companyId),
  sellerId: Number(sellerId),
  productErpId: f.productErpId.trim(),
  skuName: f.skuName.trim(),
  variantName: f.variantName.trim(),
  hsnCode: f.hsnCode.trim().toUpperCase(),
  gstPercent: Number(f.gstPercent),
  pcsPerBox: Number(f.pcsPerBox),
});

function ItemFields({ form, setForm, disabled }) {
  const set = (field, upper) => (e) =>
    setForm((prev) => ({ ...prev, [field]: upper ? e.target.value.toUpperCase() : e.target.value }));
  const gst = Number(form.gstPercent);
  const half = Number.isFinite(gst) && gst >= 0 ? Number((gst / 2).toFixed(2)) : null;

  return (
    <fieldset disabled={disabled} className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 disabled:opacity-60">
      <Field label="Product ERP ID" required>
        <input className="input w-full font-mono" value={form.productErpId} onChange={set("productErpId")} />
      </Field>
      <Field label="HSN code">
        <input className="input w-full font-mono" value={form.hsnCode} onChange={set("hsnCode", true)} />
      </Field>
      <Field label="SKU name" className="sm:col-span-2">
        <input className="input w-full" value={form.skuName} onChange={set("skuName")} />
      </Field>
      <Field label="Variant name" required className="sm:col-span-2">
        <input className="input w-full" value={form.variantName} onChange={set("variantName")} />
      </Field>

      <Field
        label="GST %"
        required
        hint={
          <span className="text-xs text-base-content/50">
            {half != null ? `CGST ${half}% + SGST ${half}%` : "Enter a valid rate"}
          </span>
        }
      >
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            className="input w-20 shrink-0"
            value={form.gstPercent}
            onChange={set("gstPercent")}
          />
          <div className="join">
            {GST_SLABS.map((slab) => (
              <button
                key={slab}
                type="button"
                className={`btn join-item btn-sm h-10 px-2.5 font-normal ${
                  String(Number(form.gstPercent)) === slab ? "btn-primary" : "btn-outline field-border"
                }`}
                onClick={() => setForm((prev) => ({ ...prev, gstPercent: slab }))}
              >
                {slab}
              </button>
            ))}
          </div>
        </div>
      </Field>
      <Field label="Pieces in 1 box" required>
        <div className="input w-full">
          <input type="number" min="1" step="1" value={form.pcsPerBox} onChange={set("pcsPerBox")} />
          <span className="text-xs text-base-content/50">pcs</span>
        </div>
      </Field>
    </fieldset>
  );
}

function UploadPanel({ companyId, sellerId, onUploaded, showFlash }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  useEffect(reset, [sellerId]);

  const download = async () => {
    setBusy("template");
    setError("");
    try {
      const res = await apiFetch("/staff/seller-items/template");
      if (!res.ok) throw new Error((await readJson(res)).error || "Could not download the template.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "DMS_Add_Item_Template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const upload = async () => {
    const body = new FormData();
    body.append("companyId", companyId);
    body.append("sellerId", sellerId);
    body.append("file", file);
    setBusy("upload");
    setError("");
    try {
      const res = await apiFetch("/staff/seller-items/upload", { method: "POST", body });
      const data = await readJson(res);
      if (!res.ok) {
        const details = Array.isArray(data.details) ? ` ${data.details.join(" ")}` : "";
        throw new Error(`${data.error || "Upload failed."}${details}`);
      }
      showFlash(true, data.message || "Items uploaded.");
      reset();
      onUploaded();
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-3">
      <ol className="list-inside list-decimal space-y-1 text-sm text-base-content/70">
        <li>Download the template and fill one row per item.</li>
        <li>
          Columns: Product ERP ID, SKU Name, Variant Name, HSN Code, Pcs/Box. GST splits into CGST and SGST by
          itself.
        </li>
        <li>Pick the file and upload. Items go under the selected seller.</li>
      </ol>

      <button type="button" className="btn btn-soft btn-primary btn-sm" onClick={download} disabled={Boolean(busy)}>
        {busy === "template" ? <span className="loading loading-spinner loading-xs" /> : <MdFileDownload size={17} />}
        Download template
      </button>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={Boolean(busy)}
        className="flex w-full flex-col items-center gap-1 rounded-box border border-dashed border-base-300 bg-base-200/40 px-4 py-6 text-sm hover:border-primary hover:bg-base-200"
      >
        <MdUploadFile size={26} className="text-primary" />
        {file ? (
          <span className="font-medium break-all">{file.name}</span>
        ) : (
          <span className="text-base-content/60">Click to choose an .xls or .xlsx file</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx"
        className="hidden"
        onChange={(e) => {
          setFile(e.target.files?.[0] || null);
          setError("");
        }}
      />

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex justify-end gap-2">
        {file && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset} disabled={Boolean(busy)}>
            Remove file
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={upload} disabled={!file || Boolean(busy)}>
          {busy === "upload" && <span className="loading loading-spinner loading-xs" />}
          Upload items
        </button>
      </div>
    </div>
  );
}

export default function AddItem() {
  const companies = useCompanies();
  const [companyType, setCompanyType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [sellers, setSellers] = useState([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [sellerId, setSellerId] = useState("");

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [search, setSearch] = useState("");

  const [mode, setMode] = useState("single");
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showFlash, flashNode] = useFlash();

  // Sellers of the chosen company
  useEffect(() => {
    setSellerId("");
    setSellers([]);
    if (!companyId) return;
    setLoadingSellers(true);
    apiFetch(`/staff/purchase-sellers/company/${companyId}`)
      .then(readJson)
      .then((data) => setSellers(Array.isArray(data) ? data : []))
      .catch(() => setSellers([]))
      .finally(() => setLoadingSellers(false));
  }, [companyId]);

  const loadItems = useCallback(async () => {
    if (!companyId || !sellerId) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    try {
      const params = new URLSearchParams({ companyId, sellerId });
      const data = await readJson(await apiFetch(`/staff/seller-items?${params}`));
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [companyId, sellerId]);

  useEffect(() => {
    setForm(emptyForm());
    setFormError("");
    setSearch("");
    loadItems();
  }, [loadItems]);

  const company = companies.find((c) => String(c.id) === String(companyId));
  const seller = sellers.find((s) => String(s.id) === String(sellerId));
  const ready = Boolean(companyId && sellerId);

  const shownItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      [it.item_code, it.product_erp_id, it.sku_name, it.variant_name, it.hsn_code].some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [items, search]);

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
      const res = await apiFetch("/staff/seller-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form, companyId, sellerId)),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setFormError(data.error || "Could not add the item.");
        return;
      }
      showFlash(true, `${form.productErpId.trim()} added${data.item?.item_code ? ` as ${data.item.item_code}` : ""}.`);
      setForm(emptyForm());
      loadItems();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item) => {
    setEditing(item);
    setEditForm(fromItem(item));
    setEditError("");
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
      const res = await apiFetch(`/staff/seller-items/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(editForm, companyId, sellerId)),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setEditError(data.error || "Could not update the item.");
        return;
      }
      showFlash(true, `${editForm.productErpId.trim()} updated.`);
      setEditing(null);
      loadItems();
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/staff/seller-items/${toDelete.id}`, { method: "DELETE" });
      const data = await readJson(res);
      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.id !== toDelete.id));
        showFlash(true, `${toDelete.product_erp_id} deleted.`);
      } else {
        showFlash(false, data.error || "Could not delete the item.");
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
        <PageHeader eyebrow="Purchase masters" title="Items">
          Items belong to a seller. Pick the company and seller, then add items one at a time or upload an Excel
          sheet.
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
          <Field label="Seller" className="min-w-64 flex-1 sm:max-w-sm">
            <select
              className="select select-sm w-full"
              value={sellerId}
              disabled={!companyId || loadingSellers}
              onChange={(e) => setSellerId(e.target.value)}
            >
              <option value="">
                {!companyId
                  ? "Choose a company first"
                  : loadingSellers
                    ? "Loading sellers…"
                    : sellers.length
                      ? "Select seller"
                      : "No sellers for this company"}
              </option>
              {sellers.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.seller_name}
                  {s.seller_code ? ` (${s.seller_code})` : ""}
                </option>
              ))}
            </select>
          </Field>
        </CompanyPicker>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
          {/* Add panel */}
          <section className="self-start rounded-box border border-base-300 bg-base-100 xl:sticky xl:top-20">
            <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 pt-3">
              <div className="pb-3">
                <h2 className="font-semibold">New item</h2>
                <p className="text-xs text-base-content/60">
                  {seller ? `For ${seller.seller_name}` : "Select a seller above to start."}
                </p>
              </div>
              <div role="tablist" className="tabs tabs-border tabs-sm self-end">
                <button
                  type="button"
                  role="tab"
                  className={`tab ${mode === "single" ? "tab-active" : ""}`}
                  onClick={() => setMode("single")}
                >
                  One item
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`tab ${mode === "excel" ? "tab-active" : ""}`}
                  onClick={() => setMode("excel")}
                >
                  Excel upload
                </button>
              </div>
            </div>

            {mode === "single" ? (
              <form onSubmit={handleAdd}>
                <div className="p-4">
                  <ItemFields form={form} setForm={setForm} disabled={!ready} />
                  {formError && <p className="mt-3 text-sm text-error">{formError}</p>}
                </div>
                <div className="flex justify-end gap-2 border-t border-base-300 bg-base-200/50 px-4 py-3">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!ready || saving}
                    onClick={() => {
                      setForm(emptyForm());
                      setFormError("");
                    }}
                  >
                    Clear
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!ready || saving}>
                    {saving ? <span className="loading loading-spinner loading-xs" /> : <MdAdd size={18} />}
                    Save item
                  </button>
                </div>
              </form>
            ) : (
              <div className={`p-4 ${ready ? "" : "pointer-events-none opacity-60"}`}>
                <UploadPanel companyId={companyId} sellerId={sellerId} onUploaded={loadItems} showFlash={showFlash} />
              </div>
            )}
          </section>

          {/* Item list */}
          <section className="min-w-0 rounded-box border border-base-300 bg-base-100">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
              <h2 className="font-semibold">
                Item list
                {ready && !loadingItems && (
                  <span className="ml-2 text-sm font-normal text-base-content/60">
                    {items.length} for {seller?.seller_name} · {company?.name}
                  </span>
                )}
              </h2>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <label className="input input-sm w-full sm:w-64">
                  <MdSearch size={16} className="opacity-50" />
                  <input
                    type="search"
                    placeholder="Code, ERP ID, SKU, variant, HSN"
                    value={search}
                    disabled={!ready}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <ExcelButton
                  disabled={!ready || loadingItems || !items.length}
                  onError={() => showFlash(false, "Could not create the Excel file.")}
                  onExport={() => downloadItemsExcel(items, { company, seller })}
                />
              </div>
            </div>

            {!ready ? (
              <p className="px-4 py-12 text-center text-sm text-base-content/60">
                Items appear here once you pick a company and seller.
              </p>
            ) : loadingItems ? (
              <div className="flex justify-center py-12">
                <span className="loading loading-dots loading-md text-primary" />
              </div>
            ) : shownItems.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-base-content/60">
                {search ? `Nothing matches "${search}".` : "No items yet for this seller."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr className="bg-base-200/60 text-base-content/70">
                      <th className="w-12 text-right">Sr</th>
                      <th>Code</th>
                      <th>Item</th>
                      <th>ERP ID</th>
                      <th>HSN</th>
                      <th className="text-right">GST</th>
                      <th className="text-right">Box</th>
                      <th className="w-20">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownItems.map((it, index) => (
                      <tr key={it.id} className="hover:bg-base-200/50">
                        <td className="text-right tabular-nums text-base-content/50">{index + 1}</td>
                        <td className="whitespace-nowrap font-mono text-xs font-semibold text-primary">
                          {it.item_code || "—"}
                        </td>
                        <td>
                          <div className="font-medium">{it.variant_name || "—"}</div>
                          {it.sku_name && <div className="text-xs text-base-content/60">{it.sku_name}</div>}
                        </td>
                        <td className="whitespace-nowrap font-mono text-xs">{it.product_erp_id}</td>
                        <td className="font-mono text-xs">{it.hsn_code || "—"}</td>
                        <td className="whitespace-nowrap text-right">
                          <div>{pct(it.gst_percent)}</div>
                          <div className="text-xs text-base-content/50">
                            {pct(it.cgst_percent)} + {pct(it.sgst_percent)}
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {it.pcs_per_box ? `${Math.trunc(Number(it.pcs_per_box))} pcs` : "—"}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-square"
                            title="Edit"
                            onClick={() => openEdit(it)}
                          >
                            <MdEdit size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-square text-error"
                            title="Delete"
                            onClick={() => setToDelete(it)}
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
          title="Edit item"
          subtitle={[editing.item_code, editing.product_erp_id].filter(Boolean).join(" · ")}
          busy={savingEdit}
          error={editError}
          onClose={() => setEditing(null)}
          onSubmit={handleUpdate}
        >
          <ItemFields form={editForm} setForm={setEditForm} disabled={savingEdit} />
        </EditDialog>
      )}

      {toDelete && (
        <ConfirmDialog title="Delete item?" busy={deleting} onCancel={() => setToDelete(null)} onConfirm={handleDelete}>
          <b className="font-mono text-base-content">{toDelete.item_code || toDelete.product_erp_id}</b>
          {toDelete.variant_name && <span> ({toDelete.variant_name})</span>} will be removed from this seller. This
          can&apos;t be undone.
        </ConfirmDialog>
      )}

      {flashNode}
    </div>
  );
}
