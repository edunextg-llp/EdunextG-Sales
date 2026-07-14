import { useState, useEffect, useCallback, useMemo } from "react";
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
  Tabs,
  Tab,
  InputLabel,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  enhanceDeliveryRow,
  isDeliveryRowDirty,
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
import { FaEye } from "react-icons/fa";

const getTodayLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function formatSrNo(index) {
  return String(index + 1).padStart(2, "0");
}

function ChalanDelivery() {
  const [salesData, setSalesData] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const [historyDialog, setHistoryDialog] = useState({ open: false, sale: null, history: [] });
  const [savingSaleIds, setSavingSaleIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);
  const [activeTab, setActiveTab] = useState("pending");
  const [logStartDate, setLogStartDate] = useState(getTodayLocalDate());
  const [logEndDate, setLogEndDate] = useState(getTodayLocalDate());
  const [logAssigneeFilter, setLogAssigneeFilter] = useState("");
  const API = "https://bawarchee.edunextg.co/api";

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
          setDeliveryBoys(await response.json());
        }
      } catch (error) {
        console.error("Error fetching delivery boys:", error);
      }
    };
    fetchDeliveryBoys();
  }, [API]);

  const fetchSales = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const response = await fetch(`${API}/chalan/sales/packaging`);
        if (response.ok) {
          const data = await response.json();
          setSalesData((prev) =>
            mergeSalesRows(data, prev, enhanceDeliveryRow, isDeliveryRowDirty)
          );
        } else if (!silent) {
          setSalesData([]);
        }
      } catch (error) {
        if (!silent) {
          console.error("Error fetching chalan delivery sales:", error);
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
  }, [activeTab, searchQuery, logStartDate, logEndDate, logAssigneeFilter, rowsPerPage]);

  useSalesPolling(fetchSales);

  const handleRowChange = (saleId, field, value) => {
    const newData = [...salesData];
    const index = newData.findIndex((r) => r.id === saleId);
    if (index === -1) return;
    newData[index] = { ...newData[index], [field]: value, _localDirty: true };
    setSalesData(newData);
  };

  const handleSaveDelivery = async (saleId) => {
    const row = salesData.find((r) => r.id === saleId);
    if (!row || savingSaleIds.has(saleId)) return;

    if (
      (row.packaging_status === "out_for_delivery" || row.packaging_status === "delivered") &&
      (!row.delivery_boy_id || !row.vehicle_no || !row.delivery_date)
    ) {
      alert(
        "Please assign a Delivery Boy, Vehicle No, and Delivery Date via 'Assign Details' before marking this item."
      );
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

      const response = await fetch(`${API}/chalan/sales/${row.id}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const updated = enhanceDeliveryRow(data.sale);
        if (
          updated.packaging_status !== "packing_done" &&
          updated.packaging_status !== "out_for_delivery"
        ) {
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
      console.error("Error saving chalan delivery:", error);
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
    if (status === "out_for_delivery") return "#dcfce7";
    if (status === "packing_done") return "#e0f2fe";
    return "#ffebeb";
  };

  const getTextColor = (status) => {
    if (status === "out_for_delivery") return "#166534";
    if (status === "packing_done") return "#075985";
    return "#991b1b";
  };

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

  const assigneeOptions = useMemo(() => {
    const names = new Set();
    salesData.forEach((row) => {
      const name = row.assignee_name || row.assigneeName;
      if (name) names.add(name);
    });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [salesData]);

  const filteredSales = salesData.filter((row) => {
    const status = row.original_packaging_status || row.packaging_status || "not_packing";
    if (status !== "packing_done") return false;
    return matchesSearch(row);
  });

  const filteredLogSales = salesData.filter((row) => {
    const status = row.original_packaging_status || row.packaging_status || "not_packing";
    if (status !== "out_for_delivery") return false;

    const assigneeName = row.assignee_name || row.assigneeName || "";
    if (logAssigneeFilter && assigneeName !== logAssigneeFilter) return false;

    const deliveryDate = row.delivery_date ? String(row.delivery_date).split("T")[0] : "";
    if (logStartDate && (!deliveryDate || deliveryDate < logStartDate)) return false;
    if (logEndDate && (!deliveryDate || deliveryDate > logEndDate)) return false;

    return matchesSearch(row);
  });

  const activeList = activeTab === "pending" ? filteredSales : filteredLogSales;
  const totalPages = Math.max(1, Math.ceil(activeList.length / rowsPerPage));
  const paginatedSales = activeList.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const activeRow = activeRowId ? salesData.find((r) => r.id === activeRowId) : null;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h5" fontWeight="medium" color="dark" mb={2}>
                  Chalan Delivery
                </MDTypography>
                <Tabs
                  value={activeTab}
                  onChange={(_, value) => setActiveTab(value)}
                  sx={{
                    minHeight: 40,
                    "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 },
                  }}
                >
                  <Tab label={`Pending Deliveries (${filteredSales.length})`} value="pending" />
                  <Tab
                    label={`Out for Delivery Log (${filteredLogSales.length})`}
                    value="out_for_delivery"
                  />
                </Tabs>
              </MDBox>

              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={activeTab === "pending" ? 12 : 3}>
                    <MDInput
                      type="text"
                      label="Search by Code or Staff / Delivery Name"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  {activeTab === "out_for_delivery" && (
                    <>
                      <Grid item xs={12} md={2}>
                        <MDInput
                          type="date"
                          label="From Date"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={logStartDate}
                          onChange={(e) => setLogStartDate(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <MDInput
                          type="date"
                          label="To Date"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={logEndDate}
                          onChange={(e) => setLogEndDate(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="log-assignee-filter-label">Staff / Delivery</InputLabel>
                          <Select
                            labelId="log-assignee-filter-label"
                            value={logAssigneeFilter}
                            label="Staff / Delivery"
                            onChange={(e) => setLogAssigneeFilter(e.target.value)}
                            sx={{ height: 44 }}
                          >
                            <MenuItem value="">All</MenuItem>
                            {assigneeOptions.map((name) => (
                              <MenuItem key={name} value={name}>
                                {name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                    </>
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
                          Box
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Packet
                        </TableCell>
                        {activeTab === "out_for_delivery" && (
                          <>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Delivery Boy
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Vehicle
                            </TableCell>
                          </>
                        )}
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Status
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Delivery Date
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Packing Date
                        </TableCell>
                        {activeTab === "pending" && (
                          <>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Delivery Details
                            </TableCell>
                            <TableCell align="center" sx={paginatedTableHeadCellSx}>
                              Action
                            </TableCell>
                          </>
                        )}
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
                                {row.packed_item_count || row.item_count || "N/A"}
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
                                {row.box_count ?? "N/A"}
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
                                {row.packet_count ?? "N/A"}
                              </TableCell>
                              {activeTab === "out_for_delivery" && (
                                <>
                                  <TableCell
                                    align="center"
                                    sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                                  >
                                    {row.delivery_boy_name || "N/A"}
                                  </TableCell>
                                  <TableCell
                                    align="center"
                                    sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                                  >
                                    {row.vehicle_no || "N/A"}
                                  </TableCell>
                                </>
                              )}
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
                                {activeTab === "pending" ? (
                                  <FormControl size="small" sx={{ minWidth: 160 }}>
                                    <Select
                                      value={
                                        row.packaging_status === "packing_done"
                                          ? ""
                                          : row.packaging_status
                                      }
                                      displayEmpty
                                      onChange={(e) =>
                                        handleRowChange(row.id, "packaging_status", e.target.value)
                                      }
                                      sx={{
                                        height: "36px",
                                        fontSize: "0.875rem",
                                        backgroundColor: "#fff",
                                      }}
                                    >
                                      <MenuItem value="" disabled>
                                        Select Status
                                      </MenuItem>
                                      <MenuItem value="out_for_delivery">Out for Delivery</MenuItem>
                                    </Select>
                                  </FormControl>
                                ) : (
                                  statusLabels[row.packaging_status] || row.packaging_status
                                )}
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
                                {formatDate(row.delivery_date)}
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                              >
                                {formatDate(row.packing_date)}
                              </TableCell>
                              {activeTab === "pending" && (
                                <>
                                  <TableCell
                                    align="center"
                                    sx={{ borderBottom: borderCol, py: 2, color: txColor }}
                                  >
                                    <MDButton
                                      color="info"
                                      variant="text"
                                      size="small"
                                      onClick={() => handleOpenDetails(row.id)}
                                    >
                                      {row.delivery_boy_id && row.vehicle_no && row.delivery_date
                                        ? "Edit Details"
                                        : "Assign Details"}
                                    </MDButton>
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
                                        onClick={() => handleSaveDelivery(row.id)}
                                        style={{ cursor: "pointer" }}
                                        color="#059669"
                                        size={20}
                                      />
                                      <FaEye
                                        onClick={() => handleViewHistory(row.id)}
                                        style={{ cursor: "pointer" }}
                                        color="#E0E388"
                                        size={20}
                                      />
                                    </MDBox>
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={16} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No deliveries found.
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

      <Dialog open={detailsModalOpen} onClose={handleCloseDetails} fullWidth maxWidth="xs">
        <DialogTitle>Assign Delivery Details</DialogTitle>
        <DialogContent dividers>
          <MDBox display="flex" flexDirection="column" gap={2} mt={1}>
            <FormControl size="small" fullWidth>
              <Select
                value={activeRow?.delivery_boy_id || ""}
                displayEmpty
                onChange={(e) => handleRowChange(activeRowId, "delivery_boy_id", e.target.value)}
                sx={{ height: "44px", width: "100%" }}
              >
                <MenuItem value="" disabled>
                  Select Delivery Boy
                </MenuItem>
                {deliveryBoys.map((boy) => (
                  <MenuItem key={boy.id} value={boy.id}>
                    {boy.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <MDInput
              type="text"
              label="Vehicle No"
              fullWidth
              value={activeRow?.vehicle_no || ""}
              onChange={(e) => handleRowChange(activeRowId, "vehicle_no", e.target.value)}
            />
            <MDInput
              type="date"
              label="Delivery Date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={activeRow?.delivery_date || ""}
              onChange={(e) => handleRowChange(activeRowId, "delivery_date", e.target.value)}
            />
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton onClick={handleCloseDetails} color="dark">
            Done
          </MDButton>
        </DialogActions>
      </Dialog>

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

export default ChalanDelivery;
