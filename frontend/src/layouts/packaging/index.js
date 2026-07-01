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
import { IoSaveOutline } from "react-icons/io5";
import { FaRegEdit } from "react-icons/fa";
import { CiTrash } from "react-icons/ci";

function Packaging() {
  const [dateFilterMode, setDateFilterMode] = useState("all");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [salesData, setSalesData] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [historyDialog, setHistoryDialog] = useState({ open: false, sale: null, history: [] });
  const [savingSaleIds, setSavingSaleIds] = useState(new Set());
  const recentlySavedRef = useRef(new Map());
  const API = "http://localhost:5001/api";

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

  useSalesPolling(fetchSales);

  const handleRowChange = (saleId, field, value) => {
    const newData = [...salesData];
    const index = newData.findIndex(r => r.id === saleId);
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
    const row = salesData.find(r => r.id === saleId);
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
    if (Number.isNaN(packedItemCount) || packedItemCount <= 0) {
      alert("Please enter Packing Item.");
      return;
    }
    if (originalItemCount > 0 && packedItemCount > originalItemCount) {
      alert("Packing Item cannot be more than No. of Item.");
      return;
    }
    if (Number.isNaN(boxCount) || boxCount <= 0) {
      alert("Please enter No. of Box.");
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
      };

      const response = await fetch(`${API}/staff/sales/${row.id}/packaging`, {
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
    const outletErpId = row.outlet_erp_id ? row.outlet_erp_id.toLowerCase() : "";
    const staffName = row.staff_name ? row.staff_name.toLowerCase() : "";
    const saleId = formatBpSaleId(row).toLowerCase();
    return (
      outletName.includes(search) ||
      outletErpId.includes(search) ||
      staffName.includes(search) ||
      saleId.includes(search)
    );
  });

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
                      label="Search by Outlet Name, ID, Staff Name, or Sale ID"
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
                        {dateFilterMode === "all" && (
                          <TableCell sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                            Sale Date
                          </TableCell>
                        )}
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
                          Status
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Status Date
                        </TableCell>
                        <TableCell align="center" sx={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb", py: 1.5, fontWeight: 500 }}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredSales.length > 0 ? (
                        filteredSales.map((row, index) => {
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
                                {index + 1}
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
                                  value={row.box_count || ""}
                                  onChange={(e) =>
                                    handleRowChange(row.id, "box_count", e.target.value)
                                  }
                                  size="small"
                                  inputProps={{ min: 1, style: { textAlign: "center" } }}
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
                              <TableCell align="center" sx={{ borderBottom: borderCol, py: 2 }}>
                                <MDBox display="flex" gap={1} justifyContent="center" flexWrap="wrap" sx={{ backgroundColor: "#f0fdfa", padding: "8px 12px", borderRadius: "8px", border: "1px solid #99f6e4" }}>
                                <IoSaveOutline   onClick={() => handleSavePackaging(row.id)} style={{ cursor: "pointer" }} color="#059669" size={20} />
                                <FaRegEdit   onClick={() => handleViewHistory(row.id)} style={{ cursor: "pointer" }} color="#E0E388" size={20}/>
                                {/* <CiTrash   onClick={() => handleDeleteSale(row.id)} style={{ cursor: "pointer" }} color="#FF0000" size={20}/> */}
                                </MDBox>
                              </TableCell>
                            </TableRow>
                          )
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={13} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No sales found.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
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
    </DashboardLayout>
  );
}

export default Packaging;
