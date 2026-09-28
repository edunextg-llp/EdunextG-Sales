import db from '../config/db.js';

class UserModel {
    static async findByEmail(email) {
        const [rows] = await db.execute(
            'SELECT id, username, email, password FROM admins WHERE email = ?',
            [email]
        );
        return rows[0] || null;
    }

    static async findById(id) {
        const [rows] = await db.execute(
            'SELECT id, username, email, password FROM admins WHERE id = ?',
            [id]
        );
        return rows[0] || null;
    }

    static async createAdmin(username, email, hashedPassword) {
        const [result] = await db.execute(
            'INSERT INTO admins (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        return result.insertId;
    }

    static async updateCredentials(id, email, hashedPassword) {
        const [result] = await db.execute(
            'UPDATE admins SET email = ?, password = ? WHERE id = ?',
            [email, hashedPassword, id]
        );
        return result.affectedRows > 0;
    }
}

export default UserModel;
