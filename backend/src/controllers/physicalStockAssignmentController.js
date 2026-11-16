import db from '../config/db.js';

// DMS Physical Stock assignments: the admin hands a company's stock count to one person.
// While the assignment is open, every item saved on Physical Stock is logged against it,
// so the page can show which items were updated (green) and which are still left (red).
//
// Assignees are staff rows (type 'staff': marketing or Bawarchee staff) or delivery_boys rows
// (type 'delivery_user': Packaging Staff / Delivery Boy). The person who
// assigns or saves can also be an admin or a delivery / packaging user, so actors are
// kept as (type, id): admin -> admins.id, delivery_user -> delivery_boys.id, staff -> staff.id.

const ASSIGNEE_TYPES = ['admin', 'delivery_user', 'staff'];

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const sendError = (res, error, fallback) => {
    if (!error.statusCode) console.error(fallback, error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : fallback });
};

const parseId = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isoDateOrNull = (value) => {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

// Today in India (YYYY-MM-DD), the day the assignment dates are compared with.
const todayIst = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const showDay = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const rangeText = (a) => (a.start_date === a.end_date
    ? showDay(a.start_date)
    : `${showDay(a.start_date)} to ${showDay(a.end_date)}`);

// upcoming / active / expired against today.
const windowState = (a, today = todayIst()) => {
    if (a.start_date && today < a.start_date) return 'upcoming';
    if (a.end_date && today > a.end_date) return 'expired';
    return 'active';
};

// From / To dates of an assignment (a single day: the same date twice).
const readDates = (body, { allowPastStart = false } = {}) => {
    const start = isoDateOrNull(body?.startDate);
    const end = isoDateOrNull(body?.endDate) || start;
    if (!start) throw httpError(400, 'Choose the From date.');
    if (end < start) throw httpError(400, 'The To date must be on or after the From date.');
    const today = todayIst();
    if (!allowPastStart && start < today) throw httpError(400, 'The From date cannot be in the past.');
    if (end < today) throw httpError(400, 'The To date cannot be in the past.');
    return { start, end };
};

// Assign ID: one per company + assigned dates. Staff assigned to the same company for the
// same From–To share it (also when added later); other dates get a new one. PSA000001, ...
async function assignCodeFor(companyId, start, end, exceptId = null) {
    const [same] = await db.execute(
        `SELECT assign_code FROM physical_stock_assignments
         WHERE company_id = ? AND status = 'open' AND start_date = ? AND end_date = ?
           AND assign_code IS NOT NULL AND id <> ?
         ORDER BY id LIMIT 1`,
        [companyId, start, end, exceptId || 0]
    );
    if (same.length) return same[0].assign_code;
    const [rows] = await db.execute(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(assign_code, 4) AS UNSIGNED)), 0) + 1 AS next
         FROM physical_stock_assignments WHERE assign_code LIKE 'PSA%'`
    );
    return `PSA${String(rows[0].next).padStart(6, '0')}`;
}

const DATE_COLUMNS_SQL = `DATE_FORMAT(a.start_date, '%Y-%m-%d') AS start_date,
           DATE_FORMAT(a.end_date, '%Y-%m-%d') AS end_date`;

// Who is making this request, in assignment terms.
export const actorOf = (user) => {
    if (!user) return null;
    if (user.role === 'admin') return { type: 'admin', id: parseId(user.id) };
    if (['packaging_staff', 'delivery_boy'].includes(user.role)) return { type: 'delivery_user', id: parseId(user.deliveryBoyId) };
    // Marketing staff and Bawarchee staff both live in the staff table.
    if (['bawarchee_staff', 'staff'].includes(user.role)) return { type: 'staff', id: parseId(user.staffId) };
    return null;
};

const nameOf = async (actor) => {
    if (!actor?.id) return null;
    // Admin accounts show as "Admin", not their login username (e.g. admin589).
    if (actor.type === 'admin') return 'Admin';
    const sql = {
        admin: 'SELECT username AS name FROM admins WHERE id = ?',
        delivery_user: 'SELECT name FROM delivery_boys WHERE id = ?',
        staff: 'SELECT name FROM staff WHERE id = ?',
    }[actor.type];
    if (!sql) return null;
    const [rows] = await db.execute(sql, [actor.id]);
    return rows[0]?.name || null;
};

// People who can be assigned a company's count:
//   - Marketing staff (staff.company_staff) linked to that company in staff_companies
//   - Any active Bawarchee staff
//   - Any active Packaging Staff / Delivery Boy
async function listAssignees(companyId) {
    const [marketing] = await db.execute(
        `SELECT DISTINCT s.id, s.name
         FROM staff s
         INNER JOIN staff_companies sc ON sc.staff_id = s.id
         WHERE s.is_active = 1 AND s.staff_category = 'company_staff' AND sc.company_id = ?
         ORDER BY s.name`,
        [companyId]
    );
    const [bawarchee] = await db.execute(
        `SELECT id, name
         FROM staff
         WHERE is_active = 1 AND staff_category = 'bawarchee_staff'
         ORDER BY name`
    );
    const [deliveryUsers] = await db.execute(
        `SELECT id, name, role
         FROM delivery_boys
         WHERE is_active = 1 AND role IN ('packaging_staff', 'delivery_boy')
         ORDER BY name`
    );
    return [
        ...marketing.map((r) => ({ type: 'staff', id: r.id, name: r.name, role: 'Marketing Staff' })),
        ...bawarchee.map((r) => ({ type: 'staff', id: r.id, name: r.name, role: 'Bawarchee Staff' })),
        ...deliveryUsers.map((r) => ({
            type: 'delivery_user',
            id: r.id,
            name: r.name,
            role: r.role === 'packaging_staff' ? 'Packaging Staff' : 'Delivery Boy',
        })),
    ];
}

async function resolveAssignee(body, companyId) {
    const type = String(body?.assigneeType || '').trim();
    const id = parseId(body?.assigneeId);
    if (!ASSIGNEE_TYPES.includes(type) || !id) throw httpError(400, 'Choose who to assign.');
    const match = (await listAssignees(companyId)).find((a) => a.type === type && Number(a.id) === id);
    if (!match) throw httpError(400, 'This person cannot be assigned. Choose from the list.');
    return match;
}

async function getAssignment(id) {
    const [rows] = await db.execute('SELECT * FROM physical_stock_assignments WHERE id = ?', [id]);
    return rows[0] || null;
}

export const getAssignees = async (req, res) => {
    try {
        const companyId = parseId(req.query.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        return res.json({ assignees: await listAssignees(companyId) });
    } catch (error) {
        return sendError(res, error, 'Unable to load people to assign.');
    }
};

// Open assignments (all companies), each with the items updated so far.
export const listAssignments = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT a.id, a.assign_code, a.company_id, c.name AS company_name, a.assignee_type, a.assignee_id, a.assignee_name,
                    ${DATE_COLUMNS_SQL}, a.note, a.status, a.assigned_by_name,
                    DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM physical_stock_assignments a
             LEFT JOIN companies c ON c.id = a.company_id
             WHERE a.status = 'open'
             ORDER BY a.created_at DESC, a.id DESC`
        );
        const ids = rows.map((r) => r.id);
        const itemsByAssignment = new Map(ids.map((id) => [id, []]));
        if (ids.length) {
            const [items] = await db.query(
                `SELECT assignment_id, product_erp_id, counted_by_name,
                        DATE_FORMAT(counted_at, '%Y-%m-%d %H:%i:%s') AS counted_at
                 FROM physical_stock_assignment_items
                 WHERE assignment_id IN (?)
                 ORDER BY counted_at ASC`,
                [ids]
            );
            items.forEach((item) => itemsByAssignment.get(item.assignment_id)?.push(item));
        }
        const actor = actorOf(req.user);
        return res.json({
            canAssign: req.user?.role === 'admin',
            assignments: rows.map((r) => ({
                ...r,
                window_state: windowState(r),
                items: itemsByAssignment.get(r.id) || [],
                is_mine: Boolean(actor && actor.type === r.assignee_type && actor.id === Number(r.assignee_id)),
            })),
        });
    } catch (error) {
        return sendError(res, error, 'Unable to load physical stock assignments.');
    }
};

