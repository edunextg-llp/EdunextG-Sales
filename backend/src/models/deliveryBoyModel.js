import db from '../config/db.js';
import bcrypt from 'bcryptjs';
import {
    decryptDeliveryPasscode,
    encryptDeliveryPasscode,
    formatDeliveryLoginId,
    generateDeliveryPasscode,
} from '../utils/deliveryCredentials.js';

class DeliveryBoyModel {
    static formatLoginId(id) {
        return formatDeliveryLoginId(id);
    }

    static generatePasscode() {
        return generateDeliveryPasscode();
    }

    static async create(name, contactNo, companyId = null, role = 'delivery_boy', aadharNo = null) {
        const deliveryPasscode = DeliveryBoyModel.generatePasscode();
        const passcodeHash = await bcrypt.hash(deliveryPasscode, 10);
        const encryptedPasscode = encryptDeliveryPasscode(deliveryPasscode);
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const normalizedRole = role === 'packaging_staff' ? 'packaging_staff' : 'delivery_boy';
            const [result] = await connection.execute(
                `INSERT INTO delivery_boys (
                    name, contact_no, company_id, delivery_passcode_hash,
                    delivery_passcode, role, aadhar_no
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [name, contactNo, companyId, passcodeHash, encryptedPasscode, normalizedRole, aadharNo]
            );
            const deliveryLoginId = DeliveryBoyModel.formatLoginId(result.insertId);
            await connection.execute(
                'UPDATE delivery_boys SET delivery_login_id = ? WHERE id = ?',
                [deliveryLoginId, result.insertId]
            );
            await connection.commit();
            return {
                deliveryBoyId: result.insertId,
                deliveryLoginId,
                passcode: deliveryPasscode,
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async setCompanies(deliveryBoyId, companyIds = []) {
        await db.execute('DELETE FROM delivery_boy_companies WHERE delivery_boy_id = ?', [
            deliveryBoyId,
        ]);

        const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean))];
        for (const companyId of uniqueCompanyIds) {
            await db.execute(
                'INSERT IGNORE INTO delivery_boy_companies (delivery_boy_id, company_id) VALUES (?, ?)',
                [deliveryBoyId, companyId]
            );
        }
    }

    static async getAll(includeInactive = false) {
        const activeClause = includeInactive ? '' : 'WHERE db.is_active = 1';
        const [rows] = await db.execute(
            `SELECT db.id, db.name, db.contact_no, db.company_id, db.delivery_login_id,
                    db.delivery_passcode, db.delivery_passcode_hash,
                    db.role, db.is_active, db.aadhar_no,
                    COALESCE(dbc.company_names, c.name) AS company_name,
                    dbc.company_ids
             FROM delivery_boys db
             LEFT JOIN companies c ON c.id = db.company_id
             LEFT JOIN (
                 SELECT dbc.delivery_boy_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM delivery_boy_companies dbc
                 INNER JOIN companies c2 ON c2.id = dbc.company_id
                 GROUP BY dbc.delivery_boy_id
             ) dbc ON dbc.delivery_boy_id = db.id
             ${activeClause}
             ORDER BY db.name`
        );
        return Promise.all(rows.map(async (row) => {
            const decryptedPasscode = decryptDeliveryPasscode(row.delivery_passcode);
            const credentialsValid = Boolean(
                decryptedPasscode
                && row.delivery_passcode_hash
                && await bcrypt.compare(decryptedPasscode, row.delivery_passcode_hash)
            );
            const { delivery_passcode_hash: _hash, ...safeRow } = row;
            return {
                ...safeRow,
                delivery_passcode: credentialsValid ? decryptedPasscode : null,
                credentials_valid: credentialsValid,
            };
        }));
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT db.id, db.name, db.contact_no, db.company_id, db.delivery_login_id,
                    db.role, db.is_active, db.aadhar_no,
                    COALESCE(dbc.company_names, c.name) AS company_name,
                    dbc.company_ids
             FROM delivery_boys db
             LEFT JOIN companies c ON c.id = db.company_id
             LEFT JOIN (
                 SELECT dbc.delivery_boy_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM delivery_boy_companies dbc
                 INNER JOIN companies c2 ON c2.id = dbc.company_id
                 GROUP BY dbc.delivery_boy_id
             ) dbc ON dbc.delivery_boy_id = db.id
             WHERE db.id = ?`,
            [id]
        );
        return rows[0];
    }

