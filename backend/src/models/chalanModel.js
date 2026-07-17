import db from '../config/db.js';
import { formatChalanCode } from '../utils/chalanCode.js';

class ChalanModel {
    static mapSaleRow(sale, items = null) {
        const assigneeName =
            sale.assignee_type === 'company_staff'
                ? sale.staff_name || ''
                : sale.delivery_boy_name || '';

        const totalItems = sale.item_count != null ? Number(sale.item_count) : 0;
        const totalPacked =
            sale.packed_item_count != null ? Number(sale.packed_item_count) : totalItems;
        const totalAmount = sale.total_amount != null ? Number(sale.total_amount) : 0;
        const returnedItems = Number(sale.returned_item_count || 0);
        const returnedPacked = Number(sale.returned_packed_item_count || 0);
        const returnedAmount = Number(sale.returned_amount || 0);

        const mapped = {
            id: sale.id,
            chalan_code: sale.chalan_code,
            chalanCode: sale.chalan_code,
            sale_date: sale.sale_date,
            saleDate: sale.sale_date,
            assignee_type: sale.assignee_type,
            assigneeType: sale.assignee_type,
            staff_id: sale.staff_id,
            staffId: sale.staff_id,
            delivery_boy_id: sale.delivery_boy_id,
            deliveryBoyId: sale.delivery_boy_id,
            staff_name: sale.staff_name || '',
            staffName: sale.staff_name || '',
            delivery_boy_name: sale.delivery_boy_name || '',
            deliveryBoyName: sale.delivery_boy_name || '',
            assignee_name: assigneeName,
            assigneeName,
            packaging_status: sale.packaging_status || 'not_packing',
            packed_item_count: sale.packed_item_count,
            box_count: sale.box_count,
            packet_count: sale.packet_count,
            vehicle_no: sale.vehicle_no || '',
            delivery_date: sale.delivery_date || null,
            item_count: sale.item_count != null ? Number(sale.item_count) : null,
            total_amount: sale.total_amount != null ? Number(sale.total_amount) : null,
            returned_item_count: returnedItems,
            returned_packed_item_count: returnedPacked,
            returned_amount: returnedAmount,
            pending_item_count: Math.max(0, totalItems - returnedItems),
            pending_packed_item_count: Math.max(0, totalPacked - returnedPacked),
            pending_amount: Math.max(0, totalAmount - returnedAmount),
            status_updated_at: sale.status_updated_at || null,
            packing_date: sale.packing_date || null,
            created_at: sale.created_at,
            createdAt: sale.created_at,
        };

        if (items) {
            mapped.items = items.map((item) => {
                const qty = Number(item.qty);
                const returnedQty = Number(item.returned_qty || 0);
                const mrp = Number(item.mrp);
                const pendingQty = Math.max(0, qty - returnedQty);
                return {
                    id: item.id,
                    srNo: item.sr_no,
                    itemName: item.item_name,
                    qty,
                    mrp,
                    amount: qty * mrp,
                    returnedQty,
                    pendingQty,
                    pendingAmount: pendingQty * mrp,
                };
            });
        }

        return mapped;
    }

    static mapReturnRow(row, returnItems = null) {
        const assigneeName =
            row.assignee_type === 'company_staff'
                ? row.staff_name || ''
                : row.delivery_boy_name || '';

        const mapped = {
            id: row.id,
            chalan_sale_id: row.chalan_sale_id,
            chalanSaleId: row.chalan_sale_id,
            chalan_code: row.chalan_code,
            chalanCode: row.chalan_code,
            assignee_name: assigneeName,
            assigneeName,
            return_type: row.return_type,
            returnType: row.return_type,
            return_item_count: Number(row.return_item_count),
            returnItemCount: Number(row.return_item_count),
            return_packed_item_count: Number(row.return_packed_item_count),
            returnPackedItemCount: Number(row.return_packed_item_count),
            return_amount: Number(row.return_amount),
            returnAmount: Number(row.return_amount),
            return_date: row.return_date,
            returnDate: row.return_date,
            delivery_boy_name: row.delivery_boy_name || '',
            vehicle_no: row.vehicle_no || '',
            packaging_status: row.packaging_status || null,
            created_at: row.created_at,
            createdAt: row.created_at,
        };

        if (returnItems) {
            mapped.returnItems = returnItems.map((item) => ({
                id: item.id,
                itemId: item.chalan_sale_item_id,
                itemName: item.item_name,
                srNo: item.sr_no,
                returnQty: Number(item.return_qty),
                mrp: Number(item.mrp),
                amount: Number(item.return_qty) * Number(item.mrp),
            }));
        }

        return mapped;
    }

