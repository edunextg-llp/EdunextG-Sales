import { useState, useEffect, useMemo } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Badge,
  IconButton,
  Tooltip,
  InputAdornment,
} from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { printSalesStickers } from "utils/printSalesStickers";
import { printSalesInvoicePdf } from "utils/printSalesInvoicePdf";
import { FaRegEdit } from "react-icons/fa";
import { CiTrash } from "react-icons/ci";
import SalesInvoiceDialog from "layouts/add-sales/components/SalesInvoiceDialog";
import OtherDayBitDialog, { isTodaysBit, todayDate, todayDayName } from "layouts/add-sales/components/OtherDayBitDialog";
import PendingOverdueRequestsDialog from "layouts/add-sales/components/PendingOverdueRequestsDialog";
import OtherDayRequestsDialog from "layouts/add-sales/components/OtherDayRequestsDialog";
import { useAuth } from "context/AuthContext";
import ReviewDialog from "layouts/overdue-requests/components/ReviewDialog";
import { getInvoicePrefix, getInvoiceSuffix, buildInvoiceNumber } from "utils/invoicePrefix";

const REQUEST_STATUS = {
  pending: { label: "Waiting for admin approval", color: "warning" },
  approved: { label: "Approved — you can create the sales", color: "success" },
  rejected: { label: "Rejected", color: "error" },
  used: { label: "Approval already used", color: "secondary" },
};

const emptyPermissionDialog = {
  open: false,
  overdueOutlets: [],
  pendingPayload: null,
  submittedOutletIds: [],
  permissionNote: "",
  lineMapPatch: {},
  approvalRequired: false,
  // true when the user's "7 days overdue" permission lets them add the sale with a reason.
  selfApproval: false,
  selfApproveDays: 13,
  serverMessage: "",
  requests: [],
  sendingRequest: false,
};

