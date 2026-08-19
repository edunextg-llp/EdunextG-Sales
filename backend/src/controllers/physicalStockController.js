import { parse } from 'csv-parse/sync';
import xlsx from 'xlsx';
import db from '../config/db.js';
import PhysicalStockModel from '../models/physicalStockModel.js';
import DmsStockModel from '../models/dmsStockModel.js';


const HEADER_ALIASES = {
    productErpId: ['product erp id'],
    productName: ['sku name', 'product name'],
    productDivision: ['product division'],
    variantName: ['variant name'],
    pcsPerBox: ['pcs/box', 'pcs per box'],
    physicalStockInCase: ['current stock in case', 'physical stock in case'],
    physicalStockInPcs: ['current stock in pcs', 'physical stock in pcs'],
    stockUpdateDate: ['stock update date', 'update date', 'date'],
    pricePerPiece: ['price/pcs', 'price per pcs', 'price per piece'],
    mrp: ['mrp'],
};

const normalizeHeader = (header) => String(header || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const findValue = (row, key) => {
    const aliases = HEADER_ALIASES[key] || [];
    const entries = Object.entries(row);
    const exactMatch = entries.find(([header]) => aliases.includes(normalizeHeader(header)));
    if (exactMatch) return exactMatch[1];
    const partialMatch = entries.find(([header]) => {
        const normalized = normalizeHeader(header);
        return aliases.some((alias) => normalized.includes(alias));
    });
    return partialMatch ? partialMatch[1] : '';
};

const toNumber = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
};

const textValue = (value) => String(value ?? '').trim();
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;

const excelSerialToIsoDate = (serial) => {
    // Excel serial dates are days since 1899-12-30 (with the 1900 leap-year bug baked in).
    const days = Number(serial);
    if (!Number.isFinite(days) || days <= 0) return null;
    const ms = Math.round(days * 86400000);
    const epoch = Date.UTC(1899, 11, 30);
    const dt = new Date(epoch + ms);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10); // YYYY-MM-DD
};

const toIsoDateOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;

    // xlsx can give dates as numbers (Excel serial)
    if (typeof value === 'number') return excelSerialToIsoDate(value);

    const raw = String(value).trim();
    if (!raw) return null;

    // numeric string could be Excel serial too
    if (/^\d{4,6}$/.test(raw)) return excelSerialToIsoDate(Number(raw));

    // already in ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    // try Date parse fallback
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw; // keep as-is; DB may reject invalid dates
    return dt.toISOString().slice(0, 10);
};

