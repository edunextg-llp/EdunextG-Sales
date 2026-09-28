import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../config/db.js';
import DeliveryCollectionModel from './deliveryCollectionModel.js';
import PaymentModel from './paymentModel.js';

test('outstanding query scopes to active taken bills or own deliveries completed within 24 hours', async (t) => {
    t.mock.method(db, 'execute', async (sql, params) => {
        assert.deepEqual(params, [7, 7]);
        assert.match(sql, /tb.delivery_boy_id = \?/);
        assert.match(sql, /tb.returned_at IS NULL/);
        assert.match(sql, /history.status = 'delivered'/);
        assert.match(sql, /history.changed_at > NOW\(\) - INTERVAL 1 DAY/);
        assert.match(sql, /history.changed_at <= NOW\(\)/);
        assert.match(sql, /pending.settled_at IS NULL/);
        assert.doesNotMatch(sql, /delivery_boy_companies/);
        assert.match(sql, /order_cancellations/);
        return [[{ sale_id: 25, balance_amount: '100.50', credit_amount: '80', collection_source: 'taken_bill' }]];
    });
    const rows = await DeliveryCollectionModel.getOutstandingSalesForDeliveryBoy(7);
    assert.equal(rows[0].balance_amount, 100.50);
});

test('submission locks sale before checking eligibility and writes a pending collection only', async (t) => {
    const statements = [];
    let committed = false;
    const connection = {
        async beginTransaction() {}, async commit() { committed = true; }, async rollback() {}, release() {},
        async execute(sql, params) { statements.push({ sql, params }); return [{ insertId: 19 }]; },
    };
    t.mock.method(db, 'getConnection', async () => connection);
    t.mock.method(DeliveryCollectionModel, 'getOutstandingSalesForDeliveryBoy', async (boy, executor) => {
        assert.equal(boy, 7); assert.equal(executor, connection);
        assert.match(statements[0].sql, /FOR UPDATE/);
        return [{ sale_id: 25, balance_amount: 100, credit_amount: 0 }];
    });
    t.mock.method(PaymentModel, 'getEffectiveSalePrice', async () => 150);
    t.mock.method(PaymentModel, 'getTotalPaid', async () => 50);
    const data = { paymentMode: 'cash', amount: 60, referenceNo: null, referenceDate: null, creditDays: null };
    const result = await DeliveryCollectionModel.collectOutstandingPayment(7, 25, data);
    assert.equal(result.collection.id, 19);
    assert.equal(committed, true);
    assert.match(statements[1].sql, /INSERT INTO delivery_boy_collections/);
    assert.match(statements[1].sql, /NULL\)/);
    assert.equal(statements.length, 2);
    await assert.rejects(DeliveryCollectionModel.collectOutstandingPayment(7, 25, { ...data, amount: 101 }), /EXCEEDS_BALANCE/);
});

test('credit extension reschedules existing debt without adding duplicate credit', async (t) => {
    const queries = [];
    let committed = false;
    const connection = {
        async beginTransaction() {}, async commit() { committed = true; }, async rollback() {}, release() {},
        async execute(sql, params) {
            queries.push({ sql, params });
            if (sql.includes('SELECT dbc.*')) return [[{ id: 5, sale_id: 25, amount: 100, payment_mode: 'credit', credit_days: 14, delivery_boy_name: 'Collector' }]];
            if (sql.includes('HAVING balance > 0')) return [[{ id: 8, balance: 100 }]];
            if (sql.includes('AS paid FROM sale_payments')) return [[{ paid: 0 }]];
            return [{ affectedRows: 1 }];
        },
    };
    t.mock.method(db, 'getConnection', async () => connection);
    t.mock.method(PaymentModel, 'getEffectiveSalePrice', async () => 100);
    t.mock.method(PaymentModel, 'recalculateSaleTotals', async () => {});
    assert.equal(await DeliveryCollectionModel.settle(5), true);
    assert.equal(committed, true);
    assert.ok(queries.some(({ sql, params }) => sql.includes('UPDATE sale_payments SET credit_days') && params[0] === 14 && params[1] === 8));
    assert.ok(!queries.some(({ sql }) => sql.includes('INSERT INTO sale_payments')));
});
