export const normalizeAreaName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toUpperCase();

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Holiday days: a list (or "Sunday, Monday" text) of weekdays -> "Monday, Sunday" or null.
export function normalizeHolidayDays(value) {
    const list = Array.isArray(value) ? value : String(value || '').split(',');
    const picked = new Set(list.map((day) => String(day || '').trim().toLowerCase()));
    const days = WEEKDAYS.filter((day) => picked.has(day.toLowerCase()));
    return days.length ? days.join(', ') : null;
}

export async function migrateAreas(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS areas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
        holiday_day VARCHAR(100) NULL
    )`);
    const [holidayColumn] = await connection.query("SHOW COLUMNS FROM areas LIKE 'holiday_day'");
    if (!holidayColumn.length) await connection.query('ALTER TABLE areas ADD COLUMN holiday_day VARCHAR(100) NULL');
    const [rows] = await connection.query(`SELECT location_name FROM staff_counters
        UNION ALL SELECT location_name FROM staff_locations`);
    const names = [...new Set(rows.map(row => normalizeAreaName(row.location_name)).filter(Boolean))];
    for (const name of names) {
        await connection.query('INSERT INTO areas (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [name]);
    }
}
