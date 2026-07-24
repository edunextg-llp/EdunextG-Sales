import { parse } from 'csv-parse/sync';
import xlsx from 'xlsx';
import CompanyModel from '../models/companyModel.js';
import DmsStockModel from '../models/dmsStockModel.js';

const HEADER_ALIASES = {
    productErpId: ['product erp id'],
    productName: ['sku name', 'product name'],
    variantName: ['variant name'],
    pcsPerBox: ['pcs/box', 'pcs per box'],
    currentStockInCase: ['current stock in case'],
    currentStockInPcs: ['current stock in pcs'],
    totalCurrentStockInPcs: ['total current stock in pcs'],
    pricePerPiece: ['price/pcs', 'price per pcs', 'price per piece'],
    mrp: ['mrp'],
    totalPurchasesInStockUnit: ['total purchases in stock'],
    purchasesInStockValue: ['purchases in stock value'],
    dpPerUnitStock: ['dp- per unit stock', 'dp per unit stock'],
    totalInvoicedStockUnit: ['total invoiced stock'],
    invoicedStockValue: ['invoiced stock value'],
    totalClosingStockUnit: ['total closing stock'],
    closingStockValue: ['closing stock value'],
    totalInTransitStockQuantityUnit: ['total in transit stock quantity'],
    inTransitStockValue: ['in transit stock value'],
    totalPieces: ['total pieces'],
    totalValue: ['value (closing + in transit)', 'total value'],
    purchasePrice: ['purchase price'],
    expiryDate: ['expiry date', 'expiration date'],
};

