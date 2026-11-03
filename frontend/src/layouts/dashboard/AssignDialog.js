import { useEffect, useState } from "react";
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
} from "@mui/material";
import Icon from "@mui/material/Icon";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

const API = process.env.REACT_APP_API_URL;

const TYPE_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "printing", label: "Printing" },
  { value: "others", label: "Others" },
];

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

let rowSeq = 0;
const newRow = () => {
  rowSeq += 1;
  return { key: rowSeq, workDate: "", type: "", companyId: "", area: "", invoiceFile: null, assignTo: "" };
};

const headCellSx = { fontWeight: 700, fontSize: "0.75rem", backgroundColor: "#f3f4f6", py: 1 };
const cellSx = { py: 1, verticalAlign: "top" };
const selectSx = { minWidth: 150, height: 38, fontSize: "0.8rem", width: "100%" };
const MAX_DOCUMENT_SIZE = 19 * 1024 * 1024;

function AssignDialog({ open, onClose, companies }) {
  const [rows, setRows] = useState(() => [newRow()]);
  const [areasByCompany, setAreasByCompany] = useState({});
  const [staffByCompany, setStaffByCompany] = useState({});
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [assignments, setAssignments] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`${API}/staff/document-assignments`, { headers: authHeaders() }).then((res) => res.ok ? res.json() : []).then((data) => setAssignments(Array.isArray(data) ? data : [])).catch(() => setAssignments([]));
    fetch(`${API}/delivery-boy`, { headers: authHeaders() }).then((res) => res.ok ? res.json() : []).then((data) => setDeliveryBoys(Array.isArray(data) ? data : [])).catch(() => setDeliveryBoys([]));
  }, [open]);

  const loadCompanyData = (companyId) => {
    if (!companyId) return;
    if (!areasByCompany[companyId]) {
      fetch(`${API}/staff/areas/company/${companyId}`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setAreasByCompany((prev) => ({ ...prev, [companyId]: Array.isArray(data) ? data : [] })))
        .catch(() => setAreasByCompany((prev) => ({ ...prev, [companyId]: [] })));
    }
    if (!staffByCompany.all) fetch(`${API}/staff`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setStaffByCompany((prev) => ({ ...prev, all: (Array.isArray(data) ? data : []).filter((s) => !s.staff_category || s.staff_category === "company_staff") })))
      .catch(() => setStaffByCompany((prev) => ({ ...prev, all: [] })));
  };

  const updateRow = (key, patch) => {
    setMessage({ type: "", text: "" });
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleCompanyChange = (key, companyId) => {
    // Area and marketing staff depend on the company, so reset them.
    updateRow(key, { companyId, area: "", assignTo: "" });
    loadCompanyData(companyId);
  };

  const addRow = () => setRows((prev) => [...prev, newRow()]);
  const removeRow = (key) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  const handleClose = () => {
    setRows([newRow()]);
    setMessage({ type: "", text: "" });
    onClose();
  };

  const handleSave = async () => {
    const incomplete = rows.findIndex((r) => !r.workDate || !r.type || !r.companyId || !r.area || !r.invoiceFile || !r.assignTo);
    if (incomplete !== -1) {
      setMessage({ type: "error", text: `Row ${incomplete + 1}: please fill Date, Type, Company, Area, Document and Assign To.` });
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
        form.append("area", row.area);
        form.append("assignTo", row.assignTo);
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
                <TableCell sx={headCellSx}>Area</TableCell>
                <TableCell sx={headCellSx}>Invoice</TableCell>
                <TableCell sx={headCellSx}>Assign To</TableCell>
                <TableCell sx={{ ...headCellSx, width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const areas = row.companyId ? areasByCompany[row.companyId] : null;
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
                        value={row.area}
                        displayEmpty
                        disabled={!row.companyId}
                        onChange={(e) => updateRow(row.key, { area: e.target.value })}
                        sx={selectSx}
                      >
                        <MenuItem value="" disabled>
                          {!row.companyId ? "Choose company first" : !areas ? "Loading..." : "Select area"}
                        </MenuItem>
                        {(areas || []).map((name) => (
                          <MenuItem key={name} value={name}>{name}</MenuItem>
                        ))}
                        {areas && areas.length === 0 && (
                          <MenuItem value="" disabled>No areas for this company</MenuItem>
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
                        value={row.assignTo}
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
          <Chip size="small" label={`${assignments.length} total`} sx={{ fontWeight: 600, bgcolor: "#eef2ff", color: "#3949ab" }} />
        </MDBox>
        <TableContainer component={Paper} sx={{ width: "100%", boxSizing: "border-box", boxShadow: "none", border: "1px solid #e1e6ef", borderRadius: "12px", maxHeight: 240, overflowX: "auto" }}>
          {assignments.length ? <Table size="small" stickyHeader sx={{ width: "100%", minWidth: 620, tableLayout: "fixed" }}>
            <TableHead><TableRow>{["Date", "Document", "Company / Area", "Assigned to", "Status"].map((label) => <TableCell key={label} sx={{ ...headCellSx, position: "sticky", top: 0, zIndex: 1 }}>{label}</TableCell>)}</TableRow></TableHead>
            <TableBody>{assignments.map((item) => <TableRow key={item.id} hover>
              <TableCell sx={{ py: 1.25, whiteSpace: "nowrap" }}>{String(item.work_date).slice(0, 10)}</TableCell>
              <TableCell sx={{ py: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><a href={item.document_url} target="_blank" rel="noreferrer" style={{ color: "#1976d2", fontWeight: 600 }}>{item.document_name}</a></TableCell>
              <TableCell sx={{ py: 1.25 }}>{item.company_name || "—"}{item.area ? ` · ${item.area}` : ""}</TableCell>
              <TableCell sx={{ py: 1.25 }}>{item.assignee_name || "—"}</TableCell>
              <TableCell sx={{ py: 1.25 }}><Chip size="small" label={item.status === "done" ? "Done" : item.status === "cancelled" ? "Cancelled" : "Assigned"} color={item.status === "done" ? "success" : item.status === "cancelled" ? "default" : "warning"} /></TableCell>
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
