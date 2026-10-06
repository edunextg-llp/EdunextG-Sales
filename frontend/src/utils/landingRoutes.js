// Pages added to Permissions later. Used as a landing page when a user has
// none of the older pages, so they never end up on an empty Welcome screen.
const EXTRA_LANDING_ROUTES = [
  ["purchase_history", "/dms-purchase-history"],
  ["physical_stock", "/physical-stock"],
  ["current_stock", "/current-stock"],
  ["expiry_items", "/expiry-items"],
  ["expiry_list", "/expiry-list"],
  ["damage_list", "/damage-list"],
  ["purchase", "/purchase"],
  ["db_collection", "/db-collection"],
  ["delivery_report", "/delivery-report"],
];

export const extraLandingRoute = (permissions = []) =>
  EXTRA_LANDING_ROUTES.find(([key]) => permissions.includes(key))?.[1] || "/welcome";
