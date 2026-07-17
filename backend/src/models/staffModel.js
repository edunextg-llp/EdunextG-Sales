import db from '../config/db.js';
import { formatStickerNumber } from '../utils/stickerNumber.js';
import { getCompanyBillPrefix, normalizeInvoiceNumber } from '../utils/invoiceNumber.js';

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
        const { outletErpId, outletName, contactNumber, whatsappNumber, googleLocation } = counterData;
        const locationName = String(location || '').trim() || null;
        await db.execute(
            'INSERT INTO staff_counters (staff_id, day, location_name, outlet_erp_id, outlet_name, contact_number, whatsapp_number, google_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [staffId, day, locationName, outletErpId, outletName, contactNumber, whatsappNumber || null, googleLocation || null]
        );
    }

    static async findDuplicateCounter(staffId, outletErpId, excludeCounterId = null) {
        const params = [staffId, outletErpId];
        let excludeClause = '';

        if (excludeCounterId) {
            excludeClause = ' AND id <> ?';
            params.push(excludeCounterId);
        }

        const [rows] = await db.execute(
            `SELECT id, outlet_erp_id, outlet_name
             FROM staff_counters
             WHERE staff_id = ?
               AND LOWER(outlet_erp_id) = LOWER(?)
               ${excludeClause}
             LIMIT 1`,
            params
        );
        return rows[0] || null;
    }

    static async getCounterById(counterId) {
        const [rows] = await db.execute(
            'SELECT id, staff_id, outlet_erp_id, outlet_name, contact_number, whatsapp_number, location_name, google_location FROM staff_counters WHERE id = ?',
            [counterId]
        );
        return rows[0] || null;
    }

    static async editCounter(counterId, counterData) {
        const { outletErpId, outletName, contactNumber, whatsappNumber, googleLocation } = counterData;
        await db.execute(
            'UPDATE staff_counters SET outlet_erp_id = ?, outlet_name = ?, contact_number = ?, whatsapp_number = ?, google_location = ? WHERE id = ?',
            [outletErpId, outletName, contactNumber, whatsappNumber || null, googleLocation || null, counterId]
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
            'SELECT id, outlet_erp_id, outlet_name, contact_number, whatsapp_number, location_name, google_location FROM staff_counters WHERE staff_id = ? AND day = ?',
            [staffId, dayName]
        );
        return rows;
    }

    static async getAllCountersForStaff(staffId) {
        const [rows] = await db.execute(
            'SELECT id, outlet_erp_id, outlet_name, contact_number, whatsapp_number, location_name, google_location, day FROM staff_counters WHERE staff_id = ?',
            [staffId]
        );
        return rows;
    }

    static async getMissingSalesOutletsForDate(staffId, dayName, date) {
        const [rows] = await db.execute(
            `SELECT c.id, c.outlet_erp_id, c.outlet_name, c.contact_number, c.whatsapp_number, c.location_name, c.google_location 
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
        // salesData: [{ outletId, itemCount, invoiceNumber, price }] -> returns sticker print data
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const stickers = [];

            for (const item of salesData) {
                const [existing] = await connection.execute(
                    `SELECT id, sticker_number FROM staff_sales
                     WHERE staff_id = ? AND outlet_id = ? AND sale_date = ? AND invoice_number = ?`,
                    [staffId, item.outletId, date, item.invoiceNumber]
                );

                let saleId = existing[0]?.id ?? null;
                let stickerNumber = existing[0]?.sticker_number ?? null;

                if (saleId) {
                    await connection.execute(
                        `UPDATE staff_sales
                         SET item_count = ?,
                             packed_item_count = ?,
                             price = ?,
                             payment_mode = ?,
                             delivery_boy_id = ?,
                             vehicle_no = ?,
                             balance_amount = IF(paid_amount = 0, ?, balance_amount)
                         WHERE id = ?`,
                        [
                            item.itemCount,
                            item.itemCount,
                            item.price,
                            item.paymentMode,
                            item.deliveryBoyId,
                            item.vehicleNo,
                            item.price,
                            saleId,
                        ]
                    );
                } else {
                    stickerNumber = await StaffModel.getNextStickerNumber(connection);
                    const [insertResult] = await connection.execute(
                        `INSERT INTO staff_sales
                         (staff_id, outlet_id, sale_date, item_count, packed_item_count, invoice_number, price, sticker_number, payment_mode, delivery_boy_id, vehicle_no, paid_amount, balance_amount)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
                        [
                            staffId,
                            item.outletId,
                            date,
                            item.itemCount,
                            item.itemCount,
                            item.invoiceNumber,
                            item.price,
                            stickerNumber,
                            item.paymentMode,
                            item.deliveryBoyId,
                            item.vehicleNo,
                            item.price,
                        ]
                    );
                    saleId = insertResult.insertId;
                }

                const [outletRows] = await connection.execute(
                    'SELECT outlet_name, outlet_erp_id FROM staff_counters WHERE id = ?',
                    [item.outletId]
                );

                const [deliveryBoyRows] = await connection.execute(
                    'SELECT name FROM delivery_boys WHERE id = ?',
                    [item.deliveryBoyId]
                );

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
                    outletId: item.outletId,
                    stickerNumber,
                    shopName: outletRows[0]?.outlet_name || 'Unknown Shop',
                    outletErpId: outletRows[0]?.outlet_erp_id || '',
                    invoiceNumber: item.invoiceNumber,
                    itemCount: item.itemCount,
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

    static async getAllSalesByDate(date, search = '') {
        let query = `
            SELECT ss.id,
                    ss.staff_id, ss.outlet_id, ss.sale_date, ss.item_count, ss.packed_item_count, ss.box_count, ss.packet_count, ss.price, ss.invoice_number, 
                    ss.sticker_number, ss.packaging_status, ss.delivery_boy_id, ss.vehicle_no,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    DATE_FORMAT(ssh.packing_date, '%Y-%m-%d') AS packing_date,
                    ss.paid_amount, ss.balance_amount, ss.payment_mode,
                    COALESCE(sp.payment_count, 0) AS payment_count,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name, sc.google_location, s.name as staff_name,
                    outlet_staff.id AS outlet_staff_id, outlet_staff.name AS outlet_staff_name,
                    DATE_FORMAT(ss.sale_date, '%d-%m-%Y') as formatted_date,
                    db.name as delivery_boy_name
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN staff outlet_staff ON outlet_staff.id = sc.staff_id
             LEFT JOIN delivery_boys db ON ss.delivery_boy_id = db.id
             LEFT JOIN (
                 SELECT sale_id, COUNT(*) AS payment_count
                 FROM sale_payments
                 GROUP BY sale_id
             ) sp ON sp.sale_id = ss.id
             LEFT JOIN (
                 SELECT sale_id,
                        MAX(changed_at) AS status_updated_at,
                        MIN(CASE WHEN status = 'packing_done' THEN changed_at END) AS packing_date
                 FROM staff_sale_status_history
                 GROUP BY sale_id
             ) ssh ON ssh.sale_id = ss.id
        `;
        const params = [];
        const conditions = [];

        if (date) {
            conditions.push('ss.sale_date = ?');
            params.push(date);
        }

        const normalizedSearch = String(search || '').trim();
        if (normalizedSearch) {
            const searchTerm = `%${normalizedSearch}%`;
            conditions.push(`(
                sc.outlet_name LIKE ?
                OR sc.outlet_erp_id LIKE ?
                OR sc.location_name LIKE ?
                OR s.name LIKE ?
                OR ss.sticker_number LIKE ?
                OR ss.invoice_number LIKE ?
                OR CAST(ss.id AS CHAR) LIKE ?
            )`);
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (conditions.length) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY ss.sale_date DESC, ss.id DESC LIMIT 1000`;

        const [rows] = await db.execute(query, params);
        return rows;
    }

    static async getSalesByDate(staffId, date) {
        const [rows] = await db.execute(
            `SELECT ss.id,
                    ss.staff_id, ss.outlet_id, ss.sale_date, ss.item_count, ss.packed_item_count, ss.box_count, ss.packet_count, ss.price, ss.invoice_number, 
                    ss.sticker_number, ss.payment_mode, ss.paid_amount, ss.balance_amount, 
                    ss.reference_no, ss.reference_date, ss.credit_days, ss.vehicle_no,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    ss.packaging_status,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name, s.name AS staff_name,
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
                `SELECT ss.id,
                    ss.staff_id, ss.outlet_id, ss.sale_date, ss.item_count, ss.packed_item_count, ss.box_count, ss.packet_count, ss.price, ss.invoice_number,
                    ss.sticker_number, ss.paid_amount, ss.balance_amount, ss.packaging_status,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name, s.name AS staff_name,
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

    static async generateUniqueBillNumber(staffId, companyName, reserved = []) {
        const prefix = getCompanyBillPrefix(companyName);
        const [rows] = await db.execute(
            'SELECT invoice_number FROM staff_sales WHERE staff_id = ?',
            [staffId]
        );

        const used = new Set(
            rows
                .map((row) => normalizeInvoiceNumber(row.invoice_number))
                .filter(Boolean)
        );

        reserved.forEach((value) => {
            const normalized = normalizeInvoiceNumber(value);
            if (normalized) {
                used.add(normalized);
            }
        });

        for (let attempt = 0; attempt < 100; attempt += 1) {
            const randomPart = String(Math.floor(100000 + Math.random() * 900000));
            const billNo = `${prefix}${randomPart}`;
            if (!used.has(normalizeInvoiceNumber(billNo))) {
                return billNo;
            }
        }

        return `${prefix}${Date.now().toString().slice(-6)}`;
    }

    static async findSaleByInvoice(staffId, invoiceNumber, excludeSaleId = null) {
        const normalizedInvoiceNumber = normalizeInvoiceNumber(invoiceNumber);
        if (!normalizedInvoiceNumber) {
            return null;
        }

        const params = [staffId];
        let excludeClause = '';

        if (excludeSaleId) {
            excludeClause = ' AND id <> ?';
            params.push(excludeSaleId);
        }

        const [rows] = await db.execute(
            `SELECT id, invoice_number
             FROM staff_sales
             WHERE staff_id = ?
             ${excludeClause}
             ORDER BY id DESC`,
            params
        );
        return rows.find((row) => normalizeInvoiceNumber(row.invoice_number) === normalizedInvoiceNumber) || null;
    }

    static async updateSale(saleId, invoiceNumber, price, itemCount) {
        await db.execute(
            `UPDATE staff_sales
             SET invoice_number = ?, price = ?, item_count = ?,
                 packed_item_count = IF(packed_item_count IS NULL OR packed_item_count > ?, ?, packed_item_count),
                 balance_amount = IF(paid_amount = 0, ?, balance_amount)
             WHERE id = ?`,
            [invoiceNumber, price, itemCount, itemCount, itemCount, price, saleId]
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
        statusDate = null,
        packedItemCount = null,
        boxCount = null,
        packetCount = null
    ) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const [currentRows] = await connection.execute(
                'SELECT packaging_status, item_count FROM staff_sales WHERE id = ? FOR UPDATE',
                [saleId]
            );
            const currentStatus = currentRows[0]?.packaging_status;

            if (status === 'cancelled') {
                if (currentStatus !== 'cancelled') {
                    if (statusDate) {
                        await connection.execute(
                            `INSERT INTO staff_sale_status_history (sale_id, status, changed_at)
                             VALUES (?, 'cancelled', ?)`,
                            [saleId, `${statusDate} 00:00:00`]
                        );
                    } else {
                        await connection.execute(
                            `INSERT INTO staff_sale_status_history (sale_id, status, changed_at)
                             VALUES (?, 'cancelled', NOW())`,
                            [saleId]
                        );
                    }
                }

                const resetPackedCount = currentRows[0]?.item_count ?? packedItemCount;
                await connection.execute(
                    `UPDATE staff_sales
                     SET packaging_status = 'cancelled',
                         delivery_boy_id = NULL,
                         vehicle_no = NULL,
                         delivery_date = NULL,
                         packed_item_count = ?,
                         box_count = NULL,
                         packet_count = NULL
                     WHERE id = ?`,
                    [resetPackedCount, saleId]
                );
                await connection.commit();
                return;
            }

            if (status === 'out_for_delivery' || status === 'delivered' || status === 'returned') {
                await connection.execute(
                    `UPDATE staff_sales 
                     SET packaging_status = ?, delivery_boy_id = ?, vehicle_no = ?, delivery_date = ?
                     WHERE id = ?`,
                    [status, deliveryBoyId, vehicleNo, deliveryDate, saleId]
                );
            } else {
                await connection.execute(
                    `UPDATE staff_sales 
                     SET packaging_status = ?, delivery_boy_id = NULL, vehicle_no = NULL, delivery_date = NULL,
                         packed_item_count = COALESCE(?, packed_item_count),
                         box_count = COALESCE(?, box_count),
                         packet_count = COALESCE(?, packet_count)
                     WHERE id = ?`,
                    [status, packedItemCount, boxCount, packetCount, saleId]
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

    static async getCancelledDeliverySales() {
        const [rows] = await db.execute(
            `SELECT ss.id,
                    ss.staff_id, ss.outlet_id, ss.sale_date, ss.item_count, ss.packed_item_count, ss.box_count, ss.packet_count,
                    ss.price, ss.invoice_number, ss.sticker_number, ss.packaging_status,
                    DATE_FORMAT(
                        COALESCE(cancel_hist.cancel_date, legacy_cancel.status_updated_at),
                        '%Y-%m-%d %H:%i:%s'
                    ) AS status_updated_at,
                    DATE_FORMAT(
                        COALESCE(cancel_hist.cancel_date, legacy_cancel.status_updated_at),
                        '%Y-%m-%d'
                    ) AS delivery_date,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name, s.name AS staff_name,
                    COALESCE(staff_company.company_names, c.name) AS company_name,
                    COALESCE(staff_company.company_ids, s.company_id) AS company_ids
             FROM staff_sales ss
             LEFT JOIN (
                 SELECT sale_id, MAX(changed_at) AS cancel_date
                 FROM staff_sale_status_history
                 WHERE status = 'cancelled'
                 GROUP BY sale_id
             ) cancel_hist ON cancel_hist.sale_id = ss.id
             LEFT JOIN (
                 SELECT sale_id, MAX(changed_at) AS status_updated_at
                 FROM staff_sale_status_history
                 GROUP BY sale_id
             ) legacy_cancel ON legacy_cancel.sale_id = ss.id
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN companies c ON s.company_id = c.id
             LEFT JOIN (
                 SELECT sc.staff_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM staff_companies sc
                 INNER JOIN companies c2 ON c2.id = sc.company_id
                 GROUP BY sc.staff_id
             ) staff_company ON staff_company.staff_id = s.id
             WHERE cancel_hist.sale_id IS NOT NULL OR ss.packaging_status = 'cancelled'
             ORDER BY COALESCE(cancel_hist.cancel_date, legacy_cancel.status_updated_at) DESC, ss.id DESC`
        );
        return rows;
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
            `SELECT sp.id, sp.sale_id, ss.sticker_number,
                    sp.amount AS credit_amount,
                    GREATEST(0, sp.amount - COALESCE(credit_paid.paid_amount, 0)) AS balance_amount,
                    sp.payment_date AS sale_date, sp.credit_days,
                    ss.balance_amount AS sale_balance_amount,
                    COALESCE(cpr.latest_remarks, sp.remarks) AS remarks,
                    COALESCE(cpr.remarks_count, CASE WHEN sp.remarks IS NULL OR TRIM(sp.remarks) = '' THEN 0 ELSE 1 END) AS remarks_count,
                    DATE_FORMAT(cpr.latest_remark_date, '%Y-%m-%d') AS latest_remark_date,
                    ss.invoice_number, sc.outlet_name, sc.outlet_erp_id, sc.location_name, sc.contact_number,
                    s.id AS staff_id, s.name AS staff_name,
                    COALESCE(staff_company.company_names, c.name) AS company_name,
                    COALESCE(staff_company.company_ids, s.company_id) AS company_ids,
                    CASE WHEN tb.id IS NOT NULL THEN 1 ELSE 0 END AS is_taken,
                    tb.id AS taken_bill_id,
                    DATE_FORMAT(tb.taken_date, '%Y-%m-%d') AS taken_date,
                    tb.collector_type AS taken_collector_type,
                    COALESCE(ts.name, db.name) AS taker_name
             FROM sale_payments sp
             JOIN staff_sales ss ON sp.sale_id = ss.id
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN companies c ON s.company_id = c.id
             LEFT JOIN (
                 SELECT parent_credit_payment_id,
                        SUM(amount) AS paid_amount
                 FROM sale_payments
                 WHERE parent_credit_payment_id IS NOT NULL
                   AND payment_mode IN ('cash', 'upi', 'cheque')
                 GROUP BY parent_credit_payment_id
             ) credit_paid ON credit_paid.parent_credit_payment_id = sp.id
             LEFT JOIN (
                 SELECT sc.staff_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM staff_companies sc
                 INNER JOIN companies c2 ON c2.id = sc.company_id
                 GROUP BY sc.staff_id
             ) staff_company ON staff_company.staff_id = s.id
             LEFT JOIN (
                 SELECT r.payment_id,
                        COUNT(*) AS remarks_count,
                        SUBSTRING_INDEX(
                            GROUP_CONCAT(r.remarks ORDER BY r.remark_date DESC, r.id DESC SEPARATOR '\n'),
                            '\n',
                            1
                        ) AS latest_remarks,
                        MAX(r.remark_date) AS latest_remark_date
                 FROM credit_payment_remarks r
                 GROUP BY r.payment_id
             ) cpr ON cpr.payment_id = sp.id
             LEFT JOIN taken_bills tb ON tb.payment_id = sp.id AND tb.returned_at IS NULL
             LEFT JOIN staff ts ON tb.staff_id = ts.id
             LEFT JOIN delivery_boys db ON tb.delivery_boy_id = db.id
             WHERE sp.payment_mode = 'credit'
               AND ss.balance_amount > 0
             HAVING balance_amount > 0
             ORDER BY sp.payment_date ASC`
        );
        return rows;
    }

    static async searchDeliveredStores(search = '') {
        const params = [];
        let where = `WHERE ss.packaging_status = 'delivered'`;

        if (String(search || '').trim()) {
            where += ` AND (sc.outlet_name LIKE ? OR sc.outlet_erp_id LIKE ?)`;
            const term = `%${String(search).trim()}%`;
            params.push(term, term);
        }

        const [rows] = await db.execute(
            `SELECT sc.outlet_name AS store_name,
                    sc.outlet_erp_id,
                    MAX(ss.delivery_date) AS latest_delivery_date,
                    COUNT(ss.id) AS delivered_count
             FROM staff_sales ss
             INNER JOIN staff_counters sc ON ss.outlet_id = sc.id
             ${where}
             GROUP BY sc.id, sc.outlet_name, sc.outlet_erp_id
             ORDER BY latest_delivery_date DESC, sc.outlet_name ASC
             LIMIT 50`,
            params
        );
        return rows;
    }

    static async addCreditRemark(paymentId, remarks, remarkDate) {
        const cleanRemarks = remarks?.trim() || null;
        if (!cleanRemarks) {
            return null;
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const [paymentRows] = await connection.execute(
                `SELECT id FROM sale_payments WHERE id = ? AND payment_mode = 'credit' FOR UPDATE`,
                [paymentId]
            );

            if (!paymentRows[0]) {
                await connection.rollback();
                return null;
            }

            const [insertResult] = await connection.execute(
                `INSERT INTO credit_payment_remarks (payment_id, remark_date, remarks)
                 VALUES (?, ?, ?)`,
                [paymentId, remarkDate, cleanRemarks]
            );

            await connection.execute(
                `UPDATE sale_payments SET remarks = ? WHERE id = ?`,
                [cleanRemarks, paymentId]
            );

            await connection.commit();
            return { id: insertResult.insertId, remark_date: remarkDate, remarks: cleanRemarks };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getCreditRemarks(paymentId) {
        const [paymentRows] = await db.execute(
            `SELECT id FROM sale_payments WHERE id = ? AND payment_mode = 'credit'`,
            [paymentId]
        );
        if (!paymentRows[0]) {
            return null;
        }

        const [rows] = await db.execute(
            `SELECT id, DATE_FORMAT(remark_date, '%Y-%m-%d') AS remark_date, remarks,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM credit_payment_remarks
             WHERE payment_id = ?
             ORDER BY remark_date DESC, id DESC`,
            [paymentId]
        );
        return rows;
    }

    static async recordTakenBills(paymentIds, { collectorType, staffId, deliveryBoyId, takenDate }) {
        const uniqueIds = [...new Set(paymentIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
        if (!uniqueIds.length) {
            throw new Error('NO_PAYMENT_IDS');
        }

        const placeholders = uniqueIds.map(() => '?').join(', ');
        const [alreadyTaken] = await db.execute(
            `SELECT payment_id FROM taken_bills
             WHERE payment_id IN (${placeholders}) AND returned_at IS NULL`,
            uniqueIds
        );
        if (alreadyTaken.length > 0) {
            const err = new Error('ALREADY_TAKEN');
            err.paymentIds = alreadyTaken.map((row) => row.payment_id);
            throw err;
        }

        const values = uniqueIds.map((id) => [
            id,
            collectorType === 'company_staff' ? staffId : null,
            takenDate,
            collectorType,
            collectorType === 'bawarchee_staff' ? deliveryBoyId : null,
        ]);
        await db.query(
            'INSERT INTO taken_bills (payment_id, staff_id, taken_date, collector_type, delivery_boy_id) VALUES ?',
            [values]
        );
    }

    static async returnTakenBills(takenBillIds) {
        const uniqueIds = [...new Set(takenBillIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
        if (!uniqueIds.length) {
            return 0;
        }

        const placeholders = uniqueIds.map(() => '?').join(', ');
        const [result] = await db.execute(
            `UPDATE taken_bills
             SET returned_at = NOW()
             WHERE id IN (${placeholders}) AND returned_at IS NULL`,
            uniqueIds
        );
        return result.affectedRows;
    }

    static async getTakenBillsReport(startDate, endDate, staffId = null) {
        let query = `
            SELECT tb.id, tb.payment_id, DATE_FORMAT(tb.taken_date, '%Y-%m-%d') AS taken_date,
                   tb.collector_type,
                   sp.amount AS credit_amount,
                   GREATEST(0, sp.amount - COALESCE(credit_paid.paid_amount, 0)) AS balance_amount,
                   DATE_FORMAT(sp.payment_date, '%Y-%m-%d') AS sale_date, sp.credit_days,
                   ss.invoice_number, ss.sticker_number,
                   sc.outlet_name, sc.outlet_erp_id, sc.location_name, sc.contact_number,
                   COALESCE(s.name, db.name) AS staff_name,
                   COALESCE(tb.staff_id, tb.delivery_boy_id) AS staff_id
            FROM taken_bills tb
            JOIN sale_payments sp ON tb.payment_id = sp.id
            JOIN staff_sales ss ON sp.sale_id = ss.id
            LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
            LEFT JOIN staff s ON tb.staff_id = s.id
            LEFT JOIN delivery_boys db ON tb.delivery_boy_id = db.id
            LEFT JOIN (
                SELECT parent_credit_payment_id,
                       SUM(amount) AS paid_amount
                FROM sale_payments
                WHERE parent_credit_payment_id IS NOT NULL
                  AND payment_mode IN ('cash', 'upi', 'cheque')
                GROUP BY parent_credit_payment_id
            ) credit_paid ON credit_paid.parent_credit_payment_id = sp.id
            WHERE tb.taken_date BETWEEN ? AND ?
              AND tb.returned_at IS NULL
        `;
        const params = [startDate, endDate];
        if (staffId) {
            query += " AND tb.staff_id = ?";
            params.push(staffId);
        }
        query += " ORDER BY tb.taken_date DESC, tb.id DESC";
        
        const [rows] = await db.execute(query, params);
        return rows;
    }

    static async getCountersByIds(counterIds = []) {
        const ids = [...new Set((counterIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
        if (ids.length === 0) return [];

        const placeholders = ids.map(() => '?').join(', ');
        const [rows] = await db.execute(
            `SELECT id, outlet_erp_id, outlet_name, contact_number, location_name
             FROM staff_counters
             WHERE id IN (${placeholders})`,
            ids
        );
        return rows;
    }

    static async getCreditsOverdueByErp(erpIds = [], minOverdueDays = 3) {
        const normalizedErpIds = [
            ...new Set(
                (erpIds || [])
                    .map((erpId) => String(erpId || '').trim().toLowerCase())
                    .filter(Boolean)
            ),
        ];
        if (normalizedErpIds.length === 0) return [];

        const placeholders = normalizedErpIds.map(() => '?').join(', ');
        const minDays = Number(minOverdueDays);
        const overdueThreshold = Number.isFinite(minDays) && minDays > 0 ? minDays : 3;

        const [rows] = await db.execute(
            `SELECT sp.id AS credit_payment_id,
                    sp.sale_id,
                    sp.amount AS credit_amount,
                    GREATEST(0, sp.amount - COALESCE(credit_paid.paid_amount, 0)) AS balance_amount,
                    DATE_FORMAT(sp.payment_date, '%Y-%m-%d') AS issue_date,
                    sp.credit_days,
                    DATEDIFF(
                        CURDATE(),
                        DATE_ADD(sp.payment_date, INTERVAL COALESCE(sp.credit_days, 0) DAY)
                    ) AS overdue_days,
                    DATE_FORMAT(
                        DATE_ADD(sp.payment_date, INTERVAL COALESCE(sp.credit_days, 0) DAY),
                        '%Y-%m-%d'
                    ) AS due_date,
                    sc.id AS outlet_id,
                    sc.outlet_erp_id,
                    sc.outlet_name,
                    sc.location_name,
                    ss.invoice_number,
                    ss.sticker_number,
                    s.id AS credit_staff_id,
                    s.name AS credit_staff_name
             FROM sale_payments sp
             INNER JOIN staff_sales ss ON sp.sale_id = ss.id
             INNER JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN (
                 SELECT parent_credit_payment_id,
                        SUM(amount) AS paid_amount
                 FROM sale_payments
                 WHERE parent_credit_payment_id IS NOT NULL
                   AND payment_mode IN ('cash', 'upi', 'cheque')
                 GROUP BY parent_credit_payment_id
             ) credit_paid ON credit_paid.parent_credit_payment_id = sp.id
             WHERE sp.payment_mode = 'credit'
               AND ss.balance_amount > 0
               AND LOWER(TRIM(sc.outlet_erp_id)) IN (${placeholders})
               AND DATEDIFF(
                    CURDATE(),
                    DATE_ADD(sp.payment_date, INTERVAL COALESCE(sp.credit_days, 0) DAY)
               ) > ?
             HAVING balance_amount > 0
             ORDER BY overdue_days DESC, sp.payment_date ASC`,
            [...normalizedErpIds, overdueThreshold]
        );
        return rows;
    }

    static async createOverdueSalePermission(permissionData) {
        const {
            staffId,
            saleDate,
            outletId,
            outletErpId,
            outletName,
            maxOverdueDays,
            overdueCreditIds,
            overdueDetails,
            permissionNote,
            permittedByAdminId,
            permittedByName,
        } = permissionData;

        const [result] = await db.execute(
            `INSERT INTO overdue_sale_permissions (
                staff_id, sale_date, outlet_id, outlet_erp_id, outlet_name,
                max_overdue_days, overdue_credit_ids, overdue_details,
                permission_note, permitted_by_admin_id, permitted_by_name
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                staffId,
                saleDate,
                outletId,
                outletErpId,
                outletName || null,
                maxOverdueDays || 0,
                overdueCreditIds ? JSON.stringify(overdueCreditIds) : null,
                overdueDetails ? JSON.stringify(overdueDetails) : null,
                permissionNote || null,
                permittedByAdminId || null,
                permittedByName || null,
            ]
        );
        return result.insertId;
    }
}

export default StaffModel;
