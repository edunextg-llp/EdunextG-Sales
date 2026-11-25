// Permissions page: Tailwind CSS (no MUI). The permission logic below the UI helpers is unchanged.
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { Field, Icon, Modal, Toggle, TriCheck, btn, fieldClass } from "components/tw";

// ---------------------------------------------------------------------------------------------
// UI helpers
// Avatar colour by role (same as before: packaging violet, delivery cyan).
const avatarClass = (role) => (role === "packaging_staff" ? "bg-violet-600" : "bg-cyan-600");

const API = (process.env.REACT_APP_API_URL);
const PERMISSIONS = [
  ["dashboard", "Dashboard", "View the dashboard, reports, and business summary."],
  ["dms", "Sales & Purchase", "Open the Sales & Purchase section. This is required for its pages."],
  ["add_seller", "Add Seller", "Create and manage suppliers from whom products are purchased."],
  ["add_item", "Add Item", "Create and manage products supplied by sellers."],
  ["item_list", "Add Purchase", "Add purchases and manage the product and stock item list."],
  ["purchase_history", "Purchase History", "View stock import history by company and seller."],
  ["seller_ledger", "Seller Ledger", "View each seller's purchases, payments and balance due, and record payments."],
  ["add_distributor", "Add Distributor", "Add and manage distributors, their access, and login credentials in Sales & Purchase."],
  ["physical_stock", "Physical Stock", "Upload, count, approve and submit physical stock."],
  ["current_stock", "Current Stock", "View current stock levels for each company."],
  ["expiry_items", "Expiry Items", "View items that are expired or close to expiry."],
  ["expiry_list", "Expiry List", "Record and manage expired stock returned from outlets."],
  ["damage_list", "Damage List", "Record and manage damaged stock returned from outlets."],
  ["purchase", "Purchase", "Create, edit and delete purchase entries from sellers."],
  ["update_payment", "Update Payment", "View sales and add, edit, or delete their payment entries."],
  ["product_cancellation", "Product Cancellation", "Request cancellation of individual products from a bill. Admin approval is required before the cancellation is applied."],
  ["bank_deposit", "Bank Deposit", "View and manage cash, cheque, and UPI bank deposits."],
  ["db_collection", "D.B. Collection", "View delivery boy collections and settle them into payments."],
  ["credits", "Give Credit", "Open the Credits page to view and manage pending customer credit."],
  ["create_staff", "Create Staff", "Create and manage staff only for companies assigned to this user."],
  ["location_assignments", "Add Location", "Add and update day-wise locations for staff."],
  ["add_outlet", "Add Outlet", "Create, edit, import, export, or delete customer outlets."],
  ["add_sales", "Add Sales", "Create and manage sales invoices for outlets or customers."],
  ["invoice_lookup", "Invoice Lookup", "Search invoices and view complete invoice details."],
  ["packaging", "Packaging", "View orders awaiting packaging and update packaging status."],
  ["delivery", "Delivery", "View packaged orders, assign delivery staff, and update delivery status."],
  ["delivery_report", "Report", "Delivery report: assign bills route-wise, edit assignments and download sheets."],
  ["delivered", "Delivered", "View delivered or cancelled orders and their delivery details."],
  ["out_bill", "Out Bill", "Assign, track, and return outstanding credit bills."],
  ["approvals", "Approvals", "Grant every Approvals page."],
  ["requisition_approval", "Outlet Order Approval", "Sales & Purchase > Orders > Outlet Orders: view, approve, or cancel staff purchase requisitions (sales orders) from outlets."],
  ["delivery_manager", "Delivery Manager", "Grant every Delivery Manager submenu."],
  ["payment", "Payment", "Grant every Payment submenu."],
  ["create_sales", "Create Sales", "Sales & Purchase > Sales > Create Sales: bill distributors / CNF or outlets, add payments and cancel bills."],
  ["distributor_orders", "Distributor Order Approval", "Sales & Purchase > Orders > Distributor Orders: approve or reject orders from the Distributor Portal (approving gives the requisition number for billing)."],
  ["staff_management", "Staff Management", "Grant every available Staff Management submenu."],
  ["chalan", "Chalan", "Grant every Chalan submenu."],
  ["chalan_add_sales", "Chalan Add Sales", "Create and manage Chalan sales."],
  ["chalan_packaging", "Chalan Packaging", "Package Chalan sales."],
  ["chalan_delivery", "Chalan Delivery", "Assign and deliver Chalan sales."],
  ["chalan_delivered", "Chalan Delivered", "View and manage delivered Chalan sales."],
  ["chalan_return", "Chalan Return", "Process and manage Chalan returns."],
  [
    "overdue_7_days",
    "7 Days Overdue Permission",
    "Add sales for an outlet whose credit is overdue by up to 13 days by giving a reason (admin can see it). 14 days or more still needs admin approval.",
  ],
  [
    "overdue_own_permission",
    "Own Permission (14+ Days Overdue)",
    "In Add Sales, an outlet overdue by 14 days or more gets an Own Permission option: give a reason and the sale is created without admin approval. Admin sees every one under Overdue Requests.",
  ],
  [
    "other_day_own_permission",
    "Own Permission (Other-Day Bit)",
    "In Add Sales, an outlet from another day's bit (or another date) gets an Own Permission option: give a reason and the bill is created without admin approval. Admin sees every one under Other-day requests (Own permission).",
  ],
  [
    "requisition_target_approval",
    "Below Target Approvals",
    "Open Approvals > Below Target Approvals and approve or reject days where a staff member's requisitions are below the company's daily target (e.g. SIL ₹11,250), instead of Admin.",
  ],
  [
    "overdue_approval",
    "Overdue Approval (up to ₹1,000)",
    "Open Approvals > Overdue Requests and approve or reject outlets overdue by 14 days or more when the overdue amount is ₹1,000 or less. Approving creates the sale.",
  ],
  [
    "other_day_approval",
    "Other Day Bit Approval",
    "Open Approvals > Other Day Bit Requests and approve or reject requests to bill an outlet from another day's bit (or another date), instead of Admin. Approving lets that staff add the sale.",
  ],
  [
    "material_report_review",
    "Material Report Review",
    "Open Material Reports and approve or reject extra and less material reports from delivery boys. Rejecting a less report adds the amount back to the bill; rejecting an extra report takes back its star.",
  ],
];
// Extra options shown under a page, only while that page is switched on.
// The two old overdue options (7 days / 14+ days) are replaced by the overdue range below.
const SUB_OPTIONS = { add_sales: ["other_day_own_permission"], update_payment: ["product_cancellation"] };
// Overdue on own reason: a range of overdue days, e.g. 1-14 or 14 with no upper limit.
const RANGE_OFF = { on: false, from: "1", to: "" };
const rangeState = (range) => (range && Number(range.from) > 0
  ? { on: true, from: String(range.from), to: range.to == null ? "" : String(range.to) }
  : RANGE_OFF);
