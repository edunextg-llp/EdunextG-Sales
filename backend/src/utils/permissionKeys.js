// Every page permission a Packaging Staff / Delivery Boy login can be given.
// Each key is stored as a can_<key> column in delivery_user_permissions.
export const PERMISSION_KEYS = [
    'dashboard', 'dms', 'add_seller', 'add_item', 'item_list',
    'purchase_history', 'physical_stock', 'current_stock', 'expiry_items', 'expiry_list', 'damage_list', 'purchase',
    'update_payment', 'bank_deposit', 'db_collection', 'credits', 'create_staff', 'add_outlet', 'location_assignments', 'add_sales',
    'packaging', 'delivery', 'delivery_report', 'delivered', 'out_bill', 'requisition_approval', 'invoice_lookup',
    'chalan_add_sales', 'chalan_packaging', 'chalan_delivery', 'chalan_delivered', 'chalan_return',
    // Not a page: lets an Add Sales user bill an outlet overdue by up to 13 days with a reason (14+ needs admin).
    'overdue_7_days',
    // Not a page: in Add Sales, bill an outlet overdue by 14+ days on the user's own permission
    // with a reason (no admin approval). Every use is listed for admin under Overdue Requests.
    'overdue_own_permission',
    // Approvals > Below Target Approvals page: approve staff days that are below the
    // company's daily requisition target (e.g. SIL Rs. 11,250) instead of Admin.
    'requisition_target_approval',
    // Approvals > Overdue Requests: approve 14+ day overdue requests up to Rs. 1,000.
    'overdue_approval',
    // Approvals > Material Reports: review "less material" reports from delivery boys
    // (seeded for SUNANDA BISWAS). Admin can always review.
    'material_report_review',
];

// Extra options that only make sense together with a page permission.
export const PERMISSION_REQUIRES = {
    overdue_7_days: 'add_sales',
    overdue_own_permission: 'add_sales',
};

// DMS pages: granting any of them also grants the DMS menu itself.
export const DMS_PERMISSION_KEYS = [
    'add_seller', 'add_item', 'item_list', 'purchase_history', 'physical_stock',
    'current_stock', 'expiry_items', 'expiry_list', 'damage_list', 'purchase',
];

// New columns and, for existing users, the permission they copy from when the
// column is first added (so nobody loses a page they could already open).
export const NEW_PERMISSION_COLUMNS = [
    ['purchase_history', null],
    ['physical_stock', null],
    ['current_stock', null],
    ['expiry_items', 'item_list'],
    ['expiry_list', 'item_list'],
    ['damage_list', 'item_list'],
    ['purchase', null],
    ['db_collection', null],
    // Credits previously shared the Out Bill permission. Preserve that access
    // when the standalone Give Credit permission is introduced.
    ['credits', 'out_bill'],
    ['delivery_report', 'delivery'],
    ['overdue_7_days', null],
    ['requisition_target_approval', null],
    ['overdue_approval', null],
    ['material_report_review', null],
    ['overdue_own_permission', null],
];

export const permissionColumnsSql = (alias = 'p') =>
    PERMISSION_KEYS.map((key) => `COALESCE(${alias}.can_${key}, 0) AS can_${key}`).join(',\n                    ');

export const permissionsFromRow = (row) => PERMISSION_KEYS.filter((key) => Boolean(Number(row?.[`can_${key}`])));

// Roles a Bawarchee Staff login can have. The role is a label plus a starting set
// of permissions; the admin can tick or untick individual pages afterwards.
export const BAWARCHEE_ROLES = ['admin', 'manager', 'accountant', 'operator'];

// A Bawarchee manager always reviews overdue requests, whatever pages are ticked for them.
export const withRolePermissions = (permissions, bawarcheeRole) => (
    bawarcheeRole === 'manager' && !permissions.includes('overdue_approval')
        ? [...permissions, 'overdue_approval']
        : permissions
);

// Cleans a submitted permission list: drops unknown keys, drops sub-options whose
// page is not granted, and adds the DMS menu when any DMS page is granted.
export const normalizePermissionList = (list) => {
    const requested = [...new Set((Array.isArray(list) ? list : []).filter((key) => PERMISSION_KEYS.includes(key)))];
    const normalized = requested.filter(
        (key) => !PERMISSION_REQUIRES[key] || requested.includes(PERMISSION_REQUIRES[key])
    );
    if (normalized.some((key) => DMS_PERMISSION_KEYS.includes(key)) && !normalized.includes('dms')) {
        normalized.push('dms');
    }
    return normalized;
};

export const parseStoredPermissions = (value) => {
    if (!value) return [];
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed.filter((key) => PERMISSION_KEYS.includes(key)) : [];
    } catch {
        return [];
    }
};
