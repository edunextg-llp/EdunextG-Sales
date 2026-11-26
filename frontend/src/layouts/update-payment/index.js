// Payment > Update Payment: Tailwind CSS (no MUI). Sales, ledger, add / edit / delete payment, credit, cash notes,
// cancellation and Excel logic unchanged.
import CreditPhoto from "components/CreditPhoto";
import { formatBytes, prepareUpload } from "utils/compressImage";
import { Fragment, useState, useEffect, useRef, useCallback } from "react";
import { notifySalesUpdated, useSalesPolling } from "utils/salesSync";
import { downloadSalesExcel } from "utils/downloadSalesExcel";
import { getUnupdatedPaymentSales, unupdatedPaymentColumns } from "utils/unupdatedPaymentExport";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useAuth } from "context/AuthContext";
import { ROWS_PER_PAGE } from "utils/tablePagination";
import { COMPANY_TYPES, useCompanyTypeLookup } from "utils/companyTypes";
import {
  Badge, Card, Field, Icon, Modal, Notice, PageHeader, Pagination, SearchBox, Spinner, TriCheck, btn, fieldClass,
} from "components/tw";

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
  }, { paise: "" });

const parseCashDetails = (value) => {
  if (!value) return emptyCashNotes();
  try {
    return { ...emptyCashNotes(), ...(typeof value === "string" ? JSON.parse(value) : value) };
  } catch (error) {
    return emptyCashNotes();
  }
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
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canCancelProducts = isAdmin || user?.permissions?.includes("product_cancellation");
  const [searchQuery, setSearchQuery] = useState("");
  const [salesCompanyId, setSalesCompanyId] = useState("");
  const [salesCompanyType, setSalesCompanyType] = useState("");
  const [paymentUpdateFilter, setPaymentUpdateFilter] = useState("all");
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState([]);
  const [movingToDelivery, setMovingToDelivery] = useState(false);
  const [moveDeliveryMessage, setMoveDeliveryMessage] = useState("");
  const moveInProgress = useRef(false);
  const [downloadingUnupdated, setDownloadingUnupdated] = useState(false);
  const [collectionDate, setCollectionDate] = useState(getTodayLocalDate());
  const [collectionEndDate, setCollectionEndDate] = useState(getTodayLocalDate());
  const [paymentDetailRows, setPaymentDetailRows] = useState([]);
  const [collectionCompanyStaffId, setCollectionCompanyStaffId] = useState("");
  const [collectionCompanyId, setCollectionCompanyId] = useState("");
  const [collectionCompanyType, setCollectionCompanyType] = useState("");
  const { matches: companyMatchesType } = useCompanyTypeLookup();
  const [companyOptions, setCompanyOptions] = useState([]);
  const [companyStaff, setCompanyStaff] = useState([]);
  const [salesData, setSalesData] = useState([]);
  const [paymentDialogSale, setPaymentDialogSale] = useState(null);
  const [payments, setPayments] = useState([]);
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm());
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState("");
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [activeCreditPayment, setActiveCreditPayment] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoSaleId, setPhotoSaleId] = useState(null);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [cancelDialogSale, setCancelDialogSale] = useState(null);
  const [cancellingFullBillId, setCancellingFullBillId] = useState(null);
  const [cancelForm, setCancelForm] = useState({
    selectedItemId: "",
    productName: "",
    productQtyToCancel: "",
    amount: "",
    reason: "",
    remarks: "",
    invoiceImageFile: null,
  });
  const [cancelSaleItems, setCancelSaleItems] = useState([]);
  const [loadingCancelItems, setLoadingCancelItems] = useState(false);
  const [loggingCancel, setLoggingCancel] = useState(false);
  const [cancelImageBusy, setCancelImageBusy] = useState(false);
  const [cancelImageError, setCancelImageError] = useState("");
  const [cancelImageNote, setCancelImageNote] = useState("");
  const [addCancelDialogOpen, setAddCancelDialogOpen] = useState(false);
  const [cancellationHistory, setCancellationHistory] = useState([]);
  const [loadingCancellations, setLoadingCancellations] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);

  const API = (process.env.REACT_APP_API_URL);

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

  // Admin -> "Admin"; anyone else -> "Name (Login ID)". Older entries saved before
  // this was tracked have nothing stored and show "Not recorded".
  const getPaymentUpdatedBy = (payment) => {
    if (payment.updated_by_role === "admin") return "Admin";
    const name = payment.updated_by_name && payment.updated_by_name !== "Staff" ? payment.updated_by_name : "";
    const code = payment.updated_by_employee_code || "";
    if (!name && !code) return "Not recorded";
    return name && code ? `${name} (${code})` : name || code;
  };

  const inferCollectorType = (payment) =>
    payment.collector_name && !payment.collector_staff_id ? "bawarchee_staff" : "company_staff";

  const fetchSales = useCallback(async (search = searchQuery) => {
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
  }, [API, searchQuery]);

  useSalesPolling(useCallback(() => fetchSales(searchQuery), [fetchSales, searchQuery]));

  const downloadUnupdatedPayments = async () => {
    if (!salesCompanyId || downloadingUnupdated) return;
    setDownloadingUnupdated(true);
    try {
      // Fetch all invoices fresh so the export is independent of search and pagination.
      const response = await fetch(`${API}/staff/sales/by-date`);
      if (!response.ok) throw new Error("Unable to load invoices");
      const rows = getUnupdatedPaymentSales(await response.json(), salesCompanyId);
      if (!rows.length) {
        alert("No delivered invoices without payment updates were found for this company.");
        return;
      }
      await downloadSalesExcel(rows, `No_Payment_Updates_Company_${salesCompanyId}`, unupdatedPaymentColumns);
    } catch (error) {
      console.error("Unable to export invoices without payment updates:", error);
      alert("Unable to download the Excel report. Please try again.");
    } finally {
      setDownloadingUnupdated(false);
    }
  };

  const fetchCollectionReport = async () => {
    try {
      const params = new URLSearchParams();
      if (collectionDate) {
        params.set("startDate", collectionDate);
      }
      if (collectionEndDate) {
        params.set("endDate", collectionEndDate);
      }
      if (collectionCompanyId) {
        params.set("companyId", collectionCompanyId);
      }
      const response = await fetch(`${API}/staff/reports/payments?${params.toString()}`);
      if (!response.ok) throw new Error("Unable to load payment update history");
      setPaymentDetailRows(await response.json());
    } catch (error) {
      console.error("Error fetching payment update history:", error);
      setPaymentDetailRows([]);
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
    setCollectionCompanyStaffId("");
    fetchCollectionReport();
  }, [collectionDate, collectionEndDate, collectionCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const filteredPaymentDetailRows = paymentDetailRows.filter((row) => (
    !collectionCompanyStaffId || String(row.staff_id) === String(collectionCompanyStaffId)
  ));

  const downloadPaymentExcel = async () => {
    const params = new URLSearchParams();
    if (collectionDate) params.set("startDate", collectionDate);
    if (collectionEndDate) params.set("endDate", collectionEndDate);
    if (collectionCompanyId) params.set("companyId", collectionCompanyId);
    if (collectionCompanyStaffId) params.set("staffId", collectionCompanyStaffId);
    try {
      const response = await fetch(`${API}/staff/reports/payments/export?${params.toString()}`);
      if (!response.ok) throw new Error("Unable to download payment report");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Payment_Details_${collectionDate || "all"}_to_${collectionEndDate || "all"}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Payment report download failed:", error);
      alert("Unable to download the Excel report. Please try again.");
    }
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, salesCompanyId, paymentUpdateFilter, rowsPerPage]);

  useEffect(() => {
    setSelectedDeliveryIds([]);
    setMoveDeliveryMessage("");
  }, [searchQuery, salesCompanyId, paymentUpdateFilter]);

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

  const filteredSales = salesData.filter((row) => (
    row.packaging_status === "delivered" &&
    (paymentUpdateFilter === "all" ||
      (Number(row.payment_count) === 0 && Number(row.paid_amount || 0) === 0)) &&
    (!salesCompanyId || String(row.company_ids || "")
      .split(",")
      .some((id) => id.trim() === String(salesCompanyId)))
  ));
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / rowsPerPage));
  const selectedMoveIds = paymentUpdateFilter === "none"
    ? filteredSales.filter((sale) => selectedDeliveryIds.includes(Number(sale.id))).map((sale) => Number(sale.id))
    : [];
  const allMoveSelected = filteredSales.length > 0 && selectedMoveIds.length === filteredSales.length;
  const toggleAllMoveBills = () => setSelectedDeliveryIds(
    allMoveSelected ? [] : filteredSales.map((sale) => Number(sale.id))
  );
  const moveSelectedToDelivery = async () => {
    if (!selectedMoveIds.length || moveInProgress.current) return;
    moveInProgress.current = true;
    setMovingToDelivery(true);
    setMoveDeliveryMessage("");
    try {
      const response = await fetch(`${API}/staff/sales/move-to-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleIds: selectedMoveIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to move selected bills.");
      notifySalesUpdated();
      setSalesData((current) => current.filter((sale) => !result.movedIds.includes(Number(sale.id))));
      setSelectedDeliveryIds([]);
      setPage(1);
      setMoveDeliveryMessage(`${result.movedIds.length} bill(s) moved to Delivery Management → Pending Deliveries.${result.skippedIds.length ? ` ${result.skippedIds.length} skipped because their status or payment activity changed.` : ""}`);
      await fetchSales();
    } catch (error) {
      setMoveDeliveryMessage(error.message || "Unable to move selected bills.");
    } finally {
      moveInProgress.current = false;
      setMovingToDelivery(false);
    }
  };
  const paginatedSales = filteredSales.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const getEffectiveInvoicePrice = (sale) => {
    const explicitEffectivePrice = parseFloat(sale?.effectivePrice ?? sale?.effective_price);
    if (!Number.isNaN(explicitEffectivePrice)) return Math.max(0, explicitEffectivePrice);

    const originalPrice = parseFloat(sale?.price) || 0;
    const cancelledAmount = parseFloat(sale?.cancelledAmount ?? sale?.cancelled_amount) || 0;
    return Math.max(0, originalPrice - cancelledAmount);
  };

  const getRemainingBalance = (sale) => {
    const price = getEffectiveInvoicePrice(sale);
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
    const price = getEffectiveInvoicePrice(sale);
    return Math.max(0, price - getRemainingBalance(sale));
  };

  const getPaymentRowSx = (sale) => {
    const price = getEffectiveInvoicePrice(sale);
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
      remarks: "",
      invoiceImageFile: null,
    });
    setCancelImageError("");
    setCancelImageNote("");
  };

  // Max 1 MB; photos above 70 KB are shrunk to about 70 KB before upload.
  const handleCancelImageSelect = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;
    setCancelImageBusy(true);
    setCancelImageError("");
    setCancelImageNote("");
    setCancelForm((prev) => ({ ...prev, invoiceImageFile: null }));
    try {
      const prepared = await prepareUpload(file, { allowPdf: true });
      setCancelForm((prev) => ({ ...prev, invoiceImageFile: prepared }));
      setCancelImageNote(
        prepared === file
          ? `${file.name} · ${formatBytes(file.size)}`
          : `${file.name} · reduced from ${formatBytes(file.size)} to ${formatBytes(prepared.size)}`
      );
    } catch (error) {
      setCancelImageError(error.message);
    } finally {
      setCancelImageBusy(false);
    }
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

    const { productName, productQtyToCancel, amount, reason, remarks, invoiceImageFile } = cancelForm;

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
    if (!invoiceImageFile) {
      alert("Please upload the cancellation invoice image.");
      return;
    }
    if (invoiceImageFile.size > 1024 * 1024) {
      alert("File must not be more than 1 MB.");
      return;
    }

    setLoggingCancel(true);
    try {
      const uploadData = new FormData();
      uploadData.append("file", invoiceImageFile);
      uploadData.append("documentType", "cancellation-invoice");
      const uploadResponse = await fetch(`${API}/staff/upload-document`, { method: "POST", body: uploadData });
      const uploadResult = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || !uploadResult.url) throw new Error(uploadResult.error || "Unable to upload the invoice image.");
      const response = await fetch(
        `${API}/staff/sales/${cancelDialogSale.id}/cancellation-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outletName: cancelDialogSale.outlet_name,
            invoiceNumber: cancelDialogSale.invoice_number,
            productName: productName.trim(),
            // Placeholder items (e.g. "manual-entry") have no real sale item id.
            saleItemId: Number(selectedCancelItem?.id) > 0 ? Number(selectedCancelItem.id) : null,
            productErpId: selectedCancelItem?.product_erp_id || "",
            productQty: parsedQty,
            amount: parsedAmount,
            reason,
            remarks: remarks.trim(),
            invoiceImageUrl: uploadResult.url,
          }),
        }
      );

      if (response.ok) {
        alert("Product cancellation applied successfully.");
        closeAddCancelDialog();
        await fetchSales();
        await fetchCancellationHistory(cancelDialogSale.id);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to send cancellation request.");
      }
    } catch (error) {
      console.error("Error sending cancellation request:", error);
      alert(error.message || "Error sending cancellation request.");
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
              <div class="row"><strong>Reason:</strong> <span>${cancellation.reason || "—"}</span></div>
              <div class="row"><strong>Remarks:</strong> <span>${cancellation.remarks || "—"}</span></div>
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
          <td>${c.reason || "—"}</td>
          <td>${c.remarks || "—"}</td>
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
                <th>Reason</th>
                <th>Remarks</th>
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
      cashNotes: payment.payment_mode === "cash" ? parseCashDetails(payment.cash_details) : emptyCashNotes(),
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
      collectorType: "company_staff",
      collectorStaffId: getOutletMarketingStaffId(),
      collectorDeliveryBoyId: "",
      collectorName: "",
    });
  };

  const handlePaymentFormChange = (field, value) => {
    setPaymentForm((prev) => {
      if (field === "paymentMode") {
        return {
          ...prev,
          paymentMode: value,
          amount: value === "credit" ? String(dialogRemaining) : value === "cash" ? "" : prev.amount,
          cashNotes: value === "cash" ? emptyCashNotes() : prev.cashNotes,
          referenceNo: "",
          referenceDate: "",
          creditDays: value === "credit" ? "14" : "",
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
    ) + (parseInt(cashNotes.paise, 10) || 0) / 100;

  const handleCashNoteChange = (denomination, value) => {
    const maximum = denomination === "paise" ? 99 : Number.MAX_SAFE_INTEGER;
    const count = value === "" ? "" : Math.min(maximum, Math.max(0, parseInt(value, 10) || 0));

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
    if (payment.payment_mode === "cash") {
      const cashDetails = parseCashDetails(payment.cash_details);
      const parts = CASH_DENOMINATIONS
        .filter((item) => (parseInt(cashDetails[item.key], 10) || 0) > 0)
        .map((item) => {
          return `₹${item.denomination} × ${parseInt(cashDetails[item.key], 10)}`;
        });
      const paise = parseInt(cashDetails.paise, 10) || 0;
      if (paise > 0) parts.push(`${paise} paise`);
      return parts.join(", ") || "—";
    }
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

  // Open balance this payment is measured against (editing adds back the payment's old amount).
  const getFormRemainingBalance = () => {
    let remaining = paymentSummary?.balanceAmount ?? getRemainingBalance(paymentDialogSale);
    if (editingPaymentId) {
      const oldPayment = payments.find((p) => p.id === editingPaymentId);
      if (oldPayment && ["cash", "upi", "cheque"].includes(oldPayment.payment_mode)) {
        remaining += parseFloat(oldPayment.amount) || 0;
      }
    }
    return Math.round((Number(remaining) || 0) * 100) / 100;
  };
  const editingPayment = editingPaymentId ? payments.find((p) => p.id === editingPaymentId) : null;
  const formAmount = parseFloat(paymentForm.amount);
  const formRemaining = paymentDialogSale ? getFormRemainingBalance() : 0;
  // Collecting less than the balance leaves the rest due, so the invoice photo is required
  // (same as Credit). Paying off an existing credit entry is exempt: its photo already exists.
  const isPartialPayment =
    Boolean(paymentDialogSale) &&
    ["cash", "upi", "cheque"].includes(paymentForm.paymentMode) &&
    !activeCreditPayment &&
    !editingPayment?.parent_credit_payment_id &&
    Number.isFinite(formAmount) &&
    formAmount > 0 &&
    formRemaining - formAmount > 0.001;
  const needsInvoicePhoto = paymentForm.paymentMode === "credit" || isPartialPayment;

  const validatePaymentForm = () => {
    const amount = parseFloat(paymentForm.amount);

    if (paymentForm.paymentMode === "cash") {
      const hasCashCount = CASH_DENOMINATIONS.some(
        (item) => (parseInt(paymentForm.cashNotes[item.key], 10) || 0) > 0
      ) || (parseInt(paymentForm.cashNotes.paise, 10) || 0) > 0;
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

    if (paymentForm.paymentMode === "credit" && (!Number.isInteger(Number(paymentForm.creditDays)) || Number(paymentForm.creditDays) < 1 || Number(paymentForm.creditDays) > 14)) {
      alert("Credit days must be between 1 and 14.");
      return null;
    }

    if (paymentForm.paymentMode === "cheque" && !paymentForm.referenceNo.trim()) {
      alert("Please enter cheque number.");
      return null;
    }

    if (needsInvoicePhoto && photoSaleId !== Number(paymentDialogSale?.id)) {
      alert(
        paymentForm.paymentMode === "credit"
          ? "Upload a credit photo before submitting Credit."
          : `Amount is less than the balance (₹${formRemaining.toFixed(2)}). Upload the invoice photo first.`
      );
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
      cashDetails: paymentForm.paymentMode === "cash" ? paymentForm.cashNotes : null,
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

      if (response.status === 202) {
        // Backdated payment by a non-admin: saved as a request, applied after admin approval.
        const data = await response.json().catch(() => ({}));
        setEditingPaymentId(null);
        setActiveCreditPayment(null);
        setPaymentForm(buildDefaultPaymentForm());
        setPaymentSuccessMessage(
          data.message || "Backdated payment sent to the admin for approval."
        );
        alert(data.message || "Backdated payment sent to the admin for approval.");
      } else if (response.ok) {
        const data = await response.json();
        const outletName = paymentDialogSale.outlet_name || "the selected outlet";

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
        setPaymentSuccessMessage(
          `${isEditing ? "Payment updated" : "Payment added"} successfully for ${outletName}.` +
          (data.autoCreditAmount > 0
            ? ` Remaining ₹${Number(data.autoCreditAmount).toFixed(2)} placed on 14-day credit from the payment date.`
            : "")
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

  const paymentProgressPercentage = (() => {
    const invoiceValue = getEffectiveInvoicePrice(paymentSummary ?? paymentDialogSale);
    const paidAmount = Number(paymentSummary?.paidAmount ?? (paymentDialogSale ? getPaidAmount(paymentDialogSale) : 0)) || 0;
    return invoiceValue > 0 ? Math.min(100, Math.max(0, (paidAmount / invoiceValue) * 100)) : 0;
  })();

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

  const collectionTypedCompanies = companyOptions.filter((company) =>
    companyMatchesType(company, collectionCompanyType)
  );
  const handleCollectionCompanyTypeChange = (type) => {
    setCollectionCompanyType(type);
    if (collectionCompanyId && type && !companyMatchesType(collectionCompanyId, type)) {
      setCollectionCompanyId("");
      setCollectionCompanyStaffId("");
    }
  };

  const salesTypedCompanies = companyOptions.filter((company) =>
    companyMatchesType(company, salesCompanyType)
  );
  const handleSalesCompanyTypeChange = (type) => {
    setSalesCompanyType(type);
    if (salesCompanyId && type && !companyMatchesType(salesCompanyId, type)) {
      setSalesCompanyId("");
    }
  };

  const head = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const cell = "border-t border-slate-200/70 px-3 py-2.5 text-[12.5px]";
  const mini = "whitespace-nowrap bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const miniTd = "border-t border-slate-100 px-3 py-2 text-[12.5px] text-slate-700";
  const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const MODE_TONE = { cash: "green", upi: "blue", cheque: "amber", credit: "violet" };
  const typeSelect = (id, value, onChange) => (
    <Field label="Company type" width="w-36">
      <select id={id} className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All types</option>
        {COMPANY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
      </select>
    </Field>
  );
  const paymentActions = (payment, withCredit) => {
    const creditRemaining = withCredit ? getCreditRemainingAmount(payment) : 0;
    return (
      <span className="inline-flex items-center gap-1">
        {withCredit && (
          <button type="button" className={`${btn.primary} h-8 bg-emerald-600 px-3 hover:bg-emerald-700`} disabled={creditRemaining <= 0 || dialogRemaining <= 0} onClick={() => startAddAgainstCredit(payment)}>
            <Icon name="add" className="text-[16px]" />Add
          </button>
        )}
        <button type="button" className={`${btn.icon} text-blue-600 hover:bg-blue-50`} title="Edit payment" aria-label="Edit payment" onClick={() => startEditPayment(payment)}>
          <Icon name="edit" className="text-[18px]" />
        </button>
        <button type="button" className={`${btn.icon} text-red-500 hover:bg-red-50 hover:text-red-600`} title="Delete payment" aria-label="Delete payment" disabled={deletingPaymentId === payment.id || addingPayment} onClick={() => handleDeletePayment(payment)}>
          <Icon name="delete" className="text-[18px]" />
        </button>
      </span>
    );
  };
  const numberBox = (text, key, max) => (
    <label key={key} className="flex flex-col gap-1">
      <span className={label}>{text}</span>
      <input
        type="number" min={0} max={max} step={1} className={`${fieldClass} text-center`}
        value={paymentForm.cashNotes[key] || ""} onChange={(e) => handleCashNoteChange(key, e.target.value)}
      />
    </label>
  );

  // The success toast hides itself after 4 seconds.
  useEffect(() => {
    if (!paymentSuccessMessage) return undefined;
    const timer = setTimeout(() => setPaymentSuccessMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [paymentSuccessMessage]);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Update Payment"
          description="Record cash, UPI, cheque and credit payments for delivered invoices, log cancelled items, and download payment reports."
        />

        {/* Payment update history download */}
        <Card className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div>
              <h3 className="m-0 text-[15px] font-semibold text-slate-900">Payment Update History</h3>
              <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">Download every payment update with its payment date, filtered by company and staff.</p>
            </div>
            <button type="button" className={btn.outline} onClick={downloadPaymentExcel} disabled={!filteredPaymentDetailRows.length}>
              <Icon name="download" className="text-[18px] text-emerald-600" />Download Excel
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3 px-4 py-3">
            <Field label="From date" width="w-40"><input type="date" className={fieldClass} value={collectionDate} onChange={(event) => setCollectionDate(event.target.value)} /></Field>
            <Field label="To date" width="w-40"><input type="date" className={fieldClass} value={collectionEndDate} min={collectionDate || undefined} onChange={(event) => setCollectionEndDate(event.target.value)} /></Field>
            {typeSelect("collection-company-type", collectionCompanyType, handleCollectionCompanyTypeChange)}
            <Field label="Company" width="w-52">
              <select className={fieldClass} value={collectionCompanyId} onChange={(event) => { setCollectionCompanyId(event.target.value); setCollectionCompanyStaffId(""); }}>
                <option value="">All companies</option>
                {collectionTypedCompanies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Company staff" width="w-52">
              <select className={fieldClass} value={collectionCompanyStaffId} disabled={!collectionCompanyId} onChange={(event) => setCollectionCompanyStaffId(event.target.value)}>
                <option value="">{collectionCompanyId ? "All company staff" : "Choose company first"}</option>
                {filteredCompanyStaffOptions.map((staff) => <option key={staff.id} value={String(staff.id)}>{staff.name}</option>)}
              </select>
            </Field>
          </div>
        </Card>

        {/* Bills to update */}
        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-[15px] font-semibold text-slate-900">Update Payment Details</h3>
              <span className="flex flex-wrap items-center gap-3 text-[11.5px] text-slate-500">
                {[["bg-white ring-1 ring-slate-300", "No payment"], ["bg-amber-100", "Part paid"], ["bg-red-100", "Unpaid (activity)"], ["bg-green-100", "Fully paid"]].map(([sw, text]) => (
                  <span key={text} className="inline-flex items-center gap-1.5"><span className={`size-3 rounded ${sw}`} />{text}</span>
                ))}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex min-w-64 grow flex-col gap-1">
                <span className={label}>Search</span>
                <SearchBox value={searchQuery} onChange={setSearchQuery} className="w-full" placeholder="Outlet, area, ID, staff, sale ID or invoice no" />
              </div>
              {typeSelect("sales-company-type", salesCompanyType, handleSalesCompanyTypeChange)}
              <Field label="Company" width="w-52">
                <select className={fieldClass} value={salesCompanyId} disabled={downloadingUnupdated} onChange={(event) => setSalesCompanyId(event.target.value)}>
                  <option value="">All companies</option>
                  {salesTypedCompanies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
                </select>
              </Field>
              <Field label="Payment updates" width="w-48">
                <select className={fieldClass} value={paymentUpdateFilter} onChange={(event) => setPaymentUpdateFilter(event.target.value)}>
                  <option value="all">All bills</option>
                  <option value="none">No payment updates</option>
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className={btn.outline} onClick={downloadUnupdatedPayments} disabled={!salesCompanyId || downloadingUnupdated}>
                <Icon name="download" className="text-[18px] text-emerald-600" />
                {downloadingUnupdated ? "Downloading..." : "Download Excel - No Payment Updates"}
              </button>
              <span className="text-[12px] text-slate-500">
                Select a company to download all delivered invoices with no payment entries,
                sorted by invoice number. Search does not limit this download.
              </span>
            </div>
            {paymentUpdateFilter === "none" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-blue-50/60 px-3 py-2">
                <button type="button" className={btn.outline} onClick={toggleAllMoveBills} disabled={movingToDelivery || !filteredSales.length}>
                  {allMoveSelected ? "Clear Selection" : `Select All (${filteredSales.length})`}
                </button>
                <button type="button" className={btn.primary} onClick={moveSelectedToDelivery} disabled={movingToDelivery || !selectedMoveIds.length}>
                  <Icon name="local_shipping" className="text-[18px]" />
                  {movingToDelivery ? "Moving..." : `Move to Delivery (${selectedMoveIds.length})`}
                </button>
                <span className="text-[12px] text-slate-500">Select All includes all matching bills across pages.</span>
              </div>
            )}
            {moveDeliveryMessage && <Notice tone="info" className="mt-3">{moveDeliveryMessage}</Notice>}
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1250px] border-separate border-spacing-0">
              <thead>
                <tr>
                  {paymentUpdateFilter === "none" && (
                    <th className={`${head} w-10`}>
                      <TriCheck checked={allMoveSelected} indeterminate={selectedMoveIds.length > 0 && !allMoveSelected} onChange={toggleAllMoveBills} disabled={movingToDelivery || !filteredSales.length} label="Select all matching bills" />
                    </th>
                  )}
                  <th className={`${head} text-center`}>#</th>
                  {["Outlet", "Company", "Area"].map((h) => <th key={h} className={`${head} text-left`}>{h}</th>)}
                  {["Sale ID", "Invoice no", "Boxes", "Packets"].map((h) => <th key={h} className={`${head} text-center`}>{h}</th>)}
                  {["Invoice price", "Paid", "Balance"].map((h) => <th key={h} className={`${head} text-right`}>{h}</th>)}
                  <th className={`${head} text-center`}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSales.length > 0 ? paginatedSales.map((sale, index) => {
                  const balance = getRemainingBalance(sale);
                  const paid = getPaidAmount(sale);
                  const originalPrice = Number(sale.price) || 0;
                  const updatedPrice = getEffectiveInvoicePrice(sale);
                  const hasCancellation = updatedPrice < originalPrice - 0.001;
                  return (
                    <tr key={sale.id} style={{ backgroundColor: getPaymentRowSx(sale).backgroundColor }}>
                      {paymentUpdateFilter === "none" && (
                        <td className={cell}>
                          <input type="checkbox" className="size-4 accent-blue-600" checked={selectedMoveIds.includes(Number(sale.id))} disabled={movingToDelivery} aria-label={`Select invoice ${sale.invoice_number || sale.id}`} onChange={() => setSelectedDeliveryIds((current) => current.includes(Number(sale.id)) ? current.filter((id) => id !== Number(sale.id)) : [...current, Number(sale.id)])} />
                        </td>
                      )}
                      <td className={`${cell} text-center text-slate-400`}>{(page - 1) * rowsPerPage + index + 1}</td>
                      <td className={cell}>
                        <span className="block font-semibold text-slate-900">{sale.outlet_name}</span>
                        <span className="block text-[11.5px] text-slate-500">Staff: {sale.staff_name || "N/A"}</span>
                      </td>
                      <td className={`${cell} whitespace-nowrap`}>{sale.company_name || "N/A"}</td>
                      <td className={`${cell} whitespace-nowrap`}>{sale.location_name || "N/A"}</td>
                      <td className={`${cell} text-center font-semibold`}>{sale.sticker_number}</td>
                      <td className={`${cell} text-center font-mono`}>{sale.invoice_number}</td>
                      <td className={`${cell} text-center tabular-nums`}>{sale.box_count || "N/A"}</td>
                      <td className={`${cell} text-center tabular-nums`}>{sale.packet_count || "N/A"}</td>
                      <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>
                        {hasCancellation ? (
                          <>
                            <span className="block text-[11px] text-slate-500 line-through">OrgP ₹{originalPrice.toFixed(2)}</span>
                            <span className="block font-bold text-blue-700">UP ₹{updatedPrice.toFixed(2)}</span>
                          </>
                        ) : `₹${originalPrice.toFixed(2)}`}
                      </td>
                      <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>₹{paid.toFixed(2)}</td>
                      <td className={`${cell} whitespace-nowrap text-right font-bold tabular-nums ${balance > 0 ? "text-red-700" : "text-emerald-700"}`}>₹{balance.toFixed(2)}</td>
                      <td className={`${cell} text-center`}>
                        <span className="inline-flex gap-0.5 rounded-lg bg-white/80 p-0.5 ring-1 ring-black/5">
                          <button type="button" className={`${btn.icon} text-blue-600 hover:bg-blue-50`} title="Manage payments" aria-label="Manage payments" onClick={() => openPaymentDialog(sale)}>
                            <Icon name="payments" className="text-[19px]" />
                          </button>
                          {canCancelProducts && <button type="button" className={`${btn.icon} text-red-500 hover:bg-red-50 hover:text-red-600`} title="Cancel product" aria-label="Cancel product" onClick={() => openCancelDialog(sale)}>
                            <Icon name="cancel" className="text-[19px]" />
                          </button>}
                          {Number(sale.payment_count || 0) === 0 && (
                            <button type="button" className={`${btn.icon} text-red-600 hover:bg-red-50`} title="Cancel full bill" aria-label="Cancel full bill" onClick={() => handleCancelFullBill(sale)} disabled={cancellingFullBillId === sale.id}>
                              {cancellingFullBillId === sale.id ? <Spinner className="size-4" /> : <Icon name="cancel_presentation" className="text-[19px]" />}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={paymentUpdateFilter === "none" ? 13 : 12} className="px-4 py-14 text-center text-[13px] text-slate-400">No delivered items found matching your filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={filteredSales.length} onPageChange={setPage} limit={rowsPerPage} onLimitChange={setRowsPerPage} />
        </Card>
      </div>

      {/* Payment ledger */}
      <Modal
        open={!!paymentDialogSale} onClose={closePaymentDialog} size="xl"
        title={(
          <span className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon name="account_balance_wallet" className="text-[22px]" /></span>
              <span>
                <span className="block leading-tight">Payment Ledger</span>
                <span className="block text-[12px] font-normal text-slate-500">{paymentDialogSale?.outlet_name || "Outlet"} · Invoice {paymentDialogSale?.invoice_number || "N/A"}</span>
              </span>
            </span>
            <Badge tone={dialogRemaining > 0 ? "amber" : "green"} icon={dialogRemaining > 0 ? "schedule" : "check_circle"}>{dialogRemaining > 0 ? "Payment Pending" : "Fully Paid"}</Badge>
          </span>
        )}
        actions={<button type="button" className={btn.ghost} onClick={closePaymentDialog}>Close Ledger</button>}
      >
        {paymentDialogSale && (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Sale ID", value: paymentDialogSale.sticker_number || "N/A" },
                { label: "Invoice", value: paymentDialogSale.invoice_number || "N/A" },
                { label: "Original price", value: `₹${Number(paymentSummary?.price ?? paymentDialogSale.price).toFixed(2)}` },
                ...(Number(paymentSummary?.cancelledAmount ?? paymentDialogSale.cancelled_amount) > 0
                  ? [{
                    label: "Updated price",
                    value: `₹${getEffectiveInvoicePrice(paymentSummary ?? paymentDialogSale).toFixed(2)}`,
                    tone: "text-blue-700",
                  }]
                  : []),
                { label: "Paid", value: `₹${Number(paymentSummary?.paidAmount ?? getPaidAmount(paymentDialogSale)).toFixed(2)}`, tone: "text-emerald-700" },
                { label: "Balance", value: `₹${dialogRemaining.toFixed(2)}`, tone: dialogRemaining > 0 ? "text-red-700" : "text-emerald-700" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</span>
                  <span className={`block truncate text-[14px] font-bold tabular-nums ${item.tone || "text-slate-900"}`}>{item.value}</span>
                </div>
              ))}
            </div>
            {totalCreditOnAccount > 0 && (
              <p className="m-0 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[12.5px] text-amber-900">
                Credit remaining: <b>₹{remainingCreditOnAccount.toFixed(2)}</b> of ₹{totalCreditOnAccount.toFixed(2)}
              </p>
            )}

            <div className="mb-5 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-semibold text-slate-800">Payment progress</span>
                <span className="font-semibold text-slate-500">{paymentProgressPercentage.toFixed(0)}% paid</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full rounded-full transition-all duration-300 ${dialogRemaining > 0 ? "bg-blue-600" : "bg-emerald-600"}`} style={{ width: `${paymentProgressPercentage}%` }} />
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <h4 className="m-0 flex items-center gap-1.5 text-[14px] font-semibold text-slate-900"><Icon name="history" className="text-[19px] text-blue-600" />Payment History</h4>
              <span className="text-[12px] text-slate-500">{payments.length} entries</span>
            </div>

            {loadingPayments ? (
              <p className="m-0 mb-5 text-[13px] text-slate-400">Loading payments...</p>
            ) : payments.length === 0 ? (
              <p className="m-0 mb-5 rounded-xl border border-dashed border-slate-300 px-4 py-4 text-[12.5px] text-slate-500">
                No payments recorded yet. After the first cash, UPI or cheque payment on a delivered invoice, any remaining balance is automatically placed on 14-day credit from the payment date. Credit does not count as paid.
              </p>
            ) : (
              <div className="mb-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[760px] table-fixed border-collapse">
                  <colgroup>
                    {["12%", "11%", "12%", "16%", "30%", "19%"].map((width, i) => <col key={width + String(i)} style={{ width }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={mini}>Date</th>
                      <th className={mini}>Mode</th>
                      <th className={`${mini} text-right`}>Amount</th>
                      <th className={mini}>Collector</th>
                      <th className={mini}>Details</th>
                      <th className={`${mini} text-center`}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topLevelPayments.map((payment) => {
                      const creditChildren = payment.payment_mode === "credit" ? getCreditChildPayments(payment) : [];
                      const creditRemaining = payment.payment_mode === "credit" ? getCreditRemainingAmount(payment) : 0;

                      return (
                        <Fragment key={payment.id}>
                          <tr className={editingPaymentId === payment.id ? "bg-yellow-50" : "hover:bg-slate-50"}>
                            <td className={`${miniTd} whitespace-nowrap`}>{toInputDate(payment.payment_date)}</td>
                            <td className={miniTd}><Badge tone={MODE_TONE[payment.payment_mode] || "slate"}>{PAYMENT_MODE_LABELS[payment.payment_mode] || payment.payment_mode}</Badge></td>
                            <td className={`${miniTd} text-right font-semibold tabular-nums text-slate-900`}>₹{Number(payment.amount).toFixed(2)}</td>
                            <td className={`${miniTd} truncate`}>{getCollectorName(payment)}</td>
                            <td className={miniTd}>
                              <span className="block truncate text-[12px] text-slate-600">
                                {payment.payment_mode === "credit"
                                  ? `${formatPaymentDetails(payment)} - Remaining: ₹${creditRemaining.toFixed(2)}`
                                  : formatPaymentDetails(payment)}
                              </span>
                              {isAdmin && (
                                <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                                  <Icon name="manage_accounts" className="text-[14px]" />Updated by: {getPaymentUpdatedBy(payment)}
                                </span>
                              )}
                            </td>
                            <td className={`${miniTd} text-center`}>{paymentActions(payment, payment.payment_mode === "credit")}</td>
                          </tr>
                          {creditChildren.map((childPayment) => (
                            <tr key={childPayment.id} className={editingPaymentId === childPayment.id ? "bg-yellow-50" : "bg-slate-50/70"}>
                              <td className={`${miniTd} whitespace-nowrap pl-7 text-slate-500`}><Icon name="subdirectory_arrow_right" className="mr-1 align-middle text-[14px]" />{toInputDate(childPayment.payment_date)}</td>
                              <td className={miniTd}><Badge tone={MODE_TONE[childPayment.payment_mode] || "slate"}>{PAYMENT_MODE_LABELS[childPayment.payment_mode] || childPayment.payment_mode}</Badge></td>
                              <td className={`${miniTd} text-right font-semibold tabular-nums text-slate-900`}>₹{Number(childPayment.amount).toFixed(2)}</td>
                              <td className={`${miniTd} truncate`}>{getCollectorName(childPayment)}</td>
                              <td className={miniTd}>
                                <span className="block truncate text-[12px] text-slate-600">Against credit #{payment.id} - {formatPaymentDetails(childPayment)}</span>
                                {isAdmin && (
                                  <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                                    <Icon name="manage_accounts" className="text-[14px]" />Updated by: {getPaymentUpdatedBy(childPayment)}
                                  </span>
                                )}
                              </td>
                              <td className={`${miniTd} text-center`}>{paymentActions(childPayment, false)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {showPaymentForm && (
              <div className="rounded-xl border border-blue-200 bg-white p-4">
                <h4 className="m-0 flex items-center gap-1.5 text-[14px] font-semibold text-slate-900">
                  <Icon name={editingPaymentId ? "edit" : "add_circle"} className="text-[19px] text-blue-600" />
                  {editingPaymentId
                    ? "Edit Payment"
                    : activeCreditPayment
                      ? `Add Payment Against Credit - ${activeCreditPayment.credit_days || ""} Days`
                      : "Add Payment"}
                </h4>
                <p className="m-0 mb-3 mt-0.5 text-[12px] text-slate-500">Record the payment details below. The balance updates automatically after saving.</p>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label="Date" width="w-full"
                    hint={!isAdmin && paymentForm.paymentDate && paymentForm.paymentDate < getTodayLocalDate()
                      ? <span className="font-semibold text-amber-700">Backdated: needs admin approval</span>
                      : null}
                  >
                    <input type="date" className={fieldClass} value={paymentForm.paymentDate} onChange={(e) => handlePaymentFormChange("paymentDate", e.target.value)} />
                  </Field>
                  <Field label="Payment mode" width="w-full">
                    <select className={fieldClass} value={paymentForm.paymentMode} onChange={(e) => handlePaymentFormChange("paymentMode", e.target.value)}>
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="cheque">Cheque</option>
                      {!activeCreditPayment && (!hasCreditEntry || payments.some((payment) => payment.id === editingPaymentId && payment.payment_mode === "credit")) && <option value="credit">Credit</option>}
                    </select>
                  </Field>
                  <Field label="Collector type" width="w-full">
                    <select className={fieldClass} value={paymentForm.collectorType} onChange={(e) => handlePaymentFormChange("collectorType", e.target.value)}>
                      <option value="company_staff">Company Staff</option>
                      <option value="bawarchee_staff">Bawarchee Staff</option>
                    </select>
                  </Field>
                  {paymentForm.collectorType === "company_staff" ? (
                    <Field label="Marketing person (outlet)" width="w-full">
                      <input readOnly className={`${fieldClass} bg-slate-50`} value={getOutletMarketingStaffName()} />
                    </Field>
                  ) : (
                    <Field label="Delivery boy" width="w-full">
                      <select className={fieldClass} value={paymentForm.collectorDeliveryBoyId} onChange={(e) => handlePaymentFormChange("collectorDeliveryBoyId", e.target.value)}>
                        <option value="" disabled>Select delivery boy</option>
                        {paymentDialogSale?.delivery_boy_id && (
                          <option value={String(paymentDialogSale.delivery_boy_id)}>
                            {paymentDialogSale.delivery_boy_name || "Assigned Delivery Boy"} (Assigned)
                          </option>
                        )}
                        {deliveryBoys
                          .filter((boy) => String(boy.id) !== String(paymentDialogSale?.delivery_boy_id || ""))
                          .map((boy) => <option key={boy.id} value={String(boy.id)}>{boy.name}</option>)}
                      </select>
                    </Field>
                  )}
                  <Field
                    label={editingPaymentId
                      ? `Amount (max ₹${maxPayableOnEdit.toFixed(2)})`
                      : `Amount (max ₹${activeCreditRemaining.toFixed(2)})`}
                    width="w-full"
                  >
                    <input
                      type="number" className={`${fieldClass} font-semibold`} value={paymentForm.amount}
                      disabled={paymentForm.paymentMode === "cash" || paymentForm.paymentMode === "credit"}
                      readOnly={paymentForm.paymentMode === "cash" || paymentForm.paymentMode === "credit"}
                      onChange={(e) => handlePaymentFormChange("amount", e.target.value)}
                    />
                  </Field>
                  {paymentForm.paymentMode === "upi" && (
                    <Field label="UPI reference (optional)" width="w-full">
                      <input className={fieldClass} value={paymentForm.referenceNo} onChange={(e) => handlePaymentFormChange("referenceNo", e.target.value)} />
                    </Field>
                  )}
                  {paymentForm.paymentMode === "cheque" && (
                    <>
                      <Field label="Cheque no" width="w-full">
                        <input className={fieldClass} value={paymentForm.referenceNo} onChange={(e) => handlePaymentFormChange("referenceNo", e.target.value)} />
                      </Field>
                      <Field label="Cheque date" width="w-full">
                        <input type="date" className={fieldClass} value={paymentForm.referenceDate} onChange={(e) => handlePaymentFormChange("referenceDate", e.target.value)} />
                      </Field>
                    </>
                  )}
                  {paymentForm.paymentMode === "credit" && (
                    <Field label="Credit days (maximum 14)" width="w-full">
                      <input type="number" min={1} max={14} step={1} className={fieldClass} value={paymentForm.creditDays} onChange={(e) => handlePaymentFormChange("creditDays", e.target.value)} />
                    </Field>
                  )}
                </div>

                {paymentForm.paymentMode === "cash" && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <span className="mb-2 block text-[12.5px] font-semibold text-slate-800">Notes</span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                      {CASH_NOTE_DENOMINATIONS.map((denomination) => numberBox(`₹${denomination} note`, `note_${denomination}`))}
                    </div>
                    <span className="mb-2 mt-3 block text-[12.5px] font-semibold text-slate-800">Coins</span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                      {CASH_COIN_DENOMINATIONS.map((denomination) => numberBox(`₹${denomination} coin`, `coin_${denomination}`))}
                      {numberBox("Paise (0–99)", "paise", 99)}
                    </div>
                    <p className="m-0 mt-2 text-[12px] text-slate-500">Cash amount auto-calculates from note and coin count.</p>
                  </div>
                )}
                {paymentForm.paymentMode === "credit" && (
                  <p className="m-0 mt-2 text-[12px] text-slate-500">The full remaining balance is placed on credit for up to 14 days. Balance stays the same until paid by cash, UPI, or cheque.</p>
                )}
                {isPartialPayment && (
                  <p className="m-0 mt-2 text-[12px] font-semibold text-amber-700">
                    Amount is less than the balance (₹{formRemaining.toFixed(2)}). The rest stays due, so upload the invoice photo.
                  </p>
                )}
                {needsInvoicePhoto && paymentDialogSale && <CreditPhoto key={paymentDialogSale.id} api={API} saleId={Number(paymentDialogSale.id)} disabled={addingPayment || photoBusy} onBusyChange={setPhotoBusy} onPhotoReady={setPhotoSaleId} />}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button" className={btn.primary} onClick={handleSavePayment}
                    disabled={addingPayment || photoBusy || (needsInvoicePhoto && photoSaleId !== Number(paymentDialogSale?.id))}
                  >
                    <Icon name={editingPaymentId ? "save" : "add"} className="text-[18px]" />
                    {addingPayment
                      ? "Saving..."
                      : editingPaymentId
                        ? "Update Payment"
                        : "Add Payment"}
                  </button>
                  {(editingPaymentId || activeCreditPayment) && (
                    <button type="button" className={btn.ghost} onClick={cancelEditPayment} disabled={addingPayment || photoBusy}>Cancel</button>
                  )}
                </div>
              </div>
            )}

            {dialogRemaining === 0 && payments.length > 0 && (
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <Icon name="verified" className="text-[24px] text-emerald-600" />
                <span>
                  <span className="block text-[13px] font-bold text-emerald-800">Invoice fully paid</span>
                  <span className="block text-[12px] text-slate-600">No balance remaining on this invoice.</span>
                </span>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Cancellation history */}
      <Modal
        open={!!cancelDialogSale} onClose={closeCancelDialog} size="xl" title="Log Cancelled Order"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeCancelDialog}>Close</button>
            <button type="button" className={btn.danger} onClick={openAddCancelDialog}><Icon name="add" className="text-[18px]" />Add Cancellation</button>
          </>
        )}
      >
        {cancelDialogSale && (
          <div>
            <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px]">
              <span><span className="text-slate-500">Outlet:</span> <b>{cancelDialogSale.outlet_name || "—"}</b></span>
              <span><span className="text-slate-500">Invoice:</span> <b>{cancelDialogSale.invoice_number || "—"}</b></span>
            </div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="m-0 text-[14px] font-semibold text-slate-900">Cancellation History</h4>
              {cancellationHistory.length > 0 && (
                <button type="button" className={btn.outline} onClick={handlePrintAllCancellations}><Icon name="print" className="text-[18px]" />Print All</button>
              )}
            </div>
            {loadingCancellations ? (
              <p className="m-0 text-[13px] text-slate-400">Loading history...</p>
            ) : cancellationHistory.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-[13px] text-slate-400">No cancellations logged for this invoice.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[900px] table-fixed border-collapse">
                  <colgroup>
                    {["17%", "19%", "11%", "15%", "18%", "10%", "10%"].map((width, i) => <col key={width + String(i)} style={{ width }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      {["Date", "Product name", "Qty to cancel", "Reason", "Remarks"].map((h) => <th key={h} className={mini}>{h}</th>)}
                      <th className={`${mini} text-right`}>Amount</th>
                      <th className={`${mini} text-center`}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancellationHistory.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className={`${miniTd} truncate`}>{c.created_at}</td>
                        <td className={`${miniTd} truncate font-medium text-slate-900`}>{c.product_name}</td>
                        <td className={`${miniTd} tabular-nums`}>{formatCancelQtyDisplay(c)}</td>
                        <td className={`${miniTd} truncate`}>{c.reason || "—"}</td>
                        <td className={`${miniTd} truncate`} title={c.remarks || ""}>{c.remarks || "—"}</td>
                        <td className={`${miniTd} text-right font-semibold tabular-nums text-slate-900`}>₹{Number(c.amount).toFixed(2)}</td>
                        <td className={`${miniTd} text-center`}>
                          <button type="button" className={`${btn.icon} text-blue-600 hover:bg-blue-50`} title="Print" aria-label="Print" onClick={() => handlePrintCancellation(c)}>
                            <Icon name="print" className="text-[18px]" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Add a cancellation */}
      <Modal
        open={addCancelDialogOpen} onClose={closeAddCancelDialog} locked={loggingCancel} size="lg" title="Add Cancellation"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeAddCancelDialog} disabled={loggingCancel}>Close</button>
            <button type="button" className={btn.danger} onClick={handleSaveCancellation} disabled={loggingCancel || cancelImageBusy}>
              {loggingCancel ? <Spinner className="size-4 border-white/40 border-t-white" /> : <Icon name="check" className="text-[18px]" />}
              {loggingCancel ? "Saving..." : "Create Cancel"}
            </button>
          </>
        )}
      >
        {cancelDialogSale && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Outlet name" width="w-full"><input readOnly disabled className={fieldClass} value={cancelDialogSale.outlet_name || ""} /></Field>
            <Field label="Invoice number" width="w-full"><input readOnly disabled className={fieldClass} value={cancelDialogSale.invoice_number || ""} /></Field>
            <Field label="Cancellation reason *" width="w-full">
              <select className={fieldClass} value={cancelForm.reason} onChange={(e) => handleCancelFormChange("reason", e.target.value)}>
                <option value="">Select reason</option>
                {["Customer request", "Product unavailable", "Incorrect order", "Duplicate order", "Payment issue", "Delivery issue", "Wrong packing", "Other"].map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </Field>
            <div>
              {loadingCancelItems ? (
                <p className="m-0 pt-6 text-[13px] text-slate-400">Loading invoice products...</p>
              ) : cancelSaleItems.length > 0 ? (
                <>
                  <Field label="Product name *" width="w-full">
                    <select className={fieldClass} value={cancelForm.selectedItemId} onChange={(e) => handleCancelProductSelect(e.target.value)}>
                      <option value="">Select product</option>
                      <option value="manual">Manual entry</option>
                      {cancelSaleItems.map((item) => (
                        <option key={item.id} value={String(item.id)}>{item.product_name} — Qty: {formatItemQtyDisplay(item.qty)}</option>
                      ))}
                    </select>
                  </Field>
                  {isManualCancelEntry && cancelForm.selectedItemId === "manual" && (
                    <div className="mt-3">
                      <Field label="Product name *" width="w-full">
                        <input className={fieldClass} value={cancelForm.productName} onChange={(e) => handleCancelFormChange("productName", e.target.value)} />
                      </Field>
                    </div>
                  )}
                </>
              ) : (
                <Field label="Product name *" width="w-full">
                  <input className={fieldClass} value={cancelForm.productName} onChange={(e) => handleCancelFormChange("productName", e.target.value)} />
                </Field>
              )}
            </div>
            <Field label="Qty to cancel" width="w-full" hint={selectedCancelItem ? `Ordered qty: ${formatItemQtyDisplay(selectedCancelItem.qty)}` : null}>
              <input
                type="number" className={fieldClass} value={cancelForm.productQtyToCancel} min={0} step="any"
                max={selectedCancelItem ? Number(selectedCancelItem.qty) || undefined : undefined}
                onChange={(e) =>
                  selectedCancelItem
                    ? handleCancelQtyChange(e.target.value)
                    : handleCancelFormChange("productQtyToCancel", e.target.value)
                }
              />
            </Field>
            <Field label="Amount" width="w-full" hint={selectedCancelItem ? "Auto-filled from qty; you can edit manually" : "Enter cancel amount manually"}>
              <input type="number" min={0} step="0.01" className={fieldClass} value={cancelForm.amount} onChange={(e) => handleCancelFormChange("amount", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <label className={`${btn.outline} w-full cursor-pointer justify-center ${cancelImageBusy || loggingCancel ? "pointer-events-none opacity-50" : ""}`}>
                <Icon name="upload_file" className="text-[18px]" />
                {cancelImageBusy ? "Reducing image size…" : cancelForm.invoiceImageFile ? "Change invoice image" : "Upload Invoice Image *"}
                <input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={cancelImageBusy || loggingCancel} onChange={handleCancelImageSelect} />
              </label>
              <p className="m-0 mt-1 text-[12px] text-slate-500">JPG, PNG, WebP or PDF · max 1 MB. Required for admin approval.</p>
              {cancelImageNote && <p className="m-0 text-[12px] font-medium text-emerald-700">{cancelImageNote}</p>}
              {cancelImageError && <p role="alert" className="m-0 text-[12px] font-medium text-red-700">{cancelImageError}</p>}
            </div>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={label}>Remarks</span>
              <textarea rows={3} maxLength={2000} className={`${fieldClass} h-auto py-2`} value={cancelForm.remarks} onChange={(e) => handleCancelFormChange("remarks", e.target.value)} />
            </label>
          </div>
        )}
      </Modal>

      {/* Success toast (top right) */}
      {paymentSuccessMessage && (
        <div role="status" className="fixed right-4 top-20 z-[1500] flex max-w-sm items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[13px] font-medium text-white shadow-xl">
          <Icon name="check_circle" className="text-[20px]" />
          <span className="grow">{paymentSuccessMessage}</span>
          <button type="button" aria-label="Close" onClick={() => setPaymentSuccessMessage("")} className="rounded p-0.5 text-white/80 hover:text-white">
            <Icon name="close" className="text-[18px]" />
          </button>
        </div>
      )}
      <Footer />
    </DashboardLayout>
  );
}

export default UpdatePayment;
