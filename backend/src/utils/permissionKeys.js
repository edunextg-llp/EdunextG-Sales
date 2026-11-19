// Every page permission a Packaging Staff / Delivery Boy login can be given.
// Each key is stored as a can_<key> column in delivery_user_permissions.
export const PERMISSION_KEYS = [
    'dashboard', 'dms', 'add_seller', 'add_item', 'item_list',
    'purchase_history', 'seller_ledger', 'physical_stock', 'current_stock', 'expiry_items', 'expiry_list', 'damage_list', 'purchase',
    'update_payment', 'bank_deposit', 'db_collection', 'credits', 'create_staff', 'add_outlet', 'location_assignments', 'add_sales',
    'packaging', 'delivery', 'delivery_report', 'delivered', 'out_bill', 'requisition_approval', 'invoice_lookup',
    'chalan_add_sales', 'chalan_packaging', 'chalan_delivery', 'chalan_delivered', 'chalan_return',
    // Not a page: lets an Add Sales user bill an outlet overdue by up to 13 days with a reason (14+ needs admin).
    'overdue_7_days',
    // Not a page: in Add Sales, bill an outlet overdue by 14+ days on the user's own permission
    // with a reason (no admin approval). Every use is listed for admin under Overdue Requests.
    'overdue_own_permission',
    // Not a page: in Add Sales, bill an outlet of another day's bit (or another date) on the
    // user's own permission with a reason (no admin approval). Every use is listed for admin
    // under Other-day bit requests ("Own permission").
    'other_day_own_permission',
    // Approvals > Below Target Approvals page: approve staff days that are below the
    // company's daily requisition target (e.g. SIL Rs. 11,250) instead of Admin.
    'requisition_target_approval',
    // Approvals > Overdue Requests: approve 14+ day overdue requests up to Rs. 1,000.
    'overdue_approval',
    // Approvals > Other Day Bit Requests: see every request and approve / reject it, instead of Admin.
    'other_day_approval',
    // Approvals > Material Reports: review "less material" reports from delivery boys
    // (seeded for SUNANDA BISWAS). Admin can always review.
    'material_report_review',
    // DMS > Sales > Create Sales: bill distributors / CNF or outlets (was admin only).
    'create_sales',
    // DMS > Orders > Distributor Orders: approve or reject Distributor Portal orders (was admin only).
    'distributor_orders',
];

// Extra options that only make sense together with a page permission.
export const PERMISSION_REQUIRES = {
    overdue_7_days: 'add_sales',
    overdue_own_permission: 'add_sales',
    other_day_own_permission: 'add_sales',
};

// DMS pages: granting any of them also grants the DMS menu itself.
export const DMS_PERMISSION_KEYS = [
    'add_seller', 'add_item', 'item_list', 'purchase_history', 'seller_ledger', 'physical_stock',
    'current_stock', 'expiry_items', 'expiry_list', 'damage_list', 'purchase',
    'create_sales', 'distributor_orders',
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
    ['other_day_own_permission', null],
    ['other_day_approval', null],
    // Seller Ledger: whoever could see Purchase History starts with it.
    ['seller_ledger', 'purchase_history'],
    ['create_sales', null],
    ['distributor_orders', null],
];

export const permissionColumnsSql = (alias = 'p') =>
    PERMISSION_KEYS.map((key) => `COALESCE(${alias}.can_${key}, 0) AS can_${key}`).join(',\n                    ');

// Overdue on the user's own reason (Add Sales): a range of overdue days set per user on the
// Permissions page, e.g. 1-14 or 14-no limit. Outside it the sale needs admin approval.
// Users without a saved range keep the old options: "7 days overdue" = 1-13,
// "own permission 14+ days" = 14-no limit, both = 1-no limit.
export const OWN_REASON_SPLIT_DAYS = 13;
export const overdueRangeFor = (user) => {
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    if (!permissions.includes('add_sales')) return null;
    const saved = user?.overdueRange;
    if (saved && Number(saved.from) > 0) {
        return { from: Number(saved.from), to: saved.to == null ? null : Number(saved.to) };
    }
    const upTo13 = permissions.includes('overdue_7_days');
    const over13 = permissions.includes('overdue_own_permission');
    if (upTo13 && over13) return { from: 1, to: null };
    if (upTo13) return { from: 1, to: OWN_REASON_SPLIT_DAYS };
    if (over13) return { from: OWN_REASON_SPLIT_DAYS + 1, to: null };
    return null;
};
export const rangeCovers = (range, days) => Boolean(range)
    && Number(days) >= range.from && (range.to == null || Number(days) <= range.to);
