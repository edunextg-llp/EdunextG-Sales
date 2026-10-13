import { Fragment, useEffect, useState } from "react";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import {
  Chip,
  Collapse,
  Grid,
  IconButton,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

import InvoiceDetails from "./InvoiceDetails";
import {
  API,
  PAYMENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TABLE_HEAD_SX,
  fetchJson,
  formatCurrency,
  formatDate,
} from "../format";

const COLUMN_COUNT = 11;

function SummaryTile({ label, value, color }) {
  return (
    <Grid item xs={6} sm={4} md={2.4}>
      <MDBox p={1.5} borderRadius="lg" sx={{ border: "1px solid", borderColor: "grey.300", height: "100%" }}>
        <MDTypography variant="caption" color="text" fontWeight="medium" display="block">
          {label}
        </MDTypography>
        <MDTypography variant="h6" fontWeight="bold" sx={{ color }}>
          {value}
        </MDTypography>
      </MDBox>
    </Grid>
  );
}

function ExpandedInvoice({ entry }) {
  if (!entry || entry.loading) {
    return <LinearProgress sx={{ my: 2 }} />;
  }
  if (entry.error) {
    return (
      <MDTypography variant="button" color="error" display="block" py={2}>
        {entry.error}
      </MDTypography>
    );
  }
  return <InvoiceDetails details={entry.data} embedded />;
}

// Every invoice of one outlet (all counters sharing its ERP ID), with totals.
// Full invoice details are loaded only when a row is opened.
function OutletHistory({ outletKey, currentSaleId = null }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set());
  const [details, setDetails] = useState({});

  useEffect(() => {
    if (!outletKey) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    setExpanded(new Set());
    setDetails({});
    setFilter("all");

    fetchJson(`${API}/staff/sales/lookup/outlet-invoices?outletKey=${encodeURIComponent(outletKey)}`, controller.signal)
      .then(setData)
      .catch((fetchError) => {
        if (fetchError.name === "AbortError") return;
        console.error("Outlet invoice history failed:", fetchError);
        setError(fetchError.message || "Failed to load outlet invoices.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [outletKey]);

  const loadDetails = async (saleId) => {
    setDetails((prev) => ({ ...prev, [saleId]: { loading: true } }));
    try {
      const result = await fetchJson(`${API}/staff/sales/lookup?saleId=${saleId}`);
      const entry = result.results?.[0];
      setDetails((prev) => ({
        ...prev,
        [saleId]: entry ? { data: entry } : { error: "Invoice details not found." },
      }));
    } catch (fetchError) {
      setDetails((prev) => ({ ...prev, [saleId]: { error: fetchError.message || "Failed to load invoice." } }));
    }
  };

  const toggleRow = (saleId) => {
    const opening = !expanded.has(saleId);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (opening) next.add(saleId);
      else next.delete(saleId);
      return next;
    });
    if (opening && (!details[saleId] || details[saleId].error)) loadDetails(saleId);
  };

  if (loading) {
    return (
      <Card sx={{ p: 3, mt: 3 }}>
        <MDTypography variant="button" color="text" display="block" mb={1}>
          Loading outlet invoices...
        </MDTypography>
        <LinearProgress />
      </Card>
    );
  }
  if (error) {
    return (
      <Card sx={{ p: 3, mt: 3 }}>
        <MDTypography variant="button" color="error">
          {error}
        </MDTypography>
      </Card>
    );
  }
  if (!data) return null;

  const { outlet, invoices, summary } = data;
  const names = outlet.outlet_names.split(" | ");
  const isUnpaid = (invoice) => invoice.packaging_status !== "cancelled" && Number(invoice.balance_amount) > 0;
  const visibleInvoices = invoices.filter((invoice) => {
    if (filter === "unpaid") return isUnpaid(invoice);
    if (filter === "paid") return invoice.packaging_status !== "cancelled" && !isUnpaid(invoice);
    return true;
  });

  return (
    <Card sx={{ p: 3, mt: 3 }}>
      <MDBox display="flex" alignItems="flex-start" gap={1.5} mb={2}>
        <Icon fontSize="large" color="info" sx={{ mt: 0.5 }}>
          storefront
        </Icon>
        <MDBox flex={1} minWidth={0}>
          <MDBox display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <MDTypography variant="h5" fontWeight="bold">
              {names[0]}
            </MDTypography>
            <Chip size="small" variant="outlined" label={`ERP ${outlet.outlet_erp_id}`} sx={{ fontFamily: "monospace" }} />
          </MDBox>
          {names.length > 1 && (
            <MDTypography variant="caption" color="text" display="block">
              Also saved as: {names.slice(1).join(", ")}
            </MDTypography>
          )}
          <MDTypography variant="button" color="text" display="block" mt={0.5}>
            {[
              outlet.locations && `Area: ${outlet.locations}`,
              outlet.staff_names && `Staff: ${outlet.staff_names}`,
              outlet.contacts && `Contact: ${outlet.contacts}`,
              outlet.visit_days && `Visit: ${outlet.visit_days}`,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </MDTypography>
        </MDBox>
      </MDBox>

      <Grid container spacing={1.5} mb={3}>
        <SummaryTile label="Total Bills" value={summary.invoiceCount} />
        <SummaryTile label="Total Billed" value={formatCurrency(summary.billed)} />
        <SummaryTile label="Total Paid" value={formatCurrency(summary.paid)} color="#15803d" />
        <SummaryTile
          label="Outstanding"
          value={formatCurrency(summary.outstanding)}
          color={summary.outstanding > 0 ? "#b91c1c" : "#15803d"}
        />
        <SummaryTile label="Unpaid Bills" value={summary.unpaidCount} color={summary.unpaidCount ? "#b91c1c" : undefined} />
      </Grid>

      <MDBox display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={1.5}>
        <MDTypography variant="h6" fontWeight="medium">
          {currentSaleId ? "All Invoices of this Outlet" : "Invoices"}
        </MDTypography>
        <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_, value) => value && setFilter(value)}>
          <ToggleButton value="all">All ({invoices.length})</ToggleButton>
          <ToggleButton value="unpaid">Unpaid ({summary.unpaidCount})</ToggleButton>
          <ToggleButton value="paid">Paid</ToggleButton>
        </ToggleButtonGroup>
      </MDBox>
      <MDTypography variant="caption" color="text" display="block" mb={1}>
        Click a row to see its full journey and payment history.
        {summary.cancelledCount > 0 && ` Cancelled bills (${summary.cancelledCount}) are not counted in the totals.`}
      </MDTypography>

      {visibleInvoices.length === 0 ? (
        <MDTypography variant="button" color="text">
          No invoices to show.
        </MDTypography>
      ) : (
        <TableContainer sx={{ boxShadow: "none", border: "1px solid", borderColor: "grey.300" }}>
          <Table size="small">
            <TableHead sx={TABLE_HEAD_SX}>
              <TableRow>
                <TableCell />
                <TableCell>Date</TableCell>
                <TableCell>Invoice No</TableCell>
                <TableCell>Company</TableCell>
                <TableCell>Staff</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Bill</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Last Payment</TableCell>
                <TableCell>Mode</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleInvoices.map((invoice) => {
                const isCurrent = Number(invoice.id) === Number(currentSaleId);
                const isOpen = expanded.has(invoice.id);
                const paid = Number(invoice.paid_amount) || 0;
                const balance = Number(invoice.balance_amount) || 0;
                const cancelled = invoice.packaging_status === "cancelled";
                return (
                  <Fragment key={invoice.id}>
                    <TableRow
                      hover={!isCurrent}
                      onClick={isCurrent ? undefined : () => toggleRow(invoice.id)}
                      sx={{
                        cursor: isCurrent ? "default" : "pointer",
                        backgroundColor: isCurrent ? "rgba(26, 115, 232, 0.08)" : undefined,
                        opacity: cancelled ? 0.6 : 1,
                        "& > td": { borderBottom: isOpen ? "none" : undefined },
                      }}
                    >
                      <TableCell padding="checkbox">
                        {isCurrent ? (
                          <Chip size="small" color="info" label="Viewing" />
                        ) : (
                          <IconButton size="small" aria-label={isOpen ? "Hide invoice" : "Show invoice"}>
                            <Icon>{isOpen ? "keyboard_arrow_up" : "keyboard_arrow_down"}</Icon>
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(invoice.sale_date)}</TableCell>
                      <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.company_name || "—"}</TableCell>
                      <TableCell>{invoice.staff_name || "—"}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          variant="outlined"
                          color={STATUS_COLORS[invoice.packaging_status] || "default"}
                          label={STATUS_LABELS[invoice.packaging_status] || invoice.packaging_status}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {formatCurrency(paid + balance)}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap", color: "#15803d" }}>
                        {formatCurrency(paid)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontWeight: 700, whiteSpace: "nowrap", color: balance > 0 && !cancelled ? "#b91c1c" : "#15803d" }}
                      >
                        {formatCurrency(balance)}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {invoice.last_payment_date ? formatDate(invoice.last_payment_date) : "—"}
                        {Number(invoice.payment_count) > 0 && (
                          <MDTypography variant="caption" color="text" display="block">
                            {invoice.payment_count} entr{Number(invoice.payment_count) === 1 ? "y" : "ies"}
                          </MDTypography>
                        )}
                      </TableCell>
                      <TableCell>
                        {PAYMENT_LABELS[invoice.payment_mode] || invoice.payment_mode || "—"}
                        {invoice.credit_days ? ` · ${invoice.credit_days}d` : ""}
                      </TableCell>
                    </TableRow>
                    {!isCurrent && (
                      <TableRow>
                        <TableCell colSpan={COLUMN_COUNT} sx={{ p: 0, borderBottom: isOpen ? undefined : "none" }}>
                          <Collapse in={isOpen} timeout="auto" unmountOnExit>
                            <MDBox px={2} pt={2} pb={0.5} sx={{ backgroundColor: "grey.100" }}>
                              <ExpandedInvoice entry={details[invoice.id]} />
                            </MDBox>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}

export default OutletHistory;
