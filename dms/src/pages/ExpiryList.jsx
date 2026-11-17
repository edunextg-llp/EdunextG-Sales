import { useCallback, useEffect, useMemo, useState } from "react";
import { MdRefresh, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { CompanyPicker, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";

// Expiry List: view only. Outlet-wise expiry records that staff entered on the main site
// (Expiry List there still adds / edits them). Same data: GET /staff/expiry-list.

const showDate = (value) => {
  if (!value) return "—";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const money = (value) => Number(value || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const qty = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function ExpiryList() {
  const [flash, flashNode] = useFlash();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const allCompanies = useCompanies();
  // CNF or Distributor is chosen first; nothing is listed until then.
  const [type, setType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/staff/expiry-list");
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Unable to load the expiry list.");
      setRecords(Array.isArray(body) ? body : []);
    } catch (err) {
      setRecords([]);
      flash(false, err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const typeOf = useMemo(() => new Map(allCompanies.map((c) => [String(c.id), c.type])), [allCompanies]);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!type) return [];
    return records.filter((r) => {
      if (typeOf.get(String(r.company_id)) !== type) return false;
      if (companyId && String(r.company_id) !== companyId) return false;
      if (!words.length) return true;
      const hay = [r.product_name, r.product_erp_id, r.outlet_name, r.location_name, r.staff_name, r.seller_name, r.invoice_number, r.batch_number]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [records, type, typeOf, companyId, search]);

  const totals = shown.reduce((t, r) => ({ qty: t.qty + (Number(r.qty) || 0), amount: t.amount + (Number(r.amount) || 0) }), { qty: 0, amount: 0 });
  const outlets = new Set(shown.map((r) => r.outlet_id || r.outlet_name)).size;

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Stock" title="Expiry List">
        Outlet-wise expiry records entered by staff. View only.
      </PageHeader>

      <CompanyPicker
        companies={allCompanies}
        type={type}
        onTypeChange={(t) => {
          setType(t);
          setCompanyId("");
        }}
        companyId={companyId}
        onCompanyChange={setCompanyId}
        allLabel="All companies"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Records", value: shown.length },
          { label: "Outlets", value: outlets },
          { label: "Total qty", value: qty(totals.qty) },
          { label: "Total amount", value: money(totals.amount), tone: "text-error" },
        ].map((t) => (
          <div key={t.label} className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
            <div className="text-xs text-base-content/60">{t.label}</div>
            <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${t.tone || ""}`}>{t.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <label className="input input-sm ml-auto w-72">
            <MdSearch size={16} className="opacity-50" />
            <input placeholder="Product, outlet, staff, invoice, batch" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading} title="Reload">
            <MdRefresh size={18} />
          </button>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center">
            <span className="loading loading-spinner loading-sm" />
          </p>
        ) : !type ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">Choose CNF or Distributor above to see expiry records.</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">No expiry records found.</p>
        ) : (
          <div className="max-h-[68vh] overflow-auto">
            <table className="table table-sm table-pin-rows whitespace-nowrap">
              <thead>
                <tr className="bg-base-200 text-base-content/70">
                  <th className="text-right">#</th>
                  <th>Product</th>
                  <th>Outlet</th>
                  <th>Staff</th>
                  <th>Seller</th>
                  <th>Company</th>
                  <th>Invoice</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.id} className="hover:bg-base-200/50">
                    <td className="text-right text-base-content/50">{i + 1}</td>
                    <td>
                      <div className="font-medium">{r.product_name}</div>
                      <div className="font-mono text-xs text-base-content/55">{r.product_erp_id || "Manual"}</div>
                    </td>
                    <td>
                      <div>{r.outlet_name}</div>
                      {r.location_name ? <div className="text-xs text-base-content/55">{r.location_name}</div> : null}
                    </td>
                    <td className="text-xs">{r.staff_name}</td>
                    <td className="text-xs">{r.seller_name}</td>
                    <td className="text-xs">{r.company_name}</td>
                    <td className="font-mono text-xs">{r.invoice_number}</td>
                    <td className="font-mono text-xs">{r.batch_number}</td>
                    <td className="text-xs font-semibold">{showDate(r.expiry_date)}</td>
                    <td className="text-right tabular-nums">{qty(r.qty)}</td>
                    <td className="text-right font-semibold tabular-nums">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {flashNode}
    </div>
  );
}
