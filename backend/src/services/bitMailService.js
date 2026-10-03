// Daily "Today's Bit" overdue / outstanding statement mails.
//
// For every active staff member with an email ID, find today's bit(s) (area
// assigned for today's weekday in Location Assignments), collect that staff
// member's pending credit bills for the bit (same data as the Credits page),
// build a PDF statement and mail it from the company Gmail account.
// The emails saved on the staff member's companies (Existing Companies) go in CC.

import db from '../config/db.js';
import StaffModel from '../models/staffModel.js';

const TIME_ZONE = 'Asia/Kolkata';
const COMPANY_NAME = 'BAWARCHEE FOOD PACKING PVT. LTD.';
const MAIL_SUBJECT = 'TODAY’S BIT – OVERDUE AND CREDIT BILL DUE STATEMENT';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let runInProgress = false;

// ---------- date helpers (always India time, whatever the server clock says) ----------

const istDateKey = (date = new Date()) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date); // YYYY-MM-DD

const keyToUtc = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};

const addDaysToKey = (key, days) =>
    new Date(keyToUtc(key) + days * 86400000).toISOString().slice(0, 10);

const keyToDots = (key) => key.split('-').reverse().join('.'); // DD.MM.YYYY
const keyToSlashes = (key) => key.split('-').reverse().join('/'); // DD/MM/YYYY
const weekdayOfKey = (key) => WEEKDAYS[new Date(keyToUtc(key)).getUTCDay()];

const toDateKey = (value) => {
    if (!value) return null;
    if (value instanceof Date) return istDateKey(value);
    const text = String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : istDateKey(new Date(text));
};

const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

// ---------- mail text ----------

function isEverestOnly(companyNames) {
    return companyNames.length > 0 && companyNames.every((name) => /everest/i.test(name));
}

export function buildMailBody({ bitName, dateKey, companyNames }) {
    const dated = keyToDots(dateKey);
    const lines = [
        'TO',
        'RESPECTED SIR/MA’AM,',
        '',
        `SUBJECT: ${MAIL_SUBJECT}`,
        '',
        `As per the subject, please find attached the Outstanding Bill and Overdue Statement for Today’s Bit – ${bitName}, dated ${dated}.`,
        '',
    ];

    if (isEverestOnly(companyNames)) {
        lines.push(`You are kindly requested to download and review today’s Bit – ${bitName} Overdue and Outstanding List.`);
    } else {
        lines.push(
            `You are kindly requested to download and review today’s Bit – ${bitName} Overdue and Outstanding List and take the necessary action for payment clearance.`,
            '',
            'Your cooperation in maintaining timely payment and controlling overdue amounts is highly appreciated.'
        );
    }

    lines.push('', 'Regards,', COMPANY_NAME);
    return lines.join('\n');
}

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

const textToHtml = (text) =>
    `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #111827; line-height: 1.5;">${text
        .split('\n')
        .map((line) => (line ? escapeHtml(line) : '&nbsp;'))
        .map((line) => (line.startsWith('SUBJECT:') ? `<strong>${line}</strong>` : line))
        .join('<br>')}</div>`;

// ---------- PDF attachment ----------

function describeCredit(credit, todayKey) {
    const saleKey = toDateKey(credit.sale_date);
    const creditDays = Number(credit.credit_days) || 0;
    const dueKey = saleKey && creditDays ? addDaysToKey(saleKey, creditDays) : null;
    const diffDays = dueKey ? Math.round((keyToUtc(dueKey) - keyToUtc(todayKey)) / 86400000) : null;

    let status = 'No Term';
    if (diffDays !== null) {
        if (diffDays < 0) status = `Overdue by ${Math.abs(diffDays)} days`;
        else if (diffDays === 0) status = 'Due Today';
        else status = `Due in ${diffDays} days`;
    }

    return {
        saleId: credit.sticker_number || '',
        invoiceNo: credit.invoice_number || '',
        outletName: credit.outlet_name || '',
        erpId: credit.outlet_erp_id || '',
        contact: credit.contact_number || '',
        issueDate: saleKey ? keyToSlashes(saleKey) : '',
        creditDays: creditDays || '',
        dueDate: dueKey ? keyToSlashes(dueKey) : '',
        balance: Number(credit.balance_amount) || 0,
        status,
        isOverdue: diffDays !== null && diffDays < 0,
        sortKey: diffDays === null ? 99999 : diffDays,
    };
}

async function loadPdfKit() {
    try {
        const { default: PDFDocument } = await import('pdfkit');
        return PDFDocument;
    } catch (importError) {
        throw new Error(
            `Could not load pdfkit (${importError?.code || importError?.message}). ` +
                'Run "npm install" in the backend folder, then restart the backend.'
        );
    }
}

