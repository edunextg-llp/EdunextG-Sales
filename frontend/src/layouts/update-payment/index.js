import { useState, useEffect } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
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
  InputLabel,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const PAYMENT_MODE_LABELS = {
  cash: "Cash",
  upi: "UPI",
  credit: "Credit",
  cheque: "Cheque",
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
  verticalAlign: "middle",
};

const tableBodySx = {
  px: 2,
  verticalAlign: "middle",
  py: 1.5,
};

const getTodayLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const emptyPaymentForm = () => ({
  paymentDate: getTodayLocalDate(),
  paymentMode: "cash",
  amount: "",
  referenceNo: "",
  referenceDate: "",
  creditDays: "",
});


const toInputDate = (value) => {
  if (!value) return "";
  const dateValue = String(value);

  if (dateValue.includes("T")) {
    return dateValue.split("T")[0];
  }

  const ddmmyyyy = dateValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  const yyyymmdd = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    return dateValue;
  }

  return "";
};


function UpdatePayment() {
  const [searchQuery, setSearchQuery] = useState("");
  const [salesData, setSalesData] = useState([]);
  const [paymentDialogSale, setPaymentDialogSale] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [addingPayment, setAddingPayment] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);

  const API = "https://bawarchee.edunextg.co/api";

  const fetchSales = async () => {
    try {
      const response = await fetch(`${API}/staff/sales/by-date`);
      if (response.ok) {
        const data = await response.json();
        setSalesData(data);
      }
    } catch (error) {
      console.error("Error fetching global sales:", error);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const filteredSales = salesData.filter((row) => {
    if (row.packaging_status !== "delivered") return false;

    const search = searchQuery.toLowerCase();
    const outletName = row.outlet_name ? row.outlet_name.toLowerCase() : "";
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    return outletName.includes(search) || outletErpId.includes(search);
  });

  const getRemainingBalance = (sale) => {
    const price = parseFloat(sale.price) || 0;
    const paid = parseFloat(sale.paid_amount) || 0;
    const balance = parseFloat(sale.balance_amount);

    if (!Number.isNaN(balance)) {
      if (paid === 0 && balance === 0 && price > 0) {
        return price;
      }
      return Math.max(0, balance);
    }
    return Math.max(0, price - paid);
  };

  const getPaidAmount = (sale) => {
    const paid = parseFloat(sale.paid_amount);
    if (!Number.isNaN(paid)) return paid;
    const price = parseFloat(sale.price) || 0;
    return Math.max(0, price - getRemainingBalance(sale));
  };

  const fetchPaymentsForSale = async (saleId) => {
    setLoadingPayments(true);
    try {
      const response = await fetch(`${API}/staff/sales/${saleId}/payments`);
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments);
        setPaymentSummary(data.summary);
        setSalesData((prev) =>
          prev.map((sale) =>
            sale.id === saleId
              ? {
                ...sale,
                paid_amount: data.summary.paidAmount,
                balance_amount: data.summary.balanceAmount,
              }
              : sale
          )
        );
      }
    } catch (error) {
      console.error("Error fetching payments:", error);
    } finally {
      setLoadingPayments(false);
    }
  };

  const openPaymentDialog = async (sale) => {
    setPaymentDialogSale(sale);
    setPaymentForm(emptyPaymentForm());
    await fetchPaymentsForSale(sale.id);
  };

  const closePaymentDialog = () => {
    setPaymentDialogSale(null);
    setPayments([]);
    setPaymentSummary(null);
    setPaymentForm(emptyPaymentForm());
    setEditingPaymentId(null);
  };


  const startEditPayment = (payment) => {
    setEditingPaymentId(payment.id);
    const formattedDate = toInputDate(payment.reference_date);
    const paymentDt = toInputDate(payment.payment_date);

    setPaymentForm({
      paymentDate: paymentDt || getTodayLocalDate(),
      paymentMode: payment.payment_mode,
      amount: String(payment.amount),
      referenceNo: payment.reference_no || "",
      referenceDate: formattedDate,
      creditDays: payment.credit_days ? String(payment.credit_days) : "",
    });
  };

  const cancelEditPayment = () => {
    setEditingPaymentId(null);
    setPaymentForm(emptyPaymentForm());

  };

  const handlePaymentFormChange = (field, value) => {
    setPaymentForm((prev) => ({ ...prev, [field]: value }));
  };

  const formatPaymentDetails = (payment) => {
    if (payment.payment_mode === "upi" && payment.reference_no) {
      return `UPI: ${payment.reference_no}`;
    }
    if (payment.payment_mode === "cheque") {
      const parts = [];
      if (payment.reference_no) parts.push(`Cheque #${payment.reference_no}`);
      if (payment.reference_date) parts.push(`Date: ${toInputDate(payment.reference_date)}`);
      return parts.join(" · ") || "—";
    }
    if (payment.payment_mode === "credit" && payment.credit_days) {
      return `${payment.credit_days} days credit`;
    }
    return "—";
  };

  const validatePaymentForm = () => {
    const amount = parseFloat(paymentForm.amount);
    if (!paymentForm.paymentDate || !paymentForm.amount || Number.isNaN(amount) || amount <= 0) {
      alert("Please enter a valid date and amount.");

      return;
    }

    let remaining = paymentSummary?.balanceAmount ?? getRemainingBalance(paymentDialogSale);

    // If editing, add back the old amount of the payment we're editing so we don't overestimate
    if (editingPaymentId && ["cash", "upi", "cheque"].includes(paymentForm.paymentMode)) {
      const oldPayment = payments.find(p => p.id === editingPaymentId);
      if (oldPayment && ["cash", "upi", "cheque"].includes(oldPayment.payment_mode)) {
        remaining += parseFloat(oldPayment.amount) || 0;
      }
    }

    if (amount > remaining + 0.001 && ["cash", "upi", "cheque"].includes(paymentForm.paymentMode)) {
      alert(`Amount cannot exceed remaining balance (₹${remaining.toFixed(2)}).`);
      return;

    }

    if (paymentForm.paymentMode === "credit" && !paymentForm.creditDays) {
      alert("Please enter credit days.");
      return null;
    }

    if (paymentForm.paymentMode === "cheque" && !paymentForm.referenceNo.trim()) {
      alert("Please enter cheque number.");
      return null;
    }

    if (!editingPaymentId) {
      const remaining = paymentSummary?.balanceAmount ?? getRemainingBalance(paymentDialogSale);
      if (
        ["cash", "upi", "cheque"].includes(paymentForm.paymentMode) &&
        amount > remaining + 0.001
      ) {
        alert(`Amount cannot exceed remaining balance (₹${remaining.toFixed(2)}).`);
        return null;
      }
    }

    return {
      paymentDate: paymentForm.paymentDate,
      paymentMode: paymentForm.paymentMode,
      amount,
      referenceNo: paymentForm.referenceNo.trim() || null,
      referenceDate: paymentForm.referenceDate || null,
      creditDays:
        paymentForm.paymentMode === "credit" ? parseInt(paymentForm.creditDays, 10) : null,
    };
  };

  const handleSavePayment = async () => {
    if (!paymentDialogSale) return;

    const payload = validatePaymentForm();
    if (!payload) return;

    setAddingPayment(true);
    try {

      const isEditing = !!editingPaymentId;
      const url = isEditing
        ? `${API}/staff/sales/${paymentDialogSale.id}/payments/${editingPaymentId}`
        : `${API}/staff/sales/${paymentDialogSale.id}/payments`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",

        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();

        setPayments(data.payments);
        setPaymentSummary(data.summary);
        setEditingPaymentId(null);
        setPaymentForm(emptyPaymentForm());
        setSalesData((prev) =>
          prev.map((sale) =>
            sale.id === paymentDialogSale.id
              ? {
                ...sale,
                paid_amount: data.summary.paidAmount,
                balance_amount: data.summary.balanceAmount,
              }
              : sale
          )
        );

      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || `Failed to ${editingPaymentId ? "update" : "add"} payment.`);
      }
    } catch (error) {
      console.error("Error saving payment:", error);
      alert("Error saving payment.");
    } finally {
      setAddingPayment(false);
    }
  };

  const dialogRemaining =
    paymentSummary?.balanceAmount ??
    (paymentDialogSale ? getRemainingBalance(paymentDialogSale) : 0);

  const maxPayableOnEdit = (() => {
    if (!editingPaymentId || !paymentSummary) return dialogRemaining;
    const price = parseFloat(paymentSummary.price) || 0;
    const paidExcludingEdit = payments.reduce((sum, p) => {
      if (p.id === editingPaymentId) return sum;
      if (["cash", "upi", "cheque"].includes(p.payment_mode)) {
        return sum + (parseFloat(p.amount) || 0);
      }
      return sum;
    }, 0);
    return Math.max(0, Math.round((price - paidExcludingEdit) * 100) / 100);
  })();

  const showPaymentForm = dialogRemaining > 0 || editingPaymentId;

  const totalCreditOnAccount = payments
    .filter((p) => p.payment_mode === "credit")
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

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
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      type="text"
                      label="Search by Outlet Name or ID"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                </Grid>

                <MDBox>
                  <TableContainer
                    component={Paper}
                    sx={{
                      boxShadow: "none",
                      backgroundColor: "transparent",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <Table size="small">
                      <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                        <TableRow>
                          <TableCell align="center" sx={{ fontWeight: "bold", width: 56 }}>
                            Sr No
                          </TableCell>
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
                            Paid Amount
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: "bold" }}>
                            Balance Amount
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: "bold" }}>
                            Action
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredSales.length > 0 ? (
                          filteredSales.map((sale, index) => {
                            const balance = getRemainingBalance(sale);
                            const paid = getPaidAmount(sale);
                            return (
                              <TableRow key={sale.id}>
                                <TableCell align="center">{index + 1}</TableCell>
                                <TableCell align="left">{sale.outlet_name}</TableCell>
                                <TableCell align="center">{sale.invoice_number}</TableCell>
                                <TableCell align="center">
                                  ₹{Number(sale.price).toFixed(2)}
                                </TableCell>
                                <TableCell align="center">₹{paid.toFixed(2)}</TableCell>
                                <TableCell align="center">
                                  <MDTypography
                                    variant="button"
                                    fontWeight="medium"
                                    color={balance > 0 ? "error" : "success"}
                                  >
                                    ₹{balance.toFixed(2)}
                                  </MDTypography>
                                </TableCell>
                                <TableCell align="center">
                                  <MDButton
                                    variant="outlined"
                                    color="info"
                                    size="small"
                                    onClick={() => openPaymentDialog(sale)}
                                  >
                                    Manage Payments
                                  </MDButton>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                              <MDTypography variant="body2" color="text">
                                No delivered items found matching your search.
                              </MDTypography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </MDBox>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <Dialog open={!!paymentDialogSale} onClose={closePaymentDialog} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          Payment Ledger — {paymentDialogSale?.outlet_name}
        </DialogTitle>
        <DialogContent>
          {paymentDialogSale && (
            <MDBox pt={1}>
              <MDBox
                display="flex"
                flexWrap="wrap"
                gap={2}
                mb={3}
                p={2}
                sx={{ backgroundColor: "#f8f9fa", borderRadius: "10px", border: "1px solid #e9ecef" }}
              >
                <MDTypography variant="body2">
                  <strong>Invoice:</strong> {paymentDialogSale.invoice_number}
                </MDTypography>
                <MDTypography variant="body2">
                  <strong>Price:</strong> ₹{Number(paymentSummary?.price ?? paymentDialogSale.price).toFixed(2)}
                </MDTypography>
                <MDTypography variant="body2">
                  <strong>Paid:</strong> ₹
                  {Number(paymentSummary?.paidAmount ?? getPaidAmount(paymentDialogSale)).toFixed(2)}
                </MDTypography>
                <MDTypography variant="body2" color={dialogRemaining > 0 ? "error" : "success"}>
                  <strong>Balance:</strong> ₹{dialogRemaining.toFixed(2)}
                </MDTypography>
                {totalCreditOnAccount > 0 && (
                  <MDTypography variant="body2" color="text">
                    <strong>On credit:</strong> ₹{totalCreditOnAccount.toFixed(2)} (does not reduce balance)
                  </MDTypography>
                )}
              </MDBox>

              <MDTypography variant="h6" fontWeight="medium" mb={2}>
                Payment History
              </MDTypography>

              {loadingPayments ? (
                <MDTypography variant="body2" color="text" mb={3}>
                  Loading payments...
                </MDTypography>
              ) : payments.length === 0 ? (
                <MDTypography variant="body2" color="text" mb={3}>
                  No payments recorded yet. Add cash/UPI/cheque until balance is ₹0. Credit is recorded separately and does not reduce balance.
                </MDTypography>
              ) : (
                <TableContainer
                  sx={{
                    boxShadow: "none",
                    borderTop: "1px solid #e5e7eb",
                    backgroundColor: "transparent",
                    mb: 3,
                    overflowX: "auto",
                  }}
                >
                  <Table
                    size="small"
                    sx={{
                      tableLayout: "fixed",
                      width: "100%",
                      minWidth: 520,
                      "& .MuiTableCell-root": { overflow: "hidden" },
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "38%" }} />
                      <col style={{ width: "14%" }} />
                    </colgroup>
                    <TableHead
                      sx={{
                        display: "table-header-group",
                        backgroundColor: "#f9fafb",
                        "& .MuiTableCell-root": { backgroundColor: "#f9fafb" },
                      }}
                    >
                      <TableRow>
                        <TableCell align="left" sx={tableHeadSx}>
                          Date
                        </TableCell>
                        <TableCell align="left" sx={tableHeadSx}>
                          Mode
                        </TableCell>
                        <TableCell align="right" sx={tableHeadSx}>
                          Amount
                        </TableCell>
                        <TableCell align="left" sx={tableHeadSx}>
                          Details
                        </TableCell>
                        <TableCell align="center" sx={tableHeadSx}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow
                          key={payment.id}
                          sx={{ backgroundColor: editingPaymentId === payment.id ? "#fff9c4" : "inherit" }}
                        >
                          <TableCell
                            align="left"
                            sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                          >
                            {toInputDate(payment.payment_date)}
                          </TableCell>
                          <TableCell
                            align="left"
                            sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                          >
                            {PAYMENT_MODE_LABELS[payment.payment_mode] || payment.payment_mode}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              ...tableBodySx,
                              borderBottom: "1px solid #e5e7eb",
                              fontSize: "0.875rem",
                              fontWeight: 500,
                              color: "#111827",
                            }}
                          >
                            ₹{Number(payment.amount).toFixed(2)}
                          </TableCell>
                          <TableCell
                            align="left"
                            sx={{
                              ...tableBodySx,
                              borderBottom: "1px solid #e5e7eb",
                              fontSize: "0.875rem",
                              color: "#374151",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {formatPaymentDetails(payment)}
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                            <MDBox display="flex" justifyContent="center" alignItems="center">
                              <MDButton
                                variant="outlined"
                                color="info"
                                size="small"
                                onClick={() => startEditPayment(payment)}
                              >
                                <Icon fontSize="small">edit</Icon>
                              </MDButton>
                            </MDBox>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}


              {(dialogRemaining > 0 || editingPaymentId) && (
                <MDBox>
                  <MDTypography variant="h6" fontWeight="medium" mb={2}>
                    {editingPaymentId ? "Edit Payment" : "Add Payment"}
                  </MDTypography>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                      <MDInput
                        type="date"
                        label="Date"
                        fullWidth
                        InputLabelProps={{ shrink: true }}
                        value={paymentForm.paymentDate}
                        onChange={(e) => handlePaymentFormChange("paymentDate", e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Payment Mode</InputLabel>
                        <Select
                          value={paymentForm.paymentMode}
                          label="Payment Mode"
                          onChange={(e) => handlePaymentFormChange("paymentMode", e.target.value)}
                          sx={{ height: "45px" }}
                        >
                          <MenuItem value="cash">Cash</MenuItem>
                          <MenuItem value="upi">UPI</MenuItem>
                          <MenuItem value="cheque">Cheque</MenuItem>
                          <MenuItem value="credit">Credit</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <MDInput
                        type="number"
                        label={
                          editingPaymentId
                            ? `Amount (max ₹${maxPayableOnEdit.toFixed(2)})`
                            : `Amount (max ₹${dialogRemaining.toFixed(2)})`
                        }
                        fullWidth
                        value={paymentForm.amount}
                        onChange={(e) => handlePaymentFormChange("amount", e.target.value)}
                      />
                    </Grid>
                    {paymentForm.paymentMode === "upi" && (
                      <Grid item xs={12} sm={6} md={3}>
                        <MDInput
                          type="text"
                          label="UPI Reference (optional)"
                          fullWidth
                          value={paymentForm.referenceNo}
                          onChange={(e) => handlePaymentFormChange("referenceNo", e.target.value)}
                        />
                      </Grid>
                    )}
                    {paymentForm.paymentMode === "cheque" && (
                      <>
                        <Grid item xs={12} sm={6} md={3}>
                          <MDInput
                            type="text"
                            label="Cheque No"
                            fullWidth
                            value={paymentForm.referenceNo}
                            onChange={(e) => handlePaymentFormChange("referenceNo", e.target.value)}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <MDInput
                            type="date"
                            label="Cheque Date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={paymentForm.referenceDate}
                            onChange={(e) =>
                              handlePaymentFormChange("referenceDate", e.target.value)
                            }
                          />
                        </Grid>
                      </>
                    )}
                    {paymentForm.paymentMode === "credit" && (
                      <Grid item xs={12} sm={6} md={3}>
                        <MDInput
                          type="number"
                          label="Credit Days"
                          fullWidth
                          value={paymentForm.creditDays}
                          onChange={(e) => handlePaymentFormChange("creditDays", e.target.value)}
                        />
                      </Grid>
                    )}
                  </Grid>
                  {paymentForm.paymentMode === "credit" && (
                    <MDTypography variant="caption" color="text" display="block" mt={1}>
                      Credit is logged for tracking only. Balance stays the same until paid by cash, UPI, or cheque.
                    </MDTypography>
                  )}
                  <MDBox mt={2} display="flex" gap={1} flexWrap="wrap">
                    <MDButton
                      variant="gradient"
                      color="info"
                      onClick={handleSavePayment}
                      disabled={addingPayment}
                    >
                      <Icon sx={{ mr: 1 }}>{editingPaymentId ? "save" : "add"}</Icon>
                      {addingPayment
                        ? "Saving..."
                        : editingPaymentId
                          ? "Update Payment"
                          : "Add Payment"}
                    </MDButton>
                    {editingPaymentId && (
                      <MDButton
                        variant="outlined"
                        color="dark"
                        onClick={cancelEditPayment}
                        disabled={addingPayment}
                      >
                        Cancel
                      </MDButton>
                    )}
                  </MDBox>
                </MDBox>
              )}

              {dialogRemaining === 0 && payments.length > 0 && (
                <MDBox
                  mt={2}
                  p={2}
                  sx={{
                    backgroundColor: "#e8f5e9",
                    borderRadius: "10px",
                    border: "1px solid #c8e6c9",
                  }}
                >
                  <MDTypography variant="body2" color="success">
                    Fully paid — no balance remaining.
                  </MDTypography>
                </MDBox>
              )}
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton variant="outlined" color="dark" onClick={closePaymentDialog}>
            Close
          </MDButton>
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}

export default UpdatePayment;
