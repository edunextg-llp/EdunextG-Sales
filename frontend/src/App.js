import { useState, useEffect, useMemo } from "react";

// react-router components
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

// @mui material components
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

// Material Dashboard 2 React example components
import Sidenav from "examples/Sidenav";
import Configurator from "examples/Configurator";

// Material Dashboard 2 React themes
import theme from "assets/theme";
import themeRTL from "assets/theme/theme-rtl";

// Material Dashboard 2 React Dark Mode themes
import themeDark from "assets/theme-dark";
import themeDarkRTL from "assets/theme-dark/theme-rtl";

// RTL plugins
import rtlPlugin from "stylis-plugin-rtl";
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";

// Material Dashboard 2 React routes
import routes from "routes";
import ProtectedRoute from "components/ProtectedRoute";
import MyDocumentAssignments from "components/MyDocumentAssignments";
import MyPhysicalStockAssignments from "components/MyPhysicalStockAssignments";
import SignIn from "layouts/authentication/sign-in";
import LandingPage from "layouts/landing";
import PrivacyPolicy from "layouts/privacy-policy";

// Material Dashboard 2 React contexts
import { useMaterialUIController, setMiniSidenav } from "context";
import { useAuth } from "context/AuthContext";
import { extraLandingRoute } from "utils/landingRoutes";

// Images
import brandWhite from "assets/images/logo-ct.png";
import brandDark from "assets/images/logo-ct-dark.png";

