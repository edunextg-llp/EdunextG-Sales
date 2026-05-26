import db from '../config/db.js';

class UserModel {
    static async findByEmail(email) {
        const [rows] = await db.execute(
            'SELECT id, username, email, password FROM admins WHERE email = ?',
            [email]
        );
        return rows[0] || null;
    }
}

export default UserModel;
