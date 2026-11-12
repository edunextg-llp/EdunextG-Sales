import db from '../config/db.js';
import CompanyModel from '../models/companyModel.js';
import DmsStockModel from '../models/dmsStockModel.js';
import PhysicalStockModel from '../models/physicalStockModel.js';
import { buildCurrentStockDiff } from './currentStockController.js';
import { activeSchemesFor, freeFor } from './freeGoodsController.js';
import { takeFromLots } from '../utils/stockLots.js';

// DMS Sales > Create Sales (admin only). A bill to a distributor / CNF (Add Distributor) or
// to an outlet. Rates are GST-inclusive, like the sale prices entered on purchases:
//   Amount = Qty x Rate;  Taxable = Amount / (1 + GST%);  GST = Amount - Taxable.
// Free goods are worked out here from the running schemes (rate 0). Saving takes the stock
// off lot by lot (the line's own MRP lot first); cancelling puts it back.

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const sendError = (res, error, fallback) => {
    if (!error.statusCode && !error.code) console.error(fallback, error);
    // Stock messages from the stock model have no status: show them to the user.
    const message = error.statusCode || (!error.code && error.message) ? error.message : fallback;
    return res.status(error.statusCode || (error.code ? 500 : 400)).json({ error: message || fallback });
};
const parseId = (value) => {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
};
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const money = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;
const isoDate = (value) => {
    const t = String(value || '').trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
};
const erpKey = (value) => String(value || '').trim().toLowerCase();
const todayIst = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const PAYMENT_MODES = ['cash', 'upi', 'bank', 'cheque', 'credit'];
const byName = (user) => (user?.role === 'admin' ? 'Admin' : user?.username || null);

// Amount, taxable and GST of a line (rate includes GST).
const lineMoney = (qty, rate, gstPercent) => {
    const amount = money(qty * rate);
    const taxable = money(amount / (1 + num(gstPercent) / 100));
    return { amount, taxable, gst: money(amount - taxable) };
};

async function companyStock(company) {
    const dmsImport = await DmsStockModel.getLatestImportByCompanyName(company.name);
    if (!dmsImport) throw httpError(400, `No stock found for ${company.name}.`);
    const [dms, physical] = await Promise.all([
        DmsStockModel.getLatestItemsByCompanyId(company.id, 2000),
        PhysicalStockModel.getCurrentItemsByDmsImportId(dmsImport.id),
    ]);
    const stock = buildCurrentStockDiff(physical, dms);
    const [codes] = await db.execute(
        'SELECT product_erp_id, MAX(item_code) AS item_code, MAX(hsn_code) AS hsn_code FROM seller_items WHERE company_id = ? GROUP BY product_erp_id',
        [company.id]
    );
    const codeByErp = new Map(codes.map((c) => [erpKey(c.product_erp_id), c]));
    return new Map(stock.map((row) => [erpKey(row.product_erp_id), {
        ...row,
        item_code: codeByErp.get(erpKey(row.product_erp_id))?.item_code || '',
        hsn_code: row.hsn_code || codeByErp.get(erpKey(row.product_erp_id))?.hsn_code || '',
    }]));
}

async function resolveBuyer(body, companyId) {
    if (body?.buyerType === 'distributor') {
        const [rows] = await db.execute(
            `SELECT id, login_id, distributor_name, contact_no, address, city, state, pin_code, gstin, company_id, is_active
             FROM distributors WHERE id = ?`,
            [parseId(body.distributorId) || 0]
        );
        const d = rows[0];
        if (!d || Number(d.company_id) !== Number(companyId)) throw httpError(400, 'Choose a distributor of this company.');
        if (Number(d.is_active) !== 1) throw httpError(400, `${d.distributor_name} is inactive.`);
        return {
            buyerType: 'distributor',
            distributorId: d.id,
            outletId: null,
            name: d.distributor_name,
            code: d.login_id,
            contact: d.contact_no,
            address: [d.address, d.city, d.state, d.pin_code].filter(Boolean).join(', '),
            gstin: d.gstin || null,
        };
    }
    if (body?.buyerType === 'outlet') {
        const [rows] = await db.execute(
            `SELECT sc.id, sc.outlet_erp_id, sc.outlet_name, sc.contact_number, sc.address, sc.location_name, sc.gst_number
             FROM staff_counters sc
             INNER JOIN staff_companies scm ON scm.staff_id = sc.staff_id AND scm.company_id = ?
             WHERE sc.id = ? LIMIT 1`,
            [companyId, parseId(body.outletId) || 0]
        );
        const o = rows[0];
        if (!o) throw httpError(400, 'Choose an outlet of this company.');
        return {
            buyerType: 'outlet',
            distributorId: null,
            outletId: o.id,
            name: o.outlet_name,
            code: o.outlet_erp_id,
            contact: o.contact_number,
            address: o.address || o.location_name || '',
            gstin: o.gst_number || null,
        };
    }
    throw httpError(400, 'Choose Distributor / CNF or Outlet.');
}