    static async getNextChalanCode(connection) {
        await connection.execute(
            'INSERT IGNORE INTO chalan_sequence (id, seq_value) VALUES (1, 0)'
        );
        await connection.execute(
            'UPDATE chalan_sequence SET seq_value = seq_value + 1 WHERE id = 1'
        );
        const [rows] = await connection.execute(
            'SELECT seq_value FROM chalan_sequence WHERE id = 1'
        );
        if (!rows[0]) {
            throw new Error('Chalan sequence not initialized.');
        }
        return formatChalanCode(rows[0].seq_value);
    }

    static async createSale({
        saleDate,
        assigneeType,
        staffId,
        deliveryBoyId,
        items,
    }) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const chalanCode = await ChalanModel.getNextChalanCode(connection);

            const [result] = await connection.execute(
                `INSERT INTO chalan_sales
                    (chalan_code, sale_date, assignee_type, staff_id, delivery_boy_id, packaging_status)
                 VALUES (?, ?, ?, ?, ?, 'not_packing')`,
                [
                    chalanCode,
                    saleDate,
                    assigneeType,
                    assigneeType === 'company_staff' ? staffId : null,
                    assigneeType === 'delivery_boy' ? deliveryBoyId : null,
                ]
            );

            const chalanSaleId = result.insertId;

