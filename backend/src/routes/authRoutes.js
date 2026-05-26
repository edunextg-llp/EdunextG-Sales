import express from 'express';
import { login, register, verifyTokenCtrl } from '../controllers/authController.js';
import { verifyTokenMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
// Route to test token validity
router.get('/verify', verifyTokenMiddleware, verifyTokenCtrl);

export default router;
