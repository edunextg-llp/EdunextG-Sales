import { useEffect, useMemo, useState } from "react";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { FaRegEdit } from "react-icons/fa";
import { CiTrash } from "react-icons/ci";

const emptyForm = () => ({
  companyId: "",
  sellerName: "",
  address: "",
  city: "",
  state: "",
  gstin: "",
  panNo: "",
  pinCode: "",
  fssaiNumber: "",
  invoiceNumber: "",
  ewayBillNo: "",
  ewayBillDate: "",
  invoiceDate: "",
  salesOrderNumber: "",
  grossAmount: "",
  traderDiscountValue: "",
  primaryDiscountValue: "",
  secondaryDiscountValue: "",
  cashDiscountValue: "",
  taxableValue: "",
  cgstAmount: "",
  sgstAmount: "",
});

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const numberValue = (value) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatAmountInput = (value) => Number(value || 0).toFixed(2);

const normalizeAmountInput = (value) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? "" : parsed.toFixed(2);
};

const tableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "none",
  borderBottom: "1px solid #e5e7eb",
  px: 2,
  py: 1.5,
  whiteSpace: "nowrap",
};

const tableBodySx = {
  px: 2,
  py: 1.5,
  verticalAlign: "middle",
};

function Purchase() {
  const [form, setForm] = useState(emptyForm());
  const [purchases, setPurchases] = useState([]);
  const [sellerDirectory, setSellerDirectory] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [gstManuallyEdited, setGstManuallyEdited] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const API = "https://bawarchee.edunextg.co/api";

  const totals = useMemo(() => {
    const grossAmount = numberValue(form.grossAmount);
    const traderDiscountValue = numberValue(form.traderDiscountValue);
    const primaryDiscountValue = numberValue(form.primaryDiscountValue);
    const secondaryDiscountValue = numberValue(form.secondaryDiscountValue);
    const cashDiscountValue = numberValue(form.cashDiscountValue);
    const totalDiscount =
      traderDiscountValue + primaryDiscountValue + secondaryDiscountValue + cashDiscountValue;
    const taxableValue = Math.max(grossAmount - totalDiscount, 0);
    const cgstAmount = numberValue(form.cgstAmount);
    const sgstAmount = numberValue(form.sgstAmount);
    const totalGstAmount = cgstAmount + sgstAmount;
    const invoiceTotal = taxableValue + totalGstAmount;
    const roundedTotal = Math.round(invoiceTotal);
    const roundOff = roundedTotal - invoiceTotal;

    return {
      taxableValue,
      totalGstAmount,
      roundOff,
      roundedTotal,
    };
  }, [form]);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleGstChange = (field, value) => {
    setGstManuallyEdited(true);
    handleChange(field, value);
  };

  const handleAmountBlur = (field) => {
    setForm((prev) => ({
      ...prev,
      [field]: normalizeAmountInput(prev[field]),
    }));
  };

  useEffect(() => {
    if (gstManuallyEdited) return;

    const splitGstAmount = totals.taxableValue * 0.05;
    setForm((prev) => {
      const nextGstValue = splitGstAmount > 0 ? formatAmountInput(splitGstAmount) : "";
      if (prev.cgstAmount === nextGstValue && prev.sgstAmount === nextGstValue) {
        return prev;
      }
      return {
        ...prev,
        cgstAmount: nextGstValue,
        sgstAmount: nextGstValue,
      };
    });
  }, [gstManuallyEdited, totals.taxableValue]);

  const fetchSellers = async (search = "") => {
    setLoadingSellers(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`${API}/staff/purchase-sellers?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setSellerDirectory(
          data.map((seller) => ({
            id: seller.id,
            sellerName: seller.seller_name || "",
            address: seller.address || "",
            city: seller.city || "",
            state: seller.state || "",
            gstin: seller.gstin || "",
            panNo: seller.pan_no || "",
            pinCode: seller.pin_code || seller.in_code || "",
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching purchase sellers:", error);
    } finally {
      setLoadingSellers(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API}/staff/companies`);
      if (response.ok) setCompanies(await response.json());
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  const mapPurchaseFromApi = (purchase) => ({
    id: purchase.id,
    companyId: purchase.company_id ? String(purchase.company_id) : "",
    companyName: purchase.company_name || "",
    sellerName: purchase.seller_name || "",
    address: purchase.address || "",
    city: purchase.city || "",
    state: purchase.state || "",
    gstin: purchase.gstin || "",
    panNo: purchase.pan_no || "",
    pinCode: purchase.pin_code || purchase.in_code || "",
    invoiceNumber: purchase.invoice_number || "",
    ewayBillNo: purchase.eway_bill_no || "",
    ewayBillDate: purchase.eway_bill_date || "",
    invoiceDate: purchase.invoice_date || "",
    salesOrderNumber: purchase.sales_order_number || "",
    fssaiNumber: purchase.fssai_number || "",
    grossAmount: purchase.gross_amount,
    traderDiscountValue: purchase.trader_discount_value,
    primaryDiscountValue: purchase.primary_discount_value,
    secondaryDiscountValue: purchase.secondary_discount_value,
    cashDiscountValue: purchase.cash_discount_value,
    taxableValue: purchase.taxable_value,
    cgstAmount: purchase.cgst_amount,
    sgstAmount: purchase.sgst_amount,
    totalGstAmount: purchase.total_gst_amount,
    roundOff: purchase.round_off,
    roundedTotal: purchase.rounded_total,
  });

  const fetchPurchases = async () => {
    try {
      const response = await fetch(`${API}/staff/purchases`);
      if (response.ok) {
        const data = await response.json();
        setPurchases(data.map(mapPurchaseFromApi));
      }
    } catch (error) {
      console.error("Error fetching purchases:", error);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchSellers();
    fetchCompanies();
    fetchPurchases();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fillSellerDetails = (seller) => {
    if (!seller) return;
    setForm((prev) => ({
      ...prev,
      sellerName: seller.sellerName || "",
      address: seller.address || "",
      city: seller.city || "",
      state: seller.state || "",
      gstin: seller.gstin || "",
      panNo: seller.panNo || "",
      pinCode: seller.pinCode || "",
    }));
  };

  const handleReset = () => {
    setForm(emptyForm());
    setGstManuallyEdited(false);
    setEditingPurchaseId(null);
  };

  const openAddPurchaseModal = () => {
    handleReset();
    setPurchaseModalOpen(true);
  };

  const closePurchaseModal = () => {
    setPurchaseModalOpen(false);
    handleReset();
  };

  const buildPurchasePayload = () => ({
    companyId: Number(form.companyId),
    sellerName: form.sellerName.trim(),
    address: form.address.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    gstin: form.gstin.trim().toUpperCase(),
    panNo: form.panNo.trim().toUpperCase(),
    pinCode: form.pinCode.trim(),
    inCode: form.pinCode.trim(),
    invoiceNumber: form.invoiceNumber.trim(),
    ewayBillNo: form.ewayBillNo.trim(),
    ewayBillDate: form.ewayBillDate || null,
    invoiceDate: form.invoiceDate || null,
    salesOrderNumber: form.salesOrderNumber.trim(),
    fssaiNumber: form.fssaiNumber.trim(),
    grossAmount: form.grossAmount || 0,
    traderDiscountValue: form.traderDiscountValue || 0,
    primaryDiscountValue: form.primaryDiscountValue || 0,
    secondaryDiscountValue: form.secondaryDiscountValue || 0,
    cashDiscountValue: form.cashDiscountValue || 0,
    cgstAmount: form.cgstAmount || 0,
    sgstAmount: form.sgstAmount || 0,
  });

  const savePurchaseToDb = async () => {
    const isEditing = Boolean(editingPurchaseId);
    const response = await fetch(
      isEditing ? `${API}/staff/purchases/${editingPurchaseId}` : `${API}/staff/purchases`,
      {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPurchasePayload()),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to save purchase.");
    }

    const data = await response.json();
    const purchase = data.purchase ? mapPurchaseFromApi(data.purchase) : null;
    if (purchase) {
      setSellerDirectory((prev) => {
        const nextSeller = {
          id: data.purchase.seller_id || purchase.sellerName,
          sellerName: purchase.sellerName,
          address: purchase.address,
          city: purchase.city,
          state: purchase.state,
          gstin: purchase.gstin,
          panNo: purchase.panNo,
          pinCode: purchase.pinCode,
        };
        return [
          nextSeller,
          ...prev.filter((item) => item.id !== nextSeller.id && item.sellerName !== nextSeller.sellerName),
        ];
      });
    }
    return purchase;
  };

  const handleSave = async () => {
    if (!form.companyId) {
      alert("Company is required.");
      return;
    }
    if (!form.sellerName.trim()) {
      alert("Seller name is required.");
      return;
    }
    if (!form.invoiceNumber.trim()) {
      alert("Invoice number is required.");
      return;
    }

    let savedPurchase;
    try {
      savedPurchase = await savePurchaseToDb();
    } catch (error) {
      alert(error.message);
      return;
    }

    if (savedPurchase) {
      setPurchases((prev) =>
        editingPurchaseId
          ? prev.map((purchase) => (purchase.id === savedPurchase.id ? savedPurchase : purchase))
          : [savedPurchase, ...prev]
      );
    }
    closePurchaseModal();
  };

  const handleEditPurchase = (purchase) => {
    setEditingPurchaseId(purchase.id);
    setGstManuallyEdited(true);
    setForm({
      companyId: purchase.companyId || "",
      sellerName: purchase.sellerName || "",
      address: purchase.address || "",
      city: purchase.city || "",
      state: purchase.state || "",
      gstin: purchase.gstin || "",
      panNo: purchase.panNo || "",
      pinCode: purchase.pinCode || "",
      invoiceNumber: purchase.invoiceNumber || "",
      ewayBillNo: purchase.ewayBillNo || "",
      ewayBillDate: purchase.ewayBillDate || "",
      invoiceDate: purchase.invoiceDate || "",
      salesOrderNumber: purchase.salesOrderNumber || "",
      fssaiNumber: purchase.fssaiNumber || "",
      grossAmount: normalizeAmountInput(purchase.grossAmount),
      traderDiscountValue: normalizeAmountInput(purchase.traderDiscountValue),
      primaryDiscountValue: normalizeAmountInput(purchase.primaryDiscountValue),
      secondaryDiscountValue: normalizeAmountInput(purchase.secondaryDiscountValue),
      cashDiscountValue: normalizeAmountInput(purchase.cashDiscountValue),
      taxableValue: normalizeAmountInput(purchase.taxableValue),
      cgstAmount: normalizeAmountInput(purchase.cgstAmount),
      sgstAmount: normalizeAmountInput(purchase.sgstAmount),
    });
    setPurchaseModalOpen(true);
  };

  const handleDeletePurchase = async (purchase) => {
    if (!window.confirm(`Delete purchase invoice ${purchase.invoiceNumber}?`)) return;

    try {
      const response = await fetch(`${API}/staff/purchases/${purchase.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setPurchases((prev) => prev.filter((item) => item.id !== purchase.id));
        if (editingPurchaseId === purchase.id) {
          closePurchaseModal();
        }
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to delete purchase.");
      }
    } catch (error) {
      console.error("Error deleting purchase:", error);
      alert("Error deleting purchase.");
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Purchase
                </MDTypography>
                <MDButton color="info" variant="gradient" onClick={openAddPurchaseModal}>
                  <Icon sx={{ mr: 1 }}>add</Icon>
                  Add Purchase
                </MDButton>
              </MDBox>
              <MDBox px={3} pb={3}>
                <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
                  <Table sx={{ minWidth: 1180 }}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={tableHeadSx}>Sr No</TableCell>
                        <TableCell sx={tableHeadSx}>Seller</TableCell>
                        <TableCell sx={tableHeadSx}>City</TableCell>
                        <TableCell sx={tableHeadSx}>State</TableCell>
                        <TableCell sx={tableHeadSx}>GSTIN</TableCell>
                        <TableCell sx={tableHeadSx}>PAN</TableCell>
                        <TableCell sx={tableHeadSx}>Invoice</TableCell>
                        <TableCell sx={tableHeadSx}>Invoice Date</TableCell>
                        <TableCell sx={tableHeadSx}>E-Way Bill</TableCell>
                        <TableCell sx={tableHeadSx}>Sales Order</TableCell>
                        <TableCell sx={tableHeadSx}>FSSAI</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Taxable</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>GST</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Round Off</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Total</TableCell>
                        <TableCell align="center" sx={tableHeadSx}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {purchases.length > 0 ? (
                        purchases.map((purchase, index) => (
                          <TableRow key={purchase.id}>
                            <TableCell sx={tableBodySx}>{index + 1}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.sellerName}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.city || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.state || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.gstin || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.panNo || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.invoiceNumber}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.invoiceDate || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.ewayBillNo || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.salesOrderNumber || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.fssaiNumber || "N/A"}</TableCell>
                            <TableCell align="right" sx={tableBodySx}>{money(purchase.taxableValue)}</TableCell>
                            <TableCell align="right" sx={tableBodySx}>{money(purchase.totalGstAmount)}</TableCell>
                            <TableCell align="right" sx={tableBodySx}>{money(purchase.roundOff)}</TableCell>
                            <TableCell align="right" sx={{ ...tableBodySx, fontWeight: 700 }}>
                              {money(purchase.roundedTotal)}
                            </TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <MDBox display="flex" gap={0.75} justifyContent="center">
                                <FaRegEdit onClick={() => handleEditPurchase(purchase)} style={{ cursor: "pointer" }} color="#E0E388" size={20} />
                                <CiTrash onClick={() => handleDeletePurchase(purchase)} style={{ cursor: "pointer" }} color="#FF0000" size={20} />
                              </MDBox>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={16} align="center" sx={{ py: 4 }}>
                            <MDTypography variant="body2" color="text">
                              No purchases found. Click &quot;Add Purchase&quot; to create one.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <Dialog
        open={purchaseModalOpen}
        onClose={closePurchaseModal}
        fullWidth
        maxWidth="lg"
        scroll="paper"
      >
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          {editingPurchaseId ? "Edit Purchase" : "Add Purchase"}
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1}>
                <Grid container spacing={2.5}>
                  <Grid item xs={12}>
                    <MDTypography variant="button" fontWeight="medium" color="dark">
                      Seller Details
                    </MDTypography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl size="small" fullWidth required>
                      <Select
                        displayEmpty
                        value={form.companyId}
                        onChange={(e) => handleChange("companyId", e.target.value)}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="" disabled>Choose Company</MenuItem>
                        {companies.map((company) => (
                          <MenuItem key={company.id} value={String(company.id)}>
                            {company.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Autocomplete
                      freeSolo
                      options={sellerDirectory}
                      loading={loadingSellers}
                      value={form.sellerName}
                      inputValue={form.sellerName}
                      getOptionLabel={(option) =>
                        typeof option === "string" ? option : option.sellerName || ""
                      }
                      isOptionEqualToValue={(option, value) =>
                        option.sellerName === (typeof value === "string" ? value : value?.sellerName)
                      }
                      onInputChange={(event, value, reason) => {
                        handleChange("sellerName", value || "");
                        if (reason === "input") fetchSellers(value || "");
                      }}
                      onChange={(event, value) => {
                        if (typeof value === "string") {
                          handleChange("sellerName", value);
                        } else {
                          fillSellerDetails(value);
                        }
                      }}
                      renderOption={(props, option) => (
                        <li {...props} key={`${option.sellerName}-${option.gstin}`}>
                          <MDBox>
                            <MDTypography variant="button" fontWeight="medium">
                              {option.sellerName}
                            </MDTypography>
                            <MDTypography variant="caption" color="text" display="block">
                              {option.city || "No city"} | {option.gstin || "No GSTIN"}
                            </MDTypography>
                          </MDBox>
                        </li>
                      )}
                      renderInput={(params) => (
                        <MDInput
                          {...params}
                          label="Seller Name"
                          fullWidth
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      label="Address"
                      fullWidth
                      value={form.address}
                      onChange={(e) => handleChange("address", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <MDInput
                      label="City"
                      fullWidth
                      value={form.city}
                      onChange={(e) => handleChange("city", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value={form.state}
                        onChange={(e) => handleChange("state", e.target.value)}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="" disabled>Choose State</MenuItem>
                        {INDIAN_STATES.map((state) => (
                          <MenuItem key={state} value={state}>
                            {state}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="GSTIN"
                      fullWidth
                      value={form.gstin}
                      onChange={(e) => handleChange("gstin", e.target.value.toUpperCase())}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <MDInput
                      label="PAN No"
                      fullWidth
                      value={form.panNo}
                      onChange={(e) => handleChange("panNo", e.target.value.toUpperCase())}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <MDInput
                      label="Pin Code"
                      fullWidth
                      value={form.pinCode}
                      onChange={(e) => handleChange("pinCode", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="FSSAI Number"
                      fullWidth
                      value={form.fssaiNumber}
                      onChange={(e) => handleChange("fssaiNumber", e.target.value)}
                    />
                  </Grid>

                  <Grid item xs={12} mt={1}>
                    <MDTypography variant="button" fontWeight="medium" color="dark">
                      Invoice Details
                    </MDTypography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="Invoice Number"
                      fullWidth
                      value={form.invoiceNumber}
                      onChange={(e) => handleChange("invoiceNumber", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="E-Way Bill No"
                      fullWidth
                      value={form.ewayBillNo}
                      onChange={(e) => handleChange("ewayBillNo", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="date"
                      label="E-Way Bill Date"
                      fullWidth
                      value={form.ewayBillDate}
                      onChange={(e) => handleChange("ewayBillDate", e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="date"
                      label="Invoice Date"
                      fullWidth
                      value={form.invoiceDate}
                      onChange={(e) => handleChange("invoiceDate", e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      label="Sales Order Number"
                      fullWidth
                      value={form.salesOrderNumber}
                      onChange={(e) => handleChange("salesOrderNumber", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} mt={1}>
                    <MDTypography variant="button" fontWeight="medium" color="dark">
                      Invoice Summary
                    </MDTypography>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="Gross Amount"
                      fullWidth
                      value={form.grossAmount}
                      onChange={(e) => handleChange("grossAmount", e.target.value)}
                      onBlur={() => handleAmountBlur("grossAmount")}
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="Trader Discount Value"
                      fullWidth
                      value={form.traderDiscountValue}
                      onChange={(e) => handleChange("traderDiscountValue", e.target.value)}
                      onBlur={() => handleAmountBlur("traderDiscountValue")}
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="Primary Discount Value"
                      fullWidth
                      value={form.primaryDiscountValue}
                      onChange={(e) => handleChange("primaryDiscountValue", e.target.value)}
                      onBlur={() => handleAmountBlur("primaryDiscountValue")}
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="Secondary Discount Value"
                      fullWidth
                      value={form.secondaryDiscountValue}
                      onChange={(e) => handleChange("secondaryDiscountValue", e.target.value)}
                      onBlur={() => handleAmountBlur("secondaryDiscountValue")}
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="Cash Discount Value"
                      fullWidth
                      value={form.cashDiscountValue}
                      onChange={(e) => handleChange("cashDiscountValue", e.target.value)}
                      onBlur={() => handleAmountBlur("cashDiscountValue")}
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="Taxable Value"
                      fullWidth
                      value={totals.taxableValue ? totals.taxableValue.toFixed(2) : ""}
                      InputProps={{ readOnly: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="CGST Amount (5%)"
                      fullWidth
                      value={form.cgstAmount}
                      onChange={(e) => handleGstChange("cgstAmount", e.target.value)}
                      onBlur={() => handleAmountBlur("cgstAmount")}
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="SGST Amount (5%)"
                      fullWidth
                      value={form.sgstAmount}
                      onChange={(e) => handleGstChange("sgstAmount", e.target.value)}
                      onBlur={() => handleAmountBlur("sgstAmount")}
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDBox
                      height="44px"
                      display="flex"
                      alignItems="center"
                      px={2}
                      sx={{ border: "1px solid #d2d6da", borderRadius: 1, backgroundColor: "#f8fafc" }}
                    >
                      <MDTypography variant="button" fontWeight="medium" color="dark">
                        GST: {money(totals.totalGstAmount)}
                      </MDTypography>
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDBox
                      height="44px"
                      display="flex"
                      alignItems="center"
                      px={2}
                      sx={{ border: "1px solid #d2d6da", borderRadius: 1, backgroundColor: "#f8fafc" }}
                    >
                      <MDTypography variant="button" fontWeight="medium" color="dark">
                        Round Off: {money(totals.roundOff)}
                      </MDTypography>
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDBox
                      height="44px"
                      display="flex"
                      alignItems="center"
                      px={2}
                      sx={{ border: "1px solid #111827", borderRadius: 1, backgroundColor: "#fff" }}
                    >
                      <MDTypography variant="button" fontWeight="bold" color="dark">
                        Total: {money(totals.roundedTotal)}
                      </MDTypography>
                    </MDBox>
                  </Grid>

                  <Grid item xs={12}>
                    <MDBox display="flex" justifyContent="flex-end" gap={1}>
                      <MDButton color="dark" variant="outlined" onClick={handleReset}>
                        Reset
                      </MDButton>
                    </MDBox>
                  </Grid>
                </Grid>
          </MDBox>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <MDButton color="dark" variant="outlined" onClick={closePurchaseModal}>
            Cancel
          </MDButton>
          <MDButton color="info" variant="gradient" onClick={handleSave}>
            <Icon sx={{ mr: 1 }}>{editingPurchaseId ? "save" : "receipt_long"}</Icon>
            {editingPurchaseId ? "Update Purchase" : "Save Purchase"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default Purchase;
