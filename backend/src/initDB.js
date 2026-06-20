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
            google_location TEXT NULL,
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
        await connection.query(`
            ALTER TABLE staff_counters ADD COLUMN google_location TEXT NULL
        `);
        console.log('Added google_location to staff_counters table');
    } catch (err) {
        console.log('google_location column may already exist on staff_counters');
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
            delivery_passcode VARCHAR(20) NULL,
            delivery_passcode_hash VARCHAR(255) NULL,
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
            parent_credit_payment_id INT NULL,
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

    await connection.query(`
        CREATE TABLE IF NOT EXISTS purchase_entries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            seller_id INT NOT NULL,
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
            INDEX idx_purchase_entries_seller_id (seller_id)
        );
    `);
    console.log('Purchase entries table created');

    await connection.query(`
        CREATE TABLE IF NOT EXISTS dms_stock_imports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            file_name VARCHAR(255) NOT NULL,
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
            total_pieces DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
            total_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
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
            total_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            purchase_price DECIMAL(14, 4) NULL,
            raw_data JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (import_id) REFERENCES dms_stock_imports(id) ON DELETE CASCADE,
            INDEX idx_dms_stock_items_import_id (import_id),
            INDEX idx_dms_stock_items_product_erp_id (product_erp_id)
        );
    `);
    console.log('DMS stock items table created');

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
