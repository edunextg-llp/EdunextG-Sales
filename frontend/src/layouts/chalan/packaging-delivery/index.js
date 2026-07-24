import { useState, useEffect, useCallback, useRef } from "react";
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
  FormControl,
  Select,
  MenuItem,
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
import {
  enhancePackagingRow,
  isPackagingRowDirty,
  mergeSalesRows,
  useSalesPolling,
} from "utils/salesSync";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";
import { IoSaveOutline } from "react-icons/io5";
import { FaRegEdit } from "react-icons/fa";

function formatSrNo(index) {
  return String(index + 1).padStart(2, "0");
}

function ChalanPackagingDelivery() {
  const [dateFilterMode, setDateFilterMode] = useState("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [salesData, setSalesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [historyDialog, setHistoryDialog] = useState({ open: false, sale: null, history: [] });
  const [savingSaleIds, setSavingSaleIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);
  const recentlySavedRef = useRef(new Map());
  const API = "https://bawarche.edunextg.co/api";

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

  const fetchSales = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const response = await fetch(`${API}/chalan/sales/packaging`);
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
          console.error("Failed to fetch chalan packaging sales");
          setSalesData([]);
        }
      } catch (error) {
        if (!silent) {
          console.error("Error fetching chalan packaging sales:", error);
        }
      }
    },
    [API]
  );

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, dateFilterMode, selectedDate, rowsPerPage]);

  useSalesPolling(fetchSales);

  const handleRowChange = (saleId, field, value) => {
    const newData = [...salesData];
    const index = newData.findIndex((r) => r.id === saleId);
    if (index === -1) return;
    newData[index] = { ...newData[index], [field]: value };
    if (field === "packaging_status" && value !== newData[index].original_packaging_status) {
      newData[index].status_update_date = "";
      newData[index].status_update_date_changed = false;
    }
    if (field === "status_update_date") {
      newData[index].status_update_date_changed = true;
    }
    setSalesData(newData);
  };

  const handleSavePackaging = async (saleId) => {
    const row = salesData.find((r) => r.id === saleId);
    if (!row || savingSaleIds.has(saleId)) return;

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
        packagingStatus: row.packaging_status || "not_packing",
        statusDate: row.status_update_date || null,
        expectedStatus: row.original_packaging_status,
        packedItemCount,
        boxCount,
        packetCount,
      };

      const response = await fetch(`${API}/chalan/sales/${row.id}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const updated = enhancePackagingRow(data.sale);
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
      console.error("Error saving chalan packaging:", error);
      alert("Error saving packaging status.");
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
      const response = await fetch(`${API}/chalan/sales/${saleId}/status-history`);
      if (response.ok) {
        const data = await response.json();
        setHistoryDialog({ open: true, sale: data.sale, history: data.history || [] });
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to load status dates.");
      }
    } catch (error) {
      console.error("Error loading chalan status history:", error);
      alert("Error loading status dates.");
    }
  };

  const getRowColor = (status) => {
    if (status === "packing_done") return "#dcfce7";
    if (status === "packing") return "#fef08a";
    return "#ffebeb";
  };

  const getTextColor = (status) => {
    if (status === "packing_done") return "#166534";
    if (status === "packing") return "#854d0e";
    return "#991b1b";
  };

  const filteredSales = salesData.filter((row) => {
    const status = row.packaging_status || row.original_packaging_status || "not_packing";
    const isTerminalStatus =
      status === "packing_done" ||
      status === "out_for_delivery" ||
      status === "delivered" ||
      status === "cancelled" ||
      status === "returned";

    if (isTerminalStatus && !isPackagingRowDirty(row)) {
      return false;
    }

    if (statusFilter !== "all" && status !== statusFilter) {
      return false;
    }

    if (dateFilterMode === "specific") {
      const saleDate = String(row.sale_date || row.saleDate || "")
        .split("T")[0]
        .split(" ")[0];
      if (saleDate !== selectedDate) {
        return false;
      }
    }

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
  });

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / rowsPerPage));
  const paginatedSales = filteredSales.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center">
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Chalan Packaging Delivery
                </MDTypography>
              </MDBox>
              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="text"
                      label="Search by Code or Staff / Delivery Name"
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
                  <Table stickyHeader sx={{ minWidth: 650 }}>
                    <TableHead sx={paginatedTableHeadSx()}>
                      <TableRow>
                        <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                          SR
                        </TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Code</TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Staff / Delivery Name</TableCell>
                        <TableCell sx={paginatedTableHeadCellSx}>Company</TableCell>
                        {dateFilterMode === "all" && (
                          <TableCell sx={paginatedTableHeadCellSx}>Sale Date</TableCell>
                        )}
                        <TableCell align="right" sx={paginatedTableHeadCellSx}>
                          Amount
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
                                "&:last-child td, &:last-child th": { border: 0 },
                              }}
                            >
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
                                {formatSrNo((page - 1) * rowsPerPage + index)}
                              </TableCell>
                              <TableCell
                                sx={{
                                  borderBottom: borderCol,
                                  py: 2,
                                  color: txColor,
                                  fontWeight: "bold",
                                }}
                              >
                                {row.chalan_code || row.chalanCode}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.assignee_name || row.assigneeName || "—"}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.company_name || row.companyName || "N/A"}
                              </TableCell>
                              {dateFilterMode === "all" && (
                                <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                  {formatDate(row.sale_date || row.saleDate)}
                                </TableCell>
                              )}
                              <TableCell
                                align="right"
                                sx={{
                                  borderBottom: borderCol,
                                  py: 2,
                                  color: txColor,
                                  fontWeight: "bold",
                                }}
                              >
                                ₹{Number(row.total_amount || 0).toFixed(2)}
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
                                {row.item_count ?? "N/A"}
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
                                <MDInput
                                  type="number"
                                  value={row.packed_item_count || ""}
                                  onChange={(e) =>
                                    handleRowChange(row.id, "packed_item_count", e.target.value)
                                  }
                                  size="small"
                                  inputProps={{
                                    min: 1,
                                    max: row.item_count || undefined,
                                    style: { textAlign: "center" },
                                  }}
                                  sx={{ width: 110, backgroundColor: "#fff" }}
                                />
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
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
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
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
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
                                <FormControl size="small" sx={{ minWidth: 140 }}>
                                  <Select
                                    value={row.packaging_status || "not_packing"}
                                    onChange={(e) =>
                                      handleRowChange(row.id, "packaging_status", e.target.value)
                                    }
                                    sx={{
                                      height: "36px",
                                      fontSize: "0.875rem",
                                      backgroundColor: "#fff",
                                    }}
                                  >
                                    <MenuItem value="not_packing">Not Packing</MenuItem>
                                    <MenuItem value="packing">Packing In Progress</MenuItem>
                                    <MenuItem value="packing_done">Packing Done</MenuItem>
                                  </Select>
                                </FormControl>
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
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
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2 }}
                              >
                                <MDBox
                                  display="flex"
                                  gap={1}
                                  justifyContent="center"
                                  flexWrap="wrap"
                                  sx={{
                                    backgroundColor: "#f0fdfa",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid #99f6e4",
                                  }}
                                >
                                  <IoSaveOutline
                                    onClick={() => handleSavePackaging(row.id)}
                                    style={{ cursor: "pointer" }}
                                    color="#059669"
                                    size={20}
                                  />
                                  <FaRegEdit
                                    onClick={() => handleViewHistory(row.id)}
                                    style={{ cursor: "pointer" }}
                                    color="#E0E388"
                                    size={20}
                                  />
                                </MDBox>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={dateFilterMode === "all" ? 13 : 12}
                            align="center"
                            sx={{ py: 3, borderBottom: 0 }}
                          >
                            <MDTypography variant="body2" color="text">
                              No chalan found for packaging.
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
              Code: {historyDialog.sale?.chalan_code || historyDialog.sale?.chalanCode || "N/A"}
            </MDTypography>
            <MDTypography display="block" variant="button" fontWeight="medium">
              Staff / Delivery:{" "}
              {historyDialog.sale?.assignee_name || historyDialog.sale?.assigneeName || "N/A"}
            </MDTypography>
            <MDTypography variant="body2" color="text">
              Sale Date: {formatDate(historyDialog.sale?.sale_date || historyDialog.sale?.saleDate)}
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
          <MDButton
            color="dark"
            onClick={() => setHistoryDialog({ open: false, sale: null, history: [] })}
          >
            Close
          </MDButton>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default ChalanPackagingDelivery;
