import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function tryQuery(connection, sql, label) {
    try {
        await connection.query(sql);
        if (label) {
            console.log(label);
        }
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_CANT_CREATE_TABLE') {
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
            CREATE TABLE IF NOT EXISTS sale_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sale_id INT NOT NULL,
                payment_date DATE NOT NULL,
                payment_mode ENUM('cash', 'upi', 'credit', 'cheque') NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                reference_no VARCHAR(100) NULL,
                reference_date DATE NULL,
                credit_days INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sale_id) REFERENCES staff_sales(id) ON DELETE CASCADE
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
            ENUM('not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled')
            NOT NULL DEFAULT 'not_packing'
        `,
            'packaging_status enum values'
        );

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

        console.log('Database schema verified');
    } finally {
        await connection.end();
    }
}
