import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import StaffModel from '../models/staffModel.js';
import StaffPortalModel, { INVOICE_STATUSES } from '../models/staffPortalModel.js';
import { validateNumeric, validatePositiveInteger } from '../utils/validation.js';

const TOKEN_AUDIENCE = 'staff-mobile';
const TOKEN_EXPIRES_IN = '30d';
const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const failedLogins = new Map();
const OVERALL_RANGE = { fromDate: '1000-01-01', toDate: '9999-12-31', overall: true };

/**
 * Staff mobile tokens use their own secret so they can never be replayed against
 * the web /api/staff routes (which verify with JWT_SECRET).
 */
export function staffMobileSecret() {
    if (process.env.STAFF_MOBILE_JWT_SECRET) return process.env.STAFF_MOBILE_JWT_SECRET;
    return `${process.env.JWT_SECRET || 'super_secret_key_12345'}:staff-mobile`;
}

function todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Reads ?from=&to= (YYYY-MM-DD). Missing values default to today. */
function readDateRange(query) {
    const fromDate = String(query.from || query.fromDate || '').trim() || todayIso();
    const toDate = String(query.to || query.toDate || '').trim() || fromDate;
    if (!isIsoDate(fromDate) || !isIsoDate(toDate)) {
        return { error: 'Dates must be valid and use YYYY-MM-DD' };
    }
    if (fromDate > toDate) {
        return { error: 'From date must be on or before To date' };
    }
    const days = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000;
    if (days > MAX_RANGE_DAYS) {
        return { error: `Choose a date range of ${MAX_RANGE_DAYS} days or less` };
    }
    return { fromDate, toDate };
}

function loginKey(req, loginId) {
    return `${String(loginId).toLowerCase()}|${req.ip || ''}`;
}

function lockedMinutes(key) {
    const entry = failedLogins.get(key);
    if (!entry) return 0;
    if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
        return Math.ceil((entry.lockedUntil - Date.now()) / 60_000);
    }
    if (entry.lockedUntil) failedLogins.delete(key);
    return 0;
}

function recordFailedLogin(key) {
    const entry = failedLogins.get(key) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_LOGINS) {
        entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
        entry.count = 0;
    }
    failedLogins.set(key, entry);
}

/** Test helper. */
export function resetStaffLoginThrottle() {
    failedLogins.clear();
}

export function verifyStaffMobileToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(403).json({ error: 'Access denied. No staff token provided.' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, staffMobileSecret(), { audience: TOKEN_AUDIENCE });
    } catch (_error) {
        return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
    if (decoded.role !== 'company_staff' || !Number.isInteger(decoded.staffId)) {
        return res.status(401).json({ error: 'Invalid staff token.' });
    }

    StaffPortalModel.getActiveStaff(decoded.staffId)
        .then((staff) => {
            if (!staff) {
                return res.status(401).json({ error: 'This staff account is inactive. Contact your administrator.' });
            }
            req.staffId = decoded.staffId;
            req.staffLoginId = decoded.loginId;
            return next();
        })
        .catch((error) => {
            console.error('Error verifying staff mobile session:', error);
            res.status(500).json({ error: 'Internal server error' });
        });
}

