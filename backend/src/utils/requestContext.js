import { AsyncLocalStorage } from 'node:async_hooks';
import db from '../config/db.js';

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

/**
 * Who is making the current request, with a display name and login ID, for the
 * updated_by_* columns on payments:
 *  - admin        -> name "Admin", code = admin username
 *  - staff        -> staff name, code = staff login ID
 *  - delivery     -> delivery / packaging staff name, code = delivery login ID
 * Fields are null when there is no logged-in user (scripts, schedulers).
 */
export async function resolveCurrentActor() {
    const req = storage.getStore()?.req;
    const user = req?.user;
    const actor = currentActor();
    const result = { type: actor.type, id: actor.id, role: user?.role || actor.type, name: null, employeeCode: user?.loginId || null };
    if (!actor.type) return result;
    try {
        if (actor.type === 'admin') {
            const [rows] = await db.execute('SELECT username FROM admins WHERE id = ? LIMIT 1', [actor.id]);
            return { ...result, role: 'admin', name: 'Admin', employeeCode: rows[0]?.username || result.employeeCode };
        }
        if (actor.type === 'staff') {
            const [rows] = await db.execute('SELECT name, login_id FROM staff WHERE id = ? LIMIT 1', [actor.id]);
            return { ...result, name: rows[0]?.name || user?.username || null, employeeCode: rows[0]?.login_id || result.employeeCode };
        }
        const [rows] = await db.execute('SELECT name, delivery_login_id FROM delivery_boys WHERE id = ? LIMIT 1', [actor.id]);
        return { ...result, name: rows[0]?.name || user?.username || null, employeeCode: rows[0]?.delivery_login_id || result.employeeCode };
    } catch (error) {
        console.error('Could not resolve the current user:', error);
        return result;
    }
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
