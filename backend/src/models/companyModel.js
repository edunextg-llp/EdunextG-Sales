import db from '../config/db.js';
import { formatCompanyCode } from '../utils/companyCode.js';

const EMAILS_SUBQUERY = `
    LEFT JOIN (
        SELECT company_id, GROUP_CONCAT(email ORDER BY id SEPARATOR ',') AS emails
        FROM company_emails
        GROUP BY company_id
    ) ce ON ce.company_id = c.id`;

const withEmailList = (row) => {
    if (!row) return row;
    const { emails, ...rest } = row;
    return { ...rest, emails: emails ? String(emails).split(',') : [] };
};

class CompanyModel {
    static async setEmails(companyId, emails = [], connection = db) {
        await connection.execute('DELETE FROM company_emails WHERE company_id = ?', [companyId]);
        for (const email of emails) {
            await connection.execute(
                'INSERT IGNORE INTO company_emails (company_id, email) VALUES (?, ?)',
                [companyId, email]
            );
        }
    }

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
        const baseSql = `SELECT c.id, c.code, c.name, c.type, c.about, c.created_at, ce.emails
             FROM companies c ${EMAILS_SUBQUERY}`;
        if (type) {
            const [rows] = await db.execute(`${baseSql} WHERE c.type = ? ORDER BY c.name`, [type]);
            return rows.map(withEmailList);
        }
        const [rows] = await db.execute(`${baseSql} ORDER BY c.name`);
        return rows.map(withEmailList);
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT c.id, c.code, c.name, c.type, c.about, c.created_at, ce.emails
             FROM companies c ${EMAILS_SUBQUERY}
             WHERE c.id = ?`,
            [id]
        );
        return withEmailList(rows[0]) || null;
    }

    static async create(name, type, about, emails = []) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const code = await CompanyModel.getNextCompanyCode(connection);
            const [result] = await connection.execute(
                'INSERT INTO companies (name, type, about, code) VALUES (?, ?, ?, ?)',
                [name, type || null, about || null, code]
            );
            await CompanyModel.setEmails(result.insertId, emails, connection);
            await connection.commit();
            return { id: result.insertId, code };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async updateById(id, { name, type, about, emails }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.execute(
                'UPDATE companies SET name = ?, type = ?, about = ? WHERE id = ?',
                [name, type || null, about || null, id]
            );
            // Only replace emails when the caller sent them
            if (result.affectedRows > 0 && Array.isArray(emails)) {
                await CompanyModel.setEmails(id, emails, connection);
            }
            await connection.commit();
            return result.affectedRows;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
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
