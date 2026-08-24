import StaffModel from '../models/staffModel.js';
import PaymentModel from '../models/paymentModel.js';
import CompanyModel from '../models/companyModel.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import ReportModel from '../models/reportModel.js';
import BankDepositModel from '../models/bankDepositModel.js';
import PurchaseSellerModel from '../models/purchaseSellerModel.js';
import SellerItemModel from '../models/sellerItemModel.js';
import PurchaseModel from '../models/purchaseModel.js';
import OrderCancellationModel from '../models/orderCancellationModel.js';
import PhysicalStockModel from '../models/physicalStockModel.js';
import PackagingRemarkModel from '../models/packagingRemarkModel.js';
import DeliveryCollectionModel from '../models/deliveryCollectionModel.js';
import ExpiryListModel from '../models/expiryListModel.js';
import DamageListModel from '../models/damageListModel.js';
import db from '../config/db.js';
import {
    validateDigitsOnly,
    validateNumeric,
    validatePositiveInteger,
    validateNonNegativeInteger,
    validateRequiredText,
} from '../utils/validation.js';
import { normalizeInvoiceNumber } from '../utils/invoiceNumber.js';
import { validateGoogleMapsLocation } from '../utils/googleMapsLocation.js';
import { resolveItemGst } from '../utils/itemGst.js';
import { uploadBufferToCloudinary, isCloudinaryConfigured } from '../utils/cloudinary.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import xlsx from 'xlsx';
import ExcelJS from 'exceljs';

export const getExpiryList = async (_req, res) => {
    try {
        res.status(200).json(await ExpiryListModel.getAll());
    } catch (error) {
        console.error('Error fetching expiry list:', error);
        res.status(500).json({ error: 'Unable to load expiry list' });
    }
};

export const createExpiryListItem = async (req, res) => {
    try {
        const companyId = Number(req.body.companyId);
        const sellerId = Number(req.body.sellerId);
        const staffId = Number(req.body.staffId);
        const outletId = Number(req.body.outletId);
        const productSource = req.body.productSource === 'manual' ? 'manual' : 'fetched';
        const productName = String(req.body.productName || '').trim();
        const productErpId = String(req.body.productErpId || '').trim();
        const invoiceNumber = String(req.body.invoiceNumber || '').trim();
        const batchNumber = String(req.body.batchNumber || '').trim();
        const expiryDate = normalizeDateInput(req.body.expiryDate);
        const qty = Number(req.body.qty);
        const amount = Number(req.body.amount);
        if (![companyId, sellerId, staffId, outletId].every((value) => Number.isInteger(value) && value > 0)) {
            return res.status(400).json({ error: 'Company, seller, staff, and outlet are required' });
        }
        const [sellerRows] = await db.execute('SELECT id FROM purchase_sellers WHERE id = ? AND company_id = ? LIMIT 1', [sellerId, companyId]);
        if (!sellerRows.length) return res.status(400).json({ error: 'Seller does not match the selected company' });
        if (!productName) return res.status(400).json({ error: 'Product name is required' });
        if (!invoiceNumber) return res.status(400).json({ error: 'Invoice number is required' });
        if (!batchNumber) return res.status(400).json({ error: 'Batch number is required' });
        if (!expiryDate) return res.status(400).json({ error: 'Expiry date is required' });
        if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'Enter a valid quantity' });
        if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'Enter a valid amount' });
        const [outlets] = await db.execute(
            `SELECT sc.id FROM staff_counters sc
             INNER JOIN staff_companies sm ON sm.staff_id = sc.staff_id
             WHERE sc.id = ? AND sc.staff_id = ? AND sm.company_id = ? LIMIT 1`,
            [outletId, staffId, companyId]
        );
        if (!outlets.length) return res.status(400).json({ error: 'Outlet does not match the selected company and staff' });
        const item = await ExpiryListModel.create({ companyId, sellerId, staffId, outletId, productSource,
            productErpId, productName: productName.slice(0, 255), invoiceNumber: invoiceNumber.slice(0, 100),
            batchNumber: batchNumber.slice(0, 100), expiryDate, qty, amount });
        res.status(201).json({ message: 'Expiry item saved successfully', item });
    } catch (error) {
        console.error('Error saving expiry list item:', error);
        res.status(500).json({ error: 'Unable to save expiry item' });
    }
};

export const updateExpiryListItem = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const companyId = Number(req.body.companyId), sellerId = Number(req.body.sellerId);
        const staffId = Number(req.body.staffId), outletId = Number(req.body.outletId);
        const productSource = req.body.productSource === 'manual' ? 'manual' : 'fetched';
        const productName = String(req.body.productName || '').trim();
        const productErpId = String(req.body.productErpId || '').trim();
        const invoiceNumber = String(req.body.invoiceNumber || '').trim();
        const batchNumber = String(req.body.batchNumber || '').trim();
        const expiryDate = normalizeDateInput(req.body.expiryDate);
        const qty = Number(req.body.qty), amount = Number(req.body.amount);
        if (![id, companyId, sellerId, staffId, outletId].every((value) => Number.isInteger(value) && value > 0)) {
            return res.status(400).json({ error: 'Valid company, seller, staff, and outlet are required' });
        }
        if (!productName || !invoiceNumber || !batchNumber || !expiryDate) {
            return res.status(400).json({ error: 'Product, invoice number, batch number, and expiry date are required' });
        }
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(amount) || amount < 0) {
            return res.status(400).json({ error: 'Enter valid quantity and amount' });
        }
        const [sellerRows] = await db.execute('SELECT id FROM purchase_sellers WHERE id = ? AND company_id = ? LIMIT 1', [sellerId, companyId]);
        const [outletRows] = await db.execute(`SELECT sc.id FROM staff_counters sc INNER JOIN staff_companies sm ON sm.staff_id = sc.staff_id WHERE sc.id = ? AND sc.staff_id = ? AND sm.company_id = ? LIMIT 1`, [outletId, staffId, companyId]);
        if (!sellerRows.length || !outletRows.length) return res.status(400).json({ error: 'Seller or outlet does not match the selection' });
        const item = await ExpiryListModel.update(id, { companyId, sellerId, staffId, outletId, productSource,
            productErpId, productName: productName.slice(0, 255), invoiceNumber: invoiceNumber.slice(0, 100),
            batchNumber: batchNumber.slice(0, 100), expiryDate, qty, amount });
        if (!item) return res.status(404).json({ error: 'Expiry record not found' });
        res.json({ message: 'Expiry item updated successfully', item });
    } catch (error) {
        console.error('Error updating expiry list item:', error);
        res.status(500).json({ error: 'Unable to update expiry item' });
    }
};

const normalizeDamageListPayload = async (body) => {
    const data = {
        companyId: Number(body.companyId), sellerId: Number(body.sellerId), staffId: Number(body.staffId),
        outletId: Number(body.outletId), productSource: body.productSource === 'manual' ? 'manual' : 'fetched',
        productErpId: String(body.productErpId || '').trim(), productName: String(body.productName || '').trim(),
        invoiceNumber: String(body.invoiceNumber || '').trim(), batchNumber: String(body.batchNumber || '').trim(),
        damageDescription: String(body.damageDescription || '').trim(), qty: Number(body.qty), amount: Number(body.amount),
    };
    if (![data.companyId, data.sellerId, data.staffId, data.outletId].every((v) => Number.isInteger(v) && v > 0)) throw new Error('Company, seller, staff, and outlet are required');
    if (!data.productName || !data.invoiceNumber || !data.batchNumber || !data.damageDescription) throw new Error('Product, invoice number, batch number, and damage description are required');
    if (!Number.isFinite(data.qty) || data.qty <= 0 || !Number.isFinite(data.amount) || data.amount < 0) throw new Error('Enter valid quantity and amount');
    const [sellerRows] = await db.execute('SELECT id FROM purchase_sellers WHERE id=? AND company_id=? LIMIT 1', [data.sellerId, data.companyId]);
    const [outletRows] = await db.execute(`SELECT sc.id FROM staff_counters sc INNER JOIN staff_companies sm ON sm.staff_id=sc.staff_id WHERE sc.id=? AND sc.staff_id=? AND sm.company_id=? LIMIT 1`, [data.outletId, data.staffId, data.companyId]);
    if (!sellerRows.length || !outletRows.length) throw new Error('Seller or outlet does not match the selection');
    data.productName = data.productName.slice(0, 255); data.invoiceNumber = data.invoiceNumber.slice(0, 100);
    data.batchNumber = data.batchNumber.slice(0, 100); data.damageDescription = data.damageDescription.slice(0, 2000);
    return data;
};

export const getDamageList = async (_req, res) => {
    try { res.json(await DamageListModel.getAll()); }
    catch (error) { console.error('Error fetching damage list:', error); res.status(500).json({ error: 'Unable to load damage list' }); }
};
export const createDamageListItem = async (req, res) => {
    try { const item = await DamageListModel.create(await normalizeDamageListPayload(req.body)); res.status(201).json({ message: 'Damage item saved successfully', item }); }
    catch (error) { res.status(400).json({ error: error.message || 'Unable to save damage item' }); }
};
export const updateDamageListItem = async (req, res) => {
    try {
        const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid damage record' });
        const item = await DamageListModel.update(id, await normalizeDamageListPayload(req.body));
        if (!item) return res.status(404).json({ error: 'Damage record not found' });
        res.json({ message: 'Damage item updated successfully', item });
    } catch (error) { res.status(400).json({ error: error.message || 'Unable to update damage item' }); }
};

function buildStaffProfile(body = {}) {
    const whatsappSource = String(body.whatsappNumber || '').trim() || String(body.contactNo || '').trim();

    return {
        dob: normalizeDateInput(body.dob),
        whatsappNumber: whatsappSource || null,
        aadharNo: body.aadharNo ? String(body.aadharNo).replace(/\D/g, '') : null,
        aadharDocumentUrl: body.aadharDocumentUrl ? String(body.aadharDocumentUrl).trim() : null,
        pccCertificateUrl: body.pccCertificateUrl ? String(body.pccCertificateUrl).trim() : null,
        staffCategory: normalizeStaffCategory(body.staffCategory),
    };
}

function buildStaffCompanies(staff) {
    const companyIds = String(staff?.company_ids || '')
        .split(',')
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
    const companyNames = String(staff?.company_name || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

    return companyIds.map((id, index) => ({
        id,
        name: companyNames[index] || '',
    })).filter((company) => company.name);
}

function normalizeStaffCategory(value) {
    return value === 'bawarchee_staff' ? 'bawarchee_staff' : 'company_staff';
}

async function parseCollectorPayload(body) {
    const collectorType = String(body.collectorType || 'company_staff').toLowerCase();

    if (collectorType === 'bawarchee_staff') {
        const collectorName = String(body.collectorName || '').trim();
        if (!collectorName) {
            return { error: 'Please enter payment collector name.' };
        }
        return { collectorStaffId: null, collectorName };
    }

    const collectorValidation = validatePositiveInteger(body.collectorStaffId, 'Payment collector');
    if (!collectorValidation.valid) {
        return { error: collectorValidation.error };
    }
    const collector = await StaffModel.getDetails(collectorValidation.value);
    if (!collector) {
        return { error: 'Payment collector not found' };
    }
    return { collectorStaffId: collectorValidation.value, collectorName: null };
}

async function resolveCompanyIds(companyNames, fallbackCompanyName, companyIds = []) {
    const normalizedIds = Array.isArray(companyIds)
        ? [...new Set(companyIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
        : [];

    if (normalizedIds.length > 0) {
        return normalizedIds;
    }

    const names = Array.isArray(companyNames)
        ? companyNames
        : String(fallbackCompanyName || '')
            .split(',')
            .map(name => name.trim());

    const uniqueNames = [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))];
    const resolvedCompanyIds = [];

    for (const companyName of uniqueNames) {
        resolvedCompanyIds.push(await CompanyModel.findOrCreateByName(companyName));
    }

    return resolvedCompanyIds;
}

function normalizeDateInput(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        if (value.includes('T')) {
            return value.split('T')[0];
        }
        return value;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().split('T')[0];
    }

    return String(value);
}

const BANK_DEPOSIT_NOTE_DENOMINATIONS = [500, 200, 100, 50, 20, 10];
const BANK_DEPOSIT_COIN_DENOMINATIONS = [20, 10, 5, 2, 1];
const BANK_DEPOSIT_DENOMINATIONS = [
    ...BANK_DEPOSIT_NOTE_DENOMINATIONS.map(value => ({ key: `note_${value}`, value })),
    ...BANK_DEPOSIT_COIN_DENOMINATIONS.map(value => ({ key: `coin_${value}`, value })),
];

function calculateCashDepositAmount(cashDetails = {}) {
    return BANK_DEPOSIT_DENOMINATIONS.reduce((total, item) => {
        const count = parseInt(cashDetails[item.key] || 0, 10);
        return total + item.value * (Number.isNaN(count) ? 0 : count);
    }, 0);
}

function normalizeBankDepositCashDetails(cashDetails = {}) {
    const hasCashCount = BANK_DEPOSIT_DENOMINATIONS.some((item) => {
        const count = parseInt(cashDetails[item.key] || 0, 10);
        return !Number.isNaN(count) && count > 0;
    });
    if (!hasCashCount) {
        return { error: 'Please enter cash note or coin count.' };
    }

    const normalizedCashDetails = {};
    for (const item of BANK_DEPOSIT_DENOMINATIONS) {
        const rawCount = cashDetails[item.key] ?? '';
        if (rawCount === '') {
            normalizedCashDetails[item.key] = 0;
            continue;
        }
        const normalizedCount = String(rawCount).trim();
        if (!/^\d+$/.test(normalizedCount)) {
            return { error: `${item.key.replace('_', ' ')} must contain numbers only` };
        }
        normalizedCashDetails[item.key] = parseInt(normalizedCount, 10);
    }

    return {
        cashDetails: normalizedCashDetails,
        amount: calculateCashDepositAmount(normalizedCashDetails),
    };
}

function normalizeBankDepositChequeDetails(reqBody) {
    const {
        chequeDetails,
        storeName,
        chequeNo,
        chequeDate,
        amount,
    } = reqBody;

    const rawCheques = Array.isArray(chequeDetails) && chequeDetails.length
        ? chequeDetails
        : [{ storeName, chequeNo, chequeDate, amount }];

    const normalizedCheques = [];
    for (let index = 0; index < rawCheques.length; index += 1) {
        const cheque = rawCheques[index] || {};
        const rowLabel = `Cheque ${index + 1}`;
        const storeValidation = validateRequiredText(cheque.storeName, `${rowLabel} store name`);
        if (!storeValidation.valid) return { error: storeValidation.error };
        const chequeValidation = validateRequiredText(cheque.chequeNo, `${rowLabel} cheque no`);
        if (!chequeValidation.valid) return { error: chequeValidation.error };
        const normalizedChequeDate = normalizeDateInput(cheque.chequeDate);
        if (!normalizedChequeDate) return { error: `${rowLabel} cheque date is required` };
        const amountValidation = validateNumeric(cheque.amount, `${rowLabel} amount`);
        if (!amountValidation.valid) return { error: amountValidation.error };
        if (amountValidation.value <= 0) return { error: `${rowLabel} amount must be greater than zero` };

        normalizedCheques.push({
            storeName: storeValidation.value,
            chequeNo: chequeValidation.value,
            chequeDate: normalizedChequeDate,
            amount: amountValidation.value,
            paymentId: cheque.paymentId ? Number(cheque.paymentId) : null,
        });
    }

    const firstCheque = normalizedCheques[0];
    const extraCount = normalizedCheques.length - 1;
    return {
        chequeDetails: normalizedCheques,
        storeName: `${firstCheque.storeName}${extraCount > 0 ? ` (+${extraCount} more)` : ''}`,
        chequeNo: `${firstCheque.chequeNo}${extraCount > 0 ? ` (+${extraCount} more)` : ''}`,
        chequeDate: firstCheque.chequeDate,
        amount: normalizedCheques.reduce((total, cheque) => total + cheque.amount, 0),
    };
}

