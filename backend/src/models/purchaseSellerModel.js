import db from '../config/db.js';

class PurchaseSellerModel {
    static async upsert(data) {
        const { sellerName, address, city, state, gstin, panNo } = data;
        const pinCode = data.pinCode ?? data.inCode;

        const [result] = await db.execute(
            `INSERT INTO purchase_sellers (seller_name, address, city, state, gstin, pan_no, in_code)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               address = VALUES(address),
               city = VALUES(city),
               state = VALUES(state),
               gstin = VALUES(gstin),
               pan_no = VALUES(pan_no),
               in_code = VALUES(in_code)`,
            [sellerName, address || null, city || null, state || null, gstin || null, panNo || null, pinCode || null]
        );

        const sellerId = result.insertId || (await PurchaseSellerModel.findByName(sellerName))?.id;
        return PurchaseSellerModel.getById(sellerId);
    }

    static async findByName(sellerName) {
        const [rows] = await db.execute(
            `SELECT id, seller_name, address, city, state, gstin, pan_no, in_code
             FROM purchase_sellers
             WHERE LOWER(seller_name) = LOWER(?)
             LIMIT 1`,
            [sellerName]
        );
        return rows[0] || null;
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT id, seller_name, address, city, state, gstin, pan_no, in_code
             FROM purchase_sellers
             WHERE id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    static async search(search = '') {
        const query = String(search || '').trim();
        const params = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];
        const where = query
            ? 'WHERE seller_name LIKE ? OR city LIKE ? OR gstin LIKE ?'
            : '';

        const [rows] = await db.execute(
            `SELECT id, seller_name, address, city, state, gstin, pan_no, in_code
             FROM purchase_sellers
             ${where}
             ORDER BY seller_name ASC
             LIMIT 20`,
            params
        );
        return rows;
    }
}

export default PurchaseSellerModel;
