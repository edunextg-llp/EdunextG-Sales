import { useEffect, useState } from "react";
import { Alert, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, ListItemText, MenuItem, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import PropTypes from "prop-types";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = (process.env.REACT_APP_API_URL);
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const holidayList = (value) => String(value || "").split(",").map((day) => day.trim()).filter(Boolean);

// Pick zero or more weekdays as the area's weekly holiday.
function HolidayPicker({ value, onChange, disabled, id }) {
  return <FormControl fullWidth>
    <InputLabel id={id}>Holiday day</InputLabel>
    <Select labelId={id} label="Holiday day" multiple value={value} disabled={disabled}
      onChange={(event) => onChange(WEEKDAYS.filter((day) => event.target.value.includes(day)))}
      renderValue={(days) => (days.length ? days.join(", ") : "No holiday")} displayEmpty sx={{ minHeight: 44 }}>
      {WEEKDAYS.map((day) => <MenuItem key={day} value={day}>
        <Checkbox size="small" checked={value.includes(day)} /><ListItemText primary={day} />
      </MenuItem>)}
    </Select>
  </FormControl>;
}
HolidayPicker.propTypes = { value: PropTypes.arrayOf(PropTypes.string).isRequired, onChange: PropTypes.func.isRequired, disabled: PropTypes.bool, id: PropTypes.string.isRequired };
HolidayPicker.defaultProps = { disabled: false };

export default function Area() {
  const [areas, setAreas] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [holidayDays, setHolidayDays] = useState([]);
  const [editArea, setEditArea] = useState(null);
  const [editDays, setEditDays] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const openHolidayEdit = (area) => { setEditArea(area); setEditDays(holidayList(area.holiday_day)); setEditError(""); setSuccess(""); };
  const saveHoliday = async () => {
    setEditSaving(true);
    setEditError("");
    try {
      const response = await fetch(`${API}/staff/areas/holiday`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ name: editArea.name, holidayDays: editDays }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update holiday.");
      setSuccess(`${data.name}: holiday ${data.holiday_day ? `set to ${data.holiday_day}` : "removed"}.`);
      setEditArea(null);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setEditError(requestError.message);
    } finally {
      setEditSaving(false);
    }
  };
  const [createError, setCreateError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const deleteArea = async (area) => {
    if (!window.confirm(`Delete area "${area.name}"?`)) return;
    setDeleting(area.name);
    setDeleteError("");
    setSuccess("");
    try {
      const response = await fetch(`${API}/staff/areas`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ name: area.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete area.");
      setSuccess(`${area.name} deleted successfully.`);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setDeleteError(requestError.message);
    } finally {
      setDeleting("");
    }
  };

  const createArea = async (event) => {
    event.preventDefault();
    setCreating(true);
    setCreateError("");
    setSuccess("");
    try {
      const response = await fetch(`${API}/staff/areas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ name, holidayDays }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create area.");
      setSuccess(`${data.name} created successfully${data.holiday_day ? ` · Holiday: ${data.holiday_day}` : ""}.`);
      setName("");
      setHolidayDays([]);
      setShowCreate(false);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setCreateError(requestError.message);
    } finally {
      setCreating(false);
    }
  };

  const downloadExcel = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const response = await fetch(`${API}/staff/areas/export`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) throw new Error("Unable to download areas. Please try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "areas.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setDownloadError(requestError.message);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`${API}/staff/areas`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load areas.");
        if (!Array.isArray(data)) throw new Error("Unable to load areas.");
        setAreas(data);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  const visibleAreas = areas.filter((area) => area.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={3}>
            <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <MDTypography variant="h5">Create Area</MDTypography>
              <MDBox display="flex" gap={1} flexWrap="wrap">
                <MDButton variant="contained" color="info" onClick={() => { setShowCreate(true); setSuccess(""); }}>Create Area</MDButton>
                <MDButton variant="contained" color="success" disabled={downloading || loading || Boolean(error)} onClick={downloadExcel}>
                  {downloading ? "Downloading…" : "Download Excel"}
                </MDButton>
                <MDButton variant="outlined" color="info" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</MDButton>
              </MDBox>
            </MDBox>
            <MDTypography variant="body2" color="text" mb={2}>
              All areas, including existing outlets and staff assignments, with each area's weekly holiday. Names are shown in uppercase; capitalization and extra spaces count as the same name.
            </MDTypography>
            {success && <MDBox mb={2}><Alert severity="success">{success}</Alert></MDBox>}
            {showCreate && <MDBox component="form" onSubmit={createArea} mb={3}>
              <MDInput label="New area name" value={name} onChange={(event) => setName(event.target.value)} fullWidth required disabled={creating} inputProps={{ maxLength: 255 }} />
              <MDTypography variant="caption">DUMDUM and dumdum are the same area. DUMDUM-1 is a different name.</MDTypography>
              <MDBox mt={2} mb={1}><HolidayPicker id="create-area-holiday" value={holidayDays} onChange={setHolidayDays} disabled={creating} /></MDBox>
              <MDTypography variant="caption" display="block">Optional. Choose the weekday(s) this area is closed. Leave empty for no holiday.</MDTypography>
              {createError && <Alert severity="error">{createError}</Alert>}
              <MDBox display="flex" gap={1} mt={1}>
                <MDButton type="submit" color="info" disabled={creating || !name.trim()}>{creating ? "Saving…" : "Save Area"}</MDButton>
                <MDButton disabled={creating} onClick={() => { setShowCreate(false); setCreateError(""); setHolidayDays([]); }}>Cancel</MDButton>
              </MDBox>
            </MDBox>}
            <MDInput label="Search areas" value={search} onChange={(event) => setSearch(event.target.value)} fullWidth />
            {downloadError && <MDBox mt={2}><Alert severity="error">{downloadError}</Alert></MDBox>}
            {deleteError && <MDBox mt={2}><Alert severity="error">{deleteError}</Alert></MDBox>}
            {loading ? <MDBox py={4} textAlign="center"><CircularProgress size={28} aria-label="Loading areas" /></MDBox> : error ? (
              <MDBox mt={2}><Alert severity="error">{error}</Alert></MDBox>
            ) : (
              <>
                <MDTypography variant="caption" display="block" mt={2}>{visibleAreas.length} of {areas.length} area names</MDTypography>
                <TableContainer>
                  <Table aria-label="All areas">
                    <TableHead sx={{ display: "table-header-group" }}><TableRow>
                      <TableCell>Area name</TableCell><TableCell>Holiday</TableCell><TableCell align="right">Outlets</TableCell><TableCell align="right">Staff assignments</TableCell>
                      <TableCell>Action</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                      {visibleAreas.map((area) => <TableRow key={area.name}>
                        <TableCell sx={{ whiteSpace: "pre-wrap" }}>{area.name}</TableCell>
                        <TableCell>
                          <MDBox display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                            {holidayList(area.holiday_day).map((day) => <Chip key={day} size="small" color="warning" variant="outlined" label={day} />)}
                            {!area.holiday_day && <MDTypography variant="caption" color="text">No holiday</MDTypography>}
                            <MDButton color="info" variant="text" size="small" onClick={() => openHolidayEdit(area)}>Edit</MDButton>
                          </MDBox>
                        </TableCell>
                        <TableCell align="right">{area.outlet_count}</TableCell>
                        <TableCell align="right">{area.assignment_count}</TableCell>
                        <TableCell>
                          <MDButton color="error" variant="text" size="small" disabled={Boolean(deleting) || area.outlet_count > 0 || area.assignment_count > 0} onClick={() => deleteArea(area)}>
                            {deleting === area.name ? "Deleting…" : "Delete"}
                          </MDButton>
                          {(area.outlet_count > 0 || area.assignment_count > 0) && <MDTypography variant="caption" display="block">In use — reassign first</MDTypography>}
                        </TableCell>
                      </TableRow>)}
                      {!visibleAreas.length && <TableRow><TableCell colSpan={5}>No areas found.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </MDBox>
        </Card>
      </MDBox>
      <Dialog open={Boolean(editArea)} onClose={() => { if (!editSaving) setEditArea(null); }} fullWidth maxWidth="xs">
        <DialogTitle>Holiday — {editArea?.name}</DialogTitle>
        <DialogContent dividers>
          <MDBox mt={1}><HolidayPicker id="edit-area-holiday" value={editDays} onChange={setEditDays} disabled={editSaving} /></MDBox>
          <MDTypography variant="caption" display="block" mt={1}>Untick every day to remove the holiday.</MDTypography>
          {editError && <MDBox mt={1}><Alert severity="error">{editError}</Alert></MDBox>}
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" disabled={editSaving} onClick={() => setEditArea(null)}>Cancel</MDButton>
          <MDButton color="info" variant="gradient" disabled={editSaving} onClick={saveHoliday}>{editSaving ? "Saving…" : "Save"}</MDButton>
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}
