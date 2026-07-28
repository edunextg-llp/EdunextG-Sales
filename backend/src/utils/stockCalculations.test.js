import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAvailableStockPieces } from './stockCalculations.js';

test('uses physical minus DMS when stock is not approved as current', () => {
    assert.equal(calculateAvailableStockPieces(1220, 500, false), 720);
    assert.equal(calculateAvailableStockPieces(1220, 1220, false), 0);
});

test('uses full physical stock when approved as current stock', () => {
    assert.equal(calculateAvailableStockPieces(1220, 1220, true), 1220);
    assert.equal(calculateAvailableStockPieces(1220, 500, true), 1220);
});

test('matches sale deduction availability for approved products', () => {
    const physicalTotal = 1220;
    const dmsTotal = 1220;
    const requestedQty = 500;

    const available = calculateAvailableStockPieces(physicalTotal, dmsTotal, true);
    assert.equal(available >= requestedQty, true);
});
