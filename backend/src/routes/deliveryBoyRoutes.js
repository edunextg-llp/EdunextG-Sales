import express from 'express';
const router = express.Router();
import * as deliveryBoyController from '../controllers/deliveryBoyController.js';
import jwt from 'jsonwebtoken';
import { verifyTokenMiddleware } from '../middlewares/authMiddleware.js';

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
router.get('/mobile/collections', verifyDeliveryBoyToken, deliveryBoyController.getMobileCollections);
router.put('/mobile/items/:saleId/collection', verifyDeliveryBoyToken, deliveryBoyController.updateMobileCollection);
router.post('/', verifyTokenMiddleware, deliveryBoyController.createDeliveryBoy);
router.get('/companies', verifyTokenMiddleware, deliveryBoyController.getStaffAssignedCompanies);
router.get('/collections', verifyTokenMiddleware, deliveryBoyController.getDeliveryBoyCollections);
router.get('/', verifyTokenMiddleware, deliveryBoyController.getDeliveryBoys);
router.post('/:id/credentials', verifyTokenMiddleware, deliveryBoyController.generateDeliveryBoyCredentials);
router.put('/:id/toggle-active', verifyTokenMiddleware, deliveryBoyController.toggleDeliveryBoyActive);
router.put('/:id', verifyTokenMiddleware, deliveryBoyController.updateDeliveryBoy);
router.delete('/:id', verifyTokenMiddleware, deliveryBoyController.deleteDeliveryBoy);

export default router;
