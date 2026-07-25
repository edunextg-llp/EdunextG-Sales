import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { migrateStaffSalesUniqueIndex } from './migrations/migrateStaffSalesUniqueIndex.js';

dotenv.config();

async function tryQuery(connection, sql, label) {
    try {
        await connection.query(sql);
        if (label) {
            console.log(label);
        }
    } catch (err) {
        if (
            err.code === 'ER_DUP_FIELDNAME' ||
            err.code === 'ER_CANT_CREATE_TABLE' ||
            err.code === 'ER_DUP_KEYNAME' ||
            err.code === 'ER_CANT_DROP_FIELD_OR_KEY'
        ) {
            return;
        }
        console.warn(`Schema step skipped (${label || 'query'}):`, err.message);
    }
}

export async function ensureSchema() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        await connection.query(`
            CREATE TABLE IF NOT EXISTS sticker_sequence (
                id INT PRIMARY KEY,
                seq_value INT NOT NULL DEFAULT 0
            );
        `);
        await connection.query(`
            INSERT IGNORE INTO sticker_sequence (id, seq_value) VALUES (1, 0)
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await tryQuery(
            connection,
            `ALTER TABLE companies ADD COLUMN type ENUM('distributor', 'cnf') NULL`,
            'type on companies'
        );

        await tryQuery(
            connection,
            `ALTER TABLE companies ADD COLUMN about TEXT NULL`,
            'about on companies'
        );

        await connection.query(`
            CREATE TABLE IF NOT EXISTS company_sequence (
                id INT PRIMARY KEY,
                seq_value INT NOT NULL DEFAULT 0
            );
        `);
        await connection.query(`
            INSERT IGNORE INTO company_sequence (id, seq_value) VALUES (1, 0)
        `);

        await tryQuery(
            connection,
            `ALTER TABLE companies ADD COLUMN code VARCHAR(20) NULL UNIQUE`,
            'code on companies'
        );

        const [companiesMissingCode] = await connection.query(`
            SELECT id FROM companies WHERE code IS NULL OR code = '' ORDER BY id
        `);
        for (const row of companiesMissingCode) {
            await connection.query(`
                INSERT IGNORE INTO company_sequence (id, seq_value) VALUES (1, 0)
            `);
            await connection.query(`
                UPDATE company_sequence SET seq_value = seq_value + 1 WHERE id = 1
            `);
            const [seqRows] = await connection.query(`
                SELECT seq_value FROM company_sequence WHERE id = 1
            `);
            const seqValue = seqRows[0]?.seq_value || 1;
            const generatedCode = `BFPCO${String(seqValue).padStart(3, '0')}`;
            await connection.query(
                `UPDATE companies SET code = ? WHERE id = ?`,
                [generatedCode, row.id]
            );
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

        await connection.query(`
            INSERT IGNORE INTO staff_companies (staff_id, company_id)
            SELECT id, company_id FROM staff WHERE company_id IS NOT NULL
        `);

        await tryQuery(
            connection,
            `ALTER TABLE staff ADD COLUMN staff_type ENUM('distributor', 'cnf') NOT NULL DEFAULT 'distributor'`,
            'staff_type on staff'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff ADD COLUMN dob DATE NULL`,
            'dob on staff'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff ADD COLUMN whatsapp_number VARCHAR(20) NULL`,
            'whatsapp_number on staff'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff ADD COLUMN aadhar_no VARCHAR(20) NULL`,
            'aadhar_no on staff'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff ADD COLUMN aadhar_document_url TEXT NULL`,
            'aadhar_document_url on staff'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff ADD COLUMN pcc_certificate_url TEXT NULL`,
            'pcc_certificate_url on staff'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff ADD COLUMN staff_category ENUM('company_staff', 'bawarchee_staff') NOT NULL DEFAULT 'company_staff'`,
            'staff_category on staff'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`,
            'is_active on staff'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_locations MODIFY COLUMN day ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'CNF') NOT NULL`,
            'CNF route day on staff_locations'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_counters MODIFY COLUMN day ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'CNF') NOT NULL`,
            'CNF route day on staff_counters'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_counters ADD COLUMN google_location TEXT NULL`,
            'google_location on staff_counters'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff_counters ADD COLUMN whatsapp_number VARCHAR(20) NULL`,
            'whatsapp_number on staff_counters'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff_counters ADD COLUMN location_name VARCHAR(255) NULL`,
            'location_name on staff_counters'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff_counters ADD COLUMN address TEXT NULL`,
            'address on staff_counters'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff_counters ADD COLUMN has_gst TINYINT(1) NOT NULL DEFAULT 0`,
            'has_gst on staff_counters'
        );
        await tryQuery(
            connection,
            `ALTER TABLE staff_counters ADD COLUMN gst_number VARCHAR(50) NULL`,
            'gst_number on staff_counters'
        );
        await tryQuery(
            connection,
            `UPDATE staff_counters sc
             INNER JOIN (
                 SELECT staff_id, day, MIN(location_name) AS location_name
                 FROM staff_locations
                 GROUP BY staff_id, day
                 HAVING COUNT(*) = 1
             ) sl ON sl.staff_id = sc.staff_id AND sl.day = sc.day
             SET sc.location_name = sl.location_name
             WHERE sc.location_name IS NULL OR TRIM(sc.location_name) = ''`,
            'backfill location_name on staff_counters'
        );

        await tryQuery(
            connection,
            `
            ALTER TABLE delivery_boys ADD COLUMN company_id INT NULL,
            ADD CONSTRAINT fk_delivery_boys_company
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
        `,
            'company_id on delivery_boys'
        );

        await tryQuery(
            connection,
            `ALTER TABLE delivery_boys ADD COLUMN delivery_login_id VARCHAR(20) NULL UNIQUE`,
            'delivery_login_id on delivery_boys'
        );

        await tryQuery(
            connection,
            `ALTER TABLE delivery_boys ADD COLUMN delivery_passcode VARCHAR(20) NULL`,
            'legacy delivery_passcode on delivery_boys'
        );

        await tryQuery(
            connection,
            `ALTER TABLE delivery_boys ADD COLUMN delivery_passcode_hash VARCHAR(255) NULL`,
            'delivery_passcode_hash on delivery_boys'
        );
        await tryQuery(
            connection,
            `ALTER TABLE delivery_boys ADD COLUMN role ENUM('delivery_boy', 'packaging_staff') NOT NULL DEFAULT 'delivery_boy'`,
            'role on delivery_boys'
        );
        await tryQuery(
            connection,
            `ALTER TABLE delivery_boys ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`,
            'is_active on delivery_boys'
        );
        await tryQuery(
            connection,
            `ALTER TABLE delivery_boys ADD COLUMN aadhar_no VARCHAR(20) NULL`,
            'aadhar_no on delivery_boys'
        );

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

        await connection.query(`
            INSERT IGNORE INTO delivery_boy_companies (delivery_boy_id, company_id)
            SELECT id, company_id FROM delivery_boys WHERE company_id IS NOT NULL
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
                remarks TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sale_id) REFERENCES staff_sales(id) ON DELETE CASCADE
            );
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS delivery_boy_collections (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_id INT NOT NULL,
                delivery_boy_id INT NOT NULL,
                payment_mode ENUM('cash', 'upi', 'credit', 'cheque') NOT NULL,
                amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                cash_details JSON NULL,
                reference_no VARCHAR(100) NULL,
                reference_date DATE NULL,
                credit_days INT NULL,
                remarks TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_delivery_boy_collections_sale_delivery (sale_id, delivery_boy_id),
                INDEX idx_delivery_boy_collections_delivery_boy_id (delivery_boy_id),
                FOREIGN KEY (sale_id) REFERENCES staff_sales(id) ON DELETE CASCADE,
                FOREIGN KEY (delivery_boy_id) REFERENCES delivery_boys(id) ON DELETE CASCADE
            );
        `);

        await tryQuery(
            connection,
            `
            ALTER TABLE staff_sales 
            MODIFY payment_mode ENUM('cash', 'upi', 'credit', 'cheque') NOT NULL DEFAULT 'cash',
            ADD COLUMN paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN balance_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN reference_no VARCHAR(100) NULL,
            ADD COLUMN reference_date DATE NULL,
            ADD COLUMN credit_days INT NULL
        `,
            'Payment columns on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD COLUMN delivery_boy_id INT NULL`,
            'delivery_boy_id on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD COLUMN vehicle_no VARCHAR(50) NULL`,
            'vehicle_no on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD COLUMN invoice_number VARCHAR(100) NOT NULL DEFAULT ''`,
            'invoice_number on staff_sales'
        );

        await migrateStaffSalesUniqueIndex(connection);

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD COLUMN item_count INT NOT NULL DEFAULT 0`,
            'item_count on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD COLUMN packed_item_count INT NULL`,
            'packed_item_count on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD COLUMN box_count INT NULL`,
            'box_count on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD COLUMN packet_count INT NULL`,
            'packet_count on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales MODIFY COLUMN box_count INT NULL`,
            'box_count nullable on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD COLUMN packed_by_id INT NULL`,
            'packed_by_id on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD CONSTRAINT fk_staff_sales_packed_by
             FOREIGN KEY (packed_by_id) REFERENCES delivery_boys(id) ON DELETE SET NULL`,
            'packed_by_id foreign key on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales MODIFY COLUMN packet_count INT NULL`,
            'packet_count nullable on staff_sales'
        );

        await tryQuery(
            connection,
            `ALTER TABLE sale_payments ADD COLUMN remarks TEXT NULL`,
            'remarks on sale_payments'
        );

        await tryQuery(
            connection,
            `ALTER TABLE sale_payments ADD COLUMN parent_credit_payment_id INT NULL`,
            'parent_credit_payment_id on sale_payments'
        );

        await tryQuery(
            connection,
            `ALTER TABLE sale_payments ADD COLUMN collector_staff_id INT NULL`,
            'collector_staff_id on sale_payments'
        );

        await tryQuery(
            connection,
            `ALTER TABLE sale_payments ADD COLUMN collector_name VARCHAR(255) NULL`,
            'collector_name on sale_payments'
        );

        await connection.query(`
            UPDATE sale_payments sp
            JOIN staff_sales ss ON ss.id = sp.sale_id
            SET sp.collector_staff_id = ss.staff_id
            WHERE sp.collector_staff_id IS NULL
        `);

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

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD COLUMN state VARCHAR(100) NULL`,
            'state on purchase_sellers'
        );

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD COLUMN pan_no VARCHAR(50) NULL`,
            'pan_no on purchase_sellers'
        );

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD COLUMN in_code VARCHAR(50) NULL`,
            'in_code on purchase_sellers'
        );

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD COLUMN company_id INT NULL`,
            'company_id on purchase_sellers'
        );

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD COLUMN contact VARCHAR(20) NULL`,
            'contact on purchase_sellers'
        );

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD COLUMN district VARCHAR(100) NULL`,
            'district on purchase_sellers'
        );

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD COLUMN has_gst TINYINT(1) NOT NULL DEFAULT 0`,
            'has_gst on purchase_sellers'
        );

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD CONSTRAINT fk_purchase_sellers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL`,
            'fk_purchase_sellers_company'
        );

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers DROP INDEX seller_name`,
            'drop seller_name unique on purchase_sellers'
        );

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD UNIQUE INDEX uq_company_seller (company_id, seller_name)`,
            'uq_company_seller on purchase_sellers'
        );

        await connection.query(`
            CREATE TABLE IF NOT EXISTS seller_sequence (
                id INT PRIMARY KEY,
                seq_value INT NOT NULL DEFAULT 0
            );
        `);
        await connection.query(`
            INSERT IGNORE INTO seller_sequence (id, seq_value) VALUES (1, 0)
        `);

        await tryQuery(
            connection,
            `ALTER TABLE purchase_sellers ADD COLUMN seller_code VARCHAR(20) NULL UNIQUE`,
            'seller_code on purchase_sellers'
        );

        const [sellersMissingCode] = await connection.query(`
            SELECT id FROM purchase_sellers WHERE seller_code IS NULL OR seller_code = '' ORDER BY id
        `);
        for (const row of sellersMissingCode) {
            await connection.query(`
                INSERT IGNORE INTO seller_sequence (id, seq_value) VALUES (1, 0)
            `);
            await connection.query(`
                UPDATE seller_sequence SET seq_value = seq_value + 1 WHERE id = 1
            `);
            const [seqRows] = await connection.query(`
                SELECT seq_value FROM seller_sequence WHERE id = 1
            `);
            const seqValue = seqRows[0]?.seq_value || 1;
            const generatedCode = `BFPSL${String(seqValue).padStart(4, '0')}`;
            await connection.query(
                `UPDATE purchase_sellers SET seller_code = ? WHERE id = ?`,
                [generatedCode, row.id]
            );
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

        await tryQuery(
            connection,
            `ALTER TABLE seller_items ADD COLUMN gst_percent DECIMAL(5, 2) NOT NULL DEFAULT 5.00`,
            'gst_percent on seller_items'
        );
        await tryQuery(
            connection,
            `ALTER TABLE seller_items ADD COLUMN cgst_percent DECIMAL(5, 2) NOT NULL DEFAULT 2.50`,
            'cgst_percent on seller_items'
        );
        await tryQuery(
            connection,
            `ALTER TABLE seller_items ADD COLUMN sgst_percent DECIMAL(5, 2) NOT NULL DEFAULT 2.50`,
            'sgst_percent on seller_items'
        );
        await tryQuery(connection, `ALTER TABLE seller_items ADD COLUMN pcs_per_box DECIMAL(14, 4) NULL`, 'pcs_per_box on seller_items');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS company_item_sequence (
                company_id INT PRIMARY KEY,
                seq_value INT NOT NULL DEFAULT 0,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            );
        `);

        const [itemSeqRows] = await connection.query(`
            SELECT si.company_id, MAX(CAST(SUBSTRING(si.product_erp_id, 6) AS UNSIGNED)) AS max_seq
            FROM seller_items si
            WHERE si.product_erp_id REGEXP '^BFP[A-Z]{2}[0-9]+$'
            GROUP BY si.company_id
        `);
        for (const row of itemSeqRows) {
            await connection.query(
                `INSERT INTO company_item_sequence (company_id, seq_value)
                 VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE seq_value = GREATEST(seq_value, VALUES(seq_value))`,
                [row.company_id, row.max_seq || 0]
            );
        }

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

        await tryQuery(
            connection,
            `ALTER TABLE purchase_entries ADD COLUMN company_id INT NULL AFTER seller_id`,
            'company_id on purchase_entries'
        );

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
                total_stock_cases DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                total_stock_pcs DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                total_pieces DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                total_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

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
                total_value DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
                purchase_price DECIMAL(14, 4) NULL,
                expiry_date DATE NULL,
                raw_data JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (import_id) REFERENCES dms_stock_imports(id) ON DELETE CASCADE,
                INDEX idx_dms_stock_items_import_id (import_id),
                INDEX idx_dms_stock_items_product_erp_id (product_erp_id)
            );
        `);

        await tryQuery(connection, `ALTER TABLE dms_stock_items ADD COLUMN expiry_date DATE NULL`, 'expiry_date on dms_stock_items');

        await tryQuery(
            connection,
            `ALTER TABLE dms_stock_imports ADD COLUMN upload_date DATE NULL`,
            'upload_date on dms_stock_imports'
        );

        for (const [column, definition] of Object.entries({
            total_stock_cases: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            total_stock_pcs: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
        })) {
            await tryQuery(connection, `ALTER TABLE dms_stock_imports ADD COLUMN ${column} ${definition}`, `${column} on dms_stock_imports`);
        }

        await tryQuery(
            connection,
            `ALTER TABLE dms_stock_imports ADD COLUMN company_id INT NULL AFTER file_name`,
            'company_id on dms_stock_imports'
        );
        await tryQuery(
            connection,
            `ALTER TABLE dms_stock_imports ADD COLUMN entry_code VARCHAR(40) NULL AFTER id`,
            'entry_code on dms_stock_imports'
        );
        await tryQuery(
            connection,
            `ALTER TABLE dms_stock_imports ADD COLUMN invoice_number VARCHAR(100) NULL AFTER entry_code`,
            'invoice_number on dms_stock_imports'
        );
        await tryQuery(
            connection,
            `ALTER TABLE dms_stock_imports ADD COLUMN seller_id INT NULL AFTER company_id`,
            'seller_id on dms_stock_imports'
        );
        await tryQuery(
            connection,
            `ALTER TABLE dms_stock_imports MODIFY COLUMN total_value DECIMAL(14, 4) NOT NULL DEFAULT 0.0000`,
            'four-decimal total_value on dms_stock_imports'
        );
        await tryQuery(
            connection,
            `ALTER TABLE dms_stock_items MODIFY COLUMN total_value DECIMAL(14, 4) NOT NULL DEFAULT 0.0000`,
            'four-decimal total_value on dms_stock_items'
        );

        await connection.query(`
            CREATE TABLE IF NOT EXISTS purchase_requisitions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                requisition_number VARCHAR(30) NOT NULL UNIQUE,
                seller_type ENUM('distributor', 'cnf') NOT NULL DEFAULT 'distributor',
                company_id INT NOT NULL,
                staff_id INT NOT NULL,
                outlet_id INT NOT NULL,
                outlet_day VARCHAR(20) NULL,
                items JSON NOT NULL,
                item_count INT NOT NULL DEFAULT 0,
                total_quantity DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                total_amount DECIMAL(14, 4) NOT NULL DEFAULT 0.0000,
                status ENUM('open', 'invoiced', 'cancelled') NOT NULL DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_purchase_requisitions_company (company_id),
                INDEX idx_purchase_requisitions_staff (staff_id),
                INDEX idx_purchase_requisitions_outlet (outlet_id)
            )
        `);
        await tryQuery(
            connection,
            `CREATE UNIQUE INDEX uq_dms_stock_imports_entry_code ON dms_stock_imports(entry_code)`,
            'unique entry_code on dms_stock_imports'
        );

        for (const [column, definition] of Object.entries({
            pcs_per_box: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            current_stock_in_case: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            current_stock_in_pcs: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            total_current_stock_in_pcs: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            price_per_piece: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            mrp: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            batch_number: 'VARCHAR(100) NULL',
            mfg_date: 'DATE NULL',
            dp_price: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            discount_percent: 'DECIMAL(7, 4) NOT NULL DEFAULT 0.0000',
            gst_percent: 'DECIMAL(7, 4) NOT NULL DEFAULT 5.0000',
            cgst_amount: 'DECIMAL(14, 2) NOT NULL DEFAULT 0.00',
            sgst_amount: 'DECIMAL(14, 2) NOT NULL DEFAULT 0.00',
            retail_price: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            wholesale_price: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            retail_margin: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            wholesale_margin: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
        })) {
            await tryQuery(connection, `ALTER TABLE dms_stock_items ADD COLUMN ${column} ${definition}`, `${column} on dms_stock_items`);
        }

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
                expired_stock_date DATE NULL,
                raw_data JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (import_id) REFERENCES physical_stock_imports(id) ON DELETE CASCADE,
                INDEX idx_physical_stock_items_import_id (import_id),
                INDEX idx_physical_stock_items_product_erp_id (product_erp_id)
            );
        `);

        await tryQuery(
            connection,
            `ALTER TABLE physical_stock_items ADD COLUMN expired_stock_date DATE NULL`,
            'expired_stock_date on physical_stock_items'
        );

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
                expired_stock_date DATE NULL,
                source_type ENUM('upload', 'manual', 'sale') NOT NULL DEFAULT 'manual',
                source_label VARCHAR(255) NULL,
                change_type ENUM('create', 'update', 'deduct') NOT NULL DEFAULT 'update',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_physical_stock_history_dms_erp (dms_import_id, product_erp_id),
                INDEX idx_physical_stock_history_created (created_at)
            )
        `);

        await tryQuery(
            connection,
            `ALTER TABLE physical_stock_item_history ADD COLUMN import_id INT NULL`,
            'import_id on physical_stock_item_history'
        );
        await tryQuery(
            connection,
            `ALTER TABLE physical_stock_item_history ADD COLUMN item_id INT NULL`,
            'item_id on physical_stock_item_history'
        );
        await tryQuery(
            connection,
            `ALTER TABLE physical_stock_item_history ADD COLUMN product_division VARCHAR(255) NULL`,
            'product_division on physical_stock_item_history'
        );
        await tryQuery(
            connection,
            `ALTER TABLE physical_stock_item_history ADD COLUMN pcs_per_box DECIMAL(14, 4) NOT NULL DEFAULT 0.0000`,
            'pcs_per_box on physical_stock_item_history'
        );
        await tryQuery(
            connection,
            `ALTER TABLE physical_stock_item_history ADD COLUMN source_type ENUM('upload', 'manual', 'sale') NOT NULL DEFAULT 'manual'`,
            'source_type on physical_stock_item_history'
        );
        await tryQuery(
            connection,
            `ALTER TABLE physical_stock_item_history ADD COLUMN source_label VARCHAR(255) NULL`,
            'source_label on physical_stock_item_history'
        );
        await tryQuery(
            connection,
            `UPDATE physical_stock_item_history
             SET item_id = physical_stock_item_id
             WHERE item_id IS NULL AND physical_stock_item_id IS NOT NULL`,
            'backfill item_id on physical_stock_item_history'
        );
        await tryQuery(
            connection,
            `UPDATE physical_stock_item_history
             SET source_label = source_name
             WHERE source_label IS NULL AND source_name IS NOT NULL`,
            'backfill source_label on physical_stock_item_history'
        );
        await tryQuery(
            connection,
            `UPDATE physical_stock_item_history
             SET source_type = CASE
                 WHEN source_name = 'Sales Deduction' THEN 'sale'
                 WHEN source_name = 'Manual Entry' THEN 'manual'
                 ELSE 'upload'
             END
             WHERE source_name IS NOT NULL`,
            'backfill source_type on physical_stock_item_history'
        );

        await tryQuery(
            connection,
            `UPDATE dms_stock_imports SET upload_date = DATE(created_at) WHERE upload_date IS NULL`,
            'backfill upload_date on dms_stock_imports'
        );

        await tryQuery(
            connection,
            `ALTER TABLE bank_deposits ADD COLUMN deposit_ref_no VARCHAR(20) NULL UNIQUE`,
            'deposit_ref_no on bank_deposits'
        );

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

        await tryQuery(
            connection,
            `ALTER TABLE bank_deposits ADD COLUMN account_name VARCHAR(255) NULL`,
            'account_name on bank_deposits'
        );

        await tryQuery(
            connection,
            `ALTER TABLE bank_deposits ADD COLUMN ifsc_code VARCHAR(50) NULL`,
            'ifsc_code on bank_deposits'
        );

        await tryQuery(
            connection,
            `ALTER TABLE bank_deposits ADD COLUMN cheque_date DATE NULL`,
            'cheque_date on bank_deposits'
        );

        await tryQuery(
            connection,
            `ALTER TABLE bank_deposits ADD COLUMN depositor_name VARCHAR(255) NULL`,
            'depositor_name on bank_deposits'
        );

        await tryQuery(
            connection,
            `ALTER TABLE bank_deposits MODIFY COLUMN deposit_mode ENUM('cash', 'cheque', 'upi') NOT NULL`,
            'upi deposit_mode on bank_deposits'
        );

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

        await tryQuery(
            connection,
            `ALTER TABLE staff_sales ADD COLUMN delivery_date DATE NULL`,
            'delivery_date on staff_sales'
        );

        await tryQuery(
            connection,
            `
            ALTER TABLE staff_sales ADD COLUMN packaging_status
            ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery')
            NOT NULL DEFAULT 'not_packing'
        `,
            'packaging_status on staff_sales'
        );

        await tryQuery(
            connection,
            `
            ALTER TABLE staff_sales MODIFY COLUMN packaging_status
            ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned')
            NOT NULL DEFAULT 'not_packing'
        `,
            'packaging_status enum values'
        );

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

        await tryQuery(
            connection,
            `
            ALTER TABLE staff_sale_status_history MODIFY COLUMN status
            ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned')
            NOT NULL
        `,
            'staff_sale_status_history status enum values'
        );

        await connection.query(`
            INSERT INTO staff_sale_status_history (sale_id, status, changed_at)
            SELECT ss.id, ss.packaging_status, COALESCE(ss.created_at, CURRENT_TIMESTAMP)
            FROM staff_sales ss
            WHERE NOT EXISTS (
                SELECT 1 FROM staff_sale_status_history ssh WHERE ssh.sale_id = ss.id
            )
        `);

        await connection.query(`
            UPDATE staff_sales SET paid_amount = 0 WHERE paid_amount IS NULL
        `);

        await connection.query(`
            UPDATE staff_sales ss
            SET balance_amount = ss.price
            WHERE ss.balance_amount IS NULL
              AND ss.price > 0
              AND NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = ss.id)
        `);

        await connection.query(`
            UPDATE staff_sales ss
            SET paid_amount = COALESCE((
                    SELECT SUM(sp.amount) FROM sale_payments sp
                    WHERE sp.sale_id = ss.id AND sp.payment_mode IN ('cash', 'upi', 'cheque')
                ), 0),
                balance_amount = GREATEST(0, ss.price - COALESCE((
                    SELECT SUM(sp.amount) FROM sale_payments sp
                    WHERE sp.sale_id = ss.id AND sp.payment_mode IN ('cash', 'upi', 'cheque')
                ), 0))
            WHERE EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = ss.id)
        `);

        // Older cancel flow reset delivery cancels to not_packing — keep them out of Packaging.
        await connection.query(`
            UPDATE staff_sales ss
            SET packaging_status = 'cancelled',
                delivery_boy_id = NULL,
                vehicle_no = NULL,
                delivery_date = NULL
            WHERE ss.packaging_status IN ('not_packing', 'packing', 'packing_done')
              AND EXISTS (
                  SELECT 1 FROM staff_sale_status_history h
                  WHERE h.sale_id = ss.id AND h.status = 'cancelled'
              )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS order_cancellations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_id INT NULL,
                outlet_name VARCHAR(255) NOT NULL,
                invoice_number VARCHAR(255) NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                product_size VARCHAR(100) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sale_id) REFERENCES staff_sales(id) ON DELETE SET NULL
            );
        `);

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

        await connection.query(`
            CREATE TABLE IF NOT EXISTS chalan_sequence (
                id INT PRIMARY KEY,
                seq_value INT NOT NULL DEFAULT 0
            );
        `);
        await connection.query(`
            INSERT IGNORE INTO chalan_sequence (id, seq_value) VALUES (1, 0)
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS chalan_sales (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chalan_code VARCHAR(20) NOT NULL UNIQUE,
                sale_date DATE NOT NULL,
                assignee_type ENUM('company_staff', 'delivery_boy') NOT NULL,
                staff_id INT NULL,
                delivery_boy_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL,
                FOREIGN KEY (delivery_boy_id) REFERENCES delivery_boys(id) ON DELETE SET NULL
            );
        `);

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

        await tryQuery(
            connection,
            `ALTER TABLE chalan_sale_items ADD COLUMN returned_qty DECIMAL(10, 2) NOT NULL DEFAULT 0`,
            'returned_qty on chalan_sale_items'
        );

        await tryQuery(
            connection,
            `ALTER TABLE chalan_sales ADD COLUMN packaging_status
             ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned')
             NOT NULL DEFAULT 'not_packing'`,
            'packaging_status on chalan_sales'
        );
        await tryQuery(
            connection,
            `ALTER TABLE chalan_sales ADD COLUMN packed_item_count INT NULL`,
            'packed_item_count on chalan_sales'
        );
        await tryQuery(
            connection,
            `ALTER TABLE chalan_sales ADD COLUMN box_count INT NULL`,
            'box_count on chalan_sales'
        );
        await tryQuery(
            connection,
            `ALTER TABLE chalan_sales ADD COLUMN packet_count INT NULL`,
            'packet_count on chalan_sales'
        );
        await tryQuery(
            connection,
            `ALTER TABLE chalan_sales ADD COLUMN vehicle_no VARCHAR(50) NULL`,
            'vehicle_no on chalan_sales'
        );
        await tryQuery(
            connection,
            `ALTER TABLE chalan_sales ADD COLUMN delivery_date DATE NULL`,
            'delivery_date on chalan_sales'
        );

        await connection.query(`
            CREATE TABLE IF NOT EXISTS chalan_sale_status_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chalan_sale_id INT NOT NULL,
                status VARCHAR(32) NOT NULL,
                changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chalan_sale_id) REFERENCES chalan_sales(id) ON DELETE CASCADE
            );
        `);

        await tryQuery(
            connection,
            `ALTER TABLE taken_bills ADD COLUMN collector_type VARCHAR(32) NOT NULL DEFAULT 'company_staff'`,
            'collector_type on taken_bills'
        );
        await tryQuery(
            connection,
            `ALTER TABLE taken_bills ADD COLUMN delivery_boy_id INT NULL`,
            'delivery_boy_id on taken_bills'
        );
        await tryQuery(
            connection,
            `ALTER TABLE taken_bills MODIFY staff_id INT NULL`,
            'nullable staff_id on taken_bills'
        );
        await tryQuery(
            connection,
            `ALTER TABLE taken_bills
             ADD CONSTRAINT fk_taken_bills_delivery_boy
             FOREIGN KEY (delivery_boy_id) REFERENCES delivery_boys(id) ON DELETE SET NULL`,
            'fk_taken_bills_delivery_boy'
        );
        await tryQuery(
            connection,
            `ALTER TABLE taken_bills ADD COLUMN returned_at DATETIME NULL`,
            'returned_at on taken_bills'
        );

        await tryQuery(
            connection,
            `ALTER TABLE chalan_sales ADD COLUMN returned_item_count INT NOT NULL DEFAULT 0`,
            'returned_item_count on chalan_sales'
        );
        await tryQuery(
            connection,
            `ALTER TABLE chalan_sales ADD COLUMN returned_packed_item_count INT NOT NULL DEFAULT 0`,
            'returned_packed_item_count on chalan_sales'
        );
        await tryQuery(
            connection,
            `ALTER TABLE chalan_sales ADD COLUMN returned_amount DECIMAL(12, 2) NOT NULL DEFAULT 0`,
            'returned_amount on chalan_sales'
        );

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

        await connection.query(`
            CREATE TABLE IF NOT EXISTS chalan_sale_return_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chalan_sale_return_id INT NOT NULL,
                chalan_sale_item_id INT NOT NULL,
                return_qty DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (chalan_sale_return_id) REFERENCES chalan_sale_returns(id) ON DELETE CASCADE,
                FOREIGN KEY (chalan_sale_item_id) REFERENCES chalan_sale_items(id) ON DELETE CASCADE
            );
        `);

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
        console.log('overdue_sale_permissions table verified');

        console.log('Database schema verified');
    } finally {
        await connection.end();
    }
}