            for (let index = 0; index < items.length; index += 1) {
                const item = items[index];
                await connection.execute(
                    `INSERT INTO chalan_sale_items
                        (chalan_sale_id, sr_no, item_name, qty, mrp)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        chalanSaleId,
                        index + 1,
                        item.itemName,
                        item.qty,
                        item.mrp,
                    ]
                );
            }

            await connection.execute(
                `INSERT INTO chalan_sale_status_history (chalan_sale_id, status, changed_at)
                 VALUES (?, 'not_packing', NOW())`,
                [chalanSaleId]
            );

            await connection.commit();
            return ChalanModel.getSaleById(chalanSaleId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getSaleById(id) {
        const [sales] = await db.execute(
            `SELECT
                cs.id,
                cs.chalan_code,
                cs.sale_date,
                cs.assignee_type,
                cs.staff_id,
                cs.delivery_boy_id,
                cs.packaging_status,
                cs.packed_item_count,
                cs.box_count,
                cs.packet_count,
                cs.vehicle_no,
                DATE_FORMAT(cs.delivery_date, '%Y-%m-%d') AS delivery_date,
                COALESCE(cs.returned_item_count, 0) AS returned_item_count,
                COALESCE(cs.returned_packed_item_count, 0) AS returned_packed_item_count,
                COALESCE(cs.returned_amount, 0) AS returned_amount,
                cs.created_at,
                s.name AS staff_name,
                db.name AS delivery_boy_name,
                COALESCE(items.item_count, 0) AS item_count,
                COALESCE(items.total_amount, 0) AS total_amount,
                DATE_FORMAT(status_hist.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at
             FROM chalan_sales cs
             LEFT JOIN staff s ON s.id = cs.staff_id
             LEFT JOIN delivery_boys db ON db.id = cs.delivery_boy_id
             LEFT JOIN (
                 SELECT chalan_sale_id,
                        SUM(qty) AS item_count,
                        SUM(qty * mrp) AS total_amount
                 FROM chalan_sale_items
                 GROUP BY chalan_sale_id
             ) items ON items.chalan_sale_id = cs.id
             LEFT JOIN (
                 SELECT chalan_sale_id, MAX(changed_at) AS status_updated_at
                 FROM chalan_sale_status_history
                 GROUP BY chalan_sale_id
             ) status_hist ON status_hist.chalan_sale_id = cs.id
             WHERE cs.id = ?`,
            [id]
        );

        if (!sales[0]) {
            return null;
        }

        const [items] = await db.execute(
            `SELECT id, sr_no, item_name, qty, mrp, COALESCE(returned_qty, 0) AS returned_qty
             FROM chalan_sale_items
             WHERE chalan_sale_id = ?
             ORDER BY sr_no ASC`,
            [id]
        );

        return ChalanModel.mapSaleRow(sales[0], items);
    }

    static async getSalesByDate(date) {
        const [sales] = await db.execute(
            `SELECT
                cs.id,
                cs.chalan_code,
                cs.sale_date,
                cs.assignee_type,
                cs.staff_id,
                cs.delivery_boy_id,
                cs.packaging_status,
                cs.packed_item_count,
                cs.box_count,
                cs.packet_count,
                cs.vehicle_no,
                DATE_FORMAT(cs.delivery_date, '%Y-%m-%d') AS delivery_date,
                COALESCE(cs.returned_item_count, 0) AS returned_item_count,
                COALESCE(cs.returned_packed_item_count, 0) AS returned_packed_item_count,
                COALESCE(cs.returned_amount, 0) AS returned_amount,
                s.name AS staff_name,
                db.name AS delivery_boy_name,
                COALESCE(items.item_count, 0) AS item_count,
                COALESCE(items.total_amount, 0) AS total_amount
             FROM chalan_sales cs
             LEFT JOIN staff s ON s.id = cs.staff_id
             LEFT JOIN delivery_boys db ON db.id = cs.delivery_boy_id
             LEFT JOIN (
                 SELECT chalan_sale_id,
                        SUM(qty) AS item_count,
                        SUM(qty * mrp) AS total_amount
                 FROM chalan_sale_items
                 GROUP BY chalan_sale_id
             ) items ON items.chalan_sale_id = cs.id
             WHERE cs.sale_date = ?
             ORDER BY cs.id DESC`,
            [date]
        );

        return sales.map((sale) => ChalanModel.mapSaleRow(sale));
    }

    static async getPackagingSales() {
        const [sales] = await db.execute(
            `SELECT
                cs.id,
                cs.chalan_code,
                cs.sale_date,
                cs.assignee_type,
                cs.staff_id,
                cs.delivery_boy_id,
                cs.packaging_status,
                cs.packed_item_count,
                cs.box_count,
                cs.packet_count,
                cs.vehicle_no,
                DATE_FORMAT(cs.delivery_date, '%Y-%m-%d') AS delivery_date,
                COALESCE(cs.returned_item_count, 0) AS returned_item_count,
                COALESCE(cs.returned_packed_item_count, 0) AS returned_packed_item_count,
                COALESCE(cs.returned_amount, 0) AS returned_amount,
                cs.created_at,
                s.name AS staff_name,
                db.name AS delivery_boy_name,
                COALESCE(items.item_count, 0) AS item_count,
                COALESCE(items.total_amount, 0) AS total_amount,
                DATE_FORMAT(status_hist.status_updated_at, '%Y-%m-%d %H:%i:%s') AS status_updated_at,
                DATE_FORMAT(packing_hist.packing_date, '%Y-%m-%d') AS packing_date
             FROM chalan_sales cs
             LEFT JOIN staff s ON s.id = cs.staff_id
             LEFT JOIN delivery_boys db ON db.id = cs.delivery_boy_id
             LEFT JOIN (
                 SELECT chalan_sale_id,
                        SUM(qty) AS item_count,
                        SUM(qty * mrp) AS total_amount
                 FROM chalan_sale_items
                 GROUP BY chalan_sale_id
             ) items ON items.chalan_sale_id = cs.id
             LEFT JOIN (
                 SELECT chalan_sale_id, MAX(changed_at) AS status_updated_at
                 FROM chalan_sale_status_history
                 GROUP BY chalan_sale_id
             ) status_hist ON status_hist.chalan_sale_id = cs.id
             LEFT JOIN (
                 SELECT chalan_sale_id, MAX(changed_at) AS packing_date
                 FROM chalan_sale_status_history
                 WHERE status = 'packing_done'
                 GROUP BY chalan_sale_id
             ) packing_hist ON packing_hist.chalan_sale_id = cs.id
             ORDER BY cs.sale_date DESC, cs.id DESC`
        );

        return sales.map((sale) => ChalanModel.mapSaleRow(sale));
    }

    static async getCancelledSales() {
        const [sales] = await db.execute(
            `SELECT
                cs.id,
                cs.chalan_code,
                cs.sale_date,
                cs.assignee_type,
                cs.staff_id,
                cs.delivery_boy_id,
                cs.packaging_status,
                cs.packed_item_count,
                cs.box_count,
                cs.packet_count,
                cs.vehicle_no,
                DATE_FORMAT(cs.delivery_date, '%Y-%m-%d') AS delivery_date,
                COALESCE(cs.returned_item_count, 0) AS returned_item_count,
                COALESCE(cs.returned_packed_item_count, 0) AS returned_packed_item_count,
                COALESCE(cs.returned_amount, 0) AS returned_amount,
                cs.created_at,
                s.name AS staff_name,
                db.name AS delivery_boy_name,
                COALESCE(items.item_count, 0) AS item_count,
                COALESCE(items.total_amount, 0) AS total_amount,
                DATE_FORMAT(
                    COALESCE(cancel_hist.cancel_date, status_hist.status_updated_at),
                    '%Y-%m-%d %H:%i:%s'
                ) AS status_updated_at,
                DATE_FORMAT(packing_hist.packing_date, '%Y-%m-%d') AS packing_date
             FROM chalan_sales cs
             LEFT JOIN staff s ON s.id = cs.staff_id
             LEFT JOIN delivery_boys db ON db.id = cs.delivery_boy_id
             LEFT JOIN (
                 SELECT chalan_sale_id,
                        SUM(qty) AS item_count,
                        SUM(qty * mrp) AS total_amount
                 FROM chalan_sale_items
                 GROUP BY chalan_sale_id
             ) items ON items.chalan_sale_id = cs.id
             LEFT JOIN (
                 SELECT chalan_sale_id, MAX(changed_at) AS cancel_date
                 FROM chalan_sale_status_history
                 WHERE status = 'cancelled'
                 GROUP BY chalan_sale_id
             ) cancel_hist ON cancel_hist.chalan_sale_id = cs.id
             LEFT JOIN (
                 SELECT chalan_sale_id, MAX(changed_at) AS status_updated_at
                 FROM chalan_sale_status_history
                 GROUP BY chalan_sale_id
             ) status_hist ON status_hist.chalan_sale_id = cs.id
             LEFT JOIN (
                 SELECT chalan_sale_id, MAX(changed_at) AS packing_date
                 FROM chalan_sale_status_history
                 WHERE status = 'packing_done'
                 GROUP BY chalan_sale_id
             ) packing_hist ON packing_hist.chalan_sale_id = cs.id
             WHERE cancel_hist.chalan_sale_id IS NOT NULL OR cs.packaging_status = 'cancelled'
             ORDER BY COALESCE(cancel_hist.cancel_date, status_hist.status_updated_at) DESC, cs.id DESC`
        );

        return sales.map((sale) => ChalanModel.mapSaleRow(sale));
    }

    static async getSaleStatusById(id) {
        const [rows] = await db.execute(
            'SELECT packaging_status FROM chalan_sales WHERE id = ?',
            [id]
        );
        return rows[0] ? rows[0].packaging_status : null;
    }

    static async updatePackagingStatus(
        id,
        status,
        statusDate = null,
        packedItemCount = null,
        boxCount = null,
        packetCount = null,
        deliveryBoyId = null,
        vehicleNo = null,
        deliveryDate = null
    ) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            const [currentRows] = await connection.execute(
                'SELECT packaging_status, assignee_type, delivery_boy_id FROM chalan_sales WHERE id = ? FOR UPDATE',
                [id]
            );
            const current = currentRows[0];
            if (!current) {
                await connection.rollback();
                return null;
            }
            const currentStatus = current.packaging_status;

            if (status === 'cancelled') {
                await connection.execute(
                    `UPDATE chalan_sales
                     SET packaging_status = 'cancelled',
                         vehicle_no = NULL,
                         delivery_date = NULL
                     WHERE id = ?`,
                    [id]
                );
            } else if (status === 'out_for_delivery' || status === 'delivered' || status === 'returned') {
                const nextDeliveryBoyId =
                    deliveryBoyId ||
                    (current.assignee_type === 'delivery_boy' ? current.delivery_boy_id : deliveryBoyId);
                await connection.execute(
                    `UPDATE chalan_sales
                     SET packaging_status = ?,
                         delivery_boy_id = COALESCE(?, delivery_boy_id),
                         vehicle_no = ?,
                         delivery_date = ?
                     WHERE id = ?`,
                    [status, nextDeliveryBoyId, vehicleNo, deliveryDate, id]
                );
            } else {
                await connection.execute(
                    `UPDATE chalan_sales
                     SET packaging_status = ?,
                         vehicle_no = NULL,
                         delivery_date = NULL,
                         packed_item_count = COALESCE(?, packed_item_count),
                         box_count = COALESCE(?, box_count),
                         packet_count = COALESCE(?, packet_count)
                     WHERE id = ?`,
                    [status, packedItemCount, boxCount, packetCount, id]
                );
            }

            if (currentStatus !== status) {
                if (statusDate) {
                    await connection.execute(
                        `INSERT INTO chalan_sale_status_history (chalan_sale_id, status, changed_at)
                         VALUES (?, ?, ?)`,
                        [id, status, `${statusDate} 00:00:00`]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO chalan_sale_status_history (chalan_sale_id, status, changed_at)
                         VALUES (?, ?, NOW())`,
                        [id, status]
                    );
                }
            }

