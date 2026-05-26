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

    // Create Companies table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS companies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('Companies table created');

    // Create Staff table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            contact_no VARCHAR(20) NOT NULL,
            company_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
        );
    `);
    console.log('Staff table created');

    // Add company_id to existing staff tables
    try {
        await connection.query(`
            ALTER TABLE staff ADD COLUMN company_id INT NULL,
            ADD CONSTRAINT fk_staff_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
        `);
        console.log('Added company_id to staff table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_CREATE_TABLE') {
            console.log('company_id column may already exist on staff');
        }
    }

    // Create Staff Locations table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff_locations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            staff_id INT NOT NULL,
            day ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') NOT NULL,
            location_name VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
        );
    `);
    console.log('Staff Locations table created');

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

    // Create Staff Sales table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff_sales (
            id INT AUTO_INCREMENT PRIMARY KEY,
            staff_id INT NOT NULL,
            outlet_id INT NOT NULL,
            sale_date DATE NOT NULL,
            invoice_number VARCHAR(100) NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            sticker_number VARCHAR(20) NULL UNIQUE,
            payment_mode ENUM('cash', 'upi') NOT NULL DEFAULT 'cash',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_sale (staff_id, outlet_id, sale_date),
            FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
            FOREIGN KEY (outlet_id) REFERENCES staff_counters(id) ON DELETE CASCADE
        );
    `);
    console.log('Staff Sales table created');

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN invoice_number VARCHAR(100) NOT NULL DEFAULT ''
        `);
        console.log('Added invoice_number to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('invoice_number column may already exist on staff_sales');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN sticker_number VARCHAR(20) NULL UNIQUE
        `);
        console.log('Added sticker_number to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('sticker_number column may already exist on staff_sales');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN payment_mode ENUM('cash', 'upi') NOT NULL DEFAULT 'cash'
        `);
        console.log('Added payment_mode to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('payment_mode column may already exist on staff_sales');
        }
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS delivery_boys (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            contact_no VARCHAR(20) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('Delivery boys table created');

    try {
        await connection.query(`
            ALTER TABLE staff_sales
            ADD COLUMN delivery_boy_id INT NULL,
            ADD CONSTRAINT fk_staff_sales_delivery_boy
                FOREIGN KEY (delivery_boy_id) REFERENCES delivery_boys(id) ON DELETE SET NULL
        `);
        console.log('Added delivery_boy_id to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_CREATE_TABLE') {
            console.log('delivery_boy_id column may already exist on staff_sales');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN vehicle_no VARCHAR(50) NULL
        `);
        console.log('Added vehicle_no to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('vehicle_no column may already exist on staff_sales');
        }
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS sticker_sequence (
            id INT PRIMARY KEY,
            seq_value INT NOT NULL DEFAULT 0
        );
    `);
    await connection.query(`
        INSERT IGNORE INTO sticker_sequence (id, seq_value) VALUES (1, 0)
    `);
    console.log('Sticker sequence table ready');

    await connection.end();
}

initDB().catch(err => {
    console.error('Initialization failed:', err);
    process.exit(1);
});
