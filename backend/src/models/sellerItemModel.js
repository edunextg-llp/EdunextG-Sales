import db from '../config/db.js';

const ITEM_COLUMNS = `
    si.id,
    si.company_id,
    c.name AS company_name,
    si.seller_id,
    ps.seller_code,
    ps.seller_name,
    si.product_erp_id,
    si.sku_name,
    si.variant_name,
    si.hsn_code,
    si.gst_percent,
    si.cgst_percent,
    si.sgst_percent,
    si.pcs_per_box,
    si.created_at
`;

class SellerItemModel {
    static async importMany(rows) {
        const connection = await db.getConnection();
        let inserted = 0;
        let updated = 0;
        try {
            await connection.beginTransaction();
            for (const data of rows) {
                const [result] = await connection.execute(
                    `INSERT INTO seller_items (
                        company_id, seller_id, product_erp_id, sku_name, variant_name, hsn_code,
                        gst_percent, cgst_percent, sgst_percent, pcs_per_box
                     )
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        company_id = VALUES(company_id),
                        sku_name = VALUES(sku_name),
                        variant_name = VALUES(variant_name),
                        hsn_code = VALUES(hsn_code),
                        gst_percent = VALUES(gst_percent),
                        cgst_percent = VALUES(cgst_percent),
                        sgst_percent = VALUES(sgst_percent),
                        pcs_per_box = VALUES(pcs_per_box)`,
                    [
                        data.companyId,
                        data.sellerId,
                        data.productErpId,
                        data.skuName,
                        data.variantName,
                        data.hsnCode || null,
                        data.gstPercent,
                        data.cgstPercent,
                        data.sgstPercent,
                        data.pcsPerBox,
                    ]
                );
                if (result.affectedRows === 1) inserted += 1;
                else updated += 1;
            }
            await connection.commit();
            return { inserted, updated };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async create(data) {
        const [result] = await db.execute(
            `INSERT INTO seller_items (
                company_id, seller_id, product_erp_id, sku_name, variant_name, hsn_code,
                gst_percent, cgst_percent, sgst_percent, pcs_per_box
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.companyId,
                data.sellerId,
                data.productErpId,
                data.skuName,
                data.variantName || null,
                data.hsnCode || null,
                data.gstPercent,
                data.cgstPercent,
                data.sgstPercent,
                data.pcsPerBox,
            ]
        );
        return SellerItemModel.getById(result.insertId);
    }

    static async updateById(id, data) {
        await db.execute(
            `UPDATE seller_items
             SET company_id = ?,
                 seller_id = ?,
                 product_erp_id = ?,
                 sku_name = ?,
                 variant_name = ?,
                 hsn_code = ?,
                 gst_percent = ?,
                 cgst_percent = ?,
                 sgst_percent = ?,
                 pcs_per_box = ?
             WHERE id = ?`,
            [
                data.companyId,
                data.sellerId,
                data.productErpId,
                data.skuName,
                data.variantName || null,
                data.hsnCode || null,
                data.gstPercent,
                data.cgstPercent,
                data.sgstPercent,
                data.pcsPerBox,
                id,
            ]
        );
        return SellerItemModel.getById(id);
    }

    static async deleteById(id) {
        const [result] = await db.execute('DELETE FROM seller_items WHERE id = ?', [id]);
        return result.affectedRows;
    }

    static async getById(id) {
        const [rows] = await db.execute(
            `SELECT ${ITEM_COLUMNS}
             FROM seller_items si
             INNER JOIN companies c ON c.id = si.company_id
             INNER JOIN purchase_sellers ps ON ps.id = si.seller_id
             WHERE si.id = ?`,
            [id]
        );
        return rows[0] || null;
    }

    static async getBySeller(companyId, sellerId) {
        const [rows] = await db.execute(
            `SELECT ${ITEM_COLUMNS}
             FROM seller_items si
             INNER JOIN companies c ON c.id = si.company_id
             INNER JOIN purchase_sellers ps ON ps.id = si.seller_id
             WHERE si.company_id = ? AND si.seller_id = ?
             ORDER BY si.product_erp_id ASC, si.sku_name ASC`,
            [companyId, sellerId]
        );
        return rows;
    }

    static async findDuplicate(sellerId, productErpId, excludeId = null) {
        const params = [sellerId, productErpId];
        let excludeClause = '';
        if (excludeId) {
            excludeClause = ' AND id <> ?';
            params.push(excludeId);
        }

        const [rows] = await db.execute(
            `SELECT id, product_erp_id
             FROM seller_items
             WHERE seller_id = ?
               AND LOWER(TRIM(product_erp_id)) = LOWER(TRIM(?))
               ${excludeClause}
             LIMIT 1`,
            params
        );
        return rows[0] || null;
    }
}

export default SellerItemModel;
