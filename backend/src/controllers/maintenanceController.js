import bcrypt from 'bcryptjs';
import UserModel from '../models/userModel.js';
import { createSharedStore } from '../utils/sharedStore.js';
import {
    MAINTENANCE_OTP_TTL_MS,
    createMaintenanceOtp,
    getMaintenance,
    setMaintenance,
    verifyMaintenanceOtp,
} from '../services/maintenance.js';

// Wrong admin passwords on request-otp: at most 5 per IP per 15 minutes.
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_LIMIT = 5;
const failures = createSharedStore('maintenanceLoginFailures'); // ip -> { count, firstAt }
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
const tooManyFailures = async (ip) => {
    const entry = await failures.get(ip); // expires FAIL_WINDOW_MS after the first failure
    return Boolean(entry) && entry.count >= FAIL_LIMIT;
};
const recordFailure = async (ip) => {
    const entry = await failures.get(ip);
    if (!entry) return failures.set(ip, { count: 1, firstAt: Date.now() }, FAIL_WINDOW_MS);
    entry.count += 1;
    return failures.set(ip, entry, Math.max(entry.firstAt + FAIL_WINDOW_MS - Date.now(), 1));
};

const readStatus = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return n === 0 || n === 1 ? n : NaN;
};

// GET /api/maintenance/status (public): the websites poll this.
export const getStatus = async (req, res) => {
    const state = await getMaintenance();
    res.set('Cache-Control', 'no-store');
    return res.json({
        status: state.status,
        maintenance: state.status === 0,
        message: state.status === 0 ? state.message : '',
        updatedAt: state.updatedAt,
    });
};

// POST /api/maintenance/request-otp { loginId, password, status? }
// Checks the admin Login ID / password and mails a 6-digit OTP to MAINTENANCE_OTP_MAIL_TO.
export const requestOtp = async (req, res) => {
    const ip = ipOf(req);
    try {
        if (await tooManyFailures(ip)) {
            return res.status(429).json({ error: 'Too many wrong attempts. Try again after 15 minutes.' });
        }
        const loginId = String(req.body?.loginId || req.body?.email || '').trim();
        const password = String(req.body?.password || '');
        if (!loginId || !password) return res.status(400).json({ error: 'loginId and password are required.' });
        const wantedStatus = readStatus(req.body?.status);
        if (Number.isNaN(wantedStatus)) return res.status(400).json({ error: 'status must be 0 or 1.' });

        const admin = await UserModel.findByEmail(loginId);
        if (!admin || !await bcrypt.compare(password, admin.password)) {
            await recordFailure(ip);
            return res.status(401).json({ error: 'Wrong admin Login ID or password.' });
        }
        await failures.delete(ip);

        const { otpSessionId, sentTo } = await createMaintenanceOtp({
            adminId: admin.id, adminEmail: admin.email, wantedStatus,
        });
        return res.json({
            message: `OTP sent to ${sentTo}. Send it to POST /api/maintenance/status with status 0 (maintenance) or 1 (working).`,
            otpSessionId,
            sentTo,
            expiresInSeconds: MAINTENANCE_OTP_TTL_MS / 1000,
        });
    } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
        console.error('Maintenance OTP failed:', error);
        return res.status(502).json({ error: 'Could not send the OTP email. Please try again later.' });
    }
};

// POST /api/maintenance/status { otpSessionId, otp, status: 0 | 1, message? }
// 0 = under maintenance (every other API answers 503), 1 = working.
export const updateStatus = async (req, res) => {
    try {
        const status = readStatus(req.body?.status);
        if (status === null || Number.isNaN(status)) return res.status(400).json({ error: 'status must be 0 (maintenance) or 1 (working).' });
        if (!req.body?.otpSessionId || !req.body?.otp) return res.status(400).json({ error: 'otpSessionId and otp are required.' });

        const check = await verifyMaintenanceOtp(req.body.otpSessionId, req.body.otp);
        if (!check.ok) return res.status(401).json({ error: check.error });

        const state = await setMaintenance(status, req.body?.message, check.adminEmail);
        console.log(`Maintenance mode ${state.status === 0 ? 'ON (site offline)' : 'OFF (site working)'} by ${check.adminEmail}`);
        return res.json({
            message: state.status === 0
                ? 'Maintenance is ON. The websites now show the maintenance screen.'
                : 'Maintenance is OFF. Everything works again.',
            status: state.status,
            maintenance: state.status === 0,
            maintenanceMessage: state.status === 0 ? state.message : '',
            updatedBy: check.adminEmail,
        });
    } catch (error) {
        console.error('Maintenance status update failed:', error);
        return res.status(500).json({ error: 'Could not update the maintenance status.' });
    }
};
