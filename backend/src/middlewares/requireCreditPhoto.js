import db from '../config/db.js';
import PaymentModel from '../models/paymentModel.js';
import { getPendingCollectedAmount } from '../models/staffPortalModel.js';
import { parseMobilePayment } from '../controllers/deliveryBoyController.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Amount being submitted now. Cash may arrive as note-wise cashDetails instead of a plain amount.
function submittedAmount(body = {}) {
    if (body.amount != null && body.amount !== '') return Number(body.amount);
    const parsed = parseMobilePayment(body);
    return parsed.payment ? Number(parsed.payment.amount) : NaN;
}

// Balance the submitted amount is compared against, for each kind of route.
async function getBalanceContext(req) {
    if (req.params.collectionId) {
        // Editing an unsettled D.B. Collection entry (app).
        const [rows] = await db.execute(
            `SELECT dbc.sale_id, ss.credit_photo_url FROM delivery_boy_collections dbc
             JOIN staff_sales ss ON ss.id = dbc.sale_id
             WHERE dbc.id = ? AND dbc.${req.staffId ? 'staff_id' : 'delivery_boy_id'} = ? AND dbc.settled_at IS NULL`,
            [req.params.collectionId, req.staffId || req.deliveryBoyId]
        );
        if (!rows.length) return null;
        const saleId = rows[0].sale_id;
        const price = await PaymentModel.getEffectiveSalePrice(db, saleId);
        const paid = await PaymentModel.getTotalPaid(db, saleId);
        return { photoUrl: rows[0].credit_photo_url, remaining: round2(price - paid) };
    }

    const saleId = req.params.saleId;
    const [rows] = await db.execute('SELECT credit_photo_url FROM staff_sales WHERE id = ?', [saleId]);
    if (!rows.length) return null;
    const price = await PaymentModel.getEffectiveSalePrice(db, saleId);

    if (req.params.paymentId) {
        // Web: editing an existing payment — exclude it from the paid total.
        const [paymentRows] = await db.execute(
            'SELECT parent_credit_payment_id FROM sale_payments WHERE id = ? AND sale_id = ?',
            [req.params.paymentId, saleId]
        );
        const paid = await PaymentModel.getTotalPaid(db, saleId, req.params.paymentId);
        return {
            photoUrl: rows[0].credit_photo_url,
            remaining: round2(price - paid),
            isCreditRepayment: Boolean(paymentRows[0]?.parent_credit_payment_id),
        };
    }

    // New payment: money already waiting in D.B. Collection is not part of the open balance.
    const paid = await PaymentModel.getTotalPaid(db, saleId);
    const pending = await getPendingCollectedAmount(db, saleId);
    return { photoUrl: rows[0].credit_photo_url, remaining: round2(price - paid - pending) };
}

// An invoice photo is required when the bill goes to credit, either explicitly (mode = Credit)
// or implicitly (cash/UPI/cheque collected for less than the open balance, so the rest stays due).
// Only a successfully saved server-side invoice photo satisfies this requirement.
// Never trust a photo URL sent with the payment request.
export async function requireCreditPhoto(req, res, next) {
    const mode = String(req.body?.paymentMode || '').trim().toLowerCase();
    if (!mode) return next();
    // Paying off an existing credit entry: the photo was already required when the credit was created.
    if (mode !== 'credit' && req.body?.parentCreditPaymentId) return next();
    // Legacy whole-sale payment update (web) has no per-payment amount; only Credit needs the photo there.
    if (mode !== 'credit' && req.body?.amount == null && req.body?.cashDetails == null) return next();

    try {
        const context = await getBalanceContext(req);
        if (!context) {
            if (mode === 'credit') return res.status(400).json({ error: 'Upload a credit photo before submitting Credit.' });
            return next(); // Let the controller return its own not-found error.
        }
        if (String(context.photoUrl || '').trim()) return next();

        if (mode === 'credit') {
            return res.status(400).json({ error: 'Upload a credit photo before submitting Credit.' });
        }
        if (context.isCreditRepayment) return next();

        const amount = submittedAmount(req.body);
        // Invalid amounts are rejected by the controller; overpayments too.
        if (!Number.isFinite(amount) || amount <= 0) return next();
        const shortBy = round2(context.remaining - amount);
        if (shortBy > 0.001) {
            return res.status(400).json({
                error: `Collected amount is Rs. ${shortBy.toFixed(2)} less than the balance of Rs. ${context.remaining.toFixed(2)}. Upload the invoice photo before submitting a partial collection.`,
                code: 'INVOICE_PHOTO_REQUIRED',
            });
        }
        return next();
    } catch (error) {
        console.error('Unable to verify required credit photo:', error);
        return res.status(500).json({ error: 'Unable to verify the invoice photo. Please try again.' });
    }
}
