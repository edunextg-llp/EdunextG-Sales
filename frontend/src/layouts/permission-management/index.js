import { useCallback, useEffect, useState } from "react";
import {
  Alert, Card, Checkbox, Chip, CircularProgress, FormControlLabel, Grid, IconButton,
  MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip,
} from "@mui/material";
import Icon from "@mui/material/Icon";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";

const API = "https://bawarchee.edunextg.co/api";
const PERMISSIONS = [
  ["dashboard", "Dashboard", "View the dashboard, reports, and business summary."],
  ["dms", "DMS", "Open the DMS section. This is required for DMS-related permissions."],
  ["add_seller", "Add Seller", "Create and manage suppliers from whom products are purchased."],
  ["add_item", "Add Item", "Create and manage products supplied by sellers."],
  ["item_list", "Item List", "View and manage the DMS product and stock item list."],
  ["update_payment", "Update Payment", "View sales and add, edit, or delete their payment entries."],
  ["bank_deposit", "Bank Deposit", "View and manage cash, cheque, and UPI bank deposits."],
  ["add_outlet", "Add Outlet", "Create, edit, import, export, or delete customer outlets."],
  ["add_sales", "Add Sales", "Create and manage sales invoices for outlets or customers."],
  ["out_bill", "Out Bill", "Assign, track, and return outstanding credit bills."],
];

