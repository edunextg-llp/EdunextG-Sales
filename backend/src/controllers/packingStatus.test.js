import assert from 'node:assert/strict';
import test from 'node:test';
import StaffModel from '../models/staffModel.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import { updatePackagingStatus } from './staffController.js';

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('already packed and returned bills retain historical packing staff without requiring reselection', async (t) => {
    for (const status of ['packing_done', 'out_for_delivery', 'delivered', 'returned']) {
        t.mock.method(StaffModel, 'getSaleStatusById', async () => status);
        t.mock.method(StaffModel, 'getSaleById', async () => ({ id: 25, packed_by_id: 7, item_count: 10, packed_item_count: 10, box_count: 2, packet_count: 1 }));
        const save = t.mock.method(StaffModel, 'updatePackagingStatus', async (...args) => {
            assert.equal(args[9], 7);
            assert.deepEqual(args.slice(6, 9), [10, 2, 1]);
        });
        const res = response();
        await updatePackagingStatus({ params: { saleId: '25' }, body: { packagingStatus: 'packing_done', expectedStatus: status } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(save.mock.callCount(), 1);
        t.mock.restoreAll();
    }
});

test('legacy packed bills can return to pending without inventing a packing staff member', async (t) => {
    t.mock.method(StaffModel, 'getSaleStatusById', async () => 'returned');
    t.mock.method(StaffModel, 'getSaleById', async () => ({ id: 25, item_count: 5, packed_by_id: null }));
    t.mock.method(StaffModel, 'updatePackagingStatus', async (...args) => assert.equal(args[9], null));
    const res = response();
    await updatePackagingStatus({ params: { saleId: '25' }, body: { packagingStatus: 'packing_done' } }, res);
    assert.equal(res.statusCode, 200);
});

test('new packing still requires a valid active packer', async (t) => {
    t.mock.method(StaffModel, 'getSaleStatusById', async () => 'packing');
    t.mock.method(StaffModel, 'getSaleById', async () => ({ id: 25, item_count: 5 }));
    const save = t.mock.method(StaffModel, 'updatePackagingStatus', async () => {});
    const req = { params: { saleId: '25' }, body: { packagingStatus: 'packing_done' } };
    const missing = response(); await updatePackagingStatus(req, missing);
    assert.equal(missing.statusCode, 400);
    assert.equal(save.mock.callCount(), 0);
    t.mock.method(DeliveryBoyModel, 'getById', async () => ({ role: 'packaging_staff', is_active: 1 }));
    const valid = response(); await updatePackagingStatus({ ...req, body: { ...req.body, packedById: 7 } }, valid);
    assert.equal(valid.statusCode, 200);
    assert.equal(save.mock.callCount(), 1);
});