const money = (value) =>
    Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function buildStatementPdf({ staffName, bitName, dateKey, credits }) {
    const rows = credits
        .map((credit) => describeCredit(credit, dateKey))
        .sort((a, b) => a.sortKey - b.sortKey || a.outletName.localeCompare(b.outletName));

    const total = rows.reduce((sum, row) => sum + row.balance, 0);
    const overdueRows = rows.filter((row) => row.isOverdue);
    const overdueTotal = overdueRows.reduce((sum, row) => sum + row.balance, 0);

    const PDFDocument = await loadPdfKit();
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve, reject) => {
        doc.on('end', resolve);
        doc.on('error', reject);
    });

    const left = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 20;

    const columns = [
        { header: 'Sr', key: 'sr', width: 26, align: 'center' },
        { header: 'Sale ID', key: 'saleId', width: 58 },
        { header: 'Invoice No', key: 'invoiceNo', width: 76 },
        { header: 'Outlet Name', key: 'outletName', width: 150 },
        { header: 'ERP ID', key: 'erpId', width: 62 },
        { header: 'Contact No', key: 'contact', width: 68 },
        { header: 'Issue Date', key: 'issueDate', width: 58, align: 'center' },
        { header: 'Cr. Days', key: 'creditDays', width: 38, align: 'center' },
        { header: 'Due Date', key: 'dueDate', width: 58, align: 'center' },
        { header: 'Outstanding (Rs.)', key: 'balance', width: 80, align: 'right' },
        { header: 'Status', key: 'status', width: 0 },
    ];
    const fixed = columns.reduce((sum, c) => sum + c.width, 0);
    columns[columns.length - 1].width = pageWidth - fixed;

    const padX = 4;
    const padY = 4;
    const fontSize = 8;

    // Header block
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827')
        .text(COMPANY_NAME, left, doc.y, { width: pageWidth, align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(11.5)
        .text(`Today's Bit - ${bitName} : Overdue and Outstanding Statement`, { width: pageWidth, align: 'center' });
    doc.moveDown(0.5);

    const metaY = doc.y;
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151');
    doc.text(`Staff: ${staffName}`, left, metaY, { width: pageWidth / 3 });
    doc.text(`Bit: ${bitName}`, left + pageWidth / 3, metaY, { width: pageWidth / 3, align: 'center' });
    doc.text(`Date: ${keyToDots(dateKey)}`, left + (2 * pageWidth) / 3, metaY, { width: pageWidth / 3, align: 'right' });
    doc.moveDown(0.4);
    const summaryY = doc.y;
    doc.font('Helvetica-Bold').fillColor('#b91c1c')
        .text(`Overdue: ${overdueRows.length} bills - Rs. ${money(overdueTotal)}`, left, summaryY, { width: pageWidth / 2 });
    doc.fillColor('#111827')
        .text(`Total Outstanding: ${rows.length} bills - Rs. ${money(total)}`, left + pageWidth / 2, summaryY, {
            width: pageWidth / 2,
            align: 'right',
        });
    doc.moveDown(0.6);

    const cellText = (row, col) => {
        if (col.key === 'balance') return money(row.balance);
        return String(row[col.key] ?? '');
    };

    const rowHeight = (values, font) => {
        doc.font(font).fontSize(fontSize);
        return Math.max(
            ...columns.map((col, idx) =>
                doc.heightOfString(values[idx] || ' ', { width: col.width - padX * 2 })
            )
        ) + padY * 2;
    };

    const drawRow = (values, { font = 'Helvetica', fill = null, color = '#111827', statusColor = null } = {}) => {
        const height = rowHeight(values, font);
        if (doc.y + height > bottomLimit()) return null;
        const y = doc.y;
        let x = left;
        columns.forEach((col, idx) => {
            if (fill) doc.rect(x, y, col.width, height).fill(fill);
            doc.lineWidth(0.5).strokeColor('#9ca3af').rect(x, y, col.width, height).stroke();
            const isStatus = col.key === 'status';
            doc.font(isStatus && statusColor ? 'Helvetica-Bold' : font)
                .fontSize(fontSize)
                .fillColor(isStatus && statusColor ? statusColor : color)
                .text(values[idx] || '', x + padX, y + padY, { width: col.width - padX * 2, align: col.align || 'left' });
            x += col.width;
        });
        doc.x = left;
        doc.y = y + height;
        return height;
    };

    const drawHeader = () =>
        drawRow(columns.map((c) => c.header), { font: 'Helvetica-Bold', fill: '#1f4e79', color: '#ffffff' });

    drawHeader();
    rows.forEach((row, index) => {
        const values = columns.map((col) => (col.key === 'sr' ? String(index + 1) : cellText(row, col)));
        const options = {
            fill: row.isOverdue ? '#fef2f2' : index % 2 ? '#f9fafb' : null,
            statusColor: row.isOverdue ? '#b91c1c' : null,
        };
        if (drawRow(values, options) === null) {
            doc.addPage();
            drawHeader();
            drawRow(values, options);
        }
    });

    // Totals
    if (doc.y + 40 > bottomLimit()) doc.addPage();
    doc.moveDown(0.6);
    const totalsWidth = 260;
    const totalsX = left + pageWidth - totalsWidth;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#b91c1c')
        .text(`Total Overdue:  Rs. ${money(overdueTotal)}`, totalsX, doc.y, { width: totalsWidth, align: 'right' });
    doc.fillColor('#111827')
        .text(`Total Outstanding:  Rs. ${money(total)}`, totalsX, doc.y, { width: totalsWidth, align: 'right' });

    // Footer with page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        const footerY = doc.page.height - doc.page.margins.bottom - 10;
        doc.font('Helvetica').fontSize(7.5).fillColor('#6b7280')
            .text(`${COMPANY_NAME}  |  Bit: ${bitName}  |  ${keyToDots(dateKey)}`, left, footerY, {
                width: pageWidth / 2,
                lineBreak: false,
            })
            .text(`Page ${i - range.start + 1} of ${range.count}`, left + pageWidth / 2, footerY, {
                width: pageWidth / 2,
                align: 'right',
                lineBreak: false,
            });
    }

    doc.end();
    await finished;
    return { buffer: Buffer.concat(chunks), total, count: rows.length };
}