            await connection.commit();
            return ChalanModel.getSaleById(id);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getSaleStatusHistory(id) {
        const sale = await ChalanModel.getSaleById(id);
        if (!sale) {
            return null;
        }

        const [history] = await db.execute(
            `SELECT id, status, DATE_FORMAT(changed_at, '%Y-%m-%d %H:%i:%s') AS changed_at
             FROM chalan_sale_status_history
             WHERE chalan_sale_id = ?
             ORDER BY changed_at ASC, id ASC`,
            [id]
        );

        return { sale, history };
    }

    static async updateSale(id, {
        saleDate,
        assigneeType,
        staffId,
        deliveryBoyId,
        items,
    }) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [existingRows] = await connection.execute(
                'SELECT id FROM chalan_sales WHERE id = ?',
                [id]
            );
            if (!existingRows[0]) {
                await connection.rollback();
                return null;
            }

            await connection.execute(
                `UPDATE chalan_sales
                 SET sale_date = ?, assignee_type = ?, staff_id = ?, delivery_boy_id = ?
                 WHERE id = ?`,
                [
                    saleDate,
                    assigneeType,
                    assigneeType === 'company_staff' ? staffId : null,
                    assigneeType === 'delivery_boy' ? deliveryBoyId : null,
                    id,
                ]
            );

