// Delivery Manager > Packaging: Tailwind CSS (no MUI). Sales sync, packer / save, remarks and history logic unchanged.
import { useState, useEffect, useCallback, useRef } from "react";

import SalesExcelButton from "components/SalesExcelButton";
import CompanyFilter from "components/CompanyFilter";
import { matchesSaleCompany } from "utils/companyFilter";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  enhancePackagingRow,
  isPackagingRowDirty,
  mergeSalesRows,
  useSalesPolling,
} from "utils/salesSync";
import { formatBpSaleId } from "utils/saleId";
import { ROWS_PER_PAGE } from "utils/tablePagination";
import {
  Card, Field, Icon, Modal, PageHeader, Pagination, SearchBox, StatBox, btn, fieldClass,
} from "components/tw";

const REMARK_CATEGORIES = [{ value: "pending_item", label: "Pending Item" }];

const ISSUE_TYPES = [
  { value: "cancel", label: "Cancel" },
  { value: "wrong_delivered", label: "Wrong Delivered" },
];

const remarkCategoryLabels = {
  pending_item: "Pending Item",
};

const issueTypeLabels = {
  cancel: "Cancel",
  wrong_delivered: "Wrong Delivered",
};

const emptyRemarkItemForm = () => ({
  itemName: "",
  wrongItem: "",
  originalItem: "",
  qty: "",
  amount: "",
  remarks: "",
});