// ---------- data ----------

async function loadRecipients(dateKey, staffId = null) {
    const weekday = weekdayOfKey(dateKey);

    const staffParams = [];
    let staffFilter = '';
    if (staffId) {
        staffFilter = 'AND s.id = ?';
        staffParams.push(staffId);
    }
    const [staffRows] = await db.execute(
        `SELECT s.id, s.name, s.email, s.staff_type
         FROM staff s
         WHERE s.is_active = 1 ${staffFilter}`,
        staffParams
    );

    const [locationRows] = await db.execute(
        `SELECT staff_id, day, location_name
         FROM staff_locations
         WHERE day IN (?, 'CNF') AND location_name IS NOT NULL AND TRIM(location_name) <> ''`,
        [weekday]
    );

    const [companyRows] = await db.execute(
        `SELECT link.staff_id, c.id AS company_id, c.name AS company_name
         FROM (
             SELECT staff_id, company_id FROM staff_companies
             UNION
             SELECT id AS staff_id, company_id FROM staff WHERE company_id IS NOT NULL
         ) link
         INNER JOIN companies c ON c.id = link.company_id`
    );

    const [emailRows] = await db.execute('SELECT company_id, email FROM company_emails ORDER BY id');

    const emailsByCompany = new Map();
    emailRows.forEach((row) => {
        if (!emailsByCompany.has(row.company_id)) emailsByCompany.set(row.company_id, []);
        emailsByCompany.get(row.company_id).push(String(row.email).trim().toLowerCase());
    });

    return staffRows.map((staff) => {
        const isCnf = staff.staff_type === 'cnf';
        // Weekday staff use today's day; CNF staff use their CNF bits (sent every working day).
        const bits = new Map();
        locationRows
            .filter((row) => Number(row.staff_id) === Number(staff.id))
            .filter((row) => (isCnf ? row.day === 'CNF' : row.day === weekday))
            .forEach((row) => {
                const key = normalizeName(row.location_name);
                if (!bits.has(key)) bits.set(key, String(row.location_name).trim());
            });

        const companies = companyRows.filter((row) => Number(row.staff_id) === Number(staff.id));
        const toEmail = String(staff.email || '').trim().toLowerCase();
        const ccEmails = [
            ...new Set(companies.flatMap((company) => emailsByCompany.get(company.company_id) || [])),
        ].filter((email) => email && email !== toEmail);

        return {
            staffId: staff.id,
            staffName: staff.name,
            toEmail,
            ccEmails,
            companyNames: [...new Set(companies.map((company) => company.company_name))],
            bits: [...bits.entries()].map(([key, name]) => ({ key, name })),
        };
    });
}

async function getLogStatus(dateKey, staffId, bitName) {
    const [rows] = await db.execute(
        'SELECT status FROM bit_mail_log WHERE mail_date = ? AND staff_id = ? AND bit_name = ?',
        [dateKey, staffId, bitName]
    );
    return rows[0]?.status || null;
}

async function writeLog(entry) {
    await db.execute(
        `INSERT INTO bit_mail_log
            (mail_date, staff_id, bit_name, to_email, cc_emails, status, message, credits_count, total_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            to_email = VALUES(to_email), cc_emails = VALUES(cc_emails), status = VALUES(status),
            message = VALUES(message), credits_count = VALUES(credits_count),
            total_balance = VALUES(total_balance), updated_at = CURRENT_TIMESTAMP`,
        [
            entry.dateKey,
            entry.staffId,
            entry.bitName,
            entry.toEmail || null,
            entry.ccEmails?.length ? entry.ccEmails.join(', ') : null,
            entry.status,
            entry.message || null,
            entry.count || 0,
            entry.total || 0,
        ]
    );
}

