import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/db.js';
import { encryptPassword } from '../utils/passwordCipher.js';
import { createSharedStore } from '../utils/sharedStore.js';

// Distributor Portal (the distributor app, ../distributor): a distributor / CNF made on
// DMS Sales > Add Distributor signs in on the main sign-in page with its Login ID and password and sees its own
// purchases (DMS bills made to it on Create Sales), ledger, stock received and its own
// delivery boys. Everything here is scoped to the signed-in distributor.

// Same secret as the main site's access tokens (authController / authMiddleware).
const SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const sendError = (res, error, fallback) => {
    if (!error.statusCode) console.error(fallback, error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : fallback });
};
const num = (v) => Number(v) || 0;
const money = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;
const parseId = (value) => {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
};
const text = (value, max = 255) => String(value ?? '').trim().slice(0, max);
const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null);

const PROFILE_SQL = `
    SELECT d.id, d.login_id, d.distributor_name, d.contact_person, d.contact_no, d.email, d.address,
           d.city, d.district, d.state, d.pin_code, d.gstin, d.is_active, d.company_id,
           c.name AS company_name, c.type AS company_type
    FROM distributors d LEFT JOIN companies c ON c.id = d.company_id
    WHERE d.id = ?`;

const profileOf = (row) => ({
    id: row.id,
    loginId: row.login_id,
    name: row.distributor_name,
    contactPerson: row.contact_person,
    phone: row.contact_no,
    email: row.email,
    address: [row.address, row.city, row.district, row.state, row.pin_code].filter(Boolean).join(', '),
    gstin: row.gstin,
    companyName: row.company_name,
    companyType: row.company_type,
});

// ---- auth ----
// Distributors sign in on the main site's sign-in page (authController.login, role
// 'distributor') and the portal sends that same access token here.

// ---- mobile app login (Bawarchee app) ----
// POST /api/distributor/mobile/login { loginId, password }. The main sign-in page needs a
// CAPTCHA, which the app can't show, so the app signs in here instead. Same check as the main
// login (active distributor, bcrypt password) and the same token shape, so every route below
// accepts it. Five wrong passwords lock that login ID (from that address) for 15 minutes,
// like the staff app login.
const MOBILE_TOKEN_EXPIRES_IN = process.env.DISTRIBUTOR_MOBILE_TOKEN_EXPIRES_IN || '30d';
const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
// Shared by all cluster workers; entries drop themselves after LOGIN_LOCK_MS.
const failedLogins = createSharedStore('distributorMobileFailedLogins');
const loginKey = (req, loginId) => `${loginId}|${req.ip || ''}`;
const lockedMinutes = async (key) => {
    const entry = await failedLogins.get(key);
    if (!entry) return 0;
    if (entry.lockedUntil > Date.now()) return Math.ceil((entry.lockedUntil - Date.now()) / 60_000);
    if (entry.lockedUntil) await failedLogins.delete(key);
    return 0;
};
const recordFailedLogin = async (key) => {
    const entry = (await failedLogins.get(key)) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_LOGINS) {
        entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
        entry.count = 0;
    }
    await failedLogins.set(key, entry, LOGIN_LOCK_MS);
};

