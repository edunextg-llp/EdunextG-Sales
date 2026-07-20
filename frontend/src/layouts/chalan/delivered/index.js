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

function ChalanDelivered() {
  const [salesData, setSalesData] = useState([]);
  const [cancelledSalesData, setCancelledSalesData] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [updatingSaleIds, setUpdatingSaleIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);
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
          console.error("Error fetching chalan delivered sales:", error);
        }
      }
    },
    [API]
  );

  const fetchCancelledSales = useCallback(
    async ({ silent = false } = {}) => {
      try {
        const response = await fetch(`${API}/chalan/sales/cancelled`);
        if (response.ok) {
          setCancelledSalesData(await response.json());
        } else if (!silent) {
          setCancelledSalesData([]);
        }
      } catch (error) {
        if (!silent) {
          console.error("Error fetching cancelled chalan sales:", error);
        }
      }
    },
    [API]
  );

  useEffect(() => {
    fetchSales();
    fetchCancelledSales();
  }, [fetchSales, fetchCancelledSales]);

  useSalesPolling(() => {
    fetchSales({ silent: true });
    fetchCancelledSales({ silent: true });
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
    const companyName = String(row.company_name || row.companyName || "").toLowerCase();
    return (
      code.includes(search) ||
      assigneeName.includes(search) ||
      staffName.includes(search) ||
      deliveryBoyName.includes(search) ||
      companyName.includes(search)
    );
  };

  const pendingSales = salesData.filter(
    (row) => row.packaging_status === "out_for_delivery" && matchesSearch(row)
  );
  const deliveredSales = salesData.filter(
    (row) => row.packaging_status === "delivered" && matchesSearch(row)
  );
  const cancelledSales = cancelledSalesData.filter(
    (row) => row.packaging_status === "cancelled" && matchesSearch(row)
  );

  const activeList =
    activeTab === "cancelled"
      ? cancelledSales
      : activeTab === "delivered"
        ? deliveredSales
        : pendingSales;

  const totalPages = Math.max(1, Math.ceil(activeList.length / rowsPerPage));
  const paginatedList = activeList.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const cancelledAmount = cancelledSales.reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0
  );

  const handleUpdateStatus = async (row, newStatus) => {
    if (updatingSaleIds.has(row.id)) return;

    const chalanCode = row.chalan_code || row.chalanCode || "";
    if (newStatus === "out_for_delivery") {
      const confirmed = window.confirm(
        `Edit chalan ${chalanCode}? It will move back to Pending Delivery so you can Deliver or Cancel again.`
      );
      if (!confirmed) return;
    } else {
      const actionLabel = newStatus === "cancelled" ? "Cancel" : "Deliver";
      const confirmed = window.confirm(`${actionLabel} chalan ${chalanCode}?`);
      if (!confirmed) return;
    }

    setUpdatingSaleIds((prev) => new Set(prev).add(row.id));

    try {
      const payload = {
        packagingStatus: newStatus,
        deliveryBoyId: row.delivery_boy_id || null,
        vehicleNo: row.vehicle_no || null,
        deliveryDate:
          newStatus === "out_for_delivery" ||
          newStatus === "delivered" ||
          newStatus === "cancelled"
            ? row.delivery_date || getTodayLocalDate()
            : null,
        expectedStatus: row.packaging_status,
        statusDate: getTodayLocalDate(),
      };

      const response = await fetch(`${API}/chalan/sales/${row.id}/packaging`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        const updatedSale = { ...row, ...(data.sale || {}), packaging_status: newStatus };

        if (newStatus === "cancelled") {
          setSalesData((prev) => prev.filter((item) => item.id !== row.id));
          setCancelledSalesData((prev) => {
            const without = prev.filter((item) => item.id !== row.id);
            return [updatedSale, ...without];
          });
          setActiveTab("cancelled");
          fetchCancelledSales({ silent: true });
        } else if (newStatus === "out_for_delivery") {
          setCancelledSalesData((prev) => prev.filter((item) => item.id !== row.id));
          setSalesData((prev) => {
            const exists = prev.some((item) => item.id === row.id);
            if (exists) {
              return prev.map((item) => (item.id === row.id ? updatedSale : item));
            }
            return [updatedSale, ...prev];
          });
          setActiveTab("pending");
          fetchSales({ silent: true });
          fetchCancelledSales({ silent: true });
        } else {
          setSalesData((prev) =>
            prev.map((item) => (item.id === row.id ? { ...item, ...updatedSale } : item))
          );
          setActiveTab("delivered");
        }
      } else if (response.status === 409) {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "This record was updated by another user.");
        fetchSales();
        fetchCancelledSales();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update status.");
      }
    } catch (error) {
      console.error("Error updating chalan delivered status:", error);
      alert("Error updating status.");
    } finally {
      setUpdatingSaleIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const renderStatusChip = (status) => {
    if (status === "delivered") {
      return <Chip label="Delivered" color="success" variant="outlined" size="small" />;
    }
    if (status === "cancelled") {
      return <Chip label="Cancelled" color="error" variant="outlined" size="small" />;
    }
    if (status === "out_for_delivery") {
      return <Chip label="Pending Delivery" color="warning" variant="outlined" size="small" />;
    }
    return <Chip label={status || "Unknown"} color="default" variant="outlined" size="small" />;
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h5" fontWeight="medium" color="dark" mb={2}>
                  Chalan Delivered
                </MDTypography>
                <Tabs
                  value={activeTab}
                  onChange={(_, value) => setActiveTab(value)}
                  sx={{
                    minHeight: 40,
                    "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 },
                  }}
                >
                  <Tab label={`Pending Delivery (${pendingSales.length})`} value="pending" />
                  <Tab label={`Delivered (${deliveredSales.length})`} value="delivered" />
                  <Tab
                    label={`Cancelled (${cancelledSales.length})`}
                    value="cancelled"
                    sx={{ color: activeTab === "cancelled" ? "error.main" : undefined }}
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
                          backgroundColor: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          cursor: "pointer",
                        }}
                      >
                        <MDTypography variant="caption" color="text">
                          Pending Delivery
                        </MDTypography>
                        <MDTypography variant="h5" color="info" fontWeight="bold">
                          {pendingSales.length}
                        </MDTypography>
                      </MDBox>
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        onClick={() => setActiveTab("delivered")}
                        sx={{
                          backgroundColor: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          cursor: "pointer",
                        }}
                      >
                        <MDTypography variant="caption" color="text">
                          Delivered
                        </MDTypography>
                        <MDTypography variant="h5" color="success" fontWeight="bold">
                          {deliveredSales.length}
                        </MDTypography>
                      </MDBox>
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        onClick={() => setActiveTab("cancelled")}
                        sx={{
                          backgroundColor: "#fef2f2",
                          border: "1px solid #fecaca",
                          cursor: "pointer",
                        }}
                      >
                        <MDTypography variant="caption" color="text">
                          Cancelled
                        </MDTypography>
                        <MDTypography variant="h5" color="error" fontWeight="bold">
                          {cancelledSales.length}
                        </MDTypography>
                      </MDBox>
                    </MDBox>
                  </Grid>
                </Grid>

                {activeTab === "cancelled" && (
                  <MDTypography variant="h6" color="error" fontWeight="bold" mb={2}>
                    Total: {cancelledSales.length} | Amount: ₹{cancelledAmount.toFixed(2)}
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
                          Delivery Boy
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Vehicle
                        </TableCell>
                        <TableCell align="center" sx={paginatedTableHeadCellSx}>
                          Delivery Date
                        </TableCell>
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
                        paginatedList.map((row, index) => (
                          <TableRow
                            key={row.id}
                            sx={{
                              backgroundColor:
                                row.packaging_status === "delivered"
                                  ? "#f0fdf4"
                                  : row.packaging_status === "cancelled"
                                    ? "#fef2f2"
                                    : "#fff7ed",
                              "&:last-child td, &:last-child th": { border: 0 },
                            }}
                          >
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
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
                              sx={{ borderBottom: "1px solid #cbd5e1", py: 2, fontWeight: "bold" }}
                            >
                              ₹{Number(row.total_amount || 0).toFixed(2)}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {row.item_count ?? "N/A"}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {row.packed_item_count || row.item_count || "N/A"}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {row.delivery_boy_name || "N/A"}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {row.vehicle_no || "N/A"}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {formatDate(row.delivery_date || row.status_updated_at)}
                            </TableCell>
                            <TableCell align="center" sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}>
                              {renderStatusChip(row.packaging_status)}
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{ borderBottom: "1px solid #cbd5e1", py: 2 }}
                            >
                              {row.packaging_status === "out_for_delivery" ? (
                                <MDBox display="flex" gap={1} justifyContent="center" flexWrap="wrap">
                                  <MDButton
                                    color="error"
                                    variant="contained"
                                    size="small"
                                    disabled={updatingSaleIds.has(row.id)}
                                    onClick={() => handleUpdateStatus(row, "cancelled")}
                                  >
                                    Cancel
                                  </MDButton>
                                  <MDButton
                                    color="success"
                                    variant="contained"
                                    size="small"
                                    disabled={updatingSaleIds.has(row.id)}
                                    onClick={() => handleUpdateStatus(row, "delivered")}
                                  >
                                    Delivered
                                  </MDButton>
                                </MDBox>
                              ) : (
                                <FaRegEdit
                                  onClick={() => {
                                    if (!updatingSaleIds.has(row.id)) {
                                      handleUpdateStatus(row, "out_for_delivery");
                                    }
                                  }}
                                  style={{
                                    cursor: updatingSaleIds.has(row.id) ? "not-allowed" : "pointer",
                                    opacity: updatingSaleIds.has(row.id) ? 0.5 : 1,
                                  }}
                                  color="#E0E388"
                                  size={20}
                                  title="Edit"
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={12} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No chalan found.
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
    </DashboardLayout>
  );
}

export default ChalanDelivered;
