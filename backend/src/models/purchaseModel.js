import db from '../config/db.js';
import PurchaseSellerModel from './purchaseSellerModel.js';

class PurchaseModel {
    static buildDateWhere(startDate, endDate) {
        const clauses = [];
        const params = [];

        if (startDate) {
            clauses.push('COALESCE(pe.invoice_date, DATE(pe.created_at)) >= ?');
            params.push(startDate);
        }
        if (endDate) {
            clauses.push('COALESCE(pe.invoice_date, DATE(pe.created_at)) <= ?');
            params.push(endDate);
        }

        return {
            sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
            params,
        };
    }

    static async create(data) {
        const seller = await PurchaseSellerModel.upsert(data);

        const [result] = await db.execute(
            `INSERT INTO purchase_entries
             (seller_id, invoice_number, eway_bill_no, eway_bill_date, invoice_date,
              sales_order_number, fssai_number, gross_amount, trader_discount_value,
              primary_discount_value, secondary_discount_value, cash_discount_value,
              taxable_value, cgst_amount, sgst_amount, total_gst_amount, round_off, rounded_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                seller.id,
                data.invoiceNumber,
                data.ewayBillNo || null,
                data.ewayBillDate || null,
                data.invoiceDate || null,
                data.salesOrderNumber || null,
                data.fssaiNumber || null,
                data.grossAmount,
                data.traderDiscountValue,
                data.primaryDiscountValue,
                data.secondaryDiscountValue,
                data.cashDiscountValue,
                data.taxableValue,
                data.cgstAmount,
                data.sgstAmount,
                data.totalGstAmount,
                data.roundOff,
                data.roundedTotal,
            ]
        );

        return PurchaseModel.getById(result.insertId);
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT pe.id, pe.seller_id, pe.invoice_number, pe.eway_bill_no,
                    DATE_FORMAT(pe.eway_bill_date, '%Y-%m-%d') AS eway_bill_date,
                    DATE_FORMAT(pe.invoice_date, '%Y-%m-%d') AS invoice_date,
                    pe.sales_order_number, pe.fssai_number, pe.gross_amount,
                    pe.trader_discount_value, pe.primary_discount_value,
                    pe.secondary_discount_value, pe.cash_discount_value,
                    pe.taxable_value, pe.cgst_amount, pe.sgst_amount,
                    pe.total_gst_amount, pe.round_off, pe.rounded_total,
                    ps.seller_name, ps.address, ps.city, ps.state, ps.gstin, ps.pan_no, ps.in_code,
                    DATE_FORMAT(pe.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM purchase_entries pe
             JOIN purchase_sellers ps ON ps.id = pe.seller_id
             WHERE pe.id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    static async getRecent() {
        const [rows] = await db.execute(
            `SELECT pe.id, pe.seller_id, pe.invoice_number, pe.eway_bill_no,
                    DATE_FORMAT(pe.eway_bill_date, '%Y-%m-%d') AS eway_bill_date,
                    DATE_FORMAT(pe.invoice_date, '%Y-%m-%d') AS invoice_date,
                    pe.sales_order_number, pe.fssai_number, pe.gross_amount,
                    pe.trader_discount_value, pe.primary_discount_value,
                    pe.secondary_discount_value, pe.cash_discount_value,
                    pe.taxable_value, pe.cgst_amount, pe.sgst_amount,
                    pe.total_gst_amount, pe.round_off, pe.rounded_total,
                    ps.seller_name, ps.address, ps.city, ps.state, ps.gstin, ps.pan_no, ps.in_code,
                    DATE_FORMAT(pe.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM purchase_entries pe
             JOIN purchase_sellers ps ON ps.id = pe.seller_id
             ORDER BY pe.id DESC
             LIMIT 200`
        );
        return rows;
    }

    static async getReportSummary(startDate, endDate) {
        const dateWhere = PurchaseModel.buildDateWhere(startDate, endDate);

        const [[summary], [todaySummary]] = await Promise.all([
            db.execute(
                `SELECT COALESCE(SUM(pe.rounded_total), 0) AS total_purchase,
                        COALESCE(SUM(pe.taxable_value), 0) AS total_taxable_value,
                        COALESCE(SUM(pe.total_gst_amount), 0) AS total_gst_amount,
                        COUNT(*) AS total_invoices,
                        COUNT(DISTINCT pe.seller_id) AS seller_count,
                        COALESCE(AVG(pe.rounded_total), 0) AS average_purchase
                 FROM purchase_entries pe
                 ${dateWhere.sql}`,
                dateWhere.params
            ).then(([rows]) => rows),
            db.execute(
                `SELECT COALESCE(SUM(pe.rounded_total), 0) AS today_purchase,
                        COUNT(*) AS today_invoices
                 FROM purchase_entries pe
                 WHERE COALESCE(pe.invoice_date, DATE(pe.created_at)) = CURDATE()`
            ).then(([rows]) => rows),
        ]);

        return {
            total_purchase: parseFloat(summary.total_purchase) || 0,
            total_taxable_value: parseFloat(summary.total_taxable_value) || 0,
            total_gst_amount: parseFloat(summary.total_gst_amount) || 0,
            total_invoices: Number(summary.total_invoices) || 0,
            seller_count: Number(summary.seller_count) || 0,
            average_purchase: parseFloat(summary.average_purchase) || 0,
            today_purchase: parseFloat(todaySummary.today_purchase) || 0,
            today_invoices: Number(todaySummary.today_invoices) || 0,
        };
    }

    static async getPurchasesByPeriod(startDate, endDate) {
        const dateWhere = PurchaseModel.buildDateWhere(startDate, endDate);

        const [monthly, yearly] = await Promise.all([
            db.execute(
                `SELECT DATE_FORMAT(COALESCE(pe.invoice_date, DATE(pe.created_at)), '%Y-%m') AS period,
                        COALESCE(SUM(pe.rounded_total), 0) AS total_purchase,
                        COUNT(*) AS count
                 FROM purchase_entries pe
                 ${dateWhere.sql}
                 GROUP BY DATE_FORMAT(COALESCE(pe.invoice_date, DATE(pe.created_at)), '%Y-%m')
                 ORDER BY period DESC
                 LIMIT 12`,
                dateWhere.params
            ).then(([rows]) => rows.map((row) => ({
                ...row,
                total_purchase: parseFloat(row.total_purchase) || 0,
                count: Number(row.count) || 0,
            }))),
            db.execute(
                `SELECT YEAR(COALESCE(pe.invoice_date, DATE(pe.created_at))) AS period,
                        COALESCE(SUM(pe.rounded_total), 0) AS total_purchase,
                        COUNT(*) AS count
                 FROM purchase_entries pe
                 ${dateWhere.sql}
                 GROUP BY YEAR(COALESCE(pe.invoice_date, DATE(pe.created_at)))
                 ORDER BY period DESC
                 LIMIT 10`,
                dateWhere.params
            ).then(([rows]) => rows.map((row) => ({
                ...row,
                total_purchase: parseFloat(row.total_purchase) || 0,
                count: Number(row.count) || 0,
            }))),
        ]);

        return { monthly, yearly };
    }

    static async getReports(startDate, endDate) {
        const [summary, purchasesByPeriod] = await Promise.all([
            PurchaseModel.getReportSummary(startDate, endDate),
            PurchaseModel.getPurchasesByPeriod(startDate, endDate),
        ]);

        return {
            summary,
            purchasesByPeriod,
        };
    }
}

export default PurchaseModel;
