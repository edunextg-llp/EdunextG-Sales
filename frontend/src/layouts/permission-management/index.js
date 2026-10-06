import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Avatar, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Grid, InputAdornment, Switch,
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
  ["create_staff", "Create Staff", "Create and manage staff only for companies assigned to this user."],
  ["location_assignments", "Add Location", "Add and update day-wise locations for staff."],
  ["add_outlet", "Add Outlet", "Create, edit, import, export, or delete customer outlets."],
  ["add_sales", "Add Sales", "Create and manage sales invoices for outlets or customers."],
  ["invoice_lookup", "Invoice Lookup", "Search invoices and view complete invoice details."],
  ["packaging", "Packaging", "View orders awaiting packaging and update packaging status."],
  ["delivery", "Delivery", "View packaged orders, assign delivery staff, and update delivery status."],
  ["delivered", "Delivered", "View delivered or cancelled orders and their delivery details."],
  ["out_bill", "Out Bill", "Assign, track, and return outstanding credit bills."],
  ["requisition_approval", "Requisition Approval", "View, approve, or cancel staff purchase requisitions."],
  ["delivery_manager", "Delivery Manager", "Grant every Delivery Manager submenu."],
  ["staff_management", "Staff Management", "Grant every available Staff Management submenu."],
  ["chalan", "Chalan", "Grant every Chalan submenu."],
  ["chalan_add_sales", "Chalan Add Sales", "Create and manage Chalan sales."],
  ["chalan_packaging", "Chalan Packaging", "Package Chalan sales."],
  ["chalan_delivery", "Chalan Delivery", "Assign and deliver Chalan sales."],
  ["chalan_delivered", "Chalan Delivered", "View and manage delivered Chalan sales."],
  ["chalan_return", "Chalan Return", "Process and manage Chalan returns."],
];
const PERMISSION_FOLDERS = [
  { key: "dms", label: "DMS", icon: "inventory_2", description: "Sellers, items and stock list.", children: ["add_seller", "add_item", "item_list"] },
  { key: "delivery_manager", label: "Delivery Manager", icon: "local_shipping", description: "Packaging, delivery and delivered orders.", children: ["packaging", "delivery", "delivered"] },
  { key: "staff_management", label: "Staff Management", icon: "badge", description: "Create staff, locations and outlets.", children: ["create_staff", "location_assignments", "add_outlet"] },
  { key: "chalan", label: "Chalan", icon: "receipt_long", description: "The full Chalan workflow.", children: ["chalan_add_sales", "chalan_packaging", "chalan_delivery", "chalan_delivered", "chalan_return"] },
];
const FOLDER_KEYS = PERMISSION_FOLDERS.flatMap((folder) => [folder.key, ...folder.children]);
const GENERAL_GROUP = {
  key: "general",
  label: "General Pages",
  icon: "dashboard",
  description: "Individual pages outside a section.",
  children: PERMISSIONS.filter(([key]) => !FOLDER_KEYS.includes(key)).map(([key]) => key),
};
const DISPLAY_ONLY_FOLDER_KEYS = ["delivery_manager", "staff_management", "chalan"];
// The pages a user can actually be granted (folder keys are just groupings).
const PAGE_KEYS = [...GENERAL_GROUP.children, ...PERMISSION_FOLDERS.flatMap((folder) => folder.children)];
const PERMISSION_MAP = Object.fromEntries(PERMISSIONS.map(([key, label, description]) => [key, { label, description }]));
const ROLE_LABELS = { packaging_staff: "Packaging Staff", delivery_boy: "Delivery Boy" };
const ROLE_FILTERS = [["all", "All"], ["packaging_staff", "Packaging"], ["delivery_boy", "Delivery"]];

const roleLabel = (role) => ROLE_LABELS[role] || "Delivery Boy";
const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
const pageCount = (list = []) => PAGE_KEYS.filter((key) => list.includes(key)).length;
const sameSet = (a, b) => {
  const left = a.filter((key) => !DISPLAY_ONLY_FOLDER_KEYS.includes(key));
  const right = b.filter((key) => !DISPLAY_ONLY_FOLDER_KEYS.includes(key));
  return left.length === right.length && left.every((key) => right.includes(key));
};

