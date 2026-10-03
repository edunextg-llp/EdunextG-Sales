import db from '../config/db.js';
import { sendBitMails, istDateKey } from '../services/bitMailService.js';

// POST /api/staff/bit-mails/send-now   (admin)
// body: { staffId?, date? (YYYY-MM-DD), force?, dryRun? }
// dryRun: true shows who would get which mail without sending anything.
export const sendBitMailsNow = async (req, res) => {
    try {
        const { staffId, date, force, dryRun } = req.body || {};
        const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : istDateKey();
        const result = await sendBitMails({
            dateKey,
            staffId: staffId ? Number(staffId) : null,
            force: Boolean(force),
            dryRun: Boolean(dryRun),
        });
        res.status(200).json(result);
    } catch (error) {
        console.error('Error sending bit mails:', error);
        res.status(500).json({ error: error.message || 'Unable to send bit mails' });
    }
};

// GET /api/staff/bit-mails/log?date=YYYY-MM-DD   (admin)
export const getBitMailLog = async (req, res) => {
    try {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : istDateKey();
        const [rows] = await db.execute(
            `SELECT l.*, s.name AS staff_name
             FROM bit_mail_log l
             LEFT JOIN staff s ON s.id = l.staff_id
             WHERE l.mail_date = ?
             ORDER BY s.name, l.bit_name`,
            [date]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error reading bit mail log:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
