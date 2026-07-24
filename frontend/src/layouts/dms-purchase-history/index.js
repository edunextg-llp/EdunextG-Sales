import { useEffect, useMemo, useState } from "react";

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
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = "http://localhost:5001/api";
const money = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})}`;
const number = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 4 });
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

function Metric({ label, value }) {
  return (
    <MDBox p={2} border="1px solid #e5e7eb" borderRadius="8px" bgcolor="#fff">
      <MDTypography variant="caption" color="text">{label}</MDTypography>
      <MDTypography variant="h6" fontWeight="bold">{value}</MDTypography>
    </MDBox>
  );
}

function DmsPurchaseHistory() {
  const [companies, setCompanies] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [imports, setImports] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [importId, setImportId] = useState("");
  const [stockImport, setStockImport] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/staff/companies`, { headers: headers() }).then((response) => response.json()),
      fetch(`${API}/staff/dms-stock/imports`).then((response) => response.json()),
    ]).then(([companyRows, importData]) => {
      setCompanies(Array.isArray(companyRows) ? companyRows : []);
      setImports(importData.imports || []);
    });
  }, []);

  const chooseCompany = async (value) => {
    setCompanyId(value);
    setSellerId("");
    setImportId("");
    setStockImport(null);
    setItems([]);
    if (!value) return setSellers([]);
    const response = await fetch(`${API}/staff/purchase-sellers/company/${value}`, { headers: headers() });
    const data = await response.json();
    setSellers(Array.isArray(data) ? data : []);
  };

  const chooseInvoice = async (value) => {
    setImportId(value);
    if (!value) {
      setStockImport(null);
      return setItems([]);
    }
    const response = await fetch(`${API}/staff/dms-stock?importId=${value}`);
    const data = await response.json();
    setStockImport(data.import || null);
    setItems(data.items || []);
  };

  const invoiceOptions = imports.filter((entry) => (
    String(entry.company_id) === String(companyId)
    && String(entry.seller_id) === String(sellerId)
    && entry.invoice_number
  ));

  const totals = useMemo(() => items.reduce((sum, item) => {
    const dpTotal = Number(item.dp_price || 0) * Number(item.total_pieces || 0);
    const discounted = dpTotal * (1 - (Number(item.discount_percent || 0) / 100));
    return {
      quantity: sum.quantity + Number(item.total_pieces || 0),
      discounted: sum.discounted + discounted,
      cgst: sum.cgst + Number(item.cgst_amount || 0),
      sgst: sum.sgst + Number(item.sgst_amount || 0),
      total: sum.total + Number(item.total_value || 0),
    };
  }, { quantity: 0, discounted: 0, cgst: 0, sgst: 0, total: 0 }), [items]);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={3}>
            <MDTypography variant="h5" fontWeight="bold">DMS Purchase History</MDTypography>
            <Grid container spacing={2} mt={0.5}>
              {[
                ["Company", companyId, chooseCompany, companies, "name"],
                ["Seller", sellerId, (value) => { setSellerId(value); setImportId(""); setItems([]); }, sellers, "seller_name"],
              ].map(([label, value, change, options, name]) => (
                <Grid item xs={12} md={3} key={label}>
                  <MDTypography variant="caption" fontWeight="bold">{label}</MDTypography>
                  <FormControl fullWidth size="small">
                    <Select displayEmpty value={value} onChange={(event) => change(event.target.value)}>
                      <MenuItem value="">Select {label}</MenuItem>
                      {options.map((option) => <MenuItem key={option.id} value={String(option.id)}>{option[name]}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              ))}
              <Grid item xs={12} md={3}>
                <MDTypography variant="caption" fontWeight="bold">Invoice Number</MDTypography>
                <FormControl fullWidth size="small" disabled={!sellerId}>
                  <Select displayEmpty value={importId} onChange={(event) => chooseInvoice(event.target.value)}>
                    <MenuItem value="">Select Invoice</MenuItem>
                    {invoiceOptions.map((entry) => (
                      <MenuItem key={entry.id} value={String(entry.id)}>
                        {entry.invoice_number} — {entry.upload_date}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {stockImport && (
              <>
                <Grid container spacing={2} mt={1}>
                  <Grid item xs={6} md={2}><Metric label="Total Items" value={items.length} /></Grid>
                  <Grid item xs={6} md={2}><Metric label="Total Quantity" value={number(totals.quantity)} /></Grid>
                  <Grid item xs={6} md={2}><Metric label="Discounted Amount" value={money(totals.discounted)} /></Grid>
                  <Grid item xs={6} md={2}><Metric label="CGST" value={money(totals.cgst)} /></Grid>
                  <Grid item xs={6} md={2}><Metric label="SGST" value={money(totals.sgst)} /></Grid>
                  <Grid item xs={6} md={2}><Metric label="Total Amount" value={money(totals.total)} /></Grid>
                </Grid>
                <TableContainer sx={{ mt: 3, overflowX: "auto" }}>
                  <Table size="small" sx={{ minWidth: 1700 }}>
                    <TableHead sx={{ display: "table-header-group" }}>
                      <TableRow>
                        {["ERP ID", "Item", "Variant", "Batch", "MFG", "Expiry", "Qty", "MRP", "DP", "Discount", "Discount Price", "CGST", "SGST", "Total"].map((label) => (
                          <TableCell key={label} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{label}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((item) => {
                        const price = Number(item.dp_price) * Number(item.total_pieces);
                        const discounted = price * (1 - Number(item.discount_percent) / 100);
                        return (
                          <TableRow key={item.id}>
                            <TableCell>{item.product_erp_id}</TableCell><TableCell>{item.product_name}</TableCell>
                            <TableCell>{item.variant_name}</TableCell><TableCell>{item.batch_number}</TableCell>
                            <TableCell>{item.mfg_date}</TableCell><TableCell>{item.expiry_date}</TableCell>
                            <TableCell>{number(item.total_pieces)}</TableCell><TableCell>{money(item.mrp)}</TableCell>
                            <TableCell>{money(item.dp_price)}</TableCell><TableCell>{number(item.discount_percent)}%</TableCell>
                            <TableCell>{money(discounted)}</TableCell><TableCell>{money(item.cgst_amount)}</TableCell>
                            <TableCell>{money(item.sgst_amount)}</TableCell><TableCell>{money(item.total_value)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </MDBox>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default DmsPurchaseHistory;
