import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import UserModel from '../models/userModel.js';
import StaffModel from '../models/staffModel.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import { PERMISSION_KEYS } from '../utils/permissionKeys.js';
import {
    OTP_RESEND_COOLDOWN_MS,
    OTP_TTL_MS,
    createAdminOtp,
    maskEmail,
    resendAdminOtp,
    verifyAdminOtp,
} from '../services/adminLoginOtp.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}_refresh`;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_CHARS = 'abcdefghkmnpqrstuvwxyzABCDEFGHKMNPQRSTUVWXYZ123456789';
const CAPTCHA_LENGTH = 6;
const captchaStore = new Map();

const ACCESS_TOKEN_EXPIRES_IN = '15m';
const SESSION_REFRESH_TOKEN_EXPIRES_IN = '7h';
const REMEMBER_REFRESH_TOKEN_EXPIRES_IN = '30d';

function cleanupExpiredCaptchas() {
    const now = Date.now();
    for (const [id, captcha] of captchaStore.entries()) {
        if (captcha.expiresAt <= now) {
            captchaStore.delete(id);
        }
    }
}

function createCaptchaChallenge() {
    cleanupExpiredCaptchas();

    let code = '';
    for (let i = 0; i < CAPTCHA_LENGTH; i++) {
        code += CAPTCHA_CHARS[crypto.randomInt(0, CAPTCHA_CHARS.length)];
    }

    const id = crypto.randomUUID();

    captchaStore.set(id, {
        answer: code,
        expiresAt: Date.now() + CAPTCHA_TTL_MS,
    });

    return {
        captchaId: id,
        question: code,
        expiresInSeconds: CAPTCHA_TTL_MS / 1000,
    };
}

function verifyCaptcha(captchaId, captchaAnswer) {
    cleanupExpiredCaptchas();

    if (!captchaId || captchaAnswer == null) {
        return false;
    }

    const captcha = captchaStore.get(captchaId);
    captchaStore.delete(captchaId);

    if (!captcha) {
        return false;
    }

    return String(captchaAnswer).trim() === captcha.answer;
}

function adminSession(admin) {
    return {
        tokenPayload: { id: admin.id, email: admin.email, role: 'admin', tv: Number(admin.token_version) || 0 },
        user: {
            id: admin.id,
            username: admin.username,
            email: admin.email,
            role: 'admin',
        },
    };
}

function sendLoginTokens(res, tokenPayload, user, rememberMe) {
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
    const refreshExpiresIn = rememberMe ? REMEMBER_REFRESH_TOKEN_EXPIRES_IN : SESSION_REFRESH_TOKEN_EXPIRES_IN;
    const refreshToken = jwt.sign(tokenPayload, JWT_REFRESH_SECRET, { expiresIn: refreshExpiresIn });

    return res.status(200).json({
        message: 'Login successful',
        token,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        refreshExpiresIn,
        user,
    });
}

export const getCaptcha = (req, res) => {
    res.status(200).json(createCaptchaChallenge());
};

