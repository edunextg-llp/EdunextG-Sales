// Top bar: Tailwind CSS (no MUI, except the admin "Update Login" dialog which is unchanged).
// Sticky across the page: menu button (small screens), breadcrumb + page title, admin actions,
// credit-due notifications and the signed-in user. Same logic as before.
import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "react-router-dom";
import PropTypes from "prop-types";

import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MDBox from "components/MDBox";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import { useMaterialUIController, setMiniSidenav } from "context";
import { useAuth } from "context/AuthContext";
import { SIDEBAR_MINI_WIDTH, SIDEBAR_WIDTH } from "examples/Sidenav";

const ROLE_LABELS = {
  admin: "Administrator",
  staff: "Marketing Staff",
  packaging_staff: "Packaging Staff",
  delivery_boy: "Delivery",
  bawarchee_staff: "Bawarchee Staff",
  distributor: "Distributor",
};
// "invoice-report" -> "Invoice Report"
const pageTitle = (segment) => String(segment || "dashboard").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function TopIcon({ name, className }) {
  return <span className={`material-icons-round leading-none ${className}`} aria-hidden="true">{name}</span>;
}
TopIcon.propTypes = { name: PropTypes.string.isRequired, className: PropTypes.string };
TopIcon.defaultProps = { className: "text-[21px]" };

const iconButton = "relative inline-flex size-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40";

