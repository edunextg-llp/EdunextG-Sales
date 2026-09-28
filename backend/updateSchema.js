import db from './src/config/db.js';
import { migrateStaffSalesUniqueIndex } from './src/migrations/migrateStaffSalesUniqueIndex.js';
import { migrateDeliveryOutletLocation } from './src/migrations/migrateDeliveryOutletLocation.js';

async function run() {
    try {
        await migrateStaffSalesUniqueIndex(db);
        await migrateDeliveryOutletLocation(db);
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exitCode = 1;
    } finally {
        process.exit();
    }
}

run();
