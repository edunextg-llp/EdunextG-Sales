import db from '../config/db.js';
import PhysicalStockModel from '../models/physicalStockModel.js';

// DMS Sales > Free Goods. A scheme is set per company, item and date range: "buy 100 pcs, get 30 pcs
// free". On an order (requisition) or a bill (Add Sales) the free pieces come as their own
// line at rate 0, for every full "buy" quantity: 100 -> 30 free, 250 -> 60 free. The free
// item is the same item unless the scheme names another item of that company.

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const sendError = (res, error, fallback) => {
    if (!error.statusCode) console.error(fallback, error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : fallback });
};
const parseId = (value) => {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
};
const erpKey = (value) => String(value || '').trim().toLowerCase();
const SELLER_TYPES = ['distributor', 'cnf'];

const SELECT_SQL = `
    SELECT s.id, s.company_id, c.name AS company_name, c.type AS company_type,
           s.product_erp_id, s.item_name, s.buy_qty, s.free_qty,
           s.free_product_erp_id, s.free_item_name,
           DATE_FORMAT(s.valid_from, '%Y-%m-%d') AS valid_from,
           DATE_FORMAT(s.valid_to, '%Y-%m-%d') AS valid_to,
           s.note, s.is_active, s.created_by_name,
           DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM free_goods_schemes s
    LEFT JOIN companies c ON c.id = s.company_id`;

const normalize = (row) => ({
    ...row,
    buy_qty: Number(row.buy_qty) || 0,
    free_qty: Number(row.free_qty) || 0,
    is_active: Number(row.is_active) === 1,
});

export const schemeToday = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

function monthRange(month) {
    if (typeof month !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
        throw httpError(400, 'Choose a valid scheme month.');
    }
    const [year, number] = month.split('-').map(Number);
    return { validFrom: `${month}-01`, validTo: `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}` };
}

const isDate = (date) => typeof date === 'string' && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

function readDates(body = {}, current) {
    if (body.validFrom === undefined && body.validTo === undefined) {
        if (body.month) return monthRange(body.month);
        if (current) return { validFrom: current.valid_from, validTo: current.valid_to };
    }
    const validFrom = body.validFrom || null;
    const validTo = body.validTo || null;
    if (current && validFrom === current.valid_from && validTo === current.valid_to) return { validFrom, validTo };
    if (!isDate(validFrom) || !isDate(validTo)) throw httpError(400, 'Choose a valid start and end date.');
    if (validFrom > validTo) throw httpError(400, 'End date must be on or after the start date.');
    return { validFrom, validTo };
}

const runsOn = (scheme, date) => scheme.is_active
    && (!scheme.valid_from || scheme.valid_from <= date)
    && (!scheme.valid_to || scheme.valid_to >= date);

async function companyItems(companyId, executor = db) {
    const [rows] = await executor.execute(
        `SELECT si.product_erp_id, MAX(si.sku_name) AS sku_name, MAX(si.variant_name) AS variant_name,
                MAX(si.item_code) AS item_code, MAX(si.hsn_code) AS hsn_code, MAX(si.pcs_per_box) AS pcs_per_box
         FROM seller_items si
         WHERE si.company_id = ? AND si.product_erp_id IS NOT NULL AND TRIM(si.product_erp_id) <> ''
         GROUP BY si.product_erp_id
         ORDER BY MAX(si.variant_name), si.product_erp_id`,
        [companyId]
    );
    return rows;
}

async function stockedProductKeys(companyId, executor = db) {
    const [[dmsImport]] = await executor.execute(
        'SELECT id FROM dms_stock_imports WHERE company_id = ? ORDER BY id DESC LIMIT 1',
        [companyId]
    );
    if (!dmsImport) return new Set();
    const items = await PhysicalStockModel.getCurrentItemsByDmsImportId(dmsImport.id, 2000, executor);
    return new Set(items.filter((item) => item.total_physical_stock_in_pcs > 0)
        .map((item) => erpKey(item.product_erp_id)));
}

const itemName = (item) => item?.variant_name || item?.sku_name || item?.product_erp_id || '';

// A dated scheme takes precedence over an existing undated offer for the same item.
export async function activeSchemesFor(companyId, date = schemeToday(), executor = db) {
    if (!parseId(companyId)) return new Map();
    const [rows] = await executor.execute(
        `${SELECT_SQL} WHERE s.company_id = ? AND s.is_active = 1
           AND (s.valid_from IS NULL OR s.valid_from <= ?) AND (s.valid_to IS NULL OR s.valid_to >= ?)
         ORDER BY (s.valid_from IS NULL AND s.valid_to IS NULL), s.valid_from DESC, s.id DESC`,
        [companyId, date, date]
    );
    const schemes = new Map();
    for (const row of rows) {
        const key = erpKey(row.product_erp_id);
        if (!schemes.has(key)) schemes.set(key, normalize(row));
    }
    return schemes;
}