// eslint-disable-next-line no-unused-vars
function DashboardNavbar({ absolute, light, isMini }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav } = controller;
  const { user, token, logout } = useAuth();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef(null);
  const route = useLocation().pathname.split("/").slice(1).filter(Boolean);
  const [notifications, setNotifications] = useState([]);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    // Credit notifications are an admin-only feature. Avoid making this
    // request for staff users, whose API access is limited to requisitions.
    if (user?.role !== "admin") {
      setNotifications([]);
      return undefined;
    }

    const fetchPendingCredits = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/staff/credits/pending`);
        if (response.ok) {
          const data = await response.json();
          const dueTomorrow = data.filter((credit) => {
            if (!credit.credit_days || !credit.sale_date) return false;
            const saleDate = new Date(credit.sale_date);
            const msInDay = 24 * 60 * 60 * 1000;
            const dueDate = new Date(saleDate.getTime() + credit.credit_days * msInDay);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            dueDate.setHours(0, 0, 0, 0);
            return Math.round((dueDate - now) / msInDay) === 1;
          });
          setNotifications(dueTomorrow);
        }
      } catch (error) {
        console.error("Error fetching credits for notifications:", error);
      }
    };
    fetchPendingCredits();
    return undefined;
  }, [user?.role]);

  // Close the notifications panel on an outside click or Escape.
  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const onClick = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) setNotificationsOpen(false);
    };
    const onKey = (event) => { if (event.key === "Escape") setNotificationsOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [notificationsOpen]);

  const handleMiniSidenav = () => setMiniSidenav(dispatch, !miniSidenav);

  const openCredentialsDialog = () => {
    setLoginId(user?.email || "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCredentialsDialogOpen(true);
  };

  const closeCredentialsDialog = () => {
    if (!savingCredentials) setCredentialsDialogOpen(false);
  };

  const handleUpdateAdminCredentials = async () => {
    if (!loginId.trim() || !currentPassword || newPassword.length < 8) {
      alert("Enter your Login ID, current password, and a new password of at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("New password and confirmation do not match.");
      return;
    }

    setSavingCredentials(true);
    try {
      const authToken = token || sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token");
      if (!authToken) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/admin/credentials`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          loginId: loginId.trim(),
          currentPassword,
          newPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update admin credentials.");
      alert("Admin Login ID and password updated successfully. Use the new details the next time you sign in.");
      setCredentialsDialogOpen(false);
    } catch (error) {
      alert(error.message || "Unable to update admin credentials.");
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    if (loggingOutAll) return;
    const confirmed = window.confirm(
      "Log out the admin account from all devices? You will also be signed out here."
    );
    if (!confirmed) return;

    setLoggingOutAll(true);
    try {
      const authToken = token || sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token");
      if (!authToken) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/admin/logout-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 401) {
        throw new Error(data.error || "Unable to log out from all devices.");
      }
      logout();
      window.location.href = "/authentication/sign-in";
    } catch (error) {
      alert(error.message || "Unable to log out from all devices.");
      setLoggingOutAll(false);
    }
  };


  const displayName = user?.name || user?.username || user?.loginId || user?.email || "User";
  const initials = String(displayName).replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "U";
  const title = pageTitle(route[route.length - 1]);

  return (
    <>
    {/* Takes the header's place in the page, so content starts below the fixed header. */}
    <div aria-hidden="true" className="-mx-6 -mt-6 mb-6 h-16" />
    <header
      style={{ "--sidebar-w": `${miniSidenav ? SIDEBAR_MINI_WIDTH : SIDEBAR_WIDTH}px` }}
      className="fixed inset-x-0 top-0 z-[1100] border-b border-slate-200 bg-white/90 px-4 font-[Poppins,Roboto,sans-serif] shadow-[0_1px_3px_rgba(15,23,42,0.06)] backdrop-blur-md transition-[left] duration-200 sm:px-6 xl:left-[var(--sidebar-w)]"
    >
      <div className="flex h-16 items-center gap-3">
        <button
          type="button" onClick={handleMiniSidenav} className={`${iconButton} xl:hidden`}
          aria-label={miniSidenav ? "Open navigation menu" : "Close navigation menu"} title={miniSidenav ? "Open menu" : "Close menu"}
        >
          <TopIcon name="menu" />
        </button>
        <button
          type="button" onClick={handleMiniSidenav} className={`${iconButton} hidden xl:inline-flex`}
          aria-label={miniSidenav ? "Expand sidebar" : "Collapse sidebar"} title={miniSidenav ? "Expand sidebar" : "Collapse sidebar"}
        >
          <TopIcon name={miniSidenav ? "menu_open" : "menu"} />
        </button>

        <div className="min-w-0 grow">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-slate-400">
            <Link to="/" className="inline-flex items-center hover:text-slate-700" aria-label="Home"><TopIcon name="home" className="text-[15px]" /></Link>
            {route.map((segment, index) => (
              <span key={`${segment}-${index}`} className="inline-flex items-center gap-1">
                <TopIcon name="chevron_right" className="text-[15px]" />
                {index === route.length - 1 ? (
                  <span className="font-medium text-slate-600">{pageTitle(segment)}</span>
                ) : (
                  <Link to={`/${route.slice(0, index + 1).join("/")}`} className="hover:text-slate-700">{pageTitle(segment)}</Link>
                )}
              </span>
            ))}
          </nav>
          <h1 className="m-0 truncate text-[17px] font-semibold leading-tight text-slate-900">{title}</h1>
        </div>

        {!isMini && (
          <div className="flex items-center gap-1">
            {user?.role === "admin" && (
              <button type="button" className={iconButton} aria-label="Update admin credentials" title="Update Login ID and Password" onClick={openCredentialsDialog}>
                <TopIcon name="manage_accounts" />
              </button>
            )}
            {user?.role === "admin" && (
              <button type="button" className={iconButton} aria-label="Logout from all devices" title="Logout from all devices" onClick={handleLogoutAllDevices} disabled={loggingOutAll}>
                <TopIcon name="devices_off" />
              </button>
            )}

            <div className="relative" ref={notificationsRef}>
              <button
                type="button" className={iconButton} aria-haspopup="true" aria-expanded={notificationsOpen}
                aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ""}`} title="Credits due tomorrow"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <TopIcon name="notifications" />
                {notifications.length > 0 && (
                  <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">
                    {notifications.length}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-11 z-[1300] w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <span className="text-[13.5px] font-semibold text-slate-900">Credits due tomorrow</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{notifications.length}</span>
                  </div>
                  <ul className="m-0 max-h-80 list-none overflow-y-auto p-0">
                    {notifications.length > 0 ? notifications.map((notif) => (
                      <li key={notif.id} className="flex gap-3 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                          <TopIcon name="schedule" className="text-[17px]" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-slate-800">{notif.outlet_name}</span>
                          <span className="block text-[12px] text-slate-500">Invoice {notif.invoice_number}</span>
                          <span className="block text-[12px] font-semibold text-red-600">Due ₹{Number(notif.balance_amount).toFixed(2)}</span>
                        </span>
                      </li>
                    )) : (
                      <li className="flex items-center gap-2 px-4 py-6 text-[13px] text-slate-500">
                        <TopIcon name="check_circle" className="text-[18px] text-emerald-600" /> No credits due tomorrow
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="ml-2 hidden items-center gap-2.5 border-l border-slate-200 pl-3 sm:flex">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[12px] font-bold text-white">{initials}</span>
              <span className="hidden min-w-0 md:block">
                <span className="block max-w-40 truncate text-[12.5px] font-semibold text-slate-800">{displayName}</span>
                <span className="block text-[11px] text-slate-500">{ROLE_LABELS[user?.role] || user?.role || ""}</span>
              </span>
            </div>
          </div>
        )}
      </div>
      <Dialog open={credentialsDialogOpen} onClose={closeCredentialsDialog} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          Update Admin Login
        </DialogTitle>
        <DialogContent dividers>
          <MDBox mb={2}>
            <MDInput
              type="email"
              label="Login ID (Email)"
              fullWidth
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              inputProps={{ autoComplete: "username" }}
            />
          </MDBox>
          <MDBox mb={2}>
            <MDInput
              type="password"
              label="Current Password"
              fullWidth
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              inputProps={{ autoComplete: "current-password" }}
            />
          </MDBox>
          <MDBox mb={2}>
            <MDInput
              type="password"
              label="New Password"
              fullWidth
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              inputProps={{ minLength: 8, autoComplete: "new-password" }}
              helperText="Minimum 8 characters"
            />
          </MDBox>
          <MDInput
            type="password"
            label="Confirm New Password"
            fullWidth
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            inputProps={{ minLength: 8, autoComplete: "new-password" }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <MDButton variant="outlined" color="dark" onClick={closeCredentialsDialog} disabled={savingCredentials}>
            Cancel
          </MDButton>
          <MDButton variant="gradient" color="info" onClick={handleUpdateAdminCredentials} disabled={savingCredentials}>
            {savingCredentials ? "Updating..." : "Update Credentials"}
          </MDButton>
        </DialogActions>
      </Dialog>
    </header>
    </>
  );
}

// Setting default values for the props of DashboardNavbar
DashboardNavbar.defaultProps = {
  absolute: false,
  light: false,
  isMini: false,
};

// Typechecking props for the DashboardNavbar
DashboardNavbar.propTypes = {
  absolute: PropTypes.bool,
  light: PropTypes.bool,
  isMini: PropTypes.bool,
};

export default DashboardNavbar;
