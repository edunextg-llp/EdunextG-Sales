import db from '../config/db.js';

class StaffModel {
    static async create(name, contactNo) {
        const [result] = await db.execute(
            'INSERT INTO staff (name, contact_no) VALUES (?, ?)',
            [name, contactNo]
        );
        return result.insertId;
    }

    static async addLocation(staffId, day, locationName) {
        await db.execute(
            'INSERT INTO staff_locations (staff_id, day, location_name) VALUES (?, ?, ?)',
            [staffId, day, locationName]
        );
    }

    static async getLocationsByStaffAndDay(staffId, day) {
        const [rows] = await db.execute(
            'SELECT * FROM staff_locations WHERE staff_id = ? AND day = ?',
            [staffId, day]
        );
        return rows;
    }

    static async searchByName(query) {
        const [rows] = await db.execute(
            'SELECT id, name, contact_no FROM staff WHERE name LIKE ?',
            [`%${query}%`]
        );
        return rows;
    }

    static async getDetails(id) {
        const [rows] = await db.execute(
            'SELECT id, name, contact_no FROM staff WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    static async addCounter(staffId, day, location, counterData) {
        const { outletErpId, outletName, contactNumber } = counterData;
        await db.execute(
            'INSERT INTO staff_counters (staff_id, day, location, outlet_erp_id, outlet_name, contact_number) VALUES (?, ?, ?, ?, ?, ?)',
            [staffId, day, location, outletErpId, outletName, contactNumber]
        );
    }

    static async update(id, name, contactNo) {
        await db.execute(
            'UPDATE staff SET name = ?, contact_no = ? WHERE id = ?',
            [name, contactNo, id]
        );
    }

    static async deleteLocations(staffId) {
        await db.execute(
            'DELETE FROM staff_locations WHERE staff_id = ?',
            [staffId]
        );
    }

    static async getAllLocations(staffId) {
        const [rows] = await db.execute(
            'SELECT * FROM staff_locations WHERE staff_id = ?',
            [staffId]
        );
        return rows;
    }

    static async getAll() {
        const [rows] = await db.execute('SELECT * FROM staff');
        return rows;
    }

    static async getOutletsForStaffAndDay(staffId, dayName) {
        const [rows] = await db.execute(
            'SELECT id, outlet_erp_id, outlet_name, contact_number FROM staff_counters WHERE staff_id = ? AND day = ?',
            [staffId, dayName]
        );
        return rows;
    }

    static async saveSales(staffId, date, salesData) {
        // salesData: [{ outletId: 1, price: 100 }, ...]
        for (const item of salesData) {
            await db.execute(
                'INSERT INTO staff_sales (staff_id, outlet_id, sale_date, price) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE price = VALUES(price)',
                [staffId, item.outletId, date, item.price]
            );
        }
    }
}

export default StaffModel;
