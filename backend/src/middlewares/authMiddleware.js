import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';

export const verifyTokenMiddleware = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token.split(' ')[1], JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
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
    const ownOutletPath = path.match(/^\/(\d+)\/outlets-by-day$/);
    const allowed =
        path.startsWith('/purchase-requisitions')
        || (method === 'GET' && path === '/current-stock')
        || (
            method === 'GET'
            && ownOutletPath
            && Number(ownOutletPath[1]) === Number(req.user.staffId)
        );

    if (!allowed) {
        return res.status(403).json({ error: 'Staff access is limited to Purchase Requisition.' });
    }
    return next();
};

export const enforceManagedUserApiScope = (req, res, next) => {
    if (!['packaging_staff', 'delivery_boy'].includes(req.user?.role)) return next();

    const permissions = new Set(Array.isArray(req.user.permissions) ? req.user.permissions : []);
    const path = req.path;
    const method = req.method.toUpperCase();
    const hasDms = permissions.has('dms');

    let allowed = false;
    if (path === '/reports' || path === '/purchase-reports' || path === '/' || path === '/search') {
        allowed = method === 'GET' && (
            permissions.has('dashboard')
            || permissions.has('add_outlet')
            || permissions.has('location_assignments')
            || permissions.has('add_sales')
            || permissions.has('update_payment')
            || permissions.has('packaging')
            || permissions.has('delivery')
            || permissions.has('delivered')
            || permissions.has('out_bill')
        );
    } else if (path === '/companies') {
        allowed = method === 'GET' && (hasDms || permissions.has('update_payment') || permissions.has('location_assignments'));
    } else if (path.startsWith('/dms-stock')) {
        allowed = hasDms && permissions.has('item_list');
    } else if (path.startsWith('/purchase-sellers')) {
        allowed = hasDms && (
            permissions.has('add_seller')
            || (method === 'GET' && (permissions.has('add_item') || permissions.has('item_list')))
        );
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
        allowed = permissions.has('add_outlet') || permissions.has('add_sales') || permissions.has('location_assignments');
    } else if (/^\/\d+$/.test(path)) {
        allowed = method === 'GET' && permissions.has('location_assignments');
    } else if (/^\/\d+\/sales$/.test(path)) {
        allowed = permissions.has('add_sales');
    } else if (path === '/sales/by-date' || path === '/sales/lookup' || /^\/\d+\/sales-by-date$/.test(path)) {
        allowed = permissions.has('add_sales') || permissions.has('update_payment')
            || permissions.has('packaging') || permissions.has('delivery') || permissions.has('delivered');
    } else if (path === '/sales/cancelled') {
        allowed = method === 'GET' && permissions.has('delivered');
    } else if (/^\/sales\/\d+\/packaging$/.test(path)) {
        allowed = permissions.has('packaging') || permissions.has('delivery') || permissions.has('delivered');
    } else if (/^\/sales\/\d+\/status-history$/.test(path)) {
        allowed = method === 'GET' && (permissions.has('packaging') || permissions.has('delivery'));
    } else if (/^\/sales\/\d+\/payment$/.test(path) || /^\/sales\/\d+\/payments(?:\/\d+)?$/.test(path)) {
        allowed = permissions.has('update_payment');
    } else if (/^\/sales\/\d+\/cancel-log$/.test(path)) {
        allowed = permissions.has('update_payment');
    } else if (/^\/purchase-requisitions\/[^/]+$/.test(path)) {
        allowed = (method === 'GET' && permissions.has('add_sales'))
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
