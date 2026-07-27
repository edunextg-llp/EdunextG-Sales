import db from '../config/db.js';
import DmsStockModel from './dmsStockModel.js';

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const roundQuantity = (value) => Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parseRawData = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const splitTotalPieces = (totalPcs, pcsPerBox) => {
    const total = Math.max(0, roundQuantity(totalPcs));
    const perBox = toNumber(pcsPerBox);
    if (perBox <= 0) {
        return { cases: 0, loose: total, total };
    }
    const cases = Math.floor(total / perBox);
    const loose = roundQuantity(total - (cases * perBox));
    return { cases, loose, total };
};

class PhysicalStockModel {
    static buildHistoryPayload(row) {
        return {
            productErpId: String(row.productErpId || row.product_erp_id || '').trim(),
            productName: row.productName || row.product_name || '',
            productDivision: row.productDivision || row.product_division || '',
            variantName: row.variantName || row.variant_name || '',
            pcsPerBox: toNumber(row.pcsPerBox ?? row.pcs_per_box),
            physicalStockInCase: toNumber(row.physicalStockInCase ?? row.physical_stock_in_case),
            physicalStockInPcs: toNumber(row.physicalStockInPcs ?? row.physical_stock_in_pcs),
            totalPhysicalStockInPcs: toNumber(row.totalPhysicalStockInPcs ?? row.total_physical_stock_in_pcs),
            pricePerPiece: toNumber(row.pricePerPiece ?? row.price_per_piece),
            mrp: toNumber(row.mrp),
            totalValue: toNumber(row.totalValue ?? row.total_value),
            expiredStockDate: row.expiredStockDate || row.expired_stock_date || null,
        };
    }

    static resolveSourceLabel(sourceType, sourceLabel) {
        if (sourceLabel) return sourceLabel;
        if (sourceType === 'sale') return 'Sales Deduction';
        if (sourceType === 'upload') return 'File Upload';
        return 'Manual Entry';
    }

