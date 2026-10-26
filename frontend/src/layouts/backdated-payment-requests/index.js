import { useCallback, useEffect, useState } from "react";
import {
  Card,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

const API = process.env.REACT_APP_API_URL;

// Same table styling as the Suspense Requests / Cancellation Approvals pages.
// The theme renders TableHead as a block, so it must be reset to a table header group.
const headSx = { color: "#6b7280", fontSize: "0.75rem", fontWeight: 600, borderBottom: "1px solid #e5e7eb", px: 2, py: 1.5, whiteSpace: "nowrap" };
const cellSx = { px: 2, py: 1.5, verticalAlign: "top", fontSize: "0.8rem" };
const subTextSx = { display: "block", color: "#6b7280", fontSize: "0.72rem", mt: 0.25 };
const statusStyles = {
  pending: { color: "#b45309", backgroundColor: "#fef3c7" },
  approved: { color: "#047857", backgroundColor: "#d1fae5" },
  rejected: { color: "#b91c1c", backgroundColor: "#fee2e2" },
};
const modeLabels = { cash: "Cash", upi: "UPI", cheque: "Cheque", credit: "Credit" };
const headings = ["Sr. No.", "Requested", "Invoice / Outlet", "Payment Date", "Mode", "Amount", "Status", "Action"];

const formatDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
};

export default function BackdatedPaymentRequests() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/staff/backdated-payment-requests`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load backdated payment requests.");
      setRows((Array.isArray(data) ? data : []).filter((row) => status === "all" || row.status === status));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (row, action) => {
    const note = window.prompt(action === "approve" ? "Approval note (optional):" : "Rejection reason:", "");
    if (note === null || (action === "reject" && !note.trim())) return;
    try {
      const response = await fetch(`${API}/staff/backdated-payment-requests/${row.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to review this request.");
      setMessage(data.message);
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={2} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
            <MDBox>
              <MDTypography variant="h6">Backdated Payment Approvals</MDTypography>
              <MDTypography variant="caption" color="text">
                Payments with an earlier date entered by staff. The payment is added to the invoice only after approval.
              </MDTypography>
            </MDBox>
            <Select size="small" value={status} onChange={(event) => setStatus(event.target.value)} sx={{ minWidth: 140, height: 36 }}>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
              <MenuItem value="all">All</MenuItem>
            </Select>
          </MDBox>

          {message && (
            <MDTypography px={2} pb={1} color="text" variant="caption" display="block">
              {message}
            </MDTypography>
          )}

          <TableContainer sx={{ boxShadow: "none", overflowX: "auto" }}>
            <Table sx={{ minWidth: 900 }}>
              <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                <TableRow>
                  {headings.map((heading) => (
                    <TableCell key={heading} sx={headSx} align={heading === "Amount" ? "right" : "left"}>
                      {heading}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && !rows.length && (
                  <TableRow>
                    <TableCell colSpan={headings.length} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                      No {status === "all" ? "" : status} backdated payment requests.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell sx={cellSx}>{index + 1}</TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                      {row.created_at_display}
                      <MDBox component="span" sx={subTextSx}>{row.requested_by_name || "—"}</MDBox>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <strong>{row.invoice_number}</strong>
                      <MDBox component="span" sx={subTextSx}>{row.outlet_name || "—"}</MDBox>
                    </TableCell>
                    <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                      {formatDate(row.payment_date)}
                      <MDBox component="span" sx={subTextSx}>
                        {row.action === "edit" ? "Edit of existing payment" : "New payment"}
                      </MDBox>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      {modeLabels[row.payment_mode] || row.payment_mode}
                      {row.reference_no && <MDBox component="span" sx={subTextSx}>Ref: {row.reference_no}</MDBox>}
                      {row.payment_mode === "credit" && row.credit_days && (
                        <MDBox component="span" sx={subTextSx}>{row.credit_days} day(s)</MDBox>
                      )}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>
                      ₹{Number(row.amount).toFixed(2)}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <MDBox
                        component="span"
                        sx={{
                          ...(statusStyles[row.status] || {}),
                          px: 1,
                          py: 0.25,
                          borderRadius: 1,
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          textTransform: "capitalize",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.status}
                      </MDBox>
                      {row.status !== "pending" && row.reviewed_by_name && (
                        <MDBox component="span" sx={subTextSx}>by {row.reviewed_by_name}</MDBox>
                      )}
                      {row.status !== "pending" && row.review_note && (
                        <MDBox component="span" sx={subTextSx}>{row.review_note}</MDBox>
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      {row.status === "pending" && (
                        <MDBox display="flex" gap={1}>
                          <MDButton size="small" color="success" onClick={() => review(row, "approve")}>
                            Approve
                          </MDButton>
                          <MDButton size="small" color="error" onClick={() => review(row, "reject")}>
                            Reject
                          </MDButton>
                        </MDBox>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}
