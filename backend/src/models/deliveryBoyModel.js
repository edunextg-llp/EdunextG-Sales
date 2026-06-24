import db from '../config/db.js';
import bcrypt from 'bcryptjs';
import { formatDeliveryLoginId, generateDeliveryPasscode } from '../utils/deliveryCredentials.js';

class DeliveryBoyModel {
    static formatLoginId(id) {
        return formatDeliveryLoginId(id);
    }

    static generatePasscode() {
        return generateDeliveryPasscode();
    }

    static async create(name, contactNo, companyId = null) {
        const deliveryPasscode = DeliveryBoyModel.generatePasscode();
        const passcodeHash = await bcrypt.hash(deliveryPasscode, 10);
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const [result] = await connection.execute(
                'INSERT INTO delivery_boys (name, contact_no, company_id, delivery_passcode_hash) VALUES (?, ?, ?, ?)',
                [name, contactNo, companyId, passcodeHash]
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

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT db.id, db.name, db.contact_no, db.company_id, db.delivery_login_id,
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
             ORDER BY db.name`
        );
        return rows;
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT db.id, db.name, db.contact_no, db.company_id, db.delivery_login_id,
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
            `SELECT id, name, contact_no, delivery_login_id, delivery_passcode_hash
             FROM delivery_boys
             WHERE delivery_login_id = ?
             LIMIT 1`,
            [loginId]
        );
        const deliveryBoy = rows[0] || null;
        if (!deliveryBoy?.delivery_passcode_hash) {
            return null;
        }

        const passcodeMatches = await bcrypt.compare(passcode, deliveryBoy.delivery_passcode_hash);
        if (!passcodeMatches) {
            return null;
        }

        const { delivery_passcode_hash: _hash, ...safeDeliveryBoy } = deliveryBoy;
        return safeDeliveryBoy;
    }

    static async update(id, name, contactNo, companyId = null) {
        const [result] = await db.execute(
            'UPDATE delivery_boys SET name = ?, contact_no = ?, company_id = ? WHERE id = ?',
            [name, contactNo, companyId, id]
        );
        return result.affectedRows > 0;
    }

    static async generateCredentials(id) {
        const deliveryBoy = await DeliveryBoyModel.getById(id);
        if (!deliveryBoy) {
            return null;
        }

        const deliveryLoginId = DeliveryBoyModel.formatLoginId(id);
        const passcode = DeliveryBoyModel.generatePasscode();
        const passcodeHash = await bcrypt.hash(passcode, 10);

        await db.execute(
            `UPDATE delivery_boys
             SET delivery_login_id = ?, delivery_passcode_hash = ?
             WHERE id = ?`,
            [deliveryLoginId, passcodeHash, id]
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
                    ss.item_count, ss.packed_item_count, ss.box_count, ss.price,
                    ss.packaging_status, ss.vehicle_no,
                    sc.outlet_name, sc.outlet_erp_id, sc.contact_number, sc.google_location,
                    s.name AS staff_name,
                    DATE_FORMAT(ssh.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at
             FROM staff_sales ss
             LEFT JOIN staff_counters sc ON ss.outlet_id = sc.id
             LEFT JOIN staff s ON ss.staff_id = s.id
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

    static async updateAssignedSaleStatus(deliveryBoyId, saleId, status) {
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
                         delivery_boy_id = NULL,
                         vehicle_no = NULL,
                         delivery_date = NULL,
                         packed_item_count = ?,
                         box_count = NULL
                     WHERE id = ? AND delivery_boy_id = ?`,
                    [resetPackedCount, saleId, deliveryBoyId]
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
}

export default DeliveryBoyModel;