    static async getByLogin(loginId, passcode) {
        const [rows] = await db.execute(
            `SELECT db.id, db.name, db.contact_no, db.company_id, db.delivery_login_id,
                    db.delivery_passcode_hash, db.role, db.is_active,
                    (SELECT GROUP_CONCAT(dbc.company_id ORDER BY dbc.company_id)
                     FROM delivery_boy_companies dbc WHERE dbc.delivery_boy_id = db.id) AS company_ids,
                    COALESCE(p.can_dashboard, 0) AS can_dashboard,
                    COALESCE(p.can_dms, 0) AS can_dms,
                    COALESCE(p.can_add_seller, 0) AS can_add_seller,
                    COALESCE(p.can_add_item, 0) AS can_add_item,
                    COALESCE(p.can_item_list, 0) AS can_item_list,
                    COALESCE(p.can_update_payment, 0) AS can_update_payment,
                    COALESCE(p.can_bank_deposit, 0) AS can_bank_deposit,
                    COALESCE(p.can_create_staff, 0) AS can_create_staff,
                    COALESCE(p.can_add_outlet, 0) AS can_add_outlet,
                    COALESCE(p.can_location_assignments, 0) AS can_location_assignments,
                    COALESCE(p.can_add_sales, 0) AS can_add_sales,
                    COALESCE(p.can_packaging, 0) AS can_packaging,
                    COALESCE(p.can_delivery, 0) AS can_delivery,
                    COALESCE(p.can_delivered, 0) AS can_delivered,
                    COALESCE(p.can_out_bill, 0) AS can_out_bill,
                    COALESCE(p.can_requisition_approval, 0) AS can_requisition_approval,
                    COALESCE(p.can_chalan_add_sales, 0) AS can_chalan_add_sales,
                    COALESCE(p.can_chalan_packaging, 0) AS can_chalan_packaging,
                    COALESCE(p.can_chalan_delivery, 0) AS can_chalan_delivery,
                    COALESCE(p.can_chalan_delivered, 0) AS can_chalan_delivered,
                    COALESCE(p.can_chalan_return, 0) AS can_chalan_return
             FROM delivery_boys db
             LEFT JOIN delivery_user_permissions p ON p.delivery_boy_id = db.id
             WHERE db.delivery_login_id = ?
             LIMIT 1`,
            [loginId]
        );
        const deliveryBoy = rows[0] || null;
        if (!deliveryBoy?.delivery_passcode_hash || Number(deliveryBoy.is_active) !== 1) {
            return null;
        }

        const passcodeMatches = await bcrypt.compare(passcode, deliveryBoy.delivery_passcode_hash);
        if (!passcodeMatches) {
            return null;
        }

        const { delivery_passcode_hash: _hash, ...safeDeliveryBoy } = deliveryBoy;
        return safeDeliveryBoy;
    }

