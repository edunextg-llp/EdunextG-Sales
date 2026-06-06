import express from 'express';
const router = express.Router();
import * as staffController from '../controllers/staffController.js';

router.post('/', staffController.createStaff);
router.get('/', staffController.getStaff);
router.get('/search', staffController.searchStaff);
router.get('/credits/pending', staffController.getPendingCredits);
router.get('/sales/by-date', staffController.getAllSalesByDate);
router.get('/reports', staffController.getReports);
router.get('/:id', staffController.getStaffFullDetails);
router.put('/:id', staffController.updateStaff);
router.get('/:id/locations', staffController.getStaffLocations);
router.get('/:id/outlets-by-date', staffController.getOutletsByStaffAndDate);
router.get('/:id/all-counters', staffController.getAllOutletsForStaff);
router.get('/:id/outlets-by-day', staffController.getOutletsByStaffAndDayName);
router.post('/:id/counters', staffController.addCounter);
router.post('/:id/sales', staffController.recordSales);
router.get('/:id/sales-by-date', staffController.fetchSalesByDate);
router.put('/counter/:counterId', staffController.editCounter);
router.delete('/counter/:counterId', staffController.deleteCounter);
router.put('/sales/:saleId/payment', staffController.updatePaymentMode);
router.get('/sales/:saleId/payments', staffController.getSalePayments);
router.get('/sales/:saleId/status-history', staffController.getSaleStatusHistory);
router.post('/sales/:saleId/payments', staffController.addSalePayment);

router.put('/sales/:saleId/payments/:paymentId', staffController.editSalePayment);

router.put('/sales/:saleId', staffController.updateSale);
router.delete('/sales/:saleId', staffController.deleteSale);
router.put('/sales/:saleId/packaging', staffController.updatePackagingStatus);

export default router;