function normalizeBankDepositUpiDetails(reqBody) {
    const { upiDetails } = reqBody;
    const rawUpis = Array.isArray(upiDetails) && upiDetails.length ? upiDetails : [];

    if (!rawUpis.length) {
        return { error: 'Please add at least one UPI entry.' };
    }

    const normalizedUpis = [];
    for (let index = 0; index < rawUpis.length; index += 1) {
        const upi = rawUpis[index] || {};
        const rowLabel = `UPI ${index + 1}`;
        const storeValidation = validateRequiredText(upi.storeName, `${rowLabel} outlet name`);
        if (!storeValidation.valid) return { error: storeValidation.error };
        const invoiceValidation = validateRequiredText(upi.invoiceNumber, `${rowLabel} invoice number`);
        if (!invoiceValidation.valid) return { error: invoiceValidation.error };
        const upiIdValidation = validateRequiredText(upi.upiId, `${rowLabel} UPI ID`);
        if (!upiIdValidation.valid) return { error: upiIdValidation.error };
        const amountValidation = validateNumeric(upi.amount, `${rowLabel} amount`);
        if (!amountValidation.valid) return { error: amountValidation.error };
        if (amountValidation.value <= 0) return { error: `${rowLabel} amount must be greater than zero` };

        normalizedUpis.push({
            storeName: storeValidation.value,
            invoiceNumber: invoiceValidation.value,
            upiId: upiIdValidation.value,
            amount: amountValidation.value,
            paymentId: upi.paymentId ? Number(upi.paymentId) : null,
        });
    }

    const firstUpi = normalizedUpis[0];
    const extraCount = normalizedUpis.length - 1;
    return {
        upiDetails: normalizedUpis,
        storeName: `${firstUpi.storeName}${extraCount > 0 ? ` (+${extraCount} more)` : ''}`,
        chequeNo: `${firstUpi.invoiceNumber}${extraCount > 0 ? ` (+${extraCount} more)` : ''}`,
        chequeDate: null,
        amount: normalizedUpis.reduce((total, upi) => total + upi.amount, 0),
    };
}

