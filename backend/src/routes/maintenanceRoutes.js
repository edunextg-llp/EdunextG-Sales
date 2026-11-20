import express from 'express';
import { getStatus, requestOtp, updateStatus } from '../controllers/maintenanceController.js';

// /api/maintenance: always reachable, even while the site is under maintenance.
const router = express.Router();

router.get('/status', getStatus);
router.post('/request-otp', requestOtp);
router.post('/status', updateStatus);

export default router;