    static async logItemHistory(connection, {
        dmsImportId,
        importId = null,
        itemId = null,
        row,
        sourceType = 'manual',
        sourceLabel = '',
        changeType = 'update',
    }) {
        const payload = PhysicalStockModel.buildHistoryPayload(row);
        if (!payload.productErpId || !dmsImportId) return;

        const resolvedSourceLabel = PhysicalStockModel.resolveSourceLabel(sourceType, sourceLabel);

        await connection.execute(
            `INSERT INTO physical_stock_item_history
             (dms_import_id, import_id, item_id, product_erp_id, product_name,
              product_division, variant_name, pcs_per_box, physical_stock_in_case, physical_stock_in_pcs,
              total_physical_stock_in_pcs, price_per_piece, mrp, total_value, expired_stock_date,
              source_type, source_label, change_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                dmsImportId,
                importId,
                itemId,
                payload.productErpId,
                payload.productName,
                payload.productDivision,
                payload.variantName,
                payload.pcsPerBox,
                payload.physicalStockInCase,
                payload.physicalStockInPcs,
                payload.totalPhysicalStockInPcs,
                payload.pricePerPiece,
                payload.mrp,
                payload.totalValue,
                payload.expiredStockDate,
                sourceType,
                resolvedSourceLabel,
                changeType,
            ]
        );
    }

    static normalizeHistoryRow(row) {
        return {
            ...row,
            pcs_per_box: toNumber(row.pcs_per_box),
            physical_stock_in_case: toNumber(row.physical_stock_in_case),
            physical_stock_in_pcs: toNumber(row.physical_stock_in_pcs),
            total_physical_stock_in_pcs: toNumber(row.total_physical_stock_in_pcs),
            price_per_piece: toNumber(row.price_per_piece),
            mrp: toNumber(row.mrp),
            total_value: toNumber(row.total_value),
        };
    }

    static async getItemHistory(dmsImportId, productErpId) {
        const importId = parseInt(dmsImportId, 10);
        const erpId = String(productErpId || '').trim();
        if (!Number.isFinite(importId) || importId <= 0 || !erpId) {
            return [];
        }

        const [historyRows] = await db.execute(
            `SELECT id, dms_import_id, import_id, item_id,
                    product_erp_id, product_name, product_division, variant_name,
                    COALESCE(pcs_per_box, 0) AS pcs_per_box,
                    physical_stock_in_case, physical_stock_in_pcs, total_physical_stock_in_pcs,
                    price_per_piece, mrp, total_value, expired_stock_date,
                    source_type, source_label,
                    change_type,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE(created_at) AS update_date
             FROM physical_stock_item_history
             WHERE dms_import_id = ? AND LOWER(TRIM(product_erp_id)) = LOWER(?)
             ORDER BY created_at DESC, id DESC`,
            [importId, erpId]
        );

        if (historyRows.length) {
            return historyRows.map((row) => PhysicalStockModel.normalizeHistoryRow(row));
        }

        const [legacyRows] = await db.execute(
            `SELECT psi.id AS item_id, p.id AS import_id, p.dms_import_id, psi.product_erp_id, psi.product_name,
                    psi.product_division, psi.variant_name, psi.pcs_per_box, psi.physical_stock_in_case,
                    psi.physical_stock_in_pcs, psi.total_physical_stock_in_pcs, psi.price_per_piece, psi.mrp,
                    psi.total_value, psi.expired_stock_date,
                    CASE WHEN p.file_name = 'Manual Entry' THEN 'manual' ELSE 'upload' END AS source_type,
                    p.file_name AS source_label,
                    'create' AS change_type,
                    DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                    DATE(p.created_at) AS update_date
             FROM physical_stock_items psi
             INNER JOIN physical_stock_imports p ON p.id = psi.import_id
             WHERE p.dms_import_id = ? AND LOWER(TRIM(psi.product_erp_id)) = LOWER(?)
             ORDER BY p.created_at DESC, psi.id DESC`,
            [importId, erpId]
        );

        return legacyRows.map((row) => PhysicalStockModel.normalizeHistoryRow(row));
    }

    static async getManualImportByDmsImportId(dmsImportId) {
        const importId = parseInt(dmsImportId, 10);
        if (!Number.isFinite(importId) || importId <= 0) {
            return null;
        }

        const [rows] = await db.execute(
            `SELECT id, dms_import_id, file_name, row_count,
                    total_cases, total_loose_pcs, total_pieces, total_value,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM physical_stock_imports
             WHERE dms_import_id = ? AND file_name = 'Manual Entry'
             ORDER BY id DESC
             LIMIT 1`,
            [importId]
        );
        return rows[0] || null;
    }

    static async recalculateImportTotals(connection, importId) {
        const [countRows] = await connection.execute(
            `SELECT
                COUNT(*) AS row_count,
                COALESCE(SUM(physical_stock_in_case), 0) AS total_cases,
                COALESCE(SUM(physical_stock_in_pcs), 0) AS total_loose_pcs,
                COALESCE(SUM(total_physical_stock_in_pcs), 0) AS total_pieces,
                COALESCE(SUM(total_value), 0) AS total_value
             FROM physical_stock_items
             WHERE import_id = ?`,
            [importId]
        );

        const totals = countRows[0] || {};

        await connection.execute(
            `UPDATE physical_stock_imports
             SET row_count = ?,
                 total_cases = ?,
                 total_loose_pcs = ?,
                 total_pieces = ?,
                 total_value = ?
             WHERE id = ?`,
            [
                totals.row_count || 0,
                totals.total_cases || 0,
                totals.total_loose_pcs || 0,
                totals.total_pieces || 0,
                totals.total_value || 0,
                importId,
            ]
        );
    }

    static async upsertItemsToImport(importId, rows) {
        if (!rows.length) {
            return PhysicalStockModel.getImportById(importId);
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [importRows] = await connection.execute(
                'SELECT dms_import_id, file_name FROM physical_stock_imports WHERE id = ? LIMIT 1',
                [importId]
            );
            const dmsImportId = importRows[0]?.dms_import_id;
            const sourceLabel = importRows[0]?.file_name || 'Manual Entry';
            const sourceType = sourceLabel === 'Manual Entry' ? 'manual' : 'upload';

            for (const row of rows) {
                const [existingRows] = await connection.execute(
                    `SELECT id
                     FROM physical_stock_items
                     WHERE import_id = ? AND LOWER(TRIM(product_erp_id)) = LOWER(?)
                     LIMIT 1`,
                    [importId, String(row.productErpId || '').trim()]
                );
                const existing = existingRows[0];

                if (existing) {
                    await connection.execute(
                        `UPDATE physical_stock_items
                         SET product_erp_id = ?,
                             product_name = ?,
                             product_division = ?,
                             variant_name = ?,
                             pcs_per_box = ?,
                             physical_stock_in_case = ?,
                             physical_stock_in_pcs = ?,
                             total_physical_stock_in_pcs = ?,
                             price_per_piece = ?,
                             mrp = ?,
                             total_value = ?,
                             expired_stock_date = ?,
                             raw_data = ?
                         WHERE id = ?`,
                        [
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
                            JSON.stringify(row.rawData || {}),
                            existing.id,
                        ]
                    );
                    await PhysicalStockModel.logItemHistory(connection, {
                        dmsImportId,
                        importId,
                        itemId: existing.id,
                        row,
                        sourceType,
                        sourceLabel,
                        changeType: 'update',
                    });
                } else {
                    const [insertResult] = await connection.execute(
                        `INSERT INTO physical_stock_items
                         (import_id, product_erp_id, product_name, product_division, variant_name,
                          pcs_per_box, physical_stock_in_case, physical_stock_in_pcs,
                          total_physical_stock_in_pcs, price_per_piece, mrp, total_value,
                          expired_stock_date, raw_data)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
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
                            JSON.stringify(row.rawData || {}),
                        ]
                    );
                    await PhysicalStockModel.logItemHistory(connection, {
                        dmsImportId,
                        importId,
                        itemId: insertResult.insertId,
                        row,
                        sourceType,
                        sourceLabel,
                        changeType: 'create',
                    });
                }
            }

            await PhysicalStockModel.recalculateImportTotals(connection, importId);
            await connection.commit();
            return PhysicalStockModel.getImportById(importId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

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

                for (const row of rows) {
                    await PhysicalStockModel.logItemHistory(connection, {
                        dmsImportId,
                        importId,
                        row,
                        sourceType: fileName === 'Manual Entry' ? 'manual' : 'upload',
                        sourceLabel: fileName,
                        changeType: 'create',
                    });
                }
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

    static async getImportsByDmsImportId(dmsImportId) {
        const [rows] = await db.execute(
            `SELECT id, dms_import_id, file_name, row_count,
                    total_cases, total_loose_pcs, total_pieces, total_value,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
             FROM physical_stock_imports
             WHERE dms_import_id = ?
             ORDER BY id DESC`,
            [dmsImportId]
        );

        return rows.map((row) => PhysicalStockModel.normalizeImport(row));
    }

    static async getMergedItemsByDmsImportId(dmsImportId, limit = 2000) {
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 2000, 1), 2000);
        const [rows] = await db.execute(
            `SELECT psi.id, psi.import_id, psi.product_erp_id, psi.product_name, psi.product_division,
                    psi.variant_name, psi.pcs_per_box, psi.physical_stock_in_case, psi.physical_stock_in_pcs,
                    psi.total_physical_stock_in_pcs, psi.price_per_piece, psi.mrp, psi.total_value,
                    psi.expired_stock_date, psi.raw_data
             FROM physical_stock_items psi
             INNER JOIN physical_stock_imports p ON p.id = psi.import_id
             INNER JOIN (
                 SELECT LOWER(TRIM(psi2.product_erp_id)) AS erp_key, MAX(psi2.id) AS max_item_id
                 FROM physical_stock_items psi2
                 INNER JOIN physical_stock_imports p2 ON p2.id = psi2.import_id
                 WHERE p2.dms_import_id = ?
                 GROUP BY LOWER(TRIM(psi2.product_erp_id))
             ) latest ON psi.id = latest.max_item_id
             WHERE p.dms_import_id = ?
             ORDER BY psi.product_erp_id ASC, psi.id ASC
             LIMIT ${numericLimit}`,
            [dmsImportId, dmsImportId]
        );

        return rows.map((row) => {
            const rawData = parseRawData(row.raw_data);
            return {
                ...row,
                approved_as_current_stock: rawData.approvedAsCurrentStock === true,
                pcs_per_box: toNumber(row.pcs_per_box),
                physical_stock_in_case: toNumber(row.physical_stock_in_case),
                physical_stock_in_pcs: toNumber(row.physical_stock_in_pcs),
                total_physical_stock_in_pcs: toNumber(row.total_physical_stock_in_pcs),
                price_per_piece: toNumber(row.price_per_piece),
                mrp: toNumber(row.mrp),
                total_value: toNumber(row.total_value),
            };
        });
    }

    static async approveAllAsCurrentStock(dmsImportId) {
        const [result] = await db.execute(
            `UPDATE physical_stock_items psi
             INNER JOIN (
                 SELECT MAX(psi2.id) AS item_id
                 FROM physical_stock_items psi2
                 INNER JOIN physical_stock_imports p2 ON p2.id = psi2.import_id
                 WHERE p2.dms_import_id = ?
                 GROUP BY LOWER(TRIM(psi2.product_erp_id))
             ) latest ON latest.item_id = psi.id
             SET psi.raw_data = JSON_SET(COALESCE(psi.raw_data, JSON_OBJECT()), '$.approvedAsCurrentStock', TRUE)`,
            [dmsImportId]
        );
        return result.affectedRows;
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

    static async deductStockForCompany(connection, companyName, lineItems = []) {
        const name = String(companyName || '').trim();
        if (!name || !Array.isArray(lineItems) || !lineItems.length) {
            return;
        }

        const dmsImport = await DmsStockModel.getLatestImportByCompanyName(name);
        if (!dmsImport?.id) {
            throw new Error(`No DMS stock upload found for company "${name}".`);
        }

        const dmsImportId = dmsImport.id;
        const [physicalItems, dmsItems] = await Promise.all([
            PhysicalStockModel.getMergedItemsByDmsImportId(dmsImportId, 2000),
            DmsStockModel.getItems(dmsImportId, 2000),
        ]);

        if (!physicalItems.length) {
            throw new Error('Physical stock is not available for this company.');
        }

        const dmsByErp = new Map(
            dmsItems.map((item) => [
                String(item.product_erp_id || '').trim().toLowerCase(),
                toNumber(item.total_current_stock_in_pcs),
            ])
        );

        const physicalByErp = new Map(
            physicalItems.map((item) => [
                String(item.product_erp_id || '').trim().toLowerCase(),
                item,
            ])
        );

        const deductions = new Map();
        for (const line of lineItems) {
            const erpId = String(line.productErpId || line.product_erp_id || '').trim();
            if (!erpId || erpId === '__existing_sale__') continue;
            const qty = toNumber(line.qty);
            if (qty <= 0) continue;
            const key = erpId.toLowerCase();
            deductions.set(key, roundQuantity((deductions.get(key) || 0) + qty));
        }

        if (!deductions.size) {
            return;
        }

        const touchedImportIds = new Set();

        for (const [erpKey, qty] of deductions.entries()) {
            const physicalItem = physicalByErp.get(erpKey);
            if (!physicalItem) {
                throw new Error(`Product "${erpKey}" is not available in current stock.`);
            }

            const dmsPieces = dmsByErp.get(erpKey) || 0;
            const currentPieces = roundQuantity(
                toNumber(physicalItem.total_physical_stock_in_pcs) - dmsPieces
            );
            if (currentPieces < qty) {
                throw new Error(
                    `Insufficient stock for ${physicalItem.product_erp_id}. Available: ${currentPieces}, requested: ${qty}.`
                );
            }

            const newPhysicalTotal = roundQuantity(
                toNumber(physicalItem.total_physical_stock_in_pcs) - qty
            );
            const split = splitTotalPieces(newPhysicalTotal, physicalItem.pcs_per_box);
            const pricePerPiece = toNumber(physicalItem.price_per_piece);
            const totalValue = roundMoney(split.total * pricePerPiece);

            await connection.execute(
                `UPDATE physical_stock_items
                 SET physical_stock_in_case = ?,
                     physical_stock_in_pcs = ?,
                     total_physical_stock_in_pcs = ?,
                     total_value = ?
                 WHERE id = ?`,
                [split.cases, split.loose, split.total, totalValue, physicalItem.id]
            );

            await PhysicalStockModel.logItemHistory(connection, {
                dmsImportId,
                importId: physicalItem.import_id,
                itemId: physicalItem.id,
                row: {
                    ...physicalItem,
                    physical_stock_in_case: split.cases,
                    physical_stock_in_pcs: split.loose,
                    total_physical_stock_in_pcs: split.total,
                    total_value: totalValue,
                },
                sourceType: 'sale',
                sourceLabel: 'Sales Deduction',
                changeType: 'deduct',
            });

            touchedImportIds.add(physicalItem.import_id);
        }

        for (const importId of touchedImportIds) {
            await PhysicalStockModel.recalculateImportTotals(connection, importId);
        }
    }
}

export default PhysicalStockModel;