// ---------- sending ----------

let transporterPromise = null;

async function getTransporter() {
    const user = String(process.env.MAIL_USER || '').trim();
    const pass = String(process.env.MAIL_APP_PASSWORD || '').replace(/\s+/g, '');
    if (!user || !pass) {
        throw new Error('MAIL_USER / MAIL_APP_PASSWORD are not set in backend/.env');
    }
    if (!transporterPromise) {
        transporterPromise = (async () => {
            let nodemailer;
            try {
                ({ default: nodemailer } = await import('nodemailer'));
            } catch (importError) {
                throw new Error(
                    `Could not load nodemailer (${importError?.code || importError?.message}). ` +
                        'Run "npm install" in the backend folder, then restart the backend.'
                );
            }
            return nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: { user, pass },
            });
        })().catch((error) => {
            transporterPromise = null;
            throw error;
        });
    }
    return transporterPromise;
}

/**
 * Send today's bit mails.
 * @param {object} options
 * @param {string} [options.dateKey] YYYY-MM-DD (India date); defaults to today
 * @param {number} [options.staffId] only this staff member
 * @param {boolean} [options.force] resend even if already sent for that day
 * @param {boolean} [options.dryRun] build everything but do not send or log
 */
export async function sendBitMails({ dateKey = istDateKey(), staffId = null, force = false, dryRun = false } = {}) {
    if (runInProgress) {
        return { dateKey, skipped: true, reason: 'A bit-mail run is already in progress.', results: [] };
    }
    runInProgress = true;

    const results = [];
    try {
        const weekday = weekdayOfKey(dateKey);
        if (weekday === 'Sunday') {
            return { dateKey, weekday, results, reason: 'No bits on Sunday.' };
        }

        const recipients = await loadRecipients(dateKey, staffId);
        const allCredits = await StaffModel.getPendingCredits();
        const fromUser = String(process.env.MAIL_USER || '').trim();

        for (const recipient of recipients) {
            for (const bit of recipient.bits) {
                const base = {
                    dateKey,
                    staffId: recipient.staffId,
                    staffName: recipient.staffName,
                    bitName: bit.name,
                    toEmail: recipient.toEmail,
                    ccEmails: recipient.ccEmails,
                };

                if (!recipient.toEmail) {
                    results.push({ ...base, status: 'skipped', message: 'Staff has no email ID' });
                    continue;
                }

                const credits = allCredits.filter(
                    (credit) =>
                        Number(credit.staff_id) === Number(recipient.staffId) &&
                        normalizeName(credit.location_name) === bit.key
                );
                if (credits.length === 0) {
                    results.push({ ...base, status: 'skipped', message: 'No outstanding bills in this bit' });
                    continue;
                }

                if (!force && !dryRun && (await getLogStatus(dateKey, recipient.staffId, bit.name)) === 'sent') {
                    results.push({ ...base, status: 'skipped', message: 'Already sent today' });
                    continue;
                }

                const { buffer, total, count } = await buildStatementPdf({
                    staffName: recipient.staffName,
                    bitName: bit.name,
                    dateKey,
                    credits,
                });
                const text = buildMailBody({ bitName: bit.name, dateKey, companyNames: recipient.companyNames });
                const safeBit = bit.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'Bit';
                const entry = { ...base, count, total };

                if (dryRun) {
                    results.push({ ...entry, status: 'preview', body: text });
                    continue;
                }

                try {
                    const transporter = await getTransporter();
                    await transporter.sendMail({
                        from: `"${COMPANY_NAME}" <${fromUser}>`,
                        to: recipient.toEmail,
                        cc: recipient.ccEmails.length ? recipient.ccEmails : undefined,
                        subject: `${MAIL_SUBJECT} – ${bit.name} – ${keyToDots(dateKey)}`,
                        text,
                        html: textToHtml(text),
                        attachments: [
                            {
                                filename: `Overdue_Outstanding_${safeBit}_${keyToDots(dateKey)}.pdf`,
                                content: buffer,
                                contentType: 'application/pdf',
                            },
                        ],
                    });
                    await writeLog({ ...entry, status: 'sent' });
                    results.push({ ...entry, status: 'sent' });
                } catch (error) {
                    const message = error?.message || String(error);
                    await writeLog({ ...entry, status: 'failed', message }).catch(() => {});
                    results.push({ ...entry, status: 'failed', message });
                }
            }
        }

        return { dateKey, weekday, results };
    } finally {
        runInProgress = false;
    }
}

export { istDateKey };
