import db from '../config/db.js';

// Seller (supplier) ledger.
// Credit side (we owe more): Add Purchase invoices (dms_stock_imports), opening balance,
//   credit adjustments (extra charges from the seller).
// Debit side (we owe less): payments to the seller, debit notes (returns, claims, discounts).
// Balance = credits - debits. Positive = payable to the seller; negative = advance paid.
// Invoice totals are stored to 4 decimals; each is rounded to paise before adding up,
// in both the ledger and the summary, so the two always agree.

export const ENTRY_TYPES = {
    payment: { side: 'debit', label: 'Payment' },
    debit_note: { side: 'debit', label: 'Debit note' },
    credit_note: { side: 'credit', label: 'Credit adjustment' },
    opening: { side: 'credit', label: 'Opening balance' },
};

export const PAYMENT_MODES = ['cash', 'bank', 'upi', 'cheque'];

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

const ENTRY_SELECT = `
    SELECT e.id, e.seller_id, e.company_id, e.entry_type,
           DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS entry_date,
           e.amount, e.payment_mode, e.reference, e.note,
           e.created_by, DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM seller_ledger_entries e
`;

class SellerLedgerModel {
    static async getSeller(sellerId) {
        const [rows] = await db.execute(
            `SELECT ps.id, ps.seller_code, ps.seller_name, ps.contact, ps.address, ps.city, ps.district,
                    ps.state, ps.in_code, ps.gstin, ps.company_id, c.name AS company_name, c.type AS company_type
             FROM purchase_sellers ps
             LEFT JOIN companies c ON c.id = ps.company_id
             WHERE ps.id = ?`,
            [sellerId]
        );
        return rows[0] || null;
    }

    /** Every movement for one seller, oldest first, with a running balance. */
    static async getLedger(sellerId) {
        const [invoices] = await db.execute(
            `SELECT i.id, i.entry_code, i.invoice_number, DATE_FORMAT(i.upload_date, '%Y-%m-%d') AS entry_date,
                    i.row_count, i.total_value, DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM dms_stock_imports i
             WHERE i.seller_id = ?`,
            [sellerId]
        );
        const [entries] = await db.execute(`${ENTRY_SELECT} WHERE e.seller_id = ?`, [sellerId]);

        const lines = [
            ...invoices.map((inv) => ({
                key: `inv-${inv.id}`,
                kind: 'purchase',
                id: inv.id,
                date: inv.entry_date,
                createdAt: inv.created_at,
                particulars: 'Purchase',
                reference: inv.invoice_number || inv.entry_code || '',
                entryCode: inv.entry_code || '',
                note: `${Number(inv.row_count) || 0} item(s)`,
                debit: 0,
                credit: money(inv.total_value),
            })),
            ...entries.map((e) => {
                const meta = ENTRY_TYPES[e.entry_type] || ENTRY_TYPES.payment;
                const amount = money(e.amount);
                return {
                    key: `entry-${e.id}`,
                    kind: e.entry_type,
                    id: e.id,
                    date: e.entry_date,
                    createdAt: e.created_at,
                    particulars: meta.label,
                    paymentMode: e.payment_mode || '',
                    reference: e.reference || '',
                    note: e.note || '',
                    amount,
                    debit: meta.side === 'debit' ? amount : 0,
                    credit: meta.side === 'credit' ? amount : 0,
                };
            }),
        ];

        // Opening balance first on its day, then by date, then by when it was entered.
        const order = (line) => (line.kind === 'opening' ? 0 : 1);
        lines.sort((a, b) => (
            String(a.date).localeCompare(String(b.date))
            || order(a) - order(b)
            || String(a.createdAt).localeCompare(String(b.createdAt))
            || String(a.key).localeCompare(String(b.key))
        ));

        let balance = 0;
        lines.forEach((line) => {
            balance = money(balance + line.credit - line.debit);
            line.balance = balance;
        });
        return lines;
    }