function PermissionManagement() {
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);

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

  const selectedUser = users.find((user) => String(user.id) === String(selectedId));

  useEffect(() => {
    setPermissions(selectedUser?.permissions || []);
    setMessage("");
  }, [selectedId, users]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = Boolean(selectedUser) && !sameSet(permissions, selectedUser.permissions || []);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => (roleFilter === "all" || user.role === roleFilter)
      && (!term || `${user.name} ${user.loginId || ""}`.toLowerCase().includes(term)));
  }, [users, search, roleFilter]);

  const selectUser = (id) => {
    if (String(id) === String(selectedId)) return;
    if (dirty) {
      setPendingUserId(String(id));
      return;
    }
    setSelectedId(String(id));
  };

  const togglePermission = (key) => setPermissions((current) => {
    const folder = PERMISSION_FOLDERS.find((item) => item.children.includes(key));
    if (current.includes(key)) {
      const next = current.filter((item) => item !== key);
      if (folder && !folder.children.some((permission) => next.includes(permission))) {
        return next.filter((item) => item !== folder.key);
      }
      return next;
    }
    return folder ? [...new Set([...current, folder.key, key])] : [...current, key];
  });

  const toggleGroup = (group) => setPermissions((current) => {
    const groupKeys = group.key === "general" ? group.children : [group.key, ...group.children];
    const allSelected = group.children.every((key) => current.includes(key));
    return allSelected
      ? current.filter((key) => !groupKeys.includes(key))
      : [...new Set([...current, ...groupKeys])];
  });

  const grantAll = () => setPermissions([...GENERAL_GROUP.children, ...FOLDER_KEYS]);
  const clearAll = () => setPermissions([]);
  const resetChanges = () => setPermissions(selectedUser?.permissions || []);

  const savePermissions = async () => {
    if (!selectedUser) return;
    setConfirmSaveOpen(false);
    // Folder keys are UI grouping keys. The child menu permissions are what the
    // server persists and enforces, so older assigned permissions remain valid.
    const savedPermissions = permissions.filter((key) => !DISPLAY_ONLY_FOLDER_KEYS.includes(key));
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API}/delivery-boy/${selectedUser.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: savedPermissions }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save permissions.");
      setUsers((current) => current.map((user) => (
        user.id === selectedUser.id ? { ...user, permissions: savedPermissions } : user
      )));
      setMessage(`${selectedUser.name}'s permissions were saved. They apply the next time ${selectedUser.name} signs in.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const groups = [GENERAL_GROUP, ...PERMISSION_FOLDERS];
  const grantedLabels = PAGE_KEYS.filter((key) => permissions.includes(key)).map((key) => PERMISSION_MAP[key].label);

  const renderGroup = (group) => {
    const selectedCount = group.children.filter((key) => permissions.includes(key)).length;
    const allSelected = selectedCount === group.children.length;
    return (
      <Card key={group.key} sx={{ height: "100%", boxShadow: "none", border: "1px solid #e2e8f0" }}>
        <MDBox display="flex" alignItems="center" gap={1.25} px={2} py={1.5}
          sx={{ backgroundColor: selectedCount ? "#eff6ff" : "#f8fafc", borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <MDBox display="flex" alignItems="center" justifyContent="center"
            sx={{ width: 34, height: 34, borderRadius: "10px", backgroundColor: selectedCount ? "#1A73E8" : "#cbd5e1", color: "#fff", flexShrink: 0 }}>
            <Icon fontSize="small">{group.icon}</Icon>
          </MDBox>
          <MDBox flexGrow={1} minWidth={0}>
            <MDTypography variant="button" fontWeight="bold" display="block">{group.label}</MDTypography>
            <MDTypography variant="caption" color="text" display="block">{group.description}</MDTypography>
          </MDBox>
          <Chip size="small" label={`${selectedCount}/${group.children.length}`}
            sx={{ fontWeight: 600, backgroundColor: selectedCount ? "#dbeafe" : "#e2e8f0", color: selectedCount ? "#1d4ed8" : "#475569" }} />
          <Checkbox size="small" checked={allSelected} indeterminate={selectedCount > 0 && !allSelected}
            onChange={() => toggleGroup(group)} inputProps={{ "aria-label": `Grant all ${group.label}` }} />
        </MDBox>
        <MDBox px={1} py={0.5}>
          {group.children.map((key, index) => (
            <MDBox key={key}>
              {index > 0 && <Divider sx={{ my: 0 }} />}
              <MDBox component="label" display="flex" alignItems="center" gap={1} px={1} py={1}
                sx={{ cursor: "pointer", borderRadius: "8px", "&:hover": { backgroundColor: "#f8fafc" } }}>
                <MDBox flexGrow={1} minWidth={0}>
                  <MDTypography variant="button" fontWeight="medium" display="block">{PERMISSION_MAP[key].label}</MDTypography>
                  <MDTypography variant="caption" color="text" display="block" sx={{ lineHeight: 1.35 }}>
                    {PERMISSION_MAP[key].description}
                  </MDTypography>
                </MDBox>
                <Switch checked={permissions.includes(key)} onChange={() => togglePermission(key)}
                  inputProps={{ "aria-label": PERMISSION_MAP[key].label }} />
              </MDBox>
            </MDBox>
          ))}
        </MDBox>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <MDBox mb={3}>
          <MDTypography variant="h4" fontWeight="bold">Permission Management</MDTypography>
          <MDTypography variant="button" color="text" fontWeight="regular">
            Choose a staff member, switch on the pages they can open, then save.
          </MDTypography>
        </MDBox>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}
        {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage("")}>{message}</Alert>}

        {loading ? (
          <MDBox py={8} textAlign="center"><CircularProgress /></MDBox>
        ) : users.length === 0 ? (
          <Alert severity="info">Create Packaging Staff or a Delivery Boy first.</Alert>
        ) : (
          <Grid container spacing={3}>
            {/* Staff list */}
            <Grid item xs={12} md={4} lg={3.5}>
              <Card sx={{ position: { md: "sticky" }, top: { md: 90 } }}>
                <MDBox p={2} pb={1}>
                  <MDTypography variant="h6" mb={1.5}>Staff ({users.length})</MDTypography>
                  <MDInput fullWidth placeholder="Search name or login ID" value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Icon fontSize="small">search</Icon></InputAdornment> }} />
                  <MDBox display="flex" gap={0.75} mt={1.5} flexWrap="wrap">
                    {ROLE_FILTERS.map(([value, label]) => (
                      <Chip key={value} label={label} size="small" clickable onClick={() => setRoleFilter(value)}
                        color={roleFilter === value ? "info" : "default"} variant={roleFilter === value ? "filled" : "outlined"} />
                    ))}
                  </MDBox>
                </MDBox>
                <Divider sx={{ my: 1 }} />
                <MDBox px={1} pb={1} sx={{ maxHeight: { md: "calc(100vh - 290px)" }, overflowY: "auto" }}>
                  {filteredUsers.length === 0 && (
                    <MDTypography variant="caption" color="text" display="block" textAlign="center" py={3}>No staff match your search.</MDTypography>
                  )}
                  {filteredUsers.map((user) => {
                    const active = String(user.id) === String(selectedId);
                    const count = pageCount(user.permissions);
                    return (
                      <MDBox key={user.id} role="button" tabIndex={0} onClick={() => selectUser(user.id)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectUser(user.id); }}
                        display="flex" alignItems="center" gap={1.25} px={1.25} py={1} mb={0.5}
                        sx={{
                          cursor: "pointer", borderRadius: "10px",
                          backgroundColor: active ? "#eff6ff" : "transparent",
                          border: `1px solid ${active ? "#93c5fd" : "transparent"}`,
                          "&:hover": { backgroundColor: active ? "#eff6ff" : "#f8fafc" },
                        }}>
                        <Avatar sx={{ width: 36, height: 36, fontSize: "0.8rem", bgcolor: user.role === "packaging_staff" ? "#7c3aed" : "#0891b2" }}>
                          {initials(user.name)}
                        </Avatar>
                        <MDBox flexGrow={1} minWidth={0}>
                          <MDTypography variant="button" fontWeight={active ? "bold" : "medium"} display="block" noWrap>{user.name}</MDTypography>
                          <MDTypography variant="caption" color="text" display="block" noWrap>{roleLabel(user.role)}</MDTypography>
                        </MDBox>
                        <Chip size="small" label={count ? `${count} page${count === 1 ? "" : "s"}` : "None"}
                          sx={{ fontSize: "0.7rem", backgroundColor: count ? "#dcfce7" : "#f1f5f9", color: count ? "#166534" : "#64748b" }} />
                      </MDBox>
                    );
                  })}
                </MDBox>
              </Card>
            </Grid>

            {/* Permissions editor */}
            <Grid item xs={12} md={8} lg={8.5}>
              {selectedUser && (
                <>
                  <Card sx={{ mb: 3 }}>
                    <MDBox p={2.5} display="flex" alignItems="center" gap={2} flexWrap="wrap">
                      <Avatar sx={{ width: 52, height: 52, bgcolor: selectedUser.role === "packaging_staff" ? "#7c3aed" : "#0891b2" }}>
                        {initials(selectedUser.name)}
                      </Avatar>
                      <MDBox flexGrow={1} minWidth={200}>
                        <MDTypography variant="h5" fontWeight="bold">{selectedUser.name}</MDTypography>
                        <MDBox display="flex" gap={1} mt={0.5} flexWrap="wrap" alignItems="center">
                          <Chip size="small" label={roleLabel(selectedUser.role)} variant="outlined" />
                          <MDTypography variant="caption" color="text">
                            Login ID: <strong>{selectedUser.loginId || "Not generated"}</strong>
                          </MDTypography>
                        </MDBox>
                      </MDBox>
                      <MDBox textAlign="right">
                        <MDTypography variant="h4" fontWeight="bold" color="info">
                          {pageCount(permissions)}<MDTypography component="span" variant="button" color="text"> / {PAGE_KEYS.length}</MDTypography>
                        </MDTypography>
                        <MDTypography variant="caption" color="text">pages allowed</MDTypography>
                      </MDBox>
                    </MDBox>
                    <Divider sx={{ my: 0 }} />
                    <MDBox px={2.5} py={1.5} display="flex" gap={1} flexWrap="wrap">
                      <MDButton size="small" variant="outlined" color="info" onClick={grantAll}>
                        <Icon sx={{ mr: 0.5 }}>done_all</Icon>Allow all pages
                      </MDButton>
                      <MDButton size="small" variant="outlined" color="secondary" onClick={clearAll}>
                        <Icon sx={{ mr: 0.5 }}>block</Icon>Remove all
                      </MDButton>
                    </MDBox>
                  </Card>

                  <Grid container spacing={2.5}>
                    {groups.map((group) => (
                      <Grid item xs={12} xl={6} key={group.key}>{renderGroup(group)}</Grid>
                    ))}
                  </Grid>

                  {/* Save bar */}
                  <Card sx={{ position: "sticky", bottom: 16, mt: 3, zIndex: 2, border: dirty ? "1px solid #fbbf24" : "1px solid #e2e8f0" }}>
                    <MDBox px={2.5} py={1.5} display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                      <Icon sx={{ color: dirty ? "#d97706" : "#16a34a" }}>{dirty ? "edit_note" : "check_circle"}</Icon>
                      <MDTypography variant="button" fontWeight="medium" sx={{ flexGrow: 1 }}>
                        {dirty ? "You have unsaved changes" : "All changes saved"}
                      </MDTypography>
                      <MDButton variant="text" color="secondary" disabled={!dirty || saving} onClick={resetChanges}>Discard</MDButton>
                      <MDButton color="info" variant="gradient" disabled={!dirty || saving} onClick={() => setConfirmSaveOpen(true)}>
                        <Icon sx={{ mr: 0.5 }}>save</Icon>{saving ? "Saving..." : "Save Permissions"}
                      </MDButton>
                    </MDBox>
                  </Card>
                </>
              )}
            </Grid>
          </Grid>
        )}
      </MDBox>

      <Dialog open={confirmSaveOpen} onClose={() => setConfirmSaveOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Save permissions for {selectedUser?.name}?</DialogTitle>
        <DialogContent>
          {grantedLabels.length ? (
            <MDBox display="flex" gap={0.75} flexWrap="wrap">
              {grantedLabels.map((label) => <Chip key={label} label={label} size="small" color="info" variant="outlined" />)}
            </MDBox>
          ) : (
            <MDTypography variant="button" color="text">No pages selected — this user will not be able to open any page.</MDTypography>
          )}
          <MDTypography variant="caption" color="text" display="block" mt={2}>
            Changes apply the next time this user signs in.
          </MDTypography>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" onClick={() => setConfirmSaveOpen(false)}>Cancel</MDButton>
          <MDButton color="info" variant="gradient" onClick={savePermissions}>Yes, Save</MDButton>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(pendingUserId)} onClose={() => setPendingUserId(null)} fullWidth maxWidth="xs">
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <MDTypography variant="button" color="text">
            You changed {selectedUser?.name}&apos;s permissions but didn&apos;t save them.
          </MDTypography>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" onClick={() => setPendingUserId(null)}>Keep editing</MDButton>
          <MDButton color="error" variant="gradient" onClick={() => { setSelectedId(pendingUserId); setPendingUserId(null); }}>
            Discard
          </MDButton>
        </DialogActions>
      </Dialog>
      <Footer />
    </DashboardLayout>
  );
}

export default PermissionManagement;
