import db from '../config/db.js';

// Only a successfully saved server-side invoice photo satisfies this requirement.
// Never trust a photo URL sent with the payment request.
export async function requireCreditPhoto(req, res, next) {
    if (String(req.body?.paymentMode || '').trim().toLowerCase() !== 'credit') return next();
    try {
        let rows;
        if (req.params.collectionId) {
            [rows] = await db.execute(
                `SELECT ss.credit_photo_url FROM delivery_boy_collections dbc
                 JOIN staff_sales ss ON ss.id = dbc.sale_id
                 WHERE dbc.id = ? AND dbc.${req.staffId ? 'staff_id' : 'delivery_boy_id'} = ? AND dbc.settled_at IS NULL`,
                [req.params.collectionId, req.staffId || req.deliveryBoyId]
            );
        } else {
            [rows] = await db.execute('SELECT credit_photo_url FROM staff_sales WHERE id = ?', [req.params.saleId]);
        }
        if (!rows.length || !String(rows[0].credit_photo_url || '').trim()) {
            return res.status(400).json({ error: 'Upload a credit photo before submitting Credit.' });
        }
        return next();
    } catch (error) {
        console.error('Unable to verify required credit photo:', error);
        return res.status(500).json({ error: 'Unable to verify the credit photo. Please try again.' });
    }
}
