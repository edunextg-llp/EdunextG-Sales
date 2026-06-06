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
  const [savingRemarks, setSavingRemarks] = useState(false);
  const API = "https://bawarchee.edunextg.co/api";

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
    if (credit.remarks?.trim()) {
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
    setRemarksText(credit.remarks || "");
    setRemarksDialog({ open: true, mode: "edit", credit });
  };

  const openViewRemarks = (credit) => {
    setRemarksDialog({ open: true, mode: "view", credit });
  };

  const closeRemarksDialog = () => {
    setRemarksDialog({ open: false, mode: "edit", credit: null });
    setRemarksText("");
  };

  const handleSaveRemarks = async () => {
    if (!remarksDialog.credit) return;

    setSavingRemarks(true);
    try {
      const response = await fetch(
        `${API}/staff/credits/${remarksDialog.credit.id}/remarks`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remarks: remarksText }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCredits((prev) =>
          prev.map((credit) =>
            credit.id === remarksDialog.credit.id
              ? { ...credit, remarks: data.remarks }
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
                <MDInput
                  type="text"
                  label="Search Outlet, Contact, Invoice, or Staff..."
                  sx={{ width: { xs: "100%", md: "35%", lg: "25%" } }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
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
                              <Tooltip title={credit.remarks ? "View remarks" : "No remarks yet"}>
                                <span>
                                  <IconButton
                                    size="small"
                                    color={credit.remarks ? "info" : "default"}
                                    disabled={!credit.remarks}
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
            <MDTypography variant="body2" color="text" sx={{ whiteSpace: "pre-wrap" }}>
              {remarksDialog.credit?.remarks || "No remarks added."}
            </MDTypography>
          ) : (
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
