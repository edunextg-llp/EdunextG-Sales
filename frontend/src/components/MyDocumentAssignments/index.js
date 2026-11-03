import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Tooltip } from "@mui/material";
import Icon from "@mui/material/Icon";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import { useAuth } from "context/AuthContext";
import { downloadAssignmentFile, printAssignmentFile, viewAssignmentFile } from "utils/assignmentFile";

const API = process.env.REACT_APP_API_URL;
const ASSIGNEE_ROLES = ["delivery_boy", "packaging_staff", "staff"];
const REFRESH_MS = 60 * 1000;
const ASSIGNMENTS_CHANGED_EVENT = "document-assignments-changed";
const authHeaders = (extra = {}) => ({ Authorization: `Bearer ${localStorage.getItem("token")}`, ...extra });

// Pops up documents the admin assigned to the logged-in delivery account
// (Dashboard → Assign), one at a time, with Print / Save and Done / Cancel.
function MyDocumentAssignments() {
  const { user } = useAuth();
  const enabled = ASSIGNEE_ROLES.includes(user?.role);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`${API}/my-document-assignments`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setPending(Array.isArray(data) ? data.filter((item) => item.status === "assigned") : []);
    } catch { /* next refresh will retry */ }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener(ASSIGNMENTS_CHANGED_EVENT, load);
    return () => { clearInterval(timer); window.removeEventListener(ASSIGNMENTS_CHANGED_EVENT, load); };
  }, [enabled, load]);

  const current = pending[0];
  useEffect(() => { setError(""); }, [current?.id]);
  if (!enabled || !current) return null;

  const openDocument = async (action) => {
    setError("");
    setBusy(true);
    try {
      if (action === "print") await printAssignmentFile("mine", current.id);
      else if (action === "save") await downloadAssignmentFile("mine", current.id);
      else await viewAssignmentFile("mine", current.id);
    } catch (e) {
      setError(e.message || "Unable to open the document.");
    } finally {
      setBusy(false);
    }
  };

  const update = async (status) => {
    if (status === "cancelled" && !window.confirm(`Cancel this task?\n\n"${current.document_name}" will be marked as Cancelled and the admin will see it. Use the X button if you only want to close this window.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API}/my-document-assignments/${current.id}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to update assignment.");
      setPending((rows) => rows.slice(1));
      window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED_EVENT));
    } catch (e) {
      setError(e.message || "Unable to update assignment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={() => setPending((rows) => rows.slice(1))} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
        <Icon>assignment_ind</Icon> Assigned document
        {pending.length > 1 ? <MDTypography variant="caption" color="text" sx={{ ml: 1 }}>1 of {pending.length}</MDTypography> : null}
        <Tooltip title="Close (task stays pending)">
          <IconButton aria-label="Close" size="small" onClick={() => setPending((rows) => rows.slice(1))} sx={{ ml: "auto" }}><Icon fontSize="small">close</Icon></IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent dividers>
        <MDTypography variant="caption" color="text" display="block">
          {current.company_name || "Company"} · {current.area} · {String(current.work_date).slice(0, 10)}
        </MDTypography>
        {current.marketing_staff_name ? <MDTypography variant="caption" color="text" display="block">Marketing person: {current.marketing_staff_name}</MDTypography> : null}
        <MDTypography variant="button" fontWeight="medium" display="block" sx={{ mt: 1, wordBreak: "break-word" }}>
          <a href="#view" onClick={(e) => { e.preventDefault(); openDocument("view"); }} style={{ color: "#1976d2" }}>{current.document_name}</a>
        </MDTypography>
        {current.remarks ? <MDTypography variant="caption" display="block" sx={{ mt: 1, whiteSpace: "pre-wrap" }}>Remarks: {current.remarks}</MDTypography> : null}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="outlined" size="small" disabled={busy} startIcon={<Icon>print</Icon>} onClick={() => openDocument("print")} sx={{ color: "#1976d2" }}>Print</Button>
          <Button variant="outlined" size="small" disabled={busy} startIcon={<Icon>download</Icon>} onClick={() => openDocument("save")} sx={{ color: "#1976d2" }}>Save document</Button>
        </Stack>
        {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 2, py: 1.5 }}>
        <MDButton variant="text" color="error" disabled={busy} onClick={() => update("cancelled")}>
          <Icon sx={{ mr: 0.75 }}>block</Icon> Cancel task
        </MDButton>
        <MDButton variant="gradient" color="success" disabled={busy} onClick={() => update("done")}>
          <Icon sx={{ mr: 0.75 }}>check_circle</Icon> Mark as done
        </MDButton>
      </DialogActions>
    </Dialog>
  );
}

export default MyDocumentAssignments;
