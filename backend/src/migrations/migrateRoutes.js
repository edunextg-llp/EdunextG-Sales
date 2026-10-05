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
}
