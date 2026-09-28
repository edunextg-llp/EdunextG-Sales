import db from '../config/db.js';

const selectSql = `SELECT dl.id, dl.company_id, dl.seller_id, dl.staff_id, dl.outlet_id,
    dl.product_source, dl.product_erp_id, dl.product_name, dl.invoice_number, dl.batch_number,
    dl.damage_description, dl.qty, dl.amount, c.name AS company_name, ps.seller_name,
    s.name AS staff_name, sc.outlet_name, sc.outlet_erp_id, sc.location_name,
    DATE_FORMAT(dl.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM outlet_damage_list dl
    INNER JOIN companies c ON c.id = dl.company_id
    INNER JOIN purchase_sellers ps ON ps.id = dl.seller_id
    INNER JOIN staff s ON s.id = dl.staff_id
    INNER JOIN staff_counters sc ON sc.id = dl.outlet_id`;

class DamageListModel {
    static async getAll() {
        const [rows] = await db.execute(`${selectSql} ORDER BY dl.id DESC LIMIT 10000`);
        return rows;
    }
    static async getById(id) {
        const [rows] = await db.execute(`${selectSql} WHERE dl.id = ?`, [id]);
        return rows[0] || null;
    }
    static async create(data) {
        const [result] = await db.execute(
            `INSERT INTO outlet_damage_list
             (company_id, seller_id, staff_id, outlet_id, product_source, product_erp_id,
              product_name, invoice_number, batch_number, damage_description, qty, amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data.companyId, data.sellerId, data.staffId, data.outletId, data.productSource,
                data.productErpId || null, data.productName, data.invoiceNumber, data.batchNumber,
                data.damageDescription, data.qty, data.amount]
        );
        return DamageListModel.getById(result.insertId);
    }
    static async update(id, data) {
        const [result] = await db.execute(
            `UPDATE outlet_damage_list SET company_id=?, seller_id=?, staff_id=?, outlet_id=?,
             product_source=?, product_erp_id=?, product_name=?, invoice_number=?, batch_number=?,
             damage_description=?, qty=?, amount=? WHERE id=?`,
            [data.companyId, data.sellerId, data.staffId, data.outletId, data.productSource,
                data.productErpId || null, data.productName, data.invoiceNumber, data.batchNumber,
                data.damageDescription, data.qty, data.amount, id]
        );
        return result.affectedRows ? DamageListModel.getById(id) : null;
    }
}
export default DamageListModel;
