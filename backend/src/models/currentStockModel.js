import db from '../config/db.js';

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

class CurrentStockModel {
    static async createImport({ dmsImportId, fileName, rowCount, summary, rows }) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const [importResult] = await connection.execute(
                `INSERT INTO current_stock_imports
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
                    row.currentStockInCase,
                    row.currentStockInPcs,
                    row.totalCurrentStockInPcs,
                    row.pricePerPiece,
                    row.mrp,
                    row.totalValue,
                    JSON.stringify(row.rawData),
                ]);

                await connection.query(
                    `INSERT INTO current_stock_items
                     (import_id, product_erp_id, product_name, product_division, variant_name,
                      pcs_per_box, current_stock_in_case, current_stock_in_pcs,
                      total_current_stock_in_pcs, price_per_piece, mrp, total_value, raw_data)
                     VALUES ?`,
                    [values]
                );
            }

            await connection.commit();
            return CurrentStockModel.getImportById(importId);
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
             FROM current_stock_imports
             WHERE dms_import_id = ?
             ORDER BY id DESC
             LIMIT 1`,
            [dmsImportId]
        );

        return rows[0] ? CurrentStockModel.getImportById(rows[0].id) : null;
    }

    static async getImportById(importId) {
        const [headerRows, items] = await Promise.all([
            db.execute(
                `SELECT csi.id, csi.dms_import_id, csi.file_name, csi.row_count,
                        csi.total_cases, csi.total_loose_pcs, csi.total_pieces, csi.total_value,
                        DATE_FORMAT(csi.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                        dsi.file_name AS dms_file_name,
                        DATE_FORMAT(dsi.upload_date, '%Y-%m-%d') AS dms_upload_date
                 FROM current_stock_imports csi
                 JOIN dms_stock_imports dsi ON dsi.id = csi.dms_import_id
                 WHERE csi.id = ?`,
                [importId]
            ).then(([rows]) => rows),
            CurrentStockModel.getItems(importId),
        ]);

        if (!headerRows[0]) return null;
        return {
            import: CurrentStockModel.normalizeImport(headerRows[0]),
            items,
        };
    }

    static async getItems(importId, limit = 1000) {
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 2000);
        const [rows] = await db.execute(
            `SELECT id, import_id, product_erp_id, product_name, product_division, variant_name,
                    pcs_per_box, current_stock_in_case, current_stock_in_pcs,
                    total_current_stock_in_pcs, price_per_piece, mrp, total_value
             FROM current_stock_items
             WHERE import_id = ?
             ORDER BY id ASC
             LIMIT ${numericLimit}`,
            [importId]
        );

        return rows.map((row) => ({
            ...row,
            pcs_per_box: toNumber(row.pcs_per_box),
            current_stock_in_case: toNumber(row.current_stock_in_case),
            current_stock_in_pcs: toNumber(row.current_stock_in_pcs),
            total_current_stock_in_pcs: toNumber(row.total_current_stock_in_pcs),
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

export default CurrentStockModel;
