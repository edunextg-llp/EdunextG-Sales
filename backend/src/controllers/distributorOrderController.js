import db from '../config/db.js';
import CompanyModel from '../models/companyModel.js';
import { companyStock } from './dmsSalesController.js';
import { activeSchemesFor, freeFor } from './freeGoodsController.js';

// Distributor orders.
// 1. Distributor Portal > Orders: a distributor orders items (qty in pcs) from the company it
//    was added under (a CNF company). The order is 'pending'.
// 2. DMS Sales > Distributor Orders: the admin approves it, which gives it a requisition
//    number (DRQ000001, ...), or rejects it with a reason. The distributor can cancel a
//    pending order.
// 3. DMS Create Sales > Create Bill: the requisition number is pasted and loaded; its items
//    fill the bill. Saving the bill marks the order 'billed' (see markOrderBilled), so one
//    number makes one bill.

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const sendError = (res, error, fallback) => {
    if (!error.statusCode) console.error(fallback, error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : fallback });
};
const num = (v) => Number(v) || 0;
const parseId = (value) => {
    const n = Number.parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
};
const erpKey = (value) => String(value || '').trim().toLowerCase();
const byName = (user) => (user?.role === 'admin' ? 'Admin' : user?.username || null);
const STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'billed'];
const MAX_LINES = 300;

export const formatRequisitionNumber = (id) => `DRQ${String(id).padStart(6, '0')}`;
export const formatOrderNumber = (id) => `ORD${String(id).padStart(6, '0')}`;

const ORDER_SQL = `
    SELECT o.id, o.order_number, o.distributor_id, o.company_id, o.status, o.price_type, o.requisition_number, o.item_count, o.total_qty,
           o.remarks, o.reject_reason, o.reviewed_by_name, o.dms_sale_id,
           DATE_FORMAT(o.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
           DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           d.distributor_name, d.login_id, d.contact_no, d.city,
           c.name AS company_name, s.invoice_number
    FROM distributor_orders o
    JOIN distributors d ON d.id = o.distributor_id
    LEFT JOIN companies c ON c.id = o.company_id
    LEFT JOIN dms_sales s ON s.id = o.dms_sale_id`;

const normalize = (row) => ({ ...row, total_qty: num(row.total_qty), item_count: num(row.item_count) });

async function itemsOf(orderIds) {
    if (!orderIds.length) return new Map();
    const [rows] = await db.query(
        `SELECT order_id, product_erp_id, product_name, variant_name, qty, is_free, free_for_erp_id, free_note
         FROM distributor_order_items WHERE order_id IN (?) ORDER BY order_id, sort_order, id`,
        [orderIds]
    );
    const map = new Map();
    rows.forEach((r) => {
        if (!map.has(r.order_id)) map.set(r.order_id, []);
        map.get(r.order_id).push({ ...r, qty: num(r.qty), is_free: Number(r.is_free) === 1 });
    });
    return map;
}

async function getOrder(id) {
    const [rows] = await db.execute(`${ORDER_SQL} WHERE o.id = ?`, [id]);
    if (!rows.length) return null;
    const items = await itemsOf([id]);
    return { ...normalize(rows[0]), items: items.get(id) || [] };
}

async function distributorOf(distributorId) {
    const [rows] = await db.execute(
        'SELECT id, distributor_name, company_id, is_active FROM distributors WHERE id = ?',
        [distributorId]
    );
    const d = rows[0];
    if (!d) throw httpError(404, 'Distributor not found.');
    const company = d.company_id ? await CompanyModel.getById(d.company_id) : null;
    if (!company) throw httpError(400, 'Your account is not linked to a company. Please contact the company.');
    return { distributor: d, company };
}

// Retail / wholesale price per piece (before GST) of the lot that sells first, else the item's.
// Each falls back to the other, then MRP / price per piece (as Create Bill does).
function pricesOf(p) {
    const lot = (p.lots || []).find((l) => num(l.pcs) > 0) || {};
    const retail = num(lot.retail_price) || num(p.retail_price);
    const wholesale = num(lot.wholesale_price) || num(p.wholesale_price);
    const last = num(lot.mrp) || num(p.mrp) || num(p.price_per_piece);
    return {
        retailPrice: retail || wholesale || last,
        wholesalePrice: wholesale || retail || last,
        // MRP per piece (incl. GST): what a CNF company's distributors order at.
        mrp: num(lot.mrp) || num(p.mrp) || num(p.price_per_piece),
    };
}