export const rangeText = (range) => (!range ? '' : range.to == null ? `${range.from}+ days` : `${range.from}-${range.to} days`);

// Cleans a submitted range: null to switch it off. to = null means no upper limit.
export const readOverdueRange = (value) => {
    if (!value) return null;
    const from = Number.parseInt(value.from, 10);
    const toRaw = value.to === '' || value.to == null ? null : Number.parseInt(value.to, 10);
    if (!Number.isInteger(from) || from < 1 || from > 3650) throw Object.assign(new Error('The From day must be 1 or more.'), { statusCode: 400 });
    if (toRaw != null && (!Number.isInteger(toRaw) || toRaw < from || toRaw > 3650)) {
        throw Object.assign(new Error('The To day must be the From day or more (leave it empty for no limit).'), { statusCode: 400 });
    }
    return { from, to: toRaw };
};

// Overdue approver tier (Permissions page, under Add Sales): an outlet overdue inside from-to days
// whose invoice for that outlet is below maxAmount goes to the chosen approver instead of Admin.
// Both must hold; anything else goes to Admin. to = null: no upper day limit. maxAmount = null: any amount.
// approverId is a Packaging Staff / Delivery Boy login that has the Overdue Approval permission.
export const readApproverRule = (value) => {
    if (!value) return null;
    const bad = (message) => Object.assign(new Error(message), { statusCode: 400 });
    const from = Number.parseInt(value.from, 10);
    const toRaw = value.to === '' || value.to == null ? null : Number.parseInt(value.to, 10);
    const amountRaw = value.maxAmount === '' || value.maxAmount == null ? null : Number(value.maxAmount);
    const approverId = Number(value.approverId);
    if (!Number.isInteger(from) || from < 1 || from > 3650) throw bad('Approver tier: the From day must be 1 or more.');
    if (toRaw != null && (!Number.isInteger(toRaw) || toRaw < from || toRaw > 3650)) {
        throw bad('Approver tier: the To day must be the From day or more (leave it empty for no limit).');
    }
    if (amountRaw != null && (!Number.isFinite(amountRaw) || amountRaw <= 0 || amountRaw > 100000000)) {
        throw bad('Approver tier: the bill amount limit must be more than 0 (leave it empty for any amount).');
    }
    if (!Number.isInteger(approverId) || approverId <= 0) throw bad('Approver tier: choose who approves.');
    return { from, to: toRaw, maxAmount: amountRaw == null ? null : Math.round(amountRaw * 100) / 100, approverId };
};

export const approverRuleFromRow = (row) => (row?.approver_from_days && row?.approver_delivery_boy_id
    ? {
        from: Number(row.approver_from_days),
        to: row.approver_to_days == null ? null : Number(row.approver_to_days),
        maxAmount: row.approver_max_amount == null ? null : Number(row.approver_max_amount),
        approverId: Number(row.approver_delivery_boy_id),
        approverName: row.approver_name || null,
    }
    : null);

// Who approves one outlet: { to: 'approver', approverId, approverName } or { to: 'admin' }.
// billAmount is the total of the invoice(s) for that outlet in this save.
export const approvalRouteFor = (rule, overdueDays, billAmount) => {
    const days = Number(overdueDays);
    const amount = Number(billAmount) || 0;
    if (rule && rangeCovers(rule, days) && (rule.maxAmount == null || amount < rule.maxAmount)) {
        return { to: 'approver', approverId: rule.approverId, approverName: rule.approverName || 'the approver' };
    }
    return { to: 'admin' };
};

export const permissionsFromRow = (row) => PERMISSION_KEYS.filter((key) => Boolean(Number(row?.[`can_${key}`])));

// Roles a Bawarchee Staff login can have. The role is a label plus a starting set
// of permissions; the admin can tick or untick individual pages afterwards.
export const BAWARCHEE_ROLES = ['admin', 'manager', 'accountant', 'operator', 'hr'];

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
