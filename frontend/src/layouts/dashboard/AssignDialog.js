import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Select,
  MenuItem,
  ListSubheader,
  IconButton,
  Tooltip,
  Chip,
  TextField,
} from "@mui/material";
import Icon from "@mui/material/Icon";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import { viewAssignmentFile } from "utils/assignmentFile";

const API = process.env.REACT_APP_API_URL;

const TYPE_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "printing", label: "Printing" },
  { value: "add_sales", label: "Add Sales" },
  { value: "pending_works", label: "Pending Works" },
  { value: "others", label: "Others" },
];

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

let rowSeq = 0;
const newRow = () => {
  rowSeq += 1;
  return { key: rowSeq, workDate: "", type: "", companyId: "", marketingStaffId: "", area: "", invoiceFile: null, assignTo: "", remarks: "" };
};

// Assign To starts on this person. Whole-name match, so "Sandeep" or "Pradeep" is never picked.
const DEFAULT_ASSIGNEE_NAME = "DEEP";
const findDefaultPerson = (people) => {
  const nameOf = (person) => String(person.name || "").trim().toUpperCase();
  return people.find((person) => nameOf(person) === DEFAULT_ASSIGNEE_NAME)
    || people.find((person) => nameOf(person).split(/\s+/)[0] === DEFAULT_ASSIGNEE_NAME);
};

const headCellSx = { fontWeight: 700, fontSize: "0.75rem", backgroundColor: "#f3f4f6", py: 1 };
const cellSx = { py: 1, verticalAlign: "top" };
const selectSx = { minWidth: 150, height: 38, fontSize: "0.8rem", width: "100%" };
const MAX_DOCUMENT_SIZE = 19 * 1024 * 1024;
const ASSIGNMENT_STATUS = {
  assigned: { label: "Pending", color: "warning" },
  done: { label: "Done", color: "success" },
  cancelled: { label: "Cancelled", color: "error" },
};
const formatDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

