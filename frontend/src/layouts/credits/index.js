import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import Footer from "examples/Footer";

function CreditsPage() {
  const [credits, setCredits] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [remarksDialog, setRemarksDialog] = useState({ open: false, mode: "edit", credit: null });
  const [remarksText, setRemarksText] = useState("");
  const [remarksDate, setRemarksDate] = useState("");
  const [remarksHistory, setRemarksHistory] = useState([]);
  const [loadingRemarks, setLoadingRemarks] = useState(false);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const API = "https://bawarchee.edunextg.co/api";

  const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const fetchCredits = async () => {
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
  };

  useEffect(() => {
    fetchCredits();
  }, []);

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

  const getCreditRowSx = (credit) => {
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

  const openEditRemarks = (credit) => {
    setRemarksText("");
    setRemarksDate(getTodayLocalDate());
    setRemarksHistory([]);
    setRemarksDialog({ open: true, mode: "edit", credit });
  };

  const openViewRemarks = async (credit) => {
    setRemarksDialog({ open: true, mode: "view", credit });
    setRemarksHistory([]);
    setLoadingRemarks(true);
    try {
      const response = await fetch(`${API}/staff/credits/${credit.id}/remarks`);
      if (response.ok) {
        const data = await response.json();
        setRemarksHistory(data);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to load remarks.");
      }
    } catch (error) {
      console.error("Error loading remarks:", error);
      alert("Error loading remarks.");
    } finally {
      setLoadingRemarks(false);
    }
  };

  const closeRemarksDialog = () => {
    setRemarksDialog({ open: false, mode: "edit", credit: null });
    setRemarksText("");
    setRemarksDate("");
    setRemarksHistory([]);
    setLoadingRemarks(false);
  };

  const handleSaveRemarks = async () => {
    if (!remarksDialog.credit) return;
    if (!remarksDate) {
      alert("Please choose remarks date.");
      return;
    }
    if (!remarksText.trim()) {
      alert("Please enter remarks.");
      return;
    }

    setSavingRemarks(true);
    try {
      const response = await fetch(
        `${API}/staff/credits/${remarksDialog.credit.id}/remarks`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remarks: remarksText, remarkDate: remarksDate }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const savedRemark = data.remark;
        setCredits((prev) =>
          prev.map((credit) =>
            credit.id === remarksDialog.credit.id
              ? {
                  ...credit,
                  remarks: savedRemark?.remarks || remarksText.trim(),
                  remarks_count: (Number(credit.remarks_count) || 0) + 1,
                  latest_remark_date: savedRemark?.remark_date || remarksDate,
                }
              : credit
          )
        );
        closeRemarksDialog();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to save remarks.");
      }
    } catch (error) {
      console.error("Error saving remarks:", error);
      alert("Error saving remarks.");
    } finally {
      setSavingRemarks(false);
    }
  };

  const filteredCredits = credits.filter((credit) => {
    const search = searchQuery.toLowerCase();
    const outletName = credit.outlet_name ? credit.outlet_name.toLowerCase() : "";
    const contactNumber = credit.contact_number ? credit.contact_number.toLowerCase() : "";
    const invoiceNum = credit.invoice_number ? credit.invoice_number.toLowerCase() : "";
    const staffName = credit.staff_name ? credit.staff_name.toLowerCase() : "";
    const remarks = credit.remarks ? credit.remarks.toLowerCase() : "";
    return (
      outletName.includes(search) ||
      contactNumber.includes(search) ||
      invoiceNum.includes(search) ||
      staffName.includes(search) ||
      remarks.includes(search)
    );
  });

  const totalCreditDuesAmount = filteredCredits.reduce(
    (total, credit) => total + (Number(credit.balance_amount) || 0),
    0
  );

  return (
    <DashboardLayout>
      <MDBox pt={6} pb={3}>
        <Grid container spacing={6}>
          <Grid item xs={12}>
            <Card>
              <MDBox
                mx={2}
                mt={-3}
                py={3}
                px={2}
                variant="gradient"
                bgColor="info"
                borderRadius="lg"
                coloredShadow="info"
              >
                <MDTypography variant="h6" color="white">
                  Pending Credits Tracker
                </MDTypography>
              </MDBox>

              <MDBox px={3} pt={3} pb={1}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={5} lg={4}>
                    <MDInput
                      type="text"
                      label="Search Outlet, Contact, Invoice, or Staff..."
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={7} lg={8}>
                    <MDBox display="flex" justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        sx={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}
                      >
                        <MDTypography variant="caption" color="text">
                          Total Credit Dues Amount
                        </MDTypography>
                        <MDTypography variant="h5" color="error" fontWeight="bold">
                          ₹{totalCreditDuesAmount.toFixed(2)}
                        </MDTypography>
                      </MDBox>
                    </MDBox>
                  </Grid>
                </Grid>
              </MDBox>

              <MDBox pb={4} px={3}>
                <TableContainer
                  component={Paper}
                  sx={{ boxShadow: "none", backgroundColor: "transparent" }}
                >
                  <Table size="small">
                    <TableHead sx={{ display: "table-header-group" }}>
                      <TableRow>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Sr No
                        </TableCell>
                        <TableCell align="left" sx={{ fontWeight: "bold" }}>
                          Outlet Name
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Contact No
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Invoice No
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Staff
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Outstanding Balance
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Issue Date
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Due Date
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Status
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredCredits.map((credit, index) => (
                        <TableRow key={credit.id} sx={getCreditRowSx(credit)}>
                          <TableCell align="center">{index + 1}</TableCell>
                          <TableCell align="left">{credit.outlet_name}</TableCell>
                          <TableCell align="center">{credit.contact_number || "N/A"}</TableCell>
                          <TableCell align="center">{credit.invoice_number}</TableCell>
                          <TableCell align="center">{credit.staff_name}</TableCell>
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
                          <TableCell align="center">
                            <MDBox display="flex" gap={0.5} justifyContent="center" alignItems="center">
                              <MDButton
                                color="info"
                                variant="outlined"
                                size="small"
                                onClick={() => openEditRemarks(credit)}
                              >
                                Remarks
                              </MDButton>
                              <Tooltip title={(Number(credit.remarks_count) || 0) > 0 ? "View remarks" : "No remarks yet"}>
                                <span>
                                  <IconButton
                                    size="small"
                                    color={(Number(credit.remarks_count) || 0) > 0 ? "info" : "default"}
                                    disabled={(Number(credit.remarks_count) || 0) === 0}
                                    onClick={() => openViewRemarks(credit)}
                                  >
                                    <Icon fontSize="small">visibility</Icon>
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </MDBox>
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
                </TableContainer>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />

      <Dialog
        open={remarksDialog.open}
        onClose={closeRemarksDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {remarksDialog.mode === "view" ? "View Remarks" : "Add Remarks"}
        </DialogTitle>
        <DialogContent dividers>
          {remarksDialog.credit && (
            <MDBox mb={2}>
              <MDTypography variant="button" fontWeight="medium">
                {remarksDialog.credit.outlet_name} — {remarksDialog.credit.invoice_number}
              </MDTypography>
            </MDBox>
          )}
          {remarksDialog.mode === "view" ? (
            loadingRemarks ? (
              <MDTypography variant="body2" color="text">
                Loading remarks...
              </MDTypography>
            ) : remarksHistory.length > 0 ? (
              <Table size="small">
                <TableHead sx={{ display: "table-header-group" }}>
                  <TableRow>
                    <TableCell align="center" sx={{ fontWeight: "bold", width: 120 }}>
                      Date
                    </TableCell>
                    <TableCell align="left" sx={{ fontWeight: "bold" }}>
                      Remarks
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {remarksHistory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell align="center">{formatDate(item.remark_date)}</TableCell>
                      <TableCell align="left" sx={{ whiteSpace: "pre-wrap" }}>
                        {item.remarks}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <MDTypography variant="body2" color="text">
                No remarks added.
              </MDTypography>
            )
          ) : (
            <MDBox>
              <MDBox mb={2}>
                <MDInput
                  type="date"
                  label="Remarks Date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={remarksDate}
                  onChange={(e) => setRemarksDate(e.target.value)}
                />
              </MDBox>
              <MDInput
                type="text"
                label="Remarks"
                fullWidth
                multiline
                rows={4}
                value={remarksText}
                onChange={(e) => setRemarksText(e.target.value)}
                placeholder="Enter follow-up notes, payment promise, etc."
              />
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" onClick={closeRemarksDialog}>
            {remarksDialog.mode === "view" ? "Close" : "Cancel"}
          </MDButton>
          {remarksDialog.mode === "edit" && (
            <MDButton
              color="info"
              variant="gradient"
              onClick={handleSaveRemarks}
              disabled={savingRemarks}
            >
              {savingRemarks ? "Saving..." : "Save"}
            </MDButton>
          )}
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default CreditsPage;
