import db from './src/config/db.js';

async function run() {
  try {
    const [rows] = await db.execute('SHOW CREATE TABLE staff_sales;');
    console.log(rows[0]['Create Table']);
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
}

run();
