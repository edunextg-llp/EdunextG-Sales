import db from '../config/db.js';

class BankDepositModel {
    static async create(data) {
        const {
            depositDate,
            bankName,
            accountName,
            branchName,
            bankAccountNo,
            ifscCode,
            depositorName,
            storeName,
            depositMode,
            amount,
            chequeNo,
            chequeDate,
            cashDetails,
        } = data;

        const [result] = await db.execute(
            `INSERT INTO bank_deposits
             (deposit_date, bank_name, account_name, branch_name, bank_account_no, ifsc_code, depositor_name, store_name, deposit_mode, amount, cheque_no, cheque_date, cash_details)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                depositDate,
                bankName,
                accountName || null,
                branchName,
                bankAccountNo,
                ifscCode || null,
                depositorName || null,
                storeName,
                depositMode,
                amount,
                chequeNo || null,
                chequeDate || null,
                cashDetails ? JSON.stringify(cashDetails) : null,
            ]
        );

        return BankDepositModel.getById(result.insertId);
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT id, DATE_FORMAT(deposit_date, '%Y-%m-%d') AS deposit_date,
                    bank_name, account_name, branch_name, bank_account_no, ifsc_code, depositor_name, store_name,
                    deposit_mode, amount, cheque_no, DATE_FORMAT(cheque_date, '%Y-%m-%d') AS cheque_date, cash_details,
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
                    bank_name, account_name, branch_name, bank_account_no, ifsc_code, depositor_name, store_name,
                    deposit_mode, amount, cheque_no, DATE_FORMAT(cheque_date, '%Y-%m-%d') AS cheque_date, cash_details,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM bank_deposits
             ORDER BY deposit_date DESC, id DESC
             LIMIT 200`
        );
        return rows;
    }

    static async update(id, data) {
        const {
            depositDate,
            bankName,
            accountName,
            branchName,
            bankAccountNo,
            ifscCode,
            depositorName,
            storeName,
            depositMode,
            amount,
            chequeNo,
            chequeDate,
            cashDetails,
        } = data;

        const [result] = await db.execute(
            `UPDATE bank_deposits
             SET deposit_date = ?, bank_name = ?, account_name = ?, branch_name = ?,
                 bank_account_no = ?, ifsc_code = ?, depositor_name = ?, store_name = ?, deposit_mode = ?,
                 amount = ?, cheque_no = ?, cheque_date = ?, cash_details = ?
             WHERE id = ?`,
            [
                depositDate,
                bankName,
                accountName || null,
                branchName,
                bankAccountNo,
                ifscCode || null,
                depositorName || null,
                storeName,
                depositMode,
                amount,
                chequeNo || null,
                chequeDate || null,
                cashDetails ? JSON.stringify(cashDetails) : null,
                id,
            ]
        );

        return result.affectedRows > 0 ? BankDepositModel.getById(id) : null;
    }

    static async delete(id) {
        const [result] = await db.execute('DELETE FROM bank_deposits WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }
}

export default BankDepositModel;
