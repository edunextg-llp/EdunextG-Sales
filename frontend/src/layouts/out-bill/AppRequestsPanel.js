import React, { useState } from "react";
import PropTypes from "prop-types";
import {
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

import { CreditPhotoLink } from "components/CreditPhoto";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import {
  compactTableTextSx,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB");
};

/** Staff app requests to take or return an Out Bill, waiting for the office. */
function AppRequestsPanel({ apiUrl, requests, onReviewed }) {
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");

  const review = async (request, action, note = "") => {
    setBusyId(request.id);
    try {
      const response = await fetch(`${apiUrl}/staff/credits/requests/${request.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || "Failed to review the request.");
        // Someone else may have changed this bill, so show the current list.
        await onReviewed();
        return false;
      }
      await onReviewed();
      return true;
    } catch (error) {
      console.error("Error reviewing Out Bill request:", error);
      alert("Error reviewing the request.");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const closeRejectDialog = () => {
    setRejecting(null);
    setReason("");
  };

  const submitReject = async () => {
    if (!reason.trim()) {
      alert("Please enter a reason.");
      return;
    }
    if (await review(rejecting, "reject", reason.trim())) closeRejectDialog();
  };

  return (
    <>
      <TableContainer component={Paper} sx={{ ...paginatedTableContainerSx, backgroundColor: "transparent" }}>
        <Table stickyHeader size="small" sx={compactTableTextSx}>
          <TableHead sx={paginatedTableHeadSx()}>
            <TableRow>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Request</TableCell>
              <TableCell align="left" sx={paginatedTableHeadCellSx}>Outlet Name</TableCell>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Area</TableCell>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Sale ID</TableCell>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Invoice No</TableCell>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Staff</TableCell>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Company</TableCell>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Outstanding Balance</TableCell>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Waiting in D.B. Collection</TableCell>
              <TableCell align="left" sx={paginatedTableHeadCellSx}>Remarks</TableCell>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Requested On</TableCell>
              <TableCell align="center" sx={paginatedTableHeadCellSx}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell align="center">
                  <Chip
                    color={request.request_type === "take" ? "info" : "warning"}
                    label={request.request_type === "take" ? "Take Bill" : "Return Bill"}
                    size="small"
                  />
                </TableCell>
                <TableCell align="left">{request.outlet_name || "N/A"}</TableCell>
                <TableCell align="center">{request.location_name || "N/A"}</TableCell>
                <TableCell align="center">{request.sticker_number || `BP${request.sale_id}`}</TableCell>
                <TableCell align="center">
                  {request.invoice_number}
                  <CreditPhotoLink url={request.credit_photo_url} />
                </TableCell>
                <TableCell align="center">{request.staff_name}</TableCell>
                <TableCell align="center">{request.company_name}</TableCell>
                <TableCell align="center" sx={{ color: "error.main", fontWeight: "bold" }}>
                  ₹{Number(request.balance_amount).toFixed(2)}
                </TableCell>
                <TableCell align="center">₹{Number(request.pending_amount).toFixed(2)}</TableCell>
                <TableCell align="left" sx={{ whiteSpace: "pre-wrap", minWidth: 180 }}>{request.remarks || "-"}</TableCell>
                <TableCell align="center">{formatDateTime(request.requested_at)}</TableCell>
                <TableCell align="center">
                  <MDBox display="flex" gap={1} justifyContent="center">
                    <MDButton
                      color="success"
                      disabled={busyId === request.id}
                      onClick={() => review(request, "approve")}
                      size="small"
                      variant="gradient"
                    >
                      Approve
                    </MDButton>
                    <MDButton
                      color="error"
                      disabled={busyId === request.id}
                      onClick={() => setRejecting(request)}
                      size="small"
                      variant="outlined"
                    >
                      Reject
                    </MDButton>
                  </MDBox>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {requests.length === 0 && (
          <MDBox my={4} textAlign="center">
            <MDTypography variant="body2" color="text">
              No requests from the staff app are waiting.
            </MDTypography>
          </MDBox>
        )}
      </TableContainer>

      <Dialog open={Boolean(rejecting)} onClose={closeRejectDialog} fullWidth maxWidth="sm">
        <DialogTitle>Reject Request</DialogTitle>
        <DialogContent dividers>
          <MDBox display="flex" flexDirection="column" gap={2}>
            <MDTypography variant="body2" color="text">
              {rejecting?.staff_name} will see this reason in the app for invoice {rejecting?.invoice_number}.
            </MDTypography>
            <MDInput
              fullWidth
              inputProps={{ maxLength: 500 }}
              label="Reason"
              multiline
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              value={reason}
            />
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" disabled={Boolean(busyId)} onClick={closeRejectDialog}>
            Cancel
          </MDButton>
          <MDButton color="error" disabled={Boolean(busyId)} onClick={submitReject} variant="gradient">
            Reject
          </MDButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

AppRequestsPanel.propTypes = {
  apiUrl: PropTypes.string,
  onReviewed: PropTypes.func.isRequired,
  requests: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number.isRequired })).isRequired,
};

AppRequestsPanel.defaultProps = {
  apiUrl: "",
};

export default AppRequestsPanel;
