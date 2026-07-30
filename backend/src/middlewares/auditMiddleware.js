import AuditLogModel from '../models/auditLogModel.js';

const AUDITED_ROUTES = [
    { pattern: /^\/bank-deposits(?:\/(\d+))?$/, entityType: 'bank_deposit', methods: ['POST', 'PUT', 'DELETE'] },
    { pattern: /^\/(\d+)\/counters$/, entityType: 'outlet', methods: ['POST'] },
    { pattern: /^\/counter\/(\d+)$/, entityType: 'outlet', methods: ['PUT', 'DELETE'] },
    { pattern: /^\/(\d+)\/sales$/, entityType: 'sale', methods: ['POST'] },
    { pattern: /^\/sales\/(\d+)$/, entityType: 'sale', methods: ['PUT', 'DELETE'] },
    { pattern: /^\/sales\/(\d+)\/payment$/, entityType: 'payment', methods: ['PUT'] },
    { pattern: /^\/sales\/(\d+)\/payments(?:\/(\d+))?$/, entityType: 'payment', methods: ['POST', 'PUT', 'DELETE'] },
    { pattern: /^\/sales\/(\d+)\/cancel-log$/, entityType: 'payment_cancellation', methods: ['POST'] },
];

const ACTIONS = { POST: 'created', PUT: 'updated', DELETE: 'deleted' };

export const auditStaffChanges = (req, res, next) => {
    const method = req.method.toUpperCase();
    const route = AUDITED_ROUTES.find((candidate) =>
        candidate.methods.includes(method) && candidate.pattern.test(req.path)
    );
    if (!route) return next();

    const match = req.path.match(route.pattern);
    res.on('finish', () => {
        if (res.statusCode < 200 || res.statusCode >= 400) return;
        const entityId = match?.[2] || match?.[1] || null;
        AuditLogModel.create({
            actor: req.user,
            action: ACTIONS[method],
            entityType: route.entityType,
            entityId,
            details: { method, path: req.path },
        }).catch((error) => console.error('Unable to save staff activity log:', error));
    });
    return next();
};
