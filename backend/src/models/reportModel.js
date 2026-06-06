import db from '../config/db.js';

const moneyFields = [
    'total_sales',
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

    static async getSummary(startDate, endDate) {
        const salesWhere = ReportModel.buildDateWhere('sale_date', startDate, endDate);
        const paymentWhere = ReportModel.buildDateWhere('payment_date', startDate, endDate);

        const [[salesSummary], [collectionSummary]] = await Promise.all([
            db.execute(
                `SELECT COALESCE(SUM(price), 0) AS total_sales,
                        COALESCE(SUM(balance_amount), 0) AS total_outstanding
                 FROM staff_sales
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

    static async getTodayCollection() {
        const [rows] = await db.execute(
            `SELECT payment_mode, COALESCE(SUM(amount), 0) AS total_amount, COUNT(*) AS count
             FROM sale_payments
             WHERE payment_date = CURDATE()
               AND payment_mode IN ('cash', 'upi', 'cheque')
             GROUP BY payment_mode
             ORDER BY FIELD(payment_mode, 'cash', 'upi', 'cheque')`
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

    static async getSalesByPeriod(startDate, endDate) {
        const dateWhere = ReportModel.buildDateWhere('sale_date', startDate, endDate);
        const filterSql = dateWhere.sql;

        const [weekly, monthly, quarterly, yearly] = await Promise.all([
            db.execute(
                `SELECT period,
                        COALESCE(SUM(price), 0) AS total_sales,
                        COUNT(*) AS count
                 FROM (
                    SELECT DATE_FORMAT(DATE_SUB(sale_date, INTERVAL WEEKDAY(sale_date) DAY), '%Y-%m-%d') AS period,
                           price
                    FROM staff_sales
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
                    SELECT DATE_FORMAT(sale_date, '%Y-%m') AS period,
                           price
                    FROM staff_sales
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
                    SELECT CONCAT(YEAR(sale_date), '-Q', QUARTER(sale_date)) AS period,
                           YEAR(sale_date) AS period_year,
                           QUARTER(sale_date) AS period_quarter,
                           price
                    FROM staff_sales
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
                    SELECT YEAR(sale_date) AS period,
                           price
                    FROM staff_sales
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

    static async getReports(startDate, endDate) {
        const [
            summary,
            collectionByMode,
            todayCollection,
            monthlyCollection,
            yearlyCollection,
            salesByPeriod,
            chequeReports,
            duesReport,
            creditDuesSummary,
        ] = await Promise.all([
            ReportModel.getSummary(startDate, endDate),
            ReportModel.getCollectionByMode(startDate, endDate),
            ReportModel.getTodayCollection(),
            ReportModel.getMonthlyCollection(startDate, endDate),
            ReportModel.getYearlyCollection(startDate, endDate),
            ReportModel.getSalesByPeriod(startDate, endDate),
            ReportModel.getChequeReports(startDate, endDate),
            ReportModel.getDuesReport(),
            ReportModel.getCreditDuesSummary(),
        ]);

        return {
            summary,
            collectionByMode,
            todayCollection,
            monthlyCollection,
            yearlyCollection,
            salesByPeriod,
            chequeReports,
            duesReport,
            creditDuesSummary,
        };
    }
}

export default ReportModel;
