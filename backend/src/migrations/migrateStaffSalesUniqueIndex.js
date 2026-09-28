/**
 * Allow multiple invoices per outlet per day.
 * Old: UNIQUE (staff_id, outlet_id, sale_date)
 * New: UNIQUE (staff_id, outlet_id, sale_date, invoice_number)
 *
 * MySQL will not drop unique_sale while FKs use it — add staff_id/outlet_id indexes first.
 */
async function tryStep(connection, sql, label) {
    try {
        await connection.query(sql);
        if (label) {
            console.log(label);
        }
    } catch (err) {
        if (
            err.code === 'ER_DUP_KEYNAME' ||
            err.code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
            err.code === 'ER_DUP_FIELDNAME'
        ) {
            if (label) {
                console.log(`${label} (already applied)`);
            }
            return;
        }
        throw err;
    }
}

export async function migrateStaffSalesUniqueIndex(connection) {
    const [indexes] = await connection.query(
        `SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'staff_sales'
           AND INDEX_NAME = 'unique_sale'
         GROUP BY INDEX_NAME`
    );

    const currentColumns = indexes[0]?.columns;
    if (currentColumns === 'staff_id,outlet_id,sale_date,invoice_number') {
        console.log('staff_sales unique_sale already allows multiple invoices per outlet.');
        return;
    }

    if (!currentColumns) {
        await tryStep(
            connection,
            'ALTER TABLE staff_sales ADD UNIQUE KEY unique_sale (staff_id, outlet_id, sale_date, invoice_number)',
            'Added unique_sale with invoice_number on staff_sales'
        );
        return;
    }

    console.log(`Migrating staff_sales unique_sale (was: ${currentColumns})...`);

    await tryStep(
        connection,
        'CREATE INDEX idx_staff_sales_staff_id ON staff_sales (staff_id)',
        'Added idx_staff_sales_staff_id for foreign keys'
    );
    await tryStep(
        connection,
        'CREATE INDEX idx_staff_sales_outlet_id ON staff_sales (outlet_id)',
        'Added idx_staff_sales_outlet_id for foreign keys'
    );

    await tryStep(
        connection,
        'ALTER TABLE staff_sales DROP INDEX unique_sale',
        'Dropped old unique_sale on staff_sales'
    );
    await tryStep(
        connection,
        'ALTER TABLE staff_sales ADD UNIQUE KEY unique_sale (staff_id, outlet_id, sale_date, invoice_number)',
        'Added unique_sale with invoice_number on staff_sales'
    );

    console.log('staff_sales unique_sale migration completed.');
}
