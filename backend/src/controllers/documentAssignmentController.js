import db from '../config/db.js';
import { readAssignmentInBackground } from './invoiceReportController.js';
import { decideOwnApproval, listOwnApprovals, staffForSalesman } from '../services/autoAddSales.js';
import { invoiceDetailsFromPdf } from '../utils/pdfInvoiceNumbers.js';
import { todayDate } from '../models/otherDaySaleRequestModel.js';
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
    if (type === 'add_sales' && (workDate < todayDate() || workDate > lastAddSalesDay())) {
      return res.status(400).json({ error: `Add Sales can be assigned only from ${showIso(todayDate())} to ${showIso(lastAddSalesDay())}.` });
    }
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
    // Add Sales with an invoice: no need for the assignee to mark it Done. The PDF is read now
    // (IN-5784-885 -> IN5784885), shows in Report > Invoice Report, and Auto Add Sales runs.
    const autoDone = type === 'add_sales' && Boolean(documentUrl);
    // Add Sales: a PDF with a past-day invoice is not accepted (previous day Add Sales is not allowed).
    if (autoDone && /\.pdf$/i.test(String(documentName || ''))) {
      const past = await pastDayInvoices(req.file ? req.file.buffer : documentUrl);
      if (past.length) return res.status(400).json({ error: pastDayMessage(past) });
    }
    const [result] = await db.query(`INSERT INTO document_assignments (work_date, assignment_type, company_id, marketing_staff_id, area, document_url, document_name, assignee_type, assignee_id, status, completed_at, created_by, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${autoDone ? 'NOW()' : 'NULL'}, ?, ?)`, [workDate, type, Number(companyId), Number(marketingStaffId), area, documentUrl, documentName, kind, assigneeId, autoDone ? 'done' : 'assigned', req.user?.id || null, remarks || null]);
    if (autoDone) readAssignmentInBackground(result.insertId);
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
    // Marked Done: it now shows in Report > Invoice Report; make sure its PDF has been read.
    if (status === 'done') readAssignmentInBackground(req.params.id);
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

// Invoices in an Add Sales PDF dated before today (IST). source: PDF buffer or its Cloudinary URL.
async function readDetails(source) {
  if (typeof source !== 'string') return invoiceDetailsFromPdf(source);
  const response = await fetch(cloudinaryFileLinks(source).viewUrl);
  if (!response.ok) throw new Error('The invoice PDF could not be downloaded.');
  return invoiceDetailsFromPdf(await response.arrayBuffer());
}
// Add Sales takes today and the next ADD_SALES_FUTURE_DAYS days only (IST).
const ADD_SALES_FUTURE_DAYS = 2;
const showIso = (iso) => String(iso || '').split('-').reverse().join('-');
function lastAddSalesDay() {
  const date = new Date(`${todayDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + ADD_SALES_FUTURE_DAYS);
  return date.toISOString().slice(0, 10);
}
const outOfRange = (d) => d.date && (d.date < todayDate() || d.date > lastAddSalesDay());
async function pastDayInvoices(source) {
  return (await readDetails(source)).filter(outOfRange);
}
const pastDayMessage = (bad) => {
  const dates = [...new Set(bad.map((d) => showIso(d.date)))].join(', ');
  const past = bad.some((d) => d.date < todayDate());
  return `Upload cancelled: ${bad.length} invoice(s) in this PDF are dated ${dates}. `
    + (past ? 'Previous day Add Sales is not allowed.' : `Add Sales can be uploaded only up to ${showIso(lastAddSalesDay())}.`);
};

// POST /api/staff/document-assignments/read-invoice (Dashboard > Assign, type Add Sales)
// The invoice PDF was just uploaded (signed upload): read it to fill Company, Date and Marketing Person.
export async function readInvoiceForAssign(req, res) {
  try {
    const documentUrl = String(req.body?.documentUrl || '').trim();
    const valid = verifyAssignmentUpload({
      documentUrl,
      publicId: String(req.body?.uploadPublicId || ''),
      resourceType: String(req.body?.uploadResourceType || ''),
      timestamp: req.body?.uploadTimestamp,
      signature: String(req.body?.uploadSignature || ''),
    });
    if (!valid) return res.status(400).json({ error: 'The uploaded invoice could not be verified.' });
    const details = await readDetails(documentUrl);
    if (!details.length) return res.json({ invoiceCount: 0 });
    const past = details.filter(outOfRange);
    if (past.length) return res.json({ invoiceCount: details.length, pastDay: true, error: pastDayMessage(past) });
    const mostCommon = (values) => {
      const counts = new Map();
      values.filter(Boolean).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    };
    const invoiceDate = mostCommon(details.map((d) => d.date));
    const salesman = mostCommon(details.map((d) => d.salesman));
    const staff = await staffForSalesman(salesman);
    let company = null;
    if (staff?.company_id) {
      const [rows] = await db.query('SELECT id, name FROM companies WHERE id = ?', [staff.company_id]);
      company = rows[0] || null;
    }
    return res.json({
      invoiceCount: details.length,
      invoiceDate,
      salesman,
      marketingStaffId: staff?.id || null,
      marketingStaffName: staff?.name || null,
      companyId: company?.id || null,
      companyName: company?.name || null,
    });
  } catch (error) {
    console.error('Read invoice for assign failed:', error);
    return res.status(500).json({ error: 'The invoice PDF could not be read.' });
  }
}

// GET /api/my-document-assignments/auto-sales-approvals: invoices waiting for my own-permission approval.
export async function listMyAutoSalesApprovals(req, res) {
  try {
    const id = req.assigneeType === 'staff' ? req.staffId : req.deliveryBoyId;
    return res.json(await listOwnApprovals(req.assigneeType, id));
  } catch (error) {
    console.error('List auto sales approvals failed:', error);
    return res.status(500).json({ error: 'Unable to load approvals.' });
  }
}

// POST /api/my-document-assignments/auto-sales-approvals { assignmentId, invoiceNumber, approve, note }
export async function decideMyAutoSalesApproval(req, res) {
  try {
    const approve = req.body?.approve === true;
    const note = String(req.body?.note || '').trim();
    if (approve && !note) return res.status(400).json({ error: 'Enter the reason for adding this sale on your own permission.' });
    if (note.length > 1000) return res.status(400).json({ error: 'Reason must be 1000 characters or less.' });
    const result = await decideOwnApproval({
      assigneeType: req.assigneeType,
      assigneeId: req.assigneeType === 'staff' ? req.staffId : req.deliveryBoyId,
      assignmentId: req.body?.assignmentId,
      invoiceNumber: String(req.body?.invoiceNumber || ''),
      approve,
      note,
    });
    return res.json({ result, message: result.status === 'created' ? 'Sale created in Add Sales.' : (result.reason || 'Saved.') });
  } catch (error) {
    if (!error.statusCode) console.error('Auto sales approval failed:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unable to save your approval.' });
  }
}
