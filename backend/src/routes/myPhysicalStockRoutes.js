import express from 'express';
import { verifyTokenMiddleware } from '../middlewares/authMiddleware.js';
import * as physicalStockController from '../controllers/physicalStockController.js';
import * as assignments from '../controllers/physicalStockAssignmentController.js';

// Physical stock for the person it is assigned to (any staff / delivery / packaging login),
// limited to the companies assigned to them. No DMS permission needed.
const router = express.Router();

router.use(verifyTokenMiddleware, assignments.loadMyAssignments);
router.get('/', assignments.listMyAssignments);
router.get('/company', assignments.requireAssignedCompanyQuery, physicalStockController.getPhysicalStockForCompany);
router.post('/manual', assignments.requireAssignedImport, physicalStockController.createManualPhysicalStock);
router.post('/:id/done', assignments.markMyAssignmentDone);

export default router;
