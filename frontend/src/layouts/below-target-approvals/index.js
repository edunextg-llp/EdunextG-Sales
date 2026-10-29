import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Icon, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useAuth } from "context/AuthContext";
import {
  printPurchaseRequisitionPdf,
  printPurchaseRequisitionsPdf,
} from "utils/printPurchaseRequisitionPdf";

const API = process.env.REACT_APP_API_URL;
const auth = () => {
  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const money = (value) => Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const actorText = (name, loginId) => {
  if (!name) return "—";
  return name === "Admin" || !loginId ? name : `${name} (${loginId})`;
};
const STATUS_COLORS = { pending: "warning", approved: "success", rejected: "error" };
const isPendingRequisition = (row) => ["open", "pending"].includes(row.status || "pending");

/** One below-target day: its requisitions, a print checklist, and Approve / Reject. */
function RequestDialog({ request, isAdmin, canDecide, onClose, onDecide }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!request) return;
    setSelected([]);
    setLoading(true);
    const params = new URLSearchParams({
      staffId: String(request.staff_id),
      companyId: String(request.company_id),
      date: request.request_date,
    });
    fetch(`${API}/staff/purchase-requisitions?${params.toString()}`, { headers: auth() })
      .then((response) => (response.ok ? response.json() : { requisitions: [] }))
      .then((data) => setRows(Array.isArray(data.requisitions) ? data.requisitions : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [request]);

  if (!request) return null;
  const ids = rows.map((row) => String(row.id));
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  const pendingCount = rows.filter(isPendingRequisition).length;
  const short = Math.max(0, request.target_amount - request.achieved_amount);

  const decide = async (status) => {
    setBusy(true);
    try {
      const done = await onDecide(request, status);
      if (done) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ pb: 1 }}>
        <MDBox display="flex" justifyContent="space-between" alignItems="flex-start" gap={2}>
          <MDBox>
            <MDTypography variant="h6" fontWeight="bold">
              {request.staff_name} · {request.company_name}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {request.request_date} · Target ₹{money(request.target_amount)} · Done ₹{money(request.achieved_amount)} · Short ₹{money(short)}
            </MDTypography>
          </MDBox>
          <IconButton onClick={onClose} aria-label="Close"><Icon>close</Icon></IconButton>
        </MDBox>
      </DialogTitle>
      <DialogContent dividers>
        <MDBox mb={2} p={1.5} borderRadius="lg" sx={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <MDTypography variant="button" fontWeight="bold" color="info">
            Requested on {request.requested_at}
            {isAdmin && request.requested_by_name ? ` by ${actorText(request.requested_by_name, request.requested_by_login_id)}` : ""}
          </MDTypography>
          <MDTypography variant="caption" color="text" display="block">
            Reason: {request.note || "No reason given."}
          </MDTypography>
          {request.status !== "pending" && (
            <MDTypography variant="caption" color="text" display="block">
              {request.status === "approved" ? "Approved" : "Rejected"} on {request.reviewed_at}
              {isAdmin && request.reviewed_by_name ? ` by ${actorText(request.reviewed_by_name, request.reviewed_by_login_id)}` : ""}
              {request.review_note ? ` · ${request.review_note}` : ""}
            </MDTypography>
          )}
        </MDBox>

        {loading ? (
          <MDTypography variant="body2" color="text">Loading requisitions...</MDTypography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead sx={{ display: "table-header-group" }}>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allSelected}
                      indeterminate={!allSelected && selected.length > 0}
                      onChange={() => setSelected(allSelected ? [] : ids)}
                      inputProps={{ "aria-label": "Select all requisitions" }}
                    />
                  </TableCell>
                  {["Sr No", "Requisition No", "Outlet", "Area", "Items", "Total Qty", "Value", "Status", "View"]
                    .map((heading) => <TableCell key={heading} sx={{ fontWeight: 700 }}>{heading}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.id} sx={row.status === "cancelled" ? { backgroundColor: "#fee2e2" } : row.status === "approved" ? { backgroundColor: "#dcfce7" } : {}}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.includes(String(row.id))}
                        onChange={() => setSelected((current) => (
                          current.includes(String(row.id))
                            ? current.filter((value) => value !== String(row.id))
                            : [...current, String(row.id)]
                        ))}
                        inputProps={{ "aria-label": `Select requisition ${row.requisition_number}` }}
                      />
                    </TableCell>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{row.requisition_number}</TableCell>
                    <TableCell>{row.outlet_name}</TableCell>
                    <TableCell>{row.location_name || "—"}</TableCell>
                    <TableCell>{row.item_count}</TableCell>
                    <TableCell>{Number(row.total_quantity || 0).toFixed(2)}</TableCell>
                    <TableCell>{money(row.total_amount)}</TableCell>
                    <TableCell>{row.status || "pending"}</TableCell>
                    <TableCell>
                      <MDButton color="info" variant="text" size="small" title="View / print" onClick={() => printPurchaseRequisitionPdf(row)}>
                        <Icon fontSize="small">visibility</Icon>
                      </MDButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <MDButton
          color="dark"
          variant="outlined"
          disabled={!selected.length}
          onClick={() => printPurchaseRequisitionsPdf(rows.filter((row) => selected.includes(String(row.id))))}
        >
          <Icon sx={{ mr: 0.5 }}>print</Icon> Print Selected ({selected.length})
        </MDButton>
        {canDecide && request.status === "pending" && (
          <MDBox display="flex" gap={1}>
            <MDButton color="error" variant="outlined" disabled={busy} onClick={() => decide("rejected")}>
              Reject Request
            </MDButton>
            <MDButton color="success" variant="gradient" disabled={busy} onClick={() => decide("approved")}>
              Approve ({pendingCount} pending)
            </MDButton>
          </MDBox>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Approvals > Below Target Approvals. Days where a staff member's requisitions are below
 * the company's daily target (e.g. SIL Rs. 11,250) and that a Requisition Approval user
 * sent for approval. Open to Admin and to logins given the "Below Target Approvals" permission.
 */
function BelowTargetApprovals() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canDecide = isAdmin || user?.permissions?.includes("requisition_target_approval");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState("pending");
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/staff/purchase-requisitions/target-requests`, { headers: auth() });
      const data = await response.json().catch(() => ({}));
      setRequests(response.ok && Array.isArray(data.requests) ? data.requests : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    pending: requests.filter((row) => row.status === "pending").length,
    approved: requests.filter((row) => row.status === "approved").length,
    rejected: requests.filter((row) => row.status === "rejected").length,
    all: requests.length,
  }), [requests]);
  const visible = show === "all" ? requests : requests.filter((row) => row.status === show);

  const decide = async (request, status) => {
    const approving = status === "approved";
    const note = approving ? "" : window.prompt("Reason for rejecting (optional):", "");
    if (note === null) return false;
    if (approving && !window.confirm(`Approve ${request.staff_name}'s ${request.company_name} requisitions on ${request.request_date}? All pending requisitions of that day will be approved.`)) {
      return false;
    }
    const response = await fetch(`${API}/staff/purchase-requisitions/target-requests/${request.id}`, {
      method: "PUT",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      alert(data.error || "Unable to update the request.");
      return false;
    }
    setMessage(data.message || "Request updated.");
    await load();
    return true;
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={3}>
            <MDBox display="flex" justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" gap={2} mb={2}>
              <MDBox>
                <MDTypography variant="h6" fontWeight="bold">Below Target Approvals</MDTypography>
                <MDTypography variant="caption" color="text">
                  Days where a staff member&apos;s requisitions are below the company&apos;s daily target, sent here for approval.
                  Approving a request approves all pending requisitions of that day.
                </MDTypography>
              </MDBox>
              <MDButton color="info" variant="outlined" size="small" onClick={load} disabled={loading}>
                <Icon sx={{ mr: 0.5 }}>refresh</Icon> Refresh
              </MDButton>
            </MDBox>

            {message && (
              <MDTypography variant="button" color="success" display="block" mb={1.5}>{message}</MDTypography>
            )}

            <ToggleButtonGroup exclusive size="small" value={show} onChange={(_, value) => value && setShow(value)} sx={{ mb: 2 }}>
              <ToggleButton value="pending">Pending ({counts.pending})</ToggleButton>
              <ToggleButton value="approved">Approved ({counts.approved})</ToggleButton>
              <ToggleButton value="rejected">Rejected ({counts.rejected})</ToggleButton>
              <ToggleButton value="all">All ({counts.all})</ToggleButton>
            </ToggleButtonGroup>

            {loading ? (
              <MDTypography variant="body2" color="text">Loading requests...</MDTypography>
            ) : visible.length === 0 ? (
              <MDTypography variant="body2" color="text">No requests here.</MDTypography>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead sx={{ display: "table-header-group" }}>
                    <TableRow>
                      {[
                        "Sr No", "Date", "Employee", "Company", "Target", "Done", "Short", "Reason", "Requested On",
                        ...(isAdmin ? ["Requested By"] : []), "Status", ...(isAdmin ? ["Reviewed By"] : []), "Action",
                      ].map((heading) => <TableCell key={heading} sx={{ fontWeight: 700 }}>{heading}</TableCell>)}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visible.map((request, index) => (
                      <TableRow key={request.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{request.request_date}</TableCell>
                        <TableCell>{request.staff_name}</TableCell>
                        <TableCell>{request.company_name}</TableCell>
                        <TableCell>{money(request.target_amount)}</TableCell>
                        <TableCell>{money(request.achieved_amount)}</TableCell>
                        <TableCell sx={{ color: "#b91c1c", fontWeight: 600 }}>
                          {money(Math.max(0, request.target_amount - request.achieved_amount))}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>{request.note || "—"}</TableCell>
                        <TableCell>{request.requested_at}</TableCell>
                        {isAdmin && <TableCell>{actorText(request.requested_by_name, request.requested_by_login_id)}</TableCell>}
                        <TableCell>
                          <Chip size="small" color={STATUS_COLORS[request.status] || "default"} label={request.status} />
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            {request.status === "pending" ? "—" : actorText(request.reviewed_by_name, request.reviewed_by_login_id)}
                          </TableCell>
                        )}
                        <TableCell>
                          <MDButton color="info" variant="gradient" size="small" onClick={() => setOpen(request)}>
                            View
                          </MDButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </MDBox>
        </Card>
      </MDBox>
      <RequestDialog
        request={open}
        isAdmin={isAdmin}
        canDecide={canDecide}
        onClose={() => setOpen(null)}
        onDecide={decide}
      />
      <Footer />
    </DashboardLayout>
  );
}

export default BelowTargetApprovals;