export const login = async (req, res) => {
    try {
        const loginId = String(req.body.loginId || '').trim();
        const password = String(req.body.password || '');
        if (!loginId || !password) {
            return res.status(400).json({ error: 'Login ID and password are required' });
        }

        const key = loginKey(req, loginId);
        const minutes = lockedMinutes(key);
        if (minutes > 0) {
            return res.status(429).json({
                error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
            });
        }

        const staff = await StaffModel.findByLoginId(loginId);
        const valid = staff
            && Number(staff.is_active) === 1
            && staff.password_hash
            && await bcrypt.compare(password, staff.password_hash);
        if (!valid) {
            recordFailedLogin(key);
            return res.status(401).json({ error: 'Invalid login ID or password' });
        }
        failedLogins.delete(key);

        const token = jwt.sign(
            { role: 'company_staff', staffId: Number(staff.id), loginId: staff.login_id },
            staffMobileSecret(),
            { audience: TOKEN_AUDIENCE, expiresIn: TOKEN_EXPIRES_IN }
        );
        const profile = await StaffPortalModel.getProfile(staff.id);

        return res.status(200).json({ message: 'Login successful', token, staff: profile });
    } catch (error) {
        console.error('Error during staff mobile login:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getProfile = async (req, res) => {
    try {
        const profile = await StaffPortalModel.getProfile(req.staffId);
        if (!profile) return res.status(404).json({ error: 'Staff not found' });
        return res.status(200).json(profile);
    } catch (error) {
        console.error('Error fetching staff mobile profile:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getDashboard = async (req, res) => {
    try {
        // ?scope=all returns lifetime totals; otherwise ?from=&to= (defaults to today).
        const range = req.query.scope === 'all' ? OVERALL_RANGE : readDateRange(req.query);
        if (range.error) return res.status(400).json({ error: range.error });
        return res.status(200).json(await StaffPortalModel.getDashboard(req.staffId, range));
    } catch (error) {
        console.error('Error fetching staff dashboard:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getInvoices = async (req, res) => {
    try {
        const range = req.query.scope === 'all' ? OVERALL_RANGE : readDateRange(req.query);
        if (range.error) return res.status(400).json({ error: range.error });
        const status = String(req.query.status || '').trim();
        if (status && status !== 'all' && status !== 'packaging' && !INVOICE_STATUSES.includes(status)) {
            return res.status(400).json({ error: 'Invalid status filter' });
        }
        const invoices = await StaffPortalModel.getInvoices(req.staffId, {
            ...range,
            status: status === 'all' ? '' : status,
            search: String(req.query.search || '').slice(0, 100),
        });
        return res.status(200).json(invoices);
    } catch (error) {
        console.error('Error fetching staff invoices:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getInvoiceDetail = async (req, res) => {
    try {
        const saleId = Number(req.params.saleId);
        if (!Number.isInteger(saleId) || saleId <= 0) return res.status(400).json({ error: 'Invalid invoice' });
        const invoice = await StaffPortalModel.getInvoiceDetail(req.staffId, saleId);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        return res.status(200).json(invoice);
    } catch (error) {
        console.error('Error fetching staff invoice detail:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getOutBills = async (req, res) => {
    try {
        return res.status(200).json(await StaffPortalModel.getOutBills(req.staffId));
    } catch (error) {
        console.error('Error fetching staff out bills:', error);
        return res.status(500).json({ error: 'Unable to fetch Out Bills' });
    }
};

export const submitOutBillPayment = async (req, res) => {
    try {
        const saleId = Number(req.params.saleId);
        if (!Number.isInteger(saleId) || saleId <= 0) return res.status(400).json({ error: 'Invalid invoice' });

        const paymentMode = String(req.body.paymentMode || '').trim().toLowerCase();
        if (!['cash', 'upi', 'cheque', 'credit'].includes(paymentMode)) {
            return res.status(400).json({ error: 'Select cash, UPI, cheque, or credit' });
        }

        const amountResult = validateNumeric(req.body.amount, 'Amount');
        const amount = amountResult.value;
        if (
            !amountResult.valid
            || !Number.isFinite(amount)
            || amount <= 0
            || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
        ) {
            return res.status(400).json({ error: 'Enter a positive amount with at most two decimal places' });
        }

        const referenceNo = String(req.body.referenceNo || '').trim() || null;
        if (referenceNo && referenceNo.length > 100) {
            return res.status(400).json({ error: 'Reference number must be 100 characters or less' });
        }
        if (paymentMode === 'cheque' && !referenceNo) {
            return res.status(400).json({ error: 'Cheque number is required' });
        }
        const referenceDate = String(req.body.referenceDate || '').trim() || null;
        if (referenceDate && !isIsoDate(referenceDate)) {
            return res.status(400).json({ error: 'Cheque date must use YYYY-MM-DD' });
        }

        let creditDays = null;
        if (paymentMode === 'credit') {
            const creditDaysResult = validatePositiveInteger(req.body.creditDays, 'Credit days');
            if (!creditDaysResult.valid) return res.status(400).json({ error: creditDaysResult.error });
            if (creditDaysResult.value > 14) return res.status(400).json({ error: 'Credit days must be between 1 and 14' });
            creditDays = creditDaysResult.value;
        }

        const result = await StaffPortalModel.submitOutBillPayment(req.staffId, saleId, {
            paymentMode,
            amount,
            referenceNo: paymentMode === 'cheque' || paymentMode === 'upi' ? referenceNo : null,
            referenceDate: paymentMode === 'cheque' ? referenceDate : null,
            creditDays,
        });
        if (!result) {
            return res.status(404).json({
                error: 'This Out Bill is not assigned to you, is already paid, or already has a payment waiting for settlement.',
            });
        }
        return res.status(200).json({ message: 'Payment submitted to D.B. Collection for settlement', ...result });
    } catch (error) {
        if (error.message === 'PAYMENT_ALREADY_PENDING') {
            return res.status(409).json({ error: `Rs. ${Number(error.pendingAmount).toFixed(2)} for this bill is already waiting in D.B. Collection. It can be collected again only after the office settles or removes that entry.` });
        }
        if (error.message === 'EXCEEDS_BALANCE') {
            return res.status(400).json({ error: `Amount exceeds remaining balance of ${Number(error.remaining).toFixed(2)}` });
        }
        if (error.message === 'FULL_CREDIT_BALANCE_REQUIRED') {
            return res.status(400).json({ error: 'Use the full outstanding balance when extending existing credit' });
        }
        console.error('Error submitting staff Out Bill payment:', error);
        return res.status(500).json({ error: 'Unable to submit payment' });
    }
};

export const getCollections = async (req, res) => {
    try {
        const fromDate = String(req.query.from || '').trim();
        const toDate = String(req.query.to || '').trim();
        if ((fromDate && !isIsoDate(fromDate)) || (toDate && !isIsoDate(toDate)) || (fromDate && toDate && fromDate > toDate)) {
            return res.status(400).json({ error: 'Enter a valid date range' });
        }
        return res.status(200).json(await StaffPortalModel.getCollections(req.staffId, { fromDate, toDate }));
    } catch (error) {
        console.error('Error fetching staff collections:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

/* ---------- Purchase requisitions ---------- */

const ROUTE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'CNF'];

/**
 * Lets the existing web requisition/stock controllers serve the staff app:
 * they expect `req.user` shaped like a web staff session, scoped to this staff member.
 */
export async function asWebStaffUser(req, res, next) {
    try {
        const profile = await StaffPortalModel.getProfile(req.staffId);
        if (!profile) return res.status(401).json({ error: 'This staff account is inactive. Contact your administrator.' });
        const companyIds = String(profile.company_ids || '')
            .split(',')
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0);
        req.user = {
            id: req.staffId,
            staffId: req.staffId,
            role: 'staff',
            staffType: profile.staff_type || 'distributor',
            companyIds,
        };
        req.staffProfile = profile;
        return next();
    } catch (error) {
        console.error('Error preparing staff requisition session:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

export const getRequisitionOptions = async (req, res) => {
    try {
        const outlets = await StaffModel.getAllCountersForStaff(req.staffId);
        const companies = await StaffPortalModel.getCompanies(req.user.companyIds);
        return res.status(200).json({
            sellerType: req.user.staffType,
            companies,
            days: ROUTE_DAYS.filter((day) => outlets.some((outlet) => outlet.day === day)),
            outlets: outlets.map((outlet) => ({
                id: outlet.id,
                day: outlet.day,
                outlet_name: outlet.outlet_name,
                outlet_erp_id: outlet.outlet_erp_id,
                location_name: outlet.location_name,
                contact_number: outlet.contact_number,
                has_gst: outlet.has_gst,
            })),
        });
    } catch (error) {
        console.error('Error fetching staff requisition options:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

/** Forces the staff member's own seller type; everything else is validated by the shared controller. */
export function prepareRequisitionBody(req, _res, next) {
    req.body = {
        ...req.body,
        sellerType: req.user.staffType,
        staffId: req.staffId,
    };
    next();
}

/* ---------- Outlets (area-wise) ---------- */

function readOutletId(req, res) {
    const outletId = Number(req.params.outletId);
    if (!Number.isInteger(outletId) || outletId <= 0) {
        res.status(400).json({ error: 'Invalid outlet' });
        return null;
    }
    return outletId;
}

export const getOutlets = async (req, res) => {
    try {
        return res.status(200).json(await StaffPortalModel.getOutlets(req.staffId));
    } catch (error) {
        console.error('Error fetching staff outlets:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateOutletLocation = async (req, res) => {
    try {
        const outletId = readOutletId(req, res);
        if (!outletId) return undefined;
        const rawLatitude = req.body?.latitude;
        const rawLongitude = req.body?.longitude;
        const latitude = Number(rawLatitude);
        const longitude = Number(rawLongitude);
        const valid = (raw, value, limit) => ['number', 'string'].includes(typeof raw)
            && String(raw).trim() !== ''
            && Number.isFinite(value)
            && Math.abs(value) <= limit;
        if (!valid(rawLatitude, latitude, 90)) return res.status(400).json({ error: 'latitude must be between -90 and 90' });
        if (!valid(rawLongitude, longitude, 180)) return res.status(400).json({ error: 'longitude must be between -180 and 180' });
        if (latitude === 0 && longitude === 0) return res.status(400).json({ error: 'The phone did not return a valid location. Try again outdoors.' });

        const googleLocation = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
        const outlet = await StaffPortalModel.updateOutletLocation(req.staffId, outletId, googleLocation);
        if (!outlet) return res.status(404).json({ error: 'Outlet not found in your outlet list' });
        return res.status(200).json({ message: 'Outlet location updated', outlet });
    } catch (error) {
        console.error('Error updating staff outlet location:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateOutletContact = async (req, res) => {
    try {
        const outletId = readOutletId(req, res);
        if (!outletId) return undefined;
        const contactNumber = typeof req.body?.contactNumber === 'string' ? req.body.contactNumber.trim() : '';
        if (!/^\d{10,15}$/.test(contactNumber)) {
            return res.status(400).json({ error: 'Enter a contact number with 10 to 15 digits' });
        }
        const outlet = await StaffPortalModel.updateOutletContact(req.staffId, outletId, contactNumber);
        if (!outlet) return res.status(404).json({ error: 'Outlet not found in your outlet list' });
        return res.status(200).json({ message: 'Outlet contact number updated', outlet });
    } catch (error) {
        console.error('Error updating staff outlet contact:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getCancellations = async (req, res) => {
    try {
        const range = req.query.scope === 'all' ? OVERALL_RANGE : readDateRange(req.query);
        if (range.error) return res.status(400).json({ error: range.error });
        return res.status(200).json(await StaffPortalModel.getCancellations(req.staffId, range));
    } catch (error) {
        console.error('Error fetching staff cancellations:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const getCreditByOutlet = async (req, res) => {
    try {
        return res.status(200).json(await StaffPortalModel.getCreditByOutlet(req.staffId));
    } catch (error) {
        console.error('Error fetching staff outlet credit:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
