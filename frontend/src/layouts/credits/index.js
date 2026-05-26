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
} from "@mui/material";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import Footer from "examples/Footer";

function CreditsPage() {
  const [credits, setCredits] = useState([]);
  const API = "http://localhost:5000/api";

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

    // Parse strictly disregarding timezone weirdness (UTC base approach)
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
    return date.toLocaleDateString("en-GB"); // DD/MM/YYYY
  };

  const calcDueDate = (dateStr, days) => {
    if (!days) return "N/A";
    const date = new Date(dateStr);
    date.setDate(date.getDate() + parseInt(days));
    return date.toLocaleDateString("en-GB");
  };

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

              <MDBox pt={3} pb={4} px={3}>
                <TableContainer
                  component={Paper}
                  sx={{ boxShadow: "none", backgroundColor: "transparent" }}
                >
                  <Table size="small">
                    <TableHead sx={{ display: "table-header-group" }}>
                      <TableRow>
                        <TableCell align="left" sx={{ fontWeight: "bold" }}>
                          Outlet Name
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Invoice No
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Staff Manager
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
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {credits.map((credit) => (
                        <TableRow key={credit.id}>
                          <TableCell align="left">{credit.outlet_name}</TableCell>
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {credits.length === 0 && (
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
    </DashboardLayout>
  );
}

export default CreditsPage;
