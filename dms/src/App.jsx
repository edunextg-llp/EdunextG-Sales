import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import ComingSoon from "./pages/ComingSoon";
import AddSeller from "./pages/AddSeller";
import AddItem from "./pages/AddItem";
import AddPurchase from "./pages/AddPurchase";
import PurchaseHistory from "./pages/PurchaseHistory";
import SellerLedger from "./pages/SellerLedger";
import Stock from "./pages/Stock";
import PhysicalStock from "./pages/PhysicalStock";
import Assign from "./pages/Assign";
import AddDistributor from "./pages/AddDistributor";
import FreeGoods from "./pages/FreeGoods";
import CreateSales from "./pages/CreateSales";
import DistributorOrders from "./pages/DistributorOrders";
import OutletOrders from "./pages/OutletOrders";
import ExpiryItems from "./pages/ExpiryItems";
import ExpiryList from "./pages/ExpiryList";
import { apiFetch, getToken, getUser, refreshSession, startIdleWatch, SIGN_IN_URL, MAIN_SITE_URL } from "./auth";
import { canAccessDms, canApproveOutletOrders, menuFor, OUTLET_ORDERS } from "./menu";

// Built pages. Menu items without an entry here show the "coming soon" placeholder.
const PAGES = {
  "/add-seller": AddSeller,
  "/add-item": AddItem,
  "/add-purchase": AddPurchase,
  "/purchase-history": PurchaseHistory,
  "/seller-ledger": SellerLedger,
  "/stock": Stock,
  "/physical-stock": PhysicalStock,
  "/assign": Assign,
  "/add-distributor": AddDistributor,
  "/free-goods": FreeGoods,
  "/create-sales": CreateSales,
  "/distributor-orders": DistributorOrders,
  "/outlet-orders": OutletOrders,
  "/expiry-items": ExpiryItems,
  "/expiry-list": ExpiryList,
};

const isAdmin = (user) => (user?.role || "admin") === "admin";

export default function App() {
  const token = getToken();
  const [user, setUser] = useState(getUser);
  const [sessionReady, setSessionReady] = useState(false);
  const dmsUser = Boolean(token) && canAccessDms(user);
  // Has a physical stock count assigned to them? (null while checking)
  const [hasAssignment, setHasAssignment] = useState(isAdmin(user) ? false : null);

  useEffect(() => {
    let active = true;
    refreshSession()
      .then((freshUser) => { if (active && freshUser) setUser(freshUser); })
      .finally(() => { if (active) setSessionReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!token) {
      window.location.href = SIGN_IN_URL;
      return;
    }
    if (isAdmin(user)) return;
    apiFetch("/my-physical-stock")
      .then((res) => (res.ok ? res.json() : { assignments: [] }))
      .then((body) => setHasAssignment(Array.isArray(body.assignments) && body.assignments.length > 0))
      .catch(() => setHasAssignment(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approver = Boolean(token) && canApproveOutletOrders(user);
  const allowed = Boolean(token) && (dmsUser || approver || hasAssignment === true);

  useEffect(() => {
    if (!token || !sessionReady || hasAssignment === null) return undefined;
    // No DMS permission and nothing assigned: back to the main site.
    if (!allowed) {
      window.location.href = MAIN_SITE_URL;
      return undefined;
    }
    return startIdleWatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAssignment, sessionReady]);

  if (!token || !sessionReady || hasAssignment === null || !allowed) return null;

  const menu = menuFor(user, hasAssignment);
  const pages = menu.filter((item) => item.path !== "/");
  // Each page's element. Layout shows them as tabs and keeps open ones mounted, so the
  // routes below only decide which tab is showing (they render nothing themselves).
  const pageElements = Object.fromEntries(
    menu.map((item) => {
      if (item.path === "/") return [item.path, <Dashboard user={user} />];
      const Page = PAGES[item.path];
      return [item.path, Page ? <Page user={user} /> : <ComingSoon title={item.label} icon={item.icon} />];
    })
  );
  // Users without DMS access have no Dashboard: start them on Outlet Orders (approvers)
  // or Physical Stock (assigned a count).
  const home = dmsUser ? null : <Navigate to={approver ? OUTLET_ORDERS.path : "/physical-stock"} replace />;

  return (
    <Routes>
      <Route element={<Layout user={user} menu={menu} pages={pageElements} />}>
        <Route index element={home} />
        {pages.map((item) => (
          <Route key={item.path} path={item.path} element={null} />
        ))}
        <Route path="/purchase-dashboard" element={<Navigate to="/" replace />} />
        <Route path="/item-list" element={<Navigate to="/add-purchase" replace />} />
        <Route path="/current-stock" element={<Navigate to="/stock" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
