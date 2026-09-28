import db from './src/config/db.js';

const [sales] = await db.execute(
  `SELECT id, invoice_number, packaging_status, cancellation_reason, delivery_boy_id, vehicle_no, delivery_date
   FROM staff_sales
   WHERE invoice_number = ?`,
  ['160783142380']
);
const saleIds = sales.map((sale) => sale.id);
const [history] = saleIds.length
  ? await db.execute(
    `SELECT id, sale_id, status, changed_at
     FROM staff_sale_status_history
     WHERE sale_id IN (${saleIds.map(() => '?').join(', ')})
     ORDER BY id DESC
     LIMIT 10`,
    saleIds
  )
  : [[]];
console.log(JSON.stringify({ sales, history }, null, 2));
