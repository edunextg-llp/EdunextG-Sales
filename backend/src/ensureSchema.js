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
                raw_data JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (import_id) REFERENCES dms_stock_imports(id) ON DELETE CASCADE,
                INDEX idx_dms_stock_items_import_id (import_id),
                INDEX idx_dms_stock_items_product_erp_id (product_erp_id)
            );
        `);

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

        for (const [column, definition] of Object.entries({
            pcs_per_box: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            current_stock_in_case: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            current_stock_in_pcs: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            total_current_stock_in_pcs: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            price_per_piece: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
            mrp: 'DECIMAL(14, 4) NOT NULL DEFAULT 0.0000',
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

        console.log('Database schema verified');
    } finally {
        await connection.end();
    }
}
