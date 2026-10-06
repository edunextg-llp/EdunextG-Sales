import jwt from 'jsonwebtoken';
import UserModel from '../models/userModel.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';

export const verifyTokenMiddleware = async (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ error: 'Access denied. No token provided.' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token.split(' ')[1], JWT_SECRET);
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // Admin tokens carry a session version (tv). If the admin used
    // "Logout from all devices", the stored version has moved on and
    // every older token is rejected.
    if (decoded.role === 'admin') {
        try {
            const currentVersion = await UserModel.getTokenVersion(decoded.id);
            if (currentVersion === null || Number(decoded.tv ?? 0) !== currentVersion) {
                return res.status(401).json({ error: 'Session has been logged out. Please sign in again.' });
            }
        } catch (error) {
            console.error('Admin session check failed:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Packaging Staff / Delivery Boy permissions are read fresh on every request,
    // so granting or removing a permission works without logging in again.
    if (['packaging_staff', 'delivery_boy'].includes(decoded.role) && decoded.deliveryBoyId) {
        try {
            const current = await DeliveryBoyModel.getCurrentPermissions(decoded.deliveryBoyId);
            if (!current?.isActive) {
                return res.status(401).json({ error: 'This account is inactive. Please contact the admin.' });
            }
            decoded.permissions = current.permissions;
        } catch (error) {
            console.error('Permission check failed:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    req.user = decoded;
    return next();
};

export const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
};

export const requirePermission = (permission) => (req, res, next) => {
    if (req.user?.role === 'admin' || req.user?.permissions?.includes(permission)) {
        return next();
    }
    return res.status(403).json({ error: 'You do not have permission to perform this action.' });
};

export const requireAnyPermission = (...requiredPermissions) => (req, res, next) => {
    if (
        req.user?.role === 'admin'
        || requiredPermissions.some((permission) => req.user?.permissions?.includes(permission))
    ) {
        return next();
    }
    return res.status(403).json({ error: 'You do not have permission to perform this action.' });
};

export const enforceStaffApiScope = (req, res, next) => {
    if (req.user?.role !== 'staff') return next();

    const path = req.path;
    const method = req.method.toUpperCase();
    const ownStaffPath = path.match(/^\/(\d+)(?:\/(locations|outlets-by-day|all-counters|counters|outlets-upload))?$/);
    const isOwnStaffPath = ownStaffPath && Number(ownStaffPath[1]) === Number(req.user.staffId);
    const ownOperation = ownStaffPath?.[2] || 'details';
    const allowed =
        path.startsWith('/purchase-requisitions')
        || (method === 'GET' && path === '/current-stock')
        || (method === 'GET' && path === '/outlets-template')
        || (isOwnStaffPath && method === 'GET' && ['details', 'locations', 'outlets-by-day', 'all-counters'].includes(ownOperation))
        || (isOwnStaffPath && method === 'PUT' && ownOperation === 'locations')
        || (isOwnStaffPath && method === 'POST' && ['counters', 'outlets-upload'].includes(ownOperation))
        || (/^\/counter\/\d+$/.test(path) && ['PUT', 'DELETE'].includes(method));

    if (!allowed) {
        return res.status(403).json({ error: 'You can manage locations and outlets only for your own employee account.' });
    }
    return next();
};

export const enforceManagedUserApiScope = (req, res, next) => {
    if (!['packaging_staff', 'delivery_boy'].includes(req.user?.role)) return next();

    const permissions = new Set(Array.isArray(req.user.permissions) ? req.user.permissions : []);
    const path = req.path;
    const method = req.method.toUpperCase();
    const hasDms = permissions.has('dms');
    // DMS pages need the DMS menu plus that page's own permission.
    const dms = (...keys) => hasDms && keys.some((key) => permissions.has(key));
    const isGet = method === 'GET';

    let allowed = false;
    if (path === '/reports' || path === '/reports/payments' || path === '/reports/payments/export' || path === '/purchase-reports' || path === '/' || path === '/search') {
        allowed = (method === 'GET' && (
            permissions.has('dashboard')
            || permissions.has('create_staff')
            || permissions.has('add_outlet')
            || permissions.has('location_assignments')
            || permissions.has('add_sales')
            || permissions.has('update_payment')
            || permissions.has('packaging')
            || permissions.has('delivery')
            || permissions.has('delivered')
            || permissions.has('out_bill')
            || permissions.has('delivery_report')
            || dms('item_list', 'expiry_list', 'damage_list')
        )) || (path === '/' && method === 'POST' && permissions.has('create_staff'));
    } else if (path === '/companies') {
        // Company dropdowns appear on the Dashboard and Bank Deposit screens too.
        allowed = method === 'GET' && (
            hasDms
            || permissions.has('dashboard')
            || permissions.has('bank_deposit')
            || permissions.has('update_payment')
            || permissions.has('create_staff')
            || permissions.has('location_assignments')
        );
    } else if (path.startsWith('/dms-stock')) {
        allowed = dms('item_list')
            || (isGet && dms('purchase_history', 'current_stock', 'expiry_items', 'expiry_list', 'damage_list'));
    } else if (path.startsWith('/expiry-list')) {
        allowed = dms('expiry_list');
    } else if (path.startsWith('/damage-list')) {
        allowed = dms('damage_list');
    } else if (path.startsWith('/physical-stock')) {
        allowed = dms('physical_stock');
    } else if (path === '/current-stock') {
        allowed = isGet && dms('current_stock');
    } else if (path === '/purchases' || path.startsWith('/purchases/')) {
        allowed = dms('purchase');
    } else if (path.startsWith('/purchase-sellers')) {
        allowed = dms('add_seller')
            || (isGet && dms('add_item', 'item_list', 'purchase_history', 'expiry_list', 'damage_list', 'purchase'));
    } else if (path.startsWith('/seller-items')) {
        allowed = hasDms && (
            permissions.has('add_item')
            || (method === 'GET' && permissions.has('item_list'))
        );
    } else if (path === '/bank-deposits' || path.startsWith('/bank-deposits/')) {
        allowed = permissions.has('bank_deposit');
    } else if (path.startsWith('/credits/')) {
        allowed = permissions.has('out_bill');
    } else if (/^\/\d+\/counters$/.test(path) || /^\/counter\/\d+$/.test(path)) {
        allowed = permissions.has('add_outlet');
    } else if (path === '/outlets-export' || path === '/outlets-template' || /^\/\d+\/outlets-upload$/.test(path)) {
        allowed = permissions.has('add_outlet');
    } else if (/^\/\d+\/(locations|outlets-by-date|all-counters|outlets-by-day|next-bill-number)$/.test(path)) {
        allowed = permissions.has('add_outlet') || permissions.has('add_sales') || permissions.has('location_assignments')
            || dms('item_list', 'expiry_list', 'damage_list');
    } else if (/^\/\d+$/.test(path)) {
        allowed = (method === 'GET' && (permissions.has('create_staff') || permissions.has('location_assignments')))
            || (method === 'PUT' && permissions.has('create_staff'));
    } else if (/^\/\d+\/(toggle-active|generate-credentials)$/.test(path)) {
        allowed = permissions.has('create_staff');
    } else if (/^\/\d+\/sales$/.test(path)) {
        allowed = permissions.has('add_sales');
    } else if (path === '/sales/lookup') {
        allowed = method === 'GET' && permissions.has('invoice_lookup');
    } else if (path === '/sales/by-date' || /^\/\d+\/sales-by-date$/.test(path)) {
        allowed = permissions.has('add_sales') || permissions.has('update_payment')
            || permissions.has('packaging') || permissions.has('delivery') || permissions.has('delivered')
            || permissions.has('delivery_report');
    } else if (path === '/routes') {
        allowed = method === 'GET' && (permissions.has('delivery') || permissions.has('delivery_report'));
    } else if (path === '/sales/suspense') {
        allowed = method === 'POST' && (permissions.has('delivery') || permissions.has('delivery_report'));
    } else if (path === '/sales/move-to-delivery') {
        allowed = method === 'POST' && permissions.has('update_payment');
    } else if (path === '/sales/cancelled') {
        allowed = method === 'GET' && permissions.has('delivered');
    } else if (/^\/sales\/\d+\/packaging$/.test(path)) {
        allowed = permissions.has('packaging') || permissions.has('delivery') || permissions.has('delivered')
            || permissions.has('delivery_report');
    } else if (/^\/sales\/\d+\/packaging-remarks$/.test(path)) {
        allowed = permissions.has('packaging') || permissions.has('delivery') || permissions.has('delivered');
    } else if (/^\/sales\/\d+\/status-history$/.test(path)) {
        allowed = method === 'GET' && (permissions.has('packaging') || permissions.has('delivery'));
    } else if (/^\/sales\/\d+\/payment$/.test(path) || /^\/sales\/\d+\/payments(?:\/\d+)?$/.test(path)) {
        allowed = permissions.has('update_payment');
    } else if (/^\/sales\/\d+\/cancel-log$/.test(path)) {
        allowed = permissions.has('update_payment');
    } else if (/^\/sales\/\d+\/items$/.test(path)) {
        allowed = permissions.has('update_payment') || (isGet && permissions.has('delivery_report'));
    } else if (/^\/purchase-requisitions\/[^/]+\/status$/.test(path)) {
        // Approve / cancel button on Requisition Approvals.
        allowed = method === 'PUT' && permissions.has('requisition_approval');
    } else if (/^\/purchase-requisitions\/[^/]+$/.test(path)) {
        allowed = (method === 'GET' && (permissions.has('add_sales') || permissions.has('requisition_approval')))
            || (method === 'PUT' && permissions.has('requisition_approval'));
    } else if (path === '/purchase-requisitions') {
        allowed = permissions.has('requisition_approval');
    } else if (/^\/sales\/\d+$/.test(path)) {
        allowed = permissions.has('add_sales');
    }

    if (!allowed) {
        return res.status(403).json({ error: 'You do not have permission to use this feature.' });
    }
    return next();
};
