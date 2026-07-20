import DmsStockModel from '../models/dmsStockModel.js';
import PhysicalStockModel from '../models/physicalStockModel.js';

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;

const itemKey = (item) => String(item.product_erp_id || item.product_name || '').trim().toLowerCase();

const zeroStock = () => ({
    product_erp_id: '',
    product_name: '',
    product_division: '',
    variant_name: '',
    pcs_per_box: 0,
    stock_in_case: 0,
    stock_in_pcs: 0,
    total_stock_in_pcs: 0,
    price_per_piece: 0,
    mrp: 0,
    total_value: 0,
});

const pickPhysical = (item = {}) => ({
    product_erp_id: item.product_erp_id || '',
    product_name: item.product_name || '',
    product_division: item.product_division || '',
    variant_name: item.variant_name || '',
    pcs_per_box: item.pcs_per_box || 0,
    stock_in_case: item.physical_stock_in_case || 0,
    stock_in_pcs: item.physical_stock_in_pcs || 0,
    total_stock_in_pcs: item.total_physical_stock_in_pcs || 0,
    price_per_piece: item.price_per_piece || 0,
    mrp: item.mrp || 0,
    total_value: item.total_value || 0,
    expired_stock_date: item.expired_stock_date || null,
});

const pickDms = (item = {}) => ({
    product_erp_id: item.product_erp_id || '',
    product_name: item.product_name || '',
    product_division: item.product_division || '',
    variant_name: item.variant_name || '',
    pcs_per_box: item.pcs_per_box || 0,
    stock_in_case: item.current_stock_in_case || 0,
    stock_in_pcs: item.current_stock_in_pcs || 0,
    total_stock_in_pcs: item.total_current_stock_in_pcs || 0,
    price_per_piece: item.price_per_piece || 0,
    mrp: item.mrp || 0,
    total_value: roundMoney((item.total_current_stock_in_pcs || 0) * (item.price_per_piece || 0)),
});

export function buildCurrentStockDiff(physicalItems = [], dmsItems = []) {
    const pairs = new Map();

    for (const item of physicalItems) {
        const key = itemKey(item);
        if (!key) continue;
        pairs.set(key, { physical: pickPhysical(item), dms: zeroStock() });
    }

    for (const item of dmsItems) {
        const key = itemKey(item);
        if (!key) continue;
        if (pairs.has(key)) {
            pairs.get(key).dms = pickDms(item);
        } else {
            pairs.set(key, { physical: zeroStock(), dms: pickDms(item) });
        }
    }

    return [...pairs.values()].map(({ physical, dms }) => {
        const currentStockInCase = roundQuantity(physical.stock_in_case - dms.stock_in_case);
        const currentStockInPcs = roundQuantity(physical.stock_in_pcs - dms.stock_in_pcs);
        const totalCurrentStockInPcs = roundQuantity(physical.total_stock_in_pcs - dms.total_stock_in_pcs);
        const pricePerPiece = physical.price_per_piece || dms.price_per_piece || 0;

        return {
            product_erp_id: physical.product_erp_id || dms.product_erp_id,
            product_name: physical.product_name || dms.product_name,
            product_division: physical.product_division || dms.product_division,
            variant_name: physical.variant_name || dms.variant_name,
            pcs_per_box: physical.pcs_per_box || dms.pcs_per_box || 0,
            expired_stock_date: physical.expired_stock_date || null,
            physical_stock_in_case: physical.stock_in_case,
            physical_stock_in_pcs: physical.stock_in_pcs,
            total_physical_stock_in_pcs: physical.total_stock_in_pcs,
            dms_stock_in_case: dms.stock_in_case,
            dms_stock_in_pcs: dms.stock_in_pcs,
            total_dms_stock_in_pcs: dms.total_stock_in_pcs,
            current_stock_in_case: currentStockInCase,
            current_stock_in_pcs: currentStockInPcs,
            total_current_stock_in_pcs: totalCurrentStockInPcs,
            price_per_piece: pricePerPiece,
            mrp: physical.mrp || dms.mrp || 0,
            total_value: roundMoney(totalCurrentStockInPcs * pricePerPiece),
        };
    });
}