// Outlets of the staff working for a company (for an outlet bill).
export const listOutlets = async (req, res) => {
    try {
        const companyId = parseId(req.query.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        const [rows] = await db.execute(
            `SELECT DISTINCT sc.id, sc.outlet_erp_id, sc.outlet_name, sc.contact_number, sc.location_name, sc.day,
                    s.name AS staff_name
             FROM staff_counters sc
             INNER JOIN staff_companies scm ON scm.staff_id = sc.staff_id AND scm.company_id = ?
             LEFT JOIN staff s ON s.id = sc.staff_id
             ORDER BY sc.outlet_name`,
            [companyId]
        );
        return res.json({ outlets: rows });
    } catch (error) {
        return sendError(res, error, 'Unable to load outlets.');
    }
};

export const listSales = async (req, res) => {
    try {
        const where = [];
        const params = [];
        const companyId = parseId(req.query.companyId);
        if (companyId) {
            where.push('s.company_id = ?');
            params.push(companyId);
        }
        if (['distributor', 'outlet'].includes(req.query.buyerType)) {
            where.push('s.buyer_type = ?');
            params.push(req.query.buyerType);
        }
        if (isoDate(req.query.from)) {
            where.push('s.sale_date >= ?');
            params.push(isoDate(req.query.from));
        }
        if (isoDate(req.query.to)) {
            where.push('s.sale_date <= ?');
            params.push(isoDate(req.query.to));
        }
        if (req.query.due === '1') where.push("s.status = 'active' AND s.balance_amount > 0");
        const [rows] = await db.execute(
            `SELECT s.*, DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS sale_date,
                    DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i:%s') AS created_at, c.name AS company_name
             FROM dms_sales s
             LEFT JOIN companies c ON c.id = s.company_id
             ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY s.sale_date DESC, s.id DESC
             LIMIT 1000`,
            params
        );
        return res.json({ sales: rows });
    } catch (error) {
        return sendError(res, error, 'Unable to load sales.');
    }
};

export const getSale = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const [rows] = await db.execute(
            `SELECT s.*, DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS sale_date, c.name AS company_name
             FROM dms_sales s LEFT JOIN companies c ON c.id = s.company_id WHERE s.id = ?`,
            [id || 0]
        );
        if (!rows.length) throw httpError(404, 'Sale not found.');
        const [items] = await db.execute(
            `SELECT *, DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiry_date FROM dms_sale_items
             WHERE sale_id = ? ORDER BY sort_order, id`,
            [id]
        );
        const [payments] = await db.execute(
            `SELECT id, DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date, amount, payment_mode, reference, created_by_name
             FROM dms_sale_payments WHERE sale_id = ? ORDER BY payment_date, id`,
            [id]
        );
        return res.json({ sale: rows[0], items, payments });
    } catch (error) {
        return sendError(res, error, 'Unable to load the sale.');
    }
};

