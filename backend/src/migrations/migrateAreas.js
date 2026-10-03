export const normalizeAreaName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toUpperCase();

export async function migrateAreas(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS areas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE
    )`);
    const [rows] = await connection.query(`SELECT location_name FROM staff_counters
        UNION ALL SELECT location_name FROM staff_locations`);
    const names = [...new Set(rows.map(row => normalizeAreaName(row.location_name)).filter(Boolean))];
    for (const name of names) {
        await connection.query('INSERT INTO areas (name) VALUES (?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [name]);
    }
}
