import express from 'express';
import * as portal from '../controllers/distributorPortalController.js';
import * as orders from '../controllers/distributorOrderController.js';

// Distributor Portal API (/api/distributor). Every route needs a main-site token of an
// active distributor (role 'distributor') and is limited to that distributor's own data.
const router = express.Router();


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

export default router;
