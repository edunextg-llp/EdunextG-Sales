import db from '../config/db.js';
import { normalizeAreaName } from '../migrations/migrateAreas.js';

export const normalizeRouteName = (name) => normalizeAreaName(name);

class RouteModel {
    static async getAll() {
        const [routes] = await db.execute('SELECT id, name, created_at, updated_at FROM routes');
        const [links] = await db.execute('SELECT route_id, area_name FROM route_areas ORDER BY area_name');
        const areasByRoute = new Map();
        for (const link of links) {
            if (!areasByRoute.has(link.route_id)) areasByRoute.set(link.route_id, []);
            areasByRoute.get(link.route_id).push(link.area_name);
        }
        return routes
            .map((route) => ({ ...route, areas: areasByRoute.get(route.id) || [] }))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }

    static async save({ id = null, name, areaNames }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            let routeId = id;
            if (routeId) {
                const [result] = await connection.execute('UPDATE routes SET name = ? WHERE id = ?', [name, routeId]);
                if (!result.affectedRows) {
                    await connection.rollback();
                    return null;
                }
                await connection.execute('DELETE FROM route_areas WHERE route_id = ?', [routeId]);
            } else {
                const [result] = await connection.execute('INSERT INTO routes (name) VALUES (?)', [name]);
                routeId = result.insertId;
            }
            for (const areaName of areaNames) {
                await connection.execute('INSERT INTO route_areas (route_id, area_name) VALUES (?, ?)', [routeId, areaName]);
            }
            await connection.commit();
            return { id: routeId, name, areas: areaNames };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async delete(id) {
        const [result] = await db.execute('DELETE FROM routes WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    static async removeArea(areaName) {
        await db.execute('DELETE FROM route_areas WHERE area_name = ?', [areaName]);
    }
}

export default RouteModel;
