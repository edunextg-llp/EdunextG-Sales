import { useState, useEffect } from "react";

// react-router components
import { useLocation } from "react-router-dom";

// prop-types is a library for typechecking of props.
import PropTypes from "prop-types";

// @material-ui core components
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Icon from "@mui/material/Icon";
import Badge from "@mui/material/Badge";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
// import MDInput from "components/MDInput";

// Material Dashboard 2 React example components
import Breadcrumbs from "examples/Breadcrumbs";
import NotificationItem from "examples/Items/NotificationItem";

// Custom styles for DashboardNavbar
import {
  navbar,
  navbarContainer,
  navbarRow,
  navbarIconButton,
  // navbarMobileMenu,
} from "examples/Navbars/DashboardNavbar/styles";

// Material Dashboard 2 React context
import {
  useMaterialUIController,
  setTransparentNavbar,
  setMiniSidenav,
  setOpenConfigurator,
} from "context";

function DashboardNavbar({ absolute, light, isMini }) {
  const [navbarType, setNavbarType] = useState();
  const [controller, dispatch] = useMaterialUIController();
  const { miniSidenav, transparentNavbar, fixedNavbar, openConfigurator, darkMode } = controller;
  const [openMenu, setOpenMenu] = useState(false);
  const route = useLocation().pathname.split("/").slice(1);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const fetchPendingCredits = async () => {
      try {
        const response = await fetch("http://localhost:5001/api/staff/credits/pending");
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
  }, []);

  useEffect(() => {
    // Setting the navbar type
    if (fixedNavbar) {
      setNavbarType("sticky");
    } else {
      setNavbarType("static");
    }

    // A function that sets the transparent state of the navbar.
    function handleTransparentNavbar() {
      setTransparentNavbar(dispatch, (fixedNavbar && window.scrollY === 0) || !fixedNavbar);
    }

    /** 
     The event listener that's calling the handleTransparentNavbar function when 
     scrolling the window.
    */
    window.addEventListener("scroll", handleTransparentNavbar);

    // Call the handleTransparentNavbar function to set the state with the initial value.
    handleTransparentNavbar();

    // Remove event listener on cleanup
    return () => window.removeEventListener("scroll", handleTransparentNavbar);
  }, [dispatch, fixedNavbar]);

  // const handleMiniSidenav = () => setMiniSidenav(dispatch, !miniSidenav);
  // const handleConfiguratorOpen = () => setOpenConfigurator(dispatch, !openConfigurator);
  const handleOpenMenu = (event) => setOpenMenu(event.currentTarget);
  const handleCloseMenu = () => setOpenMenu(false);

  const renderMenu = () => (
    <Menu
      anchorEl={openMenu}
      anchorReference={null}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
      open={Boolean(openMenu)}
      onClose={handleCloseMenu}
      sx={{ mt: 2 }}
    >
      {notifications.length > 0 ? (
        notifications.map((notif) => (
          <MenuItem
            key={notif.id}
            sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", py: 1 }}
          >
            <MDBox display="flex" alignItems="center">
              <Icon color="warning" sx={{ mr: 1 }}>
                warning
              </Icon>
              <MDTypography variant="button" fontWeight="medium">
                {notif.outlet_name}
              </MDTypography>
            </MDBox>
            <MDBox mt={0.5} ml={4} p={1} bgColor="grey-100" borderRadius="md" minWidth="200px">
              <MDTypography variant="caption" color="text" display="block">
                Invoice: <strong>{notif.invoice_number}</strong>
              </MDTypography>
              <MDTypography variant="caption" color="error" fontWeight="bold" display="block">
                Due Amount: ₹{Number(notif.balance_amount).toFixed(2)}
              </MDTypography>
            </MDBox>
          </MenuItem>
        ))
      ) : (
        <NotificationItem
          icon={<Icon color="success">check_circle</Icon>}
          title="No credits due tomorrow"
        />
      )}
    </Menu>
  );

  // Styles for the navbar icons
  const iconsStyle = ({ palette: { dark, white, text }, functions: { rgba } }) => ({
    color: () => {
      let colorValue = light || darkMode ? white.main : dark.main;

      if (transparentNavbar && !light) {
        colorValue = darkMode ? rgba(text.main, 0.6) : text.main;
      }

      return colorValue;
    },
  });

  return (
    <AppBar
    position={absolute ? "absolute" : navbarType}
    color="inherit"
    sx={(theme) => ({
      ...navbar(theme, { transparentNavbar, absolute, light, darkMode }),
      backgroundColor: "#C0C0C0 !important", // Gray
      color: "#fff",
      boxShadow: "0 4px 20px rgba(131, 125, 125, 0.1)",
    })}
  >
      <Toolbar sx={(theme) => navbarContainer(theme)}>
        <MDBox color="inherit" mb={{ xs: 1, md: 0 }} sx={(theme) => navbarRow(theme, { isMini })}>
          <Breadcrumbs icon="home" title={route[route.length - 1]} route={route} light={light} />
        </MDBox>
        {isMini ? null : (
          <MDBox sx={(theme) => navbarRow(theme, { isMini })}>
            {/* <MDBox pr={1}>
              <MDInput label="Search here" />
            </MDBox> */}
            <MDBox color={light ? "white" : "inherit"}>
              {/* <Link to="/authentication/sign-in/basic">
                <IconButton sx={navbarIconButton} size="small" disableRipple>
                  <Icon sx={iconsStyle}>account_circle</Icon>
                </IconButton>
              </Link> */}
              {/* <IconButton
                size="small"
                disableRipple
                color="inherit"
                sx={navbarMobileMenu}
                onClick={handleMiniSidenav}
              >
                <Icon sx={iconsStyle} fontSize="medium">
                  {miniSidenav ? "menu_open" : "menu"}
                </Icon>
              </IconButton> */}
              {/* <IconButton
                size="small"
                disableRipple
                color="inherit"
                sx={navbarIconButton}
                onClick={handleConfiguratorOpen}
              >
                <Icon sx={iconsStyle}>settings</Icon>
              </IconButton> */}
              <IconButton
                size="small"
                disableRipple
                color="inherit"
                sx={navbarIconButton}
                aria-controls="notification-menu"
                aria-haspopup="true"
                variant="contained"
                onClick={handleOpenMenu}
              >
                <Badge badgeContent={notifications.length} color="error" size="small">
                  <Icon sx={iconsStyle}>notifications</Icon>
                </Badge>
              </IconButton>
              {renderMenu()}
            </MDBox>
          </MDBox>
        )}
      </Toolbar>
    </AppBar>
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
