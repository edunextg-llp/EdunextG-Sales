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

const readForm = (body = {}, existing = null) => {
    const hasGodown = Object.hasOwn(body, 'hasGodown') ? body.hasGodown : existing?.has_godown ?? null;
    if (![true, false, null].includes(hasGodown)) throw httpError(400, 'Choose whether the distributor has a godown.');
    const sameAsOffice = hasGodown === true && (body.godownSameAsOffice ?? existing?.godown_same_as_office) === true;
    const separateGodown = hasGodown && !sameAsOffice;
    const form = {
        distributorName: text(body.distributorName),
        contactPerson: text(body.contactPerson),
        contactNo: String(body.contactNo || '').replace(/\D/g, ''),
        email: text(body.email).toLowerCase(),
        address: text(body.address, 1000),
        hasGodown,
        sameAsOffice,
        godownAddress: separateGodown ? text(body.godownAddress ?? existing?.godown_address, 1000) : '',
        godownCity: separateGodown ? text(body.godownCity ?? existing?.godown_city, 100) : '',
        godownDistrict: separateGodown ? text(body.godownDistrict ?? existing?.godown_district, 100) : '',
        godownState: separateGodown ? text(body.godownState ?? existing?.godown_state, 100) : '',
        godownPinCode: separateGodown ? text(body.godownPinCode ?? existing?.godown_pin_code, 10) : '',
        godownContactPerson: hasGodown ? text(body.godownContactPerson ?? existing?.godown_contact_person) : '',
        godownContactNo: hasGodown ? String(body.godownContactNo ?? existing?.godown_contact_no ?? '').replace(/\D/g, '') : '',
        city: text(body.city, 100),
        district: text(body.district, 100),
        state: text(body.state, 100),
        pinCode: String(body.pinCode || '').replace(/\D/g, '').slice(0, 6),
        hasGst: Boolean(body.hasGst),
        gstin: Boolean(body.hasGst) ? text(body.gstin, 20).toUpperCase() : '',
        fssaiNumber: String(body.fssaiNumber ?? existing?.fssai_number ?? '').trim(),
    };
    if (!form.distributorName) throw httpError(400, 'Distributor name is required.');
    if (!form.contactPerson) throw httpError(400, 'Office contact person name is required.');
    if (!/^\d{10}$/.test(form.contactNo)) throw httpError(400, 'Enter a 10-digit contact number.');
    if (!form.address) throw httpError(400, 'Office address is required.');
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) throw httpError(400, 'Enter a valid email.');
    if (form.pinCode && !/^\d{6}$/.test(form.pinCode)) throw httpError(400, 'Pin code must be 6 digits.');
    if (form.godownPinCode && !/^\d{6}$/.test(form.godownPinCode)) throw httpError(400, 'Godown PIN code must be 6 digits.');
    if (form.godownContactNo && !/^\d{10}$/.test(form.godownContactNo)) throw httpError(400, 'Enter a 10-digit godown contact number.');
    if (separateGodown && !form.godownAddress) {
        throw httpError(400, 'Enter the godown address.');
    }
    if (form.hasGst && !/^[0-9A-Z]{15}$/.test(form.gstin)) throw httpError(400, 'Enter the 15-character GSTIN.');
    if (form.fssaiNumber && !/^[12]\d{13}$/.test(form.fssaiNumber)) throw httpError(400, 'Enter a 14-digit FSSAI number starting with 1 or 2.');
    return form;
};

const SELLER_TYPES = ['distributor', 'cnf'];
const typeLabel = (type) => (type === 'cnf' ? 'CNF' : 'Distributor');

const SELECT_SQL = `
    SELECT d.id, d.seller_type, d.login_id, d.distributor_name, d.contact_person, d.contact_no, d.email,
           d.company_id, c.name AS company_name, c.type AS company_type, d.address, d.city, d.district, d.state, d.pin_code,
           d.has_godown, d.godown_same_as_office, d.godown_address,
           d.godown_city, d.godown_district, d.godown_state, d.godown_pin_code,
           d.godown_contact_person, d.godown_contact_no,
           d.has_gst, d.gstin, d.fssai_number, d.is_active, d.created_by_name,
           DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           (d.password_encrypted IS NOT NULL) AS has_password
    FROM distributors d
    LEFT JOIN companies c ON c.id = d.company_id`;

