import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import staffRoutes from './routes/staffRoutes.js';
import deliveryBoyRoutes from './routes/deliveryBoyRoutes.js';
import chalanRoutes from './routes/chalanRoutes.js';
import authRoutes from './routes/authRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import { auditStaffChanges } from './middlewares/auditMiddleware.js';
import {
    enforceManagedUserApiScope,
    enforceStaffApiScope,
    requireAnyPermission,
    requireRole,
    verifyTokenMiddleware,
} from './middlewares/authMiddleware.js';
import rateLimit from 'express-rate-limit';

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rate Limiters
const globalLimiter = rateLimit({
    windowMs: 3 * 60 * 1000, // 15 minutes
    max: 200000, // Limit each IP to 200 requests per `window`
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

// Apply general API rate limiting
app.use('/api/', globalLimiter);

// Routes
app.use('/api/auth', authRoutes);

// Protected Routes
app.use(
    '/api/staff',
    verifyTokenMiddleware,
    auditStaffChanges,
    enforceStaffApiScope,
    enforceManagedUserApiScope,
    staffRoutes
);
app.use('/api/audit-logs', verifyTokenMiddleware, requireRole('admin'), auditRoutes);
app.use('/api/delivery-boy', deliveryBoyRoutes);
app.use('/api/chalan', verifyTokenMiddleware, requireAnyPermission(
    'chalan_add_sales', 'chalan_packaging', 'chalan_delivery', 'chalan_delivered', 'chalan_return'
), chalanRoutes);

// Basic health check
app.get('/', (req, res) => {
    res.send('Outlet ERP Backend is running');
});

export default app;
