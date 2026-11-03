import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import { Alert, Chip, IconButton, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Tooltip } from "@mui/material";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { downloadAssignmentFile, printAssignmentFile, viewAssignmentFile } from "utils/assignmentFile";

const API = process.env.REACT_APP_API_URL;
const REFRESH_MS = 60 * 1000;
export const ASSIGNMENTS_CHANGED_EVENT = "document-assignments-changed";
const authHeaders = (extra = {}) => ({ Authorization: `Bearer ${localStorage.getItem("token")}`, ...extra });

const STATUS = {
  assigned: { label: "Pending", color: "warning" },
  done: { label: "Done", color: "success" },
  cancelled: { label: "Cancelled", color: "error" },
};
const TYPE_LABEL = { pending: "Pending", printing: "Printing", add_sales: "Add Sales", pending_works: "Pending Works", others: "Others" };
const headCellSx = { fontWeight: 700, fontSize: "0.75rem", backgroundColor: "#f3f4f6", py: 1.25, whiteSpace: "nowrap" };
const cellSx = { py: 1.25, fontSize: "0.85rem", verticalAlign: "middle" };

function StatTile({ label, value, color, icon }) {
  return (
    <Card sx={{ flex: "1 1 160px", p: 2, display: "flex", flexDirection: "row", alignItems: "center", gap: 1.5 }}>
      <MDBox variant="gradient" bgColor={color} coloredShadow={color} borderRadius="lg" width="2.75rem" height="2.75rem" display="flex" alignItems="center" justifyContent="center" color="white">
        <Icon fontSize="small">{icon}</Icon>
      </MDBox>
      <MDBox>
        <MDTypography variant="caption" color="text">{label}</MDTypography>
        <MDTypography variant="h5" fontWeight="bold">{value}</MDTypography>
      </MDBox>
    </Card>
  );
}

StatTile.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
};

