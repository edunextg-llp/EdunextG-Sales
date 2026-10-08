import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import StaffModel from '../models/staffModel.js';
import DeliveryCollectionModel from '../models/deliveryCollectionModel.js';
import { DMS_PERMISSION_KEYS, PERMISSION_KEYS } from '../utils/permissionKeys.js';
import CompanyModel from '../models/companyModel.js';
import {
    validateRequiredText,
    validateDigitsOnly,
    validateNumeric,
    validatePositiveInteger,
} from '../utils/validation.js';
import jwt from 'jsonwebtoken';

const CASH_NOTE_DENOMINATIONS = [500, 200, 100, 50, 20, 10];
const CASH_COIN_DENOMINATIONS = [20, 10, 5, 2, 1];
const CASH_DENOMINATIONS = [
    ...CASH_NOTE_DENOMINATIONS.map((value) => ({ key: `note_${value}`, value })),
    ...CASH_COIN_DENOMINATIONS.map((value) => ({ key: `coin_${value}`, value })),
];

function calculateCashCollectionAmount(cashDetails = {}) {
    return CASH_DENOMINATIONS.reduce((total, item) => {
        const count = parseInt(cashDetails[item.key] || 0, 10);
        return total + item.value * (Number.isNaN(count) ? 0 : count);
    }, 0);
}

function normalizeCashCollectionDetails(cashDetails = {}) {
    const hasCashCount = CASH_DENOMINATIONS.some((item) => {
        const count = parseInt(cashDetails[item.key] || 0, 10);
        return !Number.isNaN(count) && count > 0;
    });
    if (!hasCashCount) {
        return { error: 'Please enter cash note or coin count.' };
    }

    const normalizedCashDetails = {};
    for (const item of CASH_DENOMINATIONS) {
        const rawCount = cashDetails[item.key] ?? '';
        if (rawCount === '') {
            normalizedCashDetails[item.key] = 0;
            continue;
        }
        const normalizedCount = String(rawCount).trim();
        if (!/^\d+$/.test(normalizedCount)) {
            return { error: `Invalid count for ${item.key}` };
        }
        normalizedCashDetails[item.key] = parseInt(normalizedCount, 10);
    }

    return {
        cashDetails: normalizedCashDetails,
        amount: calculateCashCollectionAmount(normalizedCashDetails),
    };
}

function normalizeDateInput(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().split('T')[0];
    }
    return String(value).split('T')[0].split(' ')[0];
}

async function parseAssignedCompanyIds(companyId, companyIds) {
    const requestedCompanyIds = Array.isArray(companyIds) ? companyIds : [companyId];
    const parsedCompanyIds = [
        ...new Set(
            requestedCompanyIds
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0)
        ),
    ];

    if (parsedCompanyIds.length === 0) {
        return { error: 'Company is required' };
    }

    const assignedCompanies = await CompanyModel.getAssignedToStaff();
    const assignedCompanyIds = new Set(assignedCompanies.map(company => company.id));
    const allCompaniesExist = parsedCompanyIds.every((id) => assignedCompanyIds.has(id));
    if (!allCompaniesExist) {
        return { error: 'Select a company assigned to staff' };
    }

    return { companyIds: parsedCompanyIds };
}

