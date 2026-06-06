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

    // Create Admins table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('Admins table created');

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
            staff_type ENUM('distributor', 'cnf') NOT NULL DEFAULT 'distributor',
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

    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff_companies (
            staff_id INT NOT NULL,
            company_id INT NOT NULL,
            PRIMARY KEY (staff_id, company_id),
            FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        );
    `);
    console.log('Staff companies table created');

    await connection.query(`
        INSERT IGNORE INTO staff_companies (staff_id, company_id)
        SELECT id, company_id FROM staff WHERE company_id IS NOT NULL
    `);

    try {
        await connection.query(`
            ALTER TABLE staff ADD COLUMN staff_type ENUM('distributor', 'cnf') NOT NULL DEFAULT 'distributor'
        `);
        console.log('Added staff_type to staff table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('staff_type column may already exist on staff');
        }
    }

    // Create Staff Locations table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff_locations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            staff_id INT NOT NULL,
            day ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'CNF') NOT NULL,
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
            day ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'CNF') NOT NULL,
            outlet_erp_id VARCHAR(50) NOT NULL,
            outlet_name VARCHAR(255) NOT NULL,
            contact_number VARCHAR(20) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
        );
    `);
    console.log('Staff Counters table created');

    try {
        await connection.query(`
            ALTER TABLE staff_locations MODIFY COLUMN day ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'CNF') NOT NULL
        `);
        await connection.query(`
            ALTER TABLE staff_counters MODIFY COLUMN day ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'CNF') NOT NULL
        `);
        console.log('Updated staff route day enums');
    } catch (err) {
        console.log('staff route day enums may already be updated');
    }

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
            ALTER TABLE staff_sales 
            MODIFY payment_mode ENUM('cash', 'upi', 'credit', 'cheque') NOT NULL DEFAULT 'cash',
            ADD COLUMN paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN balance_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN reference_no VARCHAR(100) NULL,
            ADD COLUMN reference_date DATE NULL,
            ADD COLUMN credit_days INT NULL
        `);
        console.log('Added payment mode and credit tracking columns to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('Credit tracking columns may already exist on staff_sales');
        }
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS delivery_boys (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            contact_no VARCHAR(20) NOT NULL,
            company_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ,FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
        );
    `);
    console.log('Delivery boys table created');

    try {
        await connection.query(`
            ALTER TABLE delivery_boys ADD COLUMN company_id INT NULL,
            ADD CONSTRAINT fk_delivery_boys_company
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
        `);
        console.log('Added company_id to delivery_boys table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_CREATE_TABLE') {
            console.log('company_id column may already exist on delivery_boys');
        }
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS delivery_boy_companies (
            delivery_boy_id INT NOT NULL,
            company_id INT NOT NULL,
            PRIMARY KEY (delivery_boy_id, company_id),
            FOREIGN KEY (delivery_boy_id) REFERENCES delivery_boys(id) ON DELETE CASCADE,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        );
    `);
    console.log('Delivery boy companies table created');

    await connection.query(`
        INSERT IGNORE INTO delivery_boy_companies (delivery_boy_id, company_id)
        SELECT id, company_id FROM delivery_boys WHERE company_id IS NOT NULL
    `);

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

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN delivery_date DATE NULL
        `);
        console.log('Added delivery_date to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('delivery_date column may already exist on staff_sales');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN packaging_status ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery') NOT NULL DEFAULT 'not_packing'
        `);
        console.log('Added packaging_status to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('packaging_status column may already exist on staff_sales');
        }
    }

    // Modify existing enum to ensure terminal states are available
    try {
        await connection.query(`
            ALTER TABLE staff_sales MODIFY COLUMN packaging_status ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled') NOT NULL DEFAULT 'not_packing'
        `);
        console.log('Ensured packaging_status ENUM includes all delivery endpoints');
    } catch (err) {
        console.error('Error modifying packaging_status ENUM:', err);
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff_sale_status_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sale_id INT NOT NULL,
            status ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled') NOT NULL,
            changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sale_id) REFERENCES staff_sales(id) ON DELETE CASCADE,
            INDEX idx_sale_status_history_sale_id (sale_id)
        );
    `);
    console.log('Staff sale status history table created');

    await connection.query(`
        INSERT INTO staff_sale_status_history (sale_id, status, changed_at)
        SELECT ss.id, ss.packaging_status, COALESCE(ss.created_at, CURRENT_TIMESTAMP)
        FROM staff_sales ss
        WHERE NOT EXISTS (
            SELECT 1 FROM staff_sale_status_history ssh WHERE ssh.sale_id = ss.id
        )
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS sale_payments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sale_id INT NOT NULL,
            payment_date DATE NOT NULL,
            payment_mode ENUM('cash', 'upi', 'credit', 'cheque') NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            reference_no VARCHAR(100) NULL,
            reference_date DATE NULL,
            credit_days INT NULL,
            remarks TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sale_id) REFERENCES staff_sales(id) ON DELETE CASCADE
        );
    `);
    console.log('Sale payments table created');

    try {
        await connection.query(`
            ALTER TABLE sale_payments ADD COLUMN remarks TEXT NULL
        `);
        console.log('Added remarks column to sale_payments');
    } catch (err) {
        console.log('remarks column on sale_payments already exists or skipped');
    }

    try {
        await connection.query(`
            UPDATE staff_sales ss
            SET balance_amount = ss.price
            WHERE ss.paid_amount = 0
              AND ss.balance_amount = 0
              AND ss.price > 0
              AND NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = ss.id)
        `);
        console.log('Initialized balance amounts for existing sales');
    } catch (err) {
        console.log('Balance initialization skipped or already applied');
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
