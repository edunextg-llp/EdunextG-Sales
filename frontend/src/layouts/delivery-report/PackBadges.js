import PropTypes from "prop-types";
import { Tooltip } from "@mui/material";
import MDBox from "components/MDBox";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import { boxCount, packetCount } from "utils/deliveryLog";

const pill = (color, background) => ({
  display: "inline-flex", alignItems: "center", gap: 0.25, px: 0.5, py: 0.1, borderRadius: 1,
  fontSize: "0.66rem", fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", color, backgroundColor: background,
});

// Box and packet totals for a list of bills, shown as two small badges.
export default function PackBadges({ rows, compact }) {
  const boxes = boxCount(rows);
  const packets = packetCount(rows);
  return <MDBox display="flex" justifyContent="center" flexWrap="wrap" gap={0.5} mt={compact ? 0.25 : 0}>
    <Tooltip title="No. of boxes"><MDBox component="span" sx={pill("#7c2d12", "#ffedd5")}>
      <Inventory2Icon sx={{ fontSize: 11 }} />{boxes}{compact ? "" : (boxes === 1 ? " box" : " boxes")}
    </MDBox></Tooltip>
    <Tooltip title="No. of packets"><MDBox component="span" sx={pill("#1e3a8a", "#dbeafe")}>
      <ShoppingBagIcon sx={{ fontSize: 11 }} />{packets}{compact ? "" : (packets === 1 ? " packet" : " packets")}
    </MDBox></Tooltip>
  </MDBox>;
}
PackBadges.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired, compact: PropTypes.bool };
PackBadges.defaultProps = { compact: false };
