import db from '../config/db.js';
import { cloudinaryFileLinks } from '../utils/cloudinary.js';
import { autoCreateSales, autoSalesOff } from '../services/autoAddSales.js';
import { companyInvoiceNo, dropsInPrefix, invoiceDetailsFromPdf, invoiceNumbersFromPdf } from '../utils/pdfInvoiceNumbers.js';

// Report > Invoice Report.
// Every invoice PDF uploaded on Dashboard > Assign is read once for its invoice numbers
// (saved on document_assignments.invoice_numbers). Each number is then looked up in
// Add Sales (staff_sales): created or not, delivered / cancelled / returned / pending,
// and whether a payment has been updated.

const MAX_ASSIGNMENTS = 200;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const sendError = (res, error, fallback) => {
    if (!error.statusCode) console.error(fallback, error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : fallback });
};
const isPdf = (row) => /\.pdf$/i.test(String(row.document_name || '')) || /\.pdf(\?|$)/i.test(String(row.document_url || ''));
const parseJson = (value) => {
    try {
        return typeof value === 'string' ? JSON.parse(value) : value ?? null;
    } catch {
        return null;
    }
};
const parseList = (value) => {
    try {
        const list = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(list) ? list.map(String) : null;
    } catch {
        return null;
    }
};

// Reads the PDF of one assignment and saves its invoice numbers (or the error).
async function readAssignment(row) {
    try {
        const { viewUrl } = cloudinaryFileLinks(row.document_url);
        const response = await fetch(viewUrl);
        if (!response.ok) throw new Error(`The PDF could not be downloaded (HTTP ${response.status}).`);
        const buffer = await response.arrayBuffer();
        // pdf.js takes over the buffer it reads, so each reader gets its own copy.
        const numbers = await invoiceNumbersFromPdf(buffer.slice(0));
        // Outlet / date / amount / no. of items per invoice, for Auto Add Sales.
        const details = await invoiceDetailsFromPdf(buffer.slice(0)).catch((error) => {
            console.error(`Invoice report: reading details of assignment ${row.id} failed:`, error);
            return [];
        });
        await db.query(
            `UPDATE document_assignments SET invoice_numbers = ?, invoice_details = ?, invoice_numbers_error = NULL, invoice_numbers_read_at = NOW() WHERE id = ?`,
            [JSON.stringify(numbers), JSON.stringify(details), row.id]
        );
        return { numbers, error: null };
    } catch (error) {
        const message = String(error?.message || 'The PDF could not be read.').slice(0, 250);
        console.error(`Invoice report: reading assignment ${row.id} failed:`, error);
        await db.query(
            `UPDATE document_assignments SET invoice_numbers = NULL, invoice_details = NULL, invoice_numbers_error = ?, invoice_numbers_read_at = NOW() WHERE id = ?`,
            [message, row.id]
        );
        return { numbers: [], error: message };
    }
}

// Reads an assignment's PDF in the background (right after it is assigned), so the report
// already has the invoice numbers, then runs Auto Add Sales for it.
// Never throws; skips PDFs already read.
export function readAssignmentInBackground(id) {
    (async () => {
        const [rows] = await db.query(
            `SELECT id, document_url, document_name FROM document_assignments
             WHERE id = ? AND document_url IS NOT NULL AND invoice_numbers IS NULL AND invoice_numbers_error IS NULL`,
            [Number(id)]
        );
        if (rows[0] && isPdf(rows[0])) await readAssignment(rows[0]);
        await autoCreateSales(id);
    })().catch((error) => console.error(`Invoice report: background read of assignment ${id} failed:`, error));
}

// Add Sales invoices keyed by their saved number, normalized (letters + digits only).
async function salesByKey(keys) {
    const map = new Map();
    if (!keys.length) return map;
    const [rows] = await db.query(
        `SELECT * FROM (
            SELECT ss.id, ss.invoice_number, DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                   ss.price, ss.paid_amount, ss.balance_amount, ss.packaging_status, ss.cancellation_reason,
                   DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                   sc.outlet_name, s.name AS staff_name, c.name AS company_name,
                   COALESCE(sp.payment_count, 0) AS payment_count,
                   DATE_FORMAT(sp.last_payment_date, '%Y-%m-%d') AS last_payment_date,
                   k.norm AS match_key
            FROM staff_sales ss
            JOIN (SELECT id, REGEXP_REPLACE(UPPER(invoice_number), '[^A-Z0-9]', '') AS norm FROM staff_sales) k ON k.id = ss.id
            LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
            LEFT JOIN staff s ON s.id = ss.staff_id
            LEFT JOIN companies c ON c.id = s.company_id
            LEFT JOIN (
                SELECT sale_id, COUNT(*) AS payment_count, MAX(payment_date) AS last_payment_date
                FROM sale_payments GROUP BY sale_id
            ) sp ON sp.sale_id = ss.id
         ) x WHERE x.match_key IN (?)
         ORDER BY x.id DESC`,
        [keys]
    );
    rows.forEach((row) => {
        if (!map.has(row.match_key)) map.set(row.match_key, []);
        map.get(row.match_key).push(row);
    });
    return map;
}