    static async getPermissionUsers() {
        const [rows] = await db.execute(
            `SELECT db.id, db.name, db.role, db.is_active, db.delivery_login_id,
                    db.delivery_passcode, db.delivery_passcode_hash,
                    COALESCE(p.can_dashboard, 0) AS can_dashboard,
                    COALESCE(p.can_dms, 0) AS can_dms,
                    COALESCE(p.can_add_seller, 0) AS can_add_seller,
                    COALESCE(p.can_add_item, 0) AS can_add_item,
                    COALESCE(p.can_item_list, 0) AS can_item_list,
                    COALESCE(p.can_update_payment, 0) AS can_update_payment,
                    COALESCE(p.can_bank_deposit, 0) AS can_bank_deposit,
                    COALESCE(p.can_create_staff, 0) AS can_create_staff,
                    COALESCE(p.can_add_outlet, 0) AS can_add_outlet,
                    COALESCE(p.can_location_assignments, 0) AS can_location_assignments,
                    COALESCE(p.can_add_sales, 0) AS can_add_sales,
                    COALESCE(p.can_packaging, 0) AS can_packaging,
                    COALESCE(p.can_delivery, 0) AS can_delivery,
                    COALESCE(p.can_delivered, 0) AS can_delivered,
                    COALESCE(p.can_out_bill, 0) AS can_out_bill,
                    COALESCE(p.can_requisition_approval, 0) AS can_requisition_approval,
                    COALESCE(p.can_chalan_add_sales, 0) AS can_chalan_add_sales,
                    COALESCE(p.can_chalan_packaging, 0) AS can_chalan_packaging,
                    COALESCE(p.can_chalan_delivery, 0) AS can_chalan_delivery,
                    COALESCE(p.can_chalan_delivered, 0) AS can_chalan_delivered,
                    COALESCE(p.can_chalan_return, 0) AS can_chalan_return
             FROM delivery_boys db
             LEFT JOIN delivery_user_permissions p ON p.delivery_boy_id = db.id
             ORDER BY db.role, db.name`
        );
        return Promise.all(rows.map(async (row) => {
            const decryptedPasscode = decryptDeliveryPasscode(row.delivery_passcode);
            const hasCredentials = Boolean(
                decryptedPasscode
                && row.delivery_passcode_hash
                && await bcrypt.compare(decryptedPasscode, row.delivery_passcode_hash)
            );
            const {
                delivery_passcode: _encryptedPasscode,
                delivery_passcode_hash: _passcodeHash,
                ...safeRow
            } = row;
            return { ...safeRow, has_credentials: hasCredentials ? 1 : 0 };
        }));
    }

    static async setPermissions(deliveryBoyId, permissions) {
        await db.execute(
            `INSERT INTO delivery_user_permissions (
                delivery_boy_id, can_dashboard, can_dms, can_add_seller, can_add_item, can_item_list,
                can_update_payment, can_bank_deposit, can_create_staff, can_add_outlet, can_location_assignments, can_add_sales,
                can_packaging, can_delivery, can_delivered, can_out_bill, can_requisition_approval,
                can_chalan_add_sales, can_chalan_packaging, can_chalan_delivery, can_chalan_delivered, can_chalan_return
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                can_dashboard = VALUES(can_dashboard),
                can_dms = VALUES(can_dms),
                can_add_seller = VALUES(can_add_seller),
                can_add_item = VALUES(can_add_item),
                can_item_list = VALUES(can_item_list),
                can_update_payment = VALUES(can_update_payment),
                can_bank_deposit = VALUES(can_bank_deposit),
                can_create_staff = VALUES(can_create_staff),
                can_add_outlet = VALUES(can_add_outlet),
                can_location_assignments = VALUES(can_location_assignments),
                can_add_sales = VALUES(can_add_sales),
                can_packaging = VALUES(can_packaging),
                can_delivery = VALUES(can_delivery),
                can_delivered = VALUES(can_delivered),
                can_out_bill = VALUES(can_out_bill),
                can_requisition_approval = VALUES(can_requisition_approval),
                can_chalan_add_sales = VALUES(can_chalan_add_sales),
                can_chalan_packaging = VALUES(can_chalan_packaging),
                can_chalan_delivery = VALUES(can_chalan_delivery),
                can_chalan_delivered = VALUES(can_chalan_delivered),
                can_chalan_return = VALUES(can_chalan_return)`,
            [
                deliveryBoyId,
                permissions.includes('dashboard') ? 1 : 0,
                permissions.includes('dms') ? 1 : 0,
                permissions.includes('add_seller') ? 1 : 0,
                permissions.includes('add_item') ? 1 : 0,
                permissions.includes('item_list') ? 1 : 0,
                permissions.includes('update_payment') ? 1 : 0,
                permissions.includes('bank_deposit') ? 1 : 0,
                permissions.includes('create_staff') ? 1 : 0,
                permissions.includes('add_outlet') ? 1 : 0,
                permissions.includes('location_assignments') ? 1 : 0,
                permissions.includes('add_sales') ? 1 : 0,
                permissions.includes('packaging') ? 1 : 0,
                permissions.includes('delivery') ? 1 : 0,
                permissions.includes('delivered') ? 1 : 0,
                permissions.includes('out_bill') ? 1 : 0,
                permissions.includes('requisition_approval') ? 1 : 0,
                permissions.includes('chalan_add_sales') ? 1 : 0,
                permissions.includes('chalan_packaging') ? 1 : 0,
                permissions.includes('chalan_delivery') ? 1 : 0,
                permissions.includes('chalan_delivered') ? 1 : 0,
                permissions.includes('chalan_return') ? 1 : 0,
            ]
        );
    }

