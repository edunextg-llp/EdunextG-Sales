import { useState, useEffect, useCallback } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
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
import { FaRegEdit } from "react-icons/fa";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useSalesPolling } from "utils/salesSync";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";

function formatSrNo(index) {
  return String(index + 1).padStart(2, "0");
}

function getPending(row) {
  const totalItems = Number(row.item_count || 0);
  const totalPacked = Number(row.packed_item_count ?? row.item_count ?? 0);
  const totalAmount = Number(row.total_amount || 0);
  const returnedItems = Number(row.returned_item_count || 0);
  const returnedPacked = Number(row.returned_packed_item_count || 0);
  const returnedAmount = Number(row.returned_amount || 0);

  return {
    itemCount: Math.max(0, totalItems - returnedItems),
    packedItemCount: Math.max(0, totalPacked - returnedPacked),
    amount: Math.max(0, totalAmount - returnedAmount),
    hasPartialReturn: returnedItems > 0 || returnedPacked > 0 || returnedAmount > 0,
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
  const [partialForm, setPartialForm] = useState({
    returnItemCount: "",
    returnPackedItemCount: "",
    returnAmount: "",
  });
  const API = "https://bawarchee.edunextg.co/api";

  const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
  }, [activeTab, searchQuery, rowsPerPage]);

  const matchesSearch = (row) => {
    const search = searchQuery.toLowerCase();
    const code = String(row.chalan_code || row.chalanCode || "").toLowerCase();
    const assigneeName = String(row.assignee_name || row.assigneeName || "").toLowerCase();
    const staffName = String(row.staff_name || "").toLowerCase();
    const deliveryBoyName = String(row.delivery_boy_name || "").toLowerCase();
    return (
      code.includes(search) ||
      assigneeName.includes(search) ||
      staffName.includes(search) ||
      deliveryBoyName.includes(search)
    );
  };

  const pendingReturnSales = salesData.filter((row) => {
    if (row.packaging_status !== "delivered") return false;
    const pending = getPending(row);
    return (
      matchesSearch(row) &&
      (pending.itemCount > 0 || pending.packedItemCount > 0 || pending.amount > 0)
    );
  });

  const filteredReturnRecords = returnRecords.filter((row) => matchesSearch(row));

  const activeList = activeTab === "returned" ? filteredReturnRecords : pendingReturnSales;
  const totalPages = Math.max(1, Math.ceil(activeList.length / rowsPerPage));
  const paginatedList = activeList.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const returnedAmount = filteredReturnRecords.reduce(
    (sum, row) => sum + Number(row.return_amount || row.returnAmount || 0),
    0
  );

  const openReturnDialog = (row, mode) => {
    const pending = getPending(row);
    setReturnDialog({ open: true, row, mode });
    setPartialForm({
      returnItemCount: String(pending.itemCount || ""),
      returnPackedItemCount: String(pending.packedItemCount || ""),
      returnAmount: String(pending.amount || ""),
    });
  };

  const closeReturnDialog = () => {
    setReturnDialog({ open: false, row: null, mode: "full" });
    setPartialForm({
      returnItemCount: "",
      returnPackedItemCount: "",
      returnAmount: "",
    });
  };

  const handleProcessReturn = async () => {
    const row = returnDialog.row;
    if (!row || updatingSaleIds.has(row.id)) return;

    const chalanCode = row.chalan_code || row.chalanCode || "";
    const pending = getPending(row);
    const isFull = returnDialog.mode === "full";

    if (isFull) {
      const confirmed = window.confirm(`Mark full return for chalan ${chalanCode}?`);
      if (!confirmed) return;
    } else {
      const returnItemCount = Number(partialForm.returnItemCount);
      const returnPackedItemCount = Number(partialForm.returnPackedItemCount);
      const returnAmount = Number(partialForm.returnAmount);

      if (
        !Number.isFinite(returnItemCount) ||
        !Number.isFinite(returnPackedItemCount) ||
        !Number.isFinite(returnAmount)
      ) {
        alert("Please enter valid numbers for return item, packing item, and amount.");
        return;
      }

      if (returnItemCount <= 0 && returnPackedItemCount <= 0 && returnAmount <= 0) {
        alert("At least one return value must be greater than zero.");
        return;
      }

      if (returnItemCount > pending.itemCount) {
        alert("Return item count cannot exceed pending item count.");
        return;
      }

      if (returnPackedItemCount > pending.packedItemCount) {
        alert("Return packing item count cannot exceed pending packing item count.");
        return;
      }

      if (returnAmount > pending.amount) {
        alert("Return amount cannot exceed pending amount.");
        return;
      }

      const confirmed = window.confirm(`Record partial return for chalan ${chalanCode}?`);
      if (!confirmed) return;
    }

    setUpdatingSaleIds((prev) => new Set(prev).add(row.id));

    try {
      const payload = {
        returnType: isFull ? "full" : "partial",
        returnDate: getTodayLocalDate(),
      };

      if (!isFull) {
        payload.returnItemCount = Number(partialForm.returnItemCount);
        payload.returnPackedItemCount = Number(partialForm.returnPackedItemCount);
        payload.returnAmount = Number(partialForm.returnAmount);
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

        const stillPending = getPending(updatedSale);
        if (
          stillPending.itemCount <= 0 &&
          stillPending.packedItemCount <= 0 &&
          stillPending.amount <= 0
        ) {
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
                  <Grid item xs={12} md={4}>
                    <MDInput
                      type="text"
                      label="Search by Code or Staff / Delivery Name"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={8}>
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
                        {activeTab === "pending" ? (
                          <>
                            <TableCell align="right" sx={paginatedTableHeadCellSx}>
                              Pending Amount
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Pending Item
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Pending Packing
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
                              Return Item
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Return Packing
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
                                  {pending.packedItemCount}
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                                >
                                  {pending.hasPartialReturn ? (
                                    <MDTypography variant="caption" color="warning">
                                      ₹{Number(row.returned_amount || 0).toFixed(2)} /{" "}
                                      {Number(row.returned_item_count || 0)} item /{" "}
                                      {Number(row.returned_packed_item_count || 0)} pack
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
                                    gap={1}
                                    justifyContent="center"
                                    flexWrap="wrap"
                                  >
                                    <MDButton
                                      color="warning"
                                      variant="contained"
                                      size="small"
                                      disabled={updatingSaleIds.has(row.id)}
                                      onClick={() => openReturnDialog(row, "full")}
                                    >
                                      Full Return
                                    </MDButton>
                                    <MDButton
                                      color="info"
                                      variant="outlined"
                                      size="small"
                                      disabled={updatingSaleIds.has(row.id)}
                                      onClick={() => openReturnDialog(row, "partial")}
                                    >
                                      Partial Return
                                    </MDButton>
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
                                {row.return_packed_item_count ?? row.returnPackedItemCount ?? 0}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                {formatDate(row.return_date || row.returnDate)}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                <Chip label="Returned" color="warning" variant="outlined" size="small" />
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                                {returnType === "full" ? (
                                  <FaRegEdit
                                    onClick={() => {
                                      const saleId = row.chalan_sale_id || row.chalanSaleId;
                                      if (!updatingSaleIds.has(saleId)) {
                                        handleRevertReturn(row);
                                      }
                                    }}
                                    style={{
                                      cursor: updatingSaleIds.has(
                                        row.chalan_sale_id || row.chalanSaleId
                                      )
                                        ? "not-allowed"
                                        : "pointer",
                                      opacity: updatingSaleIds.has(
                                        row.chalan_sale_id || row.chalanSaleId
                                      )
                                        ? 0.5
                                        : 1,
                                    }}
                                    color="#E0E388"
                                    size={20}
                                    title="Revert full return"
                                  />
                                ) : (
                                  "—"
                                )}
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

      <Dialog open={returnDialog.open} onClose={closeReturnDialog} fullWidth maxWidth="sm">
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
          </MDBox>

          {returnDialog.mode === "full" ? (
            <MDBox>
              <MDTypography variant="body2" color="text" mb={1}>
                This will return all pending items for this chalan.
              </MDTypography>
              <MDTypography variant="body2" fontWeight="medium">
                Pending Amount: ₹{dialogPending?.amount.toFixed(2) || "0.00"}
              </MDTypography>
              <MDTypography variant="body2" fontWeight="medium">
                Pending Item: {dialogPending?.itemCount ?? 0}
              </MDTypography>
              <MDTypography variant="body2" fontWeight="medium">
                Pending Packing: {dialogPending?.packedItemCount ?? 0}
              </MDTypography>
            </MDBox>
          ) : (
            <MDBox display="flex" flexDirection="column" gap={2}>
              <MDTypography variant="caption" color="text">
                Max pending — Amount: ₹{dialogPending?.amount.toFixed(2) || "0.00"} | Item:{" "}
                {dialogPending?.itemCount ?? 0} | Packing: {dialogPending?.packedItemCount ?? 0}
              </MDTypography>
              <MDInput
                type="number"
                label="Return No. of Item"
                fullWidth
                value={partialForm.returnItemCount}
                onChange={(e) =>
                  setPartialForm((prev) => ({ ...prev, returnItemCount: e.target.value }))
                }
              />
              <MDInput
                type="number"
                label="Return Packing Item"
                fullWidth
                value={partialForm.returnPackedItemCount}
                onChange={(e) =>
                  setPartialForm((prev) => ({ ...prev, returnPackedItemCount: e.target.value }))
                }
              />
              <MDInput
                type="number"
                label="Return Amount"
                fullWidth
                value={partialForm.returnAmount}
                onChange={(e) =>
                  setPartialForm((prev) => ({ ...prev, returnAmount: e.target.value }))
                }
              />
              <MDTypography variant="caption" color="text">
                Remaining amount and items will stay in Pending Return.
              </MDTypography>
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton onClick={closeReturnDialog} color="dark">
            Cancel
          </MDButton>
          <MDButton
            onClick={handleProcessReturn}
            color={returnDialog.mode === "full" ? "warning" : "info"}
            variant="contained"
            disabled={
              !returnDialog.row ||
              updatingSaleIds.has(returnDialog.row?.id)
            }
          >
            {returnDialog.mode === "full" ? "Confirm Full Return" : "Save Partial Return"}
          </MDButton>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default ChalanReturn;
