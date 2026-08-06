import CompanyModel from '../models/companyModel.js';
import DmsStockModel from '../models/dmsStockModel.js';
import PhysicalStockModel from '../models/physicalStockModel.js';
import PurchaseRequisitionModel from '../models/purchaseRequisitionModel.js';
import StaffModel from '../models/staffModel.js';
import { buildCurrentStockDiff } from './currentStockController.js';

export const create = async (req, res) => {
    try {
        const companyId = Number(req.body?.companyId);
        const staffId = req.user?.role === 'staff'
            ? Number(req.user.staffId)
            : Number(req.body?.staffId);
        const outletId = Number(req.body?.outletId);
        const sellerType = req.body?.sellerType === 'cnf' ? 'cnf' : 'distributor';
        const requested = Array.isArray(req.body?.items) ? req.body.items : [];
        const company = await CompanyModel.getById(companyId);
        if (!company || !staffId || !outletId || !requested.length) {
            return res.status(400).json({ error: 'Company, staff, outlet, and items are required.' });
        }
        if (req.user?.role === 'staff' && !req.user.companyIds?.map(Number).includes(companyId)) {
            return res.status(403).json({ error: 'This company is not assigned to your staff account.' });
        }
        const outlet = await StaffModel.getCounterById(outletId);
        if (!outlet || Number(outlet.staff_id) !== staffId) {
            return res.status(403).json({ error: 'This outlet is not assigned to the selected staff.' });
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
        const date = req.query.date ? String(req.query.date).trim() : null;
        const requestedStaffId = Number(req.query.staffId);
        const requestedCompanyId = Number(req.query.companyId);
        const staffId = req.user?.role === 'staff' ? Number(req.user.staffId) : requestedStaffId;
        const companyId = Number.isInteger(requestedCompanyId) && requestedCompanyId > 0
            ? requestedCompanyId
            : null;
        const requisitions = Number.isInteger(staffId) && staffId > 0
            ? await PurchaseRequisitionModel.listByStaff(staffId, { date, companyId })
            : await PurchaseRequisitionModel.listAll({
                date,
                companyId,
                status: req.query.status ? String(req.query.status).trim() : null,
            });
        return res.json({ requisitions });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getByNumber = async (req, res) => {
    try {
        const requisition = await PurchaseRequisitionModel.getByNumber(String(req.params.number || '').trim());
        if (!requisition) return res.status(404).json({ error: 'Requisition was not found.' });
        if (requisition.status !== 'approved') {
            return res.status(409).json({ error: 'This requisition must be approved before it can be used in Add Sales.' });
        }
        const outletId = Number(req.query.outletId);
        if (Number.isInteger(outletId) && outletId > 0 && Number(requisition.outlet_id) !== outletId) {
            return res.status(403).json({ error: `This requisition belongs to outlet "${requisition.outlet_name}" and cannot be used for the selected outlet.` });
        }
        if (req.user?.role === 'staff' && Number(requisition.staff_id) !== Number(req.user.staffId)) {
            return res.status(403).json({ error: 'You cannot view another staff member’s requisition.' });
        }
        return res.json({ requisition });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const review = async (req, res) => {
    try {
        const canReview = req.user?.role === 'admin'
            || req.user?.permissions?.includes('requisition_approval');
        if (!canReview) {
            return res.status(403).json({ error: 'You do not have permission to approve or cancel requisitions.' });
        }
        const status = String(req.body?.status || '').toLowerCase();
        if (!['approved', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Status must be approved or cancelled.' });
        }
        const requisition = await PurchaseRequisitionModel.updateStatus(
            Number(req.params.id),
            status,
            Number(req.user.id),
            String(req.body?.note || '').trim()
        );
        if (!requisition) {
            return res.status(409).json({ error: 'This requisition was already reviewed or was not found.' });
        }
        return res.json({
            message: status === 'approved' ? 'Requisition approved.' : 'Requisition cancelled.',
            requisition,
        });
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
