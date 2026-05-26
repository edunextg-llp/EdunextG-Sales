// Material Dashboard 2 React layouts
import Dashboard from "layouts/dashboard";
// import Tables from "layouts/tables";
// import Billing from "layouts/billing";
// import RTL from "layouts/rtl";
// import Notifications from "layouts/notifications";
// import Profile from "layouts/profile";
// import SignIn from "layouts/authentication/sign-in";
// import SignUp from "layouts/authentication/sign-up";
import CreateStaff from "layouts/create-staff";
import AddCounter from "layouts/add-counter";
import AddSales from "layouts/add-sales";
import AddDeliveryBoy from "layouts/add-delivery-boy";
import UpdatePayment from "layouts/update-payment";
import Credits from "layouts/credits";

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
    name: "Add Sales",
    key: "add-sales",
    icon: <Icon fontSize="small">payments</Icon>,
    route: "/add-sales",
    component: <AddSales />,
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
    name: "Credits",
    key: "credits",
    icon: <Icon fontSize="small">price_change</Icon>,
    route: "/credits",
    component: <Credits />,
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
