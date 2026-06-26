import db from '../config/db.js';

const moneyFields = [
    'total_sales',
    'total_paid',
    'total_collection',
    'total_outstanding',
    'amount',
    'total_amount',
    'cash_amount',
    'upi_amount',
    'cheque_amount',
    'credit_amount',
    'price',
    'paid_amount',
    'balance_amount',
];

function toNumberRows(rows) {
    return rows.map((row) => {
        const next = { ...row };
        for (const field of moneyFields) {
            if (next[field] != null) {
                next[field] = parseFloat(next[field]) || 0;
            }
        }
        return next;
    });
}

class ReportModel {
    static buildDateWhere(alias, startDate, endDate) {
        const clauses = [];
        const params = [];

        if (startDate) {
            clauses.push(`${alias} >= ?`);
            params.push(startDate);
        }
        if (endDate) {
            clauses.push(`${alias} <= ?`);
            params.push(endDate);
        }

        return {
            sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
            params,
        };
    }

    static buildSalesWhere(alias, startDate, endDate, companyId = null, staffId = null) {
        const clauses = [];
        const params = [];

        if (startDate) {
            clauses.push(`${alias}.sale_date >= ?`);
            params.push(startDate);
        }
        if (endDate) {
            clauses.push(`${alias}.sale_date <= ?`);
            params.push(endDate);
        }
        if (companyId) {
            clauses.push(`EXISTS (
                SELECT 1
                FROM staff s_filter
                LEFT JOIN staff_companies sc_filter ON sc_filter.staff_id = s_filter.id
                WHERE s_filter.id = ${alias}.staff_id
                  AND (s_filter.company_id = ? OR sc_filter.company_id = ?)
            )`);
            params.push(companyId, companyId);
        }
        if (staffId) {
            clauses.push(`${alias}.staff_id = ?`);
            params.push(staffId);
        }

        return {
            sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
            params,
        };
    }

    static async getSummary(startDate, endDate, companyId = null, staffId = null) {
        const salesWhere = ReportModel.buildSalesWhere('ss', startDate, endDate, companyId, staffId);
        const paymentWhere = ReportModel.buildDateWhere('payment_date', startDate, endDate);

        const [[salesSummary], [collectionSummary]] = await Promise.all([
            db.execute(
                `SELECT COALESCE(SUM(price), 0) AS total_sales,
                        COALESCE(SUM(paid_amount), 0) AS total_paid,
                        COALESCE(SUM(balance_amount), 0) AS total_outstanding
                 FROM staff_sales ss
                 ${salesWhere.sql}`,
                salesWhere.params
            ).then(([rows]) => rows),
            db.execute(
                `SELECT COALESCE(SUM(amount), 0) AS total_collection
                 FROM sale_payments
                 ${paymentWhere.sql ? `${paymentWhere.sql} AND` : 'WHERE'} payment_mode IN ('cash', 'upi', 'cheque')`,
                paymentWhere.params
            ).then(([rows]) => rows),
        ]);

        return {
            total_sales: parseFloat(salesSummary.total_sales) || 0,
            total_paid: parseFloat(salesSummary.total_paid) || 0,
            total_collection: parseFloat(collectionSummary.total_collection) || 0,
            total_outstanding: parseFloat(salesSummary.total_outstanding) || 0,
        };
    }

    static async getCollectionByMode(startDate, endDate) {
        const dateWhere = ReportModel.buildDateWhere('payment_date', startDate, endDate);
        const [rows] = await db.execute(
            `SELECT payment_mode, COALESCE(SUM(amount), 0) AS total_amount, COUNT(*) AS count
             FROM sale_payments
             ${dateWhere.sql ? `${dateWhere.sql} AND` : 'WHERE'} payment_mode IN ('cash', 'upi', 'cheque')
             GROUP BY payment_mode
             ORDER BY FIELD(payment_mode, 'cash', 'upi', 'cheque')`,
            dateWhere.params
        );
        return toNumberRows(rows);
    }

