// Current Stock: Tailwind CSS (no MUI). Stock loading and company filters unchanged.
import { useEffect, useState } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { COMPANY_TYPES, useCompanyTypeLookup } from "utils/companyTypes";
import { Card, Field, Icon, Notice, PageHeader, btn, fieldClass } from "components/tw";

const API = (process.env.REACT_APP_API_URL);

const numberFormat = (value, decimals = 2) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const unitFormat = (value) =>
  Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const money = (value) => `Rs. ${numberFormat(value)}`;

const formatDate = (value) => {
  if (!value) return "N/A";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatExpiredStockDate = (value) => {
  if (!value) return "N/A";
  const s = String(value).trim();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Expected DB format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [yStr, mStr, dStr] = s.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (m >= 1 && m <= 12) return `${d}-${months[m - 1]}-${String(y).slice(-2)}`;
  }

  // Fallback for other date strings
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return s;
  const d = dt.getDate();
  const m = dt.getMonth();
  const y = dt.getFullYear();
  return `${d}-${months[m]}-${String(y).slice(-2)}`;
};

function CurrentStock() {
  const [companies, setCompanies] = useState([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [companyType, setCompanyType] = useState("");
  const { matches: companyMatchesType, typeOf: companyTypeOf } = useCompanyTypeLookup();
  const [stockImport, setStockImport] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API}/staff/dms-stock/imports`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch companies.");
      const uniqueCompanies = [...new Map(
        (data.imports || [])
          .filter((entry) => entry.company_name)
          .map((entry) => [String(entry.company_name).trim().toLowerCase(), entry.company_name])
      ).values()].sort((left, right) => left.localeCompare(right));
      setCompanies(uniqueCompanies);
    } catch (fetchError) {
      setError(fetchError.message);
    }
  };

  const fetchCurrentStock = async (companyName = companyFilter) => {
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const query = companyName ? `?companyName=${encodeURIComponent(companyName)}` : "";
      const response = await fetch(`${API}/staff/current-stock${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch current stock.");
      setStockImport(data.import || null);
      setItems(data.items || []);
      if (!companyName && data.import?.company_name) setCompanyFilter(data.import.company_name);
      setMessage("Current stock calculated as Physical Stock minus DMS Stock.");
    } catch (fetchError) {
      setError(fetchError.message);
      setStockImport(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
    fetchCurrentStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCompanyChange = (event) => {
    const companyName = event.target.value;
    setCompanyFilter(companyName);
    fetchCurrentStock(companyName);
  };

  const typedCompanies = companies.filter((company) => companyMatchesType(company, companyType));

  const handleCompanyTypeChange = (type) => {
    setCompanyType(type);
    if (companyFilter && type && !companyMatchesType(companyFilter, type)) {
      const first = companies.find((company) => companyMatchesType(company, type));
      if (first) handleCompanyChange({ target: { value: first } });
      else setCompanyFilter("");
    }
  };

  // The latest upload's company is picked automatically; show its type too.
  useEffect(() => {
    if (companyFilter && !companyType) {
      const type = companyTypeOf(companyFilter);
      if (type) setCompanyType(type);
    }
  }, [companyFilter, companyType, companyTypeOf]);

  // First four columns stay in view when scrolling sideways.
  const STICKY = [
    ["w-14 min-w-14", "left-0"],
    ["w-36 min-w-36", "left-14"],
    ["w-60 min-w-60", "left-50"],
    ["w-36 min-w-36", "left-110"],
  ];
  const stickyCell = (index, head) => `sticky ${STICKY[index][1]} ${STICKY[index][0]} ${head ? "z-[3]" : "z-[1]"} ${head ? "bg-slate-50" : "bg-white group-hover:bg-slate-50"} ${index === 3 ? "shadow-[2px_0_0_#e2e8f0]" : ""}`;
  const groupHead = { physical: "bg-slate-100", dms: "bg-amber-50", current: "bg-blue-50" };
  const headCell = "whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const cell = "whitespace-nowrap px-3 py-2 text-[12.5px]";

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Current Stock"
          description="Automatically calculated from the latest DMS upload: Current Stock = Physical Stock minus DMS Stock."
          actions={(
            <button type="button" className={btn.outline} onClick={() => fetchCurrentStock()} disabled={loading}>
              <Icon name="refresh" className="text-[18px]" />{loading ? "Calculating..." : "Calculate"}
            </button>
          )}
        />
        {message && <Notice tone="success" className="mb-4" onClose={() => setMessage("")}>{message}</Notice>}
        {error && <Notice tone="error" className="mb-4">{error}</Notice>}

        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
            <Field label="Company type" width="w-48">
              <select className={fieldClass} value={companyType} onChange={(e) => handleCompanyTypeChange(e.target.value)}>
                <option value="">All types</option>
                {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </Field>
            <Field label="Company" width="w-60">
              <select className={fieldClass} value={companyFilter} onChange={handleCompanyChange}>
                <option value="" disabled>Select company</option>
                {typedCompanies.map((company) => <option key={company} value={company}>{company}</option>)}
              </select>
            </Field>
            <div className="ml-auto text-right text-[12px] text-slate-500">
              {stockImport && (
                <span className="block">
                  Latest DMS upload: <b className="text-slate-700">{formatDate(stockImport.dms_upload_date)}</b>
                  {stockImport.company_name ? ` - ${stockImport.company_name}` : ""}
                  {stockImport.dms_file_name ? ` (${stockImport.dms_file_name})` : ""}
                </span>
              )}
              <span className="mt-1 inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-slate-200" />Physical</span>
                <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-amber-200" />DMS</span>
                <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-blue-300" />Current (calculated)</span>
              </span>
            </div>
          </div>
          {loading && <div className="h-1 w-full overflow-hidden bg-blue-100"><div className="h-full w-1/3 animate-pulse bg-blue-600" /></div>}
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1950px] border-separate border-spacing-0">
              <thead className="sticky top-0 z-[2]">
                <tr>
                  <th className={`${headCell} ${stickyCell(0, true)} text-left`}>#</th>
                  <th className={`${headCell} ${stickyCell(1, true)} text-left`}>Product ERP ID</th>
                  <th className={`${headCell} ${stickyCell(2, true)} text-left`}>SKU name</th>
                  <th className={`${headCell} ${stickyCell(3, true)} text-left`}>Product division</th>
                  <th className={`${headCell} bg-slate-50 text-left`}>Variant name</th>
                  <th className={`${headCell} bg-slate-50 text-right`}>Pcs/box</th>
                  <th className={`${headCell} bg-slate-50 text-left`}>Expired stock</th>
                  {["Physical case", "Physical pcs", "Physical total pcs"].map((h) => <th key={h} className={`${headCell} ${groupHead.physical} text-right`}>{h}</th>)}
                  {["DMS case", "DMS pcs", "DMS total pcs"].map((h) => <th key={h} className={`${headCell} ${groupHead.dms} text-right`}>{h}</th>)}
                  {["Current case", "Current pcs", "Current total pcs"].map((h) => <th key={h} className={`${headCell} ${groupHead.current} text-right text-blue-800`}>{h}</th>)}
                  <th className={`${headCell} bg-slate-50 text-right`}>Price/pcs</th>
                  <th className={`${headCell} ${groupHead.current} text-right text-blue-800`}>Current value</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={18} className="px-3 py-12 text-center text-[13px] text-slate-400">No current stock is available for the latest DMS upload.</td></tr>
                )}
                {items.map((item, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={`${item.product_erp_id}-${index}`} className="group">
                    <td className={`${cell} ${stickyCell(0)} border-t border-slate-100 text-slate-400`}>{index + 1}</td>
                    <td className={`${cell} ${stickyCell(1)} border-t border-slate-100 font-mono`}>{item.product_erp_id}</td>
                    <td className={`${cell} ${stickyCell(2)} max-w-60 truncate border-t border-slate-100 font-semibold text-slate-800`} title={item.product_name}>{item.product_name}</td>
                    <td className={`${cell} ${stickyCell(3)} border-t border-slate-100`}>{item.product_division}</td>
                    <td className={`${cell} border-t border-slate-100 group-hover:bg-slate-50`}>{item.variant_name}</td>
                    <td className={`${cell} border-t border-slate-100 text-right tabular-nums group-hover:bg-slate-50`}>{unitFormat(item.pcs_per_box)}</td>
                    <td className={`${cell} border-t border-slate-100 group-hover:bg-slate-50`}>{formatExpiredStockDate(item.expired_stock_date)}</td>
                    {[item.physical_stock_in_case, item.physical_stock_in_pcs, item.total_physical_stock_in_pcs].map((v, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <td key={`p${i}`} className={`${cell} border-t border-slate-100 bg-slate-50/70 text-right tabular-nums`}>{unitFormat(v)}</td>
                    ))}
                    {[item.dms_stock_in_case, item.dms_stock_in_pcs, item.total_dms_stock_in_pcs].map((v, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <td key={`d${i}`} className={`${cell} border-t border-slate-100 bg-amber-50/60 text-right tabular-nums`}>{unitFormat(v)}</td>
                    ))}
                    {[item.current_stock_in_case, item.current_stock_in_pcs, item.total_current_stock_in_pcs].map((v, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <td key={`c${i}`} className={`${cell} border-t border-slate-100 bg-blue-50/70 text-right font-bold tabular-nums text-blue-900`}>{unitFormat(v)}</td>
                    ))}
                    <td className={`${cell} border-t border-slate-100 text-right tabular-nums group-hover:bg-slate-50`}>{money(item.price_per_piece)}</td>
                    <td className={`${cell} border-t border-slate-100 bg-blue-50/70 text-right font-bold tabular-nums text-blue-900`}>{money(item.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Footer />
    </DashboardLayout>
  );
}

export default CurrentStock;
