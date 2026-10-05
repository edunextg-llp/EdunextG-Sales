import crypto from 'crypto';

// OTP mails go out from their own Gmail account (OTP_MAIL_USER /
// OTP_MAIL_APP_PASSWORD in backend/.env), separate from the bit mails.
let otpTransporterPromise = null;

function getOtpMailUser() {
    return String(process.env.OTP_MAIL_USER || '').trim();
}

async function getOtpTransporter() {
    const user = getOtpMailUser();
    const pass = String(process.env.OTP_MAIL_APP_PASSWORD || '').replace(/\s+/g, '');
    if (!user || !pass) {
        throw new Error('OTP_MAIL_USER / OTP_MAIL_APP_PASSWORD are not set in backend/.env');
    }
    if (!otpTransporterPromise) {
        otpTransporterPromise = import('nodemailer')
            .then(({ default: nodemailer }) => nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: { user, pass },
            }))
            .catch((error) => {
                otpTransporterPromise = null;
                throw error;
            });
    }
    return otpTransporterPromise;
}

// Admin sign-in OTP (second step after password + CAPTCHA).
// Challenges live in memory, like the CAPTCHA store: a backend restart
// simply means the admin signs in again.
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_RESENDS = 5;
const COMPANY_NAME = 'BAWARCHEE FOOD PACKING PVT. LTD.';

const otpStore = new Map();

function hashOtp(code) {
    return crypto.createHash('sha256').update(String(code)).digest();
}

function generateCode() {
    return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

function cleanupExpired() {
    const now = Date.now();
    for (const [id, entry] of otpStore.entries()) {
        if (entry.expiresAt <= now) otpStore.delete(id);
    }
}

export function maskEmail(email) {
    const [name, domain] = String(email || '').split('@');
    if (!domain) return email;
    const visible = name.slice(0, Math.min(2, name.length));
    return `${visible}${'*'.repeat(Math.max(name.length - visible.length, 3))}@${domain}`;
}

async function sendOtpMail(email, code) {
    const transporter = await getOtpTransporter();
    const fromUser = getOtpMailUser();
    const minutes = OTP_TTL_MS / 60000;
    await transporter.sendMail({
        from: `"${COMPANY_NAME}" <${fromUser}>`,
        to: email,
        subject: `Your admin login OTP: ${code}`,
        text: [
            'Your one-time password for admin sign-in is:',
            '',
            code,
            '',
            `It expires in ${minutes} minutes. If you did not try to sign in, change your admin password.`,
        ].join('\n'),
        html: `
            <div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b">
                <p>Your one-time password for admin sign-in is:</p>
                <p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:16px 0">${code}</p>
                <p>It expires in <strong>${minutes} minutes</strong>.</p>
                <p style="color:#64748b">If you did not try to sign in, change your admin password.</p>
            </div>`,
    });
}

// Where the code is delivered: OTP_MAIL_TO if set, otherwise the OTP
// sender inbox (OTP_MAIL_USER), otherwise the admin's own Login ID email.
function getOtpRecipient(adminEmail) {
    return String(process.env.OTP_MAIL_TO || '').trim() || getOtpMailUser() || adminEmail;
}

export async function createAdminOtp({ adminId, email: adminEmail, rememberMe }) {
    cleanupExpired();
    const email = getOtpRecipient(adminEmail);
    // Only one live challenge per admin.
    for (const [id, entry] of otpStore.entries()) {
        if (entry.adminId === adminId) otpStore.delete(id);
    }

    const code = generateCode();
    const otpSessionId = crypto.randomUUID();
    await sendOtpMail(email, code);

    const now = Date.now();
    otpStore.set(otpSessionId, {
        adminId,
        email,
        rememberMe: Boolean(rememberMe),
        otpHash: hashOtp(code),
        expiresAt: now + OTP_TTL_MS,
        attempts: 0,
        resends: 0,
        lastSentAt: now,
    });
    return { otpSessionId, email };
}

export async function resendAdminOtp(otpSessionId) {
    cleanupExpired();
    const entry = otpStore.get(otpSessionId);
    if (!entry) return { ok: false, status: 400, error: 'OTP session expired. Please sign in again.' };

    const waitMs = entry.lastSentAt + OTP_RESEND_COOLDOWN_MS - Date.now();
    if (waitMs > 0) {
        return { ok: false, status: 429, error: `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting a new OTP.` };
    }
    if (entry.resends >= OTP_MAX_RESENDS) {
        otpStore.delete(otpSessionId);
        return { ok: false, status: 429, error: 'Too many OTP requests. Please sign in again.' };
    }

    const code = generateCode();
    await sendOtpMail(entry.email, code);
    const now = Date.now();
    Object.assign(entry, {
        otpHash: hashOtp(code),
        expiresAt: now + OTP_TTL_MS,
        attempts: 0,
        resends: entry.resends + 1,
        lastSentAt: now,
    });
    return { ok: true, email: entry.email };
}

export function verifyAdminOtp(otpSessionId, otp) {
    cleanupExpired();
    const entry = otpStore.get(otpSessionId);
    if (!entry) return { ok: false, error: 'OTP expired. Please sign in again.' };

    const code = String(otp || '').trim();
    const matches = /^\d+$/.test(code) && crypto.timingSafeEqual(hashOtp(code), entry.otpHash);
    if (!matches) {
        entry.attempts += 1;
        if (entry.attempts >= OTP_MAX_ATTEMPTS) {
            otpStore.delete(otpSessionId);
            return { ok: false, error: 'Too many wrong attempts. Please sign in again.' };
        }
        return { ok: false, error: `Incorrect OTP. ${OTP_MAX_ATTEMPTS - entry.attempts} attempt(s) left.` };
    }

    otpStore.delete(otpSessionId);
    return { ok: true, adminId: entry.adminId, rememberMe: entry.rememberMe };
}
