import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import UserModel from '../models/userModel.js';
import StaffModel from '../models/staffModel.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';

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
            tokenPayload = { id: admin.id, email: admin.email, role: 'admin' };
            user = {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                role: 'admin',
            };
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
                const permissionKeys = [
                    'dashboard', 'dms', 'add_seller', 'add_item', 'item_list',
                    'update_payment', 'bank_deposit', 'add_outlet', 'add_sales', 'out_bill',
                ];
                const permissions = permissionKeys.filter((key) => Boolean(deliveryUser[`can_${key}`]));
                const role = deliveryUser.role === 'packaging_staff' ? 'packaging_staff' : 'delivery_boy';
                tokenPayload = {
                    id: deliveryUser.id,
                    deliveryBoyId: deliveryUser.id,
                    loginId: deliveryUser.delivery_login_id,
                    role,
                    permissions,
                };
                user = {
                    id: deliveryUser.id,
                    deliveryBoyId: deliveryUser.id,
                    username: deliveryUser.name,
                    loginId: deliveryUser.delivery_login_id,
                    role,
                    permissions,
                };
            }
        }
        const token = jwt.sign(
            tokenPayload,
            JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
        );
        const refreshToken = jwt.sign(
            tokenPayload,
            JWT_REFRESH_SECRET,
            { expiresIn: rememberMe ? REMEMBER_REFRESH_TOKEN_EXPIRES_IN : SESSION_REFRESH_TOKEN_EXPIRES_IN }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            refreshToken,
            expiresIn: ACCESS_TOKEN_EXPIRES_IN,
            refreshExpiresIn: rememberMe ? REMEMBER_REFRESH_TOKEN_EXPIRES_IN : SESSION_REFRESH_TOKEN_EXPIRES_IN,
            user,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const refreshToken = async (req, res) => {
    try {
        const { refreshToken: providedRefreshToken } = req.body;

        if (!providedRefreshToken) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        const decoded = jwt.verify(providedRefreshToken, JWT_REFRESH_SECRET);
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
                permissions: decoded.permissions,
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
                permissions: decoded.permissions || [],
            }
        });
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired refresh token.' });
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
