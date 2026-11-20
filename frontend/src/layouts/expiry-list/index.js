// Expiry List / Damage List: Tailwind CSS (no MUI). Loading, add / edit and save logic unchanged.
import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { COMPANY_TYPES } from "utils/companyTypes";
import { Card, EmptyState, Field, Icon, Modal, PageHeader, SearchSelect, btn, fieldClass, td, th } from "components/tw";

const API = (process.env.REACT_APP_API_URL);
const emptyForm = () => ({ companyId: "", sellerId: "", staffId: "", area: "", outletId: "", productSource: "fetched",
  productErpId: "", productName: "", invoiceNumber: "", batchNumber: "", expiryDate: "", damageDescription: "", qty: "", amount: "" });
const formatDate = (value) => value ? String(value).slice(0, 10).split("-").reverse().join("-") : "—";

export default function ExpiryList({ mode = "expiry" }) {
  const isDamage = mode === "damage";
  const listPath = isDamage ? "damage-list" : "expiry-list";
  const [records, setRecords] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companyType, setCompanyType] = useState("");
  const [sellers, setSellers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const loadRecords = useCallback(async () => {
    const response = await fetch(`${API}/staff/${listPath}`);
    if (response.ok) setRecords(await response.json());
  }, [listPath]);
  useEffect(() => {
    loadRecords();
    fetch(`${API}/staff/companies`).then((r) => r.ok ? r.json() : []).then((data) => setCompanies(Array.isArray(data) ? data : []));
  }, [loadRecords]);

  const changeCompany = async (companyId) => {
    setForm((old) => ({ ...old, companyId, sellerId: "", staffId: "", area: "", outletId: "", productErpId: "", productName: "" }));
    setOutlets([]); setProducts([]); setSellers([]);
    if (!companyId) return setStaff([]);
    const [staffResponse, productResponse, sellerResponse] = await Promise.all([
      fetch(`${API}/staff?companyId=${companyId}`),
      fetch(`${API}/staff/dms-stock/product-search?companyId=${companyId}&search=`),
      fetch(`${API}/staff/purchase-sellers/company/${companyId}`),
    ]);
    setStaff(staffResponse.ok ? await staffResponse.json() : []);
    const productData = productResponse.ok ? await productResponse.json() : {};
    setProducts(productData.products || []);
    setSellers(sellerResponse.ok ? await sellerResponse.json() : []);
  };
  const changeStaff = async (staffId) => {
    setForm((old) => ({ ...old, staffId, area: "", outletId: "" }));
    if (!staffId) return setOutlets([]);
    const response = await fetch(`${API}/staff/${staffId}/all-counters`);
    setOutlets(response.ok ? await response.json() : []);
  };
  const areas = useMemo(() => [...new Set(outlets.map((o) => o.location_name).filter(Boolean))].sort(), [outlets]);
  const areaOutlets = useMemo(() => outlets.filter((o) => o.location_name === form.area), [outlets, form.area]);

  const editRecord = async (record) => {
    setCompanyType(companies.find((c) => String(c.id) === String(record.company_id))?.type || "");
    const [staffResponse, sellerResponse, outletResponse, productResponse] = await Promise.all([
      fetch(`${API}/staff?companyId=${record.company_id}`),
      fetch(`${API}/staff/purchase-sellers/company/${record.company_id}`),
      fetch(`${API}/staff/${record.staff_id}/all-counters`),
      fetch(`${API}/staff/dms-stock/product-search?companyId=${record.company_id}&search=`),
    ]);
    setStaff(staffResponse.ok ? await staffResponse.json() : []);
    setSellers(sellerResponse.ok ? await sellerResponse.json() : []);
    setOutlets(outletResponse.ok ? await outletResponse.json() : []);
    const productData = productResponse.ok ? await productResponse.json() : {};
    setProducts(productData.products || []);
    setForm({ companyId: String(record.company_id), sellerId: String(record.seller_id), staffId: String(record.staff_id),
      area: record.location_name || "", outletId: String(record.outlet_id), productSource: record.product_source || "manual",
      productErpId: record.product_erp_id || "", productName: record.product_name || "",
      invoiceNumber: record.invoice_number || "", batchNumber: record.batch_number || "",
      expiryDate: record.expiry_date || "", damageDescription: record.damage_description || "",
      qty: String(record.qty || ""), amount: String(record.amount ?? "") });
    setEditingId(record.id);
    setOpen(true);
  };

  const save = async () => {
    const issueDetailMissing = isDamage ? !form.damageDescription.trim() : !form.expiryDate;
    if (!form.companyId || !form.sellerId || !form.staffId || !form.area || !form.outletId || !form.productName.trim() || !form.invoiceNumber.trim() || !form.batchNumber.trim() || issueDetailMissing || !form.qty || form.amount === "") {
      alert("Please complete all required fields, including invoice and batch number."); return;
    }
    setSaving(true);
    try {
      const response = await fetch(editingId ? `${API}/staff/${listPath}/${editingId}` : `${API}/staff/${listPath}`, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, companyId: Number(form.companyId), staffId: Number(form.staffId),
          sellerId: Number(form.sellerId), outletId: Number(form.outletId), qty: Number(form.qty), amount: Number(form.amount) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return alert(data.error || "Unable to save expiry item.");
      setOpen(false); setEditingId(null); setForm(emptyForm()); setStaff([]); setOutlets([]); setProducts([]); await loadRecords();
    } finally { setSaving(false); }
  };

  const setField = (key) => (e) => setForm((o) => ({ ...o, [key]: e.target.value }));
  const label = isDamage ? "Damage" : "Expiry";

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title={isDamage ? "Damage List" : "Expiry List"}
          description={`Outlet-wise product ${isDamage ? "damage" : "expiry"} records.`}
          actions={(
            <button type="button" className={btn.primary} onClick={() => { setEditingId(null); setCompanyType(""); setForm(emptyForm()); setOpen(true); }}>
              <Icon name="add" className="text-[18px]" />Add {label}
            </button>
          )}
        />
        <Card>
          {!records.length ? (
            <EmptyState icon={isDamage ? "broken_image" : "event_busy"} text={`No ${isDamage ? "damage" : "expiry"} records added yet.`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["Company", "Seller", "Staff", "Area", "Outlet", "Invoice no", "Product", "Batch no", isDamage ? "Damage description" : "Expiry date", "Qty", "Amount", ""].map((h) => <th key={h} className={`${th} whitespace-nowrap`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                      <td className={`${td} whitespace-nowrap font-semibold text-slate-800`}>{r.company_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{r.seller_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{r.staff_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{r.location_name}</td>
                      <td className={`${td} whitespace-nowrap font-semibold text-slate-800`}>{r.outlet_name}</td>
                      <td className={`${td} whitespace-nowrap font-mono text-[12.5px]`}>{r.invoice_number}</td>
                      <td className={td}>
                        <span className="block font-semibold text-slate-800">{r.product_name}</span>
                        <span className="block font-mono text-[11.5px] text-slate-400">{r.product_erp_id || "Manual"}</span>
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{r.batch_number}</td>
                      <td className={`${td} ${isDamage ? "min-w-44" : "whitespace-nowrap font-semibold"}`}>{isDamage ? r.damage_description : formatDate(r.expiry_date)}</td>
                      <td className={`${td} tabular-nums`}>{Number(r.qty)}</td>
                      <td className={`${td} whitespace-nowrap font-semibold tabular-nums`}>₹{Number(r.amount).toFixed(2)}</td>
                      <td className={`${td} text-right`}>
                        <button type="button" className={`${btn.icon} hover:text-amber-700`} onClick={() => editRecord(r)} title="Edit" aria-label={`Edit ${r.product_name}`}>
                          <Icon name="edit" className="text-[19px]" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={open} onClose={() => setOpen(false)} locked={saving} size="lg" title={`${editingId ? "Edit" : "Add"} ${label}`}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={() => { setOpen(false); setEditingId(null); }} disabled={saving}>Cancel</button>
            <button type="button" className={btn.primary} onClick={save} disabled={saving}>{saving ? "Saving..." : `${editingId ? "Update" : "Save"} ${label}`}</button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Company type *" width="w-full">
            <select className={fieldClass} value={companyType} onChange={(e) => { const type = e.target.value; setCompanyType(type); const current = companies.find((c) => String(c.id) === String(form.companyId)); if (current && current.type !== type) changeCompany(""); }}>
              <option value="" disabled>Choose company type</option>
              {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Company *" width="w-full">
            <select className={fieldClass} disabled={!companyType} value={form.companyId} onChange={(e) => changeCompany(e.target.value)}>
              <option value="" disabled>Choose company</option>
              {companies.filter((c) => c.type === companyType || String(c.id) === String(form.companyId)).map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Seller *" width="w-full">
            <select className={fieldClass} disabled={!form.companyId} value={form.sellerId} onChange={(e) => setForm((old) => ({ ...old, sellerId: e.target.value }))}>
              <option value="" disabled>Choose seller</option>
              {sellers.map((seller) => <option key={seller.id} value={String(seller.id)}>{seller.seller_name}</option>)}
            </select>
          </Field>
          <Field label="Staff *" width="w-full">
            <select className={fieldClass} disabled={!form.companyId} value={form.staffId} onChange={(e) => changeStaff(e.target.value)}>
              <option value="" disabled>Choose staff</option>
              {staff.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Area *" width="w-full">
            <select className={fieldClass} disabled={!form.staffId} value={form.area} onChange={(e) => setForm((o) => ({ ...o, area: e.target.value, outletId: "" }))}>
              <option value="" disabled>Choose area</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Outlet *</span>
            <SearchSelect
              label="Search outlet" placeholder="Type outlet name or ERP ID" disabled={!form.area}
              options={areaOutlets.map((outlet) => ({ value: String(outlet.id), label: `${outlet.outlet_name || ""}${outlet.outlet_erp_id ? ` — ${outlet.outlet_erp_id}` : ""}` }))}
              value={form.outletId || null}
              onChange={(id) => setForm((old) => ({ ...old, outletId: id ? String(id) : "" }))}
            />
          </div>
          <Field label="Product source" width="w-full">
            <select className={fieldClass} value={form.productSource} onChange={(e) => setForm((o) => ({ ...o, productSource: e.target.value, productErpId: "", productName: "" }))}>
              <option value="fetched">Fetch product</option>
              <option value="manual">Manual entry</option>
            </select>
          </Field>
          {form.productSource === "manual" ? (
            <Field label="Product name *" width="w-full">
              <input className={fieldClass} value={form.productName} onChange={setField("productName")} />
            </Field>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Product *</span>
              <SearchSelect
                label="Choose product" placeholder="Choose product"
                options={products.map((p) => ({ value: String(p.product_erp_id), label: `${p.product_name || ""}${p.product_erp_id ? ` — ${p.product_erp_id}` : ""}` }))}
                value={form.productErpId ? String(form.productErpId) : null}
                onChange={(erpId) => {
                  const p = products.find((item) => String(item.product_erp_id) === String(erpId));
                  setForm((o) => ({ ...o, productName: p?.product_name || "", productErpId: p?.product_erp_id || "" }));
                }}
              />
            </div>
          )}
          <Field label="Invoice number *" width="w-full"><input className={fieldClass} value={form.invoiceNumber} onChange={setField("invoiceNumber")} /></Field>
          <Field label="Batch number *" width="w-full"><input className={fieldClass} value={form.batchNumber} onChange={setField("batchNumber")} /></Field>
          {isDamage ? (
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Damage description *</span>
              <textarea rows={3} className={`${fieldClass} h-auto py-2`} value={form.damageDescription} onChange={setField("damageDescription")} />
            </label>
          ) : (
            <Field label="Expiry date *" width="w-full"><input type="date" className={fieldClass} value={form.expiryDate} onChange={setField("expiryDate")} /></Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty *" width="w-full"><input type="number" min={0.01} step="any" className={fieldClass} value={form.qty} onChange={setField("qty")} /></Field>
            <Field label="Amount *" width="w-full"><input type="number" min={0} step="0.01" className={fieldClass} value={form.amount} onChange={setField("amount")} /></Field>
          </div>
        </div>
      </Modal>
      <Footer />
    </DashboardLayout>
  );
}

ExpiryList.propTypes = { mode: PropTypes.oneOf(["expiry", "damage"]) };
