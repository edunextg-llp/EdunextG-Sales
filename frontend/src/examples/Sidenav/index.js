// Sidebar: Tailwind CSS (no MUI). Same menu logic as before: routes.js items, groups that open
// when one of their pages is active, external links (Sales & Purchase reuses its tab), logout.
// Desktop (xl): fixed, 260px wide, 80px icon rail when mini (it opens on hover, see App.js).
// Smaller screens: slides in over the page from the menu button in the top bar.
import { useEffect, useState } from "react";
import { useLocation, NavLink, useNavigate } from "react-router-dom";
import PropTypes from "prop-types";

import { useMaterialUIController, setMiniSidenav, setTransparentSidenav, setWhiteSidenav } from "context";
import { useAuth } from "context/AuthContext";

export const SIDEBAR_WIDTH = 260;
export const SIDEBAR_MINI_WIDTH = 80;

// Route icons are <Icon>name</Icon> elements: draw the same Material icon without MUI.
function MenuIcon({ icon, className }) {
  const name = typeof icon === "string" ? icon : typeof icon?.props?.children === "string" ? icon.props.children : null;
  if (!name) return <span className={`inline-flex items-center justify-center ${className}`}>{icon}</span>;
  return <span className={`material-icons-round leading-none ${className}`} aria-hidden="true">{name}</span>;
}
MenuIcon.propTypes = { icon: PropTypes.node, className: PropTypes.string };
MenuIcon.defaultProps = { icon: null, className: "text-[20px]" };

const itemClass = (active, mini) => [
  "group relative flex w-full items-center gap-3 rounded-xl text-[13.5px] font-medium transition-colors",
  mini ? "justify-center px-0 py-2.5" : "px-3 py-2",
  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
].join(" ");