    static async getTodayCollection(startDate, endDate) {
        const dateWhere = ReportModel.buildDateWhere('payment_date', startDate, endDate);
        const [rows] = await db.execute(
            `SELECT payment_mode, COALESCE(SUM(amount), 0) AS total_amount, COUNT(*) AS count
             FROM sale_payments
             ${dateWhere.sql ? `${dateWhere.sql} AND` : 'WHERE payment_date = CURDATE() AND'} payment_mode IN ('cash', 'upi', 'cheque')
             GROUP BY payment_mode
             ORDER BY FIELD(payment_mode, 'cash', 'upi', 'cheque')`,
            dateWhere.params
        );
        return toNumberRows(rows);
    }

    static async getTodayCollectionDetails(startDate, endDate) {
        const dateWhere = ReportModel.buildDateWhere('sp.payment_date', startDate, endDate);
        const [rows] = await db.execute(
            `SELECT outlet_staff.id AS outlet_staff_id,
                    outlet_staff.name AS outlet_staff_name,
                    sc.id AS outlet_id,
                    sc.outlet_name,
                    sc.outlet_erp_id,
                    ss.id AS sale_id,
                    ss.invoice_number,
                    CASE
                        WHEN sp.collector_name IS NOT NULL
                             AND TRIM(sp.collector_name) <> ''
                             AND sp.collector_staff_id IS NULL THEN 'bawarchee_staff'
                        ELSE 'company_staff'
                    END AS collector_type,
                    COALESCE(collector.name, outlet_staff.name, sale_staff.name, 'N/A') AS company_collector_name,
                    sp.collector_name AS bawarchee_collector_name,
                    COALESCE(collector.name, sp.collector_name, sale_staff.name, 'N/A') AS staff_name,
                    sale_staff.id AS sale_staff_id,
                    sale_staff.name AS sale_staff_name,
                    COALESCE(SUM(CASE WHEN sp.payment_mode = 'cash' THEN sp.amount ELSE 0 END), 0) AS cash_amount,
                    COALESCE(SUM(CASE WHEN sp.payment_mode = 'upi' THEN sp.amount ELSE 0 END), 0) AS upi_amount,
                    COALESCE(SUM(CASE WHEN sp.payment_mode = 'cheque' THEN sp.amount ELSE 0 END), 0) AS cheque_amount,
                    COALESCE(SUM(sp.amount), 0) AS total_amount
             FROM sale_payments sp
             JOIN staff_sales ss ON ss.id = sp.sale_id
             LEFT JOIN staff sale_staff ON sale_staff.id = ss.staff_id
             LEFT JOIN staff collector ON collector.id = sp.collector_staff_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN staff outlet_staff ON outlet_staff.id = sc.staff_id
             ${dateWhere.sql ? `${dateWhere.sql} AND` : 'WHERE sp.payment_date = CURDATE() AND'} sp.payment_mode IN ('cash', 'upi', 'cheque')
             GROUP BY outlet_staff.id, outlet_staff.name, sc.id, sc.outlet_name, sc.outlet_erp_id,
                      ss.id, ss.invoice_number, sp.collector_staff_id, sp.collector_name,
                      collector.id, collector.name, sale_staff.id, sale_staff.name
             ORDER BY outlet_staff.name ASC, sc.outlet_name ASC,
                      CASE
                          WHEN sp.collector_name IS NOT NULL
                               AND TRIM(sp.collector_name) <> ''
                               AND sp.collector_staff_id IS NULL THEN 1
                          ELSE 0
                      END ASC,
                      ss.invoice_number ASC`,
            dateWhere.params
        );
        return toNumberRows(rows);
    }

