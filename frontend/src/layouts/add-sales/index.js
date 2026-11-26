// Delivery Manager > Add Sales: Tailwind CSS (no MUI). Staff / outlet loading, entry, overdue / other-day permission,
// requisition, edit / delete and PDF / sticker logic unchanged.
import { useState, useEffect, useMemo, useRef } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { printSalesStickers } from "utils/printSalesStickers";
import { printSalesInvoicePdf } from "utils/printSalesInvoicePdf";
import SalesInvoiceDialog from "layouts/add-sales/components/SalesInvoiceDialog";
import OtherDayBitDialog, { isTodaysBit, todayDate, todayDayName } from "layouts/add-sales/components/OtherDayBitDialog";
import PendingOverdueRequestsDialog from "layouts/add-sales/components/PendingOverdueRequestsDialog";
import OtherDayRequestsDialog from "layouts/add-sales/components/OtherDayRequestsDialog";
import { useAuth } from "context/AuthContext";
import { useCompanyTypeLookup } from "utils/companyTypes";
import ReviewDialog from "layouts/overdue-requests/components/ReviewDialog";
import { getInvoicePrefix, getInvoiceSuffix, buildInvoiceNumber } from "utils/invoicePrefix";
import {
  Badge, Card, Field, Icon, Modal, Notice, PageHeader, SearchSelect, btn, fieldClass,
} from "components/tw";

