import express from 'express';
import * as portal from '../controllers/distributorPortalController.js';
import * as orders from '../controllers/distributorOrderController.js';
import { lookupPincode } from '../controllers/pincodeController.js';

// Distributor Portal API (/api/distributor). Every route needs a main-site token of an
// active distributor (role 'distributor') and is limited to that distributor's own data.
const router = express.Router();

// Bawarchee app sign-in (no CAPTCHA, own lockout). Before requireDistributor: no token yet.
router.post('/mobile/login', portal.mobileLogin);

router.use(portal.requireDistributor);
router.get('/me', portal.me);
router.put('/password', portal.changePassword);
router.get('/dashboard', portal.dashboard);
router.get('/purchases', portal.listPurchases);
router.get('/purchases/:id', portal.getPurchase);
router.get('/ledger', portal.ledger);
router.get('/stock', portal.stock);
router.get('/order-items', orders.portalOrderItems);
router.get('/orders', orders.portalListOrders);
router.post('/orders', orders.portalCreateOrder);
router.post('/orders/:id/cancel', orders.portalCancelOrder);
router.get('/delivery-boys', portal.listDeliveryBoys);
router.post('/delivery-boys', portal.createDeliveryBoy);
router.put('/delivery-boys/:id', portal.updateDeliveryBoy);
router.put('/delivery-boys/:id/active', portal.setDeliveryBoyActive);
router.delete('/delivery-boys/:id', portal.deleteDeliveryBoy);
// Areas (created first) and the outlets in them (web portal Areas / Outlets, Bawarchee app).
// Pin code -> district / state for the outlet form (same lookup as the main site).
router.get('/pincode/:pin', lookupPincode);
router.get('/areas', portal.listAreas);
router.post('/areas', portal.createArea);
router.put('/areas/:id', portal.updateArea);
router.delete('/areas/:id', portal.deleteArea);
router.get('/outlets', portal.listOutlets);
router.post('/outlets', portal.createOutlet);
router.put('/outlets/:id', portal.updateOutlet);
router.put('/outlets/:id/active', portal.setOutletActive);
router.delete('/outlets/:id', portal.deleteOutlet);

export default router;