// A CNF company's distributors do not choose Retail / Wholesale: their orders are at the product MRP.
const isCnfCompany = (company) => String(company?.type || '').toLowerCase() === 'cnf';
const PRICE_TYPES = ['retail', 'wholesale', 'mrp'];

// Items of the company with stock now, for the order form.
async function orderableItems(company) {
    const stock = await companyStock(company);
    return [...stock.values()]
        .filter((p) => num(p.total_current_stock_in_pcs) > 0 && String(p.product_erp_id || '').trim())
        .map((p) => ({
            productErpId: p.product_erp_id,
            productName: p.product_name || '',
            variantName: p.variant_name || '',
            itemCode: p.item_code || '',
            pcsPerBox: num(p.pcs_per_box),
            available: num(p.total_current_stock_in_pcs),
            // Price per piece before GST, of the lot sold first (as on Create Bill).
            ...pricesOf(p),
            gstPercent: num(p.gst_percent) || 5,
        }))
        .sort((a, b) => String(a.variantName || a.productName).localeCompare(String(b.variantName || b.productName)));
}

// ---------------------------------------------------------------------------
// Distributor Portal (/api/distributor/orders...), scoped to req.distributorId.
// ---------------------------------------------------------------------------

export const portalOrderItems = async (req, res) => {
    try {
        const { company } = await distributorOf(req.distributorId);
        let items = [];
        try {
            items = await orderableItems(company);
        } catch (error) {
            if (!error.statusCode) throw error;
            // No stock uploaded yet for the company: nothing to order.
        }
        // Running free goods offers of the company: buy X pcs of an item, get Y pcs (of it or another item) free.
        const schemes = [...(await activeSchemesFor(company.id)).values()].map((sc) => ({
            productErpId: sc.product_erp_id,
            itemName: sc.item_name || sc.product_erp_id,
            buyQty: sc.buy_qty,
            freeQty: sc.free_qty,
            freeProductErpId: sc.free_product_erp_id || sc.product_erp_id,
            freeItemName: sc.free_item_name || sc.item_name || sc.free_product_erp_id || sc.product_erp_id,
            sameItem: !sc.free_product_erp_id || erpKey(sc.free_product_erp_id) === erpKey(sc.product_erp_id),
            note: sc.note || '',
        }));
        return res.json({ companyName: company.name, items, schemes, mrpOnly: isCnfCompany(company) });
    } catch (error) {
        return sendError(res, error, 'Unable to load the items.');
    }
};

export const portalListOrders = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `${ORDER_SQL} WHERE o.distributor_id = ? ORDER BY o.id DESC LIMIT 500`,
            [req.distributorId]
        );
        const items = await itemsOf(rows.map((r) => r.id));
        return res.json({ orders: rows.map((r) => ({ ...normalize(r), items: items.get(r.id) || [] })) });
    } catch (error) {
        return sendError(res, error, 'Unable to load your orders.');
    }
};

