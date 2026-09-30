import express from 'express';
import * as staffMobile from '../controllers/staffMobileController.js';
import * as purchaseRequisitions from '../controllers/purchaseRequisitionController.js';
import { getCurrentStock } from '../controllers/currentStockController.js';

const router = express.Router();
const auth = staffMobile.verifyStaffMobileToken;
const asStaff = [auth, staffMobile.asWebStaffUser];

router.post('/login', staffMobile.login);
router.get('/profile', auth, staffMobile.getProfile);
router.get('/dashboard', auth, staffMobile.getDashboard);
router.get('/invoices', auth, staffMobile.getInvoices);
router.get('/invoices/cancelled', auth, staffMobile.getCancellations);
router.get('/invoices/:saleId', auth, staffMobile.getInvoiceDetail);
router.get('/credit/outlets', auth, staffMobile.getCreditByOutlet);
router.get('/out-bills', auth, staffMobile.getOutBills);
router.post('/out-bills/:saleId/payments', auth, staffMobile.submitOutBillPayment);
router.get('/collections', auth, staffMobile.getCollections);
router.get('/outlets', auth, staffMobile.getOutlets);
router.put('/outlets/:outletId/location', auth, staffMobile.updateOutletLocation);
router.put('/outlets/:outletId/contact', auth, staffMobile.updateOutletContact);

// Purchase requisitions reuse the web rules (stock limits, pricing, numbering, approval flow).
router.get('/requisitions/options', ...asStaff, staffMobile.getRequisitionOptions);
router.get('/requisitions/stock', ...asStaff, getCurrentStock);
router.get('/requisitions', ...asStaff, purchaseRequisitions.list);
router.post('/requisitions', ...asStaff, staffMobile.prepareRequisitionBody, purchaseRequisitions.create);
router.delete('/requisitions/:id', ...asStaff, purchaseRequisitions.removePending);

export default router;