function ItemContent({ icon, name, active, mini, trailing }) {
  return (
    <>
      {active && !mini && <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-blue-600" />}
      <MenuIcon icon={icon} className={`text-[20px] ${active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} />
      {!mini && <span className="min-w-0 grow truncate text-left">{name}</span>}
      {!mini && trailing}
    </>
  );
}
ItemContent.propTypes = { icon: PropTypes.node, name: PropTypes.string.isRequired, active: PropTypes.bool, mini: PropTypes.bool, trailing: PropTypes.node };
ItemContent.defaultProps = { icon: null, active: false, mini: false, trailing: null };

// A group of pages (e.g. Report): opens by itself while one of its pages is active.
function MenuGroup({ name, icon, items, collapseName, mini }) {
  const visible = items.filter((item) => !item.hidden);
  const childActive = visible.some((item) => item.key === collapseName);
  const [open, setOpen] = useState(childActive);
  useEffect(() => { if (childActive) setOpen(true); }, [childActive]);

  return (
    <li>
      <button type="button" title={mini ? name : undefined} className={itemClass(childActive && mini, mini)} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ItemContent
          icon={icon} name={name} active={childActive && mini} mini={mini}
          trailing={<span className={`material-icons-round text-[18px] text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`}>expand_more</span>}
        />
      </button>
      {open && !mini && (
        <ul className="m-0 ml-[22px] mt-1 list-none space-y-0.5 border-l border-slate-200 p-0 pl-3">
          {visible.map((item) => {
            const active = item.key === collapseName;
            return (
              <li key={item.key}>
                <NavLink
                  to={item.route}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${active ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
                >
                  {item.icon ? <MenuIcon icon={item.icon} className="text-[17px]" /> : <span className="size-1.5 rounded-full bg-current" />}
                  <span className="truncate">{item.name}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
MenuGroup.propTypes = {
  name: PropTypes.string.isRequired, icon: PropTypes.node, items: PropTypes.arrayOf(PropTypes.object).isRequired,
  collapseName: PropTypes.string.isRequired, mini: PropTypes.bool.isRequired,
};
MenuGroup.defaultProps = { icon: null };

// eslint-disable-next-line no-unused-vars
function Sidenav({ color, brand, brandName, routes, ...rest }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav, transparentSidenav, whiteSidenav } = controller;
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const collapseName = location.pathname.replace("/", "");
  const [desktop, setDesktop] = useState(() => window.innerWidth >= 1200);

  const closeSidenav = () => setMiniSidenav(dispatch, true);
  const handleLogout = () => {
    const confirmed = window.confirm("Are you sure you want to log out? Any unsaved changes will be lost.");
    if (!confirmed) return;
    logout();
    closeSidenav();
    navigate("/authentication/sign-in", { replace: true });
  };

  useEffect(() => {
    // Below 1200px the menu starts closed (opened from the top bar); same as before.
    function handleMiniSidenav() {
      setDesktop(window.innerWidth >= 1200);
      setMiniSidenav(dispatch, window.innerWidth < 1200);
      setTransparentSidenav(dispatch, window.innerWidth < 1200 ? false : transparentSidenav);
      setWhiteSidenav(dispatch, window.innerWidth < 1200 ? false : whiteSidenav);
    }
    window.addEventListener("resize", handleMiniSidenav);
    handleMiniSidenav();
    return () => window.removeEventListener("resize", handleMiniSidenav);
  }, [dispatch, location, transparentSidenav, whiteSidenav]);

  // Links with a windowName (Sales & Purchase) reuse their tab: if it is already open it is
  // focused instead of opening another one. window.open keeps the opener, so a new tab still
  // gets this tab's sessionStorage login.
  const openNamedWindow = (event, href, windowName) => {
    if (window.name === windowName) window.name = "";
    const existing = window.open("", windowName);
    if (!existing) return; // popup blocked: let the link open normally
    event.preventDefault();
    let blank = true;
    try {
      blank = existing.location.href === "about:blank";
    } catch (error) {
      blank = false;
    }
    if (blank) existing.location.href = href;
    existing.focus();
  };

  const mini = desktop && miniSidenav;
  const hidden = !desktop && miniSidenav;

  const items = routes.map(({ type, name, icon, title, key, href, sameTab, windowName, route, collapse }) => {
    if (type === "collapse" && collapse) {
      // A group whose items are all hidden (e.g. only Requisition Approvals) is not shown.
      if (collapse.every((item) => item.hidden)) return null;
      return <MenuGroup key={key} name={name} icon={icon} items={collapse} collapseName={collapseName} mini={mini} />;
    }
    if (type === "collapse") {
      const active = key === collapseName;
      if (href) {
        return (
          <li key={key}>
            {/* rel="opener" on purpose: the new same-site tab copies this tab's login. */}
            {/* eslint-disable-next-line react/jsx-no-target-blank */}
            <a
              href={href}
              target={sameTab ? undefined : "_blank"}
              // Same-site links (e.g. /dms/) keep the opener so the browser copies this tab's
              // sessionStorage (the login when "Remember me" is off) into the new tab.
              rel={sameTab ? undefined : href.startsWith("/") ? "opener" : "noreferrer"}
              onClick={windowName ? (event) => openNamedWindow(event, href, windowName) : undefined}
              title={mini ? name : undefined}
              className={itemClass(active, mini)}
            >
              <ItemContent
                icon={icon} name={name} active={active} mini={mini}
                trailing={sameTab ? null : <span className="material-icons-round text-[15px] text-slate-400">open_in_new</span>}
              />
            </a>
          </li>
        );
      }
      return (
        <li key={key}>
          <NavLink to={route} title={mini ? name : undefined} className={itemClass(active, mini)}>
            <ItemContent icon={icon} name={name} active={active} mini={mini} />
          </NavLink>
        </li>
      );
    }
    if (type === "title") {
      return mini ? null : (
        <li key={key} className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</li>
      );
    }
    if (type === "divider") return <li key={key} className="my-2 border-t border-slate-100" />;
    return null;
  });

  return (
    <>
      {/* Small screens: dim the page behind the open menu; a tap closes it. */}
      {!desktop && !miniSidenav && (
        <button type="button" aria-label="Close menu" onClick={closeSidenav} className="fixed inset-0 z-[1199] bg-slate-900/40 backdrop-blur-[2px]" />
      )}
      <aside
        {...rest}
        style={{ width: mini ? SIDEBAR_MINI_WIDTH : SIDEBAR_WIDTH }}
        className={`fixed inset-y-0 left-0 z-[1200] flex flex-col border-r border-slate-200 bg-white font-[Poppins,Roboto,sans-serif] transition-[width,transform] duration-200 ${hidden ? "-translate-x-full" : "translate-x-0"} ${!desktop ? "shadow-2xl" : ""}`}
        aria-label="Main menu"
      >
        {/* Brand */}
        <div className={`flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 ${mini ? "justify-center px-2" : "px-5"}`}>
          <NavLink to="/" className="flex min-w-0 items-center gap-3" title={brandName}>
            {brand && <img src={brand} alt="" className="size-9 shrink-0 rounded-xl object-contain" />}
            {mini ? (
              // Icon rail: the company's initial only.
              <span className="text-[18px] font-bold text-slate-900">{String(brandName).charAt(0)}</span>
            ) : (
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold leading-tight text-slate-900">{brandName}</span>
                <span className="block text-[11px] font-medium text-slate-400">Sales ERP</span>
              </span>
            )}
          </NavLink>
          {!desktop && (
            <button type="button" onClick={closeSidenav} aria-label="Close menu" className="ml-auto inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
              <span className="material-icons-round text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Menu */}
        <nav className="min-h-0 grow overflow-y-auto overflow-x-hidden px-3 py-3 [scrollbar-width:thin]">
          <ul className="m-0 list-none space-y-0.5 p-0">{items}</ul>
        </nav>

        {/* Logout */}
        <div className="shrink-0 border-t border-slate-100 p-3">
          <button
            type="button" onClick={handleLogout} aria-label="Logout" title="Logout"
            className={`flex w-full items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[13px] font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 ${mini ? "justify-center px-0" : ""}`}
          >
            <span className="material-icons-round text-[18px]">logout</span>
            {!mini && "Logout"}
          </button>
        </div>
      </aside>
    </>
  );
}

Sidenav.defaultProps = {
  color: "info",
  brand: "",
};

Sidenav.propTypes = {
  color: PropTypes.oneOf(["primary", "secondary", "info", "success", "warning", "error", "dark"]),
  brand: PropTypes.string,
  brandName: PropTypes.string.isRequired,
  routes: PropTypes.arrayOf(PropTypes.object).isRequired,
};

export default Sidenav;