const STATUS_LABELS = {
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    returned: 'Returned',
    out_for_delivery: 'Out for delivery',
    packing_done: 'Packed',
    packing: 'Packing',
    not_packing: 'Not packed',
};

const invoiceRow = (number, sales) => {
    const sale = sales?.[0];
    if (!sale) return { invoiceNumber: number, created: false, status: 'not_created', statusLabel: 'Not created' };
    const paymentCount = Number(sale.payment_count) || 0;
    return {
        invoiceNumber: number,
        created: true,
        saleId: sale.id,
        savedAs: sale.invoice_number,
        duplicates: sales.length,
        saleDate: sale.sale_date,
        outletName: sale.outlet_name,
        staffName: sale.staff_name,
        companyName: sale.company_name,
        amount: Number(sale.price) || 0,
        paidAmount: Number(sale.paid_amount) || 0,
        balanceAmount: Number(sale.balance_amount) || 0,
        status: sale.packaging_status,
        statusLabel: STATUS_LABELS[sale.packaging_status] || sale.packaging_status,
        cancellationReason: sale.cancellation_reason || '',
        deliveryDate: sale.delivery_date,
        paymentUpdated: paymentCount > 0,
        paymentCount,
        lastPaymentDate: sale.last_payment_date,
    };
};

// GET /api/staff/invoice-report?from=YYYY-MM-DD&to=YYYY-MM-DD&companyId=
// Only "Add Sales" assignments are reported, from the moment the invoice PDF is uploaded
// (no need for the assignee to mark them Done). Cancelled tasks are left out.
export const getInvoiceReport = async (req, res) => {
    try {
        const { from, to, companyId } = req.query;
        const where = ['a.document_url IS NOT NULL', "a.assignment_type = 'add_sales'", "a.status <> 'cancelled'"];
        const params = [];
        if (from) {
            if (!DATE.test(from)) return res.status(400).json({ error: 'From date is not valid.' });
            where.push('a.work_date >= ?');
            params.push(from);
        }
        if (to) {
            if (!DATE.test(to)) return res.status(400).json({ error: 'To date is not valid.' });
            where.push('a.work_date <= ?');
            params.push(to);
        }
        if (companyId) {
            where.push('a.company_id = ?');
            params.push(Number(companyId));
        }
        const [rows] = await db.query(
            `SELECT a.id, DATE_FORMAT(a.work_date, '%Y-%m-%d') AS work_date, a.assignment_type, a.company_id, a.area,
                    a.document_url, a.document_name, a.status, a.invoice_numbers, a.invoice_numbers_error,
                    a.invoice_details IS NOT NULL AS has_details, a.marketing_staff_id,
                    DATE_FORMAT(a.completed_at, '%Y-%m-%d %H:%i') AS completed_at,
                    c.name AS company_name, COALESCE(s.name, d.name) AS assignee_name, m.name AS marketing_staff_name
             FROM document_assignments a
             LEFT JOIN companies c ON c.id = a.company_id
             LEFT JOIN staff m ON m.id = a.marketing_staff_id
             LEFT JOIN staff s ON a.assignee_type = 'staff' AND s.id = a.assignee_id
             LEFT JOIN delivery_boys d ON a.assignee_type = 'delivery_boy' AND d.id = a.assignee_id
             WHERE ${where.join(' AND ')}
             ORDER BY a.work_date DESC, a.id DESC
             LIMIT ${MAX_ASSIGNMENTS}`,
            params
        );
        const pdfRows = rows.filter(isPdf);

        // Read the PDFs not read yet (one at a time; each is saved, so this happens once).
        const read = new Map();
        for (const row of pdfRows) {
            const cached = parseList(row.invoice_numbers);
            // Read before Auto Add Sales existed (numbers only): read again for the invoice details.
            const needsDetails = cached && !Number(row.has_details);
            if (cached && !needsDetails) read.set(row.id, { numbers: cached, error: null });
            else if (!cached && row.invoice_numbers_error) read.set(row.id, { numbers: [], error: row.invoice_numbers_error });
            else read.set(row.id, await readAssignment(row));
        }

        // Auto Add Sales (creates only the invoices not in Add Sales yet; the rules decide the rest).
        for (const row of pdfRows) {
            if (!read.get(row.id).error) {
                await autoCreateSales(row.id).catch((error) => console.error(`Auto Add Sales: assignment ${row.id} failed:`, error));
            }
        }
        const [autoRows] = pdfRows.length
            ? await db.query('SELECT id, auto_sales FROM document_assignments WHERE id IN (?)', [pdfRows.map((row) => row.id)])
            : [[]];
        const autoOf = new Map(autoRows.map((row) => [row.id, parseJson(row.auto_sales) || {}]));

        // EVEREST / EVEREST (NEEVAN): number without "IN" (an Add Sales entry typed with IN still matches).
        // Other companies: the full number, IN included.
        const companyOf = new Map(pdfRows.map((row) => [row.id, row.company_name]));
        const lookupKeys = (number, companyName) => {
            const value = companyInvoiceNo(number, companyName);
            return dropsInPrefix(companyName) && /^\d/.test(value) ? [value, `IN${value}`] : [value];
        };
        const allKeys = [...new Set([...read.entries()].flatMap(([id, r]) => r.numbers.flatMap((n) => lookupKeys(n, companyOf.get(id)))).filter(Boolean))];
        const sales = await salesByKey(allKeys);
        const salesFor = (number, companyName) => lookupKeys(number, companyName).flatMap((key) => sales.get(key) || []);

        const assignments = pdfRows.map((row) => {
            const { numbers, error } = read.get(row.id);
            // Same number twice in a PDF (e.g. IN5784885 and 5784885 for EVEREST) is listed once.
            const shownNumbers = [...new Set(numbers.map((number) => companyInvoiceNo(number, row.company_name)))];
            const invoices = shownNumbers.map((number) => {
                const matched = salesFor(number, row.company_name).sort((x, y) => y.id - x.id);
                const auto = autoOf.get(row.id)?.[number];
                return {
                    ...invoiceRow(number, matched.length ? matched : null),
                    autoCreated: auto?.status === 'created',
                    autoStatus: auto?.status || null,
                    autoError: auto && !['created', 'exists'].includes(auto.status) ? auto.reason : null,
                };
            });
            const count = (test) => invoices.filter(test).length;
            return {
                id: row.id,
                workDate: row.work_date,
                type: row.assignment_type,
                companyName: row.company_name,
                area: row.area,
                documentName: row.document_name,
                assigneeName: row.assignee_name,
                marketingStaffName: row.marketing_staff_name,
                assignmentStatus: row.status,
                markedAt: row.completed_at,
                autoSalesOff: autoSalesOff(row.company_name),
                readError: error,
                invoices,
                summary: {
                    total: invoices.length,
                    created: count((i) => i.created),
                    notCreated: count((i) => !i.created),
                    delivered: count((i) => i.status === 'delivered'),
                    cancelled: count((i) => i.status === 'cancelled'),
                    returned: count((i) => i.status === 'returned'),
                    pending: count((i) => i.created && !['delivered', 'cancelled', 'returned'].includes(i.status)),
                    paymentUpdated: count((i) => i.paymentUpdated),
                    autoCreated: count((i) => i.autoCreated),
                },
            };
        });
        return res.json({
            assignments,
            skippedNonPdf: rows.length - pdfRows.length,
        });
    } catch (error) {
        return sendError(res, error, 'Unable to load the invoice report.');
    }
};

// POST /api/staff/invoice-report/:id/reread: read the PDF again (e.g. after a reading error).
export const rereadAssignment = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT id, document_url, document_name FROM document_assignments WHERE id = ?', [Number(req.params.id)]);
        const row = rows[0];
        if (!row || !row.document_url || !isPdf(row)) return res.status(404).json({ error: 'No invoice PDF on this assignment.' });
        const result = await readAssignment(row);
        if (result.error) return res.status(422).json({ error: result.error });
        return res.json({ message: `Found ${result.numbers.length} invoice number(s).`, count: result.numbers.length });
    } catch (error) {
        return sendError(res, error, 'Unable to read the PDF again.');
    }
};
