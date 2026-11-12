import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from '../config/db.js';
import { decryptPassword, encryptPassword } from '../utils/passwordCipher.js';

// DMS Sales > Add Distributor (admin only).
// Saving a new distributor makes its login: ID BFPDD001, BFPDD002, ... and a random
// password. The password is kept two ways: a bcrypt hash (what a login will check) and
// AES-256-GCM encrypted (utils/passwordCipher.js), so the admin can view it again.

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const sendError = (res, error, fallback) => {
    if (!error.statusCode) console.error(fallback, error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : fallback });
};
const parseId = (value) => {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
};
const text = (value, max = 255) => String(value ?? '').trim().slice(0, max);

export const formatDistributorLoginId = (id) => `BFPDD${String(id).padStart(3, '0')}`;

// 8 characters, letters and digits, without look-alikes (0/O, 1/l/I).
const PASSWORD_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export function generateDistributorPassword(length = 8) {
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i += 1) out += PASSWORD_CHARS[bytes[i] % PASSWORD_CHARS.length];
    // At least one digit, so it never looks like a plain word.
    return /\d/.test(out) ? out : `${out.slice(0, -1)}${2 + (bytes[0] % 8)}`;
}

const readForm = (body = {}) => {
    const form = {
        distributorName: text(body.distributorName),
        contactPerson: text(body.contactPerson),
        contactNo: String(body.contactNo || '').replace(/\D/g, '').slice(0, 15),
        email: text(body.email).toLowerCase(),
        address: text(body.address, 1000),
        city: text(body.city, 100),
        district: text(body.district, 100),
        state: text(body.state, 100),
        pinCode: String(body.pinCode || '').replace(/\D/g, '').slice(0, 6),
        hasGst: Boolean(body.hasGst),
        gstin: Boolean(body.hasGst) ? text(body.gstin, 20).toUpperCase() : '',
    };
    if (!form.distributorName) throw httpError(400, 'Distributor name is required.');
    if (!/^\d{10}$/.test(form.contactNo)) throw httpError(400, 'Enter a 10-digit contact number.');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) throw httpError(400, 'Enter a valid email.');
    if (form.pinCode && !/^\d{6}$/.test(form.pinCode)) throw httpError(400, 'Pin code must be 6 digits.');
    if (form.hasGst && !/^[0-9A-Z]{15}$/.test(form.gstin)) throw httpError(400, 'Enter the 15-character GSTIN.');
    return form;
};

const SELLER_TYPES = ['distributor', 'cnf'];
const typeLabel = (type) => (type === 'cnf' ? 'CNF' : 'Distributor');

const SELECT_SQL = `
    SELECT d.id, d.seller_type, d.login_id, d.distributor_name, d.contact_person, d.contact_no, d.email,
           d.company_id, c.name AS company_name, c.type AS company_type, d.address, d.city, d.district, d.state, d.pin_code,
           d.has_gst, d.gstin, d.is_active, d.created_by_name,
           DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           (d.password_encrypted IS NOT NULL) AS has_password
    FROM distributors d
    LEFT JOIN companies c ON c.id = d.company_id`;

const normalize = (row) => ({
    ...row,
    has_gst: Boolean(row.has_gst),
    is_active: Number(row.is_active) === 1,
    has_password: Boolean(Number(row.has_password)),
});

async function getById(id) {
    const [rows] = await db.execute(`${SELECT_SQL} WHERE d.id = ?`, [id]);
    return rows[0] ? normalize(rows[0]) : null;
}

async function assertUniqueContact(contactNo, exceptId = 0) {
    const [rows] = await db.execute(
        'SELECT distributor_name FROM distributors WHERE contact_no = ? AND id <> ? LIMIT 1',
        [contactNo, exceptId]
    );
    if (rows.length) throw httpError(409, `${rows[0].distributor_name} already uses this contact number.`);
}

const adminName = (user) => (user?.role === 'admin' ? 'Admin' : user?.username || null);

export const listDistributors = async (req, res) => {
    try {
        const where = [];
        const params = [];
        const companyId = parseId(req.query.companyId);
        if (companyId) {
            where.push('d.company_id = ?');
            params.push(companyId);
        }
        if (SELLER_TYPES.includes(req.query.type)) {
            where.push('d.seller_type = ?');
            params.push(req.query.type);
        }
        const [rows] = await db.execute(
            `${SELECT_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.id DESC`,
            params
        );
        return res.json({ distributors: rows.map(normalize) });
    } catch (error) {
        return sendError(res, error, 'Unable to load distributors.');
    }
};