const normalizeHeader = (header) =>
    String(header || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

const findValue = (row, key) => {
    const entries = Object.entries(row);
    const aliases = HEADER_ALIASES[key] || [];
    const exactMatch = entries.find(([header]) => aliases.includes(normalizeHeader(header)));
    if (exactMatch) return exactMatch[1];

    const partialMatch = entries.find(([header]) => {
        const normalized = normalizeHeader(header);
        return aliases.some((alias) => normalized.includes(alias));
    });
    return partialMatch ? partialMatch[1] : '';
};

const hasHeader = (row, key) => {
    const aliases = HEADER_ALIASES[key] || [];
    return Object.keys(row).some((header) => {
        const normalized = normalizeHeader(header);
        return aliases.some((alias) => normalized === alias || normalized.includes(alias));
    });
};

const toNumber = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const cleaned = String(value).replace(/,/g, '').trim();
    if (!cleaned) return 0;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const roundRate = (value) => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;

const textValue = (value) => String(value || '').trim();

export function parseRows(file) {
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

export function normalizeStockRow(row) {
    const pcsPerBox = toNumber(findValue(row, 'pcsPerBox'));
    const currentStockInCase = toNumber(findValue(row, 'currentStockInCase'));
    const currentStockInPcs = toNumber(findValue(row, 'currentStockInPcs'));
    const sourceTotalCurrentStockInPcs = findValue(row, 'totalCurrentStockInPcs');
    const totalCurrentStockInPcs = sourceTotalCurrentStockInPcs === '' || sourceTotalCurrentStockInPcs === null
        ? roundRate((pcsPerBox * currentStockInCase) + currentStockInPcs)
        : toNumber(sourceTotalCurrentStockInPcs);
    const pricePerPiece = toNumber(findValue(row, 'pricePerPiece'));
    const mrp = toNumber(findValue(row, 'mrp'));

    const totalPurchasesInStockUnit = toNumber(findValue(row, 'totalPurchasesInStockUnit'));
    const purchasesInStockValue = toNumber(findValue(row, 'purchasesInStockValue'));
    const totalInvoicedStockUnit = toNumber(findValue(row, 'totalInvoicedStockUnit'));
    const invoicedStockValue = toNumber(findValue(row, 'invoicedStockValue'));
    const totalInTransitStockQuantityUnit = toNumber(findValue(row, 'totalInTransitStockQuantityUnit'));
    const inTransitStockValue = toNumber(findValue(row, 'inTransitStockValue'));

    const sourceDp = toNumber(findValue(row, 'dpPerUnitStock'));
    const dpPerUnitStock = sourceDp || (
        totalPurchasesInStockUnit ? roundRate(purchasesInStockValue / totalPurchasesInStockUnit) : 0
    );

    const sourceClosingUnit = findValue(row, 'totalClosingStockUnit');
    const totalClosingStockUnit = sourceClosingUnit === '' || sourceClosingUnit === null
        ? roundRate(totalPurchasesInStockUnit - totalInvoicedStockUnit)
        : toNumber(sourceClosingUnit);

    const sourceClosingValue = findValue(row, 'closingStockValue');
    const closingStockValue = sourceClosingValue === '' || sourceClosingValue === null
        ? roundMoney(purchasesInStockValue - invoicedStockValue)
        : toNumber(sourceClosingValue);

    const sourceTotalPieces = findValue(row, 'totalPieces') || sourceTotalCurrentStockInPcs;
    const totalPieces = sourceTotalPieces === '' || sourceTotalPieces === null
        ? (hasHeader(row, 'pcsPerBox') || hasHeader(row, 'currentStockInCase') || hasHeader(row, 'currentStockInPcs')
            ? totalCurrentStockInPcs
            : roundRate(totalClosingStockUnit + totalInTransitStockQuantityUnit))
        : toNumber(sourceTotalPieces);

    const sourceTotalValue = findValue(row, 'totalValue');
    const totalValue = sourceTotalValue === '' || sourceTotalValue === null
        ? roundMoney(totalCurrentStockInPcs * pricePerPiece) || roundMoney(closingStockValue + inTransitStockValue)
        : toNumber(sourceTotalValue);

    const purchasePriceText = findValue(row, 'purchasePrice');
    const purchasePrice = purchasePriceText === '' || purchasePriceText === null
        ? null
        : toNumber(purchasePriceText);

    return {
        productErpId: textValue(findValue(row, 'productErpId')),
        productName: textValue(findValue(row, 'productName')),
        productDivision: '',
        variantName: textValue(findValue(row, 'variantName')),
        pcsPerBox,
        currentStockInCase,
        currentStockInPcs,
        totalCurrentStockInPcs,
        pricePerPiece,
        mrp,
        totalPurchasesInStockUnit,
        purchasesInStockValue,
        dpPerUnitStock,
        totalInvoicedStockUnit,
        invoicedStockValue,
        totalClosingStockUnit,
        closingStockValue,
        totalInTransitStockQuantityUnit,
        inTransitStockValue,
        totalPieces,
        totalValue,
        purchasePrice,
        expiryDate: textValue(findValue(row, 'expiryDate')) || null,
        rawData: row,
    };
}

export function buildSummary(rows) {
    return rows.reduce((summary, row) => ({
        totalStockCases: roundRate(summary.totalStockCases + row.currentStockInCase),
        totalStockPcs: roundRate(summary.totalStockPcs + row.currentStockInPcs),
        totalPurchaseUnits: roundRate(summary.totalPurchaseUnits + row.totalPurchasesInStockUnit),
        totalPurchaseValue: roundMoney(summary.totalPurchaseValue + row.purchasesInStockValue),
        totalInvoicedUnits: roundRate(summary.totalInvoicedUnits + row.totalInvoicedStockUnit),
        totalInvoicedValue: roundMoney(summary.totalInvoicedValue + row.invoicedStockValue),
        totalClosingUnits: roundRate(summary.totalClosingUnits + row.totalClosingStockUnit),
        totalClosingValue: roundMoney(summary.totalClosingValue + row.closingStockValue),
        totalInTransitUnits: roundRate(summary.totalInTransitUnits + row.totalInTransitStockQuantityUnit),
        totalInTransitValue: roundMoney(summary.totalInTransitValue + row.inTransitStockValue),
        totalPieces: roundRate(summary.totalPieces + row.totalPieces),
        totalValue: roundMoney(summary.totalValue + row.totalValue),
    }), {
        totalStockCases: 0,
        totalStockPcs: 0,
        totalPurchaseUnits: 0,
        totalPurchaseValue: 0,
        totalInvoicedUnits: 0,
        totalInvoicedValue: 0,
        totalClosingUnits: 0,
        totalClosingValue: 0,
        totalInTransitUnits: 0,
        totalInTransitValue: 0,
        totalPieces: 0,
        totalValue: 0,
    });
}

function normalizeUploadDate(value) {
    const trimmed = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export const uploadDmsStock = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a stock Excel or CSV file.' });
        }

        const companyId = parseInt(req.body?.companyId, 10);
        if (!Number.isFinite(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Please select a company.' });
        }

        const company = await CompanyModel.getById(companyId);
        if (!company) {
            return res.status(400).json({ error: 'Selected company was not found.' });
        }

        const parsedRows = parseRows(req.file);
        const productDivision = String(company.name || '').trim();
        const rows = parsedRows
            .map(normalizeStockRow)
            .filter((row) => row.productErpId || row.productName)
            .map((row) => ({
                ...row,
                productDivision,
            }));

        if (!rows.length) {
            return res.status(400).json({ error: 'No stock rows found in the uploaded file.' });
        }

        const summary = buildSummary(rows);
        const result = await DmsStockModel.createImport({
            fileName: req.file.originalname,
            companyId,
            uploadDate: normalizeUploadDate(req.body?.uploadDate),
            rowCount: rows.length,
            summary,
            rows,
        });

        res.status(201).json({
            message: 'DMS stock uploaded successfully',
            ...result,
        });
    } catch (error) {
        console.error('Error uploading DMS stock:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};

export const getLatestDmsStock = async (req, res) => {
    try {
        const uploadDate = String(req.query.uploadDate || '').trim();
        const importId = parseInt(req.query.importId, 10);
        let latestImport = null;

        if (Number.isFinite(importId) && importId > 0) {
            latestImport = { id: importId };
        } else if (uploadDate) {
            latestImport = await DmsStockModel.getImportByUploadDate(uploadDate);
        } else {
            latestImport = await DmsStockModel.getLatestImport();
        }
        if (!latestImport) {
            return res.status(200).json({ import: null, items: [] });
        }

        const result = await DmsStockModel.getImportById(latestImport.id);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error fetching DMS stock:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getDmsStockImports = async (req, res) => {
    try {
        const imports = await DmsStockModel.getImports();
        res.status(200).json({ imports });
    } catch (error) {
        console.error('Error fetching DMS stock dates:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const searchDmsStockProducts = async (req, res) => {
    try {
        const companyId = parseInt(req.query.companyId, 10);
        if (!Number.isFinite(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Please select a company.' });
        }

        const search = String(req.query.search || '').trim();
        const products = await DmsStockModel.searchProductsByErpId(companyId, search);
        res.status(200).json({ products });
    } catch (error) {
        console.error('Error searching DMS stock products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const lookupDmsStockProduct = async (req, res) => {
    try {
        const companyId = parseInt(req.query.companyId, 10);
        const erpId = String(req.query.erpId || '').trim();

        if (!Number.isFinite(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Please select a company.' });
        }
        if (!erpId) {
            return res.status(400).json({ error: 'Product ERP ID is required.' });
        }

        const product = await DmsStockModel.getLatestProductByErpId(companyId, erpId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found for this ERP ID.' });
        }

        res.status(200).json({ product });
    } catch (error) {
        console.error('Error looking up DMS stock product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

function manualItemToRow(item = {}) {
    return {
        'Product ERP ID': item.productErpId,
        'SKU Name': item.productName,
        'Variant Name': item.variantName,
        'Pcs/Box': item.pcsPerBox,
        'Current Stock In Case': item.currentStockInCase,
        'Current Stock In Pcs': item.currentStockInPcs,
        'Total Current Stock In Pcs': item.totalCurrentStockInPcs,
        'Price/Pcs': item.pricePerPiece,
        MRP: item.mrp,
        'Total Value': item.totalValue,
        'Purchase Price': item.purchasePrice,
        'Batch Number': item.batchNumber,
        'MFG Date': item.mfgDate,
        'Expiry Date': item.expiryDate,
    };
}

export const createManualDmsStock = async (req, res) => {
    try {
        const companyId = parseInt(req.body?.companyId, 10);
        if (!Number.isFinite(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Please select a company.' });
        }

        const company = await CompanyModel.getById(companyId);
        if (!company) {
            return res.status(400).json({ error: 'Selected company was not found.' });
        }

        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const invoiceNumber = textValue(req.body?.invoiceNumber);
        if (!invoiceNumber) {
            return res.status(400).json({ error: 'Invoice number is required.' });
        }
        if (!items.length) {
            return res.status(400).json({ error: 'Please add at least one stock item.' });
        }
        const invalidItem = items.find((item) => (
            !String(item?.batchNumber || '').trim()
            || !/^\d{4}-\d{2}-\d{2}$/.test(String(item?.mfgDate || ''))
            || !/^\d{4}-\d{2}-\d{2}$/.test(String(item?.expiryDate || ''))
            || String(item.mfgDate) > String(item.expiryDate)
            || !Number.isFinite(Number(item?.dpPrice))
            || Number(item.dpPrice) <= 0
            || !Number.isFinite(Number(item?.mrp))
            || Number(item.mrp) <= 0
            || Number(item?.retailPrice) < Number(item.dpPrice)
            || Number(item?.wholesalePrice) < Number(item.dpPrice)
        ));
        if (invalidItem) {
            return res.status(400).json({
                error: 'Every item requires batch number, valid MFG/expiry dates, MRP, DP, retail, and wholesale prices.',
            });
        }

        const productDivision = String(company.name || '').trim();
        const rows = items
            .map((item) => {
                const row = normalizeStockRow(manualItemToRow(item));
                const dpPrice = roundRate(toNumber(item.dpPrice));
                const discountPercent = Math.max(0, Math.min(100, roundRate(toNumber(item.discountPercent))));
                const gstPercent = 5;
                const price = roundMoney(dpPrice * row.totalPieces);
                const discountAmount = roundMoney(price * discountPercent / 100);
                const taxableAmount = roundMoney(price - discountAmount);
                const cgstAmount = roundMoney(taxableAmount * 0.025);
                const sgstAmount = roundMoney(taxableAmount * 0.025);
                const totalPrice = roundMoney(taxableAmount + cgstAmount + sgstAmount);
                const retailPrice = roundRate(toNumber(item.retailPrice));
                const wholesalePrice = roundRate(toNumber(item.wholesalePrice));

                return {
                    ...row,
                    pricePerPiece: dpPrice,
                    dpPerUnitStock: dpPrice,
                    purchasePrice: dpPrice,
                    totalValue: totalPrice,
                    batchNumber: textValue(item.batchNumber),
                    mfgDate: textValue(item.mfgDate),
                    expiryDate: textValue(item.expiryDate),
                    dpPrice,
                    price,
                    discountPercent,
                    discountAmount,
                    gstPercent,
                    cgstAmount,
                    sgstAmount,
                    taxableAmount,
                    retailPrice,
                    wholesalePrice,
                    retailMargin: roundRate(retailPrice - dpPrice),
                    wholesaleMargin: roundRate(wholesalePrice - dpPrice),
                };
            })
            .filter((row) => row.productErpId || row.productName)
            .map((row) => ({
                ...row,
                productDivision,
            }));

        if (!rows.length) {
            return res.status(400).json({ error: 'No valid stock rows found. Product ERP ID or SKU Name is required.' });
        }

        const uploadDate = normalizeUploadDate(req.body?.uploadDate);
        const existingImport = await DmsStockModel.getManualImportByCompanyAndDate(
            companyId,
            uploadDate,
            invoiceNumber
        );

        let result;
        if (existingImport) {
            result = await DmsStockModel.upsertItemsToImport(existingImport.id, rows);
        } else {
            const summary = buildSummary(rows);
            result = await DmsStockModel.createImport({
                fileName: 'Manual Entry',
                companyId,
                invoiceNumber,
                uploadDate,
                rowCount: rows.length,
                summary,
                rows,
            });
        }

        res.status(201).json({
            message: existingImport
                ? 'DMS stock updated successfully'
                : 'DMS stock saved successfully',
            ...result,
        });
    } catch (error) {
        console.error('Error saving manual DMS stock:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};
