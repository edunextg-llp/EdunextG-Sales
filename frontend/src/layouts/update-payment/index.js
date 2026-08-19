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
  Tooltip,
  CircularProgress,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";

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
  const [collectionDate, setCollectionDate] = useState(getTodayLocalDate());
  const [collectionRows, setCollectionRows] = useState([]);
  const [collectionDeliveryBoyName, setCollectionDeliveryBoyName] = useState("");
  const [collectionCompanyStaffId, setCollectionCompanyStaffId] = useState("");
  const [collectionCompanyId, setCollectionCompanyId] = useState("");
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyStaff, setCompanyStaff] = useState([]);
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
  const [cancelDialogSale, setCancelDialogSale] = useState(null);
  const [cancellingFullBillId, setCancellingFullBillId] = useState(null);
  const [cancelForm, setCancelForm] = useState({
    selectedItemId: "",
    productName: "",
    productQtyToCancel: "",
    amount: "",
    reason: "",
  });
  const [cancelSaleItems, setCancelSaleItems] = useState([]);
  const [loadingCancelItems, setLoadingCancelItems] = useState(false);
  const [loggingCancel, setLoggingCancel] = useState(false);
  const [addCancelDialogOpen, setAddCancelDialogOpen] = useState(false);
  const [cancellationHistory, setCancellationHistory] = useState([]);
  const [loadingCancellations, setLoadingCancellations] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);

  const API = "https://bawarchee.edunextg.co/api";

  const getStaffCompanyIds = (staff) =>
    String(staff?.company_ids || staff?.company_id || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

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

  const fetchCollectionReport = async () => {
    try {
      const params = new URLSearchParams();
      if (collectionDate) {
        params.set("startDate", collectionDate);
        params.set("endDate", collectionDate);
      }
      if (collectionCompanyId) {
        params.set("companyId", collectionCompanyId);
      }
      const response = await fetch(`${API}/staff/reports?${params.toString()}`);
      if (!response.ok) throw new Error("Unable to load collection report");

      const data = await response.json();
      const grouped = (data.collectionDetails || []).reduce((result, row) => {
        const collectorType = row.collector_type === "bawarchee_staff" ? "Delivery boy" : "Company staff";
        const collectorName = row.collector_type === "bawarchee_staff"
          ? row.bawarchee_collector_name || "Unassigned"
          : row.company_collector_name || "Unassigned";
        const deliveryBoyName = row.delivery_boy_name || row.bawarchee_collector_name || "N/A";
        const key = [
          row.collection_date || collectionDate || "N/A",
          collectorType,
          collectorName,
          deliveryBoyName,
          row.company_name || "N/A",
          row.sale_id,
        ].join("|");
        if (!result[key]) {
          result[key] = {
            collectionDate: row.collection_date || collectionDate || "N/A",
            collectorType,
            collectorName,
            deliveryBoyName,
            companyName: row.company_name || "N/A",
            outletName: row.outlet_name || "N/A",
            invoiceNumber: row.invoice_number || "N/A",
            cash: 0,
            upi: 0,
            cheque: 0,
            total: 0,
          };
        }
        result[key].cash += Number(row.cash_amount) || 0;
        result[key].upi += Number(row.upi_amount) || 0;
        result[key].cheque += Number(row.cheque_amount) || 0;
        result[key].total += Number(row.total_amount) || 0;
        return result;
      }, {});
      setCollectionRows(Object.values(grouped));
    } catch (error) {
      console.error("Error fetching collection report:", error);
      setCollectionRows([]);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSales(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCollectionDeliveryBoyName("");
    setCollectionCompanyStaffId("");
    fetchCollectionReport();
  }, [collectionDate, collectionCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fetchCompanyStaff = async () => {
      try {
        const response = await fetch(`${API}/staff`);
        if (response.ok) {
          setCompanyStaff(await response.json());
        }
      } catch (error) {
        console.error("Error fetching company staff:", error);
      }
    };

    const fetchCompanyOptions = async () => {
      try {
        const response = await fetch(`${API}/staff/companies`);
        if (response.ok) {
          setCompanyOptions(await response.json());
        }
      } catch (error) {
        console.error("Error fetching companies:", error);
      }
    };

    fetchCompanyStaff();
    fetchCompanyOptions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredCompanyStaffOptions = companyStaff.filter((staff) => {
    if (!collectionCompanyId) return false;
    return getStaffCompanyIds(staff).includes(Number(collectionCompanyId));
  });

  const formatReportCurrency = (amount) =>
    `Rs. ${Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filteredCollectionRows = collectionRows.filter((row) => {
    if (collectionDeliveryBoyName && (
      row.deliveryBoyName !== collectionDeliveryBoyName
      && !(row.collectorType === "Delivery boy" && row.collectorName === collectionDeliveryBoyName)
    )) {
      return false;
    }

    const selectedCompanyStaffName = companyStaff.find(
      (staff) => String(staff.id) === String(collectionCompanyStaffId)
    )?.name;
    if (selectedCompanyStaffName && (
      row.collectorType !== "Company staff" || row.collectorName !== selectedCompanyStaffName
    )) {
      return false;
    }

    return true;
  });

  const collectionDeliveryBoyOptions = [...new Set(
    collectionRows.flatMap((row) => {
      const names = [];
      if (row.deliveryBoyName && row.deliveryBoyName !== "N/A") {
        names.push(row.deliveryBoyName);
      }
      if (row.collectorType === "Delivery boy" && row.collectorName && row.collectorName !== "Unassigned") {
        names.push(row.collectorName);
      }
      return names;
    })
  )].sort((first, second) => first.localeCompare(second));

  const collectionAmounts = filteredCollectionRows.reduce(
    (amounts, row) => ({
      cash: amounts.cash + row.cash,
      upi: amounts.upi + row.upi,
      cheque: amounts.cheque + row.cheque,
      total: amounts.total + row.total,
    }),
    { cash: 0, upi: 0, cheque: 0, total: 0 }
  );

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character]));

  const downloadCollectionPdf = () => {
    if (!filteredCollectionRows.length) return;
    const rows = filteredCollectionRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.collectionDate)}</td>
        <td>${escapeHtml(row.companyName)}</td>
        <td>${escapeHtml(row.collectorType)}</td>
        <td>${escapeHtml(row.deliveryBoyName)}</td>
        <td>${escapeHtml(row.collectorType === "Company staff" ? row.collectorName : "N/A")}</td>
        <td>${escapeHtml(row.outletName)}</td>
        <td>${escapeHtml(row.invoiceNumber)}</td>
        <td>${formatReportCurrency(row.cash)}</td>
        <td>${formatReportCurrency(row.upi)}</td>
        <td>${formatReportCurrency(row.cheque)}</td>
        <td>${formatReportCurrency(row.total)}</td>
      </tr>`).join("");
    const total = collectionAmounts.total;
    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      alert("Please allow popups to download the PDF.");
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><title>Payment Collection Report</title><style>
      body { font-family: Arial, sans-serif; color: #1f2937; padding: 28px; } h1 { margin: 0 0 6px; font-size: 20px; } p { margin: 0 0 22px; color: #4b5563; } table { width: 100%; border-collapse: collapse; font-size: 12px; } th, td { border: 1px solid #d1d5db; padding: 9px; text-align: left; } th { background: #0ea5e9; color: white; } td:nth-last-child(-n+4), th:nth-last-child(-n+4) { text-align: right; } tfoot td { font-weight: bold; background: #f3f4f6; } @media print { body { padding: 0; } }
      </style></head><body><h1>Payment Collection Report</h1><p>Date: ${escapeHtml(collectionDate)}</p><table><thead><tr><th>Date</th><th>Company</th><th>Collected By</th><th>Delivery Boy</th><th>Company Staff</th><th>Outlet Name</th><th>Invoice No.</th><th>Cash</th><th>UPI</th><th>Cheque</th><th>Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="10">Grand Total</td><td>${formatReportCurrency(total)}</td></tr></tfoot></table><script>window.onload = function () { window.print(); };</script></body></html>`);
    printWindow.document.close();
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, rowsPerPage]);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [deliveryBoys, paymentDialogSale]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredSales = salesData.filter((row) => row.packaging_status === "delivered");
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / rowsPerPage));
  const paginatedSales = filteredSales.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

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

  const fetchCancellationHistory = async (saleId) => {
    setLoadingCancellations(true);
    try {
      const response = await fetch(`${API}/staff/sales/${saleId}/cancel-log`);
      if (response.ok) {
        const data = await response.json();
        setCancellationHistory(data);
      }
    } catch (error) {
      console.error("Error fetching cancellation history:", error);
    } finally {
      setLoadingCancellations(false);
    }
  };

  const fetchCancelSaleItems = async (saleId) => {
    setLoadingCancelItems(true);
    try {
      const response = await fetch(`${API}/staff/sales/${saleId}/items`);
      if (response.ok) {
        const data = await response.json();
        setCancelSaleItems(Array.isArray(data) ? data : []);
      } else {
        setCancelSaleItems([]);
      }
    } catch (error) {
      console.error("Error fetching sale items:", error);
      setCancelSaleItems([]);
    } finally {
      setLoadingCancelItems(false);
    }
  };

  const handleCancelFullBill = async (sale) => {
    if (!sale?.id || cancellingFullBillId) return;

    const invoiceLabel = sale.invoice_number || sale.sticker_number || sale.id;
    const confirmed = window.confirm(
      `Cancel the complete bill ${invoiceLabel} for ${sale.outlet_name || "this outlet"}?\n\n` +
      "Click OK to move this bill to Delivered → Cancelled Items. This action cancels the full invoice."
    );
    if (!confirmed) return;

    setCancellingFullBillId(sale.id);
    try {
      const response = await fetch(`${API}/staff/sales/${sale.id}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packagingStatus: "cancelled",
          expectedStatus: sale.packaging_status || "delivered",
          statusDate: getTodayLocalDate(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to cancel the full bill.");

      setSalesData((current) => current.filter((entry) => entry.id !== sale.id));
      if (paymentDialogSale?.id === sale.id) closePaymentDialog();
      window.alert(`Bill ${invoiceLabel} was cancelled, its items were restored to stock, and it was moved to Delivered → Cancelled Items.`);
    } catch (cancelError) {
      window.alert(cancelError.message);
      fetchSales();
    } finally {
      setCancellingFullBillId(null);
    }
  };

  const calculateCancelAmount = (item, cancelQty) => {
    const orderedQty = Number(item?.qty) || 0;
    const rate = Number(item?.rate) || 0;
    const lineTotal = Number(item?.line_total) || 0;
    const parsedCancelQty = Number(cancelQty) || 0;
    if (parsedCancelQty <= 0) return 0;
    if (rate > 0) return parsedCancelQty * rate;
    if (orderedQty > 0) return (parsedCancelQty / orderedQty) * lineTotal;
    return 0;
  };

  const formatCancelQtyDisplay = (cancellation) => {
    if (cancellation?.product_qty != null && cancellation.product_qty !== "") {
      return Number(cancellation.product_qty);
    }
    const legacyValue = String(cancellation?.product_size ?? "").trim();
    if (legacyValue && !Number.isNaN(Number(legacyValue))) {
      return Number(legacyValue);
    }
    return "—";
  };

  const formatItemQtyDisplay = (qty) => {
    const parsed = Number(qty);
    return Number.isFinite(parsed) ? parsed : "";
  };

  const resetCancelForm = () => {
    setCancelForm({
      selectedItemId: "",
      productName: "",
      productQtyToCancel: "",
      amount: "",
      reason: "",
    });
  };

  const openCancelDialog = async (sale) => {
    setCancelDialogSale(sale);
    setAddCancelDialogOpen(false);
    resetCancelForm();
    setCancelSaleItems([]);
    setCancellationHistory([]);
    await fetchCancellationHistory(sale.id);
  };

  const openAddCancelDialog = async () => {
    if (!cancelDialogSale) return;
    resetCancelForm();
    setCancelSaleItems([]);
    setAddCancelDialogOpen(true);
    await fetchCancelSaleItems(cancelDialogSale.id);
  };

  const closeAddCancelDialog = () => {
    setAddCancelDialogOpen(false);
    resetCancelForm();
    setCancelSaleItems([]);
  };

  const closeCancelDialog = () => {
    setCancelDialogSale(null);
    setAddCancelDialogOpen(false);
    resetCancelForm();
    setCancelSaleItems([]);
    setCancellationHistory([]);
  };

  const handleCancelFormChange = (field, value) => {
    setCancelForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCancelProductSelect = (itemId) => {
    if (String(itemId) === "manual") {
      setCancelForm((prev) => ({
        ...prev,
        selectedItemId: "manual",
        productName: "",
        productQtyToCancel: "",
        amount: "",
      }));
      return;
    }

    const selectedItem = cancelSaleItems.find((item) => String(item.id) === String(itemId));
    if (!selectedItem) {
      setCancelForm((prev) => ({
        ...prev,
        selectedItemId: "",
        productName: "",
        productQtyToCancel: "",
        amount: "",
      }));
      return;
    }

    const orderedQty = formatItemQtyDisplay(selectedItem.qty);
    const cancelAmount = calculateCancelAmount(selectedItem, orderedQty);
    setCancelForm((prev) => ({
      ...prev,
      selectedItemId: String(itemId),
      productName: selectedItem.product_name || "",
      productQtyToCancel: orderedQty === "" ? "" : String(orderedQty),
      amount: cancelAmount > 0 ? cancelAmount.toFixed(2) : "",
    }));
  };

  const handleCancelQtyChange = (value) => {
    const selectedItem = cancelSaleItems.find(
      (item) => String(item.id) === String(cancelForm.selectedItemId)
    );
    if (!selectedItem) {
      setCancelForm((prev) => ({ ...prev, productQtyToCancel: value, amount: "" }));
      return;
    }

    const cancelAmount = calculateCancelAmount(selectedItem, value);
    setCancelForm((prev) => ({
      ...prev,
      productQtyToCancel: value,
      amount: cancelAmount > 0 ? cancelAmount.toFixed(2) : "",
    }));
  };

  const selectedCancelItem =
    cancelForm.selectedItemId && cancelForm.selectedItemId !== "manual"
      ? cancelSaleItems.find((item) => String(item.id) === String(cancelForm.selectedItemId))
      : null;

  const isManualCancelEntry =
    cancelForm.selectedItemId === "manual" || cancelSaleItems.length === 0;

  const handleSaveCancellation = async () => {
    if (!cancelDialogSale) return;

    const { productName, productQtyToCancel, amount, reason } = cancelForm;

    if (!productName.trim()) {
      alert("Please enter product name.");
      return;
    }
    const parsedQty = parseFloat(productQtyToCancel);
    if (!productQtyToCancel || Number.isNaN(parsedQty) || parsedQty <= 0) {
      alert("Please enter a valid product qty to cancel.");
      return;
    }
    if (selectedCancelItem) {
      const orderedQty = Number(selectedCancelItem.qty) || 0;
      if (orderedQty > 0 && parsedQty > orderedQty) {
        alert(`Qty to cancel cannot exceed ordered qty (${orderedQty}).`);
        return;
      }
    }
    if (!reason) {
      alert("Please select a cancellation reason.");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    setLoggingCancel(true);
    try {
      const response = await fetch(
        `${API}/staff/sales/${cancelDialogSale.id}/cancel-log`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outletName: cancelDialogSale.outlet_name,
            invoiceNumber: cancelDialogSale.invoice_number,
            productName: productName.trim(),
            saleItemId: selectedCancelItem?.id || null,
            productErpId: selectedCancelItem?.product_erp_id || "",
            productQty: parsedQty,
            amount: parsedAmount,
            reason,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        alert("Order cancellation logged, balance reduced, and stock restored successfully.");
        closeAddCancelDialog();
        if (data.summary) {
          setSalesData((prev) =>
            prev.map((sale) =>
              sale.id === cancelDialogSale.id
                ? {
                    ...sale,
                    balance_amount: data.summary.balanceAmount,
                    paid_amount: data.summary.paidAmount,
                  }
                : sale
            )
          );
          setCancelDialogSale((prev) =>
            prev
              ? {
                  ...prev,
                  balance_amount: data.summary.balanceAmount,
                  paid_amount: data.summary.paidAmount,
                }
              : prev
          );
        } else {
          await fetchSales();
        }
        await fetchCancellationHistory(cancelDialogSale.id);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to log cancellation.");
      }
    } catch (error) {
      console.error("Error logging cancellation:", error);
      alert("Error logging cancellation.");
    } finally {
      setLoggingCancel(false);
    }
  };

  const handlePrintCancellation = (cancellation) => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html>
        <head>
          <title>Order Cancellation Slip</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 20px; color: #000; }
            .ticket { max-width: 300px; margin: 0 auto; text-align: center; }
            .header { font-size: 16px; font-weight: bold; margin-bottom: 10px; text-transform: uppercase; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
            .details { text-align: left; font-size: 12px; line-height: 1.6; }
            .row { display: flex; justify-content: space-between; }
            .footer { margin-top: 20px; font-size: 10px; }
            @media print {
              body { padding: 0; margin: 0; }
              @page { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="header">Cancellation Slip</div>
            <div class="divider"></div>
            <div class="details">
              <div class="row"><strong>Date:</strong> <span>${cancellation.created_at}</span></div>
              <div class="row"><strong>Outlet:</strong> <span>${cancellation.outlet_name}</span></div>
              <div class="row"><strong>Invoice No:</strong> <span>${cancellation.invoice_number}</span></div>
              <div class="divider"></div>
              <div class="row"><strong>Product:</strong> <span>${cancellation.product_name}</span></div>
              <div class="row"><strong>Qty to Cancel:</strong> <span>${formatCancelQtyDisplay(cancellation)}</span></div>
              <div class="row"><strong>Amount:</strong> <span>₹${Number(cancellation.amount).toFixed(2)}</span></div>
            </div>
            <div class="divider"></div>
            <div class="footer">
              Thank you
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintAllCancellations = () => {
    if (cancellationHistory.length === 0) return;
    const printWindow = window.open("", "_blank");

    let rowsHtml = "";
    cancellationHistory.forEach((c) => {
      rowsHtml += `
        <tr>
          <td>${c.created_at}</td>
          <td>${c.product_name}</td>
          <td>${formatCancelQtyDisplay(c)}</td>
          <td align="right">₹${Number(c.amount).toFixed(2)}</td>
        </tr>
      `;
    });

    printWindow.document.write(`
      <html>
        <head>
          <title>Cancellation History Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #000; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h2 { margin: 0; font-size: 18px; text-transform: uppercase; }
            .header p { margin: 5px 0 0 0; font-size: 12px; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .total { font-weight: bold; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Cancellation History Report</h2>
            <p><strong>Outlet:</strong> ${cancelDialogSale.outlet_name}</p>
            <p><strong>Invoice No:</strong> ${cancelDialogSale.invoice_number}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product Name</th>
                <th>Qty to Cancel</th>
                <th style="text-align: right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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

  const topLevelPayments = payments.filter((payment) => !payment.parent_credit_payment_id);

  const hasCreditEntry = topLevelPayments.some((payment) => payment.payment_mode === "credit");

  const showPaymentForm =
    !!editingPaymentId ||
    !!activeCreditPayment ||
    (dialogRemaining > 0 && !hasCreditEntry);

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
              <MDBox p={3}>
                <MDBox
                  display="flex"
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                  flexDirection={{ xs: "column", md: "row" }}
                  gap={2}
                  mb={2}
                >
                  <MDBox>
                    <MDTypography variant="h5" fontWeight="medium">
                      Date-wise Collection Details
                    </MDTypography>
                    <MDBox display="flex" alignItems="center" flexWrap="wrap" gap={1}>
                      <MDTypography variant="button" color="text">
                        Cash, UPI and cheque collections by company staff and delivery boy.
                      </MDTypography>
                      <MDTypography variant="button" fontWeight="bold" color="info">
                        Cash: {formatReportCurrency(collectionAmounts.cash)}
                      </MDTypography>
                      <MDTypography variant="button" fontWeight="bold" color="info">
                        UPI: {formatReportCurrency(collectionAmounts.upi)}
                      </MDTypography>
                      <MDTypography variant="button" fontWeight="bold" color="info">
                        Cheque: {formatReportCurrency(collectionAmounts.cheque)}
                      </MDTypography>
                    </MDBox>
                  </MDBox>
                  <MDButton
                    variant="outlined"
                    color="info"
                    size="small"
                    onClick={downloadCollectionPdf}
                    disabled={!filteredCollectionRows.length}
                  >
                    <Icon sx={{ mr: 1 }}>picture_as_pdf</Icon>
                    Download PDF
                  </MDButton>
                </MDBox>

                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6} md={3}>
                    <MDInput
                      type="date"
                      label="Date"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      value={collectionDate}
                      onChange={(event) => setCollectionDate(event.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth>
                      <InputLabel id="collection-company-filter-label">Company</InputLabel>
                      <Select
                        labelId="collection-company-filter-label"
                        label="Company"
                        value={collectionCompanyId}
                        sx={{ height: 43 }}
                        onChange={(event) => {
                          setCollectionCompanyId(event.target.value);
                          setCollectionCompanyStaffId("");
                          setCollectionDeliveryBoyName("");
                        }}
                      >
                        <MenuItem value="">All Companies</MenuItem>
                        {companyOptions.map((company) => (
                          <MenuItem key={company.id} value={String(company.id)}>{company.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth>
                      <InputLabel id="collection-company-staff-filter-label">Company Staff</InputLabel>
                      <Select
                        labelId="collection-company-staff-filter-label"
                        label="Company Staff"
                        value={collectionCompanyStaffId}
                        sx={{ height: 43 }}
                        disabled={!collectionCompanyId}
                        onChange={(event) => {
                          setCollectionCompanyStaffId(event.target.value);
                          setCollectionDeliveryBoyName("");
                        }}
                      >
                        <MenuItem value="">
                          {collectionCompanyId ? "All Company Staff" : "Choose company first"}
                        </MenuItem>
                        {filteredCompanyStaffOptions.map((staff) => (
                          <MenuItem key={staff.id} value={String(staff.id)}>{staff.name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth>
                      <InputLabel id="collection-delivery-boy-filter-label">Delivery Boy</InputLabel>
                      <Select
                        labelId="collection-delivery-boy-filter-label"
                        label="Delivery Boy"
                        value={collectionDeliveryBoyName}
                        sx={{ height: 43 }}
                        onChange={(event) => {
                          setCollectionDeliveryBoyName(event.target.value);
                          setCollectionCompanyStaffId("");
                        }}
                      >
                        <MenuItem value="">All Delivery Boys</MenuItem>
                        {collectionDeliveryBoyOptions.map((name) => (
                          <MenuItem key={name} value={name}>{name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

              </MDBox>
            </Card>
          </Grid>
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
                      label="Search by Outlet Name, Area, ID, Staff Name, Sale ID, or Invoice No"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                </Grid>

                <MDBox>
                  <TableContainer
                    component={Paper}
                    sx={{ ...paginatedTableContainerSx, backgroundColor: "transparent" }}
                  >
                    <Table stickyHeader size="small">
                      <TableHead sx={paginatedTableHeadSx()}>
                        <TableRow>
                          <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                            Sr No
                          </TableCell>
                          <TableCell align="left" sx={paginatedTableHeadCellSx}>Outlet Name</TableCell>
                          <TableCell align="left" sx={paginatedTableHeadCellSx}>Company</TableCell>
                          <TableCell align="left" sx={paginatedTableHeadCellSx}>Area</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Sale ID</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Invoice No</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>No. of Box</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>No. of Packet</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Invoice Price</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Paid Amount</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Balance Amount</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedSales.length > 0 ? (
                          paginatedSales.map((sale, index) => {
                            const balance = getRemainingBalance(sale);
                            const paid = getPaidAmount(sale);
                            return (
                              <TableRow key={sale.id} sx={getPaymentRowSx(sale)}>
                                <TableCell align="center">{(page - 1) * rowsPerPage + index + 1}</TableCell>
                                <TableCell align="left">
                                  <MDTypography variant="button" fontWeight="medium" color="dark">
                                    {sale.outlet_name}
                                  </MDTypography>
                                  <MDTypography display="block" variant="caption" color="text">
                                    Staff: {sale.staff_name || "N/A"}
                                  </MDTypography>
                                </TableCell>
                                <TableCell align="left">{sale.company_name || "N/A"}</TableCell>
                                <TableCell align="left">{sale.location_name || "N/A"}</TableCell>
                                <TableCell align="center">{sale.sticker_number}</TableCell>
                                <TableCell align="center">{sale.invoice_number}</TableCell>
                                <TableCell align="center">{sale.box_count || "N/A"}</TableCell>
                                <TableCell align="center">{sale.packet_count || "N/A"}</TableCell>
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
                                  <MDBox display="flex" justifyContent="center" alignItems="center" gap={1}>
                                    <Tooltip title="Manage Payments">
                                      <MDButton
                                        variant="outlined"
                                        color="info"
                                        size="small"
                                        iconOnly
                                        onClick={() => openPaymentDialog(sale)}
                                      >
                                        <Icon fontSize="small">payments</Icon>
                                      </MDButton>
                                    </Tooltip>
                                    <Tooltip title="Order Cancel">
                                      <MDButton
                                        variant="outlined"
                                        color="error"
                                        size="small"
                                        iconOnly
                                        onClick={() => openCancelDialog(sale)}
                                      >
                                        <Icon fontSize="small">cancel</Icon>
                                      </MDButton>
                                    </Tooltip>
                                    {Number(sale.payment_count || 0) === 0 && (
                                      <Tooltip title="Cancel Full Bill">
                                        <MDButton
                                          variant="outlined"
                                          color="error"
                                          size="small"
                                          iconOnly
                                          onClick={() => handleCancelFullBill(sale)}
                                          disabled={cancellingFullBillId === sale.id}
                                        >
                                          {cancellingFullBillId === sale.id
                                            ? <CircularProgress size={16} color="inherit" />
                                            : <Icon fontSize="small">cancel_presentation</Icon>}
                                        </MDButton>
                                      </Tooltip>
                                    )}
                                  </MDBox>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                              <MDTypography variant="body2" color="text">
                                No delivered items found matching your search.
                              </MDTypography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <TablePaginationFooter
                    page={page}
                    totalPages={totalPages}
                    total={filteredSales.length}
                    onPageChange={setPage}
                    limit={rowsPerPage}
                    onLimitChange={setRowsPerPage}
                  />
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


              {showPaymentForm && (
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
          <Tooltip title="Close">
            <MDButton variant="outlined" color="dark" iconOnly onClick={closePaymentDialog}>
              <Icon fontSize="small">close</Icon>
            </MDButton>
          </Tooltip>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!cancelDialogSale}
        onClose={closeCancelDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            width: "100%",
            maxWidth: 760,
            mx: 2,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          Log Cancelled Order
        </DialogTitle>
        <DialogContent>
          {cancelDialogSale && (
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
                  <strong>Outlet:</strong> {cancelDialogSale.outlet_name || "—"}
                </MDTypography>
                <MDTypography variant="body2">
                  <strong>Invoice:</strong> {cancelDialogSale.invoice_number || "—"}
                </MDTypography>
              </MDBox>

              <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <MDTypography variant="h6" fontWeight="medium">
                  Cancellation History
                </MDTypography>
                <MDBox display="flex" gap={1}>
                  {cancellationHistory.length > 0 && (
                    <Tooltip title="Print All">
                      <MDButton
                        variant="outlined"
                        color="info"
                        size="small"
                        iconOnly
                        onClick={handlePrintAllCancellations}
                      >
                        <Icon fontSize="small">print</Icon>
                      </MDButton>
                    </Tooltip>
                  )}
                </MDBox>
              </MDBox>

              {loadingCancellations ? (
                <MDTypography variant="body2" color="text">
                  Loading history...
                </MDTypography>
              ) : cancellationHistory.length === 0 ? (
                <MDTypography variant="body2" color="text">
                  No cancellations logged for this invoice.
                </MDTypography>
              ) : (
                <TableContainer
                  sx={{
                    boxShadow: "none",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    backgroundColor: "#fff",
                    overflowX: "auto",
                  }}
                >
                  <Table
                    size="small"
                    sx={{
                      tableLayout: "fixed",
                      width: "100%",
                      minWidth: 640,
                      "& .MuiTableCell-root": { overflow: "hidden", textOverflow: "ellipsis" },
                    }}
                  >
                    <colgroup>
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "30%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "12%" }} />
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
                          Product Name
                        </TableCell>
                        <TableCell align="left" sx={tableHeadSx}>
                          Qty to Cancel
                        </TableCell>
                        <TableCell align="right" sx={tableHeadSx}>
                          Amount
                        </TableCell>
                        <TableCell align="center" sx={tableHeadSx}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cancellationHistory.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell
                            align="left"
                            sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                          >
                            {c.created_at}
                          </TableCell>
                          <TableCell
                            align="left"
                            sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                          >
                            {c.product_name}
                          </TableCell>
                          <TableCell
                            align="left"
                            sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                          >
                            {formatCancelQtyDisplay(c)}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", fontWeight: 500, color: "#111827" }}
                          >
                            ₹{Number(c.amount).toFixed(2)}
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                            <Tooltip title="Print">
                              <MDButton
                                variant="outlined"
                                color="info"
                                size="small"
                                iconOnly
                                onClick={() => handlePrintCancellation(c)}
                              >
                                <Icon fontSize="small">print</Icon>
                              </MDButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <Tooltip title="Close">
            <MDButton variant="outlined" color="dark" iconOnly onClick={closeCancelDialog}>
              <Icon fontSize="small">close</Icon>
            </MDButton>
          </Tooltip>
          <Tooltip title="Add Cancellation">
            <MDButton variant="gradient" color="error" iconOnly onClick={openAddCancelDialog}>
              <Icon fontSize="small">add</Icon>
            </MDButton>
          </Tooltip>
        </DialogActions>
      </Dialog>

      <Dialog
        open={addCancelDialogOpen}
        onClose={closeAddCancelDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            width: "100%",
            maxWidth: 760,
            mx: 2,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          Add Cancellation
        </DialogTitle>
        <DialogContent>
          {cancelDialogSale && (
            <MDBox pt={1}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <MDInput
                    label="Outlet Name"
                    fullWidth
                    value={cancelDialogSale.outlet_name || ""}
                    InputProps={{ readOnly: true }}
                    disabled
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDInput
                    label="Invoice Number"
                    fullWidth
                    value={cancelDialogSale.invoice_number || ""}
                    InputProps={{ readOnly: true }}
                    disabled
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel id="cancellation-reason-label">Cancellation Reason *</InputLabel>
                    <Select
                      labelId="cancellation-reason-label"
                      label="Cancellation Reason *"
                      value={cancelForm.reason}
                      sx={{ height: 43 }}
                      onChange={(e) => handleCancelFormChange("reason", e.target.value)}
                    >
                      <MenuItem value="">Select reason</MenuItem>
                      <MenuItem value="Customer request">Customer request</MenuItem>
                      <MenuItem value="Product unavailable">Product unavailable</MenuItem>
                      <MenuItem value="Incorrect order">Incorrect order</MenuItem>
                      <MenuItem value="Duplicate order">Duplicate order</MenuItem>
                      <MenuItem value="Payment issue">Payment issue</MenuItem>
                      <MenuItem value="Delivery issue">Delivery issue</MenuItem>
                      <MenuItem value="Other">Other</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  {loadingCancelItems ? (
                    <MDTypography variant="body2" color="text" sx={{ pt: 1.5 }}>
                      Loading invoice products...
                    </MDTypography>
                  ) : cancelSaleItems.length > 0 ? (
                    <>
                      <FormControl fullWidth>
                        <InputLabel id="cancel-product-label">Product Name *</InputLabel>
                        <Select
                          labelId="cancel-product-label"
                          label="Product Name *"
                          value={cancelForm.selectedItemId}
                          sx={{ height: 43 }}
                          onChange={(e) => handleCancelProductSelect(e.target.value)}
                        >
                          <MenuItem value="">Select product</MenuItem>
                          <MenuItem value="manual">Manual entry</MenuItem>
                          {cancelSaleItems.map((item) => (
                            <MenuItem key={item.id} value={String(item.id)}>
                              {item.product_name} — Qty: {formatItemQtyDisplay(item.qty)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      {isManualCancelEntry && cancelForm.selectedItemId === "manual" && (
                        <MDBox mt={2}>
                          <MDInput
                            label="Product Name *"
                            fullWidth
                            value={cancelForm.productName}
                            onChange={(e) => handleCancelFormChange("productName", e.target.value)}
                          />
                        </MDBox>
                      )}
                    </>
                  ) : (
                    <MDInput
                      label="Product Name *"
                      fullWidth
                      value={cancelForm.productName}
                      onChange={(e) => handleCancelFormChange("productName", e.target.value)}
                    />
                  )}
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDInput
                    type="number"
                    label="Qty to Cancel"
                    fullWidth
                    value={cancelForm.productQtyToCancel}
                    onChange={(e) =>
                      selectedCancelItem
                        ? handleCancelQtyChange(e.target.value)
                        : handleCancelFormChange("productQtyToCancel", e.target.value)
                    }
                    inputProps={
                      selectedCancelItem
                        ? { min: 0, max: Number(selectedCancelItem.qty) || undefined, step: "any" }
                        : { min: 0, step: "any" }
                    }
                    helperText={
                      selectedCancelItem
                        ? `Ordered qty: ${formatItemQtyDisplay(selectedCancelItem.qty)}`
                        : undefined
                    }
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <MDInput
                    type="number"
                    label="Amount"
                    fullWidth
                    value={cancelForm.amount}
                    onChange={(e) => handleCancelFormChange("amount", e.target.value)}
                    inputProps={{ min: 0, step: "0.01" }}
                    helperText={
                      selectedCancelItem
                        ? "Auto-filled from qty; you can edit manually"
                        : "Enter cancel amount manually"
                    }
                  />
                </Grid>
              </Grid>
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <Tooltip title="Close">
            <span>
              <MDButton
                variant="outlined"
                color="dark"
                iconOnly
                onClick={closeAddCancelDialog}
                disabled={loggingCancel}
              >
                <Icon fontSize="small">close</Icon>
              </MDButton>
            </span>
          </Tooltip>
          <Tooltip title={loggingCancel ? "Saving..." : "Create Cancel"}>
            <span>
              <MDButton
                variant="gradient"
                color="error"
                iconOnly
                onClick={handleSaveCancellation}
                disabled={loggingCancel}
              >
                {loggingCancel ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <Icon fontSize="small">check</Icon>
                )}
              </MDButton>
            </span>
          </Tooltip>
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}

export default UpdatePayment;
