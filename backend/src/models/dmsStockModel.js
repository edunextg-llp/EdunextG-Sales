import db from '../config/db.js';

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

class DmsStockModel {
    static async getImports() {
        const [rows] = await db.execute(
            `SELECT i.id, i.entry_code, i.invoice_number, i.file_name, i.company_id, c.name AS company_name,
                    i.seller_id, ps.seller_name, i.row_count,
                    COALESCE(item_totals.total_cgst, 0) AS total_cgst,
                    COALESCE(item_totals.total_sgst, 0) AS total_sgst,
                    COALESCE(item_totals.discounted_amount, 0) AS discounted_amount,
                    DATE_FORMAT(i.upload_date, '%Y-%m-%d') AS upload_date,
                    i.total_stock_cases, i.total_stock_pcs, i.total_pieces, i.total_value,
                    DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM dms_stock_imports i
             LEFT JOIN companies c ON i.company_id = c.id
             LEFT JOIN purchase_sellers ps ON i.seller_id = ps.id
             LEFT JOIN (
                 SELECT import_id, SUM(cgst_amount) AS total_cgst, SUM(sgst_amount) AS total_sgst,
                        SUM((dp_price * total_pieces) * (1 - discount_percent / 100)) AS discounted_amount
                 FROM dms_stock_items
                 GROUP BY import_id
             ) item_totals ON item_totals.import_id = i.id
             ORDER BY i.upload_date DESC, i.id DESC`
        );

        return rows.map(DmsStockModel.normalizeImport);
    }

    static async getManualImportByCompanyAndDate(companyId, sellerId, uploadDate, invoiceNumber) {
        if (!companyId || !sellerId || !uploadDate || !invoiceNumber) return null;

        const [rows] = await db.execute(
            `SELECT i.id, i.entry_code, i.invoice_number, i.file_name, i.company_id, c.name AS company_name, i.row_count,
                    DATE_FORMAT(i.upload_date, '%Y-%m-%d') AS upload_date,
                    i.total_stock_cases, i.total_stock_pcs, i.total_pieces, i.total_value,
                    DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM dms_stock_imports i
             LEFT JOIN companies c ON i.company_id = c.id
             WHERE i.company_id = ? AND i.seller_id = ? AND i.upload_date = ? AND i.file_name = 'Manual Entry'
               AND LOWER(TRIM(i.invoice_number)) = LOWER(?)
             ORDER BY i.id DESC
             LIMIT 1`,
            [companyId, sellerId, uploadDate, invoiceNumber]
        );
        return rows[0] || null;
    }

    static async getItemByErpIdInImport(importId, productErpId) {
        const erpId = String(productErpId || '').trim();
        if (!importId || !erpId) {
            return null;
        }

        const [rows] = await db.execute(
            `SELECT id, product_erp_id
             FROM dms_stock_items
             WHERE import_id = ? AND LOWER(TRIM(product_erp_id)) = LOWER(?)
             LIMIT 1`,
            [importId, erpId]
        );
        return rows[0] || null;
    }

