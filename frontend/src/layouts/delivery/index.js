import { useState, useEffect, useCallback } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, FormControl, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";

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
import { formatBpSaleId } from "utils/saleId";
import { ROWS_PER_PAGE, parseListResponse, TablePaginationFooter, getPageSliceMeta } from "utils/tablePagination";
import { IoSaveOutline } from "react-icons/io5";
import { FaEye } from "react-icons/fa";
// import { CiTrash } from "react-icons/ci";

function Delivery() {
  const [salesData, setSalesData] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const [historyDialog, setHistoryDialog] = useState({ open: false, sale: null, history: [] });
  const [savingSaleIds, setSavingSaleIds] = useState(new Set());
  const API = "https://bawarchee.edunextg.co/api";

  const statusLabels = {
    not_packing: "Not Packing",
    packing: "Packing In Progress",
    packing_done: "Packing Done",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

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
          const data = await response.json();
          setDeliveryBoys(data);
        }
      } catch (error) {
        console.error("Error fetching delivery boys:", error);
      }
    };
    fetchDeliveryBoys();
  }, []);

  const fetchSales = useCallback(async ({ silent = false } = {}) => {
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(ROWS_PER_PAGE),
        statusIn: "packing_done",
      });
      const normalizedSearch = String(searchQuery || "").trim();
      if (normalizedSearch) {
        params.set("search", normalizedSearch);
      }

      const response = await fetch(`${API}/staff/sales/by-date?${params.toString()}`);
      if (response.ok) {
        const payload = parseListResponse(await response.json());
        setTotalCount(payload.total);
        setTotalPages(payload.totalPages);
        setSalesData((prev) =>
          mergeSalesRows(payload.data, prev, enhanceDeliveryRow, isDeliveryRowDirty)
        );
      } else if (!silent) {
        setSalesData([]);
        setTotalCount(0);
        setTotalPages(1);
      }
    } catch (error) {
      if (!silent) {
        console.error("Error fetching global sales:", error);
      }
    }
  }, [API, currentPage, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSales();
    }, 300);

    return () => clearTimeout(timer);
  }, [fetchSales]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
        if (updated.packaging_status !== "packing_done") {
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
    if (status === 'out_for_delivery') return '#dcfce7'; // green
    if (status === 'packing_done') return '#e0f2fe'; // light blue
    return '#ffebeb';
  };

  const getTextColor = (status) => {
    if (status === 'out_for_delivery') return '#166534'; // dark green
    if (status === 'packing_done') return '#075985'; // dark blue
    return '#991b1b';
  };

  const { entriesStart } = getPageSliceMeta(currentPage, totalCount, ROWS_PER_PAGE);
  const tableRows = salesData;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center">
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Delivery Management
                </MDTypography>
              </MDBox>
              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      type="text"
                      label="Search by Outlet Name, ID, Staff Name, or Sale ID"
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                </Grid>

                <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
                  <Table sx={{ minWidth: 650 }}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell
                          align="center"
                          sx={{
                            color: "#6b7280",
                            borderBottom: "1px solid #e5e7eb",
                            py: 1.5,
                            fontWeight: 500,
                            width: 56,
                          }}
                        >
                          Sr No
                        </TableCell>
                        <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Staff Name
                        </TableCell>
                        <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Outlet Name
                        </TableCell>
                        <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          ERP ID
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Sale ID
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Invoice No
                        </TableCell>
                        <TableCell align="right" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Price
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          No. of Item
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Packing Item
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          No. of Box
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          No. of Packet
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Status
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Delivery Date
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Packing Date
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Delivery Details
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableRows.length > 0 ? (
                        tableRows.map((row, index) => {
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
                                {entriesStart + index}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.staff_name}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor, fontWeight: "medium" }}>
                                {row.outlet_name}
                              </TableCell>
                              <TableCell sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.outlet_erp_id}
                              </TableCell>
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
                                {row.packed_item_count || row.item_count || "N/A"}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.box_count || "N/A"}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {row.packet_count ?? 0}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                <FormControl size="small" sx={{ minWidth: 160 }}>
                                  <Select
                                    value={row.packaging_status === 'packing_done' ? '' : row.packaging_status}
                                    displayEmpty
                                    onChange={(e) => handleRowChange(row.id, "packaging_status", e.target.value)}
                                    sx={{ height: "36px", fontSize: "0.875rem", backgroundColor: "#fff" }}
                                  >
                                    <MenuItem value="" disabled>Select Status</MenuItem>
                                    <MenuItem value="out_for_delivery">Out for Delivery</MenuItem>
                                  </Select>
                                </FormControl>
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {formatDate(row.delivery_date)}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                {formatDate(row.packing_date)}
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2, color: txColor }}>
                                <MDButton color="info" variant="text" size="small" onClick={() => handleOpenDetails(row.id)}>
                                  {(row.delivery_boy_id && row.vehicle_no && row.delivery_date) ? "Edit Details" : "Assign Details"}
                                </MDButton>
                              </TableCell>
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2 }}>
                                <MDBox display="flex" gap={1} justifyContent="center" flexWrap="wrap" sx={{ backgroundColor: "#f0fdfa", padding: "8px 12px", borderRadius: "8px", border: "1px solid #99f6e4" }}>
                                  <IoSaveOutline   onClick={() => handleSaveDelivery(row.id)} style={{ cursor: "pointer" }} color="#059669" size={20} />
                                  <FaEye   onClick={() => handleViewHistory(row.id)} style={{ cursor: "pointer" }} color="#E0E388" size={20}/>
                                </MDBox>
                              </TableCell>
                            </TableRow>
                          )
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
                  page={currentPage}
                  totalPages={totalPages}
                  total={totalCount}
                  onPageChange={setCurrentPage}
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
                value={
                  activeRowId
                    ? salesData.find((r) => r.id === activeRowId)?.delivery_boy_id || ""
                    : ""
                }
                displayEmpty
                onChange={(e) => handleRowChange(activeRowId, "delivery_boy_id", e.target.value)}
                sx={{ height: "44px", width: "100%" }}
              >
                <MenuItem value="" disabled>Select Delivery Boy</MenuItem>
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
              value={
                activeRowId
                  ? salesData.find((r) => r.id === activeRowId)?.vehicle_no || ""
                  : ""
              }
              onChange={(e) => handleRowChange(activeRowId, "vehicle_no", e.target.value)}
            />
            <MDInput
              type="date"
              label="Delivery Date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={
                activeRowId
                  ? salesData.find((r) => r.id === activeRowId)?.delivery_date || ""
                  : ""
              }
              onChange={(e) => handleRowChange(activeRowId, "delivery_date", e.target.value)}
            />
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton onClick={handleCloseDetails} color="dark">Done</MDButton>
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
    </DashboardLayout>
  );
}

export default Delivery;
