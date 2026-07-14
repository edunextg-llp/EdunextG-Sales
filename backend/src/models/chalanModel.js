import db from '../config/db.js';
import { formatChalanCode } from '../utils/chalanCode.js';

class ChalanModel {
    static mapSaleRow(sale, items = null) {
        const assigneeName =
            sale.assignee_type === 'company_staff'
                ? sale.staff_name || ''
                : sale.delivery_boy_name || '';

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
            status_updated_at: sale.status_updated_at || null,
            packing_date: sale.packing_date || null,
            created_at: sale.created_at,
            createdAt: sale.created_at,
        };

        if (items) {
            mapped.items = items.map((item) => ({
                id: item.id,
                srNo: item.sr_no,
                itemName: item.item_name,
                qty: Number(item.qty),
                mrp: Number(item.mrp),
                amount: Number(item.qty) * Number(item.mrp),
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
            `SELECT id, sr_no, item_name, qty, mrp
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
}

export default ChalanModel;
