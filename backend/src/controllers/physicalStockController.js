import { parse } from 'csv-parse/sync';
import xlsx from 'xlsx';
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
    expiredStockDate: ['expired stock', 'expiry date', 'expired date'],
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
    const expiredStockDateRaw = findValue(row, 'expiredStockDate');
    const expiredStockDate = toIsoDateOrNull(expiredStockDateRaw);

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
        expiredStockDate,
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
        const erpId = String(req.query.erpId || '').trim();

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

    const product = await DmsStockModel.getProductByErpIdInImport(dmsImportId, erpId);
    if (!product) {
        const error = new Error(`Product not found in DMS stock for ERP ID: ${erpId}`);
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
        'Price/Pcs': product.price_per_piece,
        MRP: product.mrp,
        'Expired Stock': product.expiry_date || item.expiredStockDate || '',
    });
}

export const getPhysicalStockItemHistory = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.query.dmsImportId);
        const erpId = String(req.query.erpId || '').trim();

        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date.' });
        }
        if (!erpId) {
            return res.status(400).json({ error: 'Product ERP ID is required.' });
        }

        const history = await PhysicalStockModel.getItemHistory(dmsImportId, erpId);
        return res.status(200).json({ history });
    } catch (error) {
        console.error('Error fetching physical stock item history:', error);
        return res.status(500).json({ error: 'Internal server error' });
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