const sameRange = (a, b) => a.on === b.on && (!a.on || (String(a.from) === String(b.from) && String(a.to) === String(b.to)));
const rangeLabel = (r) => (r.on ? `Overdue ${r.from}${r.to ? `-${r.to}` : "+"} days on own reason` : "");
const RANGE_PRESETS = [
  { label: "1-13 days", from: "1", to: "13" },
  { label: "1-14 days", from: "1", to: "14" },
  { label: "14+ days", from: "14", to: "" },
  { label: "Any overdue", from: "1", to: "" },
];
// Approver tier: outside the own-reason range, an outlet overdue inside From-To days whose bill is
// below the amount limit goes to the chosen approver instead of Admin. Anything else goes to Admin.
const APPROVER_OFF = { on: false, from: "", to: "", maxAmount: "", approverId: "" };
const approverState = (rule) => (rule && Number(rule.from) > 0 && rule.approverId
  ? {
    on: true,
    from: String(rule.from),
    to: rule.to == null ? "" : String(rule.to),
    maxAmount: rule.maxAmount == null ? "" : String(Number(rule.maxAmount)),
    approverId: String(rule.approverId),
  }
  : APPROVER_OFF);
const sameApprover = (a, b) => a.on === b.on && (!a.on || ["from", "to", "maxAmount", "approverId"]
  .every((key) => String(a[key]) === String(b[key])));