// Free pieces earned by the bought quantities: [{ scheme, freeErpId, freeQty }].
export function freeFor(schemes, boughtByErp) {
    const out = [];
    for (const [key, bought] of boughtByErp.entries()) {
        const scheme = schemes.get(key);
        if (!scheme || scheme.buy_qty <= 0 || scheme.free_qty <= 0) continue;
        const sets = Math.floor(Number(bought) / scheme.buy_qty);
        if (sets <= 0) continue;
        out.push({
            scheme,
            freeErpId: scheme.free_product_erp_id || scheme.product_erp_id,
            freeQty: Math.min(sets * scheme.free_qty, scheme.max_free_qty ?? Infinity),
        });
    }
    return out;
}

const readScheme = async (body, companyId, current, executor) => {
    const dates = readDates(body, current);
    const items = await companyItems(companyId, executor);
    const find = (erp) => items.find((it) => erpKey(it.product_erp_id) === erpKey(erp));
    const item = find(body?.productErpId);
    if (!item) throw httpError(400, 'Choose an item of this company.');
    const freeItem = body?.freeProductErpId ? find(body.freeProductErpId) : item;
    if (!freeItem) throw httpError(400, 'Choose the free item from this company.');
    const itemKey = erpKey(item.product_erp_id);
    const freeKey = erpKey(freeItem.product_erp_id);
    const itemChanged = itemKey !== erpKey(current?.product_erp_id);
    const freeChanged = freeKey !== erpKey(current?.free_product_erp_id || current?.product_erp_id);
    if (itemChanged || freeChanged) {
        const stocked = await stockedProductKeys(companyId, executor);
        if (itemChanged && !stocked.has(itemKey)) throw httpError(400, 'Choose an item with physical stock.');
        if (freeChanged && !stocked.has(freeKey)) throw httpError(400, 'Choose a free item with physical stock.');
    }
    const buyQty = Math.floor(Number(body?.buyQty));
    const freeQty = Math.floor(Number(body?.freeQty));
    if (!(buyQty > 0)) throw httpError(400, 'Enter how many pieces they must buy.');
    if (!(freeQty > 0)) throw httpError(400, 'Enter how many pieces are free.');
    return {
        productErpId: item.product_erp_id,
        itemName: itemName(item),
        freeProductErpId: freeItem.product_erp_id,
        freeItemName: itemName(freeItem),
        buyQty,
        freeQty,
        ...dates,
        note: String(body?.note || '').trim().slice(0, 500) || null,
    };
};

async function withCompanyLock(companyId, action) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [companies] = await connection.execute('SELECT id FROM companies WHERE id = ? FOR UPDATE', [companyId]);
        if (!companies.length) throw httpError(404, 'Company not found.');
        const result = await action(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }
}

async function assertNoOtherActive(connection, companyId, { productErpId, validFrom, validTo }, exceptId = 0) {
    const dated = Boolean(validFrom || validTo);
    const dateFilter = dated
        ? `(valid_from IS NOT NULL OR valid_to IS NOT NULL)
           AND (? IS NULL OR valid_from IS NULL OR valid_from <= ?)
           AND (? IS NULL OR valid_to IS NULL OR valid_to >= ?)`
        : 'valid_from IS NULL AND valid_to IS NULL';
    const [rows] = await connection.execute(
        `SELECT id FROM free_goods_schemes
         WHERE company_id = ? AND LOWER(TRIM(product_erp_id)) = LOWER(TRIM(?)) AND is_active = 1 AND id <> ?
           AND ${dateFilter}
         LIMIT 1 FOR UPDATE`,
        [companyId, productErpId, exceptId, ...(dated ? [validTo, validTo, validFrom, validFrom] : [])]
    );
    if (rows.length) throw httpError(409, 'This item already has an overlapping free goods scheme. Edit or stop that scheme first.');
}

async function editCompanyScheme(id, action) {
    const [rows] = await db.execute('SELECT company_id FROM free_goods_schemes WHERE id = ?', [id || 0]);
    if (!rows.length) throw httpError(404, 'Scheme not found.');
    return withCompanyLock(rows[0].company_id, async (connection) => {
        const [current] = await connection.execute(
            `${SELECT_SQL} WHERE s.id = ? FOR UPDATE`,
            [id]
        );
        if (!current.length) throw httpError(404, 'Scheme not found.');
        return action(connection, current[0]);
    });
}

