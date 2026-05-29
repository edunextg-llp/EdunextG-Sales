import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Autocomplete from "@mui/material/Autocomplete";
import {
  FormControl,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

function UpdatePayment() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [sales, setSales] = useState([]);
  const [updating, setUpdating] = useState({});
  const [refDialogSaleId, setRefDialogSaleId] = useState(null);

  const dialogSale = sales.find((s) => s.id === refDialogSaleId);

  const API = "https://bawarchee.edunextg.co/api";

  const handleSearch = async (query) => {
    if (!query) return;
    try {
      const response = await fetch(`${API}/staff/search?query=${query}`);
      const data = await response.json();
      setStaffOptions(data);
    } catch (error) {
      console.error("Error searching staff:", error);
    }
  };

  useEffect(() => {
    if (selectedStaff && selectedDate) {
      const fetchSales = async () => {
        try {
          const response = await fetch(
            `${API}/staff/${selectedStaff.id}/sales-by-date?date=${selectedDate}`
          );
          const data = await response.json();
          setSales(data);
        } catch (error) {
          console.error("Error fetching sales:", error);
        }
      };
      fetchSales();
    } else {
      setSales([]);
    }
  }, [selectedStaff, selectedDate]);

  const handlePaymentChange = (saleId, field, value) => {
    const updatedSales = sales.map((sale) =>
      sale.id === saleId ? { ...sale, [field]: value } : sale
    );
    setSales(updatedSales);
  };

  const savePaymentUpdate = async (sale) => {
    const saleId = sale.id;
    setUpdating((prev) => ({ ...prev, [saleId]: true }));
    try {
      const paid = parseFloat(sale.paid_amount) || 0;
      const tPrice = parseFloat(sale.price) || 0;
      const balanceAmount = sale.payment_mode === "credit" ? tPrice : tPrice - paid;

      const response = await fetch(`${API}/staff/sales/${saleId}/payment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMode: sale.payment_mode,
          paidAmount: sale.payment_mode === "credit" ? null : paid,
          balanceAmount: balanceAmount,
          referenceNo: sale.reference_no || null,
          referenceDate: sale.reference_date || null,
          creditDays: sale.credit_days || null,
        }),
      });
      if (response.ok) {
        alert("Payment mode updated successfully!");
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update payment.");
      }
    } catch (error) {
      console.error("Error updating payment:", error);
      alert("Error updating payment.");
    } finally {
      setUpdating((prev) => ({ ...prev, [saleId]: false }));
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox
                variant="gradient"
                bgColor="info"
                borderRadius="lg"
                coloredShadow="info"
                mx={2}
                mt={-3}
                p={3}
                mb={1}
                textAlign="center"
              >
                <MDTypography variant="h4" fontWeight="medium" color="white" mt={1}>
                  Update Payment Details
                </MDTypography>
              </MDBox>
              <MDBox pt={4} pb={3} px={3}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <MDBox mb={2}>
                      <MDInput
                        type="date"
                        label="Select Date"
                        fullWidth
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <MDBox mb={2}>
                      <Autocomplete
                        options={staffOptions}
                        getOptionLabel={(option) => option.name}
                        onChange={(event, newValue) => setSelectedStaff(newValue)}
                        onInputChange={(event, newInputValue) => handleSearch(newInputValue)}
                        renderInput={(params) => (
                          <MDInput {...params} label="Search Staff Name" fullWidth />
                        )}
                      />
                    </MDBox>
                  </Grid>
                </Grid>

                {selectedStaff && sales.length > 0 && (
                  <MDBox mt={4}>
                    <TableContainer
                      component={Paper}
                      sx={{ boxShadow: "none", backgroundColor: "transparent" }}
                    >
                      <Table size="small">
                        <TableHead sx={{ display: "table-header-group" }}>
                          <TableRow>
                            <TableCell align="left" sx={{ fontWeight: "bold" }}>
                              Outlet Name
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: "bold" }}>
                              Invoice No
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: "bold" }}>
                              Invoice Price
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: "bold" }}>
                              Update Payment
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: "bold" }}>
                              Paid Amount
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: "bold" }}>
                              Balance Amount
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: "bold" }}>
                              Ref Details
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: "bold" }}>
                              Action
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sales.map((sale) => (
                            <TableRow key={sale.id}>
                              <TableCell align="left">{sale.outlet_name}</TableCell>
                              <TableCell align="center">{sale.invoice_number}</TableCell>
                              <TableCell align="center">₹{Number(sale.price).toFixed(2)}</TableCell>
                              {/* <TableCell align="center">{sale.sticker_number}</TableCell> */}
                              <TableCell align="center">
                                <FormControl fullWidth size="small" sx={{ minWidth: 120 }}>
                                  <Select
                                    value={sale.payment_mode}
                                    onChange={(e) =>
                                      handlePaymentChange(sale.id, "payment_mode", e.target.value)
                                    }
                                  >
                                    <MenuItem value="cash">Cash</MenuItem>
                                    <MenuItem value="upi">UPI</MenuItem>
                                    <MenuItem value="credit">Credit</MenuItem>
                                    <MenuItem value="cheque">Cheque</MenuItem>
                                  </Select>
                                </FormControl>
                              </TableCell>
                              <TableCell align="center">
                                {sale.payment_mode !== "credit" ? (
                                  <MDInput
                                    type="number"
                                    label="Paid Amount"
                                    size="small"
                                    fullWidth
                                    value={sale.paid_amount || ""}
                                    onChange={(e) =>
                                      handlePaymentChange(sale.id, "paid_amount", e.target.value)
                                    }
                                    sx={{ minWidth: 120 }}
                                  />
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell align="center">
                                {(() => {
                                  if (sale.payment_mode === "credit")
                                    return `₹${Number(sale.price).toFixed(2)}`;
                                  const paid = parseFloat(sale.paid_amount) || 0;
                                  const tPrice = parseFloat(sale.price) || 0;
                                  const diff = tPrice - paid;
                                  return diff === 0 ? "₹0.00" : `₹${diff.toFixed(2)}`;
                                })()}
                              </TableCell>
                              <TableCell align="center">
                                {sale.payment_mode === "upi" ||
                                  sale.payment_mode === "cheque" ||
                                  sale.payment_mode === "credit" ? (
                                  <MDButton
                                    variant="outlined"
                                    color="secondary"
                                    size="small"
                                    onClick={() => setRefDialogSaleId(sale.id)}
                                  >
                                    View/Add Details
                                  </MDButton>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell align="center">
                                <MDButton
                                  variant="outlined"
                                  color="info"
                                  size="small"
                                  disabled={updating[sale.id]}
                                  onClick={() => savePaymentUpdate(sale)}
                                >
                                  {updating[sale.id] ? "Saving..." : "Save"}
                                </MDButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </MDBox>
                )}
                {selectedStaff && sales.length === 0 && (
                  <MDBox mt={4} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      No sales found for this staff on the selected date.
                    </MDTypography>
                  </MDBox>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <Dialog
        open={!!refDialogSaleId}
        onClose={() => setRefDialogSaleId(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          Enter Reference Details
        </DialogTitle>
        <DialogContent>
          <MDBox pt={2} display="flex" flexDirection="column" gap={3}>
            {dialogSale?.payment_mode === "upi" && (
              <MDInput
                type="text"
                label="UPI ID"
                fullWidth
                value={dialogSale.reference_no || ""}
                onChange={(e) => handlePaymentChange(dialogSale.id, "reference_no", e.target.value)}
                InputProps={{ sx: { fontSize: "1.2rem", padding: "10px" } }}
                InputLabelProps={{ sx: { fontSize: "1.2rem" } }}
              />
            )}
            {dialogSale?.payment_mode === "cheque" && (
              <>
                <MDInput
                  type="text"
                  label="Cheque No"
                  fullWidth
                  value={dialogSale.reference_no || ""}
                  onChange={(e) =>
                    handlePaymentChange(dialogSale.id, "reference_no", e.target.value)
                  }
                  InputProps={{ sx: { fontSize: "1.2rem", padding: "10px" } }}
                  InputLabelProps={{ sx: { fontSize: "1.2rem" } }}
                />
                <MDInput
                  type="date"
                  label="Cheque Date"
                  fullWidth
                  InputLabelProps={{ shrink: true, sx: { fontSize: "1.2rem" } }}
                  InputProps={{ sx: { fontSize: "1.2rem", padding: "10px" } }}
                  value={dialogSale.reference_date || ""}
                  onChange={(e) =>
                    handlePaymentChange(dialogSale.id, "reference_date", e.target.value)
                  }
                />
              </>
            )}
            {dialogSale?.payment_mode === "credit" && (
              <MDInput
                type="number"
                label="Credit Days (e.g. 15, 30)"
                fullWidth
                value={dialogSale.credit_days || ""}
                onChange={(e) => handlePaymentChange(dialogSale.id, "credit_days", e.target.value)}
                InputProps={{ sx: { fontSize: "1.2rem", padding: "10px" } }}
                InputLabelProps={{ sx: { fontSize: "1.2rem" } }}
              />
            )}
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton variant="contained" color="info" onClick={() => setRefDialogSaleId(null)}>
            Done
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default UpdatePayment;
