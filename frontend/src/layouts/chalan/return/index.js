import { useState, useEffect, useCallback } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useSalesPolling } from "utils/salesSync";
import { printChalanReturnPdf } from "utils/printChalanReturnPdf";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";

const actionIconSx = {
  fontSize: "1.35rem !important",
};

function formatSrNo(index) {
  return String(index + 1).padStart(2, "0");
}

function getPending(row) {
  const totalItems = Number(row.item_count || 0);
  const totalAmount = Number(row.total_amount || 0);
  const returnedItems = Number(row.returned_item_count || 0);
  const returnedAmount = Number(row.returned_amount || 0);

  return {
    itemCount: Math.max(0, totalItems - returnedItems),
    amount: Math.max(0, totalAmount - returnedAmount),
    hasPartialReturn: returnedItems > 0 || returnedAmount > 0,
  };
}

function ChalanReturn() {
  const [salesData, setSalesData] = useState([]);
  const [returnRecords, setReturnRecords] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [updatingSaleIds, setUpdatingSaleIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);
  const [returnDialog, setReturnDialog] = useState({ open: false, row: null, mode: "full" });
  const [itemReturnRows, setItemReturnRows] = useState([]);
  const [loadingSaleItems, setLoadingSaleItems] = useState(false);
  const [returnDate, setReturnDate] = useState("");
  const [filterReturnDate, setFilterReturnDate] = useState("");
  const [viewDialog, setViewDialog] = useState({
    open: false,
    title: "",
    records: [],
  });
  const API = "https://bawarchee.edunextg.co/api";

  const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getDateOnly = (value) => {
    if (!value) return "";
    return String(value).split("T")[0].split(" ")[0];
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    const dateOnly = String(value).split("T")[0].split(" ")[0];
    const parts = dateOnly.split("-");
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return value;
  };

  const fetchSales = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const response = await fetch(`${API}/chalan/sales/packaging`);
        if (response.ok) {
          setSalesData(await response.json());
        } else if (!silent) {
          setSalesData([]);
        }
      } catch (error) {
        if (!silent) {
          console.error("Error fetching chalan return sales:", error);
        }
      }
    },
    [API]
  );

  const fetchReturnRecords = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const response = await fetch(`${API}/chalan/sales/returns`);
        if (response.ok) {
          setReturnRecords(await response.json());
        } else if (!silent) {
          setReturnRecords([]);
        }
      } catch (error) {
        if (!silent) {
          console.error("Error fetching chalan return records:", error);
        }
      }
    },
    [API]
  );

  useEffect(() => {
    fetchSales();
    fetchReturnRecords();
  }, [fetchSales, fetchReturnRecords]);

  useSalesPolling(() => {
    fetchSales({ silent: true });
    fetchReturnRecords({ silent: true });
  });

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, filterReturnDate, rowsPerPage]);

  const matchesSearch = (row) => {
    const search = searchQuery.toLowerCase();
    const code = String(row.chalan_code || row.chalanCode || "").toLowerCase();
    const assigneeName = String(row.assignee_name || row.assigneeName || "").toLowerCase();
    const staffName = String(row.staff_name || "").toLowerCase();
    const deliveryBoyName = String(row.delivery_boy_name || "").toLowerCase();
    const companyName = String(row.company_name || row.companyName || "").toLowerCase();
    return (
      code.includes(search) ||
      assigneeName.includes(search) ||
      staffName.includes(search) ||
      deliveryBoyName.includes(search) ||
      companyName.includes(search)
    );
  };

  const pendingReturnSales = salesData.filter((row) => {
    if (row.packaging_status !== "delivered") return false;
    const pending = getPending(row);
    return (
      matchesSearch(row) &&
      (pending.itemCount > 0 || pending.amount > 0)
    );
  });

  const filteredReturnRecords = returnRecords.filter((row) => {
    if (!matchesSearch(row)) return false;
    if (!filterReturnDate) return true;
    return getDateOnly(row.return_date || row.returnDate) === filterReturnDate;
  });

  const activeList = activeTab === "returned" ? filteredReturnRecords : pendingReturnSales;
  const totalPages = Math.max(1, Math.ceil(activeList.length / rowsPerPage));
  const paginatedList = activeList.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const returnedAmount = filteredReturnRecords.reduce(
    (sum, row) => sum + Number(row.return_amount || row.returnAmount || 0),
    0
  );

  const getReturnsForSale = (saleId) =>
    returnRecords
      .filter((record) => Number(record.chalan_sale_id || record.chalanSaleId) === Number(saleId))
      .sort((a, b) => {
        const dateA = String(a.return_date || a.returnDate || "");
        const dateB = String(b.return_date || b.returnDate || "");
        if (dateA === dateB) return Number(b.id) - Number(a.id);
        return dateB.localeCompare(dateA);
      });

  const openViewReturns = (saleId, chalanCode) => {
    const records = getReturnsForSale(saleId);
    if (!records.length) {
      alert("No return history found for this chalan.");
      return;
    }
    setViewDialog({
      open: true,
      title: `Return History — ${chalanCode || "N/A"}`,
      records,
    });
  };

  const openViewSingleReturn = (record) => {
    setViewDialog({
      open: true,
      title: `Return Details — ${record.chalan_code || record.chalanCode || "N/A"}`,
      records: [record],
    });
  };

  const closeViewDialog = () => {
    setViewDialog({ open: false, title: "", records: [] });
  };

  const handlePrintReturn = (record) => {
    if (!record?.returnItems?.length) {
      alert("No item details found for this return. Refresh and try again.");
      return;
    }
    printChalanReturnPdf(record);
  };

  const openReturnDialog = async (row, mode) => {
    setReturnDialog({ open: true, row, mode });
    setReturnDate(getTodayLocalDate());
    setLoadingSaleItems(true);
    setItemReturnRows([]);

    try {
      const response = await fetch(`${API}/chalan/sales/${row.id}`);
      const sale = await response.json();
      if (!response.ok) {
        throw new Error(sale.error || "Failed to load chalan items.");
      }

      const rows = (sale.items || []).map((item) => {
        const qty = Number(item.qty || 0);
        const returnedQty = Number(item.returnedQty || 0);
        const pendingQty = Number(
          item.pendingQty ?? Math.max(0, qty - returnedQty)
        );
        return {
          itemId: item.id,
          srNo: item.srNo,
          itemName: item.itemName,
          qty,
          returnedQty,
          pendingQty,
          mrp: Number(item.mrp || 0),
          returnQty: mode === "full" ? String(pendingQty) : "",
        };
      });

      setItemReturnRows(rows);
    } catch (error) {
      alert(error.message || "Failed to load chalan items.");
      setReturnDialog({ open: false, row: null, mode: "full" });
      setItemReturnRows([]);
      setReturnDate("");
    } finally {
      setLoadingSaleItems(false);
    }
  };

  const closeReturnDialog = () => {
    setReturnDialog({ open: false, row: null, mode: "full" });
    setItemReturnRows([]);
    setReturnDate("");
    setLoadingSaleItems(false);
  };

  const handleReturnQtyChange = (itemId, value) => {
    setItemReturnRows((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, returnQty: value } : item
      )
    );
  };

  const handleProcessReturn = async () => {
    const row = returnDialog.row;
    if (!row || updatingSaleIds.has(row.id)) return;

    const chalanCode = row.chalan_code || row.chalanCode || "";
    const isFull = returnDialog.mode === "full";
    const selectedReturnDate = getDateOnly(returnDate);

    if (!selectedReturnDate) {
      alert("Please select a return date.");
      return;
    }

    if (isFull) {
      const confirmed = window.confirm(
        `Mark full return for chalan ${chalanCode} on ${formatDate(selectedReturnDate)}?`
      );
      if (!confirmed) return;
    } else {
      const returnItems = itemReturnRows
        .map((item) => ({
          itemId: item.itemId,
          returnQty: Number(item.returnQty),
        }))
        .filter((item) => item.returnQty > 0);

      if (!returnItems.length) {
        alert("Enter return quantity for at least one item.");
        return;
      }

      for (const item of itemReturnRows) {
        const returnQty = Number(item.returnQty);
        if (!Number.isFinite(returnQty) || returnQty < 0) {
          alert(`Enter a valid return quantity for "${item.itemName}".`);
          return;
        }
        if (returnQty > item.pendingQty) {
          alert(`Return quantity for "${item.itemName}" cannot exceed pending quantity (${item.pendingQty}).`);
          return;
        }
      }

      const confirmed = window.confirm(
        `Record partial return for chalan ${chalanCode} on ${formatDate(selectedReturnDate)}?`
      );
      if (!confirmed) return;
    }

    setUpdatingSaleIds((prev) => new Set(prev).add(row.id));

    try {
      const payload = {
        returnType: isFull ? "full" : "partial",
        returnDate: selectedReturnDate,
      };

      if (!isFull) {
        payload.returnItems = itemReturnRows
          .map((item) => ({
            itemId: item.itemId,
            returnQty: Number(item.returnQty),
          }))
          .filter((item) => item.returnQty > 0);
      }

      const response = await fetch(`${API}/chalan/sales/${row.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedSale = { ...row, ...(data.sale || {}) };

        setSalesData((prev) => prev.map((item) => (item.id === row.id ? updatedSale : item)));

        if (data.returnRecord) {
          setReturnRecords((prev) => [data.returnRecord, ...prev]);
        } else {
          fetchReturnRecords({ silent: true });
        }

        closeReturnDialog();

        if (data.returnRecord) {
          const shouldPrint = window.confirm(
            `${isFull ? "Full" : "Partial"} return saved. Print return sheet now?`
          );
          if (shouldPrint) {
            handlePrintReturn(data.returnRecord);
          }
        }

        const stillPending = getPending(updatedSale);
        if (stillPending.itemCount <= 0 && stillPending.amount <= 0) {
          setActiveTab("returned");
        }
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to process return.");
      }
    } catch (error) {
      console.error("Error processing chalan return:", error);
      alert("Error processing return.");
    } finally {
      setUpdatingSaleIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const handleRevertReturn = async (record) => {
    const chalanSaleId = record.chalan_sale_id || record.chalanSaleId;
    if (!chalanSaleId || updatingSaleIds.has(chalanSaleId)) return;

    if (record.return_type !== "full" && record.returnType !== "full") {
      alert("Only full return entries can be reverted.");
      return;
    }

    const chalanCode = record.chalan_code || record.chalanCode || "";
    const confirmed = window.confirm(
      `Revert full return for chalan ${chalanCode}? It will move back to Pending Return.`
    );
    if (!confirmed) return;

    setUpdatingSaleIds((prev) => new Set(prev).add(chalanSaleId));

    try {
      const response = await fetch(`${API}/chalan/sales/${chalanSaleId}/revert-return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        setSalesData((prev) =>
          prev.map((item) => (item.id === chalanSaleId ? { ...item, ...(data.sale || {}) } : item))
        );
        setReturnRecords((prev) =>
          prev.filter(
            (item) => (item.chalan_sale_id || item.chalanSaleId) !== chalanSaleId
          )
        );
        setActiveTab("pending");
        fetchSales({ silent: true });
        fetchReturnRecords({ silent: true });
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to revert return.");
      }
    } catch (error) {
      console.error("Error reverting chalan return:", error);
      alert("Error reverting return.");
    } finally {
      setUpdatingSaleIds((prev) => {
        const next = new Set(prev);
        next.delete(chalanSaleId);
        return next;
      });
    }
  };

  const dialogPending = returnDialog.row ? getPending(returnDialog.row) : null;
  const dialogReturnTotal = itemReturnRows.reduce((sum, item) => {
    const qty = Number(item.returnQty || 0);
    return sum + (Number.isFinite(qty) ? qty * item.mrp : 0);
  }, 0);
  const dialogReturnQty = itemReturnRows.reduce((sum, item) => {
    const qty = Number(item.returnQty || 0);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h5" fontWeight="medium" color="dark" mb={2}>
                  Chalan Return
                </MDTypography>
                <Tabs
                  value={activeTab}
                  onChange={(_, value) => setActiveTab(value)}
                  sx={{
                    minHeight: 40,
                    "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 },
                  }}
                >
                  <Tab label={`Pending Return (${pendingReturnSales.length})`} value="pending" />
                  <Tab
                    label={`Returned (${filteredReturnRecords.length})`}
                    value="returned"
                    sx={{ color: activeTab === "returned" ? "warning.main" : undefined }}
                  />
                </Tabs>
              </MDBox>

              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={activeTab === "returned" ? 4 : 4}>
                    <MDInput
                      type="text"
                      label="Search by Code or Staff / Delivery Name"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  {activeTab === "returned" && (
                    <Grid item xs={12} md={3}>
                      <MDInput
                        type="date"
                        label="Filter by Return Date"
                        fullWidth
                        value={filterReturnDate}
                        onChange={(e) => setFilterReturnDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                  )}
                  <Grid item xs={12} md={activeTab === "returned" ? 5 : 8}>
                    <MDBox
                      display="flex"
                      gap={2}
                      justifyContent={{ xs: "flex-start", md: "flex-end" }}
                      flexWrap="wrap"
                    >
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        onClick={() => setActiveTab("pending")}
                        sx={{
                          backgroundColor: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          cursor: "pointer",
                        }}
                      >
                        <MDTypography variant="caption" color="text">
                          Pending Return
                        </MDTypography>
                        <MDTypography variant="h5" color="success" fontWeight="bold">
                          {pendingReturnSales.length}
                        </MDTypography>
                      </MDBox>
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        onClick={() => setActiveTab("returned")}
                        sx={{
                          backgroundColor: "#fff7ed",
                          border: "1px solid #fed7aa",
                          cursor: "pointer",
                        }}
                      >
                        <MDTypography variant="caption" color="text">
                          Returned
                        </MDTypography>
                        <MDTypography variant="h5" color="warning" fontWeight="bold">
                          {filteredReturnRecords.length}
                        </MDTypography>
                      </MDBox>
                    </MDBox>
                  </Grid>
                </Grid>

                {activeTab === "returned" && (
                  <MDTypography variant="h6" color="warning" fontWeight="bold" mb={2}>
                    Total Returns: {filteredReturnRecords.length} | Amount: ₹
                    {returnedAmount.toFixed(2)}
                  </MDTypography>
                )}

                <TableContainer component={Paper} sx={paginatedTableContainerSx}>
                  <Table stickyHeader sx={{ minWidth: 650 }}>
                    <TableHead sx={paginatedTableHeadSx()}>
                      <TableRow>
                        <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                          SR
                        </TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Code</TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Staff / Delivery Name</TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Company</TableCell>
                        {activeTab === "pending" ? (
                          <>
                            <TableCell align="right" sx={paginatedTableHeadCellSx}>
                              Pending Amount
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Pending Qty
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Already Returned
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Return Type
                            </TableCell>
                            <TableCell align="right" sx={paginatedTableHeadCellSx}>
                              Return Amount
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Return Qty
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Return Date
                            </TableCell>
                          </>
                        )}
                        {activeTab === "pending" && (
                          <>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Delivery Boy
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Vehicle
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Delivery Date
                            </TableCell>
                          </>
                        )}
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Status
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedList.length > 0 ? (
                        paginatedList.map((row, index) => {
                          if (activeTab === "pending") {
                            const pending = getPending(row);
                            return (
                              <TableRow
                                key={row.id}
                                sx={{
                                  backgroundColor: pending.hasPartialReturn ? "#fffbeb" : "#f0fdf4",
                                  "&:last-child td, &:last-child th": { border: 0 },
                                }}
                              >
                                <TableCell
                                  align="center"
                                  sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                                >
                                  {formatSrNo((page - 1) * rowsPerPage + index)}
                                </TableCell>
                                <TableCell
                                  sx={{
                                    borderBottom: "1px solid #cbd5e1",
                                    py: 2,
                                    fontWeight: "bold",
                                  }}
                                >
                                  {row.chalan_code || row.chalanCode}
                                </TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                  {row.assignee_name || row.assigneeName || "—"}
                                </TableCell>
                                <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                  {row.company_name || row.companyName || "N/A"}
                                </TableCell>
                                <TableCell
                                  align="right"
                                  sx={{
                                    borderBottom: "1px solid #cbd5e1",
                                    py: 2,
                                    fontWeight: "bold",
                                  }}
                                >
                                  ₹{pending.amount.toFixed(2)}
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                                >
                                  {pending.itemCount}
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                                >
                                  {pending.hasPartialReturn ? (
                                    <MDTypography variant="caption" color="warning">
                                      ₹{Number(row.returned_amount || 0).toFixed(2)} /{" "}
                                      {Number(row.returned_item_count || 0)} qty
                                    </MDTypography>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                                >
                                  {row.delivery_boy_name || "N/A"}
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                                >
                                  {row.vehicle_no || "N/A"}
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                                >
                                  {formatDate(row.delivery_date || row.status_updated_at)}
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                                >
                                  {pending.hasPartialReturn ? (
                                    <Chip
                                      label="Partial Returned"
                                      color="warning"
                                      variant="outlined"
                                      size="small"
                                    />
                                  ) : (
                                    <Chip
                                      label="Pending Return"
                                      color="success"
                                      variant="outlined"
                                      size="small"
                                    />
                                  )}
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                                >
                                  <MDBox
                                    display="flex"
                                    gap={0.5}
                                    justifyContent="center"
                                    alignItems="center"
                                  >
                                    {pending.hasPartialReturn && (
                                      <Tooltip title="View partial returns">
                                        <IconButton
                                          size="small"
                                          color="info"
                                          onClick={() =>
                                            openViewReturns(
                                              row.id,
                                              row.chalan_code || row.chalanCode
                                            )
                                          }
                                        >
                                          <Icon sx={actionIconSx}>visibility</Icon>
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                    <Tooltip title="Full Return">
                                      <span>
                                        <IconButton
                                          size="small"
                                          color="warning"
                                          disabled={updatingSaleIds.has(row.id)}
                                          onClick={() => openReturnDialog(row, "full")}
                                        >
                                          <Icon sx={actionIconSx}>assignment_return</Icon>
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                    <Tooltip title="Partial Return">
                                      <span>
                                        <IconButton
                                          size="small"
                                          color="info"
                                          disabled={updatingSaleIds.has(row.id)}
                                          onClick={() => openReturnDialog(row, "partial")}
                                        >
                                          <Icon sx={actionIconSx}>playlist_add</Icon>
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  </MDBox>
                                </TableCell>
                              </TableRow>
                            );
                          }

                          const returnType = row.return_type || row.returnType;
                          return (
                            <TableRow
                              key={row.id}
                              sx={{
                                backgroundColor: "#fff7ed",
                                "&:last-child td, &:last-child th": { border: 0 },
                              }}
                            >
                              <TableCell
                                align="center"
                                sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                              >
                                {formatSrNo((page - 1) * rowsPerPage + index)}
                              </TableCell>
                              <TableCell
                                sx={{
                                  borderBottom: "1px solid #cbd5e1",
                                  py: 2,
                                  fontWeight: "bold",
                                }}
                              >
                                {row.chalan_code || row.chalanCode}
                              </TableCell>
                              <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                {row.assignee_name || row.assigneeName || "—"}
                              </TableCell>
                              <TableCell sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                {row.company_name || row.companyName || "N/A"}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                <Chip
                                  label={returnType === "full" ? "Full" : "Partial"}
                                  color={returnType === "full" ? "warning" : "info"}
                                  variant="outlined"
                                  size="small"
                                />
                              </TableCell>
                              <TableCell
                                align="right"
                                sx={{
                                  borderBottom: "1px solid #cbd5e1",
                                  py: 2,
                                  fontWeight: "bold",
                                }}
                              >
                                ₹{Number(row.return_amount || row.returnAmount || 0).toFixed(2)}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                {row.return_item_count ?? row.returnItemCount ?? 0}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                {formatDate(row.return_date || row.returnDate)}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                <Chip label="Returned" color="warning" variant="outlined" size="small" />
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                <MDBox
                                  display="flex"
                                  gap={0.5}
                                  justifyContent="center"
                                  alignItems="center"
                                >
                                  <Tooltip title="View return items">
                                    <IconButton
                                      size="small"
                                      color="info"
                                      onClick={() => openViewSingleReturn(row)}
                                    >
                                      <Icon sx={actionIconSx}>visibility</Icon>
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Print return">
                                    <IconButton
                                      size="small"
                                      onClick={() => handlePrintReturn(row)}
                                      sx={{ color: "#344767" }}
                                    >
                                      <Icon sx={actionIconSx}>print</Icon>
                                    </IconButton>
                                  </Tooltip>
                                  {returnType === "full" && (
                                    <Tooltip title="Revert full return">
                                      <span>
                                        <IconButton
                                          size="small"
                                          color="warning"
                                          disabled={updatingSaleIds.has(
                                            row.chalan_sale_id || row.chalanSaleId
                                          )}
                                          onClick={() => handleRevertReturn(row)}
                                        >
                                          <Icon sx={actionIconSx}>undo</Icon>
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  )}
                                </MDBox>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={activeTab === "pending" ? 12 : 10}
                            align="center"
                            sx={{ py: 3, borderBottom: 0 }}
                          >
                            <MDTypography variant="body2" color="text">
                              {activeTab === "returned"
                                ? "No returned chalans found."
                                : "No delivered chalans pending return."}
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
                  total={activeList.length}
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

      <Dialog open={returnDialog.open} onClose={closeReturnDialog} fullWidth maxWidth="md">
        <DialogTitle>
          {returnDialog.mode === "full" ? "Full Return" : "Partial Return"}
        </DialogTitle>
        <DialogContent dividers>
          <MDBox mb={2}>
            <MDTypography variant="button" fontWeight="medium">
              Code: {returnDialog.row?.chalan_code || returnDialog.row?.chalanCode || "N/A"}
            </MDTypography>
            <MDTypography display="block" variant="body2" color="text" mt={0.5}>
              Staff / Delivery:{" "}
              {returnDialog.row?.assignee_name || returnDialog.row?.assigneeName || "N/A"}
            </MDTypography>
            <MDBox mt={2} maxWidth={240}>
              <MDInput
                type="date"
                label="Return Date *"
                fullWidth
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </MDBox>
          </MDBox>

          {loadingSaleItems ? (
            <MDTypography variant="body2" color="text">
              Loading items...
            </MDTypography>
          ) : itemReturnRows.length === 0 ? (
            <MDTypography variant="body2" color="text">
              No items found for this chalan.
            </MDTypography>
          ) : (
            <MDBox>
              <MDTypography variant="body2" color="text" mb={1.5}>
                {returnDialog.mode === "full"
                  ? "All pending item quantities will be returned."
                  : "Enter return quantity item-wise. Remaining quantities will stay in Pending Return."}
              </MDTypography>

              <TableContainer component={Paper} sx={{ boxShadow: "none", mb: 2 }}>
                <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
                  <TableHead
                    sx={{
                      display: "table-header-group",
                      backgroundColor: "#f9fafb",
                      "& .MuiTableCell-root": {
                        backgroundColor: "#f9fafb",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        py: 1,
                        color: "#6b7280",
                      },
                    }}
                  >
                    <TableRow>
                      <TableCell align="center" sx={{ width: "8%" }}>
                        SR
                      </TableCell>
                      <TableCell sx={{ width: "28%" }}>Item Name</TableCell>
                      <TableCell align="right" sx={{ width: "12%" }}>
                        Total Qty
                      </TableCell>
                      <TableCell align="right" sx={{ width: "12%" }}>
                        Returned
                      </TableCell>
                      <TableCell align="right" sx={{ width: "12%" }}>
                        Pending
                      </TableCell>
                      <TableCell align="right" sx={{ width: "12%" }}>
                        MRP
                      </TableCell>
                      <TableCell align="right" sx={{ width: "16%" }}>
                        Return Qty
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {itemReturnRows.map((item) => (
                      <TableRow key={item.itemId}>
                        <TableCell align="center" sx={{ py: 1, fontSize: "0.75rem" }}>
                          {formatSrNo(item.srNo - 1)}
                        </TableCell>
                        <TableCell sx={{ py: 1, fontSize: "0.75rem" }}>{item.itemName}</TableCell>
                        <TableCell align="right" sx={{ py: 1, fontSize: "0.75rem" }}>
                          {item.qty}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1, fontSize: "0.75rem" }}>
                          {item.returnedQty}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1, fontSize: "0.75rem" }}>
                          {item.pendingQty}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1, fontSize: "0.75rem" }}>
                          ₹{item.mrp.toFixed(2)}
                        </TableCell>
                        <TableCell align="right" sx={{ py: 1, fontSize: "0.75rem" }}>
                          {returnDialog.mode === "full" ? (
                            item.pendingQty
                          ) : (
                            <MDInput
                              type="number"
                              value={item.returnQty}
                              onChange={(e) =>
                                handleReturnQtyChange(item.itemId, e.target.value)
                              }
                              inputProps={{ min: 0, max: item.pendingQty, step: "any" }}
                              sx={{
                                width: 80,
                                "& .MuiInputBase-input": { fontSize: "0.75rem", py: 0.75 },
                              }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <MDTypography variant="body2" fontWeight="medium">
                Pending Amount: ₹{dialogPending?.amount.toFixed(2) || "0.00"}
              </MDTypography>
              <MDTypography variant="body2" fontWeight="medium">
                Pending Qty: {dialogPending?.itemCount ?? 0}
              </MDTypography>
              <MDTypography variant="body2" fontWeight="medium" mt={0.5}>
                This Return: {dialogReturnQty} qty | ₹{dialogReturnTotal.toFixed(2)}
              </MDTypography>
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton
            onClick={closeReturnDialog}
            color="dark"
            variant="outlined"
            startIcon={<Icon>close</Icon>}
          >
            Cancel
          </MDButton>
          <MDButton
            onClick={handleProcessReturn}
            color={returnDialog.mode === "full" ? "warning" : "info"}
            variant="contained"
            startIcon={
              <Icon>
                {returnDialog.mode === "full" ? "assignment_return" : "playlist_add_check"}
              </Icon>
            }
            disabled={
              !returnDialog.row ||
              !returnDate ||
              loadingSaleItems ||
              itemReturnRows.length === 0 ||
              updatingSaleIds.has(returnDialog.row?.id)
            }
          >
            {returnDialog.mode === "full" ? "Confirm Full Return" : "Save Partial Return"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Dialog open={viewDialog.open} onClose={closeViewDialog} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Icon color="info">visibility</Icon>
          {viewDialog.title}
        </DialogTitle>
        <DialogContent dividers>
          {viewDialog.records.length === 0 ? (
            <MDTypography variant="body2" color="text">
              No return records found.
            </MDTypography>
          ) : (
            viewDialog.records.map((record) => {
              const returnType = record.return_type || record.returnType;
              const items = record.returnItems || [];
              return (
                <MDBox
                  key={record.id}
                  mb={2.5}
                  p={2}
                  borderRadius="lg"
                  sx={{ border: "1px solid #e5e7eb", backgroundColor: "#fafafa" }}
                >
                  <MDBox
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    flexWrap="wrap"
                    gap={1}
                    mb={1.5}
                  >
                    <MDBox>
                      <MDTypography variant="button" fontWeight="medium">
                        Date: {formatDate(record.return_date || record.returnDate)}
                      </MDTypography>
                      <MDBox display="flex" alignItems="center" gap={1} mt={0.5}>
                        <Chip
                          label={returnType === "full" ? "Full Return" : "Partial Return"}
                          color={returnType === "full" ? "warning" : "info"}
                          size="small"
                          variant="outlined"
                        />
                        <MDTypography variant="caption" color="text">
                          Qty: {record.return_item_count ?? record.returnItemCount ?? 0} | Amount: ₹
                          {Number(record.return_amount || record.returnAmount || 0).toFixed(2)}
                        </MDTypography>
                      </MDBox>
                    </MDBox>
                    <Tooltip title="Print this return">
                      <IconButton
                        size="small"
                        onClick={() => handlePrintReturn(record)}
                        sx={{ color: "#344767" }}
                      >
                        <Icon sx={actionIconSx}>print</Icon>
                      </IconButton>
                    </Tooltip>
                  </MDBox>

                  {items.length === 0 ? (
                    <MDTypography variant="caption" color="text">
                      No item details available for this return.
                    </MDTypography>
                  ) : (
                    <TableContainer component={Paper} sx={{ boxShadow: "none" }}>
                      <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
                        <TableHead
                          sx={{
                            display: "table-header-group",
                            backgroundColor: "#f3f4f6",
                            "& .MuiTableCell-root": {
                              backgroundColor: "#f3f4f6",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              py: 1,
                              color: "#6b7280",
                            },
                          }}
                        >
                          <TableRow>
                            <TableCell align="center" sx={{ width: "10%" }}>
                              SR
                            </TableCell>
                            <TableCell sx={{ width: "40%" }}>Item Name</TableCell>
                            <TableCell align="right" sx={{ width: "15%" }}>
                              Qty
                            </TableCell>
                            <TableCell align="right" sx={{ width: "15%" }}>
                              Rate
                            </TableCell>
                            <TableCell align="right" sx={{ width: "20%" }}>
                              Amount
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {items.map((item, itemIndex) => {
                            const qty = Number(item.returnQty || 0);
                            const rate = Number(item.mrp || 0);
                            return (
                              <TableRow key={`${record.id}-${item.itemId || itemIndex}`}>
                                <TableCell align="center" sx={{ py: 1, fontSize: "0.75rem" }}>
                                  {formatSrNo((item.srNo || itemIndex + 1) - 1)}
                                </TableCell>
                                <TableCell sx={{ py: 1, fontSize: "0.75rem" }}>
                                  {item.itemName || "—"}
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1, fontSize: "0.75rem" }}>
                                  {qty}
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1, fontSize: "0.75rem" }}>
                                  ₹{rate.toFixed(2)}
                                </TableCell>
                                <TableCell align="right" sx={{ py: 1, fontSize: "0.75rem" }}>
                                  ₹{(qty * rate).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </MDBox>
              );
            })
          )}
        </DialogContent>
        <DialogActions>
          <MDButton
            onClick={closeViewDialog}
            color="dark"
            variant="outlined"
            startIcon={<Icon>close</Icon>}
          >
            Close
          </MDButton>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default ChalanReturn;