export const mobileLogin = async (req, res) => {
    try {
        const loginId = String(req.body?.loginId || '').trim().toUpperCase();
        const password = String(req.body?.password || '');
        if (!loginId || !password) throw httpError(400, 'Login ID and password are required.');
        if (!/^[A-Z0-9]{3,30}$/.test(loginId)) throw httpError(401, 'Invalid login ID or password.');

        const key = loginKey(req, loginId);
        const minutes = await lockedMinutes(key);
        if (minutes > 0) throw httpError(429, `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);

        const [rows] = await db.execute(
            'SELECT id, login_id, password_hash, is_active FROM distributors WHERE UPPER(login_id) = ? LIMIT 1',
            [loginId]
        );
        const row = rows[0];
        const valid = row && row.password_hash && await bcrypt.compare(password, row.password_hash);
        if (!valid) {
            await recordFailedLogin(key);
            throw httpError(401, 'Invalid login ID or password.');
        }
        await failedLogins.delete(key);
        if (!Number(row.is_active)) throw httpError(403, 'This account is inactive. Please contact the company.');

        const token = jwt.sign(
            { id: row.id, distributorId: row.id, loginId: row.login_id, role: 'distributor', client: 'mobile' },
            SECRET,
            { expiresIn: MOBILE_TOKEN_EXPIRES_IN }
        );
        const [profileRows] = await db.execute(PROFILE_SQL, [row.id]);
        return res.status(200).json({ message: 'Login successful', token, profile: profileOf(profileRows[0]) });
    } catch (error) {
        return sendError(res, error, 'Unable to sign in.');
    }
};

// Every route: a valid main-site token of an active distributor.
export const requireDistributor = async (req, res, next) => {
    try {
        const header = String(req.headers.authorization || '');
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!token) throw httpError(401, 'Please sign in.');
        let decoded;
        try {
            decoded = jwt.verify(token, SECRET);
        } catch {
            throw httpError(401, 'Your session has ended. Please sign in again.');
        }
        // Signed in, but not as a distributor (e.g. an admin): not a session problem.
        if (decoded.role !== 'distributor' || !decoded.distributorId) throw httpError(403, 'This portal is for distributors only.');
        const [rows] = await db.execute('SELECT is_active FROM distributors WHERE id = ?', [decoded.distributorId]);
        if (!rows.length || !Number(rows[0].is_active)) throw httpError(401, 'This account is inactive. Please contact the company.');
        req.distributorId = decoded.distributorId;
        return next();
    } catch (error) {
        return sendError(res, error, 'Unable to check the session.');
    }
};

// GET /api/distributor/me
export const me = async (req, res) => {
    try {
        const [rows] = await db.execute(PROFILE_SQL, [req.distributorId]);
        if (!rows.length) throw httpError(404, 'Account not found.');
        return res.json({ distributor: profileOf(rows[0]) });
    } catch (error) {
        return sendError(res, error, 'Unable to load your account.');
    }
};

// ---- dashboard ----

// GET /api/distributor/dashboard
export const dashboard = async (req, res) => {
    try {
        const id = req.distributorId;
        const [[totals]] = await db.execute(
            `SELECT COUNT(*) AS bills, COALESCE(SUM(total_amount), 0) AS purchased, COALESCE(SUM(paid_amount), 0) AS paid,
                    COALESCE(SUM(balance_amount), 0) AS balance, COALESCE(SUM(total_qty), 0) AS qty
             FROM dms_sales WHERE buyer_type = 'distributor' AND distributor_id = ? AND status = 'active'`,
            [id]
        );
        const [[month]] = await db.execute(
            `SELECT COUNT(*) AS bills, COALESCE(SUM(total_amount), 0) AS purchased
             FROM dms_sales WHERE buyer_type = 'distributor' AND distributor_id = ? AND status = 'active'
               AND sale_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
            [id]
        );
        const [[items]] = await db.execute(
            `SELECT COUNT(DISTINCT i.product_erp_id) AS products
             FROM dms_sale_items i JOIN dms_sales s ON s.id = i.sale_id
             WHERE s.buyer_type = 'distributor' AND s.distributor_id = ? AND s.status = 'active'`,
            [id]
        );
        const [[boys]] = await db.execute(
            'SELECT COUNT(*) AS total, COALESCE(SUM(is_active), 0) AS active FROM distributor_delivery_boys WHERE distributor_id = ?',
            [id]
        );
        // Purchases of the last 6 months, for the chart.
        const [monthly] = await db.execute(
            `SELECT DATE_FORMAT(sale_date, '%Y-%m') AS month, COALESCE(SUM(total_amount), 0) AS amount, COUNT(*) AS bills
             FROM dms_sales WHERE buyer_type = 'distributor' AND distributor_id = ? AND status = 'active'
               AND sale_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
             GROUP BY month ORDER BY month`,
            [id]
        );
        const [recent] = await db.execute(
            `SELECT id, invoice_number, DATE_FORMAT(sale_date, '%Y-%m-%d') AS sale_date, total_qty, total_amount, balance_amount, status
             FROM dms_sales WHERE buyer_type = 'distributor' AND distributor_id = ?
             ORDER BY sale_date DESC, id DESC LIMIT 5`,
            [id]
        );
        return res.json({
            totals: {
                bills: num(totals.bills),
                purchased: money(totals.purchased),
                paid: money(totals.paid),
                balance: money(totals.balance),
                qty: num(totals.qty),
                products: num(items.products),
                monthBills: num(month.bills),
                monthPurchased: money(month.purchased),
                deliveryBoys: num(boys.total),
                activeDeliveryBoys: num(boys.active),
            },
            monthly: monthly.map((m) => ({ month: m.month, amount: money(m.amount), bills: num(m.bills) })),
            recent,
        });
    } catch (error) {
        return sendError(res, error, 'Unable to load the dashboard.');
    }
};