export const createDeliveryBoy = async (req, res) => {
    try {
        const { name, contactNo, companyId, companyIds, role, aadharNo } = req.body;
        
        const nameValidation = validateRequiredText(name, 'Delivery Boy name');
        if (!nameValidation.valid) {
            return res.status(400).json({ error: nameValidation.error });
        }
        
        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const normalizedAadharNo = aadharNo ? String(aadharNo).replace(/\D/g, '') : '';
        if (normalizedAadharNo && normalizedAadharNo.length !== 12) {
            return res.status(400).json({ error: 'Aadhar number must be 12 digits.' });
        }

        const companyParse = await parseAssignedCompanyIds(companyId, companyIds);
        if (companyParse.error) {
            return res.status(400).json({ error: companyParse.error });
        }
        const parsedCompanyIds = companyParse.companyIds;

        const createdDeliveryBoy = await DeliveryBoyModel.create(
            nameValidation.value,
            contactValidation.value,
            parsedCompanyIds[0],
            role || 'delivery_boy',
            normalizedAadharNo || null
        );
        await DeliveryBoyModel.setCompanies(createdDeliveryBoy.deliveryBoyId, parsedCompanyIds);
        res.status(201).json({
            message: 'Delivery Boy created successfully',
            ...createdDeliveryBoy,
        });
    } catch (error) {
        console.error('Error creating delivery boy:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStaffAssignedCompanies = async (req, res) => {
    try {
        const companies = await CompanyModel.getAssignedToStaff();
        res.status(200).json(companies);
    } catch (error) {
        console.error('Error fetching staff assigned companies:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateDeliveryBoy = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contactNo, companyId, companyIds, role, aadharNo } = req.body;

        const existing = await DeliveryBoyModel.getById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Delivery Boy not found' });
        }

        const nameValidation = validateRequiredText(name, 'Delivery Boy name');
        if (!nameValidation.valid) {
            return res.status(400).json({ error: nameValidation.error });
        }

        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const normalizedAadharNo = aadharNo ? String(aadharNo).replace(/\D/g, '') : '';
        if (normalizedAadharNo && normalizedAadharNo.length !== 12) {
            return res.status(400).json({ error: 'Aadhar number must be 12 digits.' });
        }

        const companyParse = await parseAssignedCompanyIds(companyId, companyIds);
        if (companyParse.error) {
            return res.status(400).json({ error: companyParse.error });
        }
        const parsedCompanyIds = companyParse.companyIds;

        await DeliveryBoyModel.update(
            id,
            nameValidation.value,
            contactValidation.value,
            parsedCompanyIds[0],
            role || 'delivery_boy',
            normalizedAadharNo || null
        );
        await DeliveryBoyModel.setCompanies(id, parsedCompanyIds);

        res.status(200).json({ message: 'Delivery Boy updated successfully' });
    } catch (error) {
        console.error('Error updating delivery boy:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const generateDeliveryBoyCredentials = async (req, res) => {
    try {
        const deliveryBoyId = Number(req.params.id);
        if (!Number.isInteger(deliveryBoyId) || deliveryBoyId <= 0) {
            return res.status(400).json({ error: 'Delivery Boy id must be a positive integer' });
        }

        const credentials = await DeliveryBoyModel.generateCredentials(deliveryBoyId);
        if (!credentials) {
            return res.status(404).json({ error: 'Delivery Boy not found' });
        }
        if (credentials.alreadyGenerated) {
            return res.status(409).json({
                error: 'Login ID and password were already generated. Credentials can only be generated once.',
                deliveryLoginId: credentials.deliveryLoginId,
            });
        }

        res.status(200).json({
            message: 'Delivery Boy credentials generated successfully',
            ...credentials,
        });
    } catch (error) {
        console.error('Error generating delivery boy credentials:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteDeliveryBoy = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await DeliveryBoyModel.delete(id);

        if (!deleted) {
            return res.status(404).json({ error: 'Delivery Boy not found' });
        }

        res.status(200).json({ message: 'Delivery Boy deleted successfully' });
    } catch (error) {
        console.error('Error deleting delivery boy:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getDeliveryBoys = async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === 'true';
        const deliveryBoys = await DeliveryBoyModel.getAll(includeInactive);
        res.status(200).json(deliveryBoys);
    } catch (error) {
        console.error('Error fetching delivery boys:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const DELIVERY_PERMISSION_KEYS = PERMISSION_KEYS;

export const getPermissionUsers = async (req, res) => {
    try {
        const users = await DeliveryBoyModel.getPermissionUsers();
        res.status(200).json(users.map((user) => ({
            id: user.id,
            name: user.name,
            role: user.role,
            isActive: Boolean(user.is_active),
            loginId: user.delivery_login_id,
            hasCredentials: Boolean(user.has_credentials),
            permissions: DELIVERY_PERMISSION_KEYS.filter((key) => Boolean(user[`can_${key}`])),
        })));
    } catch (error) {
        console.error('Error fetching permission users:', error);
        res.status(500).json({ error: 'Unable to fetch permission users.' });
    }
};

export const updatePermissionUser = async (req, res) => {
    try {
        const deliveryBoyId = Number(req.params.id);
        const permissions = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
        if (!Number.isInteger(deliveryBoyId) || deliveryBoyId <= 0) {
            return res.status(400).json({ error: 'User ID must be a positive integer.' });
        }
        if (permissions.some((permission) => !DELIVERY_PERMISSION_KEYS.includes(permission))) {
            return res.status(400).json({ error: 'One or more permissions are invalid.' });
        }
        const user = await DeliveryBoyModel.getById(deliveryBoyId);
        if (!user) {
            return res.status(404).json({ error: 'Packaging Staff or Delivery Boy not found.' });
        }
        const normalizedPermissions = [...new Set(permissions)];
        if (
            normalizedPermissions.some((permission) => DMS_PERMISSION_KEYS.includes(permission))
            && !normalizedPermissions.includes('dms')
        ) {
            normalizedPermissions.push('dms');
        }
        await DeliveryBoyModel.setPermissions(deliveryBoyId, normalizedPermissions);
        return res.status(200).json({ message: 'Permissions updated successfully.' });
    } catch (error) {
        console.error('Error updating permissions:', error);
        return res.status(500).json({ error: 'Unable to update permissions.' });
    }
};

export const toggleDeliveryBoyActive = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await DeliveryBoyModel.toggleActive(id);
        if (!result) {
            return res.status(404).json({ error: 'Delivery Boy not found' });
        }
        res.status(200).json({ message: 'Status updated', is_active: result.is_active });
    } catch (error) {
        console.error('Error toggling delivery boy active status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const mobileLogin = async (req, res) => {
    try {
        const deliveryLoginId = String(req.body.deliveryLoginId || '').trim();
        const passcode = String(req.body.passcode || '').trim();
        if (!deliveryLoginId || !passcode) {
            return res.status(400).json({ error: 'Delivery login ID and passcode are required' });
        }

        if (!/^BFPDB\d{3,}$/.test(deliveryLoginId) || !/^\d{6}$/.test(passcode)) {
            return res.status(401).json({ error: 'Invalid delivery login ID or passcode' });
        }

        const deliveryBoy = await DeliveryBoyModel.getByLogin(
            deliveryLoginId,
            passcode
        );

        if (!deliveryBoy) {
            return res.status(401).json({ error: 'Invalid delivery login ID or passcode' });
        }

        const token = jwt.sign(
            {
                role: 'delivery_boy',
                deliveryBoyId: deliveryBoy.id,
                deliveryLoginId: deliveryBoy.delivery_login_id,
            },
            process.env.DELIVERY_JWT_SECRET || process.env.JWT_SECRET || 'delivery-secret',
            { expiresIn: '30d' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            deliveryBoy,
        });
    } catch (error) {
        console.error('Error during delivery boy mobile login:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMobileProfile = async (req, res) => {
    try {
        const deliveryBoy = await DeliveryBoyModel.getById(req.deliveryBoyId);
        if (!deliveryBoy) {
            return res.status(404).json({ error: 'Delivery Boy not found' });
        }
        res.status(200).json({
            id: deliveryBoy.id,
            name: deliveryBoy.name,
            contact_no: deliveryBoy.contact_no,
            delivery_login_id: deliveryBoy.delivery_login_id,
            company_name: deliveryBoy.company_name,
            company_ids: deliveryBoy.company_ids,
        });
    } catch (error) {
        console.error('Error fetching delivery boy mobile profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMobileAssignedItems = async (req, res) => {
    try {
        const status = String(req.query.status || '').trim();
        const date = String(req.query.date || '').trim();
        const allowedStatuses = ['out_for_delivery', 'delivered', 'cancelled', 'returned'];

        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status filter' });
        }

        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
        }

        const items = await DeliveryBoyModel.getAssignedSales(req.deliveryBoyId, { status, date });
        res.status(200).json(items);
    } catch (error) {
        console.error('Error fetching delivery boy assigned items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMobileCollections = async (req, res) => {
    try {
        const collections = await DeliveryCollectionModel.getForDeliveryBoy(req.deliveryBoyId);
        res.status(200).json(collections);
    } catch (error) {
        console.error('Error fetching delivery boy mobile collections:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateMobileCollection = async (req, res) => {
    try {
        const saleId = Number(req.params.saleId);
        if (!Number.isInteger(saleId) || saleId <= 0) {
            return res.status(400).json({ error: 'saleId must be a positive integer' });
        }

        const paymentMode = String(req.body.paymentMode || '').trim().toLowerCase();
        const allowedModes = ['cash', 'upi', 'cheque', 'credit'];
        if (!allowedModes.includes(paymentMode)) {
            return res.status(400).json({ error: 'Invalid payment mode' });
        }

        let amount = null;
        let cashDetails = null;
        let referenceNo = String(req.body.referenceNo || '').trim() || null;
        let referenceDate = normalizeDateInput(req.body.referenceDate);
        let creditDays = null;
        const remarks = String(req.body.remarks || '').trim() || null;

        if (paymentMode === 'cash' && req.body.amount == null) {
            const cashResult = normalizeCashCollectionDetails(req.body.cashDetails || {});
            if (cashResult.error) {
                return res.status(400).json({ error: cashResult.error });
            }
            cashDetails = cashResult.cashDetails;
            amount = cashResult.amount;
        } else {
            const amountValidation = validateNumeric(req.body.amount, 'Amount');
            if (!amountValidation.valid) {
                return res.status(400).json({ error: amountValidation.error });
            }
            if (amountValidation.value <= 0) {
                return res.status(400).json({ error: 'Amount must be greater than zero' });
            }
            amount = amountValidation.value;
        }

        if (paymentMode === 'cheque' && !referenceNo) {
            return res.status(400).json({ error: 'Cheque number is required' });
        }

        if (paymentMode === 'credit') {
            const creditDaysValidation = validatePositiveInteger(req.body.creditDays, 'Credit days');
            if (!creditDaysValidation.valid) {
                return res.status(400).json({ error: creditDaysValidation.error });
            }
            if (creditDaysValidation.value > 14) return res.status(400).json({ error: 'Credit days must be between 1 and 14' });
            creditDays = creditDaysValidation.value;
        }

        const collection = await DeliveryCollectionModel.upsertForDeliveryBoy(
            req.deliveryBoyId,
            saleId,
            {
                paymentMode,
                amount,
                cashDetails,
                referenceNo,
                referenceDate,
                creditDays,
                remarks,
            }
        );

        if (!collection) {
            return res.status(404).json({ error: 'Assigned delivery item not found' });
        }

        res.status(200).json({
            message: 'Collection updated successfully',
            collection,
        });
    } catch (error) {
        console.error('Error updating delivery boy collection:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMobileCreditDues = async (req, res) => {
    try {
        res.status(200).json(await DeliveryCollectionModel.getOutstandingSalesForDeliveryBoy(req.deliveryBoyId));
    } catch (error) {
        console.error('Error fetching mobile credit dues:', error);
        res.status(500).json({ error: 'Unable to fetch credit dues' });
    }
};

export function parseMobilePayment(body = {}) {
    const paymentMode = String(body.paymentMode || '').trim().toLowerCase();
    if (!['cash', 'upi', 'cheque', 'credit'].includes(paymentMode)) return { error: 'Select cash, UPI, cheque, or credit' };
    let amount;
    let cashDetails = null;
    if (paymentMode === 'cash' && body.amount == null) {
        const cashResult = normalizeCashCollectionDetails(body.cashDetails || {});
        if (cashResult.error) return { error: cashResult.error };
        amount = cashResult.amount;
        cashDetails = cashResult.cashDetails;
    } else {
        const amountResult = validateNumeric(body.amount, 'Amount');
        if (!amountResult.valid || !Number.isFinite(amountResult.value) || amountResult.value <= 0 || Math.abs(amountResult.value * 100 - Math.round(amountResult.value * 100)) > 0.000001) return { error: 'Enter a positive amount with at most two decimal places' };
        amount = amountResult.value;
    }
    const referenceNo = paymentMode === 'cheque' || paymentMode === 'upi' ? String(body.referenceNo || '').trim() || null : null;
    const referenceDate = paymentMode === 'cheque' ? normalizeDateInput(body.referenceDate) : null;
    if (paymentMode === 'cheque' && !referenceNo) return { error: 'Cheque number is required' };
    let creditDays = null;
    if (paymentMode === 'credit') {
        const creditDaysResult = validatePositiveInteger(body.creditDays, 'Credit days');
        if (!creditDaysResult.valid) return { error: creditDaysResult.error };
        if (creditDaysResult.value > 14) return { error: 'Credit days must be between 1 and 14' };
        creditDays = creditDaysResult.value;
    }
    return { payment: { paymentMode, amount, cashDetails, referenceNo, referenceDate, creditDays } };
}

export function sendMobilePaymentError(res, error, fallback) {
    if (error.message === 'TAKEN_BILL_ALREADY_CREDIT') return res.status(400).json({ error: 'This Out Bill is already on credit. Select cash, UPI, or cheque.' });
    if (error.message === 'FULL_CREDIT_BALANCE_REQUIRED') return res.status(400).json({ error: 'Use the full outstanding balance when extending existing credit' });
    if (error.message === 'EXISTING_CREDIT_DUE') return res.status(400).json({ error: 'Credit is unavailable because this outlet already has a credit due' });
    if (error.message === 'PAYMENT_ALREADY_PENDING') return res.status(409).json({ error: `Rs. ${Number(error.pendingAmount).toFixed(2)} for this bill is already waiting in D.B. Collection. It can be collected again only after the office settles or removes that entry.` });
    if (['EXCEEDS_BALANCE', 'EXCEEDS_CREDIT_BALANCE'].includes(error.message)) return res.status(400).json({ error: `Amount exceeds remaining balance of ${error.remaining}` });
    console.error(fallback, error);
    return res.status(500).json({ error: 'Unable to update payment' });
}

export const collectMobileCreditDue = async (req, res) => {
    try {
        const saleId = Number(req.params.saleId);
        if (!Number.isInteger(saleId) || saleId <= 0) return res.status(400).json({ error: 'Invalid sale' });
        const parsed = parseMobilePayment(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const result = await DeliveryCollectionModel.collectOutstandingPayment(req.deliveryBoyId, saleId, {
            paymentDate: normalizeDateInput(req.body.paymentDate) || new Date().toISOString().slice(0, 10),
            ...parsed.payment,
        });
        if (!result) return res.status(404).json({ error: 'Outstanding payment not found or unavailable' });
        res.status(200).json({ message: 'Payment submitted to D.B. Collection for settlement', ...result });
    } catch (error) {
        return sendMobilePaymentError(res, error, 'Error updating mobile credit payment:');
    }
};

export const getMobilePendingCollections = async (req, res) => {
    try {
        res.status(200).json(await DeliveryCollectionModel.getPendingCollectionsForDeliveryBoy(req.deliveryBoyId));
    } catch (error) {
        console.error('Error fetching mobile pending collections:', error);
        res.status(500).json({ error: 'Unable to fetch submitted payments' });
    }
};

export const editMobilePendingCollection = async (req, res) => {
    try {
        const collectionId = Number(req.params.collectionId);
        if (!Number.isInteger(collectionId) || collectionId <= 0) return res.status(400).json({ error: 'Invalid payment' });
        const parsed = parseMobilePayment(req.body);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        const result = await DeliveryCollectionModel.updatePendingCollection(req.deliveryBoyId, collectionId, parsed.payment);
        if (!result) return res.status(409).json({ error: 'This payment was already settled by the office and can no longer be edited' });
        res.status(200).json({ message: 'Payment updated. D.B. Collection will settle the new details.', ...result });
    } catch (error) {
        return sendMobilePaymentError(res, error, 'Error editing mobile pending collection:');
    }
};

export const getDeliveryBoyCollections = async (req, res) => {
    try {
        const search = String(req.query.search || '').trim();
        const fromDate = String(req.query.fromDate || '');
        const toDate = String(req.query.toDate || '');
        const isValidDate = (value) => {
            if (!value) return true;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return false;
            const date = new Date(`${value}T00:00:00Z`);
            return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
        };
        if (!isValidDate(fromDate) || !isValidDate(toDate) || (fromDate && toDate && fromDate > toDate)) {
            return res.status(400).json({ error: 'Enter a valid submission date range' });
        }
        const collections = await DeliveryCollectionModel.getAll({ search, fromDate, toDate });
        res.status(200).json(collections);
    } catch (error) {
        console.error('Error fetching delivery boy collections:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateMobileAssignedItemStatus = async (req, res) => {
    try {
        const saleId = Number(req.params.saleId);
        if (!Number.isInteger(saleId) || saleId <= 0) {
            return res.status(400).json({ error: 'saleId must be a positive integer' });
        }

        const status = String(req.body.status || '').trim().toLowerCase();
        const cancellationReason = String(req.body.cancellationReason || req.body.reason || '').trim();
        const allowedStatuses = ['delivered', 'cancelled', 'returned'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Status must be delivered, cancelled, or returned' });
        }
        if (status === 'cancelled' && !cancellationReason) {
            return res.status(400).json({ error: 'Cancellation reason is required.' });
        }
        const updatedSale = await DeliveryBoyModel.updateAssignedSaleStatus(
            req.deliveryBoyId,
            saleId,
            status,
            cancellationReason || null
        );

        if (updatedSale?.locked) {
            return res.status(409).json({
                error: 'This delivery has already been submitted and cannot be changed.',
                packaging_status: updatedSale.packaging_status,
            });
        }

        if (!updatedSale) {
            return res.status(404).json({ error: 'Assigned delivery item not found' });
        }

        res.status(200).json({
            message: 'Delivery status updated successfully',
            sale: updatedSale,
        });
    } catch (error) {
        console.error('Error updating delivery boy assigned item status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const settleDeliveryBoyCollection = async (req, res) => {
    try {
        const collectionId = Number(req.params.collectionId);
        if (!Number.isInteger(collectionId) || collectionId <= 0) return res.status(400).json({ error: 'Invalid collection' });
        if (!await DeliveryCollectionModel.settle(collectionId, req.body?.chequeDate, req.body || {})) return res.status(404).json({ error: 'Collection not found or already settled' });
        res.status(200).json({ message: 'Collection settled successfully' });
    } catch (error) {
        if (error.message === 'COLLECTION_EXCEEDS_BALANCE') {
            return res.status(400).json({ error: `Collection exceeds current balance of ${Number(error.remaining).toFixed(2)}` });
        }
        if (error.message === 'CHEQUE_DATE_REQUIRED') {
            return res.status(400).json({ error: 'Enter a valid cheque date before settling this collection' });
        }
        const settlementErrors = {
            INVALID_CASH_COUNTS: 'Enter non-negative whole numbers for cash counts',
            CASH_TOTAL_MISMATCH: 'Cash denomination total must equal the collection amount',
            UPI_REFERENCE_REQUIRED: 'Enter a UPI number (up to 255 characters) before settlement',
            INVALID_SETTLE_MODE: 'Only UPI or cheque collections can be settled as cash',
            INVALID_AMOUNT: 'Enter a valid amount greater than zero with at most two decimal places',
        };
        if (settlementErrors[error.message]) return res.status(400).json({ error: settlementErrors[error.message] });
        console.error('Error settling collection:', error);
        res.status(500).json({ error: 'Unable to settle collection' });
    }
};

export const updateDeliveryBoyCredentials = async (req, res) => {
    try {
        const deliveryBoyId = Number(req.params.id);
        const loginId = String(req.body.loginId || '').trim();
        const password = String(req.body.password || '');

        if (!Number.isInteger(deliveryBoyId) || deliveryBoyId <= 0) {
            return res.status(400).json({ error: 'Staff id must be a positive integer.' });
        }
        if (!/^[a-zA-Z0-9._-]{3,50}$/.test(loginId)) {
            return res.status(400).json({ error: 'Login ID must be 3–50 characters and may only use letters, numbers, dots, hyphens, and underscores.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }
        const staffWithLoginId = await StaffModel.findByLoginId(loginId);
        if (staffWithLoginId) {
            return res.status(409).json({ error: 'That Login ID is already in use.' });
        }

        const updated = await DeliveryBoyModel.updateCredentials(deliveryBoyId, loginId, password);
        if (!updated) return res.status(404).json({ error: 'Delivery Boy not found.' });
        return res.json({ message: 'Staff login credentials updated successfully.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'That Login ID is already in use.' });
        }
        console.error('Error updating delivery boy credentials:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateMobileAssignedItemLocation = async (req, res) => {
    try {
        const saleId = Number(req.params.saleId);
        const rawLatitude = req.body?.latitude;
        const rawLongitude = req.body?.longitude;
        const latitude = Number(rawLatitude);
        const longitude = Number(rawLongitude);

        if (!Number.isInteger(saleId) || saleId <= 0) {
            return res.status(400).json({ error: 'saleId must be a positive integer' });
        }
        if (!['number', 'string'].includes(typeof rawLatitude) || String(rawLatitude).trim() === '' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
            return res.status(400).json({ error: 'latitude must be between -90 and 90' });
        }
        if (!['number', 'string'].includes(typeof rawLongitude) || String(rawLongitude).trim() === '' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return res.status(400).json({ error: 'longitude must be between -180 and 180' });
        }

        const googleLocation = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
        const updatedSale = await DeliveryBoyModel.updateAssignedSaleLocation(
            req.deliveryBoyId,
            saleId,
            googleLocation
        );

        if (!updatedSale) {
            return res.status(404).json({ error: 'Assigned delivery item without a saved location was not found' });
        }

        return res.status(200).json({
            message: 'Outlet location saved successfully',
            sale: updatedSale,
        });
    } catch (error) {
        console.error('Error saving delivery outlet location:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateMobileAssignedItemContact = async (req, res) => {
    try {
        const saleId = Number(req.params.saleId);
        if (!Number.isSafeInteger(saleId) || saleId <= 0) {
            return res.status(400).json({ error: 'saleId must be a positive integer' });
        }

        const contactNumber = req.body?.contactNumber;
        if (typeof contactNumber !== 'string' || !/^\d{1,20}$/.test(contactNumber.trim())) {
            return res.status(400).json({ error: 'contactNumber must be a string containing 1 to 20 digits' });
        }

        const updatedSale = await DeliveryBoyModel.updateAssignedSaleContact(
            req.deliveryBoyId, saleId, contactNumber.trim()
        );
        if (!updatedSale) {
            return res.status(404).json({ error: 'Assigned active delivery item not found' });
        }

        return res.status(200).json({
            message: 'Outlet contact number updated successfully',
            sale: updatedSale,
        });
    } catch (error) {
        console.error('Error updating delivery outlet contact number:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