    static async update(id, name, contactNo, companyId = null, role = 'delivery_boy', aadharNo = null) {
        const normalizedRole = role === 'packaging_staff' ? 'packaging_staff' : 'delivery_boy';
        const [result] = await db.execute(
            'UPDATE delivery_boys SET name = ?, contact_no = ?, company_id = ?, role = ?, aadhar_no = ? WHERE id = ?',
            [name, contactNo, companyId, normalizedRole, aadharNo, id]
        );
        return result.affectedRows > 0;
    }

    static async toggleActive(id) {
        await db.execute(
            'UPDATE delivery_boys SET is_active = NOT is_active WHERE id = ?',
            [id]
        );
        const [rows] = await db.execute(
            'SELECT is_active FROM delivery_boys WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    static async generateCredentials(id) {
        const [rows] = await db.execute(
            `SELECT id, delivery_login_id, delivery_passcode_hash, delivery_passcode
             FROM delivery_boys
             WHERE id = ?
             LIMIT 1`,
            [id]
        );
        const deliveryBoy = rows[0] || null;
        if (!deliveryBoy) {
            return null;
        }

        const storedPasscode = decryptDeliveryPasscode(deliveryBoy.delivery_passcode);
        const existingCredentialsValid = Boolean(
            deliveryBoy.delivery_login_id
            && deliveryBoy.delivery_passcode_hash
            && storedPasscode
            && await bcrypt.compare(storedPasscode, deliveryBoy.delivery_passcode_hash)
        );
        if (existingCredentialsValid) {
            return {
                deliveryBoyId: Number(id),
                deliveryLoginId: deliveryBoy.delivery_login_id,
                alreadyGenerated: true,
            };
        }

        const deliveryLoginId = DeliveryBoyModel.formatLoginId(id);
        const passcode = DeliveryBoyModel.generatePasscode();
        const passcodeHash = await bcrypt.hash(passcode, 10);
        const encryptedPasscode = encryptDeliveryPasscode(passcode);

        await db.execute(
            `UPDATE delivery_boys
             SET delivery_login_id = ?, delivery_passcode_hash = ?, delivery_passcode = ?
             WHERE id = ?`,
            [deliveryLoginId, passcodeHash, encryptedPasscode, id]
        );

        return {
            deliveryBoyId: Number(id),
            deliveryLoginId,
            passcode,
        };
    }

    static async delete(id) {
        const [result] = await db.execute('DELETE FROM delivery_boys WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    static async getAssignedSales(deliveryBoyId, { status = '', date = '' } = {}) {
        const params = [deliveryBoyId];
        let where = `WHERE ss.delivery_boy_id = ?`;

        if (status) {
            where += ` AND ss.packaging_status = ?`;
            params.push(status);
        } else {
            where += ` AND ss.packaging_status IN ('out_for_delivery', 'delivered', 'cancelled', 'returned')`;
        }

        if (date) {
            where += ` AND ss.delivery_date = ?`;
            params.push(date);
        }

        const [rows] = await db.execute(
            `SELECT ss.id, CONCAT('BP', ss.id) AS bp_sale_id, ss.invoice_number,
                    DATE_FORMAT(ss.sale_date, '%Y-%m-%d') AS sale_date,
                    DATE_FORMAT(ss.delivery_date, '%Y-%m-%d') AS delivery_date,
                    ss.item_count, ss.packed_item_count, ss.box_count, ss.packet_count, ss.price,
                    ss.packaging_status, ss.vehicle_no,
                    sc.outlet_name, sc.outlet_erp_id, sc.contact_number, sc.location_name, sc.google_location,
                    s.name AS staff_name, c.name AS company_name,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
             LEFT JOIN companies c ON s.company_id = c.id
             LEFT JOIN (
                 SELECT sale_id, MAX(changed_at) AS status_updated_at
                 FROM staff_sale_status_history
                 GROUP BY sale_id
             ) ssh ON ssh.sale_id = ss.id
             ${where}
             ORDER BY ss.delivery_date DESC, ss.id DESC`,
            params
        );
        return rows;
    }

    static async updateAssignedSaleStatus(deliveryBoyId, saleId, status, cancellationReason = null) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                `SELECT id, packaging_status
                 FROM staff_sales
                 WHERE id = ? AND delivery_boy_id = ?
                 FOR UPDATE`,
                [saleId, deliveryBoyId]
            );

            const sale = rows[0];
            if (!sale) {
                await connection.rollback();
                return null;
            }

            if (sale.packaging_status !== 'out_for_delivery') {
                await connection.rollback();
                return { locked: true, packaging_status: sale.packaging_status };
            }

            if (status === 'cancelled') {
                if (sale.packaging_status !== 'cancelled') {
                    await connection.execute(
                        `INSERT INTO staff_sale_status_history (sale_id, status, changed_at)
                         VALUES (?, 'cancelled', NOW())`,
                        [saleId]
                    );
                }

                const [itemRows] = await connection.execute(
                    'SELECT item_count FROM staff_sales WHERE id = ?',
                    [saleId]
                );
                const resetPackedCount = itemRows[0]?.item_count ?? null;

                await connection.execute(
                    `UPDATE staff_sales
                     SET packaging_status = 'cancelled',
                         cancellation_reason = ?,
                         delivery_boy_id = NULL,
                         vehicle_no = NULL,
                         delivery_date = NULL,
                         packed_item_count = ?,
                         box_count = NULL,
                         packet_count = NULL
                     WHERE id = ? AND delivery_boy_id = ?`,
                    [cancellationReason, resetPackedCount, saleId, deliveryBoyId]
                );
            } else {
                await connection.execute(
                    `UPDATE staff_sales
                     SET packaging_status = ?
                     WHERE id = ? AND delivery_boy_id = ?`,
                    [status, saleId, deliveryBoyId]
                );

                if (sale.packaging_status !== status) {
                    await connection.execute(
                        `INSERT INTO staff_sale_status_history (sale_id, status, changed_at)
                         VALUES (?, ?, NOW())`,
                        [saleId, status]
                    );
                }
            }

            await connection.commit();
            if (status === 'cancelled') {
                return { id: saleId, packaging_status: 'cancelled', delivery_cancelled: true };
            }

            const updatedRows = await DeliveryBoyModel.getAssignedSales(deliveryBoyId);
            return updatedRows.find((item) => Number(item.id) === Number(saleId)) || null;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async updateCredentials(id, deliveryLoginId, passcode) {
        const passcodeHash = await bcrypt.hash(passcode, 10);
        const encryptedPasscode = encryptDeliveryPasscode(passcode);
        const [result] = await db.execute(
            `UPDATE delivery_boys
             SET delivery_login_id = ?, delivery_passcode_hash = ?, delivery_passcode = ?
             WHERE id = ?`,
            [deliveryLoginId, passcodeHash, encryptedPasscode, id]
        );
        return result.affectedRows > 0;
    }

    static async findByLoginId(loginId) {
        const [rows] = await db.execute(
            'SELECT id FROM delivery_boys WHERE LOWER(delivery_login_id) = LOWER(?) LIMIT 1',
            [loginId]
        );
        return rows[0] || null;
    }

    static async updateAssignedSaleLocation(deliveryBoyId, saleId, googleLocation) {
        const [result] = await db.execute(
            `UPDATE staff_counters sc
             INNER JOIN staff_sales ss ON ss.outlet_id = sc.id
             SET sc.google_location = ?
             WHERE ss.id = ?
               AND ss.delivery_boy_id = ?
               AND ss.packaging_status = 'out_for_delivery'
               AND (sc.google_location IS NULL OR TRIM(sc.google_location) = '')`,
            [googleLocation, saleId, deliveryBoyId]
        );

        if (result.affectedRows === 0) {
            return null;
        }

        return { id: saleId, google_location: googleLocation };
    }
}

export default DeliveryBoyModel;