const emptyOtherDayDialog = {
  open: false,
  outlets: [],
  requests: [],
  todayDay: "",
  reason: "other_day",
  pendingPayload: null,
  submittedOutletIds: [],
  lineMapPatch: {},
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

const tableHeadRowSx = {
  display: "table-header-group",
  backgroundColor: "#f9fafb",
  "& .MuiTableCell-root": { backgroundColor: "#f9fafb" },
};

function AddSales() {
  const { user } = useAuth() || {};
  const isAdmin = user?.role === "admin";
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaffType, setSelectedStaffType] = useState("");
  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [allOutlets, setAllOutlets] = useState([]);
  const [salesData, setSalesData] = useState({});
  const [submittedSummary, setSubmittedSummary] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [outletSearch, setOutletSearch] = useState("");
  const [searchOutlets, setSearchOutlets] = useState([]);
  const [searchingOutlets, setSearchingOutlets] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [saleLineItemsMap, setSaleLineItemsMap] = useState({});
  const [permissionDialog, setPermissionDialog] = useState(emptyPermissionDialog);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [review, setReview] = useState({ request: null, action: "approve" });
  const [invoiceDialog, setInvoiceDialog] = useState({
    open: false,
    outlet: null,
    rowIndex: 0,
    invoiceNumber: "",
    editSaleId: null,
    initialItemCount: "",
    initialPrice: "",
    initialLineItems: [],
  });
  const [billChoiceDialog, setBillChoiceDialog] = useState({
    open: false,
    outlet: null,
    rowIndex: 0,
    requisitionNumber: "",
  });
  const [requisitionLookupNumber, setRequisitionLookupNumber] = useState("");
  const [loadingRequisition, setLoadingRequisition] = useState(false);
  const [manualOutletIds, setManualOutletIds] = useState([]);
  const [manualEditDialog, setManualEditDialog] = useState({
    open: false,
    sale: null,
    itemCount: "",
    invoiceNumber: "",
    price: "",
  });

  const API = (process.env.REACT_APP_API_URL);
  const isCnfStaff = selectedStaff?.staff_type === "cnf";
  const emptySaleRow = { itemCount: "", invoiceNumber: "", price: "", deliveryBoyId: "", vehicleNo: "" };

  const outletKey = (id) => String(id);

  // Everest / Loriel invoices start with a fixed number; the user types only the rest.
  const invoicePrefix = getInvoicePrefix(selectedCompanyName);
  const invoicePrefixAdornment = (prefix) =>
    prefix
      ? {
          startAdornment: (
            <InputAdornment position="start" disableTypography sx={{ mr: 0.25 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#344767", whiteSpace: "nowrap" }}>
                {prefix}
              </span>
            </InputAdornment>
          ),
        }
      : undefined;
  // In the edit dialog, keep old invoice numbers that don't use the prefix untouched.
  const editInvoicePrefix =
    invoicePrefix && (!manualEditDialog.invoiceNumber || manualEditDialog.invoiceNumber.startsWith(invoicePrefix))
      ? invoicePrefix
      : "";

  const getStaffCompanies = (staff) =>
    String(staff?.company_name || "")
      .split(",")
      .map((company) => company.trim())
      .filter(Boolean);

  const companyOptions = [
    ...new Set(
      staffOptions
        .filter((staff) => !selectedStaffType || (staff.staff_type || "distributor") === selectedStaffType)
        .flatMap(getStaffCompanies)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filteredStaffOptions = staffOptions.filter((staff) => {
    const matchesType = !selectedStaffType || (staff.staff_type || "distributor") === selectedStaffType;
    const matchesCompany =
      !selectedCompanyName || getStaffCompanies(staff).includes(selectedCompanyName);
    return matchesType && matchesCompany;
  });

  const mergeOutletsById = (...lists) => {
    const map = new Map();
    lists.flat().forEach((o) => {
      if (o?.id != null) map.set(outletKey(o.id), o);
    });
    return Array.from(map.values());
  };

  const normalizeInvoice = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const hasDuplicateInvoiceNumbers = (invoiceNumbers, excludeSaleId = null) => {
    const normalizedInvoices = invoiceNumbers.map(normalizeInvoice).filter(Boolean);
    const hasDuplicateInEntry = normalizedInvoices.some(
      (invoiceNumber, index) => normalizedInvoices.indexOf(invoiceNumber) !== index
    );
    const hasDuplicateSubmitted = (submittedSummary?.sales || []).some(
      (sale) =>
        sale.id !== excludeSaleId &&
        normalizedInvoices.includes(normalizeInvoice(sale.invoiceNumber))
    );

    return hasDuplicateInEntry || hasDuplicateSubmitted;
  };

  const lineItemsKey = (outletId, invoiceNumber) =>
    `${outletKey(outletId)}::${normalizeInvoice(invoiceNumber)}`;

  const attachLineItemsToSales = (sales, lineMap = saleLineItemsMap) =>
    (sales || []).map((sale) => ({
      ...sale,
      lineItems:
        lineMap[lineItemsKey(sale.outletId, sale.invoiceNumber)] ||
        sale.lineItems ||
        [],
    }));

  const isDetailedBill = (sale) => Array.isArray(sale?.lineItems) && sale.lineItems.length > 0;

  const mapSaleFromApi = (s) => ({
    id: s.id != null ? Number(s.id) : null,
    outletId: s.outlet_id,
    shopName: s.outlet_name,
    outletErpId: s.outlet_erp_id || "",
    locationName: s.location_name || "",
    itemCount: s.item_count ?? s.itemCount ?? "",
    invoiceNumber: s.invoice_number,
    stickerNumber: s.sticker_number,
    paymentMode: s.payment_mode,
    amount: s.price,
    deliveryBoyName: s.delivery_boy_name || "",
    vehicleNo: s.vehicle_no || "",
    staffName: s.staff_name || selectedStaff?.name || "",
    lineItems: [],
  });

  const activeSalesForAddSales = (sales) =>
    (sales || []).filter((s) => s.packaging_status !== "cancelled");

  const refreshSubmittedSales = async (lineMapPatch = {}) => {
    if (!selectedStaff || !selectedDate) return;
    try {
      const salesRes = await fetch(
        `${API}/staff/${selectedStaff.id}/sales-by-date?date=${selectedDate}`
      );
      if (!salesRes.ok) return;
      const salesDataList = activeSalesForAddSales(await salesRes.json());
      setSaleLineItemsMap((prev) => {
        const nextMap = { ...prev, ...lineMapPatch };
        if (salesDataList.length > 0) {
          setSubmittedSummary(
            buildSubmittedSummary(
              selectedStaff,
              selectedDate,
              attachLineItemsToSales(salesDataList.map(mapSaleFromApi), nextMap)
            )
          );
        } else {
          setSubmittedSummary(null);
        }
        return nextMap;
      });
    } catch (error) {
      console.error("Error refreshing submitted sales:", error);
    }
  };

  const matchesOutletSearch = (outlet, query) => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    return (
      String(outlet.outlet_name || "").toLowerCase().includes(q) ||
      String(outlet.outlet_erp_id || "").toLowerCase().includes(q) ||
      String(outlet.location_name || "").toLowerCase().includes(q)
    );
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const displayOutlets = useMemo(() => {
    const query = outletSearch.trim();
    if (query) {
      return mergeOutletsById(allOutlets, outlets, searchOutlets).filter((outlet) =>
        matchesOutletSearch(outlet, query)
      );
    }
    return mergeOutletsById(outlets, searchOutlets);
  }, [outlets, searchOutlets, outletSearch, salesData, allOutlets]); // eslint-disable-line react-hooks/exhaustive-deps

  const showEntryTable = Boolean(selectedStaff);

  const showNoDayOutletsHint =
    selectedStaff &&
    outlets.length === 0 &&
    !outletSearch.trim() &&
    searchOutlets.length === 0 &&
    displayOutlets.length === 0;

  const buildSubmittedSummary = (staff, date, sales) => ({
    date,
    dayName: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
      new Date(`${date}T12:00:00`)
    ),
    staffName: staff.name,
    companyName: staff.company_name || "",
    sales,
  });

  const refreshOutletsAndSubmitted = async () => {
    if (!selectedStaff || !selectedDate) return;
    try {
      const [outletsRes, salesRes] = await Promise.all([
        fetch(`${API}/staff/${selectedStaff.id}/outlets-by-date?date=${selectedDate}`),
        fetch(`${API}/staff/${selectedStaff.id}/sales-by-date?date=${selectedDate}`),
      ]);
      if (outletsRes.ok) {
        const data = await outletsRes.json();
        setOutlets(data);
        const initialSales = {};
        data.forEach((outlet) => {
          initialSales[outletKey(outlet.id)] = [
            { ...emptySaleRow },
          ];
        });
        setSalesData(initialSales);
      }
      if (salesRes.ok) {
        const salesDataList = activeSalesForAddSales(await salesRes.json());
        if (salesDataList.length > 0) {
          setSubmittedSummary(
            buildSubmittedSummary(
              selectedStaff,
              selectedDate,
              attachLineItemsToSales(salesDataList.map(mapSaleFromApi))
            )
          );
        } else {
          setSubmittedSummary(null);
        }
      }
    } catch (error) {
      console.error("Error refreshing sales data:", error);
    }
  };

  const dayName = selectedDate
    ? new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
      new Date(`${selectedDate}T12:00:00`)
    )
    : "";

  const fetchStaffOptions = async (query = "") => {
    try {
      const endpoint = query.trim()
        ? `${API}/staff/search?query=${encodeURIComponent(query)}`
        : `${API}/staff`;
      const response = await fetch(endpoint);
      if (!response.ok) return;
      const data = await response.json();
      setStaffOptions(data);
    } catch (error) {
      console.error("Error searching staff:", error);
    }
  };

  useEffect(() => {

    fetchStaffOptions();
  }, []);

  useEffect(() => {
    setSelectedCompanyName("");
    setSelectedStaff(null);
    setOutletSearch("");
  }, [selectedStaffType]);

  useEffect(() => {
    setSelectedStaff(null);
    setOutletSearch("");
  }, [selectedCompanyName]);

  useEffect(() => {
    if (!selectedStaff || !selectedDate) {
      setOutlets([]);
      setAllOutlets([]);
      setSearchOutlets([]);
      setSalesData({});
      setManualOutletIds([]);
      setSubmittedSummary(null);
      return;
    }

    setOutlets([]);
    setAllOutlets([]);
    setSearchOutlets([]);
    setSalesData({});
    setManualOutletIds([]);
    setSubmittedSummary(null);

    const fetchAllData = async () => {
      const staffId = selectedStaff.id;
      const date = selectedDate;

      try {
        const [outletsResponse, allCountersResponse, salesRes] = await Promise.all([
          fetch(`${API}/staff/${staffId}/outlets-by-date?date=${date}`),
          fetch(`${API}/staff/${staffId}/all-counters`),
          fetch(`${API}/staff/${staffId}/sales-by-date?date=${date}`),
        ]);

        if (outletsResponse.ok) {
          const data = await outletsResponse.json();
          setOutlets(data);

          const initialSales = {};
          data.forEach((outlet) => {
            initialSales[outletKey(outlet.id)] = [
              { ...emptySaleRow },
            ];
          });
          setSalesData(initialSales);
        }

        if (allCountersResponse.ok) {
          const allCounters = await allCountersResponse.json();
          setAllOutlets(allCounters);
        }

        if (salesRes.ok) {
          const salesDataList = activeSalesForAddSales(await salesRes.json());
          if (salesDataList.length > 0) {
            setSubmittedSummary(
              buildSubmittedSummary(
                selectedStaff,
                date,
                attachLineItemsToSales(salesDataList.map(mapSaleFromApi))
              )
            );
          } else {
            setSubmittedSummary(null);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaff, selectedDate]);

  useEffect(() => {
    if (!selectedStaff || !outletSearch.trim()) {
      setSearchingOutlets(false);
      if (!outletSearch.trim()) {
        setSearchOutlets([]);
      }
      return undefined;
    }

    setSearchingOutlets(true);
    const timer = setTimeout(() => {
      const matched = (allOutlets || []).filter((outlet) =>
        matchesOutletSearch(outlet, outletSearch)
      );
      setSearchOutlets(matched);
      setSalesData((prev) => {
        const next = { ...prev };
        matched.forEach((outlet) => {
          const key = outletKey(outlet.id);
          if (!next[key]) {
            next[key] = [{ ...emptySaleRow }];
          }
        });
        return next;
      });
      setSearchingOutlets(false);
    }, 200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletSearch, selectedStaff, selectedDate, allOutlets]);

  // Pending overdue requests: admin sees all, other users see the ones they sent.
  const loadPendingRequests = async () => {
    try {
      const response = await fetch(`${API}/staff/overdue-requests?status=open`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) setPendingRequests(data.requests || []);
    } catch (error) {
      console.error("Error loading pending overdue requests:", error);
    }
  };

  const [creatingRequestId, setCreatingRequestId] = useState(null);

  // Other-day bit / other-date approval requests: admin sees all, other users their own.
  const [otherDayRequests, setOtherDayRequests] = useState([]);
  const [otherDayListOpen, setOtherDayListOpen] = useState(false);
  const loadOtherDayRequests = async () => {
    try {
      const response = await fetch(`${API}/staff/other-day-requests?status=all&limit=100`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) setOtherDayRequests(data.requests || []);
    } catch (error) {
      console.error("Error loading other-day bit requests:", error);
    }
  };
  const otherDayPendingCount = otherDayRequests.filter((request) => request.status === "pending").length;
  const otherDayApprovedCount = otherDayRequests.filter((request) => request.status === "approved").length;
  // Admin acts on pending ones; users act on approved ones (and watch pending).
  const otherDayBadgeCount = isAdmin ? otherDayPendingCount : otherDayPendingCount + otherDayApprovedCount;

  // Outlets admin has approved for the selected staff + date (not used yet).
  const approvedOutletIds = useMemo(() => new Set(
    otherDayRequests
      .filter((request) => request.status === "approved"
        && Number(request.staff_id) === Number(selectedStaff?.id)
        && request.sale_date === selectedDate)
      .map((request) => Number(request.outlet_id))
  ), [otherDayRequests, selectedStaff, selectedDate]);

  // Create exactly the invoice(s) the admin approved, even after a page refresh.
  const createFromApprovedRequest = async (request) => {
    const payload = request.sales_payload;
    if (!payload?.sales?.length) {
      alert("This request has no saved invoice. Select the staff and outlet and enter the invoice again.");
      return;
    }
    setCreatingRequestId(request.id);
    try {
      const response = await fetch(`${API}/staff/${request.staff_id}/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: request.sale_date, companyName: payload.companyName || "", sales: payload.sales }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create the invoice.");
      if (Number(selectedStaff?.id) === Number(request.staff_id) && selectedDate === request.sale_date) {
        await applySalesSuccess([Number(request.outlet_id)]);
      }
      alert(`Invoice ${(request.sales_summary?.invoiceNumbers || []).join(", ")} created.`);
    } catch (error) {
      alert(error.message || "Failed to create the invoice.");
    } finally {
      setCreatingRequestId(null);
      loadPendingRequests();
    }
  };

  useEffect(() => {
    loadPendingRequests();
    loadOtherDayRequests();
    const timer = setInterval(() => {
      loadPendingRequests();
      loadOtherDayRequests();
    }, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySalesSuccess = async (submittedOutletIds = [], lineMapPatch = {}) => {
    await refreshSubmittedSales(lineMapPatch);

    const outletIdSet = new Set((submittedOutletIds || []).map((id) => Number(id)));
    setOutlets((prev) => prev.filter((o) => !outletIdSet.has(Number(o.id))));
    setSearchOutlets((prev) => prev.filter((o) => !outletIdSet.has(Number(o.id))));

    setSalesData((prev) => {
      const next = { ...prev };
      outletIdSet.forEach((id) => delete next[outletKey(id)]);
      return next;
    });
    setManualOutletIds((prev) => prev.filter((id) => !outletIdSet.has(Number(id))));

    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const closePermissionDialog = () => {
    setPermissionDialog(emptyPermissionDialog);
  };

  // Only today's bit can be billed without admin approval (admin can bill any bit).
  const [otherDayDialog, setOtherDayDialog] = useState(emptyOtherDayDialog);
  const outletDayById = useMemo(() => {
    const map = new Map();
    (allOutlets || []).forEach((outlet) => map.set(Number(outlet.id), outlet.day));
    return map;
  }, [allOutlets]);
  // Another date than today needs approval for every outlet; on today, only other-day bits do.
  const isOtherDate = Boolean(selectedDate) && selectedDate !== todayDate();
  const outletApprovalLabel = (outlet) => {
    if (isAdmin) return "";
    const day = outlet.day || outletDayById.get(Number(outlet.id));
    const needsApproval = isOtherDate || (day && !isTodaysBit(day));
    if (!needsApproval) return "";
    if (approvedOutletIds.has(Number(outlet.id))) return "Approved by admin · you can add the sale";
    return isOtherDate ? "Not today's date · needs approval" : `${day} bit · needs approval`;
  };
  const closeOtherDayDialog = () => {
    setOtherDayDialog(emptyOtherDayDialog);
    loadOtherDayRequests(); // pick up a request sent from the dialog
  };

  const submitSalesPayload = async (
    payload,
    submittedOutletIds = [],
    { permissionGranted = false, permissionNote = "", lineMapPatch = {} } = {}
  ) => {
    setSubmitting(true);
    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          permissionGranted,
          permissionNote,
        }),
      });

      if (response.ok) {
        closePermissionDialog();
        closeOtherDayDialog();
        await applySalesSuccess(submittedOutletIds, lineMapPatch);
        loadPendingRequests();
        loadOtherDayRequests();
        return true;
      }

      const err = await response.json().catch(() => ({}));
      if (response.status === 409 && err.code === "OTHER_DAY_PERMISSION_REQUIRED" && err.otherDayOutlets?.length) {
        closePermissionDialog();
        setOtherDayDialog({
          open: true,
          outlets: err.otherDayOutlets,
          requests: err.requests || [],
          todayDay: err.todayDay || "",
          reason: err.reason || "other_day",
          pendingPayload: payload,
          submittedOutletIds,
          lineMapPatch,
        });
        return false;
      }
      if (response.status === 409 && err.code === "OVERDUE_PERMISSION_REQUIRED") {
        setPermissionDialog({
          ...emptyPermissionDialog,
          open: true,
          overdueOutlets: err.overdueOutlets || [],
          pendingPayload: payload,
          submittedOutletIds,
          lineMapPatch,
          approvalRequired: err.approvalRequired ?? !isAdmin,
          selfApproval: Boolean(err.selfApproval),
          selfApproveDays: Number(err.selfApproveDays) || 13,
          serverMessage: err.error || "",
          requests: err.requests || [],
        });
        return false;
      }

      alert(err.error || "Failed to record sales.");
      return false;
    } catch (error) {
      console.error("Error submitting sales:", error);
      alert("Error submitting form.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleGrantPermissionAndSave = async () => {
    if (!permissionDialog.pendingPayload) return;
    const note = String(permissionDialog.permissionNote || "").trim();
    if (!note) {
      alert("Permission note is required.");
      return;
    }
    await submitSalesPayload(
      permissionDialog.pendingPayload,
      permissionDialog.submittedOutletIds,
      {
        permissionGranted: true,
        permissionNote: note,
        lineMapPatch: permissionDialog.lineMapPatch || {},
      }
    );
  };

  // ----- Overdue approval requests (non-admin users) -----
  const requestByOutlet = useMemo(() => {
    const map = new Map();
    (permissionDialog.requests || []).forEach((request) => map.set(Number(request.outlet_id), request));
    return map;
  }, [permissionDialog.requests]);

  const overdueRequestStates = (permissionDialog.overdueOutlets || []).map(
    (outlet) => requestByOutlet.get(Number(outlet.outletId))?.status || "none"
  );
  const allRequestsApproved =
    overdueRequestStates.length > 0 && overdueRequestStates.every((status) => status === "approved");
  const anyRequestPending = overdueRequestStates.some((status) => status === "pending");
  const needsNewRequest = overdueRequestStates.some((status) => ["none", "rejected", "used"].includes(status));

  const refreshOverdueRequests = async () => {
    const outletIds = (permissionDialog.overdueOutlets || []).map((outlet) => outlet.outletId);
    if (!selectedStaff?.id || !outletIds.length) return;
    try {
      const params = new URLSearchParams({
        staffId: String(selectedStaff.id),
        saleDate: permissionDialog.pendingPayload?.date || selectedDate,
        outletIds: outletIds.join(","),
      });
      const response = await fetch(`${API}/staff/overdue-requests?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setPermissionDialog((prev) => (prev.open ? { ...prev, requests: data.requests || [] } : prev));
      }
    } catch (error) {
      console.error("Error loading overdue requests:", error);
    }
  };

  useEffect(() => {
    if (!permissionDialog.open || !permissionDialog.approvalRequired || !anyRequestPending) return undefined;
    const timer = setInterval(refreshOverdueRequests, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionDialog.open, permissionDialog.approvalRequired, anyRequestPending, permissionDialog.overdueOutlets]);

  const handleSendOverdueRequest = async () => {
    const note = String(permissionDialog.permissionNote || "").trim();
    if (!note) {
      alert("Reason for request is required.");
      return;
    }
    const outletIds = (permissionDialog.overdueOutlets || [])
      .filter((outlet) => {
        const status = requestByOutlet.get(Number(outlet.outletId))?.status;
        return !status || ["rejected", "used"].includes(status);
      })
      .map((outlet) => outlet.outletId);

    setPermissionDialog((prev) => ({ ...prev, sendingRequest: true }));
    try {
      const response = await fetch(`${API}/staff/overdue-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: selectedStaff.id,
          saleDate: permissionDialog.pendingPayload?.date || selectedDate,
          outletIds,
          note,
          salesPayload: {
            companyName: permissionDialog.pendingPayload?.companyName || selectedCompanyName || "",
            sales: permissionDialog.pendingPayload?.sales || [],
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to send the request.");
      setPermissionDialog((prev) => {
        const merged = new Map((prev.requests || []).map((request) => [Number(request.outlet_id), request]));
        (data.requests || []).forEach((request) => merged.set(Number(request.outlet_id), request));
        return { ...prev, permissionNote: "", requests: [...merged.values()] };
      });
      loadPendingRequests();
    } catch (error) {
      alert(error.message || "Unable to send the request.");
    } finally {
      setPermissionDialog((prev) => ({ ...prev, sendingRequest: false }));
    }
  };

  const handleCreateApprovedSales = async () => {
    if (!permissionDialog.pendingPayload) return;
    await submitSalesPayload(permissionDialog.pendingPayload, permissionDialog.submittedOutletIds, {
      lineMapPatch: permissionDialog.lineMapPatch || {},
    });
  };

  const fetchNextBillNumber = async () => {
    if (!selectedStaff?.id) return "";
    try {
      const params = new URLSearchParams();
      if (selectedCompanyName) {
        params.set("companyName", selectedCompanyName);
      }
      const query = params.toString();
      const response = await fetch(
        `${API}/staff/${selectedStaff.id}/next-bill-number${query ? `?${query}` : ""}`
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate bill number.");
      }
      const data = await response.json();
      return data.billNumber || "";
    } catch (error) {
      console.error("Error fetching bill number:", error);
      alert(error.message || "Could not generate bill number.");
      return "";
    }
  };

  const getPrevBillNoForOutlet = (outletId) => {
    const outletSales = (submittedSummary?.sales || []).filter(
      (sale) => Number(sale.outletId) === Number(outletId)
    );
    if (!outletSales.length) return "";
    return outletSales[outletSales.length - 1]?.invoiceNumber || "";
  };

  const openInvoiceDialog = async (outlet, index, requisitionNumber = "") => {
    const row = (salesData[outletKey(outlet.id)] || [])[index];
    let invoiceNumber = row?.invoiceNumber?.trim() || "";
    // Everest and Loriel use printed invoice books with a fixed leading number.
    // Leave the editable suffix blank instead of generating an unrelated bill no.
    if (!invoiceNumber && !invoicePrefix) {
      invoiceNumber = await fetchNextBillNumber();
      if (!invoiceNumber) return;
    }
    setInvoiceDialog({
      open: true,
      outlet,
      rowIndex: index,
      invoiceNumber,
      editSaleId: null,
      initialItemCount: "",
      initialPrice: "",
      initialLineItems: [],
      requisitionNumber,
    });
  };

  const closeInvoiceDialog = () => {
    setInvoiceDialog({
      open: false,
      outlet: null,
      rowIndex: 0,
      invoiceNumber: "",
      editSaleId: null,
      initialItemCount: "",
      initialPrice: "",
      initialLineItems: [],
      requisitionNumber: "",
    });
  };

  const openBillChoiceDialog = (outlet, index, requisitionNumber = "") => {
    setBillChoiceDialog({ open: true, outlet, rowIndex: index, requisitionNumber });
  };

  const closeBillChoiceDialog = () => {
    setBillChoiceDialog({ open: false, outlet: null, rowIndex: 0, requisitionNumber: "" });
  };

  const chooseCreateBill = () => {
    const { outlet, rowIndex, requisitionNumber } = billChoiceDialog;
    closeBillChoiceDialog();
    if (outlet) openInvoiceDialog(outlet, rowIndex, requisitionNumber);
  };

  const chooseManualEntry = () => {
    const { outlet } = billChoiceDialog;
    closeBillChoiceDialog();
    if (!outlet) return;
    const id = outletKey(outlet.id);
    setManualOutletIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSalesData((prev) => ({
      ...prev,
      [id]: prev[id]?.length ? prev[id] : [{ ...emptySaleRow }],
    }));
  };

  const openRequisitionBillChoice = async () => {
    const code = requisitionLookupNumber.trim();
    if (!code) return alert("Enter a requisition number.");
    if (!selectedStaff) return alert("Select staff before loading a requisition.");

    setLoadingRequisition(true);
    try {
      const response = await fetch(`${API}/staff/purchase-requisitions/${encodeURIComponent(code)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Requisition not found.");
      if (Number(data.requisition.staff_id) !== Number(selectedStaff.id)) {
        throw new Error("This requisition belongs to a different staff member.");
      }
      // Stock is checked and deducted for the selected company, so it must match.
      const requisitionCompany = String(data.requisition.company_name || "").trim();
      if (requisitionCompany && selectedCompanyName
        && requisitionCompany.toLowerCase() !== String(selectedCompanyName).trim().toLowerCase()) {
        throw new Error(
          `Requisition ${data.requisition.requisition_number || code} is for ${requisitionCompany}, `
          + `but ${selectedCompanyName} is selected. Select ${requisitionCompany} in Company Name, `
          + "then the staff, and load the requisition again."
        );
      }

      const requisitionOutlet = [...outlets, ...allOutlets].find(
        (outlet) => Number(outlet.id) === Number(data.requisition.outlet_id)
      );
      if (!requisitionOutlet) {
        throw new Error("The requisition outlet is not available for the selected staff.");
      }

      setOutlets((prev) => (
        prev.some((outlet) => Number(outlet.id) === Number(requisitionOutlet.id))
          ? prev
          : [...prev, requisitionOutlet]
      ));
      setSalesData((prev) => ({
        ...prev,
        [outletKey(requisitionOutlet.id)]: prev[outletKey(requisitionOutlet.id)]?.length
          ? prev[outletKey(requisitionOutlet.id)]
          : [{ ...emptySaleRow }],
      }));
      setRequisitionLookupNumber("");
      openBillChoiceDialog(requisitionOutlet, 0, data.requisition.requisition_number);
    } catch (error) {
      alert(error.message || "Could not load requisition.");
    } finally {
      setLoadingRequisition(false);
    }
  };

  const handleManualSalesChange = (outletId, index, field, value) => {
    const key = outletKey(outletId);
    setSalesData((prev) => {
      const rows = [...(prev[key] || [{ ...emptySaleRow }])];
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, [key]: rows };
    });
  };

  const handleAddManualRow = (outletId) => {
    const key = outletKey(outletId);
    setSalesData((prev) => ({
      ...prev,
      [key]: [...(prev[key] || [{ ...emptySaleRow }]), { ...emptySaleRow }],
    }));
  };

  const handleRemoveManualRow = (outletId, index) => {
    const key = outletKey(outletId);
    setSalesData((prev) => {
      const rows = [...(prev[key] || [])];
      if (rows.length <= 1) return { ...prev, [key]: [{ ...emptySaleRow }] };
      rows.splice(index, 1);
      return { ...prev, [key]: rows };
    });
  };

  const handleSaveManualOutlet = async (outletId) => {
    const rows = salesData[outletKey(outletId)] || [];
    const hasDraft = (row) => row.itemCount || row.invoiceNumber || row.price;
    const filledRows = rows.filter(hasDraft);
    const invalid = filledRows.some((row) => {
      const itemCount = Number(row.itemCount);
      const price = Number(row.price);
      return !String(row.invoiceNumber || "").trim() || !Number.isInteger(itemCount) || itemCount <= 0 || !Number.isFinite(price) || price < 0;
    });

    if (!filledRows.length || invalid) {
      alert("Enter a valid No. of Item, Invoice No., and Invoice Amount for every manual row.");
      return;
    }
    if (hasDuplicateInvoiceNumbers(filledRows.map((row) => row.invoiceNumber))) {
      alert("Same invoice number already exists. Please use unique invoice numbers.");
      return;
    }

    await submitSalesPayload(
      {
        date: selectedDate,
        sales: filledRows.map((row) => ({
          outletId: Number(outletId),
          itemCount: Number(row.itemCount),
          invoiceNumber: row.invoiceNumber.trim(),
          price: Number(row.price),
        })),
      },
      [Number(outletId)]
    );
  };

  const cancelManualEntry = (outletId) => {
    const key = outletKey(outletId);
    setManualOutletIds((prev) => prev.filter((id) => id !== key));
    setSalesData((prev) => {
      const next = { ...prev };
      next[key] = [{ ...emptySaleRow }];
      return next;
    });
  };

  const openEditSaleDialog = (row) => {
    const storedLineItems =
      saleLineItemsMap[lineItemsKey(row.outletId, row.invoiceNumber)] || row.lineItems || [];
    setInvoiceDialog({
      open: true,
      outlet: {
        id: row.outletId,
        outlet_name: row.shopName || "",
        outlet_erp_id: row.outletErpId || "",
        location_name: row.locationName || "",
      },
      rowIndex: 0,
      invoiceNumber: row.invoiceNumber || "",
      editSaleId: row.id,
      initialItemCount: row.itemCount ?? "",
      initialPrice: row.amount ?? "",
      initialLineItems: storedLineItems,
    });
  };

  const openManualEditDialog = (row) => {
    setManualEditDialog({
      open: true,
      sale: row,
      itemCount: String(row.itemCount ?? ""),
      invoiceNumber: row.invoiceNumber || "",
      price: String(row.amount ?? ""),
    });
  };

  const closeManualEditDialog = () => {
    setManualEditDialog({ open: false, sale: null, itemCount: "", invoiceNumber: "", price: "" });
  };

  const handleManualEditSave = async () => {
    const { sale, itemCount, invoiceNumber, price } = manualEditDialog;
    const parsedItemCount = Number(itemCount);
    const parsedPrice = Number(price);
    if (!sale) return;
    if (!Number.isInteger(parsedItemCount) || parsedItemCount <= 0 || !invoiceNumber.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      alert("Enter a valid No. of Item, Invoice No., and Invoice Amount.");
      return;
    }
    if (hasDuplicateInvoiceNumbers([invoiceNumber], sale.id)) {
      alert("Same invoice number already exists. Please use a unique invoice number.");
      return;
    }

    setSavingEdit(true);
    try {
      const response = await fetch(`${API}/staff/sales/${sale.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemCount: parsedItemCount,
          invoiceNumber: invoiceNumber.trim(),
          price: parsedPrice,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update manual entry.");
      }
      const data = await response.json();
      setSubmittedSummary((prev) => ({
        ...prev,
        sales: prev.sales.map((entry) =>
          entry.id === sale.id ? { ...entry, ...data.sale, lineItems: [] } : entry
        ),
      }));
      closeManualEditDialog();
    } catch (error) {
      alert(error.message || "Error updating manual entry.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleInvoiceSubmit = async ({
    invoiceNumber,
    requisitionNumber,
    itemCount,
    price,
    addAnother,
    lineItems = [],
  }) => {
    const outlet = invoiceDialog.outlet;
    if (!outlet) return false;

    const editSaleId = invoiceDialog.editSaleId;
    const lineMapPatch = {
      [lineItemsKey(outlet.id, invoiceNumber)]: Array.isArray(lineItems) ? lineItems : [],
    };

    if (hasDuplicateInvoiceNumbers([invoiceNumber], editSaleId)) {
      alert("Same invoice number already exists. Please use a unique invoice number.");
      return false;
    }

    // Edit existing submitted sale
    if (editSaleId) {
      setSavingEdit(true);
      try {
        const response = await fetch(`${API}/staff/sales/${editSaleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceNumber: invoiceNumber.trim(),
            itemCount: parseInt(itemCount, 10),
            price: parseFloat(price),
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setSaleLineItemsMap((prev) => {
            const nextMap = { ...prev, ...lineMapPatch };
            // Drop old invoice key if bill number changed
            const oldSale = (submittedSummary?.sales || []).find((s) => s.id === editSaleId);
            if (
              oldSale &&
              normalizeInvoice(oldSale.invoiceNumber) !== normalizeInvoice(invoiceNumber)
            ) {
              delete nextMap[lineItemsKey(oldSale.outletId, oldSale.invoiceNumber)];
            }
            setSubmittedSummary((summaryPrev) => ({
              ...summaryPrev,
              sales: attachLineItemsToSales(
                summaryPrev.sales.map((s) =>
                  s.id === editSaleId ? { ...s, ...data.sale, lineItems } : s
                ),
                nextMap
              ),
            }));
            return nextMap;
          });
          closeInvoiceDialog();
          return true;
        }
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update sale.");
        return false;
      } catch (error) {
        console.error("Error updating sale:", error);
        alert("Error updating sale.");
        return false;
      } finally {
        setSavingEdit(false);
      }
    }

    const payload = {
      date: selectedDate,
      companyName: selectedCompanyName,
      sales: [
        {
          outletId: parseInt(outlet.id, 10),
          itemCount: parseInt(itemCount, 10),
          invoiceNumber,
          price: parseFloat(price),
          requisitionNumber: requisitionNumber || invoiceDialog.requisitionNumber || "",
          lineItems: Array.isArray(lineItems) ? lineItems : [],
        },
      ],
    };

    setSaleLineItemsMap((prev) => ({ ...prev, ...lineMapPatch }));
    const success = await submitSalesPayload(payload, [parseInt(outlet.id, 10)], {
      lineMapPatch,
    });
    if (success) {
      if (!addAnother) {
        closeInvoiceDialog();
      }
      return true;
    }
    return false;
  };

  const downloadOutletInvoicePdf = (row) => {
    const outletSales = attachLineItemsToSales(
      (submittedSummary?.sales || []).filter(
        (sale) => Number(sale.outletId) === Number(row.outletId)
      )
    ).filter(isDetailedBill);

    if (!outletSales.length) {
      alert("No invoices found for this outlet.");
      return;
    }

    printSalesInvoicePdf({
      outletName: row.shopName,
      outletErpId: row.outletErpId,
      locationName: row.locationName,
      saleDate: submittedSummary?.date
        ? new Date(`${submittedSummary.date}T12:00:00`).toLocaleDateString("en-IN")
        : selectedDate,
      staffName: submittedSummary?.staffName || selectedStaff?.name || "",
      companyName: submittedSummary?.companyName || selectedStaff?.company_name || "",
      invoices: outletSales,
    });
  };

  const handleDeleteSale = async (saleId) => {
    if (!window.confirm("Delete this sale record?")) return;

    try {
      const response = await fetch(`${API}/staff/sales/${saleId}`, { method: "DELETE" });
      if (response.ok) {
        setSubmittedSummary((prev) => {
          const nextSales = prev.sales.filter((s) => s.id !== saleId);
          return nextSales.length ? { ...prev, sales: nextSales } : null;
        });
        await refreshOutletsAndSubmitted();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to delete sale.");
      }
    } catch (error) {
      console.error("Error deleting sale:", error);
      alert("Error deleting sale.");
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card
              sx={{ boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }}
            >
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center">
                <MDBox display="flex" alignItems="center" gap={1.5}>
                  <MDTypography variant="h5" fontWeight="medium" color="dark">
                    Daily Outlet Price Entry
                  </MDTypography>
                  <MDBadge
                    badgeContent={
                      displayOutlets.length > 0
                        ? `${displayOutlets.length} outlet${displayOutlets.length !== 1 ? "s" : ""}`
                        : `${outlets.length} today`
                    }
                    color="light"
                    container
                    sx={{
                      "& .MuiBadge-badge": {
                        textTransform: "none",
                        border: "1px solid #e5e7eb",
                        backgroundColor: "#f9fafb",
                        color: "#374151",
                        fontWeight: 500,
                      },
                    }}
                  />
                </MDBox>
                <MDBox display="flex" alignItems="center" gap={0.5}>
                  <Tooltip
                    title={
                      otherDayBadgeCount
                        ? `Other bit / date approvals: ${otherDayPendingCount} waiting, ${otherDayApprovedCount} approved`
                        : "Other bit / date approvals"
                    }
                  >
                    <IconButton
                      color={otherDayBadgeCount ? "info" : "secondary"}
                      onClick={() => {
                        loadOtherDayRequests();
                        setOtherDayListOpen(true);
                      }}
                      aria-label="Other bit and date approvals"
                    >
                      <Badge badgeContent={otherDayBadgeCount} color={otherDayApprovedCount && !isAdmin ? "success" : "error"} max={99}>
                        <Icon>event_busy</Icon>
                      </Badge>
                    </IconButton>
                  </Tooltip>
                  <Tooltip
                    title={
                      pendingRequests.length
                        ? `${pendingRequests.length} overdue request(s) pending or approved`
                        : "No pending overdue requests"
                    }
                  >
                    <IconButton
                      color={pendingRequests.length ? "warning" : "secondary"}
                      onClick={() => {
                        loadPendingRequests();
                        setPendingOpen(true);
                      }}
                      aria-label="Pending overdue requests"
                    >
                      <Badge badgeContent={pendingRequests.length} color="error" max={99}>
                        <Icon>pending_actions</Icon>
                      </Badge>
                    </IconButton>
                  </Tooltip>
                </MDBox>
              </MDBox>
              <MDBox pb={3} px={3}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={3}>
                    <MDBox mb={2}>
                      <MDInput
                        type="date"
                        label="Select Date"
                        fullWidth
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          setOutletSearch("");
                        }}
                        InputLabelProps={{ shrink: true }}
                      />
                    </MDBox>
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="sales-staff-type-label">Staff Type</InputLabel>
                      <Select
                        labelId="sales-staff-type-label"
                        value={selectedStaffType}
                        label="Staff Type"
                        onChange={(e) => setSelectedStaffType(e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                      >
                        <MenuItem value="">
                          <em>Select Staff Type</em>
                        </MenuItem>
                        <MenuItem value="distributor">Distributor</MenuItem>
                        <MenuItem value="cnf">CNF</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small" disabled={!selectedStaffType}>
                      <InputLabel id="sales-company-label">Company Name</InputLabel>
                      <Select
                        labelId="sales-company-label"
                        value={selectedCompanyName}
                        label="Company Name"
                        onChange={(e) => setSelectedCompanyName(e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                      >
                        <MenuItem value="">
                          <em>Select Company</em>
                        </MenuItem>
                        {companyOptions.map((companyName) => (
                          <MenuItem key={companyName} value={companyName}>
                            {companyName}
                          </MenuItem>
                        ))}
                        {selectedStaffType && companyOptions.length === 0 && (
                          <MenuItem disabled>
                            No {selectedStaffType === "cnf" ? "CNF" : "Distributor"} company found
                          </MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <MDBox mb={2}>
                      <Autocomplete
                        options={filteredStaffOptions}
                        value={selectedStaff}
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        onChange={(event, newValue) => {
                          setSelectedStaff(newValue);
                          setSubmittedSummary(null);
                          setOutletSearch("");
                        }}
                        onOpen={() => {
                          if (staffOptions.length === 0) {
                            fetchStaffOptions();
                          }
                        }}
                        onInputChange={(event, newInputValue) => fetchStaffOptions(newInputValue)}
                        disabled={!selectedStaffType || !selectedCompanyName}
                        renderInput={(params) => (
                          <MDInput {...params} label="Search Staff Name" fullWidth />
                        )}
                      />
                    </MDBox>
                  </Grid>
                  {/* <Grid item xs={12} md={4}>
                    <MDBox mb={2}>
                      <MDInput
                        type="text"
                        label="Search Outlet (any weekday)"
                        fullWidth
                        value={outletSearch}
                        onChange={(e) => setOutletSearch(e.target.value)}
                        disabled={!selectedStaff}
                        helperText={
                          selectedStaff
                            ? "Finds outlets from Mon–Sat routes; sale is saved for the selected date."
                            : ""
                        }
                      />
                    </MDBox>
                  </Grid> */}
                </Grid>

                {showEntryTable && (
                  <MDBox mt={4}>
                    <MDBox display="flex" alignItems="center" flexWrap="wrap" gap={1} mb={2}>
                      <MDTypography variant="h6">
                        Enter Prices for {new Date(selectedDate).toLocaleDateString()}
                      </MDTypography>
                      <MDBox
                        px={1.5}
                        py={0.75}
                        sx={{
                          backgroundColor: "#f0f2f5",
                          borderRadius: "10px",
                          border: "1px solid #ddd",
                        }}
                      >
                        <MDTypography variant="button" fontWeight="bold" color="info">
                          {isCnfStaff ? "CNF" : dayName}
                        </MDTypography>
                      </MDBox>
                      <MDBox display="flex" alignItems="center" gap={1} ml={{ xs: 0, md: "auto" }} width={{ xs: "100%", md: 300 }}>
                        <MDInput
                          label="Requisition No."
                          fullWidth
                          value={requisitionLookupNumber}
                          onChange={(e) => setRequisitionLookupNumber(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") openRequisitionBillChoice();
                          }}
                          disabled={loadingRequisition}
                        />
                        <MDButton
                          color="info"
                          variant="gradient"
                          title="Load requisition"
                          aria-label="Load requisition"
                          onClick={openRequisitionBillChoice}
                          disabled={loadingRequisition}
                          sx={{ minWidth: 42, px: 1 }}
                        >
                          <Icon fontSize="small">{loadingRequisition ? "hourglass_top" : "search"}</Icon>
                        </MDButton>
                      </MDBox>
                    </MDBox>

                    <MDBox mb={2} maxWidth={400}>
                      <MDInput
                        type="text"
                        label="Search Outlet Name or ERP ID"
                        fullWidth
                        value={outletSearch}
                        onChange={(e) => setOutletSearch(e.target.value)}
                        disabled={!selectedStaff}
                        helperText={
                          selectedStaff
                            ? "Search by outlet name, ERP ID, or area across all route days."
                            : ""
                        }
                      />
                    </MDBox>
                    {!isCnfStaff && (
                      <MDBox mb={2} maxWidth={400}>
                        <Autocomplete
                          options={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]}
                          onChange={(event, newValue) => {
                            if (newValue) {
                              const outletsToAdd = allOutlets.filter(
                                o => o.day === newValue && !outlets.some(existing => existing.id === o.id)
                              );

                              if (outletsToAdd.length > 0) {
                                setOutlets([...outlets, ...outletsToAdd]);
                                setSalesData((prev) => {
                                  const newData = { ...prev };
                                  outletsToAdd.forEach((o) => {
                                    newData[outletKey(o.id)] = [{ ...emptySaleRow }];
                                  });
                                  return newData;
                                });
                              }
                            }
                          }}
                          renderInput={(params) => (
                            <MDInput {...params} label="Load Outlets by Day" fullWidth />
                          )}
                          clearOnBlur
                          blurOnSelect
                        />
                      </MDBox>
                    )}

                    <TableContainer
                      sx={{
                        boxShadow: "none",
                        backgroundColor: "transparent",
                        borderTop: "1px solid #e5e7eb",
                        mt: 2,
                        overflowX: "auto",
                      }}
                    >
                      <Table
                        sx={{
                          tableLayout: "fixed",
                          width: "100%",
                          minWidth: invoicePrefix ? 960 : 720,
                          "& .MuiTableCell-root": { overflow: "hidden" },
                        }}
                      >
                        <colgroup>
                          {(invoicePrefix
                            ? ["5%", "16%", "10%", "11%", "10%", "23%", "13%", "12%"] // wider Invoice No. for the fixed prefix
                            : ["5%", "19%", "12%", "13%", "12%", "14%", "13%", "12%"]
                          ).map((width, i) => (
                            <col key={i} style={{ width }} />
                          ))}
                        </colgroup>
                        <TableHead sx={tableHeadRowSx}>
                          <TableRow>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "6%" }}>
                              Sr No
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "18%" }}>
                              Outlet
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "12%" }}>
                              Area
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "14%" }}>
                              Staff Name
                            </TableCell>
                            <TableCell align="center" sx={tableHeadSx}>No. of Item</TableCell>
                            <TableCell align="center" sx={tableHeadSx}>Invoice No.</TableCell>
                            <TableCell align="center" sx={tableHeadSx}>Invoice Amount</TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "16%" }}>
                              Action
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {searchingOutlets ? (
                            <TableRow>
                              <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }} />
                              <TableCell
                                colSpan={6}
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", py: 3 }}
                              >
                                <MDTypography variant="body2" color="text">
                                  Searching outlets...
                                </MDTypography>
                              </TableCell>
                              <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }} />
                            </TableRow>
                          ) : displayOutlets.length === 0 ? (
                            <TableRow>
                              <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }} />
                              <TableCell
                                colSpan={6}
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", py: 3 }}
                              >
                                <MDTypography variant="body2" color="text">
                                  {outletSearch.trim()
                                    ? "No outlets match this search on this staff's routes."
                                    : `No pending outlets for ${dayName}. Use Search Outlet above to find routes from other weekdays.`}
                                </MDTypography>
                              </TableCell>
                              <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }} />
                            </TableRow>
                          ) : (
                            displayOutlets.map((outlet, outletIndex) => {
                              const rows = salesData[outletKey(outlet.id)] || [];
                              const isManualEntry = manualOutletIds.includes(outletKey(outlet.id));
                              return rows.map((row, index) => {
                                const rowBorder =
                                  index === rows.length - 1
                                    ? { borderBottom: "1px solid #e5e7eb" }
                                    : { borderBottom: "1px solid #f0f0f0" };
                                return (
                                  <TableRow
                                    key={`${outlet.id}-${index}`}

                                    sx={{
                                      backgroundColor: index % 2 !== 0 ? "#fafafa" : "inherit",
                                    }}
                                  >


                                    <TableCell
                                      align="center"
                                      sx={{
                                        ...tableBodySx,
                                        ...rowBorder,
                                      }}
                                    >
                                      {index === 0 ? outletIndex + 1 : `${outletIndex + 1}.${index + 1}`}
                                    </TableCell>
                                    {index === 0 && (
                                      <TableCell
                                        rowSpan={rows.length}
                                        align="left"
                                        sx={{
                                          ...tableBodySx,
                                          borderBottom: "1px solid #e5e7eb",
                                        }}
                                      >
                                        <MDBox display="flex" alignItems="center" gap={1.5}>
                                          {/* <MDAvatar
                                            bgColor="light"
                                            size="sm"
                                            sx={{ border: "1px solid #e5e7eb", color: "#374151", flexShrink: 0 }}
                                          >
                                            <MDTypography variant="caption" fontWeight="medium">
                                              {outlet.outlet_name.charAt(0)}
                                            </MDTypography>
                                          </MDAvatar> */}
                                          <MDBox lineHeight={1} minWidth={0}>
                                            <MDTypography
                                              display="block"
                                              variant="button"
                                              fontWeight="medium"
                                              color="dark"
                                              sx={{ fontSize: "0.875rem" }}
                                            >
                                              {outlet.outlet_name}
                                            </MDTypography>
                                            <MDTypography
                                              variant="caption"
                                              sx={{ fontSize: "0.75rem", color: "#6b7280" }}
                                            >
                                              {outlet.outlet_erp_id}
                                            </MDTypography>
                                            {outletApprovalLabel(outlet) && (
                                              <Tooltip
                                                title={approvedOutletIds.has(Number(outlet.id))
                                                  ? "Admin approved this outlet for this date. Save the bill as usual (one time)."
                                                  : isOtherDate
                                                  ? "Sales for a date other than today need admin approval."
                                                  : `Not in today's (${todayDayName()}) bit. Admin approval is needed to add a sale.`}
                                              >
                                                <MDTypography
                                                  display="block"
                                                  variant="caption"
                                                  sx={{
                                                    fontSize: "0.7rem",
                                                    fontWeight: 600,
                                                    mt: 0.5,
                                                    color: approvedOutletIds.has(Number(outlet.id)) ? "#15803d" : "#b45309",
                                                  }}
                                                >
                                                  {outletApprovalLabel(outlet)}
                                                </MDTypography>
                                              </Tooltip>
                                            )}
                                          </MDBox>
                                        </MDBox>
                                      </TableCell>
                                    )}
                                    {index === 0 && (
                                      <TableCell
                                        rowSpan={rows.length}
                                        align="left"
                                        sx={{
                                          ...tableBodySx,
                                          borderBottom: "1px solid #e5e7eb",
                                          fontSize: "0.875rem",
                                          color: "#374151",
                                        }}
                                      >
                                        {outlet.location_name || "N/A"}
                                      </TableCell>
                                    )}
                                    {index === 0 && (
                                      <TableCell
                                        rowSpan={rows.length}
                                        align="left"
                                        sx={{
                                          ...tableBodySx,
                                          borderBottom: "1px solid #e5e7eb",
                                          fontSize: "0.875rem",
                                          color: "#374151",
                                        }}
                                      >
                                        {selectedStaff?.name || "N/A"}
                                      </TableCell>
                                    )}
                                    <TableCell align="center" sx={{ ...tableBodySx, ...rowBorder }}>
                                      {isManualEntry && (
                                        <MDInput
                                          type="number"
                                          inputProps={{ min: 1 }}
                                          value={row.itemCount || ""}
                                          onChange={(e) => handleManualSalesChange(outlet.id, index, "itemCount", e.target.value)}
                                          sx={{ width: "100%" }}
                                        />
                                      )}
                                    </TableCell>
                                    <TableCell align="center" sx={{ ...tableBodySx, ...rowBorder }}>
                                      {isManualEntry && (
                                        <MDInput
                                          value={getInvoiceSuffix(row.invoiceNumber, invoicePrefix)}
                                          onChange={(e) =>
                                            handleManualSalesChange(
                                              outlet.id,
                                              index,
                                              "invoiceNumber",
                                              invoicePrefix ? buildInvoiceNumber(e.target.value, invoicePrefix) : e.target.value
                                            )
                                          }
                                          InputProps={invoicePrefixAdornment(invoicePrefix)}
                                          sx={{ width: "100%" }}
                                        />
                                      )}
                                    </TableCell>
                                    <TableCell align="center" sx={{ ...tableBodySx, ...rowBorder }}>
                                      {isManualEntry && (
                                        <MDInput
                                          type="number"
                                          inputProps={{ min: 0, step: "0.01" }}
                                          value={row.price || ""}
                                          onChange={(e) => handleManualSalesChange(outlet.id, index, "price", e.target.value)}
                                          sx={{ width: "100%" }}
                                        />
                                      )}
                                    </TableCell>
                                    <TableCell align="center" sx={{ ...tableBodySx, ...rowBorder }}>
                                      {isManualEntry ? (
                                        <MDBox display="flex" gap={0.5} justifyContent="center" flexWrap="wrap">
                                          <MDButton size="small" color="info" variant="outlined" onClick={() => handleAddManualRow(outlet.id)} disabled={submitting} sx={{ minWidth: 0, px: 1 }} title="Add row">
                                            <Icon sx={{ fontSize: "1rem !important" }}>add</Icon>
                                          </MDButton>
                                          {rows.length > 1 && (
                                            <MDButton size="small" color="error" variant="text" onClick={() => handleRemoveManualRow(outlet.id, index)} disabled={submitting} sx={{ minWidth: 0, px: 1 }} title="Remove row">
                                              <Icon sx={{ fontSize: "1rem !important" }}>remove</Icon>
                                            </MDButton>
                                          )}
                                          {index === rows.length - 1 && (
                                            <MDButton size="small" color="success" variant="gradient" onClick={() => handleSaveManualOutlet(outlet.id)} disabled={submitting} sx={{ minWidth: 0, px: 1 }} title="Save">
                                              <Icon sx={{ fontSize: "1rem !important" }}>check</Icon>
                                            </MDButton>
                                          )}
                                          {index === rows.length - 1 && (
                                            <MDButton
                                              size="small"
                                              color="error"
                                              variant="outlined"
                                              onClick={() => cancelManualEntry(outlet.id)}
                                              disabled={submitting}
                                              sx={{ minWidth: 0, px: 1 }}
                                              title="Cancel"
                                            >
                                              <Icon sx={{ fontSize: "1rem !important" }}>close</Icon>
                                            </MDButton>
                                          )}
                                        </MDBox>
                                      ) : (
                                        <MDButton
                                          variant="gradient"
                                          color="info"
                                          size="small"
                                          onClick={() => openBillChoiceDialog(outlet, index)}
                                          disabled={submitting}
                                          sx={{ minWidth: 72 }}
                                        >
                                          Sales
                                        </MDButton>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              });
                            })

                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>

                  </MDBox>
                )}

                {showNoDayOutletsHint && (
                  <MDBox mt={2} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      {isCnfStaff
                        ? "No CNF outlets for this staff. Search by outlet name in the box above."
                        : `No outlets on ${dayName} for this staff. Search by outlet name in the box above to record a sale from another weekday's route.`}
                    </MDTypography>
                  </MDBox>
                )}


                {submittedSummary && (
                  <MDBox
                    mt={4}
                    p={3}
                    sx={{
                      backgroundColor: "#f8f9fa",
                      borderRadius: "12px",
                      border: "1px solid #dee2e6",
                    }}
                  >
                    <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
                      <MDTypography variant="h6" fontWeight="bold">
                        Submitted Details
                      </MDTypography>
                      <MDBox display="flex" gap={1} flexWrap="wrap">
                        {(submittedSummary.sales || []).some((sale) => isDetailedBill(sale)) && (
                          <MDButton
                            variant="outlined"
                            color="info"
                            size="small"
                            onClick={() => {
                              const sales = attachLineItemsToSales(submittedSummary.sales || []).filter(isDetailedBill);
                              const byOutlet = new Map();
                              sales.forEach((sale) => {
                                const key = outletKey(sale.outletId);
                                if (!byOutlet.has(key)) byOutlet.set(key, []);
                                byOutlet.get(key).push(sale);
                              });
                              const groups = Array.from(byOutlet.values());
                              if (!groups.length) {
                                alert("No invoices available to download.");
                                return;
                              }
                              groups.forEach((outletSales, index) => {
                                const first = outletSales[0];
                                setTimeout(() => {
                                  printSalesInvoicePdf({
                                    outletName: first.shopName,
                                    outletErpId: first.outletErpId,
                                    locationName: first.locationName,
                                    saleDate: submittedSummary.date
                                      ? new Date(`${submittedSummary.date}T12:00:00`).toLocaleDateString("en-IN")
                                      : selectedDate,
                                    staffName: submittedSummary.staffName || "",
                                    companyName: submittedSummary.companyName || "",
                                    invoices: outletSales,
                                  });
                                }, index * 500);
                              });
                            }}
                          >
                            <Icon sx={{ mr: 1 }}>picture_as_pdf</Icon>
                            Download PDF
                          </MDButton>
                        )}
                        <MDButton
                          variant="outlined"
                          color="dark"
                          size="small"
                          onClick={() => printSalesStickers(submittedSummary.sales)}
                        >
                          <Icon sx={{ mr: 1 }}>label</Icon>
                          Print Stickers
                        </MDButton>
                      </MDBox>
                    </MDBox>
                    <TableContainer
                      sx={{
                        boxShadow: "none",
                        borderTop: "1px solid #e5e7eb",
                        backgroundColor: "transparent",
                        overflowX: "auto",
                      }}
                    >
                      <Table
                        size="small"
                        sx={{
                          tableLayout: "fixed",
                          width: "100%",
                          minWidth: 720,
                          "& .MuiTableCell-root": { overflow: "hidden" },
                        }}
                      >
                        <colgroup>
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "18%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "11%" }} />
                          <col style={{ width: "13%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "8%" }} />
                        </colgroup>
                        <TableHead sx={tableHeadRowSx}>
                          <TableRow>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "6%" }}>
                              Sr No
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "18%" }}>
                              Outlet
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "12%" }}>
                              Area
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "14%" }}>
                              Marketing Person
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "11%" }}>
                              No. of Item
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "13%" }}>
                              Invoice
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "12%" }}>
                              Sticker
                            </TableCell>
                            <TableCell align="right" sx={{ ...tableHeadSx, width: "12%" }}>
                              Amount
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "8%" }}>
                              Action
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {submittedSummary.sales.map((row, index) => (
                            <TableRow
                              key={row.id || index}
                              sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                            >
                              <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                                {index + 1}
                              </TableCell>

                              <TableCell align="left" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                                <MDBox display="flex" alignItems="center" gap={1.5}>
                                  <MDBox lineHeight={1} minWidth={0}>
                                    <MDTypography
                                      display="block"
                                      variant="button"
                                      fontWeight="medium"
                                      color="dark"
                                      sx={{ fontSize: "0.875rem" }}
                                    >
                                      {row.shopName}
                                    </MDTypography>
                                    <MDTypography
                                      variant="caption"
                                      color="text"
                                      sx={{ fontSize: "0.75rem", color: "#6b7280" }}
                                    >
                                      {row.outletErpId || "—"}
                                    </MDTypography>
                                  </MDBox>
                                </MDBox>
                              </TableCell>

                              <TableCell
                                align="left"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {row.locationName || "N/A"}
                              </TableCell>

                              <TableCell
                                align="left"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {row.staffName || "N/A"}
                              </TableCell>

                              <TableCell
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {row.itemCount || "N/A"}
                              </TableCell>

                              <TableCell
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {row.invoiceNumber}
                              </TableCell>

                              <TableCell
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {row.stickerNumber}
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
                                {`₹${Number(row.amount).toFixed(2)}`}
                              </TableCell>

                              <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                                {row.id ? (
                                  <MDBox display="flex" gap={0.5} justifyContent="center" alignItems="center" flexWrap="wrap">
                                    {isDetailedBill(row) && (
                                      <Icon
                                        onClick={() => downloadOutletInvoicePdf(row)}
                                        sx={{ cursor: "pointer", color: "#2563eb", fontSize: 22 }}
                                        titleAccess="Download PDF"
                                      >
                                        picture_as_pdf
                                      </Icon>
                                    )}
                                    <FaRegEdit
                                      onClick={() => (isDetailedBill(row) ? openEditSaleDialog(row) : openManualEditDialog(row))}
                                      style={{ cursor: "pointer" }}
                                      color="#E0E388"
                                      size={20}
                                    />
                                    <CiTrash
                                      onClick={() => handleDeleteSale(row.id)}
                                      style={{ cursor: "pointer" }}
                                      color="#FF0000"
                                      size={20}
                                    />
                                  </MDBox>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </MDBox>
                )}


              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <SalesInvoiceDialog
        open={invoiceDialog.open}
        onClose={closeInvoiceDialog}
        outlet={invoiceDialog.outlet}
        selectedDate={selectedDate}
        companyName={selectedCompanyName}
        invoiceNumber={invoiceDialog.invoiceNumber}
        editMode={Boolean(invoiceDialog.editSaleId)}
        initialItemCount={invoiceDialog.initialItemCount}
        initialPrice={invoiceDialog.initialPrice}
        initialLineItems={invoiceDialog.initialLineItems}
        initialRequisitionNumber={invoiceDialog.requisitionNumber}
        prevBillNo={
          invoiceDialog.outlet ? getPrevBillNoForOutlet(invoiceDialog.outlet.id) : ""
        }
        fetchNextBillNumber={fetchNextBillNumber}
        submitting={submitting || savingEdit}
        onSubmit={handleInvoiceSubmit}
      />

      <Dialog open={billChoiceDialog.open} onClose={closeBillChoiceDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Create Bill?</DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="body2" color="text">
            Do you want to create a detailed sales bill for this outlet? Choose No to enter No. of Item, Invoice No., and Invoice Amount manually.
          </MDTypography>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" variant="outlined" onClick={chooseManualEntry}>
            No, Manual Entry
          </MDButton>
          <MDButton color="info" variant="gradient" onClick={chooseCreateBill}>
            Yes, Create Bill
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog open={manualEditDialog.open} onClose={savingEdit ? undefined : closeManualEditDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Manual Entry</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} pt={0.5}>
            <Grid item xs={12}>
              <MDInput
                label="No. of Item"
                type="number"
                fullWidth
                inputProps={{ min: 1 }}
                value={manualEditDialog.itemCount}
                onChange={(e) => setManualEditDialog((prev) => ({ ...prev, itemCount: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <MDInput
                label="Invoice No."
                fullWidth
                value={getInvoiceSuffix(manualEditDialog.invoiceNumber, editInvoicePrefix)}
                onChange={(e) => {
                  const typed = e.target.value;
                  setManualEditDialog((prev) => ({
                    ...prev,
                    invoiceNumber: editInvoicePrefix ? buildInvoiceNumber(typed, editInvoicePrefix) : typed,
                  }));
                }}
                InputProps={invoicePrefixAdornment(editInvoicePrefix)}
              />
            </Grid>
            <Grid item xs={12}>
              <MDInput
                label="Invoice Amount"
                type="number"
                fullWidth
                inputProps={{ min: 0, step: "0.01" }}
                value={manualEditDialog.price}
                onChange={(e) => setManualEditDialog((prev) => ({ ...prev, price: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" variant="outlined" onClick={closeManualEditDialog} disabled={savingEdit}>
            Cancel
          </MDButton>
          <MDButton color="info" variant="gradient" onClick={handleManualEditSave} disabled={savingEdit}>
            {savingEdit ? "Saving..." : "Save Changes"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog
        open={permissionDialog.open}
        onClose={submitting ? undefined : closePermissionDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {permissionDialog.selfApproval
            ? "Reason Required — Overdue Credit (7 Days Permission)"
            : permissionDialog.approvalRequired
              ? "Admin Approval Required — Overdue Credit"
              : "Permission Required — Overdue Credit"}
        </DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="body2" color="text" mb={2}>
            {permissionDialog.selfApproval
              ? `This ERP ID has credit overdue by ${permissionDialog.selfApproveDays} days or less. With your 7 days overdue permission you can add the sale by giving a reason — no admin approval needed. Admin will see the reason.`
              : permissionDialog.approvalRequired
                ? permissionDialog.serverMessage
                  || "This ERP ID has credit overdue by more than 3 days. Send a request to admin. Once admin approves it, you can create the sales for this date."
                : "This ERP ID has credit overdue by more than 3 days. Permission note is required to add a new sale for the same ERP ID. This permission will be stored in the database."}
          </MDTypography>

          {(permissionDialog.overdueOutlets || []).map((outlet) => {
            const request = requestByOutlet.get(Number(outlet.outletId));
            const statusInfo = request ? REQUEST_STATUS[request.status] : null;
            return (
              <MDBox
                key={`${outlet.outletId}-${outlet.outletErpId}`}
                mb={2}
                p={2}
                sx={{ backgroundColor: "#fff7f7", border: "1px solid #fecaca", borderRadius: "8px" }}
              >
                <MDBox display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                  <MDTypography variant="button" fontWeight="bold" color="error">
                    ERP: {outlet.outletErpId} — {outlet.outletName}
                  </MDTypography>
                  {permissionDialog.approvalRequired && statusInfo && (
                    <MDBadge badgeContent={statusInfo.label} color={statusInfo.color} variant="gradient" size="sm" container />
                  )}
                </MDBox>
                <MDTypography variant="caption" display="block" color="text" mb={1}>
                  Max overdue: {outlet.maxOverdueDays} day(s)
                </MDTypography>
                {(outlet.credits || []).map((credit) => (
                  <MDTypography key={credit.creditPaymentId} variant="caption" display="block" color="text">
                    Invoice {credit.invoiceNumber || "-"} | Balance ₹{Number(credit.balanceAmount || 0).toFixed(2)} | Due{" "}
                    {credit.dueDate || "-"} | Overdue {credit.overdueDays} day(s)
                    {credit.creditStaffName ? ` | Staff: ${credit.creditStaffName}` : ""}
                  </MDTypography>
                ))}
                {permissionDialog.approvalRequired && request && (
                  <MDTypography variant="caption" display="block" color="text" mt={1}>
                    Request #{request.id} by {request.requested_by_name || "-"}: {request.request_note}
                    {request.review_note ? ` | Admin: ${request.review_note}` : ""}
                  </MDTypography>
                )}
              </MDBox>
            );
          })}

          {(!permissionDialog.approvalRequired || needsNewRequest) && (
            <MDBox mt={1}>
              <MDInput
                label={
                  permissionDialog.selfApproval
                    ? "Reason for adding this sale *"
                    : permissionDialog.approvalRequired
                      ? "Reason for request *"
                      : "Permission note *"
                }
                fullWidth
                multiline
                rows={2}
                required
                value={permissionDialog.permissionNote}
                onChange={(e) =>
                  setPermissionDialog((prev) => ({ ...prev, permissionNote: e.target.value }))
                }
              />
            </MDBox>
          )}
          {permissionDialog.approvalRequired && anyRequestPending && (
            <MDTypography variant="caption" display="block" color="text" mt={1}>
              This checks for approval every 15 seconds. You can also close this and submit the same sale again after approval.
            </MDTypography>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton
            color="secondary"
            variant="outlined"
            onClick={closePermissionDialog}
            disabled={submitting || permissionDialog.sendingRequest}
          >
            {permissionDialog.approvalRequired ? "Close" : "Cancel"}
          </MDButton>
          {permissionDialog.approvalRequired ? (
            <>
              {anyRequestPending && (
                <Tooltip title="Check approval status">
                  <IconButton color="info" onClick={refreshOverdueRequests}>
                    <Icon>refresh</Icon>
                  </IconButton>
                </Tooltip>
              )}
              {needsNewRequest && (
                <MDButton
                  color="warning"
                  variant="gradient"
                  onClick={handleSendOverdueRequest}
                  disabled={permissionDialog.sendingRequest || !String(permissionDialog.permissionNote || "").trim()}
                >
                  <Icon sx={{ mr: 0.75 }}>send</Icon>
                  {permissionDialog.sendingRequest ? "Sending..." : "Send Request"}
                </MDButton>
              )}
              <MDButton
                color="success"
                variant="gradient"
                onClick={handleCreateApprovedSales}
                disabled={submitting || !allRequestsApproved}
              >
                <Icon sx={{ mr: 0.75 }}>{allRequestsApproved ? "check_circle" : "lock"}</Icon>
                {submitting ? "Saving..." : "Create Sales"}
              </MDButton>
            </>
          ) : (
            <MDButton
              color="warning"
              variant="gradient"
              onClick={handleGrantPermissionAndSave}
              disabled={submitting || !String(permissionDialog.permissionNote || "").trim()}
            >
              {submitting ? "Saving..." : permissionDialog.selfApproval ? "Add Sales with Reason" : "Grant Permission & Save"}
            </MDButton>
          )}
        </DialogActions>
      </Dialog>

      <OtherDayBitDialog
        open={otherDayDialog.open}
        staffId={selectedStaff?.id || ""}
        saleDate={otherDayDialog.pendingPayload?.date || selectedDate}
        todayDay={otherDayDialog.todayDay}
        reason={otherDayDialog.reason}
        outlets={otherDayDialog.outlets}
        initialRequests={otherDayDialog.requests}
        onClose={closeOtherDayDialog}
        retrying={submitting}
        onRetry={() =>
          submitSalesPayload(otherDayDialog.pendingPayload, otherDayDialog.submittedOutletIds, {
            lineMapPatch: otherDayDialog.lineMapPatch || {},
          })
        }
      />

      <OtherDayRequestsDialog
        open={otherDayListOpen}
        onClose={() => setOtherDayListOpen(false)}
        requests={otherDayRequests}
        onRefresh={loadOtherDayRequests}
        isAdmin={isAdmin}
      />

      <PendingOverdueRequestsDialog
        open={pendingOpen}
        onClose={() => setPendingOpen(false)}
        requests={pendingRequests}
        onRefresh={loadPendingRequests}
        isAdmin={isAdmin}
        creatingRequestId={creatingRequestId}
        onCreate={createFromApprovedRequest}
        onReview={(request, action) => setReview({ request, action })}
      />

      <ReviewDialog
        request={review.request}
        action={review.action}
        onClose={() => setReview({ request: null, action: "approve" })}
        onDone={loadPendingRequests}
      />

      <Footer />
    </DashboardLayout>
  );
}

export default AddSales;
