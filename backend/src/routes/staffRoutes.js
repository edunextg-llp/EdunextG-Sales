import express from 'express';
const router = express.Router();
import * as staffController from '../controllers/staffController.js';

router.post('/', staffController.createStaff);
router.get('/', staffController.getStaff);
router.get('/search', staffController.searchStaff);
router.get('/:id', staffController.getStaffFullDetails);
router.put('/:id', staffController.updateStaff);
router.get('/:id/locations', staffController.getStaffLocations);
router.get('/:id/outlets-by-date', staffController.getOutletsByStaffAndDate);
router.post('/:id/counters', staffController.addCounter);
router.post('/:id/sales', staffController.recordSales);

export default router;