function AssignDialog({ open, onClose, companies }) {
  const [rows, setRows] = useState(() => [newRow()]);
  const [areasByStaff, setAreasByStaff] = useState({});
  const [staffByCompany, setStaffByCompany] = useState({});
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [assignments, setAssignments] = useState([]);
  const [saving, setSaving] = useState(false);

  const reopenAssignment = async (item) => {
    if (!window.confirm(`Reopen "${item.document_name}"? It will go back to Pending for ${item.assignee_name || "the assignee"}.`)) return;
    try {
      const res = await fetch(`${API}/staff/document-assignments/${item.id}/reopen`, { method: "PUT", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to reopen.");
      setAssignments((rows) => rows.map((r) => (r.id === item.id ? { ...r, status: "assigned", completed_at: null } : r)));
      setMessage({ type: "success", text: "Task reopened — it is Pending again." });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Unable to reopen." });
    }
  };

  // Keep statuses live while the dialog is open (staff mark Done / Cancel on their side).
  useEffect(() => {
    if (!open) return undefined;
    const loadAssignments = () => fetch(`${API}/staff/document-assignments`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (Array.isArray(data)) setAssignments(data); })
      .catch(() => {});
    const timer = setInterval(loadAssignments, 20 * 1000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/staff/document-assignments`, { headers: authHeaders() }).then((res) => res.ok ? res.json() : []).then((data) => setAssignments(Array.isArray(data) ? data : [])).catch(() => setAssignments([]));
    fetch(`${API}/delivery-boy`, { headers: authHeaders() }).then((res) => res.ok ? res.json() : []).then((data) => setDeliveryBoys(Array.isArray(data) ? data : [])).catch(() => setDeliveryBoys([]));
    fetch(`${API}/staff`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setStaffByCompany((prev) => ({ ...prev, all: (Array.isArray(data) ? data : []).filter((s) => !s.staff_category || s.staff_category === "company_staff") })))
      .catch(() => setStaffByCompany((prev) => ({ ...prev, all: [] })));
  }, [open]);

  // A row with no person chosen uses this one.
  const defaultAssignee = useMemo(() => {
    const staffMember = findDefaultPerson(staffByCompany.all || []);
    if (staffMember) return `staff:${staffMember.id}`;
    const deliveryBoy = findDefaultPerson(deliveryBoys);
    return deliveryBoy ? `delivery_boy:${deliveryBoy.id}` : "";
  }, [staffByCompany.all, deliveryBoys]);

  const loadCompanyData = (companyId) => {
    if (!companyId) return;
    if (!staffByCompany[companyId]) {
      fetch(`${API}/staff?companyId=${companyId}`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setStaffByCompany((prev) => ({ ...prev, [companyId]: (Array.isArray(data) ? data : []).filter((s) => !s.staff_category || s.staff_category === "company_staff") })))
        .catch(() => setStaffByCompany((prev) => ({ ...prev, [companyId]: [] })));
    }
  };

  const updateRow = (key, patch) => {
    setMessage({ type: "", text: "" });
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleCompanyChange = (key, companyId) => {
    // Area and marketing staff depend on the company, so reset them.
    updateRow(key, { companyId, marketingStaffId: "", area: "", assignTo: "" });
    loadCompanyData(companyId);
  };

  const handleMarketingChange = (key, marketingStaffId) => {
    // The area list depends on the marketing person.
    updateRow(key, { marketingStaffId, area: "" });
    const companyId = rows.find((row) => row.key === key)?.companyId;
    const areaCacheKey = `${marketingStaffId}:${companyId}`;
    if (!marketingStaffId || Array.isArray(areasByStaff[areaCacheKey])) return;
    fetch(`${API}/staff/areas/staff/${marketingStaffId}`, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load this marketing person's areas.");
        const data = await res.json();
        const staffAreas = Array.isArray(data) ? data : [];
        if (staffAreas.length || !companyId) return staffAreas;
        // Some marketing staff have no personal area rows; offer the company's existing areas.
        const companyResponse = await fetch(`${API}/staff/areas/company/${companyId}`, { headers: authHeaders() });
        if (!companyResponse.ok) throw new Error("Could not load areas for this company.");
        const companyAreas = await companyResponse.json();
        return Array.isArray(companyAreas) ? companyAreas : [];
      })
      .then((areas) => setAreasByStaff((prev) => ({ ...prev, [areaCacheKey]: areas })))
      .catch((error) => {
        setAreasByStaff((prev) => ({ ...prev, [areaCacheKey]: [] }));
        setMessage({ type: "error", text: error.message || "Could not load area options." });
      });
  };

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (key) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const handleClose = () => {
    setRows([newRow()]);
    setMessage({ type: "", text: "" });
    onClose();
  };

  const handleSave = async () => {
    const incomplete = rows.findIndex((r) => !r.workDate || !r.type || !r.companyId || !r.marketingStaffId || !r.area || !r.invoiceFile || !(r.assignTo || defaultAssignee));
    if (incomplete !== -1) {
      setMessage({ type: "error", text: `Row ${incomplete + 1}: please fill Date, Type, Company, Marketing Person, Area, Document and Assign To.` });
      return;
    }
    setSaving(true);
    try {
      for (const row of rows) {
        const form = new FormData();
        form.append("file", row.invoiceFile);
        form.append("workDate", row.workDate);
        form.append("type", row.type);
        form.append("companyId", row.companyId);
        form.append("marketingStaffId", row.marketingStaffId);
        form.append("area", row.area);
        form.append("assignTo", row.assignTo || defaultAssignee);
        form.append("remarks", row.remarks);
        const response = await fetch(`${API}/staff/document-assignments`, { method: "POST", headers: authHeaders(), body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Unable to assign document.");
      }
      const response = await fetch(`${API}/staff/document-assignments`, { headers: authHeaders() });
      setAssignments(response.ok ? await response.json() : []);
      setRows([newRow()]);
      setMessage({ type: "success", text: `${rows.length} document assignment(s) submitted.` });
    } catch (error) { setMessage({ type: "error", text: error.message || "Unable to assign documents." }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ fontSize: "1rem", fontWeight: 600, px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
        <Icon>assignment_ind</Icon> Assign
      </DialogTitle>
      <DialogContent dividers>
        <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
          <Table size="small">
            <TableHead sx={{ display: "table-header-group" }}>
              <TableRow>
                <TableCell sx={headCellSx}>Date</TableCell>
                <TableCell sx={headCellSx}>Type</TableCell>
                <TableCell sx={headCellSx}>Company</TableCell>
                <TableCell sx={headCellSx}>Marketing Person</TableCell>
                <TableCell sx={headCellSx}>Area</TableCell>
                <TableCell sx={headCellSx}>Invoice</TableCell>
                <TableCell sx={headCellSx}>Assign To</TableCell>
                <TableCell sx={headCellSx}>Remarks</TableCell>
                <TableCell sx={{ ...headCellSx, width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const companyMarketing = row.companyId ? staffByCompany[row.companyId] : null;
                const areas = row.marketingStaffId ? areasByStaff[`${row.marketingStaffId}:${row.companyId}`] : null;
                const marketingStaff = staffByCompany.all || [];
                return (
                  <TableRow key={row.key}>
                    <TableCell sx={cellSx}><input aria-label="Assignment date" type="date" value={row.workDate} onChange={(e) => updateRow(row.key, { workDate: e.target.value })} style={{ height: 36, border: "1px solid #c8cdd2", borderRadius: 4, padding: "0 8px" }} /></TableCell>
                    <TableCell sx={cellSx}>
                      <Select
                        value={row.type}
                        displayEmpty
                        onChange={(e) => updateRow(row.key, { type: e.target.value })}
                        sx={selectSx}
                      >
                        <MenuItem value="" disabled>Select type</MenuItem>
                        {TYPE_OPTIONS.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Select
                        value={row.companyId}
                        displayEmpty
                        onChange={(e) => handleCompanyChange(row.key, e.target.value)}
                        sx={selectSx}
                      >
                        <MenuItem value="" disabled>Choose company</MenuItem>
                        {companies.map((c) => (
                          <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Select
                        value={row.marketingStaffId}
                        displayEmpty
                        disabled={!row.companyId}
                        onChange={(e) => handleMarketingChange(row.key, e.target.value)}
                        sx={selectSx}
                      >
                        <MenuItem value="" disabled>
                          {!row.companyId ? "Choose company first" : !companyMarketing ? "Loading..." : "Select marketing person"}
                        </MenuItem>
                        {(companyMarketing || []).map((s) => (
                          <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>
                        ))}
                        {companyMarketing && companyMarketing.length === 0 && (
                          <MenuItem value="" disabled>No marketing staff for this company</MenuItem>
                        )}
                      </Select>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Select
                        value={row.area}
                        displayEmpty
                        disabled={!row.marketingStaffId}
                        onChange={(e) => updateRow(row.key, { area: e.target.value })}
                        sx={selectSx}
                      >
                        <MenuItem value="" disabled>
                          {!row.marketingStaffId ? "Choose marketing person first" : !areas ? "Loading..." : "Select area"}
                        </MenuItem>
                        {(areas || []).map((name) => (
                          <MenuItem key={name} value={name}>{name}</MenuItem>
                        ))}
                        {areas && areas.length === 0 && (
                          <MenuItem value="" disabled>No areas for this person</MenuItem>
                        )}
                      </Select>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <MDButton component="label" variant="outlined" color="info" size="small" sx={{ whiteSpace: "nowrap" }}>
                        <Icon sx={{ mr: 0.5 }}>upload_file</Icon> Upload invoice
                        <input
                          hidden
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (file && file.size > MAX_DOCUMENT_SIZE) {
                              setMessage({ type: "error", text: "Document must not be larger than 19 MB." });
                              e.target.value = "";
                              return;
                            }
                            updateRow(row.key, { invoiceFile: file });
                          }}
                        />
                      </MDButton>
                      {row.invoiceFile && (
                        <MDTypography variant="caption" display="block" color="text" sx={{ mt: 0.5, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.invoiceFile.name}
                        </MDTypography>
                      )}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Select
                        value={row.assignTo || defaultAssignee}
                        displayEmpty
                        onChange={(e) => updateRow(row.key, { assignTo: e.target.value })}
                        sx={selectSx}
                      >
                        <MenuItem value="" disabled>Select person</MenuItem>
                        <MenuItem value="" disabled>Select staff member</MenuItem>
                        {!staffByCompany.all && <MenuItem value="" disabled>Loading staff…</MenuItem>}
                        <ListSubheader>Staff</ListSubheader>
                        {marketingStaff.map((s) => (
                          <MenuItem key={`st-${s.id}`} value={`staff:${s.id}`}>{s.name}</MenuItem>
                        ))}
                        <ListSubheader>Delivery boys</ListSubheader>
                        {deliveryBoys.map((person) => <MenuItem key={`db-${person.id}`} value={`delivery_boy:${person.id}`}>{person.name}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <TextField
                        size="small"
                        multiline
                        maxRows={3}
                        placeholder="Optional"
                        value={row.remarks}
                        inputProps={{ maxLength: 500, "aria-label": "Remarks" }}
                        onChange={(e) => updateRow(row.key, { remarks: e.target.value })}
                        sx={{ minWidth: 170 }}
                      />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Tooltip title="Remove row">
                        <span>
                          <IconButton size="small" disabled={rows.length === 1} onClick={() => removeRow(row.key)}>
                            <Icon fontSize="small">delete</Icon>
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <MDBox mt={2} mb={1} display="flex" alignItems="center" justifyContent="space-between">
          <MDTypography variant="h6" fontWeight="medium" color="dark">Assigned documents</MDTypography>
          <MDBox display="flex" gap={0.75} flexWrap="wrap" justifyContent="flex-end">
            {["assigned", "done", "cancelled"].map((key) => {
              const count = assignments.filter((a) => (a.status || "assigned") === key).length;
              return <Chip key={key} size="small" variant="outlined" color={ASSIGNMENT_STATUS[key].color} label={`${ASSIGNMENT_STATUS[key].label} ${count}`} sx={{ fontWeight: 600 }} />;
            })}
            <Chip size="small" label={`${assignments.length} total`} sx={{ fontWeight: 600, bgcolor: "#eef2ff", color: "#3949ab" }} />
          </MDBox>
        </MDBox>
        <TableContainer component={Paper} sx={{ width: "100%", boxSizing: "border-box", boxShadow: "none", border: "1px solid #e1e6ef", borderRadius: "12px", maxHeight: 240, overflowX: "auto" }}>
          {assignments.length ? <Table size="small" stickyHeader sx={{ width: "100%", minWidth: 980, tableLayout: "fixed", "& td": { verticalAlign: "middle" } }}>
            <colgroup>{["6%", "10%", "16%", "15%", "14%", "13%", "13%", "13%"].map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <TableHead sx={{ display: "table-header-group", padding: 0 }}><TableRow>{["Sr. No.", "Date", "Document", "Company / Area", "Marketing person", "Assigned to", "Remarks", "Status"].map((label) => <TableCell key={label} sx={{ ...headCellSx, position: "sticky", top: 0, zIndex: 1, whiteSpace: "nowrap" }}>{label}</TableCell>)}</TableRow></TableHead>
            <TableBody>{assignments.map((item, index) => <TableRow key={item.id} hover>
              <TableCell sx={{ py: 1.25, whiteSpace: "nowrap", color: "#6b7280" }}>{index + 1}</TableCell>
              <TableCell sx={{ py: 1.25, whiteSpace: "nowrap" }}>{String(item.work_date).slice(0, 10)}</TableCell>
              <TableCell sx={{ py: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><a href="#view" title={item.document_name} onClick={(e) => { e.preventDefault(); viewAssignmentFile("admin", item.id).catch((err) => setMessage({ type: "error", text: err.message })); }} style={{ color: "#1976d2", fontWeight: 600 }}>{item.document_name}</a></TableCell>
              <TableCell sx={{ py: 1.25 }}>{item.company_name || "—"}{item.area ? ` · ${item.area}` : ""}</TableCell>
              <TableCell sx={{ py: 1.25 }}>{item.marketing_staff_name || "—"}</TableCell>
              <TableCell sx={{ py: 1.25 }}>{item.assignee_name || "—"}</TableCell>
              <TableCell sx={{ py: 1.25, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.remarks || "—"}</TableCell>
              <TableCell sx={{ py: 1.25 }}>
                <Chip size="small" label={(ASSIGNMENT_STATUS[item.status] || ASSIGNMENT_STATUS.assigned).label} color={(ASSIGNMENT_STATUS[item.status] || ASSIGNMENT_STATUS.assigned).color} />
                {item.status !== "assigned" && item.completed_at ? <MDTypography variant="caption" color="text" display="block" sx={{ mt: 0.5, fontSize: "0.68rem" }}>{formatDateTime(item.completed_at)}</MDTypography> : null}
                {item.status && item.status !== "assigned" ? (
                  <MDTypography component="a" href="#reopen" variant="caption" color="info" fontWeight="medium" display="inline-block" sx={{ mt: 0.25, fontSize: "0.7rem", cursor: "pointer" }}
                    onClick={(e) => { e.preventDefault(); reopenAssignment(item); }}>
                    Reopen
                  </MDTypography>
                ) : null}
              </TableCell>
            </TableRow>)}</TableBody>
          </Table> : <MDBox px={2} py={2.5} display="flex" alignItems="center" gap={1.5} sx={{ minHeight: 82, bgcolor: "#fafbfc" }}>
            <MDBox display="flex" alignItems="center" justifyContent="center" sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: "50%", bgcolor: "#eef2ff", color: "#5263b8" }}><Icon>description</Icon></MDBox>
            <MDBox><MDTypography variant="button" fontWeight="medium" color="dark">No documents assigned yet</MDTypography><MDTypography variant="caption" display="block" color="text">Submitted documents and their status will appear here.</MDTypography></MDBox>
          </MDBox>}
        </TableContainer>
        <MDBox mt={1.5} display="flex" justifyContent="space-between" alignItems="center" gap={2}>
          <MDButton variant="text" color="info" size="small" onClick={addRow}>
            <Icon sx={{ mr: 0.5 }}>add</Icon> Add row
          </MDButton>
          {message.text && (
            <MDTypography variant="button" color={message.type === "error" ? "error" : "success"} fontWeight="medium">
              {message.text}
            </MDTypography>
          )}
        </MDBox>
      </DialogContent>
      <DialogActions>
      <MDButton color="dark" variant="outlined" onClick={handleClose}>Close</MDButton>
        <MDButton color="info" variant="gradient" disabled={saving} onClick={handleSave}>{saving ? "Submitting…" : "Submit assignment"}</MDButton>
      </DialogActions>
    </Dialog>
  );
}

AssignDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  companies: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), name: PropTypes.string })),
};

AssignDialog.defaultProps = { companies: [] };

export default AssignDialog;
