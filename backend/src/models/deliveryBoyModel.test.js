import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../config/db.js';
import DeliveryBoyModel from './deliveryBoyModel.js';
import { migrateDeliveryOutletLocation } from '../migrations/migrateDeliveryOutletLocation.js';

test('mobile maps use fresh captures without falling back to legacy links', async (t) => {
    t.mock.method(db, 'execute', async (sql) => {
        assert.match(sql, /sc.delivery_google_location AS google_location/);
        assert.doesNotMatch(sql, /\bsc\.google_location\b/);
        return [[{ id: 25, google_location: null }]];
    });
    const rows = await DeliveryBoyModel.getAssignedSales(7);
    assert.equal(rows[0].google_location, null);
});

test('fresh capture atomically replaces legacy map but cannot overwrite another fresh capture', async (t) => {
    const location = 'https://www.google.com/maps/search/?api=1&query=22.5726,88.3639';
    let affectedRows = 1;
    t.mock.method(db, 'execute', async (sql, params) => {
        assert.match(sql, /SET sc.google_location = \?, sc.delivery_google_location = \?/);
        const where = sql.split('WHERE')[1];
        assert.match(where, /ss.id = \?/);
        assert.match(where, /ss.delivery_boy_id = \?/);
        assert.match(where, /ss.packaging_status = 'out_for_delivery'/);
        assert.match(where, /AND \(sc.delivery_google_location IS NULL OR TRIM\(sc.delivery_google_location\) = ''\)/);
        assert.doesNotMatch(where, /\bsc\.google_location\b/);
        assert.deepEqual(params, [location, location, 25, 7]);
        return [{ affectedRows }];
    });
    assert.deepEqual(await DeliveryBoyModel.updateAssignedSaleLocation(7, 25, location), {
        id: 25, google_location: location,
    });
    affectedRows = 0;
    assert.equal(await DeliveryBoyModel.updateAssignedSaleLocation(7, 25, location), null);
});

test('location migration starts empty and never resets existing captures on restart', async () => {
    const queries = [];
    await migrateDeliveryOutletLocation({ async query(sql) { queries.push(sql); } });
    assert.deepEqual(queries, ['ALTER TABLE staff_counters ADD COLUMN delivery_google_location TEXT NULL']);
    await migrateDeliveryOutletLocation({ async query() {
        throw Object.assign(new Error('Already exists'), { code: 'ER_DUP_FIELDNAME' });
    } });
    await assert.rejects(migrateDeliveryOutletLocation({ async query() {
        throw Object.assign(new Error('Denied'), { code: 'ER_TABLEACCESS_DENIED_ERROR' });
    } }), /Denied/);
});

test('mobile cancellation retains the assignee and date needed by cancelled history', async (t) => {
    const statements = [];
    let committed = false;
    let released = false;
    const connection = {
        async beginTransaction() {},
        async commit() { committed = true; },
        async rollback() {},
        release() { released = true; },
        async execute(sql, params) {
            statements.push({ sql, params });
            if (sql.includes('SELECT id, packaging_status')) {
                assert.deepEqual(params, [25, 7]);
                return [[{ id: 25, packaging_status: 'out_for_delivery' }]];
            }
            if (sql.includes('SELECT item_count')) return [[{ item_count: 10 }]];
            return [{ affectedRows: 1 }];
        },
    };
    t.mock.method(db, 'getConnection', async () => connection);

    const result = await DeliveryBoyModel.updateAssignedSaleStatus(7, 25, 'cancelled', 'Outlet is closed');
    const update = statements.find(({ sql }) => sql.includes('UPDATE staff_sales'));
    const setClause = update.sql.split('SET')[1].split('WHERE')[0];
    assert.doesNotMatch(setClause, /delivery_boy_id\s*=/i);
    assert.doesNotMatch(setClause, /delivery_date\s*=/i);
    assert.match(setClause, /packaging_status = 'cancelled'/);
    assert.deepEqual(update.params, ['Outlet is closed', 10, 25, 7]);
    assert.ok(statements.some(({ sql }) => sql.includes("VALUES (?, 'cancelled', NOW())")));
    assert.equal(result.delivery_cancelled, true);
    assert.equal(committed, true);
    assert.equal(released, true);
});

test('cancelled history scopes by delivery person and original delivery date and includes reason', async (t) => {
    const rows = [{ id: 25, packaging_status: 'cancelled', cancellation_reason: 'Outlet is closed' }];
    t.mock.method(db, 'execute', async (sql, params) => {
        assert.match(sql, /WHERE ss.delivery_boy_id = \?/);
        assert.match(sql, /AND ss.packaging_status = \?/);
        assert.match(sql, /AND ss.delivery_date = \?/);
        assert.match(sql, /ss.cancellation_reason/);
        assert.deepEqual(params, [7, 'cancelled', '2026-09-25']);
        return [rows];
    });
    assert.deepEqual(await DeliveryBoyModel.getAssignedSales(7, {
        status: 'cancelled', date: '2026-09-25',
    }), rows);
});

test('cancelling an already submitted delivery is locked without modifying the order', async (t) => {
    let rolledBack = false;
    const execute = t.mock.fn(async () => [[{ id: 25, packaging_status: 'cancelled' }]]);
    t.mock.method(db, 'getConnection', async () => ({
        async beginTransaction() {},
        async rollback() { rolledBack = true; },
        release() {},
        execute,
    }));
    const result = await DeliveryBoyModel.updateAssignedSaleStatus(7, 25, 'cancelled', 'Closed');
    assert.equal(result.locked, true);
    assert.equal(rolledBack, true);
    assert.equal(execute.mock.callCount(), 1);
});