export const portalCreateOrder = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { distributor, company } = await distributorOf(req.distributorId);
        const requested = Array.isArray(req.body?.items) ? req.body.items : [];
        // CNF company: always MRP (no Retail / Wholesale choice). Others choose Retail or Wholesale.
        const priceType = isCnfCompany(company) ? 'mrp' : req.body?.priceType;
        if (!PRICE_TYPES.includes(priceType) || (priceType === 'mrp' && !isCnfCompany(company))) {
            throw httpError(400, 'Choose Retail or Wholesale price.');
        }
        // Same item twice: one line with the total.
        const byErp = new Map();
        requested.forEach((it) => {
            const key = erpKey(it?.productErpId);
            const qty = Math.floor(num(it?.qty));
            if (!key || qty <= 0) return;
            byErp.set(key, (byErp.get(key) || 0) + qty);
        });
        if (!byErp.size) throw httpError(400, 'Add at least one item with a quantity.');
        if (byErp.size > MAX_LINES) throw httpError(400, `An order can have at most ${MAX_LINES} items.`);

        const stock = await companyStock(company);
        const lines = [...byErp.entries()].map(([key, qty], index) => {
            const product = stock.get(key);
            if (!product) throw httpError(400, `${key.toUpperCase()} is not an item of ${company.name}.`);
            return {
                productErpId: product.product_erp_id,
                productName: product.product_name || null,
                variantName: product.variant_name || null,
                qty,
                index,
            };
        });
        const totalQty = lines.reduce((t, l) => t + l.qty, 0);

        // Free goods earned now (for the distributor to see). The bill works them out again
        // from the schemes running on the bill day, so these lines are never billed themselves.
        const schemes = await activeSchemesFor(company.id);
        const bought = new Map(lines.map((l) => [erpKey(l.productErpId), l.qty]));
        const freeLines = freeFor(schemes, bought).map(({ scheme, freeErpId, freeQty }) => {
            const product = stock.get(erpKey(freeErpId));
            return {
                productErpId: product?.product_erp_id || freeErpId,
                productName: product?.product_name || scheme.free_item_name || null,
                variantName: product?.variant_name || null,
                qty: freeQty,
                freeForErpId: scheme.product_erp_id,
                freeNote: `Free with ${scheme.item_name || scheme.product_erp_id} (buy ${scheme.buy_qty} get ${scheme.free_qty})`.slice(0, 255),
            };
        });
        // Each item's free line right under it.
        const ordered = lines.flatMap((l) => [
            l,
            ...freeLines.filter((f) => erpKey(f.freeForErpId) === erpKey(l.productErpId)),
        ]);

        await connection.beginTransaction();
        const [result] = await connection.execute(
            `INSERT INTO distributor_orders (distributor_id, company_id, price_type, item_count, total_qty, remarks)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [distributor.id, company.id, priceType, lines.length, totalQty, String(req.body?.remarks || '').trim().slice(0, 1000) || null]
        );
        for (const [index, l] of ordered.entries()) {
            await connection.execute(
                `INSERT INTO distributor_order_items
                    (order_id, product_erp_id, product_name, variant_name, qty, is_free, free_for_erp_id, free_note, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [result.insertId, l.productErpId, l.productName, l.variantName, l.qty,
                    l.freeNote ? 1 : 0, l.freeForErpId || null, l.freeNote || null, index]
            );
        }
        const orderNumber = formatOrderNumber(result.insertId);
        await connection.execute('UPDATE distributor_orders SET order_number = ? WHERE id = ?', [orderNumber, result.insertId]);
        await connection.commit();
        return res.status(201).json({
            message: `Order ${orderNumber} sent to ${company.name}. You will get a requisition number when it is approved.`,
            order: await getOrder(result.insertId),
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        return sendError(res, error, 'Unable to place the order.');
    } finally {
        connection.release();
    }
};

export const portalCancelOrder = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const order = id ? await getOrder(id) : null;
        if (!order || Number(order.distributor_id) !== Number(req.distributorId)) throw httpError(404, 'Order not found.');
        if (order.status !== 'pending') throw httpError(409, 'Only a pending order can be cancelled.');
        await db.execute(`UPDATE distributor_orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'`, [id]);
        return res.json({ message: `Order ${order.order_number || formatOrderNumber(id)} cancelled.` });
    } catch (error) {
        return sendError(res, error, 'Unable to cancel the order.');
    }
};

// ---------------------------------------------------------------------------
// DMS (/api/staff/distributor-orders...), admin only.
// ---------------------------------------------------------------------------

export const listOrders = async (req, res) => {
    try {
        const where = [];
        const params = [];
        if (STATUSES.includes(req.query.status)) {
            where.push('o.status = ?');
            params.push(req.query.status);
        }
        const companyId = parseId(req.query.companyId);
        if (companyId) {
            where.push('o.company_id = ?');
            params.push(companyId);
        }
        const [rows] = await db.execute(
            `${ORDER_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY o.id DESC LIMIT 1000`,
            params
        );
        const items = await itemsOf(rows.map((r) => r.id));
        const [counts] = await db.execute(`SELECT status, COUNT(*) AS n FROM distributor_orders GROUP BY status`);
        return res.json({
            orders: rows.map((r) => ({ ...normalize(r), items: items.get(r.id) || [] })),
            counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
        });
    } catch (error) {
        return sendError(res, error, 'Unable to load distributor orders.');
    }
};

