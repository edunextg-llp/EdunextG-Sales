/**
=========================================================
* Material Dashboard 2 React - v2.2.0
=========================================================

* Product Page: https://www.creative-tim.com/product/material-dashboard-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)

Coded by www.creative-tim.com

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

// prop-types is a library for typechecking of props.
import PropTypes from "prop-types";

// @mui material components
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Icon from "@mui/material/Icon";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";

// Custom styles for the SidenavCollapse
import {
  collapseItem,
  collapseIconBox,
  collapseIcon,
  collapseText,
} from "examples/Sidenav/styles/sidenavCollapse";

// Material Dashboard 2 React context
import { useMaterialUIController } from "context";

function SidenavCollapse({ icon, name, active, nested, collapsible, open, ...rest }) {
  const [controller] = useMaterialUIController();
  const { miniSidenav, transparentSidenav, whiteSidenav, darkMode, sidenavColor } = controller;

  const textColor = (transparentSidenav && !darkMode && !active) || (whiteSidenav && !active)
    ? "dark"
    : "white";

  return (
    <ListItem component="li" sx={nested ? { pl: 4 } : undefined}>
      <MDBox
        {...rest}
        sx={(theme) =>
          collapseItem(theme, {
            active,
            transparentSidenav,
            whiteSidenav,
            darkMode,
            sidenavColor,
          })
        }
      >
        <ListItemIcon
          sx={(theme) =>
            collapseIconBox(theme, { transparentSidenav, whiteSidenav, darkMode, active })
          }
        >
          {typeof icon === "string" ? (
            <Icon sx={(theme) => collapseIcon(theme, { active })}>{icon}</Icon>
          ) : (
            icon
          )}
        </ListItemIcon>

        <ListItemText
          primary={name}
          sx={(theme) =>
            collapseText(theme, {
              miniSidenav,
              transparentSidenav,
              whiteSidenav,
              active,
            })
          }
        />

        {collapsible && !miniSidenav && (
          <Icon
            sx={(theme) => ({
              marginLeft: "auto",
              marginRight: "10px",
              fontSize: "1.25rem !important",
              color: textColor === "dark" ? theme.palette.dark.main : theme.palette.white.main,
              transition: "transform 0.2s ease-in-out",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            })}
          >
            expand_more
          </Icon>
        )}
      </MDBox>
    </ListItem>
  );
}

// Setting default values for the props of SidenavCollapse
SidenavCollapse.defaultProps = {
  active: false,
  nested: false,
  collapsible: false,
  open: false,
};

// Typechecking props for the SidenavCollapse
SidenavCollapse.propTypes = {
  icon: PropTypes.node.isRequired,
  name: PropTypes.string.isRequired,
  active: PropTypes.bool,
  nested: PropTypes.bool,
  collapsible: PropTypes.bool,
  open: PropTypes.bool,
};

export default SidenavCollapse;
