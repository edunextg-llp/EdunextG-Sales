import { useEffect, useMemo, useState } from "react";
import {
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import PropTypes from "prop-types";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import { reportAreaName } from "utils/areaName";

// Assign every pending bill of a route to one delivery boy, while letting
// individual bills go to a different delivery boy.
export default function RouteAssignDialog({ open, route, bills, boys, defaultDate, onClose, onStage }) {
  const [routeBoy, setRouteBoy] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [vehicle, setVehicle] = useState("");
  const [included, setIncluded] = useState([]); // bill ids
  const [overrides, setOverrides] = useState({}); // bill id -> boy id
  const [otherVehicles, setOtherVehicles] = useState({}); // boy id -> vehicle
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setRouteBoy("");
    setDate(defaultDate);
    setVehicle("");
    setIncluded(bills.map((row) => String(row.id)));
    setOverrides({});
    setOtherVehicles({});
    setError("");
    // Reset only when the dialog opens for a route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route?.id]);

  const boyName = (id) => boys.find((person) => String(person.id) === String(id))?.name || "Delivery Boy";
  const includedSet = new Set(included);
  const includedBills = bills.filter((row) => includedSet.has(String(row.id)));
  const assignedBoyOf = (row) => overrides[String(row.id)] || routeBoy;

  const otherBoyIds = useMemo(
    () => [...new Set(includedBills.map((row) => overrides[String(row.id)]).filter((id) => id && id !== routeBoy))],
    [includedBills, overrides, routeBoy]
  );

  const countsByBoy = includedBills.reduce((map, row) => {
    const id = assignedBoyOf(row) || "";
    map.set(id, (map.get(id) || 0) + 1);
    return map;
  }, new Map());

  const toggleBill = (id) =>
    setIncluded((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  const allIncluded = bills.length > 0 && includedBills.length === bills.length;

  const setBillBoy = (id, boyId) =>
    setOverrides((prev) => {
      const next = { ...prev };
      if (!boyId || boyId === routeBoy) delete next[id];
      else next[id] = boyId;
      return next;
    });

  const handleStage = () => {
    setError("");
    if (!includedBills.length) {
      setError("Select at least one bill.");
      return;
    }
    if (!date) {
      setError("Select a delivery date.");
      return;
    }
    const routeRows = includedBills.filter((row) => !overrides[String(row.id)] || overrides[String(row.id)] === routeBoy);
    if (routeRows.length && (!routeBoy || !vehicle.trim())) {
      setError("Select the route delivery boy and vehicle number.");
      return;
    }
    const missingVehicle = otherBoyIds.find((id) => !String(otherVehicles[id] || "").trim());
    if (missingVehicle) {
      setError(`Enter a vehicle number for ${boyName(missingVehicle)}.`);
      return;
    }

    const drafts = [];
    if (routeRows.length) {
      drafts.push({ boy: routeBoy, name: boyName(routeBoy), date, vehicle: vehicle.trim(), rows: routeRows });
    }
    otherBoyIds.forEach((id) => {
      const rows = includedBills.filter((row) => overrides[String(row.id)] === id);
      if (rows.length) drafts.push({ boy: id, name: boyName(id), date, vehicle: String(otherVehicles[id]).trim(), rows });
    });
    onStage(drafts);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        Assign Route {route?.name} — {bills.length} pending bill{bills.length === 1 ? "" : "s"}
      </DialogTitle>
      <DialogContent dividers>
        <MDBox display="flex" flexWrap="wrap" gap={0.5} mb={2}>
          {(route?.areas || []).map((area) => (
            <Chip key={area} label={area} size="small" variant="outlined" />
          ))}
        </MDBox>

        <Grid container spacing={2} mb={2}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel id="route-boy-label">Route Delivery Boy</InputLabel>
              <Select
                labelId="route-boy-label"
                label="Route Delivery Boy"
                value={routeBoy}
                onChange={(event) => setRouteBoy(event.target.value)}
                sx={{ height: 44 }}
              >
                {boys.map((person) => (
                  <MenuItem key={person.id} value={String(person.id)}>{person.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <MDInput type="date" label="Delivery Date" InputLabelProps={{ shrink: true }} fullWidth value={date} onChange={(event) => setDate(event.target.value)} />
          </Grid>
          <Grid item xs={12} md={4}>
            <MDInput label="Vehicle Number" fullWidth value={vehicle} onChange={(event) => setVehicle(event.target.value)} />
          </Grid>
          {otherBoyIds.map((id) => (
            <Grid item xs={12} md={4} key={id}>
              <MDInput
                label={`Vehicle for ${boyName(id)}`}
                fullWidth
                value={otherVehicles[id] || ""}
                onChange={(event) => setOtherVehicles((prev) => ({ ...prev, [id]: event.target.value }))}
              />
            </Grid>
          ))}
        </Grid>

        <MDTypography variant="caption" display="block" mb={1}>
          All bills go to the route delivery boy. To send a single bill to someone else, change its Delivery Boy. Untick a bill to leave it in the report.
        </MDTypography>

        <TableContainer sx={{ maxHeight: "50vh" }}>
          <Table size="small" stickyHeader sx={{ "& .MuiTableCell-root": { fontSize: "0.8125rem" } }}>
            <TableHead sx={{ display: "table-header-group" }}>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allIncluded}
                    indeterminate={includedBills.length > 0 && !allIncluded}
                    onChange={() => setIncluded(allIncluded ? [] : bills.map((row) => String(row.id)))}
                    inputProps={{ "aria-label": "Select all bills in this route" }}
                  />
                </TableCell>
                <TableCell>Invoice number</TableCell>
                <TableCell>Outlet name</TableCell>
                <TableCell>Area</TableCell>
                <TableCell>Company</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell sx={{ minWidth: 200 }}>Delivery Boy</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bills.map((row) => {
                const id = String(row.id);
                const isIncluded = includedSet.has(id);
                const override = overrides[id];
                return (
                  <TableRow key={id} hover selected={Boolean(override)}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={isIncluded} onChange={() => toggleBill(id)} inputProps={{ "aria-label": `Include invoice ${row.invoice_number || row.id}` }} />
                    </TableCell>
                    <TableCell>{row.invoice_number || "N/A"}</TableCell>
                    <TableCell>{row.outlet_name || "Outlet not assigned"}</TableCell>
                    <TableCell>{reportAreaName(row.location_name)}</TableCell>
                    <TableCell>{row.company_name || "Company not assigned"}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>Rs. {Number(row.price || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Select
                        size="small"
                        fullWidth
                        displayEmpty
                        disabled={!isIncluded}
                        value={override || ""}
                        onChange={(event) => setBillBoy(id, event.target.value)}
                        sx={{ height: 32, fontSize: "0.8125rem", backgroundColor: override ? "#fef3c7" : "#fff" }}
                      >
                        <MenuItem value="">{routeBoy ? `Route boy (${boyName(routeBoy)})` : "Route boy"}</MenuItem>
                        {boys
                          .filter((person) => String(person.id) !== routeBoy)
                          .map((person) => (
                            <MenuItem key={person.id} value={String(person.id)}>{person.name}</MenuItem>
                          ))}
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!bills.length && (
                <TableRow><TableCell colSpan={7}>No pending bills in this route&apos;s areas.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {error && <MDTypography variant="body2" color="error" mt={1}>{error}</MDTypography>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1 }}>
        <MDTypography variant="caption" sx={{ mr: "auto", pl: 1 }}>
          {includedBills.length} of {bills.length} bills
          {[...countsByBoy.entries()].map(([id, count]) => ` · ${id ? boyName(id) : "Route boy"}: ${count}`).join("")}
        </MDTypography>
        <MDButton color="secondary" onClick={onClose}>Cancel</MDButton>
        <MDButton color="info" variant="gradient" disabled={!includedBills.length} onClick={handleStage}>
          Add to View ({includedBills.length})
        </MDButton>
      </DialogActions>
    </Dialog>
  );
}

RouteAssignDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  route: PropTypes.shape({ id: PropTypes.number, name: PropTypes.string, areas: PropTypes.arrayOf(PropTypes.string) }),
  bills: PropTypes.arrayOf(PropTypes.object).isRequired,
  boys: PropTypes.arrayOf(PropTypes.object).isRequired,
  defaultDate: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onStage: PropTypes.func.isRequired,
};

RouteAssignDialog.defaultProps = { route: null };
