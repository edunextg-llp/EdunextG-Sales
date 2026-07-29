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
import SignIn from "layouts/authentication/sign-in";

// Material Dashboard 2 React contexts
import { useMaterialUIController, setMiniSidenav } from "context";
import { useAuth } from "context/AuthContext";

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
        role === "admin" || !route.requiredPermission || permissions.includes(route.requiredPermission);
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

  return direction === "rtl" ? (
    <CacheProvider value={rtlCache}>
      <ThemeProvider theme={darkMode ? themeDarkRTL : themeRTL}>
        <CssBaseline />
        {layout === "dashboard" && (
          <>
            <Sidenav
              color={sidenavColor}
              brand={(transparentSidenav && !darkMode) || whiteSidenav ? brandDark : brandWhite}
              brandName="Material Dashboard 2"
              routes={visibleRoutes}
              onMouseEnter={handleOnMouseEnter}
              onMouseLeave={handleOnMouseLeave}
            />
            <Configurator />
            {/* {configsButton} */}
          </>
        )}
        {layout === "vr" && <Configurator />}
        <Routes>
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
                      : "/welcome"
          } />} />
        </Routes>
      </ThemeProvider>
    </CacheProvider>
  ) : (
    <ThemeProvider theme={darkMode ? themeDark : theme}>
      <CssBaseline />
      {layout === "dashboard" && (
        <>
          <Sidenav
            color={sidenavColor}
            brand={(transparentSidenav && !darkMode) || whiteSidenav ? brandDark : brandWhite}
            brandName="Material Dashboard 2"
            routes={visibleRoutes}
            onMouseEnter={handleOnMouseEnter}
            onMouseLeave={handleOnMouseLeave}
          />
          <Configurator />
          {/* {configsButton} */}
        </>
      )}
      {layout === "vr" && <Configurator />}
      <Routes>
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
                    : "/welcome"
        } />} />
      </Routes>
    </ThemeProvider>
  );
}
