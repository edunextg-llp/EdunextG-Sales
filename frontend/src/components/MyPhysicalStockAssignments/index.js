import { useCallback, useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Fab, IconButton, Tooltip } from "@mui/material";
import Icon from "@mui/material/Icon";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import { useAuth } from "context/AuthContext";

const API = process.env.REACT_APP_API_URL;
const REFRESH_MS = 60 * 1000;
// The DMS app's Physical Stock page; it opens the assigned company by itself.
const DMS_PHYSICAL_STOCK_URL = "/dms/physical-stock";
const DISMISS_KEY = "physical_stock_assignments_seen";

const showDate = (value) => {
  const [y, m, d] = String(value || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};

// Pops up physical stock counts the admin assigned to the logged-in user (DMS → Physical
// Stock → Assign). "Later" hides the popup for this session; a small button stays in the
// corner to open it again until the count is marked done.
function MyPhysicalStockAssignments() {
  const { user, token } = useAuth();
  const enabled = Boolean(token) && Boolean(user) && user.role !== "admin";
  const [assignments, setAssignments] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`${API}/my-physical-stock`);
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.assignments) ? data.assignments : [];
      setAssignments(list);
      // Open by itself when something new is assigned (not already seen this session).
      const seen = sessionStorage.getItem(DISMISS_KEY) || "";
      const ids = list.map((a) => a.id).join(",");
      if (list.length && ids !== seen) setOpen(true);
    } catch {
      /* next refresh will retry */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, load]);

  if (!enabled || !assignments.length) return null;

  const later = () => {
    sessionStorage.setItem(DISMISS_KEY, assignments.map((a) => a.id).join(","));
    setOpen(false);
  };

  return (
    <>
      {!open && (
        <Tooltip title="Physical stock assigned to you">
          <Fab
            color="info"
            size="medium"
            onClick={() => setOpen(true)}
            sx={{ position: "fixed", left: 24, bottom: 24, zIndex: 1250 }}
          >
            <Icon>inventory</Icon>
          </Fab>
        </Tooltip>
      )}
      <Dialog open={open} onClose={later} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 1 }}>
          <Icon>assignment_ind</Icon> Physical stock assigned
          <IconButton aria-label="Close" size="small" onClick={later} sx={{ ml: "auto" }}>
            <Icon fontSize="small">close</Icon>
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="caption" color="text" display="block" sx={{ mb: 1 }}>
            Count the stock of {assignments.length === 1 ? "this company" : "these companies"} and save it on Physical Stock.
          </MDTypography>
          {assignments.map((a) => (
            <div key={a.id} style={{ padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <MDTypography variant="button" fontWeight="medium" display="block">
                {a.company_name}
                {a.assign_code ? (
                  <span style={{ marginLeft: 8, fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>{a.assign_code}</span>
                ) : null}
              </MDTypography>
              <MDTypography variant="caption" color="text" display="block">
                {a.items.length} item{a.items.length === 1 ? "" : "s"} updated
                {a.start_date
                  ? ` · ${a.start_date === a.end_date ? `On ${showDate(a.start_date)}` : `${showDate(a.start_date)} to ${showDate(a.end_date)}`}`
                  : ""}
                {a.assigned_by_name ? ` · Assigned by ${a.assigned_by_name}` : ""}
              </MDTypography>
              {a.window_state && a.window_state !== "active" ? (
                <MDTypography variant="caption" display="block" color={a.window_state === "expired" ? "error" : "info"}>
                  {a.window_state === "upcoming"
                    ? `You can fill entries from ${showDate(a.start_date)}.`
                    : "The assigned days are over. Ask the admin to extend them."}
                </MDTypography>
              ) : null}
              {a.note ? (
                <MDTypography variant="caption" display="block" sx={{ whiteSpace: "pre-wrap" }}>
                  Note: {a.note}
                </MDTypography>
              ) : null}
            </div>
          ))}
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between", px: 2, py: 1.5 }}>
          <Button size="small" onClick={later}>
            Later
          </Button>
          <MDButton variant="gradient" color="info" onClick={() => { window.location.href = DMS_PHYSICAL_STOCK_URL; }}>
            <Icon sx={{ mr: 0.75 }}>inventory</Icon> Open Physical Stock
          </MDButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default MyPhysicalStockAssignments;
