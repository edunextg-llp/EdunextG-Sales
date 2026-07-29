// Material Dashboard 2 React layouts
import Dashboard from "layouts/dashboard";
import PermissionManagement from "layouts/permission-management";
import Welcome from "layouts/welcome";
// import Tables from "layouts/tables";
// import Billing from "layouts/billing";
// import RTL from "layouts/rtl";
// import Notifications from "layouts/notifications";
// import Profile from "layouts/profile";
// import SignIn from "layouts/authentication/sign-in";
// import SignUp from "layouts/authentication/sign-up";
import CreateStaff from "layouts/create-staff";
import AddCompany from "layouts/add-company";
import AddCounter from "layouts/add-counter";
import AddSales from "layouts/add-sales";
import PurchaseRequisition from "layouts/purchase-requisition";
import Purchase from "layouts/purchase";
import AddDeliveryBoy from "layouts/add-delivery-boy";
import UpdatePayment from "layouts/update-payment";
import InvoiceLookup from "layouts/invoice-lookup";
import Credits from "layouts/credits";
import OutBill from "layouts/out-bill";
import BankDeposit from "layouts/bank-deposit";
import Packaging from "layouts/packaging";
import Delivery from "layouts/delivery";
import Delivered from "layouts/delivered";
import DBCollection from "layouts/db-collection";
import ChalanAddSales from "layouts/chalan/add-sales";
import ChalanPackagingDelivery from "layouts/chalan/packaging-delivery";
import ChalanDelivery from "layouts/chalan/delivery";
import ChalanDelivered from "layouts/chalan/delivered";
import ChalanReturn from "layouts/chalan/return";
// import Reports from "layouts/reports";
import DmsStock from "layouts/dms-stock";
import DmsPurchaseHistory from "layouts/dms-purchase-history";
import AddSeller from "layouts/add-seller";
import AddItem from "layouts/add-item";
import CurrentStock from "layouts/current-stock";
import PhysicalStock from "layouts/physical-stock";
// import ExpiredStock from "layouts/expired-stock";
// @mui icons
import Icon from "@mui/material/Icon";

