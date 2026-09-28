import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../config/db.js';
import StaffModel from './staffModel.js';

test('only delivered bills without payments or collections move to pending delivery', async (t) => {
    const writes = [];
    let committed = false;
    let released = false;
    t.mock.method(db, 'getConnection', async () => ({
        async beginTransaction() {}, async commit() { committed = true; }, async rollback() {}, release() { released = true; },
        async execute(sql, params) {
            if (sql.includes('ORDER BY id FOR UPDATE')) return [[
                { id: 1, packaging_status: 'delivered', paid_amount: 0 },
                { id: 2, packaging_status: 'delivered', paid_amount: 0 },
                { id: 3, packaging_status: 'delivered', paid_amount: 0 },
                { id: 4, packaging_status: 'returned', paid_amount: 0 },
                { id: 5, packaging_status: 'delivered', paid_amount: 20 },
            ]];
            if (sql.includes('FROM sale_payments')) return [params[0] === 2 ? [{ id: 11 }] : []];
            if (sql.includes('FROM delivery_boy_collections')) return [params[0] === 3 ? [{ id: 12 }] : []];
            writes.push({ sql, params }); return [{ affectedRows: 1 }];
        },
    }));
    const result = await StaffModel.moveUnupdatedSalesToDelivery([1, 2, 3, 4, 5, 6]);
    assert.deepEqual(result, { movedIds: [1], skippedIds: [2, 3, 4, 5, 6] });
    assert.equal(writes.length, 2);
    assert.match(writes[0].sql, /packaging_status = 'packing_done'/);
    assert.match(writes[0].sql, /delivery_boy_id = NULL/);
    assert.doesNotMatch(writes[0].sql, /box_count|packed_item_count|packed_by_id/);
    assert.match(writes[1].sql, /staff_sale_status_history/);
    assert.equal(committed, true);
    assert.equal(released, true);
});

test('failed history update rolls back the entire move', async (t) => {
    let rolledBack = false;
    let committed = false;
    t.mock.method(db, 'getConnection', async () => ({
        async beginTransaction() {}, async commit() { committed = true; }, async rollback() { rolledBack = true; }, release() {},
        async execute(sql) {
            if (sql.includes('FOR UPDATE')) return [[{ id: 1, packaging_status: 'delivered', paid_amount: 0 }]];
            if (sql.includes('INSERT INTO')) throw new Error('History unavailable');
            if (sql.includes('SELECT')) return [[]];
            return [{ affectedRows: 1 }];
        },
    }));
    await assert.rejects(StaffModel.moveUnupdatedSalesToDelivery([1]), /History unavailable/);
    assert.equal(rolledBack, true);
    assert.equal(committed, false);
});