    static async getCollectionDetails(startDate, endDate) {
        const dateWhere = ReportModel.buildDateWhere('sp.payment_date', startDate, endDate);
        const [rows] = await db.execute(
            `SELECT outlet_staff.id AS outlet_staff_id,
                    outlet_staff.name AS outlet_staff_name,
                    sc.id AS outlet_id,
                    sc.outlet_name,
                    sc.outlet_erp_id,
                    ss.id AS sale_id,
                    ss.invoice_number,
                    CASE
                        WHEN sp.collector_name IS NOT NULL
                             AND TRIM(sp.collector_name) <> ''
                             AND sp.collector_staff_id IS NULL THEN 'bawarchee_staff'
                        ELSE 'company_staff'
                    END AS collector_type,
                    COALESCE(collector.name, outlet_staff.name, sale_staff.name, 'N/A') AS company_collector_name,
                    sp.collector_name AS bawarchee_collector_name,
                    COALESCE(collector.name, sp.collector_name, sale_staff.name, 'N/A') AS staff_name,
                    sale_staff.id AS sale_staff_id,
                    sale_staff.name AS sale_staff_name,
                    COALESCE(SUM(CASE WHEN sp.payment_mode = 'cash' THEN sp.amount ELSE 0 END), 0) AS cash_amount,
                    COALESCE(SUM(CASE WHEN sp.payment_mode = 'upi' THEN sp.amount ELSE 0 END), 0) AS upi_amount,
                    COALESCE(SUM(CASE WHEN sp.payment_mode = 'cheque' THEN sp.amount ELSE 0 END), 0) AS cheque_amount,
                    COALESCE(SUM(sp.amount), 0) AS total_amount
             FROM sale_payments sp
             JOIN staff_sales ss ON ss.id = sp.sale_id
             LEFT JOIN staff sale_staff ON sale_staff.id = ss.staff_id
             LEFT JOIN staff collector ON collector.id = sp.collector_staff_id
             LEFT JOIN staff_counters sc ON sc.id = ss.outlet_id
             LEFT JOIN staff outlet_staff ON outlet_staff.id = sc.staff_id
             ${dateWhere.sql ? `${dateWhere.sql} AND` : 'WHERE'} sp.payment_mode IN ('cash', 'upi', 'cheque')
             GROUP BY outlet_staff.id, outlet_staff.name, sc.id, sc.outlet_name, sc.outlet_erp_id,
                      ss.id, ss.invoice_number, sp.collector_staff_id, sp.collector_name,
                      collector.id, collector.name, sale_staff.id, sale_staff.name
             ORDER BY outlet_staff.name ASC, sc.outlet_name ASC,
                      CASE
                          WHEN sp.collector_name IS NOT NULL
                               AND TRIM(sp.collector_name) <> ''
                               AND sp.collector_staff_id IS NULL THEN 1
                          ELSE 0
                      END ASC,
                      ss.invoice_number ASC`,
            dateWhere.params
        );
        return toNumberRows(rows);
    }

    static async getMonthlyCollection(startDate, endDate) {
        const dateWhere = ReportModel.buildDateWhere('payment_date', startDate, endDate);
        const [rows] = await db.execute(
            `SELECT DATE_FORMAT(payment_date, '%Y-%m') AS period,
                    COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN amount ELSE 0 END), 0) AS cash_amount,
                    COALESCE(SUM(CASE WHEN payment_mode = 'upi' THEN amount ELSE 0 END), 0) AS upi_amount,
                    COALESCE(SUM(CASE WHEN payment_mode = 'cheque' THEN amount ELSE 0 END), 0) AS cheque_amount,
                    COALESCE(SUM(amount), 0) AS total_amount
             FROM sale_payments
             ${dateWhere.sql ? `${dateWhere.sql} AND` : 'WHERE'} payment_mode IN ('cash', 'upi', 'cheque')
             GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
             ORDER BY period DESC
             LIMIT 24`,
            dateWhere.params
        );
        return toNumberRows(rows);
    }