export function buildCurrentStockSummary(items = []) {
    return items.reduce((summary, row) => ({
        totalPhysicalCases: roundQuantity(summary.totalPhysicalCases + row.physical_stock_in_case),
        totalPhysicalLoosePcs: roundQuantity(summary.totalPhysicalLoosePcs + row.physical_stock_in_pcs),
        totalPhysicalPieces: roundQuantity(summary.totalPhysicalPieces + row.total_physical_stock_in_pcs),
        totalDmsCases: roundQuantity(summary.totalDmsCases + row.dms_stock_in_case),
        totalDmsLoosePcs: roundQuantity(summary.totalDmsLoosePcs + row.dms_stock_in_pcs),
        totalDmsPieces: roundQuantity(summary.totalDmsPieces + row.total_dms_stock_in_pcs),
        totalCases: roundQuantity(summary.totalCases + row.current_stock_in_case),
        totalLoosePcs: roundQuantity(summary.totalLoosePcs + row.current_stock_in_pcs),
        totalPieces: roundQuantity(summary.totalPieces + row.total_current_stock_in_pcs),
        totalValue: roundMoney(summary.totalValue + row.total_value),
    }), {
        totalPhysicalCases: 0,
        totalPhysicalLoosePcs: 0,
        totalPhysicalPieces: 0,
        totalDmsCases: 0,
        totalDmsLoosePcs: 0,
        totalDmsPieces: 0,
        totalCases: 0,
        totalLoosePcs: 0,
        totalPieces: 0,
        totalValue: 0,
    });
}

const parseDmsImportId = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const getCurrentStock = async (req, res) => {
    try {
        let dmsImportId = parseDmsImportId(req.query.dmsImportId);
        const companyName = String(req.query.companyName || '').trim();

        if (!dmsImportId && companyName) {
            const companyImport = await DmsStockModel.getLatestImportByCompanyName(companyName);
            if (!companyImport) {
                return res.status(404).json({
                    error: `No DMS stock upload found for company "${companyName}".`,
                });
            }
            dmsImportId = companyImport.id;
        }

        if (!dmsImportId) {
            const latestImport = await DmsStockModel.getLatestImport();
            if (!latestImport) {
                return res.status(200).json({
                    import: null,
                    items: [],
                    error: 'No DMS stock upload found. Upload DMS and Physical Stock first.',
                });
            }
            dmsImportId = latestImport.id;
        }

        const dmsResult = await DmsStockModel.getImportById(dmsImportId);
        if (!dmsResult) {
            return res.status(404).json({ error: 'Selected DMS stock upload was not found.' });
        }

        const [physicalItems, physicalImports, dmsItems] = await Promise.all([
            PhysicalStockModel.getMergedItemsByDmsImportId(dmsImportId, 2000),
            PhysicalStockModel.getImportsByDmsImportId(dmsImportId),
            DmsStockModel.getItems(dmsImportId, 2000),
        ]);

        if (!physicalItems.length) {
            return res.status(404).json({
                error: 'Physical stock is not available for this DMS import. Add Physical Stock first.',
            });
        }

        if (!dmsItems.length) {
            return res.status(404).json({
                error: 'DMS stock has no products for this import.',
            });
        }

        const items = buildCurrentStockDiff(physicalItems, dmsItems)
            .sort((left, right) => String(left.product_erp_id || '').localeCompare(String(right.product_erp_id || '')));
        const summary = buildCurrentStockSummary(items);
        const physicalFileNames = [...new Set(physicalImports.map((entry) => entry.file_name).filter(Boolean))];

        return res.status(200).json({
            import: {
                dms_import_id: dmsImportId,
                company_id: dmsResult.import.company_id || null,
                company_name: dmsResult.import.company_name || null,
                dms_upload_date: dmsResult.import.upload_date,
                dms_file_name: dmsResult.import.file_name,
                physical_file_name: physicalFileNames[0] || null,
                physical_file_names: physicalFileNames,
                physical_import_count: physicalImports.length,
                row_count: items.length,
                ...summary,
            },
            items,
        });
    } catch (error) {
        console.error('Error fetching current stock:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