    /** One row per seller (optionally for one company): purchases, payments, balance. */
    static async getSummary(companyId = null) {
        const params = [];
        let where = '';
        if (companyId) {
            where = 'WHERE ps.company_id = ?';
            params.push(companyId);
        }
        const [rows] = await db.query(
            `SELECT ps.id AS seller_id, ps.seller_code, ps.seller_name, ps.company_id,
                    c.name AS company_name, c.type AS company_type,
                    COALESCE(p.purchases, 0) AS purchases,
                    COALESCE(p.invoice_count, 0) AS invoice_count,
                    p.last_purchase_date,
                    COALESCE(l.payments, 0) AS payments,
                    COALESCE(l.debit_notes, 0) AS debit_notes,
                    COALESCE(l.credit_adjustments, 0) AS credit_adjustments,
                    COALESCE(l.opening, 0) AS opening,
                    l.last_payment_date
             FROM purchase_sellers ps
             LEFT JOIN companies c ON c.id = ps.company_id
             LEFT JOIN (
                 SELECT seller_id, SUM(ROUND(total_value, 2)) AS purchases, COUNT(*) AS invoice_count,
                        DATE_FORMAT(MAX(upload_date), '%Y-%m-%d') AS last_purchase_date
                 FROM dms_stock_imports
                 WHERE seller_id IS NOT NULL
                 GROUP BY seller_id
             ) p ON p.seller_id = ps.id
             LEFT JOIN (
                 SELECT seller_id,
                        SUM(CASE WHEN entry_type = 'payment' THEN amount ELSE 0 END) AS payments,
                        SUM(CASE WHEN entry_type = 'debit_note' THEN amount ELSE 0 END) AS debit_notes,
                        SUM(CASE WHEN entry_type = 'credit_note' THEN amount ELSE 0 END) AS credit_adjustments,
                        SUM(CASE WHEN entry_type = 'opening' THEN amount ELSE 0 END) AS opening,
                        DATE_FORMAT(MAX(CASE WHEN entry_type = 'payment' THEN entry_date END), '%Y-%m-%d') AS last_payment_date
                 FROM seller_ledger_entries
                 GROUP BY seller_id
             ) l ON l.seller_id = ps.id
             ${where}
             ORDER BY c.name, ps.seller_name`,
            params
        );
        return rows.map((row) => {
            const purchases = money(row.purchases);
            const payments = money(row.payments);
            const debitNotes = money(row.debit_notes);
            const creditAdjustments = money(row.credit_adjustments);
            const opening = money(row.opening);
            return {
                ...row,
                purchases,
                payments,
                debit_notes: debitNotes,
                credit_adjustments: creditAdjustments,
                opening,
                invoice_count: Number(row.invoice_count) || 0,
                balance: money(opening + purchases + creditAdjustments - payments - debitNotes),
            };
        });
    }

    static async getEntry(id) {
        const [rows] = await db.execute(`${ENTRY_SELECT} WHERE e.id = ?`, [id]);
        return rows[0] || null;
    }

    static async createEntry(data) {
        const [result] = await db.execute(
            `INSERT INTO seller_ledger_entries
                (seller_id, company_id, entry_type, entry_date, amount, payment_mode, reference, note, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.sellerId, data.companyId, data.entryType, data.entryDate, data.amount,
                data.paymentMode, data.reference, data.note, data.createdBy,
            ]
        );
        return SellerLedgerModel.getEntry(result.insertId);
    }

    static async updateEntry(id, data) {
        await db.execute(
            `UPDATE seller_ledger_entries
             SET entry_type = ?, entry_date = ?, amount = ?, payment_mode = ?, reference = ?, note = ?
             WHERE id = ?`,
            [data.entryType, data.entryDate, data.amount, data.paymentMode, data.reference, data.note, id]
        );
        return SellerLedgerModel.getEntry(id);
    }

    static async deleteEntry(id) {
        const [result] = await db.execute('DELETE FROM seller_ledger_entries WHERE id = ?', [id]);
        return result.affectedRows;
    }
}

export default SellerLedgerModel;
