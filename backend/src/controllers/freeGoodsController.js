import db from '../config/db.js';

// DMS Sales > Free Goods. A scheme is set per company and item: "buy 100 pcs, get 30 pcs
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

// A scheme runs while it is started (no dates).
const runsOn = (scheme) => scheme.is_active;

async function companyItems(companyId) {
    const [rows] = await db.execute(
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

const itemName = (item) => item?.variant_name || item?.sku_name || item?.product_erp_id || '';

// Schemes running today for a company, keyed by the bought item.
export async function activeSchemesFor(companyId) {
    if (!parseId(companyId)) return new Map();
    const [rows] = await db.execute(`${SELECT_SQL} WHERE s.company_id = ? AND s.is_active = 1`, [companyId]);
    return new Map(rows.map(normalize).filter(runsOn).map((s) => [erpKey(s.product_erp_id), s]));
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
            freeQty: sets * scheme.free_qty,
        });
    }
    return out;
}

const readScheme = async (body, companyId) => {
    const items = await companyItems(companyId);
    const find = (erp) => items.find((it) => erpKey(it.product_erp_id) === erpKey(erp));
    const item = find(body?.productErpId);
    if (!item) throw httpError(400, 'Choose an item of this company.');
    const freeItem = body?.freeProductErpId ? find(body.freeProductErpId) : item;
    if (!freeItem) throw httpError(400, 'Choose the free item from this company.');
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
        // No dates: a scheme runs until it is stopped.
        validFrom: null,
        validTo: null,
        note: String(body?.note || '').trim().slice(0, 500) || null,
    };
};

// One active scheme per item of a company.
async function assertNoOtherActive(companyId, productErpId, exceptId = 0) {
    const [rows] = await db.execute(
        `SELECT id FROM free_goods_schemes
         WHERE company_id = ? AND LOWER(TRIM(product_erp_id)) = LOWER(TRIM(?)) AND is_active = 1 AND id <> ?
         LIMIT 1`,
        [companyId, productErpId, exceptId]
    );
    if (rows.length) throw httpError(409, 'This item already has an active free goods scheme. Edit or stop that one.');
}

export const getItems = async (req, res) => {
    try {
        const companyId = parseId(req.query.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        return res.json({ items: await companyItems(companyId) });
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
            `${SELECT_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.is_active DESC, s.id DESC`,
            params
        );
        return res.json({ schemes: rows.map(normalize).map((s) => ({ ...s, running: runsOn(s) })) });
    } catch (error) {
        return sendError(res, error, 'Unable to load free goods schemes.');
    }
};

// Schemes running today for a company (Add Sales uses this to add the free lines).
export const getActiveSchemes = async (req, res) => {
    try {
        let companyId = parseId(req.query.companyId);
        if (!companyId && req.query.companyName) {
            const [rows] = await db.execute('SELECT id FROM companies WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [req.query.companyName]);
            companyId = rows[0]?.id || null;
        }
        if (!companyId) return res.json({ schemes: [] });
        return res.json({ schemes: [...(await activeSchemesFor(companyId)).values()] });
    } catch (error) {
        return sendError(res, error, 'Unable to load free goods schemes.');
    }
};

export const createScheme = async (req, res) => {
    try {
        const companyId = parseId(req.body?.companyId);
        if (!companyId) throw httpError(400, 'Select a company.');
        const [companies] = await db.execute('SELECT id FROM companies WHERE id = ?', [companyId]);
        if (!companies.length) throw httpError(404, 'Company not found.');
        const scheme = await readScheme(req.body, companyId);
        await assertNoOtherActive(companyId, scheme.productErpId);
        const [result] = await db.execute(
            `INSERT INTO free_goods_schemes
                (company_id, product_erp_id, item_name, buy_qty, free_qty, free_product_erp_id, free_item_name,
                 valid_from, valid_to, note, created_by_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, scheme.productErpId, scheme.itemName, scheme.buyQty, scheme.freeQty, scheme.freeProductErpId,
                scheme.freeItemName, scheme.validFrom, scheme.validTo, scheme.note, req.user?.role === 'admin' ? 'Admin' : null]
        );
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
        const [rows] = await db.execute('SELECT company_id, is_active FROM free_goods_schemes WHERE id = ?', [id || 0]);
        if (!rows.length) throw httpError(404, 'Scheme not found.');
        const scheme = await readScheme(req.body, rows[0].company_id);
        if (Number(rows[0].is_active) === 1) await assertNoOtherActive(rows[0].company_id, scheme.productErpId, id);
        await db.execute(
            `UPDATE free_goods_schemes
             SET product_erp_id = ?, item_name = ?, buy_qty = ?, free_qty = ?, free_product_erp_id = ?, free_item_name = ?,
                 valid_from = ?, valid_to = ?, note = ?
             WHERE id = ?`,
            [scheme.productErpId, scheme.itemName, scheme.buyQty, scheme.freeQty, scheme.freeProductErpId,
                scheme.freeItemName, scheme.validFrom, scheme.validTo, scheme.note, id]
        );
        return res.json({ message: 'Scheme updated.' });
    } catch (error) {
        return sendError(res, error, 'Unable to update the scheme.');
    }
};

export const setSchemeActive = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const [rows] = await db.execute('SELECT company_id, product_erp_id FROM free_goods_schemes WHERE id = ?', [id || 0]);
        if (!rows.length) throw httpError(404, 'Scheme not found.');
        const active = Boolean(req.body?.isActive);
        if (active) await assertNoOtherActive(rows[0].company_id, rows[0].product_erp_id, id);
        await db.execute('UPDATE free_goods_schemes SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
        return res.json({ message: active ? 'Scheme started.' : 'Scheme stopped.' });
    } catch (error) {
        return sendError(res, error, 'Unable to change the scheme.');
    }
};
