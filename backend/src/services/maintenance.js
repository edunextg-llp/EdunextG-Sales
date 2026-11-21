import crypto from 'crypto';
import db from '../config/db.js';
import { createSharedStore } from '../utils/sharedStore.js';
import { getOtpMailUser, getOtpTransporter, maskEmail } from './adminLoginOtp.js';

// Maintenance mode: one switch for the whole site, stored in app_settings.
//   status 1 = working (default), status 0 = under maintenance.
// While it is 0 every API answers 503 { code: 'MAINTENANCE' } except /api/maintenance, and the
// main site / Sales & Purchase show a maintenance screen. It is switched from Postman:
//   1. POST /api/maintenance/request-otp  { loginId, password }   -> OTP mailed to MAINTENANCE_OTP_MAIL_TO
//   2. POST /api/maintenance/status       { otpSessionId, otp, status: 0 | 1, message? }

const STATUS_KEY = 'maintenance_status';
const MESSAGE_KEY = 'maintenance_message';
export const DEFAULT_MESSAGE = 'The server is under maintenance. Please try again after some time.';

// Read at most every few seconds, so a busy site doesn't hit the database on every request.
const CACHE_MS = 5000;
let cache = null; // { status, message, updatedAt, readAt }

export async function getMaintenance({ fresh = false } = {}) {
    if (!fresh && cache && Date.now() - cache.readAt < CACHE_MS) return cache;
    try {
        const [rows] = await db.execute(
            `SELECT setting_key, setting_value, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
             FROM app_settings WHERE setting_key IN (?, ?)`,
            [STATUS_KEY, MESSAGE_KEY]
        );
        const byKey = Object.fromEntries(rows.map((row) => [row.setting_key, row]));
        cache = {
            status: byKey[STATUS_KEY]?.setting_value === '0' ? 0 : 1,
            message: byKey[MESSAGE_KEY]?.setting_value || DEFAULT_MESSAGE,
            updatedAt: byKey[STATUS_KEY]?.updated_at || null,
            readAt: Date.now(),
        };
    } catch (error) {
        // Can't read the switch (e.g. database down): keep the last known state, else "working".
        console.error('Maintenance status read failed:', error.message);
        if (!cache) return { status: 1, message: DEFAULT_MESSAGE, updatedAt: null, readAt: 0 };
    }
    return cache;
}

export async function setMaintenance(status, message, updatedBy) {
    const value = Number(status) === 0 ? '0' : '1';
    const text = String(message || '').trim().slice(0, 1000) || DEFAULT_MESSAGE;
    await db.execute(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?), (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [STATUS_KEY, value, updatedBy, MESSAGE_KEY, text, updatedBy]
    );
    return getMaintenance({ fresh: true });
}

// Express middleware for /api: 503 while under maintenance (the maintenance routes are mounted before it).
export async function maintenanceGuard(req, res, next) {
    const state = await getMaintenance();
    if (state.status === 1) return next();
    res.set('X-Maintenance', '1');
    res.set('Retry-After', '300');
    return res.status(503).json({ code: 'MAINTENANCE', maintenance: true, status: 0, error: state.message, message: state.message });
}

// ---- OTP for switching (sent to its own address, MAINTENANCE_OTP_MAIL_TO in backend/.env) ----
export const MAINTENANCE_OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
// otpSessionId -> { adminId, adminEmail, otpHash (hex), expiresAt, attempts }; shared by all cluster workers.
const otpStore = createSharedStore('maintenanceOtp');

const hashOtp = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const otpMatches = (code, otpHash) => crypto.timingSafeEqual(Buffer.from(hashOtp(code), 'hex'), Buffer.from(otpHash, 'hex'));

export function maintenanceOtpRecipient() {
    return String(process.env.MAINTENANCE_OTP_MAIL_TO || '').trim();
}

export async function createMaintenanceOtp({ adminId, adminEmail, wantedStatus }) {
    const to = maintenanceOtpRecipient();
    if (!to) {
        throw Object.assign(new Error('MAINTENANCE_OTP_MAIL_TO is not set in backend/.env.'), { statusCode: 500 });
    }
    await otpStore.deleteWhere('adminId', adminId); // one live OTP per admin
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const minutes = MAINTENANCE_OTP_TTL_MS / 60000;
    const transporter = await getOtpTransporter();
    const action = wantedStatus === 0 ? 'turn ON maintenance (site goes offline)'
        : wantedStatus === 1 ? 'turn OFF maintenance (site comes back)'
            : 'change the maintenance mode';
    await transporter.sendMail({
        from: `"EduNextG Server" <${getOtpMailUser()}>`,
        to,
        subject: `Maintenance mode OTP: ${code}`,
        text: [
            `Admin ${adminEmail} asked to ${action}.`,
            '',
            `OTP: ${code}`,
            '',
            `It expires in ${minutes} minutes. If this was not you, change the admin password.`,
        ].join('\n'),
        html: `
            <div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b">
                <p>Admin <strong>${adminEmail}</strong> asked to ${action}.</p>
                <p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:16px 0">${code}</p>
                <p>It expires in <strong>${minutes} minutes</strong>.</p>
                <p style="color:#64748b">If this was not you, change the admin password.</p>
            </div>`,
    });
    const otpSessionId = crypto.randomUUID();
    await otpStore.set(otpSessionId, {
        adminId, adminEmail, otpHash: hashOtp(code), expiresAt: Date.now() + MAINTENANCE_OTP_TTL_MS, attempts: 0,
    }, MAINTENANCE_OTP_TTL_MS);
    return { otpSessionId, sentTo: maskEmail(to) };
}

export async function verifyMaintenanceOtp(otpSessionId, otp) {
    const id = String(otpSessionId || '');
    const entry = await otpStore.get(id);
    if (!entry) return { ok: false, error: 'OTP expired or not requested. Call request-otp again.' };
    const code = String(otp || '').trim();
    const matches = /^\d{6}$/.test(code) && otpMatches(code, entry.otpHash);
    if (!matches) {
        entry.attempts += 1;
        if (entry.attempts >= OTP_MAX_ATTEMPTS) {
            await otpStore.delete(id);
            return { ok: false, error: 'Too many wrong OTPs. Call request-otp again.' };
        }
        await otpStore.set(id, entry, Math.max(entry.expiresAt - Date.now(), 1));
        return { ok: false, error: `Incorrect OTP. ${OTP_MAX_ATTEMPTS - entry.attempts} attempt(s) left.` };
    }
    await otpStore.delete(id); // one use
    return { ok: true, adminId: entry.adminId, adminEmail: entry.adminEmail };
}
