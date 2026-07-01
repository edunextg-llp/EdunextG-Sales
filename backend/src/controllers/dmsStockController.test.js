import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSummary, normalizeStockRow } from './dmsStockController.js';

test('maps the DMS Stock workbook columns without losing stock values', () => {
    const row = normalizeStockRow({
        'Product Erp Id': 'CM100',
        'SKU Name': 'CHHOLE MASALA',
        'Product Division': 'Everest',
        'Variant Name': 100,
        'Pcs/Box': 120,
        'Current Stock In Case': 2,
        'Current Stock In Pcs': 3,
        'Total Current Stock in Pcs': 243,
        'Price/Pcs': 75.6,
        MRP: 90,
        'Total Value': 18370.8,
    });

    assert.deepEqual(
        {
            productErpId: row.productErpId,
            productName: row.productName,
            pcsPerBox: row.pcsPerBox,
            currentStockInCase: row.currentStockInCase,
            currentStockInPcs: row.currentStockInPcs,
            totalCurrentStockInPcs: row.totalCurrentStockInPcs,
            pricePerPiece: row.pricePerPiece,
            mrp: row.mrp,
            totalPieces: row.totalPieces,
            totalValue: row.totalValue,
        },
        {
            productErpId: 'CM100',
            productName: 'CHHOLE MASALA',
            pcsPerBox: 120,
            currentStockInCase: 2,
            currentStockInPcs: 3,
            totalCurrentStockInPcs: 243,
            pricePerPiece: 75.6,
            mrp: 90,
            totalPieces: 243,
            totalValue: 18370.8,
        }
    );
});

test('calculates missing total pieces and value from case stock', () => {
    const row = normalizeStockRow({
        'Product Erp Id': 'TEST1',
        'SKU Name': 'TEST SKU',
        'Pcs/Box': 12,
        'Current Stock In Case': 2,
        'Current Stock In Pcs': 5,
        'Price/Pcs': 10,
    });
    const summary = buildSummary([row]);

    assert.equal(row.totalCurrentStockInPcs, 29);
    assert.equal(row.totalPieces, 29);
    assert.equal(row.totalValue, 290);
    assert.equal(summary.totalStockCases, 2);
    assert.equal(summary.totalStockPcs, 5);
    assert.equal(summary.totalPieces, 29);
    assert.equal(summary.totalValue, 290);
});
