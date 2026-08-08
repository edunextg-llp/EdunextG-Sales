import db from '../config/db.js';

class PackagingRemarkModel {
    static async createBatch(items, connection = db) {
        const insertedIds = [];

        for (const item of items) {
            const [result] = await connection.execute(
                `INSERT INTO packaging_sale_remarks
                (sale_id, remark_category, issue_type, item_name, wrong_item, original_item, qty, amount, remarks)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    item.saleId,
                    item.remarkCategory,
                    item.issueType,
                    item.itemName,
                    item.wrongItem || null,
                    item.originalItem || null,
                    item.qty,
                    item.amount,
                    item.remarks || null,
                ]
            );
            insertedIds.push(result.insertId);
        }

        return insertedIds;
    }

    static async getBySaleId(saleId) {
        const [rows] = await db.execute(
            `SELECT id, sale_id, remark_category, issue_type, item_name, wrong_item, original_item,
                    qty, amount, remarks,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM packaging_sale_remarks
             WHERE sale_id = ?
             ORDER BY created_at DESC, id DESC`,
            [saleId]
        );
        return rows;
    }
}

export default PackagingRemarkModel;