// ---- purchases (DMS bills made to this distributor) ----

// GET /api/distributor/purchases?from&to&q
export const listPurchases = async (req, res) => {
    try {
        const where = ["buyer_type = 'distributor'", 'distributor_id = ?'];
        const params = [req.distributorId];
        const from = isoDate(req.query.from);
        const to = isoDate(req.query.to);
        if (from) { where.push('sale_date >= ?'); params.push(from); }
        if (to) { where.push('sale_date <= ?'); params.push(to); }
        const q = text(req.query.q, 50);
        if (q) { where.push('invoice_number LIKE ?'); params.push(`%${q}%`); }
        const [rows] = await db.execute(
            `SELECT s.id, s.invoice_number, DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS sale_date, s.item_count, s.total_qty,
                    s.taxable_amount, s.gst_amount, s.round_off, s.total_amount, s.paid_amount, s.balance_amount,
                    s.status, s.remarks, c.name AS company_name
             FROM dms_sales s LEFT JOIN companies c ON c.id = s.company_id
             WHERE ${where.map((w) => `s.${w}`).join(' AND ')}
             ORDER BY s.sale_date DESC, s.id DESC LIMIT 1000`,
            params
        );
        return res.json({ purchases: rows });
    } catch (error) {
        return sendError(res, error, 'Unable to load purchases.');
    }
};

// GET /api/distributor/purchases/:id  (bill + items + payments, for view / print)
export const getPurchase = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const [sales] = await db.execute(
            `SELECT s.*, DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS sale_date, c.name AS company_name, c.type AS company_type,
                    COALESCE(c.delivery_terms_html, s.delivery_terms_html) AS invoice_delivery_terms_html,
                    COALESCE(c.declaration_html, s.declaration_html) AS invoice_declaration_html,
                    (SELECT o.order_number FROM distributor_orders o WHERE o.dms_sale_id = s.id ORDER BY o.id DESC LIMIT 1) AS order_number,
                    (SELECT o.requisition_number FROM distributor_orders o WHERE o.dms_sale_id = s.id ORDER BY o.id DESC LIMIT 1) AS requisition_number
             FROM dms_sales s LEFT JOIN companies c ON c.id = s.company_id
             WHERE s.id = ? AND s.buyer_type = 'distributor' AND s.distributor_id = ?`,
            [id || 0, req.distributorId]
        );
        if (!sales.length) throw httpError(404, 'Bill not found.');
        const [items] = await db.execute(
            `SELECT *, DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiry_date FROM dms_sale_items WHERE sale_id = ? ORDER BY sort_order, id`,
            [id]
        );
        const [payments] = await db.execute(
            `SELECT id, DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date, amount, payment_mode, reference
             FROM dms_sale_payments WHERE sale_id = ? ORDER BY payment_date, id`,
            [id]
        );
        return res.json({ sale: sales[0], items, payments });
    } catch (error) {
        return sendError(res, error, 'Unable to load the bill.');
    }
};

// ---- ledger: bills (debit) and payments (credit), oldest first, with a running balance ----

