import { useEffect, useMemo, useState } from "react";
import {
  Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Icon, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import {
  printPurchaseRequisitionPdf,
  printPurchaseRequisitionsPdf,
} from "utils/printPurchaseRequisitionPdf";

const money = (value) => Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Admin -> "Admin"; anyone else -> "Name (Login ID)".
const reviewerLabel = (row) => {
  if (!row.reviewed_by_name) return "—";
  if (row.reviewed_by_name === "Admin") return "Admin";
  return row.reviewed_by_login_id ? `${row.reviewed_by_name} (${row.reviewed_by_login_id})` : row.reviewed_by_name;
};

const isPending = (row) => ["open", "pending"].includes(row.status || "pending");

const payable = (row) => {
  const items = Array.isArray(row?.items) ? row.items : [];
  if (!items.length) return Number(row?.total_amount || 0) * 1.05;
  return items.reduce((total, item) => {
    const taxable = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
    return total + taxable + (taxable * (Number(item.gst_percent) || 5)) / 100;
  }, 0);
};

const rowColor = (row) => (
  row.status === "invoiced" ? { backgroundColor: "#86b887" }
    : row.status === "approved" ? { backgroundColor: "#dcfce7" }
      : row.status === "cancelled" ? { backgroundColor: "#fee2e2" }
        : {}
);

/**
 * One row per employee per company per day. A day whose requisitions (excluding
 * cancelled) are below the company's daily target is "Below Target".
 */
export function groupRequisitionDays(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const date = row.requisition_date || String(row.created_at || "").slice(0, 10) || "unknown";
    const key = `${date}|${row.staff_id}|${row.company_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date,
        staffId: row.staff_id,
        staffName: row.staff_name,
        companyId: row.company_id,
        companyName: row.company_name,
        target: Number(row.company_daily_target) || 0,
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  });
  return [...groups.values()]
    .map((group) => {
      const active = group.rows.filter((row) => row.status !== "cancelled");
      const value = active.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0);
      return {
        ...group,
        count: group.rows.length,
        items: group.rows.reduce((sum, row) => sum + (Number(row.item_count) || 0), 0),
        quantity: group.rows.reduce((sum, row) => sum + (Number(row.total_quantity) || 0), 0),
        value,
        pending: group.rows.filter(isPending).length,
        belowTarget: group.target > 0 && value < group.target,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.staffName).localeCompare(String(b.staffName)));
}

function TargetBadge({ group }) {
  if (!group.target) return <MDTypography variant="caption" color="text">—</MDTypography>;
  return (
    <MDBox display="flex" alignItems="center" gap={1} flexWrap="wrap">
      <MDTypography variant="caption" fontWeight="medium">
        ₹{money(group.value)} / ₹{money(group.target)}
      </MDTypography>
      <Chip
        size="small"
        color={group.belowTarget ? "error" : "success"}
        label={group.belowTarget ? `Short ₹${money(group.target - group.value)}` : "Target met"}
      />
    </MDBox>
  );
}

const actorText = (name, loginId) => (name === "Admin" || !loginId ? name : `${name} (${loginId})`);

function RequestPanel({ group, request, lastRejected, isAdmin, canApprove, canApproveBelowTarget, busy, onRequest, onReviewRequest }) {
  const hasPending = group.pending > 0;
  if (!group.belowTarget || !hasPending) return null;

  if (request) {
    return (
      <MDBox mb={2} p={1.5} borderRadius="lg" sx={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
        <MDTypography variant="button" fontWeight="bold" color="info">
          Below Target approval requested{request.requested_at ? ` on ${request.requested_at}` : ""}
          {isAdmin && request.requested_by_name ? ` by ${actorText(request.requested_by_name, request.requested_by_login_id)}` : ""}
        </MDTypography>
        {request.note ? (
          <MDTypography variant="caption" color="text" display="block">Reason: {request.note}</MDTypography>
        ) : null}
        {canApproveBelowTarget ? (
          <MDBox display="flex" gap={1} mt={1}>
            <MDButton color="success" variant="gradient" size="small" disabled={busy} onClick={() => onReviewRequest(request, "approved")}>
              Approve Request (approves all {group.pending} pending)
            </MDButton>
            <MDButton color="error" variant="outlined" size="small" disabled={busy} onClick={() => onReviewRequest(request, "rejected")}>
              Reject Request
            </MDButton>
          </MDBox>
        ) : (
          <MDTypography variant="caption" color="text" display="block">
            Waiting for Admin or a Below Target Approval user.
          </MDTypography>
        )}
      </MDBox>
    );
  }

  if (canApproveBelowTarget || !canApprove) return null;
  return (
    <MDBox mb={2} display="flex" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
      <MDTypography variant="caption" color="text">
        {lastRejected
          ? `The last request for this day was rejected${lastRejected.review_note ? `: ${lastRejected.review_note}` : "."} You can send it again.`
          : "You can't approve this day yourself. Send it for Below Target approval."}
      </MDTypography>
      <MDButton color="info" variant="gradient" size="small" disabled={busy} onClick={() => onRequest(group)}>
        <Icon sx={{ mr: 0.5 }}>send</Icon> Request Below Target Approval
      </MDButton>
    </MDBox>
  );
}

function DayDialog({ group, onClose, canApprove, canApproveBelowTarget, onReview, isAdmin, request, lastRejected, onRequest, onReviewRequest }) {
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected([]);
  }, [group?.key]);

  if (!group) return null;
  const ids = group.rows.map((row) => String(row.id));
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  const blocked = group.belowTarget && !canApproveBelowTarget;
  const pendingRows = group.rows.filter(isPending);

  const toggle = (id) => setSelected((current) => (
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  ));

  const run = async (task) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };

  const review = async (rowsToReview, status) => {
    if (!rowsToReview.length) return;
    const action = status === "approved" ? "approve" : "reject";
    const label = rowsToReview.length === 1
      ? `requisition ${rowsToReview[0].requisition_number}`
      : `${rowsToReview.length} pending requisitions`;
    if (!window.confirm(`Are you sure you want to ${action} ${label}?`)) return;
    setBusy(true);
    try {
      await onReview(rowsToReview, status);
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
              {group.staffName} · {group.companyName}
            </MDTypography>
            <MDTypography variant="caption" color="text">
              {group.date} · {group.count} requisition{group.count === 1 ? "" : "s"} · Value ₹{money(group.value)}
            </MDTypography>
          </MDBox>
          <IconButton onClick={onClose} aria-label="Close"><Icon>close</Icon></IconButton>
        </MDBox>
      </DialogTitle>
      <DialogContent dividers>
        {group.target > 0 && (
          <MDBox
            mb={2}
            p={1.5}
            borderRadius="lg"
            sx={{
              backgroundColor: group.belowTarget ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${group.belowTarget ? "#fecaca" : "#bbf7d0"}`,
            }}
          >
            <MDTypography variant="button" fontWeight="bold" color={group.belowTarget ? "error" : "success"}>
              {group.belowTarget
                ? `Below daily target: ₹${money(group.value)} of ₹${money(group.target)} (short ₹${money(group.target - group.value)})`
                : `Daily target met: ₹${money(group.value)} of ₹${money(group.target)}`}
            </MDTypography>
            {blocked && (
              <MDTypography variant="caption" color="text" display="block">
                Approving this day needs Below Target approval. Send a request below, or reject requisitions.
              </MDTypography>
            )}
          </MDBox>
        )}

        <RequestPanel
          group={group}
          request={request}
          lastRejected={lastRejected}
          isAdmin={isAdmin}
          canApprove={canApprove}
          canApproveBelowTarget={canApproveBelowTarget}
          busy={busy}
          onRequest={(day) => run(() => onRequest(day))}
          onReviewRequest={(item, status) => run(() => onReviewRequest(item, status))}
        />

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
                {["Sr No", "Requisition No", "Outlet", "Area", "Items", "Total Qty", "Value", "Total Payable", "Status", ...(isAdmin ? ["Approved / Rejected By"] : []), "Invoice No.", "View", ...(canApprove ? ["Action"] : [])]
                  .map((heading) => <TableCell key={heading} sx={{ fontWeight: 700 }}>{heading}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {group.rows.map((row, index) => (
                <TableRow key={row.id} sx={rowColor(row)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.includes(String(row.id))}
                      onChange={() => toggle(String(row.id))}
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
                  <TableCell>{money(payable(row))}</TableCell>
                  <TableCell>{row.status || "pending"}</TableCell>
                  {isAdmin && (
                    <TableCell sx={{ minWidth: 150 }}>
                      {reviewerLabel(row)}
                      {row.reviewed_by_name && row.reviewed_at_label ? (
                        <MDTypography variant="caption" color="text" display="block">{row.reviewed_at_label}</MDTypography>
                      ) : null}
                    </TableCell>
                  )}
                  <TableCell>{row.invoiced_invoice_number || "—"}</TableCell>
                  <TableCell>
                    <MDButton
                      color="info"
                      variant="text"
                      size="small"
                      title="View / print requisition"
                      onClick={() => printPurchaseRequisitionPdf(row)}
                    >
                      <Icon fontSize="small">visibility</Icon>
                    </MDButton>
                  </TableCell>
                  {canApprove && (
                    <TableCell>
                      {isPending(row) ? (
                        <MDBox display="flex" gap={1}>
                          <MDButton
                            color="success"
                            variant="gradient"
                            size="small"
                            disabled={busy || blocked}
                            title={blocked ? "Below target: needs Below Target Approval" : "Approve"}
                            onClick={() => review([row], "approved")}
                          >
                            <Icon fontSize="small">check</Icon>
                          </MDButton>
                          <MDButton
                            color="error"
                            variant="outlined"
                            size="small"
                            disabled={busy}
                            title="Reject"
                            onClick={() => review([row], "cancelled")}
                          >
                            <Icon fontSize="small">close</Icon>
                          </MDButton>
                        </MDBox>
                      ) : (
                        <Icon fontSize="small" color="success" titleAccess="Reviewed">task_alt</Icon>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <MDButton
          color="dark"
          variant="outlined"
          disabled={!selected.length}
          onClick={() => printPurchaseRequisitionsPdf(group.rows.filter((row) => selected.includes(String(row.id))))}
        >
          <Icon sx={{ mr: 0.5 }}>print</Icon> Print Selected ({selected.length})
        </MDButton>
        {canApprove && (
          <MDBox display="flex" gap={1}>
            <MDButton
              color="error"
              variant="outlined"
              disabled={busy || !pendingRows.length}
              onClick={() => review(pendingRows, "cancelled")}
            >
              Reject All Pending ({pendingRows.length})
            </MDButton>
            <MDButton
              color="success"
              variant="gradient"
              disabled={busy || blocked || !pendingRows.length}
              title={blocked ? "Below target: needs Below Target Approval" : ""}
              onClick={() => review(pendingRows, "approved")}
            >
              Approve All Pending ({pendingRows.length})
            </MDButton>
          </MDBox>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Requisition Approval queue: one line per employee per company per day, with a
 * View dialog to approve / reject that day's requisitions and print a ticked checklist.
 */
function ApprovalQueue({
  rows, loading, filters, canApprove, canApproveBelowTarget, onReview,
  isAdmin = false, requests = [], onRequest, onReviewRequest,
}) {
  const [show, setShow] = useState("all");
  const [openKey, setOpenKey] = useState(null);

  const groups = useMemo(() => groupRequisitionDays(rows), [rows]);
  const dayKey = (request) => `${request.request_date}|${request.staff_id}|${request.company_id}`;
  const pendingRequests = useMemo(() => {
    const map = new Map();
    requests.filter((item) => item.status === "pending").forEach((item) => map.set(dayKey(item), item));
    return map;
  }, [requests]);
  const rejectedRequests = useMemo(() => {
    const map = new Map();
    // Newest first from the server, so keep the first rejected request per day.
    requests.filter((item) => item.status === "rejected").forEach((item) => {
      if (!map.has(dayKey(item))) map.set(dayKey(item), item);
    });
    return map;
  }, [requests]);
  const belowTargetCount = groups.filter((group) => group.belowTarget && group.pending > 0).length;
  const visible = groups.filter((group) => (
    show === "pending" ? group.pending > 0
      : show === "below" ? group.belowTarget && group.pending > 0
        : show === "requests" ? group.pending > 0 && pendingRequests.has(group.key)
          : true
  ));
  const openGroup = groups.find((group) => group.key === openKey) || null;
  const totals = visible.reduce((sum, group) => ({
    count: sum.count + group.count,
    quantity: sum.quantity + group.quantity,
    value: sum.value + group.value,
  }), { count: 0, quantity: 0, value: 0 });

  return (
    <>
      <MDBox display="flex" justifyContent="space-between" alignItems="flex-end" flexWrap="wrap" gap={2} mb={2}>
        <MDBox>
          <MDTypography variant="h6" fontWeight="bold">Requisition Approval</MDTypography>
          <MDTypography variant="caption" color="text">
            One line per employee per day. Open View to approve, reject or print that day&apos;s requisitions.
          </MDTypography>
        </MDBox>
        {filters}
      </MDBox>

      <ToggleButtonGroup
        exclusive
        size="small"
        value={show}
        onChange={(_, value) => value && setShow(value)}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="all">All ({groups.length})</ToggleButton>
        <ToggleButton value="pending">Pending ({groups.filter((group) => group.pending > 0).length})</ToggleButton>
        <ToggleButton value="below" sx={{ color: belowTargetCount ? "#b91c1c" : undefined }}>
          Below Target ({belowTargetCount})
        </ToggleButton>
        <ToggleButton value="requests" sx={{ color: pendingRequests.size ? "#1d4ed8" : undefined }}>
          Approval Requests ({groups.filter((group) => group.pending > 0 && pendingRequests.has(group.key)).length})
        </ToggleButton>
      </ToggleButtonGroup>

      {loading ? (
        <MDTypography variant="body2" color="text">Loading requisitions...</MDTypography>
      ) : visible.length === 0 ? (
        <MDTypography variant="body2" color="text">No requisitions found.</MDTypography>
      ) : (
        <>
          <TableContainer>
            <Table>
              <TableHead sx={{ display: "table-header-group" }}>
                <TableRow>
                  {["Sr No", "Date", "Employee", "Company", "Requisitions", "Items", "Total Qty", "Value", "Daily Target", "Pending", "Action"]
                    .map((heading) => <TableCell key={heading} sx={{ fontWeight: 700 }}>{heading}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((group, index) => (
                  <TableRow key={group.key} sx={group.belowTarget && group.pending > 0 ? { backgroundColor: "#fff7ed" } : {}}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{group.date}</TableCell>
                    <TableCell>{group.staffName}</TableCell>
                    <TableCell>{group.companyName}</TableCell>
                    <TableCell>{group.count}</TableCell>
                    <TableCell>{group.items}</TableCell>
                    <TableCell>{group.quantity.toFixed(2)}</TableCell>
                    <TableCell>{money(group.value)}</TableCell>
                    <TableCell><TargetBadge group={group} /></TableCell>
                    <TableCell>
                      <MDBox display="flex" gap={0.5} flexWrap="wrap">
                        {group.pending > 0
                          ? <Chip size="small" color="warning" label={`${group.pending} pending`} />
                          : <Chip size="small" color="success" variant="outlined" label="Done" />}
                        {group.pending > 0 && pendingRequests.has(group.key) && (
                          <Chip size="small" color="info" label="Request sent" />
                        )}
                      </MDBox>
                    </TableCell>
                    <TableCell>
                      <MDButton color="info" variant="gradient" size="small" onClick={() => setOpenKey(group.key)}>
                        View
                      </MDButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <MDTypography variant="caption" color="text" display="block" mt={1.5}>
            Total: {totals.count} requisitions · {totals.quantity.toFixed(2)} qty · Value: ₹{money(totals.value)}
          </MDTypography>
        </>
      )}

      <DayDialog
        group={openGroup}
        onClose={() => setOpenKey(null)}
        canApprove={canApprove}
        canApproveBelowTarget={canApproveBelowTarget}
        onReview={onReview}
        isAdmin={isAdmin}
        request={openGroup ? pendingRequests.get(openGroup.key) || null : null}
        lastRejected={openGroup ? rejectedRequests.get(openGroup.key) || null : null}
        onRequest={onRequest}
        onReviewRequest={onReviewRequest}
      />
    </>
  );
}

export default ApprovalQueue;
