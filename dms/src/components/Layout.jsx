import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import { MdClose, MdMenu } from "react-icons/md";
import Typography from "@mui/material/Typography";
import Sidebar from "./Sidebar";

// Open pages as tabs above the content, like VS Code: a sidebar click opens (or switches to)
// a tab, × or a middle click closes it. Every open tab stays mounted, so a half-filled form
// (e.g. Physical Stock's list) is still there when you come back. Open tabs are kept for
// the browser session.
const TABS_KEY = "dms_open_tabs";

const loadTabs = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TABS_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
};

function Tab({ item, active, onSelect, onClose }) {
  const Icon = item.icon;
  return (
    <Box
      role="tab"
      aria-selected={active}
      title={item.label}
      onClick={onSelect}
      onMouseDown={(e) => {
        // Middle click closes, like VS Code.
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        pl: 1.5,
        pr: 0.5,
        height: 36,
        flexShrink: 0,
        cursor: "pointer",
        userSelect: "none",
        fontSize: 13,
        borderRight: 1,
        borderColor: "divider",
        borderTop: "2px solid",
        borderTopColor: active ? "#2563eb" : "transparent",
        bgcolor: active ? "background.paper" : "transparent",
        color: active ? "text.primary" : "text.secondary",
        fontWeight: active ? 600 : 400,
        "&:hover": { bgcolor: active ? "background.paper" : "action.hover" },
        "&:hover .tab-close, & .tab-close.active": { opacity: 1 },
      }}
    >
      {Icon && <Icon size={16} />}
      <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>
      <IconButton
        size="small"
        aria-label={`Close ${item.label}`}
        className={`tab-close${active ? " active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        sx={{ p: 0.25, ml: 0.25, opacity: 0, borderRadius: 1 }}
      >
        <MdClose size={14} />
      </IconButton>
    </Box>
  );
}

export default function Layout({ user, menu, pages = {} }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const current = location.pathname.replace(/\/+$/, "") || "/";

  // Pages that can be a tab: the menu items that have a page here.
  const known = useMemo(() => new Map(menu.filter((m) => pages[m.path]).map((m) => [m.path, m])), [menu, pages]);
  const [openTabs, setOpenTabs] = useState(loadTabs);
  const tabs = useMemo(() => {
    const list = openTabs.filter((p) => known.has(p));
    return known.has(current) && !list.includes(current) ? [...list, current] : list;
  }, [openTabs, known, current]);

  // Opening a page (sidebar, link, typed URL) adds its tab.
  useEffect(() => {
    if (known.has(current)) setOpenTabs((prev) => (prev.includes(current) ? prev : [...prev, current]));
  }, [current, known]);

  useEffect(() => {
    sessionStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  }, [tabs]);

  // Each tab keeps its own scroll position.
  const scrollByTab = useRef(new Map());
  const lastTab = useRef(current);
  useLayoutEffect(() => {
    if (lastTab.current === current) return;
    scrollByTab.current.set(lastTab.current, window.scrollY);
    lastTab.current = current;
    window.scrollTo(0, scrollByTab.current.get(current) || 0);
  }, [current]);

  const closeTab = (path) => {
    const index = tabs.indexOf(path);
    const rest = tabs.filter((p) => p !== path);
    setOpenTabs(rest);
    scrollByTab.current.delete(path);
    if (path !== current) return;
    // Closing the open tab: go to its neighbour, or the first page when none is left.
    const next = rest[index] || rest[index - 1] || (known.has("/") ? "/" : [...known.keys()].find((p) => p !== path));
    if (next && next !== path) navigate(next);
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar menu={menu} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Toolbar>
            <IconButton edge="start" sx={{ mr: 1, display: { lg: "none" } }} onClick={() => setMobileOpen(true)}>
              <MdMenu size={24} />
            </IconButton>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              DMS
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {user?.username}
            </Typography>
          </Toolbar>
          {tabs.length > 0 && (
            <Box
              role="tablist"
              sx={{
                display: "flex",
                overflowX: "auto",
                bgcolor: "grey.100",
                borderTop: 1,
                borderColor: "divider",
                scrollbarWidth: "thin",
              }}
            >
              {tabs.map((path) => (
                <Tab
                  key={path}
                  item={known.get(path)}
                  active={path === current}
                  onSelect={() => path !== current && navigate(path)}
                  onClose={() => closeTab(path)}
                />
              ))}
            </Box>
          )}
        </AppBar>
        <Box component="main" sx={{ p: 3 }}>
          {/* Redirect routes (e.g. old URLs) still render here. */}
          <Outlet />
          {tabs.map((path) => (
            <Box key={path} sx={{ display: path === current ? "block" : "none" }}>
              {pages[path]}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