// GET /api/distributor/ledger?from&to
export const ledger = async (req, res) => {
    try {
        const id = req.distributorId;
        const from = isoDate(req.query.from);
        const to = isoDate(req.query.to);
        const [bills] = await db.execute(
            `SELECT id AS ref_id, DATE_FORMAT(sale_date, '%Y-%m-%d') AS date, invoice_number, total_amount AS amount, created_at
             FROM dms_sales WHERE buyer_type = 'distributor' AND distributor_id = ? AND status = 'active'`,
            [id]
        );
        const [payments] = await db.execute(
            `SELECT p.id AS ref_id, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS date, s.invoice_number, p.amount,
                    p.payment_mode, p.reference, p.created_at
             FROM dms_sale_payments p JOIN dms_sales s ON s.id = p.sale_id
             WHERE s.buyer_type = 'distributor' AND s.distributor_id = ? AND s.status = 'active'`,
            [id]
        );
        const entries = [
            ...bills.map((b) => ({ type: 'bill', date: b.date, invoiceNumber: b.invoice_number, refId: b.ref_id, debit: money(b.amount), credit: 0, at: b.created_at })),
            ...payments.map((p) => ({
                type: 'payment', date: p.date, invoiceNumber: p.invoice_number, refId: p.ref_id, debit: 0, credit: money(p.amount),
                mode: p.payment_mode, reference: p.reference, at: p.created_at,
            })),
        ].sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? new Date(a.at) - new Date(b.at) : a.type === 'bill' ? -1 : 1));

        let balance = 0;
        let opening = 0;
        const rows = [];
        entries.forEach((e) => {
            balance = money(balance + e.debit - e.credit);
            if (from && e.date < from) { opening = balance; return; }
            if (to && e.date > to) return;
            const { at, ...rest } = e;
            rows.push({ ...rest, balance });
        });
        const totals = rows.reduce((t, r) => ({ debit: money(t.debit + r.debit), credit: money(t.credit + r.credit) }), { debit: 0, credit: 0 });
        return res.json({
            opening,
            entries: rows,
            totals,
            closing: rows.length ? rows[rows.length - 1].balance : opening,
        });
    } catch (error) {
        return sendError(res, error, 'Unable to load the ledger.');
    }
};

// ---- stock received: everything bought on active bills, per item and per MRP lot ----

