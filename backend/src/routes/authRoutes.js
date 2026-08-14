import express from 'express';
import rateLimit from 'express-rate-limit';
import { getCaptcha, login, refreshToken, register, updateAdminCredentials, verifyTokenCtrl } from '../controllers/authController.js';
import { requireRole, verifyTokenMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

const captchaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Too many CAPTCHA requests. Please try again later.' },
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.get('/captcha', captchaLimiter, getCaptcha);
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshToken);
router.put('/admin/credentials', verifyTokenMiddleware, requireRole('admin'), updateAdminCredentials);
router.post('/register', register);
// Route to test token validity
router.get('/verify', verifyTokenMiddleware, verifyTokenCtrl);

export default router;
