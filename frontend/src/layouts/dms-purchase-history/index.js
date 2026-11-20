// DMS Purchase History: Tailwind CSS (no MUI). Loading, filters and "Edit" (opens the invoice in Item List) unchanged.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { COMPANY_TYPES } from "utils/companyTypes";
import { Card, EmptyState, Field, Icon, PageHeader, btn, fieldClass, td, th } from "components/tw";

const API = (process.env.REACT_APP_API_URL);

const DRAFT_KEY = "dms-manual-stock-draft";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 4, maximumFractionDigits: 4,
})}`;

const pendingItem = (item) => ({
  id: `invoice-item-${item.id}`,
  sourceDmsItemId: item.id,
  productErpId: item.product_erp_id || "",
  productName: item.product_name || "",
  variantName: item.variant_name || "",
  pcsPerBox: String(item.pcs_per_box || ""),
  currentStockInCase: String(item.current_stock_in_case || ""),
  currentStockInPcs: String(item.current_stock_in_pcs || ""),
  totalCurrentStockInPcs: String(item.total_current_stock_in_pcs || ""),
  batchNumber: item.batch_number || "",
  mfgDate: item.mfg_date || "",
  expiryDate: item.expiry_date || "",
  mrp: String(item.mrp || ""),
  dpPrice: String(item.dp_price || ""),
  discountPercent: String(item.discount_percent || 0),
  gstPercent: "5",
  cgstAmount: String(item.cgst_amount || ""),
  sgstAmount: String(item.sgst_amount || ""),
  totalValue: Number(item.total_value || 0).toFixed(4),
  retailPrice: String(item.retail_price || ""),
  wholesalePrice: String(item.wholesale_price || ""),
  retailMargin: String(item.retail_margin || ""),
  wholesaleMargin: String(item.wholesale_margin || ""),
  pricePerPiece: String(item.dp_price || ""),
  purchasePrice: String(item.dp_price || ""),
  isUpdate: true,
});

function DmsPurchaseHistory() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [imports, setImports] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [sellerId, setSellerId] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/staff/companies`, { headers: authHeaders() }).then((response) => response.json()),
      fetch(`${API}/staff/dms-stock/imports`).then((response) => response.json()),
    ]).then(([companyRows, importData]) => {
      setCompanies(Array.isArray(companyRows) ? companyRows : []);
      setImports(importData.imports || []);
    });
  }, []);

  const selectCompany = async (value) => {
    setCompanyId(value);
    setSellerId("");
    if (!value) return setSellers([]);
    const response = await fetch(`${API}/staff/purchase-sellers/company/${value}`, {
      headers: authHeaders(),
    });
    const data = await response.json();
    setSellers(Array.isArray(data) ? data : []);
  };

  const rows = useMemo(() => imports.filter((entry) => (
    (!companyId || String(entry.company_id) === String(companyId))
    && (!sellerId || String(entry.seller_id) === String(sellerId))
    && entry.seller_id
  )), [companyId, imports, sellerId]);

  const editInvoice = async (entry) => {
    const response = await fetch(`${API}/staff/dms-stock?importId=${entry.id}`);
    const data = await response.json();
    if (!response.ok) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      manualCompanyId: String(entry.company_id),
      manualSellerId: String(entry.seller_id),
      manualUploadDate: entry.upload_date,
      manualInvoiceNumber: entry.invoice_number,
      selectedSellerItemId: "",
      manualItem: null,
      pendingItems: (data.items || []).map(pendingItem),
    }));
    navigate("/dms-stock");
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader title="DMS Purchase History" description="Purchase invoices saved through Item List. Edit opens the invoice in Item List." />
        <Card>
          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 md:grid-cols-3">
            <Field label="Company type" width="w-full">
              <select
                className={fieldClass} value={companyType}
                onChange={(event) => {
                  const type = event.target.value;
                  setCompanyType(type);
                  const current = companies.find((company) => String(company.id) === String(companyId));
                  if (current && type && current.type !== type) selectCompany("");
                }}
              >
                <option value="">All types</option>
                {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </Field>
            <Field label="Company" width="w-full">
              <select className={fieldClass} value={companyId} onChange={(event) => selectCompany(event.target.value)}>
                <option value="">All companies</option>
                {companies.filter((company) => !companyType || company.type === companyType).map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Seller" width="w-full">
              <select className={fieldClass} value={sellerId} disabled={!companyId} onChange={(event) => setSellerId(event.target.value)}>
                <option value="">All sellers</option>
                {sellers.map((seller) => <option key={seller.id} value={String(seller.id)}>{seller.seller_name}</option>)}
              </select>
            </Field>
          </div>
          {!rows.length ? (
            <EmptyState icon="receipt_long" text="No invoices found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["#", "Company", "Seller", "Invoice number", "Invoice date", "Total items"].map((label) => <th key={label} className={`${th} whitespace-nowrap`}>{label}</th>)}
                    {["Amount", "CGST", "SGST", "Total amount"].map((label) => <th key={label} className={`${th} whitespace-nowrap text-right`}>{label}</th>)}
                    <th className={th} aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry, index) => (
                    <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className={`${td} text-slate-400`}>{index + 1}</td>
                      <td className={`${td} font-semibold text-slate-800`}>{entry.company_name}</td>
                      <td className={td}>{entry.seller_name || "N/A"}</td>
                      <td className={`${td} font-mono text-[12.5px] font-semibold`}>{entry.invoice_number}</td>
                      <td className={`${td} whitespace-nowrap`}>{entry.upload_date}</td>
                      <td className={`${td} tabular-nums`}>{entry.row_count}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{money(entry.discounted_amount)}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{money(entry.total_cgst)}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{money(entry.total_sgst)}</td>
                      <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums text-slate-900`}>{money(entry.total_value)}</td>
                      <td className={`${td} text-right`}>
                        <button type="button" className={`${btn.outline} h-8 px-3`} onClick={() => editInvoice(entry)}>
                          <Icon name="edit" className="text-[16px]" />Edit
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
      <Footer />
    </DashboardLayout>
  );
}

export default DmsPurchaseHistory;
