import AuditLogModel from '../models/auditLogModel.js';

export const getActivityLogs = async (req, res) => {
    try {
        const logs = await AuditLogModel.getRecent(req.query.limit);
        return res.status(200).json(logs);
    } catch (error) {
        console.error('Unable to fetch staff activity logs:', error);
        return res.status(500).json({ error: 'Unable to fetch staff activity logs.' });
    }
};
