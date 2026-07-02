import db from '../config/db.js';

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

class PhysicalStockModel {
    static async createImport({ dmsImportId, fileName, rowCount, summary, rows }) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const [importResult] = await connection.execute(
                `INSERT INTO physical_stock_imports
                 (dms_import_id, file_name, row_count, total_cases, total_loose_pcs,
                  total_pieces, total_value)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    dmsImportId,
                    fileName,
                    rowCount,
                    summary.totalCases,
                    summary.totalLoosePcs,
                    summary.totalPieces,
                    summary.totalValue,
                ]
            );

            const importId = importResult.insertId;
            if (rows.length) {
                const values = rows.map((row) => [
                    importId,
                    row.productErpId,
                    row.productName,
                    row.productDivision,
                    row.variantName,
                    row.pcsPerBox,
                    row.physicalStockInCase,
                    row.physicalStockInPcs,
                    row.totalPhysicalStockInPcs,
                    row.pricePerPiece,
                    row.mrp,
                    row.totalValue,
                    row.expiredStockDate || null,
                    JSON.stringify(row.rawData),
                ]);

                await connection.query(
                    `INSERT INTO physical_stock_items
                     (import_id, product_erp_id, product_name, product_division, variant_name,
                      pcs_per_box, physical_stock_in_case, physical_stock_in_pcs,
                      total_physical_stock_in_pcs, price_per_piece, mrp, total_value,
                      expired_stock_date, raw_data)
                     VALUES ?`,
                    [values]
                );
            }

            await connection.commit();
            return PhysicalStockModel.getImportById(importId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getLatestByDmsImportId(dmsImportId) {
        const [rows] = await db.execute(
            `SELECT id
             FROM physical_stock_imports
             WHERE dms_import_id = ?
             ORDER BY id DESC
             LIMIT 1`,
            [dmsImportId]
        );

        return rows[0] ? PhysicalStockModel.getImportById(rows[0].id) : null;
    }

    static async getImportById(importId) {
        const [headerRows, items] = await Promise.all([
            db.execute(
                `SELECT psi.id, psi.dms_import_id, psi.file_name, psi.row_count,
                        psi.total_cases, psi.total_loose_pcs, psi.total_pieces, psi.total_value,
                        DATE_FORMAT(psi.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                        dsi.file_name AS dms_file_name,
                        DATE_FORMAT(dsi.upload_date, '%Y-%m-%d') AS dms_upload_date
                 FROM physical_stock_imports psi
                 JOIN dms_stock_imports dsi ON dsi.id = psi.dms_import_id
                 WHERE psi.id = ?`,
                [importId]
            ).then(([rows]) => rows),
            PhysicalStockModel.getItems(importId),
        ]);

        if (!headerRows[0]) return null;
        return {
            import: PhysicalStockModel.normalizeImport(headerRows[0]),
            items,
        };
    }

    static async getItems(importId, limit = 1000) {
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 2000);
        const [rows] = await db.execute(
            `SELECT id, import_id, product_erp_id, product_name, product_division, variant_name,
                    pcs_per_box, physical_stock_in_case, physical_stock_in_pcs,
                    total_physical_stock_in_pcs, price_per_piece, mrp, total_value,
                    expired_stock_date
             FROM physical_stock_items
             WHERE import_id = ?
             ORDER BY id ASC
             LIMIT ${numericLimit}`,
            [importId]
        );

        return rows.map((row) => ({
            ...row,
            pcs_per_box: toNumber(row.pcs_per_box),
            physical_stock_in_case: toNumber(row.physical_stock_in_case),
            physical_stock_in_pcs: toNumber(row.physical_stock_in_pcs),
            total_physical_stock_in_pcs: toNumber(row.total_physical_stock_in_pcs),
            price_per_piece: toNumber(row.price_per_piece),
            mrp: toNumber(row.mrp),
            total_value: toNumber(row.total_value),
        }));
    }

    static normalizeImport(row) {
        return {
            ...row,
            total_cases: toNumber(row.total_cases),
            total_loose_pcs: toNumber(row.total_loose_pcs),
            total_pieces: toNumber(row.total_pieces),
            total_value: toNumber(row.total_value),
        };
    }
}

export default PhysicalStockModel;
