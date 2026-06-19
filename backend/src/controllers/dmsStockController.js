import { parse } from 'csv-parse/sync';
import xlsx from 'xlsx';
import DmsStockModel from '../models/dmsStockModel.js';

const HEADER_ALIASES = {
    productErpId: ['product erp id'],
    productName: ['product name'],
    productDivision: ['product division'],
    variantName: ['variant name'],
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
};

const normalizeHeader = (header) =>
    String(header || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

const findValue = (row, key) => {
    const entries = Object.entries(row);
    const aliases = HEADER_ALIASES[key] || [];
    const match = entries.find(([header]) => {
        const normalized = normalizeHeader(header);
        return aliases.some((alias) => normalized.includes(alias));
    });
    return match ? match[1] : '';
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

function parseRows(file) {
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

function normalizeStockRow(row) {
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

    const sourceTotalPieces = findValue(row, 'totalPieces');
    const totalPieces = sourceTotalPieces === '' || sourceTotalPieces === null
        ? roundRate(totalClosingStockUnit + totalInTransitStockQuantityUnit)
        : toNumber(sourceTotalPieces);

    const sourceTotalValue = findValue(row, 'totalValue');
    const totalValue = sourceTotalValue === '' || sourceTotalValue === null
        ? roundMoney(closingStockValue + inTransitStockValue)
        : toNumber(sourceTotalValue);

    const purchasePriceText = findValue(row, 'purchasePrice');
    const purchasePrice = purchasePriceText === '' || purchasePriceText === null
        ? null
        : toNumber(purchasePriceText);

    return {
        productErpId: textValue(findValue(row, 'productErpId')),
        productName: textValue(findValue(row, 'productName')),
        productDivision: textValue(findValue(row, 'productDivision')),
        variantName: textValue(findValue(row, 'variantName')),
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
        rawData: row,
    };
}

function buildSummary(rows) {
    return rows.reduce((summary, row) => ({
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

export const uploadDmsStock = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a stock Excel or CSV file.' });
        }

        const parsedRows = parseRows(req.file);
        const rows = parsedRows
            .map(normalizeStockRow)
            .filter((row) => row.productErpId || row.productName);

        if (!rows.length) {
            return res.status(400).json({ error: 'No stock rows found in the uploaded file.' });
        }

        const summary = buildSummary(rows);
        const result = await DmsStockModel.createImport({
            fileName: req.file.originalname,
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
        const latestImport = await DmsStockModel.getLatestImport();
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
