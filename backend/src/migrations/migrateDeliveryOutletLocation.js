// Existing map links are intentionally not copied: each outlet needs a fresh
// capture by a delivery person after this feature is deployed.
export async function migrateDeliveryOutletLocation(connection) {
    try {
        await connection.query(
            'ALTER TABLE staff_counters ADD COLUMN delivery_google_location TEXT NULL'
        );
    } catch (error) {
        if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
}
