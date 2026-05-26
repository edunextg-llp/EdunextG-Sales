import db from '../config/db.js';

class DeliveryBoyModel {
    static async create(name, contactNo) {
        const [result] = await db.execute(
            'INSERT INTO delivery_boys (name, contact_no) VALUES (?, ?)',
            [name, contactNo]
        );
        return result.insertId;
    }

    static async getAll() {
        const [rows] = await db.execute(
            'SELECT id, name, contact_no FROM delivery_boys ORDER BY name'
        );
        return rows;
    }

    static async getById(id) {
        const [rows] = await db.execute(
            'SELECT id, name, contact_no FROM delivery_boys WHERE id = ?',
            [id]
        );
        return rows[0];
    }
}

export default DeliveryBoyModel;
