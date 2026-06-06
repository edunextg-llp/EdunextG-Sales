import db from '../config/db.js';
import { formatStickerNumber } from '../utils/stickerNumber.js';

class StaffModel {
    static async create(name, contactNo, companyId = null, staffType = 'distributor') {
        const [result] = await db.execute(
            'INSERT INTO staff (name, contact_no, company_id, staff_type) VALUES (?, ?, ?, ?)',
            [name, contactNo, companyId, staffType]
        );
        return result.insertId;
    }

    static async setCompanies(staffId, companyIds = []) {
        await db.execute('DELETE FROM staff_companies WHERE staff_id = ?', [staffId]);

        const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean))];
        for (const companyId of uniqueCompanyIds) {
            await db.execute(
                'INSERT IGNORE INTO staff_companies (staff_id, company_id) VALUES (?, ?)',
                [staffId, companyId]
            );
        }
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
            `SELECT s.id, s.name, s.contact_no, s.staff_type,
                    COALESCE(sc.company_names, c.name) AS company_name
             FROM staff s
             LEFT JOIN companies c ON s.company_id = c.id
             LEFT JOIN (
                 SELECT sc.staff_id, GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names
                 FROM staff_companies sc
                 INNER JOIN companies c2 ON c2.id = sc.company_id
                 GROUP BY sc.staff_id
             ) sc ON sc.staff_id = s.id
             WHERE s.name LIKE ?`,
            [`%${query}%`]
        );
        return rows;
    }

    static async getDetails(id) {
        const [rows] = await db.execute(
            `SELECT s.id, s.name, s.contact_no, s.company_id, s.staff_type,
                    COALESCE(sc.company_names, c.name) AS company_name,
                    sc.company_ids
             FROM staff s
             LEFT JOIN companies c ON s.company_id = c.id
             LEFT JOIN (
                 SELECT sc.staff_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM staff_companies sc
                 INNER JOIN companies c2 ON c2.id = sc.company_id
                 GROUP BY sc.staff_id
             ) sc ON sc.staff_id = s.id
             WHERE s.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async addCounter(staffId, day, location, counterData) {
        const { outletErpId, outletName, contactNumber } = counterData;
        await db.execute(
            // `staff_counters` schema (see initDB.js) does not include a `location` column.
            // Frontend still sends `location`, but we ignore it here and store outlets by (staff_id, day).
            'INSERT INTO staff_counters (staff_id, day, outlet_erp_id, outlet_name, contact_number) VALUES (?, ?, ?, ?, ?)',
            [staffId, day, outletErpId, outletName, contactNumber]
        );
    }

    static async findDuplicateCounter(staffId, outletErpId, outletName, excludeCounterId = null) {
        const params = [staffId, outletErpId, outletName];
        let excludeClause = '';

        if (excludeCounterId) {
            excludeClause = ' AND id <> ?';
            params.push(excludeCounterId);
        }

        const [rows] = await db.execute(
            `SELECT id, outlet_erp_id, outlet_name
             FROM staff_counters
             WHERE staff_id = ?
               AND (LOWER(outlet_erp_id) = LOWER(?) OR LOWER(outlet_name) = LOWER(?))
               ${excludeClause}
             LIMIT 1`,
            params
        );
        return rows[0] || null;
    }

    static async getCounterById(counterId) {
        const [rows] = await db.execute(
            'SELECT id, staff_id, outlet_erp_id, outlet_name, contact_number FROM staff_counters WHERE id = ?',
            [counterId]
        );
        return rows[0] || null;
    }

    static async editCounter(counterId, counterData) {
        const { outletErpId, outletName, contactNumber } = counterData;
        await db.execute(
            'UPDATE staff_counters SET outlet_erp_id = ?, outlet_name = ?, contact_number = ? WHERE id = ?',
            [outletErpId, outletName, contactNumber, counterId]
        );
    }

    static async deleteCounter(counterId) {
        await db.execute(
            'DELETE FROM staff_counters WHERE id = ?',
            [counterId]
        );
    }

    static async update(id, name, contactNo, companyId = null, staffType = 'distributor') {
        await db.execute(
            'UPDATE staff SET name = ?, contact_no = ?, company_id = ?, staff_type = ? WHERE id = ?',
            [name, contactNo, companyId, staffType, id]
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
            `SELECT s.id, s.name, s.contact_no, s.company_id, s.staff_type,
                    COALESCE(sc.company_names, c.name) AS company_name,
                    sc.company_ids
             FROM staff s
             LEFT JOIN companies c ON s.company_id = c.id
             LEFT JOIN (
                 SELECT sc.staff_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM staff_companies sc
                 INNER JOIN companies c2 ON c2.id = sc.company_id
                 GROUP BY sc.staff_id
             ) sc ON sc.staff_id = s.id
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

    static async getAllCountersForStaff(staffId) {
        const [rows] = await db.execute(
            'SELECT id, outlet_erp_id, outlet_name, contact_number, day FROM staff_counters WHERE staff_id = ?',
            [staffId]
        );
        return rows;
    }

    static async getMissingSalesOutletsForDate(staffId, dayName, date) {
        const [rows] = await db.execute(
            `SELECT c.id, c.outlet_erp_id, c.outlet_name, c.contact_number 
             FROM staff_counters c
             INNER JOIN staff s ON s.id = c.staff_id
             WHERE c.staff_id = ?
               AND (c.day = ? OR (s.staff_type = 'cnf' AND c.day = 'CNF'))
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
            'INSERT IGNORE INTO sticker_sequence (id, seq_value) VALUES (1, 0)'
        );
        await connection.execute(
            'UPDATE sticker_sequence SET seq_value = seq_value + 1 WHERE id = 1'
        );
        const [rows] = await connection.execute(
            'SELECT seq_value FROM sticker_sequence WHERE id = 1'
        );
        if (!rows[0]) {
            throw new Error('Sticker sequence not initialized. Run node src/initDB.js on the server.');
        }
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
                     WHERE staff_id = ? AND outlet_id = ? AND sale_date = ? AND invoice_number = ?`,
                    [staffId, item.outletId, date, item.invoiceNumber]
                );

                let stickerNumber = existing[0]?.sticker_number;
                if (!stickerNumber) {
                    stickerNumber = await StaffModel.getNextStickerNumber(connection);
                }

                await connection.execute(
                    `INSERT INTO staff_sales
                     (staff_id, outlet_id, sale_date, invoice_number, price, sticker_number, payment_mode, delivery_boy_id, vehicle_no, paid_amount, balance_amount)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                     ON DUPLICATE KEY UPDATE
                       invoice_number = VALUES(invoice_number),
                       price = VALUES(price),
                       payment_mode = VALUES(payment_mode),
                       delivery_boy_id = VALUES(delivery_boy_id),
                       vehicle_no = VALUES(vehicle_no),
                       balance_amount = IF(staff_sales.paid_amount = 0, VALUES(price), staff_sales.balance_amount)`,
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
                        item.price,
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

                const [saleRows] = await connection.execute(
                    `SELECT id FROM staff_sales
                     WHERE staff_id = ? AND outlet_id = ? AND sale_date = ? AND invoice_number = ?`,
                    [staffId, item.outletId, date, item.invoiceNumber]
                );
                const saleId = saleRows[0]?.id;

                if (saleId) {
                    await connection.execute(
                        `INSERT INTO staff_sale_status_history (sale_id, status, changed_at)
                         SELECT ?, 'not_packing', NOW()
                         WHERE NOT EXISTS (
                             SELECT 1 FROM staff_sale_status_history WHERE sale_id = ?
                         )`,
                        [saleId, saleId]
                    );
                }

                stickers.push({
                    saleId,
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

    static async getAllSalesByDate(date) {
        let query = `
            SELECT ss.id, ss.staff_id, ss.outlet_id, ss.sale_date, ss.price, ss.invoice_number, 
                    ss.sticker_number, ss.packaging_status, ss.delivery_boy_id, ss.vehicle_no,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    DATE_FORMAT(ssh.packing_date, '%Y-%m-%d') AS packing_date,
                    ss.paid_amount, ss.balance_amount, ss.payment_mode,
                    sc.outlet_name, sc.outlet_erp_id, s.name as staff_name, DATE_FORMAT(ss.sale_date, '%d-%m-%Y') as formatted_date,
                    db.name as delivery_boy_name
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN delivery_boys db ON ss.delivery_boy_id = db.id
             LEFT JOIN (
                 SELECT sale_id,
                        MAX(changed_at) AS status_updated_at,
                        MIN(CASE WHEN status = 'packing_done' THEN changed_at END) AS packing_date
                 FROM staff_sale_status_history
                 GROUP BY sale_id
             ) ssh ON ssh.sale_id = ss.id
        `;
        const params = [];
        
        if (date) {
            query += ` WHERE ss.sale_date = ? ORDER BY ss.id DESC`;
            params.push(date);
        } else {
            query += ` ORDER BY ss.sale_date DESC, ss.id DESC LIMIT 1000`;
        }

        const [rows] = await db.execute(query, params);
        return rows;
    }

    static async getSalesByDate(staffId, date) {
        const [rows] = await db.execute(
            `SELECT ss.id, ss.staff_id, ss.outlet_id, ss.sale_date, ss.price, ss.invoice_number, 
                    ss.sticker_number, ss.payment_mode, ss.paid_amount, ss.balance_amount, 
                    ss.reference_no, ss.reference_date, ss.credit_days, ss.vehicle_no,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    ss.packaging_status,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    sc.outlet_name, sc.outlet_erp_id, s.name AS staff_name,
                    db.name as delivery_boy_name
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN delivery_boys db ON ss.delivery_boy_id = db.id
             LEFT JOIN (
                 SELECT sale_id, MAX(changed_at) AS status_updated_at
                 FROM staff_sale_status_history
                 GROUP BY sale_id
             ) ssh ON ssh.sale_id = ss.id
             WHERE ss.staff_id = ? AND ss.sale_date = ?`,
            [staffId, date]
        );
        return rows;
    }

    static async getSaleById(saleId) {
        const [rows] = await db.execute(
            `SELECT ss.id, ss.staff_id, ss.outlet_id, ss.sale_date, ss.price, ss.invoice_number,
                    ss.sticker_number, ss.paid_amount, ss.balance_amount, ss.packaging_status,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    sc.outlet_name, sc.outlet_erp_id, s.name AS staff_name,
                    db.name AS delivery_boy_name, ss.vehicle_no
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN delivery_boys db ON ss.delivery_boy_id = db.id
             LEFT JOIN (
                 SELECT sale_id, MAX(changed_at) AS status_updated_at
                 FROM staff_sale_status_history
                 GROUP BY sale_id
             ) ssh ON ssh.sale_id = ss.id
             WHERE ss.id = ?`,
            [saleId]
        );
        return rows[0] || null;
    }

    static async findSaleByInvoice(staffId, invoiceNumber, excludeSaleId = null) {
        const params = [staffId, invoiceNumber];
        let excludeClause = '';

        if (excludeSaleId) {
            excludeClause = ' AND id <> ?';
            params.push(excludeSaleId);
        }

        const [rows] = await db.execute(
            `SELECT id, invoice_number
             FROM staff_sales
             WHERE staff_id = ? AND LOWER(invoice_number) = LOWER(?)
             ${excludeClause}
             LIMIT 1`,
            params
        );
        return rows[0] || null;
    }

    static async updateSale(saleId, invoiceNumber, price) {
        await db.execute(
            `UPDATE staff_sales
             SET invoice_number = ?, price = ?,
                 balance_amount = IF(paid_amount = 0, ?, balance_amount)
             WHERE id = ?`,
            [invoiceNumber, price, price, saleId]
        );
        return StaffModel.getSaleById(saleId);
    }

    static async deleteSale(saleId) {
        const [result] = await db.execute('DELETE FROM staff_sales WHERE id = ?', [saleId]);
        return result.affectedRows > 0;
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

    static async getSaleStatusById(saleId) {
        const [rows] = await db.execute(
            'SELECT packaging_status FROM staff_sales WHERE id = ?',
            [saleId]
        );
        return rows[0] ? rows[0].packaging_status : null;
    }

    static async updatePackagingStatus(
        saleId,
        status,
        deliveryBoyId,
        vehicleNo,
        deliveryDate = null,
        statusDate = null
    ) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const [currentRows] = await connection.execute(
                'SELECT packaging_status FROM staff_sales WHERE id = ? FOR UPDATE',
                [saleId]
            );
            const currentStatus = currentRows[0]?.packaging_status;

            if (status === 'out_for_delivery' || status === 'delivered' || status === 'cancelled') {
                await connection.execute(
                    `UPDATE staff_sales 
                     SET packaging_status = ?, delivery_boy_id = ?, vehicle_no = ?, delivery_date = ?
                     WHERE id = ?`,
                    [status, deliveryBoyId, vehicleNo, deliveryDate, saleId]
                );
            } else {
                await connection.execute(
                    `UPDATE staff_sales 
                     SET packaging_status = ?, delivery_boy_id = NULL, vehicle_no = NULL, delivery_date = NULL
                     WHERE id = ?`,
                    [status, saleId]
                );
            }

            if (currentStatus !== status) {
                if (statusDate) {
                    await connection.execute(
                        `INSERT INTO staff_sale_status_history (sale_id, status, changed_at)
                         VALUES (?, ?, ?)`,
                        [saleId, status, `${statusDate} 00:00:00`]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO staff_sale_status_history (sale_id, status, changed_at)
                         VALUES (?, ?, NOW())`,
                        [saleId, status]
                    );
                }
            }

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getSaleStatusHistory(saleId) {
        const sale = await StaffModel.getSaleById(saleId);
        if (!sale) {
            return null;
        }

        const [history] = await db.execute(
            `SELECT id, status, DATE_FORMAT(changed_at, '%Y-%m-%d %H:%i:%s') AS changed_at
             FROM staff_sale_status_history
             WHERE sale_id = ?
             ORDER BY changed_at ASC, id ASC`,
            [saleId]
        );

        return { sale, history };
    }

    static async getPendingCredits() {
        const [rows] = await db.execute(
            `SELECT sp.id, sp.amount AS balance_amount, sp.payment_date AS sale_date, sp.credit_days,
                    ss.invoice_number, sc.outlet_name, s.name AS staff_name
             FROM sale_payments sp
             JOIN staff_sales ss ON sp.sale_id = ss.id
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             WHERE sp.payment_mode = 'credit'
             ORDER BY sp.payment_date ASC`
        );
        return rows;
    }
}

export default StaffModel;
