import db from '../config/db.js';

class UserModel {
    static async findByEmail(email) {
        const [rows] = await db.execute(
            'SELECT id, username, email, password FROM admins WHERE email = ?',
            [email]
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
}

export default UserModel;
