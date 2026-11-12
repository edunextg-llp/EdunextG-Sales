import { parse } from 'csv-parse/sync';
import xlsx from 'xlsx';
import CompanyModel from '../models/companyModel.js';
import DmsStockModel from '../models/dmsStockModel.js';
import PhysicalStockModel from '../models/physicalStockModel.js';
import SellerItemModel from '../models/sellerItemModel.js';
import PurchaseSellerModel from '../models/purchaseSellerModel.js';

const HEADER_ALIASES = {
    productErpId: ['product erp id'],
    productName: ['sku name', 'product name'],
    variantName: ['variant name'],
    pcsPerBox: ['pcs/box', 'pcs per box'],
    currentStockInCase: ['current stock in case', 'no. of boxes', 'no of boxes', 'number of boxes'],
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
    batchNumber: ['batch number', 'batch no', 'batch'],
    mfgDate: ['mfg date', 'manufacturing date'],
    dpPrice: ['dp price', 'dp'],
    discountPercent: ['discount %', 'discount percent'],
    retailPrice: ['retail price (incl. 5% gst)', 'retail price'],
    wholesalePrice: ['wholesale price (incl. 5% gst)', 'wholesale price'],
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

const getDpPriceAfterDiscount = (dpPrice, discountPercent) => {
    const normalizedDiscount = Math.max(0, Math.min(100, toNumber(discountPercent)));
    return toNumber(dpPrice) * (1 - normalizedDiscount / 100);
};

// Companies whose DMS stock entries do not need Retail / Wholesale Price
// (Distributor: SALONI, CNF: ASSAM TEA CORPORATION). Every other company still requires them.
const SALE_PRICE_OPTIONAL_COMPANIES = new Set(['SALONI', 'ASSAM TEA CORPORATION']);
const isSalePriceOptionalCompany = (companyName) =>
    SALE_PRICE_OPTIONAL_COMPANIES.has(String(companyName || '').trim().replace(/\s+/g, ' ').toUpperCase());
// A retail/wholesale price is invalid when below DP after discount. For the companies above
// a blank (or 0) price is allowed; an entered price is still checked.
const isSalePriceInvalid = (price, dpPrice, discountPercent, optional) => {
    if (optional && (price === '' || price == null || toNumber(price) <= 0)) return false;
    return Number(price) < getDpPriceAfterDiscount(dpPrice, discountPercent);
};
// No price entered -> no margin (instead of a negative margin).
const saleMargin = (price, dpPrice, discountPercent) =>
    (price > 0 ? roundRate(price - getDpPriceAfterDiscount(dpPrice, discountPercent)) : 0);

// DMS Add Purchase lines: margin = sale price - DP amt, where DP amt = DP + GST per piece.
const dpAmtOf = (calc) => roundRate(calc.dpPrice * (1 + calc.gstPercent / 100));
const dpAmtMargin = (price, calc) => (price > 0 ? roundRate(price - dpAmtOf(calc)) : 0);

// Wholesale / retail typed on a DMS line can't be below DP amt. Blank prices are not
// checked (they fall back to the last known price). Returns an error or ''.
const salePriceBelowDpAmt = (item, calc, label = '') => {
    const dpAmt = dpAmtOf(calc);
    for (const [key, name] of [['wholesalePrice', 'Wholesale'], ['retailPrice', 'Retail']]) {
        const raw = item?.[key];
        if (raw === undefined || raw === null || String(raw).trim() === '') continue;
        if (roundRate(toNumber(raw)) < dpAmt) {
            return `${label}${name} price ₹${roundRate(toNumber(raw))} can't be below DP amt ₹${dpAmt} (DP + GST).`;
        }
    }
    return '';
};

// ---- DMS "Add Purchase" pricing (lines sent with pricingMode: 'mrp') ----
// Net = DP x qty. Discount % is Trade + Primary + Cash when those are sent (EVEREST),
// otherwise the single Discount %. GST (item's rate, split CGST/SGST) goes on top of
// Net - discount. Cost per piece = taxable / qty, stored as the purchase price.
// MRP is stored for reference. Lines saved before DP was added carry no DP: their
// MRP was the base rate, so it is used instead (dp_price already holds it).
// The mode keeps the name 'mrp' so lines already saved with it still match.
// Keep in sync with dms/src/utils/purchaseCalc.js.
const SPLIT_DISCOUNT_KEYS = ['tradeDiscountPercent', 'primaryDiscountPercent', 'cashDiscountPercent'];
const clampPercent = (value) => Math.max(0, Math.min(100, roundRate(toNumber(value))));
const isMrpPricing = (item) => item?.pricingMode === 'mrp';

const parseRawData = (raw) => {
    if (!raw) return {};
    if (typeof raw !== 'string') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
};

function calcMrpLine(item, totalPieces) {
    const mrp = roundRate(toNumber(item.mrp));
    const dpPrice = roundRate(toNumber(item.dpPrice) || mrp);
    const hasSplit = SPLIT_DISCOUNT_KEYS.some((key) => textValue(item[key]) !== '');
    const discountPercent = clampPercent(hasSplit
        ? SPLIT_DISCOUNT_KEYS.reduce((sum, key) => sum + toNumber(item[key]), 0)
        : item.discountPercent);
    const gstPercent = textValue(item.gstPercent) === '' ? 5 : clampPercent(item.gstPercent);
    const price = roundRate(dpPrice * totalPieces);
    const discountAmount = roundRate(price * discountPercent / 100);
    const taxableAmount = roundRate(price - discountAmount);
    const cgstAmount = roundRate(taxableAmount * gstPercent / 200);
    const sgstAmount = roundRate(taxableAmount * gstPercent / 200);
    const costPerPiece = totalPieces
        ? roundRate(taxableAmount / totalPieces)
        : roundRate(dpPrice * (1 - discountPercent / 100));
    return {
        mrp,
        dpPrice,
        discountPercent,
        gstPercent,
        price,
        discountAmount,
        taxableAmount,
        cgstAmount,
        sgstAmount,
        totalValue: roundRate(taxableAmount + cgstAmount + sgstAmount),
        costPerPiece,
        rawFields: {
            'Pricing Mode': 'mrp',
            'Trade Discount %': hasSplit ? clampPercent(item.tradeDiscountPercent) : '',
            'Primary Discount %': hasSplit ? clampPercent(item.primaryDiscountPercent) : '',
            'Cash Discount %': hasSplit ? clampPercent(item.cashDiscountPercent) : '',
            'GST %': gstPercent,
        },
    };
}

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

// An invoice can hold the same item on several lines (e.g. two MRPs). Stock is kept
// per item, so before syncing, every line of each touched item is reloaded from the
// invoice and added up into one row. An item with no lines left is removed.
const itemKey = (value) => String(value || '').trim().toLowerCase();

const combineInvoiceRowsByItem = (rows) => {
    const byItem = new Map();
    rows.forEach((row) => {
        const key = itemKey(row.productErpId);
        const pcs = Math.max(0, toNumber(row.totalCurrentStockInPcs));
        const rate = toNumber(row.pricePerPiece || row.dpPrice);
        const current = byItem.get(key);
        if (!current) {
            byItem.set(key, { ...row, totalCurrentStockInPcs: pcs, costTotal: pcs * rate, lastRate: rate });
            return;
        }
        // Names, box size and MRP come from the latest line; quantity is the sum.
        byItem.set(key, {
            ...current,
            ...row,
            totalCurrentStockInPcs: current.totalCurrentStockInPcs + pcs,
            costTotal: current.costTotal + pcs * rate,
            lastRate: rate,
        });
    });
    return [...byItem.values()].map((row) => ({
        ...row,
        // Average purchase cost across the item's lines.
        pricePerPiece: row.totalCurrentStockInPcs
            ? roundRate(row.costTotal / row.totalCurrentStockInPcs)
            : row.lastRate,
    }));
};

// A purchase invoice (seller / invoice entry), as opposed to a DMS stock file upload.
const isPurchaseInvoice = (imp) => Boolean(imp && (imp.seller_id || imp.invoice_number || imp.file_name === 'Manual Entry'));

// Purchase invoices ADD to stock as date-wise MRP lots (see PhysicalStockModel.applyPurchaseLots):
// earlier stock stays, and editing / deleting an invoice line changes stock only by the difference.
const addPurchaseToStock = async (result, keys) => {
    const imp = result.import;
    const items = [...keys].map((key) => {
        const lines = (result.items || []).filter((item) => itemKey(item.product_erp_id) === key);
        const first = lines[lines.length - 1] || {};
        return {
            productErpId: first.product_erp_id || key,
            productName: first.product_name,
            productDivision: first.product_division,
            variantName: first.variant_name,
            pcsPerBox: first.pcs_per_box,
            pricePerPiece: first.purchase_price ?? first.price_per_piece,
            mrp: first.mrp,
            lots: lines.map((line) => ({
                mrp: line.mrp,
                batchNumber: line.batch_number,
                mfgDate: line.mfg_date,
                expiryDate: line.expiry_date,
                pcs: line.total_current_stock_in_pcs,
            })),
        };
    });
    await PhysicalStockModel.applyPurchaseLots({
        dmsImportId: imp.id,
        companyId: imp.company_id,
        receivedDate: imp.upload_date,
        sourceLabel: `Purchase ${imp.invoice_number || imp.entry_code || `#${imp.id}`}`,
        items,
    });
    return null;
};

const syncDmsRowsToPhysicalAndCurrent = async (dmsImportId, rows, stockUpdateDate) => {
    const keys = new Set(rows.map((row) => itemKey(row.productErpId)).filter(Boolean));
    if (!keys.size) return null;
    const result = await DmsStockModel.getImportById(dmsImportId);
    if (isPurchaseInvoice(result?.import)) {
        // Lines removed from the invoice keep their key here with no lines: their lots come off.
        return addPurchaseToStock(result, keys);
    }
    const invoiceRows = (result?.items || [])
        .filter((item) => keys.has(itemKey(item.product_erp_id)))
        .sort((a, b) => a.id - b.id)
        .map((item) => ({
            productErpId: item.product_erp_id,
            productName: item.product_name,
            productDivision: item.product_division,
            variantName: item.variant_name,
            pcsPerBox: item.pcs_per_box,
            totalCurrentStockInPcs: item.total_current_stock_in_pcs,
            pricePerPiece: item.purchase_price ?? item.price_per_piece,
            mrp: item.mrp,
        }));
    const combined = combineInvoiceRowsByItem(invoiceRows);
    const remaining = new Set(combined.map((row) => itemKey(row.productErpId)));
    for (const key of keys) {
        if (!remaining.has(key)) {
            const original = rows.find((row) => itemKey(row.productErpId) === key);
            await PhysicalStockModel.deleteAutoSyncedItem(dmsImportId, original.productErpId);
        }
    }
    if (!combined.length) return null;
    return writePhysicalRows(dmsImportId, combined, stockUpdateDate);
};

const writePhysicalRows = async (dmsImportId, rows, stockUpdateDate) => {
    const physicalRows = rows.map((row) => {
        const pcsPerBox = Math.max(0, toNumber(row.pcsPerBox));
        const totalPcs = Math.max(0, toNumber(row.totalCurrentStockInPcs));
        const physicalStockInCase = pcsPerBox > 0 ? Math.floor(totalPcs / pcsPerBox) : 0;
        const physicalStockInPcs = roundRate(totalPcs - (physicalStockInCase * pcsPerBox));
        const pricePerPiece = toNumber(row.pricePerPiece || row.dpPrice);
        return {
            productErpId: row.productErpId,
            productName: row.productName,
            productDivision: row.productDivision,
            variantName: row.variantName,
            pcsPerBox,
            physicalStockInCase,
            physicalStockInPcs,
            totalPhysicalStockInPcs: totalPcs,
            pricePerPiece,
            mrp: toNumber(row.mrp),
            totalValue: roundRate(totalPcs * pricePerPiece),
            stockUpdateDate,
            rawData: { approvedAsCurrentStock: true, source: 'dms_auto_sync' },
        };
    });
    const existingImport = await PhysicalStockModel.getAutoImportByDmsImportId(dmsImportId);
    if (existingImport) {
        return PhysicalStockModel.upsertItemsToImport(existingImport.id, physicalRows);
    }
    const summary = physicalRows.reduce((total, row) => ({
        totalCases: roundRate(total.totalCases + row.physicalStockInCase),
        totalLoosePcs: roundRate(total.totalLoosePcs + row.physicalStockInPcs),
        totalPieces: roundRate(total.totalPieces + row.totalPhysicalStockInPcs),
        totalValue: roundRate(total.totalValue + row.totalValue),
    }), { totalCases: 0, totalLoosePcs: 0, totalPieces: 0, totalValue: 0 });
    return PhysicalStockModel.createImport({
        dmsImportId,
        fileName: 'DMS Auto Sync',
        rowCount: physicalRows.length,
        summary,
        rows: physicalRows,
    });
};

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
        await syncDmsRowsToPhysicalAndCurrent(result.import.id, rows, result.import.upload_date);

        res.status(201).json({
            message: 'DMS stock uploaded and synced to Physical Stock and Current Stock successfully',
            ...result,
        });
    } catch (error) {
        console.error('Error uploading DMS stock:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};

export const uploadManualDmsStock = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a stock Excel or CSV file.' });
        }
        const companyId = parseInt(req.body?.companyId, 10);
        const sellerId = parseInt(req.body?.sellerId, 10);
        if (!Number.isFinite(companyId) || companyId <= 0 || !Number.isFinite(sellerId) || sellerId <= 0) {
            return res.status(400).json({ error: 'Please select a company and seller before uploading.' });
        }

        const sellerItems = await SellerItemModel.getBySeller(companyId, sellerId);
        const byErp = new Map(sellerItems.map((item) => [
            String(item.product_erp_id || '').trim().toLowerCase(),
            item,
        ]));
        const parsedRows = parseRows(req.file);
        const items = parsedRows.map((rawRow, index) => {
            const erpId = textValue(findValue(rawRow, 'productErpId'));
            const productName = textValue(findValue(rawRow, 'productName'));
            const variantName = textValue(findValue(rawRow, 'variantName'));
            let sellerItem = byErp.get(erpId.toLowerCase());
            if (!sellerItem && productName) {
                sellerItem = sellerItems.find((item) => (
                    String(item.sku_name || '').trim().toLowerCase() === productName.toLowerCase()
                    && (!variantName || String(item.variant_name || '').trim().toLowerCase() === variantName.toLowerCase())
                ));
            }
            if (!sellerItem) {
                const error = new Error(`Row ${index + 2}: item was not found for the selected seller. Use a valid Product ERP ID, or matching SKU Name and Variant Name.`);
                error.statusCode = 400;
                throw error;
            }
            return {
                productErpId: sellerItem.product_erp_id,
                productName: sellerItem.sku_name,
                variantName: sellerItem.variant_name || '',
                pcsPerBox: sellerItem.pcs_per_box,
                currentStockInCase: findValue(rawRow, 'currentStockInCase'),
                currentStockInPcs: findValue(rawRow, 'currentStockInPcs'),
                batchNumber: findValue(rawRow, 'batchNumber'),
                mfgDate: findValue(rawRow, 'mfgDate'),
                expiryDate: findValue(rawRow, 'expiryDate'),
                mrp: findValue(rawRow, 'mrp'),
                dpPrice: findValue(rawRow, 'dpPrice'),
                discountPercent: findValue(rawRow, 'discountPercent') || '0',
                retailPrice: findValue(rawRow, 'retailPrice'),
                wholesalePrice: findValue(rawRow, 'wholesalePrice'),
            };
        });
        req.body = { ...req.body, items };
        return createManualDmsStock(req, res);
    } catch (error) {
        console.error('Error uploading manual DMS stock:', error);
        return res.status(error.statusCode || 500).json({ error: error.message || 'Unable to upload DMS stock.' });
    }
};