// GET /api/distributor/stock
export const stock = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT i.product_erp_id, MAX(i.item_code) AS item_code, MAX(i.product_name) AS product_name,
                    MAX(i.variant_name) AS variant_name, MAX(i.hsn_code) AS hsn_code, i.mrp, i.batch_number,
                    DATE_FORMAT(i.expiry_date, '%Y-%m-%d') AS expiry_date,
                    SUM(CASE WHEN i.is_free = 1 THEN 0 ELSE i.qty END) AS paid_qty,
                    SUM(CASE WHEN i.is_free = 1 THEN i.qty ELSE 0 END) AS free_qty,
                    SUM(i.amount) AS amount, DATE_FORMAT(MAX(s.sale_date), '%Y-%m-%d') AS last_date
             FROM dms_sale_items i JOIN dms_sales s ON s.id = i.sale_id
             WHERE s.buyer_type = 'distributor' AND s.distributor_id = ? AND s.status = 'active'
             GROUP BY i.product_erp_id, i.mrp, i.batch_number, i.expiry_date
             ORDER BY product_name, variant_name, i.expiry_date`,
            [req.distributorId]
        );
        const byItem = new Map();
        rows.forEach((r) => {
            const key = r.product_erp_id;
            if (!byItem.has(key)) {
                byItem.set(key, {
                    productErpId: r.product_erp_id,
                    itemCode: r.item_code,
                    productName: r.product_name,
                    variantName: r.variant_name,
                    hsnCode: r.hsn_code,
                    paidQty: 0,
                    freeQty: 0,
                    qty: 0,
                    amount: 0,
                    lastDate: null,
                    lots: [],
                });
            }
            const item = byItem.get(key);
            const paid = num(r.paid_qty);
            const free = num(r.free_qty);
            item.paidQty += paid;
            item.freeQty += free;
            item.qty += paid + free;
            item.amount = money(item.amount + num(r.amount));
            const last = r.last_date || null; // YYYY-MM-DD from SQL (no time-zone shift)
            if (last && (!item.lastDate || last > item.lastDate)) item.lastDate = last;
            item.lots.push({ mrp: r.mrp == null ? null : num(r.mrp), batchNumber: r.batch_number, expiryDate: r.expiry_date, qty: paid + free });
        });
        return res.json({ items: [...byItem.values()] });
    } catch (error) {
        return sendError(res, error, 'Unable to load stock.');
    }
};

// ---- delivery boys (the distributor's own) ----

const boyOf = (r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    vehicleNo: r.vehicle_no,
    area: r.area,
    isActive: Boolean(Number(r.is_active)),
    createdAt: r.created_at,
});

const readBoy = (body) => {
    const name = text(body?.name, 120);
    const phone = text(body?.phone, 15).replace(/\s+/g, '');
    if (!name) throw httpError(400, 'Enter the name.');
    if (!/^\d{10}$/.test(phone)) throw httpError(400, 'Enter a 10-digit mobile number.');
    return { name, phone, vehicleNo: text(body?.vehicleNo, 30).toUpperCase() || null, area: text(body?.area, 120) || null };
};

// GET /api/distributor/delivery-boys
export const listDeliveryBoys = async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM distributor_delivery_boys WHERE distributor_id = ? ORDER BY is_active DESC, name',
            [req.distributorId]
        );
        return res.json({ deliveryBoys: rows.map(boyOf) });
    } catch (error) {
        return sendError(res, error, 'Unable to load delivery boys.');
    }
};

// POST /api/distributor/delivery-boys
export const createDeliveryBoy = async (req, res) => {
    try {
        const b = readBoy(req.body);
        const [dup] = await db.execute('SELECT id FROM distributor_delivery_boys WHERE distributor_id = ? AND phone = ?', [req.distributorId, b.phone]);
        if (dup.length) throw httpError(409, 'A delivery boy with this mobile number is already added.');
        const [result] = await db.execute(
            'INSERT INTO distributor_delivery_boys (distributor_id, name, phone, vehicle_no, area) VALUES (?, ?, ?, ?, ?)',
            [req.distributorId, b.name, b.phone, b.vehicleNo, b.area]
        );
        const [rows] = await db.execute('SELECT * FROM distributor_delivery_boys WHERE id = ?', [result.insertId]);
        return res.status(201).json({ message: `${b.name} added.`, deliveryBoy: boyOf(rows[0]) });
    } catch (error) {
        return sendError(res, error, 'Unable to add the delivery boy.');
    }
};

// PUT /api/distributor/delivery-boys/:id
export const updateDeliveryBoy = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const b = readBoy(req.body);
        const [dup] = await db.execute(
            'SELECT id FROM distributor_delivery_boys WHERE distributor_id = ? AND phone = ? AND id <> ?',
            [req.distributorId, b.phone, id || 0]
        );
        if (dup.length) throw httpError(409, 'Another delivery boy has this mobile number.');
        const [result] = await db.execute(
            'UPDATE distributor_delivery_boys SET name = ?, phone = ?, vehicle_no = ?, area = ? WHERE id = ? AND distributor_id = ?',
            [b.name, b.phone, b.vehicleNo, b.area, id || 0, req.distributorId]
        );
        if (!result.affectedRows) throw httpError(404, 'Delivery boy not found.');
        const [rows] = await db.execute('SELECT * FROM distributor_delivery_boys WHERE id = ?', [id]);
        return res.json({ message: 'Saved.', deliveryBoy: boyOf(rows[0]) });
    } catch (error) {
        return sendError(res, error, 'Unable to save the delivery boy.');
    }
};

// PUT /api/distributor/delivery-boys/:id/active  { isActive }
export const setDeliveryBoyActive = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const active = req.body?.isActive ? 1 : 0;
        const [result] = await db.execute(
            'UPDATE distributor_delivery_boys SET is_active = ? WHERE id = ? AND distributor_id = ?',
            [active, id || 0, req.distributorId]
        );
        if (!result.affectedRows) throw httpError(404, 'Delivery boy not found.');
        return res.json({ message: active ? 'Marked active.' : 'Marked inactive.' });
    } catch (error) {
        return sendError(res, error, 'Unable to change the status.');
    }
};

// DELETE /api/distributor/delivery-boys/:id
export const deleteDeliveryBoy = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const [result] = await db.execute('DELETE FROM distributor_delivery_boys WHERE id = ? AND distributor_id = ?', [id || 0, req.distributorId]);
        if (!result.affectedRows) throw httpError(404, 'Delivery boy not found.');
        return res.json({ message: 'Removed.' });
    } catch (error) {
        return sendError(res, error, 'Unable to remove the delivery boy.');
    }
};

// ---- areas (created first; each outlet picks one) ----

// "  salt   LAKE " -> name "salt LAKE", key "salt lake": one area per key per distributor.
const areaName = (value) => text(value, 120).replace(/\s+/g, ' ');
const areaKey = (name) => name.toLowerCase();

const readAreaName = (body) => {
    const name = areaName(body?.name);
    if (!name) throw httpError(400, 'Enter the area name.');
    return name;
};

const areaDuplicate = async (distributorId, key, exceptId = 0) => {
    const [rows] = await db.execute(
        'SELECT name FROM distributor_areas WHERE distributor_id = ? AND name_key = ? AND id <> ?',
        [distributorId, key, exceptId]
    );
    if (rows.length) throw httpError(409, `The area "${rows[0].name}" is already added.`);
};

// GET /api/distributor/areas  (with how many outlets each has)
export const listAreas = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT a.id, a.name, a.created_at, COUNT(o.id) AS outlet_count
             FROM distributor_areas a LEFT JOIN distributor_outlets o ON o.area_id = a.id
             WHERE a.distributor_id = ? GROUP BY a.id ORDER BY a.name`,
            [req.distributorId]
        );
        return res.json({ areas: rows.map((r) => ({ id: r.id, name: r.name, outletCount: num(r.outlet_count), createdAt: r.created_at })) });
    } catch (error) {
        return sendError(res, error, 'Unable to load areas.');
    }
};

