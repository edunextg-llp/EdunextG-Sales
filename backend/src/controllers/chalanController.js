import ChalanModel from '../models/chalanModel.js';
import StaffModel from '../models/staffModel.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import {
    validateRequiredText,
    validatePositiveInteger,
    validateNumeric,
    validateNonNegativeInteger,
} from '../utils/validation.js';

function normalizeDateInput(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().split('T')[0];
    }
    return String(value).split('T')[0].split(' ')[0];
}

function normalizeItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return { error: 'At least one item is required.' };
    }

    const normalizedItems = [];

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index] || {};
        const itemName = validateRequiredText(item.itemName, `Item ${index + 1} name`);
        if (itemName.error) {
            return { error: itemName.error };
        }

        const qty = validateNumeric(item.qty, `Item ${index + 1} quantity`);
        if (qty.error) {
            return { error: qty.error };
        }
        if (Number(qty.value) <= 0) {
            return { error: `Item ${index + 1} quantity must be greater than 0.` };
        }

        const mrp = validateNumeric(item.mrp, `Item ${index + 1} MRP`);
        if (mrp.error) {
            return { error: mrp.error };
        }
        if (Number(mrp.value) < 0) {
            return { error: `Item ${index + 1} MRP cannot be negative.` };
        }

        normalizedItems.push({
            itemName: itemName.value,
            qty: Number(qty.value),
            mrp: Number(mrp.value),
        });
    }

    return { items: normalizedItems };
}

async function validateChalanPayload(body) {
    const saleDate = normalizeDateInput(body.date);
    if (!saleDate) {
        return { error: 'Date is required.' };
    }

    const assigneeType = String(body.assigneeType || '').trim();
    if (!['company_staff', 'delivery_boy'].includes(assigneeType)) {
        return { error: 'Assignee type must be company staff or delivery boy.' };
    }

    let staffId = null;
    let deliveryBoyId = null;

    if (assigneeType === 'company_staff') {
        const staffIdResult = validatePositiveInteger(body.staffId, 'Staff');
        if (staffIdResult.error) {
            return { error: staffIdResult.error };
        }
        staffId = staffIdResult.value;
        const staff = await StaffModel.getDetails(staffId);
        if (!staff) {
            return { error: 'Selected staff not found.', status: 404 };
        }
    } else {
        const deliveryBoyIdResult = validatePositiveInteger(body.deliveryBoyId, 'Delivery boy');
        if (deliveryBoyIdResult.error) {
            return { error: deliveryBoyIdResult.error };
        }
        deliveryBoyId = deliveryBoyIdResult.value;
        const deliveryBoy = await DeliveryBoyModel.getById(deliveryBoyId);
        if (!deliveryBoy) {
            return { error: 'Selected delivery boy not found.', status: 404 };
        }
    }

    const itemsResult = normalizeItems(body.items);
    if (itemsResult.error) {
        return { error: itemsResult.error };
    }

    return {
        saleDate,
        assigneeType,
        staffId,
        deliveryBoyId,
        items: itemsResult.items,
    };
}

