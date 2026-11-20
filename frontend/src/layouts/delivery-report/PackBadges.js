// Box / packet totals as two small badges: Tailwind CSS (no MUI).
import PropTypes from "prop-types";
import { boxCount, packetCount } from "utils/deliveryLog";
import { Icon } from "components/tw";

// Box and packet totals for a list of bills, shown as two small badges.
export default function PackBadges({ rows, compact }) {
  const boxes = boxCount(rows);
  const packets = packetCount(rows);
  const pill = "inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-px text-[10.5px] font-bold leading-tight";
  return (
    <span className={`flex flex-wrap justify-center gap-1 ${compact ? "mt-0.5" : ""}`}>
      <span className={`${pill} bg-orange-100 text-orange-900`} title="No. of boxes">
        <Icon name="inventory_2" className="text-[11px]" />{boxes}{compact ? "" : (boxes === 1 ? " box" : " boxes")}
      </span>
      <span className={`${pill} bg-blue-100 text-blue-900`} title="No. of packets">
        <Icon name="shopping_bag" className="text-[11px]" />{packets}{compact ? "" : (packets === 1 ? " packet" : " packets")}
      </span>
    </span>
  );
}
PackBadges.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired, compact: PropTypes.bool };
PackBadges.defaultProps = { compact: false };
