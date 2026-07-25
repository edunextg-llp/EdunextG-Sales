import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Card from "@mui/material/Card";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = "https://bawarchee.edunextg.co/api";

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
    && entry.invoice_number
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
      <MDBox py={3}>
        <Card>
          <MDBox p={3}>
            <MDTypography variant="h5" fontWeight="bold">DMS Purchase History</MDTypography>
            <Grid container spacing={2} mt={0.5} mb={3}>
              <Grid item xs={12} md={4}>
                <MDTypography variant="caption" fontWeight="bold">Company</MDTypography>
                <FormControl fullWidth>
                  <Select displayEmpty value={companyId} onChange={(event) => selectCompany(event.target.value)}
                    sx={{ height: 56, backgroundColor: "#fff" }}>
                    <MenuItem value="">All Companies</MenuItem>
                    {companies.map((company) => <MenuItem key={company.id} value={String(company.id)}>{company.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <MDTypography variant="caption" fontWeight="bold">Seller</MDTypography>
                <FormControl fullWidth disabled={!companyId}>
                  <Select displayEmpty value={sellerId} onChange={(event) => setSellerId(event.target.value)}
                    sx={{ height: 56, backgroundColor: "#fff" }}>
                    <MenuItem value="">All Sellers</MenuItem>
                    {sellers.map((seller) => <MenuItem key={seller.id} value={String(seller.id)}>{seller.seller_name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table sx={{ minWidth: 1250 }}>
                <TableHead sx={{ display: "table-header-group", backgroundColor: "#f8fafc" }}>
                  <TableRow>
                    {["Sr", "Company Name", "Seller Name", "Invoice Number", "Invoice Date", "Total Item", "Amount", "CGST", "SGST", "Total Amount", "Action"].map((label) => (
                      <TableCell key={label} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((entry, index) => (
                    <TableRow key={entry.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{entry.company_name}</TableCell>
                      <TableCell>{entry.seller_name || "N/A"}</TableCell>
                      <TableCell>{entry.invoice_number}</TableCell>
                      <TableCell>{entry.upload_date}</TableCell>
                      <TableCell>{entry.row_count}</TableCell>
                      <TableCell>{money(entry.discounted_amount)}</TableCell>
                      <TableCell>{money(entry.total_cgst)}</TableCell>
                      <TableCell>{money(entry.total_sgst)}</TableCell>
                      <TableCell>{money(entry.total_value)}</TableCell>
                      <TableCell>
                        <MDButton color="info" variant="gradient" size="small" onClick={() => editInvoice(entry)}>
                          Edit
                        </MDButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!rows.length && (
                    <TableRow><TableCell colSpan={11} align="center">No invoices found.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </MDBox>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default DmsPurchaseHistory;