export const login = async (req, res) => {
    try {
        const { email, loginId, password, captchaId, captchaAnswer, rememberMe = false } = req.body;
        const identifier = String(loginId || email || '').trim();

        if (!identifier || !password) {
            return res.status(400).json({ error: 'Login ID/email and password are required' });
        }

        if (!verifyCaptcha(captchaId, captchaAnswer)) {
            return res.status(400).json({ error: 'Invalid or expired CAPTCHA. Please try again.' });
        }

        const admin = await UserModel.findByEmail(identifier);
        let tokenPayload;
        let user;

        if (admin && await bcrypt.compare(password, admin.password)) {
            // Admins must confirm a one-time password sent to their email
            // before any token is issued.
            let otpSessionId;
            let otpEmail;
            try {
                ({ otpSessionId, email: otpEmail } = await createAdminOtp({ adminId: admin.id, email: admin.email, rememberMe }));
            } catch (mailError) {
                console.error('Failed to send admin login OTP:', mailError);
                return res.status(502).json({ error: 'Could not send the OTP email. Please try again later.' });
            }
            return res.status(200).json({
                otpRequired: true,
                otpSessionId,
                email: maskEmail(otpEmail),
                expiresInSeconds: OTP_TTL_MS / 1000,
                resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
            });
        } else {
            const staff = await StaffModel.findByLoginId(identifier);
            const validStaff = staff
                && Number(staff.is_active) === 1
                && staff.password_hash
                && await bcrypt.compare(password, staff.password_hash);
            if (validStaff) {
                const companyIds = String(staff.company_ids || '')
                    .split(',')
                    .map(Number)
                    .filter((id) => Number.isInteger(id) && id > 0);
                const companyNames = String(staff.company_names || '')
                    .split(',')
                    .map((name) => name.trim())
                    .filter(Boolean);
                tokenPayload = {
                    id: staff.id,
                    staffId: staff.id,
                    loginId: staff.login_id,
                    role: 'staff',
                    staffType: staff.staff_type,
                    companyIds,
                };
                user = {
                    id: staff.id,
                    staffId: staff.id,
                    username: staff.name,
                    loginId: staff.login_id,
                    role: 'staff',
                    staffType: staff.staff_type,
                    companies: companyIds.map((id, index) => ({
                        id,
                        name: companyNames[index] || `Company ${id}`,
                        type: staff.staff_type,
                    })),
                };
            } else {
                const deliveryUser = await DeliveryBoyModel.getByLogin(identifier, password);
                if (!deliveryUser) {
                    return res.status(401).json({ error: 'Invalid login ID/email or password' });
                }
                const permissions = PERMISSION_KEYS.filter((key) => Boolean(deliveryUser[`can_${key}`]));
                const role = deliveryUser.role === 'packaging_staff' ? 'packaging_staff' : 'delivery_boy';
                tokenPayload = {
                    id: deliveryUser.id,
                    deliveryBoyId: deliveryUser.id,
                    loginId: deliveryUser.delivery_login_id,
                    role,
                    permissions,
                    companyIds: String(deliveryUser.company_ids || deliveryUser.company_id || '')
                        .split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0),
                };
                user = {
                    id: deliveryUser.id,
                    deliveryBoyId: deliveryUser.id,
                    username: deliveryUser.name,
                    loginId: deliveryUser.delivery_login_id,
                    role,
                    permissions,
                    companies: String(deliveryUser.company_ids || deliveryUser.company_id || '')
                        .split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0)
                        .map((id) => ({ id })),
                };
            }
        }
        return sendLoginTokens(res, tokenPayload, user, rememberMe);
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verifyLoginOtp = async (req, res) => {
    try {
        const { otpSessionId, otp } = req.body;
        if (!otpSessionId || !otp) {
            return res.status(400).json({ error: 'OTP is required.' });
        }

        const result = verifyAdminOtp(otpSessionId, otp);
        if (!result.ok) {
            return res.status(401).json({ error: result.error });
        }

        const admin = await UserModel.findById(result.adminId);
        if (!admin) {
            return res.status(401).json({ error: 'Admin account not found. Please sign in again.' });
        }

        const { tokenPayload, user } = adminSession(admin);
        return sendLoginTokens(res, tokenPayload, user, result.rememberMe);
    } catch (error) {
        console.error('OTP verification error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const resendLoginOtp = async (req, res) => {
    try {
        const { otpSessionId } = req.body;
        if (!otpSessionId) {
            return res.status(400).json({ error: 'OTP session is required.' });
        }

        const result = await resendAdminOtp(otpSessionId);
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.json({
            message: 'A new OTP has been sent.',
            email: maskEmail(result.email),
            expiresInSeconds: OTP_TTL_MS / 1000,
            resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
        });
    } catch (error) {
        console.error('Failed to resend admin login OTP:', error);
        return res.status(502).json({ error: 'Could not send the OTP email. Please try again later.' });
    }
};

export const refreshToken = async (req, res) => {
    try {
        const { refreshToken: providedRefreshToken } = req.body;

        if (!providedRefreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        const decoded = jwt.verify(providedRefreshToken, JWT_REFRESH_SECRET);

        let tv;
        if (decoded.role === 'admin') {
            const currentVersion = await UserModel.getTokenVersion(decoded.id);
            if (currentVersion === null || Number(decoded.tv ?? 0) !== currentVersion) {
                return res.status(401).json({ error: 'Session has been logged out. Please sign in again.' });
            }
            tv = currentVersion;
        }

        // Packaging Staff / Delivery Boy: pick up permission changes made since login.
        let { permissions } = decoded;
        if (['packaging_staff', 'delivery_boy'].includes(decoded.role) && decoded.deliveryBoyId) {
            const current = await DeliveryBoyModel.getCurrentPermissions(decoded.deliveryBoyId);
            if (!current?.isActive) {
                return res.status(401).json({ error: 'This account is inactive. Please contact the admin.' });
            }
            permissions = current.permissions;
        }

        const token = jwt.sign(
            {
                id: decoded.id,
                email: decoded.email,
                role: decoded.role,
                staffId: decoded.staffId,
                loginId: decoded.loginId,
                staffType: decoded.staffType,
                companyIds: decoded.companyIds,
                deliveryBoyId: decoded.deliveryBoyId,
                permissions,
                tv,
            },
            JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
        );

        res.status(200).json({
            message: 'Token refreshed successfully',
            token,
            expiresIn: ACCESS_TOKEN_EXPIRES_IN,
            user: {
                id: decoded.id,
                email: decoded.email,
                role: decoded.role,
                staffId: decoded.staffId,
                loginId: decoded.loginId,
                staffType: decoded.staffType,
                companyIds: decoded.companyIds,
                deliveryBoyId: decoded.deliveryBoyId,
                permissions: permissions || [],
            }
        });
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }
};

export const updateAdminCredentials = async (req, res) => {
    try {
        const adminId = Number(req.user?.id);
        const loginId = String(req.body.loginId || '').trim().toLowerCase();
        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = String(req.body.newPassword || '');

        if (!Number.isInteger(adminId) || adminId <= 0) {
            return res.status(401).json({ error: 'Invalid admin session.' });
        }
        if (!/^\S+@\S+\.\S+$/.test(loginId)) {
            return res.status(400).json({ error: 'Enter a valid email address for the Login ID.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters.' });
        }

        const admin = await UserModel.findById(adminId);
        if (!admin || !await bcrypt.compare(currentPassword, admin.password)) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
        }

        const existingAdmin = await UserModel.findByEmail(loginId);
        if (existingAdmin && Number(existingAdmin.id) !== adminId) {
            return res.status(409).json({ error: 'That Login ID is already in use.' });
        }

        await UserModel.updateCredentials(adminId, loginId, await bcrypt.hash(newPassword, 10));
        return res.json({ message: 'Admin Login ID and password updated successfully.' });
    } catch (error) {
        console.error('Error updating admin credentials:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const logoutAllDevices = async (req, res) => {
    try {
        const adminId = Number(req.user?.id);
        if (!Number.isInteger(adminId) || adminId <= 0) {
            return res.status(401).json({ error: 'Invalid admin session.' });
        }

        await UserModel.incrementTokenVersion(adminId);
        return res.json({ message: 'Logged out from all devices.' });
    } catch (error) {
        console.error('Error logging out admin from all devices:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        // Check if admin already exists
        const existingAdmin = await UserModel.findByEmail(email);
        if (existingAdmin) {
            return res.status(409).json({ error: 'An admin with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const insertId = await UserModel.createAdmin(username, email, hashedPassword);

        res.status(201).json({
            message: 'Registration successful',
            user: { id: insertId, username, email }
        });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email or username already exists' });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const verifyTokenCtrl = (req, res) => {
    res.status(200).json({ valid: true, user: req.user });
};
