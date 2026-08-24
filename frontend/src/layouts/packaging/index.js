import { useState, useEffect, useCallback, useRef } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
// import Icon from "@mui/material/Icon";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputLabel,
  Tooltip,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

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
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  compactTableTextSx,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";
import { IoSaveOutline } from "react-icons/io5";
import { FaRegEdit } from "react-icons/fa";
import { MdOutlineComment, MdDeleteOutline } from "react-icons/md";

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

const remarkTableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "none",
  borderBottom: "1px solid #e5e7eb",
  px: 2,
  py: 1.25,
  whiteSpace: "nowrap",
};

const remarkTableBodySx = {
  px: 2,
  py: 1.25,
  fontSize: "0.875rem",
  borderBottom: "1px solid #e5e7eb",
};

const remarkSelectSx = {
  height: 44,
  backgroundColor: "#fff",
  "& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    minHeight: "44px !important",
    boxSizing: "border-box",
  },
};

const remarkTableSx = {
  tableLayout: "fixed",
  width: "100%",
  "& .MuiTableCell-root": { overflow: "hidden", textOverflow: "ellipsis" },
};

const remarkTableHeadWrapperSx = {
  display: "table-header-group",
  backgroundColor: "#f9fafb",
  "& .MuiTableCell-root": { backgroundColor: "#f9fafb" },
};

const tableActionBoxSx = {
  backgroundColor: "#f0fdfa",
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid #99f6e4",
  flexWrap: "nowrap",
  minWidth: "fit-content",
};