export const createDistributor = async (req, res) => {
    const connection = await db.getConnection();
    try {
        // First CNF or Distributor, then a company of that type: the login is made under it.
        const sellerType = String(req.body?.sellerType || '');
        if (!SELLER_TYPES.includes(sellerType)) throw httpError(400, 'Choose CNF or Distributor.');
        const companyId = parseId(req.body?.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        const [companies] = await db.execute('SELECT id, name, type FROM companies WHERE id = ?', [companyId]);
        if (!companies.length) throw httpError(404, 'Company not found.');
        if (companies[0].type && companies[0].type !== sellerType) {
            throw httpError(400, `${companies[0].name} is a ${typeLabel(companies[0].type)} company, not ${typeLabel(sellerType)}.`);
        }
        const form = readForm(req.body);
        await assertUniqueContact(form.contactNo);
        const password = generateDistributorPassword();
        await connection.beginTransaction();
        const [result] = await connection.execute(
            `INSERT INTO distributors
                (seller_type, distributor_name, contact_person, contact_no, email, company_id, address, city, district, state,
                 pin_code, has_gst, gstin, password_hash, password_encrypted, created_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sellerType, form.distributorName, form.contactPerson || null, form.contactNo, form.email || null, companyId,
                form.address || null, form.city || null, form.district || null, form.state || null,
                form.pinCode || null, form.hasGst ? 1 : 0, form.gstin || null,
                await bcrypt.hash(password, 10), encryptPassword(password), adminName(req.user),
            ]
        );
        const loginId = formatDistributorLoginId(result.insertId);
        await connection.execute('UPDATE distributors SET login_id = ? WHERE id = ?', [loginId, result.insertId]);
        await connection.commit();
        return res.status(201).json({
            message: `${form.distributorName} added under ${companies[0].name} (${typeLabel(sellerType)}). Login ID ${loginId}.`,
            distributor: await getById(result.insertId),
            // Shown once in the "Login details" box; can be viewed again any time.
            credentials: { loginId, password },
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        return sendError(res, error, 'Unable to add the distributor.');
    } finally {
        connection.release();
    }
};

export const updateDistributor = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id || !(await getById(id))) throw httpError(404, 'Distributor not found.');
        const form = readForm(req.body);
        await assertUniqueContact(form.contactNo, id);
        await db.execute(
            // Company and CNF / Distributor stay as the login was made.
            `UPDATE distributors
             SET distributor_name = ?, contact_person = ?, contact_no = ?, email = ?, address = ?,
                 city = ?, district = ?, state = ?, pin_code = ?, has_gst = ?, gstin = ?
             WHERE id = ?`,
            [
                form.distributorName, form.contactPerson || null, form.contactNo, form.email || null,
                form.address || null, form.city || null, form.district || null, form.state || null,
                form.pinCode || null, form.hasGst ? 1 : 0, form.gstin || null, id,
            ]
        );
        return res.json({ message: 'Distributor updated.', distributor: await getById(id) });
    } catch (error) {
        return sendError(res, error, 'Unable to update the distributor.');
    }
};

// Decrypts the saved password for the admin.
export const getDistributorCredentials = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const [rows] = await db.execute('SELECT login_id, password_encrypted FROM distributors WHERE id = ?', [id || 0]);
        if (!rows.length) throw httpError(404, 'Distributor not found.');
        const password = decryptPassword(rows[0].password_encrypted);
        if (!password) throw httpError(409, 'The saved password cannot be read. Make a new password.');
        return res.json({ credentials: { loginId: rows[0].login_id, password } });
    } catch (error) {
        return sendError(res, error, 'Unable to load the login details.');
    }
};

export const resetDistributorPassword = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const distributor = id ? await getById(id) : null;
        if (!distributor) throw httpError(404, 'Distributor not found.');
        const password = generateDistributorPassword();
        await db.execute(
            'UPDATE distributors SET password_hash = ?, password_encrypted = ? WHERE id = ?',
            [await bcrypt.hash(password, 10), encryptPassword(password), id]
        );
        return res.json({
            message: `New password made for ${distributor.distributor_name}.`,
            credentials: { loginId: distributor.login_id, password },
        });
    } catch (error) {
        return sendError(res, error, 'Unable to make a new password.');
    }
};

export const setDistributorActive = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id || !(await getById(id))) throw httpError(404, 'Distributor not found.');
        const active = Boolean(req.body?.isActive);
        await db.execute('UPDATE distributors SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
        return res.json({ message: active ? 'Distributor activated.' : 'Distributor deactivated.', distributor: await getById(id) });
    } catch (error) {
        return sendError(res, error, 'Unable to change the distributor.');
    }
};
