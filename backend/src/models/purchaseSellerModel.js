import db from '../config/db.js';
import { formatSellerCode } from '../utils/sellerCode.js';

const SELLER_COLUMNS = `
    ps.id,
    ps.seller_code,
    ps.company_id,
    c.name AS company_name,
    ps.seller_name,
    ps.address,
    ps.city,
    ps.district,
    ps.state,
    ps.contact,
    ps.has_gst,
    ps.gstin,
    ps.pan_no,
    ps.in_code,
    ps.created_at
`;

class PurchaseSellerModel {
    static async getNextSellerCode(connection) {
        await connection.execute(
            'INSERT IGNORE INTO seller_sequence (id, seq_value) VALUES (1, 0)'
        );
        await connection.execute(
            'UPDATE seller_sequence SET seq_value = seq_value + 1 WHERE id = 1'
        );
        const [rows] = await connection.execute(
            'SELECT seq_value FROM seller_sequence WHERE id = 1'
        );
        if (!rows[0]) {
            throw new Error('Seller sequence not initialized.');
        }
        return formatSellerCode(rows[0].seq_value);
    }

    static async ensureSellerCode(sellerId) {
        const seller = await PurchaseSellerModel.getById(sellerId);
        if (!seller || seller.seller_code) return seller;

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const sellerCode = await PurchaseSellerModel.getNextSellerCode(connection);
            await connection.execute(
                'UPDATE purchase_sellers SET seller_code = ? WHERE id = ? AND seller_code IS NULL',
                [sellerCode, sellerId]
            );
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        return PurchaseSellerModel.getById(sellerId);
    }

    static buildValues(data) {
        const pinCode = data.pinCode ?? data.inCode;
        return {
            companyId: data.companyId || null,
            sellerName: data.sellerName,
            address: data.address || null,
            city: data.city || null,
            district: data.district || null,
            state: data.state || null,
            contact: data.contact || null,
            hasGst: data.hasGst ? 1 : 0,
            gstin: data.gstin || null,
            panNo: data.panNo || null,
            pinCode: pinCode || null,
        };
    }

    static async upsert(data) {
        const existing = await PurchaseSellerModel.findByNameAndCompany(
            data.sellerName,
            data.companyId
        );
        if (existing) {
            return PurchaseSellerModel.updateById(existing.id, data);
        }
        return PurchaseSellerModel.insert(data);
    }

    static async insert(data) {
        const values = PurchaseSellerModel.buildValues(data);
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const sellerCode = await PurchaseSellerModel.getNextSellerCode(connection);
            const [result] = await connection.execute(
                `INSERT INTO purchase_sellers (
                    seller_code, company_id, seller_name, address, city, district, state, contact,
                    has_gst, gstin, pan_no, in_code
                 )
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    sellerCode,
                    values.companyId,
                    values.sellerName,
                    values.address,
                    values.city,
                    values.district,
                    values.state,
                    values.contact,
                    values.hasGst,
                    values.gstin,
                    values.panNo,
                    values.pinCode,
                ]
            );
            await connection.commit();
            return PurchaseSellerModel.getById(result.insertId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async create(data) {
        return PurchaseSellerModel.upsert(data);
    }

    static async updateById(id, data) {
        const values = PurchaseSellerModel.buildValues(data);

        await db.execute(
            `UPDATE purchase_sellers
             SET company_id = ?,
                 seller_name = ?,
                 address = ?,
                 city = ?,
                 district = ?,
                 state = ?,
                 contact = ?,
                 has_gst = ?,
                 gstin = ?,
                 pan_no = ?,
                 in_code = ?
             WHERE id = ?`,
            [
                values.companyId,
                values.sellerName,
                values.address,
                values.city,
                values.district,
                values.state,
                values.contact,
                values.hasGst,
                values.gstin,
                values.panNo,
                values.pinCode,
                id,
            ]
        );

        return PurchaseSellerModel.getById(id);
    }

    static async deleteById(id) {
        const [result] = await db.execute('DELETE FROM purchase_sellers WHERE id = ?', [id]);
        return result.affectedRows;
    }

    static async findByName(sellerName) {
        const [rows] = await db.execute(
            `SELECT ${SELLER_COLUMNS}
             FROM purchase_sellers ps
             LEFT JOIN companies c ON c.id = ps.company_id
             WHERE LOWER(ps.seller_name) = LOWER(?)
             LIMIT 1`,
            [sellerName]
        );
        return rows[0] || null;
    }

    static async findByNameAndCompany(sellerName, companyId) {
        const [rows] = await db.execute(
            `SELECT ${SELLER_COLUMNS}
             FROM purchase_sellers ps
             LEFT JOIN companies c ON c.id = ps.company_id
             WHERE LOWER(ps.seller_name) = LOWER(?)
               AND ps.company_id <=> ?
             LIMIT 1`,
            [sellerName, companyId || null]
        );
        return rows[0] || null;
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT ${SELLER_COLUMNS}
             FROM purchase_sellers ps
             LEFT JOIN companies c ON c.id = ps.company_id
             WHERE ps.id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    static async getByCompany(companyId) {
        const [rows] = await db.execute(
            `SELECT ${SELLER_COLUMNS}
             FROM purchase_sellers ps
             LEFT JOIN companies c ON c.id = ps.company_id
             WHERE ps.company_id = ?
             ORDER BY ps.seller_name ASC`,
            [companyId]
        );
        return rows;
    }

    static async search(search = '', companyId = null) {
        const query = String(search || '').trim();
        const conditions = [];
        const params = [];

        if (companyId) {
            conditions.push('ps.company_id = ?');
            params.push(Number(companyId));
        }

        if (query) {
            conditions.push(
                '(ps.seller_name LIKE ? OR ps.seller_code LIKE ? OR ps.city LIKE ? OR ps.gstin LIKE ? OR ps.contact LIKE ?)'
            );
            params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const [rows] = await db.execute(
            `SELECT ${SELLER_COLUMNS}
             FROM purchase_sellers ps
             LEFT JOIN companies c ON c.id = ps.company_id
             ${where}
             ORDER BY ps.seller_name ASC
             LIMIT 50`,
            params
        );
        return rows;
    }
}

export default PurchaseSellerModel;