export default function App() {
  const [controller, dispatch] = useMaterialUIController();
  const {
    miniSidenav,
    direction,
    layout,
    sidenavColor,
    transparentSidenav,
    whiteSidenav,
    darkMode,
  } = controller;
  const [onMouseEnter, setOnMouseEnter] = useState(false);
  const [rtlCache, setRtlCache] = useState(null);
  const { pathname } = useLocation();
  const { user } = useAuth();
  const role = user?.role || "admin";
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];

  const filterRoutesByRole = (allRoutes) =>
    allRoutes.reduce((visible, route) => {
      const allowedRoles = route.allowedRoles || ["admin"];
      const roleAllowed = allowedRoles.includes(role);
      const permissionAllowed =
        ["admin", "staff"].includes(role) ||
        !route.requiredPermission ||
        // A list means any one of those permissions is enough.
        [].concat(route.requiredPermission).some((key) => permissions.includes(key));
      const assignmentStateAllowed =
        !route.hideWhenPermissionsAssigned || permissions.length === 0;
      if (!roleAllowed || !permissionAllowed || !assignmentStateAllowed) return visible;

      if (route.collapse) {
        const collapse = filterRoutesByRole(route.collapse);
        if (collapse.length) visible.push({ ...route, collapse });
      } else {
        visible.push(route);
      }
      return visible;
    }, []);

  const visibleRoutes = filterRoutesByRole(routes);
  const sidenavRoutes = visibleRoutes.filter((route) => !route.hideInSidenav);
  const isPrivacyPolicyPage = pathname === "/privacy-policy";

  // Cache for the rtl
  useMemo(() => {
    const cacheRtl = createCache({
      key: "rtl",
      stylisPlugins: [rtlPlugin],
    });

    setRtlCache(cacheRtl);
  }, []);

  // Open sidenav when mouse enter on mini sidenav
  const handleOnMouseEnter = () => {
    if (miniSidenav && !onMouseEnter) {
      setMiniSidenav(dispatch, false);
      setOnMouseEnter(true);
    }
  };

  // Close sidenav when mouse leave mini sidenav
  const handleOnMouseLeave = () => {
    if (onMouseEnter) {
      setMiniSidenav(dispatch, true);
      setOnMouseEnter(false);
    }
  };

  // Distributors (DMS > Add Distributor) sign in here but use the Distributor Portal
  // (../distributor, served at /distributor/); the main site's pages are not for them.
  // If this app itself is showing /distributor/..., the portal is not being served there
  // (dev: frontend not restarted after setupProxy.js changed / portal not running; live:
  // /distributor/ not set up on the server): say so instead of bouncing between pages.
  const distributorOpenPages = ["/", "/privacy-policy", "/authentication/sign-in"];
  const isDistributorOutsidePortal = user?.role === "distributor" && !distributorOpenPages.includes(pathname);
  const portalNotServed = isDistributorOutsidePortal && pathname.startsWith("/distributor");
  useEffect(() => {
    if (isDistributorOutsidePortal && !portalNotServed) {
      window.location.replace("/distributor/");
    }
  }, [isDistributorOutsidePortal, portalNotServed]);

  // Setting the dir attribute for the body element
  useEffect(() => {
    document.body.setAttribute("dir", direction);
  }, [direction]);

  // Setting page scroll to 0 when changing the route
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
  }, [pathname]);

  const getRoutes = (allRoutes) =>
    allRoutes.map((route) => {
      if (route.collapse) {
        return getRoutes(route.collapse);
      }

      if (route.route) {
        const isAuthRoute = route.route.includes("authentication");
        const element = isAuthRoute ? (
          route.component
        ) : (
          <ProtectedRoute
            allowedRoles={route.allowedRoles || ["admin"]}
            requiredPermission={route.requiredPermission}
          >
            {route.component}
          </ProtectedRoute>
        );
        return <Route exact path={route.route} element={element} key={route.key} />;
      }

      return null;
    });

  // const configsButton = (
  //   <MDBox
  //     display="flex"
  //     justifyContent="center"
  //     alignItems="center"
  //     width="3.25rem"
  //     height="3.25rem"
  //     bgColor="white"
  //     shadow="sm"
  //     borderRadius="50%"
  //     position="fixed"
  //     right="2rem"
  //     bottom="2rem"
  //     zIndex={99}
  //     color="dark"
  //     sx={{ cursor: "pointer" }}
  //     onClick={handleConfiguratorOpen}
  //   >
  //     <Icon fontSize="small" color="inherit">
  //       settings
  //     </Icon>
  //   </MDBox>
  // );

  // A distributor never sees the main site's pages (no /welcome flash while leaving).
  if (isDistributorOutsidePortal) {
    if (!portalNotServed) return null;
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "Roboto, Arial, sans-serif", textAlign: "center" }}>
        <div style={{ maxWidth: 420 }}>
          <h2 style={{ margin: "0 0 8px" }}>Distributor Portal is not available</h2>
          <p style={{ color: "#555", margin: "0 0 20px" }}>
            The portal could not be opened right now. Please try again in a few minutes or contact the company.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "8px 18px", border: 0, borderRadius: 6, background: "#4338ca", color: "#fff", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return direction === "rtl" ? (
    <CacheProvider value={rtlCache}>
      <ThemeProvider theme={darkMode ? themeDarkRTL : themeRTL}>
        <CssBaseline />
        {layout === "dashboard" && !isPrivacyPolicyPage && (
          <>
            <Sidenav
              color={sidenavColor}
              brand={(transparentSidenav && !darkMode) || whiteSidenav ? brandDark : brandWhite}
              brandName="Material Dashboard 2"
              routes={sidenavRoutes}
              onMouseEnter={handleOnMouseEnter}
              onMouseLeave={handleOnMouseLeave}
            />
            <Configurator />
            <MyDocumentAssignments />
            <MyPhysicalStockAssignments />
            {/* {configsButton} */}
          </>
        )}
        {layout === "vr" && <Configurator />}
        <Routes>
          <Route exact path="/" element={<LandingPage />} />
          <Route exact path="/privacy-policy" element={<PrivacyPolicy />} />
          {getRoutes(visibleRoutes)}
          <Route exact path="/authentication/sign-in" element={<SignIn />} />
          <Route path="*" element={<Navigate to={
            role === "staff"
              ? "/purchase-requisition"
              : role === "admin" || permissions.includes("dashboard")
                ? "/dashboard"
                : permissions.includes("dms") && permissions.includes("add_seller")
                  ? "/add-seller"
                  : permissions.includes("dms") && permissions.includes("add_item")
                    ? "/add-item"
                    : permissions.includes("dms") && permissions.includes("item_list")
                    ? "/dms-stock"
                      : permissions.includes("update_payment")
                        ? "/update-payment"
                        : permissions.includes("bank_deposit")
                          ? "/bank-deposit"
                          : permissions.includes("out_bill")
                            ? "/out-bill"
                            : permissions.includes("requisition_approval")
                              ? "/requisition-approvals"
                            : permissions.includes("create_staff")
                              ? "/create-staff"
                            : permissions.includes("location_assignments")
                              ? "/location-assignments"
                            : permissions.includes("packaging")
                              ? "/packaging"
                            : permissions.includes("delivery")
                              ? "/delivery"
                            : permissions.includes("delivered")
                              ? "/delivered"
                          : permissions.includes("add_outlet")
                            ? "/add-outlet"
                            : permissions.includes("add_sales")
                              ? "/add-sales"
                              : extraLandingRoute(permissions)
          } />} />
        </Routes>
      </ThemeProvider>
    </CacheProvider>
  ) : (
    <ThemeProvider theme={darkMode ? themeDark : theme}>
      <CssBaseline />
      {layout === "dashboard" && !isPrivacyPolicyPage && (
        <>
          <Sidenav
            color={sidenavColor}
            brand={(transparentSidenav && !darkMode) || whiteSidenav ? brandDark : brandWhite}
            brandName="Material Dashboard 2"
            routes={sidenavRoutes}
            onMouseEnter={handleOnMouseEnter}
            onMouseLeave={handleOnMouseLeave}
          />
          <Configurator />
          <MyDocumentAssignments />
          <MyPhysicalStockAssignments />
          {/* {configsButton} */}
        </>
      )}
      {layout === "vr" && <Configurator />}
      <Routes>
        <Route exact path="/" element={<LandingPage />} />
        <Route exact path="/privacy-policy" element={<PrivacyPolicy />} />
        {getRoutes(visibleRoutes)}
        <Route exact path="/authentication/sign-in" element={<SignIn />} />
        <Route path="*" element={<Navigate to={
          role === "staff"
            ? "/purchase-requisition"
            : role === "admin" || permissions.includes("dashboard")
              ? "/dashboard"
              : permissions.includes("dms") && permissions.includes("add_seller")
                ? "/add-seller"
                : permissions.includes("dms") && permissions.includes("add_item")
                  ? "/add-item"
                  : permissions.includes("dms") && permissions.includes("item_list")
                  ? "/dms-stock"
                    : permissions.includes("update_payment")
                      ? "/update-payment"
                      : permissions.includes("bank_deposit")
                        ? "/bank-deposit"
                        : permissions.includes("out_bill")
                          ? "/out-bill"
                          : permissions.includes("requisition_approval")
                            ? "/requisition-approvals"
                          : permissions.includes("create_staff")
                            ? "/create-staff"
                          : permissions.includes("location_assignments")
                            ? "/location-assignments"
                          : permissions.includes("packaging")
                            ? "/packaging"
                          : permissions.includes("delivery")
                            ? "/delivery"
                          : permissions.includes("delivered")
                            ? "/delivered"
                        : permissions.includes("add_outlet")
                          ? "/add-outlet"
                          : permissions.includes("add_sales")
                            ? "/add-sales"
                            : extraLandingRoute(permissions)
        } />} />
      </Routes>
    </ThemeProvider>
  );
}