export const createSale = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const companyId = parseId(req.body?.companyId);
        const company = companyId ? await CompanyModel.getById(companyId) : null;
        if (!company) throw httpError(400, 'Select a company.');
        const invoiceNumber = String(req.body?.invoiceNumber || '').trim().slice(0, 50);
        if (!invoiceNumber) throw httpError(400, 'Enter the invoice number.');
        const saleDate = isoDate(req.body?.saleDate) || todayIst();
        if (saleDate > todayIst()) throw httpError(400, 'The bill date cannot be in the future.');
        const [dup] = await db.execute('SELECT id FROM dms_sales WHERE company_id = ? AND invoice_number = ?', [companyId, invoiceNumber]);
        if (dup.length) throw httpError(409, `Invoice ${invoiceNumber} already exists for ${company.name}.`);
        const buyer = await resolveBuyer(req.body, companyId);

        const stock = await companyStock(company);
        const lotsByErp = new Map();
        const lotsOf = (key) => {
            if (!lotsByErp.has(key)) lotsByErp.set(key, (stock.get(key)?.lots || []).map((lot) => ({ ...lot })));
            return lotsByErp.get(key);
        };

        // Paid lines: each from its MRP lot (or in selling order), at the rate given.
        const requested = (Array.isArray(req.body?.lines) ? req.body.lines : []).filter((l) => !l.isFree && num(l.qty) > 0);
        if (!requested.length) throw httpError(400, 'Add at least one item.');
        const lines = [];
        for (const line of requested) {
            const key = erpKey(line.productErpId);
            const product = stock.get(key);
            if (!product) throw httpError(400, `${line.productErpId} is not in ${company.name}'s stock.`);
            const qty = num(line.qty);
            const rate = money(line.rate);
            if (rate < 0) throw httpError(400, `Enter a valid rate for ${line.productErpId}.`);
            const preferred = num(line.mrp) > 0 ? { mrp: line.mrp, batchNumber: line.batchNumber, expiryDate: line.expiryDate } : null;
            const { taken, short } = takeFromLots(lotsOf(key), qty, preferred);
            if (short > 0) throw httpError(400, `Not enough stock of ${product.variant_name || product.product_name}: ${qty - short} pcs left.`);
            taken.forEach(({ lot, qty: lotQty }) => lines.push({ product, lot, qty: lotQty, rate, isFree: false }));
        }

        // Free goods from the running schemes, rate 0, only what is in stock.
        const schemes = await activeSchemesFor(companyId);
        const bought = new Map();
        lines.forEach((l) => bought.set(erpKey(l.product.product_erp_id), (bought.get(erpKey(l.product.product_erp_id)) || 0) + l.qty));
        for (const { scheme, freeErpId, freeQty } of freeFor(schemes, bought)) {
            const key = erpKey(freeErpId);
            const product = stock.get(key);
            if (!product) continue;
            takeFromLots(lotsOf(key), freeQty).taken.forEach(({ lot, qty }) => lines.push({
                product, lot, qty, rate: 0, isFree: true, freeNote: `Buy ${scheme.buy_qty} get ${scheme.free_qty} free`,
            }));
        }

        const rows = lines.map((l, index) => {
            const gstPercent = num(l.product.gst_percent) || 5;
            return { ...l, index, gstPercent, ...lineMoney(l.qty, l.rate, gstPercent) };
        });
        const sum = (field) => money(rows.reduce((t, r) => t + num(r[field]), 0));
        const exact = sum('amount');
        const total = Math.round(exact);
        const roundOff = money(total - exact);
        const paid = Math.min(money(req.body?.paidAmount), total);
        if (paid < 0) throw httpError(400, 'Paid amount cannot be negative.');
        const mode = PAYMENT_MODES.includes(req.body?.paymentMode) ? req.body.paymentMode : 'cash';

        await connection.beginTransaction();
        const [result] = await connection.execute(
            `INSERT INTO dms_sales
                (invoice_number, sale_date, company_id, buyer_type, distributor_id, outlet_id, buyer_name, buyer_code,
                 buyer_contact, buyer_address, buyer_gstin, item_count, total_qty, taxable_amount, gst_amount, round_off,
                 total_amount, paid_amount, balance_amount, remarks, created_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                invoiceNumber, saleDate, companyId, buyer.buyerType, buyer.distributorId, buyer.outletId, buyer.name,
                buyer.code || null, buyer.contact || null, buyer.address || null, buyer.gstin,
                rows.length, sum('qty'), sum('taxable'), sum('gst'), roundOff, total, paid, money(total - paid),
                String(req.body?.remarks || '').trim().slice(0, 1000) || null, byName(req.user),
            ]
        );
        const saleId = result.insertId;
        for (const r of rows) {
            await connection.execute(
                `INSERT INTO dms_sale_items
                    (sale_id, product_erp_id, item_code, product_name, variant_name, hsn_code, mrp, batch_number, expiry_date,
                     qty, rate, gst_percent, taxable_amount, gst_amount, amount, is_free, free_note, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    saleId, r.product.product_erp_id, r.product.item_code || null, r.product.product_name || null,
                    r.product.variant_name || null, r.product.hsn_code || null, num(r.lot.mrp) || null,
                    r.lot.batchNumber || null, isoDate(r.lot.expiryDate), r.qty, r.rate, r.gstPercent, r.taxable, r.gst,
                    r.amount, r.isFree ? 1 : 0, r.freeNote || null, r.index,
                ]
            );
        }
        if (paid > 0) {
            await connection.execute(
                `INSERT INTO dms_sale_payments (sale_id, payment_date, amount, payment_mode, reference, created_by_name)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [saleId, saleDate, paid, mode, String(req.body?.paymentReference || '').trim().slice(0, 255) || null, byName(req.user)]
            );
        }
        // Stock off, each line from its own MRP lot.
        await PhysicalStockModel.deductStockForCompany(
            connection,
            company.name,
            rows.map((r) => ({
                productErpId: r.product.product_erp_id,
                qty: r.qty,
                mrp: r.lot.mrp,
                batchNumber: r.lot.batchNumber,
                expiryDate: r.lot.expiryDate,
            })),
            `DMS Sale ${invoiceNumber}`
        );
        await connection.commit();
        return res.status(201).json({ id: saleId, message: `Invoice ${invoiceNumber} saved for ${buyer.name}.` });
    } catch (error) {
        await connection.rollback().catch(() => {});
        return sendError(res, error, 'Unable to save the sale.');
    } finally {
        connection.release();
    }
};

// A later payment against a bill's balance.
export const addPayment = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const id = parseId(req.params.id);
        await connection.beginTransaction();
        const [rows] = await connection.execute('SELECT * FROM dms_sales WHERE id = ? FOR UPDATE', [id || 0]);
        const sale = rows[0];
        if (!sale) throw httpError(404, 'Sale not found.');
        if (sale.status !== 'active') throw httpError(400, 'This bill is cancelled.');
        const amount = money(req.body?.amount);
        if (!(amount > 0)) throw httpError(400, 'Enter the amount received.');
        if (amount > num(sale.balance_amount)) throw httpError(400, `Only ${money(sale.balance_amount)} is due on this bill.`);
        const mode = PAYMENT_MODES.includes(req.body?.paymentMode) ? req.body.paymentMode : 'cash';
        const date = isoDate(req.body?.paymentDate) || todayIst();
        await connection.execute(
            `INSERT INTO dms_sale_payments (sale_id, payment_date, amount, payment_mode, reference, created_by_name)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, date, amount, mode, String(req.body?.reference || '').trim().slice(0, 255) || null, byName(req.user)]
        );
        await connection.execute(
            'UPDATE dms_sales SET paid_amount = paid_amount + ?, balance_amount = balance_amount - ? WHERE id = ?',
            [amount, amount, id]
        );
        await connection.commit();
        return res.json({ message: `Payment of ${amount.toFixed(2)} recorded on ${sale.invoice_number}.` });
    } catch (error) {
        await connection.rollback().catch(() => {});
        return sendError(res, error, 'Unable to record the payment.');
    } finally {
        connection.release();
    }
};

