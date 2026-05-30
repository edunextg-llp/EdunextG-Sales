import db from './src/config/db.js';

async function run() {
  try {
    console.log("Dropping unique_sale index...");
    await db.execute('ALTER TABLE staff_sales DROP INDEX unique_sale;');
    console.log("Dropped.");
    
    console.log("Adding new unique_sale index...");
    await db.execute('ALTER TABLE staff_sales ADD UNIQUE KEY unique_sale (staff_id, outlet_id, sale_date, invoice_number);');
    console.log("Added successfully!");
  } catch (error) {
    if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
       try {
         console.log("Index might missing, trying to add...");
         await db.execute('ALTER TABLE staff_sales ADD UNIQUE KEY unique_sale (staff_id, outlet_id, sale_date, invoice_number);');
         console.log("Added successfully!");
       } catch (err2) {
         console.error("Failed:", err2);
       }
    } else {
       console.error("Error executing query:", error);
    }
  } finally {
    process.exit(0);
  }
}

run();
