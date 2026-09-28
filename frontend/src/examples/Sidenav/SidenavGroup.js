import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { NavLink } from "react-router-dom";
import Collapse from "@mui/material/Collapse";
import Icon from "@mui/material/Icon";
import List from "@mui/material/List";

import MDBox from "components/MDBox";
import SidenavCollapse from "examples/Sidenav/SidenavCollapse";

function SidenavGroup({ name, icon, collapse, collapseName }) {
  const isChildActive = collapse.some((item) => item.key === collapseName);
  const [open, setOpen] = useState(isChildActive);

  useEffect(() => {
    if (isChildActive) {
      setOpen(true);
    }
  }, [isChildActive]);

  return (
    <>
      <MDBox onClick={() => setOpen((prev) => !prev)} sx={{ cursor: "pointer" }}>
        <SidenavCollapse
          name={name}
          icon={icon}
          active={isChildActive}
          collapsible
          open={open}
        />
      </MDBox>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {collapse.filter((item) => !item.hidden).map((item) => (
            <NavLink key={item.key} to={item.route}>
              <SidenavCollapse
                name={item.name}
                icon={item.icon || <Icon fontSize="small">fiber_manual_record</Icon>}
                active={item.key === collapseName}
                nested
              />
            </NavLink>
          ))}
        </List>
      </Collapse>
    </>
  );
}

SidenavGroup.propTypes = {
  name: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  collapse: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      route: PropTypes.string.isRequired,
      icon: PropTypes.node,
    })
  ).isRequired,
  collapseName: PropTypes.string.isRequired,
};

export default SidenavGroup;
