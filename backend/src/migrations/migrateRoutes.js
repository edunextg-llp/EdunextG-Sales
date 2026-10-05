// Delivery routes: a named group of areas (e.g. "R 1" = DUMDUM + BAGUIATI).
// Areas are identified by their normalized name, same as everywhere else.
export async function migrateRoutes(connection) {
    await connection.query(`CREATE TABLE IF NOT EXISTS routes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    await connection.query(`CREATE TABLE IF NOT EXISTS route_areas (
        route_id INT NOT NULL,
        area_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        PRIMARY KEY (route_id, area_name),
        KEY idx_route_areas_area (area_name),
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
    )`);
    // Delivery priority of the area inside its route (1 = deliver first).
    try {
        await connection.query('ALTER TABLE route_areas ADD COLUMN priority INT NOT NULL DEFAULT 0');
    } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
    // One area can belong to only one route.
    try {
        await connection.query('ALTER TABLE route_areas ADD UNIQUE KEY uq_route_areas_area (area_name)');
    } catch (error) {
        if (error.code !== 'ER_DUP_KEYNAME') {
            console.warn('Could not enforce one route per area yet (some areas are in more than one route). '
                + 'Remove the duplicates in Create Route and restart:', error.message);
        }
    }
}
