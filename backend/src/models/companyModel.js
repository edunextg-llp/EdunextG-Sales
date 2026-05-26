import db from '../config/db.js';

class CompanyModel {
    static async findOrCreateByName(name) {
        const [existing] = await db.execute(
            'SELECT id FROM companies WHERE name = ?',
            [name]
        );
        if (existing.length > 0) {
            return existing[0].id;
        }
        const [result] = await db.execute(
            'INSERT INTO companies (name) VALUES (?)',
            [name]
        );
        return result.insertId;
    }

    static async getAll() {
        const [rows] = await db.execute('SELECT id, name FROM companies ORDER BY name');
        return rows;
    }
}

export default CompanyModel;
