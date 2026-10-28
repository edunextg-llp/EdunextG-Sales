import Card from "@mui/material/Card";
import {
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
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

import {
  PAYMENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_ORDER,
  TABLE_HEAD_SX,
  formatCancelQtyDisplay,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "../format";

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

// Who did a journey step. Older entries (before tracking started) fall back to the
// packer / delivery boy saved on the invoice, marked as "assigned".
function journeyActor(entry, sale) {
  if (entry.changed_by_name) {
    return { name: entry.changed_by_name, role: entry.changed_by_role, recorded: true };
  }
  if (entry.status === "not_packing" && sale.created_by_name) {
    return { name: sale.created_by_name, role: sale.created_by_role, recorded: true };
  }
  if (["packing", "packing_done"].includes(entry.status) && sale.packed_by_name) {
    return { name: sale.packed_by_name, role: "Packing (assigned)", recorded: false };
  }
  if (["out_for_delivery", "delivered", "returned"].includes(entry.status) && sale.delivery_boy_name) {
    return { name: sale.delivery_boy_name, role: "Delivery (assigned)", recorded: false };
  }
  return null;
}

function ActorCell({ actor }) {
  if (!actor) {
    return (
      <MDTypography variant="caption" color="text">
        Not recorded
      </MDTypography>
    );
  }
  return (
    <MDBox lineHeight={1.2}>
      <MDTypography variant="button" fontWeight={actor.recorded ? "medium" : "regular"} display="block">
        {actor.name}
      </MDTypography>
      {actor.role && (
        <MDTypography variant="caption" color="text" fontStyle={actor.recorded ? "normal" : "italic"}>
          {actor.role}
        </MDTypography>
      )}
    </MDBox>
  );
}

const ACTION_LABELS = {
  not_packing: "Added sale",
  packing: "Started packing",
  packing_done: "Packed",
  out_for_delivery: "Sent for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

function InvoiceDetails({ details, embedded = false }) {
  const { sale, history, payments, cancellations, collections, takenBills, summary } = details;
  // Inside an outlet history row the cards sit on a tinted panel, so drop the shadow.
  const cardSx = embedded
    ? { p: 2, mb: 2, boxShadow: "none", border: "1px solid", borderColor: "grey.300" }
    : { p: 3, mb: 3 };
  const currentStatus = sale.packaging_status || "not_packing";
  const activeStep = STATUS_ORDER.indexOf(currentStatus);

  // Bill after cancellations, matching the backend's paid + balance totals.
  const effectivePrice = Number(summary.paidAmount || 0) + Number(summary.balanceAmount || 0);
  let paidSoFar = 0;
  const paymentHistory = payments.map((payment) => {
    const isCredit = payment.payment_mode === "credit";
    // Credit entries record an amount owed; only cash, UPI and cheque count as paid.
    if (!isCredit) paidSoFar += Number(payment.amount) || 0;
    const modeLabel = PAYMENT_LABELS[payment.payment_mode] || payment.payment_mode;
    return {
      ...payment,
      isCredit,
      typeLabel: isCredit
        ? "Credit Given"
        : payment.parent_credit_payment_id
          ? `Credit Collection (${modeLabel})`
          : modeLabel,
      paidSoFar,
      balanceAfter: Math.max(0, Math.round((effectivePrice - paidSoFar) * 100) / 100),
    };
  });

  return (
    <MDBox mt={embedded ? 0 : 3}>
      <Card sx={cardSx}>
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
          <InfoRow
            label="Added By"
            value={sale.created_by_name ? `${sale.created_by_name}${sale.created_by_role ? ` (${sale.created_by_role})` : ""}` : "Not recorded"}
          />
          {sale.credit_photo_url && (
            <Grid item xs={12} sm={6} md={4}>
              <MDTypography variant="caption" color="text" fontWeight="medium" display="block">
                Credit Bill Photo
              </MDTypography>
              <MDTypography
                variant="button"
                fontWeight="regular"
                component="a"
                href={sale.credit_photo_url}
                target="_blank"
                rel="noopener noreferrer"
                color="info"
              >
                View photo
              </MDTypography>
              <MDTypography variant="caption" color="text" display="block">
                {sale.credit_photo_by_name
                  ? `Uploaded by ${sale.credit_photo_by_name}${sale.credit_photo_by_role ? ` (${sale.credit_photo_by_role})` : ""}`
                  : "Uploader not recorded"}
                {sale.credit_photo_at ? ` · ${formatDateTime(sale.credit_photo_at)}` : ""}
              </MDTypography>
            </Grid>
          )}
          {sale.requisition_number && (
            <InfoRow
              label="From Requisition"
              value={`${sale.requisition_number}${sale.requisition_raised_by ? ` · raised by ${sale.requisition_raised_by}` : ""}${
                sale.requisition_approved_by ? ` · approved by ${sale.requisition_approved_by}` : ""
              }`}
            />
          )}
        </Grid>
      </Card>

      <Card sx={cardSx}>
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
              <TableHead sx={TABLE_HEAD_SX}>
                <TableRow>
                  <TableCell>Stage</TableCell>
                  <TableCell>Date & Time</TableCell>
                  <TableCell>Done by</TableCell>
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
                    <TableCell>
                      <MDTypography variant="caption" color="text" display="block">
                        {ACTION_LABELS[entry.status] || ""}
                      </MDTypography>
                      <ActorCell actor={journeyActor(entry, sale)} />
                    </TableCell>
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
        <Card sx={cardSx}>
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

      <Card sx={cardSx}>
        <MDBox display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={2}>
          <MDTypography variant="h6" fontWeight="medium">
            Payment History ({payments.length})
          </MDTypography>
          <MDBox display="flex" gap={1} flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`Bill: ${formatCurrency(effectivePrice)}`} />
            <Chip size="small" variant="outlined" color="success" label={`Paid: ${formatCurrency(summary.paidAmount)}`} />
            <Chip
              size="small"
              variant="outlined"
              color={Number(summary.balanceAmount) > 0 ? "error" : "success"}
              label={`Balance: ${formatCurrency(summary.balanceAmount)}`}
            />
          </MDBox>
        </MDBox>
        {paymentHistory.length > 0 ? (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={TABLE_HEAD_SX}>
                <TableRow>
                  <TableCell>Sr No</TableCell>
                  <TableCell>Payment Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Total Paid</TableCell>
                  <TableCell align="right">Balance After</TableCell>
                  <TableCell>Collector</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Entered By</TableCell>
                  <TableCell>Entry Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentHistory.map((payment, index) => (
                  <TableRow
                    key={payment.id}
                    sx={{ backgroundColor: payment.isCredit ? "#fff7ed" : undefined }}
                  >
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{formatDate(payment.payment_date)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={payment.isCredit ? "warning" : "success"}
                        label={payment.typeLabel}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell align="right">{formatCurrency(payment.paidSoFar)}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontWeight: 700, color: payment.balanceAfter > 0 ? "#b91c1c" : "#15803d" }}
                    >
                      {formatCurrency(payment.balanceAfter)}
                    </TableCell>
                    <TableCell>{payment.collector_staff_name || payment.collector_name || "N/A"}</TableCell>
                    <TableCell>
                      {payment.reference_no
                        ? `${payment.reference_no}${payment.reference_date ? ` (${formatDate(payment.reference_date)})` : ""}`
                        : "—"}
                      {payment.isCredit && payment.credit_days ? ` · ${payment.credit_days} days` : ""}
                    </TableCell>
                    <TableCell>
                      {payment.updated_by_name
                        ? `${payment.updated_by_name}${payment.updated_by_employee_code ? ` (${payment.updated_by_employee_code})` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell>{formatDateTime(payment.created_at)}</TableCell>
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
        <Card sx={cardSx}>
          <MDTypography variant="h6" fontWeight="medium" mb={2}>
            D.B. Collection Submissions
          </MDTypography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={TABLE_HEAD_SX}>
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
        <Card sx={cardSx}>
          <MDTypography variant="h6" fontWeight="medium" mb={2}>
            Credit Bill Collection
          </MDTypography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={TABLE_HEAD_SX}>
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
        <Card sx={cardSx}>
          <MDTypography variant="h6" fontWeight="medium" mb={2}>
            Cancellations / Returns
          </MDTypography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={TABLE_HEAD_SX}>
                <TableRow>
                  <TableCell>Product</TableCell>
                  <TableCell>Qty to Cancel</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Requested by</TableCell>
                  <TableCell>Cancelled / Approved by</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cancellations.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.product_name}</TableCell>
                    <TableCell>{formatCancelQtyDisplay(row)}</TableCell>
                    <TableCell>{formatCurrency(row.amount)}</TableCell>
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>{row.requested_by_name || "—"}</TableCell>
                    <TableCell>
                      <ActorCell
                        actor={
                          row.approved_by_name
                            ? { name: row.approved_by_name, role: row.cancelled_by_role, recorded: true }
                            : null
                        }
                      />
                    </TableCell>
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

export default InvoiceDetails;
