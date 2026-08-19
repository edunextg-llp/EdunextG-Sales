import db from '../config/db.js';
import { formatStickerNumber } from '../utils/stickerNumber.js';
import { getCompanyBillPrefix, normalizeInvoiceNumber } from '../utils/invoiceNumber.js';
import PhysicalStockModel from './physicalStockModel.js';

class StaffModel {
    static async create(name, contactNo, companyId = null, staffType = 'distributor', profile = {}) {
        const {
            dob = null,
            whatsappNumber = null,
            aadharNo = null,
            aadharDocumentUrl = null,
            pccCertificateUrl = null,
            staffCategory = 'company_staff',
        } = profile;

        const [result] = await db.execute(
            `INSERT INTO staff (
                name, contact_no, company_id, staff_type, staff_category, dob, whatsapp_number,
                aadhar_no, aadhar_document_url, pcc_certificate_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                contactNo,
                companyId,
                staffType,
                staffCategory,
                dob,
                whatsappNumber,
                aadharNo,
                aadharDocumentUrl,
                pccCertificateUrl,
            ]
        );
        return result.insertId;
    }

    static async setLoginCredentials(staffId, loginId, passwordHash) {
        await db.execute(
            'UPDATE staff SET login_id = ?, password_hash = ? WHERE id = ?',
            [loginId, passwordHash, staffId]
        );
    }

    static async findByLoginId(loginId) {
        const [rows] = await db.execute(
            `SELECT s.id, s.name, s.contact_no, s.staff_type, s.staff_category,
                    s.login_id, s.password_hash, s.is_active,
                    GROUP_CONCAT(DISTINCT sc.company_id ORDER BY sc.company_id) AS company_ids,
                    GROUP_CONCAT(DISTINCT c.name ORDER BY sc.company_id SEPARATOR ', ') AS company_names
             FROM staff s
             LEFT JOIN staff_companies sc ON sc.staff_id = s.id
             LEFT JOIN companies c ON c.id = sc.company_id
             WHERE LOWER(s.login_id) = LOWER(?)
                OR CAST(s.id AS CHAR) = ?
             GROUP BY s.id
             LIMIT 1`,
            [loginId, String(loginId).trim()]
        );
        return rows[0] || null;
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
             WHERE s.name LIKE ? AND s.is_active = 1`,
            [`%${query}%`]
        );
        return rows;
    }

