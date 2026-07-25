import CompanyModel from '../models/companyModel.js';
import DmsStockModel from '../models/dmsStockModel.js';
import PhysicalStockModel from '../models/physicalStockModel.js';
import PurchaseRequisitionModel from '../models/purchaseRequisitionModel.js';
import { buildCurrentStockDiff } from './currentStockController.js';

export const create = async (req, res) => {
    try {
        const companyId = Number(req.body?.companyId);
        const staffId = Number(req.body?.staffId);
        const outletId = Number(req.body?.outletId);
        const sellerType = req.body?.sellerType === 'cnf' ? 'cnf' : 'distributor';
        const requested = Array.isArray(req.body?.items) ? req.body.items : [];
        const company = await CompanyModel.getById(companyId);
        if (!company || !staffId || !outletId || !requested.length) {
            return res.status(400).json({ error: 'Company, staff, outlet, and items are required.' });
        }
        const dmsImport = await DmsStockModel.getLatestImportByCompanyName(company.name);
        if (!dmsImport) return res.status(400).json({ error: 'No Item List stock found for this company.' });
        const dms = await DmsStockModel.getItems(dmsImport.id, 2000);
        const physical = await PhysicalStockModel.getMergedItemsByDmsImportId(dmsImport.id);
        const stock = buildCurrentStockDiff(physical, dms);
        const items = requested.map((entry) => {
            const product = stock.find((row) => row.product_erp_id === entry.productErpId);
            const quantity = Number(entry.quantity);
            if (!product || quantity <= 0 || quantity > Number(product.total_current_stock_in_pcs)) {
                const error = new Error(`Invalid or unavailable quantity for ${entry.productErpId}.`);
                error.statusCode = 400;
                throw error;
            }
            const priceType = entry.priceType === 'wholesale' ? 'wholesale' : 'retail';
            const rate = priceType === 'wholesale' ? product.wholesale_price : product.retail_price;
            const amount = quantity * Number(rate || 0);
            const gstPercent = Number(product.gst_percent) || 5;
            return {
                ...product,
                quantity,
                priceType,
                rate: Number(rate || 0),
                amount,
                gst_percent: gstPercent,
            };
        });
        const requisition = await PurchaseRequisitionModel.create({
            sellerType, companyId, staffId, outletId, outletDay: req.body?.outletDay,
            items,
            totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
            totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
        });
        return res.status(201).json({ message: 'Purchase requisition created.', requisition });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
    }
};

export const list = async (req, res) => {
    try {
        const staffId = Number(req.query.staffId);
        if (!Number.isInteger(staffId) || staffId <= 0) {
            return res.status(400).json({ error: 'Staff is required.' });
        }

        const date = req.query.date ? String(req.query.date).trim() : null;
        const requisitions = await PurchaseRequisitionModel.listByStaff(staffId, { date });
        return res.json({ requisitions });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getByNumber = async (req, res) => {
    try {
        const requisition = await PurchaseRequisitionModel.getByNumber(String(req.params.number || '').trim());
        if (!requisition) return res.status(404).json({ error: 'Requisition was not found.' });
        return res.json({ requisition });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};
