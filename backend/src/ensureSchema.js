import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export async function ensureSchema() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
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
        } catch (err) {
            if (err.code !== 'ER_DUP_FIELDNAME') {
                // Columns may already exist on older databases
            }
        }

        await connection.query(`
            UPDATE staff_sales
            SET paid_amount = 0
            WHERE paid_amount IS NULL
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
            SET balance_amount = GREATEST(0, ss.price - COALESCE(
                (SELECT SUM(sp.amount) FROM sale_payments sp WHERE sp.sale_id = ss.id), 0
            ))
            WHERE ss.balance_amount IS NULL
              AND EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = ss.id)
        `);

        console.log('Database schema verified');
    } finally {
        await connection.end();
    }
}
