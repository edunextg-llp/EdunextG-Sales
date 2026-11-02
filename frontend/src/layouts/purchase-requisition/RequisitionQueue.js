import { useCallback, useEffect, useState } from "react";
import {
  Alert, Card, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Icon,
  IconButton, LinearProgress, Tab, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, Tooltip,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import { printPurchaseRequisitionPdf } from "utils/printPurchaseRequisitionPdf";

const API = process.env.REACT_APP_API_URL;

const STAGES = {
  queue: { label: "In queue", color: "info", icon: "playlist_add_check" },
  admin: { label: "Waiting for Admin approval", color: "warning", icon: "admin_panel_settings" },
  rejected: { label: "Rejected by Admin", color: "error", icon: "block" },
  approval: { label: "Waiting for approval", color: "primary", icon: "hourglass_top" },
  done: { label: "Completed", color: "success", icon: "task_alt" },
};

const FILTERS = [
  { value: "all", label: "All", match: () => true },
  { value: "queue", label: "In Queue", match: (day) => day.stage === "queue" },
  { value: "waiting", label: "Waiting", match: (day) => ["admin", "approval", "rejected"].includes(day.stage) },
  { value: "done", label: "Completed", match: (day) => day.stage === "done" },
];

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function DateBlock({ date }) {
  const value = new Date(`${date}T00:00:00`);
  const isToday = date === todayKey();
  return (
    <MDBox
      textAlign="center"
      borderRadius="lg"
      px={1.5}
      py={1}
      minWidth={76}
      sx={{ backgroundColor: isToday ? "#1A73E8" : "#f1f5f9" }}
    >
      <MDTypography variant="caption" fontWeight="bold" display="block" color={isToday ? "white" : "text"}>
        {isToday ? "TODAY" : value.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase()}
      </MDTypography>
      <MDTypography variant="h4" fontWeight="bold" lineHeight={1.1} color={isToday ? "white" : "dark"}>
        {value.getDate()}
      </MDTypography>
      <MDTypography variant="caption" display="block" color={isToday ? "white" : "text"}>
        {value.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
      </MDTypography>
    </MDBox>
  );
}

function SummaryTile({ icon, color, label, value, hint }) {
  return (
    <Card sx={{ height: "100%" }}>
      <MDBox p={2} display="flex" alignItems="center" gap={2}>
        <MDBox
          display="flex"
          alignItems="center"
          justifyContent="center"
          width={44}
          height={44}
          borderRadius="lg"
          bgColor={color}
          color="white"
          flexShrink={0}
        >
          <Icon fontSize="small">{icon}</Icon>
        </MDBox>
        <MDBox minWidth={0}>
          <MDTypography variant="caption" color="text" display="block">{label}</MDTypography>
          <MDTypography variant="h5" fontWeight="bold" lineHeight={1.2}>{value}</MDTypography>
          <MDTypography variant="caption" color="text">{hint}</MDTypography>
        </MDBox>
      </MDBox>
    </Card>
  );
}

function DayCard({ day, expanded, onToggle, onSubmit, onDelete, deletingId }) {
  const stage = STAGES[day.stage] || STAGES.done;
  const percent = day.target ? Math.min(100, (day.achieved / day.target) * 100) : 0;
  return (
    <Card sx={{ mb: 2, borderLeft: "4px solid", borderLeftColor: `${stage.color}.main` }}>
      <MDBox p={2.5}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs="auto"><DateBlock date={day.date} /></Grid>
          <Grid item xs={12} sm>
            <MDBox display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
              <MDTypography variant="h6" fontWeight="medium">{day.companyName}</MDTypography>
              <Chip
                size="small"
                color={stage.color}
                icon={<Icon fontSize="small">{stage.icon}</Icon>}
                label={stage.label}
              />
            </MDBox>
            <MDBox display="flex" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <MDTypography variant="button" color="text">
                {money(day.achieved)} of {money(day.target)}
              </MDTypography>
              <MDTypography variant="button" fontWeight="bold" color={day.belowTarget ? "error" : "success"}>
                {day.belowTarget ? `Short by ${money(day.short)}` : "Target completed"}
              </MDTypography>
            </MDBox>
            <LinearProgress
              variant="determinate"
              value={percent}
              color={day.belowTarget ? "warning" : "success"}
              sx={{ height: 8, borderRadius: 4, mt: 0.75, "& .MuiLinearProgress-bar": { borderRadius: 4 } }}
            />
          </Grid>
          <Grid item xs={12} md="auto">
            <MDBox display="flex" gap={1} justifyContent="flex-end" flexWrap="wrap">
              <MDButton variant="outlined" color="dark" size="small" onClick={onToggle}>
                <Icon sx={{ mr: 0.5 }}>{expanded ? "expand_less" : "expand_more"}</Icon>
                {day.requisitions.length} requisition{day.requisitions.length === 1 ? "" : "s"}
              </MDButton>
              {day.draftCount > 0 && (
                <MDButton
                  variant="gradient"
                  color={day.belowTarget ? "warning" : "success"}
                  size="small"
                  onClick={() => onSubmit(day)}
                >
                  <Icon sx={{ mr: 0.5 }}>task_alt</Icon>
                  Final Submit ({day.draftCount})
                </MDButton>
              )}
            </MDBox>
          </Grid>
        </Grid>

        {day.draftCount === 0 && day.belowTarget && day.reason && (
          <MDBox mt={1.5} px={1.5} py={1} borderRadius="md" sx={{ backgroundColor: "#fff7ed" }}>
            <MDTypography variant="caption" display="block"><strong>Your reason:</strong> {day.reason}</MDTypography>
            {day.adminNote && (
              <MDTypography variant="caption" display="block"><strong>Admin note:</strong> {day.adminNote}</MDTypography>
            )}
          </MDBox>
        )}

        <Collapse in={expanded} unmountOnExit>
          <TableContainer sx={{ mt: 2, boxShadow: "none" }}>
            <Table size="small">
              <TableHead sx={{ display: "table-header-group" }}>
                <TableRow>
                  {["Requisition No", "Outlet", "Items", "Value", "Status", ""].map((heading) => (
                    <TableCell key={heading} sx={{ fontWeight: 700, fontSize: 13 }}>{heading}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {day.requisitions.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell sx={{ fontSize: 13, fontWeight: 600 }}>{row.requisition_number}</TableCell>
                    <TableCell sx={{ fontSize: 13 }}>{row.outlet_name}</TableCell>
                    <TableCell sx={{ fontSize: 13 }}>{row.item_count}</TableCell>
                    <TableCell sx={{ fontSize: 13 }}>{money(row.total_amount)}</TableCell>
                    <TableCell sx={{ fontSize: 13, textTransform: "capitalize" }}>
                      {row.status === "draft" ? "In queue" : row.status}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title="View">
                        <IconButton size="small" color="info" onClick={() => printPurchaseRequisitionPdf(row)}>
                          <Icon fontSize="small">visibility</Icon>
                        </IconButton>
                      </Tooltip>
                      {["draft", "pending"].includes(row.status) && (
                        <Tooltip title="Delete">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={deletingId === row.id}
                              onClick={() => onDelete(row)}
                            >
                              <Icon fontSize="small">delete</Icon>
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Collapse>
      </MDBox>
    </Card>
  );
}

/** Queue tab of the Purchase Requisition page. `onChanged` reloads the page; `refreshKey` reloads this list. */
function RequisitionQueue({ refreshKey, onChanged }) {
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState({});
  const [notice, setNotice] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDay, setConfirmDay] = useState(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/staff/purchase-requisitions/queue`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load your Requisition Queue.");
      setDays(Array.isArray(data.days) ? data.days : []);
      setLoadError("");
    } catch (error) {
      setLoadError(error.message || "Unable to load your Requisition Queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const openSubmit = (day) => {
    setConfirmDay(day);
    setReason("");
    setSubmitError("");
  };

  const submit = async () => {
    if (confirmDay.belowTarget && !reason.trim()) {
      setSubmitError("Enter the reason for submitting below the daily target.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch(`${API}/staff/purchase-requisitions/final-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: confirmDay.companyId,
          date: confirmDay.date,
          confirmBelowTarget: true,
          note: reason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSubmitError(data.error || "Unable to Final Submit.");
        return;
      }
      setNotice(data.message || "Submitted.");
      setConfirmDay(null);
      await onChanged();
    } catch (error) {
      setSubmitError(error.message || "Unable to Final Submit.");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete requisition ${row.requisition_number} for ${row.outlet_name}?`)) return;
    setDeletingId(row.id);
    try {
      const response = await fetch(`${API}/staff/purchase-requisitions/${row.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) alert(data.error || "Unable to delete the requisition.");
      await onChanged();
    } catch (error) {
      alert(error.message || "Unable to delete the requisition.");
    } finally {
      setDeletingId(null);
    }
  };

  const queued = days.filter((day) => day.stage === "queue");
  const waiting = days.filter((day) => ["admin", "approval", "rejected"].includes(day.stage));
  const activeFilter = FILTERS.find((option) => option.value === filter) || FILTERS[0];
  const visible = days.filter(activeFilter.match);

  return (
    <>
      <MDBox>
        <MDTypography variant="button" color="text" display="block" mb={2}>
          Your requisitions wait here, date by date, until you Final Submit them.
        </MDTypography>

        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} md={4}>
            <SummaryTile
              icon="playlist_add_check"
              color="info"
              label="In queue"
              value={money(queued.reduce((total, day) => total + day.draftTotal, 0))}
              hint={`${queued.reduce((total, day) => total + day.draftCount, 0)} not submitted yet`}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <SummaryTile
              icon="hourglass_top"
              color="warning"
              label="Dates waiting for approval"
              value={waiting.length}
              hint={`${waiting.filter((day) => day.stage === "admin").length} need Admin approval`}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <SummaryTile
              icon="task_alt"
              color="success"
              label="Dates with target completed"
              value={days.filter((day) => !day.belowTarget).length}
              hint={`of ${days.length} date${days.length === 1 ? "" : "s"} shown`}
            />
          </Grid>
        </Grid>

        {notice && <Alert severity="success" onClose={() => setNotice("")} sx={{ mb: 2 }}>{notice}</Alert>}
        {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}

        <Tabs value={filter} onChange={(_, value) => setFilter(value)} sx={{ mb: 2, maxWidth: 560 }}>
          {FILTERS.map((option) => (
            <Tab
              key={option.value}
              value={option.value}
              label={`${option.label} (${days.filter(option.match).length})`}
              sx={{ textTransform: "none", fontWeight: 600 }}
            />
          ))}
        </Tabs>

        {loading && <MDTypography variant="body2" color="text">Loading your queue...</MDTypography>}
        {!loading && !loadError && visible.length === 0 && (
          <Card>
            <MDBox p={5} textAlign="center">
              <Icon fontSize="large" color="disabled">inbox</Icon>
              <MDTypography variant="h6" mt={1}>Nothing here</MDTypography>
              <MDTypography variant="button" color="text">
                Requisitions for companies with a daily target appear here after you create them.
              </MDTypography>
            </MDBox>
          </Card>
        )}
        {visible.map((day) => (
          <DayCard
            key={day.key}
            day={day}
            expanded={expanded[day.key] ?? day.draftCount > 0}
            onToggle={() => setExpanded((current) => ({
              ...current,
              [day.key]: !(current[day.key] ?? day.draftCount > 0),
            }))}
            onSubmit={openSubmit}
            onDelete={remove}
            deletingId={deletingId}
          />
        ))}
      </MDBox>

      <Dialog open={Boolean(confirmDay)} onClose={() => !submitting && setConfirmDay(null)} fullWidth maxWidth="sm">
        <DialogTitle>{confirmDay?.belowTarget ? "Below daily target" : "Final Submit"}</DialogTitle>
        <DialogContent dividers>
          {confirmDay && (
            <>
              <MDTypography variant="body2" mb={2}>
                {confirmDay.belowTarget
                  ? `You have done ${money(confirmDay.achieved)} of ${money(confirmDay.target)} on ${confirmDay.date}, short by ${money(confirmDay.short)}. These requisitions will need Admin approval.`
                  : `Target completed. Send ${confirmDay.draftCount} ${confirmDay.companyName} requisition${confirmDay.draftCount === 1 ? "" : "s"} of ${confirmDay.date} for approval?`}
              </MDTypography>
              {confirmDay.belowTarget && (
                <MDInput
                  label="Reason for Admin (required)"
                  multiline
                  rows={3}
                  fullWidth
                  autoFocus
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  inputProps={{ maxLength: 1000 }}
                />
              )}
              {submitError && <Alert severity="error" sx={{ mt: 2 }}>{submitError}</Alert>}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton variant="text" color="dark" disabled={submitting} onClick={() => setConfirmDay(null)}>
            Not now
          </MDButton>
          <MDButton
            variant="gradient"
            color={confirmDay?.belowTarget ? "warning" : "success"}
            disabled={submitting}
            onClick={submit}
          >
            {submitting ? "Submitting..." : confirmDay?.belowTarget ? "Send for Admin approval" : "Final Submit"}
          </MDButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default RequisitionQueue;