function Packaging() {
  const [dateFilterMode, setDateFilterMode] = useState("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [salesData, setSalesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
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
  const API = "https://bawarchee.edunextg.co/api";

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
      const response = await fetch(`${API}/staff/sales/by-date`);
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
  }, [searchQuery, statusFilter, dateFilterMode, selectedDate, rowsPerPage]);

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

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center">
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Packaging - Daily Sales
                </MDTypography>
              </MDBox>
              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="text"
                      label="Search by Outlet Name, ID, Staff Name, Sale ID, or Invoice No."
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        sx={{ height: "44px", backgroundColor: "#fff" }}
                      >
                        <MenuItem value="all">All Progress</MenuItem>
                        <MenuItem value="not_packing">Not Started</MenuItem>
                        <MenuItem value="packing">In Progress</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={dateFilterMode}
                        onChange={(e) => setDateFilterMode(e.target.value)}
                        sx={{ height: "44px", backgroundColor: "#fff" }}
                      >
                        <MenuItem value="all">All Dates (incl. previous)</MenuItem>
                        <MenuItem value="specific">Specific Date</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  {dateFilterMode === "specific" && (
                    <Grid item xs={12} md={3}>
                      <MDInput
                        type="date"
                        label="Sale Date"
                        fullWidth
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                  )}
                </Grid>

                <TableContainer component={Paper} sx={paginatedTableContainerSx}>
                  <Table stickyHeader sx={{ minWidth: 650, ...compactTableTextSx }}>
                    <TableHead sx={paginatedTableHeadSx()}>
                      <TableRow>
                        <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                          Sr No
                        </TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Staff Name</TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Company</TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Outlet Name</TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Area</TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>ERP ID</TableCell>
                        {dateFilterMode === "all" && (
                          <TableCell sx={paginatedTableHeadCellSx}>Sale Date</TableCell>
                        )}
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Sale ID
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Invoice No
                        </TableCell>
                        <TableCell align="right" sx={paginatedTableHeadCellSx}>
                          Price
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          No. of Item
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Packing Item
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          No. of Box
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          No. of Packet
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Status
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Packed By
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Status Date
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedSales.length > 0 ? (
                        paginatedSales.map((row, index) => {
                          const bgColor = getRowColor(row.packaging_status);
                          const txColor = getTextColor(row.packaging_status);
                          const borderCol = `1px solid ${txColor}`;
                          return (
                            <TableRow
                              key={row.id}
                              sx={{
                                backgroundColor: bgColor,
                                "&:last-child td, &:last-child th": { border: 0 }
                              }}
                            >
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {(page - 1) * rowsPerPage + index + 1}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.staff_name}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.company_name || "N/A"}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor, fontWeight: "medium" }}>
                                {row.outlet_name}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.location_name || "N/A"}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.outlet_erp_id}
                              </TableCell>
                              {dateFilterMode === "all" && (
                                <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                  {formatDate(row.sale_date || row.formatted_date)}
                                </TableCell>
                              )}
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor, fontWeight: "bold" }}>
                                {row.sticker_number}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.invoice_number}
                              </TableCell>
                              <TableCell align="right" sx={{ borderBottom: borderCol, py: 2, color: txColor, fontWeight: "bold" }}>
                                ₹{Number(row.price).toFixed(2)}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.item_count || "N/A"}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                <MDInput
                                  type="number"
                                  value={row.packed_item_count || ""}
                                  onChange={(e) =>
                                    handleRowChange(row.id, "packed_item_count", e.target.value)
                                  }
                                  size="small"
                                  inputProps={{ min: 1, max: row.item_count || undefined, style: { textAlign: "center" } }}
                                  sx={{ width: 110, backgroundColor: "#fff" }}
                                />
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                <MDInput
                                  type="number"
                                  value={row.box_count ?? ""}
                                  onChange={(e) =>
                                    handleRowChange(row.id, "box_count", e.target.value)
                                  }
                                  size="small"
                                  inputProps={{ min: 0, style: { textAlign: "center" } }}
                                  sx={{ width: 100, backgroundColor: "#fff" }}
                                />
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                <MDInput
                                  type="number"
                                  value={row.packet_count ?? ""}
                                  onChange={(e) =>
                                    handleRowChange(row.id, "packet_count", e.target.value)
                                  }
                                  size="small"
                                  inputProps={{ min: 0, style: { textAlign: "center" } }}
                                  sx={{ width: 100, backgroundColor: "#fff" }}
                                />
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                <FormControl size="small" sx={{ minWidth: 140 }}>
                                  <Select
                                    value={row.packaging_status || 'not_packing'}
                                    onChange={(e) => handleRowChange(row.id, "packaging_status", e.target.value)}
                                    sx={{ height: "36px", fontSize: "0.875rem", backgroundColor: "#fff" }}
                                  >
                                    <MenuItem value="not_packing">Not Packing</MenuItem>
                                    <MenuItem value="packing">Packing In Progress</MenuItem>
                                    <MenuItem value="packing_done">Packing Done</MenuItem>
                                  </Select>
                                </FormControl>
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.packaging_status === "packing_done"
                                  ? row.packed_by_name || (
                                    <MDTypography
                                      component="span"
                                      variant="caption"
                                      sx={{ color: "#b45309", cursor: "pointer", textDecoration: "underline" }}
                                      onClick={() => openPackerDialogForSave(row.id, row)}
                                    >
                                      Select packer
                                    </MDTypography>
                                  )
                                  : "—"}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                <MDInput
                                  type="date"
                                  value={row.status_update_date || ""}
                                  onChange={(e) =>
                                    handleRowChange(row.id, "status_update_date", e.target.value)
                                  }
                                  size="small"
                                  InputLabelProps={{ shrink: true }}
                                  sx={{ width: 150, backgroundColor: "#fff" }}
                                />
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, minWidth: 120 }}>
                                <MDBox
                                  display="flex"
                                  flexDirection="row"
                                  gap={0.75}
                                  justifyContent="center"
                                  alignItems="center"
                                  sx={tableActionBoxSx}
                                >
                                  <Tooltip title="Save">
                                    <span>
                                      <IoSaveOutline onClick={() => handleSavePackaging(row.id)} style={{ cursor: "pointer" }} color="#059669" size={20} />
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Status History">
                                    <span>
                                      <FaRegEdit onClick={() => handleViewHistory(row.id)} style={{ cursor: "pointer" }} color="#E0E388" size={20} />
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Remarks">
                                    <span>
                                      <MdOutlineComment onClick={() => openRemarksDialog(row)} style={{ cursor: "pointer" }} color="#2563eb" size={20} />
                                    </span>
                                  </Tooltip>
                                </MDBox>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={dateFilterMode === "all" ? 17 : 16} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No sales found.
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
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />

      <Dialog
        open={historyDialog.open}
        onClose={() => setHistoryDialog({ open: false, sale: null, history: [] })}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Status Update Dates</DialogTitle>
        <DialogContent dividers>
          <MDBox mb={2}>
            <MDTypography variant="button" fontWeight="medium">
              Sale ID: {historyDialog.sale ? formatBpSaleId(historyDialog.sale) : "N/A"}
            </MDTypography>
            <MDTypography display="block" variant="button" fontWeight="medium">
              Invoice: {historyDialog.sale?.invoice_number || "N/A"}
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Invoice Date: {formatDate(historyDialog.sale?.sale_date)}
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Outlet: {historyDialog.sale?.outlet_name || "N/A"}
            </MDTypography>
          </MDBox>
          <Table size="small">
            <TableHead sx={{ display: "table-header-group" }}>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell align="center">Update Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {historyDialog.history.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{statusLabels[item.status] || item.status}</TableCell>
                  <TableCell align="center">{formatDateTime(item.changed_at)}</TableCell>
                </TableRow>
              ))}
              {historyDialog.history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} align="center">
                    No status update dates found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" onClick={() => setHistoryDialog({ open: false, sale: null, history: [] })}>
            Close
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog
        open={packerDialog.open}
        onClose={() => handleClosePackerDialog(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Who Completed Packing?</DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="body2" color="text" mb={2}>
            Select the packaging staff member who finished this order.
          </MDTypography>
          <FormControl size="small" fullWidth>
            <InputLabel id="packer-select-label">Packaging Staff</InputLabel>
            <Select
              labelId="packer-select-label"
              label="Packaging Staff"
              value={packerDialog.selectedPackerId}
              onChange={(event) =>
                setPackerDialog((prev) => ({ ...prev, selectedPackerId: event.target.value }))
              }
              sx={{ height: 44 }}
            >
              <MenuItem value="">
                <em>Select packaging staff</em>
              </MenuItem>
              {packagingStaff.map((person) => (
                <MenuItem key={person.id} value={String(person.id)}>
                  {person.name}
                </MenuItem>
              ))}
              {packagingStaff.length === 0 && (
                <MenuItem disabled>No packaging staff found</MenuItem>
              )}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" onClick={() => handleClosePackerDialog(false)}>
            Cancel
          </MDButton>
          <MDButton color="info" variant="gradient" onClick={() => handleClosePackerDialog(true)}>
            Confirm
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog
        open={remarksDialog.open}
        onClose={closeRemarksDialog}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: { width: "100%", maxWidth: 900, mx: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          Add Remarks
        </DialogTitle>
        <DialogContent dividers>
          {remarksDialog.sale && (
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
                  <strong>Outlet:</strong> {remarksDialog.sale.outlet_name || "—"}
                </MDTypography>
                <MDTypography variant="body2">
                  <strong>Invoice:</strong> {remarksDialog.sale.invoice_number || "—"}
                </MDTypography>
                <MDTypography variant="body2">
                  <strong>Sale ID:</strong> {formatBpSaleId(remarksDialog.sale)}
                </MDTypography>
              </MDBox>

              <Grid container spacing={2} mb={2} alignItems="flex-start">
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="remark-category-label" shrink>
                      Remark Type
                    </InputLabel>
                    <Select
                      labelId="remark-category-label"
                      label="Remark Type"
                      value={remarkCategory}
                      onChange={(e) => setRemarkCategory(e.target.value)}
                      sx={remarkSelectSx}
                    >
                      {REMARK_CATEGORIES.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="issue-type-label" shrink>
                      Issue Type *
                    </InputLabel>
                    <Select
                      labelId="issue-type-label"
                      label="Issue Type *"
                      value={issueType}
                      displayEmpty
                      onChange={(e) => handleIssueTypeChange(e.target.value)}
                      renderValue={(selected) => {
                        if (!selected) {
                          return (
                            <MDTypography component="span" variant="body2" sx={{ color: "#9ca3af" }}>
                              Select Cancel or Wrong Delivered
                            </MDTypography>
                          );
                        }
                        return issueTypeLabels[selected] || selected;
                      }}
                      sx={remarkSelectSx}
                    >
                      {ISSUE_TYPES.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <MDTypography variant="button" fontWeight="medium" color="dark" mb={1} display="block">
                Add Item
              </MDTypography>
              {issueType === "wrong_delivered" && (
                <MDTypography variant="caption" color="text" mb={1} display="block">
                  Enter the wrong item that was delivered and the original item it should be replaced with.
                </MDTypography>
              )}
              <Grid container spacing={2} mb={2}>
                {issueType === "wrong_delivered" ? (
                  <>
                    <Grid item xs={12} sm={6}>
                      <MDInput
                        label="Wrong Item *"
                        fullWidth
                        value={remarkItemForm.wrongItem}
                        onChange={(e) => handleRemarkFormChange("wrongItem", e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <MDInput
                        label="Original Item *"
                        fullWidth
                        value={remarkItemForm.originalItem}
                        onChange={(e) => handleRemarkFormChange("originalItem", e.target.value)}
                      />
                    </Grid>
                  </>
                ) : (
                  <Grid item xs={12} sm={6}>
                    <MDInput
                      label="Item Name *"
                      fullWidth
                      value={remarkItemForm.itemName}
                      onChange={(e) => handleRemarkFormChange("itemName", e.target.value)}
                      disabled={!issueType}
                    />
                  </Grid>
                )}
                <Grid item xs={12} sm={3}>
                  <MDInput
                    label="Qty *"
                    type="number"
                    fullWidth
                    value={remarkItemForm.qty}
                    onChange={(e) => handleRemarkFormChange("qty", e.target.value)}
                    inputProps={{ min: 0, step: "any" }}
                  />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <MDInput
                    label="Total Amount *"
                    type="number"
                    fullWidth
                    value={remarkItemForm.amount}
                    onChange={(e) => handleRemarkFormChange("amount", e.target.value)}
                    inputProps={{ min: 0, step: "0.01" }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <MDInput
                    label="Remarks"
                    fullWidth
                    multiline
                    rows={2}
                    value={remarkItemForm.remarks}
                    onChange={(e) => handleRemarkFormChange("remarks", e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <MDButton
                    variant="gradient"
                    color="info"
                    onClick={handleAddPendingRemarkItem}
                    disabled={!issueType}
                  >
                    Add Item
                  </MDButton>
                </Grid>
              </Grid>

              {pendingRemarkItems.length > 0 && (
                <MDBox mb={3}>
                  <MDTypography variant="button" fontWeight="medium" color="dark" mb={1} display="block">
                    Items to Save ({pendingRemarkItems.length})
                  </MDTypography>
                  <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{ boxShadow: "none", overflowX: "auto" }}
                  >
                    <Table
                      size="small"
                      sx={{ ...remarkTableSx, minWidth: issueType === "wrong_delivered" ? 720 : 560 }}
                    >
                      <colgroup>
                        {issueType === "wrong_delivered" ? (
                          <>
                            <col style={{ width: "18%" }} />
                            <col style={{ width: "18%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "34%" }} />
                            <col style={{ width: "10%" }} />
                          </>
                        ) : (
                          <>
                            <col style={{ width: "22%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "44%" }} />
                            <col style={{ width: "10%" }} />
                          </>
                        )}
                      </colgroup>
                      <TableHead sx={remarkTableHeadWrapperSx}>
                        <TableRow>
                          {issueType === "wrong_delivered" ? (
                            <>
                              <TableCell align="left" sx={remarkTableHeadSx}>Wrong Item</TableCell>
                              <TableCell align="left" sx={remarkTableHeadSx}>Original Item</TableCell>
                            </>
                          ) : (
                            <TableCell align="left" sx={remarkTableHeadSx}>Item Name</TableCell>
                          )}
                          <TableCell align="left" sx={remarkTableHeadSx}>Qty</TableCell>
                          <TableCell align="right" sx={remarkTableHeadSx}>Amount</TableCell>
                          <TableCell align="left" sx={remarkTableHeadSx}>Remarks</TableCell>
                          <TableCell align="center" sx={remarkTableHeadSx}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pendingRemarkItems.map((item) => (
                          <TableRow key={item.id}>
                            {issueType === "wrong_delivered" ? (
                              <>
                                <TableCell align="left" sx={remarkTableBodySx}>{item.wrongItem}</TableCell>
                                <TableCell align="left" sx={remarkTableBodySx}>{item.originalItem}</TableCell>
                              </>
                            ) : (
                              <TableCell align="left" sx={remarkTableBodySx}>{item.itemName}</TableCell>
                            )}
                            <TableCell align="left" sx={remarkTableBodySx}>{item.qty}</TableCell>
                            <TableCell align="right" sx={remarkTableBodySx}>₹{Number(item.amount).toFixed(2)}</TableCell>
                            <TableCell align="left" sx={remarkTableBodySx}>{item.remarks || "—"}</TableCell>
                            <TableCell align="center" sx={remarkTableBodySx}>
                              <Tooltip title="Remove">
                                <MDButton
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                  iconOnly
                                  onClick={() => handleRemovePendingRemarkItem(item.id)}
                                >
                                  <MdDeleteOutline size={18} />
                                </MDButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </MDBox>
              )}

              <MDTypography variant="button" fontWeight="medium" color="dark" mb={1} display="block">
                Saved Remarks
              </MDTypography>
              {loadingRemarks ? (
                <MDTypography variant="body2" color="text" mb={2}>
                  Loading remarks...
                </MDTypography>
              ) : savedRemarks.length === 0 ? (
                <MDTypography variant="body2" color="text" mb={2}>
                  No remarks saved yet.
                </MDTypography>
              ) : (
                <TableContainer
                  component={Paper}
                  variant="outlined"
                  sx={{ boxShadow: "none", overflowX: "auto" }}
                >
                  <Table size="small" sx={{ ...remarkTableSx, minWidth: 980 }}>
                    <colgroup>
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "14%" }} />
                      <col style={{ width: "6%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "8%" }} />
                    </colgroup>
                    <TableHead sx={remarkTableHeadWrapperSx}>
                      <TableRow>
                        <TableCell align="left" sx={remarkTableHeadSx}>Date</TableCell>
                        <TableCell align="left" sx={remarkTableHeadSx}>Type</TableCell>
                        <TableCell align="left" sx={remarkTableHeadSx}>Issue</TableCell>
                        <TableCell align="left" sx={remarkTableHeadSx}>Item Name</TableCell>
                        <TableCell align="left" sx={remarkTableHeadSx}>Wrong Item</TableCell>
                        <TableCell align="left" sx={remarkTableHeadSx}>Original Item</TableCell>
                        <TableCell align="left" sx={remarkTableHeadSx}>Qty</TableCell>
                        <TableCell align="right" sx={remarkTableHeadSx}>Amount</TableCell>
                        <TableCell align="left" sx={remarkTableHeadSx}>Remarks</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {savedRemarks.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell align="left" sx={remarkTableBodySx}>{item.created_at}</TableCell>
                          <TableCell align="left" sx={remarkTableBodySx}>
                            {remarkCategoryLabels[item.remark_category] || item.remark_category}
                          </TableCell>
                          <TableCell align="left" sx={remarkTableBodySx}>
                            {issueTypeLabels[item.issue_type] || item.issue_type}
                          </TableCell>
                          <TableCell align="left" sx={remarkTableBodySx}>
                            {item.issue_type === "wrong_delivered" ? "—" : item.item_name}
                          </TableCell>
                          <TableCell align="left" sx={remarkTableBodySx}>
                            {item.issue_type === "wrong_delivered" ? (item.wrong_item || item.item_name || "—") : "—"}
                          </TableCell>
                          <TableCell align="left" sx={remarkTableBodySx}>
                            {item.issue_type === "wrong_delivered" ? (item.original_item || "—") : "—"}
                          </TableCell>
                          <TableCell align="left" sx={remarkTableBodySx}>{Number(item.qty)}</TableCell>
                          <TableCell align="right" sx={remarkTableBodySx}>₹{Number(item.amount).toFixed(2)}</TableCell>
                          <TableCell align="left" sx={remarkTableBodySx}>{item.remarks || "—"}</TableCell>
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
          <MDButton color="secondary" onClick={closeRemarksDialog}>
            Close
          </MDButton>
          <MDButton
            color="info"
            variant="gradient"
            onClick={handleSaveRemarks}
            disabled={savingRemarks || pendingRemarkItems.length === 0}
          >
            {savingRemarks ? "Saving..." : "Save Remarks"}
          </MDButton>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default Packaging;
