import express from 'express';
import multer from 'multer';
const router = express.Router();
import * as staffController from '../controllers/staffController.js';
import * as dmsStockController from '../controllers/dmsStockController.js';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
});

router.post('/', staffController.createStaff);
router.get('/', staffController.getStaff);
router.get('/search', staffController.searchStaff);
router.get('/credits/pending', staffController.getPendingCredits);
router.get('/credits/:paymentId/remarks', staffController.getCreditRemarks);
router.put('/credits/:paymentId/remarks', staffController.updateCreditRemarks);
router.get('/bank-deposits', staffController.getBankDeposits);
router.post('/bank-deposits', staffController.createBankDeposit);
router.get('/bank-deposits/stores', staffController.searchDeliveredStores);
router.get('/bank-deposits/pending-cheques', staffController.searchPendingCheques);
router.get('/bank-deposits/upi-invoices', staffController.searchUpiInvoices);
router.put('/bank-deposits/:depositId', staffController.updateBankDeposit);
router.delete('/bank-deposits/:depositId', staffController.deleteBankDeposit);
router.get('/purchase-sellers', staffController.searchPurchaseSellers);
router.post('/purchase-sellers', staffController.savePurchaseSeller);
router.get('/purchases', staffController.getPurchases);
router.post('/purchases', staffController.createPurchase);
router.put('/purchases/:purchaseId', staffController.updatePurchase);
router.delete('/purchases/:purchaseId', staffController.deletePurchase);
router.get('/purchase-reports', staffController.getPurchaseReports);
router.get('/dms-stock', dmsStockController.getLatestDmsStock);
router.post('/dms-stock/upload', upload.single('file'), dmsStockController.uploadDmsStock);
router.get('/sales/by-date', staffController.getAllSalesByDate);
router.get('/sales/cancelled', staffController.getCancelledDeliverySales);
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
router.delete('/sales/:saleId/payments/:paymentId', staffController.deleteSalePayment);

router.put('/sales/:saleId', staffController.updateSale);
router.delete('/sales/:saleId', staffController.deleteSale);
router.put('/sales/:saleId/packaging', staffController.updatePackagingStatus);
router.post('/sales/:saleId/cancel-log', staffController.logOrderCancellation);
router.get('/sales/:saleId/cancel-log', staffController.getOrderCancellations);

export default router;
