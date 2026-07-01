import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPhysicalStockSummary, normalizePhysicalStockRow } from './physicalStockController.js';

test('calculates both derived Physical Stock fields from cases and loose pieces', () => {
    const row = normalizePhysicalStockRow({
        'Product Erp Id': 'CM100',
        'SKU Name': 'CHHOLE MASALA',
        'Product Division': 'Everest',
        'Variant Name': 100,
        'Pcs/Box': 120,
        'Current Stock In Case': 2,
        'Current Stock In Pcs': 3,
        'Total Current Stock in Pcs = ((Current Stock In Case*Pcs/Box)+Current Stock In Pcs)': 999,
        'Price/Pcs': 75.6,
        MRP: 90,
        'Total Value = (Total Current Stock in Pcs*Price/Pcs)': 999,
    });

    assert.equal(row.totalPhysicalStockInPcs, 243);
    assert.equal(row.totalValue, 18370.8);
});

test('summarizes calculated Physical Stock rows', () => {
    const first = normalizePhysicalStockRow({
        'Product Erp Id': 'A',
        'Pcs/Box': 10,
        'Current Stock In Case': 2,
        'Current Stock In Pcs': 4,
        'Price/Pcs': 5,
    });
    const second = normalizePhysicalStockRow({
        'Product Erp Id': 'B',
        'Pcs/Box': 12,
        'Current Stock In Case': 1,
        'Current Stock In Pcs': 2,
        'Price/Pcs': 10,
    });

    assert.deepEqual(buildPhysicalStockSummary([first, second]), {
        totalCases: 3,
        totalLoosePcs: 6,
        totalPieces: 38,
        totalValue: 260,
    });
});
