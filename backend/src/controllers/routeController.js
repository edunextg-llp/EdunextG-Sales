import RouteModel, { normalizeRouteName } from '../models/routeModel.js';
import StaffModel from '../models/staffModel.js';
import { normalizeAreaName } from '../migrations/migrateAreas.js';

async function validateRouteBody(body) {
    const name = typeof body?.name === 'string' ? normalizeRouteName(body.name) : '';
    if (!name || name.length > 100) {
        return { error: 'Enter a route name between 1 and 100 characters, e.g. R 1.' };
    }
    const requested = Array.isArray(body?.areas) ? body.areas : [];
    const areaNames = [...new Set(requested.map(normalizeAreaName).filter(Boolean))];
    if (!areaNames.length) {
        return { error: 'Select at least one area for the route.' };
    }
    const known = new Set((await StaffModel.getAreaDirectory()).map((area) => area.name));
    const unknown = areaNames.filter((areaName) => !known.has(areaName));
    if (unknown.length) {
        return { error: `These areas do not exist: ${unknown.join(', ')}. Add them in Create Area first.` };
    }
    return { name, areaNames };
}

export const getRoutes = async (req, res) => {
    try {
        return res.json(await RouteModel.getAll());
    } catch (error) {
        console.error('Error loading routes:', error);
        return res.status(500).json({ error: 'Unable to load routes.' });
    }
};

export const createRoute = async (req, res) => {
    try {
        const input = await validateRouteBody(req.body);
        if (input.error) return res.status(400).json({ error: input.error });
        return res.status(201).json(await RouteModel.save(input));
    } catch (error) {
        if (error.code === 'AREA_IN_OTHER_ROUTE') return res.status(409).json({ error: error.message });
        if (error.code === 'ER_DUP_ENTRY' && /uq_route_areas_area/.test(error.message)) return res.status(409).json({ error: 'One of these areas is already in another route. Remove it from that route first.' });
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A route with this name already exists. Use a different name, such as R 2.' });
        console.error('Error creating route:', error);
        return res.status(500).json({ error: 'Unable to create route.' });
    }
};

export const updateRoute = async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid route.' });
    try {
        const input = await validateRouteBody(req.body);
        if (input.error) return res.status(400).json({ error: input.error });
        const route = await RouteModel.save({ id, ...input });
        if (!route) return res.status(404).json({ error: 'Route not found.' });
        return res.json(route);
    } catch (error) {
        if (error.code === 'AREA_IN_OTHER_ROUTE') return res.status(409).json({ error: error.message });
        if (error.code === 'ER_DUP_ENTRY' && /uq_route_areas_area/.test(error.message)) return res.status(409).json({ error: 'One of these areas is already in another route. Remove it from that route first.' });
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A route with this name already exists. Use a different name, such as R 2.' });
        console.error('Error updating route:', error);
        return res.status(500).json({ error: 'Unable to update route.' });
    }
};

export const deleteRoute = async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid route.' });
    try {
        if (!await RouteModel.delete(id)) return res.status(404).json({ error: 'Route not found.' });
        return res.json({ message: 'Route deleted successfully.' });
    } catch (error) {
        console.error('Error deleting route:', error);
        return res.status(500).json({ error: 'Unable to delete route.' });
    }
};
