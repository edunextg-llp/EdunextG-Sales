import db from '../config/db.js';
import { formatCompanyCode } from '../utils/companyCode.js';

class CompanyModel {
    static async getNextCompanyCode(connection) {
        await connection.execute(
            'INSERT IGNORE INTO company_sequence (id, seq_value) VALUES (1, 0)'
        );
        await connection.execute(
            'UPDATE company_sequence SET seq_value = seq_value + 1 WHERE id = 1'
        );
        const [rows] = await connection.execute(
            'SELECT seq_value FROM company_sequence WHERE id = 1'
        );
        if (!rows[0]) {
            throw new Error('Company sequence not initialized.');
        }
        return formatCompanyCode(rows[0].seq_value);
    }

    static async findOrCreateByName(name) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [existing] = await connection.execute(
                'SELECT id FROM companies WHERE name = ?',
                [name]
            );
            if (existing.length > 0) {
                await connection.commit();
                return existing[0].id;
            }

            const code = await CompanyModel.getNextCompanyCode(connection);
            const [result] = await connection.execute(
                'INSERT INTO companies (name, code) VALUES (?, ?)',
                [name, code]
            );
            await connection.commit();
            return result.insertId;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getAll(type = null) {
        if (type) {
            const [rows] = await db.execute(
                'SELECT id, code, name, type, about, created_at FROM companies WHERE type = ? ORDER BY name',
                [type]
            );
            return rows;
        }
        const [rows] = await db.execute(
            'SELECT id, code, name, type, about, created_at FROM companies ORDER BY name'
        );
        return rows;
    }

    static async getById(id) {
        const [rows] = await db.execute(
            'SELECT id, code, name, type, about, created_at FROM companies WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    static async create(name, type, about) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const code = await CompanyModel.getNextCompanyCode(connection);
            const [result] = await connection.execute(
                'INSERT INTO companies (name, type, about, code) VALUES (?, ?, ?, ?)',
                [name, type || null, about || null, code]
            );
            await connection.commit();
            return { id: result.insertId, code };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async updateById(id, { name, type, about }) {
        const [result] = await db.execute(
            'UPDATE companies SET name = ?, type = ?, about = ? WHERE id = ?',
            [name, type || null, about || null, id]
        );
        return result.affectedRows;
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
            SELECT DISTINCT c.id, c.code, c.name, c.type, c.about
            FROM companies c
            INNER JOIN staff_companies sc ON sc.company_id = c.id
            ORDER BY c.name
        `);
        return rows;
    }
}

export default CompanyModel;