// Overdue request status: label + badge tone.
const REQUEST_STATUS = {
  pending: { label: "Waiting for admin approval", color: "amber" },
  approved: { label: "Approved — you can create the sales", color: "green" },
  rejected: { label: "Rejected", color: "red" },
  used: { label: "Approval already used", color: "slate" },
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

// Outlet overdue by 14+ days: the invoice can't be billed, only cancelled.
const emptyOverdueCancelDialog = {
  open: false,
  outlets: [],
  sales: [],
  pendingPayload: null,
  lineMapPatch: {},
  entering: false,
  sendingToAdmin: false,
  adminNote: "",
  // "Own permission": the user adds the sale with a reason, no admin approval (admin sees it).
  canOwnPermission: false,
  ownPermission: false,
  ownNote: "",
  saving: false,
  error: "",
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
  // other_day_own_permission: the user may bill these outlets with a reason, no admin approval.
  canOwnPermission: false,
};

function AddSales() {
  const { user } = useAuth() || {};
  const isAdmin = user?.role === "admin";
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaffType, setSelectedStaffType] = useState("");
  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const companyLookup = useCompanyTypeLookup();
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
  // Fixed invoice prefix shown inside the input (the user types only the rest).
  const invoicePrefixTag = (prefix) =>
    prefix ? (
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 whitespace-nowrap text-[12px] font-semibold text-slate-600">
        {prefix}
      </span>
    ) : null;
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

  // Companies set to "No sale bills" in Add Company are left out.
  const noSaleBillCompanies = new Set(
    companyLookup.companies
      .filter((c) => Number(c.creates_sale_bill ?? 1) === 0)
      .map((c) => String(c.name || "").trim().toLowerCase())
  );
  const companyOptions = [
    ...new Set(
      staffOptions
        .filter((staff) => !selectedStaffType || (staff.staff_type || "distributor") === selectedStaffType)
        .flatMap(getStaffCompanies)
        .filter((name) => !noSaleBillCompanies.has(name.toLowerCase()))
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
  const [overdueCancelDialog, setOverdueCancelDialog] = useState(emptyOverdueCancelDialog);
  const approvalDestinations = [...new Set(overdueCancelDialog.outlets.map((outlet) =>
    outlet.approvalTo === "approver" ? outlet.approverName || "the assigned approver" : "Admin"
  ))];
  const requiresTierApproval = overdueCancelDialog.outlets.some((outlet) => outlet.requiresTierApproval);
  const overdueApprovalDestination = approvalDestinations.join(" and ") || "Admin";
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

  // Own-permission reasons given during one save (other-day bit and 14+ days overdue). A save can
  // need both: after one is given the server asks for the other, and every follow-up save of the
  // same entry must send both, or the first question comes back. Cleared when a new entry is saved.
  const ownPermitsRef = useRef({ otherDay: null, overdue: null });
  const startFreshSave = () => {
    ownPermitsRef.current = { otherDay: null, overdue: null };
  };

  const submitSalesPayload = async (
    payload,
    submittedOutletIds = [],
    { permissionGranted = false, permissionNote = "", ownPermission = false, otherDayOwnPermission = false, otherDayNote = "", lineMapPatch = {} } = {}
  ) => {
    if (otherDayOwnPermission) ownPermitsRef.current.otherDay = { note: otherDayNote };
    if (ownPermission) ownPermitsRef.current.overdue = { note: permissionNote };
    const carriedOtherDay = ownPermitsRef.current.otherDay;
    const carriedOverdue = ownPermitsRef.current.overdue;
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
          // An explicit note (admin / 7-day permission) wins; otherwise the carried own-permission reason.
          permissionNote: permissionNote || (carriedOverdue ? carriedOverdue.note : ""),
          ownPermission: ownPermission || Boolean(carriedOverdue),
          otherDayOwnPermission: Boolean(carriedOtherDay),
          otherDayNote: carriedOtherDay ? carriedOtherDay.note : "",
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
          canOwnPermission: Boolean(err.canOwnPermission),
        });
        return false;
      }
      if (response.status === 409 && err.code === "OVERDUE_CANCEL_REQUIRED") {
        closePermissionDialog();
        const blockedIds = new Set((err.overdueOutlets || []).map((outlet) => Number(outlet.outletId)));
        setOverdueCancelDialog({
          ...emptyOverdueCancelDialog,
          open: true,
          outlets: err.overdueOutlets || [],
          sales: (payload.sales || []).filter((sale) => blockedIds.has(Number(sale.outletId))),
          pendingPayload: payload,
          lineMapPatch,
          canOwnPermission: Boolean(err.canOwnPermission),
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

  const handleCancelOverdueInvoices = async () => {
    const { sales, pendingPayload, lineMapPatch } = overdueCancelDialog;
    if (sales.some((sale) => !String(sale.invoiceNumber || "").trim())) {
      setOverdueCancelDialog((prev) => ({ ...prev, error: "Enter the invoice number." }));
      return;
    }
    setOverdueCancelDialog((prev) => ({ ...prev, saving: true, error: "" }));
    const cancelled = [];
    let failure = "";
    for (const sale of sales) {
      try {
        const response = await fetch(`${API}/staff/${selectedStaff.id}/sales/cancel-overdue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: pendingPayload.date,
            outletId: sale.outletId,
            invoiceNumber: String(sale.invoiceNumber).trim(),
            itemCount: sale.itemCount,
            price: sale.price,
            lineItems: sale.lineItems || [],
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Unable to cancel this invoice.");
        cancelled.push(sale);
      } catch (error) {
        failure = `Invoice ${sale.invoiceNumber}: ${error.message}`;
        break;
      }
    }

    // Finished ones leave the list, so a retry only sends what is still waiting.
    const remaining = sales.filter((sale) => !cancelled.includes(sale));
    const cancelledOutletIds = cancelled
      .map((sale) => Number(sale.outletId))
      .filter((outletId) => !remaining.some((sale) => Number(sale.outletId) === outletId));
    if (cancelled.length) await applySalesSuccess(cancelledOutletIds, lineMapPatch);
    if (failure) {
      setOverdueCancelDialog((prev) => ({ ...prev, sales: remaining, saving: false, error: failure }));
      return;
    }

    setOverdueCancelDialog(emptyOverdueCancelDialog);
    alert(`${cancelled.length} invoice(s) cancelled due to overdue. See Delivered → Cancelled Items.`);
    await submitOtherOutlets(pendingPayload, sales, lineMapPatch);
  };

  // Other outlets from the same save still need to go through.
  const submitOtherOutlets = async (pendingPayload, handledSales, lineMapPatch) => {
    const handledIds = new Set(handledSales.map((sale) => Number(sale.outletId)));
    const otherSales = (pendingPayload.sales || []).filter((sale) => !handledIds.has(Number(sale.outletId)));
    if (otherSales.length) {
      await submitSalesPayload(
        { ...pendingPayload, sales: otherSales },
        [...new Set(otherSales.map((sale) => Number(sale.outletId)))],
        { lineMapPatch }
      );
    }
  };

  // 14+ days overdue: the outlet's marketing staff gives the reason and days to pay, then it
  // goes for approval. The sale is created automatically once it is approved.
  const handleSendOverdueToStaff = async () => {
    const { sales, pendingPayload, lineMapPatch } = overdueCancelDialog;
    const outletIds = [...new Set(sales.map((sale) => Number(sale.outletId)))];
    setOverdueCancelDialog((prev) => ({ ...prev, saving: true, error: "" }));
    try {
      const response = await fetch(`${API}/staff/overdue-requests/send-to-staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: selectedStaff.id,
          saleDate: pendingPayload.date,
          outletIds,
          salesPayload: { companyName: pendingPayload.companyName || selectedCompanyName || "", sales },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to send this to marketing staff.");
      await applySalesSuccess(outletIds, lineMapPatch);
      loadPendingRequests();
      setOverdueCancelDialog(emptyOverdueCancelDialog);
      alert("Sent to marketing staff. The sale is created automatically once it is approved.");
      await submitOtherOutlets(pendingPayload, sales, lineMapPatch);
    } catch (error) {
      setOverdueCancelDialog((prev) => ({ ...prev, saving: false, error: error.message }));
    }
  };

  // 14+ days overdue, straight to Admin with a reason. The sale is created once Admin approves.
  const handleSendOverdueToAdmin = async () => {
    const { sales, pendingPayload, lineMapPatch, adminNote } = overdueCancelDialog;
    const note = String(adminNote || "").trim();
    if (!note) {
      setOverdueCancelDialog((prev) => ({ ...prev, error: "Enter the reason for requesting approval." }));
      return;
    }
    const outletIds = [...new Set(sales.map((sale) => Number(sale.outletId)))];
    setOverdueCancelDialog((prev) => ({ ...prev, saving: true, error: "" }));
    try {
      const response = await fetch(`${API}/staff/overdue-requests/send-to-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: selectedStaff.id,
          saleDate: pendingPayload.date,
          outletIds,
          note,
          salesPayload: { companyName: pendingPayload.companyName || selectedCompanyName || "", sales },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to send this for approval.");
      await applySalesSuccess(outletIds, lineMapPatch);
      loadPendingRequests();
      setOverdueCancelDialog(emptyOverdueCancelDialog);
      alert(`${data.message || "Sent for approval."} The sale is created automatically after approval.`);
      await submitOtherOutlets(pendingPayload, sales, lineMapPatch);
    } catch (error) {
      setOverdueCancelDialog((prev) => ({ ...prev, saving: false, error: error.message }));
    }
  };

  // 14+ days overdue on the user's own permission: give a reason and the sale is created now.
  // Admin sees every one under Overdue Requests -> "Own permission (14+ days)".
  const handleOwnPermissionSave = async () => {
    const { sales, pendingPayload, lineMapPatch, ownNote } = overdueCancelDialog;
    const note = String(ownNote || "").trim();
    if (!note) {
      setOverdueCancelDialog((prev) => ({ ...prev, error: "Enter the reason for your own permission." }));
      return;
    }
    const outletIds = [...new Set(sales.map((sale) => Number(sale.outletId)))];
    setOverdueCancelDialog((prev) => ({ ...prev, saving: true, error: "" }));
    const saved = await submitSalesPayload({ ...pendingPayload, sales }, outletIds, {
      ownPermission: true,
      permissionNote: note,
      lineMapPatch,
    });
    if (!saved) {
      // Keep the typed reason so the user can retry.
      setOverdueCancelDialog((prev) => ({ ...prev, saving: false }));
      return;
    }
    setOverdueCancelDialog(emptyOverdueCancelDialog);
    alert("Sales added on your own permission. Admin can see the reason under Overdue Requests.");
    await submitOtherOutlets(pendingPayload, sales, lineMapPatch);
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

    startFreshSave();
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
    startFreshSave();
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

  const head = "whitespace-nowrap bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const cell = "px-3 py-2.5 align-middle text-[13px]";
  const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const prefixPad = (prefix) => (prefix ? { paddingLeft: `${prefix.length * 7.5 + 16}px` } : undefined);
  const headerIcon = (title, icon, count, tone, onClick, ariaLabel) => (
    <button
      type="button" onClick={onClick} title={title} aria-label={ariaLabel}
      className={`relative inline-flex size-10 items-center justify-center rounded-xl border bg-white transition hover:shadow-sm ${count ? "border-slate-300 text-slate-800" : "border-slate-200 text-slate-400"}`}
    >
      <Icon name={icon} className="text-[21px]" />
      {count > 0 && (
        <span className={`absolute -right-1.5 -top-1.5 min-w-5 rounded-full px-1 text-center text-[10.5px] font-bold leading-5 text-white ${tone}`}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
  const smallBtn = "inline-flex size-8 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40";
  const closeOverdueCancel = () => setOverdueCancelDialog(emptyOverdueCancelDialog);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Add Sales"
          description="Daily outlet price entry. Choose the date, staff type, company and marketing person, then add sales for each outlet."
          actions={(
            <>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600">
                {displayOutlets.length > 0
                  ? `${displayOutlets.length} outlet${displayOutlets.length !== 1 ? "s" : ""}`
                  : `${outlets.length} today`}
              </span>
              {headerIcon(
                otherDayBadgeCount
                  ? `Other bit / date approvals: ${otherDayPendingCount} waiting, ${otherDayApprovedCount} approved`
                  : "Other bit / date approvals",
                "event_busy", otherDayBadgeCount, otherDayApprovedCount && !isAdmin ? "bg-emerald-600" : "bg-red-600",
                () => { loadOtherDayRequests(); setOtherDayListOpen(true); }, "Other bit and date approvals",
              )}
              {headerIcon(
                pendingRequests.length ? `${pendingRequests.length} overdue request(s) pending or approved` : "No pending overdue requests",
                "pending_actions", pendingRequests.length, "bg-red-600",
                () => { loadPendingRequests(); setPendingOpen(true); }, "Pending overdue requests",
              )}
            </>
          )}
        />

        <Card className="mb-5">
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Date" width="w-full">
              <input type="date" className={fieldClass} value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setOutletSearch(""); }} />
            </Field>
            <Field label="Staff type" width="w-full">
              <select className={fieldClass} value={selectedStaffType} onChange={(e) => setSelectedStaffType(e.target.value)}>
                <option value="">Select staff type</option>
                <option value="distributor">Distributor</option>
                <option value="cnf">CNF</option>
              </select>
            </Field>
            <Field label="Company name" width="w-full">
              <select className={fieldClass} value={selectedCompanyName} disabled={!selectedStaffType} onChange={(e) => setSelectedCompanyName(e.target.value)}>
                <option value="">Select company</option>
                {companyOptions.map((companyName) => <option key={companyName} value={companyName}>{companyName}</option>)}
                {selectedStaffType && companyOptions.length === 0 && (
                  <option disabled>No {selectedStaffType === "cnf" ? "CNF" : "Distributor"} company found</option>
                )}
              </select>
            </Field>
            <div className="flex flex-col gap-1">
              <span className={label}>Marketing person</span>
              <SearchSelect
                label="Search staff name" placeholder="Search staff name"
                options={filteredStaffOptions.map((staff) => ({ value: staff.id, label: staff.name }))}
                value={selectedStaff?.id ?? null}
                onChange={(id) => {
                  const newValue = filteredStaffOptions.find((staff) => staff.id === id) || null;
                  setSelectedStaff(newValue);
                  setSubmittedSummary(null);
                  setOutletSearch("");
                }}
                disabled={!selectedStaffType || !selectedCompanyName}
                noOptionsText="No staff found"
              />
            </div>
          </div>
        </Card>

        {showEntryTable && (
          <Card className="mb-5">
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
              <div className="mr-auto flex items-center gap-2">
                <h3 className="m-0 text-[15px] font-semibold text-slate-900">Enter Prices for {new Date(selectedDate).toLocaleDateString()}</h3>
                <Badge tone="blue" icon={isCnfStaff ? "business" : "calendar_today"}>{isCnfStaff ? "CNF" : dayName}</Badge>
              </div>
              <div className="flex items-end gap-1.5">
                <Field label="Requisition no." width="w-48">
                  <input
                    className={fieldClass} value={requisitionLookupNumber} disabled={loadingRequisition}
                    onChange={(e) => setRequisitionLookupNumber(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") openRequisitionBillChoice(); }}
                  />
                </Field>
                <button type="button" className={`${btn.primary} px-3`} title="Load requisition" aria-label="Load requisition" onClick={openRequisitionBillChoice} disabled={loadingRequisition}>
                  <Icon name={loadingRequisition ? "hourglass_top" : "search"} className="text-[18px]" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
              <Field label="Search outlet" width="w-full sm:w-96" hint={selectedStaff ? "Search by outlet name, ERP ID, or area across all route days." : null}>
                <input className={fieldClass} placeholder="Outlet name or ERP ID" value={outletSearch} disabled={!selectedStaff} onChange={(e) => setOutletSearch(e.target.value)} />
              </Field>
              {!isCnfStaff && (
                <Field label="Load outlets by day" width="w-full sm:w-64" hint="Adds that day's outlets to the list.">
                  <select
                    className={fieldClass} value=""
                    onChange={(event) => {
                      const newValue = event.target.value;
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
                  >
                    <option value="">Choose a day</option>
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                </Field>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse" style={{ minWidth: invoicePrefix ? 960 : 720 }}>
                <colgroup>
                  {(invoicePrefix
                    ? ["5%", "16%", "10%", "11%", "10%", "23%", "13%", "12%"] // wider Invoice No. for the fixed prefix
                    : ["5%", "19%", "12%", "13%", "12%", "14%", "13%", "12%"]
                  ).map((width, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <col key={i} style={{ width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className={`${head} text-center`}>#</th>
                    <th className={`${head} text-left`}>Outlet</th>
                    <th className={`${head} text-left`}>Area</th>
                    <th className={`${head} text-left`}>Staff name</th>
                    <th className={`${head} text-center`}>No. of item</th>
                    <th className={`${head} text-center`}>Invoice no.</th>
                    <th className={`${head} text-center`}>Invoice amount</th>
                    <th className={`${head} text-center`}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {searchingOutlets ? (
                    <tr><td colSpan={8} className="border-t border-slate-100 px-4 py-10 text-center text-[13px] text-slate-400">Searching outlets...</td></tr>
                  ) : displayOutlets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border-t border-slate-100 px-4 py-10 text-center text-[13px] text-slate-400">
                        {outletSearch.trim()
                          ? "No outlets match this search on this staff's routes."
                          : `No pending outlets for ${dayName}. Use Search Outlet above to find routes from other weekdays.`}
                      </td>
                    </tr>
                  ) : (
                    displayOutlets.map((outlet, outletIndex) => {
                      const rows = salesData[outletKey(outlet.id)] || [];
                      const isManualEntry = manualOutletIds.includes(outletKey(outlet.id));
                      return rows.map((row, index) => {
                        const rowBorder = index === 0 ? "border-t border-slate-200" : "border-t border-slate-100";
                        const approved = approvedOutletIds.has(Number(outlet.id));
                        return (
                          // eslint-disable-next-line react/no-array-index-key
                          <tr key={`${outlet.id}-${index}`} className={isManualEntry ? "bg-blue-50/40" : "hover:bg-slate-50/70"}>
                            <td className={`${cell} ${rowBorder} text-center text-slate-400`}>
                              {index === 0 ? outletIndex + 1 : `${outletIndex + 1}.${index + 1}`}
                            </td>
                            {index === 0 && (
                              <td rowSpan={rows.length} className={`${cell} border-t border-slate-200`}>
                                <span className="block truncate font-semibold text-slate-900" title={outlet.outlet_name}>{outlet.outlet_name}</span>
                                <span className="block font-mono text-[11.5px] text-slate-500">{outlet.outlet_erp_id}</span>
                                {outletApprovalLabel(outlet) && (
                                  <span
                                    className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${approved ? "text-emerald-700" : "text-amber-700"}`}
                                    title={approved
                                      ? "Admin approved this outlet for this date. Save the bill as usual (one time)."
                                      : isOtherDate
                                      ? "Sales for a date other than today need admin approval."
                                      : `Not in today's (${todayDayName()}) bit. Admin approval is needed to add a sale.`}
                                  >
                                    <Icon name={approved ? "verified" : "schedule"} className="text-[14px]" />
                                    {outletApprovalLabel(outlet)}
                                  </span>
                                )}
                              </td>
                            )}
                            {index === 0 && <td rowSpan={rows.length} className={`${cell} border-t border-slate-200 text-slate-600`}>{outlet.location_name || "N/A"}</td>}
                            {index === 0 && <td rowSpan={rows.length} className={`${cell} border-t border-slate-200 text-slate-600`}>{selectedStaff?.name || "N/A"}</td>}
                            <td className={`${cell} ${rowBorder} text-center`}>
                              {isManualEntry && (
                                <input type="number" min={1} aria-label="No. of item" className={`${fieldClass} h-9 text-center`} value={row.itemCount || ""} onChange={(e) => handleManualSalesChange(outlet.id, index, "itemCount", e.target.value)} />
                              )}
                            </td>
                            <td className={`${cell} ${rowBorder} text-center`}>
                              {isManualEntry && (
                                <div className="relative">
                                  {invoicePrefixTag(invoicePrefix)}
                                  <input
                                    aria-label="Invoice no." className={`${fieldClass} h-9`} style={prefixPad(invoicePrefix)}
                                    value={getInvoiceSuffix(row.invoiceNumber, invoicePrefix)}
                                    onChange={(e) =>
                                      handleManualSalesChange(
                                        outlet.id,
                                        index,
                                        "invoiceNumber",
                                        invoicePrefix ? buildInvoiceNumber(e.target.value, invoicePrefix) : e.target.value
                                      )
                                    }
                                  />
                                </div>
                              )}
                            </td>
                            <td className={`${cell} ${rowBorder} text-center`}>
                              {isManualEntry && (
                                <input type="number" min={0} step="0.01" aria-label="Invoice amount" className={`${fieldClass} h-9 text-right`} value={row.price || ""} onChange={(e) => handleManualSalesChange(outlet.id, index, "price", e.target.value)} />
                              )}
                            </td>
                            <td className={`${cell} ${rowBorder} text-center`}>
                              {isManualEntry ? (
                                <span className="inline-flex flex-wrap justify-center gap-1">
                                  <button type="button" className={`${smallBtn} border-blue-200 bg-white text-blue-600 hover:bg-blue-50`} onClick={() => handleAddManualRow(outlet.id)} disabled={submitting} title="Add row" aria-label="Add row">
                                    <Icon name="add" className="text-[18px]" />
                                  </button>
                                  {rows.length > 1 && (
                                    <button type="button" className={`${smallBtn} border-transparent text-red-500 hover:bg-red-50`} onClick={() => handleRemoveManualRow(outlet.id, index)} disabled={submitting} title="Remove row" aria-label="Remove row">
                                      <Icon name="remove" className="text-[18px]" />
                                    </button>
                                  )}
                                  {index === rows.length - 1 && (
                                    <button type="button" className={`${smallBtn} border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700`} onClick={() => handleSaveManualOutlet(outlet.id)} disabled={submitting} title="Save" aria-label="Save">
                                      <Icon name="check" className="text-[18px]" />
                                    </button>
                                  )}
                                  {index === rows.length - 1 && (
                                    <button type="button" className={`${smallBtn} border-red-200 bg-white text-red-600 hover:bg-red-50`} onClick={() => cancelManualEntry(outlet.id)} disabled={submitting} title="Cancel" aria-label="Cancel">
                                      <Icon name="close" className="text-[18px]" />
                                    </button>
                                  )}
                                </span>
                              ) : (
                                <button type="button" className={`${btn.primary} h-8 px-4`} onClick={() => openBillChoiceDialog(outlet, index)} disabled={submitting}>
                                  <Icon name="add_shopping_cart" className="text-[16px]" />Sales
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {showNoDayOutletsHint && (
          <Notice tone="info" className="mb-5">
            {isCnfStaff
              ? "No CNF outlets for this staff. Search by outlet name in the box above."
              : `No outlets on ${dayName} for this staff. Search by outlet name in the box above to record a sale from another weekday's route.`}
          </Notice>
        )}

        {!showEntryTable && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <Icon name="storefront" className="text-[36px] text-slate-300" />
            <p className="m-0 mt-2 text-[14px] font-semibold text-slate-700">Choose a staff type, company and marketing person</p>
            <p className="m-0 mt-1 text-[12.5px] text-slate-500">Their outlets for the selected date appear here.</p>
          </div>
        )}

        {submittedSummary && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="m-0 text-[15px] font-semibold text-slate-900">Submitted Details</h3>
                <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">
                  {submittedSummary.dayName} · {submittedSummary.staffName} · {(submittedSummary.sales || []).length} bill(s) ·
                  {" "}₹{(submittedSummary.sales || []).reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0).toFixed(2)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(submittedSummary.sales || []).some((sale) => isDetailedBill(sale)) && (
                  <button
                    type="button" className={btn.outline}
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
                    <Icon name="picture_as_pdf" className="text-[18px] text-blue-600" />Download PDF
                  </button>
                )}
                <button type="button" className={btn.outline} onClick={() => printSalesStickers(submittedSummary.sales)}>
                  <Icon name="label" className="text-[18px]" />Print Stickers
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] table-fixed border-collapse">
                <colgroup>
                  {["6%", "18%", "12%", "14%", "11%", "13%", "12%", "12%", "10%"].map((width, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <col key={i} style={{ width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className={`${head} text-center`}>#</th>
                    <th className={`${head} text-left`}>Outlet</th>
                    <th className={`${head} text-left`}>Area</th>
                    <th className={`${head} text-left`}>Marketing person</th>
                    <th className={`${head} text-center`}>No. of item</th>
                    <th className={`${head} text-center`}>Invoice</th>
                    <th className={`${head} text-center`}>Sticker</th>
                    <th className={`${head} text-right`}>Amount</th>
                    <th className={`${head} text-center`}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedSummary.sales.map((row, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={row.id || index} className="hover:bg-slate-50/70">
                      <td className={`${cell} border-t border-slate-100 text-center text-slate-400`}>{index + 1}</td>
                      <td className={`${cell} border-t border-slate-100`}>
                        <span className="block truncate font-semibold text-slate-900" title={row.shopName}>{row.shopName}</span>
                        <span className="block font-mono text-[11.5px] text-slate-500">{row.outletErpId || "—"}</span>
                      </td>
                      <td className={`${cell} border-t border-slate-100 text-slate-600`}>{row.locationName || "N/A"}</td>
                      <td className={`${cell} border-t border-slate-100 text-slate-600`}>{row.staffName || "N/A"}</td>
                      <td className={`${cell} border-t border-slate-100 text-center tabular-nums`}>{row.itemCount || "N/A"}</td>
                      <td className={`${cell} border-t border-slate-100 truncate text-center font-mono`}>{row.invoiceNumber}</td>
                      <td className={`${cell} border-t border-slate-100 text-center font-semibold`}>{row.stickerNumber}</td>
                      <td className={`${cell} border-t border-slate-100 whitespace-nowrap text-right font-semibold tabular-nums text-slate-900`}>{`₹${Number(row.amount).toFixed(2)}`}</td>
                      <td className={`${cell} border-t border-slate-100 text-center`}>
                        {row.id ? (
                          <span className="inline-flex gap-0.5">
                            {isDetailedBill(row) && (
                              <button type="button" className={`${btn.icon} text-blue-600 hover:bg-blue-50 hover:text-blue-700`} title="Download PDF" aria-label="Download PDF" onClick={() => downloadOutletInvoicePdf(row)}>
                                <Icon name="picture_as_pdf" className="text-[19px]" />
                              </button>
                            )}
                            <button type="button" className={`${btn.icon} text-amber-600 hover:bg-amber-50 hover:text-amber-700`} title="Edit" aria-label="Edit" onClick={() => (isDetailedBill(row) ? openEditSaleDialog(row) : openManualEditDialog(row))}>
                              <Icon name="edit" className="text-[19px]" />
                            </button>
                            <button type="button" className={`${btn.icon} text-red-500 hover:bg-red-50 hover:text-red-600`} title="Delete" aria-label="Delete" onClick={() => handleDeleteSale(row.id)}>
                              <Icon name="delete" className="text-[19px]" />
                            </button>
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

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

      {/* Detailed bill or manual entry? */}
      <Modal
        open={billChoiceDialog.open} onClose={closeBillChoiceDialog} title="Create Bill?"
        actions={(
          <>
            <button type="button" className={btn.outline} onClick={chooseManualEntry}>No, Manual Entry</button>
            <button type="button" className={btn.primary} onClick={chooseCreateBill}>Yes, Create Bill</button>
          </>
        )}
      >
        <p className="m-0 text-[13.5px] text-slate-600">
          Do you want to create a detailed sales bill for this outlet? Choose No to enter No. of Item, Invoice No., and Invoice Amount manually.
        </p>
      </Modal>

      {/* Edit a manual entry */}
      <Modal
        open={manualEditDialog.open} onClose={closeManualEditDialog} locked={savingEdit} title="Edit Manual Entry"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeManualEditDialog} disabled={savingEdit}>Cancel</button>
            <button type="button" className={btn.primary} onClick={handleManualEditSave} disabled={savingEdit}>{savingEdit ? "Saving..." : "Save Changes"}</button>
          </>
        )}
      >
        <div className="space-y-3">
          <Field label="No. of item" width="w-full">
            <input type="number" min={1} className={fieldClass} value={manualEditDialog.itemCount} onChange={(e) => setManualEditDialog((prev) => ({ ...prev, itemCount: e.target.value }))} />
          </Field>
          <Field label="Invoice no." width="w-full">
            <span className="relative block">
              {invoicePrefixTag(editInvoicePrefix)}
              <input
                className={fieldClass} style={prefixPad(editInvoicePrefix)}
                value={getInvoiceSuffix(manualEditDialog.invoiceNumber, editInvoicePrefix)}
                onChange={(e) => {
                  const typed = e.target.value;
                  setManualEditDialog((prev) => ({
                    ...prev,
                    invoiceNumber: editInvoicePrefix ? buildInvoiceNumber(typed, editInvoicePrefix) : typed,
                  }));
                }}
              />
            </span>
          </Field>
          <Field label="Invoice amount" width="w-full">
            <input type="number" min={0} step="0.01" className={fieldClass} value={manualEditDialog.price} onChange={(e) => setManualEditDialog((prev) => ({ ...prev, price: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {/* Overdue credit: permission note / admin request / own 7-day permission */}
      <Modal
        open={permissionDialog.open} onClose={closePermissionDialog} locked={submitting} size="lg"
        title={permissionDialog.selfApproval
          ? "Reason Required — Overdue Credit (7 Days Permission)"
          : permissionDialog.approvalRequired
            ? "Admin Approval Required — Overdue Credit"
            : "Permission Required — Overdue Credit"}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closePermissionDialog} disabled={submitting || permissionDialog.sendingRequest}>
              {permissionDialog.approvalRequired ? "Close" : "Cancel"}
            </button>
            {permissionDialog.approvalRequired ? (
              <>
                {anyRequestPending && (
                  <button type="button" className={`${btn.icon} text-blue-600`} title="Check approval status" aria-label="Check approval status" onClick={refreshOverdueRequests}>
                    <Icon name="refresh" className="text-[20px]" />
                  </button>
                )}
                {needsNewRequest && (
                  <button type="button" className={`${btn.primary} bg-amber-500 hover:bg-amber-600`} onClick={handleSendOverdueRequest} disabled={permissionDialog.sendingRequest || !String(permissionDialog.permissionNote || "").trim()}>
                    <Icon name="send" className="text-[17px]" />{permissionDialog.sendingRequest ? "Sending..." : "Send Request"}
                  </button>
                )}
                <button type="button" className={`${btn.primary} bg-emerald-600 hover:bg-emerald-700`} onClick={handleCreateApprovedSales} disabled={submitting || !allRequestsApproved}>
                  <Icon name={allRequestsApproved ? "check_circle" : "lock"} className="text-[17px]" />{overdueCancelDialog.saving ? "Saving..." : "Create Sales"}
                </button>
              </>
            ) : (
              <button type="button" className={`${btn.primary} bg-amber-500 hover:bg-amber-600`} onClick={handleGrantPermissionAndSave} disabled={submitting || !String(permissionDialog.permissionNote || "").trim()}>
                {submitting ? "Saving..." : permissionDialog.selfApproval ? "Add Sales with Reason" : "Grant Permission & Save"}
              </button>
            )}
          </>
        )}
      >
        <p className="m-0 mb-4 text-[13px] text-slate-600">
          {permissionDialog.selfApproval
            ? `This ERP ID has credit overdue by ${permissionDialog.selfApproveDays} days or less. With your 7 days overdue permission you can add the sale by giving a reason — no admin approval needed. Admin will see the reason.`
            : permissionDialog.approvalRequired
              ? permissionDialog.serverMessage
                || "This ERP ID has credit overdue by more than 3 days. Send a request to admin. Once admin approves it, you can create the sales for this date."
              : "This ERP ID has credit overdue by more than 3 days. Permission note is required to add a new sale for the same ERP ID. This permission will be stored in the database."}
        </p>
        <div className="space-y-3">
          {(permissionDialog.overdueOutlets || []).map((outlet) => {
            const request = requestByOutlet.get(Number(outlet.outletId));
            const statusInfo = request ? REQUEST_STATUS[request.status] : null;
            return (
              <div key={`${outlet.outletId}-${outlet.outletErpId}`} className="rounded-xl border border-red-200 bg-red-50/50 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-red-800">ERP: {outlet.outletErpId} — {outlet.outletName}</span>
                  {permissionDialog.approvalRequired && statusInfo && <Badge tone={statusInfo.color}>{statusInfo.label}</Badge>}
                </div>
                <p className="m-0 mb-1.5 mt-0.5 text-[12px] text-slate-600">Max overdue: <b>{outlet.maxOverdueDays} day(s)</b></p>
                {(outlet.credits || []).map((credit) => (
                  <p key={credit.creditPaymentId} className="m-0 text-[12px] text-slate-600">
                    Invoice {credit.invoiceNumber || "-"} | Balance ₹{Number(credit.balanceAmount || 0).toFixed(2)} | Due{" "}
                    {credit.dueDate || "-"} | Overdue {credit.overdueDays} day(s)
                    {credit.creditStaffName ? ` | Staff: ${credit.creditStaffName}` : ""}
                  </p>
                ))}
                {permissionDialog.approvalRequired && request && (
                  <p className="m-0 mt-1.5 text-[12px] text-slate-600">
                    Request #{request.id} by {request.requested_by_name || "-"}: {request.request_note}
                    {request.review_note ? ` | Admin: ${request.review_note}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {(!permissionDialog.approvalRequired || needsNewRequest) && (
          <label className="mt-4 flex flex-col gap-1">
            <span className={label}>
              {permissionDialog.selfApproval
                ? "Reason for adding this sale *"
                : permissionDialog.approvalRequired
                  ? "Reason for request *"
                  : "Permission note *"}
            </span>
            <textarea rows={2} required className={`${fieldClass} h-auto py-2`} value={permissionDialog.permissionNote} onChange={(e) => setPermissionDialog((prev) => ({ ...prev, permissionNote: e.target.value }))} />
          </label>
        )}
        {permissionDialog.approvalRequired && anyRequestPending && (
          <p className="m-0 mt-2 text-[12px] text-slate-500">This checks for approval every 15 seconds. You can also close this and submit the same sale again after approval.</p>
        )}
      </Modal>

      {/* Outlet overdue by 14+ days: send to staff / admin, own permission, or cancel the invoice */}
      <Modal
        open={overdueCancelDialog.open} onClose={closeOverdueCancel} locked={overdueCancelDialog.saving} size="lg"
        title={overdueCancelDialog.entering
          ? "Cancel Invoice — Enter Invoice Number"
          : overdueCancelDialog.sendingToAdmin
            ? `Send to ${overdueApprovalDestination} — Enter Reason`
            : overdueCancelDialog.ownPermission
              ? "Own Permission — Enter Reason"
              : "Outlet Overdue by More Than 13 Days"}
        actions={(
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btn.ghost} disabled={overdueCancelDialog.saving} onClick={closeOverdueCancel}>Close</button>
            {overdueCancelDialog.entering ? (
              <button type="button" className={btn.danger} disabled={overdueCancelDialog.saving} onClick={handleCancelOverdueInvoices}>
                {overdueCancelDialog.saving ? "Cancelling..." : "Confirm Cancel"}
              </button>
            ) : overdueCancelDialog.sendingToAdmin ? (
              <button type="button" className={btn.primary} disabled={overdueCancelDialog.saving} onClick={handleSendOverdueToAdmin}>
                {overdueCancelDialog.saving ? "Sending..." : "Confirm send"}
              </button>
            ) : overdueCancelDialog.ownPermission ? (
              <button type="button" className={`${btn.primary} bg-emerald-600 hover:bg-emerald-700`} disabled={overdueCancelDialog.saving} onClick={handleOwnPermissionSave}>
                {overdueCancelDialog.saving ? "Saving..." : "Create Sales"}
              </button>
            ) : (
              <>
                {!requiresTierApproval && <button type="button" className={btn.outline} disabled={overdueCancelDialog.saving} onClick={handleSendOverdueToStaff}>
                  {overdueCancelDialog.saving ? "Sending..." : "Send to Marketing Staff"}
                </button>}
                <button type="button" className={btn.primary} disabled={overdueCancelDialog.saving} onClick={() => setOverdueCancelDialog((prev) => ({ ...prev, sendingToAdmin: true, error: "" }))}>
                  {approvalDestinations.length > 1 ? "Send for approval" : `Send to ${overdueApprovalDestination}`}
                </button>
                {overdueCancelDialog.canOwnPermission && (
                  <button type="button" className={`${btn.primary} bg-emerald-600 hover:bg-emerald-700`} disabled={overdueCancelDialog.saving} onClick={() => setOverdueCancelDialog((prev) => ({ ...prev, ownPermission: true, error: "" }))}>
                    Own Permission
                  </button>
                )}
                <button type="button" className={btn.danger} disabled={overdueCancelDialog.saving} onClick={() => setOverdueCancelDialog((prev) => ({ ...prev, entering: true, error: "" }))}>
                  Cancel Invoice
                </button>
              </>
            )}
          </div>
        )}
      >
        <div className="mb-4 space-y-2">
          {overdueCancelDialog.outlets.map((outlet) => (
            <div key={outlet.outletId} className="rounded-xl border border-red-200 bg-red-50/50 p-3.5">
              <span className="block text-[13px] font-bold text-red-800">ERP: {outlet.outletErpId} — {outlet.outletName}</span>
              <span className="block text-[12px] text-slate-600">
                Overdue {outlet.maxOverdueDays} day(s) · ₹
                {(outlet.credits || [])
                  .reduce((total, credit) => total + (Number(credit.balanceAmount) || 0), 0)
                  .toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              {outlet.approvalTo === "approver" && (
                <span className="block text-[12px] font-semibold text-indigo-700">Approver: {outlet.approverName}</span>
              )}
            </div>
          ))}
        </div>
        {overdueCancelDialog.entering ? (
          <>
            <p className="m-0 mb-3 text-[13px] text-slate-600">
              The invoice goes to Delivered → Cancelled Items with the reason &quot;Cancelled due to overdue&quot;.
              No stock is taken.
            </p>
            <div className="space-y-3">
              {overdueCancelDialog.sales.map((sale, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <Field key={`${sale.outletId}-${index}`} label="Invoice number *" width="w-full" hint={`Amount ₹${Number(sale.price || 0).toFixed(2)} · ${sale.itemCount} item(s)`}>
                  <input
                    className={fieldClass} value={sale.invoiceNumber || ""}
                    onChange={(event) => {
                      const { value } = event.target;
                      setOverdueCancelDialog((prev) => ({
                        ...prev,
                        sales: prev.sales.map((row, rowIndex) => (rowIndex === index ? { ...row, invoiceNumber: value } : row)),
                      }));
                    }}
                  />
                </Field>
              ))}
            </div>
          </>
        ) : overdueCancelDialog.sendingToAdmin ? (
          <>
            <p className="m-0 mb-3 text-[13px] text-slate-600">
              This request goes to {overdueApprovalDestination}. Approval creates the sale and deducts stock.
              Rejection sends the invoice to Delivered → Cancelled Items.
            </p>
            <label className="flex flex-col gap-1">
              <span className={label}>Reason *</span>
              <textarea
                rows={2} className={`${fieldClass} h-auto py-2`} value={overdueCancelDialog.adminNote}
                onChange={(event) => {
                  const { value } = event.target;
                  setOverdueCancelDialog((prev) => ({ ...prev, adminNote: value }));
                }}
              />
            </label>
          </>
        ) : overdueCancelDialog.ownPermission ? (
          <>
            <p className="m-0 mb-3 text-[13px] text-slate-600">
              The sale is created now on your own permission, without admin approval (stock is deducted). Admin
              will see your name and this reason under Overdue Requests.
            </p>
            <label className="flex flex-col gap-1">
              <span className={label}>Reason for own permission *</span>
              <textarea
                rows={2} className={`${fieldClass} h-auto py-2`} value={overdueCancelDialog.ownNote}
                onChange={(event) => {
                  const { value } = event.target;
                  setOverdueCancelDialog((prev) => ({ ...prev, ownNote: value, error: "" }));
                }}
              />
            </label>
          </>
        ) : (
          <p className="m-0 text-[13px] text-slate-600">This invoice cannot be billed. Choose what to do with it.</p>
        )}
        {overdueCancelDialog.error && <Notice tone="error" className="mt-3">{overdueCancelDialog.error}</Notice>}
      </Modal>

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
        canOwnPermission={otherDayDialog.canOwnPermission}
        onOwnPermission={(note) =>
          submitSalesPayload(otherDayDialog.pendingPayload, otherDayDialog.submittedOutletIds, {
            lineMapPatch: otherDayDialog.lineMapPatch || {},
            otherDayOwnPermission: true,
            otherDayNote: note,
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
