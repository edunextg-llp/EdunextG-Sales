import express from 'express';
import {
    getCaptcha,
    login,
    logoutAllDevices,
    refreshToken,
    register,
    resendLoginOtp,
    updateAdminCredentials,
    verifyLoginOtp,
    verifyTokenCtrl,
} from '../controllers/authController.js';
import { requireRole, verifyTokenMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/captcha', getCaptcha);
router.post('/login', login);
router.post('/login/verify-otp', verifyLoginOtp);
router.post('/login/resend-otp', resendLoginOtp);
router.post('/refresh', refreshToken);
router.put('/admin/credentials', verifyTokenMiddleware, requireRole('admin'), updateAdminCredentials);
router.post('/admin/logout-all', verifyTokenMiddleware, requireRole('admin'), logoutAllDevices);
router.post('/register', register);
// Route to test token validity
router.get('/verify', verifyTokenMiddleware, verifyTokenCtrl);

export default router;
