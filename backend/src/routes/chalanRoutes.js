import express from 'express';
import * as chalanController from '../controllers/chalanController.js';

const router = express.Router();

router.post('/sales', chalanController.createChalanSale);
router.get('/sales', chalanController.getChalanSalesByDate);
router.get('/sales/packaging', chalanController.getChalanPackagingSales);
router.get('/sales/cancelled', chalanController.getChalanCancelledSales);
router.get('/sales/:id/status-history', chalanController.getChalanSaleStatusHistory);
router.put('/sales/:id/packaging', chalanController.updateChalanPackagingStatus);
router.get('/sales/:id', chalanController.getChalanSale);
router.put('/sales/:id', chalanController.updateChalanSale);
router.delete('/sales/:id', chalanController.deleteChalanSale);

export default router;