const routes = [
  {
    type: "collapse",
    name: "Dashboard",
    key: "dashboard",
    icon: <Icon fontSize="small">dashboard</Icon>,
    route: "/dashboard",
    component: <Dashboard />,
    allowedRoles: ["admin", "packaging_staff", "delivery_boy"],
    requiredPermission: "dashboard",
  },
  {
    type: "collapse",
    name: "Permissions",
    key: "permission-management",
    icon: <Icon fontSize="small">admin_panel_settings</Icon>,
    route: "/permission-management",
    component: <PermissionManagement />,
    allowedRoles: ["admin"],
  },
  {
    type: "collapse",
    name: "Welcome",
    key: "welcome",
    icon: <Icon fontSize="small">waving_hand</Icon>,
    route: "/welcome",
    component: <Welcome />,
    allowedRoles: ["packaging_staff", "delivery_boy"],
    hideWhenPermissionsAssigned: true,
  },
  // {
  //   type: "collapse",
  //   name: "Reports",
  //   key: "reports",
  //   icon: <Icon fontSize="small">summarize</Icon>,
  //   route: "/reports",
  //   component: <Reports />,
  // },
  {
    type: "collapse",
    name: "DMS",
    key: "dms",
    icon: <Icon fontSize="small">inventory</Icon>,
    allowedRoles: ["admin", "packaging_staff", "delivery_boy"],
    requiredPermission: "dms",
    collapse: [
      {
        type: "collapse",
        name: "Add Seller",
        key: "add-seller",
        icon: <Icon fontSize="small">storefront</Icon>,
        route: "/add-seller",
        component: <AddSeller />,
        allowedRoles: ["admin", "packaging_staff", "delivery_boy"],
        requiredPermission: "add_seller",
      },
      {
        type: "collapse",
        name: "Add Item",
        key: "add-item",
        icon: <Icon fontSize="small">category</Icon>,
        route: "/add-item",
        component: <AddItem />,
        allowedRoles: ["admin", "packaging_staff", "delivery_boy"],
        requiredPermission: "add_item",
      },
      {
        type: "collapse",
        name: "Item List",
        key: "dms-stock",
        icon: <Icon fontSize="small">inventory_2</Icon>,
        route: "/dms-stock",
        component: <DmsStock />,
        allowedRoles: ["admin", "packaging_staff", "delivery_boy"],
        requiredPermission: "item_list",
      },

      {
        type: "collapse",
        name: "Purchase History",
        key: "dms-purchase-history",
        icon: <Icon fontSize="small">history</Icon>,
        route: "/dms-purchase-history",
        component: <DmsPurchaseHistory />,
      },
      
       {
        type: "collapse",
        name: "Physical Stock",
        key: "physical-stock",
        icon: <Icon fontSize="small">warehouse</Icon>,
        route: "/physical-stock",
        component: <PhysicalStock />,
      },
      {
        type: "collapse",
        name: "Current Stock",
        key: "current-stock",
        icon: <Icon fontSize="small">fact_check</Icon>,
        route: "/current-stock",
        component: <CurrentStock />,
      },
      {
        type: "collapse",
        name: "Purchase",
        key: "purchase",
        icon: <Icon fontSize="small">receipt_long</Icon>,
        route: "/purchase",
        component: <Purchase />,
      },
     
      // {
      //   type: "collapse",
      //   name: "Expired Stock",
      //   key: "expired-stock",
      //   icon: <Icon fontSize="small">swap_horiz</Icon>,
      //   route: "/expired-stock",
      //   component: <ExpiredStock />,
      // },
    ],
  },
  // {
  //   type: "collapse",
  //   name: "Tables",
  //   key: "tables",
  //   icon: <Icon fontSize="small">table_view</Icon>,
  //   route: "/tables",
  //   component: <Tables />,
  // },
  // {
  //   type: "collapse",
  //   name: "Billing",
  //   key: "billing",
  //   icon: <Icon fontSize="small">receipt_long</Icon>,
  //   route: "/billing",
  //   component: <Billing />,
  // },
  {
    type: "collapse",
    name: "Staff Management",
    key: "staff-management",
    icon: <Icon fontSize="small">people</Icon>,
    collapse: [
      {
        type: "collapse",
        name: "Add Company",
        key: "add-company",
        icon: <Icon fontSize="small">domain</Icon>,
        route: "/add-company",
        component: <AddCompany />,
      },
      {
        type: "collapse",
        name: "Create Staff",
        key: "create-staff",
        icon: <Icon fontSize="small">person_add</Icon>,
        route: "/create-staff",
        component: <CreateStaff />,
      },
      {
        type: "collapse",
        name: "Add Delivery Boy",
        key: "add-delivery-boy",
        icon: <Icon fontSize="small">local_shipping</Icon>,
        route: "/add-delivery-boy",
        component: <AddDeliveryBoy />,
      },

    ],
  },
  {
    type: "collapse",
    name: "Add Outlet",
    key: "add-outlet",
    icon: <Icon fontSize="small">store</Icon>,
    route: "/add-outlet",
    component: <AddCounter />,
  },
  {
    type: "collapse",
    name: "Purchase Requisition",
    key: "purchase-requisition",
    icon: <Icon fontSize="small">request_quote</Icon>,
    route: "/purchase-requisition",
    component: <PurchaseRequisition />,
    allowedRoles: ["staff"],
  },
  {
    type: "collapse",
    name: "Requisition Approvals",
    key: "requisition-approvals",
    icon: <Icon fontSize="small">approval</Icon>,
    route: "/requisition-approvals",
    component: <PurchaseRequisition />,
    allowedRoles: ["admin"],
  },
  {
    type: "collapse",
    name: "Add Sales",
    key: "add-sales",
    icon: <Icon fontSize="small">payments</Icon>,
    route: "/add-sales",
    component: <AddSales />,
  },
  {
    type: "collapse",
    name: "Delivery Manager",
    key: "delivery-management",
    icon: <Icon fontSize="small">local_shipping</Icon>,
    collapse: [
      {
        type: "collapse",
        name: "Packaging",
        key: "packaging",
        icon: <Icon fontSize="small">inventory_2</Icon>,
        route: "/packaging",
        component: <Packaging />,
      },
      {
        type: "collapse",
        name: "Delivery",
        key: "delivery",
        icon: <Icon fontSize="small">local_shipping</Icon>,
        route: "/delivery",
        component: <Delivery />,
      },
      {
        type: "collapse",
        name: "Delivered",
        key: "delivered",
        icon: <Icon fontSize="small">verified</Icon>,
        route: "/delivered",
        component: <Delivered />,
      },
    ],
  },
  {
    type: "collapse",
    name: "Chalan",
    key: "chalan",
    icon: <Icon fontSize="small">description</Icon>,
    collapse: [
      {
        type: "collapse",
        name: "Add Sales",
        key: "chalan-add-sales",
        icon: <Icon fontSize="small">payments</Icon>,
        route: "/chalan-add-sales",
        component: <ChalanAddSales />,
      },
      {
        type: "collapse",
        name: "Packaging Delivery",
        key: "chalan-packaging-delivery",
        icon: <Icon fontSize="small">inventory_2</Icon>,
        route: "/chalan-packaging-delivery",
        component: <ChalanPackagingDelivery />,
      },
      {
        type: "collapse",
        name: "Delivery",
        key: "chalan-delivery",
        icon: <Icon fontSize="small">local_shipping</Icon>,
        route: "/chalan-delivery",
        component: <ChalanDelivery />,
      },
      {
        type: "collapse",
        name: "Delivered",
        key: "chalan-delivered",
        icon: <Icon fontSize="small">verified</Icon>,
        route: "/chalan-delivered",
        component: <ChalanDelivered />,
      },
      {
        type: "collapse",
        name: "Return",
        key: "chalan-return",
        icon: <Icon fontSize="small">keyboard_return</Icon>,
        route: "/chalan-return",
        component: <ChalanReturn />,
      },
    ],
  },
  {
    type: "collapse",
    name: "Invoice Lookup",
    key: "invoice-lookup",
    icon: <Icon fontSize="small">manage_search</Icon>,
    route: "/invoice-lookup",
    component: <InvoiceLookup />,
  },
  {
    type: "collapse",
    name: "Update Payment",
    key: "update-payment",
    icon: <Icon fontSize="small">edit_note</Icon>,
    route: "/update-payment",
    component: <UpdatePayment />,
  },
  {
    type: "collapse",
    name: "D.B. Collection",
    key: "db-collection",
    icon: <Icon fontSize="small">payments</Icon>,
    route: "/db-collection",
    component: <DBCollection />,
  },

  {
    type: "collapse",
    name: "Credits",
    key: "credits",
    icon: <Icon fontSize="small">price_change</Icon>,
    route: "/credits",
    component: <Credits />,
  },
  {
    type: "collapse",
    name: "Out Bill",
    key: "out-bill",
    icon: <Icon fontSize="small">receipt_long</Icon>,
    route: "/out-bill",
    component: <OutBill />,
  },
  {
    type: "collapse",
    name: "Bank Deposit",
    key: "bank-deposit",
    icon: <Icon fontSize="small">account_balance</Icon>,
    route: "/bank-deposit",
    component: <BankDeposit />,
  },
  // {
  //   type: "collapse",
  //   name: "Notifications",
  //   key: "notifications",
  //   icon: <Icon fontSize="small">notifications</Icon>,
  //   route: "/notifications",
  //   component: <Notifications />,
  // },
  // {
  //   type: "collapse",
  //   name: "Profile",
  //   key: "profile",
  //   icon: <Icon fontSize="small">person</Icon>,
  //   route: "/profile",
  //   component: <Profile />,
  // },
  // {
  //   type: "collapse",
  //   name: "Sign In",
  //   key: "sign-in",
  //   icon: <Icon fontSize="small">login</Icon>,
  //   route: "/authentication/sign-in",
  //   component: <SignIn />,
  // },
  // {
  //   type: "collapse",
  //   name: "Sign Up",
  //   key: "sign-up",
  //   icon: <Icon fontSize="small">assignment</Icon>,
  //   route: "/authentication/sign-up",
  //   component: <SignUp />,
  // },
];

export default routes;