export const getItems = async (req, res) => {
    try {
        const companyId = parseId(req.query.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        const [items, stocked] = await Promise.all([companyItems(companyId), stockedProductKeys(companyId)]);
        return res.json({ items: items.filter((item) => stocked.has(erpKey(item.product_erp_id))) });
    } catch (error) {
        return sendError(res, error, 'Unable to load items.');
    }
};

export const listSchemes = async (req, res) => {
    try {
        const where = [];
        const params = [];
        const companyId = parseId(req.query.companyId);
        if (companyId) {
            where.push('s.company_id = ?');
            params.push(companyId);
        }
        if (SELLER_TYPES.includes(req.query.type)) {
            where.push('c.type = ?');
            params.push(req.query.type);
        }
        const [rows] = await db.execute(
            `${SELECT_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.valid_from DESC, s.id DESC`,
            params
        );
        const today = schemeToday();
        return res.json({ schemes: rows.map(normalize).map((s) => ({
            ...s,
            running: runsOn(s, today),
            status: s.valid_to && s.valid_to < today ? 'expired'
                : !s.is_active ? 'stopped'
                : s.valid_from && s.valid_from > today ? 'scheduled' : 'running',
        })) });
    } catch (error) {
        return sendError(res, error, 'Unable to load free goods schemes.');
    }
};

// Schemes running today for a company (Add Sales uses this to add the free lines).
export const getActiveSchemes = async (req, res) => {
    try {
        const date = req.query.date ?? schemeToday();
        if (!isDate(date)) {
            throw httpError(400, 'Choose a valid date for free goods.');
        }
        let companyId = parseId(req.query.companyId);
        if (!companyId && req.query.companyName) {
            const [rows] = await db.execute('SELECT id FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [req.query.companyName]);
            companyId = rows[0]?.id || null;
        }
        if (!companyId) return res.json({ schemes: [] });
        return res.json({ schemes: [...(await activeSchemesFor(companyId, date)).values()] });
    } catch (error) {
        return sendError(res, error, 'Unable to load free goods schemes.');
    }
};

export const createScheme = async (req, res) => {
    try {
        const companyId = parseId(req.body?.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        const { result, scheme } = await withCompanyLock(companyId, async (connection) => {
            const scheme = await readScheme(req.body, companyId, null, connection);
            await assertNoOtherActive(connection, companyId, scheme);
            const [result] = await connection.execute(
                `INSERT INTO free_goods_schemes
                    (company_id, product_erp_id, item_name, buy_qty, free_qty, free_product_erp_id, free_item_name,
                     valid_from, valid_to, note, created_by_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [companyId, scheme.productErpId, scheme.itemName, scheme.buyQty, scheme.freeQty, scheme.freeProductErpId,
                    scheme.freeItemName, scheme.validFrom, scheme.validTo, scheme.note, req.user?.role === 'admin' ? 'Admin' : null]
            );
            return { result, scheme };
        });
        return res.status(201).json({
            id: result.insertId,
            message: `Free goods: buy ${scheme.buyQty} ${scheme.itemName}, get ${scheme.freeQty} ${scheme.freeItemName} free.`,
        });
    } catch (error) {
        return sendError(res, error, 'Unable to save the free goods scheme.');
    }
};

export const updateScheme = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        await editCompanyScheme(id, async (connection, current) => {
            const scheme = await readScheme(req.body, current.company_id, current, connection);
            if (Number(current.is_active) === 1) await assertNoOtherActive(connection, current.company_id, scheme, id);
            await connection.execute(
                `UPDATE free_goods_schemes
                 SET product_erp_id = ?, item_name = ?, buy_qty = ?, free_qty = ?, free_product_erp_id = ?, free_item_name = ?,
                     valid_from = ?, valid_to = ?, note = ?
                 WHERE id = ?`,
                [scheme.productErpId, scheme.itemName, scheme.buyQty, scheme.freeQty, scheme.freeProductErpId,
                    scheme.freeItemName, scheme.validFrom, scheme.validTo, scheme.note, id]
            );
        });
        return res.json({ message: 'Scheme updated.' });
    } catch (error) {
        return sendError(res, error, 'Unable to update the scheme.');
    }
};

export const setSchemeActive = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const active = Boolean(req.body?.isActive);
        await editCompanyScheme(id, async (connection, current) => {
            if (active) {
                if (current.valid_to && current.valid_to < schemeToday()) {
                    throw httpError(409, 'This scheme has expired. Update its dates before starting it.');
                }
                await assertNoOtherActive(connection, current.company_id, {
                    productErpId: current.product_erp_id, validFrom: current.valid_from, validTo: current.valid_to,
                }, id);
            }
            await connection.execute('UPDATE free_goods_schemes SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
        });
        return res.json({ message: active ? 'Scheme started.' : 'Scheme stopped.' });
    } catch (error) {
        return sendError(res, error, 'Unable to change the scheme.');
    }
};
