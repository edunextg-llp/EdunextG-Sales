import * as staffDelivery from '../controllers/staffDeliveryController.js';
import { requireCreditPhoto } from '../middlewares/requireCreditPhoto.js';
import { authorizeCreditPhoto, receiveCreditPhoto, saveCreditPhoto, getCreditPhoto } from '../controllers/creditPhotoController.js';
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
router.post('/out-bills/:saleId/payments', auth, requireCreditPhoto, staffMobile.submitOutBillPayment);
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

router.get('/out-bills/:saleId/credit-photo', auth, authorizeCreditPhoto, getCreditPhoto);
router.post('/out-bills/:saleId/credit-photo', auth, authorizeCreditPhoto, receiveCreditPhoto, saveCreditPhoto);

router.get('/deliveries', auth, staffDelivery.list);
router.put('/deliveries/:saleId/location', auth, staffDelivery.updateLocation);
router.put('/deliveries/:saleId/status', auth, staffDelivery.updateStatus);
router.post('/deliveries/:saleId/payments', auth, requireCreditPhoto, staffDelivery.collect);
router.put('/delivery-collections/:collectionId', auth, requireCreditPhoto, staffDelivery.editCollection);
router.get('/deliveries/:saleId/credit-photo', auth, authorizeCreditPhoto, getCreditPhoto);
router.post('/deliveries/:saleId/credit-photo', auth, authorizeCreditPhoto, receiveCreditPhoto, saveCreditPhoto);

export default router;