// Cancel a bill: its stock goes back to the lots it came from.
export const cancelSale = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const id = parseId(req.params.id);
        await connection.beginTransaction();
        const [rows] = await connection.execute(
            'SELECT s.*, c.name AS company_name FROM dms_sales s LEFT JOIN companies c ON c.id = s.company_id WHERE s.id = ? FOR UPDATE',
            [id || 0]
        );
        const sale = rows[0];
        if (!sale) throw httpError(404, 'Sale not found.');
        if (sale.status === 'cancelled') throw httpError(400, 'This bill is already cancelled.');
        const reason = String(req.body?.reason || '').trim().slice(0, 500);
        if (!reason) throw httpError(400, 'Enter why the bill is cancelled.');
        const [items] = await connection.execute(
            `SELECT product_erp_id, product_name, variant_name, qty, rate, mrp, batch_number,
                    DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiry_date
             FROM dms_sale_items WHERE sale_id = ?`,
            [id]
        );
        await PhysicalStockModel.restoreStockForCompany(connection, sale.company_name, items, `DMS Sale ${sale.invoice_number} cancelled`);
        await connection.execute(
            "UPDATE dms_sales SET status = 'cancelled', cancel_reason = ?, balance_amount = 0 WHERE id = ?",
            [reason, id]
        );
        await connection.commit();
        return res.json({ message: `Invoice ${sale.invoice_number} cancelled; stock put back.` });
    } catch (error) {
        await connection.rollback().catch(() => {});
        return sendError(res, error, 'Unable to cancel the bill.');
    } finally {
        connection.release();
    }
};
