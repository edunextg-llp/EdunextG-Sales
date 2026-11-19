import { useCallback, useEffect, useState } from "react";
import { Alert, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Tooltip } from "@mui/material";
import Icon from "@mui/material/Icon";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import { useAuth } from "context/AuthContext";

const API = process.env.REACT_APP_API_URL;
const ASSIGNEE_ROLES = ["delivery_boy", "packaging_staff", "staff"];
const REFRESH_MS = 60 * 1000;
const authHeaders = (extra = {}) => ({ Authorization: `Bearer ${localStorage.getItem("token")}`, ...extra });
const showDate = (iso) => String(iso || "").split("-").reverse().join("-");
const rupees = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Auto Add Sales approval: an invoice from a Dashboard > Assign "Add Sales" PDF that needs
// permission (another day's bit / overdue credit) and the logged-in assignee has the own
// permission. They give a reason and approve (the sale is created) or reject it.
function AutoSalesApprovals() {
  const { user } = useAuth();
  const enabled = ASSIGNEE_ROLES.includes(user?.role);
  const [items, setItems] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`${API}/my-document-assignments/auto-sales-approvals`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch { /* next refresh will retry */ }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, load]);

  const current = items[0];
  useEffect(() => { setError(""); setNote(""); }, [current?.assignmentId, current?.invoiceNumber]);
  if (!enabled || !current || hidden) return null;

  const decide = async (approve) => {
    if (approve && !note.trim()) {
      setError("Enter the reason for adding this sale on your own permission.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API}/my-document-assignments/auto-sales-approvals`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ assignmentId: current.assignmentId, invoiceNumber: current.invoiceNumber, approve, note: note.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to save your approval.");
      if (approve && data.result?.status !== "created") {
        // Something changed (e.g. the date passed): show why and move on after a refresh.
        setError(data.message || "The sale could not be created.");
        await load();
        return;
      }
      setItems((list) => list.slice(1));
    } catch (e) {
      setError(e.message || "Unable to save your approval.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => setHidden(true)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Icon>fact_check</Icon> Auto Add Sales approval
        {items.length > 1 ? <MDTypography variant="caption" color="text" sx={{ ml: 1 }}>1 of {items.length}</MDTypography> : null}
        <Tooltip title="Close (it stays waiting)">
          <IconButton aria-label="Close" size="small" onClick={() => setHidden(true)} sx={{ ml: "auto" }}><Icon fontSize="small">close</Icon></IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers>
        <MDTypography variant="button" fontWeight="bold" display="block">{current.outletName}</MDTypography>
        <MDTypography variant="caption" color="text" display="block">
          {current.companyName} · Invoice {current.invoiceNumber}{current.invoiceDate ? ` · ${showDate(current.invoiceDate)}` : ""}
        </MDTypography>
        <MDTypography variant="caption" color="text" display="block">
          {rupees(current.amount)}{current.itemCount ? ` · ${current.itemCount} item(s)` : ""}
        </MDTypography>
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {current.kind === "overdue" ? `Credit overdue ${current.days} days.` : "Another day's bit outlet."} {current.reason}
        </Alert>
        <TextField
          fullWidth size="small" multiline minRows={2} sx={{ mt: 1.5 }}
          label="Reason (own permission)" value={note}
          inputProps={{ maxLength: 1000 }}
          onChange={(e) => setNote(e.target.value)}
        />
        {error ? <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert> : null}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 2, py: 1.5 }}>
        <MDButton variant="text" color="error" disabled={busy} onClick={() => decide(false)}>
          <Icon sx={{ mr: 0.75 }}>block</Icon> Reject
        </MDButton>
        <MDButton variant="gradient" color="success" disabled={busy} onClick={() => decide(true)}>
          <Icon sx={{ mr: 0.75 }}>check_circle</Icon> Approve &amp; add sale
        </MDButton>
      </DialogActions>
    </Dialog>
  );
}

export default AutoSalesApprovals;
