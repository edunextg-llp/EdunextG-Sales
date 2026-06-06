import express from 'express';
const router = express.Router();
import * as deliveryBoyController from '../controllers/deliveryBoyController.js';

router.post('/', deliveryBoyController.createDeliveryBoy);
router.get('/companies', deliveryBoyController.getStaffAssignedCompanies);
router.get('/', deliveryBoyController.getDeliveryBoys);

export default router;