function PermissionManagement() {
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/delivery-boy/permissions`);
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data.error || "Unable to load users.");
      setUsers(data);
      setSelectedId((value) => value || (data[0]?.id ? String(data[0].id) : ""));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    const selected = users.find((user) => String(user.id) === String(selectedId));
    setPermissions(selected?.permissions || []);
    setMessage("");
  }, [selectedId, users]);

  const selectedUser = users.find((user) => String(user.id) === String(selectedId));
  const togglePermission = (key) => setPermissions((current) => {
    if (current.includes(key)) {
      if (key === "dms") {
        return current.filter((item) => !["dms", "add_seller", "add_item", "item_list"].includes(item));
      }
      return current.filter((item) => item !== key);
    }
    if (["add_seller", "add_item", "item_list"].includes(key)) {
      return [...new Set([...current, "dms", key])];
    }
    return [...current, key];
  });

  const savePermissions = async () => {
    if (!selectedUser) return;
    const permissionLabels = PERMISSIONS
      .filter(([key]) => permissions.includes(key))
      .map(([, label]) => label);
    const confirmed = window.confirm(
      `Save permissions for ${selectedUser.name}?\n\n${permissionLabels.length > 0
        ? `Permissions: ${permissionLabels.join(", ")}`
        : "No page permissions selected"
      }`
    );
    if (!confirmed) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API}/delivery-boy/${selectedUser.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save permissions.");
      setUsers((current) => current.map((user) => (
        user.id === selectedUser.id ? { ...user, permissions } : user
      )));
      setMessage(data.message || "Permissions updated successfully.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Card>
          <MDBox variant="gradient" bgColor="info" borderRadius="lg" coloredShadow="info" mx={2} mt={-3} p={3}>
            <MDTypography variant="h4" color="white">Permission Management</MDTypography>
            <MDTypography variant="body2" color="white">
              Assign page access for Packaging Staff or Delivery Boys.
            </MDTypography>
          </MDBox>
          <MDBox p={3}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
            {loading ? (
              <MDBox py={6} textAlign="center"><CircularProgress /></MDBox>
            ) : users.length === 0 ? (
              <Alert severity="info">Create Packaging Staff or a Delivery Boy first.</Alert>
            ) : (
              <Grid container spacing={3}>
                <Grid item xs={12} md={5}>
                  <MDInput
                    select
                    fullWidth
                    label="Packaging Staff / Delivery Boy"
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    sx={{
                      "& .MuiInputBase-root": { minHeight: 58 },
                      "& .MuiSelect-select": {
                        minHeight: "unset !important",
                        display: "flex",
                        alignItems: "center",
                        py: "16px !important",
                      },
                    }}
                  >
                    {users.map((user) => (
                      <MenuItem key={user.id} value={String(user.id)}>
                        {user.name} — {user.role === "packaging_staff" ? "Packaging Staff" : "Delivery Boy"}
                      </MenuItem>
                    ))}
                  </MDInput>
                  {selectedUser && (
                    <MDBox mt={2} p={2} sx={{ border: "1px solid #e2e8f0", borderRadius: 2 }}>
                      <MDTypography variant="button" fontWeight="bold">{selectedUser.name}</MDTypography>
                      <MDBox mt={1} display="flex" gap={1} flexWrap="wrap">
                        <Chip size="small" color={selectedUser.isActive ? "success" : "default"}
                          label={selectedUser.isActive ? "Active" : "Inactive"} />
                        <Chip size="small"
                          label={selectedUser.role === "packaging_staff" ? "Packaging Staff" : "Delivery Boy"} />
                      </MDBox>
                      <MDTypography variant="caption" display="block" mt={1.5}>
                        Login ID: {selectedUser.loginId || "Not generated"}
                      </MDTypography>
                    </MDBox>
                  )}
                </Grid>
                <Grid item xs={12} md={7}>
                  <MDTypography variant="h6" mb={1}>Page Permissions</MDTypography>
                  <MDBox display="grid" sx={{ gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1 }}>
                    {PERMISSIONS.map(([key, label, description]) => (
                      <MDBox key={key} display="flex" alignItems="center">
                        <FormControlLabel
                          sx={{ mr: 0 }}
                          control={<Checkbox checked={permissions.includes(key)} onChange={() => togglePermission(key)} />}
                          label={label}
                        />
                        <Tooltip title={description} arrow>
                          <IconButton size="small" aria-label={`About ${label} permission`}>
                            <Icon fontSize="small">info_outline</Icon>
                          </IconButton>
                        </Tooltip>
                      </MDBox>
                    ))}
                  </MDBox>
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Check DMS together with Add Seller, Add Item, or Item List.
                  </Alert>
                </Grid>
                <Grid item xs={12}>
                  <MDBox display="flex" gap={1.5} flexWrap="wrap" justifyContent="flex-end">
                    <MDButton color="info" variant="gradient" onClick={savePermissions}
                      disabled={!selectedUser || saving} startIcon={<Icon>save</Icon>}>
                      {saving ? "Saving..." : "Save Permissions"}
                    </MDButton>
                  </MDBox>
                </Grid>
                <Grid item xs={12}>
                  <MDBox mt={2}>
                    <MDTypography variant="h6" mb={1.5}>
                      Staff Permission Summary
                    </MDTypography>
                    <TableContainer sx={{ border: "1px solid #e2e8f0", borderRadius: 2 }}>
                      <Table size="small">
                        <TableHead sx={{ display: "table-header-group" }}>
                          <TableRow sx={{ backgroundColor: "#f8fafc" }}>
                            <TableCell><strong>Staff Name</strong></TableCell>
                            <TableCell><strong>Role</strong></TableCell>
                            <TableCell><strong>Login ID</strong></TableCell>
                            <TableCell><strong>Permissions</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {users.map((user) => (
                            <TableRow key={user.id} hover>
                              <TableCell>{user.name}</TableCell>
                              <TableCell>
                                {user.role === "packaging_staff" ? "Packaging Staff" : "Delivery Boy"}
                              </TableCell>
                              <TableCell>{user.loginId || "Not generated"}</TableCell>
                              <TableCell>
                                <MDBox display="flex" gap={0.75} flexWrap="wrap">
                                  {user.permissions.length > 0 ? (
                                    PERMISSIONS
                                      .filter(([key]) => user.permissions.includes(key))
                                      .map(([key, label]) => (
                                        <Chip key={key} label={label} size="small" color="info" variant="outlined" />
                                      ))
                                  ) : (
                                    <MDTypography variant="caption" color="text">
                                      No permissions
                                    </MDTypography>
                                  )}
                                </MDBox>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </MDBox>
                </Grid>
              </Grid>
            )}
          </MDBox>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default PermissionManagement;
