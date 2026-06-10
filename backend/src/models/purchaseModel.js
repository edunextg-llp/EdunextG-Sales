import db from '../config/db.js';
import PurchaseSellerModel from './purchaseSellerModel.js';

class PurchaseModel {
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
}

export default PurchaseModel;
