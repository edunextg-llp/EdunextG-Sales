import db from '../config/db.js';

const sanitizeDetails = (details = {}) => {
    const blockedKeys = new Set(['password', 'passcode', 'token', 'refreshToken']);
    return Object.fromEntries(
        Object.entries(details).filter(([key]) => !blockedKeys.has(key))
    );
};

class AuditLogModel {
    static async create({ actor, action, entityType, entityId = null, details = {} }) {
        await db.execute(
            `INSERT INTO staff_activity_logs (
                actor_id, actor_role, action, entity_type, entity_id, details
             ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
                actor?.id || null,
                actor?.role || 'unknown',
                action,
                entityType,
                entityId ? String(entityId) : null,
                JSON.stringify(sanitizeDetails(details)),
            ]
        );
    }

    static async getRecent(limit = 100) {
        const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
        const [rows] = await db.query(
            `SELECT al.id, al.action, al.entity_type, al.entity_id, al.details,
                    al.actor_role, al.created_at,
                    CASE
                        WHEN al.actor_role IN ('packaging_staff', 'delivery_boy') THEN dboy.name
                        WHEN al.actor_role = 'staff' THEN s.name
                        WHEN al.actor_role = 'admin' THEN COALESCE(u.username, u.email, 'Admin')
                        ELSE 'Unknown user'
                    END AS staff_name
             FROM staff_activity_logs al
             LEFT JOIN delivery_boys dboy
                    ON al.actor_role IN ('packaging_staff', 'delivery_boy')
                   AND dboy.id = al.actor_id
             LEFT JOIN staff s
                    ON al.actor_role = 'staff' AND s.id = al.actor_id
             LEFT JOIN users u
                    ON al.actor_role = 'admin' AND u.id = al.actor_id
             ORDER BY al.created_at DESC, al.id DESC
             LIMIT ${safeLimit}`
        );
        return rows.map((row) => ({
            ...row,
            details: typeof row.details === 'string' ? JSON.parse(row.details || '{}') : row.details,
        }));
    }
}

export default AuditLogModel;
