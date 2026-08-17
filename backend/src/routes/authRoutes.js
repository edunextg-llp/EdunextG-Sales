import express from 'express';
import { getCaptcha, login, refreshToken, register, updateAdminCredentials, verifyTokenCtrl } from '../controllers/authController.js';
import { requireRole, verifyTokenMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/captcha', getCaptcha);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.put('/admin/credentials', verifyTokenMiddleware, requireRole('admin'), updateAdminCredentials);
router.post('/register', register);
// Route to test token validity
router.get('/verify', verifyTokenMiddleware, verifyTokenCtrl);

export default router;
