import {
  MdAccountBalanceWallet,
  MdDashboard,
  MdStorefront,
  MdCategory,
  MdAddShoppingCart,
  MdHistory,
  MdWarehouse,
  MdFactCheck,
  MdEventBusy,
  MdEventNote,
  MdAssignmentInd,
  MdShoppingCart,
  MdInventory2,
  MdPointOfSale,
  MdGroupAdd,
  MdCardGiftcard,
  MdPostAdd,
  MdMoveToInbox,
  MdAssignment,
  MdStore,
} from "react-icons/md";

// DMS sidebar items. `permission` uses the same permission keys as the main
// site's Permissions page (frontend/src/utils/staffPermissions.js).
// Items with `group` sit inside that dropdown in the sidebar (see MENU_GROUPS); routes and
// tabs still use the flat list.
export const DMS_ROLES = ["admin", "packaging_staff", "bawarchee_staff", "delivery_boy"];

const menu = [
  { label: "Dashboard", icon: MdDashboard, path: "/" },
  { label: "Add Seller", icon: MdStorefront, path: "/add-seller", permission: "add_seller", group: "purchase" },
  { label: "Add Item", icon: MdCategory, path: "/add-item", permission: "add_item", group: "purchase" },
  // "Add Purchase" was called "Item List"; it still uses the item_list permission.
  { label: "Add Purchase", icon: MdAddShoppingCart, path: "/add-purchase", permission: "item_list", group: "purchase" },
  { label: "Purchase History", icon: MdHistory, path: "/purchase-history", permission: "purchase_history", group: "purchase" },
  { label: "Seller Ledger", icon: MdAccountBalanceWallet, path: "/seller-ledger", permission: "seller_ledger", group: "purchase" },
  { label: "Physical Stock", icon: MdWarehouse, path: "/physical-stock", permission: "physical_stock", group: "stock" },
  // Physical stock assignments (company, assigned days, staff); same permission.
  { label: "Assign", icon: MdAssignmentInd, path: "/assign", permission: "physical_stock" },
  // Sales. Add Distributor shows login passwords, so it is admin only for now (no staff
  // permission is named "admin_only"; admins see every page).
  { label: "Add Distributor", icon: MdGroupAdd, path: "/add-distributor", permission: "admin_only", group: "sales" },
  // Free goods schemes (buy X, get Y free): admin only, like Add Distributor.
  { label: "Free Goods", icon: MdCardGiftcard, path: "/free-goods", permission: "admin_only", group: "sales" },
  // Bills to distributors / CNF or outlets (Create Sales permission).
  { label: "Create Sales", icon: MdPostAdd, path: "/create-sales", permission: "create_sales", group: "sales" },
  // Orders > Distributor Orders: orders from the Distributor Portal; approve -> requisition
  // number for Create Bill (Distributor Orders permission).
  { label: "Distributor Orders", icon: MdMoveToInbox, path: "/distributor-orders", permission: "distributor_orders", group: "orders" },
  // Orders > Outlet Orders: purchase requisitions from marketing staff (moved here from the
  // main site's Approvals > Requisition Approvals). Same permission as before.
  { label: "Outlet Orders", icon: MdStore, path: "/outlet-orders", permission: "requisition_approval", group: "orders" },
  { label: "Stock", icon: MdFactCheck, path: "/stock", permission: "current_stock", group: "stock" },
  { label: "Expiry Items", icon: MdEventBusy, path: "/expiry-items", permission: "expiry_items" },
  { label: "Expiry List", icon: MdEventNote, path: "/expiry-list", permission: "expiry_list" },
];

// Sidebar dropdowns.
export const MENU_GROUPS = {
  purchase: { label: "Purchase", icon: MdShoppingCart },
  stock: { label: "Stock", icon: MdInventory2 },
  sales: { label: "Sales", icon: MdPointOfSale },
  orders: { label: "Orders", icon: MdAssignment },
};

// Same rule as the main site: admins see everything, other roles need the permission.
const isAdmin = (user) => (user?.role || "admin") === "admin";

export const canAccessDms = (user) =>
  Boolean(user) &&
  DMS_ROLES.includes(user.role || "admin") &&
  (isAdmin(user) || (user.permissions || []).includes("dms"));

export const visibleMenu = (user) =>
  menu.filter((item) => !item.permission || isAdmin(user) || (user?.permissions || []).includes(item.permission));

const PHYSICAL_STOCK = menu.find((item) => item.path === "/physical-stock");
export const OUTLET_ORDERS = menu.find((item) => item.path === "/outlet-orders");

// Requisition approvers may open Sales & Purchase for Outlet Orders even without the DMS
// permission (they used to approve on the main site).
export const canApproveOutletOrders = (user) =>
  Boolean(user) &&
  DMS_ROLES.includes(user.role || "admin") &&
  (isAdmin(user) || (user.permissions || []).includes(OUTLET_ORDERS.permission));

// True when the user opens Physical Stock only because a count is assigned to them
// (no DMS + Physical Stock permission). The page then works on /api/my-physical-stock.
export const physicalStockByAssignment = (user) =>
  !(canAccessDms(user) && visibleMenu(user).some((item) => item.path === PHYSICAL_STOCK.path));

// Sidebar / routes. Someone with a physical stock count assigned to them also gets
// Physical Stock, and a requisition approver gets Outlet Orders; without DMS access those
// are the only pages (no Dashboard).
export const menuFor = (user, hasAssignment) => {
  const list = canAccessDms(user) ? visibleMenu(user) : [];
  if (canApproveOutletOrders(user) && !list.includes(OUTLET_ORDERS)) list.push(OUTLET_ORDERS);
  if (hasAssignment && !list.some((item) => item.path === PHYSICAL_STOCK.path)) list.push(PHYSICAL_STOCK);
  return list;
};

export default menu;
