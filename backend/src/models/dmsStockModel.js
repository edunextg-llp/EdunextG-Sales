import db from '../config/db.js';

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

class DmsStockModel {
    static async getImports() {
        const [rows] = await db.execute(
            `SELECT id, file_name, row_count,
                    DATE_FORMAT(upload_date, '%Y-%m-%d') AS upload_date,
                    total_stock_cases, total_stock_pcs, total_pieces, total_value,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM dms_stock_imports
             ORDER BY upload_date DESC, id DESC`
        );

        return rows.map(DmsStockModel.normalizeImport);
    }

    static async createImport({ fileName, uploadDate, rowCount, summary, rows }) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [importResult] = await connection.execute(
                `INSERT INTO dms_stock_imports
                 (file_name, upload_date, row_count, total_purchase_units, total_purchase_value,
                  total_invoiced_units, total_invoiced_value, total_closing_units,
                  total_closing_value, total_in_transit_units, total_in_transit_value,
                  total_stock_cases, total_stock_pcs, total_pieces, total_value)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    fileName,
                    uploadDate,
                    rowCount,
                    summary.totalPurchaseUnits,
                    summary.totalPurchaseValue,
                    summary.totalInvoicedUnits,
                    summary.totalInvoicedValue,
                    summary.totalClosingUnits,
                    summary.totalClosingValue,
                    summary.totalInTransitUnits,
                    summary.totalInTransitValue,
                    summary.totalStockCases,
                    summary.totalStockPcs,
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
                    row.totalPurchasesInStockUnit,
                    row.purchasesInStockValue,
                    row.dpPerUnitStock,
                    row.totalInvoicedStockUnit,
                    row.invoicedStockValue,
                    row.totalClosingStockUnit,
                    row.closingStockValue,
                    row.totalInTransitStockQuantityUnit,
                    row.inTransitStockValue,
                    row.totalPieces,
                    row.totalValue,
                    row.purchasePrice,
                    JSON.stringify(row.rawData),
                ]);

                await connection.query(
                    `INSERT INTO dms_stock_items
                     (import_id, product_erp_id, product_name, product_division, variant_name,
                      pcs_per_box, current_stock_in_case, current_stock_in_pcs,
                      total_current_stock_in_pcs, price_per_piece, mrp,
                      total_purchases_in_stock_unit, purchases_in_stock_value, dp_per_unit_stock,
                      total_invoiced_stock_unit, invoiced_stock_value, total_closing_stock_unit,
                      closing_stock_value, total_in_transit_stock_quantity_unit, in_transit_stock_value,
                      total_pieces, total_value, purchase_price, raw_data)
                     VALUES ?`,
                    [values]
                );
            }

            await connection.commit();
            return DmsStockModel.getImportById(importId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getImportByUploadDate(uploadDate) {
        if (!uploadDate) return null;

        const [rows] = await db.execute(
            `SELECT id, file_name, row_count,
                    DATE_FORMAT(upload_date, '%Y-%m-%d') AS upload_date,
                    total_purchase_units, total_purchase_value,
                    total_invoiced_units, total_invoiced_value,
                    total_closing_units, total_closing_value,
                    total_in_transit_units, total_in_transit_value,
                    total_stock_cases, total_stock_pcs, total_pieces, total_value,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM dms_stock_imports
             WHERE upload_date = ?
             ORDER BY id DESC
             LIMIT 1`,
            [uploadDate]
        );
        return rows[0] || null;
    }

    static async getLatestImport() {
        const [rows] = await db.execute(
            `SELECT id, file_name, row_count,
                    DATE_FORMAT(upload_date, '%Y-%m-%d') AS upload_date,
                    total_purchase_units, total_purchase_value,
                    total_invoiced_units, total_invoiced_value,
                    total_closing_units, total_closing_value,
                    total_in_transit_units, total_in_transit_value,
                    total_stock_cases, total_stock_pcs, total_pieces, total_value,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM dms_stock_imports
             ORDER BY id DESC
             LIMIT 1`
        );
        return rows[0] || null;
    }

    static async getImportById(importId) {
        const [headerRows, itemRows] = await Promise.all([
            db.execute(
                `SELECT id, file_name, row_count,
                        DATE_FORMAT(upload_date, '%Y-%m-%d') AS upload_date,
                        total_purchase_units, total_purchase_value,
                        total_invoiced_units, total_invoiced_value,
                        total_closing_units, total_closing_value,
                        total_in_transit_units, total_in_transit_value,
                        total_stock_cases, total_stock_pcs, total_pieces, total_value,
                        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
                 FROM dms_stock_imports
                 WHERE id = ?`,
                [importId]
            ).then(([rows]) => rows),
            DmsStockModel.getItems(importId, 200),
        ]);

        if (!headerRows[0]) {
            return null;
        }

        return {
            import: DmsStockModel.normalizeImport(headerRows[0]),
            items: itemRows,
        };
    }

    static async getItems(importId, limit = 200) {
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
        const [rows] = await db.execute(
            `SELECT dsi.id, dsi.import_id, dsi.product_erp_id, dsi.product_name, dsi.product_division, dsi.variant_name,
                    dsi.pcs_per_box, dsi.current_stock_in_case, dsi.current_stock_in_pcs,
                    dsi.total_current_stock_in_pcs, dsi.price_per_piece, dsi.mrp,
                    dsi.total_purchases_in_stock_unit, dsi.purchases_in_stock_value, dsi.dp_per_unit_stock,
                    dsi.total_invoiced_stock_unit, dsi.invoiced_stock_value, dsi.total_closing_stock_unit,
                    dsi.closing_stock_value, dsi.total_in_transit_stock_quantity_unit, dsi.in_transit_stock_value,
                    dsi.total_pieces, dsi.total_value, dsi.purchase_price, dsi.raw_data,
                    DATE_FORMAT(dsi_import.upload_date, '%Y-%m-%d') AS upload_date
             FROM dms_stock_items dsi
             INNER JOIN dms_stock_imports dsi_import ON dsi.import_id = dsi_import.id
             WHERE dsi.import_id = ?
             ORDER BY dsi.id ASC
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
            total_purchases_in_stock_unit: toNumber(row.total_purchases_in_stock_unit),
            purchases_in_stock_value: toNumber(row.purchases_in_stock_value),
            dp_per_unit_stock: toNumber(row.dp_per_unit_stock),
            total_invoiced_stock_unit: toNumber(row.total_invoiced_stock_unit),
            invoiced_stock_value: toNumber(row.invoiced_stock_value),
            total_closing_stock_unit: toNumber(row.total_closing_stock_unit),
            closing_stock_value: toNumber(row.closing_stock_value),
            total_in_transit_stock_quantity_unit: toNumber(row.total_in_transit_stock_quantity_unit),
            in_transit_stock_value: toNumber(row.in_transit_stock_value),
            total_pieces: toNumber(row.total_pieces),
            total_value: toNumber(row.total_value),
            purchase_price: row.purchase_price === null ? null : toNumber(row.purchase_price),
        }));
    }

    static normalizeImport(row) {
        return {
            ...row,
            total_purchase_units: toNumber(row.total_purchase_units),
            total_purchase_value: toNumber(row.total_purchase_value),
            total_invoiced_units: toNumber(row.total_invoiced_units),
            total_invoiced_value: toNumber(row.total_invoiced_value),
            total_closing_units: toNumber(row.total_closing_units),
            total_closing_value: toNumber(row.total_closing_value),
            total_in_transit_units: toNumber(row.total_in_transit_units),
            total_in_transit_value: toNumber(row.total_in_transit_value),
            total_stock_cases: toNumber(row.total_stock_cases),
            total_stock_pcs: toNumber(row.total_stock_pcs),
            total_pieces: toNumber(row.total_pieces),
            total_value: toNumber(row.total_value),
        };
    }
}

export default DmsStockModel;
