import db from './src/config/db.js';

/**
 * Migrates staff_sales so multiple invoices per outlet per day are allowed.
 * Old constraint: (staff_id, outlet_id, sale_date) — only one sale per outlet/day.
 * New constraint: (staff_id, outlet_id, sale_date, invoice_number).
 */
async function run() {
  try {
    console.log('Dropping old unique_sale index...');
    try {
      await db.execute('ALTER TABLE staff_sales DROP INDEX unique_sale');
      console.log('Dropped.');
    } catch (error) {
      if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
        console.log('Index already dropped or missing.');
      } else {
        throw error;
      }
    }

    console.log('Adding unique_sale index with invoice_number...');
    await db.execute(
      'ALTER TABLE staff_sales ADD UNIQUE KEY unique_sale (staff_id, outlet_id, sale_date, invoice_number)'
    );
    console.log('Migration completed successfully.');
  } catch (error) {
    if (error.code === 'ER_DUP_KEYNAME') {
      console.log('New unique_sale index already exists — nothing to do.');
    } else {
      console.error('Migration failed:', error);
      process.exitCode = 1;
    }
  } finally {
    process.exit();
  }
}

run();
