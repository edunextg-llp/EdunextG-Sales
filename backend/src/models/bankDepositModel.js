import db from '../config/db.js';

class BankDepositModel {
    static async create(data) {
        const {
            depositDate,
            bankName,
            branchName,
            bankAccountNo,
            storeName,
            depositMode,
            amount,
            chequeNo,
            cashDetails,
        } = data;

        const [result] = await db.execute(
            `INSERT INTO bank_deposits
             (deposit_date, bank_name, branch_name, bank_account_no, store_name, deposit_mode, amount, cheque_no, cash_details)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                depositDate,
                bankName,
                branchName,
                bankAccountNo,
                storeName,
                depositMode,
                amount,
                chequeNo || null,
                cashDetails ? JSON.stringify(cashDetails) : null,
            ]
        );

        return BankDepositModel.getById(result.insertId);
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT id, DATE_FORMAT(deposit_date, '%Y-%m-%d') AS deposit_date,
                    bank_name, branch_name, bank_account_no, store_name,
                    deposit_mode, amount, cheque_no, cash_details,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM bank_deposits
             WHERE id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    static async getRecent() {
        const [rows] = await db.execute(
            `SELECT id, DATE_FORMAT(deposit_date, '%Y-%m-%d') AS deposit_date,
                    bank_name, branch_name, bank_account_no, store_name,
                    deposit_mode, amount, cheque_no, cash_details,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM bank_deposits
             ORDER BY deposit_date DESC, id DESC
             LIMIT 200`
        );
        return rows;
    }
}

export default BankDepositModel;