// Assign page: every assignment (open and closed), newest first. Filters: status
// (open | done | cancelled | all), companyId, and from / to: assignments whose days
// overlap that range.
export const listAllAssignments = async (req, res) => {
    try {
        const where = [];
        const params = [];
        const status = String(req.query.status || 'all');
        if (['open', 'done', 'cancelled'].includes(status)) {
            where.push('a.status = ?');
            params.push(status);
        }
        const companyId = parseId(req.query.companyId);
        if (companyId) {
            where.push('a.company_id = ?');
            params.push(companyId);
        }
        const from = isoDateOrNull(req.query.from);
        const to = isoDateOrNull(req.query.to);
        if (from) {
            where.push('a.end_date >= ?');
            params.push(from);
        }
        if (to) {
            where.push('a.start_date <= ?');
            params.push(to);
        }
        const [rows] = await db.execute(
            `SELECT a.id, a.assign_code, a.company_id, c.name AS company_name,
                    a.assignee_type, a.assignee_id, a.assignee_name,
                    ${DATE_COLUMNS_SQL}, a.note, a.status, a.assigned_by_name, a.closed_by_name,
                    DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE_FORMAT(a.closed_at, '%Y-%m-%d %H:%i:%s') AS closed_at,
                    (SELECT COUNT(*) FROM physical_stock_assignment_items i WHERE i.assignment_id = a.id) AS items_updated
             FROM physical_stock_assignments a
             LEFT JOIN companies c ON c.id = a.company_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY a.created_at DESC, a.id DESC
             LIMIT 2000`,
            params
        );
        const today = todayIst();
        return res.json({
            assignments: rows.map((r) => ({
                ...r,
                items_updated: Number(r.items_updated) || 0,
                window_state: r.status === 'open' ? windowState(r, today) : r.status,
            })),
        });
    } catch (error) {
        return sendError(res, error, 'Unable to load physical stock assignments.');
    }
};