// POST /api/distributor/areas  { name }
export const createArea = async (req, res) => {
    try {
        const name = readAreaName(req.body);
        await areaDuplicate(req.distributorId, areaKey(name));
        const [result] = await db.execute(
            'INSERT INTO distributor_areas (distributor_id, name, name_key) VALUES (?, ?, ?)',
            [req.distributorId, name, areaKey(name)]
        );
        return res.status(201).json({ message: `${name} added.`, area: { id: result.insertId, name, outletCount: 0 } });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This area is already added.' });
        return sendError(res, error, 'Unable to add the area.');
    }
};

// PUT /api/distributor/areas/:id  { name }  (its outlets keep it, with the new name)
export const updateArea = async (req, res) => {
    try {
        const id = parseId(req.params.id) || 0;
        const name = readAreaName(req.body);
        await areaDuplicate(req.distributorId, areaKey(name), id);
        const [result] = await db.execute(
            'UPDATE distributor_areas SET name = ?, name_key = ? WHERE id = ? AND distributor_id = ?',
            [name, areaKey(name), id, req.distributorId]
        );
        if (!result.affectedRows) throw httpError(404, 'Area not found.');
        await db.execute('UPDATE distributor_outlets SET area = ? WHERE area_id = ? AND distributor_id = ?', [name, id, req.distributorId]);
        return res.json({ message: 'Saved.', area: { id, name } });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This area is already added.' });
        return sendError(res, error, 'Unable to save the area.');
    }
};

// DELETE /api/distributor/areas/:id  (only when no outlet uses it)
export const deleteArea = async (req, res) => {
    try {
        const id = parseId(req.params.id) || 0;
        const [used] = await db.execute('SELECT COUNT(*) AS n FROM distributor_outlets WHERE area_id = ? AND distributor_id = ?', [id, req.distributorId]);
        const n = num(used[0]?.n);
        if (n) throw httpError(409, `${n} outlet${n === 1 ? ' is' : 's are'} in this area. Move or remove ${n === 1 ? 'it' : 'them'} first.`);
        const [result] = await db.execute('DELETE FROM distributor_areas WHERE id = ? AND distributor_id = ?', [id, req.distributorId]);
        if (!result.affectedRows) throw httpError(404, 'Area not found.');
        return res.json({ message: 'Removed.' });
    } catch (error) {
        return sendError(res, error, 'Unable to remove the area.');
    }
};

// ---- outlets (shops the distributor sells to, added by the distributor) ----

