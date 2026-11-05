import db from '../config/db.js';
import { uploadBufferToCloudinary, isCloudinaryConfigured, cloudinaryFileLinks, createAssignmentUploadSignature, verifyAssignmentUpload } from '../utils/cloudinary.js';

export async function signAssignmentUpload(req, res) {
  try {
    const fileName = String(req.body?.fileName || '').trim();
    const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();
    if (!fileName || fileName.length > 255 || !(/\.(pdf|png|jpe?g|webp)$/i.test(fileName))) {
      return res.status(400).json({ error: 'Choose a PDF, PNG, JPG or WebP file.' });
    }
    if (!mimeType || !(mimeType === 'application/pdf' || mimeType.startsWith('image/'))) {
      return res.status(400).json({ error: 'Unsupported invoice file type.' });
    }
    return res.json(createAssignmentUploadSignature({ fileName, mimeType }));
  } catch (error) {
    console.error('Sign assignment upload failed:', error);
    return res.status(503).json({ error: 'Direct document upload is unavailable.' });
  }
}

export async function create(req, res) {
  try {
    const { workDate, type, companyId, marketingStaffId, area, assignTo } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(workDate || ''))) return res.status(400).json({ error: 'Choose a valid date.' });
    if (!['pending', 'printing', 'add_sales', 'pending_works', 'others'].includes(type) || !companyId || !marketingStaffId || !area || !assignTo) return res.status(400).json({ error: 'Complete all required assignment fields.' });
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
    let documentUrl = null;
    let documentName = null;
    const signedUrl = String(req.body?.documentUrl || '').trim();
    if (signedUrl) {
      const validUpload = verifyAssignmentUpload({
        documentUrl: signedUrl,
        publicId: String(req.body?.uploadPublicId || ''),
        resourceType: String(req.body?.uploadResourceType || ''),
        timestamp: req.body?.uploadTimestamp,
        signature: String(req.body?.uploadSignature || ''),
      });
      if (!validUpload) return res.status(400).json({ error: 'The uploaded invoice could not be verified. Please upload it again.' });
      documentUrl = signedUrl;
      documentName = String(req.body?.documentName || '').trim().slice(0, 255) || null;
    }
    if (req.file) {
      if (!isCloudinaryConfigured()) return res.status(503).json({ error: 'Document storage is not configured.' });
      // Images keep 'auto'; PDFs and other documents are stored as 'raw' to preserve
      // the uploaded file. PDF viewing is handled with a short-lived signed link below.
      const isImage = String(req.file.mimetype || '').startsWith('image/');
      const extension = (String(req.file.originalname || '').match(/\.([a-z0-9]{1,8})$/i)?.[1] || (req.file.mimetype === 'application/pdf' ? 'pdf' : '')).toLowerCase();
      const publicId = `assignment_${Date.now()}${!isImage && extension ? `.${extension}` : ''}`;
      const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'staff-assignments', resourceType: isImage ? 'auto' : 'raw', uploadOptions: { public_id: publicId } });
      documentUrl = uploaded.secure_url;
      documentName = req.file.originalname;
    }
    const [result] = await db.query(`INSERT INTO document_assignments (work_date, assignment_type, company_id, marketing_staff_id, area, document_url, document_name, assignee_type, assignee_id, status, created_by, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?)`, [workDate, type, Number(companyId), Number(marketingStaffId), area, documentUrl, documentName, kind, assigneeId, req.user?.id || null, remarks || null]);
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

export async function listDeliveryBoyOptions(_req, res) {
  try {
    const [rows] = await db.query(`SELECT id, name FROM delivery_boys WHERE is_active=1 ORDER BY name`);
    return res.json(rows);
  } catch (error) {
    console.error('Load delivery boy assignment options failed:', error);
    return res.status(500).json({ error: 'Unable to load delivery boy options.' });
  }
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
      if (!rows[0].document_url) return res.status(404).json({ error: 'No invoice was attached to this task.' });
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
