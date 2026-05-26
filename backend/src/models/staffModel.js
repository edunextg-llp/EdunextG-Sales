import db from '../config/db.js';
import { formatStickerNumber } from '../utils/stickerNumber.js';

class StaffModel {
    static async create(name, contactNo, companyId = null) {
        const [result] = await db.execute(
            'INSERT INTO staff (name, contact_no, company_id) VALUES (?, ?, ?)',
            [name, contactNo, companyId]
        );
        return result.insertId;
    }

    static async addLocation(staffId, day, locationName) {
        await db.execute(
            'INSERT INTO staff_locations (staff_id, day, location_name) VALUES (?, ?, ?)',
            [staffId, day, locationName]
        );
    }

    static async getLocationsByStaffAndDay(staffId, day) {
        const [rows] = await db.execute(
            'SELECT * FROM staff_locations WHERE staff_id = ? AND day = ?',
            [staffId, day]
        );
        return rows;
    }

    static async searchByName(query) {
        const [rows] = await db.execute(
            `SELECT s.id, s.name, s.contact_no, c.name AS company_name
             FROM staff s
             LEFT JOIN companies c ON s.company_id = c.id
             WHERE s.name LIKE ?`,
            [`%${query}%`]
        );
        return rows;
    }

    static async getDetails(id) {
        const [rows] = await db.execute(
            `SELECT s.id, s.name, s.contact_no, s.company_id, c.name AS company_name
             FROM staff s
             LEFT JOIN companies c ON s.company_id = c.id
             WHERE s.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async addCounter(staffId, day, location, counterData) {
        const { outletErpId, outletName, contactNumber } = counterData;
        await db.execute(
            'INSERT INTO staff_counters (staff_id, day, location, outlet_erp_id, outlet_name, contact_number) VALUES (?, ?, ?, ?, ?, ?)',
            [staffId, day, location, outletErpId, outletName, contactNumber]
        );
    }

    static async update(id, name, contactNo, companyId = null) {
        await db.execute(
            'UPDATE staff SET name = ?, contact_no = ?, company_id = ? WHERE id = ?',
            [name, contactNo, companyId, id]
        );
    }

    static async deleteLocations(staffId) {
        await db.execute(
            'DELETE FROM staff_locations WHERE staff_id = ?',
            [staffId]
        );
    }

    static async getAllLocations(staffId) {
        const [rows] = await db.execute(
            'SELECT * FROM staff_locations WHERE staff_id = ?',
            [staffId]
        );
        return rows;
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT s.id, s.name, s.contact_no, s.company_id, c.name AS company_name
             FROM staff s
             LEFT JOIN companies c ON s.company_id = c.id
             ORDER BY s.name`
        );
        return rows;
    }

    static async getOutletsForStaffAndDay(staffId, dayName) {
        const [rows] = await db.execute(
            'SELECT id, outlet_erp_id, outlet_name, contact_number FROM staff_counters WHERE staff_id = ? AND day = ?',
            [staffId, dayName]
        );
        return rows;
    }

    static async getMissingSalesOutletsForDate(staffId, dayName, date) {
        const [rows] = await db.execute(
            `SELECT c.id, c.outlet_erp_id, c.outlet_name, c.contact_number 
             FROM staff_counters c
             WHERE c.staff_id = ? AND c.day = ?
               AND c.id NOT IN (
                   SELECT outlet_id FROM staff_sales 
                   WHERE staff_id = ? AND sale_date = ?
               )`,
            [staffId, dayName, staffId, date]
        );
        return rows;
    }

    static async getNextStickerNumber(connection) {
        await connection.execute(
            'UPDATE sticker_sequence SET seq_value = seq_value + 1 WHERE id = 1'
        );
        const [rows] = await connection.execute(
            'SELECT seq_value FROM sticker_sequence WHERE id = 1'
        );
        return formatStickerNumber(rows[0].seq_value);
    }

    static async saveSales(staffId, date, salesData) {
        // salesData: [{ outletId, invoiceNumber, price }] -> returns sticker print data
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const stickers = [];

            for (const item of salesData) {
                const [existing] = await connection.execute(
                    `SELECT sticker_number FROM staff_sales
                     WHERE staff_id = ? AND outlet_id = ? AND sale_date = ?`,
                    [staffId, item.outletId, date]
                );

                let stickerNumber = existing[0]?.sticker_number;
                if (!stickerNumber) {
                    stickerNumber = await StaffModel.getNextStickerNumber(connection);
                }

                await connection.execute(
                    `INSERT INTO staff_sales
                     (staff_id, outlet_id, sale_date, invoice_number, price, sticker_number, payment_mode, delivery_boy_id, vehicle_no)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                       invoice_number = VALUES(invoice_number),
                       price = VALUES(price),
                       payment_mode = VALUES(payment_mode),
                       delivery_boy_id = VALUES(delivery_boy_id),
                       vehicle_no = VALUES(vehicle_no)`,
                    [
                        staffId,
                        item.outletId,
                        date,
                        item.invoiceNumber,
                        item.price,
                        stickerNumber,
                        item.paymentMode,
                        item.deliveryBoyId,
                        item.vehicleNo,
                    ]
                );

                const [outletRows] = await connection.execute(
                    'SELECT outlet_name, outlet_erp_id FROM staff_counters WHERE id = ?',
                    [item.outletId]
                );

                const [deliveryBoyRows] = await connection.execute(
                    'SELECT name FROM delivery_boys WHERE id = ?',
                    [item.deliveryBoyId]
                );

                stickers.push({
                    stickerNumber,
                    shopName: outletRows[0]?.outlet_name || 'Unknown Shop',
                    outletErpId: outletRows[0]?.outlet_erp_id || '',
                    invoiceNumber: item.invoiceNumber,
                    amount: item.price,
                    paymentMode: item.paymentMode,
                    deliveryBoyName: deliveryBoyRows[0]?.name || '',
                    vehicleNo: item.vehicleNo || '',
                });
            }

            await connection.commit();
            return stickers;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getSalesByDate(staffId, date) {
        const [rows] = await db.execute(
            `SELECT ss.id, ss.staff_id, ss.outlet_id, ss.sale_date, ss.price, ss.invoice_number, 
                    ss.sticker_number, ss.payment_mode, ss.paid_amount, ss.balance_amount, 
                    ss.reference_no, ss.reference_date, ss.credit_days, ss.vehicle_no,
                    sc.outlet_name, sc.outlet_erp_id,
                    db.name as delivery_boy_name
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN delivery_boys db ON ss.delivery_boy_id = db.id
             WHERE ss.staff_id = ? AND ss.sale_date = ?`,
            [staffId, date]
        );
        return rows;
    }

    static async updatePayment(saleId, paymentData) {
        const { paymentMode, paidAmount, balanceAmount, referenceNo, referenceDate, creditDays } = paymentData;
        
        await db.execute(
            `UPDATE staff_sales 
             SET payment_mode = ?, paid_amount = ?, balance_amount = ?, 
                 reference_no = ?, reference_date = ?, credit_days = ?
             WHERE id = ?`,
            [paymentMode, paidAmount, balanceAmount, referenceNo, referenceDate, creditDays, saleId]
        );
    }

    static async getPendingCredits() {
        const [rows] = await db.execute(
            `SELECT ss.id, ss.invoice_number, ss.balance_amount, ss.sale_date, ss.credit_days,
                    sc.outlet_name, s.name as staff_name
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             WHERE ss.payment_mode = 'credit' OR ss.balance_amount > 0
             ORDER BY ss.sale_date ASC`
        );
        return rows;
    }
}

export default StaffModel;