const rupees = (value) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const SUB_OPTION_KEYS = Object.values(SUB_OPTIONS).flat();
const LEGACY_OVERDUE_KEYS = ["overdue_7_days", "overdue_own_permission"];
const PERMISSION_FOLDERS = [
  { key: "dms", label: "Sales & Purchase", icon: "inventory_2", description: "Same menus as the Sales & Purchase sidebar.",
    // Shown in sub-menus like the Sales & Purchase sidebar (dms/src/menu.js); children follow them.
    sections: [
      { key: "purchase", label: "Purchase", icon: "shopping_cart", children: ["add_seller", "add_item", "item_list", "purchase_history", "seller_ledger"] },
      { key: "stock", label: "Stock", icon: "inventory_2", children: ["physical_stock", "current_stock"] },
      { key: "sales", label: "Sales", icon: "point_of_sale", children: ["add_distributor", "create_sales"] },
      { key: "orders", label: "Orders", icon: "assignment", children: ["distributor_orders", "requisition_approval"] },
      { key: "expiry", label: "Expiry", icon: "event_busy", children: ["expiry_items", "expiry_list"] },
      { key: "old", label: "Older pages (main site)", icon: "history", children: ["damage_list", "purchase"] },
    ],
  },
  // Folders are listed in sidebar menu order; children follow their submenu order.
  { key: "staff_management", label: "Staff Management", icon: "badge", description: "Create staff, locations and outlets.", children: ["create_staff", "location_assignments", "add_outlet"] },
  { key: "approvals", label: "Approvals", icon: "verified", description: "Below Target, Overdue and Other Day Bit approvals.", children: ["requisition_target_approval", "overdue_approval", "other_day_approval"] },
  { key: "delivery_manager", label: "Delivery Manager", icon: "local_shipping", description: "Add sales, packaging, delivery, report, delivered orders and material reports.", children: ["add_sales", "packaging", "delivery", "delivery_report", "delivered", "material_report_review"] },
  { key: "chalan", label: "Chalan", icon: "receipt_long", description: "The full Chalan workflow.", children: ["chalan_add_sales", "chalan_packaging", "chalan_delivery", "chalan_delivered", "chalan_return"] },
  { key: "payment", label: "Payment", icon: "account_balance_wallet", description: "Update payment, D.B. collection, credit and bank deposit.", children: ["update_payment", "db_collection", "credits", "bank_deposit"] },
];
// A folder with sub-menus lists its pages in sub-menu order.
PERMISSION_FOLDERS.forEach((folder) => {
  if (folder.sections) folder.children = folder.sections.flatMap((section) => section.children);
});
// Box size per menu: big menus take the full row and lay their pages out in columns,
// small menus share a row. `grid` is the box width, `columns` the page columns inside it.
const WIDE_GROUP = { grid: { xs: 12 }, columns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" } };
const HALF_GROUP = { grid: { xs: 12, lg: 6 }, columns: { xs: "1fr" } };
const GROUP_LAYOUT = {
  general: WIDE_GROUP,
  dms: WIDE_GROUP,
  staff_management: HALF_GROUP,
  approvals: HALF_GROUP,
  delivery_manager: WIDE_GROUP,
  chalan: HALF_GROUP,
  payment: HALF_GROUP,
};
const FOLDER_KEYS = PERMISSION_FOLDERS.flatMap((folder) => [folder.key, ...folder.children]);
const GENERAL_GROUP = {
  key: "general",
  label: "General Pages",
  icon: "dashboard",
  description: "Individual pages outside a section.",
  // The old overdue options are now the overdue range (under Add Sales), so they are not listed.
  children: PERMISSIONS.filter(([key]) => !FOLDER_KEYS.includes(key) && !SUB_OPTION_KEYS.includes(key) && !LEGACY_OVERDUE_KEYS.includes(key)).map(([key]) => key),
};
const DISPLAY_ONLY_FOLDER_KEYS = ["delivery_manager", "payment", "staff_management", "chalan", "approvals"];
// The pages a user can actually be granted (folder keys are just groupings).
const PAGE_KEYS = [...GENERAL_GROUP.children, ...PERMISSION_FOLDERS.flatMap((folder) => folder.children)];
const PERMISSION_MAP = Object.fromEntries(PERMISSIONS.map(([key, label, description]) => [key, { label, description }]));
const ROLE_LABELS = { packaging_staff: "Packaging Staff", delivery_boy: "Delivery Boy" };
const ROLE_FILTERS = [["all", "All"], ["packaging_staff", "Packaging"], ["delivery_boy", "Delivery"]];

const roleLabel = (role) => ROLE_LABELS[role] || "Delivery Boy";
const initials = (name = "") => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
const pageCount = (list = []) => PAGE_KEYS.filter((key) => list.includes(key)).length;
const sameSet = (a, b) => {
  const left = a.filter((key) => !DISPLAY_ONLY_FOLDER_KEYS.includes(key));
  const right = b.filter((key) => !DISPLAY_ONLY_FOLDER_KEYS.includes(key));
  return left.length === right.length && left.every((key) => right.includes(key));
};

function PermissionManagement() {
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [range, setRange] = useState(RANGE_OFF);
  const [approverTier, setApproverTier] = useState(APPROVER_OFF);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/delivery-boy/permissions`);
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data.error || "Unable to load users.");
      setUsers(data);
      setSelectedId((value) => value || (data[0]?.id ? String(data[0].id) : ""));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const selectedUser = users.find((user) => String(user.id) === String(selectedId));

  useEffect(() => {
    setPermissions(selectedUser?.permissions || []);
    setRange(rangeState(selectedUser?.overdueRange));
    setApproverTier(approverState(selectedUser?.overdueApprover));
    setMessage("");
  }, [selectedId, users]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = Boolean(selectedUser) && (
    !sameSet(permissions, selectedUser.permissions || [])
    || !sameRange(range, rangeState(selectedUser.overdueRange))
    || !sameApprover(approverTier, approverState(selectedUser.overdueApprover))
  );
  const rangeError = range.on && (
    !(Number(range.from) >= 1) ? "From day must be 1 or more."
      : range.to !== "" && Number(range.to) < Number(range.from) ? "To day must be the From day or more (empty = no limit)."
        : ""
  );
  const approverChanged = Boolean(selectedUser) && !sameApprover(approverTier, approverState(selectedUser.overdueApprover));
  const addSalesRemoved = Boolean(selectedUser?.permissions?.includes("add_sales")) && !permissions.includes("add_sales");
  const shouldUpdateApprover = approverChanged || addSalesRemoved;

  // Who can approve: other active logins with the Overdue Approval permission (they see Approvals > Overdue Requests).
  const approverOptions = useMemo(() => users.filter((user) => user.isActive !== false
    && String(user.id) !== String(selectedId)
    && (user.permissions || []).includes("overdue_approval")), [users, selectedId]);
  const approverName = (id) => users.find((user) => String(user.id) === String(id))?.name || "";
  const approverError = shouldUpdateApprover && permissions.includes("add_sales") && approverTier.on && (
    !(Number(approverTier.from) >= 1) ? "Approver tier: From day must be 1 or more."
      : approverTier.to !== "" && Number(approverTier.to) < Number(approverTier.from) ? "Approver tier: To day must be the From day or more (empty = no limit)."
        : approverTier.maxAmount !== "" && !(Number(approverTier.maxAmount) > 0) ? "Approver tier: bill amount limit must be more than 0 (empty = any amount)."
          : !approverTier.approverId ? "Approver tier: choose who approves."
            : range.on && range.to === "" && Number(approverTier.from) >= Number(range.from)
              ? "Approver tier: the own-reason range has no upper limit, so it already covers these days. Set its To day first."
              : ""
  );

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => (roleFilter === "all" || user.role === roleFilter)
      && (!term || `${user.name} ${user.loginId || ""}`.toLowerCase().includes(term)));
  }, [users, search, roleFilter]);

  const selectUser = (id) => {
    if (String(id) === String(selectedId)) return;
    if (dirty) {
      setPendingUserId(String(id));
      return;
    }
    setSelectedId(String(id));
  };

  const togglePermission = (key) => setPermissions((current) => {
    const folder = PERMISSION_FOLDERS.find((item) => item.children.includes(key));
    if (current.includes(key)) {
      // Switching a page off also removes its extra options (e.g. Add Sales -> 7 days overdue).
      const next = current.filter((item) => item !== key && !(SUB_OPTIONS[key] || []).includes(item));
      if (folder && !folder.children.some((permission) => next.includes(permission))) {
        return next.filter((item) => item !== folder.key);
      }
      return next;
    }
    return folder ? [...new Set([...current, folder.key, key])] : [...current, key];
  });

  const toggleGroup = (group) => setPermissions((current) => {
    const groupKeys = group.key === "general" ? group.children : [group.key, ...group.children];
    const allSelected = group.children.every((key) => current.includes(key));
    const removed = [...groupKeys, ...groupKeys.flatMap((key) => SUB_OPTIONS[key] || [])];
    return allSelected
      ? current.filter((key) => !removed.includes(key))
      : [...new Set([...current, ...groupKeys])];
  });

  // One sub-menu of a folder (e.g. Sales & Purchase > Orders): all its pages on or off.
  const toggleSection = (folder, section) => setPermissions((current) => {
    const allOn = section.children.every((key) => current.includes(key));
    if (!allOn) return [...new Set([...current, folder.key, ...section.children])];
    const removed = section.children.flatMap((key) => [key, ...(SUB_OPTIONS[key] || [])]);
    const next = current.filter((key) => !removed.includes(key));
    return folder.children.some((key) => next.includes(key)) ? next : next.filter((key) => key !== folder.key);
  });

  const grantAll = () => setPermissions([...GENERAL_GROUP.children, ...FOLDER_KEYS]);
  const clearAll = () => setPermissions([]);
  const resetChanges = () => {
    setPermissions(selectedUser?.permissions || []);
    setRange(rangeState(selectedUser?.overdueRange));
    setApproverTier(approverState(selectedUser?.overdueApprover));
  };

  const savePermissions = async () => {
    if (!selectedUser) return;
    setConfirmSaveOpen(false);
    if (rangeError || approverError) {
      setError(rangeError || approverError);
      return;
    }
    const overdueApprover = approverTier.on && permissions.includes("add_sales")
      ? {
        from: Number(approverTier.from),
        to: approverTier.to === "" ? null : Number(approverTier.to),
        maxAmount: approverTier.maxAmount === "" ? null : Number(approverTier.maxAmount),
        approverId: Number(approverTier.approverId),
      }
      : null;
    const overdueRange = range.on && permissions.includes("add_sales")
      ? { from: Number(range.from), to: range.to === "" ? null : Number(range.to) }
      : null;
    // Folder keys are UI grouping keys. The child menu permissions are what the
    // server persists and enforces, so older assigned permissions remain valid.
    const savedPermissions = permissions.filter((key) => !DISPLAY_ONLY_FOLDER_KEYS.includes(key)
      && !SUB_OPTION_KEYS.some((option) => option === key && !Object.entries(SUB_OPTIONS)
        .some(([page, options]) => options.includes(option) && permissions.includes(page))));
    setSaving(true);
    setError("");
    try {
      const payload = { permissions: savedPermissions, overdueRange };
      if (shouldUpdateApprover) payload.overdueApprover = overdueApprover;
      const response = await fetch(`${API}/delivery-boy/${selectedUser.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save permissions.");
      setUsers((current) => current.map((user) => (
        user.id === selectedUser.id
          ? {
            ...user,
            permissions: savedPermissions,
            overdueRange,
            overdueApprover: shouldUpdateApprover
              ? (overdueApprover ? { ...overdueApprover, approverName: approverName(overdueApprover.approverId) } : null)
              : user.overdueApprover,
          }
          : user
      )));
      setMessage(`${selectedUser.name}'s permissions were saved. They apply the next time ${selectedUser.name} signs in.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const groups = [GENERAL_GROUP, ...PERMISSION_FOLDERS];
  const grantedLabels = [
    ...[...PAGE_KEYS, ...SUB_OPTION_KEYS].filter((key) => permissions.includes(key)).map((key) => PERMISSION_MAP[key].label),
    ...(range.on && permissions.includes("add_sales") ? [rangeLabel(range)] : []),
    ...(approverTier.on && permissions.includes("add_sales") && approverTier.approverId
      ? [`Overdue ${approverTier.from}${approverTier.to ? `-${approverTier.to}` : "+"} days${approverTier.maxAmount ? ` below ${rupees(approverTier.maxAmount)}` : ""} → ${approverName(approverTier.approverId)}`]
      : []),
  ];

  // Turning the tier on starts it the day after the own-reason range ends.
  const toggleApproverTier = () => setApproverTier((tier) => {
    if (tier.on) return { ...tier, on: false };
    const start = range.on && range.to !== "" ? String(Number(range.to) + 1) : tier.from || "1";
    return { ...tier, on: true, from: tier.from || start };
  });

  const tierSummary = () => {
    const days = `${approverTier.from || "?"}${approverTier.to ? `-${approverTier.to}` : "+"} days overdue`;
    const bill = approverTier.maxAmount ? ` and bill below ${rupees(approverTier.maxAmount)}` : "";
    const who = approverName(approverTier.approverId) || "the approver";
    const rest = approverTier.to || approverTier.maxAmount
      ? ` Anything else (${[approverTier.to && `more than ${approverTier.to} days`, approverTier.maxAmount && `bill ${rupees(approverTier.maxAmount)} or more`].filter(Boolean).join(", or ")}) goes to Admin.`
      : "";
    return `${days}${bill} → ${who} approves.${rest}`;
  };

  // Add Sales -> "Approver tier": days + bill limit + who approves, instead of Admin.
  const renderApproverTier = () => (
    <div className="mb-3 ml-1 mr-1 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <Icon name="how_to_reg" className="mt-0.5 text-[19px] text-indigo-600" />
        <span className="min-w-0 grow">
          <span className="block text-[13px] font-semibold text-slate-800">Approver tier (instead of Admin)</span>
          <span className="block text-[12px] leading-snug text-slate-500">
            Outside the own-reason range: outlets overdue by these days whose bill is below the limit go to the chosen approver. Both must match; anything else goes to Admin.
          </span>
        </span>
        <Toggle checked={approverTier.on} onChange={toggleApproverTier} label="Approver tier" />
      </label>
      {approverTier.on && (
        <div className="mt-3 pl-7">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From day">
              <input type="number" min={1} className={fieldClass} value={approverTier.from}
                onChange={(e) => setApproverTier((t) => ({ ...t, from: e.target.value.replace(/\D/g, "") }))} />
            </Field>
            <Field label="To day">
              <input type="number" min={1} placeholder="No limit" className={fieldClass} value={approverTier.to}
                onChange={(e) => setApproverTier((t) => ({ ...t, to: e.target.value.replace(/\D/g, "") }))} />
            </Field>
            <Field label="Bill below (₹)" width="w-36">
              <input type="number" min={1} placeholder="Any amount" className={fieldClass} value={approverTier.maxAmount}
                onChange={(e) => setApproverTier((t) => ({ ...t, maxAmount: e.target.value.replace(/[^\d.]/g, "") }))} />
            </Field>
            <Field label="Approver" width="w-56">
              <select className={fieldClass} value={approverTier.approverId}
                onChange={(e) => setApproverTier((t) => ({ ...t, approverId: e.target.value }))}>
                <option value="" disabled>{approverOptions.length ? "Choose approver" : "No one has Overdue Approval"}</option>
                {approverOptions.map((user) => (
                  <option key={user.id} value={String(user.id)}>{user.name} · {roleLabel(user.role)}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className={`m-0 mt-2 text-[12px] ${approverError ? "font-medium text-red-700" : "text-indigo-800"}`}>
            {approverError || tierSummary()}
          </p>
          {!approverOptions.length && (
            <p className="m-0 mt-1 text-[12px] text-slate-500">
              Give someone the Approvals → Overdue Approval permission first; only they can be chosen here.
            </p>
          )}
        </div>
      )}
    </div>
  );

  // Add Sales -> "Overdue on own reason": switch on, then From day and To day (empty = no limit).
  const renderOverdueRange = () => (
    <div className="mb-2 ml-1 mr-1 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <Icon name="date_range" className="mt-0.5 text-[19px] text-amber-600" />
        <span className="min-w-0 grow">
          <span className="block text-[13px] font-semibold text-slate-800">Overdue on own reason (day range)</span>
          <span className="block text-[12px] leading-snug text-slate-500">
            Outlets overdue inside this range can be billed by giving a reason; admin sees each one. Outside it, admin approval is needed.
          </span>
        </span>
        <Toggle checked={range.on} onChange={() => setRange((r) => ({ ...r, on: !r.on }))} label="Overdue on own reason" />
      </label>
      {range.on && (
        <div className="mt-3 pl-7">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From day">
              <input type="number" min={1} className={fieldClass} value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value.replace(/\D/g, "") }))} />
            </Field>
            <Field label="To day">
              <input type="number" min={1} placeholder="No limit" className={fieldClass} value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value.replace(/\D/g, "") }))} />
            </Field>
            <div className="flex flex-wrap gap-1.5 pb-1">
              {RANGE_PRESETS.map((preset) => {
                const active = range.from === preset.from && range.to === preset.to;
                return (
                  <button
                    key={preset.label} type="button"
                    onClick={() => setRange((r) => ({ ...r, from: preset.from, to: preset.to }))}
                    className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${active ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-800 hover:bg-amber-200"}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <p className={`m-0 mt-2 text-[12px] ${rangeError ? "font-medium text-red-700" : "text-amber-800"}`}>
            {rangeError || `Own reason for ${range.from || "?"}${range.to ? ` to ${range.to}` : "+"} days overdue${range.to ? "; more needs admin" : ""}. Leave "To day" empty for no limit.`}
          </p>
        </div>
      )}
    </div>
  );

  // One page switch (with Add Sales' extra settings when it is on).
  const renderPage = (key) => {
    const on = permissions.includes(key);
    return (
      <div key={key} className={key === "add_sales" && on ? "col-span-full" : ""}>
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition ${on ? "bg-blue-50/50" : "hover:bg-slate-50"}`}>
          <span className="min-w-0 grow">
            <span className={`block text-[13.5px] font-semibold ${on ? "text-slate-900" : "text-slate-700"}`}>{PERMISSION_MAP[key].label}</span>
            <span className="block text-[12px] leading-snug text-slate-500">{PERMISSION_MAP[key].description}</span>
          </span>
          <Toggle checked={on} onChange={() => togglePermission(key)} label={PERMISSION_MAP[key].label} />
        </label>
        {key === "add_sales" && on && renderOverdueRange()}
        {key === "add_sales" && on && renderApproverTier()}
        {on && (SUB_OPTIONS[key] || []).map((option) => (
          <label key={option} className="mb-2 ml-1 mr-1 flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <Icon name="schedule" className="mt-0.5 text-[19px] text-amber-600" />
            <span className="min-w-0 grow">
              <span className="block text-[13px] font-semibold text-slate-800">{PERMISSION_MAP[option].label}</span>
              <span className="block text-[12px] leading-snug text-slate-500">{PERMISSION_MAP[option].description}</span>
            </span>
            <Toggle checked={permissions.includes(option)} onChange={() => togglePermission(option)} label={PERMISSION_MAP[option].label} />
          </label>
        ))}
      </div>
    );
  };

  // Page columns inside a box: wide menus 1/2/3 columns, small ones a single column.
  const pageGrid = (group) => ((GROUP_LAYOUT[group.key] || HALF_GROUP) === WIDE_GROUP
    ? "grid grid-cols-1 gap-x-3 md:grid-cols-2 2xl:grid-cols-3"
    : "grid grid-cols-1 gap-x-3");

  const renderGroup = (group) => {
    const selectedCount = group.children.filter((key) => permissions.includes(key)).length;
    const allSelected = selectedCount === group.children.length;
    const share = group.children.length ? (selectedCount / group.children.length) * 100 : 0;
    return (
      <section key={group.key} className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${selectedCount ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>
            <Icon name={group.icon} />
          </span>
          <span className="min-w-0 grow">
            <span className="block text-[14px] font-semibold text-slate-900">{group.label}</span>
            <span className="block truncate text-[12px] text-slate-500">{group.description}</span>
          </span>
          <span className="flex flex-col items-end gap-1">
            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ${selectedCount ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
              {selectedCount}/{group.children.length}
            </span>
            <span className="h-1 w-14 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-blue-600" style={{ width: `${share}%` }} /></span>
          </span>
          <label className="ml-1 flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
            <TriCheck checked={allSelected} indeterminate={selectedCount > 0 && !allSelected} onChange={() => toggleGroup(group)} label={`Grant all ${group.label}`} />
            All
          </label>
        </header>
        {group.sections ? group.sections.map((section) => {
          const onCount = section.children.filter((key) => permissions.includes(key)).length;
          const allOn = onCount === section.children.length;
          return (
            <div key={section.key} className="px-2 pb-1 pt-2">
              <div className="mx-1 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <Icon name={section.icon} className="text-[18px] text-blue-600" />
                <span className="grow text-[12.5px] font-semibold uppercase tracking-wide text-slate-600">{section.label}</span>
                <span className="text-[12px] tabular-nums text-slate-500">{onCount}/{section.children.length}</span>
                <TriCheck checked={allOn} indeterminate={onCount > 0 && !allOn} onChange={() => toggleSection(group, section)} label={`Grant all ${group.label} > ${section.label}`} />
              </div>
              <div className={`mt-1 ${pageGrid(group)}`}>{section.children.map(renderPage)}</div>
            </div>
          );
        }) : (
          <div className={`p-2 ${pageGrid(group)}`}>{group.children.map(renderPage)}</div>
        )}
      </section>
    );
  };

  const allowedCount = pageCount(permissions);
  const roleCounts = {
    packaging_staff: users.filter((u) => u.role === "packaging_staff").length,
    delivery_boy: users.filter((u) => u.role !== "packaging_staff").length,
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="min-w-0 grow">
            <h2 className="m-0 text-[22px] font-bold text-slate-900">Permission Management</h2>
            <p className="m-0 mt-1 text-[13px] text-slate-500">Choose a staff member, switch on the pages they can open, then save.</p>
          </div>
          {!loading && users.length > 0 && (
            <div className="flex gap-2">
              {[["Staff", users.length, "groups"], ["Packaging", roleCounts.packaging_staff, "inventory"], ["Delivery", roleCounts.delivery_boy, "local_shipping"]].map(([label, value, icon]) => (
                <div key={label} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <Icon name={icon} className="text-[18px] text-slate-400" />
                  <span className="text-[18px] font-bold tabular-nums text-slate-900">{value}</span>
                  <span className="text-[12px] text-slate-500">{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
            <Icon name="error_outline" className="text-[19px]" />
            <span className="grow">{error}</span>
            <button type="button" aria-label="Close" onClick={() => setError("")} className="text-red-500 hover:text-red-800"><Icon name="close" className="text-[18px]" /></button>
          </div>
        )}
        {message && (
          <div role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
            <Icon name="check_circle" className="text-[19px]" />
            <span className="grow">{message}</span>
            <button type="button" aria-label="Close" onClick={() => setMessage("")} className="text-emerald-600 hover:text-emerald-900"><Icon name="close" className="text-[18px]" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><span className="size-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-600" aria-label="Loading" /></div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-blue-800">Create Packaging Staff or a Delivery Boy first.</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            {/* Staff list */}
            <aside className="lg:sticky lg:top-[88px] lg:self-start">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="space-y-3 border-b border-slate-100 p-4">
                  <div className="relative">
                    <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                    <input
                      type="search" placeholder="Search name or login ID" value={search} onChange={(event) => setSearch(event.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-[13px] text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                    {ROLE_FILTERS.map(([value, label]) => (
                      <button
                        key={value} type="button" onClick={() => setRoleFilter(value)}
                        className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition ${roleFilter === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="m-0 max-h-[calc(100vh-300px)] list-none space-y-0.5 overflow-y-auto p-2">
                  {filteredUsers.length === 0 && (
                    <li className="py-8 text-center text-[13px] text-slate-400">No staff match your search.</li>
                  )}
                  {filteredUsers.map((user) => {
                    const active = String(user.id) === String(selectedId);
                    const count = pageCount(user.permissions);
                    return (
                      <li key={user.id}>
                        <button
                          type="button" onClick={() => selectUser(user.id)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition ${active ? "border-blue-200 bg-blue-50" : "border-transparent hover:bg-slate-50"}`}
                        >
                          <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${avatarClass(user.role)}`}>{initials(user.name)}</span>
                          <span className="min-w-0 grow">
                            <span className={`block truncate text-[13px] ${active ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>{user.name}</span>
                            <span className="block truncate text-[11.5px] text-slate-500">{roleLabel(user.role)}</span>
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${count ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {count ? `${count} page${count === 1 ? "" : "s"}` : "None"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>

            {/* Permissions editor */}
            <div className="min-w-0">
              {selectedUser && (
                <>
                  <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                    <div className="flex flex-wrap items-center gap-4 p-5">
                      <span className={`flex size-14 shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white ${avatarClass(selectedUser.role)}`}>{initials(selectedUser.name)}</span>
                      <div className="min-w-48 grow">
                        <h3 className="m-0 text-[19px] font-bold text-slate-900">{selectedUser.name}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
                          <span className="rounded-full border border-slate-300 px-2 py-0.5 font-medium text-slate-600">{roleLabel(selectedUser.role)}</span>
                          <span>Login ID: <b className="text-slate-700">{selectedUser.loginId || "Not generated"}</b></span>
                        </div>
                      </div>
                      <div className="w-48">
                        <div className="flex items-baseline justify-end gap-1">
                          <span className="text-[26px] font-bold tabular-nums text-blue-700">{allowedCount}</span>
                          <span className="text-[13px] text-slate-500">/ {PAGE_KEYS.length} pages allowed</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${(allowedCount / PAGE_KEYS.length) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                      <button type="button" className={btn.outline} onClick={grantAll}><Icon name="done_all" className="text-[18px] text-blue-600" />Allow all pages</button>
                      <button type="button" className={btn.outline} onClick={clearAll}><Icon name="block" className="text-[18px] text-slate-500" />Remove all</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {groups.map((group) => (
                      <div key={group.key} className={(GROUP_LAYOUT[group.key] || HALF_GROUP) === WIDE_GROUP ? "lg:col-span-2" : ""}>{renderGroup(group)}</div>
                    ))}
                  </div>

                  {/* Save bar */}
                  <div className={`sticky bottom-4 z-10 mt-5 flex flex-wrap items-center gap-3 rounded-2xl border bg-white/95 px-5 py-3 shadow-lg backdrop-blur ${dirty ? "border-amber-300" : "border-slate-200"}`}>
                    <Icon name={dirty ? "edit_note" : "check_circle"} className={`text-[22px] ${dirty ? "text-amber-600" : "text-emerald-600"}`} />
                    <span className="grow text-[13.5px] font-semibold text-slate-800">{dirty ? "You have unsaved changes" : "All changes saved"}</span>
                    <button type="button" className={btn.ghost} disabled={!dirty || saving} onClick={resetChanges}>Discard</button>
                    <button type="button" className={btn.primary} disabled={!dirty || saving} onClick={() => setConfirmSaveOpen(true)}>
                      <Icon name="save" className="text-[18px]" />{saving ? "Saving..." : "Save Permissions"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={confirmSaveOpen} onClose={() => setConfirmSaveOpen(false)} title={`Save permissions for ${selectedUser?.name || ""}?`}
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={() => setConfirmSaveOpen(false)}>Cancel</button>
            <button type="button" className={btn.primary} onClick={savePermissions}>Yes, Save</button>
          </>
        )}
      >
        {grantedLabels.length ? (
          <div className="flex flex-wrap gap-1.5">
            {grantedLabels.map((label) => (
              <span key={label} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-blue-800">{label}</span>
            ))}
          </div>
        ) : (
          <p className="m-0 text-[13px] text-slate-600">No pages selected — this user will not be able to open any page.</p>
        )}
        <p className="m-0 mt-4 text-[12px] text-slate-500">Changes apply the next time this user signs in.</p>
      </Modal>

      <Modal
        open={Boolean(pendingUserId)} onClose={() => setPendingUserId(null)} title="Discard unsaved changes?"
        actions={(
          <>
            <button type="button" className={btn.ghost} onClick={() => setPendingUserId(null)}>Keep editing</button>
            <button type="button" className={btn.danger} onClick={() => { setSelectedId(pendingUserId); setPendingUserId(null); }}>Discard</button>
          </>
        )}
      >
        <p className="m-0 text-[13px] text-slate-600">You changed {selectedUser?.name}&apos;s permissions but didn&apos;t save them.</p>
      </Modal>
      <Footer />
    </DashboardLayout>
  );
}

export default PermissionManagement;
