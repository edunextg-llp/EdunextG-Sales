import assert from 'node:assert/strict';
import test from 'node:test';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import {
    updateMobileAssignedItemContact,
    updateMobileAssignedItemLocation,
} from './deliveryBoyController.js';

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

test('contact updates use authenticated assignment and preserve leading zeros', async (t) => {
    const update = t.mock.method(DeliveryBoyModel, 'updateAssignedSaleContact', async (boy, sale, number) => {
        assert.deepEqual([boy, sale, number], [7, 25, '0123456789']);
        return { id: sale, contact_number: number };
    });
    const res = response();
    await updateMobileAssignedItemContact({
        deliveryBoyId: 7, params: { saleId: '25' },
        body: { contactNumber: ' 0123456789 ', deliveryBoyId: 99 },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.sale.contact_number, '0123456789');
    assert.equal(update.mock.callCount(), 1);
});

test('invalid contact requests never reach storage', async (t) => {
    const update = t.mock.method(DeliveryBoyModel, 'updateAssignedSaleContact');
    for (const contactNumber of [undefined, null, '', '   ', '12abc', '1'.repeat(21), 9876543210, ['123']]) {
        const res = response();
        await updateMobileAssignedItemContact({ params: { saleId: '25' }, body: { contactNumber } }, res);
        assert.equal(res.statusCode, 400);
    }
    const res = response();
    await updateMobileAssignedItemContact({ params: { saleId: '-1' }, body: { contactNumber: '1234567890' } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(update.mock.callCount(), 0);
});

test('unavailable contact assignment returns not found', async (t) => {
    t.mock.method(DeliveryBoyModel, 'updateAssignedSaleContact', async () => null);
    const res = response();
    await updateMobileAssignedItemContact({ deliveryBoyId: 7, params: { saleId: '25' }, body: { contactNumber: '1234567890' } }, res);
    assert.equal(res.statusCode, 404);
});

test('invalid GPS values cannot accidentally save a zero coordinate', async (t) => {
    const update = t.mock.method(DeliveryBoyModel, 'updateAssignedSaleLocation');
    for (const value of [undefined, null, '', '  ', false, true, [], [12], {}, 'bad', Infinity]) {
        for (const body of [{ latitude: value, longitude: 0 }, { latitude: 0, longitude: value }]) {
            const res = response();
            await updateMobileAssignedItemLocation({ params: { saleId: '25' }, body }, res);
            assert.equal(res.statusCode, 400);
        }
    }
    assert.equal(update.mock.callCount(), 0);
});

test('valid zero coordinates create a map link; saved locations remain unavailable', async (t) => {
    t.mock.method(DeliveryBoyModel, 'updateAssignedSaleLocation', async (boy, sale, location) => {
        assert.deepEqual([boy, sale], [7, 25]);
        assert.equal(location, 'https://www.google.com/maps/search/?api=1&query=0,0');
        return null;
    });
    const res = response();
    await updateMobileAssignedItemLocation({ deliveryBoyId: 7, params: { saleId: '25' }, body: { latitude: 0, longitude: '0' } }, res);
    assert.equal(res.statusCode, 404);
});