    static async recalculateImportTotals(connection, importId) {
        const [countRows] = await connection.execute(
            `SELECT
                COUNT(*) AS row_count,
                COALESCE(SUM(current_stock_in_case), 0) AS total_stock_cases,
                COALESCE(SUM(current_stock_in_pcs), 0) AS total_stock_pcs,
                COALESCE(SUM(total_pieces), 0) AS total_pieces,
                COALESCE(SUM(total_value), 0) AS total_value,
                COALESCE(SUM(total_purchases_in_stock_unit), 0) AS total_purchase_units,
                COALESCE(SUM(purchases_in_stock_value), 0) AS total_purchase_value,
                COALESCE(SUM(total_invoiced_stock_unit), 0) AS total_invoiced_units,
                COALESCE(SUM(invoiced_stock_value), 0) AS total_invoiced_value,
                COALESCE(SUM(total_closing_stock_unit), 0) AS total_closing_units,
                COALESCE(SUM(closing_stock_value), 0) AS total_closing_value,
                COALESCE(SUM(total_in_transit_stock_quantity_unit), 0) AS total_in_transit_units,
                COALESCE(SUM(in_transit_stock_value), 0) AS total_in_transit_value
             FROM dms_stock_items
             WHERE import_id = ?`,
            [importId]
        );

        const totals = countRows[0] || {};

        await connection.execute(
            `UPDATE dms_stock_imports
             SET row_count = ?,
                 total_stock_cases = ?,
                 total_stock_pcs = ?,
                 total_pieces = ?,
                 total_value = ?,
                 total_purchase_units = ?,
                 total_purchase_value = ?,
                 total_invoiced_units = ?,
                 total_invoiced_value = ?,
                 total_closing_units = ?,
                 total_closing_value = ?,
                 total_in_transit_units = ?,
                 total_in_transit_value = ?
             WHERE id = ?`,
            [
                totals.row_count || 0,
                totals.total_stock_cases || 0,
                totals.total_stock_pcs || 0,
                totals.total_pieces || 0,
                totals.total_value || 0,
                totals.total_purchase_units || 0,
                totals.total_purchase_value || 0,
                totals.total_invoiced_units || 0,
                totals.total_invoiced_value || 0,
                totals.total_closing_units || 0,
                totals.total_closing_value || 0,
                totals.total_in_transit_units || 0,
                totals.total_in_transit_value || 0,
                importId,
            ]
        );
    }

    static normalizeProductItem(row) {
        if (!row) {
            return null;
        }

        return {
            id: row.id,
            product_erp_id: row.product_erp_id || '',
            product_name: row.product_name || '',
            variant_name: row.variant_name || '',
            pcs_per_box: toNumber(row.pcs_per_box),
            current_stock_in_case: toNumber(row.current_stock_in_case),
            current_stock_in_pcs: toNumber(row.current_stock_in_pcs),
            total_current_stock_in_pcs: toNumber(row.total_current_stock_in_pcs),
            price_per_piece: toNumber(row.price_per_piece),
            mrp: toNumber(row.mrp),
            total_value: toNumber(row.total_value),
            invoice_number: row.invoice_number || '',
            seller_name: row.seller_name || '',
            batch_number: row.batch_number || '',
            mfg_date: row.mfg_date || null,
            expiry_date: row.expiry_date || null,
            dp_price: toNumber(row.dp_price),
            discount_percent: toNumber(row.discount_percent),
            gst_percent: toNumber(row.gst_percent),
            cgst_amount: toNumber(row.cgst_amount),
            sgst_amount: toNumber(row.sgst_amount),
            retail_price: toNumber(row.retail_price),
            wholesale_price: toNumber(row.wholesale_price),
            retail_margin: toNumber(row.retail_margin),
            wholesale_margin: toNumber(row.wholesale_margin),
        };
    }

    static async searchProductsByErpId(companyId, search = '', limit = 20) {
        const company = parseInt(companyId, 10);
        if (!Number.isFinite(company) || company <= 0) {
            return [];
        }

        const term = String(search || '').trim();
        const likeTerm = `%${term}%`;
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

        const [rows] = await db.execute(
            `SELECT dsi.id, dsi.product_erp_id, dsi.product_name, dsi.variant_name,
                    dsi.pcs_per_box, dsi.current_stock_in_case, dsi.current_stock_in_pcs,
                    dsi.total_current_stock_in_pcs, dsi.price_per_piece, dsi.mrp, dsi.total_value
             FROM dms_stock_items dsi
             INNER JOIN dms_stock_imports i ON i.id = dsi.import_id
             INNER JOIN (
                 SELECT dsi2.product_erp_id, MAX(dsi2.id) AS latest_item_id
                 FROM dms_stock_items dsi2
                 INNER JOIN dms_stock_imports i2 ON i2.id = dsi2.import_id
                 WHERE i2.company_id = ?
                   AND dsi2.product_erp_id IS NOT NULL
                   AND TRIM(dsi2.product_erp_id) <> ''
                 GROUP BY dsi2.product_erp_id
             ) latest ON latest.latest_item_id = dsi.id
             WHERE i.company_id = ?
               AND (dsi.product_erp_id LIKE ? OR dsi.product_name LIKE ?)
             ORDER BY dsi.product_erp_id ASC
             LIMIT ${numericLimit}`,
            [company, company, likeTerm, likeTerm]
        );

        return rows.map(DmsStockModel.normalizeProductItem);
    }