export const createAssignment = async (req, res) => {
    try {
        const companyId = parseId(req.body?.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        const [companies] = await db.execute('SELECT id FROM companies WHERE id = ?', [companyId]);
        if (!companies.length) throw httpError(404, 'Company not found.');

        // Several staff can count the same company: one assignment each, same dates and note.
        // body.assignees: [{ assigneeType, assigneeId }] (or a single assigneeType / assigneeId).
        const requested = Array.isArray(req.body?.assignees) && req.body.assignees.length
            ? req.body.assignees
            : [req.body];
        const assignees = [];
        for (const entry of requested) {
            const assignee = await resolveAssignee(entry, companyId);
            if (!assignees.some((a) => a.type === assignee.type && Number(a.id) === Number(assignee.id))) assignees.push(assignee);
        }
        const { start, end } = readDates(req.body);

        // Someone already counting this company keeps that assignment (reassign or extend it).
        const [open] = await db.execute(
            `SELECT assignee_type, assignee_id, assignee_name FROM physical_stock_assignments
             WHERE company_id = ? AND status = 'open'`,
            [companyId]
        );
        const already = assignees.filter((a) => open.some((o) => o.assignee_type === a.type && Number(o.assignee_id) === Number(a.id)));
        if (already.length) {
            throw httpError(409, `${already.map((a) => a.name).join(', ')} ${already.length === 1 ? 'is' : 'are'} already assigned to this company.`);
        }

        const by = actorOf(req.user);
        const byName = await nameOf(by);
        const note = String(req.body?.note || '').trim().slice(0, 500) || null;
        const code = await assignCodeFor(companyId, start, end);
        const ids = [];
        // All the ticked staff are saved together, or none (no half-made assignment).
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            for (const assignee of assignees) {
                const [result] = await connection.execute(
                    `INSERT INTO physical_stock_assignments
                        (company_id, assign_code, assignee_type, assignee_id, assignee_name, start_date, end_date, note,
                         assigned_by_type, assigned_by_id, assigned_by_name)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [companyId, code, assignee.type, assignee.id, assignee.name, start, end, note, by?.type || null, by?.id || null, byName]
                );
                ids.push(result.insertId);
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        return res.status(201).json({
            ids,
            assignCode: code,
            message: `${code}: physical stock assigned to ${assignees.map((a) => a.name).join(', ')} for ${rangeText({ start_date: start, end_date: end })}.`,
        });
    } catch (error) {
        return sendError(res, error, 'Unable to assign physical stock.');
    }
};

// Change the assignee, due date or note. Items already updated stay counted.
export const updateAssignment = async (req, res) => {
    try {
        const assignment = await getAssignment(parseId(req.params.id));
        if (!assignment) throw httpError(404, 'Assignment not found.');
        if (assignment.status !== 'open') throw httpError(400, 'This assignment is already closed.');
        const assignee = await resolveAssignee(req.body, assignment.company_id);
        const [others] = await db.execute(
            `SELECT id FROM physical_stock_assignments
             WHERE company_id = ? AND status = 'open' AND id <> ? AND assignee_type = ? AND assignee_id = ?`,
            [assignment.company_id, assignment.id, assignee.type, assignee.id]
        );
        if (others.length) throw httpError(409, `${assignee.name} is already assigned to this company.`);
        // An assignment already running may keep its past From date.
        const { start, end } = readDates(req.body, { allowPastStart: true });
        // New dates: the Assign ID of that company + dates (or a new one); same dates keep it.
        const [current] = await db.execute(
            `SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS s, DATE_FORMAT(end_date, '%Y-%m-%d') AS e
             FROM physical_stock_assignments WHERE id = ?`,
            [assignment.id]
        );
        const datesChanged = current[0]?.s !== start || current[0]?.e !== end;
        const code = datesChanged || !assignment.assign_code
            ? await assignCodeFor(assignment.company_id, start, end, assignment.id)
            : assignment.assign_code;
        await db.execute(
            `UPDATE physical_stock_assignments
             SET assignee_type = ?, assignee_id = ?, assignee_name = ?, start_date = ?, end_date = ?, note = ?, assign_code = ?
             WHERE id = ?`,
            [
                assignee.type, assignee.id, assignee.name,
                start, end, String(req.body?.note || '').trim().slice(0, 500) || null, code,
                assignment.id,
            ]
        );
        return res.json({ message: `${code}: assignment updated (${assignee.name}).` });
    } catch (error) {
        return sendError(res, error, 'Unable to update the assignment.');
    }
};

// Admin: mark done or cancel. The assignee: mark their own assignment done.
export const closeAssignment = async (req, res) => {
    try {
        const assignment = await getAssignment(parseId(req.params.id));
        if (!assignment) throw httpError(404, 'Assignment not found.');
        if (assignment.status !== 'open') throw httpError(400, 'This assignment is already closed.');
        const status = req.body?.status === 'cancelled' ? 'cancelled' : 'done';
        const actor = actorOf(req.user);
        const isAdmin = req.user?.role === 'admin';
        const isAssignee = Boolean(actor && actor.type === assignment.assignee_type && actor.id === Number(assignment.assignee_id));
        if (!isAdmin && !(isAssignee && status === 'done')) {
            throw httpError(403, 'Only the admin or the assigned person can close this assignment.');
        }
        await db.execute(
            `UPDATE physical_stock_assignments SET status = ?, closed_by_name = ?, closed_at = NOW() WHERE id = ?`,
            [status, await nameOf(actor), assignment.id]
        );
        const who = assignment.assign_code ? `${assignment.assign_code} (${assignment.assignee_name})` : 'Assignment';
        return res.json({ message: `${who} ${status === 'done' ? 'marked as done' : 'cancelled'}.` });
    } catch (error) {
        return sendError(res, error, 'Unable to close the assignment.');
    }
};

// Called after Physical Stock is saved: log the items against the company's open assignment.
// Never throws, so a logging problem can't undo a saved count.
export async function recordAssignmentProgress(companyId, productErpIds, user) {
    try {
        if (!parseId(companyId) || !productErpIds?.length) return;
        const [allOpen] = await db.execute(
            `SELECT id, assignee_type, assignee_id FROM physical_stock_assignments WHERE company_id = ? AND status = 'open'`,
            [companyId]
        );
        if (!allOpen.length) return;
        // Several staff on one company: a save counts on the saver's own assignment; a save by
        // anyone else (e.g. the admin) counts on every open one.
        const actor = actorOf(user);
        const own = allOpen.filter((a) => actor && a.assignee_type === actor.type && Number(a.assignee_id) === actor.id);
        const open = own.length ? own : allOpen;
        const name = await nameOf(actorOf(user));
        const keys = [...new Set(productErpIds.map((id) => String(id || '').trim()).filter(Boolean))];
        for (const { id } of open) {
            for (const erpId of keys) {
                await db.execute(
                    `INSERT INTO physical_stock_assignment_items (assignment_id, product_erp_id, counted_by_name, counted_at)
                     VALUES (?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE counted_by_name = VALUES(counted_by_name), counted_at = NOW()`,
                    [id, erpId, name]
                );
            }
        }
    } catch (error) {
        console.error('Unable to record physical stock assignment progress:', error);
    }
}

// ---- The assigned person's own access (/api/my-physical-stock) ----
// Lets someone count a company assigned to them even without the DMS / Physical Stock
// permission (e.g. marketing staff). Everything here is limited to their open assignments.

const OPEN_FOR_ACTOR_SQL = `
    SELECT a.id, a.assign_code, a.company_id, c.name AS company_name, c.type AS company_type, c.code AS company_code,
           a.assignee_type, a.assignee_id, a.assignee_name,
           ${DATE_COLUMNS_SQL}, a.note, a.status, a.assigned_by_name,
           DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM physical_stock_assignments a
    LEFT JOIN companies c ON c.id = a.company_id
    WHERE a.status = 'open' AND a.assignee_type = ? AND a.assignee_id = ?
    ORDER BY a.created_at DESC, a.id DESC`;

// Loads the signed-in person's open assignments into req.myAssignments.
export const loadMyAssignments = async (req, res, next) => {
    try {
        const actor = actorOf(req.user);
        if (!actor?.id) return res.status(403).json({ error: 'No physical stock is assigned to you.' });
        const [rows] = await db.execute(OPEN_FOR_ACTOR_SQL, [actor.type, actor.id]);
        req.myAssignments = rows;
        return next();
    } catch (error) {
        return sendError(res, error, 'Unable to load your physical stock assignments.');
    }
};

const ownsCompany = (req, companyId) => req.myAssignments.some((a) => Number(a.company_id) === Number(companyId));

export const requireAssignedCompanyQuery = (req, res, next) => (
    ownsCompany(req, req.query.companyId)
        ? next()
        : res.status(403).json({ error: 'This company is not assigned to you.' })
);

// Saving goes by DMS import id: it must belong to an assigned company, today must be one of
// the assigned days, and every count date must fall in them too.
export const requireAssignedImport = async (req, res, next) => {
    try {
        const dmsImportId = parseId(req.body?.dmsImportId);
        const [rows] = dmsImportId
            ? await db.execute('SELECT company_id FROM dms_stock_imports WHERE id = ?', [dmsImportId])
            : [[]];
        const assignment = rows.length
            ? req.myAssignments.find((a) => Number(a.company_id) === Number(rows[0].company_id))
            : null;
        if (!assignment) {
            return res.status(403).json({ error: 'This company is not assigned to you.' });
        }
        const today = todayIst();
        const state = windowState(assignment, today);
        if (state !== 'active') {
            return res.status(403).json({
                error: state === 'upcoming'
                    ? `You can fill this count from ${showDay(assignment.start_date)}.`
                    : `This count was assigned for ${rangeText(assignment)} only. Ask the admin to extend it.`,
            });
        }
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const outside = items.find((item) => {
            const day = isoDateOrNull(item?.stockUpdateDate) || today;
            return day < assignment.start_date || day > assignment.end_date || day > today;
        });
        if (outside) {
            return res.status(400).json({ error: `The count date must be within ${rangeText(assignment)} and not after today.` });
        }
        return next();
    } catch (error) {
        return sendError(res, error, 'Unable to check your assignment.');
    }
};

export const listMyAssignments = async (req, res) => {
    try {
        const ids = req.myAssignments.map((a) => a.id);
        const itemsByAssignment = new Map(ids.map((id) => [id, []]));
        if (ids.length) {
            const [items] = await db.query(
                `SELECT assignment_id, product_erp_id, counted_by_name,
                        DATE_FORMAT(counted_at, '%Y-%m-%d %H:%i:%s') AS counted_at
                 FROM physical_stock_assignment_items
                 WHERE assignment_id IN (?)
                 ORDER BY counted_at ASC`,
                [ids]
            );
            items.forEach((item) => itemsByAssignment.get(item.assignment_id)?.push(item));
        }
        return res.json({
            canAssign: false,
            assignments: req.myAssignments.map((a) => ({
                ...a,
                window_state: windowState(a),
                items: itemsByAssignment.get(a.id) || [],
                is_mine: true,
            })),
        });
    } catch (error) {
        return sendError(res, error, 'Unable to load your physical stock assignments.');
    }
};

export const markMyAssignmentDone = (req, res) => {
    req.body = { status: 'done' };
    return closeAssignment(req, res);
};
