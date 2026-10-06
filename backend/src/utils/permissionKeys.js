// Every page permission a Packaging Staff / Delivery Boy login can be given.
// Each key is stored as a can_<key> column in delivery_user_permissions.
export const PERMISSION_KEYS = [
    'dashboard', 'dms', 'add_seller', 'add_item', 'item_list',
    'purchase_history', 'physical_stock', 'current_stock', 'expiry_items', 'expiry_list', 'damage_list', 'purchase',
    'update_payment', 'bank_deposit', 'db_collection', 'create_staff', 'add_outlet', 'location_assignments', 'add_sales',
    'packaging', 'delivery', 'delivery_report', 'delivered', 'out_bill', 'requisition_approval', 'invoice_lookup',
    'chalan_add_sales', 'chalan_packaging', 'chalan_delivery', 'chalan_delivered', 'chalan_return',
];

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
    ['delivery_report', 'delivery'],
];

export const permissionColumnsSql = (alias = 'p') =>
    PERMISSION_KEYS.map((key) => `COALESCE(${alias}.can_${key}, 0) AS can_${key}`).join(',\n                    ');

export const permissionsFromRow = (row) => PERMISSION_KEYS.filter((key) => Boolean(Number(row?.[`can_${key}`])));
