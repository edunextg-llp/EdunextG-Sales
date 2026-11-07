import express from 'express';
import * as materialReports from '../controllers/materialReportController.js';

// Mounted behind verifyTokenMiddleware. Access per user is decided in the controller:
// admin sees everything, reviewers see less-material reports, packaging staff see the
// reports on invoices they packed.
const router = express.Router();

router.get('/', materialReports.listWebReports);
router.put('/:id/reason', materialReports.saveWebReason);
router.put('/:id/review', materialReports.reviewWebReport);

export default router;
