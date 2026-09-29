import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceManagedUserApiScope } from './authMiddleware.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import db from '../config/db.js';

function allowed(path, method, permissions) {
    let nextCalled = false;
    const res = { status() { return this; }, json() {} };
    enforceManagedUserApiScope({ path, method, user: { role: 'delivery_boy', permissions } }, res, () => { nextCalled = true; });
    return nextCalled;
}
test('invoice lookup permission grants read access without sales editing', () => {
    assert.equal(allowed('/sales/lookup', 'GET', ['invoice_lookup']), true);
    assert.equal(allowed('/sales/lookup', 'GET', []), false);
    assert.equal(allowed('/sales/lookup', 'GET', ['add_sales']), false);
    assert.equal(allowed('/sales/lookup', 'POST', ['invoice_lookup']), false);
    assert.equal(allowed('/sales/1', 'PUT', ['invoice_lookup']), false);
});
test('invoice lookup permission is persisted and can be revoked', async (t) => {
    const values = [];
    t.mock.method(db, 'execute', async (sql, params) => {
        const columns = sql.match(/INSERT INTO delivery_user_permissions\s*\(([^)]+)\)/)[1].split(',').map((value) => value.trim());
        assert.equal(columns.length, params.length);
        assert.equal((sql.match(/\?/g) || []).length, params.length);
        values.push(params[columns.indexOf('can_invoice_lookup')]);
        return [{}];
    });
    await DeliveryBoyModel.setPermissions(7, ['invoice_lookup']);
    await DeliveryBoyModel.setPermissions(7, []);
    assert.deepEqual(values, [1, 0]);
});