export const createChalanSale = async (req, res) => {
    try {
        const payload = await validateChalanPayload(req.body);
        if (payload.error) {
            return res.status(payload.status || 400).json({ error: payload.error });
        }

        const sale = await ChalanModel.createSale(payload);

        res.status(201).json({
            message: 'Chalan created successfully',
            sale,
        });
    } catch (error) {
        console.error('Error creating chalan sale:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getChalanSale = async (req, res) => {
    try {
        const saleId = parseInt(req.params.id, 10);
        if (!saleId) {
            return res.status(400).json({ error: 'Invalid chalan id.' });
        }

        const sale = await ChalanModel.getSaleById(saleId);
        if (!sale) {
            return res.status(404).json({ error: 'Chalan not found.' });
        }

        res.status(200).json(sale);
    } catch (error) {
        console.error('Error fetching chalan sale:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getChalanSalesByDate = async (req, res) => {
    try {
        const date = normalizeDateInput(req.query.date);
        if (!date) {
            return res.status(400).json({ error: 'Date is required.' });
        }

        const sales = await ChalanModel.getSalesByDate(date);
        res.status(200).json(sales);
    } catch (error) {
        console.error('Error fetching chalan sales:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateChalanSale = async (req, res) => {
    try {
        const saleId = parseInt(req.params.id, 10);
        if (!saleId) {
            return res.status(400).json({ error: 'Invalid chalan id.' });
        }

        const payload = await validateChalanPayload(req.body);
        if (payload.error) {
            return res.status(payload.status || 400).json({ error: payload.error });
        }

        const sale = await ChalanModel.updateSale(saleId, payload);
        if (!sale) {
            return res.status(404).json({ error: 'Chalan not found.' });
        }

        res.status(200).json({
            message: 'Chalan updated successfully',
            sale,
        });
    } catch (error) {
        console.error('Error updating chalan sale:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteChalanSale = async (req, res) => {
    try {
        const saleId = parseInt(req.params.id, 10);
        if (!saleId) {
            return res.status(400).json({ error: 'Invalid chalan id.' });
        }

        const deleted = await ChalanModel.deleteSale(saleId);
        if (!deleted) {
            return res.status(404).json({ error: 'Chalan not found.' });
        }

        res.status(200).json({ message: 'Chalan deleted successfully' });
    } catch (error) {
        console.error('Error deleting chalan sale:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getChalanPackagingSales = async (req, res) => {
    try {
        const sales = await ChalanModel.getPackagingSales();
        res.status(200).json(sales);
    } catch (error) {
        console.error('Error fetching chalan packaging sales:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getChalanCancelledSales = async (req, res) => {
    try {
        const sales = await ChalanModel.getCancelledSales();
        res.status(200).json(sales);
    } catch (error) {
        console.error('Error fetching cancelled chalan sales:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateChalanPackagingStatus = async (req, res) => {
    try {
        const saleId = parseInt(req.params.id, 10);
        if (!saleId) {
            return res.status(400).json({ error: 'Invalid chalan id.' });
        }

        const {
            packagingStatus,
            statusDate,
            expectedStatus,
            packedItemCount,
            boxCount,
            packetCount,
            deliveryBoyId,
            vehicleNo,
            deliveryDate,
        } = req.body;

        if (
            !['not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].includes(
                packagingStatus
            )
        ) {
            return res.status(400).json({ error: 'Invalid packaging status' });
        }

        const currentStatus = await ChalanModel.getSaleStatusById(saleId);
        if (!currentStatus) {
            return res.status(404).json({ error: 'Chalan not found' });
        }

        if (expectedStatus && currentStatus !== expectedStatus) {
            return res.status(409).json({
                error: 'This record was updated by another user. Data has been refreshed.',
                currentStatus,
            });
        }

        const existingSale = await ChalanModel.getSaleById(saleId);
        const normalizedStatusDate = normalizeDateInput(statusDate);
        const hasPackedItemCount = Object.prototype.hasOwnProperty.call(req.body, 'packedItemCount');
        const hasBoxCount = Object.prototype.hasOwnProperty.call(req.body, 'boxCount');
        const hasPacketCount = Object.prototype.hasOwnProperty.call(req.body, 'packetCount');

        let normalizedPackedItemCount =
            existingSale?.packed_item_count ?? existingSale?.item_count ?? null;
        let normalizedBoxCount = existingSale?.box_count ?? null;
        let normalizedPacketCount = existingSale?.packet_count ?? null;

        if (hasPackedItemCount) {
            const packedValidation = validatePositiveInteger(packedItemCount, 'Packing item');
            if (!packedValidation.valid) {
                return res.status(400).json({ error: packedValidation.error });
            }
            normalizedPackedItemCount = packedValidation.value;
        }

        if (
            existingSale?.item_count &&
            normalizedPackedItemCount &&
            normalizedPackedItemCount > Number(existingSale.item_count)
        ) {
            return res.status(400).json({ error: 'Packing item cannot be more than no. of item.' });
        }

        if (hasBoxCount) {
            const boxValidation = validateNonNegativeInteger(boxCount, 'No. of box');
            if (!boxValidation.valid) {
                return res.status(400).json({ error: boxValidation.error });
            }
            normalizedBoxCount = boxValidation.value;
        }

        if (hasPacketCount) {
            const packetValidation = validateNonNegativeInteger(packetCount, 'No. of packet');
            if (!packetValidation.valid) {
                return res.status(400).json({ error: packetValidation.error });
            }
            normalizedPacketCount = packetValidation.value;
        }

        let normalizedDeliveryBoyId = deliveryBoyId || existingSale?.delivery_boy_id || null;
        if (deliveryBoyId) {
            const deliveryBoyValidation = validatePositiveInteger(deliveryBoyId, 'Delivery boy');
            if (!deliveryBoyValidation.valid) {
                return res.status(400).json({ error: deliveryBoyValidation.error });
            }
            normalizedDeliveryBoyId = deliveryBoyValidation.value;
        }

        const updated = await ChalanModel.updatePackagingStatus(
            saleId,
            packagingStatus,
            normalizedStatusDate,
            normalizedPackedItemCount,
            normalizedBoxCount,
            normalizedPacketCount,
            normalizedDeliveryBoyId,
            vehicleNo || null,
            normalizeDateInput(deliveryDate)
        );

        res.status(200).json({
            message: 'Packaging status updated successfully',
            sale: updated,
        });
    } catch (error) {
        console.error('Error updating chalan packaging status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getChalanSaleStatusHistory = async (req, res) => {
    try {
        const saleId = parseInt(req.params.id, 10);
        if (!saleId) {
            return res.status(400).json({ error: 'Invalid chalan id.' });
        }

        const details = await ChalanModel.getSaleStatusHistory(saleId);
        if (!details) {
            return res.status(404).json({ error: 'Chalan not found.' });
        }

        res.status(200).json(details);
    } catch (error) {
        console.error('Error fetching chalan status history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