    static async getYearlyCollection(startDate, endDate) {
        const dateWhere = ReportModel.buildDateWhere('payment_date', startDate, endDate);
        const [rows] = await db.execute(
            `SELECT YEAR(payment_date) AS period,
                    COALESCE(SUM(CASE WHEN payment_mode = 'cash' THEN amount ELSE 0 END), 0) AS cash_amount,
                    COALESCE(SUM(CASE WHEN payment_mode = 'upi' THEN amount ELSE 0 END), 0) AS upi_amount,
                    COALESCE(SUM(CASE WHEN payment_mode = 'cheque' THEN amount ELSE 0 END), 0) AS cheque_amount,
                    COALESCE(SUM(amount), 0) AS total_amount
             FROM sale_payments
             ${dateWhere.sql ? `${dateWhere.sql} AND` : 'WHERE'} payment_mode IN ('cash', 'upi', 'cheque')
             GROUP BY YEAR(payment_date)
             ORDER BY period DESC
             LIMIT 10`,
            dateWhere.params
        );
        return toNumberRows(rows);
    }

    static async getSalesByPeriod(startDate, endDate, companyId = null, staffId = null) {
        const dateWhere = ReportModel.buildSalesWhere('ss', startDate, endDate, companyId, staffId);
        const filterSql = dateWhere.sql;

        const [weekly, monthly, quarterly, yearly] = await Promise.all([
            db.execute(
                `SELECT period,
                        COALESCE(SUM(price), 0) AS total_sales,
                        COUNT(*) AS count
                 FROM (
                    SELECT DATE_FORMAT(DATE_SUB(ss.sale_date, INTERVAL WEEKDAY(ss.sale_date) DAY), '%Y-%m-%d') AS period,
                           ss.price
                    FROM staff_sales ss
                    ${filterSql}
                 ) period_sales
                 GROUP BY period
                 ORDER BY period DESC
                 LIMIT 12`,
                dateWhere.params
            ).then(([rows]) => toNumberRows(rows)),
            db.execute(
                `SELECT period,
                        COALESCE(SUM(price), 0) AS total_sales,
                        COUNT(*) AS count
                 FROM (
                    SELECT DATE_FORMAT(ss.sale_date, '%Y-%m') AS period,
                           ss.price
                    FROM staff_sales ss
                    ${filterSql}
                 ) period_sales
                 GROUP BY period
                 ORDER BY period DESC
                 LIMIT 12`,
                dateWhere.params
            ).then(([rows]) => toNumberRows(rows)),
            db.execute(
                `SELECT period,
                        COALESCE(SUM(price), 0) AS total_sales,
                        COUNT(*) AS count
                 FROM (
                    SELECT CONCAT(YEAR(ss.sale_date), '-Q', QUARTER(ss.sale_date)) AS period,
                           YEAR(ss.sale_date) AS period_year,
                           QUARTER(ss.sale_date) AS period_quarter,
                           ss.price
                    FROM staff_sales ss
                    ${filterSql}
                 ) period_sales
                 GROUP BY period, period_year, period_quarter
                 ORDER BY period_year DESC, period_quarter DESC
                 LIMIT 8`,
                dateWhere.params
            ).then(([rows]) => toNumberRows(rows)),
            db.execute(
                `SELECT period,
                        COALESCE(SUM(price), 0) AS total_sales,
                        COUNT(*) AS count
                 FROM (
                    SELECT YEAR(ss.sale_date) AS period,
                           ss.price
                    FROM staff_sales ss
                    ${filterSql}
                 ) period_sales
                 GROUP BY period
                 ORDER BY period DESC
                 LIMIT 5`,
                dateWhere.params
            ).then(([rows]) => toNumberRows(rows)),
        ]);

        return { weekly, monthly, quarterly, yearly };
    }

    static async getStaffSalesSummary(startDate, endDate, companyId = null, staffId = null) {
        const salesWhere = ReportModel.buildSalesWhere('ss', startDate, endDate, companyId, staffId);
        const [rows] = await db.execute(
            `SELECT ss.staff_id, s.name AS staff_name,
                    COALESCE(SUM(ss.price), 0) AS total_sales,
                    COUNT(*) AS count
             FROM staff_sales ss
             LEFT JOIN staff s ON s.id = ss.staff_id
             ${salesWhere.sql}
             GROUP BY ss.staff_id, s.name
             ORDER BY total_sales DESC, s.name ASC`,
            salesWhere.params
        );
        return toNumberRows(rows);
    }

