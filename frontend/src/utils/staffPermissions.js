// Page permissions a Bawarchee Staff login can be given (same keys as the
// Permissions page). Keep in sync with backend/src/utils/permissionKeys.js.
export const STAFF_PERMISSION_GROUPS = [
  {
    key: "general",
    label: "General",
    items: [
      ["dashboard", "Dashboard"],
      ["update_payment", "Update Payment"],
      ["bank_deposit", "Bank Deposit"],
      ["db_collection", "D.B. Collection"],
      ["credits", "Give Credit"],
      ["add_sales", "Add Sales"],
      ["overdue_7_days", "7 Days Overdue (with Add Sales)"],
      ["overdue_own_permission", "Own Permission, 14+ Days Overdue (with Add Sales)"],
      ["invoice_lookup", "Invoice Lookup"],
      ["out_bill", "Out Bill"],
    ],
  },
  {
    key: "dms",
    label: "DMS",
    items: [
      ["add_seller", "Add Seller"],
      ["add_item", "Add Item"],
      ["item_list", "Item List"],
      ["purchase_history", "Purchase History"],
      ["seller_ledger", "Seller Ledger"],
      ["physical_stock", "Physical Stock"],
      ["current_stock", "Current Stock"],
      ["expiry_items", "Expiry Items"],
      ["expiry_list", "Expiry List"],
      ["damage_list", "Damage List"],
      ["purchase", "Purchase"],
    ],
  },
  {
    key: "staff_management",
    label: "Staff Management",
    items: [
      ["create_staff", "Create Staff"],
      ["location_assignments", "Add Location"],
      ["add_outlet", "Add Outlet"],
    ],
  },
  {
    key: "delivery_manager",
    label: "Delivery Manager",
    items: [
      ["packaging", "Packaging"],
      ["delivery", "Delivery"],
      ["delivery_report", "Delivery Report"],
      ["delivered", "Delivered"],
    ],
  },
  {
    key: "chalan",
    label: "Chalan",
    items: [
      ["chalan_add_sales", "Chalan Add Sales"],
      ["chalan_packaging", "Chalan Packaging"],
      ["chalan_delivery", "Chalan Delivery"],
      ["chalan_delivered", "Chalan Delivered"],
      ["chalan_return", "Chalan Return"],
    ],
  },
  {
    key: "approvals",
    label: "Approvals",
    items: [
      ["requisition_approval", "Requisition Approval"],
      ["requisition_target_approval", "Below Target Approvals"],
      ["overdue_approval", "Overdue Approval (up to ₹1,000)"],
    ],
  },
];

export const DMS_PAGE_KEYS = STAFF_PERMISSION_GROUPS.find((group) => group.key === "dms").items.map(
  ([key]) => key
);

export const ALL_STAFF_PERMISSIONS = [
  "dms",
  ...STAFF_PERMISSION_GROUPS.flatMap((group) => group.items.map(([key]) => key)),
];

export const BAWARCHEE_ROLE_OPTIONS = [
  ["admin", "Admin"],
  ["manager", "Manager"],
  ["accountant", "Accountant"],
  ["operator", "Operator"],
];

export const bawarcheeRoleLabel = (role) =>
  BAWARCHEE_ROLE_OPTIONS.find(([key]) => key === role)?.[1] || "";

// Starting permissions for each role; the admin can change them before saving.
export const BAWARCHEE_ROLE_PRESETS = {
  admin: ALL_STAFF_PERMISSIONS,
  manager: [
    "dashboard", "dms", ...DMS_PAGE_KEYS,
    "create_staff", "location_assignments", "add_outlet",
    "add_sales", "invoice_lookup", "out_bill",
    "packaging", "delivery", "delivery_report", "delivered",
    "chalan_add_sales", "chalan_packaging", "chalan_delivery", "chalan_delivered", "chalan_return",
    "requisition_approval", "requisition_target_approval",
  ],
  accountant: [
    "dashboard", "update_payment", "bank_deposit", "db_collection", "credits",
    "out_bill", "invoice_lookup", "dms", "purchase_history", "seller_ledger", "purchase",
  ],
  operator: [
    "dashboard", "add_sales", "invoice_lookup",
    "packaging", "delivery", "delivered",
    "chalan_add_sales", "chalan_packaging", "chalan_delivery", "chalan_delivered",
  ],
};

// Mirrors the backend clean-up: DMS pages need the DMS menu, sub-options need their page.
export const normalizeStaffPermissions = (list = []) => {
  const set = new Set(list);
  if (!set.has("add_sales")) {
    set.delete("overdue_7_days");
    set.delete("overdue_own_permission");
  }
  const hasDmsPage = DMS_PAGE_KEYS.some((key) => set.has(key));
  if (hasDmsPage) set.add("dms");
  else set.delete("dms");
  return ALL_STAFF_PERMISSIONS.filter((key) => set.has(key));
};
