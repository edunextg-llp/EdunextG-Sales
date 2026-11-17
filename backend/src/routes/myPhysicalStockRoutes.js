import express from 'express';
import { verifyTokenMiddleware } from '../middlewares/authMiddleware.js';
import * as physicalStockController from '../controllers/physicalStockController.js';
import * as assignments from '../controllers/physicalStockAssignmentController.js';

// Physical stock for the person it is assigned to (any staff / delivery / packaging login),
// limited to the companies assigned to them. No DMS permission needed.
// The same routes are mounted for the Bawarchee app (delivery and staff app logins) with their
// own sign-in check: see deliveryBoyRoutes.js (/mobile/physical-stock) and staffMobileRoutes.js
// (/physical-stock). `auth` must leave req.user shaped like a web login (actorOf in
// physicalStockAssignmentController.js).
export function myPhysicalStockRouter(...auth) {
    const router = express.Router();
    router.use(...auth, assignments.loadMyAssignments);
    router.get('/', assignments.listMyAssignments);
    router.get('/company', assignments.requireAssignedCompanyQuery, physicalStockController.getPhysicalStockForCompany);
    router.post('/manual', assignments.requireAssignedImport, physicalStockController.createManualPhysicalStock);
    router.post('/:id/done', assignments.markMyAssignmentDone);
    return router;
}

export default myPhysicalStockRouter(verifyTokenMiddleware);