    static async getStaffMonthlySales(startDate, endDate, companyId = null, staffId = null) {
        const salesWhere = ReportModel.buildSalesWhere('ss', startDate, endDate, companyId, staffId);
        const [rows] = await db.execute(
            `SELECT DATE_FORMAT(ss.sale_date, '%Y-%m') AS period,
                    ss.staff_id,
                    s.name AS staff_name,
                    COALESCE(SUM(ss.price), 0) AS total_sales,
                    COUNT(*) AS count
             FROM staff_sales ss
             LEFT JOIN staff s ON s.id = ss.staff_id
             ${salesWhere.sql}
             GROUP BY DATE_FORMAT(ss.sale_date, '%Y-%m'), ss.staff_id, s.name
             ORDER BY period DESC, s.name ASC`,
            salesWhere.params
        );
        return toNumberRows(rows);
    }

    static async getCompanySalesSummary(startDate, endDate, companyId = null, staffId = null) {
        const salesWhere = ReportModel.buildSalesWhere('ss', startDate, endDate, companyId, staffId);
        const [rows] = await db.execute(
            `SELECT company_id, company_name,
                    COALESCE(SUM(price), 0) AS total_sales,
                    COUNT(*) AS count
             FROM (
                 SELECT DISTINCT ss.id AS sale_id,
                        ss.price,
                        c.id AS company_id,
                        c.name AS company_name
                 FROM staff_sales ss
                 LEFT JOIN staff s ON s.id = ss.staff_id
                 LEFT JOIN staff_companies sc ON sc.staff_id = s.id
                 LEFT JOIN companies c ON c.id = COALESCE(sc.company_id, s.company_id)
                 ${salesWhere.sql}
             ) company_sales
             WHERE company_id IS NOT NULL
             GROUP BY company_id, company_name
             ORDER BY total_sales DESC, company_name ASC`,
            salesWhere.params
        );
        return toNumberRows(rows);
    }

    static async getCompanyMonthlySales(startDate, endDate, companyId = null, staffId = null) {
        const salesWhere = ReportModel.buildSalesWhere('ss', startDate, endDate, companyId, staffId);
        const [rows] = await db.execute(
            `SELECT period, company_id, company_name,
                    COALESCE(SUM(price), 0) AS total_sales,
                    COUNT(*) AS count
             FROM (
                 SELECT DISTINCT ss.id AS sale_id,
                        DATE_FORMAT(ss.sale_date, '%Y-%m') AS period,
                        ss.price,
                        c.id AS company_id,
                        c.name AS company_name
                 FROM staff_sales ss
                 LEFT JOIN staff s ON s.id = ss.staff_id
                 LEFT JOIN staff_companies sc ON sc.staff_id = s.id
                 LEFT JOIN companies c ON c.id = COALESCE(sc.company_id, s.company_id)
                 ${salesWhere.sql}
             ) company_sales
             WHERE company_id IS NOT NULL
             GROUP BY period, company_id, company_name
             ORDER BY period DESC, company_name ASC`,
            salesWhere.params
        );
        return toNumberRows(rows);
    }

