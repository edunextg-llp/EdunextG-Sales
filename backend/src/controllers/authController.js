import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import UserModel from '../models/userModel.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const admin = await UserModel.findByEmail(email);
        if (!admin) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: 'admin' },
            JWT_SECRET,
            { expiresIn: '7h' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            user: { id: admin.id, username: admin.username, email: admin.email }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
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
