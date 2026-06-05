import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import staffRoutes from './routes/staffRoutes.js';
import deliveryBoyRoutes from './routes/deliveryBoyRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { verifyTokenMiddleware } from './middlewares/authMiddleware.js';
import rateLimit from 'express-rate-limit';

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rate Limiters
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per `window`
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

// Apply general API rate limiting
app.use('/api/', globalLimiter);

// Routes
app.use('/api/auth', authRoutes);

// Protected Routes
app.use('/api/staff', verifyTokenMiddleware, staffRoutes);
app.use('/api/delivery-boy', verifyTokenMiddleware, deliveryBoyRoutes);

// Basic health check
app.get('/', (req, res) => {
    res.send('Outlet ERP Backend is running');
});

export default app;
