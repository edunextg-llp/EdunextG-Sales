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
