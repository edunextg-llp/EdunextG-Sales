import db from '../config/db.js';
import CompanyModel from '../models/companyModel.js';
import DmsStockModel from '../models/dmsStockModel.js';
import PhysicalStockModel from '../models/physicalStockModel.js';
import { buildCurrentStockDiff } from './currentStockController.js';
import { activeSchemesFor, freeFor } from './freeGoodsController.js';
import { getBilledOrderFreeSchemes, getOrderFreeSchemes, markOrderBilled } from './distributorOrderController.js';
import { takeFromLots } from '../utils/stockLots.js';
import { getCompanyBillPrefix, normalizeInvoiceNumber } from '../utils/invoiceNumber.js';

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

export async function companyStock(company, executor = db, lockProducts = null) {
    const dmsImport = await DmsStockModel.getLatestImportByCompanyName(company.name, executor);
    if (!dmsImport) throw httpError(400, `No stock found for ${company.name}.`);
    const [dms, countedStock] = await Promise.all([
        DmsStockModel.getLatestItemsByCompanyId(company.id, 2000, executor),
        PhysicalStockModel.getCurrentItemsByDmsImportId(dmsImport.id, 2000, executor),
    ]);
    const physical = [];
    for (const item of countedStock) {
        physical.push(lockProducts?.has(erpKey(item.product_erp_id))
            ? await PhysicalStockModel.lockCurrentItem(executor, item) : item);
    }
    const stock = buildCurrentStockDiff(physical, dms);
    const [codes] = await executor.execute(
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

// Next bill number for a company, in sequence: first 3 letters of the company + a 6-digit
// running number (SIL000001, SIL000002, …), one after the highest used on its DMS bills.
// Numbers already used anywhere are skipped: on DMS bills, and on the old Add Sales bills
// (staff_sales has no company, but it makes its numbers with the same 3-letter prefix).
export const nextInvoiceNumber = async (req, res) => {
    try {
        const companyId = parseId(req.query.companyId);
        const company = companyId ? await CompanyModel.getById(companyId) : null;
        if (!company) throw httpError(400, 'Select a company.');
        const prefix = getCompanyBillPrefix(company.name);
        const [rows] = await db.execute('SELECT invoice_number FROM dms_sales WHERE company_id = ?', [companyId]);
        const [oldRows] = await db.execute('SELECT invoice_number FROM staff_sales WHERE invoice_number LIKE ?', [`${prefix}%`]);
        const used = new Set([...rows, ...oldRows].map((r) => normalizeInvoiceNumber(r.invoice_number)));
        const pattern = new RegExp(`^${prefix}(\\d+)$`, 'i');
        let next = 1 + rows.reduce((max, r) => {
            const m = String(r.invoice_number || '').trim().match(pattern);
            return m ? Math.max(max, Number(m[1])) : max;
        }, 0);
        while (used.has(normalizeInvoiceNumber(`${prefix}${String(next).padStart(6, '0')}`))) next += 1;
        return res.json({ billNumber: `${prefix}${String(next).padStart(6, '0')}` });
    } catch (error) {
        return sendError(res, error, 'Unable to make a bill number.');
    }
};

// Outlets of the staff working for a company (for an outlet bill).
export const listOutlets = async (req, res) => {
    try {
        const companyId = parseId(req.query.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        const [rows] = await db.execute(
            `SELECT DISTINCT sc.id, sc.outlet_erp_id, sc.outlet_name, sc.contact_number, sc.location_name, sc.day,
                    sc.staff_id, s.name AS staff_name
             FROM staff_counters sc
             INNER JOIN staff_companies scm ON scm.staff_id = sc.staff_id AND scm.company_id = ?
             LEFT JOIN staff s ON s.id = sc.staff_id
             ORDER BY s.name, sc.location_name, sc.outlet_name`,
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

const soldLinesSql = (filters = '') => `
    SELECT s.company_id, s.sale_date, i.product_erp_id, i.variant_name, i.product_name, i.qty, i.amount
    FROM dms_sales s
    JOIN dms_sale_items i ON i.sale_id = s.id
    WHERE s.status = 'active' AND i.is_free = 0${filters}

    UNION ALL

    SELECT c.id, s.sale_date, i.product_erp_id, i.variant_name, i.product_name, i.qty, i.line_total
    FROM staff_sales s
    JOIN staff_sale_items i ON i.sale_id = s.id
    LEFT JOIN staff employee ON employee.id = s.staff_id
    JOIN companies c ON (
        c.name = NULLIF(TRIM(i.product_division), '')
        OR (NULLIF(TRIM(i.product_division), '') IS NULL AND c.id = employee.company_id)
    )
    WHERE COALESCE(s.packaging_status, '') <> 'cancelled' AND i.rate > 0
    ${filters.replace('s.company_id', 'c.id')}`;

export const getItemSalesRanking = async (req, res) => {
    try {
        const { month, companyId, metric = 'quantity' } = req.query;
        if (month !== undefined && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
            throw httpError(400, 'Choose a valid sales month.');
        }
        if (companyId !== undefined && !/^[1-9]\d*$/.test(companyId)) {
            throw httpError(400, 'Choose a valid company.');
        }
        if (!['quantity', 'amount'].includes(metric)) throw httpError(400, 'Choose a valid ranking metric.');

        const conditions = [];
        const params = [];
        if (month) {
            conditions.push('s.sale_date >= ? AND s.sale_date < DATE_ADD(?, INTERVAL 1 MONTH)');
            params.push(`${month}-01`, `${month}-01`);
        }
        if (companyId) {
            conditions.push('s.company_id = ?');
            params.push(companyId);
        }
        const orderBy = metric === 'amount' ? 'amount_sold' : 'quantity_sold';
        const filters = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
        const [items] = await db.execute(
            `WITH sold_lines AS (${soldLinesSql(filters)})
             SELECT c.id AS company_id, c.name AS company_name, i.product_erp_id,
                    COALESCE(MAX(NULLIF(i.variant_name, '')), MAX(NULLIF(i.product_name, '')), i.product_erp_id) AS item_name,
                    SUM(i.qty) AS quantity_sold, SUM(i.amount) AS amount_sold
             FROM sold_lines i
             JOIN companies c ON c.id = i.company_id
             GROUP BY c.id, c.name, i.product_erp_id
             ORDER BY ${orderBy} DESC, c.id, i.product_erp_id
             LIMIT 10`,
            [...params, ...params]
        );
        return res.json({ items });
    } catch (error) {
        return sendError(res, error, 'Unable to load item sales.');
    }
};

export const getItemStockInsights = async (req, res) => {
    try {
        const { companyId } = req.query;
        if (!/^[1-9]\d*$/.test(companyId)) throw httpError(400, 'Choose a valid company.');
        const asOf = todayIst();
        const monthStart = `${asOf.slice(0, 7)}-01`;
        const salesParams = [companyId, monthStart, asOf];
        const [salesResult, purchaseResult] = await Promise.all([
            db.execute(
                `WITH sold_lines AS (${soldLinesSql(' AND s.company_id = ? AND s.sale_date >= DATE_SUB(?, INTERVAL 11 MONTH) AND s.sale_date <= ?')})
                 SELECT LOWER(TRIM(product_erp_id)) AS item_key,
                        COALESCE(MAX(NULLIF(variant_name, '')), MAX(NULLIF(product_name, '')), MAX(product_erp_id)) AS item_name,
                        DATE_FORMAT(sale_date, '%Y-%m') AS month_key, SUM(qty) AS units, SUM(amount) AS amount,
                        SUM(CASE WHEN sale_date >= DATE_SUB(?, INTERVAL 29 DAY) THEN qty ELSE 0 END) AS units_30,
                        SUM(CASE WHEN sale_date >= DATE_SUB(?, INTERVAL 59 DAY) THEN qty ELSE 0 END) AS units_60,
                        SUM(CASE WHEN sale_date >= DATE_SUB(?, INTERVAL 89 DAY) THEN qty ELSE 0 END) AS units_90
                 FROM sold_lines
                 GROUP BY item_key, month_key`,
                [...salesParams, ...salesParams, asOf, asOf, asOf]
            ),
            db.execute(
                `SELECT LOWER(TRIM(i.product_erp_id)) AS item_key,
                        COALESCE(MAX(NULLIF(i.variant_name, '')), MAX(NULLIF(i.product_name, '')), MAX(i.product_erp_id)) AS item_name,
                        DATE_FORMAT(p.upload_date, '%Y-%m') AS month_key, SUM(i.total_pieces) AS units
                 FROM dms_stock_imports p
                 JOIN dms_stock_items i ON i.import_id = p.id
                 WHERE p.company_id = ? AND p.upload_date BETWEEN DATE_SUB(?, INTERVAL 11 MONTH) AND ?
                   AND (p.seller_id IS NOT NULL OR NULLIF(TRIM(p.invoice_number), '') IS NOT NULL OR p.file_name = 'Manual Entry')
                   AND NULLIF(TRIM(i.product_erp_id), '') IS NOT NULL
                 GROUP BY item_key, month_key`,
                salesParams
            ),
        ]);
        return res.json({ asOf, sales: salesResult[0], purchases: purchaseResult[0] });
    } catch (error) {
        return sendError(res, error, 'Unable to load item stock insights.');
    }
};

const draftOwner = (user) => {
    const id = Number(user?.id || user?.deliveryBoyId || user?.staffId);
    if (!Number.isSafeInteger(id) || id <= 0 || !user?.role) throw httpError(403, 'Sign in to use sales drafts.');
    return [user.role, id];
};

const draftFields = `d.id, d.company_id, c.name AS company_name, d.buyer_name, d.invoice_number, d.revision,
    DATE_FORMAT(d.sale_date, '%Y-%m-%d') AS sale_date,
    DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at`;

export const listSaleDrafts = async (req, res) => {
    try {
        const [drafts] = await db.execute(
            `SELECT ${draftFields}, JSON_LENGTH(JSON_EXTRACT(d.payload, '$.lineItems')) AS line_count
             FROM dms_sale_drafts d LEFT JOIN companies c ON c.id = d.company_id
             WHERE d.owner_role = ? AND d.owner_id = ?
             ORDER BY d.updated_at DESC, d.id DESC`,
            draftOwner(req.user)
        );
        return res.json({ drafts });
    } catch (error) {
        return sendError(res, error, 'Unable to load sales drafts.');
    }
};

export const getSaleDraft = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT ${draftFields}, d.payload FROM dms_sale_drafts d LEFT JOIN companies c ON c.id = d.company_id
             WHERE d.owner_role = ? AND d.owner_id = ? AND d.id = ?`,
            [...draftOwner(req.user), parseId(req.params.id) || 0]
        );
        const draft = rows[0];
        if (!draft) throw httpError(404, 'Sales draft not found.');
        return res.json({ draft: { ...draft, payload: typeof draft.payload === 'string' ? JSON.parse(draft.payload) : draft.payload } });
    } catch (error) {
        return sendError(res, error, 'Unable to open the sales draft.');
    }
};

const draftText = (value, limit) => ['string', 'number'].includes(typeof value) ? String(value).trim().slice(0, limit) : '';
const draftLine = (line) => ({
    productErpId: draftText(line?.productErpId, 100),
    productName: draftText(line?.productName, 255),
    productDivision: draftText(line?.productDivision, 255),
    variantName: draftText(line?.variantName, 255),
    availableStock: num(line?.availableStock),
    qty: draftText(line?.qty, 32),
    rate: draftText(line?.rate, 32),
    priceType: ['retail', 'wholesale'].includes(line?.priceType) ? line.priceType : 'retail',
    retailPrice: num(line?.retailPrice),
    wholesalePrice: num(line?.wholesalePrice),
    mrp: draftText(line?.mrp, 32),
    batchNumber: draftText(line?.batchNumber, 100),
    expiryDate: draftText(line?.expiryDate, 10),
    rateEdited: line?.rateEdited === true,
    rateBeforeGst: line?.rateBeforeGst === true,
    gstPercent: line?.gstPercent == null ? null : num(line.gstPercent),
});

export const saveSaleDraft = async (req, res) => {
    try {
        const owner = draftOwner(req.user);
        const body = req.body || {};
        const companyId = parseId(body.companyId);
        const company = companyId ? await CompanyModel.getById(companyId) : null;
        if (!company) throw httpError(400, 'Select a company.');
        const buyer = await resolveBuyer(body, companyId);
        const saleDate = isoDate(body.saleDate);
        if (!saleDate || saleDate !== body.saleDate || saleDate > todayIst()
            || Number.isNaN(Date.parse(saleDate)) || new Date(saleDate).toISOString().slice(0, 10) !== saleDate) {
            throw httpError(400, 'Choose a valid sale date.');
        }
        const lines = Array.isArray(body.lineItems) ? body.lineItems : [];
        if (lines.length > 500) throw httpError(400, 'A draft can hold up to 500 items.');
        const payload = JSON.stringify({
            buyerType: buyer.buyerType,
            buyerId: buyer.distributorId || buyer.outletId,
            lineItems: lines.filter((line) => line?.productErpId && !line.isFree).map(draftLine),
            pendingLine: draftLine(body.pendingLine),
            requisitionNumber: draftText(body.requisitionNumber, 50),
            remarks: draftText(body.remarks, 1000),
            flatDiscount: draftText(body.flatDiscount, 32),
            roundOff: draftText(body.roundOff, 32),
        });
        const values = [companyId, buyer.name, draftText(body.invoiceNumber, 50) || null, saleDate, payload];
        const sameDraft = `company_id = ? AND buyer_name = ? AND invoice_number <=> ? AND sale_date = ? AND payload = CAST(? AS JSON)`;
        if (req.params.id !== undefined) {
            const id = parseId(req.params.id) || 0;
            const revision = parseId(body.revision) || 0;
            const [result] = await db.execute(
                `UPDATE dms_sale_drafts SET company_id = ?, buyer_name = ?, invoice_number = ?, sale_date = ?, payload = ?, revision = revision + 1
                 WHERE owner_role = ? AND owner_id = ? AND id = ? AND revision = ?`,
                [...values, ...owner, id, revision]
            );
            if (!result.affectedRows) {
                // A previous autosave may have committed before its response was lost.
                const [[saved]] = await db.execute(
                    `SELECT id FROM dms_sale_drafts
                     WHERE owner_role = ? AND owner_id = ? AND id = ? AND revision = ? AND ${sameDraft}`,
                    [...owner, id, revision + 1, ...values]
                );
                if (!saved) throw httpError(409, 'This draft has changed or is no longer available. Reopen it from the drafts list.');
            }
            return res.json({ id, revision: revision + 1, message: 'Draft updated.' });
        }
        const clientKey = typeof body.clientKey === 'string' && /^[a-f0-9]{32}$/.test(body.clientKey) ? body.clientKey : null;
        try {
            const [result] = await db.execute(
                'INSERT INTO dms_sale_drafts (owner_role, owner_id, company_id, buyer_name, invoice_number, sale_date, payload, client_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [...owner, ...values, clientKey]
            );
            return res.status(201).json({ id: result.insertId, revision: 1, message: 'Draft saved.' });
        } catch (error) {
            if (!clientKey || error.code !== 'ER_DUP_ENTRY') throw error;
            const [[saved]] = await db.execute(
                `SELECT id, revision FROM dms_sale_drafts WHERE owner_role = ? AND owner_id = ? AND client_key = ? AND ${sameDraft}`,
                [...owner, clientKey, ...values]
            );
            if (!saved) throw httpError(409, 'This draft already exists. Reopen it from the drafts list before saving more changes.');
            return res.json({ ...saved, message: 'Draft saved.' });
        }
    } catch (error) {
        return sendError(res, error, 'Unable to save the draft.');
    }
};

async function getBillItems(executor, id) {
    const [items] = await executor.execute(
        `SELECT *, DATE_FORMAT(expiry_date, '%Y-%m-%d') AS expiry_date
         FROM dms_sale_items WHERE sale_id = ? ORDER BY sort_order, id`,
        [id]
    );
    return items;
}

export const getSale = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const [rows] = await db.execute(
            `SELECT s.*, DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS sale_date, c.name AS company_name, c.type AS company_type
             FROM dms_sales s LEFT JOIN companies c ON c.id = s.company_id WHERE s.id = ?`,
            [id || 0]
        );
        if (!rows.length) throw httpError(404, 'Sale not found.');
        const items = await getBillItems(db, id);
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

async function saveBillItems(connection, saleId, rows) {
    for (const [index, r] of rows.entries()) {
        await connection.execute(
            `INSERT INTO dms_sale_items
                (sale_id, product_erp_id, item_code, product_name, variant_name, hsn_code, mrp, batch_number, expiry_date,
                 qty, rate, rate_before_gst, gst_percent, taxable_amount, gst_amount, amount, is_free, free_note, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                saleId, r.product.product_erp_id, r.product.item_code || null, r.product.product_name || null,
                r.product.variant_name || null, r.product.hsn_code || null, num(r.lot.mrp) || null,
                r.lot.batchNumber || null, isoDate(r.lot.expiryDate), r.qty, r.rate, r.rateBeforeGst ?? null, r.gstPercent, r.taxable, r.gst,
                r.amount, r.isFree ? 1 : 0, r.freeNote || null, index,
            ]
        );
    }
}

const stockLinesOf = (rows) => rows.map(({ product, lot, qty }) => ({
    productErpId: product.product_erp_id, qty, mrp: lot.mrp, batchNumber: lot.batchNumber, expiryDate: lot.expiryDate,
}));

const savedLotOf = (item) => ({ mrp: item.mrp, batchNumber: item.batch_number, expiryDate: item.expiry_date });

function recordedBillOffers(items) {
    const paid = new Map();
    const free = new Map();
    let main;
    for (const item of items) {
        if (!Number(item.is_free)) {
            main = item;
            const key = erpKey(item.product_erp_id);
            paid.set(key, (paid.get(key) || 0) + num(item.qty));
        } else if (main) {
            const key = erpKey(main.product_erp_id);
            if (!free.has(key)) free.set(key, { main, item, qty: 0 });
            free.get(key).qty += num(item.qty);
        }
    }
    const schemes = new Map();
    for (const [key, { main, item, qty }] of free) {
        const terms = /\(buy (\d+(?:\.\d+)?) get (\d+(?:\.\d+)?)\)$/.exec(item.free_note || '');
        schemes.set(key, {
            product_erp_id: main.product_erp_id,
            item_name: main.variant_name || main.product_name,
            free_product_erp_id: item.product_erp_id,
            free_item_name: item.variant_name || item.product_name,
            buy_qty: Number(terms?.[1]) || paid.get(key),
            free_qty: Number(terms?.[2]) || qty,
            free_note: item.free_note,
        });
    }
    return { recorded: free, schemes };
}

async function offersForSaleEdit(sale, date, previous, executor) {
    const historical = recordedBillOffers(previous);
    const orderSchemes = sale.buyer_type === 'distributor' ? await getBilledOrderFreeSchemes(sale.id, executor) : null;
    const schemes = orderSchemes ?? await activeSchemesFor(sale.company_id, date, executor);
    if (orderSchemes || date === sale.sale_day) {
        for (const [key, scheme] of historical.schemes) {
            if (!orderSchemes || !schemes.has(key)) schemes.set(key, scheme);
        }
    }
    return { schemes, recorded: historical.recorded };
}

export const getSaleEditOffers = async (req, res) => {
    try {
        const id = parseId(req.params.id) || 0;
        const [[sale]] = await db.execute(
            "SELECT *, DATE_FORMAT(sale_date, '%Y-%m-%d') AS sale_day FROM dms_sales WHERE id = ?",
            [id]
        );
        if (!sale) throw httpError(404, 'Sale not found.');
        if (sale.status !== 'active') throw httpError(409, 'Cancelled bills cannot be edited.');
        const date = req.query.date || sale.sale_day;
        if (isoDate(date) !== date || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
            throw httpError(400, 'Choose a valid sale date.');
        }
        const { schemes } = await offersForSaleEdit(sale, date, await getBillItems(db, id), db);
        return res.json({ schemes: [...schemes.values()] });
    } catch (error) {
        return sendError(res, error, 'Unable to load the free goods offers for this bill.');
    }
};

function appendBillFreeGoods(lines, offers, stock, lotsOf) {
    const freeByMain = new Map();
    for (const { scheme, freeErpId, freeQty } of offers) {
        const key = erpKey(freeErpId);
        const product = stock.get(key);
        if (!product) continue;
        const mainKey = erpKey(scheme.product_erp_id);
        const mainItem = stock.get(mainKey);
        const mainName = scheme.item_name || mainItem?.variant_name || mainItem?.product_name || scheme.product_erp_id;
        const freeNote = (scheme.free_note || `Free with ${mainName} (buy ${scheme.buy_qty} get ${scheme.free_qty})`).slice(0, 255);
        freeByMain.set(mainKey, takeFromLots(lotsOf(key), freeQty).taken.map(({ lot, qty }) => ({
            product, lot, qty, rate: 0, isFree: true, freeNote,
        })));
    }
    const lastLineByItem = new Map(lines.map((line, index) => [erpKey(line.product.product_erp_id), index]));
    return lines.flatMap((line, index) => {
        const key = erpKey(line.product.product_erp_id);
        return lastLineByItem.get(key) === index ? [line, ...(freeByMain.get(key) || [])] : [line];
    });
}

export const updateSale = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const id = parseId(req.params.id) || 0;
        const invoiceNumber = String(req.body?.invoiceNumber || '').trim();
        const saleDate = isoDate(req.body?.saleDate);
        if (!invoiceNumber || invoiceNumber.length > 50) throw httpError(400, 'Enter an invoice number up to 50 characters.');
        if (!saleDate || saleDate !== req.body.saleDate || saleDate > todayIst()
            || Number.isNaN(Date.parse(saleDate)) || new Date(saleDate).toISOString().slice(0, 10) !== saleDate) {
            throw httpError(400, 'Choose a valid sale date.');
        }
        const requested = req.body?.lines;
        if (!Array.isArray(requested) || !requested.length || requested.length > 500) {
            throw httpError(400, 'Enter between 1 and 500 bill lines.');
        }
        await connection.beginTransaction();
        const [[sale]] = await connection.execute(
            "SELECT *, DATE_FORMAT(sale_date, '%Y-%m-%d') AS sale_day FROM dms_sales WHERE id = ? FOR UPDATE",
            [id]
        );
        if (!sale) throw httpError(404, 'Sale not found.');
        if (sale.status !== 'active') throw httpError(409, 'Cancelled bills cannot be edited.');
        if (req.body.revision !== Number(sale.edit_revision)) throw httpError(409, 'This bill changed. Reopen it before editing.');
        const [[company]] = await connection.execute('SELECT id, name FROM companies WHERE id = ?', [sale.company_id]);
        if (!company) throw httpError(400, 'The company for this bill is unavailable.');

        if (invoiceNumber !== sale.invoice_number) {
            const [duplicates] = await connection.execute(
                `SELECT id FROM dms_sales WHERE company_id = ? AND invoice_number = ? AND id <> ?
                 UNION ALL SELECT id FROM staff_sales WHERE TRIM(invoice_number) = ? LIMIT 1`,
                [sale.company_id, invoiceNumber, id, invoiceNumber]
            );
            if (duplicates.length) throw httpError(409, `Invoice ${invoiceNumber} already exists.`);
        }

        const previous = await getBillItems(connection, id);
        const byId = new Map(previous.map((item) => [Number(item.id), item]));
        const usedIds = new Set();
        const lines = requested.filter((line) => !Number(byId.get(Number(line?.id))?.is_free)).map((line) => {
            const key = erpKey(line?.productErpId);
            const qty = Number(line?.qty);
            const beforeGst = line?.rateBeforeGst != null;
            const rate = Number(beforeGst ? line.rateBeforeGst : line?.rate);
            const itemId = Number(line?.id);
            const existing = itemId ? byId.get(itemId) : null;
            if (!key || !Number.isFinite(qty) || qty <= 0 || qty > 999999999999
                || Number(qty.toFixed(2)) !== qty || !Number.isFinite(rate) || rate < 0 || rate > 9999999999) {
                throw httpError(400, 'Each line needs a product, a positive quantity, and a valid rate.');
            }
            if (itemId && (!existing || usedIds.has(itemId) || erpKey(existing.product_erp_id) !== key)) {
                throw httpError(400, 'An edited line does not match this bill.');
            }
            if (existing) usedIds.add(itemId);
            const preferredLot = existing ? savedLotOf(existing) : num(line.mrp) > 0
                ? { mrp: line.mrp, batchNumber: draftText(line.batchNumber, 100), expiryDate: isoDate(line.expiryDate) }
                : null;
            return { key, qty, rate: beforeGst ? Number(rate.toFixed(4)) : money(rate), beforeGst, existing, preferredLot };
        });
        if (!lines.some((line) => line.rate > 0)) throw httpError(400, 'Add at least one paid item.');
        const { schemes, recorded } = await offersForSaleEdit(sale, saleDate, previous, connection);
        const bought = new Map();
        for (const { key, qty } of lines) bought.set(key, (bought.get(key) || 0) + qty);
        const offers = freeFor(schemes, bought);
        const stockChanged = lines.length !== previous.filter((item) => !Number(item.is_free)).length
            || lines.some(({ existing, qty }) => !existing || qty !== Number(existing.qty))
            || offers.length !== recorded.size
            || offers.some(({ scheme, freeErpId, freeQty }) => {
                const old = recorded.get(erpKey(scheme.product_erp_id));
                return !old || erpKey(old.item.product_erp_id) !== erpKey(freeErpId) || freeQty !== old.qty;
            });
        let current = null;
        if (stockChanged) {
            await PhysicalStockModel.restoreStockForCompany(connection, company.name, previous, `DMS Sale Edit #${id} · restore`);
            const products = new Set([...lines.map(({ key }) => key), ...offers.map(({ freeErpId }) => erpKey(freeErpId))]);
            current = await companyStock(company, connection, products);
            for (const product of current.values()) {
                for (const lot of product.lots) lot.pcs = Math.floor(Math.round(lot.pcs * 10000) / 100) / 100;
            }
        }
        const paid = [];
        for (const { key, qty, rate, beforeGst, existing, preferredLot } of lines) {
            const product = existing || current?.get(key);
            if (!product) throw httpError(400, `Product ${key} is unavailable.`);
            const gstPercent = existing ? num(existing.gst_percent) : num(product.gst_percent) || 5;
            const lots = stockChanged ? current.get(key)?.lots || [] : null;
            const available = stockChanged ? takeFromLots(lots, qty, preferredLot) : { taken: [{ lot: preferredLot, qty }], short: 0 };
            if (available.short > 0) throw httpError(400, `Not enough stock for ${product.variant_name || product.product_name || key}.`);
            paid.push(...available.taken.map(({ lot, qty: lotQty }) => ({
                product, lot, qty: lotQty, gstPercent,
                rate: beforeGst ? money(rate * (1 + gstPercent / 100)) : rate,
                rateBeforeGst: beforeGst ? rate : null,
            })));
        }
        const paidById = new Map(paid.map((line) => [Number(line.product.id), line]));
        const ordered = stockChanged
            ? appendBillFreeGoods(paid, offers, current, (key) => current.get(key)?.lots || [])
            : previous.map((item) => Number(item.is_free) ? {
                product: item, lot: savedLotOf(item), qty: num(item.qty), rate: 0,
                gstPercent: num(item.gst_percent), isFree: true, freeNote: item.free_note,
            } : paidById.get(Number(item.id)));
        const rows = ordered.map((line) => {
            const gstPercent = line.gstPercent ?? (num(line.product.gst_percent) || 5);
            return { ...line, gstPercent, ...lineMoney(line.qty, line.rate, gstPercent) };
        });
        const sum = (field) => money(rows.reduce((total, row) => total + num(row[field]), 0));
        const exact = sum('amount');
        const total = Math.round(exact);
        if (total < num(sale.paid_amount)) throw httpError(409, 'The new total cannot be below the payments already recorded.');

        if (stockChanged) {
            await PhysicalStockModel.deductStockForCompany(connection, company.name, stockLinesOf(rows), `DMS Sale Edit #${id} · deduct`);
        }
        await connection.execute('DELETE FROM dms_sale_items WHERE sale_id = ?', [id]);
        await saveBillItems(connection, id, rows);
        await connection.execute(
            `UPDATE dms_sales SET invoice_number = ?, sale_date = ?, remarks = ?, item_count = ?, total_qty = ?,
                taxable_amount = ?, gst_amount = ?, round_off = ?, total_amount = ?, balance_amount = ?,
                edit_revision = edit_revision + 1 WHERE id = ?`,
            [invoiceNumber, saleDate, String(req.body.remarks || '').trim().slice(0, 1000) || null,
                rows.length, sum('qty'), sum('taxable'), sum('gst'), money(total - exact), total, money(total - num(sale.paid_amount)), id]
        );
        await connection.commit();
        return res.json({ message: `Invoice ${invoiceNumber} updated.` });
    } catch (error) {
        await connection.rollback().catch(() => {});
        return sendError(res, error, 'Unable to update the bill.');
    } finally {
        connection.release();
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
        // Also not a number already used on an Add Sales bill (the old system).
        const [oldDup] = await db.execute('SELECT id FROM staff_sales WHERE TRIM(invoice_number) = ? LIMIT 1', [invoiceNumber]);
        if (oldDup.length) throw httpError(409, `Invoice ${invoiceNumber} is already used on an Add Sales bill. Use another number.`);
        const buyer = await resolveBuyer(req.body, companyId);
        const requisitionNumber = String(req.body?.requisitionNumber || '').trim();
        const distributorOrderBilling = buyer.buyerType === 'distributor' && /^DRQ/i.test(requisitionNumber);
        const orderDetails = { requisitionNumber, distributorId: buyer.distributorId, companyId };

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
            const beforeGst = (distributorOrderBilling || company.type === 'cnf') && line.rateBeforeGst != null;
            const enteredRate = Number(beforeGst ? line.rateBeforeGst : line.rate);
            if (beforeGst && (!Number.isFinite(enteredRate) || enteredRate < 0 || enteredRate > 9999999999)) {
                throw httpError(400, `Enter a valid wholesale rate for ${line.productErpId}.`);
            }
            const gstPercent = num(product.gst_percent) || 5;
            const rateBeforeGst = beforeGst ? Number(enteredRate.toFixed(4)) : null;
            const rate = beforeGst ? money(rateBeforeGst * (1 + gstPercent / 100)) : money(line.rate);
            if (rate < 0) throw httpError(400, `Enter a valid rate for ${line.productErpId}.`);
            const preferred = num(line.mrp) > 0 ? { mrp: line.mrp, batchNumber: line.batchNumber, expiryDate: line.expiryDate } : null;
            const { taken, short } = takeFromLots(lotsOf(key), qty, preferred);
            if (short > 0) throw httpError(400, `Not enough stock of ${product.variant_name || product.product_name}: ${qty - short} pcs left.`);
            taken.forEach(({ lot, qty: lotQty }) => lines.push({ product, lot, qty: lotQty, rate, rateBeforeGst, isFree: false }));
        }

        // Free goods from the running schemes, rate 0, only what is in stock.
        // Each item's free lines are placed right under that item's last paid line, so with many
        // items on one bill it is clear which free goods came with which item.
        const schemes = distributorOrderBilling
            ? await getOrderFreeSchemes(orderDetails)
            : await activeSchemesFor(companyId, saleDate);
        const bought = new Map();
        lines.forEach((l) => bought.set(erpKey(l.product.product_erp_id), (bought.get(erpKey(l.product.product_erp_id)) || 0) + l.qty));
        const ordered = appendBillFreeGoods(lines, freeFor(schemes, bought), stock, lotsOf);

        const rows = ordered.map((l) => {
            const gstPercent = num(l.product.gst_percent) || 5;
            return { ...l, gstPercent, ...lineMoney(l.qty, l.rate, gstPercent) };
        });
        const sum = (field) => money(rows.reduce((t, r) => t + num(r[field]), 0));
        const exact = sum('amount');
        const total = Math.round(exact);
        const roundOff = money(total - exact);
        const paid = Math.min(money(req.body?.paidAmount), total);
        if (paid < 0) throw httpError(400, 'Paid amount cannot be negative.');
        const mode = PAYMENT_MODES.includes(req.body?.paymentMode) ? req.body.paymentMode : 'cash';

        await connection.beginTransaction();
        if (req.body?.draftId != null) {
            const [draft] = await connection.execute(
                'DELETE FROM dms_sale_drafts WHERE owner_role = ? AND owner_id = ? AND id = ? AND revision = ?',
                [...draftOwner(req.user), parseId(req.body.draftId) || 0, parseId(req.body.draftRevision) || 0]
            );
            if (!draft.affectedRows) throw httpError(409, 'This draft has changed or is no longer available. Reopen it from the drafts list.');
        }
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
        await saveBillItems(connection, saleId, rows);
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
            stockLinesOf(rows),
            `DMS Sale ${invoiceNumber}`
        );
        // A bill made from a distributor's approved order (requisition DRQ...): that order is billed.
        if (distributorOrderBilling) {
            await markOrderBilled(connection, {
                requisitionNumber, distributorId: buyer.distributorId, companyId, saleId,
            });
        }
        // A bill made from an outlet's approved requisition (Outlet Orders > Create Sales, PRQ...):
        // that requisition is invoiced with this bill, so it can't be billed again.
        if (buyer.buyerType === 'outlet' && requisitionNumber && !/^DRQ/i.test(requisitionNumber)) {
            const [marked] = await connection.execute(
                `UPDATE purchase_requisitions
                 SET status = 'invoiced', invoiced_dms_sale_id = ?, invoiced_at = NOW()
                 WHERE UPPER(requisition_number) = UPPER(?) AND outlet_id = ? AND company_id = ? AND status = 'approved'`,
                [saleId, requisitionNumber, buyer.outletId, companyId]
            );
            if (!marked.affectedRows) {
                throw Object.assign(
                    new Error(`Requisition ${requisitionNumber} is not approved for this outlet, or it has already been invoiced.`),
                    { statusCode: 409 }
                );
            }
        }
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
