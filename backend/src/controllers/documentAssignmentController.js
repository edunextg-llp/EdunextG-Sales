import db from '../config/db.js';
import { uploadBufferToCloudinary, isCloudinaryConfigured } from '../utils/cloudinary.js';

export async function create(req, res) {
  try {
    const { workDate, type, companyId, area, assignTo } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(workDate || ''))) return res.status(400).json({ error: 'Choose a valid date.' });
    if (!['pending', 'printing', 'others'].includes(type) || !companyId || !area || !assignTo || !req.file) return res.status(400).json({ error: 'Complete all fields and upload a document.' });
    const [kind, idText] = String(assignTo).split(':');
    const assigneeId = Number(idText);
    if (!['staff', 'delivery_boy'].includes(kind) || !Number.isInteger(assigneeId)) return res.status(400).json({ error: 'Choose a valid person.' });
    const table = kind === 'delivery_boy' ? 'delivery_boys' : 'staff';
    const categoryCondition = kind === 'staff' ? " AND staff_category='company_staff'" : '';
    const [eligible] = await db.query(`SELECT id FROM ${table} WHERE id=? AND is_active=1${categoryCondition} LIMIT 1`, [assigneeId]);
    if (!eligible.length) return res.status(400).json({ error: 'Choose an active person.' });
    if (!isCloudinaryConfigured()) return res.status(503).json({ error: 'Document storage is not configured.' });
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'staff-assignments', uploadOptions: { resource_type: 'auto', public_id: `assignment_${Date.now()}` } });
    const [result] = await db.query(`INSERT INTO document_assignments (work_date, assignment_type, company_id, area, document_url, document_name, assignee_type, assignee_id, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?)`, [workDate, type, Number(companyId), area, uploaded.secure_url, req.file.originalname, kind, assigneeId, req.user?.id || null]);
    return res.status(201).json({ id: result.insertId, message: 'Document assigned.' });
  } catch (error) {
    console.error('Create document assignment failed:', error);
    return res.status(500).json({ error: 'Unable to assign document.' });
  }
}

export async function listAdmin(_req, res) {
  try {
    const [rows] = await db.query(`SELECT a.*, c.name AS company_name, COALESCE(s.name, d.name) AS assignee_name
      FROM document_assignments a LEFT JOIN companies c ON c.id=a.company_id
      LEFT JOIN staff s ON a.assignee_type='staff' AND s.id=a.assignee_id
      LEFT JOIN delivery_boys d ON a.assignee_type='delivery_boy' AND d.id=a.assignee_id
      ORDER BY a.work_date DESC, a.created_at DESC LIMIT 200`);
    return res.json(rows);
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Unable to load assignments.' }); }
}

export async function listMine(req, res) {
  try {
    const [rows] = await db.query(`SELECT a.*, c.name AS company_name FROM document_assignments a
      LEFT JOIN companies c ON c.id=a.company_id WHERE a.assignee_type='staff' AND a.assignee_id=?
      ORDER BY a.work_date DESC, a.created_at DESC`, [req.staffId]);
    return res.json(rows);
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Unable to load assigned documents.' }); }
}

export async function updateMine(req, res) {
  return updateAssignment(req, res, 'staff', req.staffId);
}

export async function listDeliveryMine(req, res) {
  try {
    const [rows] = await db.query(`SELECT a.*, c.name AS company_name FROM document_assignments a
      LEFT JOIN companies c ON c.id=a.company_id WHERE a.assignee_type='delivery_boy' AND a.assignee_id=?
      ORDER BY a.work_date DESC, a.created_at DESC`, [req.deliveryBoyId]);
    return res.json(rows);
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Unable to load assigned documents.' }); }
}

export async function updateDeliveryMine(req, res) {
  return updateAssignment(req, res, 'delivery_boy', req.deliveryBoyId);
}

async function updateAssignment(req, res, type, assigneeId) {
  const status = String(req.body?.status || '');
  if (!['done', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Choose Done or Cancel.' });
  try {
    const [result] = await db.query(`UPDATE document_assignments SET status=?, completed_at=NOW() WHERE id=? AND assignee_type=? AND assignee_id=? AND status='assigned'`, [status, req.params.id, type, assigneeId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Assignment not found or already closed.' });
    return res.json({ message: 'Assignment updated.', status });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Unable to update assignment.' }); }
}