            await connection.execute(
                'DELETE FROM chalan_sale_items WHERE chalan_sale_id = ?',
                [id]
            );

            for (let index = 0; index < items.length; index += 1) {
                const item = items[index];
                await connection.execute(
                    `INSERT INTO chalan_sale_items
                        (chalan_sale_id, sr_no, item_name, qty, mrp)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        id,
                        index + 1,
                        item.itemName,
                        item.qty,
                        item.mrp,
                    ]
                );
            }

            await connection.commit();
            return ChalanModel.getSaleById(id);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async deleteSale(id) {
        const [result] = await db.execute('DELETE FROM chalan_sales WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    static async attachReturnItems(returnRows) {
        if (!returnRows.length) {
            return [];
        }

        const returnIds = returnRows.map((row) => row.id);
        const placeholders = returnIds.map(() => '?').join(', ');
        const [itemRows] = await db.execute(
            `SELECT
                csri.id,
                csri.chalan_sale_return_id,
                csri.chalan_sale_item_id,
                csri.return_qty,
                csi.sr_no,
                csi.item_name,
                csi.mrp
             FROM chalan_sale_return_items csri
             INNER JOIN chalan_sale_items csi ON csi.id = csri.chalan_sale_item_id
             WHERE csri.chalan_sale_return_id IN (${placeholders})
             ORDER BY csi.sr_no ASC`,
            returnIds
        );

        const itemsByReturnId = itemRows.reduce((acc, item) => {
            const key = item.chalan_sale_return_id;
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});

        return returnRows.map((row) =>
            ChalanModel.mapReturnRow(row, itemsByReturnId[row.id] || [])
        );
    }

    static async getReturnRecords() {
        const [rows] = await db.execute(
            `SELECT
                csr.id,
                csr.chalan_sale_id,
                csr.return_type,
                csr.return_item_count,
                csr.return_packed_item_count,
                csr.return_amount,
                DATE_FORMAT(csr.return_date, '%Y-%m-%d') AS return_date,
                csr.created_at,
                cs.chalan_code,
                cs.assignee_type,
                cs.packaging_status,
                cs.vehicle_no,
                s.name AS staff_name,
                db.name AS delivery_boy_name
             FROM chalan_sale_returns csr
             INNER JOIN chalan_sales cs ON cs.id = csr.chalan_sale_id
             LEFT JOIN staff s ON s.id = cs.staff_id
             LEFT JOIN delivery_boys db ON db.id = cs.delivery_boy_id
             ORDER BY csr.created_at DESC, csr.id DESC`
        );

        return ChalanModel.attachReturnItems(rows);
    }

    static async getReturnRecordById(returnId) {
        const [rows] = await db.execute(
            `SELECT
                csr.id,
                csr.chalan_sale_id,
                csr.return_type,
                csr.return_item_count,
                csr.return_packed_item_count,
                csr.return_amount,
                DATE_FORMAT(csr.return_date, '%Y-%m-%d') AS return_date,
                csr.created_at,
                cs.chalan_code,
                cs.assignee_type,
                cs.packaging_status,
                cs.vehicle_no,
                s.name AS staff_name,
                db.name AS delivery_boy_name
             FROM chalan_sale_returns csr
             INNER JOIN chalan_sales cs ON cs.id = csr.chalan_sale_id
             LEFT JOIN staff s ON s.id = cs.staff_id
             LEFT JOIN delivery_boys db ON db.id = cs.delivery_boy_id
             WHERE csr.id = ?`,
            [returnId]
        );

        if (!rows[0]) {
            return null;
        }

        const [mapped] = await ChalanModel.attachReturnItems(rows);
        return mapped || null;
    }

    static async processReturn(
        id,
        {
            returnType,
            returnItems = null,
            returnDate = null,
        }
    ) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [saleRows] = await connection.execute(
                `SELECT id, packaging_status
                 FROM chalan_sales
                 WHERE id = ?
                 FOR UPDATE`,
                [id]
            );

            const sale = saleRows[0];
            if (!sale) {
                await connection.rollback();
                return null;
            }

            if (sale.packaging_status !== 'delivered') {
                await connection.rollback();
                return { error: 'Only delivered chalans can be returned.' };
            }

            const [saleItems] = await connection.execute(
                `SELECT id, sr_no, item_name, qty, mrp, COALESCE(returned_qty, 0) AS returned_qty
                 FROM chalan_sale_items
                 WHERE chalan_sale_id = ?
                 ORDER BY sr_no ASC
                 FOR UPDATE`,
                [id]
            );

            if (!saleItems.length) {
                await connection.rollback();
                return { error: 'No items found for this chalan.' };
            }

            const pendingByItemId = saleItems.reduce((acc, item) => {
                const qty = Number(item.qty);
                const returnedQty = Number(item.returned_qty || 0);
                acc[item.id] = {
                    ...item,
                    qty,
                    returnedQty,
                    pendingQty: Math.max(0, qty - returnedQty),
                    mrp: Number(item.mrp),
                };
                return acc;
            }, {});

            const totalPendingQty = Object.values(pendingByItemId).reduce(
                (sum, item) => sum + item.pendingQty,
                0
            );

            if (totalPendingQty <= 0) {
                await connection.rollback();
                return { error: 'Nothing left to return for this chalan.' };
            }

            const normalizedReturnType = returnType === 'full' ? 'full' : 'partial';
            const returnQtyByItemId = {};

            if (normalizedReturnType === 'full') {
                Object.values(pendingByItemId).forEach((item) => {
                    if (item.pendingQty > 0) {
                        returnQtyByItemId[item.id] = item.pendingQty;
                    }
                });
            } else {
                if (!Array.isArray(returnItems) || returnItems.length === 0) {
                    await connection.rollback();
                    return { error: 'Return items are required for partial return.' };
                }

                for (const entry of returnItems) {
                    const itemId = Number(entry.itemId);
                    const returnQty = Number(entry.returnQty);

                    if (!itemId || !Number.isFinite(returnQty)) {
                        await connection.rollback();
                        return { error: 'Each return item must include itemId and returnQty.' };
                    }

                    if (!pendingByItemId[itemId]) {
                        await connection.rollback();
                        return { error: 'One or more return items do not belong to this chalan.' };
                    }

                    if (returnQty < 0) {
                        await connection.rollback();
                        return { error: 'Return quantity cannot be negative.' };
                    }

                    if (returnQty > pendingByItemId[itemId].pendingQty) {
                        await connection.rollback();
                        return {
                            error: `Return quantity for "${pendingByItemId[itemId].item_name}" cannot exceed pending quantity.`,
                        };
                    }

                    returnQtyByItemId[itemId] = (returnQtyByItemId[itemId] || 0) + returnQty;
                }
            }

            const entriesToReturn = Object.entries(returnQtyByItemId).filter(
                ([, qty]) => Number(qty) > 0
            );

            if (!entriesToReturn.length) {
                await connection.rollback();
                return { error: 'At least one item return quantity must be greater than zero.' };
            }

            let nextReturnItems = 0;
            let nextReturnAmount = 0;

            for (const [itemId, returnQty] of entriesToReturn) {
                const item = pendingByItemId[itemId];
                const qtyValue = Number(returnQty);
                nextReturnItems += qtyValue;
                nextReturnAmount += qtyValue * item.mrp;

                await connection.execute(
                    `UPDATE chalan_sale_items
                     SET returned_qty = returned_qty + ?
                     WHERE id = ?`,
                    [qtyValue, itemId]
                );
            }

            const normalizedReturnDate = returnDate || new Date().toISOString().split('T')[0];

            const [insertResult] = await connection.execute(
                `INSERT INTO chalan_sale_returns
                    (chalan_sale_id, return_type, return_item_count, return_packed_item_count, return_amount, return_date)
                 VALUES (?, ?, ?, 0, ?, ?)`,
                [id, normalizedReturnType, nextReturnItems, nextReturnAmount, normalizedReturnDate]
            );

            for (const [itemId, returnQty] of entriesToReturn) {
                await connection.execute(
                    `INSERT INTO chalan_sale_return_items
                        (chalan_sale_return_id, chalan_sale_item_id, return_qty)
                     VALUES (?, ?, ?)`,
                    [insertResult.insertId, itemId, Number(returnQty)]
                );
            }

            const [updatedItemTotals] = await connection.execute(
                `SELECT
                    COALESCE(SUM(returned_qty), 0) AS returned_item_count,
                    COALESCE(SUM(returned_qty * mrp), 0) AS returned_amount,
                    COALESCE(SUM(qty), 0) AS total_qty
                 FROM chalan_sale_items
                 WHERE chalan_sale_id = ?`,
                [id]
            );

            const updatedReturnedItems = Number(updatedItemTotals[0]?.returned_item_count || 0);
            const updatedReturnedAmount = Number(updatedItemTotals[0]?.returned_amount || 0);
            const totalQty = Number(updatedItemTotals[0]?.total_qty || 0);
            const isFullyReturned = updatedReturnedItems >= totalQty && totalQty > 0;

            await connection.execute(
                `UPDATE chalan_sales
                 SET returned_item_count = ?,
                     returned_packed_item_count = 0,
                     returned_amount = ?,
                     packaging_status = ?
                 WHERE id = ?`,
                [
                    updatedReturnedItems,
                    updatedReturnedAmount,
                    isFullyReturned ? 'returned' : 'delivered',
                    id,
                ]
            );

            await connection.execute(
                `INSERT INTO chalan_sale_status_history (chalan_sale_id, status, changed_at)
                 VALUES (?, ?, ?)`,
                [
                    id,
                    isFullyReturned ? 'returned' : 'partial_returned',
                    `${normalizedReturnDate} 00:00:00`,
                ]
            );

            await connection.commit();

            const updatedSale = await ChalanModel.getSaleById(id);
            const returnRecord = await ChalanModel.getReturnRecordById(insertResult.insertId);
            return {
                sale: updatedSale,
                returnRecord,
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async revertReturn(id) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [saleRows] = await connection.execute(
                'SELECT packaging_status FROM chalan_sales WHERE id = ? FOR UPDATE',
                [id]
            );
            const sale = saleRows[0];
            if (!sale) {
                await connection.rollback();
                return null;
            }

            if (sale.packaging_status !== 'returned') {
                await connection.rollback();
                return { error: 'Only fully returned chalans can be reverted from return.' };
            }

            await connection.execute('DELETE FROM chalan_sale_returns WHERE chalan_sale_id = ?', [id]);
            await connection.execute(
                `UPDATE chalan_sale_items
                 SET returned_qty = 0
                 WHERE chalan_sale_id = ?`,
                [id]
            );
            await connection.execute(
                `UPDATE chalan_sales
                 SET packaging_status = 'delivered',
                     returned_item_count = 0,
                     returned_packed_item_count = 0,
                     returned_amount = 0
                 WHERE id = ?`,
                [id]
            );
            await connection.execute(
                `INSERT INTO chalan_sale_status_history (chalan_sale_id, status, changed_at)
                 VALUES (?, 'delivered', NOW())`,
                [id]
            );

            await connection.commit();
            return ChalanModel.getSaleById(id);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

export default ChalanModel;
