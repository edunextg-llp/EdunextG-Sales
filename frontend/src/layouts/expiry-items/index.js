// Expiry Items: Tailwind CSS (no MUI). DMS upload loading, filters and expiry calculation unchanged.
import { useEffect, useMemo, useState } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { COMPANY_TYPES, useCompanyTypeLookup } from "utils/companyTypes";
import { Card, Field, Notice, PageHeader, SearchBox, StatBox, fieldClass } from "components/tw";

const API = (process.env.REACT_APP_API_URL);
const dayMs = 86400000;
const formatDate = (value) => {
  if (!value) return "—";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
};

const number = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const getExpiryQuantities = (item) => {
  const currentQty = Math.max(0, Number(item?.total_current_stock_in_pcs) || 0);
  const expiredQty = item?.expiry?.days < 0 ? currentQty : 0;
  return {
    currentQty,
    expiredQty,
    // Expiry Items is a monitoring report only. An expired date must not alter stock.
    qtyAfterExpiry: currentQty,
  };
};

const expiryDetails = (value) => {
  const expiry = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / dayMs);
  if (days < 0) return { days, label: "Expired", color: "#991b1b", bg: "#fee2e2" };
  if (days <= 30) return { days, label: "Expiring ≤30 Days", color: "#9a3412", bg: "#ffedd5" };
  if (days <= 90) return { days, label: "Expiring ≤90 Days", color: "#854d0e", bg: "#fef9c3" };
  return { days, label: "Valid", color: "#166534", bg: "#dcfce7" };
};

