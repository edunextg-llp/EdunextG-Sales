import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function initDB() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    console.log('Connected to MySQL server');

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
    console.log(`Database ${process.env.DB_NAME} created or already exists`);

    await connection.changeUser({ database: process.env.DB_NAME });

    // Create Staff table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            contact_no VARCHAR(20) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('Staff table created');

    // Create Staff Counters table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff_counters (
            id INT AUTO_INCREMENT PRIMARY KEY,
            staff_id INT NOT NULL,
            day ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') NOT NULL,
            outlet_erp_id VARCHAR(50) NOT NULL,
            outlet_name VARCHAR(255) NOT NULL,
            contact_number VARCHAR(20) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
        );
    `);
    console.log('Staff Counters table created');

    await connection.end();
}

initDB().catch(err => {
    console.error('Initialization failed:', err);
    process.exit(1);
});
