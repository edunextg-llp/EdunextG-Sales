import { useEffect, useMemo, useState } from "react";

import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import {
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

const emptyForm = () => ({
  sellerName: "",
  address: "",
  city: "",
  gstin: "",
  invoiceNumber: "",
  salesOrderNumber: "",
  fssaiNumber: "",
  grossAmount: "",
  traderDiscountValue: "",
  primaryDiscountValue: "",
  secondaryDiscountValue: "",
  cashDiscountValue: "",
  taxableValue: "",
  cgstAmount: "",
  sgstAmount: "",
});

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const numberValue = (value) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
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
  const [loadingSellers, setLoadingSellers] = useState(false);
  const API = "http://localhost:5000/api";

  const totals = useMemo(() => {
    const grossAmount = numberValue(form.grossAmount);
    const traderDiscountValue = numberValue(form.traderDiscountValue);
    const primaryDiscountValue = numberValue(form.primaryDiscountValue);
    const secondaryDiscountValue = numberValue(form.secondaryDiscountValue);
    const cashDiscountValue = numberValue(form.cashDiscountValue);
    const manualTaxableValue = numberValue(form.taxableValue);
    const totalDiscount =
      traderDiscountValue + primaryDiscountValue + secondaryDiscountValue + cashDiscountValue;
    const taxableValue = form.taxableValue === "" ? Math.max(grossAmount - totalDiscount, 0) : manualTaxableValue;
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
            gstin: seller.gstin || "",
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching purchase sellers:", error);
    } finally {
      setLoadingSellers(false);
    }
  };

  useEffect(() => {
    fetchSellers();
  }, []);

  const fillSellerDetails = (seller) => {
    if (!seller) return;
    setForm((prev) => ({
      ...prev,
      sellerName: seller.sellerName || "",
      address: seller.address || "",
      city: seller.city || "",
      gstin: seller.gstin || "",
    }));
  };

  const handleReset = () => {
    setForm(emptyForm());
  };

  const saveSellerToDb = async () => {
    const response = await fetch(`${API}/staff/purchase-sellers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellerName: form.sellerName.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        gstin: form.gstin.trim().toUpperCase(),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "Failed to save seller details.");
    }

    const data = await response.json();
    const seller = data.seller;
    if (seller) {
      setSellerDirectory((prev) => {
        const nextSeller = {
          id: seller.id,
          sellerName: seller.seller_name || "",
          address: seller.address || "",
          city: seller.city || "",
          gstin: seller.gstin || "",
        };
        return [
          nextSeller,
          ...prev.filter((item) => item.id !== nextSeller.id && item.sellerName !== nextSeller.sellerName),
        ];
      });
    }
  };

  const handleSave = async () => {
    if (!form.sellerName.trim()) {
      alert("Seller name is required.");
      return;
    }
    if (!form.invoiceNumber.trim()) {
      alert("Invoice number is required.");
      return;
    }

    try {
      await saveSellerToDb();
    } catch (error) {
      alert(error.message);
      return;
    }

    setPurchases((prev) => [
      {
        id: Date.now(),
        ...form,
        taxableValue: totals.taxableValue,
        totalGstAmount: totals.totalGstAmount,
        roundOff: totals.roundOff,
        roundedTotal: totals.roundedTotal,
      },
      ...prev,
    ]);
    handleReset();
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Purchase
                </MDTypography>
              </MDBox>

              <MDBox px={3} pb={3}>
                <Grid container spacing={2.5}>
                  <Grid item xs={12}>
                    <MDTypography variant="button" fontWeight="medium" color="dark">
                      Seller Details
                    </MDTypography>
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
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="GSTIN"
                      fullWidth
                      value={form.gstin}
                      onChange={(e) => handleChange("gstin", e.target.value.toUpperCase())}
                    />
                  </Grid>

                  <Grid item xs={12} mt={1}>
                    <MDTypography variant="button" fontWeight="medium" color="dark">
                      Invoice Details
                    </MDTypography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      label="Invoice Number"
                      fullWidth
                      value={form.invoiceNumber}
                      onChange={(e) => handleChange("invoiceNumber", e.target.value)}
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
                  <Grid item xs={12} md={4}>
                    <MDInput
                      label="FSSAI Number"
                      fullWidth
                      value={form.fssaiNumber}
                      onChange={(e) => handleChange("fssaiNumber", e.target.value)}
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
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="Taxable Value"
                      fullWidth
                      placeholder={money(totals.taxableValue)}
                      value={form.taxableValue}
                      onChange={(e) => handleChange("taxableValue", e.target.value)}
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="CGST Amount"
                      fullWidth
                      value={form.cgstAmount}
                      onChange={(e) => handleChange("cgstAmount", e.target.value)}
                      inputProps={{ min: 0, step: "0.01" }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="number"
                      label="SGST Amount"
                      fullWidth
                      value={form.sgstAmount}
                      onChange={(e) => handleChange("sgstAmount", e.target.value)}
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
                      <MDButton color="info" variant="gradient" onClick={handleSave}>
                        <Icon sx={{ mr: 1 }}>receipt_long</Icon>
                        Save Purchase
                      </MDButton>
                    </MDBox>
                  </Grid>
                </Grid>
              </MDBox>
            </Card>
          </Grid>

          {purchases.length > 0 && (
            <Grid item xs={12}>
              <Card>
                <MDBox p={3} pb={2}>
                  <MDTypography variant="h6" fontWeight="medium">
                    Recent Purchases
                  </MDTypography>
                </MDBox>
                <MDBox px={3} pb={3}>
                  <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
                    <Table sx={{ minWidth: 1080 }}>
                      <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                        <TableRow>
                          <TableCell sx={tableHeadSx}>Sr No</TableCell>
                          <TableCell sx={tableHeadSx}>Seller</TableCell>
                          <TableCell sx={tableHeadSx}>City</TableCell>
                          <TableCell sx={tableHeadSx}>GSTIN</TableCell>
                          <TableCell sx={tableHeadSx}>Invoice</TableCell>
                          <TableCell sx={tableHeadSx}>Sales Order</TableCell>
                          <TableCell sx={tableHeadSx}>FSSAI</TableCell>
                          <TableCell align="right" sx={tableHeadSx}>Taxable</TableCell>
                          <TableCell align="right" sx={tableHeadSx}>GST</TableCell>
                          <TableCell align="right" sx={tableHeadSx}>Round Off</TableCell>
                          <TableCell align="right" sx={tableHeadSx}>Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {purchases.map((purchase, index) => (
                          <TableRow key={purchase.id}>
                            <TableCell sx={tableBodySx}>{index + 1}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.sellerName}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.city || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.gstin || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.invoiceNumber}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.salesOrderNumber || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{purchase.fssaiNumber || "N/A"}</TableCell>
                            <TableCell align="right" sx={tableBodySx}>{money(purchase.taxableValue)}</TableCell>
                            <TableCell align="right" sx={tableBodySx}>{money(purchase.totalGstAmount)}</TableCell>
                            <TableCell align="right" sx={tableBodySx}>{money(purchase.roundOff)}</TableCell>
                            <TableCell align="right" sx={{ ...tableBodySx, fontWeight: 700 }}>
                              {money(purchase.roundedTotal)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </MDBox>
              </Card>
            </Grid>
          )}
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default Purchase;
