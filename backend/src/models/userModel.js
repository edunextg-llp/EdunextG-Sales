import db from '../config/db.js';

class UserModel {
    static async findByEmail(email) {
        const [rows] = await db.execute(
            'SELECT id, username, email, password, token_version FROM admins WHERE email = ?',
            [email]
        );
        return rows[0] || null;
    }

    static async findById(id) {
        const [rows] = await db.execute(
            'SELECT id, username, email, password, token_version FROM admins WHERE id = ?',
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

    static async getTokenVersion(id) {
        const [rows] = await db.execute(
            'SELECT token_version FROM admins WHERE id = ?',
            [id]
        );
        if (!rows[0]) return null;
        return Number(rows[0].token_version) || 0;
    }

    // Bumping the version invalidates every access/refresh token issued
    // before now, which logs the admin out on all devices.
    static async incrementTokenVersion(id) {
        await db.execute(
            'UPDATE admins SET token_version = token_version + 1 WHERE id = ?',
            [id]
        );
        return UserModel.getTokenVersion(id);
    }
}

export default UserModel;