function AssignTask() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("assigned");
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/my-document-assignments`, { headers: authHeaders() });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.error || "Unable to load assigned tasks.");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to load assigned tasks." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener(ASSIGNMENTS_CHANGED_EVENT, load);
    return () => { clearInterval(timer); window.removeEventListener(ASSIGNMENTS_CHANGED_EVENT, load); };
  }, [load]);

  const counts = useMemo(() => rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {}), [rows]);
  const visible = useMemo(() => (tab === "all" ? rows : rows.filter((r) => r.status === tab)), [rows, tab]);

  const [fileBusy, setFileBusy] = useState(null);
  const handleFile = async (item, action) => {
    setFileBusy(`${item.id}:${action}`);
    setMessage(null);
    try {
      if (action === "print") await printAssignmentFile("mine", item.id);
      else if (action === "save") await downloadAssignmentFile("mine", item.id);
      else await viewAssignmentFile("mine", item.id);
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to open the document." });
    } finally {
      setFileBusy(null);
    }
  };

  const update = async (item, status) => {
    if (status === "cancelled" && !window.confirm(`Cancel this task?\n\n"${item.document_name}" will be marked as Cancelled and the admin will see it.`)) return;
    setBusyId(item.id);
    setMessage(null);
    try {
      const res = await fetch(`${API}/my-document-assignments/${item.id}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to update task.");
      setRows((list) => list.map((r) => (r.id === item.id ? { ...r, status, completed_at: new Date().toISOString() } : r)));
      setMessage({ type: "success", text: status === "done" ? "Task marked as done." : "Task cancelled." });
      window.dispatchEvent(new Event(ASSIGNMENTS_CHANGED_EVENT));
    } catch (e) {
      setMessage({ type: "error", text: e.message || "Unable to update task." });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <MDBox display="flex" gap={2} flexWrap="wrap" mb={3}>
          <StatTile label="Pending" value={counts.assigned || 0} color="warning" icon="pending_actions" />
          <StatTile label="Done" value={counts.done || 0} color="success" icon="task_alt" />
          <StatTile label="Cancelled" value={counts.cancelled || 0} color="error" icon="block" />
          <StatTile label="Total" value={rows.length} color="info" icon="assignment_ind" />
        </MDBox>

        <Card>
          <MDBox px={3} pt={2.5} pb={1} display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
            <MDBox>
              <MDTypography variant="h6" fontWeight="medium">Assign Task</MDTypography>
              <MDTypography variant="caption" color="text">Documents assigned to you by the admin. Print or save them, then mark them as done.</MDTypography>
            </MDBox>
            <MDButton variant="outlined" color="info" size="small" onClick={() => { setLoading(true); load(); }}>
              <Icon sx={{ mr: 0.5 }}>refresh</Icon> Refresh
            </MDButton>
          </MDBox>

          <MDBox px={3}>
            <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ maxWidth: 520 }}>
              <Tab value="assigned" label={`Pending (${counts.assigned || 0})`} />
              <Tab value="done" label={`Done (${counts.done || 0})`} />
              <Tab value="cancelled" label={`Cancelled (${counts.cancelled || 0})`} />
              <Tab value="all" label={`All (${rows.length})`} />
            </Tabs>
          </MDBox>

          {message ? <MDBox px={3} pt={2}><Alert severity={message.type} onClose={() => setMessage(null)}>{message.text}</Alert></MDBox> : null}

          <MDBox p={3}>
            <TableContainer sx={{ border: "1px solid #e1e6ef", borderRadius: "12px", overflowX: "auto", boxShadow: "none" }}>
              <Table size="small" sx={{ minWidth: 1060, tableLayout: "fixed" }}>
                <colgroup>
                  {["6%", "10%", "17%", "8%", "15%", "13%", "12%", "9%", "10%"].map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <TableHead sx={{ display: "table-header-group", padding: 0 }}>
                  <TableRow>
                    {["Sr. No.", "Date", "Document", "Type", "Company / Area", "Marketing person", "Remarks", "Status", "Actions"].map((label) => (
                      <TableCell key={label} sx={{ ...headCellSx, textAlign: label === "Actions" ? "center" : "left" }}>{label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visible.map((item, index) => {
                    const status = STATUS[item.status] || STATUS.assigned;
                    const open = item.status === "assigned";
                    const busy = busyId === item.id;
                    return (
                      <TableRow key={item.id} hover>
                        <TableCell sx={{ ...cellSx, color: "#6b7280" }}>{index + 1}</TableCell>
                        <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>{String(item.work_date).slice(0, 10)}</TableCell>
                        <TableCell sx={{ ...cellSx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <Tooltip title={item.document_name || ""}>
                            <a href="#view" onClick={(e) => { e.preventDefault(); handleFile(item, "view"); }} style={{ color: "#1976d2", fontWeight: 600 }}>{item.document_name}</a>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={cellSx}>{TYPE_LABEL[item.assignment_type] || item.assignment_type || "—"}</TableCell>
                        <TableCell sx={cellSx}>{item.company_name || "—"}{item.area ? ` · ${item.area}` : ""}</TableCell>
                        <TableCell sx={cellSx}>{item.marketing_staff_name || "—"}</TableCell>
                        <TableCell sx={{ ...cellSx, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.remarks || "—"}</TableCell>
                        <TableCell sx={cellSx}><Chip size="small" label={status.label} color={status.color} /></TableCell>
                        <TableCell sx={{ ...cellSx, textAlign: "center", whiteSpace: "nowrap" }}>
                          <Tooltip title="Print"><span><IconButton size="small" disabled={Boolean(fileBusy)} onClick={() => handleFile(item, "print")}><Icon fontSize="small">print</Icon></IconButton></span></Tooltip>
                          <Tooltip title="Save document"><span><IconButton size="small" disabled={Boolean(fileBusy)} onClick={() => handleFile(item, "save")}><Icon fontSize="small">download</Icon></IconButton></span></Tooltip>
                          {open ? (
                            <>
                              <Tooltip title="Mark done"><span><IconButton size="small" color="success" disabled={busy} onClick={() => update(item, "done")}><Icon fontSize="small">check_circle</Icon></IconButton></span></Tooltip>
                              <Tooltip title="Cancel task"><span><IconButton size="small" color="error" disabled={busy} onClick={() => update(item, "cancelled")}><Icon fontSize="small">cancel</Icon></IconButton></span></Tooltip>
                            </>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!visible.length ? (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ py: 5, textAlign: "center" }}>
                        <MDTypography variant="button" color="text">
                          {loading ? "Loading…" : tab === "assigned" ? "No pending tasks. You're all caught up." : "Nothing to show here."}
                        </MDTypography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          </MDBox>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default AssignTask;