export const approveOrder = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const order = id ? await getOrder(id) : null;
        if (!order) throw httpError(404, 'Order not found.');
        if (order.status !== 'pending') throw httpError(409, `Order ${order.order_number || formatOrderNumber(id)} is ${order.status}, not pending.`);
        const requisitionNumber = formatRequisitionNumber(id);
        const [result] = await db.execute(
            `UPDATE distributor_orders
             SET status = 'approved', requisition_number = ?, reviewed_by_name = ?, reviewed_at = NOW(), reject_reason = NULL
             WHERE id = ? AND status = 'pending'`,
            [requisitionNumber, byName(req.user), id]
        );
        if (!result.affectedRows) throw httpError(409, 'This order was changed meanwhile. Reload and try again.');
        return res.json({
            message: `Order ${order.order_number || formatOrderNumber(id)} approved. Requisition number ${requisitionNumber}.`,
            requisitionNumber,
            order: await getOrder(id),
        });
    } catch (error) {
        return sendError(res, error, 'Unable to approve the order.');
    }
};

export const rejectOrder = async (req, res) => {
    try {
        const id = parseId(req.params.id);
        const order = id ? await getOrder(id) : null;
        if (!order) throw httpError(404, 'Order not found.');
        if (order.status !== 'pending') throw httpError(409, `Order ${order.order_number || formatOrderNumber(id)} is ${order.status}, not pending.`);
        const reason = String(req.body?.reason || '').trim().slice(0, 500);
        if (!reason) throw httpError(400, 'Enter the reason for rejecting.');
        await db.execute(
            `UPDATE distributor_orders
             SET status = 'rejected', reject_reason = ?, reviewed_by_name = ?, reviewed_at = NOW()
             WHERE id = ? AND status = 'pending'`,
            [reason, byName(req.user), id]
        );
        return res.json({ message: `Order ${order.order_number || formatOrderNumber(id)} rejected.`, order: await getOrder(id) });
    } catch (error) {
        return sendError(res, error, 'Unable to reject the order.');
    }
};

// Create Bill > Requisition No. > Load, for a distributor buyer.
export const getByRequisition = async (req, res) => {
    try {
        const code = String(req.params.code || '').trim().toUpperCase();
        const [rows] = await db.execute(`${ORDER_SQL} WHERE o.requisition_number = ?`, [code]);
        if (!rows.length) throw httpError(404, `Requisition ${code} not found.`);
        const order = rows[0];
        const distributorId = parseId(req.query.distributorId);
        if (distributorId && Number(order.distributor_id) !== distributorId) {
            throw httpError(400, `Requisition ${code} belongs to ${order.distributor_name} (${order.login_id}). Choose that distributor.`);
        }
        const companyId = parseId(req.query.companyId);
        if (companyId && Number(order.company_id) !== companyId) {
            throw httpError(400, `Requisition ${code} is for ${order.company_name}. Choose that company.`);
        }
        if (order.status === 'billed') {
            throw httpError(409, `Requisition ${code} is already billed${order.invoice_number ? ` (invoice ${order.invoice_number})` : ''}.`);
        }
        if (order.status !== 'approved') throw httpError(409, `Requisition ${code} is ${order.status}.`);
        const items = await itemsOf([order.id]);
        return res.json({ order: { ...normalize(order), items: items.get(order.id) || [] } });
    } catch (error) {
        return sendError(res, error, 'Unable to load the requisition.');
    }
};

// Called inside Create Sales' transaction: the approved order of this distributor and
// company becomes 'billed' with the sale. Throws if it cannot be used.
export async function markOrderBilled(connection, { requisitionNumber, distributorId, companyId, saleId }) {
    const code = String(requisitionNumber || '').trim().toUpperCase();
    if (!code) return;
    const [rows] = await connection.execute(
        'SELECT id, status, distributor_id, company_id FROM distributor_orders WHERE requisition_number = ? FOR UPDATE',
        [code]
    );
    const order = rows[0];
    if (!order) throw httpError(400, `Requisition ${code} not found.`);
    if (Number(order.distributor_id) !== Number(distributorId) || Number(order.company_id) !== Number(companyId)) {
        throw httpError(400, `Requisition ${code} is not for this distributor and company.`);
    }
    if (order.status === 'billed') throw httpError(409, `Requisition ${code} is already billed.`);
    if (order.status !== 'approved') throw httpError(409, `Requisition ${code} is ${order.status}.`);
    await connection.execute(
        `UPDATE distributor_orders SET status = 'billed', dms_sale_id = ? WHERE id = ?`,
        [saleId, order.id]
    );
}
