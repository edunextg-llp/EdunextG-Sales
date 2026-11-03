import express from 'express';
import * as documentAssignments from '../controllers/documentAssignmentController.js';
import { verifyTokenMiddleware } from '../middlewares/authMiddleware.js';

// Web (dashboard) access to the logged-in person's own document assignments.
// Works for delivery / packaging accounts and for company staff ("staff" role).
const router = express.Router();

function resolveAssignee(req, res, next) {
    const { role, deliveryBoyId, staffId } = req.user || {};
    if (['delivery_boy', 'packaging_staff'].includes(role) && deliveryBoyId) {
        req.deliveryBoyId = deliveryBoyId;
        req.assigneeType = 'delivery_boy';
        return next();
    }
    if (role === 'staff' && staffId) {
        req.staffId = staffId;
        req.assigneeType = 'staff';
        return next();
    }
    return res.status(403).json({ error: 'Only staff and delivery accounts have assigned tasks.' });
}

const byType = (staffHandler, deliveryHandler) => (req, res) =>
    (req.assigneeType === 'staff' ? staffHandler : deliveryHandler)(req, res);

router.use(verifyTokenMiddleware, resolveAssignee);
router.get('/', byType(documentAssignments.listMine, documentAssignments.listDeliveryMine));
router.put('/:id', byType(documentAssignments.updateMine, documentAssignments.updateDeliveryMine));
router.get('/:id/link', byType(documentAssignments.fileLinks('staff'), documentAssignments.fileLinks('delivery_boy')));

export default router;