export const downloadManualDmsStockTemplate = async (req, res) => {
    try {
        const companyId = parseInt(req.query.companyId, 10);
        const sellerId = parseInt(req.query.sellerId, 10);
        if (!Number.isFinite(companyId) || companyId <= 0 || !Number.isFinite(sellerId) || sellerId <= 0) {
            return res.status(400).json({ error: 'Please select a company and seller first.' });
        }
        const seller = await PurchaseSellerModel.getById(sellerId);
        if (!seller || Number(seller.company_id) !== companyId) {
            return res.status(404).json({ error: 'Seller was not found for the selected company.' });
        }
        const sellerItems = await SellerItemModel.getBySeller(companyId, sellerId);
        if (!sellerItems.length) {
            return res.status(400).json({ error: 'No items were found for the selected seller.' });
        }

        const headers = [
            'Product ERP ID', 'SKU Name', 'Variant Name', 'HSN Code',
            'No. of Boxes', 'Current Stock In Pcs', 'Batch Number', 'MFG Date', 'Expiry Date',
            'MRP', 'DP Price', 'Discount %', 'Retail Price (Incl. 5% GST)', 'Wholesale Price (Incl. 5% GST)',
        ];
        const rows = sellerItems.map((item) => ({
            'Product ERP ID': item.product_erp_id || '',
            'SKU Name': item.sku_name || '',
            'Variant Name': item.variant_name || '',
            'HSN Code': item.hsn_code || '',
            'No. of Boxes': '',
            'Current Stock In Pcs': '',
            'Batch Number': '',
            'MFG Date': '',
            'Expiry Date': '',
            MRP: '',
            'DP Price': '',
            'Discount %': 0,
            'Retail Price (Incl. 5% GST)': '',
            'Wholesale Price (Incl. 5% GST)': '',
        }));
        const worksheet = xlsx.utils.json_to_sheet(rows, { header: headers });
        worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(14, Math.min(32, header.length + 3)) }));
        worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'DMS Stock Upload');
        const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const safeSellerName = String(seller.seller_name || 'Seller').replace(/[^A-Za-z0-9_-]/g, '_');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="DMS_Stock_${safeSellerName}.xlsx"`);
        return res.send(fileBuffer);
    } catch (error) {
        console.error('Error creating DMS stock upload template:', error);
        return res.status(500).json({ error: 'Unable to create DMS stock upload template.' });
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

// Last wholesale / retail price saved for an item (prefills DMS Add Purchase).
export const getLastDmsSalePrices = async (req, res) => {
    try {
        const companyId = parseInt(req.query.companyId, 10);
        const erpId = String(req.query.erpId || '').trim();
        if (!Number.isFinite(companyId) || companyId <= 0 || !erpId) {
            return res.status(400).json({ error: 'Company and product ERP ID are required.' });
        }
        const prices = await DmsStockModel.getLastSalePrices(companyId, [erpId]);
        const last = prices.get(erpId.toLowerCase()) || {};
        res.status(200).json({
            retailPrice: toNumber(last.retail_price) || null,
            wholesalePrice: toNumber(last.wholesale_price) || null,
        });
    } catch (error) {
        console.error('Error fetching last sale prices:', error);
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
        const sellerId = parseInt(req.body?.sellerId, 10);
        if (!Number.isFinite(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Please select a company.' });
        }

        const company = await CompanyModel.getById(companyId);
        if (!company) {
            return res.status(400).json({ error: 'Selected company was not found.' });
        }
        if (!Number.isFinite(sellerId) || sellerId <= 0) {
            return res.status(400).json({ error: 'Please select a seller.' });
        }

        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const invoiceNumber = textValue(req.body?.invoiceNumber) || null;
        const salePriceOptional = isSalePriceOptionalCompany(company.name);
        if (!items.length) {
            return res.status(400).json({ error: 'Please add at least one stock item.' });
        }
        const invalidItem = items.map((item, index) => ({ item, rowNumber: index + 2 })).find(({ item }) => (
            (item?.mfgDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(item.mfgDate)))
            || (item?.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(item.expiryDate)))
            || (item?.mfgDate && item?.expiryDate && String(item.mfgDate) > String(item.expiryDate))
            || (item?.dpPrice !== '' && item?.dpPrice != null
                && (!Number.isFinite(Number(item.dpPrice)) || Number(item.dpPrice) < 0))
            || !Number.isFinite(Number(item?.mrp))
            || Number(item.mrp) <= 0
            || (!isMrpPricing(item) && (
                isSalePriceInvalid(item?.retailPrice, item?.dpPrice, item?.discountPercent, salePriceOptional)
                || isSalePriceInvalid(item?.wholesalePrice, item?.dpPrice, item?.discountPercent, salePriceOptional)
            ))
        ));
        if (invalidItem) {
            const { item, rowNumber } = invalidItem;
            let error = `Row ${rowNumber}: Every item requires an MRP and valid retail and wholesale prices.`;
            if (item?.mfgDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(item.mfgDate))) {
                error = `Row ${rowNumber}: MFG Date must be blank or in YYYY-MM-DD format.`;
            } else if (item?.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(item.expiryDate))) {
                error = `Row ${rowNumber}: Expiry Date must be blank or in YYYY-MM-DD format.`;
            } else if (item?.mfgDate && item?.expiryDate && String(item.mfgDate) > String(item.expiryDate)) {
                error = `Row ${rowNumber}: Expiry Date must be after MFG Date.`;
            }
            return res.status(400).json({
                error,
            });
        }

        for (const [index, item] of items.entries()) {
            if (!isMrpPricing(item)) continue;
            const problem = salePriceBelowDpAmt(item, calcMrpLine(item, 0), `${textValue(item.productErpId) || `Row ${index + 1}`}: `);
            if (problem) return res.status(400).json({ error: problem });
        }

        const productDivision = String(company.name || '').trim();
        // Wholesale / retail left blank on the form: reuse the item's last known prices.
        const lastSalePrices = await DmsStockModel.getLastSalePrices(
            companyId,
            items.filter(isMrpPricing).map((item) => item.productErpId)
        );
        const rows = items
            .map((item) => {
                const row = normalizeStockRow(manualItemToRow(item));
                if (isMrpPricing(item)) {
                    const calc = calcMrpLine(item, row.totalPieces);
                    const last = lastSalePrices.get(textValue(item.productErpId).toLowerCase()) || {};
                    const retailPrice = roundRate(toNumber(item.retailPrice) || toNumber(last.retail_price));
                    const wholesalePrice = roundRate(toNumber(item.wholesalePrice) || toNumber(last.wholesale_price));
                    return {
                        ...row,
                        rawData: { ...row.rawData, ...calc.rawFields },
                        pricePerPiece: calc.costPerPiece,
                        dpPerUnitStock: calc.costPerPiece,
                        purchasePrice: calc.costPerPiece,
                        totalValue: calc.totalValue,
                        batchNumber: textValue(item.batchNumber),
                        mfgDate: textValue(item.mfgDate),
                        expiryDate: textValue(item.expiryDate),
                        dpPrice: calc.dpPrice,
                        price: calc.price,
                        discountPercent: calc.discountPercent,
                        discountAmount: calc.discountAmount,
                        gstPercent: calc.gstPercent,
                        cgstAmount: calc.cgstAmount,
                        sgstAmount: calc.sgstAmount,
                        taxableAmount: calc.taxableAmount,
                        retailPrice,
                        wholesalePrice,
                        retailMargin: dpAmtMargin(retailPrice, calc),
                        wholesaleMargin: dpAmtMargin(wholesalePrice, calc),
                    };
                }
                const dpPrice = roundRate(toNumber(item.dpPrice));
                const discountPercent = Math.max(0, Math.min(100, roundRate(toNumber(item.discountPercent))));
                const gstPercent = 5;
                const price = roundRate(dpPrice * row.totalPieces);
                const discountAmount = roundRate(price * discountPercent / 100);
                const taxableAmount = roundRate(price - discountAmount);
                const cgstAmount = roundRate(taxableAmount * 0.025);
                const sgstAmount = roundRate(taxableAmount * 0.025);
                const totalPrice = roundRate(taxableAmount + cgstAmount + sgstAmount);
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
                    retailMargin: saleMargin(retailPrice, dpPrice, discountPercent),
                    wholesaleMargin: saleMargin(wholesalePrice, dpPrice, discountPercent),
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
            sellerId,
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
                sellerId,
                invoiceNumber,
                uploadDate,
                rowCount: rows.length,
                summary,
                rows,
            });
        }
        await syncDmsRowsToPhysicalAndCurrent(result.import.id, rows, uploadDate);

        res.status(201).json({
            message: existingImport
                ? 'DMS stock updated and synced to Physical Stock and Current Stock successfully'
                : 'DMS stock saved and synced to Physical Stock and Current Stock successfully',
            ...result,
        });
    } catch (error) {
        console.error('Error saving manual DMS stock:', error);
        res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};

export const updateDmsStockItem = async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId, 10);
        const existing = await DmsStockModel.getItemById(itemId);
        if (!existing) return res.status(404).json({ error: 'Invoice item was not found.' });

        const value = (key, fallback) => req.body?.[key] ?? fallback;
        const pcsPerBox = toNumber(existing.pcs_per_box);
        const currentStockInCase = toNumber(value('currentStockInCase', existing.current_stock_in_case));
        const currentStockInPcs = toNumber(value('currentStockInPcs', existing.current_stock_in_pcs));
        const totalPieces = roundRate((pcsPerBox * currentStockInCase) + currentStockInPcs);
        const dpPrice = roundRate(toNumber(value('dpPrice', existing.dp_price)));
        const discountPercent = Math.max(0, Math.min(100,
            roundRate(toNumber(value('discountPercent', existing.discount_percent)))));
        const taxableAmount = roundRate(dpPrice * totalPieces * (1 - discountPercent / 100));
        const cgstAmount = roundRate(taxableAmount * 0.025);
        const sgstAmount = roundRate(taxableAmount * 0.025);
        // A blank sale price keeps the one already saved.
        const salePrice = (key, fallback) => {
            const raw = req.body?.[key];
            return raw === undefined || raw === null || String(raw).trim() === '' ? fallback : raw;
        };
        const retailPrice = roundRate(toNumber(salePrice('retailPrice', existing.retail_price)));
        const wholesalePrice = roundRate(toNumber(salePrice('wholesalePrice', existing.wholesale_price)));

        if (isMrpPricing(req.body)) {
            const calc = calcMrpLine({
                ...req.body,
                mrp: value('mrp', existing.mrp),
                dpPrice: value('dpPrice', existing.dp_price),
            }, totalPieces);
            const priceProblem = salePriceBelowDpAmt(req.body, calc);
            if (priceProblem) return res.status(400).json({ error: priceProblem });
            const mrpRow = {
                batchNumber: textValue(value('batchNumber', existing.batch_number)),
                mfgDate: textValue(value('mfgDate', existing.mfg_date)),
                expiryDate: textValue(value('expiryDate', existing.expiry_date)),
                currentStockInCase,
                currentStockInPcs,
                totalPieces,
                mrp: calc.mrp,
                dpPrice: calc.dpPrice,
                purchasePrice: calc.costPerPiece,
                discountPercent: calc.discountPercent,
                gstPercent: calc.gstPercent,
                cgstAmount: calc.cgstAmount,
                sgstAmount: calc.sgstAmount,
                totalValue: calc.totalValue,
                retailPrice,
                wholesalePrice,
                retailMargin: dpAmtMargin(retailPrice, calc),
                wholesaleMargin: dpAmtMargin(wholesalePrice, calc),
                rawData: { ...parseRawData(existing.raw_data), ...calc.rawFields },
            };
            const datePattern = /^\d{4}-\d{2}-\d{2}$/;
            if ((mrpRow.mfgDate && !datePattern.test(mrpRow.mfgDate))
                || (mrpRow.expiryDate && !datePattern.test(mrpRow.expiryDate))
                || (mrpRow.mfgDate && mrpRow.expiryDate && mrpRow.mfgDate > mrpRow.expiryDate)
                || mrpRow.mrp <= 0 || mrpRow.dpPrice <= 0) {
                return res.status(400).json({ error: 'Enter valid dates, MRP and DP price.' });
            }
            const mrpResult = await DmsStockModel.updateInvoiceItem(itemId, mrpRow);
            await syncDmsRowsToPhysicalAndCurrent(existing.import_id, [{
                productErpId: existing.product_erp_id,
                productName: existing.product_name,
                productDivision: existing.product_division,
                variantName: existing.variant_name,
                pcsPerBox,
                totalCurrentStockInPcs: totalPieces,
                pricePerPiece: calc.costPerPiece,
                mrp: calc.mrp,
            }], new Date().toISOString().slice(0, 10));
            return res.json({ message: 'Invoice item updated successfully.', ...mrpResult });
        }

        const row = {
            batchNumber: textValue(value('batchNumber', existing.batch_number)),
            mfgDate: textValue(value('mfgDate', existing.mfg_date)),
            expiryDate: textValue(value('expiryDate', existing.expiry_date)),
            currentStockInCase,
            currentStockInPcs,
            totalPieces,
            mrp: roundRate(toNumber(value('mrp', existing.mrp))),
            dpPrice,
            discountPercent,
            cgstAmount,
            sgstAmount,
            totalValue: roundRate(taxableAmount + cgstAmount + sgstAmount),
            retailPrice,
            wholesalePrice,
            retailMargin: saleMargin(retailPrice, dpPrice, discountPercent),
            wholesaleMargin: saleMargin(wholesalePrice, dpPrice, discountPercent),
        };
        const salePriceOptional = isSalePriceOptionalCompany(
            await DmsStockModel.getImportCompanyName(existing.import_id) || existing.product_division
        );
        if ((row.mfgDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.mfgDate))
            || (row.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate))
            || (row.mfgDate && row.expiryDate && row.mfgDate > row.expiryDate)
            || row.dpPrice <= 0 || row.mrp <= 0
            || isSalePriceInvalid(row.retailPrice, row.dpPrice, row.discountPercent, salePriceOptional)
            || isSalePriceInvalid(row.wholesalePrice, row.dpPrice, row.discountPercent, salePriceOptional)) {
            return res.status(400).json({
                error: 'Enter valid batch, dates, MRP, DP, and GST-inclusive retail/wholesale prices.',
            });
        }
        const result = await DmsStockModel.updateInvoiceItem(itemId, row);
        await syncDmsRowsToPhysicalAndCurrent(existing.import_id, [{
            productErpId: existing.product_erp_id,
            productName: existing.product_name,
            productDivision: existing.product_division,
            variantName: existing.variant_name,
            pcsPerBox,
            totalCurrentStockInPcs: totalPieces,
            pricePerPiece: dpPrice,
            mrp: row.mrp,
        }], new Date().toISOString().slice(0, 10));
        res.json({ message: 'Invoice item updated successfully.', ...result });
    } catch (error) {
        console.error('Error updating DMS invoice item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteDmsStockItem = async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId, 10);
        const existing = await DmsStockModel.getItemById(itemId);
        const result = await DmsStockModel.deleteInvoiceItem(itemId);
        if (!result) return res.status(404).json({ error: 'Invoice item was not found.' });
        if (existing) {
            // Other lines of the same item (e.g. another MRP) may still be on the invoice.
            await syncDmsRowsToPhysicalAndCurrent(
                existing.import_id,
                [{ productErpId: existing.product_erp_id }],
                new Date().toISOString().slice(0, 10)
            );
        }
        res.json({ message: 'Invoice item deleted successfully.', ...result });
    } catch (error) {
        console.error('Error deleting DMS invoice item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
