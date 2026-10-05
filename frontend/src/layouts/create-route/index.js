import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Icon,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const API = process.env.REACT_APP_API_URL || "https://bawarchee.edunextg.co/api";

const jsonHeaders = { "Content-Type": "application/json" };

// Suggest the next "R n" name based on existing routes (R 1, ROUTE 2, R3 ...).
const suggestRouteName = (routes) => {
  const numbers = routes
    .map((route) => String(route.name).match(/^(?:R|ROUTE)\s*-?\s*(\d+)$/i))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return `R ${(numbers.length ? Math.max(...numbers) : 0) + 1}`;
};

export default function CreateRoute() {
  const [areas, setAreas] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [editingRoute, setEditingRoute] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      fetch(`${API}/staff/areas`, { signal: controller.signal }),
      fetch(`${API}/staff/routes`, { signal: controller.signal }),
    ])
      .then(async ([areaResponse, routeResponse]) => {
        const areaData = await areaResponse.json();
        const routeData = await routeResponse.json();
        if (!areaResponse.ok) throw new Error(areaData.error || "Unable to load areas.");
        if (!routeResponse.ok) throw new Error(routeData.error || "Unable to load routes.");
        setAreas(Array.isArray(areaData) ? areaData : []);
        setRoutes(Array.isArray(routeData) ? routeData : []);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);

  // area name -> route names it already belongs to
  const routesByArea = useMemo(() => {
    const map = new Map();
    routes.forEach((route) => {
      route.areas.forEach((areaName) => {
        if (!map.has(areaName)) map.set(areaName, []);
        map.get(areaName).push(route);
      });
    });
    return map;
  }, [routes]);

  const visibleAreas = areas.filter((area) =>
    area.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const selectedSet = new Set(selected);
  // Areas already used by another route cannot be picked (one route per area).
  const otherRouteOf = (areaName) =>
    (routesByArea.get(areaName) || []).find((route) => route.id !== editingRoute?.id) || null;
  const selectableVisible = visibleAreas.filter((area) => !otherRouteOf(area.name));
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((area) => selectedSet.has(area.name));

  const toggleArea = (areaName) => {
    if (otherRouteOf(areaName)) return;
    setSelected((current) =>
      current.includes(areaName) ? current.filter((name) => name !== areaName) : [...current, areaName]
    );
  };

  const toggleAllVisible = () => {
    const visibleNames = selectableVisible.map((area) => area.name);
    setSelected((current) =>
      allVisibleSelected
        ? current.filter((name) => !visibleNames.includes(name))
        : [...new Set([...current, ...visibleNames])]
    );
  };

  // selected is kept in delivery priority order (1 = deliver first).
  const moveArea = (index, delta) => {
    setSelected((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const clearSelection = () => {
    setSelected([]);
    setEditingRoute(null);
  };

  const openCreateDialog = () => {
    // keep chosen order; areas ticked later are added at the end
    setRouteName(editingRoute ? editingRoute.name : suggestRouteName(routes));
    setSaveError("");
    setDialogOpen(true);
  };

  const startEdit = (route) => {
    setEditingRoute(route);
    setSelected(route.areas);
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveRoute = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch(
        editingRoute ? `${API}/staff/routes/${editingRoute.id}` : `${API}/staff/routes`,
        {
          method: editingRoute ? "PUT" : "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ name: routeName, areas: selected }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save route.");
      setSuccess(
        `${data.name} ${editingRoute ? "updated" : "created"} with ${data.areas.length} area${data.areas.length === 1 ? "" : "s"}.`
      );
      setDialogOpen(false);
      clearSelection();
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setSaveError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteRoute = async (route) => {
    if (!window.confirm(`Delete route "${route.name}"? The areas themselves are not deleted.`)) return;
    setDeletingId(route.id);
    setSuccess("");
    setError("");
    try {
      const response = await fetch(`${API}/staff/routes/${route.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to delete route.");
      if (editingRoute?.id === route.id) clearSelection();
      setSuccess(`${route.name} deleted.`);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Card>
              <MDBox p={3}>
                <MDBox display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={1}>
                  <MDTypography variant="h5">
                    {editingRoute ? `Edit Route: ${editingRoute.name}` : "Create Route"}
                  </MDTypography>
                  <MDBox display="flex" gap={1} flexWrap="wrap">
                    {(selected.length > 0 || editingRoute) && (
                      <MDButton variant="outlined" color="dark" onClick={clearSelection} disabled={saving}>
                        {editingRoute ? "Cancel Edit" : "Clear"}
                      </MDButton>
                    )}
                    <MDButton variant="contained" color="info" disabled={!selected.length || loading} onClick={openCreateDialog}>
                      {editingRoute ? "Save Route" : "Create Route"}
                      {selected.length ? ` (${selected.length})` : ""}
                    </MDButton>
                  </MDBox>
                </MDBox>
                <MDTypography variant="body2" color="text" mb={2}>
                  An area can belong to only one route; areas already in another route are greyed out. Select the areas for this route, then click {editingRoute ? "Save Route" : "Create Route"} and give it a name such as R 1.
                </MDTypography>
                {success && <MDBox mb={2}><Alert severity="success">{success}</Alert></MDBox>}
                {error && <MDBox mb={2}><Alert severity="error">{error}</Alert></MDBox>}
                <MDInput label="Search areas" value={search} onChange={(event) => setSearch(event.target.value)} fullWidth />
                {loading ? (
                  <MDBox py={4} textAlign="center"><CircularProgress size={28} aria-label="Loading areas" /></MDBox>
                ) : (
                  <>
                    <MDTypography variant="caption" display="block" mt={2}>
                      {selected.length} selected · {visibleAreas.length} of {areas.length} areas
                    </MDTypography>
                    <TableContainer sx={{ maxHeight: 520 }}>
                      <Table stickyHeader aria-label="Areas">
                        <TableHead sx={{ display: "table-header-group" }}>
                          <TableRow>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={allVisibleSelected}
                                indeterminate={!allVisibleSelected && selectableVisible.some((area) => selectedSet.has(area.name))}
                                disabled={!selectableVisible.length}
                                onChange={toggleAllVisible}
                                inputProps={{ "aria-label": "Select all visible areas" }}
                              />
                            </TableCell>
                            <TableCell>Area name</TableCell>
                            <TableCell align="center">Priority</TableCell>
                            <TableCell align="right">Outlets</TableCell>
                            <TableCell>Route</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {visibleAreas.map((area) => {
                            const inRoutes = (routesByArea.get(area.name) || []).filter((route) => route.id !== editingRoute?.id);
                            const locked = inRoutes.length > 0;
                            return (
                              <TableRow key={area.name} hover={!locked} onClick={() => toggleArea(area.name)} sx={{ cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.55 : 1 }} selected={selectedSet.has(area.name)}>
                                <TableCell padding="checkbox">
                                  <Checkbox checked={selectedSet.has(area.name)} disabled={locked} inputProps={{ "aria-label": `Select ${area.name}` }} />
                                </TableCell>
                                <TableCell>{area.name}</TableCell>
                                <TableCell align="center">
                                  {selectedSet.has(area.name) ? <Chip label={selected.indexOf(area.name) + 1} size="small" color="info" /> : ""}
                                </TableCell>
                                <TableCell align="right">{area.outlet_count}</TableCell>
                                <TableCell>
                                  {inRoutes.map((route) => (
                                    <Chip key={route.id} label={route.name} size="small" sx={{ mr: 0.5 }} />
                                  ))}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {!visibleAreas.length && (
                            <TableRow><TableCell colSpan={5}>No areas found. Add areas in Create Area first.</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Card>
              <MDBox p={3}>
                <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <MDTypography variant="h5">Routes</MDTypography>
                  <MDButton variant="outlined" color="info" size="small" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
                    Refresh
                  </MDButton>
                </MDBox>
                {!loading && !routes.length && (
                  <MDTypography variant="body2" color="text">No routes yet.</MDTypography>
                )}
                {routes.map((route) => (
                  <MDBox
                    key={route.id}
                    p={1.5}
                    mb={1.5}
                    sx={{
                      border: "1px solid",
                      borderColor: editingRoute?.id === route.id ? "info.main" : "grey.300",
                      borderRadius: "10px",
                    }}
                  >
                    <MDBox display="flex" justifyContent="space-between" alignItems="center">
                      <MDTypography variant="h6">{route.name}</MDTypography>
                      <MDBox display="flex" gap={0.5}>
                        <MDButton variant="text" color="info" size="small" onClick={() => startEdit(route)} disabled={saving}>
                          Edit
                        </MDButton>
                        <MDButton variant="text" color="error" size="small" onClick={() => deleteRoute(route)} disabled={deletingId === route.id}>
                          {deletingId === route.id ? "Deleting…" : "Delete"}
                        </MDButton>
                      </MDBox>
                    </MDBox>
                    <MDTypography variant="caption" color="text" display="block" mb={0.75}>
                      {route.areas.length} area{route.areas.length === 1 ? "" : "s"}
                    </MDTypography>
                    <MDBox display="flex" flexWrap="wrap" gap={0.5}>
                      {route.areas.map((areaName, index) => (
                        <Chip key={areaName} label={`${index + 1}. ${areaName}`} size="small" variant="outlined" />
                      ))}
                    </MDBox>
                  </MDBox>
                ))}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} fullWidth maxWidth="xs">
        <MDBox component="form" onSubmit={saveRoute}>
          <DialogTitle>{editingRoute ? "Save Route" : "Name this Route"}</DialogTitle>
          <DialogContent dividers>
            <MDInput
              label="Route name"
              value={routeName}
              onChange={(event) => setRouteName(event.target.value)}
              fullWidth
              required
              autoFocus
              disabled={saving}
              inputProps={{ maxLength: 100 }}
              helperText="For example R 1 or ROUTE 1. Saved in uppercase."
            />
            <MDTypography variant="caption" display="block" mt={2} fontWeight="bold">
              Area priority ({selected.length} area{selected.length === 1 ? "" : "s"})
            </MDTypography>
            <MDTypography variant="caption" display="block" mb={0.75} color="text">
              1 is delivered first. Use the arrows to change the order. Bills from higher-priority areas come first in Report — Pending Deliveries.
            </MDTypography>
            <MDBox sx={{ border: "1px solid #e2e8f0", borderRadius: "8px", maxHeight: 320, overflowY: "auto" }}>
              {selected.map((areaName, index) => (
                <MDBox key={areaName} display="flex" alignItems="center" gap={1} px={1} py={0.5}
                  sx={{ borderBottom: index < selected.length - 1 ? "1px solid #e2e8f0" : 0 }}>
                  <Chip label={index + 1} size="small" color="info" sx={{ minWidth: 34 }} />
                  <MDTypography variant="button" sx={{ flex: 1 }}>{areaName}</MDTypography>
                  <IconButton size="small" disabled={saving || index === 0} onClick={() => moveArea(index, -1)} aria-label={`Move ${areaName} up`}>
                    <Icon fontSize="small">arrow_upward</Icon>
                  </IconButton>
                  <IconButton size="small" disabled={saving || index === selected.length - 1} onClick={() => moveArea(index, 1)} aria-label={`Move ${areaName} down`}>
                    <Icon fontSize="small">arrow_downward</Icon>
                  </IconButton>
                </MDBox>
              ))}
            </MDBox>
            {saveError && <MDBox mt={2}><Alert severity="error">{saveError}</Alert></MDBox>}
          </DialogContent>
          <DialogActions>
            <MDButton variant="outlined" color="dark" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </MDButton>
            <MDButton type="submit" variant="gradient" color="info" disabled={saving || !routeName.trim()}>
              {saving ? "Saving…" : editingRoute ? "Save Route" : "Create Route"}
            </MDButton>
          </DialogActions>
        </MDBox>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}