const normalize = (row) => ({
    ...row,
    has_godown: row.has_godown === null ? null : Number(row.has_godown) === 1,
    godown_same_as_office: Number(row.godown_same_as_office) === 1,
    has_gst: Boolean(row.has_gst),
    is_active: Number(row.is_active) === 1,
    has_password: Boolean(Number(row.has_password)),
});

async function getById(id) {
    const [rows] = await db.execute(`${SELECT_SQL} WHERE d.id = ?`, [id]);
    return rows[0] ? normalize(rows[0]) : null;
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
        // New logins are made only under a CNF company. Adding under a Distributor company is
        // disabled; logins made earlier under one keep working (list / edit / password / active).
        const sellerType = String(req.body?.sellerType || '');
        if (sellerType !== 'cnf') throw httpError(400, 'Distributors can be added only under a CNF company.');
        const companyId = parseId(req.body?.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        const [companies] = await db.execute('SELECT id, name, type FROM companies WHERE id = ?', [companyId]);
        if (!companies.length) throw httpError(404, 'Company not found.');
        if (companies[0].type !== 'cnf') {
            throw httpError(400, `${companies[0].name} is not a CNF company. Distributors can be added only under a CNF company.`);
        }
        const form = readForm(req.body);
        const password = generateDistributorPassword();
        await connection.beginTransaction();
        const [result] = await connection.execute(
            `INSERT INTO distributors
                (seller_type, distributor_name, contact_person, contact_no, email, company_id, address, city, district, state,
                 pin_code, has_gst, gstin, password_hash, password_encrypted, created_by_name,
                 has_godown, godown_same_as_office, godown_address,
                 godown_city, godown_district, godown_state, godown_pin_code, godown_contact_person, godown_contact_no,
                 fssai_number)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sellerType, form.distributorName, form.contactPerson || null, form.contactNo, form.email || null, companyId,
                form.address || null, form.city || null, form.district || null, form.state || null,
                form.pinCode || null, form.hasGst ? 1 : 0, form.gstin || null,
                await bcrypt.hash(password, 10), encryptPassword(password), adminName(req.user),
                form.hasGodown, form.sameAsOffice, form.godownAddress || null,
                form.godownCity || null, form.godownDistrict || null, form.godownState || null, form.godownPinCode || null,
                form.godownContactPerson || null, form.godownContactNo || null,
                form.fssaiNumber || null,
            ]
        );
        const loginId = formatDistributorLoginId(result.insertId);
        await connection.execute('UPDATE distributors SET login_id = ? WHERE id = ?', [loginId, result.insertId]);
        await connection.commit();
        return res.set('Cache-Control', 'no-store').status(201).json({
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
        const existing = id ? await getById(id) : null;
        if (!existing) throw httpError(404, 'Distributor not found.');
        const form = readForm(req.body, existing);
        await db.execute(
            // Company and CNF / Distributor stay as the login was made.
            `UPDATE distributors
             SET distributor_name = ?, contact_person = ?, contact_no = ?, email = ?, address = ?,
                 city = ?, district = ?, state = ?, pin_code = ?, has_gst = ?, gstin = ?,
                 has_godown = ?, godown_same_as_office = ?, godown_address = ?,
                 godown_city = ?, godown_district = ?, godown_state = ?, godown_pin_code = ?,
                 godown_contact_person = ?, godown_contact_no = ?, fssai_number = ?
             WHERE id = ?`,
            [
                form.distributorName, form.contactPerson || null, form.contactNo, form.email || null,
                form.address || null, form.city || null, form.district || null, form.state || null,
                form.pinCode || null, form.hasGst ? 1 : 0, form.gstin || null,
                form.hasGodown, form.sameAsOffice, form.godownAddress || null,
                form.godownCity || null, form.godownDistrict || null, form.godownState || null, form.godownPinCode || null,
                form.godownContactPerson || null, form.godownContactNo || null, form.fssaiNumber || null, id,
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
        return res.set('Cache-Control', 'no-store').json({ credentials: { loginId: rows[0].login_id, password } });
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
        return res.set('Cache-Control', 'no-store').json({
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
