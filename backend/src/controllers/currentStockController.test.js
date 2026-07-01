import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCurrentStockDiff, buildCurrentStockSummary } from './currentStockController.js';

test('calculates current stock as physical stock minus DMS stock', () => {
    const items = buildCurrentStockDiff(
        [{
            product_erp_id: 'CM100',
            product_name: 'CHHOLE MASALA',
            product_division: 'Everest',
            variant_name: '100',
            pcs_per_box: 120,
            physical_stock_in_case: 5,
            physical_stock_in_pcs: 10,
            total_physical_stock_in_pcs: 610,
            price_per_piece: 75.6,
            mrp: 90,
            total_value: 46116,
        }],
        [{
            product_erp_id: 'CM100',
            product_name: 'CHHOLE MASALA',
            product_division: 'Everest',
            variant_name: '100',
            pcs_per_box: 120,
            current_stock_in_case: 2,
            current_stock_in_pcs: 3,
            total_current_stock_in_pcs: 243,
            price_per_piece: 75.6,
            mrp: 90,
        }]
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].current_stock_in_case, 3);
    assert.equal(items[0].current_stock_in_pcs, 7);
    assert.equal(items[0].total_current_stock_in_pcs, 367);
    assert.equal(items[0].total_value, 27745.2);
});

test('includes products that exist only in physical or only in DMS stock', () => {
    const items = buildCurrentStockDiff(
        [{
            product_erp_id: 'A',
            product_name: 'Only Physical',
            pcs_per_box: 10,
            physical_stock_in_case: 2,
            physical_stock_in_pcs: 1,
            total_physical_stock_in_pcs: 21,
            price_per_piece: 5,
        }],
        [{
            product_erp_id: 'B',
            product_name: 'Only DMS',
            pcs_per_box: 12,
            current_stock_in_case: 1,
            current_stock_in_pcs: 2,
            total_current_stock_in_pcs: 14,
            price_per_piece: 10,
        }]
    );

    assert.equal(items.length, 2);
    assert.deepEqual(
        items.find((item) => item.product_erp_id === 'A'),
        {
            product_erp_id: 'A',
            product_name: 'Only Physical',
            product_division: '',
            variant_name: '',
            pcs_per_box: 10,
            physical_stock_in_case: 2,
            physical_stock_in_pcs: 1,
            total_physical_stock_in_pcs: 21,
            dms_stock_in_case: 0,
            dms_stock_in_pcs: 0,
            total_dms_stock_in_pcs: 0,
            current_stock_in_case: 2,
            current_stock_in_pcs: 1,
            total_current_stock_in_pcs: 21,
            price_per_piece: 5,
            mrp: 0,
            total_value: 105,
        }
    );
    assert.equal(items.find((item) => item.product_erp_id === 'B').total_current_stock_in_pcs, -14);
});

test('summarizes calculated current stock rows', () => {
    const items = buildCurrentStockDiff(
        [{
            product_erp_id: 'A',
            pcs_per_box: 10,
            physical_stock_in_case: 3,
            physical_stock_in_pcs: 4,
            total_physical_stock_in_pcs: 34,
            price_per_piece: 5,
        }],
        [{
            product_erp_id: 'A',
            pcs_per_box: 10,
            current_stock_in_case: 1,
            current_stock_in_pcs: 2,
            total_current_stock_in_pcs: 12,
            price_per_piece: 5,
        }]
    );

    assert.deepEqual(buildCurrentStockSummary(items), {
        totalPhysicalCases: 3,
        totalPhysicalLoosePcs: 4,
        totalPhysicalPieces: 34,
        totalDmsCases: 1,
        totalDmsLoosePcs: 2,
        totalDmsPieces: 12,
        totalCases: 2,
        totalLoosePcs: 2,
        totalPieces: 22,
        totalValue: 110,
    });
});
