import express from 'express';
const router = express.Router();
import * as deliveryBoyController from '../controllers/deliveryBoyController.js';
import jwt from 'jsonwebtoken';
import { requireAnyPermission, requireRole, verifyTokenMiddleware } from '../middlewares/authMiddleware.js';

function verifyDeliveryBoyToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(403).json({ error: 'Access denied. No delivery token provided.' });
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.DELIVERY_JWT_SECRET || process.env.JWT_SECRET || 'delivery-secret'
        );
        if (decoded.role !== 'delivery_boy' || !decoded.deliveryBoyId) {
            return res.status(401).json({ error: 'Invalid delivery token.' });
        }
        req.deliveryBoyId = decoded.deliveryBoyId;
        req.deliveryLoginId = decoded.deliveryLoginId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired delivery token.' });
    }
}

router.post('/mobile/login', deliveryBoyController.mobileLogin);
router.get('/mobile/profile', verifyDeliveryBoyToken, deliveryBoyController.getMobileProfile);
router.get('/mobile/items', verifyDeliveryBoyToken, deliveryBoyController.getMobileAssignedItems);
router.put('/mobile/items/:saleId/status', verifyDeliveryBoyToken, deliveryBoyController.updateMobileAssignedItemStatus);
router.put('/mobile/items/:saleId/location', verifyDeliveryBoyToken, deliveryBoyController.updateMobileAssignedItemLocation);
router.get('/mobile/collections', verifyDeliveryBoyToken, deliveryBoyController.getMobileCollections);
router.get('/mobile/credit-dues', verifyDeliveryBoyToken, deliveryBoyController.getMobileCreditDues);
router.post('/mobile/credit-dues/:saleId/payments', verifyDeliveryBoyToken, deliveryBoyController.collectMobileCreditDue);
router.put('/mobile/items/:saleId/collection', verifyDeliveryBoyToken, deliveryBoyController.updateMobileCollection);
router.get('/permissions', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.getPermissionUsers);
router.put('/:id/permissions', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.updatePermissionUser);
router.post('/', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.createDeliveryBoy);
router.get('/companies', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.getStaffAssignedCompanies);
router.get('/collections', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.getDeliveryBoyCollections);
router.put('/collections/:collectionId/settle', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.settleDeliveryBoyCollection);
router.get('/', verifyTokenMiddleware, requireAnyPermission('out_bill', 'packaging', 'delivery', 'delivered'), deliveryBoyController.getDeliveryBoys);
router.post('/:id/credentials', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.generateDeliveryBoyCredentials);
router.put('/:id/credentials', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.updateDeliveryBoyCredentials);
router.put('/:id/toggle-active', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.toggleDeliveryBoyActive);
router.put('/:id', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.updateDeliveryBoy);
router.delete('/:id', verifyTokenMiddleware, requireRole('admin'), deliveryBoyController.deleteDeliveryBoy);

export default router;
