import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";

const API = process.env.REACT_APP_API_URL;

export const BIT_TIME_ZONE = "Asia/Kolkata";

export const todayDayName = () =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: BIT_TIME_ZONE }).format(new Date());

// Today's date in India as YYYY-MM-DD.
export const todayDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: BIT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// CNF outlets have no weekday, so on today's date they are always billable.
export const isTodaysBit = (outletDay, today = todayDayName()) => {
  const day = String(outletDay || "").trim().toLowerCase();
  if (!day) return true; // unknown day: let the server decide
  return day === "cnf" || day === String(today).toLowerCase();
};

const STATUS = {
  pending: { label: "Waiting for admin approval", color: "warning" },
  approved: { label: "Approved — you can add the sale", color: "success" },
  rejected: { label: "Rejected", color: "error" },
  used: { label: "Approval already used", color: "secondary" },
};

/**
 * Shown when Add Sales is blocked because an outlet belongs to another day's bit.
 * The user sends a request; once admin approves every outlet, "Add Sales" retries the save.
 */
function OtherDayBitDialog({ open, staffId, saleDate, todayDay, reason, outlets, initialRequests, onClose, onRetry, retrying }) {
  const [requests, setRequests] = useState([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setRequests(initialRequests || []);
      setNote("");
      setError("");
    }
  }, [open, initialRequests]);

  const requestByOutlet = useMemo(() => {
    const map = new Map();
    requests.forEach((request) => map.set(Number(request.outlet_id), request));
    return map;
  }, [requests]);

  const states = outlets.map((outlet) => requestByOutlet.get(Number(outlet.outletId))?.status || "none");
  const allApproved = states.length > 0 && states.every((status) => status === "approved");
  const anyPending = states.some((status) => status === "pending");
  const needsRequest = states.some((status) => ["none", "rejected", "used"].includes(status));

  const refresh = async () => {
    if (!staffId || !outlets.length) return;
    try {
      const params = new URLSearchParams({
        staffId: String(staffId),
        saleDate,
        outletIds: outlets.map((outlet) => outlet.outletId).join(","),
      });
      const response = await fetch(`${API}/staff/other-day-requests?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) setRequests(data.requests || []);
    } catch (err) {
      console.error("Error loading other-day bit requests:", err);
    }
  };

  // While waiting for admin, check every 15 seconds.
  useEffect(() => {
    if (!open || !anyPending) return undefined;
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anyPending, staffId, saleDate, outlets]);

  const sendRequest = async () => {
    const reason = note.trim();
    if (!reason) {
      setError("Reason for request is required.");
      return;
    }
    const outletIds = outlets
      .filter((outlet) => {
        const status = requestByOutlet.get(Number(outlet.outletId))?.status;
        return !status || ["rejected", "used"].includes(status);
      })
      .map((outlet) => outlet.outletId);

    setSending(true);
    setError("");
    try {
      const response = await fetch(`${API}/staff/other-day-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, saleDate, outletIds, note: reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to send the request.");
      setRequests((prev) => {
        const merged = new Map(prev.map((request) => [Number(request.outlet_id), request]));
        (data.requests || []).forEach((request) => merged.set(Number(request.outlet_id), request));
        return [...merged.values()];
      });
      setNote("");
    } catch (err) {
      setError(err.message || "Unable to send the request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={sending || retrying ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Admin Approval Required — {reason === "other_date" ? "Other Date" : "Other Day Bit"}
      </DialogTitle>
      <DialogContent dividers>
        <MDTypography variant="body2" color="text" mb={2}>
          {reason === "other_date" ? (
            <>
              You can add sales directly only for <strong>today&apos;s date</strong> ({todayDate()}). This entry is for{" "}
              <strong>{saleDate}</strong>, so send a request to admin. Once it is approved, you can add the
              sale for these outlets on {saleDate}.
            </>
          ) : (
            <>
              Today is <strong>{todayDay || todayDayName()}</strong>. You can add sales directly only for
              today&apos;s bit. The outlets below belong to another day&apos;s bit, so send a request to
              admin. Once it is approved, you can add the sale for these outlets on {saleDate}.
            </>
          )}
        </MDTypography>

        {outlets.map((outlet) => {
          const request = requestByOutlet.get(Number(outlet.outletId));
          const statusInfo = request ? STATUS[request.status] : null;
          return (
            <MDBox
              key={outlet.outletId}
              mb={1.5}
              p={1.5}
              sx={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px" }}
            >
              <MDBox display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                <MDBox>
                  <MDTypography variant="button" fontWeight="bold" color="dark" display="block">
                    {outlet.outletName}
                  </MDTypography>
                  <MDTypography variant="caption" color="text">
                    ERP: {outlet.outletErpId || "—"} · Bit: {outlet.outletDay || "—"}
                  </MDTypography>
                </MDBox>
                {statusInfo && (
                  <MDBadge badgeContent={statusInfo.label} color={statusInfo.color} variant="gradient" size="sm" container />
                )}
              </MDBox>
              {request?.status === "rejected" && request.review_note && (
                <MDTypography variant="caption" color="error" display="block" mt={0.5}>
                  Admin: {request.review_note}
                </MDTypography>
              )}
            </MDBox>
          );
        })}

        {needsRequest && (
          <MDBox mt={2}>
            <MDInput
              label="Reason for request *"
              fullWidth
              multiline
              rows={2}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setError("");
              }}
              placeholder="e.g. Outlet was closed on its bit day, delivery requested today"
            />
          </MDBox>
        )}
        {error && (
          <MDTypography variant="caption" color="error" display="block" mt={1}>
            {error}
          </MDTypography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: "wrap", gap: 1 }}>
        <MDButton variant="outlined" color="secondary" onClick={onClose} disabled={sending || retrying}>
          Close
        </MDButton>
        {anyPending && (
          <MDButton variant="outlined" color="info" onClick={refresh} disabled={sending || retrying}>
            <Icon sx={{ mr: 0.75 }}>refresh</Icon>
            Check Status
          </MDButton>
        )}
        {needsRequest && (
          <MDButton color="info" variant="gradient" onClick={sendRequest} disabled={sending || retrying || !note.trim()}>
            <Icon sx={{ mr: 0.75 }}>send</Icon>
            {sending ? "Sending..." : "Send Request"}
          </MDButton>
        )}
        <MDButton color="success" variant="gradient" onClick={onRetry} disabled={retrying || !allApproved}>
          <Icon sx={{ mr: 0.75 }}>{allApproved ? "check_circle" : "lock"}</Icon>
          {retrying ? "Saving..." : "Add Sales"}
        </MDButton>
      </DialogActions>
    </Dialog>
  );
}

OtherDayBitDialog.defaultProps = {
  todayDay: "",
  reason: "other_day",
  initialRequests: [],
  retrying: false,
};

OtherDayBitDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  staffId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  saleDate: PropTypes.string.isRequired,
  todayDay: PropTypes.string,
  reason: PropTypes.string,
  outlets: PropTypes.arrayOf(PropTypes.object).isRequired,
  initialRequests: PropTypes.arrayOf(PropTypes.object),
  onClose: PropTypes.func.isRequired,
  onRetry: PropTypes.func.isRequired,
  retrying: PropTypes.bool,
};

export default OtherDayBitDialog;
