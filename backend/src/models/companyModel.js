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

    static async getAll(type = null) {
        if (type) {
            const [rows] = await db.execute(
                'SELECT id, name, type, about, created_at FROM companies WHERE type = ? ORDER BY name',
                [type]
            );
            return rows;
        }
        const [rows] = await db.execute(
            'SELECT id, name, type, about, created_at FROM companies ORDER BY name'
        );
        return rows;
    }

    static async create(name, type, about) {
        const [result] = await db.execute(
            'INSERT INTO companies (name, type, about) VALUES (?, ?, ?)',
            [name, type || null, about || null]
        );
        return result.insertId;
    }

    static async deleteById(id) {
        const [result] = await db.execute(
            'DELETE FROM companies WHERE id = ?',
            [id]
        );
        return result.affectedRows;
    }

    static async getAssignedToStaff() {
        const [rows] = await db.execute(`
            SELECT DISTINCT c.id, c.name, c.type, c.about
            FROM companies c
            INNER JOIN staff_companies sc ON sc.company_id = c.id
            ORDER BY c.name
        `);
        return rows;
    }
}

export default CompanyModel;