const outletOf = (r) => ({
    id: r.id,
    code: r.outlet_code || `DOT${String(r.id).padStart(6, '0')}`,
    name: r.outlet_name,
    ownerName: r.owner_name,
    phone: r.contact_number,
    whatsapp: r.whatsapp_number,
    areaId: r.area_id || null,
    area: r.area_name || r.area,
    address: r.address,
    pinCode: r.pin_code,
    district: r.district,
    state: r.state || 'West Bengal',
    hasGst: Boolean(Number(r.has_gst)) || Boolean(r.gstin),
    gstin: r.gstin,
    googleLocation: r.google_location,
    isActive: Boolean(Number(r.is_active)),
    createdAt: r.created_at,
});

const digitsOnly = (value, max) => text(value, max).replace(/\s+/g, '');

const readOutlet = (body) => {
    const name = text(body?.name, 255);
    const phone = digitsOnly(body?.phone, 15);
    const whatsapp = digitsOnly(body?.whatsapp, 15);
    const pinCode = digitsOnly(body?.pinCode, 10);
    const hasGst = Boolean(body?.hasGst);
    // No GST: any GSTIN typed earlier is dropped.
    const gstin = hasGst ? text(body?.gstin, 20).toUpperCase() : '';
    const googleLocation = text(body?.googleLocation, 500);
    if (!name) throw httpError(400, 'Enter the outlet name.');
    if (!/^\d{10}$/.test(phone)) throw httpError(400, 'Enter a 10-digit mobile number.');
    if (whatsapp && !/^\d{10}$/.test(whatsapp)) throw httpError(400, 'Enter a 10-digit WhatsApp number, or leave it empty.');
    if (pinCode && !/^\d{6}$/.test(pinCode)) throw httpError(400, 'Enter a 6-digit PIN code, or leave it empty.');
    if (hasGst && !gstin) throw httpError(400, 'Enter the GSTIN, or switch GST off.');
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) throw httpError(400, 'A GSTIN has 15 letters and digits.');
    if (googleLocation && !/^https?:\/\//i.test(googleLocation)) throw httpError(400, 'The map location must be a link (https://...).');
    const areaId = parseId(body?.areaId);
    if (!areaId) throw httpError(400, 'Choose the area. Add areas on the Areas page first.');
    return {
        name,
        ownerName: text(body?.ownerName, 120) || null,
        phone,
        whatsapp: whatsapp || null,
        areaId,
        address: text(body?.address, 500) || null,
        pinCode: pinCode || null,
        district: text(body?.district, 120) || null,
        state: text(body?.state, 80) || 'West Bengal',
        hasGst,
        gstin: gstin || null,
        googleLocation: googleLocation || null,
    };
};

// The area must be one of this distributor's areas; its name is also kept on the outlet.
const areaFor = async (distributorId, areaId) => {
    const [rows] = await db.execute('SELECT id, name FROM distributor_areas WHERE id = ? AND distributor_id = ?', [areaId, distributorId]);
    if (!rows.length) throw httpError(400, 'Choose one of your areas.');
    return rows[0];
};

const OUTLET_COLUMNS = 'outlet_name = ?, owner_name = ?, contact_number = ?, whatsapp_number = ?, area_id = ?, area = ?, address = ?, pin_code = ?, district = ?, state = ?, has_gst = ?, gstin = ?, google_location = ?';
const outletValues = (o, area) => [o.name, o.ownerName, o.phone, o.whatsapp, area.id, area.name, o.address, o.pinCode, o.district, o.state, o.hasGst ? 1 : 0, o.gstin, o.googleLocation];
const OUTLET_SQL = `SELECT o.*, a.name AS area_name FROM distributor_outlets o LEFT JOIN distributor_areas a ON a.id = o.area_id`;

// GET /api/distributor/outlets
export const listOutlets = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `${OUTLET_SQL} WHERE o.distributor_id = ? ORDER BY o.is_active DESC, o.outlet_name`,
            [req.distributorId]
        );
        return res.json({ outlets: rows.map(outletOf) });
    } catch (error) {
        return sendError(res, error, 'Unable to load outlets.');
    }
};

