import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
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
            dob DATE NULL,
            whatsapp_number VARCHAR(20) NULL,
            aadhar_no VARCHAR(20) NULL,
            aadhar_document_url TEXT NULL,
            pcc_certificate_url TEXT NULL,
            staff_category ENUM('company_staff', 'bawarchee_staff') NOT NULL DEFAULT 'company_staff',
            login_id VARCHAR(100) NULL UNIQUE,
            password_hash VARCHAR(255) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
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

    const staffProfileColumns = [
        { sql: 'ALTER TABLE staff ADD COLUMN dob DATE NULL', label: 'dob' },
        { sql: 'ALTER TABLE staff ADD COLUMN whatsapp_number VARCHAR(20) NULL', label: 'whatsapp_number' },
        { sql: 'ALTER TABLE staff ADD COLUMN aadhar_no VARCHAR(20) NULL', label: 'aadhar_no' },
        { sql: 'ALTER TABLE staff ADD COLUMN aadhar_document_url TEXT NULL', label: 'aadhar_document_url' },
        { sql: 'ALTER TABLE staff ADD COLUMN pcc_certificate_url TEXT NULL', label: 'pcc_certificate_url' },
        { sql: "ALTER TABLE staff ADD COLUMN staff_category ENUM('company_staff', 'bawarchee_staff') NOT NULL DEFAULT 'company_staff'", label: 'staff_category' },
        { sql: 'ALTER TABLE staff ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1', label: 'is_active' },
    ];

    for (const column of staffProfileColumns) {
        try {
            await connection.query(column.sql);
            console.log(`Added ${column.label} to staff table`);
        } catch (err) {
            console.log(`${column.label} column may already exist on staff`);
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
            whatsapp_number VARCHAR(20) NULL,
            location_name VARCHAR(255) NULL,
            address TEXT NULL,
            google_location TEXT NULL,
            priority_number INT NULL,
            operating_hours JSON NULL,
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

    try {
        await connection.query(`ALTER TABLE staff_counters ADD COLUMN priority_number INT NULL`);
        console.log('Added outlet priority');
    } catch (err) {
        console.log('outlet priority column may already exist');
    }
    try {
        await connection.query(`ALTER TABLE staff_counters ADD COLUMN operating_hours JSON NULL`);
        console.log('Added outlet operating hours');
    } catch (err) {
        console.log('outlet operating hours column may already exist');
    }

    try {
        await connection.query(`
            ALTER TABLE staff_counters ADD COLUMN google_location TEXT NULL
        `);
        console.log('Added google_location to staff_counters table');
    } catch (err) {
        console.log('google_location column may already exist on staff_counters');
    }

    try {
        await connection.query(`
            ALTER TABLE staff_counters ADD COLUMN whatsapp_number VARCHAR(20) NULL
        `);
        console.log('Added whatsapp_number to staff_counters table');
    } catch (err) {
        console.log('whatsapp_number column may already exist on staff_counters');
    }

    try {
        await connection.query(`
            ALTER TABLE staff_counters ADD COLUMN address TEXT NULL
        `);
        console.log('Added address to staff_counters table');
    } catch (err) {
        console.log('address column may already exist on staff_counters');
    }

    try {
        await connection.query(`
            ALTER TABLE staff_counters ADD COLUMN has_gst TINYINT(1) NOT NULL DEFAULT 0
        `);
        console.log('Added has_gst to staff_counters table');
    } catch (err) {
        console.log('has_gst column may already exist on staff_counters');
    }

    try {
        await connection.query(`
            ALTER TABLE staff_counters ADD COLUMN gst_number VARCHAR(50) NULL
        `);
        console.log('Added gst_number to staff_counters table');
    } catch (err) {
        console.log('gst_number column may already exist on staff_counters');
    }

    // Create Staff Sales table
    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff_sales (
            id INT AUTO_INCREMENT PRIMARY KEY,
            staff_id INT NOT NULL,
            outlet_id INT NOT NULL,
            sale_date DATE NOT NULL,
            invoice_number VARCHAR(100) NOT NULL,
            item_count INT NOT NULL DEFAULT 0,
            packed_item_count INT NULL,
            box_count INT NULL,
            packet_count INT NULL,
            price DECIMAL(10, 2) NOT NULL,
            sticker_number VARCHAR(20) NULL UNIQUE,
            payment_mode ENUM('cash', 'upi') NOT NULL DEFAULT 'cash',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_sale (staff_id, outlet_id, sale_date, invoice_number),
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

    const { migrateStaffSalesUniqueIndex } = await import('./migrations/migrateStaffSalesUniqueIndex.js');
    await migrateStaffSalesUniqueIndex(connection);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS delivery_boys (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            contact_no VARCHAR(20) NOT NULL,
            delivery_login_id VARCHAR(20) NULL UNIQUE,
            delivery_passcode TEXT NULL,
            delivery_passcode_hash VARCHAR(255) NULL,
            company_id INT NULL,
            role ENUM('delivery_boy', 'packaging_staff') NOT NULL DEFAULT 'delivery_boy',
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            aadhar_no VARCHAR(20) NULL,
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

    try {
        await connection.query(`
            ALTER TABLE delivery_boys ADD COLUMN delivery_login_id VARCHAR(20) NULL UNIQUE
        `);
        console.log('Added delivery_login_id to delivery_boys table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('delivery_login_id column may already exist on delivery_boys');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE delivery_boys ADD COLUMN delivery_passcode VARCHAR(20) NULL
        `);
        console.log('Added legacy delivery_passcode to delivery_boys table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('delivery_passcode column may already exist on delivery_boys');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE delivery_boys ADD COLUMN delivery_passcode_hash VARCHAR(255) NULL
        `);
        console.log('Added delivery_passcode_hash to delivery_boys table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('delivery_passcode_hash column may already exist on delivery_boys');
        }
    }

    try {
        await connection.query(`ALTER TABLE delivery_boys ADD COLUMN role ENUM('delivery_boy', 'packaging_staff') NOT NULL DEFAULT 'delivery_boy'`);
        console.log('Added role to delivery_boys table');
    } catch (err) {
        console.log('role column may already exist on delivery_boys');
    }

    try {
        await connection.query(`ALTER TABLE delivery_boys ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`);
        console.log('Added is_active to delivery_boys table');
    } catch (err) {
        console.log('is_active column may already exist on delivery_boys');
    }

    try {
        await connection.query(`ALTER TABLE delivery_boys ADD COLUMN aadhar_no VARCHAR(20) NULL`);
        console.log('Added aadhar_no to delivery_boys table');
    } catch (err) {
        console.log('aadhar_no column may already exist on delivery_boys');
    }

    await connection.query(`
        UPDATE delivery_boys
        SET delivery_login_id = CONCAT('BFPDBTMP', id)
        WHERE delivery_login_id IS NULL
           OR delivery_login_id = ''
           OR delivery_login_id <> CONCAT('BFPDB', LPAD(id, 3, '0'))
    `);

    await connection.query(`
        UPDATE delivery_boys
        SET delivery_login_id = CONCAT('BFPDB', LPAD(id, 3, '0'))
        WHERE delivery_login_id LIKE 'BFPDBTMP%'
    `);

    const [legacyPasscodeRows] = await connection.query(`
        SELECT id, delivery_passcode
        FROM delivery_boys
        WHERE delivery_passcode_hash IS NULL
          AND delivery_passcode IS NOT NULL
          AND delivery_passcode <> ''
    `);

    for (const row of legacyPasscodeRows) {
        const passcodeHash = await bcrypt.hash(String(row.delivery_passcode), 10);
        await connection.query(
            `UPDATE delivery_boys SET delivery_passcode_hash = ? WHERE id = ?`,
            [passcodeHash, row.id]
        );
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
            ALTER TABLE staff_sales MODIFY COLUMN packaging_status ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned') NOT NULL DEFAULT 'not_packing'
        `);
        console.log('Ensured packaging_status ENUM includes all delivery endpoints');
    } catch (err) {
        console.error('Error modifying packaging_status ENUM:', err);
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS staff_sale_status_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            sale_id INT NOT NULL,
            status ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned') NOT NULL,
            changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sale_id) REFERENCES staff_sales(id) ON DELETE CASCADE,
            INDEX idx_sale_status_history_sale_id (sale_id)
        );
    `);
    console.log('Staff sale status history table created');

    try {
        await connection.query(`
            ALTER TABLE staff_sale_status_history MODIFY COLUMN status ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned') NOT NULL
        `);
        console.log('Ensured status history ENUM includes returned');
    } catch (err) {
        console.log('Status history ENUM may already include returned');
    }

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
            collector_staff_id INT NULL,
            parent_credit_payment_id INT NULL,
            reference_no VARCHAR(100) NULL,
            reference_date DATE NULL,
            credit_days INT NULL,
            cash_details JSON NULL,
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
            ALTER TABLE sale_payments ADD COLUMN collector_staff_id INT NULL
        `);
        console.log('Added collector_staff_id column to sale_payments');
    } catch (err) {
        console.log('collector_staff_id column on sale_payments already exists or skipped');
    }

    try {
        await connection.query(`
            ALTER TABLE sale_payments ADD COLUMN collector_name VARCHAR(255) NULL
        `);
        console.log('Added collector_name column to sale_payments');
    } catch (err) {
        console.log('collector_name column on sale_payments already exists or skipped');
    }

    await connection.query(`
        UPDATE sale_payments sp
        JOIN staff_sales ss ON ss.id = sp.sale_id
        SET sp.collector_staff_id = ss.staff_id
        WHERE sp.collector_staff_id IS NULL
    `);

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN item_count INT NOT NULL DEFAULT 0
        `);
        console.log('Added item_count to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('item_count column may already exist on staff_sales');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN packed_item_count INT NULL
        `);
        console.log('Added packed_item_count to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('packed_item_count column may already exist on staff_sales');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN box_count INT NULL
        `);
        console.log('Added box_count to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('box_count column may already exist on staff_sales');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN packet_count INT NULL
        `);
        console.log('Added packet_count to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('packet_count column may already exist on staff_sales');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE staff_sales ADD COLUMN packed_by_id INT NULL
        `);
        console.log('Added packed_by_id to staff_sales table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('packed_by_id column may already exist on staff_sales');
        }
    }

    try {
        await connection.query(`
            ALTER TABLE sale_payments ADD COLUMN parent_credit_payment_id INT NULL
        `);
        console.log('Added parent_credit_payment_id column to sale_payments');
    } catch (err) {
        console.log('parent_credit_payment_id column on sale_payments already exists or skipped');
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS credit_payment_remarks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            payment_id INT NOT NULL,
            remark_date DATE NOT NULL,
            remarks TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_id) REFERENCES sale_payments(id) ON DELETE CASCADE,
            INDEX idx_credit_payment_remarks_payment_id (payment_id)
        );
    `);
    console.log('Credit payment remarks table created');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS bank_deposits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NULL,
            deposit_ref_no VARCHAR(20) NULL UNIQUE,
            deposit_date DATE NOT NULL,
            bank_name VARCHAR(255) NOT NULL,
            account_name VARCHAR(255) NULL,
            branch_name VARCHAR(255) NOT NULL,
            bank_account_no VARCHAR(100) NOT NULL,
            ifsc_code VARCHAR(50) NULL,
            depositor_name VARCHAR(255) NULL,
            store_name VARCHAR(255) NOT NULL,
            deposit_mode ENUM('cash', 'cheque') NOT NULL,
            amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            cheque_no VARCHAR(100) NULL,
            cheque_date DATE NULL,
            cash_details TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('Bank deposits table created');

    try {
        await connection.query(`ALTER TABLE bank_deposits ADD COLUMN company_id INT NULL`);
        console.log('Added company_id to bank_deposits');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('company_id column may already exist on bank_deposits');
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS purchase_sellers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            seller_name VARCHAR(255) NOT NULL UNIQUE,
            address TEXT NULL,
            city VARCHAR(100) NULL,
            state VARCHAR(100) NULL,
            gstin VARCHAR(50) NULL,
            pan_no VARCHAR(50) NULL,
            in_code VARCHAR(50) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('Purchase sellers table created');

    try {
        await connection.query(`
            ALTER TABLE purchase_sellers ADD COLUMN state VARCHAR(100) NULL
        `);
        console.log('Added state to purchase_sellers');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('state column may already exist on purchase_sellers');
    }

    try {
        await connection.query(`
            ALTER TABLE purchase_sellers ADD COLUMN pan_no VARCHAR(50) NULL
        `);
        console.log('Added pan_no to purchase_sellers');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('pan_no column may already exist on purchase_sellers');
    }

    try {
        await connection.query(`
            ALTER TABLE purchase_sellers ADD COLUMN in_code VARCHAR(50) NULL
        `);
        console.log('Added in_code to purchase_sellers');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('in_code column may already exist on purchase_sellers');
    }

    const purchaseSellerColumns = [
        { sql: 'ALTER TABLE purchase_sellers ADD COLUMN company_id INT NULL', label: 'company_id' },
        { sql: 'ALTER TABLE purchase_sellers ADD COLUMN contact VARCHAR(20) NULL', label: 'contact' },
        { sql: 'ALTER TABLE purchase_sellers ADD COLUMN district VARCHAR(100) NULL', label: 'district' },
        { sql: 'ALTER TABLE purchase_sellers ADD COLUMN has_gst TINYINT(1) NOT NULL DEFAULT 0', label: 'has_gst' },
    ];

    for (const column of purchaseSellerColumns) {
        try {
            await connection.query(column.sql);
            console.log(`Added ${column.label} to purchase_sellers`);
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') console.log(`${column.label} column may already exist on purchase_sellers`);
        }
    }

    try {
        await connection.query(`
            ALTER TABLE purchase_sellers ADD CONSTRAINT fk_purchase_sellers_company
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
        `);
        console.log('Added fk_purchase_sellers_company');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_CANT_CREATE_TABLE') {
            console.log('fk_purchase_sellers_company may already exist');
        }
    }

    try {
        await connection.query(`ALTER TABLE purchase_sellers DROP INDEX seller_name`);
        console.log('Dropped seller_name unique index on purchase_sellers');
    } catch (err) {
        console.log('seller_name unique index may already be dropped on purchase_sellers');
    }

    try {
        await connection.query(`
            ALTER TABLE purchase_sellers ADD UNIQUE INDEX uq_company_seller (company_id, seller_name)
        `);
        console.log('Added uq_company_seller on purchase_sellers');
    } catch (err) {
        if (err.code !== 'ER_DUP_KEYNAME') console.log('uq_company_seller may already exist on purchase_sellers');
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS seller_sequence (
            id INT PRIMARY KEY,
            seq_value INT NOT NULL DEFAULT 0
        );
    `);
    await connection.query(`
        INSERT IGNORE INTO seller_sequence (id, seq_value) VALUES (1, 0)
    `);

    try {
        await connection.query(`
            ALTER TABLE purchase_sellers ADD COLUMN seller_code VARCHAR(20) NULL UNIQUE
        `);
        console.log('Added seller_code to purchase_sellers');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('seller_code column may already exist on purchase_sellers');
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS seller_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            seller_id INT NOT NULL,
            product_erp_id VARCHAR(100) NOT NULL,
            sku_name VARCHAR(255) NOT NULL,
            variant_name VARCHAR(255) NULL,
            hsn_code VARCHAR(50) NULL,
            gst_percent DECIMAL(5, 2) NOT NULL DEFAULT 5.00,
            cgst_percent DECIMAL(5, 2) NOT NULL DEFAULT 2.50,
            sgst_percent DECIMAL(5, 2) NOT NULL DEFAULT 2.50,
            pcs_per_box DECIMAL(14, 4) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
            FOREIGN KEY (seller_id) REFERENCES purchase_sellers(id) ON DELETE CASCADE,
            UNIQUE KEY uq_seller_product (seller_id, product_erp_id),
            INDEX idx_seller_items_company_id (company_id),
            INDEX idx_seller_items_seller_id (seller_id)
        );
    `);
    console.log('Seller items table created');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS company_item_sequence (
            company_id INT PRIMARY KEY,
            seq_value INT NOT NULL DEFAULT 0,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        );
    `);
    console.log('Company item sequence table created');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS purchase_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            seller_id INT NOT NULL,
            company_id INT NULL,
            invoice_number VARCHAR(100) NOT NULL,
            eway_bill_no VARCHAR(100) NULL,
            eway_bill_date DATE NULL,
            invoice_date DATE NULL,
            sales_order_number VARCHAR(100) NULL,
            fssai_number VARCHAR(100) NULL,
            gross_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            trader_discount_value DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            primary_discount_value DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            secondary_discount_value DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            cash_discount_value DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            taxable_value DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            cgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            sgst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            total_gst_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            round_off DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            rounded_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (seller_id) REFERENCES purchase_sellers(id) ON DELETE RESTRICT,
            FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
            INDEX idx_purchase_entries_seller_id (seller_id)
        );
    `);
    console.log('Purchase entries table created');

    try {
        await connection.query('ALTER TABLE purchase_entries ADD COLUMN company_id INT NULL AFTER seller_id');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('company_id column may already exist on purchase_entries');
    }

    await connection.query(`
            CREATE TABLE IF NOT EXISTS dms_stock_imports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                entry_code VARCHAR(40) NULL UNIQUE,
                invoice_number VARCHAR(100) NULL,
                file_name VARCHAR(255) NOT NULL,
                company_id INT NULL,
                seller_id INT NULL,
            upload_date DATE NULL,
            row_count INT NOT NULL DEFAULT 0,
            total_purchase_units DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_purchase_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            total_invoiced_units DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_invoiced_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            total_closing_units DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_closing_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            total_in_transit_units DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_in_transit_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            total_stock_cases DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_stock_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_pieces DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                total_value DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('DMS stock imports table created');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS dms_stock_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            import_id INT NOT NULL,
            product_erp_id VARCHAR(100) NULL,
            product_name VARCHAR(255) NULL,
            product_division VARCHAR(100) NULL,
            variant_name VARCHAR(100) NULL,
            pcs_per_box DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            current_stock_in_case DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            current_stock_in_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_current_stock_in_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            price_per_piece DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            mrp DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_purchases_in_stock_unit DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            purchases_in_stock_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            dp_per_unit_stock DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_invoiced_stock_unit DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            invoiced_stock_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            total_closing_stock_unit DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            closing_stock_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            total_in_transit_stock_quantity_unit DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            in_transit_stock_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            total_pieces DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                total_value DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                purchase_price DECIMAL(14, 4) NULL,
                batch_number VARCHAR(100) NULL,
                mfg_date DATE NULL,
                expiry_date DATE NULL,
                dp_price DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                discount_percent DECIMAL(7, 4) NOT NULL DEFAULT 0.0000,
                gst_percent DECIMAL(7, 4) NOT NULL DEFAULT 5.0000,
                cgst_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
                sgst_amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
                retail_price DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                wholesale_price DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                retail_margin DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                wholesale_margin DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                raw_data JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (import_id) REFERENCES dms_stock_imports(id) ON DELETE CASCADE,
            INDEX idx_dms_stock_items_import_id (import_id),
            INDEX idx_dms_stock_items_product_erp_id (product_erp_id)
        );
    `);
    console.log('DMS stock items table created');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS current_stock_imports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            dms_import_id INT NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            row_count INT NOT NULL DEFAULT 0,
            total_cases DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_loose_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_pieces DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dms_import_id) REFERENCES dms_stock_imports(id) ON DELETE CASCADE,
            INDEX idx_current_stock_imports_dms_import_id (dms_import_id)
        );
    `);
    console.log('Current stock imports table created');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS current_stock_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            import_id INT NOT NULL,
            product_erp_id VARCHAR(100) NULL,
            product_name VARCHAR(255) NULL,
            product_division VARCHAR(100) NULL,
            variant_name VARCHAR(100) NULL,
            pcs_per_box DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            current_stock_in_case DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            current_stock_in_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_current_stock_in_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            price_per_piece DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            mrp DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            raw_data JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (import_id) REFERENCES current_stock_imports(id) ON DELETE CASCADE,
            INDEX idx_current_stock_items_import_id (import_id),
            INDEX idx_current_stock_items_product_erp_id (product_erp_id)
        );
    `);
    console.log('Current stock items table created');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS physical_stock_imports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            dms_import_id INT NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            row_count INT NOT NULL DEFAULT 0,
            total_cases DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_loose_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_pieces DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dms_import_id) REFERENCES dms_stock_imports(id) ON DELETE CASCADE,
            INDEX idx_physical_stock_imports_dms_import_id (dms_import_id)
        );
    `);
    console.log('Physical stock imports table created');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS physical_stock_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            import_id INT NOT NULL,
            product_erp_id VARCHAR(100) NULL,
            product_name VARCHAR(255) NULL,
            product_division VARCHAR(100) NULL,
            variant_name VARCHAR(100) NULL,
            pcs_per_box DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            physical_stock_in_case DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            physical_stock_in_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_physical_stock_in_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            price_per_piece DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            mrp DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            stock_update_date DATE NULL,
            raw_data JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (import_id) REFERENCES physical_stock_imports(id) ON DELETE CASCADE,
            INDEX idx_physical_stock_items_import_id (import_id),
            INDEX idx_physical_stock_items_product_erp_id (product_erp_id)
        );
    `);
    console.log('Physical stock items table created');

    try {
        await connection.query(`
            ALTER TABLE physical_stock_items ADD COLUMN stock_update_date DATE NULL
        `);
        console.log('Added stock_update_date to physical_stock_items');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('stock_update_date column may already exist on physical_stock_items');
        }
    }

    await connection.query(`
        CREATE TABLE IF NOT EXISTS physical_stock_item_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            dms_import_id INT NOT NULL,
            import_id INT NULL,
            item_id INT NULL,
            product_erp_id VARCHAR(50) NOT NULL,
            product_name VARCHAR(255) NULL,
            product_division VARCHAR(255) NULL,
            variant_name VARCHAR(255) NULL,
            pcs_per_box DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            physical_stock_in_case DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            physical_stock_in_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_physical_stock_in_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            price_per_piece DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            mrp DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_value DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            stock_update_date DATE NULL,
            source_type ENUM('upload', 'manual', 'sale') NOT NULL DEFAULT 'manual',
            source_label VARCHAR(255) NULL,
            change_type ENUM('create', 'update', 'deduct') NOT NULL DEFAULT 'update',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_physical_stock_history_dms_erp (dms_import_id, product_erp_id),
            INDEX idx_physical_stock_history_created (created_at)
        );
    `);
    console.log('Physical stock item history table created');

    try {
        await connection.query(`
            ALTER TABLE bank_deposits ADD COLUMN deposit_ref_no VARCHAR(20) NULL UNIQUE
        `);
        console.log('Added deposit_ref_no to bank_deposits');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('deposit_ref_no column may already exist on bank_deposits');
    }

    await connection.query(`
        UPDATE bank_deposits bd
        JOIN (
            SELECT missing.id,
                   CONCAT('BFPCA', LPAD(existing.max_ref + ROW_NUMBER() OVER (ORDER BY missing.id), 3, '0')) AS generated_ref
            FROM (
                SELECT id
                FROM bank_deposits
                WHERE deposit_mode = 'cash'
                  AND (deposit_ref_no IS NULL OR deposit_ref_no = '')
            ) missing
            CROSS JOIN (
                SELECT COALESCE(MAX(CAST(SUBSTRING(deposit_ref_no, 6) AS UNSIGNED)), 0) AS max_ref
                FROM bank_deposits
                WHERE deposit_mode = 'cash'
                  AND deposit_ref_no LIKE 'BFPCA%'
            ) existing
        ) seq ON seq.id = bd.id
        SET bd.deposit_ref_no = seq.generated_ref
    `);

    await connection.query(`
        UPDATE bank_deposits bd
        JOIN (
            SELECT missing.id,
                   CONCAT('BFPCQ', LPAD(existing.max_ref + ROW_NUMBER() OVER (ORDER BY missing.id), 3, '0')) AS generated_ref
            FROM (
                SELECT id
                FROM bank_deposits
                WHERE deposit_mode = 'cheque'
                  AND (deposit_ref_no IS NULL OR deposit_ref_no = '')
            ) missing
            CROSS JOIN (
                SELECT COALESCE(MAX(CAST(SUBSTRING(deposit_ref_no, 6) AS UNSIGNED)), 0) AS max_ref
                FROM bank_deposits
                WHERE deposit_mode = 'cheque'
                  AND deposit_ref_no LIKE 'BFPCQ%'
            ) existing
        ) seq ON seq.id = bd.id
        SET bd.deposit_ref_no = seq.generated_ref
    `);

    try {
        await connection.query(`
            ALTER TABLE bank_deposits ADD COLUMN account_name VARCHAR(255) NULL
        `);
        console.log('Added account_name to bank_deposits');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('account_name column may already exist on bank_deposits');
    }

    try {
        await connection.query(`
            ALTER TABLE bank_deposits ADD COLUMN ifsc_code VARCHAR(50) NULL
        `);
        console.log('Added ifsc_code to bank_deposits');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('ifsc_code column may already exist on bank_deposits');
    }

    try {
        await connection.query(`
            ALTER TABLE bank_deposits ADD COLUMN cheque_date DATE NULL
        `);
        console.log('Added cheque_date to bank_deposits');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('cheque_date column may already exist on bank_deposits');
    }

    try {
        await connection.query(`
            ALTER TABLE bank_deposits ADD COLUMN depositor_name VARCHAR(255) NULL
        `);
        console.log('Added depositor_name to bank_deposits');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('depositor_name column may already exist on bank_deposits');
    }

    try {
        await connection.query(`
            ALTER TABLE bank_deposits MODIFY COLUMN deposit_mode ENUM('cash', 'cheque', 'upi') NOT NULL
        `);
        console.log('Added upi to deposit_mode on bank_deposits');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('upi deposit_mode may already exist on bank_deposits');
    }

    await connection.query(`
        INSERT INTO credit_payment_remarks (payment_id, remark_date, remarks, created_at)
        SELECT id, payment_date, remarks, COALESCE(created_at, CURRENT_TIMESTAMP)
        FROM sale_payments
        WHERE payment_mode = 'credit'
          AND remarks IS NOT NULL
          AND TRIM(remarks) <> ''
          AND NOT EXISTS (
              SELECT 1 FROM credit_payment_remarks cpr WHERE cpr.payment_id = sale_payments.id
        )
    `);

    try {
        await connection.query(`
            ALTER TABLE physical_stock_item_history ADD COLUMN stock_update_date DATE NULL
        `);
        console.log('Added stock_update_date to physical_stock_item_history');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('stock_update_date column may already exist on physical_stock_item_history');
        }
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

    await connection.query(`
        CREATE TABLE IF NOT EXISTS chalan_sequence (
            id INT PRIMARY KEY,
            seq_value INT NOT NULL DEFAULT 0
        );
    `);
    await connection.query(`
        INSERT IGNORE INTO chalan_sequence (id, seq_value) VALUES (1, 0)
    `);
    console.log('Chalan sequence table ready');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS chalan_sales (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chalan_code VARCHAR(20) NOT NULL UNIQUE,
            sale_date DATE NOT NULL,
            assignee_type ENUM('company_staff', 'delivery_boy') NOT NULL,
            staff_id INT NULL,
            delivery_boy_id INT NULL,
            packaging_status ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned') NOT NULL DEFAULT 'not_packing',
            packed_item_count INT NULL,
            box_count INT NULL,
            packet_count INT NULL,
            vehicle_no VARCHAR(50) NULL,
            delivery_date DATE NULL,
            returned_item_count INT NOT NULL DEFAULT 0,
            returned_packed_item_count INT NOT NULL DEFAULT 0,
            returned_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL,
            FOREIGN KEY (delivery_boy_id) REFERENCES delivery_boys(id) ON DELETE SET NULL
        );
    `);
    console.log('Chalan sales table ready');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS chalan_sale_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chalan_sale_id INT NOT NULL,
            sr_no INT NOT NULL,
            item_name VARCHAR(255) NOT NULL,
            qty DECIMAL(10, 2) NOT NULL,
            mrp DECIMAL(10, 2) NOT NULL,
            FOREIGN KEY (chalan_sale_id) REFERENCES chalan_sales(id) ON DELETE CASCADE
        );
    `);
    console.log('Chalan sale items table ready');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS chalan_sale_status_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chalan_sale_id INT NOT NULL,
            status VARCHAR(32) NOT NULL,
            changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chalan_sale_id) REFERENCES chalan_sales(id) ON DELETE CASCADE
        );
    `);
    console.log('Chalan sale status history table ready');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS chalan_sale_returns (
            id INT AUTO_INCREMENT PRIMARY KEY,
            chalan_sale_id INT NOT NULL,
            return_type ENUM('full', 'partial') NOT NULL,
            return_item_count INT NOT NULL,
            return_packed_item_count INT NOT NULL,
            return_amount DECIMAL(12, 2) NOT NULL,
            return_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chalan_sale_id) REFERENCES chalan_sales(id) ON DELETE CASCADE
        );
    `);
    console.log('Chalan sale returns table ready');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS taken_bills (
            id INT AUTO_INCREMENT PRIMARY KEY,
            payment_id INT NOT NULL,
            staff_id INT NOT NULL,
            taken_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_id) REFERENCES sale_payments(id) ON DELETE CASCADE,
            FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
        );
    `);
        console.log('Taken bills table ready');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS overdue_sale_permissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            staff_id INT NOT NULL,
            sale_date DATE NOT NULL,
            outlet_id INT NOT NULL,
            outlet_erp_id VARCHAR(50) NOT NULL,
            outlet_name VARCHAR(255) NULL,
            max_overdue_days INT NOT NULL,
            overdue_credit_ids TEXT NULL,
            overdue_details TEXT NULL,
            permission_note TEXT NULL,
            permitted_by_admin_id INT NULL,
            permitted_by_name VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_overdue_sale_permissions_erp (outlet_erp_id),
            INDEX idx_overdue_sale_permissions_staff_date (staff_id, sale_date),
            FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
            FOREIGN KEY (outlet_id) REFERENCES staff_counters(id) ON DELETE CASCADE
        );
    `);
    console.log('Overdue sale permissions table ready');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS delivery_user_permissions (
            delivery_boy_id INT PRIMARY KEY,
            can_dashboard TINYINT(1) NOT NULL DEFAULT 0,
            can_dms TINYINT(1) NOT NULL DEFAULT 0,
            can_add_seller TINYINT(1) NOT NULL DEFAULT 0,
            can_add_item TINYINT(1) NOT NULL DEFAULT 0,
            can_item_list TINYINT(1) NOT NULL DEFAULT 0,
            can_update_payment TINYINT(1) NOT NULL DEFAULT 0,
            can_bank_deposit TINYINT(1) NOT NULL DEFAULT 0,
            can_add_outlet TINYINT(1) NOT NULL DEFAULT 0,
            can_location_assignments TINYINT(1) NOT NULL DEFAULT 0,
            can_add_sales TINYINT(1) NOT NULL DEFAULT 0,
            can_packaging TINYINT(1) NOT NULL DEFAULT 0,
            can_delivery TINYINT(1) NOT NULL DEFAULT 0,
            can_delivered TINYINT(1) NOT NULL DEFAULT 0,
            can_out_bill TINYINT(1) NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (delivery_boy_id) REFERENCES delivery_boys(id) ON DELETE CASCADE
        );
    `);
    console.log('Delivery user permissions table ready');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS outlet_expiry_list (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NOT NULL,
            seller_id INT NOT NULL,
            staff_id INT NOT NULL,
            outlet_id INT NOT NULL,
            product_source ENUM('manual', 'fetched') NOT NULL DEFAULT 'manual',
            product_erp_id VARCHAR(100) NULL,
            product_name VARCHAR(255) NOT NULL,
            invoice_number VARCHAR(100) NOT NULL,
            batch_number VARCHAR(100) NOT NULL,
            expiry_date DATE NOT NULL,
            qty DECIMAL(12, 2) NOT NULL DEFAULT 1.00,
            amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_outlet_expiry_date (expiry_date),
            FOREIGN KEY (company_id) REFERENCES companies(id),
            FOREIGN KEY (seller_id) REFERENCES purchase_sellers(id),
            FOREIGN KEY (staff_id) REFERENCES staff(id),
            FOREIGN KEY (outlet_id) REFERENCES staff_counters(id) ON DELETE CASCADE
        );
    `);
    console.log('Outlet expiry list table ready');
    try {
        await connection.query(`ALTER TABLE outlet_expiry_list ADD COLUMN invoice_number VARCHAR(100) NULL`);
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('invoice column may already exist on outlet_expiry_list');
    }
    try {
        await connection.query(`ALTER TABLE outlet_expiry_list ADD COLUMN batch_number VARCHAR(100) NULL`);
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('batch column may already exist on outlet_expiry_list');
    }
    try {
        await connection.query(`ALTER TABLE outlet_expiry_list ADD COLUMN seller_id INT NULL AFTER company_id`);
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('seller_id column may already exist on outlet_expiry_list');
    }
    try {
        await connection.query(`ALTER TABLE outlet_expiry_list ADD COLUMN qty DECIMAL(12, 2) NOT NULL DEFAULT 1.00`);
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') console.log('qty column may already exist on outlet_expiry_list');
    }

    // Add type and about columns to companies table
    try {
        await connection.query(`
            ALTER TABLE companies
            ADD COLUMN type ENUM('distributor', 'cnf') NULL,
            ADD COLUMN about TEXT NULL
        `);
        console.log('Added type and about columns to companies table');
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log('type/about columns may already exist on companies table');
        }
    }

    await connection.end();

}

initDB().catch(err => {
    console.error('Initialization failed:', err);
    process.exit(1);
});
