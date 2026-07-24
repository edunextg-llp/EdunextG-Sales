import { useState } from "react";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import {
  Box,
  Chip,
  Divider,
  Grid,
  Paper,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = "https://bawarche.edunextg.co/api";

const STATUS_LABELS = {
  not_packing: "Sale Created",
  packing: "Packing In Progress",
  packing_done: "Packing Done",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

const STATUS_ORDER = [
  "not_packing",
  "packing",
  "packing_done",
  "out_for_delivery",
  "delivered",
];

const PAYMENT_LABELS = {
  cash: "Cash",
  upi: "UPI",
  credit: "Credit",
  cheque: "Cheque",
};

const STATUS_COLORS = {
  not_packing: "default",
  packing: "warning",
  packing_done: "info",
  out_for_delivery: "primary",
  delivered: "success",
  cancelled: "error",
  returned: "secondary",
};

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "N/A";
  const dateOnly = String(value).split("T")[0].split(" ")[0];
  const parts = dateOnly.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return value;
}

function formatDateTime(value) {
  if (!value) return "N/A";
  const [datePart, timePart = ""] = String(value).split(/[T ]/);
  return `${formatDate(datePart)}${timePart ? ` ${timePart.slice(0, 8)}` : ""}`;
}

function InfoRow({ label, value }) {
  return (
    <Grid item xs={12} sm={6} md={4}>
      <MDTypography variant="caption" color="text" fontWeight="medium" display="block">
        {label}
      </MDTypography>
      <MDTypography variant="button" fontWeight="regular">
        {value || "N/A"}
      </MDTypography>
    </Grid>
  );
}

function InvoiceDetails({ details }) {
  const { sale, history, payments, cancellations, collections, takenBills, summary } = details;
  const currentStatus = sale.packaging_status || "not_packing";
  const activeStep = STATUS_ORDER.indexOf(currentStatus);

  return (
    <MDBox mt={3}>
      <Card sx={{ p: 3, mb: 3 }}>
        <MDBox display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2} mb={2}>
          <MDBox>
            <MDTypography variant="h5" fontWeight="bold">
              Invoice {sale.invoice_number}
            </MDTypography>
            <MDTypography variant="button" color="text">
              Sale ID: {sale.sticker_number || sale.id} &nbsp;|&nbsp; Date: {sale.formatted_date || formatDate(sale.sale_date)}
            </MDTypography>
          </MDBox>
          <Chip
            label={STATUS_LABELS[currentStatus] || currentStatus}
            color={STATUS_COLORS[currentStatus] || "default"}
            size="medium"
          />
        </MDBox>

        <Divider sx={{ my: 2 }} />

        <Grid container spacing={2}>
          <InfoRow label="Company" value={sale.company_name} />
          <InfoRow label="Staff" value={sale.staff_name} />
          <InfoRow label="Outlet" value={sale.outlet_name} />
          <InfoRow label="Outlet ERP ID" value={sale.outlet_erp_id} />
          <InfoRow label="Location" value={sale.location_name} />
          <InfoRow label="Contact" value={sale.contact_number} />
          <InfoRow label="Items" value={sale.item_count} />
          <InfoRow label="Packed Items" value={sale.packed_item_count} />
          <InfoRow label="Boxes / Packets" value={`${sale.box_count || 0} / ${sale.packet_count || 0}`} />
          <InfoRow label="Bill Amount" value={formatCurrency(summary.price)} />
          <InfoRow label="Paid Amount" value={formatCurrency(summary.paidAmount)} />
          <InfoRow label="Balance" value={formatCurrency(summary.balanceAmount)} />
          <InfoRow label="Payment Mode" value={PAYMENT_LABELS[sale.payment_mode] || sale.payment_mode} />
          {sale.reference_no && <InfoRow label="Reference No" value={sale.reference_no} />}
          {sale.reference_date && <InfoRow label="Reference Date" value={formatDate(sale.reference_date)} />}
          {sale.credit_days && <InfoRow label="Credit Days" value={sale.credit_days} />}
        </Grid>
      </Card>

      <Card sx={{ p: 3, mb: 3 }}>
        <MDTypography variant="h6" fontWeight="medium" mb={2}>
          Invoice Journey
        </MDTypography>
        <Stepper activeStep={activeStep >= 0 ? activeStep : 0} alternativeLabel sx={{ mb: 3 }}>
          {STATUS_ORDER.map((status) => (
            <Step key={status} completed={STATUS_ORDER.indexOf(status) <= activeStep}>
              <StepLabel>{STATUS_LABELS[status]}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {history.length > 0 ? (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Stage</TableCell>
                  <TableCell>Date & Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Chip
                        label={STATUS_LABELS[entry.status] || entry.status}
                        color={STATUS_COLORS[entry.status] || "default"}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{formatDateTime(entry.changed_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <MDTypography variant="button" color="text">
            No status history recorded yet.
          </MDTypography>
        )}
      </Card>

      {(sale.delivery_boy_name || sale.vehicle_no || sale.delivery_date || sale.packed_by_name) && (
        <Card sx={{ p: 3, mb: 3 }}>
          <MDTypography variant="h6" fontWeight="medium" mb={2}>
            Delivery Details
          </MDTypography>
          <Grid container spacing={2}>
            <InfoRow label="Delivery Boy" value={sale.delivery_boy_name} />
            <InfoRow label="Vehicle No" value={sale.vehicle_no} />
            <InfoRow label="Delivery Date" value={formatDate(sale.delivery_date)} />
            <InfoRow label="Packed By" value={sale.packed_by_name} />
            <InfoRow label="Packing Date" value={formatDate(sale.packing_date)} />
          </Grid>
        </Card>
      )}

      <Card sx={{ p: 3, mb: 3 }}>
        <MDTypography variant="h6" fontWeight="medium" mb={2}>
          Payments ({payments.length})
        </MDTypography>
        {payments.length > 0 ? (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Collector</TableCell>
                  <TableCell>Reference</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.payment_date)}</TableCell>
                    <TableCell>{PAYMENT_LABELS[payment.payment_mode] || payment.payment_mode}</TableCell>
                    <TableCell>{formatCurrency(payment.amount)}</TableCell>
                    <TableCell>{payment.collector_staff_name || payment.collector_name || "N/A"}</TableCell>
                    <TableCell>
                      {payment.reference_no
                        ? `${payment.reference_no}${payment.reference_date ? ` (${formatDate(payment.reference_date)})` : ""}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <MDTypography variant="button" color="text">
            No payments recorded yet.
          </MDTypography>
        )}
      </Card>

      {collections.length > 0 && (
        <Card sx={{ p: 3, mb: 3 }}>
          <MDTypography variant="h6" fontWeight="medium" mb={2}>
            D.B. Collection Submissions
          </MDTypography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Delivery Boy</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Submitted At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {collections.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.delivery_boy_name}</TableCell>
                    <TableCell>{PAYMENT_LABELS[row.payment_mode] || row.payment_mode}</TableCell>
                    <TableCell>{formatCurrency(row.amount)}</TableCell>
                    <TableCell>
                      {row.reference_no
                        ? `${row.reference_no}${row.reference_date ? ` (${formatDate(row.reference_date)})` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>{formatDateTime(row.updated_at || row.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {takenBills.length > 0 && (
        <Card sx={{ p: 3, mb: 3 }}>
          <MDTypography variant="h6" fontWeight="medium" mb={2}>
            Credit Bill Collection
          </MDTypography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Taken Date</TableCell>
                  <TableCell>Collector</TableCell>
                  <TableCell>Credit Amount</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {takenBills.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.taken_date)}</TableCell>
                    <TableCell>{row.staff_name || row.delivery_boy_name || "N/A"}</TableCell>
                    <TableCell>{formatCurrency(row.credit_amount)}</TableCell>
                    <TableCell>{row.returned_at ? `Returned (${formatDateTime(row.returned_at)})` : "Taken"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {cancellations.length > 0 && (
        <Card sx={{ p: 3, mb: 3 }}>
          <MDTypography variant="h6" fontWeight="medium" mb={2}>
            Cancellations / Returns
          </MDTypography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cancellations.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.product_name}</TableCell>
                    <TableCell>{row.product_size || "—"}</TableCell>
                    <TableCell>{formatCurrency(row.amount)}</TableCell>
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </MDBox>
  );
}

function InvoiceLookup() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleSearch = async (event) => {
    event?.preventDefault();
    const term = searchQuery.trim();
    if (!term) {
      setError("Please enter an invoice number.");
      return;
    }

    setLoading(true);
    setError("");
    setResults([]);
    setSelectedIndex(0);

    try {
      const response = await fetch(
        `${API}/staff/sales/lookup?invoiceNumber=${encodeURIComponent(term)}`
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "No invoice found.");
        return;
      }

      if (!data.results?.length) {
        setError("No invoice found.");
        return;
      }

      setResults(data.results);
    } catch (searchError) {
      console.error("Invoice lookup failed:", searchError);
      setError("Failed to search invoice. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const selectedDetails = results[selectedIndex] || null;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <MDBox mb={3}>
          <MDTypography variant="h4" fontWeight="medium">
            Invoice Lookup
          </MDTypography>
          <MDTypography variant="button" color="text">
            Search by invoice number to view the complete journey from sale to delivery and payment.
          </MDTypography>
        </MDBox>

        <Card sx={{ p: 3 }}>
          <Box component="form" onSubmit={handleSearch} display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <MDBox flex={1} minWidth="240px">
              <MDInput
                fullWidth
                label="Invoice Number"
                placeholder="Enter invoice number..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </MDBox>
            <MDButton variant="gradient" color="info" type="submit" disabled={loading}>
              <Icon sx={{ mr: 0.5 }}>search</Icon>
              {loading ? "Searching..." : "Search"}
            </MDButton>
          </Box>
        </Card>

        {error && (
          <MDBox mt={2}>
            <Typography color="error" variant="button">
              {error}
            </Typography>
          </MDBox>
        )}

        {results.length > 1 && (
          <Card sx={{ p: 2, mt: 3 }}>
            <MDTypography variant="button" color="text" mb={1} display="block">
              Multiple invoices found — select one:
            </MDTypography>
            <MDBox display="flex" flexWrap="wrap" gap={1}>
              {results.map((result, index) => (
                <MDButton
                  key={result.sale.id}
                  variant={selectedIndex === index ? "gradient" : "outlined"}
                  color="info"
                  size="small"
                  onClick={() => setSelectedIndex(index)}
                >
                  {result.sale.invoice_number} — {result.sale.outlet_name} ({result.sale.formatted_date || formatDate(result.sale.sale_date)})
                </MDButton>
              ))}
            </MDBox>
          </Card>
        )}

        {selectedDetails && <InvoiceDetails details={selectedDetails} />}
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default InvoiceLookup;
