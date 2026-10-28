import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Remembers the current HTTP request for the duration of its handling, so data-layer code
 * (status history, cancellations) can record WHO made a change without threading `req`
 * through every function.
 */
const storage = new AsyncLocalStorage();

export function requestContextMiddleware(req, _res, next) {
    storage.run({ req }, next);
}

/**
 * The person making the current request:
 *  - admin           (web admin login)                -> admins.id
 *  - staff           (marketing staff: web or app)    -> staff.id
 *  - delivery_boy    (delivery / packaging staff)     -> delivery_boys.id
 * Returns { type: null, id: null } outside a request (scripts, schedulers).
 */
export function currentActor() {
    const req = storage.getStore()?.req;
    if (!req) return { type: null, id: null };
    const user = req.user;
    if (user?.role === 'admin' && Number.isInteger(Number(user.id))) return { type: 'admin', id: Number(user.id) };
    if (user?.role === 'staff' && Number(user.staffId || user.id)) return { type: 'staff', id: Number(user.staffId || user.id) };
    if ((user?.role === 'delivery_boy' || user?.role === 'packaging_staff') && Number(user.deliveryBoyId || user.id)) {
        return { type: 'delivery_boy', id: Number(user.deliveryBoyId || user.id) };
    }
    if (Number.isInteger(req.deliveryBoyId)) return { type: 'delivery_boy', id: req.deliveryBoyId };
    if (Number.isInteger(req.staffId)) return { type: 'staff', id: req.staffId };
    return { type: null, id: null };
}

/** [type, id] for SQL parameters. */
export function actorParams() {
    const actor = currentActor();
    return [actor.type, actor.id];
}

/**
 * SQL fragment resolving a stored actor to a display name and role.
 * `alias` is the table alias holding `<prefix>_type` and `<prefix>_id` columns.
 */
export function actorNameSql(alias, prefix) {
    const type = `${alias}.${prefix}_type`;
    const id = `${alias}.${prefix}_id`;
    return {
        joins: `
             LEFT JOIN admins ${prefix}_admin ON ${type} = 'admin' AND ${prefix}_admin.id = ${id}
             LEFT JOIN staff ${prefix}_staff ON ${type} = 'staff' AND ${prefix}_staff.id = ${id}
             LEFT JOIN delivery_boys ${prefix}_db ON ${type} = 'delivery_boy' AND ${prefix}_db.id = ${id}`,
        columns: `
             COALESCE(${prefix}_admin.username, ${prefix}_staff.name, ${prefix}_db.name) AS ${prefix}_name,
             CASE ${type}
                 WHEN 'admin' THEN 'Admin'
                 WHEN 'staff' THEN 'Marketing staff'
                 WHEN 'delivery_boy' THEN IF(${prefix}_db.role = 'packaging_staff', 'Packaging staff', 'Delivery boy')
                 ELSE NULL
             END AS ${prefix}_role`,
    };
}