function ExpiryItems() {
  const [imports, setImports] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyType, setCompanyType] = useState("");
  const { matches: companyMatchesType } = useCompanyTypeLookup();
  const [selectedImportId, setSelectedImportId] = useState("");
  const [stockImport, setStockImport] = useState(null);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/staff/dms-stock/imports`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Unable to load DMS uploads.");
        setImports(data.imports || []);
      })
      .catch((fetchError) => setError(fetchError.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const query = selectedImportId ? `?importId=${selectedImportId}` : "";
    fetch(`${API}/staff/dms-stock${query}`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Unable to load expiry items.");
        setStockImport(data.import || null);
        setItems(data.items || []);
      })
      .catch((fetchError) => setError(fetchError.message))
      .finally(() => setLoading(false));
  }, [selectedImportId]);

  const companyOptions = useMemo(() => {
    const companies = new Map();
    imports.forEach((entry) => {
      if (entry.company_id && entry.company_name) companies.set(String(entry.company_id), entry.company_name);
    });
    return [...companies.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [imports]);

  const companyImports = useMemo(() => selectedCompanyId
    ? imports.filter((entry) => String(entry.company_id) === selectedCompanyId)
    : imports, [imports, selectedCompanyId]);

  const handleCompanyChange = (companyId) => {
    setSelectedCompanyId(companyId);
    const latestCompanyImport = companyId
      ? imports.find((entry) => String(entry.company_id) === String(companyId))
      : null;
    setSelectedImportId(latestCompanyImport ? String(latestCompanyImport.id) : "");
  };

  const expiryItems = useMemo(() => items
    .filter((item) => item.expiry_date)
    .map((item) => ({ ...item, expiry: expiryDetails(item.expiry_date) }))
    .filter((item) => {
      const query = search.trim().toLowerCase();
      const matchesSearch = !query || [
        item.product_erp_id,
        item.product_name,
        item.batch_number,
        item.invoice_number,
        stockImport?.invoice_number,
      ]
        .some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = status === "all"
        || (status === "expired" && item.expiry.days < 0)
        || (status === "30" && item.expiry.days >= 0 && item.expiry.days <= 30)
        || (status === "90" && item.expiry.days > 30 && item.expiry.days <= 90)
        || (status === "valid" && item.expiry.days > 90);
      return matchesSearch && matchesStatus;
    })
    .sort((left, right) => String(left.expiry_date).localeCompare(String(right.expiry_date))), [items, search, status, stockImport]);

  const typedCompanyOptions = companyOptions.filter((company) =>
    companyMatchesType(company, companyType)
  );
  const handleCompanyTypeChange = (type) => {
    setCompanyType(type);
    if (selectedCompanyId && type && !companyMatchesType(selectedCompanyId, type)) {
      handleCompanyChange("");
    }
  };

  const statusCounts = expiryItems.reduce((acc, item) => {
    if (item.expiry.days < 0) acc.expired += 1;
    else if (item.expiry.days <= 30) acc.d30 += 1;
    else if (item.expiry.days <= 90) acc.d90 += 1;
    return acc;
  }, { expired: 0, d30: 0, d90: 0 });
  const right = ["Days remaining", "Expired qty", "Current qty", "Qty after expiry"];

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader title="Expiry Items" description="Monitor expired and upcoming-expiry stock from each DMS upload. Expiry does not deduct current stock." />

        <Card className="mb-5">
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="Company type" width="w-full">
              <select className={fieldClass} value={companyType} onChange={(e) => handleCompanyTypeChange(e.target.value)}>
                <option value="">All types</option>
                {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </Field>
            <Field label="Company" width="w-full">
              <select className={fieldClass} value={selectedCompanyId} onChange={(e) => handleCompanyChange(e.target.value)}>
                <option value="">All companies</option>
                {typedCompanyOptions.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="DMS upload" width="w-full">
              <select className={fieldClass} value={selectedImportId} onChange={(e) => setSelectedImportId(e.target.value)}>
                {!selectedCompanyId && <option value="">Latest DMS upload</option>}
                {companyImports.map((entry) => (
                  <option key={entry.id} value={String(entry.id)}>
                    {formatDate(entry.upload_date)}{entry.company_name ? ` — ${entry.company_name}` : ""}{entry.invoice_number ? ` — Inv: ${entry.invoice_number}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expiry status" width="w-full">
              <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All expiry statuses</option>
                <option value="expired">Expired</option>
                <option value="30">Expiring within 30 days</option>
                <option value="90">Expiring within 90 days</option>
                <option value="valid">Valid over 90 days</option>
              </select>
            </Field>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search</span>
              <SearchBox value={search} onChange={setSearch} placeholder="Product, ERP or batch" className="w-full" />
            </div>
          </div>
        </Card>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatBox label="Shown" value={expiryItems.length} icon="inventory_2" />
          <StatBox label="Expired" value={statusCounts.expired} icon="dangerous" />
          <StatBox label="≤30 days" value={statusCounts.d30} icon="hourglass_bottom" />
          <StatBox label="31–90 days" value={statusCounts.d90} icon="schedule" />
          {stockImport && (
            <span className="ml-auto text-[12.5px] text-slate-500">
              DMS upload: <b className="text-slate-700">{formatDate(stockImport.upload_date || stockImport.created_at)}</b>{stockImport.company_name ? ` — ${stockImport.company_name}` : ""}
            </span>
          )}
        </div>
        {error && <Notice tone="error" className="mb-4">{error}</Notice>}

        <Card>
          {loading && <div className="h-1 w-full overflow-hidden bg-blue-100"><div className="h-full w-1/3 animate-pulse bg-blue-600" /></div>}
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full min-w-[1650px] border-collapse text-[12.5px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {["#", "Invoice no", "Invoice date", "ERP ID", "SKU name", "Company", "Variant", "Batch", "MFG date", "Expiry date", "Days remaining", "Status", "Expired qty", "Current qty", "Stock deduction", "Qty after expiry"].map((heading) => (
                    <th key={heading} className={`whitespace-nowrap px-3 py-2.5 ${right.includes(heading) ? "text-right" : "text-left"}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!loading && expiryItems.length === 0 && (
                  <tr><td colSpan={16} className="px-3 py-12 text-center text-[13px] text-slate-400">No expiry items match the selected filters.</td></tr>
                )}
                {expiryItems.map((item, index) => {
                  const quantities = getExpiryQuantities(item);
                  return (
                    <tr key={item.id} className="whitespace-nowrap border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-3 py-2 text-slate-400">{index + 1}</td>
                      <td className="px-3 py-2 font-mono">{item.invoice_number || stockImport?.invoice_number || "—"}</td>
                      <td className="px-3 py-2">{formatDate(item.upload_date || stockImport?.upload_date)}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{item.product_erp_id}</td>
                      <td className="min-w-52 whitespace-normal px-3 py-2 font-semibold text-slate-800">{item.product_name}</td>
                      <td className="px-3 py-2">{item.company_name || stockImport?.company_name || item.product_division || "N/A"}</td>
                      <td className="px-3 py-2">{item.variant_name || "—"}</td>
                      <td className="px-3 py-2">{item.batch_number || "—"}</td>
                      <td className="px-3 py-2">{formatDate(item.mfg_date)}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{formatDate(item.expiry_date)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.expiry.days < 0 ? `${Math.abs(item.expiry.days)} days ago` : `${item.expiry.days} days`}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: item.expiry.color, backgroundColor: item.expiry.bg }}>{item.expiry.label}</span>
                      </td>
                      <td className={`px-3 py-2 text-right font-bold tabular-nums ${quantities.expiredQty > 0 ? "text-red-700" : ""}`}>{number(quantities.expiredQty)}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{number(quantities.currentQty)}</td>
                      <td className="px-3 py-2">No</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{number(quantities.qtyAfterExpiry)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Footer />
    </DashboardLayout>
  );
}

export default ExpiryItems;