    static async toggleActive(id) {
        await db.execute(
            'UPDATE staff SET is_active = NOT is_active WHERE id = ?',
            [id]
        );
        const [rows] = await db.execute(
            'SELECT is_active FROM staff WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    static async getDetails(id) {
        const [rows] = await db.execute(
            `SELECT s.id, s.name, s.contact_no, s.company_id, s.staff_type, s.staff_category, s.login_id, s.is_active,
                    s.dob, s.whatsapp_number, s.aadhar_no, s.aadhar_document_url, s.pcc_certificate_url,
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

    static async getMaxSerialNo(staffId, day, locationName, connection = db) {
        const [rows] = await connection.execute(
            `SELECT COALESCE(MAX(serial_no), 0) AS max_serial
             FROM staff_counters
             WHERE staff_id = ? AND day = ? AND COALESCE(location_name, '') = COALESCE(?, '')`,
            [staffId, day, locationName || null]
        );
        return parseInt(rows[0]?.max_serial, 10) || 0;
    }

    static async addCounter(staffId, day, location, counterData, connection = db) {
        const {
            outletErpId,
            outletName,
            contactNumber,
            whatsappNumber,
            address,
            googleLocation,
            hasGst = false,
            gstNumber = null,
            serialNo = null,
            priorityNumber = null,
            operatingHours = null,
        } = counterData;
        const locationName = String(location || '').trim() || null;
        let nextSerial = serialNo;
        if (nextSerial == null || Number.isNaN(Number(nextSerial))) {
            const maxSerial = await StaffModel.getMaxSerialNo(staffId, day, locationName, connection);
            nextSerial = maxSerial + 1;
        }

        await connection.execute(
            `INSERT INTO staff_counters (
                staff_id, day, location_name, outlet_erp_id, outlet_name,
                contact_number, whatsapp_number, address, google_location, has_gst, gst_number,
                serial_no, priority_number, operating_hours
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                staffId,
                day,
                locationName,
                outletErpId,
                outletName,
                contactNumber,
                whatsappNumber || null,
                address || null,
                googleLocation || null,
                hasGst ? 1 : 0,
                gstNumber || null,
                nextSerial,
                priorityNumber,
                operatingHours ? JSON.stringify(operatingHours) : null,
            ]
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

    static async findCounterByErpId(outletErpId) {
        const [rows] = await db.execute(
            `SELECT sc.id, sc.staff_id, sc.outlet_erp_id, sc.outlet_name, s.name AS staff_name
             FROM staff_counters sc
             INNER JOIN staff s ON s.id = sc.staff_id
             WHERE LOWER(TRIM(sc.outlet_erp_id)) = LOWER(TRIM(?))
             LIMIT 1`,
            [outletErpId]
        );
        return rows[0] || null;
    }

    static async findCounterByPriority(staffId, day, location, priorityNumber, excludeCounterId = null) {
        const params = [staffId, day, String(location || '').trim() || null, priorityNumber];
        let excludeClause = '';
        if (excludeCounterId) {
            excludeClause = ' AND id <> ?';
            params.push(excludeCounterId);
        }
        const [rows] = await db.execute(
            `SELECT id FROM staff_counters
             WHERE staff_id = ? AND day = ? AND COALESCE(location_name, '') = COALESCE(?, '')
               AND priority_number = ?${excludeClause} LIMIT 1`,
            params
        );
        return rows[0] || null;
    }

    static async addCounters(staffId, day, location, counters) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const locationName = String(location || '').trim() || null;
            let nextSerial = await StaffModel.getMaxSerialNo(staffId, day, locationName, connection);

            for (const counter of counters) {
                nextSerial += 1;
                await connection.execute(
                    `INSERT INTO staff_counters (
                        staff_id, day, location_name, outlet_erp_id, outlet_name,
                        contact_number, whatsapp_number, address, google_location, has_gst, gst_number,
                        serial_no, priority_number, operating_hours
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        staffId,
                        day,
                        locationName,
                        counter.outletErpId,
                        counter.outletName,
                        counter.contactNumber,
                        counter.whatsappNumber || null,
                        counter.address || null,
                        counter.googleLocation || null,
                        counter.hasGst ? 1 : 0,
                        counter.gstNumber || null,
                        counter.serialNo != null ? counter.serialNo : nextSerial,
                        counter.priorityNumber || null,
                        counter.operatingHours ? JSON.stringify(counter.operatingHours) : null,
                    ]
                );
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getCounterById(counterId) {
        const [rows] = await db.execute(
            `SELECT id, staff_id, day, outlet_erp_id, outlet_name, contact_number, whatsapp_number,
                    location_name, address, google_location, has_gst, gst_number,
                    serial_no, priority_number, operating_hours
             FROM staff_counters WHERE id = ?`,
            [counterId]
        );
        return rows[0] || null;
    }

    static async editCounter(counterId, counterData) {
        const {
            outletErpId,
            outletName,
            contactNumber,
            whatsappNumber,
            address,
            googleLocation,
            hasGst = false,
            gstNumber = null,
            serialNo = null,
            priorityNumber = null,
            operatingHours = null,
        } = counterData;
        await db.execute(
            `UPDATE staff_counters
             SET outlet_erp_id = ?, outlet_name = ?, contact_number = ?, whatsapp_number = ?,
                 address = ?, google_location = ?, has_gst = ?, gst_number = ?,
                 serial_no = ?, priority_number = ?, operating_hours = ?
             WHERE id = ?`,
            [
                outletErpId,
                outletName,
                contactNumber,
                whatsappNumber || null,
                address || null,
                googleLocation || null,
                hasGst ? 1 : 0,
                gstNumber || null,
                serialNo,
                priorityNumber,
                operatingHours ? JSON.stringify(operatingHours) : null,
                counterId,
            ]
        );
    }

    static async deleteCounter(counterId) {
        await db.execute(
            'DELETE FROM staff_counters WHERE id = ?',
            [counterId]
        );
    }

    static async update(id, name, contactNo, companyId = null, staffType = 'distributor', profile = {}) {
        const {
            dob = null,
            whatsappNumber = null,
            aadharNo = null,
            aadharDocumentUrl = null,
            pccCertificateUrl = null,
            staffCategory = 'company_staff',
        } = profile;

        await db.execute(
            `UPDATE staff
             SET name = ?, contact_no = ?, company_id = ?, staff_type = ?, staff_category = ?,
                 dob = ?, whatsapp_number = ?, aadhar_no = ?, aadhar_document_url = ?, pcc_certificate_url = ?
             WHERE id = ?`,
            [
                name,
                contactNo,
                companyId,
                staffType,
                staffCategory,
                dob,
                whatsappNumber,
                aadharNo,
                aadharDocumentUrl,
                pccCertificateUrl,
                id,
            ]
        );
    }

    static async deleteLocations(staffId) {
        await db.execute(
            'DELETE FROM staff_locations WHERE staff_id = ?',
            [staffId]
        );
    }

    static async replaceLocations(staffId, assignments) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await connection.execute('DELETE FROM staff_locations WHERE staff_id = ?', [staffId]);

            for (const [day, locations] of Object.entries(assignments)) {
                for (const location of locations) {
                    await connection.execute(
                        'INSERT INTO staff_locations (staff_id, day, location_name) VALUES (?, ?, ?)',
                        [staffId, day, location.locationName]
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

    static async getAllLocations(staffId) {
        const [rows] = await db.execute(
            'SELECT * FROM staff_locations WHERE staff_id = ?',
            [staffId]
        );
        return rows;
    }

    static async getAllAssignedLocationNames() {
        const [rows] = await db.execute(
            `SELECT DISTINCT location_name
             FROM staff_locations
             WHERE location_name IS NOT NULL AND TRIM(location_name) <> ''
             ORDER BY location_name`
        );
        return rows.map((row) => row.location_name);
    }

    static async getAll(includeInactive = false, companyId = null) {
        const filters = [];
        const params = [];
        if (!includeInactive) {
            filters.push('s.is_active = 1');
        }
        if (companyId) {
            filters.push(`(
                s.company_id = ?
                OR EXISTS (
                    SELECT 1 FROM staff_companies sc_filter
                    WHERE sc_filter.staff_id = s.id AND sc_filter.company_id = ?
                )
            )`);
            params.push(companyId, companyId);
        }
        const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const [rows] = await db.execute(
            `SELECT s.id, s.name, s.contact_no, s.company_id, s.staff_type, s.staff_category, s.login_id, s.is_active,
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
             ${whereClause}
             ORDER BY s.name`,
            params
        );
        return rows;
    }

    static async getOutletsForStaffAndDay(staffId, dayName) {
        const [rows] = await db.execute(
            `SELECT id, outlet_erp_id, outlet_name, contact_number, whatsapp_number, location_name,
                    address, google_location, has_gst, gst_number, serial_no, priority_number, operating_hours
             FROM staff_counters
             WHERE staff_id = ? AND day = ?
             ORDER BY COALESCE(location_name, ''), COALESCE(priority_number, 999999), COALESCE(serial_no, 999999), id`,
            [staffId, dayName]
        );
        return rows;
    }

    static async getAllCountersForStaff(staffId) {
        const [rows] = await db.execute(
            'SELECT id, outlet_erp_id, outlet_name, contact_number, whatsapp_number, location_name, address, google_location, has_gst, gst_number, day FROM staff_counters WHERE staff_id = ?',
            [staffId]
        );
        return rows;
    }

    static async getAllCounters() {
        const [rows] = await db.execute(
            `SELECT sc.id, sc.outlet_erp_id, sc.outlet_name, sc.contact_number, sc.whatsapp_number,
                    sc.location_name, sc.address, sc.google_location, sc.has_gst, sc.gst_number, sc.day,
                    sc.serial_no, sc.priority_number, sc.operating_hours,
                    s.name AS staff_name
             FROM staff_counters sc
             INNER JOIN staff s ON s.id = sc.staff_id
             ORDER BY s.name, sc.day, COALESCE(sc.location_name, ''), COALESCE(sc.priority_number, 999999), COALESCE(sc.serial_no, 999999), sc.outlet_name`
        );
        return rows;
    }

    static async getMissingSalesOutletsForDate(staffId, dayName, date) {
        const [rows] = await db.execute(
            `SELECT c.id, c.outlet_erp_id, c.outlet_name, c.contact_number, c.whatsapp_number, c.location_name, c.address, c.google_location 
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

    static async saveSales(staffId, date, salesData, options = {}) {
        // salesData: [{ outletId, itemCount, invoiceNumber, price, lineItems? }] -> returns sticker print data
        const companyName = String(options.companyName || '').trim();
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

                if (Array.isArray(item.lineItems) && item.lineItems.length) {
                    await StaffModel.saveSaleItems(connection, saleId, item.lineItems);
                }

                if (item.requisitionNumber) {
                    const [requisitionResult] = await connection.execute(
                        `UPDATE purchase_requisitions
                         SET status = 'invoiced'
                         WHERE UPPER(requisition_number) = UPPER(?)
                           AND staff_id = ?
                           AND outlet_id = ?
                           AND status = 'approved'`,
                        [item.requisitionNumber, staffId, item.outletId]
                    );
                    if (!requisitionResult.affectedRows) {
                        const error = new Error(
                            `Requisition ${item.requisitionNumber} is not approved or has already been invoiced.`
                        );
                        error.code = 'REQUISITION_NOT_APPROVED';
                        throw error;
                    }
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

            if (companyName) {
                const detailedLineItems = salesData.flatMap((sale) =>
                    Array.isArray(sale.lineItems) ? sale.lineItems : []
                );
                if (detailedLineItems.length) {
                    await PhysicalStockModel.deductStockForCompany(
                        connection,
                        companyName,
                        detailedLineItems
                    );
                }
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
                    ss.sticker_number, ss.packaging_status, ss.delivery_boy_id, ss.packed_by_id, ss.vehicle_no,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    DATE_FORMAT(ssh.packing_date, '%Y-%m-%d') AS packing_date,
                    ss.paid_amount, ss.balance_amount, ss.payment_mode,
                    COALESCE(sp.payment_count, 0) AS payment_count,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name, sc.google_location, s.name as staff_name,
                    outlet_staff.id AS outlet_staff_id, outlet_staff.name AS outlet_staff_name,
                    DATE_FORMAT(ss.sale_date, '%d-%m-%Y') as formatted_date,
                    db.name as delivery_boy_name,
                    packer.name AS packed_by_name,
                    COALESCE(staff_company.company_names, c.name) AS company_name,
                    COALESCE(staff_company.company_ids, s.company_id) AS company_ids
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN staff outlet_staff ON outlet_staff.id = sc.staff_id
             LEFT JOIN delivery_boys db ON ss.delivery_boy_id = db.id
             LEFT JOIN delivery_boys packer ON ss.packed_by_id = packer.id
             LEFT JOIN companies c ON s.company_id = c.id
             LEFT JOIN (
                 SELECT sc_map.staff_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM staff_companies sc_map
                 INNER JOIN companies c2 ON c2.id = sc_map.company_id
                 GROUP BY sc_map.staff_id
             ) staff_company ON staff_company.staff_id = s.id
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
                    ss.packed_by_id,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name, s.name AS staff_name,
                    db.name AS delivery_boy_name, packer.name AS packed_by_name, ss.vehicle_no
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN delivery_boys db ON ss.delivery_boy_id = db.id
             LEFT JOIN delivery_boys packer ON ss.packed_by_id = packer.id
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

    static async searchSalesByInvoice(invoiceNumber) {
        const term = String(invoiceNumber || '').trim();
        if (!term) {
            return [];
        }

        const normalizedTerm = normalizeInvoiceNumber(term);
        const likeTerm = `%${term}%`;

        const [rows] = await db.execute(
            `SELECT ss.id,
                    ss.staff_id, ss.outlet_id, ss.sale_date, ss.item_count, ss.packed_item_count,
                    ss.box_count, ss.packet_count, ss.price, ss.invoice_number,
                    ss.sticker_number, ss.packaging_status, ss.delivery_boy_id, ss.packed_by_id, ss.vehicle_no,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    DATE_FORMAT(ssh.packing_date, '%Y-%m-%d') AS packing_date,
                    ss.paid_amount, ss.balance_amount, ss.payment_mode,
                    ss.reference_no, ss.reference_date, ss.credit_days,
                    COALESCE(sp.payment_count, 0) AS payment_count,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name, sc.google_location, sc.contact_number,
                    s.name AS staff_name,
                    outlet_staff.id AS outlet_staff_id, outlet_staff.name AS outlet_staff_name,
                    DATE_FORMAT(ss.sale_date, '%d-%m-%Y') AS formatted_date,
                    db.name AS delivery_boy_name,
                    packer.name AS packed_by_name,
                    COALESCE(staff_company.company_names, c.name) AS company_name,
                    COALESCE(staff_company.company_ids, s.company_id) AS company_ids
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN staff outlet_staff ON outlet_staff.id = sc.staff_id
             LEFT JOIN delivery_boys db ON ss.delivery_boy_id = db.id
             LEFT JOIN delivery_boys packer ON ss.packed_by_id = packer.id
             LEFT JOIN companies c ON s.company_id = c.id
             LEFT JOIN (
                 SELECT sc_map.staff_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM staff_companies sc_map
                 INNER JOIN companies c2 ON c2.id = sc_map.company_id
                 GROUP BY sc_map.staff_id
             ) staff_company ON staff_company.staff_id = s.id
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
             WHERE ss.invoice_number LIKE ?
                OR ss.sticker_number LIKE ?
                OR CAST(ss.id AS CHAR) LIKE ?
             ORDER BY ss.sale_date DESC, ss.id DESC
             LIMIT 50`,
            [likeTerm, likeTerm, likeTerm]
        );

        if (normalizedTerm) {
            rows.sort((a, b) => {
                const aExact = normalizeInvoiceNumber(a.invoice_number) === normalizedTerm ? 0 : 1;
                const bExact = normalizeInvoiceNumber(b.invoice_number) === normalizedTerm ? 0 : 1;
                return aExact - bExact;
            });
        }

        return rows;
    }

    static async getSaleDetailsById(saleId) {
        const [rows] = await db.execute(
            `SELECT ss.id,
                    ss.staff_id, ss.outlet_id, ss.sale_date, ss.item_count, ss.packed_item_count,
                    ss.box_count, ss.packet_count, ss.price, ss.invoice_number,
                    ss.sticker_number, ss.packaging_status, ss.delivery_boy_id, ss.packed_by_id, ss.vehicle_no,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                    DATE_FORMAT(ssh.packing_date, '%Y-%m-%d') AS packing_date,
                    ss.paid_amount, ss.balance_amount, ss.payment_mode,
                    ss.reference_no, ss.reference_date, ss.credit_days,
                    COALESCE(sp.payment_count, 0) AS payment_count,
                    sc.outlet_name, sc.outlet_erp_id, sc.location_name, sc.google_location, sc.contact_number,
                    s.name AS staff_name,
                    outlet_staff.id AS outlet_staff_id, outlet_staff.name AS outlet_staff_name,
                    DATE_FORMAT(ss.sale_date, '%d-%m-%Y') AS formatted_date,
                    db.name AS delivery_boy_name,
                    packer.name AS packed_by_name,
                    COALESCE(staff_company.company_names, c.name) AS company_name,
                    COALESCE(staff_company.company_ids, s.company_id) AS company_ids
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN staff outlet_staff ON outlet_staff.id = sc.staff_id
             LEFT JOIN delivery_boys db ON ss.delivery_boy_id = db.id
             LEFT JOIN delivery_boys packer ON ss.packed_by_id = packer.id
             LEFT JOIN companies c ON s.company_id = c.id
             LEFT JOIN (
                 SELECT sc_map.staff_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM staff_companies sc_map
                 INNER JOIN companies c2 ON c2.id = sc_map.company_id
                 GROUP BY sc_map.staff_id
             ) staff_company ON staff_company.staff_id = s.id
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
             WHERE ss.id = ?
             LIMIT 1`,
            [saleId]
        );
        return rows[0] || null;
    }

    static normalizeSaleLineItem(line = {}) {
        const qty = Number(line.qty) || 0;
        const rate = Number(line.rate) || 0;
        const taxable = qty * rate;
        const gst = taxable * 0.05;
        const computedTotal = taxable + gst;
        const lineTotal = Number(line.lineTotal ?? line.line_total);
        return {
            productErpId: String(line.productErpId || line.product_erp_id || '').trim(),
            productName: String(line.productName || line.product_name || line.productErpId || line.product_erp_id || '').trim(),
            productDivision: String(line.productDivision || line.product_division || '').trim(),
            variantName: String(line.variantName || line.variant_name || '').trim(),
            qty,
            rate,
            lineTotal: Number.isFinite(lineTotal) && lineTotal > 0 ? lineTotal : computedTotal,
        };
    }

    static async saveSaleItems(connection, saleId, lineItems = []) {
        await connection.execute('DELETE FROM staff_sale_items WHERE sale_id = ?', [saleId]);

        const normalized = (Array.isArray(lineItems) ? lineItems : [])
            .map((line) => StaffModel.normalizeSaleLineItem(line))
            .filter((line) => line.productErpId && line.productErpId !== '__existing_sale__' && line.qty > 0);

        for (let index = 0; index < normalized.length; index += 1) {
            const line = normalized[index];
            await connection.execute(
                `INSERT INTO staff_sale_items
                 (sale_id, product_erp_id, product_name, product_division, variant_name, qty, rate, line_total, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    saleId,
                    line.productErpId,
                    line.productName,
                    line.productDivision || null,
                    line.variantName || null,
                    line.qty,
                    line.rate,
                    line.lineTotal,
                    index,
                ]
            );
        }
    }

    static async getSaleItemsBySaleId(saleId) {
        const [rows] = await db.execute(
            `SELECT id, sale_id, product_erp_id, product_name, product_division, variant_name,
                    qty, rate, line_total
             FROM staff_sale_items
             WHERE sale_id = ?
             ORDER BY sort_order ASC, id ASC`,
            [saleId]
        );
        return rows;
    }

    static async getTakenBillsForSale(saleId) {
        const [rows] = await db.execute(
            `SELECT tb.id, tb.payment_id, tb.collector_type,
                    DATE_FORMAT(tb.taken_date, '%Y-%m-%d') AS taken_date,
                    DATE_FORMAT(tb.returned_at, '%Y-%m-%d %H:%i:%s') AS returned_at,
                    sp.amount AS credit_amount, sp.payment_mode,
                    ts.name AS staff_name,
                    db.name AS delivery_boy_name
             FROM taken_bills tb
             INNER JOIN sale_payments sp ON sp.id = tb.payment_id
             LEFT JOIN staff ts ON tb.staff_id = ts.id
             LEFT JOIN delivery_boys db ON tb.delivery_boy_id = db.id
             WHERE sp.sale_id = ?
             ORDER BY tb.taken_date DESC, tb.id DESC`,
            [saleId]
        );
        return rows;
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
        packetCount = null,
        packedById = null
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
                         packet_count = COALESCE(?, packet_count),
                         packed_by_id = ?
                     WHERE id = ?`,
                    [
                        status,
                        packedItemCount,
                        boxCount,
                        packetCount,
                        status === 'packing_done' ? packedById : null,
                        saleId,
                    ]
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
                   COALESCE(tb.staff_id, tb.delivery_boy_id) AS staff_id,
                   COALESCE(staff_company.company_names, sale_company.name) AS company_name
            FROM taken_bills tb
            JOIN sale_payments sp ON tb.payment_id = sp.id
            JOIN staff_sales ss ON sp.sale_id = ss.id
            LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
            LEFT JOIN staff s ON tb.staff_id = s.id
            LEFT JOIN delivery_boys db ON tb.delivery_boy_id = db.id
            LEFT JOIN staff sale_staff ON ss.staff_id = sale_staff.id
            LEFT JOIN companies sale_company ON sale_staff.company_id = sale_company.id
            LEFT JOIN (
                SELECT sc_map.staff_id,
                       GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names
                FROM staff_companies sc_map
                INNER JOIN companies c2 ON c2.id = sc_map.company_id
                GROUP BY sc_map.staff_id
            ) staff_company ON staff_company.staff_id = sale_staff.id
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
