// Delivery Manager > Delivery: Tailwind CSS (no MUI). Sales sync, assign / save, suspense, history and print logic unchanged.
import { useState, useEffect, useCallback, useMemo } from "react";

import SalesExcelButton from "components/SalesExcelButton";
import DeliveryLogDialog from "./DeliveryLogDialog";
import CompanyFilter from "components/CompanyFilter";
import { matchesSaleCompany } from "utils/companyFilter";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  enhanceDeliveryRow,
  isDeliveryRowDirty,
  mergeSalesRows,
  useSalesPolling,
} from "utils/salesSync";
import { formatBpSaleId } from "utils/saleId";
import { ROWS_PER_PAGE } from "utils/tablePagination";
import {
  Card, Field, Icon, Modal, PageHeader, Pagination, SearchBox, Segmented, StatBox, TriCheck, btn, fieldClass,
} from "components/tw";

const getTodayLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function Delivery() {
  const [deliveryLogOpen, setDeliveryLogOpen] = useState(false);
  const [salesData, setSalesData] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const [historyDialog, setHistoryDialog] = useState({ open: false, sale: null, history: [] });
  const [savingSaleIds, setSavingSaleIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [suspenseBusy, setSuspenseBusy] = useState(false);

  // Tab State
  const [activeTab, setActiveTab] = useState("pending");

  // Log Tab Filters State
  const [logStartDate, setLogStartDate] = useState(getTodayLocalDate());
  const [logEndDate, setLogEndDate] = useState(getTodayLocalDate());
  const [logStaffId, setLogStaffId] = useState("");

  const API = (process.env.REACT_APP_API_URL);

  const statusLabels = {
    not_packing: "Not Packing",
    packing: "Packing In Progress",
    packing_done: "Packing Done",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    returned: "Returned",
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

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const handlePrintPdf = () => {
    const staffLabel = logStaffId
      ? staffOptions.find((s) => s.id === Number(logStaffId))?.name || "Selected Staff"
      : "All Staff";
    const generatedOn = new Date().toLocaleString("en-GB");
    const totalAmount = filteredLogSales.reduce((sum, row) => sum + (Number(row.price) || 0), 0);

    const rowsHtml = filteredLogSales
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.staff_name || "N/A")}</td>
            <td>${escapeHtml(row.company_name || "N/A")}</td>
            <td>${escapeHtml(row.outlet_name || "N/A")}</td>
            <td>${escapeHtml(row.location_name || "N/A")}</td>
            <td>${escapeHtml(row.outlet_erp_id || "N/A")}</td>
            <td>${escapeHtml(row.sticker_number || "N/A")}</td>
            <td>${escapeHtml(row.invoice_number || "N/A")}</td>
            <td class="right">Rs. ${Number(row.price || 0).toFixed(2)}</td>
            <td>${row.item_count || "N/A"}</td>
            <td>${escapeHtml(row.delivery_boy_name || "N/A")}</td>
            <td>${escapeHtml(row.vehicle_no || "N/A")}</td>
            <td>${escapeHtml(formatDate(row.delivery_date))}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Out for Delivery Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
            h1 { font-size: 22px; margin: 0 0 12px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 18px; font-size: 13px; }
            .meta strong { display: inline-block; min-width: 110px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; font-weight: 700; }
            .right { text-align: right; }
            .total { margin-top: 14px; text-align: right; font-size: 16px; font-weight: 700; }
            .empty { padding: 24px; text-align: center; color: #6b7280; border: 1px solid #d1d5db; }
            @media print {
              body { margin: 16mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Out for Delivery Report</h1>
          <div class="meta">
            <div><strong>Staff Collector:</strong> ${escapeHtml(staffLabel)}</div>
            <div><strong>Period:</strong> ${escapeHtml(formatDate(logStartDate))} to ${escapeHtml(formatDate(logEndDate))}</div>
            <div><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
            <div><strong>Total Orders:</strong> ${filteredLogSales.length} (Rs. ${totalAmount.toFixed(2)})</div>
          </div>
          ${filteredLogSales.length > 0
        ? `<table>
        <thead>
          <tr>
            <th>Sr No</th>
            <th>Staff Name</th>
            <th>Company</th>
            <th>Outlet Name</th>
            <th>Area</th>
            <th>ERP ID</th>
            <th>Sale ID</th>
            <th>Invoice No</th>
            <th class="right">Price</th>
            <th>Items</th>
            <th>Delivery Boy</th>
            <th>Vehicle No</th>
            <th>Delivery Date</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>`
        : `<div class="empty">No "Out for Delivery" records found for this selection.</div>`
      }
          <div class="total">Total Amount: Rs. ${totalAmount.toFixed(2)}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleOpenDetails = (saleId) => {
    setSalesData((prev) =>
      prev.map((row) =>
        row.id === saleId && !row.delivery_date
          ? { ...row, delivery_date: getTodayLocalDate(), _localDirty: true }
          : row
      )
    );
    setActiveRowId(saleId);
    setDetailsModalOpen(true);
  };

  const handleCloseDetails = () => {
    setDetailsModalOpen(false);
    setActiveRowId(null);
  };

  useEffect(() => {
    const fetchDeliveryBoys = async () => {
      try {
        const response = await fetch(`${API}/delivery-boy`);
        if (response.ok) {
          const data = await response.json();
          setDeliveryBoys(data.filter((person) => person.role === "delivery_boy"));
        }
      } catch (error) {
        console.error("Error fetching delivery boys:", error);
      }
    };
    fetchDeliveryBoys();
  }, [API]);

  const fetchSales = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await fetch(`${API}/staff/sales/by-date`);
      if (response.ok) {
        const data = await response.json();
        const serverById = new Map(data.map((row) => [row.id, row]));
        setSalesData((prev) =>
          // Suspense is always taken from the server, even for rows being edited.
          mergeSalesRows(data, prev, enhanceDeliveryRow, isDeliveryRowDirty).map((row) => {
            const serverRow = serverById.get(row.id);
            return serverRow
              ? { ...row, in_suspense: serverRow.in_suspense, suspense_at: serverRow.suspense_at, suspense_reason: serverRow.suspense_reason }
              : row;
          })
        );
      } else if (!silent) {
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
  }, [fetchSales]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, companyFilter, logStartDate, logEndDate, logStaffId, rowsPerPage]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  const toggleSelected = (saleId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(saleId)) next.delete(saleId);
      else next.add(saleId);
      return next;
    });
  };

  // Bills waiting in a pending Suspense request (shown as "Suspense requested").
  const [requestedIds, setRequestedIds] = useState(new Set());
  const [reasonDialog, setReasonDialog] = useState({ open: false, saleIds: [], reason: "" });
  const loadSuspenseRequests = useCallback(async () => {
    try {
      const response = await fetch(`${API}/staff/suspense-requests?status=pending`);
      if (!response.ok) return;
      const data = await response.json();
      setRequestedIds(new Set((data.requests || []).flatMap((request) => request.sale_ids || []).map(Number)));
    } catch (error) {
      console.error("Error loading suspense requests:", error);
    }
  }, [API]);
  useEffect(() => { loadSuspenseRequests(); }, [loadSuspenseRequests]);

  // Move selected bills into Suspense (suspense = true, needs a reason and,
  // for non-admin users, admin approval) or return them to Pending
  // Deliveries (suspense = false).
  const updateSuspense = async (saleIds, suspense, reason = "") => {
    if (!saleIds.length || suspenseBusy) return;
    if (suspense && !reason.trim()) {
      setReasonDialog({ open: true, saleIds, reason: "" });
      return;
    }
    if (!suspense && !window.confirm(`Return ${saleIds.length} bill(s) to Pending Deliveries?`)) return;

    setSuspenseBusy(true);
    try {
      const response = await fetch(`${API}/staff/sales/suspense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saleIds, suspense, reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update Suspense.");
      setReasonDialog({ open: false, saleIds: [], reason: "" });
      if (data.pendingApproval) {
        setSelectedIds(new Set());
        loadSuspenseRequests();
        alert(data.message || "Request sent to admin for approval.");
        return;
      }
      const moved = new Set(data.movedIds || []);
      setSalesData((prev) =>
        prev.map((row) =>
          moved.has(row.id)
            ? { ...row, in_suspense: suspense ? 1 : 0, suspense_at: suspense ? new Date().toISOString() : null, suspense_reason: suspense ? reason.trim() : null }
            : row
        )
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        moved.forEach((id) => next.delete(id));
        return next;
      });
      if (data.skippedIds?.length) {
        alert(`${moved.size} bill(s) updated. ${data.skippedIds.length} skipped because their status changed. The list has been refreshed.`);
      }
      fetchSales({ silent: true });
      loadSuspenseRequests();
    } catch (error) {
      alert(error.message || "Unable to update Suspense.");
    } finally {
      setSuspenseBusy(false);
    }
  };

  useSalesPolling(fetchSales);

  const handleRowChange = (saleId, field, value) => {
    const newData = [...salesData];
    const index = newData.findIndex(r => r.id === saleId);
    if (index === -1) return;
    newData[index] = { ...newData[index], [field]: value, _localDirty: true };
    setSalesData(newData);
  };

  const handleSaveDelivery = async (saleId) => {
    const row = salesData.find(r => r.id === saleId);
    if (!row || savingSaleIds.has(saleId)) return;

    if ((row.packaging_status === "out_for_delivery" || row.packaging_status === "delivered") && (!row.delivery_boy_id || !row.vehicle_no || !row.delivery_date)) {
      alert("Please assign a Delivery Boy, Vehicle No, and Delivery Date via 'Assign Details' before marking this item.");
      return;
    }

    setSavingSaleIds((prev) => new Set(prev).add(saleId));

    try {
      const finalStatus = row.packaging_status || "packing_done";

      const payload = {
        packagingStatus: finalStatus,
        deliveryBoyId: row.delivery_boy_id || null,
        vehicleNo: row.vehicle_no || null,
        deliveryDate: row.delivery_date || null,
        expectedStatus: row.original_packaging_status,
      };

      const response = await fetch(`${API}/staff/sales/${row.id}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const updated = enhanceDeliveryRow(data.sale);
        // Only remove if it is completely out of Delivery module (e.g. delivered, cancelled, not_packing)
        if (!["packing_done", "out_for_delivery", "returned"].includes(updated.packaging_status)) {
          setSalesData((prev) => prev.filter((item) => item.id !== saleId));
        } else {
          setSalesData((prev) =>
            prev.map((item) =>
              item.id === saleId
                ? { ...updated, packing_date: item.packing_date || updated.packing_date }
                : item
            )
          );
        }
      } else if (response.status === 409) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "This record was updated by another user.");
        fetchSales();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update delivery status.");
      }
    } catch (error) {
      console.error("Error saving delivery info:", error);
      alert("Error saving delivery status.");
    } finally {
      setSavingSaleIds((prev) => {
        const next = new Set(prev);
        next.delete(saleId);
        return next;
      });
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
    if (status === 'returned') return '#fff1d6';
    if (status === 'out_for_delivery') return '#dcfce7'; // green
    if (status === 'packing_done') return '#e0f2fe'; // light blue
    return '#ffebeb';
  };

  const getTextColor = (status) => {
    if (status === 'returned') return '#92400e';
    if (status === 'out_for_delivery') return '#166534'; // dark green
    if (status === 'packing_done') return '#075985'; // dark blue
    return '#991b1b';
  };

  // Staff options dynamic list from fetched sales data
  const staffOptions = useMemo(() => {
    const staff = new Map();
    salesData.forEach((row) => {
      if (!row.staff_id) return;
      if (!staff.has(row.staff_id)) {
        staff.set(row.staff_id, row.staff_name || `Staff ${row.staff_id}`);
      }
    });
    return [...staff.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [salesData]);

  // Returned orders await reassignment alongside newly packed orders.
  const filteredSales = salesData.filter((row) => {
    if (!matchesSaleCompany(row, companyFilter)) return false;
    const status = row.original_packaging_status || row.packaging_status || "not_packing";
    if (status !== "packing_done" && status !== "returned") {
      return false;
    }
    if (Number(row.in_suspense) === 1) return false;

    return matchesSearch(row);
  });

  // Suspense: bills parked from Pending Deliveries
  const filteredSuspenseSales = salesData.filter((row) => {
    if (!matchesSaleCompany(row, companyFilter)) return false;
    const status = row.original_packaging_status || row.packaging_status || "not_packing";
    if (status !== "packing_done" && status !== "returned") return false;
    if (Number(row.in_suspense) !== 1) return false;
    return matchesSearch(row);
  });

  function matchesSearch(row) {
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
  }

  // Filter 2: Out for Delivery Log (status = out_for_delivery)
  const filteredLogSales = salesData.filter((row) => {
    if (!matchesSaleCompany(row, companyFilter)) return false;
    const status = row.original_packaging_status || row.packaging_status || "not_packing";
    if (status !== "out_for_delivery") {
      return false;
    }

    if (logStaffId && Number(row.staff_id) !== Number(logStaffId)) {
      return false;
    }

    const deliveryDate = row.delivery_date ? row.delivery_date.split("T")[0] : "";
    if (logStartDate && (!deliveryDate || deliveryDate < logStartDate)) {
      return false;
    }
    if (logEndDate && (!deliveryDate || deliveryDate > logEndDate)) {
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

  const activeList =
    activeTab === "pending" ? filteredSales : activeTab === "suspense" ? filteredSuspenseSales : filteredLogSales;
  const selectable = activeTab === "pending" || activeTab === "suspense";
  const totalPages = Math.max(1, Math.ceil(activeList.length / rowsPerPage));
  const paginatedSales = activeList.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const activeRow = activeRowId ? salesData.find((r) => r.id === activeRowId) : null;
  const pageAllSelected = paginatedSales.length > 0 && paginatedSales.every((row) => selectedIds.has(row.id));
  const pageSomeSelected = paginatedSales.some((row) => selectedIds.has(row.id));
  const head = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const cell = "px-3 py-2.5 text-[12.5px]";
  const pendingValue = filteredSales.reduce((sum, row) => sum + (Number(row.price) || 0), 0);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <DeliveryLogDialog open={deliveryLogOpen} onClose={() => setDeliveryLogOpen(false)} sales={salesData.filter((row) => Number(row.in_suspense) !== 1)} />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Delivery Management"
          description="Assign packed bills to a delivery boy and vehicle, send them out for delivery, park bills in Suspense, and print the out-for-delivery log."
          actions={(
            <button type="button" className={btn.outline} onClick={() => setDeliveryLogOpen(true)}>
              <Icon name="summarize" className="text-[18px] text-blue-600" />See Delivery Log
            </button>
          )}
        />

        <div className="mb-5 flex flex-wrap gap-2">
          <StatBox label="Pending deliveries" value={filteredSales.length} icon="inventory_2" />
          <StatBox label="Pending value" value={`₹${pendingValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} icon="currency_rupee" />
          <StatBox label="In suspense" value={filteredSuspenseSales.length} icon="pause_circle" />
          <StatBox label="Out for delivery" value={filteredLogSales.length} icon="local_shipping" />
        </div>

        <Card>
          <div className="space-y-3 border-b border-slate-100 px-4 py-3">
            <Segmented
              label="Delivery lists" value={activeTab} onChange={setActiveTab}
              options={[
                ["pending", `Pending Deliveries (${filteredSales.length})`],
                ["suspense", `Suspense (${filteredSuspenseSales.length})`],
                ["out_for_delivery", `Out for Delivery Log (${filteredLogSales.length})`],
              ]}
            />
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-72 grow flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search</span>
                <SearchBox value={searchQuery} onChange={setSearchQuery} className="w-full" placeholder="Outlet, area, ERP ID, staff, sale ID or invoice no." />
              </div>
              <div className="w-full sm:w-96"><CompanyFilter id="delivery-company-filter" rows={salesData} value={companyFilter} onChange={setCompanyFilter} /></div>
              {activeTab === "out_for_delivery" && (
                <>
                  <Field label="From date" width="w-36"><input type="date" className={fieldClass} value={logStartDate} onChange={(e) => setLogStartDate(e.target.value)} /></Field>
                  <Field label="To date" width="w-36"><input type="date" className={fieldClass} value={logEndDate} onChange={(e) => setLogEndDate(e.target.value)} /></Field>
                  <Field label="Staff" width="w-48">
                    <select className={fieldClass} value={logStaffId} onChange={(e) => setLogStaffId(e.target.value)}>
                      <option value="">All staff</option>
                      {staffOptions.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
                    </select>
                  </Field>
                  <button type="button" className={btn.outline} onClick={handlePrintPdf} disabled={filteredLogSales.length === 0}>
                    <Icon name="print" className="text-[18px]" />Print PDF
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeTab === "pending" && (
                <button type="button" className={`${btn.primary} bg-amber-500 hover:bg-amber-600`} disabled={!selectedIds.size || suspenseBusy} onClick={() => updateSuspense([...selectedIds], true)}>
                  <Icon name="pause_circle" className="text-[18px]" />
                  {suspenseBusy ? "Moving..." : `Move to Suspense${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
                </button>
              )}
              {activeTab === "suspense" && (
                <button type="button" className={`${btn.primary} bg-emerald-600 hover:bg-emerald-700`} disabled={!selectedIds.size || suspenseBusy} onClick={() => updateSuspense([...selectedIds], false)}>
                  <Icon name="undo" className="text-[18px]" />
                  {suspenseBusy ? "Returning..." : `Return Selected${selectedIds.size ? ` (${selectedIds.size})` : ""}`}
                </button>
              )}
              <SalesExcelButton
                rows={activeList}
                filename={activeTab === "pending" ? "Delivery_Management" : activeTab === "suspense" ? "Delivery_Suspense" : "Out_for_Delivery_Log"}
              />
            </div>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1400px] border-separate border-spacing-0">
              <thead>
                <tr>
                  {selectable && (
                    <th className={`${head} w-10`}>
                      <TriCheck
                        checked={pageAllSelected} indeterminate={pageSomeSelected && !pageAllSelected} label="Select all bills on this page"
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            paginatedSales.forEach((row) => (checked ? next.add(row.id) : next.delete(row.id)));
                            return next;
                          });
                        }}
                      />
                    </th>
                  )}
                  <th className={`${head} text-center`}>#</th>
                  {["Staff", "Company", "Outlet", "Area", "ERP ID"].map((h) => <th key={h} className={`${head} text-left`}>{h}</th>)}
                  <th className={`${head} text-center`}>Sale ID</th>
                  <th className={`${head} text-center`}>Invoice no</th>
                  <th className={`${head} text-right`}>Price</th>
                  {["Items", "Packed", "Boxes", "Packets"].map((h) => <th key={h} className={`${head} text-center`}>{h}</th>)}
                  {activeTab === "out_for_delivery" && (
                    <>
                      <th className={`${head} text-center`}>Delivery boy</th>
                      <th className={`${head} text-center`}>Vehicle</th>
                    </>
                  )}
                  <th className={`${head} text-center`}>Status</th>
                  <th className={`${head} text-center`}>Delivery date</th>
                  <th className={`${head} text-center`}>Packing date</th>
                  {activeTab === "pending" && (
                    <>
                      <th className={`${head} text-center`}>Delivery details</th>
                      <th className={`${head} text-center`}>Action</th>
                    </>
                  )}
                  {activeTab === "suspense" && (
                    <>
                      <th className={`${head} text-center`}>In suspense since</th>
                      <th className={`${head} text-left`}>Reason</th>
                      <th className={`${head} text-center`}>Action</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {paginatedSales.length > 0 ? paginatedSales.map((row, index) => {
                  const bgColor = getRowColor(row.packaging_status);
                  const txColor = getTextColor(row.packaging_status);
                  const td = `${cell} border-t border-white/70`;
                  const hasDetails = row.delivery_boy_id && row.vehicle_no && row.delivery_date;
                  return (
                    <tr key={row.id} style={{ backgroundColor: bgColor, color: txColor }}>
                      {selectable && (
                        <td className={td}>
                          <input type="checkbox" className="size-4 accent-blue-600" checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} aria-label={`Select bill ${row.invoice_number || row.id}`} />
                        </td>
                      )}
                      <td className={`${td} text-center opacity-70`}>{(page - 1) * rowsPerPage + index + 1}</td>
                      <td className={`${td} whitespace-nowrap`}>{row.staff_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{row.company_name || "N/A"}</td>
                      <td className={`${td} font-semibold`}>{row.outlet_name}</td>
                      <td className={`${td} whitespace-nowrap`}>{row.location_name || "N/A"}</td>
                      <td className={`${td} whitespace-nowrap font-mono text-[11.5px]`}>{row.outlet_erp_id}</td>
                      <td className={`${td} text-center font-bold`}>{row.sticker_number}</td>
                      <td className={`${td} text-center font-mono`}>
                        {row.invoice_number}
                        {activeTab === "pending" && requestedIds.has(Number(row.id)) && (
                          <span className="mt-0.5 block whitespace-nowrap font-sans text-[10.5px] font-bold text-amber-700">Suspense requested</span>
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums`}>₹{Number(row.price).toFixed(2)}</td>
                      <td className={`${td} text-center tabular-nums`}>{row.item_count || "N/A"}</td>
                      <td className={`${td} text-center tabular-nums`}>{row.packed_item_count || row.item_count || "N/A"}</td>
                      <td className={`${td} text-center tabular-nums`}>{row.box_count || "N/A"}</td>
                      <td className={`${td} text-center tabular-nums`}>{row.packet_count || "N/A"}</td>
                      {activeTab === "out_for_delivery" && (
                        <>
                          <td className={`${td} text-center`}>{row.delivery_boy_name || "N/A"}</td>
                          <td className={`${td} text-center`}>{row.vehicle_no || "N/A"}</td>
                        </>
                      )}
                      <td className={`${td} text-center`}>
                        {activeTab === "pending" ? (
                          <select
                            className={`${fieldClass} h-8 min-w-40 text-slate-800`} aria-label="Status"
                            value={row.packaging_status === "packing_done" ? "" : row.packaging_status}
                            onChange={(e) => handleRowChange(row.id, "packaging_status", e.target.value)}
                          >
                            <option value="" disabled>Select status</option>
                            <option value="returned" disabled>Returned</option>
                            <option value="out_for_delivery">Out for Delivery</option>
                          </select>
                        ) : (
                          <span className="whitespace-nowrap font-semibold">{statusLabels[row.packaging_status] || row.packaging_status}</span>
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap text-center`}>{formatDate(row.delivery_date)}</td>
                      <td className={`${td} whitespace-nowrap text-center`}>{formatDate(row.packing_date)}</td>
                      {activeTab === "pending" && (
                        <>
                          <td className={`${td} text-center`}>
                            <button
                              type="button" onClick={() => handleOpenDetails(row.id)}
                              className={`inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-semibold transition ${hasDetails ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "border-blue-300 bg-blue-600 text-white hover:bg-blue-700"}`}
                            >
                              <Icon name={hasDetails ? "edit" : "person_add"} className="text-[15px]" />{hasDetails ? "Edit details" : "Assign details"}
                            </button>
                          </td>
                          <td className={`${td} text-center`}>
                            <span className="inline-flex gap-0.5 rounded-lg bg-white/80 p-0.5 ring-1 ring-black/5">
                              <button type="button" className={`${btn.icon} text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700`} title="Save" aria-label="Save" disabled={savingSaleIds.has(row.id)} onClick={() => handleSaveDelivery(row.id)}>
                                <Icon name="save" className="text-[19px]" />
                              </button>
                              <button type="button" className={`${btn.icon} hover:text-blue-700`} title="Status history" aria-label="Status history" onClick={() => handleViewHistory(row.id)}>
                                <Icon name="history" className="text-[19px]" />
                              </button>
                            </span>
                          </td>
                        </>
                      )}
                      {activeTab === "suspense" && (
                        <>
                          <td className={`${td} whitespace-nowrap text-center`}>{formatDateTime(row.suspense_at)}</td>
                          <td className={`${td} max-w-60 whitespace-pre-wrap`}>{row.suspense_reason || "—"}</td>
                          <td className={`${td} text-center`}>
                            <button type="button" className={`${btn.outline} h-8 px-3 text-emerald-700`} disabled={suspenseBusy} onClick={() => updateSuspense([row.id], false)}>
                              <Icon name="undo" className="text-[16px]" />Return
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={19} className="px-4 py-14 text-center text-[13px] text-slate-400">
                      {activeTab === "suspense" ? "No bills in Suspense." : "No deliveries found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={activeList.length} onPageChange={setPage} limit={rowsPerPage} onLimitChange={setRowsPerPage} />
        </Card>
      </div>
      <Footer />

      {/* Assign delivery boy, vehicle and date (saved with the row's Save button) */}
      <Modal
        open={detailsModalOpen} onClose={handleCloseDetails} title="Assign Delivery Details"
        actions={<button type="button" className={btn.primary} onClick={handleCloseDetails}>Done</button>}
      >
        {activeRow && (
          <p className="m-0 mb-4 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-600">
            <b className="text-slate-900">{activeRow.outlet_name}</b> · Invoice {activeRow.invoice_number} · ₹{Number(activeRow.price).toFixed(2)}
          </p>
        )}
        <div className="space-y-3">
          <Field label="Delivery boy" width="w-full">
            <select className={fieldClass} value={activeRow?.delivery_boy_id || ""} onChange={(e) => handleRowChange(activeRowId, "delivery_boy_id", e.target.value)}>
              <option value="" disabled>Select delivery boy</option>
              {deliveryBoys.map((boy) => <option key={boy.id} value={boy.id}>{boy.name}</option>)}
            </select>
          </Field>
          <Field label="Vehicle no" width="w-full">
            <input className={fieldClass} value={activeRow?.vehicle_no || ""} onChange={(e) => handleRowChange(activeRowId, "vehicle_no", e.target.value)} />
          </Field>
          <Field label="Delivery date" width="w-full">
            <input type="date" className={fieldClass} value={activeRow?.delivery_date || ""} onChange={(e) => handleRowChange(activeRowId, "delivery_date", e.target.value)} />
          </Field>
          <p className="m-0 text-[12px] text-slate-500">Press <b>Save</b> on the row afterwards to update the bill.</p>
        </div>
      </Modal>

      {/* Reason for moving bills to Suspense */}
      <Modal
        open={reasonDialog.open} onClose={() => setReasonDialog({ open: false, saleIds: [], reason: "" })} locked={suspenseBusy} size="lg"
        title={`Move ${reasonDialog.saleIds.length} bill(s) to Suspense`}
        actions={(
          <>
            <button type="button" className={btn.ghost} disabled={suspenseBusy} onClick={() => setReasonDialog({ open: false, saleIds: [], reason: "" })}>Cancel</button>
            <button type="button" className={`${btn.primary} bg-amber-500 hover:bg-amber-600`} disabled={suspenseBusy || !reasonDialog.reason.trim()} onClick={() => updateSuspense(reasonDialog.saleIds, true, reasonDialog.reason)}>
              {suspenseBusy ? "Sending..." : "Move to Suspense"}
            </button>
          </>
        )}
      >
        <p className="m-0 mb-3 text-[13px] text-slate-600">
          Enter why these bills should go to Suspense. Admin moves them at once; for anyone else the request goes to admin
          and the bills move only after it is approved (see Suspense Requests).
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reason *</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <textarea rows={3} autoFocus maxLength={1000} className={`${fieldClass} h-auto py-2`} value={reasonDialog.reason} onChange={(e) => setReasonDialog((prev) => ({ ...prev, reason: e.target.value }))} />
        </label>
      </Modal>

      {/* Status history */}
      <Modal
        open={historyDialog.open} onClose={() => setHistoryDialog({ open: false, sale: null, history: [] })} size="lg" title="Status Update Dates"
        actions={<button type="button" className={btn.ghost} onClick={() => setHistoryDialog({ open: false, sale: null, history: [] })}>Close</button>}
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
    </DashboardLayout>
  );
}

export default Delivery;