// POST /api/distributor/outlets
export const createOutlet = async (req, res) => {
    try {
        const o = readOutlet(req.body);
        const area = await areaFor(req.distributorId, o.areaId);
        const [dup] = await db.execute('SELECT id FROM distributor_outlets WHERE distributor_id = ? AND contact_number = ?', [req.distributorId, o.phone]);
        if (dup.length) throw httpError(409, 'An outlet with this mobile number is already added.');
        const [result] = await db.execute(
            `INSERT INTO distributor_outlets SET distributor_id = ?, ${OUTLET_COLUMNS}`,
            [req.distributorId, ...outletValues(o, area)]
        );
        const code = `DOT${String(result.insertId).padStart(6, '0')}`;
        await db.execute('UPDATE distributor_outlets SET outlet_code = ? WHERE id = ?', [code, result.insertId]);
        const [rows] = await db.execute(`${OUTLET_SQL} WHERE o.id = ?`, [result.insertId]);
        return res.status(201).json({ message: `${o.name} added (${code}).`, outlet: outletOf(rows[0]) });
    } catch (error) {
        return sendError(res, error, 'Unable to add the outlet.');
    }
};

// PUT /api/distributor/outlets/:id
export const updateOutlet = async (req, res) => {
    try {
        const id = parseId(req.params.id) || 0;
        const o = readOutlet(req.body);
        const area = await areaFor(req.distributorId, o.areaId);
        const [dup] = await db.execute(
            'SELECT id FROM distributor_outlets WHERE distributor_id = ? AND contact_number = ? AND id <> ?',
            [req.distributorId, o.phone, id]
        );
        if (dup.length) throw httpError(409, 'Another outlet has this mobile number.');
        const [result] = await db.execute(
            `UPDATE distributor_outlets SET ${OUTLET_COLUMNS} WHERE id = ? AND distributor_id = ?`,
            [...outletValues(o, area), id, req.distributorId]
        );
        if (!result.affectedRows) throw httpError(404, 'Outlet not found.');
        const [rows] = await db.execute(`${OUTLET_SQL} WHERE o.id = ?`, [id]);
        return res.json({ message: 'Saved.', outlet: outletOf(rows[0]) });
    } catch (error) {
        return sendError(res, error, 'Unable to save the outlet.');
    }
};

// PUT /api/distributor/outlets/:id/active  { isActive }
export const setOutletActive = async (req, res) => {
    try {
        const id = parseId(req.params.id) || 0;
        const active = req.body?.isActive ? 1 : 0;
        const [result] = await db.execute(
            'UPDATE distributor_outlets SET is_active = ? WHERE id = ? AND distributor_id = ?',
            [active, id, req.distributorId]
        );
        if (!result.affectedRows) throw httpError(404, 'Outlet not found.');
        return res.json({ message: active ? 'Marked active.' : 'Marked inactive.' });
    } catch (error) {
        return sendError(res, error, 'Unable to change the status.');
    }
};

// DELETE /api/distributor/outlets/:id
export const deleteOutlet = async (req, res) => {
    try {
        const id = parseId(req.params.id) || 0;
        const [result] = await db.execute('DELETE FROM distributor_outlets WHERE id = ? AND distributor_id = ?', [id, req.distributorId]);
        if (!result.affectedRows) throw httpError(404, 'Outlet not found.');
        return res.json({ message: 'Removed.' });
    } catch (error) {
        return sendError(res, error, 'Unable to remove the outlet.');
    }
};

// ---- account ----

// PUT /api/distributor/password  { currentPassword, newPassword }
// The admin can still view the password on Add Distributor, so the new one is also kept
// encrypted the same way (utils/passwordCipher.js).
export const changePassword = async (req, res) => {
    try {
        const current = String(req.body?.currentPassword || '');
        const next = String(req.body?.newPassword || '');
        if (next.length < 6) throw httpError(400, 'The new password needs at least 6 characters.');
        const [rows] = await db.execute('SELECT password_hash FROM distributors WHERE id = ?', [req.distributorId]);
        if (!rows.length || !(await bcrypt.compare(current, rows[0].password_hash || ''))) throw httpError(400, 'The current password is wrong.');
        await db.execute('UPDATE distributors SET password_hash = ?, password_encrypted = ? WHERE id = ?', [
            await bcrypt.hash(next, 10),
            encryptPassword(next),
            req.distributorId,
        ]);
        return res.json({ message: 'Password changed.' });
    } catch (error) {
        return sendError(res, error, 'Unable to change the password.');
    }
};
