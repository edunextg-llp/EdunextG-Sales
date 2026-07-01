import { parse } from 'csv-parse/sync';
import xlsx from 'xlsx';
import CurrentStockModel from '../models/currentStockModel.js';
import DmsStockModel from '../models/dmsStockModel.js';

const HEADER_ALIASES = {
    productErpId: ['product erp id'],
    productName: ['sku name', 'product name'],
    productDivision: ['product division'],
    variantName: ['variant name'],
    pcsPerBox: ['pcs/box', 'pcs per box'],
    currentStockInCase: ['current stock in case'],
    currentStockInPcs: ['current stock in pcs'],
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

export function parseCurrentStockRows(file) {
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

export function normalizeCurrentStockRow(row) {
    const pcsPerBox = toNumber(findValue(row, 'pcsPerBox'));
    const currentStockInCase = toNumber(findValue(row, 'currentStockInCase'));
    const currentStockInPcs = toNumber(findValue(row, 'currentStockInPcs'));
    const pricePerPiece = toNumber(findValue(row, 'pricePerPiece'));
    const totalCurrentStockInPcs = roundQuantity((currentStockInCase * pcsPerBox) + currentStockInPcs);
    const totalValue = roundMoney(totalCurrentStockInPcs * pricePerPiece);

    return {
        productErpId: textValue(findValue(row, 'productErpId')),
        productName: textValue(findValue(row, 'productName')),
        productDivision: textValue(findValue(row, 'productDivision')),
        variantName: textValue(findValue(row, 'variantName')),
        pcsPerBox,
        currentStockInCase,
        currentStockInPcs,
        totalCurrentStockInPcs,
        pricePerPiece,
        mrp: toNumber(findValue(row, 'mrp')),
        totalValue,
        rawData: row,
    };
}

export function buildCurrentStockSummary(rows) {
    return rows.reduce((summary, row) => ({
        totalCases: roundQuantity(summary.totalCases + row.currentStockInCase),
        totalLoosePcs: roundQuantity(summary.totalLoosePcs + row.currentStockInPcs),
        totalPieces: roundQuantity(summary.totalPieces + row.totalCurrentStockInPcs),
        totalValue: roundMoney(summary.totalValue + row.totalValue),
    }), { totalCases: 0, totalLoosePcs: 0, totalPieces: 0, totalValue: 0 });
}

const parseDmsImportId = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const getCurrentStock = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.query.dmsImportId);
        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date.' });
        }
        const dmsResult = await DmsStockModel.getImportById(dmsImportId);
        if (!dmsResult) {
            return res.status(404).json({ error: 'Selected DMS stock upload was not found.' });
        }
        const currentResult = await CurrentStockModel.getLatestByDmsImportId(dmsImportId);
        return res.status(200).json(currentResult || { import: null, items: [] });
    } catch (error) {
        console.error('Error fetching current stock:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const uploadCurrentStock = async (req, res) => {
    try {
        const dmsImportId = parseDmsImportId(req.body?.dmsImportId);
        if (!dmsImportId) {
            return res.status(400).json({ error: 'Please choose a DMS stock upload date first.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a current stock Excel or CSV file.' });
        }
        const dmsResult = await DmsStockModel.getImportById(dmsImportId);
        if (!dmsResult) {
            return res.status(404).json({ error: 'Selected DMS stock upload was not found.' });
        }

        const rows = parseCurrentStockRows(req.file)
            .map(normalizeCurrentStockRow)
            .filter((row) => row.productErpId || row.productName);
        if (!rows.length) {
            return res.status(400).json({ error: 'No current stock rows found in the uploaded file.' });
        }

        const summary = buildCurrentStockSummary(rows);
        const result = await CurrentStockModel.createImport({
            dmsImportId,
            fileName: req.file.originalname,
            rowCount: rows.length,
            summary,
            rows,
        });
        return res.status(201).json({
            message: 'Current stock uploaded and calculated successfully',
            ...result,
        });
    } catch (error) {
        console.error('Error uploading current stock:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};
