import { useEffect } from "react";

// react-router-dom components
import { useLocation } from "react-router-dom";

// prop-types is a library for typechecking of props.
import PropTypes from "prop-types";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import { SIDEBAR_MINI_WIDTH, SIDEBAR_WIDTH } from "examples/Sidenav";
import { SiteFooter } from "examples/Footer";

// Material Dashboard 2 React context
import { useMaterialUIController, setLayout } from "context";

function DashboardLayout({ children }) {
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav } = controller;
  const { pathname } = useLocation();

  useEffect(() => {
    setLayout(dispatch, "dashboard");
  }, [pathname, dispatch]);

  return (
    <MDBox
      sx={({ breakpoints, transitions, functions: { pxToRem } }) => ({
        p: 3,
        position: "relative",
        // Column: page content, then room for the fixed footer (SiteFooter).
        display: "flex",
        flexDirection: "column",
        // "clip" (not "hidden"): still cuts sideways overflow, but is not a scroll container,
        // so the sticky top bar (DashboardNavbar) stays at the top while the page scrolls.
        overflowX: "clip",

        [breakpoints.up("xl")]: {
          // Flush against the Tailwind sidebar (examples/Sidenav: 260px, 80px icon rail).
          marginLeft: miniSidenav ? pxToRem(SIDEBAR_MINI_WIDTH) : pxToRem(SIDEBAR_WIDTH),
          transition: transitions.create(["margin-left", "margin-right"], {
            easing: transitions.easing.easeInOut,
            duration: transitions.duration.standard,
          }),
        },
      })}
    >
      <div className="min-w-0 grow">{children}</div>
      <SiteFooter />
    </MDBox>
  );
}

// Typechecking props for the DashboardLayout
DashboardLayout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default DashboardLayout;