    static getUndepositedChequeNotExistsSql() {
        return `NOT EXISTS (
                   SELECT 1
                   FROM bank_deposits bd
                   WHERE bd.deposit_mode = 'cheque'
                     AND (
                         (
                             TRIM(bd.cheque_no) COLLATE utf8mb4_unicode_ci = TRIM(sp.reference_no) COLLATE utf8mb4_unicode_ci
                             OR TRIM(bd.cheque_no) COLLATE utf8mb4_unicode_ci LIKE CONCAT(TRIM(sp.reference_no) COLLATE utf8mb4_unicode_ci, ' (%')
                         )
                         OR (
                             JSON_VALID(bd.cash_details)
                             AND EXISTS (
                                 SELECT 1
                                 FROM JSON_TABLE(
                                     bd.cash_details,
                                     '$.cheques[*]' COLUMNS (
                                         payment_id INT PATH '$.paymentId' NULL ON EMPTY NULL ON ERROR,
                                         cheque_no VARCHAR(100) PATH '$.chequeNo' NULL ON EMPTY NULL ON ERROR
                                     )
                                 ) deposited_cheque
                                 WHERE deposited_cheque.payment_id = sp.id
                                    OR TRIM(deposited_cheque.cheque_no) COLLATE utf8mb4_unicode_ci = TRIM(sp.reference_no) COLLATE utf8mb4_unicode_ci
                             )
                         )
                     )
               )`;
    }

    static async getPendingCheques({ search = '', storeName = '', alarmOnly = true, dueByToday = false } = {}) {
        const conditions = ["sp.payment_mode = 'cheque'", ReportModel.getUndepositedChequeNotExistsSql()];
        const params = [];

        if (dueByToday) {
            conditions.push('sp.reference_date <= CURDATE()');
        } else if (alarmOnly) {
            conditions.push('sp.reference_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)');
        }
        if (search && String(search).trim()) {
            conditions.push('TRIM(sp.reference_no) LIKE ?');
            params.push(`%${String(search).trim()}%`);
        }
        if (storeName && String(storeName).trim()) {
            conditions.push('sc.outlet_name LIKE ?');
            params.push(`%${String(storeName).trim()}%`);
        }

        const [rows] = await db.execute(
            `SELECT sp.id, sp.sale_id,
                    DATE_FORMAT(sp.payment_date, '%Y-%m-%d') AS payment_date,
                    DATE_FORMAT(sp.reference_date, '%Y-%m-%d') AS deposit_date,
                    sp.reference_no, sp.amount,
                    ss.invoice_number, sc.outlet_name, sc.outlet_erp_id, s.name AS staff_name,
                    CASE
                        WHEN sp.reference_date < CURDATE()
                            THEN 'missed'
                        WHEN sp.reference_date = CURDATE()
                            THEN 'due_today'
                        WHEN sp.reference_date BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)
                            THEN 'alarm'
                        ELSE 'upcoming'
                    END AS report_status
             FROM sale_payments sp
             JOIN staff_sales ss ON sp.sale_id = ss.id
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             WHERE ${conditions.join(' AND ')}
             ORDER BY sp.reference_date ASC, sp.id DESC`,
            params
        );
        return toNumberRows(rows);
    }

    static async getChequeReports(startDate, endDate) {
        const dateWhere = ReportModel.buildDateWhere('sp.reference_date', startDate, endDate);
        const [rows] = await db.execute(
            `SELECT sp.id, sp.sale_id,
                    DATE_FORMAT(sp.payment_date, '%Y-%m-%d') AS payment_date,
                    DATE_FORMAT(sp.reference_date, '%Y-%m-%d') AS deposit_date,
                    sp.reference_no, sp.amount,
                    ss.invoice_number, sc.outlet_name, sc.outlet_erp_id, s.name AS staff_name,
                    CASE
                        WHEN sp.reference_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 2 DAY)
                            THEN 'alarm'
                        WHEN sp.reference_date <= CURDATE()
                            THEN 'clearing_done'
                        ELSE 'bank_submitted'
                    END AS report_status
             FROM sale_payments sp
             JOIN staff_sales ss ON sp.sale_id = ss.id
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             ${dateWhere.sql ? `${dateWhere.sql} AND` : 'WHERE'} sp.payment_mode = 'cheque'
               AND ${ReportModel.getUndepositedChequeNotExistsSql()}
             ORDER BY sp.reference_date ASC, sp.id DESC`,
            dateWhere.params
        );
        return toNumberRows(rows);
    }

