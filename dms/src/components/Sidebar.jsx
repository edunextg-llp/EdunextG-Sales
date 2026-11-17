import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Collapse from "@mui/material/Collapse";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import { MdArrowBack, MdExpandMore, MdInventory, MdLogout } from "react-icons/md";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import { logout, MAIN_SITE_URL } from "../auth";
import { MENU_GROUPS } from "../menu";

const SIDEBAR_WIDTH = 250;

const itemSx = {
  borderRadius: 2,
  mx: 1.5,
  mb: 0.5,
  color: "rgba(226,234,248,0.78)",
  "& .MuiListItemIcon-root": { color: "inherit", minWidth: 38 },
  "&:hover": { bgcolor: "rgba(255,255,255,0.07)", color: "#ffffff" },
  "&.active": { bgcolor: "#2563eb", color: "#ffffff" },
  "&.active:hover": { bgcolor: "#2563eb" },
};

function SidebarItem({ icon: IconComponent, label, ...props }) {
  return (
    <ListItemButton sx={itemSx} {...props}>
      <ListItemIcon>
        <IconComponent size={20} />
      </ListItemIcon>
      <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14 }} />
    </ListItemButton>
  );
}

// One sidebar dropdown (e.g. Purchase). Opens by itself when one of its pages is open, and
// remembers being opened / closed.
function SidebarGroup({ id, items, onNavigate }) {
  const group = MENU_GROUPS[id] || { label: id };
  const { pathname } = useLocation();
  const containsActive = items.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  const storageKey = `dms_menu_${id}`;
  const [open, setOpen] = useState(() => containsActive || localStorage.getItem(storageKey) === "1");

  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  const toggle = () =>
    setOpen((value) => {
      localStorage.setItem(storageKey, value ? "0" : "1");
      return !value;
    });

  const Icon = group.icon;
  return (
    <>
      <ListItemButton
        sx={{ ...itemSx, ...(containsActive && !open ? { color: "#ffffff", bgcolor: "rgba(255,255,255,0.07)" } : {}) }}
        onClick={toggle}
        aria-expanded={open}
      >
        <ListItemIcon>{Icon && <Icon size={20} />}</ListItemIcon>
        <ListItemText primary={group.label} primaryTypographyProps={{ fontSize: 14 }} />
        <MdExpandMore size={18} style={{ transition: "transform 150ms", transform: open ? "rotate(180deg)" : "none" }} />
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List disablePadding sx={{ pl: 1.5 }}>
          {items.map((item) => (
            <SidebarItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              component={NavLink}
              to={item.path}
              onClick={onNavigate}
            />
          ))}
        </List>
      </Collapse>
    </>
  );
}

// Menu items in order, with a group's items gathered where the group's first item is.
const toEntries = (menu) => {
  const entries = [];
  const groups = new Map();
  menu.forEach((item) => {
    if (!item.group) {
      entries.push({ item });
      return;
    }
    if (!groups.has(item.group)) {
      const entry = { group: item.group, items: [] };
      groups.set(item.group, entry);
      entries.push(entry);
    }
    groups.get(item.group).items.push(item);
  });
  return entries;
};

// Logout confirmation (replaces the browser's confirm box). MUI Dialog renders in a portal,
// so it sits above the sidebar drawer on mobile too.
function LogoutDialog({ open, busy, onCancel, onConfirm }) {
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, p: 3, textAlign: "center" } }}
    >
      <Box
        sx={{
          mx: "auto",
          width: 56,
          height: 56,
          borderRadius: "50%",
          bgcolor: "#fee2e2",
          color: "#dc2626",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MdLogout size={28} />
      </Box>
      <Typography variant="h6" fontWeight={600} mt={2}>
        Log out?
      </Typography>
      <Typography variant="body2" color="text.secondary" mt={0.5}>
        You will be signed out of Sales &amp; Purchase and the main site. Unsaved changes on open tabs will be lost.
      </Typography>
      <Box display="flex" gap={1.5} mt={3}>
        <Button fullWidth variant="outlined" color="inherit" onClick={onCancel} disabled={busy} sx={{ textTransform: "none", borderColor: "#dfe6f2" }}>
          Cancel
        </Button>
        <Button
          fullWidth
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={busy}
          disableElevation
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <MdLogout />}
          sx={{ textTransform: "none" }}
        >
          Log out
        </Button>
      </Box>
    </Dialog>
  );
}

function SidebarContent({ menu, onNavigate }) {
  const [askLogout, setAskLogout] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const dividerSx = { borderColor: "rgba(226,234,248,0.12)" };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "#0f2a5a", color: "#eef3fc" }}>
      <Box sx={{ px: 3, py: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}>
        <MdInventory size={24} color="#f97316" />
        <Typography variant="h6" fontWeight="bold">
          Sales &amp; Purchase
        </Typography>
      </Box>
      <Divider sx={{ ...dividerSx, mb: 1 }} />

      <List
        sx={{
          flexGrow: 1,
          overflowY: "auto",
          scrollbarWidth: "none", // Firefox
          "&::-webkit-scrollbar": { display: "none" }, // Chrome, Edge, Safari
        }}
      >
        {toEntries(menu).map((entry) =>
          entry.group ? (
            <SidebarGroup key={`group-${entry.group}`} id={entry.group} items={entry.items} onNavigate={onNavigate} />
          ) : (
            <SidebarItem
              key={entry.item.path}
              icon={entry.item.icon}
              label={entry.item.label}
              component={NavLink}
              to={entry.item.path}
              end={entry.item.path === "/"}
              onClick={onNavigate}
            />
          )
        )}
      </List>

      <Divider sx={dividerSx} />
      <List>
        {/* Plain link: leaves the DMS app and loads the main site */}
        <SidebarItem icon={MdArrowBack} label="Back to Main" component="a" href={MAIN_SITE_URL} />
        <SidebarItem icon={MdLogout} label="Logout" onClick={() => setAskLogout(true)} />
      </List>

      <LogoutDialog
        open={askLogout}
        busy={leaving}
        onCancel={() => setAskLogout(false)}
        onConfirm={() => {
          setLeaving(true);
          logout();
        }}
      />
    </Box>
  );
}

export default function Sidebar({ menu, mobileOpen, onClose }) {
  const paperSx = {
    width: SIDEBAR_WIDTH,
    border: "none",
    scrollbarWidth: "none",
    "&::-webkit-scrollbar": { display: "none" },
  };

  return (
    <Box component="nav" sx={{ width: { lg: SIDEBAR_WIDTH }, flexShrink: { lg: 0 } }}>
      {/* Mobile / tablet: slide-in drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: "block", lg: "none" }, "& .MuiDrawer-paper": paperSx }}
      >
        <SidebarContent menu={menu} onNavigate={onClose} />
      </Drawer>
      {/* Desktop: fixed sidebar */}
      <Drawer variant="permanent" open sx={{ display: { xs: "none", lg: "block" }, "& .MuiDrawer-paper": paperSx }}>
        <SidebarContent menu={menu} />
      </Drawer>
    </Box>
  );
}
