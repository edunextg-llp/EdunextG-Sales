import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";

function OutBillPage() {
  const [credits, setCredits] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedCreditIds, setSelectedCreditIds] = useState([]);
  const [selectedTakenBillIds, setSelectedTakenBillIds] = useState([]);
  const [returningBills, setReturningBills] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);

  // Tab State: 'pending' or 'taken'
  const [activeTab, setActiveTab] = useState("pending");

  // Take Bill Dialog State
  const [isTakeDialogOpen, setIsTakeDialogOpen] = useState(false);
  const [takeCollectorType, setTakeCollectorType] = useState("company_staff");
  const [takeStaffId, setTakeStaffId] = useState("");
  const [takeDeliveryBoyId, setTakeDeliveryBoyId] = useState("");
  const [takeDate, setTakeDate] = useState("");
  const [submittingTake, setSubmittingTake] = useState(false);
  const [companyStaffList, setCompanyStaffList] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);

  // Taken Bills Report State
  const [takenBills, setTakenBills] = useState([]);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportStaffId, setReportStaffId] = useState("");
  const [reportPage, setReportPage] = useState(1);
  const [reportRowsPerPage, setReportRowsPerPage] = useState(ROWS_PER_PAGE);

  const API = "https://bawarchee.edunextg.co/api";

  const isCreditTaken = (credit) => Number(credit?.is_taken) === 1;

  const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getFirstDayOfCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}-01`;
  };

  useEffect(() => {
    setTakeDate(getTodayLocalDate());
    setReportStartDate(getFirstDayOfCurrentMonth());
    setReportEndDate(getTodayLocalDate());
  }, []);

  const fetchCredits = useCallback(async () => {
    try {
      const response = await fetch(`${API}/staff/credits/pending`);
      if (response.ok) {
        const data = await response.json();
        setCredits(data);
      } else {
        console.error("Failed to fetch pending credits");
      }
    } catch (error) {
      console.error("Error fetching credits:", error);
    }
  }, [API]);

  const fetchTakenBills = useCallback(async () => {
    if (!reportStartDate || !reportEndDate) return;
    try {
      let url = `${API}/staff/credits/taken?startDate=${reportStartDate}&endDate=${reportEndDate}`;
      if (reportStaffId) {
        url += `&staffId=${reportStaffId}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setTakenBills(data);
      } else {
        console.error("Failed to fetch taken bills");
      }
    } catch (error) {
      console.error("Error fetching taken bills:", error);
    }
  }, [API, reportStartDate, reportEndDate, reportStaffId]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  useEffect(() => {
    const fetchCollectorOptions = async () => {
      try {
        const [staffResponse, deliveryBoyResponse] = await Promise.all([
          fetch(`${API}/staff`),
          fetch(`${API}/delivery-boy`),
        ]);
        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          setCompanyStaffList(staffData);
        }
        if (deliveryBoyResponse.ok) {
          const deliveryBoyData = await deliveryBoyResponse.json();
          setDeliveryBoys(deliveryBoyData);
        }
      } catch (error) {
        console.error("Error fetching collector options:", error);
      }
    };
    fetchCollectorOptions();
  }, [API]);

  useEffect(() => {
    fetchTakenBills();
  }, [fetchTakenBills]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, selectedStaffId, rowsPerPage]);

  useEffect(() => {
    setReportPage(1);
    setSelectedTakenBillIds([]);
  }, [reportStaffId, reportStartDate, reportEndDate, reportRowsPerPage]);

  useEffect(() => {
    setSelectedCreditIds((prev) =>
      prev.filter((id) => {
        const credit = credits.find((c) => c.id === id);
        return credit && !isCreditTaken(credit);
      })
    );
  }, [credits]);

  const getStatus = (saleDateStr, creditDays) => {
    if (!creditDays) return <Chip label="No Term" size="small" variant="outlined" />;

    const saleDate = new Date(saleDateStr);
    const msInDay = 24 * 60 * 60 * 1000;
    const dueDate = new Date(saleDate.getTime() + creditDays * msInDay);
    const now = new Date();

    now.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((dueDate - now) / msInDay);

    if (diffDays < 0) {
      return <Chip label={`Overdue by ${Math.abs(diffDays)} days`} color="error" size="small" />;
    } else if (diffDays === 0) {
      return <Chip label="Due Today" color="warning" size="small" />;
    } else {
      return <Chip label={`Due in ${diffDays} days`} color="success" size="small" />;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB");
  };

  const calcDueDate = (dateStr, days) => {
    if (!days) return "N/A";
    const date = new Date(dateStr);
    date.setDate(date.getDate() + parseInt(days, 10));
    return date.toLocaleDateString("en-GB");
  };

  const formatTakerName = (bill) => {
    const name = bill.staff_name || "N/A";
    const typeLabel = bill.collector_type === "bawarchee_staff" ? "db" : "staff";
    return `${name} (${typeLabel})`;
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const handlePrintPdf = () => {
    const staffLabel = reportStaffId
      ? staffOptions.find((s) => s.id === Number(reportStaffId))?.name || "Selected Staff"
      : "All Staff";
    const generatedOn = new Date().toLocaleString("en-GB");
    const rowsHtml = takenBills
      .map(
        (bill, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(bill.outlet_name || "N/A")}</td>
            <td>${escapeHtml(bill.location_name || "N/A")}</td>
            <td>${escapeHtml(bill.outlet_erp_id || "N/A")}</td>
            <td>${escapeHtml(bill.contact_number || "N/A")}</td>
            <td>${escapeHtml(bill.sticker_number || "N/A")}</td>
            <td>${escapeHtml(bill.invoice_number || "N/A")}</td>
            <td>${escapeHtml(bill.company_name || "N/A")}</td>
            <td>${escapeHtml(formatTakerName(bill))}</td>
            <td class="right">Rs. ${Number(bill.balance_amount || 0).toFixed(2)}</td>
            <td>${escapeHtml(formatDate(bill.sale_date))}</td>
            <td>${escapeHtml(calcDueDate(bill.sale_date, bill.credit_days))}</td>
            <td>${escapeHtml(formatDate(bill.taken_date))}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Taken Bills Report</title>
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
          <h1>Taken Bills Report</h1>
          <div class="meta">
            <div><strong>Taker Staff:</strong> ${escapeHtml(staffLabel)}</div>
            <div><strong>Period:</strong> ${escapeHtml(formatDate(reportStartDate))} to ${escapeHtml(formatDate(reportEndDate))}</div>
            <div><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
            <div><strong>Total Balance:</strong> Rs. ${totalTakenAmount.toFixed(2)}</div>
          </div>
          ${takenBills.length > 0
        ? ` <table>
        <thead>
          <tr>
            <th>Sr No</th>
            <th>Outlet Name</th>
            <th>Area</th>
            <th>ERP ID</th>
            <th>Contact No</th>
            <th>Sale ID</th>
            <th>Invoice No</th>
            <th>Company</th>
            <th>Staff (Taker)</th>
            <th class="right">Outstanding Balance</th>
            <th>Issue Date</th>
            <th>Due Date</th>
            <th>Taken Date</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>`
        : `<div class="empty">No taken bills found for this filter.</div>`
      }
          <div class="total">Total Balance: Rs. ${totalTakenAmount.toFixed(2)}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const selectableCredits = (creditsList) => creditsList.filter((credit) => !isCreditTaken(credit));

  const staffOptions = React.useMemo(() => {
    const staff = new Map();
    credits.forEach((credit) => {
      if (!credit.staff_id) return;
      if (!staff.has(credit.staff_id)) {
        staff.set(credit.staff_id, credit.staff_name || `Staff ${credit.staff_id}`);
      }
    });

    return [...staff.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [credits]);

  const filteredCredits = credits.filter((credit) => {
    const saleBalance = Number(credit.sale_balance_amount ?? credit.saleBalanceAmount);
    if (!Number.isNaN(saleBalance) && saleBalance <= 0) {
      return false;
    }

    if (selectedStaffId && Number(credit.staff_id) !== Number(selectedStaffId)) {
      return false;
    }

    const search = searchQuery.toLowerCase();
    const outletName = credit.outlet_name ? credit.outlet_name.toLowerCase() : "";
    const outletArea = credit.location_name ? credit.location_name.toLowerCase() : "";
    const contactNumber = credit.contact_number ? credit.contact_number.toLowerCase() : "";
    const invoiceNum = credit.invoice_number ? credit.invoice_number.toLowerCase() : "";
    const staffName = credit.staff_name ? credit.staff_name.toLowerCase() : "";
    const companyName = credit.company_name ? credit.company_name.toLowerCase() : "";
    const remarks = credit.remarks ? credit.remarks.toLowerCase() : "";
    const stickerNum = credit.sticker_number ? credit.sticker_number.toLowerCase() : "";
    return (
      outletName.includes(search) ||
      outletArea.includes(search) ||
      contactNumber.includes(search) ||
      invoiceNum.includes(search) ||
      staffName.includes(search) ||
      companyName.includes(search) ||
      remarks.includes(search) ||
      stickerNum.includes(search)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredCredits.length / rowsPerPage));
  const paginatedCredits = filteredCredits.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const selectablePaginatedCredits = selectableCredits(paginatedCredits);
  const isAllSelected =
    selectablePaginatedCredits.length > 0 &&
    selectablePaginatedCredits.every((c) => selectedCreditIds.includes(c.id));
  const isSomeSelected =
    selectablePaginatedCredits.length > 0 &&
    selectablePaginatedCredits.some((c) => selectedCreditIds.includes(c.id)) &&
    !isAllSelected;

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      const pageIds = selectablePaginatedCredits.map((c) => c.id);
      setSelectedCreditIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      const pageIds = selectablePaginatedCredits.map((c) => c.id);
      setSelectedCreditIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  const handleCheckboxToggle = (credit) => {
    if (isCreditTaken(credit)) return;
    setSelectedCreditIds((prev) =>
      prev.includes(credit.id)
        ? prev.filter((id) => id !== credit.id)
        : [...prev, credit.id]
    );
  };

  const getCreditRowSx = (credit) => {
    if (isCreditTaken(credit)) {
      return {
        backgroundColor: "#f1f5f9",
        opacity: 0.55,
        filter: "blur(0.4px)",
        transform: "scale(0.98)",
        transformOrigin: "center",
        "& td": { fontSize: "0.8rem", color: "text.disabled" },
        "&:hover": { backgroundColor: "#f1f5f9" },
      };
    }
    if (selectedCreditIds.includes(credit.id)) {
      return {
        backgroundColor: "#e0f2fe",
        "&:hover": { backgroundColor: "#bae6fd" },
      };
    }
    if ((Number(credit.remarks_count) || 0) > 0 || credit.remarks?.trim()) {
      return {
        backgroundColor: "#dcfce7",
        "&:hover": { backgroundColor: "#bbf7d0" },
      };
    }

    return {
      backgroundColor: "#fff",
      "&:hover": { backgroundColor: "#f8fafc" },
    };
  };

  const handleOpenTakeDialog = () => {
    if (selectedCreditIds.length === 0) return;
    const firstSelected = credits.find((c) => selectedCreditIds.includes(c.id));
    setTakeCollectorType("company_staff");
    if (firstSelected && firstSelected.staff_id) {
      setTakeStaffId(String(firstSelected.staff_id));
    } else {
      setTakeStaffId("");
    }
    setTakeDeliveryBoyId("");
    setTakeDate(getTodayLocalDate());
    setIsTakeDialogOpen(true);
  };

  const handleCloseTakeDialog = () => {
    setIsTakeDialogOpen(false);
    setTakeCollectorType("company_staff");
    setTakeStaffId("");
    setTakeDeliveryBoyId("");
    setTakeDate(getTodayLocalDate());
  };

  const handleTakeCollectorTypeChange = (value) => {
    setTakeCollectorType(value);
    setTakeStaffId("");
    setTakeDeliveryBoyId("");
  };

  const handleSubmitTakeBill = async () => {
    const billsToTake = selectedCreditIds.filter((id) => {
      const credit = credits.find((c) => c.id === id);
      return credit && !isCreditTaken(credit);
    });

    if (billsToTake.length === 0) {
      alert("Please select bills that are not already taken.");
      return;
    }

    if (takeCollectorType === "company_staff" && !takeStaffId) {
      alert("Please select a company staff member.");
      return;
    }
    if (takeCollectorType === "bawarchee_staff" && !takeDeliveryBoyId) {
      alert("Please select a delivery boy.");
      return;
    }
    if (!takeDate) {
      alert("Please choose taken date.");
      return;
    }

    setSubmittingTake(true);
    try {
      const response = await fetch(`${API}/staff/credits/take`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIds: billsToTake,
          collectorType: takeCollectorType,
          staffId: takeCollectorType === "company_staff" ? takeStaffId : null,
          deliveryBoyId: takeCollectorType === "bawarchee_staff" ? takeDeliveryBoyId : null,
          takenDate: takeDate,
        }),
      });

      if (response.ok) {
        setSelectedCreditIds([]);
        await fetchCredits();
        await fetchTakenBills();
        handleCloseTakeDialog();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || "Failed to record taken bills.");
      }
    } catch (error) {
      console.error("Error submitting take bill:", error);
      alert("Error submitting take bill.");
    } finally {
      setSubmittingTake(false);
    }
  };

  // Taken Bills Pagination & Filtered Totals
  const reportTotalPages = Math.max(1, Math.ceil(takenBills.length / reportRowsPerPage));
  const paginatedTakenBills = takenBills.slice(
    (reportPage - 1) * reportRowsPerPage,
    reportPage * reportRowsPerPage
  );

  const handleTakenBillCheckboxToggle = (takenBillId) => {
    setSelectedTakenBillIds((prev) =>
      prev.includes(takenBillId)
        ? prev.filter((id) => id !== takenBillId)
        : [...prev, takenBillId]
    );
  };

  const isAllTakenSelected =
    paginatedTakenBills.length > 0 &&
    paginatedTakenBills.every((bill) => selectedTakenBillIds.includes(bill.id));
  const isSomeTakenSelected =
    paginatedTakenBills.length > 0 &&
    paginatedTakenBills.some((bill) => selectedTakenBillIds.includes(bill.id)) &&
    !isAllTakenSelected;

  const handleSelectAllTakenToggle = () => {
    if (isAllTakenSelected) {
      const pageIds = paginatedTakenBills.map((bill) => bill.id);
      setSelectedTakenBillIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      const pageIds = paginatedTakenBills.map((bill) => bill.id);
      setSelectedTakenBillIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  const handleReturnTakenBills = async () => {
    if (selectedTakenBillIds.length === 0) return;

    setReturningBills(true);
    try {
      const response = await fetch(`${API}/staff/credits/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takenBillIds: selectedTakenBillIds }),
      });

      if (response.ok) {
        setSelectedTakenBillIds([]);
        await fetchCredits();
        await fetchTakenBills();
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || "Failed to return bills.");
      }
    } catch (error) {
      console.error("Error returning bills:", error);
      alert("Error returning bills.");
    } finally {
      setReturningBills(false);
    }
  };

  const totalTakenAmount = takenBills.reduce(
    (sum, b) => sum + (Number(b.balance_amount) || 0),
    0
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
            <Card>
              {/* Header with Title and Tabs */}
              <MDBox p={3} pb={2} display="flex" flexDirection={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} gap={2}>
                <MDBox>
                  <MDTypography variant="h5" fontWeight="medium" color="dark" mb={1}>
                    Pending Credits Tracker
                  </MDTypography>
                  <Tabs
                    value={activeTab}
                    onChange={(_, value) => {
                      setActiveTab(value);
                      setSelectedCreditIds([]);
                      setSelectedTakenBillIds([]);
                    }}
                    sx={{
                      minHeight: 40,
                      "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 },
                    }}
                  >
                    <Tab label="Pending Credits" value="pending" />
                    <Tab label={`Taken Bills Report (${takenBills.length})`} value="taken" />
                  </Tabs>
                </MDBox>

                {/* Take Bill button visible on Header when pending items are selected */}
                {activeTab === "pending" && selectedCreditIds.length > 0 && (
                  <MDButton
                    color="info"
                    variant="gradient"
                    size="medium"
                    onClick={handleOpenTakeDialog}
                  >
                    Take Bill ({selectedCreditIds.length})
                  </MDButton>
                )}
                {activeTab === "taken" && selectedTakenBillIds.length > 0 && (
                  <MDButton
                    color="warning"
                    variant="gradient"
                    size="medium"
                    onClick={handleReturnTakenBills}
                    disabled={returningBills}
                  >
                    {returningBills ? "Returning..." : `Return Bill (${selectedTakenBillIds.length})`}
                  </MDButton>
                )}
              </MDBox>

              {/* Filters and Summary Row */}
              <MDBox pb={3} px={3}>
                <Grid container spacing={3} mb={3}>
                  {activeTab === "pending" ? (
                    <>

                      <Grid item xs={5} md={3}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="credit-staff-filter-label">Staff</InputLabel>
                          <Select
                            labelId="credit-staff-filter-label"
                            value={selectedStaffId}
                            label="Staff"
                            onChange={(e) => setSelectedStaffId(e.target.value)}
                            sx={{ height: 44 }}
                          >
                            <MenuItem value="">All Staff</MenuItem>
                            {staffOptions.map((staff) => (
                              <MenuItem key={staff.id} value={staff.id}>
                                {staff.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={4} md={3}>
                        <MDInput
                          type="text"
                          label="Search Outlet, Contact, Invoice, Staff, or Sale ID..."
                          fullWidth
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </Grid>
                    </>
                  ) : (
                    <>
                      <Grid item xs={12} md={3}>
                        <MDInput
                          type="date"
                          label="From Date"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={reportStartDate}
                          onChange={(e) => setReportStartDate(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <MDInput
                          type="date"
                          label="To Date"
                          fullWidth
                          InputLabelProps={{ shrink: true }}
                          value={reportEndDate}
                          onChange={(e) => setReportEndDate(e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="report-staff-filter-label">Staff (Taker)</InputLabel>
                          <Select
                            labelId="report-staff-filter-label"
                            value={reportStaffId}
                            label="Staff (Taker)"
                            onChange={(e) => setReportStaffId(e.target.value)}
                            sx={{ height: 44 }}
                          >
                            <MenuItem value="">All Staff</MenuItem>
                            {staffOptions.map((staff) => (
                              <MenuItem key={staff.id} value={staff.id}>
                                {staff.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} md={3} display="flex" alignItems="center">
                        <MDButton
                          color="info"
                          variant="gradient"
                          fullWidth
                          onClick={handlePrintPdf}
                          disabled={takenBills.length === 0}
                          sx={{ height: 44 }}
                        >
                          Print PDF
                        </MDButton>
                      </Grid>
                    </>
                  )}

                  {/* Summary Cards aligned to the right */}
                  <Grid item xs={12}>
                    <MDBox display="flex" gap={2} justifyContent="flex-end" flexWrap="wrap">
                      {/* <MDBox
                        px={2.5}
                        py={1.25}
                        borderRadius="lg"
                        sx={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}
                      >
                        <MDTypography variant="caption" color="text">
                          Total Pending Outstanding
                        </MDTypography>
                        <MDTypography variant="h5" color="info" fontWeight="bold">
                          ₹{totalPendingAmount.toFixed(2)}
                        </MDTypography>
                      </MDBox> */}
                      {/* <MDBox
                        px={2.5}
                        py={1.25}
                        borderRadius="lg"
                        sx={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}
                      >
                        <MDTypography variant="caption" color="text">
                          Total Taken Bills
                        </MDTypography>
                        <MDTypography variant="h5" color="success" fontWeight="bold">
                          ₹{totalTakenAmount.toFixed(2)}
                        </MDTypography>
                      </MDBox> */}
                    </MDBox>
                  </Grid>
                </Grid>

                {/* Table rendering based on Active Tab */}
                {activeTab === "pending" ? (
                  <TableContainer
                    component={Paper}
                    sx={{ ...paginatedTableContainerSx, backgroundColor: "transparent" }}
                  >
                    <Table stickyHeader size="small">
                      <TableHead sx={paginatedTableHeadSx()}>
                        <TableRow>
                          <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                            <Checkbox
                              checked={isAllSelected}
                              indeterminate={isSomeSelected}
                              onChange={handleSelectAllToggle}
                            />
                          </TableCell>
                          <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                            Sr No
                          </TableCell>
                          <TableCell align="left" sx={paginatedTableHeadCellSx}>Outlet Name</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Area</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>ERP ID</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Contact No</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Sale ID</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Invoice No</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Staff</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Company</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Outstanding Balance</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Issue Date</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Due Date</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedCredits.map((credit, index) => (
                          <TableRow key={credit.id} sx={getCreditRowSx(credit)}>
                            <TableCell align="center">
                              <Checkbox
                                checked={selectedCreditIds.includes(credit.id)}
                                disabled={isCreditTaken(credit)}
                                onChange={() => handleCheckboxToggle(credit)}
                              />
                            </TableCell>
                            <TableCell align="center">{(page - 1) * rowsPerPage + index + 1}</TableCell>
                            <TableCell align="left">
                              {credit.outlet_name}
                              {isCreditTaken(credit) && (
                                <Chip
                                  label={`Taken${credit.taker_name ? ` by ${credit.taker_name}` : ""}`}
                                  size="small"
                                  color="default"
                                  sx={{ ml: 1, height: 20, fontSize: "0.7rem" }}
                                />
                              )}
                            </TableCell>
                            <TableCell align="center">{credit.location_name || "N/A"}</TableCell>
                            <TableCell align="center">{credit.outlet_erp_id || "N/A"}</TableCell>
                            <TableCell align="center">{credit.contact_number || "N/A"}</TableCell>
                            <TableCell align="center">{credit.sticker_number}</TableCell>
                            <TableCell align="center">{credit.invoice_number}</TableCell>
                            <TableCell align="center">{credit.staff_name}</TableCell>
                            <TableCell align="center">{credit.company_name || "N/A"}</TableCell>
                            <TableCell
                              align="center"
                              sx={{ color: "error.main", fontWeight: "bold" }}
                            >
                              ₹{Number(credit.balance_amount).toFixed(2)}
                            </TableCell>
                            <TableCell align="center">{formatDate(credit.sale_date)}</TableCell>
                            <TableCell align="center">
                              {calcDueDate(credit.sale_date, credit.credit_days)}
                            </TableCell>
                            <TableCell align="center">
                              {getStatus(credit.sale_date, credit.credit_days)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filteredCredits.length === 0 && (
                      <MDBox mt={4} textAlign="center">
                        <MDTypography variant="body2" color="text">
                          No outstanding credits found in the system!
                        </MDTypography>
                      </MDBox>
                    )}
                    <TablePaginationFooter
                      page={page}
                      totalPages={totalPages}
                      total={filteredCredits.length}
                      onPageChange={setPage}
                      limit={rowsPerPage}
                      onLimitChange={setRowsPerPage}
                    />
                  </TableContainer>
                ) : (
                  <TableContainer
                    component={Paper}
                    sx={{ ...paginatedTableContainerSx, backgroundColor: "transparent" }}
                  >
                    <Table stickyHeader size="small">
                      <TableHead sx={paginatedTableHeadSx()}>
                        <TableRow>
                          <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                            <Checkbox
                              checked={isAllTakenSelected}
                              indeterminate={isSomeTakenSelected}
                              onChange={handleSelectAllTakenToggle}
                            />
                          </TableCell>
                          <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                            Sr No
                          </TableCell>
                          <TableCell align="left" sx={paginatedTableHeadCellSx}>Outlet Name</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Area</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>ERP ID</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Contact No</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Sale ID</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Invoice No</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Staff (Taker)</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Company</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Outstanding Balance</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Issue Date</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Due Date</TableCell>
                          <TableCell align="center" sx={paginatedTableHeadCellSx}>Taken Date</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedTakenBills.map((bill, index) => (
                          <TableRow key={bill.id}>
                            <TableCell align="center">
                              <Checkbox
                                checked={selectedTakenBillIds.includes(bill.id)}
                                onChange={() => handleTakenBillCheckboxToggle(bill.id)}
                              />
                            </TableCell>
                            <TableCell align="center">{(reportPage - 1) * reportRowsPerPage + index + 1}</TableCell>
                            <TableCell align="left">{bill.outlet_name}</TableCell>
                            <TableCell align="center">{bill.location_name || "N/A"}</TableCell>
                            <TableCell align="center">{bill.outlet_erp_id || "N/A"}</TableCell>
                            <TableCell align="center">{bill.contact_number || "N/A"}</TableCell>
                            <TableCell align="center">{bill.sticker_number}</TableCell>
                            <TableCell align="center">{bill.invoice_number}</TableCell>
                            <TableCell align="center">{formatTakerName(bill)}</TableCell>
                            <TableCell align="center">{bill.company_name || "N/A"}</TableCell>
                            <TableCell
                              align="center"
                              sx={{ color: "error.main", fontWeight: "bold" }}
                            >
                              ₹{Number(bill.balance_amount).toFixed(2)}
                            </TableCell>
                            <TableCell align="center">{formatDate(bill.sale_date)}</TableCell>
                            <TableCell align="center">
                              {calcDueDate(bill.sale_date, bill.credit_days)}
                            </TableCell>
                            <TableCell align="center">
                              {formatDate(bill.taken_date)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {takenBills.length === 0 && (
                      <MDBox mt={4} textAlign="center">
                        <MDTypography variant="body2" color="text">
                          No taken bills recorded in this period!
                        </MDTypography>
                      </MDBox>
                    )}
                    <TablePaginationFooter
                      page={reportPage}
                      totalPages={reportTotalPages}
                      total={takenBills.length}
                      onPageChange={setReportPage}
                      limit={reportRowsPerPage}
                      onLimitChange={setReportRowsPerPage}
                    />
                  </TableContainer>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />

      {/* Take Bill Dialog */}
      <Dialog
        open={isTakeDialogOpen}
        onClose={handleCloseTakeDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Take Bill</DialogTitle>
        <DialogContent dividers>
          <MDBox display="flex" flexDirection="column" gap={2}>
            <MDTypography variant="body2" color="text">
              Assign {selectedCreditIds.length} selected bills to the following collector:
            </MDTypography>
            <FormControl fullWidth>
              <InputLabel id="dialog-collector-type-label">Collector Type</InputLabel>
              <Select
                labelId="dialog-collector-type-label"
                value={takeCollectorType}
                label="Collector Type"
                onChange={(e) => handleTakeCollectorTypeChange(e.target.value)}
                sx={{ height: 44 }}
              >
                <MenuItem value="company_staff">Company Staff</MenuItem>
                <MenuItem value="bawarchee_staff">Delivery Boy</MenuItem>
              </Select>
            </FormControl>
            {takeCollectorType === "company_staff" ? (
              <FormControl fullWidth>
                <InputLabel id="dialog-staff-select-label">Company Staff</InputLabel>
                <Select
                  labelId="dialog-staff-select-label"
                  value={takeStaffId}
                  label="Company Staff"
                  onChange={(e) => setTakeStaffId(e.target.value)}
                  sx={{ height: 44 }}
                >
                  <MenuItem value="">Select Staff</MenuItem>
                  {companyStaffList.map((staff) => (
                    <MenuItem key={staff.id} value={String(staff.id)}>
                      {staff.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <FormControl fullWidth>
                <InputLabel id="dialog-delivery-boy-select-label">Delivery Boy</InputLabel>
                <Select
                  labelId="dialog-delivery-boy-select-label"
                  value={takeDeliveryBoyId}
                  label="Delivery Boy"
                  onChange={(e) => setTakeDeliveryBoyId(e.target.value)}
                  sx={{ height: 44 }}
                >
                  <MenuItem value="">Select Delivery Boy</MenuItem>
                  {deliveryBoys.map((boy) => (
                    <MenuItem key={boy.id} value={String(boy.id)}>
                      {boy.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <MDInput
              type="date"
              label="Taken Date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={takeDate}
              onChange={(e) => setTakeDate(e.target.value)}
            />
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" onClick={handleCloseTakeDialog} disabled={submittingTake}>
            Cancel
          </MDButton>
          <MDButton
            color="info"
            variant="gradient"
            onClick={handleSubmitTakeBill}
            disabled={submittingTake}
          >
            {submittingTake ? "Submitting..." : "Take"}
          </MDButton>
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default OutBillPage;
