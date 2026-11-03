import db from '../config/db.js';
import { uploadBufferToCloudinary, isCloudinaryConfigured, cloudinaryFileLinks } from '../utils/cloudinary.js';

export async function create(req, res) {
  try {
    const { workDate, type, companyId, marketingStaffId, area, assignTo } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(workDate || ''))) return res.status(400).json({ error: 'Choose a valid date.' });
    if (!['pending', 'printing', 'add_sales', 'pending_works', 'others'].includes(type) || !companyId || !marketingStaffId || !area || !assignTo || !req.file) return res.status(400).json({ error: 'Complete all fields and upload a document.' });
    const remarks = String(req.body?.remarks || '').trim();
    if (remarks.length > 500) return res.status(400).json({ error: 'Remarks must be 500 characters or less.' });
    const [marketingPerson] = await db.query(`SELECT s.id FROM staff s
      WHERE s.id=? AND s.is_active=1 AND (s.staff_category IS NULL OR s.staff_category='company_staff')
        AND (s.company_id=? OR EXISTS (SELECT 1 FROM staff_companies sc WHERE sc.staff_id=s.id AND sc.company_id=?)) LIMIT 1`,
    [Number(marketingStaffId), Number(companyId), Number(companyId)]);
    if (!marketingPerson.length) return res.status(400).json({ error: 'Choose an active marketing person from this company.' });
    const [kind, idText] = String(assignTo).split(':');
    const assigneeId = Number(idText);
    if (!['staff', 'delivery_boy'].includes(kind) || !Number.isInteger(assigneeId)) return res.status(400).json({ error: 'Choose a valid person.' });
    const table = kind === 'delivery_boy' ? 'delivery_boys' : 'staff';
    const categoryCondition = kind === 'staff' ? " AND staff_category='company_staff'" : '';
    const [eligible] = await db.query(`SELECT id FROM ${table} WHERE id=? AND is_active=1${categoryCondition} LIMIT 1`, [assigneeId]);
    if (!eligible.length) return res.status(400).json({ error: 'Choose an active person.' });
    if (!isCloudinaryConfigured()) return res.status(503).json({ error: 'Document storage is not configured.' });
    // Images keep 'auto'; PDFs and other documents are stored as 'raw' so Cloudinary's
    // "block PDF delivery" setting cannot stop them from opening.
    const isImage = String(req.file.mimetype || '').startsWith('image/');
    const extension = (String(req.file.originalname || '').match(/\.([a-z0-9]{1,8})$/i)?.[1] || (req.file.mimetype === 'application/pdf' ? 'pdf' : '')).toLowerCase();
    const publicId = `assignment_${Date.now()}${!isImage && extension ? `.${extension}` : ''}`;
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'staff-assignments', resourceType: isImage ? 'auto' : 'raw', uploadOptions: { public_id: publicId } });
    const [result] = await db.query(`INSERT INTO document_assignments (work_date, assignment_type, company_id, marketing_staff_id, area, document_url, document_name, assignee_type, assignee_id, status, created_by, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?)`, [workDate, type, Number(companyId), Number(marketingStaffId), area, uploaded.secure_url, req.file.originalname, kind, assigneeId, req.user?.id || null, remarks || null]);
    return res.status(201).json({ id: result.insertId, message: 'Document assigned.' });
  } catch (error) {
    console.error('Create document assignment failed:', error);
    return res.status(500).json({ error: 'Unable to assign document.' });
  }
}

export async function listAdmin(_req, res) {
  try {
    const [rows] = await db.query(`SELECT a.*, DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date, c.name AS company_name, COALESCE(s.name, d.name) AS assignee_name, m.name AS marketing_staff_name
      FROM document_assignments a LEFT JOIN companies c ON c.id=a.company_id
      LEFT JOIN staff m ON m.id=a.marketing_staff_id
      LEFT JOIN staff s ON a.assignee_type='staff' AND s.id=a.assignee_id
      LEFT JOIN delivery_boys d ON a.assignee_type='delivery_boy' AND d.id=a.assignee_id
      ORDER BY a.work_date DESC, a.created_at DESC LIMIT 200`);
    return res.json(rows);
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Unable to load assignments.' }); }
}

export async function listMine(req, res) {
  try {
    const [rows] = await db.query(`SELECT a.*, DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date, c.name AS company_name, m.name AS marketing_staff_name FROM document_assignments a
      LEFT JOIN companies c ON c.id=a.company_id
      LEFT JOIN staff m ON m.id=a.marketing_staff_id WHERE a.assignee_type='staff' AND a.assignee_id=?
      ORDER BY a.work_date DESC, a.created_at DESC`, [req.staffId]);
    return res.json(rows);
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Unable to load assigned documents.' }); }
}

export async function updateMine(req, res) {
  return updateAssignment(req, res, 'staff', req.staffId);
}

export async function listDeliveryMine(req, res) {
  try {
    const [rows] = await db.query(`SELECT a.*, DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date, c.name AS company_name, m.name AS marketing_staff_name FROM document_assignments a
      LEFT JOIN companies c ON c.id=a.company_id
      LEFT JOIN staff m ON m.id=a.marketing_staff_id WHERE a.assignee_type='delivery_boy' AND a.assignee_id=?
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

// Returns Cloudinary links for an assignment's file; the browser / app then views or
// downloads it directly from Cloudinary. `scope` decides who may open which assignment.
export function fileLinks(scope) {
  return async (req, res) => {
    try {
      const params = [req.params.id];
      let where = 'id=?';
      if (scope === 'delivery_boy') { where += " AND assignee_type='delivery_boy' AND assignee_id=?"; params.push(req.deliveryBoyId); }
      else if (scope === 'staff') { where += " AND assignee_type='staff' AND assignee_id=?"; params.push(req.staffId); }
      const [rows] = await db.query(`SELECT document_url, document_name FROM document_assignments WHERE ${where} LIMIT 1`, params);
      if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
      const { viewUrl, downloadUrl } = cloudinaryFileLinks(rows[0].document_url);
      return res.json({ viewUrl, downloadUrl, name: rows[0].document_name });
    } catch (error) {
      console.error('Assignment document link failed:', error);
      return res.status(500).json({ error: 'Unable to open the document right now.' });
    }
  };
}

// Admin: put a Done / Cancelled task back to Pending (e.g. cancelled by mistake).
export async function reopen(req, res) {
  try {
    const [result] = await db.query(`UPDATE document_assignments SET status='assigned', completed_at=NULL WHERE id=? AND status IN ('done','cancelled')`, [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Assignment not found or already pending.' });
    return res.json({ message: 'Assignment reopened.', status: 'assigned' });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Unable to reopen assignment.' }); }
}