export const createStaff = async (req, res) => {
    try {
        const {
            name,
            contactNo,
            companyName,
            companyNames,
            companyIds,
            staffType = 'distributor',
            assignments = {},
            dob,
            whatsappNumber,
            aadharNo,
            aadharDocumentUrl,
            pccCertificateUrl,
            staffCategory = 'company_staff',
        } = req.body;
        const normalizedStaffType = staffType === 'cnf' ? 'cnf' : 'distributor';
        const normalizedStaffCategory = normalizeStaffCategory(staffCategory);

        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const whatsappSource = String(whatsappNumber || '').trim() || contactValidation.value;
        const whatsappValidation = validateDigitsOnly(whatsappSource, 'WhatsApp number');
        if (!whatsappValidation.valid) {
            return res.status(400).json({ error: whatsappValidation.error });
        }

        const normalizedAadharNo = aadharNo ? String(aadharNo).replace(/\D/g, '') : '';
        if (normalizedAadharNo && normalizedAadharNo.length !== 12) {
            return res.status(400).json({ error: 'Aadhar number must be 12 digits.' });
        }

        const resolvedCompanyIds = normalizedStaffCategory === 'company_staff'
            ? await resolveCompanyIds(companyNames, companyName, companyIds)
            : [];

        if (normalizedStaffCategory === 'company_staff' && resolvedCompanyIds.length === 0) {
            return res.status(400).json({ error: 'Please select at least one company.' });
        }

        const companyId = resolvedCompanyIds[0] || null;
        const profile = buildStaffProfile({
            dob,
            whatsappNumber: whatsappValidation.value,
            aadharNo: normalizedAadharNo,
            aadharDocumentUrl,
            pccCertificateUrl,
            contactNo: contactValidation.value,
            staffCategory: normalizedStaffCategory,
        });

        const staffId = await StaffModel.create(
            name,
            contactValidation.value,
            companyId,
            normalizedStaffType,
            profile
        );
        await StaffModel.setCompanies(staffId, resolvedCompanyIds);

        const primaryCompany = companyId ? await CompanyModel.getById(companyId) : null;
        const companyPrefix = String(primaryCompany?.name || 'STAFF')
            .replace(/[^a-z0-9]/gi, '')
            .slice(0, 8)
            .toUpperCase() || 'STAFF';
        const loginId = `${companyPrefix}${String(staffId).padStart(4, '0')}`;
        const generatedPassword = `${companyPrefix.slice(0, 4)}@${crypto.randomInt(100000, 999999)}`;
        await StaffModel.setLoginCredentials(
            staffId,
            loginId,
            await bcrypt.hash(generatedPassword, 10)
        );

        // Add location assignments
        // assignments: { Monday: [{ locationName: "..." }], Tuesday: [...] }
        for (const day in assignments) {
            const locations = assignments[day];
            if (Array.isArray(locations)) {
                for (const locObj of locations) {
                    const { locationName } = locObj;
                    await StaffModel.addLocation(staffId, day, locationName);
                }
            }
        }

        res.status(201).json({
            message: 'Staff, locations, and login credentials created successfully',
            staffId,
            credentials: {
                loginId,
                password: generatedPassword,
            },
        });
    } catch (error) {
        console.error('Error creating staff:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const generateStaffCredentials = async (req, res) => {
    try {
        const staffId = Number(req.params.id);
        const staff = await StaffModel.getDetails(staffId);
        if (!staff) {
            return res.status(404).json({ error: 'Staff was not found.' });
        }
        const companyName = String(staff.company_name || 'STAFF').split(',')[0].trim();
        const companyPrefix = companyName
            .replace(/[^a-z0-9]/gi, '')
            .slice(0, 8)
            .toUpperCase() || 'STAFF';
        const loginId = `${companyPrefix}${String(staffId).padStart(4, '0')}`;
        const generatedPassword = `${companyPrefix.slice(0, 4)}@${crypto.randomInt(100000, 999999)}`;
        await StaffModel.setLoginCredentials(
            staffId,
            loginId,
            await bcrypt.hash(generatedPassword, 10)
        );
        return res.json({
            message: 'Staff login credentials generated.',
            credentials: { loginId, password: generatedPassword },
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'The generated login ID is already in use.' });
        }
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const updateStaffCredentials = async (req, res) => {
    try {
        const staffId = Number(req.params.id);
        const loginId = String(req.body.loginId || '').trim();
        const password = String(req.body.password || '');

        if (!Number.isInteger(staffId) || staffId <= 0) {
            return res.status(400).json({ error: 'Staff id must be a positive integer.' });
        }
        if (!/^[a-zA-Z0-9._-]{3,50}$/.test(loginId)) {
            return res.status(400).json({ error: 'Login ID must be 3–50 characters and may only use letters, numbers, dots, hyphens, and underscores.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }
        if (!await StaffModel.getDetails(staffId)) {
            return res.status(404).json({ error: 'Staff was not found.' });
        }
        const deliveryBoyWithLoginId = await DeliveryBoyModel.findByLoginId(loginId);
        if (deliveryBoyWithLoginId) {
            return res.status(409).json({ error: 'That Login ID is already in use.' });
        }

        await StaffModel.setLoginCredentials(staffId, loginId, await bcrypt.hash(password, 10));
        return res.json({ message: 'Staff login credentials updated successfully.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'That Login ID is already in use.' });
        }
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const uploadStaffDocument = async (req, res) => {
    try {
        if (!isCloudinaryConfigured()) {
            return res.status(500).json({ error: 'Cloudinary is not configured on the server.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Please select a file to upload.' });
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Only JPG, PNG, WEBP or PDF files are allowed.' });
        }

        const documentType = String(req.body.documentType || 'document').trim().toLowerCase();
        const result = await uploadBufferToCloudinary(req.file.buffer, {
            folder: 'staff-documents',
            uploadOptions: {
                public_id: `${documentType}_${Date.now()}`,
            },
        });

        res.status(200).json({
            url: result.secure_url,
            publicId: result.public_id,
            resourceType: result.resource_type,
        });
    } catch (error) {
        console.error('Error uploading staff document:', error);
        res.status(500).json({ error: 'Failed to upload document.' });
    }
};

export const searchStaff = async (req, res) => {
    try {
        const { query } = req.query;
        const results = await StaffModel.searchByName(query);
        res.status(200).json(results);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStaffLocations = async (req, res) => {
    try {
        const { id } = req.params;
        const { day } = req.query;
        const locations = await StaffModel.getLocationsByStaffAndDay(id, day);
        res.status(200).json(locations);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const addCounter = async (req, res) => {
    try {
        const { id } = req.params;
        const { day, location, counters } = req.body;

        if (Array.isArray(counters)) {
            const erpIds = new Set();

            for (let i = 0; i < counters.length; i++) {
                const counter = counters[i];
                const contactValidation = validateDigitsOnly(
                    counter.contactNumber,
                    `Counter ${i + 1} contact number`
                );
                if (!contactValidation.valid) {
                    return res.status(400).json({ error: contactValidation.error });
                }

                const whatsappSource = String(counter.whatsappNumber || '').trim() || contactValidation.value;
                const whatsappValidation = validateDigitsOnly(
                    whatsappSource,
                    `Counter ${i + 1} WhatsApp number`
                );
                if (!whatsappValidation.valid) {
                    return res.status(400).json({ error: whatsappValidation.error });
                }

                const outletErpId = String(counter.outletErpId || '').trim();
                const outletName = String(counter.outletName || '').trim();
                const address = String(counter.address || '').trim();
                const googleLocationValidation = validateGoogleMapsLocation(
                    counter.googleLocation,
                    `Counter ${i + 1} Google Location`
                );
                const normalizedErpId = outletErpId.toLowerCase();

                if (!outletErpId) {
                    return res.status(400).json({ error: `Counter ${i + 1} ERP ID is mandatory.` });
                }
                if (!outletName) {
                    return res.status(400).json({ error: `Counter ${i + 1} outlet name is required.` });
                }

                if (!googleLocationValidation.valid) {
                    return res.status(400).json({ error: googleLocationValidation.error });
                }

                const googleLocation = googleLocationValidation.value;

                const hasGst = Boolean(counter.hasGst);
                const gstNumber = counter.gstNumber
                    ? String(counter.gstNumber).trim().toUpperCase()
                    : '';
                if (hasGst && !gstNumber) {
                    return res.status(400).json({
                        error: `Counter ${i + 1} GST number is required when GST is enabled.`,
                    });
                }

                const priorityValidation = validatePositiveInteger(counter.priorityNumber, `Counter ${i + 1} priority number`);
                if (!priorityValidation.valid) return res.status(400).json({ error: priorityValidation.error });
                const operatingHoursValidation = parseOutletOperatingHours(counter.operatingHours, `Counter ${i + 1} operating hours`);
                if (!operatingHoursValidation.valid) return res.status(400).json({ error: operatingHoursValidation.error });

                if (erpIds.has(normalizedErpId)) {
                    return res.status(400).json({ error: 'Same ERP Id already exists in this entry.' });
                }

                const duplicateCounter = await StaffModel.findCounterByErpId(outletErpId);
                if (duplicateCounter) {
                    return res.status(400).json({ error: 'Same ERP Id already exists.' });
                }
                const duplicatePriority = await StaffModel.findCounterByPriority(id, day, location, priorityValidation.value);
                if (duplicatePriority) return res.status(400).json({ error: `Priority ${priorityValidation.value} already exists for this location.` });

                erpIds.add(normalizedErpId);

                await StaffModel.addCounter(id, day, location, {
                    ...counter,
                    outletErpId,
                    outletName,
                    address,
                    contactNumber: contactValidation.value,
                    whatsappNumber: whatsappValidation.value,
                    googleLocation,
                    hasGst,
                    gstNumber: hasGst ? gstNumber : null,
                    priorityNumber: priorityValidation.value,
                    operatingHours: operatingHoursValidation.value,
                });
            }
        }

        res.status(201).json({ message: 'Counters added successfully' });
    } catch (error) {
        console.error('Error adding counters:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const toggleStaffActive = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await StaffModel.getDetails(id);
        if (!staff) {
            return res.status(404).json({ error: 'Staff not found' });
        }
        const result = await StaffModel.toggleActive(id);
        res.status(200).json({
            message: result.is_active ? 'Staff activated' : 'Staff deactivated',
            isActive: Boolean(result.is_active),
        });
    } catch (error) {
        console.error('Error toggling staff active status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStaff = async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === 'true';
        const companyId = req.query.companyId ? Number(req.query.companyId) : null;
        if (req.query.companyId && (!Number.isInteger(companyId) || companyId <= 0)) {
            return res.status(400).json({ error: 'companyId must be a positive integer' });
        }
        const staff = await StaffModel.getAll(includeInactive, companyId);
        res.status(200).json(staff);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStaffFullDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await StaffModel.getDetails(id);
        if (!staff) {
            return res.status(404).json({ error: 'Staff not found' });
        }
        const locations = await StaffModel.getAllLocations(id);
        
        // Structure assignments back to the format frontend expects
        const assignments = {
            Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], CNF: []
        };
        locations.forEach(loc => {
            if (assignments[loc.day]) {
                assignments[loc.day].push({ locationName: loc.location_name });
            }
        });

        const companies = buildStaffCompanies(staff);

        res.status(200).json({ ...staff, companies, assignments });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            contactNo,
            companyName,
            companyNames,
            companyIds,
            staffType = 'distributor',
            assignments = {},
            dob,
            whatsappNumber,
            aadharNo,
            aadharDocumentUrl,
            pccCertificateUrl,
            staffCategory = 'company_staff',
        } = req.body;
        const normalizedStaffType = staffType === 'cnf' ? 'cnf' : 'distributor';
        const normalizedStaffCategory = normalizeStaffCategory(staffCategory);

        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const whatsappSource = String(whatsappNumber || '').trim() || contactValidation.value;
        const whatsappValidation = validateDigitsOnly(whatsappSource, 'WhatsApp number');
        if (!whatsappValidation.valid) {
            return res.status(400).json({ error: whatsappValidation.error });
        }

        const normalizedAadharNo = aadharNo ? String(aadharNo).replace(/\D/g, '') : '';
        if (normalizedAadharNo && normalizedAadharNo.length !== 12) {
            return res.status(400).json({ error: 'Aadhar number must be 12 digits.' });
        }

        const resolvedCompanyIds = normalizedStaffCategory === 'company_staff'
            ? await resolveCompanyIds(companyNames, companyName, companyIds)
            : [];

        if (normalizedStaffCategory === 'company_staff' && resolvedCompanyIds.length === 0) {
            return res.status(400).json({ error: 'Please select at least one company.' });
        }

        const companyId = resolvedCompanyIds[0] || null;
        const profile = buildStaffProfile({
            dob,
            whatsappNumber: whatsappValidation.value,
            aadharNo: normalizedAadharNo,
            aadharDocumentUrl,
            pccCertificateUrl,
            contactNo: contactValidation.value,
            staffCategory: normalizedStaffCategory,
        });

        await StaffModel.update(
            id,
            name,
            contactValidation.value,
            companyId,
            normalizedStaffType,
            profile
        );
        await StaffModel.setCompanies(id, resolvedCompanyIds);

        // Keep assignments unchanged when staff details are edited from the separate page.
        if (Object.prototype.hasOwnProperty.call(req.body, 'assignments')) {
            await StaffModel.replaceLocations(id, assignments);
        }

        res.status(200).json({ message: 'Staff updated successfully' });
    } catch (error) {
        console.error('Error updating staff:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getOutletsByStaffAndDate = async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.query; // Expecting YYYY-MM-DD
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(date));
        const outlets = await StaffModel.getMissingSalesOutletsForDate(id, dayName, date);
        
        res.status(200).json(outlets);
    } catch (error) {
        console.error('Error fetching outlets by date:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getAllOutletsForStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const outlets = await StaffModel.getAllCountersForStaff(id);
        res.status(200).json(outlets);
    } catch (error) {
        console.error('Error fetching all outlets for staff:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const normalizeOutletUploadText = (value) => String(value ?? '').trim();
const normalizeOutletUploadKey = (value) => normalizeOutletUploadText(value).toLowerCase();
const normalizeOutletUploadDay = (value) => {
    const normalized = normalizeOutletUploadKey(value);
    const days = {
        monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
        thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', cnf: 'CNF',
    };
    return days[normalized] || normalizeOutletUploadText(value);
};
const OUTLET_OFF_DAYS = new Set(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

const parseOutletOpenTime = (value, fieldName = 'Open time') => {
    const normalized = normalizeOutletUploadText(value);
    if (!normalized) {
        return { valid: true, value: null };
    }
    const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
        return { valid: false, error: `${fieldName} must be in HH:MM format.` };
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        return { valid: false, error: `${fieldName} must be a valid time.` };
    }
    return {
        valid: true,
        value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
    };
};

const parseOutletOperatingHours = (value, fieldName = 'Operating hours') => {
    if (value == null || value === '') return { valid: true, value: null };
    let schedule;
    try {
        schedule = typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        return { valid: false, error: `${fieldName} must be valid JSON.` };
    }
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
        return { valid: false, error: `${fieldName} must be a weekly schedule.` };
    }
    const normalized = {};
    for (const day of OUTLET_OFF_DAYS) {
        const entry = schedule[day];
        if (!entry) continue;
        if (Boolean(entry.isOff)) {
            normalized[day] = { isOff: true };
            continue;
        }
        const parsed = {};
        for (const field of ['firstHalfStart', 'firstHalfEnd', 'secondHalfStart', 'secondHalfEnd']) {
            const result = parseOutletOpenTime(entry[field], `${fieldName} ${day}`);
            if (!result.valid || !result.value) {
                return { valid: false, error: `${fieldName}: enter both first-half and second-half times for ${day}, or mark it off.` };
            }
            parsed[field] = result.value.slice(0, 5);
        }
        if (parsed.firstHalfStart >= parsed.firstHalfEnd || parsed.secondHalfStart >= parsed.secondHalfEnd || parsed.firstHalfEnd > parsed.secondHalfStart) {
            return { valid: false, error: `${fieldName}: ${day} timings are not in order.` };
        }
        normalized[day] = { isOff: false, ...parsed };
    }
    return { valid: true, value: normalized };
};
const parseOutletUploadBoolean = (value) => ['yes', 'y', 'true', '1'].includes(normalizeOutletUploadKey(value));

export const uploadOutletsExcel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please select an outlet Excel file.' });
        }

        const extension = String(req.file.originalname || '').split('.').pop().toLowerCase();
        if (!['xlsx', 'xls'].includes(extension)) {
            return res.status(400).json({ error: 'Only XLS and XLSX files are supported.' });
        }

        const staffId = Number(req.params.id);
        const selectedCompany = normalizeOutletUploadText(req.body?.companyName);
        const selectedDay = normalizeOutletUploadDay(req.body?.day);
        const selectedLocation = normalizeOutletUploadText(req.body?.location);
        if (!Number.isInteger(staffId) || staffId <= 0 || !selectedCompany || !selectedDay || !selectedLocation) {
            return res.status(400).json({ error: 'Company, staff, day, and location must be selected before upload.' });
        }

        const staff = await StaffModel.getDetails(staffId);
        if (!staff) {
            return res.status(404).json({ error: 'Selected staff was not found.' });
        }
        const staffCompanies = String(staff.company_name || '').split(',').map(normalizeOutletUploadKey);
        if (!staffCompanies.includes(normalizeOutletUploadKey(selectedCompany))) {
            return res.status(400).json({ error: 'Selected company does not belong to the selected staff.' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: false });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false });
        const headers = (rows[0] || []).map(normalizeOutletUploadKey);
        const expectedHeaders = [
            ['staff type'], ['company name'], ['staff name'], ['day'], ['location'],
            ['outlate detials', 'outlet details', 'erp id', 'outlet erp id'],
            ['outlate name', 'outlet name'], ['gst yes/no', 'gst applicable'],
            ['gst no', 'gst number'], ['contact', 'contact no'],
            ['whatsapp', 'whatsapp no'], ['location', 'google location'],
        ];
        const invalidHeaderIndex = expectedHeaders.findIndex(
            (aliases, index) => !aliases.includes(headers[index])
        );
        if (invalidHeaderIndex >= 0) {
            return res.status(400).json({
                error: `Invalid outlet template: column ${invalidHeaderIndex + 1} header is not recognized.`,
            });
        }
        const dataRows = rows.slice(1).filter((row) => row.some((cell) => normalizeOutletUploadText(cell)));
        if (dataRows.length === 0) {
            return res.status(400).json({ error: 'No outlet rows were found in the uploaded file.' });
        }

        const parsedCounters = [];
        const fileErpIds = new Set();
        for (let index = 0; index < dataRows.length; index++) {
            const row = dataRows[index];
            const rowNumber = index + 2;
            const [
                staffType, companyName, staffName, day, location, outletErpId,
                outletName, gstApplicable, gstNumber, contactNumber, whatsappNumber,
                googleLocation,
            ] = Array.from({ length: 12 }, (_, column) => normalizeOutletUploadText(row[column]));

            const expectedStaffType = staff.staff_type === 'cnf' ? 'cnf' : 'distributor';
            if (normalizeOutletUploadKey(staffType).replace(/er$/, 'or') !== expectedStaffType) {
                return res.status(400).json({ error: `Row ${rowNumber}: staff type does not match the selected staff.` });
            }
            if (normalizeOutletUploadKey(companyName) !== normalizeOutletUploadKey(selectedCompany)) {
                return res.status(400).json({ error: `Row ${rowNumber}: company name does not match the selected company.` });
            }
            if (normalizeOutletUploadKey(staffName) !== normalizeOutletUploadKey(staff.name)) {
                return res.status(400).json({ error: `Row ${rowNumber}: staff name does not match the selected staff.` });
            }
            if (normalizeOutletUploadKey(normalizeOutletUploadDay(day)) !== normalizeOutletUploadKey(selectedDay)) {
                return res.status(400).json({ error: `Row ${rowNumber}: day does not match the selected day.` });
            }
            if (normalizeOutletUploadKey(location) !== normalizeOutletUploadKey(selectedLocation)) {
                return res.status(400).json({ error: `Row ${rowNumber}: location does not match the selected location.` });
            }
            if (!outletErpId) {
                return res.status(400).json({ error: `Row ${rowNumber}: ERP ID is mandatory (use the "outlate details" column).` });
            }
            if (!outletName) {
                return res.status(400).json({ error: `Row ${rowNumber}: outlet name is required.` });
            }
            const normalizedErpId = normalizeOutletUploadKey(outletErpId);
            if (fileErpIds.has(normalizedErpId)) {
                return res.status(400).json({ error: `Row ${rowNumber}: ERP ID ${outletErpId} is duplicated in this file.` });
            }
            fileErpIds.add(normalizedErpId);

            const existingCounter = await StaffModel.findCounterByErpId(outletErpId);
            if (existingCounter) {
                return res.status(400).json({
                    error: `Row ${rowNumber}: ERP ID ${outletErpId} was already uploaded for ${existingCounter.staff_name}.`,
                });
            }

            const contactValidation = validateDigitsOnly(contactNumber, `Row ${rowNumber} contact number`);
            if (!contactValidation.valid) {
                return res.status(400).json({ error: contactValidation.error });
            }
            const whatsappValidation = validateDigitsOnly(
                whatsappNumber || contactValidation.value,
                `Row ${rowNumber} WhatsApp number`
            );
            if (!whatsappValidation.valid) {
                return res.status(400).json({ error: whatsappValidation.error });
            }
            const googleLocationValidation = validateGoogleMapsLocation(
                googleLocation,
                `Row ${rowNumber} Google Location`
            );
            if (!googleLocationValidation.valid) {
                return res.status(400).json({ error: googleLocationValidation.error });
            }

            const hasGst = parseOutletUploadBoolean(gstApplicable);
            if (hasGst && !gstNumber) {
                return res.status(400).json({ error: `Row ${rowNumber}: GST number is required when GST is YES.` });
            }

            parsedCounters.push({
                outletErpId,
                outletName,
                contactNumber: contactValidation.value,
                whatsappNumber: whatsappValidation.value,
                address: '',
                googleLocation: googleLocationValidation.value,
                hasGst,
                gstNumber: hasGst ? gstNumber.toUpperCase() : null,
            });
        }

        await StaffModel.addCounters(staffId, selectedDay, selectedLocation, parsedCounters);
        return res.status(201).json({
            message: `${parsedCounters.length} outlet${parsedCounters.length === 1 ? '' : 's'} uploaded successfully.`,
            count: parsedCounters.length,
        });
    } catch (error) {
        console.error('Error uploading outlets:', error);
        return res.status(500).json({ error: 'Unable to upload outlets.' });
    }
};

export const downloadOutletsExcel = async (req, res) => {
    try {
        const outlets = await StaffModel.getAllCounters();
        const rows = outlets.map((outlet) => ({
            Staff: outlet.staff_name || '',
            Day: outlet.day || '',
            'Serial No': outlet.serial_no || '',
            'ERP ID': outlet.outlet_erp_id || '',
            'Outlet Name': outlet.outlet_name || '',
            'Contact No': outlet.contact_number || '',
            'WhatsApp No': outlet.whatsapp_number || '',
            Location: outlet.location_name || '',
            Address: outlet.address || '',
            'Google Location': outlet.google_location || '',
            'GST Applicable': outlet.has_gst ? 'Yes' : 'No',
            'GST Number': outlet.gst_number || '',
        }));
        const worksheet = xlsx.utils.json_to_sheet(rows, {
            header: [
                'Staff', 'Day', 'Serial No', 'ERP ID', 'Outlet Name', 'Contact No', 'WhatsApp No',
                'Location', 'Address', 'Google Location', 'GST Applicable', 'GST Number',
            ],
        });
        worksheet['!cols'] = [
            { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 32 }, { wch: 18 }, { wch: 18 },
            { wch: 24 }, { wch: 45 }, { wch: 55 }, { wch: 18 }, { wch: 20 },
        ];

        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Outlets');
        const file = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="all_outlets.xlsx"');
        return res.send(file);
    } catch (error) {
        console.error('Error exporting outlets:', error);
        return res.status(500).json({ error: 'Unable to export outlets.' });
    }
};

export const downloadOutletUploadTemplate = async (req, res) => {
    try {
        const companies = await CompanyModel.getAll();
        const staffMembers = await StaffModel.getAll();
        const locationNames = await StaffModel.getAllAssignedLocationNames();
        const uniqueDropdownValues = (values) => [
            ...new Map(
                values
                    .map(normalizeOutletUploadText)
                    .filter(Boolean)
                    .map((value) => [normalizeOutletUploadKey(value), value])
            ).values(),
        ];
        const staffDropdownNames = uniqueDropdownValues(staffMembers.map((staff) => staff.name));
        const locationDropdownNames = uniqueDropdownValues(locationNames);
        const headers = [
            'staff Type',
            'Company Name',
            'staff Name',
            'Day',
            'location',
            'ERP ID',
            'Outlet Name',
            'GST YES/NO',
            'GST NO',
            'CONTACT',
            'WHATSAPP',
            'Google Location',
        ];
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'EduNextG Sales';
        const worksheet = workbook.addWorksheet('Upload Format', {
            views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
        });
        const instructions = workbook.addWorksheet('Instructions', {
            views: [{ showGridLines: false }],
        });
        const lists = workbook.addWorksheet('Lists', { state: 'veryHidden' });

        worksheet.addRow(headers);
        worksheet.columns = [
            { width: 16 }, { width: 24 }, { width: 26 }, { width: 14 },
            { width: 22 }, { width: 18 }, { width: 30 }, { width: 16 },
            { width: 20 }, { width: 18 }, { width: 18 }, { width: 52 },
        ];
        worksheet.getRow(1).height = 30;
        worksheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });

        lists.getCell('A1').value = 'Staff Types';
        ['Distributor', 'CNF'].forEach((value, index) => { lists.getCell(index + 2, 1).value = value; });
        lists.getCell('B1').value = 'Companies';
        companies.forEach((company, index) => { lists.getCell(index + 2, 2).value = company.name; });
        lists.getCell('C1').value = 'Days';
        ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'CNF']
            .forEach((value, index) => { lists.getCell(index + 2, 3).value = value; });
        lists.getCell('D1').value = 'GST';
        ['YES', 'NO'].forEach((value, index) => { lists.getCell(index + 2, 4).value = value; });
        lists.getCell('E1').value = 'Staff Names';
        staffDropdownNames.forEach((value, index) => { lists.getCell(index + 2, 5).value = value; });
        lists.getCell('F1').value = 'Locations';
        locationDropdownNames.forEach((value, index) => { lists.getCell(index + 2, 6).value = value; });

        const companyLastRow = Math.max(companies.length + 1, 2);
        const staffLastRow = Math.max(staffDropdownNames.length + 1, 2);
        const locationLastRow = Math.max(locationDropdownNames.length + 1, 2);
        for (let row = 2; row <= 501; row++) {
            worksheet.getCell(row, 1).dataValidation = {
                type: 'list', allowBlank: false, formulae: ["'Lists'!$A$2:$A$3"],
                showErrorMessage: true, errorTitle: 'Select Staff Type', error: 'Choose a value from the dropdown.',
            };
            worksheet.getCell(row, 2).dataValidation = {
                type: 'list', allowBlank: false, formulae: [`'Lists'!$B$2:$B$${companyLastRow}`],
                showErrorMessage: true, errorTitle: 'Select Company', error: 'Choose a company from the dropdown.',
            };
            worksheet.getCell(row, 3).dataValidation = {
                type: 'list', allowBlank: false, formulae: [`'Lists'!$E$2:$E$${staffLastRow}`],
                showErrorMessage: true, errorTitle: 'Select Staff', error: 'Choose a staff name from the dropdown.',
            };
            worksheet.getCell(row, 4).dataValidation = {
                type: 'list', allowBlank: false, formulae: ["'Lists'!$C$2:$C$8"],
                showErrorMessage: true, errorTitle: 'Select Day', error: 'Choose a day from the dropdown.',
            };
            worksheet.getCell(row, 5).dataValidation = {
                type: 'list', allowBlank: false, formulae: [`'Lists'!$F$2:$F$${locationLastRow}`],
                showErrorMessage: true, errorTitle: 'Select Location', error: 'Choose a location from the dropdown.',
            };
            worksheet.getCell(row, 8).dataValidation = {
                type: 'list', allowBlank: false, formulae: ["'Lists'!$D$2:$D$3"],
                showErrorMessage: true, errorTitle: 'Select GST', error: 'Choose YES or NO.',
            };
            worksheet.getRow(row).height = 22;
            worksheet.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
                cell.numFmt = '@';
                cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
            });
        }

        instructions.columns = [{ width: 8 }, { width: 90 }];
        instructions.addRow(['ADD OUTLET UPLOAD INSTRUCTIONS']);
        instructions.mergeCells('A1:B1');
        instructions.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        instructions.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
        instructions.getRow(1).height = 30;
        [
            'Select Company, Staff, Day, and Location before uploading.',
            'Every Excel row must match the selected Company, Staff, Day, and Location.',
            'ERP ID is mandatory and cannot be uploaded more than once.',
            'Use only one Day and one Location in each upload file.',
            'If GST YES/NO is NO, leave GST NO blank.',
            'If GST YES/NO is YES, GST NO is mandatory.',
            'CONTACT and WHATSAPP must contain numbers only.',
            'Google Location must be a Google Maps short share link.',
            'Serial numbers are assigned automatically in upload order.',
        ].forEach((rule, index) => instructions.addRow([index + 1, rule]));

        const file = await workbook.xlsx.writeBuffer();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Add_Outlet_Upload_Template.xlsx"');
        return res.send(file);
    } catch (error) {
        console.error('Error creating outlet upload template:', error);
        return res.status(500).json({ error: 'Unable to create outlet upload template.' });
    }
};

export const getNextBillNumber = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await StaffModel.getDetails(id);
        if (!staff) {
            return res.status(404).json({ error: 'Staff not found' });
        }

        const requestedCompany = String(req.query.companyName || '').trim();
        const fallbackCompany = String(staff.company_name || '')
            .split(',')
            .map((name) => name.trim())
            .find(Boolean);
        const companyName = requestedCompany || fallbackCompany || '';
        const billNumber = await StaffModel.generateUniqueBillNumber(id, companyName);

        res.status(200).json({ billNumber });
    } catch (error) {
        console.error('Error generating bill number:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const recordSales = async (req, res) => {
    try {
        const { id } = req.params;
        const { date, sales, permissionGranted, permissionNote, companyName: requestCompanyName } = req.body;

        if (!date || !Array.isArray(sales)) {
            return res.status(400).json({ error: 'Date and sales array are required' });
        }

        const staff = await StaffModel.getDetails(id);
        const resolvedCompanyName =
            String(requestCompanyName || '').trim() ||
            String(staff?.company_name || '')
                .split(',')
                .map((name) => name.trim())
                .find(Boolean) ||
            '';

        const deliveryBoyCache = new Map();
        const validatedSales = [];
        const invoiceNumbers = new Set();
        for (let i = 0; i < sales.length; i++) {
            const item = sales[i];
            const outletValidation = validatePositiveInteger(item.outletId, `Sale ${i + 1} outlet ID`);
            if (!outletValidation.valid) {
                return res.status(400).json({ error: outletValidation.error });
            }

            let invoiceValue = String(item.invoiceNumber || '').trim();
            if (!invoiceValue) {
                invoiceValue = await StaffModel.generateUniqueBillNumber(
                    id,
                    resolvedCompanyName,
                    [...invoiceNumbers]
                );
            }

            const invoiceValidation = validateRequiredText(
                invoiceValue,
                `Sale ${i + 1} invoice number`
            );
            if (!invoiceValidation.valid) {
                return res.status(400).json({ error: invoiceValidation.error });
            }
            const priceValidation = validateNumeric(item.price, `Sale ${i + 1} price`);
            if (!priceValidation.valid) {
                return res.status(400).json({ error: priceValidation.error });
            }
            const itemCountValidation = validatePositiveInteger(item.itemCount, `Sale ${i + 1} no. of item`);
            if (!itemCountValidation.valid) {
                return res.status(400).json({ error: itemCountValidation.error });
            }

            const normalizedInvoice = normalizeInvoiceNumber(invoiceValidation.value);
            if (invoiceNumbers.has(normalizedInvoice)) {
                return res.status(400).json({ error: 'Same invoice number already exists in this entry.' });
            }

            const duplicateInvoice = await StaffModel.findSaleByInvoice(id, invoiceValidation.value);
            if (duplicateInvoice) {
                return res.status(400).json({ error: 'Same invoice number already exists.' });
            }
            invoiceNumbers.add(normalizedInvoice);

            let deliveryBoyId = null;
            let deliveryBoyName = '';
            if (item.deliveryBoyId) {
                const deliveryBoyValidation = validatePositiveInteger(
                    item.deliveryBoyId,
                    `Sale ${i + 1} delivery boy`
                );
                if (!deliveryBoyValidation.valid) {
                    return res.status(400).json({ error: deliveryBoyValidation.error });
                }
                deliveryBoyId = deliveryBoyValidation.value;
                
                deliveryBoyName = deliveryBoyCache.get(deliveryBoyId);
                if (!deliveryBoyName) {
                    const deliveryBoy = await DeliveryBoyModel.getById(deliveryBoyId);
                    if (!deliveryBoy) {
                        return res.status(400).json({ error: `Sale ${i + 1}: delivery boy not found` });
                    }
                    deliveryBoyName = deliveryBoy.name;
                    deliveryBoyCache.set(deliveryBoyId, deliveryBoyName);
                }
            }

            const vehicleNo = item.vehicleNo ? item.vehicleNo.trim() : null;

            validatedSales.push({
                outletId: outletValidation.value,
                invoiceNumber: invoiceValidation.value,
                requisitionNumber: String(item.requisitionNumber || '').trim(),
                itemCount: itemCountValidation.value,
                price: priceValidation.value,
                deliveryBoyId,
                vehicleNo,
                paymentMode: 'cash',
                lineItems: Array.isArray(item.lineItems)
                    ? item.lineItems
                        .map((line) => ({
                            productErpId: String(line.productErpId || line.product_erp_id || '').trim(),
                            productName: String(line.productName || line.product_name || '').trim(),
                            productDivision: String(line.productDivision || line.product_division || '').trim(),
                            variantName: String(line.variantName || line.variant_name || '').trim(),
                            qty: Number(line.qty) || 0,
                            rate: Number(line.rate) || 0,
                            lineTotal: Number(line.lineTotal ?? line.line_total) || 0,
                        }))
                        .filter((line) => line.productErpId && line.productErpId !== '__existing_sale__' && line.qty > 0)
                    : [],
            });
        }

        const outletIds = [...new Set(validatedSales.map((sale) => sale.outletId))];
        const counters = await StaffModel.getCountersByIds(outletIds);
        const counterById = new Map(counters.map((counter) => [Number(counter.id), counter]));
        const erpIds = counters.map((counter) => counter.outlet_erp_id).filter(Boolean);
        const overdueCredits = await StaffModel.getCreditsOverdueByErp(erpIds, 3);

        if (overdueCredits.length > 0) {
            const overdueByErp = new Map();
            overdueCredits.forEach((credit) => {
                const erpKey = String(credit.outlet_erp_id || '').trim().toLowerCase();
                if (!erpKey) return;
                if (!overdueByErp.has(erpKey)) {
                    overdueByErp.set(erpKey, []);
                }
                overdueByErp.get(erpKey).push(credit);
            });

            const overdueOutlets = outletIds
                .map((outletId) => {
                    const counter = counterById.get(Number(outletId));
                    if (!counter) return null;
                    const erpKey = String(counter.outlet_erp_id || '').trim().toLowerCase();
                    const credits = overdueByErp.get(erpKey) || [];
                    if (credits.length === 0) return null;

                    const maxOverdueDays = Math.max(
                        ...credits.map((credit) => Number(credit.overdue_days) || 0)
                    );
                    return {
                        outletId: Number(outletId),
                        outletErpId: counter.outlet_erp_id,
                        outletName: counter.outlet_name,
                        maxOverdueDays,
                        credits: credits.map((credit) => ({
                            creditPaymentId: credit.credit_payment_id,
                            saleId: credit.sale_id,
                            invoiceNumber: credit.invoice_number,
                            stickerNumber: credit.sticker_number,
                            creditAmount: credit.credit_amount,
                            balanceAmount: credit.balance_amount,
                            issueDate: credit.issue_date,
                            dueDate: credit.due_date,
                            creditDays: credit.credit_days,
                            overdueDays: credit.overdue_days,
                            creditStaffName: credit.credit_staff_name,
                            creditOutletName: credit.outlet_name,
                        })),
                    };
                })
                .filter(Boolean);

            if (overdueOutlets.length > 0 && !permissionGranted) {
                return res.status(409).json({
                    code: 'OVERDUE_PERMISSION_REQUIRED',
                    error:
                        'One or more outlets have credit overdue by more than 3 days. Permission is required to add sales.',
                    overdueOutlets,
                });
            }

            if (overdueOutlets.length > 0 && permissionGranted) {
                const note = String(permissionNote || '').trim();
                if (!note) {
                    return res.status(400).json({
                        code: 'PERMISSION_NOTE_REQUIRED',
                        error: 'Permission note is required to add sales for overdue ERP credit.',
                        overdueOutlets,
                    });
                }

                const permittedByAdminId = req.user?.id || null;
                const permittedByName =
                    req.user?.username || req.user?.email || (permittedByAdminId ? `Admin #${permittedByAdminId}` : 'Admin');

                for (const overdueOutlet of overdueOutlets) {
                    await StaffModel.createOverdueSalePermission({
                        staffId: id,
                        saleDate: date,
                        outletId: overdueOutlet.outletId,
                        outletErpId: overdueOutlet.outletErpId,
                        outletName: overdueOutlet.outletName,
                        maxOverdueDays: overdueOutlet.maxOverdueDays,
                        overdueCreditIds: overdueOutlet.credits.map((credit) => credit.creditPaymentId),
                        overdueDetails: overdueOutlet.credits,
                        permissionNote: note,
                        permittedByAdminId,
                        permittedByName,
                    });
                }
            }
        }

        const savedSales = await StaffModel.saveSales(id, date, validatedSales, {
            companyName: resolvedCompanyName,
        });
        const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(
            new Date(`${date}T12:00:00`)
        );

        res.status(201).json({
            message: 'Sales recorded successfully',
            summary: {
                date,
                dayName,
                staffName: staff?.name || '',
                companyName: staff?.company_name || '',
                sales: savedSales,
            },
        });
    } catch (error) {
        console.error('Error recording sales:', error);
        if (
            error.message?.includes('Insufficient stock')
            || error.message?.includes('not available in current stock')
            || error.message?.includes('Physical stock is not available')
            || error.message?.includes('No DMS stock upload found')
        ) {
            return res.status(400).json({ error: error.message });
        }
        if (error.code === 'REQUISITION_NOT_APPROVED') {
            return res.status(409).json({ error: error.message });
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                error:
                    'Could not save multiple invoices for the same outlet. Restart the backend server so the database migration can run, or run: npm run update-schema',
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateSale = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { invoiceNumber, price, itemCount } = req.body;

        const invoiceValidation = validateRequiredText(invoiceNumber, 'Invoice number');
        if (!invoiceValidation.valid) {
            return res.status(400).json({ error: invoiceValidation.error });
        }
        const priceValidation = validateNumeric(price, 'Price');
        if (!priceValidation.valid) {
            return res.status(400).json({ error: priceValidation.error });
        }
        const itemCountValidation = validatePositiveInteger(itemCount, 'No. of item');
        if (!itemCountValidation.valid) {
            return res.status(400).json({ error: itemCountValidation.error });
        }

        const existing = await StaffModel.getSaleById(saleId);
        if (!existing) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        const duplicateInvoice = await StaffModel.findSaleByInvoice(
            existing.staff_id,
            invoiceValidation.value,
            saleId
        );
        if (duplicateInvoice) {
            return res.status(400).json({ error: 'Same invoice number already exists.' });
        }

        const updated = await StaffModel.updateSale(
            saleId,
            invoiceValidation.value,
            priceValidation.value,
            itemCountValidation.value
        );

        res.status(200).json({
            message: 'Sale updated successfully',
            sale: {
                id: updated.id,
                shopName: updated.outlet_name,
                outletErpId: updated.outlet_erp_id || '',
                invoiceNumber: updated.invoice_number,
                itemCount: updated.item_count,
                stickerNumber: updated.sticker_number,
                amount: updated.price,
                deliveryBoyName: updated.delivery_boy_name || '',
                vehicleNo: updated.vehicle_no || '',
            },
        });
    } catch (error) {
        console.error('Error updating sale:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteSale = async (req, res) => {
    try {
        const { saleId } = req.params;
        const existing = await StaffModel.getSaleById(saleId);
        if (!existing) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        await StaffModel.deleteSale(saleId);
        res.status(200).json({ message: 'Sale deleted successfully' });
    } catch (error) {
        console.error('Error deleting sale:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updatePackagingStatus = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { packagingStatus, deliveryBoyId, vehicleNo, deliveryDate, statusDate, expectedStatus, packedItemCount, boxCount, packetCount, packedById } = req.body;

        if (!['not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].includes(packagingStatus)) {
            return res.status(400).json({ error: 'Invalid packaging status' });
        }

        const currentStatus = await StaffModel.getSaleStatusById(saleId);
        if (!currentStatus) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        if (expectedStatus && currentStatus !== expectedStatus) {
            return res.status(409).json({
                error: 'This record was updated by another user. Data has been refreshed.',
                currentStatus,
            });
        }

        const existingSale = await StaffModel.getSaleById(saleId);
        const normalizedStatusDate = normalizeDateInput(statusDate);
        const hasPackedItemCount = Object.prototype.hasOwnProperty.call(req.body, 'packedItemCount');
        const hasBoxCount = Object.prototype.hasOwnProperty.call(req.body, 'boxCount');
        const hasPacketCount = Object.prototype.hasOwnProperty.call(req.body, 'packetCount');
        let normalizedPackedItemCount =
            existingSale?.packed_item_count ?? existingSale?.item_count ?? null;
        let normalizedBoxCount = existingSale?.box_count ?? null;
        let normalizedPacketCount = existingSale?.packet_count ?? null;

        if (hasPackedItemCount) {
            const packedValidation = validatePositiveInteger(packedItemCount, 'Packing item');
            if (!packedValidation.valid) {
                return res.status(400).json({ error: packedValidation.error });
            }
            normalizedPackedItemCount = packedValidation.value;
        }

        if (existingSale?.item_count && normalizedPackedItemCount && normalizedPackedItemCount > Number(existingSale.item_count)) {
            return res.status(400).json({ error: 'Packing item cannot be more than no. of item.' });
        }

        if (hasBoxCount) {
            const boxValidation = validateNonNegativeInteger(boxCount, 'No. of box');
            if (!boxValidation.valid) {
                return res.status(400).json({ error: boxValidation.error });
            }
            normalizedBoxCount = boxValidation.value;
        }

        if (hasPacketCount) {
            const packetValidation = validateNonNegativeInteger(packetCount, 'No. of packet');
            if (!packetValidation.valid) {
                return res.status(400).json({ error: packetValidation.error });
            }
            normalizedPacketCount = packetValidation.value;
        }

        let normalizedPackedById = null;
        if (packagingStatus === 'packing_done') {
            const packedByValidation = validatePositiveInteger(packedById, 'Packaging staff');
            if (!packedByValidation.valid) {
                return res.status(400).json({ error: 'Please select who completed the packing.' });
            }
            const packer = await DeliveryBoyModel.getById(packedByValidation.value);
            if (!packer || packer.role !== 'packaging_staff' || Number(packer.is_active) !== 1) {
                return res.status(400).json({ error: 'Selected packaging staff is invalid or inactive.' });
            }
            normalizedPackedById = packedByValidation.value;
        }

        await StaffModel.updatePackagingStatus(
            saleId,
            packagingStatus,
            deliveryBoyId || null,
            vehicleNo || null,
            normalizeDateInput(deliveryDate),
            normalizedStatusDate,
            normalizedPackedItemCount,
            normalizedBoxCount,
            normalizedPacketCount,
            normalizedPackedById
        );
        const updated = await StaffModel.getSaleById(saleId);
        res.status(200).json({
            message: 'Packaging status updated successfully',
            sale: updated,
        });
    } catch (error) {
        console.error('Error updating packaging status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getSaleStatusHistory = async (req, res) => {
    try {
        const { saleId } = req.params;
        const details = await StaffModel.getSaleStatusHistory(saleId);

        if (!details) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        res.status(200).json(details);
    } catch (error) {
        console.error('Error fetching sale status history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPendingCredits = async (req, res) => {
    try {
        const credits = await StaffModel.getPendingCredits();
        res.status(200).json(credits);
    } catch (error) {
        console.error('Error fetching pending credits:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateCreditRemarks = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { remarks, remarkDate } = req.body;

        if (remarks !== undefined && remarks !== null && typeof remarks !== 'string') {
            return res.status(400).json({ error: 'Remarks must be text.' });
        }
        if (!remarks || !remarks.trim()) {
            return res.status(400).json({ error: 'Remarks are required.' });
        }

        const normalizedRemarkDate = normalizeDateInput(remarkDate);
        if (!normalizedRemarkDate || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedRemarkDate)) {
            return res.status(400).json({ error: 'Remark date is required.' });
        }

        const savedRemark = await StaffModel.addCreditRemark(
            paymentId,
            remarks,
            normalizedRemarkDate
        );
        if (!savedRemark) {
            return res.status(404).json({ error: 'Credit payment not found.' });
        }

        res.status(200).json({
            message: 'Remarks saved successfully',
            remark: savedRemark,
        });
    } catch (error) {
        console.error('Error updating credit remarks:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getBankDeposits = async (req, res) => {
    try {
        const deposits = await BankDepositModel.getRecent();
        res.status(200).json(deposits);
    } catch (error) {
        console.error('Error fetching bank deposits:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const searchDeliveredStores = async (req, res) => {
    try {
        const stores = await StaffModel.searchDeliveredStores(req.query.search || '');
        res.status(200).json(stores);
    } catch (error) {
        console.error('Error searching delivered stores:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const searchPendingCheques = async (req, res) => {
    try {
        const dueByToday = String(req.query.dueByToday ?? 'false').toLowerCase() === 'true';
        const cheques = await ReportModel.getPendingCheques({
            search: req.query.search || '',
            storeName: req.query.storeName || '',
            alarmOnly: dueByToday ? false : String(req.query.alarmOnly ?? 'true').toLowerCase() !== 'false',
            dueByToday,
        });
        res.status(200).json(cheques);
    } catch (error) {
        console.error('Error searching pending cheques:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const searchUpiInvoices = async (req, res) => {
    try {
        const upiPayments = await ReportModel.getUpiPaymentsForDeposit({
            search: req.query.search || '',
        });
        res.status(200).json(upiPayments);
    } catch (error) {
        console.error('Error searching UPI invoices:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const searchPurchaseSellers = async (req, res) => {
    try {
        const companyId = req.query.companyId ? Number(req.query.companyId) : null;
        const sellers = await PurchaseSellerModel.search(req.query.search || '', companyId);
        res.status(200).json(sellers);
    } catch (error) {
        console.error('Error searching purchase sellers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPurchaseSellersByCompany = async (req, res) => {
    try {
        const companyId = Number(req.params.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Valid company is required' });
        }
        const sellers = await PurchaseSellerModel.getByCompany(companyId);
        res.status(200).json(sellers);
    } catch (error) {
        console.error('Error fetching company sellers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getCompanies = async (req, res) => {
    try {
        const { type } = req.query;
        const companies = await CompanyModel.getAll(type || null);
        res.status(200).json(companies);
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const savePurchaseSeller = async (req, res) => {
    try {
        const companyId = Number(req.body.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Company is required' });
        }

        const sellerValidation = validateRequiredText(req.body.sellerName, 'Seller name');
        if (!sellerValidation.valid) return res.status(400).json({ error: sellerValidation.error });

        const hasGst = Boolean(req.body.hasGst);
        const gstin = req.body.gstin ? String(req.body.gstin).trim().toUpperCase() : '';
        const state = req.body.state ? String(req.body.state).trim() : '';
        const pinCode = req.body.pinCode || req.body.inCode
            ? String(req.body.pinCode || req.body.inCode).trim()
            : '';

        if (hasGst) {
            if (!gstin) return res.status(400).json({ error: 'GSTIN is required when GST is enabled' });
            if (!state) return res.status(400).json({ error: 'State is required when GST is enabled' });
            if (!pinCode) return res.status(400).json({ error: 'Pin code is required when GST is enabled' });
        }

        const seller = await PurchaseSellerModel.upsert({
            companyId,
            sellerName: sellerValidation.value,
            address: req.body.address ? String(req.body.address).trim() : '',
            city: req.body.city ? String(req.body.city).trim() : '',
            district: req.body.district ? String(req.body.district).trim() : '',
            state,
            contact: req.body.contact ? String(req.body.contact).replace(/\D/g, '') : '',
            hasGst,
            gstin,
            panNo: req.body.panNo ? String(req.body.panNo).trim().toUpperCase() : '',
            pinCode,
        });

        res.status(200).json({ message: 'Seller saved successfully', seller });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'A seller with this name already exists for the selected company' });
        }
        console.error('Error saving purchase seller:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updatePurchaseSeller = async (req, res) => {
    try {
        const sellerId = Number(req.params.sellerId);
        if (!Number.isInteger(sellerId) || sellerId <= 0) {
            return res.status(400).json({ error: 'Valid seller is required' });
        }

        const existing = await PurchaseSellerModel.getById(sellerId);
        if (!existing) return res.status(404).json({ error: 'Seller not found' });

        const companyId = Number(req.body.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Company is required' });
        }

        const sellerValidation = validateRequiredText(req.body.sellerName, 'Seller name');
        if (!sellerValidation.valid) return res.status(400).json({ error: sellerValidation.error });

        const hasGst = Boolean(req.body.hasGst);
        const gstin = req.body.gstin ? String(req.body.gstin).trim().toUpperCase() : '';
        const state = req.body.state ? String(req.body.state).trim() : '';
        const pinCode = req.body.pinCode || req.body.inCode
            ? String(req.body.pinCode || req.body.inCode).trim()
            : '';

        if (hasGst) {
            if (!gstin) return res.status(400).json({ error: 'GSTIN is required when GST is enabled' });
            if (!state) return res.status(400).json({ error: 'State is required when GST is enabled' });
            if (!pinCode) return res.status(400).json({ error: 'Pin code is required when GST is enabled' });
        }

        const seller = await PurchaseSellerModel.updateById(sellerId, {
            companyId,
            sellerName: sellerValidation.value,
            address: req.body.address ? String(req.body.address).trim() : '',
            city: req.body.city ? String(req.body.city).trim() : '',
            district: req.body.district ? String(req.body.district).trim() : '',
            state,
            contact: req.body.contact ? String(req.body.contact).replace(/\D/g, '') : '',
            hasGst,
            gstin,
            panNo: req.body.panNo ? String(req.body.panNo).trim().toUpperCase() : '',
            pinCode,
        });

        res.status(200).json({ message: 'Seller updated successfully', seller });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'A seller with this name already exists for the selected company' });
        }
        console.error('Error updating purchase seller:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deletePurchaseSeller = async (req, res) => {
    try {
        const sellerId = Number(req.params.sellerId);
        if (!Number.isInteger(sellerId) || sellerId <= 0) {
            return res.status(400).json({ error: 'Valid seller is required' });
        }

        const existing = await PurchaseSellerModel.getById(sellerId);
        if (!existing) return res.status(404).json({ error: 'Seller not found' });

        const affected = await PurchaseSellerModel.deleteById(sellerId);
        if (!affected) return res.status(404).json({ error: 'Seller not found' });

        res.status(200).json({ message: 'Seller deleted successfully' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(409).json({ error: 'Cannot delete seller linked to purchase entries or items' });
        }
        console.error('Error deleting purchase seller:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

function buildSellerItemPayload(body) {
    const companyId = Number(body.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
        return { error: 'Company is required' };
    }

    const sellerId = Number(body.sellerId);
    if (!Number.isInteger(sellerId) || sellerId <= 0) {
        return { error: 'Seller is required' };
    }

    const productErpValidation = validateRequiredText(body.productErpId, 'Product ERP ID');
    if (!productErpValidation.valid) return { error: productErpValidation.error };

    const skuName = body.skuName ? String(body.skuName).trim() : '';
    const variantValidation = validateRequiredText(body.variantName, 'Variant name');
    if (!variantValidation.valid) return { error: variantValidation.error };

    const pcsPerBoxValidation = validateNumeric(body.pcsPerBox, 'Pieces per box');
    if (
        !pcsPerBoxValidation.valid
        || pcsPerBoxValidation.value <= 0
        || !Number.isInteger(pcsPerBoxValidation.value)
    ) {
        return { error: 'Pieces per box must be a whole number greater than zero' };
    }
    const gstValidation = validateNumeric(body.gstPercent ?? 5, 'GST');
    if (!gstValidation.valid) return { error: gstValidation.error };

    const gstSplit = resolveItemGst(gstValidation.value);
    if (gstSplit.error) return { error: gstSplit.error };

    return {
        companyId,
        sellerId,
        productErpId: productErpValidation.value,
        skuName,
        variantName: variantValidation.value,
        hsnCode: body.hsnCode ? String(body.hsnCode).trim().toUpperCase() : '',
        gstPercent: gstSplit.gstPercent,
        cgstPercent: gstSplit.cgstPercent,
        sgstPercent: gstSplit.sgstPercent,
        pcsPerBox: pcsPerBoxValidation.value,
    };
}

const SELLER_ITEM_HEADER_ALIASES = {
    productErpId: ['product erp id', 'product erp id.', 'erp id'],
    skuName: ['sku name', 'product name'],
    variantName: ['variant name', 'variant'],
    hsnCode: ['hsn code', 'hsn'],
    gstPercent: ['gst', 'gst %', 'gst percent'],
    pcsPerBox: ['pcs/box', 'pcs per box', 'pieces per box'],
};

export const updateStaffLocations = async (req, res) => {
    try {
        const staffId = Number(req.params.id);
        const staff = await StaffModel.getDetails(staffId);
        if (!staff) {
            return res.status(404).json({ error: 'Staff not found' });
        }

        const allowedDays = staff.staff_type === 'cnf'
            ? ['CNF']
            : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const submitted = req.body.assignments;
        if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
            return res.status(400).json({ error: 'Assignments are required.' });
        }

        const assignments = {};
        for (const day of allowedDays) {
            const locations = submitted[day] || [];
            if (!Array.isArray(locations)) {
                return res.status(400).json({ error: `Locations for ${day} must be a list.` });
            }
            assignments[day] = locations
                .map((location) => ({ locationName: String(location?.locationName || '').trim() }))
                .filter((location) => location.locationName);
        }

        await StaffModel.replaceLocations(staffId, assignments);
        res.status(200).json({ message: 'Location assignments updated successfully' });
    } catch (error) {
        console.error('Error updating staff locations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const normalizeSellerItemHeader = (value) => String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const findSellerItemCell = (row, field) => {
    const aliases = SELLER_ITEM_HEADER_ALIASES[field] || [];
    const entry = Object.entries(row).find(([header]) =>
        aliases.includes(normalizeSellerItemHeader(header))
    );
    return entry ? entry[1] : '';
};

export const uploadSellerItems = async (req, res) => {
    try {
        const companyId = Number(req.body?.companyId);
        const sellerId = Number(req.body?.sellerId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Please choose a company first.' });
        }
        if (!Number.isInteger(sellerId) || sellerId <= 0) {
            return res.status(400).json({ error: 'Please choose a seller.' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Please choose an XLS or XLSX file.' });
        }

        const extension = (req.file.originalname.split('.').pop() || '').toLowerCase();
        if (!['xls', 'xlsx'].includes(extension)) {
            return res.status(400).json({ error: 'Only XLS and XLSX files are supported.' });
        }

        const seller = await PurchaseSellerModel.getById(sellerId);
        if (!seller || Number(seller.company_id) !== companyId) {
            return res.status(404).json({ error: 'Seller not found for the selected company.' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        const sourceRows = firstSheetName
            ? xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '', raw: false })
            : [];
        if (!sourceRows.length) {
            return res.status(400).json({ error: 'No item rows found in the uploaded file.' });
        }

        const itemsByErpId = new Map();
        const errors = [];
        let duplicateRows = 0;
        sourceRows.forEach((row, index) => {
            const body = {
                companyId,
                sellerId,
                productErpId: findSellerItemCell(row, 'productErpId'),
                skuName: findSellerItemCell(row, 'skuName'),
                variantName: findSellerItemCell(row, 'variantName'),
                hsnCode: findSellerItemCell(row, 'hsnCode'),
                gstPercent: findSellerItemCell(row, 'gstPercent') || 5,
                pcsPerBox: findSellerItemCell(row, 'pcsPerBox'),
            };
            const payload = buildSellerItemPayload(body);
            if (payload.error) {
                errors.push(`Row ${index + 2}: ${payload.error}`);
                return;
            }
            const normalizedErpId = payload.productErpId.toLowerCase();
            if (itemsByErpId.has(normalizedErpId)) duplicateRows += 1;
            itemsByErpId.set(normalizedErpId, payload);
        });

        if (errors.length) {
            return res.status(400).json({
                error: `Upload contains ${errors.length} invalid row${errors.length === 1 ? '' : 's'}.`,
                details: errors.slice(0, 20),
            });
        }

        const items = [...itemsByErpId.values()];
        const result = await SellerItemModel.importMany(items);
        const duplicateMessage = duplicateRows
            ? ` ${duplicateRows} duplicate row${duplicateRows === 1 ? ' was' : 's were'} consolidated.`
            : '';
        return res.status(201).json({
            message: `${items.length} items uploaded successfully (${result.inserted} added, ${result.updated} updated).${duplicateMessage}`,
            total: items.length,
            duplicateRows,
            ...result,
        });
    } catch (error) {
        console.error('Error uploading seller items:', error);
        return res.status(500).json({ error: 'Failed to upload seller items.' });
    }
};

export const getSellerItems = async (req, res) => {
    try {
        const companyId = Number(req.query.companyId);
        const sellerId = Number(req.query.sellerId);

        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ error: 'Company is required' });
        }
        if (!Number.isInteger(sellerId) || sellerId <= 0) {
            return res.status(400).json({ error: 'Seller is required' });
        }

        const seller = await PurchaseSellerModel.getById(sellerId);
        if (!seller || Number(seller.company_id) !== companyId) {
            return res.status(404).json({ error: 'Seller not found for the selected company' });
        }

        const items = await SellerItemModel.getBySeller(companyId, sellerId);
        res.status(200).json(items);
    } catch (error) {
        console.error('Error fetching seller items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createSellerItem = async (req, res) => {
    try {
        const payload = buildSellerItemPayload(req.body);
        if (payload.error) return res.status(400).json({ error: payload.error });

        const seller = await PurchaseSellerModel.getById(payload.sellerId);
        if (!seller || Number(seller.company_id) !== payload.companyId) {
            return res.status(404).json({ error: 'Seller not found for the selected company' });
        }

        const duplicate = await SellerItemModel.findDuplicate(
            payload.sellerId,
            payload.productErpId
        );
        if (duplicate) {
            return res.status(409).json({ error: 'Product ERP ID already exists for this seller' });
        }

        const item = await SellerItemModel.create(payload);
        res.status(201).json({ message: 'Item added successfully', item });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Product ERP ID already exists for this seller' });
        }
        console.error('Error creating seller item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateSellerItem = async (req, res) => {
    try {
        const itemId = Number(req.params.itemId);
        if (!Number.isInteger(itemId) || itemId <= 0) {
            return res.status(400).json({ error: 'Valid item is required' });
        }

        const existing = await SellerItemModel.getById(itemId);
        if (!existing) return res.status(404).json({ error: 'Item not found' });

        const payload = buildSellerItemPayload(req.body);
        if (payload.error) return res.status(400).json({ error: payload.error });

        const seller = await PurchaseSellerModel.getById(payload.sellerId);
        if (!seller || Number(seller.company_id) !== payload.companyId) {
            return res.status(404).json({ error: 'Seller not found for the selected company' });
        }

        const duplicate = await SellerItemModel.findDuplicate(
            payload.sellerId,
            payload.productErpId,
            itemId
        );
        if (duplicate) {
            return res.status(409).json({ error: 'Product ERP ID already exists for this seller' });
        }

        const item = await SellerItemModel.updateById(itemId, payload);
        res.status(200).json({ message: 'Item updated successfully', item });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Product ERP ID already exists for this seller' });
        }
        console.error('Error updating seller item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteSellerItem = async (req, res) => {
    try {
        const itemId = Number(req.params.itemId);
        if (!Number.isInteger(itemId) || itemId <= 0) {
            return res.status(400).json({ error: 'Valid item is required' });
        }

        const existing = await SellerItemModel.getById(itemId);
        if (!existing) return res.status(404).json({ error: 'Item not found' });

        const affected = await SellerItemModel.deleteById(itemId);
        if (!affected) return res.status(404).json({ error: 'Item not found' });

        res.status(200).json({ message: 'Item deleted successfully' });
    } catch (error) {
        console.error('Error deleting seller item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPurchases = async (req, res) => {
    try {
        const purchases = await PurchaseModel.getRecent();
        res.status(200).json(purchases);
    } catch (error) {
        console.error('Error fetching purchases:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

function buildPurchasePayload(req) {
    const companyId = Number(req.body.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) {
        return { error: 'Company is required' };
    }
    const sellerValidation = validateRequiredText(req.body.sellerName, 'Seller name');
    if (!sellerValidation.valid) return { error: sellerValidation.error };
    const invoiceValidation = validateRequiredText(req.body.invoiceNumber, 'Invoice number');
    if (!invoiceValidation.valid) return { error: invoiceValidation.error };

    const grossValidation = validateNumeric(req.body.grossAmount || 0, 'Gross amount');
    if (!grossValidation.valid) return { error: grossValidation.error };
    const traderDiscountValidation = validateNumeric(req.body.traderDiscountValue || 0, 'Trader discount');
    if (!traderDiscountValidation.valid) return { error: traderDiscountValidation.error };
    const primaryDiscountValidation = validateNumeric(req.body.primaryDiscountValue || 0, 'Primary discount');
    if (!primaryDiscountValidation.valid) return { error: primaryDiscountValidation.error };
    const secondaryDiscountValidation = validateNumeric(req.body.secondaryDiscountValue || 0, 'Secondary discount');
    if (!secondaryDiscountValidation.valid) return { error: secondaryDiscountValidation.error };
    const cashDiscountValidation = validateNumeric(req.body.cashDiscountValue || 0, 'Cash discount');
    if (!cashDiscountValidation.valid) return { error: cashDiscountValidation.error };
    const cgstValidation = validateNumeric(req.body.cgstAmount || 0, 'CGST amount');
    if (!cgstValidation.valid) return { error: cgstValidation.error };
    const sgstValidation = validateNumeric(req.body.sgstAmount || 0, 'SGST amount');
    if (!sgstValidation.valid) return { error: sgstValidation.error };

    const totalDiscount =
        traderDiscountValidation.value +
        primaryDiscountValidation.value +
        secondaryDiscountValidation.value +
        cashDiscountValidation.value;
    const taxableValue = Math.max(grossValidation.value - totalDiscount, 0);
    const totalGstAmount = cgstValidation.value + sgstValidation.value;
    const roundedTotal = Math.round(taxableValue + totalGstAmount);
    const roundOff = roundedTotal - (taxableValue + totalGstAmount);

    return {
        payload: {
            companyId,
            sellerName: sellerValidation.value,
            address: req.body.address ? String(req.body.address).trim() : '',
            city: req.body.city ? String(req.body.city).trim() : '',
            state: req.body.state ? String(req.body.state).trim() : '',
            gstin: req.body.gstin ? String(req.body.gstin).trim().toUpperCase() : '',
            panNo: req.body.panNo ? String(req.body.panNo).trim().toUpperCase() : '',
            pinCode: req.body.pinCode || req.body.inCode ? String(req.body.pinCode || req.body.inCode).trim() : '',
            invoiceNumber: invoiceValidation.value,
            ewayBillNo: req.body.ewayBillNo ? String(req.body.ewayBillNo).trim() : '',
            ewayBillDate: normalizeDateInput(req.body.ewayBillDate),
            invoiceDate: normalizeDateInput(req.body.invoiceDate),
            salesOrderNumber: req.body.salesOrderNumber ? String(req.body.salesOrderNumber).trim() : '',
            fssaiNumber: req.body.fssaiNumber ? String(req.body.fssaiNumber).trim() : '',
            grossAmount: grossValidation.value,
            traderDiscountValue: traderDiscountValidation.value,
            primaryDiscountValue: primaryDiscountValidation.value,
            secondaryDiscountValue: secondaryDiscountValidation.value,
            cashDiscountValue: cashDiscountValidation.value,
            taxableValue,
            cgstAmount: cgstValidation.value,
            sgstAmount: sgstValidation.value,
            totalGstAmount,
            roundOff,
            roundedTotal,
        },
    };
}

export const createPurchase = async (req, res) => {
    try {
        const { payload, error } = buildPurchasePayload(req);
        if (error) return res.status(400).json({ error });

        const purchase = await PurchaseModel.create(payload);

        res.status(201).json({ message: 'Purchase saved successfully', purchase });
    } catch (error) {
        console.error('Error saving purchase:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updatePurchase = async (req, res) => {
    try {
        const purchaseId = Number(req.params.purchaseId);
        if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
            return res.status(400).json({ error: 'purchaseId must be a positive integer' });
        }

        const { payload, error } = buildPurchasePayload(req);
        if (error) return res.status(400).json({ error });

        const purchase = await PurchaseModel.update(purchaseId, payload);
        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        res.status(200).json({ message: 'Purchase updated successfully', purchase });
    } catch (error) {
        console.error('Error updating purchase:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deletePurchase = async (req, res) => {
    try {
        const purchaseId = Number(req.params.purchaseId);
        if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
            return res.status(400).json({ error: 'purchaseId must be a positive integer' });
        }

        const deleted = await PurchaseModel.delete(purchaseId);
        if (!deleted) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        res.status(200).json({ message: 'Purchase deleted successfully' });
    } catch (error) {
        console.error('Error deleting purchase:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPurchaseReports = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;

        if (startDate && !datePattern.test(startDate)) {
            return res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
        }
        if (endDate && !datePattern.test(endDate)) {
            return res.status(400).json({ error: 'endDate must be YYYY-MM-DD' });
        }

        const reports = await PurchaseModel.getReports(startDate || null, endDate || null);
        res.status(200).json(reports);
    } catch (error) {
        console.error('Error fetching purchase reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createBankDeposit = async (req, res) => {
    try {
        const {
            companyId,
            depositDate,
            bankName,
            accountName,
            branchName,
            bankAccountNo,
            ifscCode,
            depositorName,
            storeName,
            depositMode,
            amount,
            chequeNo,
            chequeDate,
            chequeDetails = [],
            upiDetails = [],
            cashDetails = {},
        } = req.body;

        const normalizedCompanyId = Number(companyId);
        if (!Number.isInteger(normalizedCompanyId) || normalizedCompanyId <= 0) {
            return res.status(400).json({ error: 'Company is required' });
        }
        const company = await CompanyModel.getById(normalizedCompanyId);
        if (!company) return res.status(400).json({ error: 'Selected company was not found' });

        const normalizedDepositDate = normalizeDateInput(depositDate);
        if (!normalizedDepositDate) {
            return res.status(400).json({ error: 'Deposit date is required' });
        }

        const bankValidation = validateRequiredText(bankName, 'Bank name');
        if (!bankValidation.valid) return res.status(400).json({ error: bankValidation.error });
        const branchValidation = validateRequiredText(branchName, 'Branch name');
        if (!branchValidation.valid) return res.status(400).json({ error: branchValidation.error });
        const accountValidation = validateRequiredText(bankAccountNo, 'Bank account no');
        if (!accountValidation.valid) return res.status(400).json({ error: accountValidation.error });

        const mode = String(depositMode || '').toLowerCase();
        if (!['cash', 'cheque', 'upi'].includes(mode)) {
            return res.status(400).json({ error: 'Deposit mode must be cash, cheque, or upi' });
        }

        let normalizedDepositorName = '';
        if (mode !== 'upi') {
            const depositorValidation = validateRequiredText(depositorName, 'Depositor name');
            if (!depositorValidation.valid) return res.status(400).json({ error: depositorValidation.error });
            normalizedDepositorName = depositorValidation.value;
        }

        let depositAmount = 0;
        let normalizedChequeNo = null;
        let normalizedChequeDate = null;
        let normalizedCashDetails = null;
        let normalizedStoreName = '';

        if (mode === 'cash') {
            const cashResult = normalizeBankDepositCashDetails(cashDetails);
            if (cashResult.error) return res.status(400).json({ error: cashResult.error });
            normalizedCashDetails = cashResult.cashDetails;
            depositAmount = cashResult.amount;
        } else if (mode === 'cheque') {
            const chequeResult = normalizeBankDepositChequeDetails({
                chequeDetails,
                storeName,
                chequeNo,
                chequeDate,
                amount,
            });
            if (chequeResult.error) return res.status(400).json({ error: chequeResult.error });
            normalizedStoreName = chequeResult.storeName;
            normalizedChequeNo = chequeResult.chequeNo;
            normalizedChequeDate = chequeResult.chequeDate;
            normalizedCashDetails = { cheques: chequeResult.chequeDetails };
            depositAmount = chequeResult.amount;
        } else {
            const upiResult = normalizeBankDepositUpiDetails({ upiDetails });
            if (upiResult.error) return res.status(400).json({ error: upiResult.error });
            normalizedStoreName = upiResult.storeName;
            normalizedChequeNo = upiResult.chequeNo;
            normalizedChequeDate = upiResult.chequeDate;
            normalizedCashDetails = { upis: upiResult.upiDetails };
            depositAmount = upiResult.amount;
        }

        const deposit = await BankDepositModel.create({
            companyId: normalizedCompanyId,
            depositDate: normalizedDepositDate,
            bankName: bankValidation.value,
            accountName: accountName ? String(accountName).trim() : null,
            branchName: branchValidation.value,
            bankAccountNo: accountValidation.value,
            ifscCode: ifscCode ? String(ifscCode).trim() : null,
            depositorName: normalizedDepositorName || null,
            storeName: normalizedStoreName,
            depositMode: mode,
            amount: depositAmount,
            chequeNo: normalizedChequeNo,
            chequeDate: normalizedChequeDate,
            cashDetails: normalizedCashDetails,
        });

        res.status(201).json({ message: 'Bank deposit saved successfully', deposit });
    } catch (error) {
        console.error('Error creating bank deposit:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateBankDeposit = async (req, res) => {
    try {
        const { depositId } = req.params;
        const existing = await BankDepositModel.getById(depositId);
        if (!existing) {
            return res.status(404).json({ error: 'Bank deposit not found' });
        }

        const {
            companyId,
            depositDate,
            bankName,
            accountName,
            branchName,
            bankAccountNo,
            ifscCode,
            depositorName,
            storeName,
            depositMode,
            amount,
            chequeNo,
            chequeDate,
            chequeDetails = [],
            upiDetails = [],
            cashDetails = {},
        } = req.body;

        const normalizedCompanyId = Number(companyId);
        if (!Number.isInteger(normalizedCompanyId) || normalizedCompanyId <= 0) {
            return res.status(400).json({ error: 'Company is required' });
        }
        const company = await CompanyModel.getById(normalizedCompanyId);
        if (!company) return res.status(400).json({ error: 'Selected company was not found' });

        const normalizedDepositDate = normalizeDateInput(depositDate);
        if (!normalizedDepositDate) return res.status(400).json({ error: 'Deposit date is required' });
        const bankValidation = validateRequiredText(bankName, 'Bank name');
        if (!bankValidation.valid) return res.status(400).json({ error: bankValidation.error });
        const branchValidation = validateRequiredText(branchName, 'Branch name');
        if (!branchValidation.valid) return res.status(400).json({ error: branchValidation.error });
        const accountValidation = validateRequiredText(bankAccountNo, 'Bank account no');
        if (!accountValidation.valid) return res.status(400).json({ error: accountValidation.error });

        const mode = String(depositMode || '').toLowerCase();
        if (!['cash', 'cheque', 'upi'].includes(mode)) {
            return res.status(400).json({ error: 'Deposit mode must be cash, cheque, or upi' });
        }

        let normalizedDepositorName = '';
        if (mode !== 'upi') {
            const depositorValidation = validateRequiredText(depositorName, 'Depositor name');
            if (!depositorValidation.valid) return res.status(400).json({ error: depositorValidation.error });
            normalizedDepositorName = depositorValidation.value;
        }

        let depositAmount = 0;
        let normalizedChequeNo = null;
        let normalizedChequeDate = null;
        let normalizedCashDetails = null;
        let normalizedStoreName = '';

        if (mode === 'cash') {
            const cashResult = normalizeBankDepositCashDetails(cashDetails);
            if (cashResult.error) return res.status(400).json({ error: cashResult.error });
            normalizedCashDetails = cashResult.cashDetails;
            depositAmount = cashResult.amount;
        } else if (mode === 'cheque') {
            const chequeResult = normalizeBankDepositChequeDetails({
                chequeDetails,
                storeName,
                chequeNo,
                chequeDate,
                amount,
            });
            if (chequeResult.error) return res.status(400).json({ error: chequeResult.error });
            normalizedStoreName = chequeResult.storeName;
            normalizedChequeNo = chequeResult.chequeNo;
            normalizedChequeDate = chequeResult.chequeDate;
            normalizedCashDetails = { cheques: chequeResult.chequeDetails };
            depositAmount = chequeResult.amount;
        } else {
            const upiResult = normalizeBankDepositUpiDetails({ upiDetails });
            if (upiResult.error) return res.status(400).json({ error: upiResult.error });
            normalizedStoreName = upiResult.storeName;
            normalizedChequeNo = upiResult.chequeNo;
            normalizedChequeDate = upiResult.chequeDate;
            normalizedCashDetails = { upis: upiResult.upiDetails };
            depositAmount = upiResult.amount;
        }

        const deposit = await BankDepositModel.update(depositId, {
            companyId: normalizedCompanyId,
            depositDate: normalizedDepositDate,
            bankName: bankValidation.value,
            accountName: accountName ? String(accountName).trim() : null,
            branchName: branchValidation.value,
            bankAccountNo: accountValidation.value,
            ifscCode: ifscCode ? String(ifscCode).trim() : null,
            depositorName: normalizedDepositorName || null,
            storeName: normalizedStoreName,
            depositMode: mode,
            amount: depositAmount,
            chequeNo: normalizedChequeNo,
            chequeDate: normalizedChequeDate,
            cashDetails: normalizedCashDetails,
        });

        res.status(200).json({ message: 'Bank deposit updated successfully', deposit });
    } catch (error) {
        console.error('Error updating bank deposit:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteBankDeposit = async (req, res) => {
    try {
        const deleted = await BankDepositModel.delete(req.params.depositId);
        if (!deleted) {
            return res.status(404).json({ error: 'Bank deposit not found' });
        }
        res.status(200).json({ message: 'Bank deposit deleted successfully' });
    } catch (error) {
        console.error('Error deleting bank deposit:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getCreditRemarks = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const remarks = await StaffModel.getCreditRemarks(paymentId);

        if (!remarks) {
            return res.status(404).json({ error: 'Credit payment not found.' });
        }

        res.status(200).json(remarks);
    } catch (error) {
        console.error('Error fetching credit remarks:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getReports = async (req, res) => {
    try {
        const { startDate, endDate, companyId, staffId } = req.query;
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;

        if (startDate && !datePattern.test(startDate)) {
            return res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
        }
        if (endDate && !datePattern.test(endDate)) {
            return res.status(400).json({ error: 'endDate must be YYYY-MM-DD' });
        }

        const parsedCompanyId = companyId ? Number(companyId) : null;
        const parsedStaffId = staffId ? Number(staffId) : null;

        if (companyId && (!Number.isInteger(parsedCompanyId) || parsedCompanyId <= 0)) {
            return res.status(400).json({ error: 'companyId must be a positive integer' });
        }
        if (staffId && (!Number.isInteger(parsedStaffId) || parsedStaffId <= 0)) {
            return res.status(400).json({ error: 'staffId must be a positive integer' });
        }

        const reports = await ReportModel.getReports(startDate || null, endDate || null, {
            companyId: parsedCompanyId,
            staffId: parsedStaffId,
        });
        res.status(200).json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const downloadPaymentDetailsExcel = async (req, res) => {
    try {
        const { startDate, endDate, companyId, staffId } = req.query;
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if ((startDate && !datePattern.test(startDate)) || (endDate && !datePattern.test(endDate))) {
            return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });
        }

        const parsedCompanyId = companyId ? Number(companyId) : null;
        const parsedStaffId = staffId ? Number(staffId) : null;
        if (companyId && (!Number.isInteger(parsedCompanyId) || parsedCompanyId <= 0)) {
            return res.status(400).json({ error: 'companyId must be a positive integer' });
        }
        if (staffId && (!Number.isInteger(parsedStaffId) || parsedStaffId <= 0)) {
            return res.status(400).json({ error: 'staffId must be a positive integer' });
        }

        const rows = await ReportModel.getPaymentDetails(
            startDate || null,
            endDate || null,
            parsedStaffId,
            parsedCompanyId
        );
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Payment Details', { views: [{ state: 'frozen', ySplit: 1 }] });
        sheet.columns = [
            { header: 'Payment Date', key: 'payment_date', width: 15 },
            { header: 'Payment ID', key: 'payment_id', width: 12 },
            { header: 'Company', key: 'company_name', width: 24 },
            { header: 'Staff', key: 'staff_name', width: 22 },
            { header: 'Outlet', key: 'outlet_name', width: 28 },
            { header: 'Outlet ERP ID', key: 'outlet_erp_id', width: 16 },
            { header: 'Sale ID', key: 'sale_id', width: 12 },
            { header: 'Invoice Number', key: 'invoice_number', width: 20 },
            { header: 'Payment Mode', key: 'payment_mode', width: 15 },
            { header: 'Amount', key: 'amount', width: 16 },
            { header: 'Cash Details', key: 'cash_details_text', width: 42 },
            { header: 'Reference Number', key: 'reference_no', width: 20 },
            { header: 'Reference Date', key: 'reference_date', width: 15 },
        ];
        rows.forEach((row) => {
            let details = row.cash_details;
            if (typeof details === 'string') {
                try { details = JSON.parse(details); } catch (error) { details = {}; }
            }
            const cashDetailsText = row.payment_mode === 'cash'
                ? Object.entries(details || {})
                    .filter(([, count]) => Number(count) > 0)
                    .map(([key, count]) => key === 'paise' ? `${count} paise` : `₹${key.split('_')[1]} x ${count}`)
                    .join(', ')
                : '';
            sheet.addRow({
                ...row,
                payment_mode: String(row.payment_mode || '').toUpperCase(),
                cash_details_text: cashDetailsText,
            });
        });
        sheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
        sheet.getColumn('amount').numFmt = '₹#,##0.00';
        sheet.autoFilter = { from: 'A1', to: 'M1' };

        const file = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Payment_Details_${startDate || 'all'}_to_${endDate || 'all'}.xlsx"`);
        return res.send(Buffer.from(file));
    } catch (error) {
        console.error('Error exporting payment details:', error);
        return res.status(500).json({ error: 'Unable to export payment details' });
    }
};

export const getPaymentDetailsReport = async (req, res) => {
    try {
        const { startDate, endDate, companyId, staffId } = req.query;
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if ((startDate && !datePattern.test(startDate)) || (endDate && !datePattern.test(endDate))) {
            return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });
        }
        const parsedCompanyId = companyId ? Number(companyId) : null;
        const parsedStaffId = staffId ? Number(staffId) : null;
        if (companyId && (!Number.isInteger(parsedCompanyId) || parsedCompanyId <= 0)) {
            return res.status(400).json({ error: 'companyId must be a positive integer' });
        }
        if (staffId && (!Number.isInteger(parsedStaffId) || parsedStaffId <= 0)) {
            return res.status(400).json({ error: 'staffId must be a positive integer' });
        }
        const rows = await ReportModel.getPaymentDetails(
            startDate || null, endDate || null, parsedStaffId, parsedCompanyId
        );
        return res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching payment details report:', error);
        return res.status(500).json({ error: 'Unable to load payment details' });
    }
};

export const getOutletsByStaffAndDayName = async (req, res) => {
    try {
        const { id } = req.params;
        const { day } = req.query; 
        const outlets = await StaffModel.getOutletsForStaffAndDay(id, day);
        res.status(200).json(outlets);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getAllSalesByDate = async (req, res) => {
    try {
        const { date, search } = req.query;

        const sales = await StaffModel.getAllSalesByDate(date, search);
        res.status(200).json(sales);
    } catch (error) {
        console.error('Error fetching global sales by date:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

async function buildSaleFullDetails(saleId) {
    const statusData = await StaffModel.getSaleStatusHistory(saleId);
    if (!statusData) {
        return null;
    }

    const sale = await StaffModel.getSaleDetailsById(saleId) || statusData.sale;

    const payments = await PaymentModel.getBySaleId(saleId);
    const cancellations = await OrderCancellationModel.getBySaleId(saleId);
    const collections = await DeliveryCollectionModel.getBySaleId(saleId);
    const takenBills = await StaffModel.getTakenBillsForSale(saleId);

    const price = parseFloat(sale.price) || 0;
    const paidAmount = parseFloat(sale.paid_amount) || 0;
    const balanceAmount = parseFloat(sale.balance_amount) || 0;

    return {
        sale,
        history: statusData.history || [],
        payments,
        cancellations,
        collections,
        takenBills,
        summary: {
            price,
            paidAmount,
            balanceAmount,
            invoiceNumber: sale.invoice_number,
        },
    };
}

export const lookupSaleByInvoice = async (req, res) => {
    try {
        const { invoiceNumber, saleId } = req.query;

        if (saleId) {
            const details = await buildSaleFullDetails(saleId);
            if (!details) {
                return res.status(404).json({ error: 'Sale not found', results: [] });
            }
            return res.status(200).json({ results: [details], multiple: false });
        }

        const term = String(invoiceNumber || '').trim();
        if (!term) {
            return res.status(400).json({ error: 'Invoice number is required' });
        }

        const matches = await StaffModel.searchSalesByInvoice(term);
        if (!matches.length) {
            return res.status(404).json({ error: 'No invoice found', results: [] });
        }

        const results = await Promise.all(
            matches.map((match) => buildSaleFullDetails(match.id))
        );

        return res.status(200).json({
            results: results.filter(Boolean),
            multiple: matches.length > 1,
        });
    } catch (error) {
        console.error('Error looking up invoice:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getCancelledDeliverySales = async (req, res) => {
    try {
        const sales = await StaffModel.getCancelledDeliverySales();
        res.status(200).json(sales);
    } catch (error) {
        console.error('Error fetching cancelled delivery sales:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const fetchSalesByDate = async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.query; // Expecting YYYY-MM-DD
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const sales = await StaffModel.getSalesByDate(id, date);
        res.status(200).json(sales);
    } catch (error) {
        console.error('Error fetching sales by date:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const editCounter = async (req, res) => {
    try {
        const { counterId } = req.params;
        const {
            outletErpId, outletName, contactNumber, whatsappNumber, address, googleLocation,
            hasGst, gstNumber, serialNo, priorityNumber, operatingHours,
        } = req.body;
        const existingCounter = await StaffModel.getCounterById(counterId);
        if (!existingCounter) {
            return res.status(404).json({ error: 'Counter not found' });
        }

        const normalizedOutletErpId = String(outletErpId || '').trim();
        const normalizedOutletName = String(outletName || '').trim();
        const contactValidation = validateDigitsOnly(contactNumber, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const whatsappSource = String(whatsappNumber || '').trim() || contactValidation.value;
        const whatsappValidation = validateDigitsOnly(whatsappSource, 'WhatsApp number');
        if (!whatsappValidation.valid) {
            return res.status(400).json({ error: whatsappValidation.error });
        }

        const googleLocationValidation = validateGoogleMapsLocation(googleLocation);

        if (!googleLocationValidation.valid) {
            return res.status(400).json({ error: googleLocationValidation.error });
        }

        const normalizedGoogleLocation = googleLocationValidation.value;
        const outletHasGst = Boolean(hasGst);
        const normalizedGstNumber = gstNumber
            ? String(gstNumber).trim().toUpperCase()
            : '';

        if (outletHasGst && !normalizedGstNumber) {
            return res.status(400).json({ error: 'GST number is required when GST is enabled.' });
        }

        const priorityValidation = validatePositiveInteger(priorityNumber, 'Priority number');
        if (!priorityValidation.valid) return res.status(400).json({ error: priorityValidation.error });
        const operatingHoursValidation = parseOutletOperatingHours(operatingHours, 'Operating hours');
        if (!operatingHoursValidation.valid) return res.status(400).json({ error: operatingHoursValidation.error });

        let parsedSerialNo = existingCounter.serial_no;
        if (serialNo !== undefined && serialNo !== null && String(serialNo).trim() !== '') {
            const serialValidation = validatePositiveInteger(serialNo, 'Serial number');
            if (!serialValidation.valid) {
                return res.status(400).json({ error: serialValidation.error });
            }
            parsedSerialNo = serialValidation.value;
        }

        const duplicateCounter = await StaffModel.findCounterByErpId(normalizedOutletErpId);

        if (duplicateCounter && Number(duplicateCounter.id) !== Number(counterId)) {
            return res.status(400).json({ error: 'Same ERP Id already exists.' });
        }
        const duplicatePriority = await StaffModel.findCounterByPriority(
            existingCounter.staff_id, existingCounter.day, existingCounter.location_name, priorityValidation.value, counterId
        );
        if (duplicatePriority) return res.status(400).json({ error: `Priority ${priorityValidation.value} already exists for this location.` });

        await StaffModel.editCounter(counterId, {
            outletErpId: normalizedOutletErpId,
            outletName: normalizedOutletName,
            contactNumber: contactValidation.value,
            whatsappNumber: whatsappValidation.value,
            address: String(address || '').trim(),
            googleLocation: normalizedGoogleLocation,
            hasGst: outletHasGst,
            gstNumber: outletHasGst ? normalizedGstNumber : null,
            serialNo: parsedSerialNo,
            priorityNumber: priorityValidation.value,
            operatingHours: operatingHoursValidation.value,
        });
        res.status(200).json({ message: 'Counter updated successfully' });
    } catch (error) {
        console.error('Error editing counter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteCounter = async (req, res) => {
    try {
        const { counterId } = req.params;
        await StaffModel.deleteCounter(counterId);
        res.status(200).json({ message: 'Counter deleted successfully' });
    } catch (error) {
        console.error('Error deleting counter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getSalePayments = async (req, res) => {
    try {
        const { saleId } = req.params;
        const sale = await PaymentModel.getSaleSummary(saleId);

        if (!sale) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        const payments = await PaymentModel.getBySaleId(saleId);

        res.status(200).json({
            payments,
            summary: {
                price: parseFloat(sale.price),
                paidAmount: parseFloat(sale.paid_amount),
                balanceAmount: parseFloat(sale.balance_amount),
                invoiceNumber: sale.invoice_number,
            },
        });
    } catch (error) {
        console.error('Error fetching sale payments:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.code === 'ER_NO_SUCH_TABLE'
                ? 'sale_payments table missing — restart server after running node src/initDB.js'
                : undefined,
        });
    }
};

export const addSalePayment = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { paymentDate, paymentMode, amount, collectorStaffId, collectorName, collectorType, referenceNo, referenceDate, creditDays, parentCreditPaymentId, cashDetails } = req.body;

        if (!paymentDate) {
            return res.status(400).json({ error: 'Payment date is required' });
        }
        if (!paymentMode) {
            return res.status(400).json({ error: 'Payment mode is required' });
        }


        const amountValidation = validateNumeric(amount, 'Amount');
        if (!amountValidation.valid) {
            return res.status(400).json({ error: amountValidation.error });
        }
        if (amountValidation.value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }

        const allowedModes = ['cash', 'upi', 'credit', 'cheque'];
        if (!allowedModes.includes(String(paymentMode).toLowerCase())) {
            return res.status(400).json({ error: 'Invalid payment mode' });
        }

        const mode = String(paymentMode).toLowerCase();
        let normalizedParentCreditPaymentId = null;
        if (parentCreditPaymentId) {
            const parentValidation = validatePositiveInteger(parentCreditPaymentId, 'Credit payment reference');
            if (!parentValidation.valid) {
                return res.status(400).json({ error: parentValidation.error });
            }
            normalizedParentCreditPaymentId = parentValidation.value;
        }

        if (normalizedParentCreditPaymentId && mode === 'credit') {
            return res.status(400).json({ error: 'Cannot add credit payment inside another credit entry.' });
        }

        if (mode === 'credit') {
            const daysValidation = validatePositiveInteger(creditDays, 'Credit days');
            if (!daysValidation.valid) {
                return res.status(400).json({ error: daysValidation.error });
            }
        }

        if (mode === 'cheque' && !referenceNo) {
            return res.status(400).json({ error: 'Cheque number is required' });
        }

        const formattedPaymentDate = normalizeDateInput(paymentDate);
        const formattedRefDate = normalizeDateInput(referenceDate);
        const collectorPayload = await parseCollectorPayload({
            collectorType,
            collectorStaffId,
            collectorName,
        });
        if (collectorPayload.error) {
            return res.status(400).json({ error: collectorPayload.error });
        }

        const result = await PaymentModel.addPayment(saleId, {
            paymentDate: formattedPaymentDate,
            paymentMode: mode,
            amount: amountValidation.value,
            collectorStaffId: collectorPayload.collectorStaffId,
            collectorName: collectorPayload.collectorName,
            referenceNo: referenceNo || null,
            referenceDate: formattedRefDate,
            creditDays: mode === 'credit' ? parseInt(creditDays, 10) : null,
            parentCreditPaymentId: normalizedParentCreditPaymentId,
            cashDetails: mode === 'cash' ? cashDetails : null,
        });


        res.status(201).json({
            message: 'Payment recorded successfully',
            ...result,
        });
    } catch (error) {
        if (error.message === 'SALE_NOT_FOUND') {
            return res.status(404).json({ error: 'Sale not found' });
        }
        if (error.message === 'EXCEEDS_BALANCE') {
            return res.status(400).json({
                error: `Amount exceeds remaining balance (₹${error.remaining.toFixed(2)} left)`,
            });
        }
        if (error.message === 'CREDIT_PAYMENT_NOT_FOUND') {
            return res.status(404).json({ error: 'Credit payment reference not found' });
        }
        if (error.message === 'EXCEEDS_CREDIT_BALANCE') {
            return res.status(400).json({
                error: `Amount exceeds remaining credit amount (â‚¹${error.remaining.toFixed(2)} left)`,
            });
        }
        if (error.message === 'CREDIT_CHILD_CANNOT_BE_CREDIT') {
            return res.status(400).json({ error: 'Cannot add credit payment inside another credit entry.' });
        }
        console.error('Error adding sale payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


export const editSalePayment = async (req, res) => {
    try {
        const { saleId, paymentId } = req.params;
        const { paymentDate, paymentMode, amount, collectorStaffId, collectorName, collectorType, referenceNo, referenceDate, creditDays, cashDetails } = req.body;

        if (!paymentDate) {
            return res.status(400).json({ error: 'Payment date is required' });
        }
        if (!paymentMode) {
            return res.status(400).json({ error: 'Payment mode is required' });
        }

        const amountValidation = validateNumeric(amount, 'Amount');
        if (!amountValidation.valid) {
            return res.status(400).json({ error: amountValidation.error });
        }
        if (amountValidation.value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }

        const allowedModes = ['cash', 'upi', 'credit', 'cheque'];
        if (!allowedModes.includes(String(paymentMode).toLowerCase())) {
            return res.status(400).json({ error: 'Invalid payment mode' });
        }

        const mode = String(paymentMode).toLowerCase();
        if (mode === 'credit') {
            const daysValidation = validatePositiveInteger(creditDays, 'Credit days');
            if (!daysValidation.valid) {
                return res.status(400).json({ error: daysValidation.error });
            }
        }

        if (mode === 'cheque' && !referenceNo) {
            return res.status(400).json({ error: 'Cheque number is required' });
        }

        let formattedRefDate = referenceDate || null;
        if (formattedRefDate && typeof formattedRefDate === 'string' && formattedRefDate.includes('T')) {
            formattedRefDate = formattedRefDate.split('T')[0];
        }

        let formattedPaymentDate = paymentDate;
        if (formattedPaymentDate && typeof formattedPaymentDate === 'string' && formattedPaymentDate.includes('T')) {
            formattedPaymentDate = formattedPaymentDate.split('T')[0];
        }
        const collectorPayload = await parseCollectorPayload({
            collectorType,
            collectorStaffId,
            collectorName,
        });
        if (collectorPayload.error) {
            return res.status(400).json({ error: collectorPayload.error });
        }

        const result = await PaymentModel.updatePayment(paymentId, saleId, {
            paymentDate: formattedPaymentDate,

            paymentMode: mode,
            amount: amountValidation.value,
            collectorStaffId: collectorPayload.collectorStaffId,
            collectorName: collectorPayload.collectorName,
            referenceNo: referenceNo || null,
            referenceDate: formattedRefDate,
            creditDays: mode === 'credit' ? parseInt(creditDays, 10) : null,
            cashDetails: mode === 'cash' ? cashDetails : null,

        });


        res.status(200).json({
            message: 'Payment updated successfully',
            ...result,
        });
    } catch (error) {
        if (error.message === 'SALE_NOT_FOUND') {
            return res.status(404).json({ error: 'Sale not found' });
        }


        if (error.message === 'EXCEEDS_BALANCE') {
            return res.status(400).json({
                error: `Amount exceeds remaining balance (₹${error.remaining.toFixed(2)} left)`,
            });
        }
        if (error.message === 'CREDIT_PAYMENT_NOT_FOUND') {
            return res.status(404).json({ error: 'Credit payment reference not found' });
        }
        if (error.message === 'EXCEEDS_CREDIT_BALANCE') {
            return res.status(400).json({
                error: `Amount exceeds remaining credit amount (â‚¹${error.remaining.toFixed(2)} left)`,
            });
        }
        if (error.message === 'CREDIT_CHILD_CANNOT_BE_CREDIT') {
            return res.status(400).json({ error: 'Cannot change this credit payment entry into credit.' });
        }
        console.error('Error updating sale payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteSalePayment = async (req, res) => {
    try {
        const { saleId, paymentId } = req.params;
        const result = await PaymentModel.deletePayment(saleId, paymentId);

        res.status(200).json({
            message: 'Payment deleted successfully',
            ...result,
        });
    } catch (error) {
        if (error.message === 'SALE_NOT_FOUND') {
            return res.status(404).json({ error: 'Sale not found' });
        }
        if (error.message === 'PAYMENT_NOT_FOUND') {
            return res.status(404).json({ error: 'Payment not found' });
        }
        console.error('Error deleting sale payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updatePaymentMode = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { paymentMode, paidAmount, balanceAmount, referenceNo, referenceDate, creditDays } = req.body;
        
        if (!paymentMode) {
            return res.status(400).json({ error: 'Payment mode is required' });
        }

        const formattedDate = normalizeDateInput(referenceDate);

        await StaffModel.updatePayment(saleId, {
            paymentMode, 
            paidAmount, 
            balanceAmount, 
            referenceNo, 
            referenceDate: formattedDate, 
            creditDays
        });

        res.status(200).json({ message: 'Payment mode updated successfully' });
    } catch (error) {
        console.error('Error updating payment mode:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const logOrderCancellation = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { outletName, invoiceNumber, productName, productErpId, saleItemId, productQty, productSize, amount, reason, remarks } = req.body;
        const qtyValue = productQty ?? productSize;

        if (!outletName) {
            return res.status(400).json({ error: 'Outlet name is required' });
        }
        if (!invoiceNumber) {
            return res.status(400).json({ error: 'Invoice number is required' });
        }
        if (!productName) {
            return res.status(400).json({ error: 'Product name is required' });
        }
        const qtyValidation = validateNumeric(qtyValue, 'Product qty to cancel');
        if (!qtyValidation.valid) {
            return res.status(400).json({ error: qtyValidation.error });
        }
        if (qtyValidation.value <= 0) {
            return res.status(400).json({ error: 'Product qty to cancel must be greater than zero' });
        }
        if (!String(reason || '').trim()) {
            return res.status(400).json({ error: 'Cancellation reason is required' });
        }

        const amountValidation = validateNumeric(amount, 'Amount');
        if (!amountValidation.valid) {
            return res.status(400).json({ error: amountValidation.error });
        }
        if (amountValidation.value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const salePrice = await PaymentModel.getSalePrice(connection, saleId);
            if (salePrice === null) {
                await connection.rollback();
                return res.status(404).json({ error: 'Sale not found' });
            }

            const alreadyCancelled = await OrderCancellationModel.getTotalCancelledAmount(connection, saleId);
            const remainingInvoiceAmount = Math.round((salePrice - alreadyCancelled) * 100) / 100;
            if (amountValidation.value > remainingInvoiceAmount + 0.001) {
                await connection.rollback();
                return res.status(400).json({
                    error: `Cancellation amount exceeds remaining invoice value (₹${remainingInvoiceAmount.toFixed(2)} left)`,
                });
            }

            let saleItem = null;
            if (saleItemId) {
                const [itemRows] = await connection.execute(
                    `SELECT id, sale_id, product_erp_id, product_name, product_division, variant_name, qty, rate
                     FROM staff_sale_items WHERE id = ? AND sale_id = ? LIMIT 1`,
                    [saleItemId, saleId]
                );
                saleItem = itemRows[0] || null;
                if (!saleItem) {
                    await connection.rollback();
                    return res.status(400).json({ error: 'Selected sale item was not found.' });
                }

                const [cancelledQtyRows] = await connection.execute(
                    `SELECT COALESCE(SUM(product_qty), 0) AS cancelled_qty
                     FROM order_cancellations WHERE sale_id = ? AND sale_item_id = ?`,
                    [saleId, saleItem.id]
                );
                const remainingQty = Math.max(0, Number(saleItem.qty) - Number(cancelledQtyRows[0]?.cancelled_qty || 0));
                if (qtyValidation.value > remainingQty + 0.001) {
                    await connection.rollback();
                    return res.status(400).json({ error: `Cancellation qty exceeds remaining sold qty (${remainingQty} left).` });
                }
            }

            const cancellationId = await OrderCancellationModel.create({
                saleId,
                saleItemId: saleItem?.id || null,
                productErpId: saleItem?.product_erp_id || productErpId || null,
                outletName,
                invoiceNumber,
                productName,
                productQty: qtyValidation.value,
                amount: amountValidation.value,
                reason: String(reason).trim().slice(0, 255),
                remarks: String(remarks || '').trim().slice(0, 2000) || null,
            }, connection);

            if (saleItem) {
                const [companyRows] = await connection.execute(
                    `SELECT c.name AS company_name
                     FROM staff_sales ss
                     LEFT JOIN staff s ON s.id = ss.staff_id
                     LEFT JOIN companies c ON c.id = s.company_id
                     WHERE ss.id = ? LIMIT 1`,
                    [saleId]
                );
                const companyName = String(saleItem.product_division || companyRows[0]?.company_name || '').trim();
                await PhysicalStockModel.restoreStockForCompany(
                    connection,
                    companyName,
                    [{ ...saleItem, qty: qtyValidation.value }],
                    `Cancelled Order #${cancellationId}`
                );
            }

            await PaymentModel.recalculateSaleTotals(connection, saleId);
            await connection.commit();

            const summary = await PaymentModel.buildPaymentResponse(saleId);

            res.status(201).json({
                message: 'Order cancellation logged successfully',
                cancellationId,
                summary: summary.summary,
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error logging order cancellation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getOrderCancellations = async (req, res) => {
    try {
        const { saleId } = req.params;
        const cancellations = await OrderCancellationModel.getBySaleId(saleId);
        res.status(200).json(cancellations);
    } catch (error) {
        console.error('Error fetching order cancellations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPackagingRemarks = async (req, res) => {
    try {
        const { saleId } = req.params;
        const remarks = await PackagingRemarkModel.getBySaleId(saleId);
        res.status(200).json(remarks);
    } catch (error) {
        console.error('Error fetching packaging remarks:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const savePackagingRemarks = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { remarkCategory, issueType, items } = req.body;

        if (!['pending_item'].includes(String(remarkCategory || ''))) {
            return res.status(400).json({ error: 'Invalid remark category.' });
        }
        if (!['cancel', 'wrong_delivered'].includes(String(issueType || ''))) {
            return res.status(400).json({ error: 'Please choose Cancel or Wrong Delivered.' });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Please add at least one item.' });
        }

        const salePrice = await PaymentModel.getSalePrice(db, saleId);
        if (salePrice === null) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        const normalizedItems = [];
        for (const item of items) {
            const qtyValidation = validateNumeric(item.qty, 'Qty');
            if (!qtyValidation.valid || qtyValidation.value <= 0) {
                return res.status(400).json({ error: 'Please enter a valid qty for each item.' });
            }

            const amountValidation = validateNumeric(item.amount, 'Total amount');
            if (!amountValidation.valid || amountValidation.value <= 0) {
                return res.status(400).json({ error: 'Please enter a valid total amount for each item.' });
            }

            const remarksText = item.remarks != null ? String(item.remarks).trim().slice(0, 2000) : null;

            if (issueType === 'wrong_delivered') {
                const wrongItemValidation = validateRequiredText(item.wrongItem, 'Wrong item');
                if (!wrongItemValidation.valid) {
                    return res.status(400).json({ error: wrongItemValidation.error });
                }
                const originalItemValidation = validateRequiredText(item.originalItem, 'Original item');
                if (!originalItemValidation.valid) {
                    return res.status(400).json({ error: originalItemValidation.error });
                }

                normalizedItems.push({
                    saleId,
                    remarkCategory,
                    issueType,
                    itemName: wrongItemValidation.value.slice(0, 255),
                    wrongItem: wrongItemValidation.value.slice(0, 255),
                    originalItem: originalItemValidation.value.slice(0, 255),
                    qty: qtyValidation.value,
                    amount: amountValidation.value,
                    remarks: remarksText || null,
                });
                continue;
            }

            const itemNameValidation = validateRequiredText(item.itemName, 'Item name');
            if (!itemNameValidation.valid) {
                return res.status(400).json({ error: itemNameValidation.error });
            }

            normalizedItems.push({
                saleId,
                remarkCategory,
                issueType,
                itemName: itemNameValidation.value.slice(0, 255),
                wrongItem: null,
                originalItem: null,
                qty: qtyValidation.value,
                amount: amountValidation.value,
                remarks: remarksText || null,
            });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await PackagingRemarkModel.createBatch(normalizedItems, connection);
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        const savedRemarks = await PackagingRemarkModel.getBySaleId(saleId);
        res.status(201).json({
            message: 'Packaging remarks saved successfully',
            remarks: savedRemarks,
        });
    } catch (error) {
        console.error('Error saving packaging remarks:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getSaleItems = async (req, res) => {
    try {
        const { saleId } = req.params;
        const items = await StaffModel.getSaleItemsBySaleId(saleId);
        if (items.length) {
            return res.status(200).json(items);
        }

        const sale = await StaffModel.getSaleById(saleId);
        const itemCount = Number(sale?.item_count) || 0;
        const price = Number(sale?.price) || 0;
        if (sale && itemCount > 0 && price >= 0) {
            return res.status(200).json([{
                id: 'manual-entry',
                sale_id: Number(saleId),
                product_erp_id: 'manual-entry',
                product_name: 'Manual entry items',
                product_division: null,
                variant_name: `${itemCount} item(s)`,
                qty: itemCount,
                rate: itemCount > 0 ? price / itemCount : price,
                line_total: price,
            }]);
        }

        res.status(200).json([]);
    } catch (error) {
        console.error('Error fetching sale items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const recordTakenBills = async (req, res) => {
    try {
        const { paymentIds, staffId, deliveryBoyId, collectorType, takenDate } = req.body;
        const normalizedCollectorType = String(collectorType || 'company_staff').toLowerCase();

        if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
            return res.status(400).json({ error: 'Please select one or more bills.' });
        }

        if (!takenDate) {
            return res.status(400).json({ error: 'Please choose taken date.' });
        }

        let parsedStaffId = null;
        let parsedDeliveryBoyId = null;

        if (normalizedCollectorType === 'bawarchee_staff') {
            const deliveryBoyValidation = validatePositiveInteger(deliveryBoyId, 'Delivery boy');
            if (!deliveryBoyValidation.valid) {
                return res.status(400).json({ error: deliveryBoyValidation.error });
            }
            const deliveryBoy = await DeliveryBoyModel.getById(deliveryBoyValidation.value);
            if (!deliveryBoy) {
                return res.status(400).json({ error: 'Delivery boy not found.' });
            }
            parsedDeliveryBoyId = deliveryBoyValidation.value;
        } else {
            const staffValidation = validatePositiveInteger(staffId, 'Staff');
            if (!staffValidation.valid) {
                return res.status(400).json({ error: staffValidation.error });
            }
            parsedStaffId = staffValidation.value;
        }

        await StaffModel.recordTakenBills(paymentIds, {
            collectorType: normalizedCollectorType === 'bawarchee_staff' ? 'bawarchee_staff' : 'company_staff',
            staffId: parsedStaffId,
            deliveryBoyId: parsedDeliveryBoyId,
            takenDate,
        });

        res.status(200).json({ message: 'Bills recorded as taken successfully' });
    } catch (error) {
        if (error.message === 'ALREADY_TAKEN') {
            return res.status(400).json({ error: 'One or more bills are already taken.', paymentIds: error.paymentIds });
        }
        console.error('Error recording taken bills:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const returnTakenBills = async (req, res) => {
    try {
        const { takenBillIds } = req.body;

        if (!Array.isArray(takenBillIds) || takenBillIds.length === 0) {
            return res.status(400).json({ error: 'Please select one or more taken bills to return.' });
        }

        const returnedCount = await StaffModel.returnTakenBills(takenBillIds);
        if (returnedCount === 0) {
            return res.status(404).json({ error: 'No active taken bills found to return.' });
        }

        res.status(200).json({ message: 'Bills returned successfully', returnedCount });
    } catch (error) {
        console.error('Error returning taken bills:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getTakenBillsReport = async (req, res) => {
    try {
        const { startDate, endDate, staffId } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required.' });
        }

        let parsedStaffId = null;
        if (staffId) {
            const staffValidation = validatePositiveInteger(staffId, 'Staff');
            if (staffValidation.valid) {
                parsedStaffId = staffValidation.value;
            }
        }

        const report = await StaffModel.getTakenBillsReport(startDate, endDate, parsedStaffId);
        res.status(200).json(report);
    } catch (error) {
        console.error('Error fetching taken bills report:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createCompany = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const type = String(req.body.type || '').trim().toLowerCase();
        const about = String(req.body.about || '').trim();

        if (!name) {
            return res.status(400).json({ error: 'Company name is required.' });
        }
        if (!['distributor', 'cnf'].includes(type)) {
            return res.status(400).json({ error: 'Company type must be "distributor" or "cnf".' });
        }

        // Validate about word count (max 200)
        if (about) {
            const wordCount = about.split(/\s+/).filter(Boolean).length;
            if (wordCount > 200) {
                return res.status(400).json({ error: 'About must not exceed 200 words.' });
            }
        }

        const { id, code } = await CompanyModel.create(name, type, about || null);
        res.status(201).json({ id, code, name, type, about });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'A company with this name already exists.' });
        }
        console.error('Error creating company:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateCompany = async (req, res) => {
    try {
        const idValidation = validatePositiveInteger(req.params.id, 'Company ID');
        if (!idValidation.valid) {
            return res.status(400).json({ error: idValidation.error });
        }

        const name = String(req.body.name || '').trim();
        const type = String(req.body.type || '').trim().toLowerCase();
        const about = String(req.body.about || '').trim();

        if (!name) {
            return res.status(400).json({ error: 'Company name is required.' });
        }
        if (!['distributor', 'cnf'].includes(type)) {
            return res.status(400).json({ error: 'Company type must be "distributor" or "cnf".' });
        }

        if (about) {
            const wordCount = about.split(/\s+/).filter(Boolean).length;
            if (wordCount > 200) {
                return res.status(400).json({ error: 'About must not exceed 200 words.' });
            }
        }

        const existing = await CompanyModel.getById(idValidation.value);
        if (!existing) {
            return res.status(404).json({ error: 'Company not found.' });
        }

        const affectedRows = await CompanyModel.updateById(idValidation.value, {
            name,
            type,
            about: about || null,
        });
        if (affectedRows === 0) {
            return res.status(404).json({ error: 'Company not found.' });
        }

        res.status(200).json({
            id: idValidation.value,
            code: existing.code,
            name,
            type,
            about: about || null,
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'A company with this name already exists.' });
        }
        console.error('Error updating company:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteCompany = async (req, res) => {
    try {
        const idValidation = validatePositiveInteger(req.params.id, 'Company ID');
        if (!idValidation.valid) {
            return res.status(400).json({ error: idValidation.error });
        }
        const affectedRows = await CompanyModel.deleteById(idValidation.value);
        if (affectedRows === 0) {
            return res.status(404).json({ error: 'Company not found.' });
        }
        res.status(200).json({ message: 'Company deleted successfully.' });
    } catch (error) {
        console.error('Error deleting company:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