export function parsePhysicalStockRows(file) {
    const extension = (file.originalname.split('.').pop() || '').toLowerCase();
    if (extension === 'csv') {
        return parse(file.buffer.toString('utf8'), {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
    }
    if (['xlsx', 'xls'].includes(extension)) {
        const workbook = xlsx.read(file.buffer, { type: 'buffer', cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) return [];
        return xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
    }
    const error = new Error('Only CSV, XLS, and XLSX files are supported.');
    error.statusCode = 400;
    throw error;
}

export function normalizePhysicalStockRow(row) {
    const pcsPerBox = toNumber(findValue(row, 'pcsPerBox'));
    const physicalStockInCase = toNumber(findValue(row, 'physicalStockInCase'));
    const physicalStockInPcs = toNumber(findValue(row, 'physicalStockInPcs'));
    const pricePerPiece = toNumber(findValue(row, 'pricePerPiece'));
    const totalPhysicalStockInPcs = roundQuantity((physicalStockInCase * pcsPerBox) + physicalStockInPcs);
    const totalValue = roundMoney(totalPhysicalStockInPcs * pricePerPiece);
    const stockUpdateDateRaw = findValue(row, 'stockUpdateDate');
    const stockUpdateDate = toIsoDateOrNull(stockUpdateDateRaw);

    return {
        productErpId: textValue(findValue(row, 'productErpId')),
        productName: textValue(findValue(row, 'productName')),
        productDivision: textValue(findValue(row, 'productDivision')),
        variantName: textValue(findValue(row, 'variantName')),
        pcsPerBox,
        physicalStockInCase,
        physicalStockInPcs,
        totalPhysicalStockInPcs,
        pricePerPiece,
        mrp: toNumber(findValue(row, 'mrp')),
        totalValue,
        stockUpdateDate,
        rawData: row,
    };
}

export function buildPhysicalStockSummary(rows) {
    return rows.reduce((summary, row) => ({
        totalCases: roundQuantity(summary.totalCases + row.physicalStockInCase),
        totalLoosePcs: roundQuantity(summary.totalLoosePcs + row.physicalStockInPcs),
        totalPieces: roundQuantity(summary.totalPieces + row.totalPhysicalStockInPcs),
        totalValue: roundMoney(summary.totalValue + row.totalValue),
    }), { totalCases: 0, totalLoosePcs: 0, totalPieces: 0, totalValue: 0 });
}

const parseDmsImportId = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const getPhysicalStock = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.query.dmsImportId);
        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date.' });
        }
        const dmsResult = await DmsStockModel.getImportById(dmsImportId);
        if (!dmsResult) {
            return res.status(404).json({ error: 'Selected DMS stock upload was not found.' });
        }
        const physicalResult = await PhysicalStockModel.getLatestByDmsImportId(dmsImportId);
        return res.status(200).json(physicalResult || { import: null, items: [] });
    } catch (error) {
        console.error('Error fetching physical stock:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const uploadPhysicalStock = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.body?.dmsImportId);
        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date first.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a physical stock Excel or CSV file.' });
        }
        const dmsResult = await DmsStockModel.getImportById(dmsImportId);
        if (!dmsResult) {
            return res.status(404).json({ error: 'Selected DMS stock upload was not found.' });
        }

        const rows = parsePhysicalStockRows(req.file)
            .map(normalizePhysicalStockRow)
            .filter((row) => row.productErpId || row.productName);
        if (!rows.length) {
            return res.status(400).json({ error: 'No physical stock rows found in the uploaded file.' });
        }

        const summary = buildPhysicalStockSummary(rows);
        const result = await PhysicalStockModel.createImport({
            dmsImportId,
            fileName: req.file.originalname,
            rowCount: rows.length,
            summary,
            rows,
        });
        return res.status(201).json({
            message: 'Physical stock uploaded and calculated successfully',
            ...result,
        });
    } catch (error) {
        console.error('Error uploading physical stock:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};

export const getPhysicalStockDmsProducts = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.query.dmsImportId);
        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date.' });
        }

        const dmsResult = await DmsStockModel.getImportById(dmsImportId);
        if (!dmsResult) {
            return res.status(404).json({ error: 'Selected DMS stock upload was not found.' });
        }

        const search = String(req.query.search || '').trim();
        const products = await DmsStockModel.getProductsByImportId(dmsImportId, search);
        return res.status(200).json({ products });
    } catch (error) {
        console.error('Error fetching physical stock DMS products:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const lookupPhysicalStockProduct = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.query.dmsImportId);
        const erpId = String(
            req.query.erpId
            || req.query.productErpId
            || req.query.product_erp_id
            || ''
        ).trim();

        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date.' });
        }
        if (!erpId) {
            return res.status(400).json({ error: 'Product ERP ID is required.' });
        }

        const product = await DmsStockModel.getProductByErpIdInImport(dmsImportId, erpId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found in selected DMS stock.' });
        }

        return res.status(200).json({ product });
    } catch (error) {
        console.error('Error looking up physical stock product:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

async function buildPhysicalRowFromDmsProduct(dmsImportId, item) {
    const erpId = String(item?.productErpId || '').trim();
    if (!erpId) {
        const error = new Error('Product ERP ID is required.');
        error.statusCode = 400;
        throw error;
    }

    let product = await DmsStockModel.getProductByErpIdInImport(dmsImportId, erpId);
    if (!product) {
        const [masterRows] = await db.execute(
            `SELECT si.product_erp_id, si.sku_name AS product_name, c.name AS product_division,
                    si.variant_name, si.pcs_per_box
             FROM seller_items si
             INNER JOIN dms_stock_imports dsi ON dsi.company_id = si.company_id
             LEFT JOIN companies c ON c.id = si.company_id
             WHERE dsi.id = ? AND LOWER(TRIM(si.product_erp_id)) = LOWER(TRIM(?))
             LIMIT 1`,
            [dmsImportId, erpId]
        );
        product = masterRows[0] || null;
    }
    if (!product) {
        const error = new Error(`Product is not available for the selected company: ${erpId}`);
        error.statusCode = 404;
        throw error;
    }

    return normalizePhysicalStockRow({
        'Product ERP ID': product.product_erp_id,
        'SKU Name': product.product_name,
        'Product Division': product.product_division,
        'Variant Name': product.variant_name,
        'Pcs/Box': product.pcs_per_box,
        'Physical Stock In Case': item.physicalStockInCase ?? 0,
        'Physical Stock In Pcs': item.physicalStockInPcs ?? 0,
        'Price/Pcs': product.price_per_piece || 0,
        MRP: product.mrp || 0,
        'Stock Update Date': item.stockUpdateDate || '',
    });
}

export const getPhysicalStockItemHistory = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.query.dmsImportId);
        const erpId = String(req.query.erpId || '').trim();
        const updateDate = String(req.query.updateDate || '').trim();

        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date.' });
        }
        if (!erpId && !updateDate) {
            const dates = await PhysicalStockModel.getHistoryUpdateDates(dmsImportId);
            return res.status(200).json({ dates, history: [] });
        }

        const history = erpId
            ? await PhysicalStockModel.getItemHistory(dmsImportId, erpId)
            : await PhysicalStockModel.getAllItemHistory(dmsImportId, updateDate);
        return res.status(200).json({ history });
    } catch (error) {
        console.error('Error fetching physical stock item history:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPhysicalStockForCompany = async (req, res) => {
    try {
        const companyId = parseInt(req.query.companyId, 10);
        if (!Number.isFinite(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Please select a company.' });
        }

        // 1. Get ALL products from master item list (seller_items) for this company
        const [sellerItemsRows] = await db.execute(
            `SELECT si.product_erp_id, si.sku_name AS product_name, si.variant_name, si.pcs_per_box, c.name AS company_name
             FROM seller_items si
             LEFT JOIN companies c ON c.id = si.company_id
             WHERE si.company_id = ?`,
            [companyId]
        );

        // 2. Get latest DMS stock item for EACH product_erp_id for this company
        const [dmsItemsRows] = await db.execute(
            `SELECT dsi.id, dsi.product_erp_id, dsi.product_name, dsi.product_division, dsi.variant_name,
                    dsi.pcs_per_box, dsi.current_stock_in_case, dsi.current_stock_in_pcs,
                    dsi.total_current_stock_in_pcs, dsi.price_per_piece, dsi.mrp, dsi.total_value,
                    dsi.batch_number, DATE_FORMAT(dsi.mfg_date, '%Y-%m-%d') AS mfg_date,
                    DATE_FORMAT(dsi.expiry_date, '%Y-%m-%d') AS expiry_date,
                    dsi.dp_price, dsi.discount_percent, dsi.gst_percent, dsi.cgst_amount, dsi.sgst_amount,
                    dsi.retail_price, dsi.wholesale_price, dsi.retail_margin, dsi.wholesale_margin,
                    imp.id AS import_id, imp.invoice_number, ps.seller_name
             FROM dms_stock_items dsi
             INNER JOIN dms_stock_imports imp ON imp.id = dsi.import_id
             LEFT JOIN purchase_sellers ps ON ps.id = imp.seller_id
             INNER JOIN (
                 SELECT dsi2.product_erp_id, MAX(dsi2.id) AS latest_item_id
                 FROM dms_stock_items dsi2
                 INNER JOIN dms_stock_imports i2 ON i2.id = dsi2.import_id
                 WHERE i2.company_id = ?
                   AND dsi2.product_erp_id IS NOT NULL
                   AND TRIM(dsi2.product_erp_id) <> ''
                 GROUP BY dsi2.product_erp_id
             ) latest ON latest.latest_item_id = dsi.id
             WHERE imp.company_id = ?
             ORDER BY dsi.product_erp_id ASC`,
            [companyId, companyId]
        );

        // 3. Get the latest DMS import ID for this company to tie physical stock to
        const [dmsImportRows] = await db.execute(
            `SELECT i.id, i.company_id, c.name AS company_name,
                    DATE_FORMAT(i.upload_date, '%Y-%m-%d') AS upload_date
             FROM dms_stock_imports i
             LEFT JOIN companies c ON c.id = i.company_id
             WHERE i.company_id = ?
             ORDER BY i.id DESC
             LIMIT 1`,
            [companyId]
        );

        let dmsImportId = null;
        let dmsImport = null;
        if (dmsImportRows.length > 0) {
            dmsImport = dmsImportRows[0];
            dmsImportId = dmsImport.id;
        } else {
            // Create a dummy import if they have NO imports so they can still approve/edit physical stock
            const [insertRes] = await db.execute(
                `INSERT INTO dms_stock_imports (company_id, file_name, upload_date) VALUES (?, ?, NOW())`,
                [companyId, "Auto-generated for Physical Stock"]
            );
            dmsImportId = insertRes.insertId;
            dmsImport = { id: dmsImportId, company_id: companyId, company_name: sellerItemsRows[0]?.company_name || "" };
        }

        // 4. Merge seller items and dms items
        const productMap = new Map();

        // Add seller items first
        for (const s of sellerItemsRows) {
            const key = String(s.product_erp_id || '').trim().toLowerCase();
            if (!key) continue;
            productMap.set(key, {
                product_erp_id: s.product_erp_id,
                product_name: s.product_name,
                variant_name: s.variant_name || '',
                pcs_per_box: Number(s.pcs_per_box) || 0,
                current_stock_in_case: 0,
                current_stock_in_pcs: 0,
                total_current_stock_in_pcs: 0,
                price_per_piece: 0,
                mrp: 0,
                total_value: 0,
            });
        }

        // Add/Overwrite with DMS items
        for (const d of dmsItemsRows) {
            const key = String(d.product_erp_id || '').trim().toLowerCase();
            if (!key) continue;
            const existing = productMap.get(key) || {};
            productMap.set(key, {
                ...existing,
                ...DmsStockModel.normalizeProductItem(d),
            });
        }

        const dmsProducts = Array.from(productMap.values()).sort((a, b) => 
            a.product_erp_id.localeCompare(b.product_erp_id)
        );

        // 5. Get physical stock items tied to the latest dmsImportId
        const physicalItems = await PhysicalStockModel.getMergedItemsByDmsImportId(dmsImportId, 2000);

        const physicalByErp = new Map(
            physicalItems.map((item) => [
                String(item.product_erp_id || '').trim().toLowerCase(),
                item,
            ])
        );

        // 6. Merge: each product + its physical stock status
        const items = dmsProducts.map((dmsItem) => {
            const key = String(dmsItem.product_erp_id || '').trim().toLowerCase();
            const physItem = physicalByErp.get(key) || null;
            return {
                ...dmsItem,
                physical_stock: physItem,
                is_approved: physItem !== null,
            };
        });

        return res.status(200).json({
            dmsImportId,
            dmsImport,
            items,
        });
    } catch (error) {
        console.error('Error fetching physical stock for company:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const approvePhysicalStockFromDms = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.body?.dmsImportId);
        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date.' });
        }

        const productErpId = String(
            req.body?.productErpId
            || req.body?.product_erp_id
            || req.body?.erpId
            || ''
        ).trim();
        if (!productErpId) {
            return res.status(400).json({ error: 'Product ERP ID is required.' });
        }

        const dmsResult = await DmsStockModel.getImportById(dmsImportId);
        if (!dmsResult) {
            return res.status(404).json({ error: 'Selected DMS stock upload was not found.' });
        }

        const product = await DmsStockModel.getProductByErpIdInImport(dmsImportId, productErpId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found in selected DMS stock.' });
        }

        // Build physical stock row using DMS total_current_stock_in_pcs as the total
        const pcsPerBox = Number(product.pcs_per_box) || 0;
        const totalPcs = Number(product.total_current_stock_in_pcs) || 0;

        let physicalStockInCase = 0;
        let physicalStockInPcs = 0;
        if (pcsPerBox > 0) {
            physicalStockInCase = Math.floor(totalPcs / pcsPerBox);
            physicalStockInPcs = Math.round((totalPcs - physicalStockInCase * pcsPerBox) * 10000) / 10000;
        } else {
            physicalStockInPcs = totalPcs;
        }

        const row = normalizePhysicalStockRow({
            'Product ERP ID': product.product_erp_id,
            'SKU Name': product.product_name,
            'Product Division': product.product_division || '',
            'Variant Name': product.variant_name,
            'Pcs/Box': pcsPerBox,
            'Physical Stock In Case': physicalStockInCase,
            'Physical Stock In Pcs': physicalStockInPcs,
            'Price/Pcs': product.price_per_piece,
            MRP: product.mrp,
            'Stock Update Date': new Date().toISOString().slice(0, 10),
        });
        row.rawData = {
            ...row.rawData,
            approvedAsCurrentStock: true,
        };

        const existingImport = await PhysicalStockModel.getManualImportByDmsImportId(dmsImportId);
        let result;

        if (existingImport) {
            result = await PhysicalStockModel.upsertItemsToImport(existingImport.id, [row]);
        } else {
            const summary = buildPhysicalStockSummary([row]);
            result = await PhysicalStockModel.createImport({
                dmsImportId,
                fileName: 'Manual Entry',
                rowCount: 1,
                summary,
                rows: [row],
            });
        }

        return res.status(201).json({
            message: 'Physical stock approved and set as current stock successfully',
            ...result,
        });
    } catch (error) {
        console.error('Error approving physical stock from DMS:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};

export const approvePhysicalStockAsCurrentStock = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.body?.dmsImportId);
        const productErpId = String(req.body?.productErpId || '').trim();
        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date.' });
        }
        if (!productErpId) {
            return res.status(400).json({ error: 'Product ERP ID is required.' });
        }

        const physicalItems = await PhysicalStockModel.getMergedItemsByDmsImportId(dmsImportId);
        const physicalItem = physicalItems.find((item) =>
            String(item.product_erp_id || '').trim().toLowerCase() === productErpId.toLowerCase()
        );
        if (!physicalItem) {
            return res.status(400).json({ error: 'Add Physical Stock for this product before setting it as Current Stock.' });
        }

        await PhysicalStockModel.approveAsCurrentStock(physicalItem.id);
        return res.json({
            message: 'Physical Stock is now set as Current Stock.',
        });
    } catch (error) {
        console.error('Error approving physical stock as current stock:', error);
        return res.status(500).json({ error: 'Unable to set Physical Stock as Current Stock.' });
    }
};

export const createManualPhysicalStock = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.body?.dmsImportId);
        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date.' });
        }

        const dmsResult = await DmsStockModel.getImportById(dmsImportId);
        if (!dmsResult) {
            return res.status(404).json({ error: 'Selected DMS stock upload was not found.' });
        }

        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (!items.length) {
            return res.status(400).json({ error: 'Please select a product.' });
        }

        const rows = [];
        for (const item of items) {
            rows.push(await buildPhysicalRowFromDmsProduct(dmsImportId, item));
        }

        const existingImport = await PhysicalStockModel.getManualImportByDmsImportId(dmsImportId);
        let result;

        if (existingImport) {
            result = await PhysicalStockModel.upsertItemsToImport(existingImport.id, rows);
        } else {
            const summary = buildPhysicalStockSummary(rows);
            result = await PhysicalStockModel.createImport({
                dmsImportId,
                fileName: 'Manual Entry',
                rowCount: rows.length,
                summary,
                rows,
            });
        }

        return res.status(201).json({
            message: existingImport
                ? 'Physical stock updated successfully'
                : 'Physical stock saved successfully',
            ...result,
        });
    } catch (error) {
        console.error('Error saving manual physical stock:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};