    static async getLatestProductByErpId(companyId, productErpId) {
        const company = parseInt(companyId, 10);
        const erpId = String(productErpId || '').trim();
        if (!Number.isFinite(company) || company <= 0 || !erpId) {
            return null;
        }

        const [rows] = await db.execute(
            `SELECT dsi.id, dsi.product_erp_id, dsi.product_name, dsi.variant_name,
                    dsi.pcs_per_box, dsi.current_stock_in_case, dsi.current_stock_in_pcs,
                    dsi.total_current_stock_in_pcs, dsi.price_per_piece, dsi.mrp, dsi.total_value
             FROM dms_stock_items dsi
             INNER JOIN dms_stock_imports i ON i.id = dsi.import_id
             WHERE i.company_id = ?
               AND LOWER(TRIM(dsi.product_erp_id)) = LOWER(?)
             ORDER BY dsi.id DESC
             LIMIT 1`,
            [company, erpId]
        );

        return DmsStockModel.normalizeProductItem(rows[0]);
    }

    static async getLatestItemsByCompanyId(companyId, limit = 2000) {
        const company = parseInt(companyId, 10);
        if (!Number.isFinite(company) || company <= 0) return [];

        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 2000, 1), 2000);
        const [rows] = await db.execute(
            `SELECT dsi.id, dsi.import_id, dsi.product_erp_id, dsi.product_name,
                    dsi.product_division, dsi.variant_name, dsi.pcs_per_box,
                    dsi.current_stock_in_case, dsi.current_stock_in_pcs,
                    dsi.total_current_stock_in_pcs, dsi.price_per_piece, dsi.mrp,
                    dsi.total_value, dsi.dp_price, dsi.retail_price,
                    dsi.wholesale_price, si.hsn_code
             FROM dms_stock_items dsi
             INNER JOIN dms_stock_imports i ON i.id = dsi.import_id
             INNER JOIN (
                 SELECT LOWER(TRIM(dsi2.product_erp_id)) AS erp_key,
                        MAX(dsi2.id) AS latest_item_id
                 FROM dms_stock_items dsi2
                 INNER JOIN dms_stock_imports i2 ON i2.id = dsi2.import_id
                 WHERE i2.company_id = ?
                   AND dsi2.product_erp_id IS NOT NULL
                   AND TRIM(dsi2.product_erp_id) <> ''
                 GROUP BY LOWER(TRIM(dsi2.product_erp_id))
             ) latest ON latest.latest_item_id = dsi.id
             LEFT JOIN seller_items si
                ON si.company_id = i.company_id
               AND LOWER(TRIM(si.product_erp_id)) = LOWER(TRIM(dsi.product_erp_id))
             WHERE i.company_id = ?
             ORDER BY dsi.product_erp_id ASC
             LIMIT ${numericLimit}`,
            [company, company]
        );

        return rows.map((row) => ({
            ...DmsStockModel.normalizeProductItem(row),
            product_division: row.product_division || '',
            hsn_code: row.hsn_code || '',
        }));
    }

    static async getProductsByImportId(importId, search = '', limit = 500) {
        const dmsImportId = parseInt(importId, 10);
        if (!Number.isFinite(dmsImportId) || dmsImportId <= 0) {
            return [];
        }

        const term = String(search || '').trim();
        const likeTerm = `%${term}%`;
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 1000);
        const params = [dmsImportId];
        let searchClause = '';

        if (term) {
            searchClause = ' AND (dsi.product_erp_id LIKE ? OR dsi.product_name LIKE ?)';
            params.push(likeTerm, likeTerm);
        }

        const [rows] = await db.execute(
            `SELECT dsi.id, dsi.product_erp_id, dsi.product_name, dsi.product_division, dsi.variant_name,
                    dsi.pcs_per_box, dsi.current_stock_in_case, dsi.current_stock_in_pcs,
                    dsi.total_current_stock_in_pcs, dsi.price_per_piece, dsi.mrp, dsi.total_value,
                    dsi.batch_number, DATE_FORMAT(dsi.mfg_date, '%Y-%m-%d') AS mfg_date,
                    DATE_FORMAT(dsi.expiry_date, '%Y-%m-%d') AS expiry_date,
                    dsi.dp_price, dsi.discount_percent, dsi.gst_percent, dsi.cgst_amount, dsi.sgst_amount,
                    dsi.retail_price, dsi.wholesale_price, dsi.retail_margin, dsi.wholesale_margin,
                    imp.invoice_number, ps.seller_name
             FROM dms_stock_items dsi
             INNER JOIN dms_stock_imports imp ON imp.id = dsi.import_id
             LEFT JOIN purchase_sellers ps ON ps.id = imp.seller_id
             WHERE dsi.import_id = ?${searchClause}
             ORDER BY dsi.product_erp_id ASC
             LIMIT ${numericLimit}`,
            params
        );

        return rows.map((row) => ({
            ...DmsStockModel.normalizeProductItem(row),
            product_division: row.product_division || '',
        }));
    }

    static async getProductByErpIdInImport(importId, productErpId) {
        const dmsImportId = parseInt(importId, 10);
        const erpId = String(productErpId || '').trim();
        if (!Number.isFinite(dmsImportId) || dmsImportId <= 0 || !erpId) {
            return null;
        }

        const [rows] = await db.execute(
            `SELECT dsi.id, dsi.product_erp_id, dsi.product_name, dsi.product_division, dsi.variant_name,
                    dsi.pcs_per_box, dsi.current_stock_in_case, dsi.current_stock_in_pcs,
                    dsi.total_current_stock_in_pcs, dsi.price_per_piece, dsi.mrp, dsi.total_value,
                    dsi.batch_number, DATE_FORMAT(dsi.mfg_date, '%Y-%m-%d') AS mfg_date,
                    DATE_FORMAT(dsi.expiry_date, '%Y-%m-%d') AS expiry_date,
                    dsi.dp_price, dsi.discount_percent, dsi.gst_percent, dsi.cgst_amount, dsi.sgst_amount,
                    dsi.retail_price, dsi.wholesale_price, dsi.retail_margin, dsi.wholesale_margin,
                    imp.invoice_number, ps.seller_name
             FROM dms_stock_items dsi
             INNER JOIN dms_stock_imports imp ON imp.id = dsi.import_id
             LEFT JOIN purchase_sellers ps ON ps.id = imp.seller_id
             WHERE dsi.import_id = ? AND LOWER(TRIM(dsi.product_erp_id)) = LOWER(?)
             LIMIT 1`,
            [dmsImportId, erpId]
        );

        if (!rows[0]) {
            return null;
        }

        return {
            ...DmsStockModel.normalizeProductItem(rows[0]),
            product_division: rows[0].product_division || '',
        };
    }

    static async upsertItemsToImport(importId, rows) {
        if (!rows.length) {
            return DmsStockModel.getImportById(importId);
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            for (const row of rows) {
                const [existingRows] = await connection.execute(
                    `SELECT id
                     FROM dms_stock_items
                     WHERE import_id = ? AND LOWER(TRIM(product_erp_id)) = LOWER(?)
                     LIMIT 1`,
                    [importId, String(row.productErpId || '').trim()]
                );
                const existing = existingRows[0];

                if (existing) {
                    await connection.execute(
                        `UPDATE dms_stock_items
                         SET product_erp_id = ?,
                             product_name = ?,
                             product_division = ?,
                             variant_name = ?,
                             pcs_per_box = ?,
                             current_stock_in_case = ?,
                             current_stock_in_pcs = ?,
                             total_current_stock_in_pcs = ?,
                             price_per_piece = ?,
                             mrp = ?,
                             total_purchases_in_stock_unit = ?,
                             purchases_in_stock_value = ?,
                             dp_per_unit_stock = ?,
                             total_invoiced_stock_unit = ?,
                             invoiced_stock_value = ?,
                             total_closing_stock_unit = ?,
                             closing_stock_value = ?,
                             total_in_transit_stock_quantity_unit = ?,
                             in_transit_stock_value = ?,
                             total_pieces = ?,
                             total_value = ?,
                             purchase_price = ?,
                             batch_number = ?,
                             mfg_date = ?,
                             expiry_date = ?,
                             dp_price = ?,
                             discount_percent = ?,
                             gst_percent = ?,
                             cgst_amount = ?,
                             sgst_amount = ?,
                             retail_price = ?,
                             wholesale_price = ?,
                             retail_margin = ?,
                             wholesale_margin = ?,
                             raw_data = ?
                         WHERE id = ?`,
                        [
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
                            row.batchNumber || null,
                            row.mfgDate || null,
                            row.expiryDate || null,
                            row.dpPrice,
                            row.discountPercent,
                            row.gstPercent,
                            row.cgstAmount,
                            row.sgstAmount,
                            row.retailPrice,
                            row.wholesalePrice,
                            row.retailMargin,
                            row.wholesaleMargin,
                            JSON.stringify(row.rawData),
                            existing.id,
                        ]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO dms_stock_items
                         (import_id, product_erp_id, product_name, product_division, variant_name,
                          pcs_per_box, current_stock_in_case, current_stock_in_pcs,
                          total_current_stock_in_pcs, price_per_piece, mrp,
                          total_purchases_in_stock_unit, purchases_in_stock_value, dp_per_unit_stock,
                          total_invoiced_stock_unit, invoiced_stock_value, total_closing_stock_unit,
                          closing_stock_value, total_in_transit_stock_quantity_unit, in_transit_stock_value,
                          total_pieces, total_value, purchase_price, batch_number, mfg_date, expiry_date,
                          dp_price, discount_percent, gst_percent, cgst_amount, sgst_amount,
                          retail_price, wholesale_price, retail_margin, wholesale_margin, raw_data)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
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
                            row.batchNumber,
                            row.mfgDate,
                            row.expiryDate,
                            row.dpPrice,
                            row.discountPercent,
                            row.gstPercent,
                            row.cgstAmount,
                            row.sgstAmount,
                            row.retailPrice,
                            row.wholesalePrice,
                            row.retailMargin,
                            row.wholesaleMargin,
                            JSON.stringify(row.rawData),
                        ]
                    );
                }
            }

            await DmsStockModel.recalculateImportTotals(connection, importId);

            await connection.commit();
            return DmsStockModel.getImportById(importId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async appendItemsToImport(importId, rows) {
        return DmsStockModel.upsertItemsToImport(importId, rows);
    }

    static async getItemById(itemId) {
        const [rows] = await db.execute(
            `SELECT dsi.*, DATE_FORMAT(dsi.mfg_date, '%Y-%m-%d') AS mfg_date,
                    DATE_FORMAT(dsi.expiry_date, '%Y-%m-%d') AS expiry_date
             FROM dms_stock_items dsi
             WHERE dsi.id = ?
             LIMIT 1`,
            [itemId]
        );
        return rows[0] || null;
    }

    static async updateInvoiceItem(itemId, row) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [result] = await connection.execute(
                `UPDATE dms_stock_items
                 SET batch_number = ?, mfg_date = ?, expiry_date = ?,
                     current_stock_in_case = ?, current_stock_in_pcs = ?,
                     total_current_stock_in_pcs = ?, total_pieces = ?,
                     mrp = ?, price_per_piece = ?, purchase_price = ?, dp_per_unit_stock = ?,
                     dp_price = ?, discount_percent = ?, gst_percent = ?,
                     cgst_amount = ?, sgst_amount = ?, total_value = ?,
                     retail_price = ?, wholesale_price = ?,
                     retail_margin = ?, wholesale_margin = ?
                 WHERE id = ?`,
                [
                    row.batchNumber || null, row.mfgDate || null, row.expiryDate || null,
                    row.currentStockInCase, row.currentStockInPcs,
                    row.totalPieces, row.totalPieces,
                    row.mrp, row.dpPrice, row.dpPrice, row.dpPrice,
                    row.dpPrice, row.discountPercent, 5,
                    row.cgstAmount, row.sgstAmount, row.totalValue,
                    row.retailPrice, row.wholesalePrice,
                    row.retailMargin, row.wholesaleMargin,
                    itemId,
                ]
            );
            if (!result.affectedRows) return null;
            const existing = await DmsStockModel.getItemById(itemId);
            await DmsStockModel.recalculateImportTotals(connection, existing.import_id);
            await connection.commit();
            return DmsStockModel.getImportById(existing.import_id);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async deleteInvoiceItem(itemId) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                'SELECT import_id FROM dms_stock_items WHERE id = ? FOR UPDATE',
                [itemId]
            );
            if (!rows[0]) return null;
            const importId = rows[0].import_id;
            await connection.execute('DELETE FROM dms_stock_items WHERE id = ?', [itemId]);
            await DmsStockModel.recalculateImportTotals(connection, importId);
            await connection.commit();
            return DmsStockModel.getImportById(importId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async createImport({
        fileName, companyId, sellerId = null, invoiceNumber = null, uploadDate, rowCount, summary, rows,
    }) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [companyRows] = await connection.execute('SELECT name FROM companies WHERE id = ? FOR UPDATE', [companyId]);
            const prefix = String(companyRows[0]?.name || 'COM')
                .replace(/[^A-Za-z0-9]/g, '')
                .slice(0, 3)
                .toUpperCase()
                .padEnd(3, 'X');
            const codePrefix = `BFS${prefix}`;
            const [sequenceRows] = await connection.execute(
                `SELECT COALESCE(MAX(CAST(RIGHT(entry_code, 6) AS UNSIGNED)), 0) + 1 AS next_number
                 FROM dms_stock_imports
                 WHERE entry_code LIKE ?
                 FOR UPDATE`,
                [`${codePrefix}%`]
            );
            const entryCode = `${codePrefix}${String(sequenceRows[0]?.next_number || 1).padStart(6, '0')}`;

            const [importResult] = await connection.execute(
                `INSERT INTO dms_stock_imports
                 (entry_code, invoice_number, file_name, company_id, seller_id, upload_date, row_count, total_purchase_units, total_purchase_value,
                  total_invoiced_units, total_invoiced_value, total_closing_units,
                  total_closing_value, total_in_transit_units, total_in_transit_value,
                  total_stock_cases, total_stock_pcs, total_pieces, total_value)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    entryCode,
                    invoiceNumber,
                    fileName,
                    companyId,
                    sellerId,
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
                    row.batchNumber || null,
                    row.mfgDate || null,
                    row.expiryDate || null,
                    row.dpPrice || 0,
                    row.discountPercent || 0,
                    row.gstPercent ?? 5,
                    row.cgstAmount || 0,
                    row.sgstAmount || 0,
                    row.retailPrice || 0,
                    row.wholesalePrice || 0,
                    row.retailMargin || 0,
                    row.wholesaleMargin || 0,
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
                      total_pieces, total_value, purchase_price, batch_number, mfg_date, expiry_date,
                      dp_price, discount_percent, gst_percent, cgst_amount, sgst_amount,
                      retail_price, wholesale_price, retail_margin, wholesale_margin, raw_data)
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
            `SELECT i.id, i.file_name, i.company_id, c.name AS company_name, i.row_count,
                    DATE_FORMAT(i.upload_date, '%Y-%m-%d') AS upload_date,
                    i.total_purchase_units, i.total_purchase_value,
                    i.total_invoiced_units, i.total_invoiced_value,
                    i.total_closing_units, i.total_closing_value,
                    i.total_in_transit_units, i.total_in_transit_value,
                    i.total_stock_cases, i.total_stock_pcs, i.total_pieces, i.total_value,
                    DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM dms_stock_imports i
             LEFT JOIN companies c ON i.company_id = c.id
             WHERE i.upload_date = ?
             ORDER BY i.id DESC
             LIMIT 1`,
            [uploadDate]
        );
        return rows[0] || null;
    }

    static async getLatestImport() {
        const [rows] = await db.execute(
            `SELECT i.id, i.file_name, i.company_id, c.name AS company_name, i.row_count,
                    DATE_FORMAT(i.upload_date, '%Y-%m-%d') AS upload_date,
                    i.total_purchase_units, i.total_purchase_value,
                    i.total_invoiced_units, i.total_invoiced_value,
                    i.total_closing_units, i.total_closing_value,
                    i.total_in_transit_units, i.total_in_transit_value,
                    i.total_stock_cases, i.total_stock_pcs, i.total_pieces, i.total_value,
                    DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM dms_stock_imports i
             LEFT JOIN companies c ON i.company_id = c.id
             ORDER BY i.id DESC
             LIMIT 1`
        );
        return rows[0] || null;
    }

    static async getLatestImportByCompanyName(companyName) {
        const name = String(companyName || '').trim();
        if (!name) {
            return null;
        }

        const [rows] = await db.execute(
            `SELECT i.id, i.file_name, i.company_id, c.name AS company_name, i.row_count,
                    DATE_FORMAT(i.upload_date, '%Y-%m-%d') AS upload_date,
                    i.total_purchase_units, i.total_purchase_value,
                    i.total_invoiced_units, i.total_invoiced_value,
                    i.total_closing_units, i.total_closing_value,
                    i.total_in_transit_units, i.total_in_transit_value,
                    i.total_stock_cases, i.total_stock_pcs, i.total_pieces, i.total_value,
                    DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM dms_stock_imports i
             LEFT JOIN companies c ON i.company_id = c.id
             WHERE LOWER(TRIM(c.name)) = LOWER(?)
             ORDER BY i.id DESC
             LIMIT 1`,
            [name]
        );

        return rows[0] || null;
    }

    static async getImportById(importId) {
        const [headerRows, itemRows] = await Promise.all([
            db.execute(
                `SELECT i.id, i.entry_code, i.invoice_number, i.file_name, i.company_id, c.name AS company_name,
                        i.seller_id, ps.seller_name, i.row_count,
                        DATE_FORMAT(i.upload_date, '%Y-%m-%d') AS upload_date,
                        i.total_purchase_units, i.total_purchase_value,
                        i.total_invoiced_units, i.total_invoiced_value,
                        i.total_closing_units, i.total_closing_value,
                        i.total_in_transit_units, i.total_in_transit_value,
                        i.total_stock_cases, i.total_stock_pcs, i.total_pieces, i.total_value,
                        DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
                 FROM dms_stock_imports i
                 LEFT JOIN companies c ON i.company_id = c.id
                 LEFT JOIN purchase_sellers ps ON i.seller_id = ps.id
                 WHERE i.id = ?`,
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
                    dsi.total_pieces, dsi.total_value, dsi.purchase_price,
                    dsi.batch_number, DATE_FORMAT(dsi.mfg_date, '%Y-%m-%d') AS mfg_date,
                    dsi.dp_price, dsi.discount_percent, dsi.gst_percent,
                    dsi.cgst_amount, dsi.sgst_amount, dsi.retail_price, dsi.wholesale_price,
                    dsi.retail_margin, dsi.wholesale_margin,
                    si.hsn_code,
                    ROUND(dsi.purchase_price * 0.05, 2) AS purchase_gst_amount,
                    ROUND(dsi.purchase_price * 1.05, 2) AS actual_price,
                    DATE_FORMAT(dsi.expiry_date, '%Y-%m-%d') AS expiry_date,
                    dsi.raw_data,
                    DATE_FORMAT(dsi_import.upload_date, '%Y-%m-%d') AS upload_date,
                    c.name AS company_name
             FROM dms_stock_items dsi
             INNER JOIN dms_stock_imports dsi_import ON dsi.import_id = dsi_import.id
             LEFT JOIN companies c ON dsi_import.company_id = c.id
             LEFT JOIN seller_items si ON si.seller_id = dsi_import.seller_id
                  AND LOWER(TRIM(si.product_erp_id)) = LOWER(TRIM(dsi.product_erp_id))
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
            dp_price: toNumber(row.dp_price),
            discount_percent: toNumber(row.discount_percent),
            gst_percent: toNumber(row.gst_percent),
            cgst_amount: toNumber(row.cgst_amount),
            sgst_amount: toNumber(row.sgst_amount),
            retail_price: toNumber(row.retail_price),
            wholesale_price: toNumber(row.wholesale_price),
            retail_margin: toNumber(row.retail_margin),
            wholesale_margin: toNumber(row.wholesale_margin),
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
