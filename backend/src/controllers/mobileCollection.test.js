import assert from 'node:assert/strict';
import test from 'node:test';
import DeliveryCollectionModel from '../models/deliveryCollectionModel.js';
import { collectMobileCreditDue } from './deliveryBoyController.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const request = (body) => ({ deliveryBoyId: 7, params: { saleId: '25' }, body });

test('cash amount, UPI reference, cheque without date and 14-day credit reach D.B. Collection', async (t) => {
    const calls = [];
    t.mock.method(DeliveryCollectionModel, 'collectOutstandingPayment', async (boy, sale, data) => {
        calls.push({ boy, sale, data }); return { collection: { id: 5 } };
    });
    for (const body of [
        { paymentMode: 'cash', amount: 120.50 },
        { paymentMode: 'upi', amount: 100, referenceNo: 'UPI123' },
        { paymentMode: 'cheque', amount: 100, referenceNo: '001234' },
        { paymentMode: 'credit', amount: 100, creditDays: 14 },
    ]) {
        const res = response();
        await collectMobileCreditDue(request({ ...body, deliveryBoyId: 99 }), res);
        assert.equal(res.statusCode, 200);
        assert.match(res.body.message, /D.B. Collection/);
    }
    assert.ok(calls.every(({ boy, sale }) => boy === 7 && sale === 25));
    assert.equal(calls[0].data.cashDetails, null);
    assert.equal(calls[0].data.amount, 120.50);
    assert.equal(calls[2].data.referenceDate, null);
});

test('invalid payments and credit over 14 days never reach storage', async (t) => {
    const collect = t.mock.method(DeliveryCollectionModel, 'collectOutstandingPayment');
    for (const body of [
        { paymentMode: 'cash', amount: 0 }, { paymentMode: 'cash', amount: -1 },
        { paymentMode: 'cash', amount: 10.999 }, { paymentMode: 'cash', amount: 'invalid' },
        { paymentMode: 'upi', amount: 100 }, { paymentMode: 'cheque', amount: 100 },
        ...[0, 15, 1.5, ''].map((creditDays) => ({ paymentMode: 'credit', amount: 100, creditDays })),
    ]) {
        const res = response(); await collectMobileCreditDue(request(body), res);
        assert.equal(res.statusCode, 400, JSON.stringify(body));
    }
    assert.equal(collect.mock.callCount(), 0);
});

test('unavailable or already submitted bills cannot be collected', async (t) => {
    t.mock.method(DeliveryCollectionModel, 'collectOutstandingPayment', async () => null);
    const res = response(); await collectMobileCreditDue(request({ paymentMode: 'cash', amount: 100 }), res);
    assert.equal(res.statusCode, 404);
});