function Packaging() {
  const [dateFilterMode, setDateFilterMode] = useState("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [salesData, setSalesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [historyDialog, setHistoryDialog] = useState({ open: false, sale: null, history: [] });
  const [packerDialog, setPackerDialog] = useState({
    open: false,
    saleId: null,
    selectedPackerId: "",
    previousStatus: "",
    fromSave: false,
  });
  const [remarksDialog, setRemarksDialog] = useState({ open: false, sale: null });
  const [savedRemarks, setSavedRemarks] = useState([]);
  const [loadingRemarks, setLoadingRemarks] = useState(false);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [remarkCategory, setRemarkCategory] = useState("pending_item");
  const [issueType, setIssueType] = useState("");
  const [remarkItemForm, setRemarkItemForm] = useState(emptyRemarkItemForm());
  const [pendingRemarkItems, setPendingRemarkItems] = useState([]);
  const pendingRemarkIdRef = useRef(0);
  const [packagingStaff, setPackagingStaff] = useState([]);
  const [savingSaleIds, setSavingSaleIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);
  const recentlySavedRef = useRef(new Map());
  const API = (process.env.REACT_APP_API_URL);

  const statusLabels = {
    not_packing: "Not Packing",
    packing: "Packing In Progress",
    packing_done: "Packing Done",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    const dateOnly = String(value).split("T")[0].split(" ")[0];
    const parts = dateOnly.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return value;
  };

  const formatDateTime = (value) => {
    if (!value) return "N/A";
    const [datePart, timePart = ""] = String(value).split(/[T ]/);
    return `${formatDate(datePart)}${timePart ? ` ${timePart.slice(0, 5)}` : ""}`;
  };

  const fetchSales = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fetch(`${API}/staff/sales/by-date?scope=packaging`);
      if (response.ok) {
        const data = await response.json();
        setSalesData((prev) =>
          mergeSalesRows(
            data,
            prev,
            enhancePackagingRow,
            isPackagingRowDirty,
            recentlySavedRef.current
          )
        );
      } else if (!silent) {
        console.error("Failed to fetch sales for packaging");
        setSalesData([]);
      }
    } catch (error) {
      if (!silent) {
        console.error("Error fetching global sales:", error);
      }
    }
  }, [API]);

  useEffect(() => {
    fetchSales();
  }, [selectedDate, fetchSales]);

  useEffect(() => {
    const fetchPackagingStaff = async () => {
      try {
        const response = await fetch(`${API}/delivery-boy`);
        if (response.ok) {
          const data = await response.json();
          setPackagingStaff(
            data.filter((person) => person.role === "packaging_staff" && Number(person.is_active) === 1)
          );
        }
      } catch (error) {
        console.error("Error fetching packaging staff:", error);
      }
    };
    fetchPackagingStaff();
  }, [API]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, companyFilter, statusFilter, dateFilterMode, selectedDate, rowsPerPage]);

  useSalesPolling(fetchSales);

  const handleRowChange = (saleId, field, value) => {
    const newData = [...salesData];
    const index = newData.findIndex(r => r.id === saleId);
    if (index === -1) return;

    if (field === "packaging_status" && value === "packing_done") {
      newData[index] = {
        ...newData[index],
        packaging_status: value,
        status_update_date: "",
        status_update_date_changed: false,
      };
      setSalesData(newData);
      setPackerDialog({
        open: true,
        saleId,
        selectedPackerId: newData[index].packed_by_id ? String(newData[index].packed_by_id) : "",
        previousStatus: newData[index].original_packaging_status || "not_packing",
        fromSave: false,
      });
      return;
    }

    newData[index] = { ...newData[index], [field]: value };
    if (field === "packaging_status" && value !== newData[index].original_packaging_status) {
      newData[index].status_update_date = "";
      newData[index].status_update_date_changed = false;
      newData[index].packed_by_id = "";
      newData[index].packed_by_name = "";
    }
    if (field === "status_update_date") {
      newData[index].status_update_date_changed = true;
    }
    setSalesData(newData);
  };

  const handleClosePackerDialog = (confirmed = false) => {
    const { saleId, selectedPackerId, previousStatus, fromSave } = packerDialog;
    if (confirmed && saleId) {
      const selectedStaff = packagingStaff.find(
        (person) => Number(person.id) === Number(selectedPackerId)
      );
      if (!selectedStaff) {
        alert("Please select who completed the packing.");
        return;
      }
      setSalesData((prev) =>
        prev.map((row) =>
          row.id === saleId
            ? {
              ...row,
              packed_by_id: selectedStaff.id,
              packed_by_name: selectedStaff.name,
            }
            : row
        )
      );
      setPackerDialog({
        open: false,
        saleId: null,
        selectedPackerId: "",
        previousStatus: "",
        fromSave: false,
      });
      if (fromSave) {
        handleSavePackaging(saleId, {
          packedById: selectedStaff.id,
          packedByName: selectedStaff.name,
        });
      }
      return;
    }

    if (saleId && !fromSave) {
      setSalesData((prev) =>
        prev.map((row) =>
          row.id === saleId
            ? {
              ...row,
              packaging_status: previousStatus || row.original_packaging_status || "not_packing",
              packed_by_id: row.original_packed_by_id ?? "",
              packed_by_name: row.original_packed_by_name ?? "",
            }
            : row
        )
      );
    }
    setPackerDialog({
      open: false,
      saleId: null,
      selectedPackerId: "",
      previousStatus: "",
      fromSave: false,
    });
  };

  const openPackerDialogForSave = (saleId, row, { fromSave = false } = {}) => {
    setPackerDialog({
      open: true,
      saleId,
      selectedPackerId: row.packed_by_id ? String(row.packed_by_id) : "",
      previousStatus: fromSave
        ? row.original_packaging_status || "not_packing"
        : row.packaging_status || row.original_packaging_status || "not_packing",
      fromSave,
    });
  };

  const handleSavePackaging = async (saleId, overrides = {}) => {
    const row = salesData.find(r => r.id === saleId);
    if (!row || savingSaleIds.has(saleId)) return;

    const packedById = overrides.packedById ?? row.packed_by_id;
    const packagingStatus = row.packaging_status || "not_packing";

    if (packagingStatus === "packing_done" && !packedById) {
      openPackerDialogForSave(saleId, row, { fromSave: true });
      return;
    }

    if (
      row.original_packaging_status !== row.packaging_status &&
      (!row.status_update_date || !row.status_update_date_changed)
    ) {
      alert("Status changed — please choose a Status Date before saving.");
      return;
    }

    const packedItemCount = parseInt(row.packed_item_count, 10);
    const originalItemCount = Number(row.item_count || 0);
    const boxCount = parseInt(row.box_count, 10);
    const packetCount = parseInt(row.packet_count, 10);
    if (Number.isNaN(packedItemCount) || packedItemCount <= 0) {
      alert("Please enter Packing Item.");
      return;
    }
    if (originalItemCount > 0 && packedItemCount > originalItemCount) {
      alert("Packing Item cannot be more than No. of Item.");
      return;
    }
    if (Number.isNaN(boxCount) || boxCount < 0) {
      alert("Please enter No. of Box (0 or more).");
      return;
    }
    if (Number.isNaN(packetCount) || packetCount < 0) {
      alert("Please enter No. of Packet (0 or more).");
      return;
    }

    setSavingSaleIds((prev) => new Set(prev).add(saleId));

    try {
      const payload = {
        packagingStatus,
        statusDate: row.status_update_date || null,
        expectedStatus: row.original_packaging_status,
        packedItemCount,
        boxCount,
        packetCount,
        packedById: packagingStatus === "packing_done" ? Number(packedById) : null,
      };

      const response = await fetch(`${API}/staff/sales/${row.id}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const updated = enhancePackagingRow({
          ...data.sale,
          packed_by_id: overrides.packedById ?? data.sale?.packed_by_id,
          packed_by_name: overrides.packedByName ?? data.sale?.packed_by_name,
        });
        recentlySavedRef.current.set(saleId, Date.now());

        if (updated.packaging_status === "packing_done") {
          setSalesData((prev) => prev.filter((item) => item.id !== saleId));
        } else {
          setSalesData((prev) => prev.map((item) => (item.id === saleId ? updated : item)));
        }
      } else if (response.status === 409) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "This record was updated by another user.");
        fetchSales();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update packaging status.");
      }
    } catch (error) {
      console.error("Error saving packaging:", error);
      alert("Error saving packaging status.");
    } finally {
      setSavingSaleIds((prev) => {
        const next = new Set(prev);
        next.delete(saleId);
        return next;
      });
    }
  };

  const fetchPackagingRemarks = async (saleId) => {
    setLoadingRemarks(true);
    try {
      const response = await fetch(`${API}/staff/sales/${saleId}/packaging-remarks`);
      if (response.ok) {
        const data = await response.json();
        setSavedRemarks(Array.isArray(data) ? data : []);
      } else {
        setSavedRemarks([]);
      }
    } catch (error) {
      console.error("Error fetching packaging remarks:", error);
      setSavedRemarks([]);
    } finally {
      setLoadingRemarks(false);
    }
  };

  const openRemarksDialog = async (sale) => {
    setRemarksDialog({ open: true, sale });
    setRemarkCategory("pending_item");
    setIssueType("");
    setRemarkItemForm(emptyRemarkItemForm());
    setPendingRemarkItems([]);
    await fetchPackagingRemarks(sale.id);
  };

  const closeRemarksDialog = () => {
    setRemarksDialog({ open: false, sale: null });
    setSavedRemarks([]);
    setRemarkCategory("pending_item");
    setIssueType("");
    setRemarkItemForm(emptyRemarkItemForm());
    setPendingRemarkItems([]);
    setLoadingRemarks(false);
    setSavingRemarks(false);
  };

  const handleRemarkFormChange = (field, value) => {
    setRemarkItemForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleIssueTypeChange = (value) => {
    setIssueType(value);
    setRemarkItemForm(emptyRemarkItemForm());
    setPendingRemarkItems([]);
  };

  const handleAddPendingRemarkItem = () => {
    if (!issueType) {
      alert("Please choose Cancel or Wrong Delivered.");
      return;
    }
    const { itemName, wrongItem, originalItem, qty, amount, remarks } = remarkItemForm;

    if (issueType === "wrong_delivered") {
      if (!wrongItem.trim()) {
        alert("Please enter wrong item.");
        return;
      }
      if (!originalItem.trim()) {
        alert("Please enter original item.");
        return;
      }
    } else if (!itemName.trim()) {
      alert("Please enter item name.");
      return;
    }

    const parsedQty = parseFloat(qty);
    if (!qty || Number.isNaN(parsedQty) || parsedQty <= 0) {
      alert("Please enter a valid qty.");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      alert("Please enter a valid total amount.");
      return;
    }

    pendingRemarkIdRef.current += 1;
    setPendingRemarkItems((prev) => [
      ...prev,
      {
        id: `pending-${pendingRemarkIdRef.current}`,
        itemName: issueType === "wrong_delivered" ? wrongItem.trim() : itemName.trim(),
        wrongItem: issueType === "wrong_delivered" ? wrongItem.trim() : "",
        originalItem: issueType === "wrong_delivered" ? originalItem.trim() : "",
        qty: parsedQty,
        amount: parsedAmount,
        remarks: remarks.trim(),
      },
    ]);
    setRemarkItemForm(emptyRemarkItemForm());
  };

  const handleRemovePendingRemarkItem = (itemId) => {
    setPendingRemarkItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleSaveRemarks = async () => {
    if (!remarksDialog.sale) return;
    if (!issueType) {
      alert("Please choose Cancel or Wrong Delivered.");
      return;
    }
    if (pendingRemarkItems.length === 0) {
      alert("Please add at least one item.");
      return;
    }

    setSavingRemarks(true);
    try {
      const response = await fetch(`${API}/staff/sales/${remarksDialog.sale.id}/packaging-remarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remarkCategory,
          issueType,
          items: pendingRemarkItems.map(({ itemName, wrongItem, originalItem, qty, amount, remarks }) => ({
            itemName,
            wrongItem,
            originalItem,
            qty,
            amount,
            remarks,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSavedRemarks(Array.isArray(data.remarks) ? data.remarks : []);
        setPendingRemarkItems([]);
        setRemarkItemForm(emptyRemarkItemForm());
        alert("Remarks saved successfully.");
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to save remarks.");
      }
    } catch (error) {
      console.error("Error saving packaging remarks:", error);
      alert("Error saving remarks.");
    } finally {
      setSavingRemarks(false);
    }
  };

  const handleViewHistory = async (saleId) => {
    try {
      const response = await fetch(`${API}/staff/sales/${saleId}/status-history`);
      if (response.ok) {
        const data = await response.json();
        setHistoryDialog({ open: true, sale: data.sale, history: data.history || [] });
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to load status dates.");
      }
    } catch (error) {
      console.error("Error loading status history:", error);
      alert("Error loading status dates.");
    }
  };

  const getRowColor = (status) => {
    if (status === 'packing_done') return '#dcfce7'; // green
    if (status === 'packing') return '#fef08a'; // yellow
    return '#ffebeb'; // default red
  };

  const getTextColor = (status) => {
    if (status === 'packing_done') return '#166534'; // dark green
    if (status === 'packing') return '#854d0e'; // dark yellow
    return '#991b1b'; // dark red
  };

  const filteredSales = salesData.filter((row) => {
    if (!matchesSaleCompany(row, companyFilter)) return false;
    const status = row.packaging_status || row.original_packaging_status || "not_packing";
    const isTerminalStatus =
      status === "packing_done" ||
      status === "out_for_delivery" ||
      status === "delivered" ||
      status === "cancelled" ||
      status === "returned";

    // Keep locally edited rows visible until saved, so user can set date and click save.
    if (isTerminalStatus && !isPackagingRowDirty(row)) {
      return false;
    }

    if (statusFilter !== "all" && status !== statusFilter) {
      return false;
    }

    const search = searchQuery.toLowerCase();
    const outletName = row.outlet_name ? row.outlet_name.toLowerCase() : "";
    const outletArea = row.location_name ? row.location_name.toLowerCase() : "";
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    const staffName = row.staff_name ? row.staff_name.toLowerCase() : "";
    const companyName = row.company_name ? row.company_name.toLowerCase() : "";
    const saleId = formatBpSaleId(row).toLowerCase();
    const invoiceNumber = row.invoice_number ? String(row.invoice_number).toLowerCase() : "";
    return (
      outletName.includes(search) ||
      outletArea.includes(search) ||
      outletErpId.includes(search) ||
      staffName.includes(search) ||
      companyName.includes(search) ||
      saleId.includes(search) ||
      invoiceNumber.includes(search)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / rowsPerPage));
  const paginatedSales = filteredSales.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const head = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const cell = "px-3 py-2.5 text-[12.5px]";
  const mini = "whitespace-nowrap bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const miniTd = "border-t border-slate-100 px-3 py-2 text-[12.5px]";
  const notStarted = filteredSales.filter((row) => (row.packaging_status || "not_packing") === "not_packing").length;
  const inProgress = filteredSales.filter((row) => row.packaging_status === "packing").length;
  const closeHistory = () => setHistoryDialog({ open: false, sale: null, history: [] });
  const label = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Packaging"
          description="Daily sales waiting to be packed. Enter packed items, boxes and packets, set the status and date, then save."
          actions={<SalesExcelButton rows={filteredSales} filename="Packaging_Daily_Sales" />}
        />

        <div className="mb-5 flex flex-wrap gap-2">
          <StatBox label="To pack" value={filteredSales.length} icon="inventory_2" />
          <StatBox label="Not started" value={notStarted} icon="hourglass_empty" />
          <StatBox label="In progress" value={inProgress} icon="package_2" />
        </div>

        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
            <div className="flex min-w-64 grow flex-col gap-1">
              <span className={label}>Search</span>
              <SearchBox value={searchQuery} onChange={setSearchQuery} className="w-full" placeholder="Outlet, ERP ID, staff, sale ID or invoice no." />
            </div>
            <div className="w-full sm:w-96"><CompanyFilter id="packaging-company-filter" rows={salesData} value={companyFilter} onChange={setCompanyFilter} /></div>
            <Field label="Progress" width="w-40">
              <select className={fieldClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All progress</option>
                <option value="not_packing">Not started</option>
                <option value="packing">In progress</option>
              </select>
            </Field>
            <Field label="Dates" width="w-52">
              <select className={fieldClass} value={dateFilterMode} onChange={(e) => setDateFilterMode(e.target.value)}>
                <option value="all">All dates (incl. previous)</option>
                <option value="specific">Specific date</option>
              </select>
            </Field>
            {dateFilterMode === "specific" && (
              <Field label="Sale date" width="w-40">
                <input type="date" className={fieldClass} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              </Field>
            )}
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1500px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={`${head} text-center`}>#</th>
                  {["Staff", "Company", "Outlet", "Area", "ERP ID"].map((h) => <th key={h} className={`${head} text-left`}>{h}</th>)}
                  {dateFilterMode === "all" && <th className={`${head} text-left`}>Sale date</th>}
                  <th className={`${head} text-center`}>Sale ID</th>
                  <th className={`${head} text-center`}>Invoice no</th>
                  <th className={`${head} text-right`}>Price</th>
                  {["Items", "Packing item", "Boxes", "Packets", "Status", "Packed by", "Status date", "Action"].map((h) => <th key={h} className={`${head} text-center`}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {paginatedSales.length > 0 ? paginatedSales.map((row, index) => {
                  const bgColor = getRowColor(row.packaging_status);
                  const txColor = getTextColor(row.packaging_status);
                  const td = `${cell} border-t border-white/70`;
                  const num = `${fieldClass} h-8 text-center text-slate-800`;
                  return (
                    <tr key={row.id} style={{ backgroundColor: bgColor, color: txColor }}>
                      <td className={`${td} text-center opacity-70`}>{(page - 1) * rowsPerPage + index + 1}</td>
                      <td className={`${td} whitespace-nowrap`}>{row.staff_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{row.company_name || "N/A"}</td>
                      <td className={`${td} font-semibold`}>{row.outlet_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{row.location_name || "N/A"}</td>
                      <td className={`${td} whitespace-nowrap font-mono text-[11.5px]`}>{row.outlet_erp_id}</td>
                      {dateFilterMode === "all" && <td className={`${td} whitespace-nowrap`}>{formatDate(row.sale_date || row.formatted_date)}</td>}
                      <td className={`${td} text-center font-bold`}>{row.sticker_number}</td>
                      <td className={`${td} text-center font-mono`}>{row.invoice_number}</td>
                      <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums`}>₹{Number(row.price).toFixed(2)}</td>
                      <td className={`${td} text-center tabular-nums`}>{row.item_count || "N/A"}</td>
                      <td className={`${td} text-center`}>
                        <input type="number" aria-label="Packing item" min={1} max={row.item_count || undefined} className={`${num} w-24`} value={row.packed_item_count || ""} onChange={(e) => handleRowChange(row.id, "packed_item_count", e.target.value)} />
                      </td>
                      <td className={`${td} text-center`}>
                        <input type="number" aria-label="No. of box" min={0} className={`${num} w-20`} value={row.box_count ?? ""} onChange={(e) => handleRowChange(row.id, "box_count", e.target.value)} />
                      </td>
                      <td className={`${td} text-center`}>
                        <input type="number" aria-label="No. of packet" min={0} className={`${num} w-20`} value={row.packet_count ?? ""} onChange={(e) => handleRowChange(row.id, "packet_count", e.target.value)} />
                      </td>
                      <td className={`${td} text-center`}>
                        <select aria-label="Status" className={`${fieldClass} h-8 min-w-40 text-slate-800`} value={row.packaging_status || "not_packing"} onChange={(e) => handleRowChange(row.id, "packaging_status", e.target.value)}>
                          <option value="not_packing">Not Packing</option>
                          <option value="packing">Packing In Progress</option>
                          <option value="packing_done">Packing Done</option>
                        </select>
                      </td>
                      <td className={`${td} whitespace-nowrap text-center`}>
                        {row.packaging_status === "packing_done"
                          ? row.packed_by_name || (
                            <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-semibold text-amber-700 underline" onClick={() => openPackerDialogForSave(row.id, row)}>
                              Select packer
                            </button>
                          )
                          : "—"}
                      </td>
                      <td className={`${td} text-center`}>
                        <input type="date" aria-label="Status date" className={`${fieldClass} h-8 w-36 text-slate-800`} value={row.status_update_date || ""} onChange={(e) => handleRowChange(row.id, "status_update_date", e.target.value)} />
                      </td>
                      <td className={`${td} text-center`}>
                        <span className="inline-flex gap-0.5 rounded-lg bg-white/80 p-0.5 ring-1 ring-black/5">
                          <button type="button" className={`${btn.icon} text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700`} title="Save" aria-label="Save" disabled={savingSaleIds.has(row.id)} onClick={() => handleSavePackaging(row.id)}>
                            <Icon name="save" className="text-[19px]" />
                          </button>
                          <button type="button" className={`${btn.icon} hover:text-blue-700`} title="Status history" aria-label="Status history" onClick={() => handleViewHistory(row.id)}>
                            <Icon name="history" className="text-[19px]" />
                          </button>
                          <button type="button" className={`${btn.icon} text-blue-600 hover:bg-blue-50 hover:text-blue-700`} title="Remarks" aria-label="Remarks" onClick={() => openRemarksDialog(row)}>
                            <Icon name="comment" className="text-[19px]" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={dateFilterMode === "all" ? 18 : 17} className="px-4 py-14 text-center text-[13px] text-slate-400">No sales found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={filteredSales.length} onPageChange={setPage} limit={rowsPerPage} onLimitChange={setRowsPerPage} />
        </Card>
      </div>
      <Footer />

      {/* Status history */}
      <Modal
        open={historyDialog.open} onClose={closeHistory} size="lg" title="Status Update Dates"
        actions={<button type="button" className={btn.ghost} onClick={closeHistory}>Close</button>}
      >
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-[12.5px]">
          <span><span className="text-slate-500">Sale ID:</span> <b>{historyDialog.sale ? formatBpSaleId(historyDialog.sale) : "N/A"}</b></span>
          <span><span className="text-slate-500">Invoice:</span> <b>{historyDialog.sale?.invoice_number || "N/A"}</b></span>
          <span><span className="text-slate-500">Invoice date:</span> {formatDate(historyDialog.sale?.sale_date)}</span>
          <span><span className="text-slate-500">Outlet:</span> {historyDialog.sale?.outlet_name || "N/A"}</span>
        </div>
        <ol className="m-0 list-none space-y-0 p-0">
          {historyDialog.history.map((item, i) => (
            <li key={item.id} className="relative flex gap-3 pb-4 pl-1 last:pb-0">
              {i < historyDialog.history.length - 1 && <span className="absolute left-[9px] top-5 h-full w-px bg-slate-200" />}
              <span className="relative mt-1 size-3 shrink-0 rounded-full border-2 border-blue-600 bg-white" />
              <span className="grow text-[13px] font-semibold text-slate-800">{statusLabels[item.status] || item.status}</span>
              <span className="text-[12.5px] tabular-nums text-slate-500">{formatDateTime(item.changed_at)}</span>
            </li>
          ))}
          {historyDialog.history.length === 0 && <li className="py-6 text-center text-[13px] text-slate-400">No status update dates found.</li>}
        </ol>
      </Modal>

      {/* Who completed packing */}
      <Modal
        open={packerDialog.open} onClose={() => handleClosePackerDialog(false)} title="Who Completed Packing?"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={() => handleClosePackerDialog(false)}>Cancel</button>
            <button type="button" className={btn.primary} onClick={() => handleClosePackerDialog(true)}>Confirm</button>
          </>
        )}
      >
        <p className="m-0 mb-3 text-[13px] text-slate-600">Select the packaging staff member who finished this order.</p>
        <Field label="Packaging staff" width="w-full">
          <select className={fieldClass} value={packerDialog.selectedPackerId} onChange={(event) => setPackerDialog((prev) => ({ ...prev, selectedPackerId: event.target.value }))}>
            <option value="">Select packaging staff</option>
            {packagingStaff.map((person) => <option key={person.id} value={String(person.id)}>{person.name}</option>)}
            {packagingStaff.length === 0 && <option disabled>No packaging staff found</option>}
          </select>
        </Field>
      </Modal>

      {/* Remarks: pending / cancelled / wrongly delivered items */}
      <Modal
        open={remarksDialog.open} onClose={closeRemarksDialog} size="xl" title="Add Remarks"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={closeRemarksDialog}>Close</button>
            <button type="button" className={btn.primary} onClick={handleSaveRemarks} disabled={savingRemarks || pendingRemarkItems.length === 0}>
              {savingRemarks ? "Saving..." : "Save Remarks"}
            </button>
          </>
        )}
      >
        {remarksDialog.sale && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px]">
              <span><span className="text-slate-500">Outlet:</span> <b>{remarksDialog.sale.outlet_name || "—"}</b></span>
              <span><span className="text-slate-500">Invoice:</span> <b>{remarksDialog.sale.invoice_number || "—"}</b></span>
              <span><span className="text-slate-500">Sale ID:</span> <b>{formatBpSaleId(remarksDialog.sale)}</b></span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Remark type" width="w-full">
                <select className={fieldClass} value={remarkCategory} onChange={(e) => setRemarkCategory(e.target.value)}>
                  {REMARK_CATEGORIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Issue type *" width="w-full">
                <select className={fieldClass} value={issueType} onChange={(e) => handleIssueTypeChange(e.target.value)}>
                  <option value="" disabled>Select Cancel or Wrong Delivered</option>
                  {ISSUE_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>

            <div>
              <h4 className="m-0 mb-1 text-[13px] font-semibold text-slate-900">Add item</h4>
              {issueType === "wrong_delivered" && (
                <p className="m-0 mb-2 text-[12px] text-slate-500">Enter the wrong item that was delivered and the original item it should be replaced with.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-4">
                {issueType === "wrong_delivered" ? (
                  <>
                    <Field label="Wrong item *" width="w-full sm:col-span-2">
                      <input className={fieldClass} value={remarkItemForm.wrongItem} onChange={(e) => handleRemarkFormChange("wrongItem", e.target.value)} />
                    </Field>
                    <Field label="Original item *" width="w-full sm:col-span-2">
                      <input className={fieldClass} value={remarkItemForm.originalItem} onChange={(e) => handleRemarkFormChange("originalItem", e.target.value)} />
                    </Field>
                  </>
                ) : (
                  <Field label="Item name *" width="w-full sm:col-span-2">
                    <input className={fieldClass} value={remarkItemForm.itemName} disabled={!issueType} onChange={(e) => handleRemarkFormChange("itemName", e.target.value)} />
                  </Field>
                )}
                <Field label="Qty *" width="w-full">
                  <input type="number" min={0} step="any" className={fieldClass} value={remarkItemForm.qty} onChange={(e) => handleRemarkFormChange("qty", e.target.value)} />
                </Field>
                <Field label="Total amount *" width="w-full">
                  <input type="number" min={0} step="0.01" className={fieldClass} value={remarkItemForm.amount} onChange={(e) => handleRemarkFormChange("amount", e.target.value)} />
                </Field>
                <label className="flex flex-col gap-1 sm:col-span-4">
                  <span className={label}>Remarks</span>
                  <textarea rows={2} className={`${fieldClass} h-auto py-2`} value={remarkItemForm.remarks} onChange={(e) => handleRemarkFormChange("remarks", e.target.value)} />
                </label>
              </div>
              <button type="button" className={`${btn.outline} mt-3`} onClick={handleAddPendingRemarkItem} disabled={!issueType}>
                <Icon name="add" className="text-[18px]" />Add item
              </button>
            </div>

            {pendingRemarkItems.length > 0 && (
              <div>
                <h4 className="m-0 mb-2 text-[13px] font-semibold text-slate-900">Items to save ({pendingRemarkItems.length})</h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[560px] border-collapse">
                    <thead>
                      <tr>
                        {issueType === "wrong_delivered" ? (
                          <>
                            <th className={mini}>Wrong item</th>
                            <th className={mini}>Original item</th>
                          </>
                        ) : <th className={mini}>Item name</th>}
                        <th className={mini}>Qty</th>
                        <th className={`${mini} text-right`}>Amount</th>
                        <th className={mini}>Remarks</th>
                        <th className={`${mini} text-center`}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRemarkItems.map((item) => (
                        <tr key={item.id}>
                          {issueType === "wrong_delivered" ? (
                            <>
                              <td className={miniTd}>{item.wrongItem}</td>
                              <td className={miniTd}>{item.originalItem}</td>
                            </>
                          ) : <td className={miniTd}>{item.itemName}</td>}
                          <td className={miniTd}>{item.qty}</td>
                          <td className={`${miniTd} text-right tabular-nums`}>₹{Number(item.amount).toFixed(2)}</td>
                          <td className={miniTd}>{item.remarks || "—"}</td>
                          <td className={`${miniTd} text-center`}>
                            <button type="button" className={`${btn.icon} text-red-500 hover:bg-red-50 hover:text-red-600`} title="Remove" aria-label="Remove" onClick={() => handleRemovePendingRemarkItem(item.id)}>
                              <Icon name="delete" className="text-[18px]" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <h4 className="m-0 mb-2 text-[13px] font-semibold text-slate-900">Saved remarks</h4>
              {loadingRemarks ? (
                <p className="m-0 text-[13px] text-slate-400">Loading remarks...</p>
              ) : savedRemarks.length === 0 ? (
                <p className="m-0 text-[13px] text-slate-400">No remarks saved yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[900px] border-collapse">
                    <thead>
                      <tr>
                        {["Date", "Type", "Issue", "Item name", "Wrong item", "Original item", "Qty"].map((h) => <th key={h} className={mini}>{h}</th>)}
                        <th className={`${mini} text-right`}>Amount</th>
                        <th className={mini}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedRemarks.map((item) => (
                        <tr key={item.id}>
                          <td className={`${miniTd} whitespace-nowrap`}>{item.created_at}</td>
                          <td className={miniTd}>{remarkCategoryLabels[item.remark_category] || item.remark_category}</td>
                          <td className={miniTd}>{issueTypeLabels[item.issue_type] || item.issue_type}</td>
                          <td className={miniTd}>{item.issue_type === "wrong_delivered" ? "—" : item.item_name}</td>
                          <td className={miniTd}>{item.issue_type === "wrong_delivered" ? (item.wrong_item || item.item_name || "—") : "—"}</td>
                          <td className={miniTd}>{item.issue_type === "wrong_delivered" ? (item.original_item || "—") : "—"}</td>
                          <td className={miniTd}>{Number(item.qty)}</td>
                          <td className={`${miniTd} text-right tabular-nums`}>₹{Number(item.amount).toFixed(2)}</td>
                          <td className={miniTd}>{item.remarks || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}

export default Packaging;
