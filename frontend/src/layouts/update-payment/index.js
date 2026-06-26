import { Fragment, useState, useEffect } from "react";
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

const CASH_NOTE_DENOMINATIONS = [500, 200, 100, 50, 20, 10];
const CASH_COIN_DENOMINATIONS = [20, 10, 5, 2, 1];
const CASH_DENOMINATIONS = [
  ...CASH_NOTE_DENOMINATIONS.map((denomination) => ({ key: `note_${denomination}`, denomination })),
  ...CASH_COIN_DENOMINATIONS.map((denomination) => ({ key: `coin_${denomination}`, denomination })),
];

const emptyCashNotes = () =>
  CASH_DENOMINATIONS.reduce((notes, item) => {
    notes[item.key] = "";
    return notes;
  }, {});

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
  collectorType: "company_staff",
  collectorStaffId: "",
  collectorDeliveryBoyId: "",
  collectorName: "",
  cashNotes: emptyCashNotes(),
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
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [activeCreditPayment, setActiveCreditPayment] = useState(null);
  const [deliveryBoys, setDeliveryBoys] = useState([]);

  const API = "https://bawarchee.edunextg.co/api";

  const getDeliveryBoyById = (boyId) =>
    deliveryBoys.find((boy) => String(boy.id) === String(boyId));

  const getDefaultDeliveryBoyCollector = (sale = paymentDialogSale) => {
    const boyId = sale?.delivery_boy_id != null ? String(sale.delivery_boy_id) : "";
    const boy = getDeliveryBoyById(boyId);
    return {
      collectorDeliveryBoyId: boyId,
      collectorName: boy?.name || sale?.delivery_boy_name || "",
    };
  };

  const resolveDeliveryBoyIdFromName = (name) => {
    const boy = deliveryBoys.find((item) => item.name === name);
    return boy ? String(boy.id) : "";
  };

  const getOutletMarketingStaffId = (sale = paymentDialogSale) => {
    if (sale?.outlet_staff_id != null) return String(sale.outlet_staff_id);
    if (sale?.staff_id != null) return String(sale.staff_id);
    return "";
  };

  const getOutletMarketingStaffName = (sale = paymentDialogSale) =>
    sale?.outlet_staff_name || sale?.staff_name || "N/A";

  const buildDefaultPaymentForm = (sale = paymentDialogSale) => ({
    ...emptyPaymentForm(),
    collectorType: "company_staff",
    collectorStaffId: getOutletMarketingStaffId(sale),
    collectorName: "",
  });

  const getCollectorName = (payment) =>
    payment.collector_staff_name || payment.collector_name || getOutletMarketingStaffName() || "N/A";

  const inferCollectorType = (payment) =>
    payment.collector_name && !payment.collector_staff_id ? "bawarchee_staff" : "company_staff";

  const fetchSales = async (search = searchQuery) => {
    try {
      const params = new URLSearchParams();
      const normalizedSearch = String(search || "").trim();
      if (normalizedSearch) {
        params.set("search", normalizedSearch);
      }

      const queryString = params.toString();
      const response = await fetch(
        `${API}/staff/sales/by-date${queryString ? `?${queryString}` : ""}`
      );
      if (response.ok) {
        const data = await response.json();
        setSalesData(data);
      }
    } catch (error) {
      console.error("Error fetching global sales:", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSales(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const fetchDeliveryBoys = async () => {
      try {
        const response = await fetch(`${API}/delivery-boy`);
        if (response.ok) {
          setDeliveryBoys(await response.json());
        }
      } catch (error) {
        console.error("Error fetching delivery boys:", error);
      }
    };

    fetchDeliveryBoys();
  }, []);

  useEffect(() => {
    if (!paymentDialogSale || deliveryBoys.length === 0) return;

    setPaymentForm((prev) => {
      if (prev.collectorType !== "bawarchee_staff" || prev.collectorDeliveryBoyId) {
        return prev;
      }

      const defaultDeliveryBoy = getDefaultDeliveryBoyCollector(paymentDialogSale);
      if (!defaultDeliveryBoy.collectorDeliveryBoyId) {
        return prev;
      }

      return {
        ...prev,
        collectorDeliveryBoyId: defaultDeliveryBoy.collectorDeliveryBoyId,
        collectorName: defaultDeliveryBoy.collectorName,
      };
    });
  }, [deliveryBoys, paymentDialogSale]);

  const filteredSales = salesData.filter((row) => row.packaging_status === "delivered");

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

  const getPaymentRowSx = (sale) => {
    const price = parseFloat(sale.price) || 0;
    const balance = getRemainingBalance(sale);
    const paid = getPaidAmount(sale);
    const hasPaymentActivity = (Number(sale.payment_count) || 0) > 0 || paid > 0;

    if (!hasPaymentActivity) {
      return {
        backgroundColor: "#fff",
        "&:hover": { backgroundColor: "#f8fafc" },
      };
    }

    if (balance <= 0.001) {
      return {
        backgroundColor: "#dcfce7",
        "&:hover": { backgroundColor: "#bbf7d0" },
      };
    }

    if (Math.abs(balance - price) <= 0.001) {
      return {
        backgroundColor: "#fee2e2",
        "&:hover": { backgroundColor: "#fecaca" },
      };
    }

    if (balance < price) {
      return {
        backgroundColor: "#fef3c7",
        "&:hover": { backgroundColor: "#fde68a" },
      };
    }

    return {};
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
                payment_count: data.payments?.length || 0,
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
    setPaymentForm(buildDefaultPaymentForm(sale));
    await fetchPaymentsForSale(sale.id);
  };

  const closePaymentDialog = () => {
    setPaymentDialogSale(null);
    setPayments([]);
    setPaymentSummary(null);
    setPaymentForm(emptyPaymentForm());
    setEditingPaymentId(null);
    setActiveCreditPayment(null);
    setDeletingPaymentId(null);
  };


  const startEditPayment = (payment) => {
    setEditingPaymentId(payment.id);
    setActiveCreditPayment(null);
    const formattedDate = toInputDate(payment.reference_date);
    const paymentDt = toInputDate(payment.payment_date);

    setPaymentForm({
      paymentDate: paymentDt || getTodayLocalDate(),
      paymentMode: payment.payment_mode,
      amount: String(payment.amount),
      collectorType: inferCollectorType(payment),
      collectorStaffId: payment.collector_staff_id
        ? String(payment.collector_staff_id)
        : getOutletMarketingStaffId(),
      collectorDeliveryBoyId: inferCollectorType(payment) === "bawarchee_staff"
        ? resolveDeliveryBoyIdFromName(payment.collector_name)
        : "",
      collectorName: payment.collector_name || "",
      cashNotes: emptyCashNotes(),
      referenceNo: payment.reference_no || "",
      referenceDate: formattedDate,
      creditDays: payment.credit_days ? String(payment.credit_days) : "",
    });
  };

  const cancelEditPayment = () => {
    setEditingPaymentId(null);
    setActiveCreditPayment(null);
    setPaymentForm(buildDefaultPaymentForm());
  };

  const startAddAgainstCredit = (payment) => {
    setEditingPaymentId(null);
    setActiveCreditPayment(payment);
    setPaymentForm({
      ...buildDefaultPaymentForm(),
      paymentMode: "cash",
      collectorStaffId: payment.collector_staff_id
        ? String(payment.collector_staff_id)
        : getOutletMarketingStaffId(),
      collectorType: inferCollectorType(payment),
      collectorDeliveryBoyId: inferCollectorType(payment) === "bawarchee_staff"
        ? resolveDeliveryBoyIdFromName(payment.collector_name)
        : getDefaultDeliveryBoyCollector().collectorDeliveryBoyId,
      collectorName: payment.collector_name || getDefaultDeliveryBoyCollector().collectorName,
    });
  };

  const handlePaymentFormChange = (field, value) => {
    setPaymentForm((prev) => {
      if (field === "paymentMode") {
        return {
          ...prev,
          paymentMode: value,
          amount: value === "cash" ? "" : prev.amount,
          cashNotes: value === "cash" ? emptyCashNotes() : prev.cashNotes,
          referenceNo: "",
          referenceDate: "",
          creditDays: "",
        };
      }

      if (field === "collectorType") {
        if (value === "company_staff") {
          return {
            ...prev,
            collectorType: value,
            collectorStaffId: getOutletMarketingStaffId(),
            collectorDeliveryBoyId: "",
            collectorName: "",
          };
        }
        const defaultDeliveryBoy = getDefaultDeliveryBoyCollector();
        return {
          ...prev,
          collectorType: value,
          collectorStaffId: "",
          collectorDeliveryBoyId: defaultDeliveryBoy.collectorDeliveryBoyId,
          collectorName: defaultDeliveryBoy.collectorName,
        };
      }

      if (field === "collectorDeliveryBoyId") {
        const boy = getDeliveryBoyById(value);
        return {
          ...prev,
          collectorDeliveryBoyId: value,
          collectorName: boy?.name || "",
        };
      }

      return { ...prev, [field]: value };
    });
  };

  const calculateCashAmount = (cashNotes = paymentForm.cashNotes) =>
    CASH_DENOMINATIONS.reduce(
      (total, item) => total + item.denomination * (parseInt(cashNotes[item.key], 10) || 0),
      0
    );

  const handleCashNoteChange = (denomination, value) => {
    const count = value === "" ? "" : Math.max(0, parseInt(value, 10) || 0);

    setPaymentForm((prev) => {
      const cashNotes = {
        ...prev.cashNotes,
        [denomination]: count,
      };
      return {
        ...prev,
        cashNotes,
        amount: String(calculateCashAmount(cashNotes) || ""),
      };
    });
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

  const getCreditChildPayments = (creditPayment) =>
    payments.filter((payment) => Number(payment.parent_credit_payment_id) === Number(creditPayment.id));

  const getCreditRemainingAmount = (creditPayment) => {
    const creditAmount = parseFloat(creditPayment?.amount) || 0;
    const paidAgainstCredit = getCreditChildPayments(creditPayment).reduce(
      (sum, payment) => sum + (parseFloat(payment.amount) || 0),
      0
    );
    return Math.max(0, Math.round((creditAmount - paidAgainstCredit) * 100) / 100);
  };

  const validatePaymentForm = () => {
    const amount = parseFloat(paymentForm.amount);

    if (paymentForm.paymentMode === "cash") {
      const hasCashCount = CASH_DENOMINATIONS.some(
        (item) => (parseInt(paymentForm.cashNotes[item.key], 10) || 0) > 0
      );
      if (!hasCashCount) {
        alert("Please enter cash note count.");
        return null;
      }
    }

    if (!paymentForm.paymentDate || !paymentForm.amount || Number.isNaN(amount) || amount <= 0) {
      alert("Please enter a valid date and amount.");

      return;
    }

    if (paymentForm.collectorType === "company_staff") {
      if (!paymentForm.collectorStaffId) {
        alert("No marketing person is assigned to this outlet.");
        return null;
      }
    } else if (!paymentForm.collectorDeliveryBoyId) {
      alert("Please choose a delivery boy.");
      return null;
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

    if (activeCreditPayment && ["cash", "upi", "cheque"].includes(paymentForm.paymentMode)) {
      const creditRemaining = getCreditRemainingAmount(activeCreditPayment);
      if (amount > creditRemaining + 0.001) {
        alert(`Amount cannot exceed remaining credit amount (Rs. ${creditRemaining.toFixed(2)}).`);
        return null;
      }
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
      collectorType: paymentForm.collectorType,
      collectorStaffId:
        paymentForm.collectorType === "company_staff"
          ? Number(paymentForm.collectorStaffId)
          : null,
      collectorName:
        paymentForm.collectorType === "bawarchee_staff"
          ? String(getDeliveryBoyById(paymentForm.collectorDeliveryBoyId)?.name || paymentForm.collectorName || "").trim()
          : null,
      referenceNo: paymentForm.referenceNo.trim() || null,
      referenceDate: paymentForm.referenceDate || null,
      creditDays:
        paymentForm.paymentMode === "credit" ? parseInt(paymentForm.creditDays, 10) : null,
      parentCreditPaymentId: activeCreditPayment?.id || null,
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
        setActiveCreditPayment(null);
        setPaymentForm(buildDefaultPaymentForm());
        setSalesData((prev) =>
          prev.map((sale) =>
            sale.id === paymentDialogSale.id
              ? {
                ...sale,
                paid_amount: data.summary.paidAmount,
                balance_amount: data.summary.balanceAmount,
                payment_count: data.payments?.length || 0,
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

  const handleDeletePayment = async (payment) => {
    if (!paymentDialogSale || deletingPaymentId) return;

    const creditChildren =
      payment.payment_mode === "credit" ? getCreditChildPayments(payment) : [];
    const confirmMessage =
      payment.payment_mode === "credit" && creditChildren.length > 0
        ? `Delete this credit payment and ${creditChildren.length} linked payment(s)? This cannot be undone.`
        : "Delete this payment? This cannot be undone.";

    if (!window.confirm(confirmMessage)) return;

    setDeletingPaymentId(payment.id);
    try {
      const response = await fetch(
        `${API}/staff/sales/${paymentDialogSale.id}/payments/${payment.id}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments);
        setPaymentSummary(data.summary);
        if (editingPaymentId === payment.id) {
          cancelEditPayment();
        }
        if (activeCreditPayment?.id === payment.id) {
          setActiveCreditPayment(null);
          setPaymentForm(emptyPaymentForm());
        }
        setSalesData((prev) =>
          prev.map((sale) =>
            sale.id === paymentDialogSale.id
              ? {
                  ...sale,
                  paid_amount: data.summary.paidAmount,
                  balance_amount: data.summary.balanceAmount,
                  payment_count: data.payments?.length || 0,
                }
              : sale
          )
        );
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to delete payment.");
      }
    } catch (error) {
      console.error("Error deleting payment:", error);
      alert("Error deleting payment.");
    } finally {
      setDeletingPaymentId(null);
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
  const topLevelPayments = payments.filter((payment) => !payment.parent_credit_payment_id);

  const totalCreditOnAccount = payments
    .filter((p) => p.payment_mode === "credit")
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const totalPaidAgainstCredit = payments
    .filter((p) => p.parent_credit_payment_id && ["cash", "upi", "cheque"].includes(p.payment_mode))
    .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const remainingCreditOnAccount = Math.max(0, totalCreditOnAccount - totalPaidAgainstCredit);
  const activeCreditRemaining = activeCreditPayment
    ? getCreditRemainingAmount(activeCreditPayment)
    : dialogRemaining;

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
                      label="Search by Outlet Name, ID, Staff Name, Sale ID, or Invoice No"
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
                            Sale ID
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
                              <TableRow key={sale.id} sx={getPaymentRowSx(sale)}>
                                <TableCell align="center">{index + 1}</TableCell>
                                <TableCell align="left">
                                  <MDTypography variant="button" fontWeight="medium" color="dark">
                                    {sale.outlet_name}
                                  </MDTypography>
                                  <MDTypography display="block" variant="caption" color="text">
                                    Staff: {sale.staff_name || "N/A"}
                                  </MDTypography>
                                </TableCell>
                                <TableCell align="center">{sale.sticker_number}</TableCell>
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
                            <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
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
                  <strong>Sale ID:</strong> {paymentDialogSale.sticker_number}
                </MDTypography>
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
                    <strong>Credit remaining:</strong> ₹{remainingCreditOnAccount.toFixed(2)} of ₹{totalCreditOnAccount.toFixed(2)}
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
                      minWidth: 680,
                      "& .MuiTableCell-root": { overflow: "hidden" },
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "16%" }} />
                      <col style={{ width: "28%" }} />
                      <col style={{ width: "16%" }} />
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
                          Collector
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
                      {topLevelPayments.map((payment) => {
                        const creditChildren = payment.payment_mode === "credit" ? getCreditChildPayments(payment) : [];
                        const creditRemaining = payment.payment_mode === "credit" ? getCreditRemainingAmount(payment) : 0;

                        return (
                          <Fragment key={payment.id}>
                            <TableRow
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
                            sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                          >
                            {getCollectorName(payment)}
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
                            {payment.payment_mode === "credit"
                              ? `${formatPaymentDetails(payment)} - Remaining: ₹${creditRemaining.toFixed(2)}`
                              : formatPaymentDetails(payment)}
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                            <MDBox display="flex" justifyContent="center" alignItems="center" gap={0.75}>
                              {payment.payment_mode === "credit" && (
                                <MDButton
                                  variant="gradient"
                                  color="success"
                                  size="small"
                                  disabled={creditRemaining <= 0 || dialogRemaining <= 0}
                                  onClick={() => startAddAgainstCredit(payment)}
                                >
                                  Add
                                </MDButton>
                              )}
                              <MDButton
                                variant="outlined"
                                color="info"
                                size="small"
                                onClick={() => startEditPayment(payment)}
                              >
                                <Icon fontSize="small">edit</Icon>
                              </MDButton>
                              <MDButton
                                variant="outlined"
                                color="error"
                                size="small"
                                disabled={deletingPaymentId === payment.id || addingPayment}
                                onClick={() => handleDeletePayment(payment)}
                              >
                                <Icon fontSize="small">delete</Icon>
                              </MDButton>
                            </MDBox>
                          </TableCell>
                            </TableRow>
                            {creditChildren.map((childPayment) => (
                              <TableRow
                                key={childPayment.id}
                                sx={{ backgroundColor: editingPaymentId === childPayment.id ? "#fff9c4" : "#f8fafc" }}
                              >
                                <TableCell align="left" sx={{ ...tableBodySx, pl: 4, borderBottom: "1px solid #e5e7eb", fontSize: "0.8125rem", color: "#475569" }}>
                                  {toInputDate(childPayment.payment_date)}
                                </TableCell>
                                <TableCell align="left" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.8125rem", color: "#475569" }}>
                                  {PAYMENT_MODE_LABELS[childPayment.payment_mode] || childPayment.payment_mode}
                                </TableCell>
                                <TableCell align="right" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.8125rem", fontWeight: 500, color: "#111827" }}>
                                  ₹{Number(childPayment.amount).toFixed(2)}
                                </TableCell>
                                <TableCell align="left" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.8125rem", color: "#475569" }}>
                                  {getCollectorName(childPayment)}
                                </TableCell>
                                <TableCell align="left" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.8125rem", color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  Against credit #{payment.id} - {formatPaymentDetails(childPayment)}
                                </TableCell>
                                <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                                  <MDBox display="flex" justifyContent="center" alignItems="center" gap={0.75}>
                                    <MDButton
                                      variant="outlined"
                                      color="info"
                                      size="small"
                                      onClick={() => startEditPayment(childPayment)}
                                    >
                                      <Icon fontSize="small">edit</Icon>
                                    </MDButton>
                                    <MDButton
                                      variant="outlined"
                                      color="error"
                                      size="small"
                                      disabled={deletingPaymentId === childPayment.id || addingPayment}
                                      onClick={() => handleDeletePayment(childPayment)}
                                    >
                                      <Icon fontSize="small">delete</Icon>
                                    </MDButton>
                                  </MDBox>
                                </TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}


              {(dialogRemaining > 0 || editingPaymentId) && (
                <MDBox>
                  <MDTypography variant="h6" fontWeight="medium" mb={2}>
                    {editingPaymentId
                      ? "Edit Payment"
                      : activeCreditPayment
                        ? `Add Payment Against Credit - ${activeCreditPayment.credit_days || ""} Days`
                        : "Add Payment"}
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
                          {!activeCreditPayment && <MenuItem value="credit">Credit</MenuItem>}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Collector Type</InputLabel>
                        <Select
                          value={paymentForm.collectorType}
                          label="Collector Type"
                          onChange={(e) => handlePaymentFormChange("collectorType", e.target.value)}
                          sx={{ height: "45px" }}
                        >
                          <MenuItem value="company_staff">Company Staff</MenuItem>
                          <MenuItem value="bawarchee_staff">Bawarchee Staff</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      {paymentForm.collectorType === "company_staff" ? (
                        <MDInput
                          label="Marketing Person (Outlet)"
                          fullWidth
                          value={getOutletMarketingStaffName()}
                          InputProps={{ readOnly: true }}
                        />
                      ) : (
                        <FormControl fullWidth size="small">
                          <InputLabel>Delivery Boy</InputLabel>
                          <Select
                            value={paymentForm.collectorDeliveryBoyId}
                            label="Delivery Boy"
                            onChange={(e) => handlePaymentFormChange("collectorDeliveryBoyId", e.target.value)}
                            sx={{ height: "45px" }}
                          >
                            {paymentDialogSale?.delivery_boy_id && (
                              <MenuItem value={String(paymentDialogSale.delivery_boy_id)}>
                                {paymentDialogSale.delivery_boy_name || "Assigned Delivery Boy"} (Assigned)
                              </MenuItem>
                            )}
                            {deliveryBoys
                              .filter((boy) => String(boy.id) !== String(paymentDialogSale?.delivery_boy_id || ""))
                              .map((boy) => (
                                <MenuItem key={boy.id} value={String(boy.id)}>
                                  {boy.name}
                                </MenuItem>
                              ))}
                          </Select>
                        </FormControl>
                      )}
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <MDInput
                        type="number"
                        label={
                          editingPaymentId
                            ? `Amount (max ₹${maxPayableOnEdit.toFixed(2)})`
                            : `Amount (max ₹${activeCreditRemaining.toFixed(2)})`
                        }
                        fullWidth
                        value={paymentForm.amount}
                        disabled={paymentForm.paymentMode === "cash"}
                        onChange={(e) => handlePaymentFormChange("amount", e.target.value)}
                      />
                    </Grid>
                    {paymentForm.paymentMode === "cash" && (
                      <Grid item xs={12}>
                        <MDTypography variant="button" fontWeight="medium" color="dark" display="block" mb={1}>
                          Notes
                        </MDTypography>
                        <MDBox
                          display="grid"
                          sx={{
                            gridTemplateColumns: {
                              xs: "repeat(2, minmax(0, 1fr))",
                              sm: "repeat(3, minmax(0, 1fr))",
                              md: "repeat(6, minmax(0, 1fr))",
                            },
                          }}
                          gap={1.5}
                        >
                          {CASH_NOTE_DENOMINATIONS.map((denomination) => (
                            <MDInput
                              key={`note-${denomination}`}
                              type="number"
                              label={`₹${denomination} Note`}
                              value={paymentForm.cashNotes[`note_${denomination}`] || ""}
                              onChange={(e) => handleCashNoteChange(`note_${denomination}`, e.target.value)}
                              inputProps={{ min: 0, step: 1 }}
                              fullWidth
                            />
                          ))}
                        </MDBox>
                        <MDTypography variant="button" fontWeight="medium" color="dark" display="block" mt={2} mb={1}>
                          Coins
                        </MDTypography>
                        <MDBox
                          display="grid"
                          sx={{
                            gridTemplateColumns: {
                              xs: "repeat(2, minmax(0, 1fr))",
                              sm: "repeat(3, minmax(0, 1fr))",
                              md: "repeat(5, minmax(0, 1fr))",
                            },
                          }}
                          gap={1.5}
                        >
                          {CASH_COIN_DENOMINATIONS.map((denomination) => (
                            <MDInput
                              key={`coin-${denomination}`}
                              type="number"
                              label={`₹${denomination} Coin`}
                              value={paymentForm.cashNotes[`coin_${denomination}`] || ""}
                              onChange={(e) => handleCashNoteChange(`coin_${denomination}`, e.target.value)}
                              inputProps={{ min: 0, step: 1 }}
                              fullWidth
                            />
                          ))}
                        </MDBox>
                        <MDTypography variant="caption" color="text" display="block" mt={1}>
                          Cash amount auto-calculates from note and coin count.
                        </MDTypography>
                      </Grid>
                    )}
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
                    {activeCreditPayment && (
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