    static async getDuesReport() {
        const [rows] = await db.execute(
            `SELECT sp.id, sp.sale_id, sp.amount AS credit_amount,
                    DATE_FORMAT(sp.payment_date, '%Y-%m-%d') AS credit_date,
                    sp.credit_days,
                    DATE_FORMAT(DATE_ADD(sp.payment_date, INTERVAL COALESCE(sp.credit_days, 0) DAY), '%Y-%m-%d') AS due_date,
                    DATEDIFF(CURDATE(), sp.payment_date) AS credit_age_days,
                    DATEDIFF(CURDATE(), DATE_ADD(sp.payment_date, INTERVAL COALESCE(sp.credit_days, 0) DAY)) AS overdue_days,
                    ss.invoice_number, ss.balance_amount,
                    sc.outlet_name, sc.outlet_erp_id, s.name AS staff_name
             FROM sale_payments sp
             JOIN staff_sales ss ON sp.sale_id = ss.id
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             WHERE sp.payment_mode = 'credit'
               AND ss.balance_amount > 0
               AND DATEDIFF(CURDATE(), sp.payment_date) BETWEEN 1 AND 30
             ORDER BY credit_age_days DESC, sp.payment_date ASC`
        );
        return toNumberRows(rows);
    }

    static async getCreditDuesSummary() {
        const [[row]] = await db.execute(
            `SELECT COALESCE(SUM(sp.amount), 0) AS total_credit_dues,
                    COUNT(*) AS credit_dues_count
             FROM sale_payments sp
             JOIN staff_sales ss ON sp.sale_id = ss.id
             WHERE sp.payment_mode = 'credit'
               AND ss.balance_amount > 0`
        );

        return {
            total_credit_dues: parseFloat(row.total_credit_dues) || 0,
            credit_dues_count: Number(row.credit_dues_count) || 0,
        };
    }

    static async getReports(startDate, endDate, filters = {}) {
        const companyId = filters.companyId || null;
        const staffId = filters.staffId || null;
        const [
            summary,
            collectionByMode,
            collectionDetails,
            todayCollection,
            todayCollectionDetails,
            monthlyCollection,
            yearlyCollection,
            salesByPeriod,
            chequeReports,
            pendingChequeReports,
            duesReport,
            creditDuesSummary,
            staffSalesSummary,
            staffMonthlySales,
            companySalesSummary,
            companyMonthlySales,
        ] = await Promise.all([
            ReportModel.getSummary(startDate, endDate, companyId, staffId),
            ReportModel.getCollectionByMode(startDate, endDate),
            ReportModel.getCollectionDetails(startDate, endDate),
            ReportModel.getTodayCollection(startDate, endDate),
            ReportModel.getTodayCollectionDetails(startDate, endDate),
            ReportModel.getMonthlyCollection(startDate, endDate),
            ReportModel.getYearlyCollection(startDate, endDate),
            ReportModel.getSalesByPeriod(startDate, endDate, companyId, staffId),
            ReportModel.getChequeReports(startDate, endDate),
            ReportModel.getPendingCheques({ alarmOnly: false }),
            ReportModel.getDuesReport(),
            ReportModel.getCreditDuesSummary(),
            ReportModel.getStaffSalesSummary(startDate, endDate, companyId, staffId),
            ReportModel.getStaffMonthlySales(startDate, endDate, companyId, staffId),
            ReportModel.getCompanySalesSummary(startDate, endDate, companyId, staffId),
            ReportModel.getCompanyMonthlySales(startDate, endDate, companyId, staffId),
        ]);

        return {
            summary,
            collectionByMode,
            collectionDetails,
            todayCollection,
            todayCollectionDetails,
            monthlyCollection,
            yearlyCollection,
            salesByPeriod,
            chequeReports,
            pendingChequeReports,
            duesReport,
            creditDuesSummary,
            staffSalesSummary,
            staffMonthlySales,
            companySalesSummary,
            companyMonthlySales,
        };
    }
}

export default ReportModel;
