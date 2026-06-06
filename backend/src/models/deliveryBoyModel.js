import db from '../config/db.js';

class DeliveryBoyModel {
    static async create(name, contactNo, companyId = null) {
        const [result] = await db.execute(
            'INSERT INTO delivery_boys (name, contact_no, company_id) VALUES (?, ?, ?)',
            [name, contactNo, companyId]
        );
        return result.insertId;
    }

    static async setCompanies(deliveryBoyId, companyIds = []) {
        await db.execute('DELETE FROM delivery_boy_companies WHERE delivery_boy_id = ?', [
            deliveryBoyId,
        ]);

        const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean))];
        for (const companyId of uniqueCompanyIds) {
            await db.execute(
                'INSERT IGNORE INTO delivery_boy_companies (delivery_boy_id, company_id) VALUES (?, ?)',
                [deliveryBoyId, companyId]
            );
        }
    }

    static async getAll() {
        const [rows] = await db.execute(
            `SELECT db.id, db.name, db.contact_no, db.company_id,
                    COALESCE(dbc.company_names, c.name) AS company_name,
                    dbc.company_ids
             FROM delivery_boys db
             LEFT JOIN companies c ON c.id = db.company_id
             LEFT JOIN (
                 SELECT dbc.delivery_boy_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM delivery_boy_companies dbc
                 INNER JOIN companies c2 ON c2.id = dbc.company_id
                 GROUP BY dbc.delivery_boy_id
             ) dbc ON dbc.delivery_boy_id = db.id
             ORDER BY db.name`
        );
        return rows;
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT db.id, db.name, db.contact_no, db.company_id,
                    COALESCE(dbc.company_names, c.name) AS company_name,
                    dbc.company_ids
             FROM delivery_boys db
             LEFT JOIN companies c ON c.id = db.company_id
             LEFT JOIN (
                 SELECT dbc.delivery_boy_id,
                        GROUP_CONCAT(c2.name ORDER BY c2.name SEPARATOR ', ') AS company_names,
                        GROUP_CONCAT(c2.id ORDER BY c2.name) AS company_ids
                 FROM delivery_boy_companies dbc
                 INNER JOIN companies c2 ON c2.id = dbc.company_id
                 GROUP BY dbc.delivery_boy_id
             ) dbc ON dbc.delivery_boy_id = db.id
             WHERE db.id = ?`,
            [id]
        );
        return rows[0];
    }
}

export default DeliveryBoyModel;
