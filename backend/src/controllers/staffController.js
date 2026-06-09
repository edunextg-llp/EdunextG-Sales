import StaffModel from '../models/staffModel.js';
import PaymentModel from '../models/paymentModel.js';
import CompanyModel from '../models/companyModel.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import ReportModel from '../models/reportModel.js';
import BankDepositModel from '../models/bankDepositModel.js';
import {
    validateDigitsOnly,
    validateNumeric,
    validatePositiveInteger,
    validateRequiredText,
} from '../utils/validation.js';

async function resolveCompanyIds(companyNames, fallbackCompanyName) {
    const names = Array.isArray(companyNames)
        ? companyNames
        : String(fallbackCompanyName || '')
            .split(',')
            .map(name => name.trim());

    const uniqueNames = [...new Set(names.map(name => String(name || '').trim()).filter(Boolean))];
    const companyIds = [];

    for (const companyName of uniqueNames) {
        companyIds.push(await CompanyModel.findOrCreateByName(companyName));
    }

    return companyIds;
}

function normalizeDateInput(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        if (value.includes('T')) {
            return value.split('T')[0];
        }
        return value;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().split('T')[0];
    }

    return String(value);
}

const BANK_DEPOSIT_NOTE_DENOMINATIONS = [500, 200, 100, 50, 20, 10];
const BANK_DEPOSIT_COIN_DENOMINATIONS = [20, 10, 5, 2, 1];
const BANK_DEPOSIT_DENOMINATIONS = [
    ...BANK_DEPOSIT_NOTE_DENOMINATIONS.map(value => ({ key: `note_${value}`, value })),
    ...BANK_DEPOSIT_COIN_DENOMINATIONS.map(value => ({ key: `coin_${value}`, value })),
];

function calculateCashDepositAmount(cashDetails = {}) {
    return BANK_DEPOSIT_DENOMINATIONS.reduce((total, item) => {
        const count = parseInt(cashDetails[item.key] || 0, 10);
        return total + item.value * (Number.isNaN(count) ? 0 : count);
    }, 0);
}

export const createStaff = async (req, res) => {
    try {
        const { name, contactNo, companyName, companyNames, staffType = 'distributor', assignments = {} } = req.body;
        const normalizedStaffType = staffType === 'cnf' ? 'cnf' : 'distributor';

        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const companyIds = await resolveCompanyIds(companyNames, companyName);
        const companyId = companyIds[0] || null;

        // Create staff entry
        const staffId = await StaffModel.create(
            name,
            contactValidation.value,
            companyId,
            normalizedStaffType
        );
        await StaffModel.setCompanies(staffId, companyIds);

        // Add location assignments
        // assignments: { Monday: [{ locationName: "..." }], Tuesday: [...] }
        for (const day in assignments) {
            const locations = assignments[day];
            if (Array.isArray(locations)) {
                for (const locObj of locations) {
                    const { locationName } = locObj;
                    await StaffModel.addLocation(staffId, day, locationName);
                }
            }
        }

        res.status(201).json({
            message: 'Staff and locations created successfully',
            staffId
        });
    } catch (error) {
        console.error('Error creating staff:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const searchStaff = async (req, res) => {
    try {
        const { query } = req.query;
        const results = await StaffModel.searchByName(query);
        res.status(200).json(results);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStaffLocations = async (req, res) => {
    try {
        const { id } = req.params;
        const { day } = req.query;
        const locations = await StaffModel.getLocationsByStaffAndDay(id, day);
        res.status(200).json(locations);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const addCounter = async (req, res) => {
    try {
        const { id } = req.params;
        const { day, location, counters } = req.body;

        if (Array.isArray(counters)) {
            const erpIds = new Set();
            const outletNames = new Set();

            for (let i = 0; i < counters.length; i++) {
                const counter = counters[i];
                const contactValidation = validateDigitsOnly(
                    counter.contactNumber,
                    `Counter ${i + 1} contact number`
                );
                if (!contactValidation.valid) {
                    return res.status(400).json({ error: contactValidation.error });
                }

                const outletErpId = String(counter.outletErpId || '').trim();
                const outletName = String(counter.outletName || '').trim();
                const googleLocation = String(counter.googleLocation || '').trim();
                const normalizedErpId = outletErpId.toLowerCase();
                const normalizedOutletName = outletName.toLowerCase();

                if (!googleLocation) {
                    return res.status(400).json({ error: `Counter ${i + 1} Google Location is required.` });
                }

                if (erpIds.has(normalizedErpId) || outletNames.has(normalizedOutletName)) {
                    return res.status(400).json({ error: 'Same ERP Id or Outlet Name already exists in this entry.' });
                }

                const duplicateCounter = await StaffModel.findDuplicateCounter(id, outletErpId, outletName);
                if (duplicateCounter) {
                    return res.status(400).json({ error: 'Same ERP Id or Outlet Name already exists.' });
                }

                erpIds.add(normalizedErpId);
                outletNames.add(normalizedOutletName);

                await StaffModel.addCounter(id, day, location, {
                    ...counter,
                    outletErpId,
                    outletName,
                    contactNumber: contactValidation.value,
                    googleLocation,
                });
            }
        }

        res.status(201).json({ message: 'Counters added successfully' });
    } catch (error) {
        console.error('Error adding counters:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStaff = async (req, res) => {
    try {
        const staff = await StaffModel.getAll();
        res.status(200).json(staff);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStaffFullDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await StaffModel.getDetails(id);
        if (!staff) {
            return res.status(404).json({ error: 'Staff not found' });
        }
        const locations = await StaffModel.getAllLocations(id);
        
        // Structure assignments back to the format frontend expects
        const assignments = {
            Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], CNF: []
        };
        locations.forEach(loc => {
            if (assignments[loc.day]) {
                assignments[loc.day].push({ locationName: loc.location_name });
            }
        });

        const companies = staff.company_name
            ? staff.company_name.split(',').map(name => name.trim()).filter(Boolean)
            : [];

        res.status(200).json({ ...staff, companies, assignments });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contactNo, companyName, companyNames, staffType = 'distributor', assignments = {} } = req.body;
        const normalizedStaffType = staffType === 'cnf' ? 'cnf' : 'distributor';

        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const companyIds = await resolveCompanyIds(companyNames, companyName);
        const companyId = companyIds[0] || null;

        // Update staff info
        await StaffModel.update(id, name, contactValidation.value, companyId, normalizedStaffType);
        await StaffModel.setCompanies(id, companyIds);

        // Replace locations
        await StaffModel.deleteLocations(id);
        for (const day in assignments) {
            const locations = assignments[day];
            if (Array.isArray(locations)) {
                for (const locObj of locations) {
                    await StaffModel.addLocation(id, day, locObj.locationName);
                }
            }
        }

        res.status(200).json({ message: 'Staff updated successfully' });
    } catch (error) {
        console.error('Error updating staff:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getOutletsByStaffAndDate = async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.query; // Expecting YYYY-MM-DD
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(date));
        const outlets = await StaffModel.getMissingSalesOutletsForDate(id, dayName, date);
        
        res.status(200).json(outlets);
    } catch (error) {
        console.error('Error fetching outlets by date:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getAllOutletsForStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const outlets = await StaffModel.getAllCountersForStaff(id);
        res.status(200).json(outlets);
    } catch (error) {
        console.error('Error fetching all outlets for staff:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const recordSales = async (req, res) => {
    try {
        const { id } = req.params;
        const { date, sales } = req.body;

        if (!date || !Array.isArray(sales)) {
            return res.status(400).json({ error: 'Date and sales array are required' });
        }

        const deliveryBoyCache = new Map();
        const validatedSales = [];
        const invoiceNumbers = new Set();
        for (let i = 0; i < sales.length; i++) {
            const item = sales[i];
            const outletValidation = validatePositiveInteger(item.outletId, `Sale ${i + 1} outlet ID`);
            if (!outletValidation.valid) {
                return res.status(400).json({ error: outletValidation.error });
            }
            const invoiceValidation = validateRequiredText(
                item.invoiceNumber,
                `Sale ${i + 1} invoice number`
            );
            if (!invoiceValidation.valid) {
                return res.status(400).json({ error: invoiceValidation.error });
            }
            const priceValidation = validateNumeric(item.price, `Sale ${i + 1} price`);
            if (!priceValidation.valid) {
                return res.status(400).json({ error: priceValidation.error });
            }
            const itemCountValidation = validatePositiveInteger(item.itemCount, `Sale ${i + 1} no. of item`);
            if (!itemCountValidation.valid) {
                return res.status(400).json({ error: itemCountValidation.error });
            }

            const normalizedInvoice = invoiceValidation.value.toLowerCase();
            if (invoiceNumbers.has(normalizedInvoice)) {
                return res.status(400).json({ error: 'Same invoice number already exists in this entry.' });
            }

            const duplicateInvoice = await StaffModel.findSaleByInvoice(id, invoiceValidation.value);
            if (duplicateInvoice) {
                return res.status(400).json({ error: 'Same invoice number already exists.' });
            }
            invoiceNumbers.add(normalizedInvoice);

            let deliveryBoyId = null;
            let deliveryBoyName = '';
            if (item.deliveryBoyId) {
                const deliveryBoyValidation = validatePositiveInteger(
                    item.deliveryBoyId,
                    `Sale ${i + 1} delivery boy`
                );
                if (!deliveryBoyValidation.valid) {
                    return res.status(400).json({ error: deliveryBoyValidation.error });
                }
                deliveryBoyId = deliveryBoyValidation.value;
                
                deliveryBoyName = deliveryBoyCache.get(deliveryBoyId);
                if (!deliveryBoyName) {
                    const deliveryBoy = await DeliveryBoyModel.getById(deliveryBoyId);
                    if (!deliveryBoy) {
                        return res.status(400).json({ error: `Sale ${i + 1}: delivery boy not found` });
                    }
                    deliveryBoyName = deliveryBoy.name;
                    deliveryBoyCache.set(deliveryBoyId, deliveryBoyName);
                }
            }

            const vehicleNo = item.vehicleNo ? item.vehicleNo.trim() : null;

            validatedSales.push({
                outletId: outletValidation.value,
                invoiceNumber: invoiceValidation.value,
                itemCount: itemCountValidation.value,
                price: priceValidation.value,
                deliveryBoyId,
                vehicleNo,
                paymentMode: 'cash',
            });
        }

        const staff = await StaffModel.getDetails(id);
        const savedSales = await StaffModel.saveSales(id, date, validatedSales);
        const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(
            new Date(`${date}T12:00:00`)
        );

        res.status(201).json({
            message: 'Sales recorded successfully',
            summary: {
                date,
                dayName,
                staffName: staff?.name || '',
                companyName: staff?.company_name || '',
                sales: savedSales,
            },
        });
    } catch (error) {
        console.error('Error recording sales:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateSale = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { invoiceNumber, price, itemCount } = req.body;

        const invoiceValidation = validateRequiredText(invoiceNumber, 'Invoice number');
        if (!invoiceValidation.valid) {
            return res.status(400).json({ error: invoiceValidation.error });
        }
        const priceValidation = validateNumeric(price, 'Price');
        if (!priceValidation.valid) {
            return res.status(400).json({ error: priceValidation.error });
        }
        const itemCountValidation = validatePositiveInteger(itemCount, 'No. of item');
        if (!itemCountValidation.valid) {
            return res.status(400).json({ error: itemCountValidation.error });
        }

        const existing = await StaffModel.getSaleById(saleId);
        if (!existing) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        const duplicateInvoice = await StaffModel.findSaleByInvoice(
            existing.staff_id,
            invoiceValidation.value,
            saleId
        );
        if (duplicateInvoice) {
            return res.status(400).json({ error: 'Same invoice number already exists.' });
        }

        const updated = await StaffModel.updateSale(
            saleId,
            invoiceValidation.value,
            priceValidation.value,
            itemCountValidation.value
        );

        res.status(200).json({
            message: 'Sale updated successfully',
            sale: {
                id: updated.id,
                shopName: updated.outlet_name,
                outletErpId: updated.outlet_erp_id || '',
                invoiceNumber: updated.invoice_number,
                itemCount: updated.item_count,
                stickerNumber: updated.sticker_number,
                amount: updated.price,
                deliveryBoyName: updated.delivery_boy_name || '',
                vehicleNo: updated.vehicle_no || '',
            },
        });
    } catch (error) {
        console.error('Error updating sale:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteSale = async (req, res) => {
    try {
        const { saleId } = req.params;
        const existing = await StaffModel.getSaleById(saleId);
        if (!existing) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        await StaffModel.deleteSale(saleId);
        res.status(200).json({ message: 'Sale deleted successfully' });
    } catch (error) {
        console.error('Error deleting sale:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updatePackagingStatus = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { packagingStatus, deliveryBoyId, vehicleNo, deliveryDate, statusDate, expectedStatus, packedItemCount, boxCount } = req.body;

        if (!['not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled'].includes(packagingStatus)) {
            return res.status(400).json({ error: 'Invalid packaging status' });
        }

        const currentStatus = await StaffModel.getSaleStatusById(saleId);
        if (!currentStatus) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        if (expectedStatus && currentStatus !== expectedStatus) {
            return res.status(409).json({
                error: 'This record was updated by another user. Data has been refreshed.',
                currentStatus,
            });
        }

        const existingSale = await StaffModel.getSaleById(saleId);
        const normalizedStatusDate = normalizeDateInput(statusDate);
        const hasPackedItemCount = Object.prototype.hasOwnProperty.call(req.body, 'packedItemCount');
        const hasBoxCount = Object.prototype.hasOwnProperty.call(req.body, 'boxCount');
        let normalizedPackedItemCount =
            existingSale?.packed_item_count || existingSale?.item_count || null;
        let normalizedBoxCount = existingSale?.box_count || null;

        if (hasPackedItemCount) {
            const packedValidation = validatePositiveInteger(packedItemCount, 'Packing item');
            if (!packedValidation.valid) {
                return res.status(400).json({ error: packedValidation.error });
            }
            normalizedPackedItemCount = packedValidation.value;
        }

        if (existingSale?.item_count && normalizedPackedItemCount && normalizedPackedItemCount > Number(existingSale.item_count)) {
            return res.status(400).json({ error: 'Packing item cannot be more than no. of item.' });
        }

        if (hasBoxCount) {
            const boxValidation = validatePositiveInteger(boxCount, 'No. of box');
            if (!boxValidation.valid) {
                return res.status(400).json({ error: boxValidation.error });
            }
            normalizedBoxCount = boxValidation.value;
        }

        await StaffModel.updatePackagingStatus(
            saleId,
            packagingStatus,
            deliveryBoyId || null,
            vehicleNo || null,
            normalizeDateInput(deliveryDate),
            normalizedStatusDate,
            normalizedPackedItemCount,
            normalizedBoxCount
        );
        const updated = await StaffModel.getSaleById(saleId);
        res.status(200).json({
            message: 'Packaging status updated successfully',
            sale: updated,
        });
    } catch (error) {
        console.error('Error updating packaging status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getSaleStatusHistory = async (req, res) => {
    try {
        const { saleId } = req.params;
        const details = await StaffModel.getSaleStatusHistory(saleId);

        if (!details) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        res.status(200).json(details);
    } catch (error) {
        console.error('Error fetching sale status history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPendingCredits = async (req, res) => {
    try {
        const credits = await StaffModel.getPendingCredits();
        res.status(200).json(credits);
    } catch (error) {
        console.error('Error fetching pending credits:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateCreditRemarks = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { remarks, remarkDate } = req.body;

        if (remarks !== undefined && remarks !== null && typeof remarks !== 'string') {
            return res.status(400).json({ error: 'Remarks must be text.' });
        }
        if (!remarks || !remarks.trim()) {
            return res.status(400).json({ error: 'Remarks are required.' });
        }

        const normalizedRemarkDate = normalizeDateInput(remarkDate);
        if (!normalizedRemarkDate || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedRemarkDate)) {
            return res.status(400).json({ error: 'Remark date is required.' });
        }

        const savedRemark = await StaffModel.addCreditRemark(
            paymentId,
            remarks,
            normalizedRemarkDate
        );
        if (!savedRemark) {
            return res.status(404).json({ error: 'Credit payment not found.' });
        }

        res.status(200).json({
            message: 'Remarks saved successfully',
            remark: savedRemark,
        });
    } catch (error) {
        console.error('Error updating credit remarks:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getBankDeposits = async (req, res) => {
    try {
        const deposits = await BankDepositModel.getRecent();
        res.status(200).json(deposits);
    } catch (error) {
        console.error('Error fetching bank deposits:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const searchDeliveredStores = async (req, res) => {
    try {
        const stores = await StaffModel.searchDeliveredStores(req.query.search || '');
        res.status(200).json(stores);
    } catch (error) {
        console.error('Error searching delivered stores:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createBankDeposit = async (req, res) => {
    try {
        const {
            depositDate,
            bankName,
            branchName,
            bankAccountNo,
            storeName,
            depositMode,
            amount,
            chequeNo,
            cashDetails = {},
        } = req.body;

        const normalizedDepositDate = normalizeDateInput(depositDate);
        if (!normalizedDepositDate) {
            return res.status(400).json({ error: 'Deposit date is required' });
        }

        const bankValidation = validateRequiredText(bankName, 'Bank name');
        if (!bankValidation.valid) return res.status(400).json({ error: bankValidation.error });
        const branchValidation = validateRequiredText(branchName, 'Branch name');
        if (!branchValidation.valid) return res.status(400).json({ error: branchValidation.error });
        const accountValidation = validateRequiredText(bankAccountNo, 'Bank account no');
        if (!accountValidation.valid) return res.status(400).json({ error: accountValidation.error });
        const storeValidation = validateRequiredText(storeName, 'Store name');
        if (!storeValidation.valid) return res.status(400).json({ error: storeValidation.error });

        const mode = String(depositMode || '').toLowerCase();
        if (!['cash', 'cheque'].includes(mode)) {
            return res.status(400).json({ error: 'Deposit mode must be cash or cheque' });
        }

        let depositAmount = 0;
        let normalizedChequeNo = null;
        let normalizedCashDetails = null;

        if (mode === 'cash') {
            const hasCashCount = BANK_DEPOSIT_DENOMINATIONS.some((item) => {
                const count = parseInt(cashDetails[item.key] || 0, 10);
                return !Number.isNaN(count) && count > 0;
            });
            if (!hasCashCount) {
                return res.status(400).json({ error: 'Please enter cash note or coin count.' });
            }

            normalizedCashDetails = {};
            for (const item of BANK_DEPOSIT_DENOMINATIONS) {
                const rawCount = cashDetails[item.key] ?? '';
                if (rawCount === '') {
                    normalizedCashDetails[item.key] = 0;
                    continue;
                }
                const normalizedCount = String(rawCount).trim();
                if (!/^\d+$/.test(normalizedCount)) {
                    return res.status(400).json({ error: `${item.key.replace('_', ' ')} must contain numbers only` });
                }
                normalizedCashDetails[item.key] = parseInt(normalizedCount, 10);
            }
            depositAmount = calculateCashDepositAmount(normalizedCashDetails);
        } else {
            const chequeValidation = validateRequiredText(chequeNo, 'Cheque no');
            if (!chequeValidation.valid) {
                return res.status(400).json({ error: chequeValidation.error });
            }
            const amountValidation = validateNumeric(amount, 'Cheque amount');
            if (!amountValidation.valid) {
                return res.status(400).json({ error: amountValidation.error });
            }
            normalizedChequeNo = chequeValidation.value;
            depositAmount = amountValidation.value;
        }

        const deposit = await BankDepositModel.create({
            depositDate: normalizedDepositDate,
            bankName: bankValidation.value,
            branchName: branchValidation.value,
            bankAccountNo: accountValidation.value,
            storeName: storeValidation.value,
            depositMode: mode,
            amount: depositAmount,
            chequeNo: normalizedChequeNo,
            cashDetails: normalizedCashDetails,
        });

        res.status(201).json({ message: 'Bank deposit saved successfully', deposit });
    } catch (error) {
        console.error('Error creating bank deposit:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getCreditRemarks = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const remarks = await StaffModel.getCreditRemarks(paymentId);

        if (!remarks) {
            return res.status(404).json({ error: 'Credit payment not found.' });
        }

        res.status(200).json(remarks);
    } catch (error) {
        console.error('Error fetching credit remarks:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getReports = async (req, res) => {
    try {
        const { startDate, endDate, companyId, staffId } = req.query;
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;

        if (startDate && !datePattern.test(startDate)) {
            return res.status(400).json({ error: 'startDate must be YYYY-MM-DD' });
        }
        if (endDate && !datePattern.test(endDate)) {
            return res.status(400).json({ error: 'endDate must be YYYY-MM-DD' });
        }

        const parsedCompanyId = companyId ? Number(companyId) : null;
        const parsedStaffId = staffId ? Number(staffId) : null;

        if (companyId && (!Number.isInteger(parsedCompanyId) || parsedCompanyId <= 0)) {
            return res.status(400).json({ error: 'companyId must be a positive integer' });
        }
        if (staffId && (!Number.isInteger(parsedStaffId) || parsedStaffId <= 0)) {
            return res.status(400).json({ error: 'staffId must be a positive integer' });
        }

        const reports = await ReportModel.getReports(startDate || null, endDate || null, {
            companyId: parsedCompanyId,
            staffId: parsedStaffId,
        });
        res.status(200).json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getOutletsByStaffAndDayName = async (req, res) => {
    try {
        const { id } = req.params;
        const { day } = req.query; 
        const outlets = await StaffModel.getOutletsForStaffAndDay(id, day);
        res.status(200).json(outlets);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getAllSalesByDate = async (req, res) => {
    try {
        const { date } = req.query; // Optional YYYY-MM-DD
        
        const sales = await StaffModel.getAllSalesByDate(date);
        res.status(200).json(sales);
    } catch (error) {
        console.error('Error fetching global sales by date:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const fetchSalesByDate = async (req, res) => {
    try {
        const { id } = req.params;
        const { date } = req.query; // Expecting YYYY-MM-DD
        
        if (!date) {
            return res.status(400).json({ error: 'Date is required' });
        }

        const sales = await StaffModel.getSalesByDate(id, date);
        res.status(200).json(sales);
    } catch (error) {
        console.error('Error fetching sales by date:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const editCounter = async (req, res) => {
    try {
        const { counterId } = req.params;
        const { outletErpId, outletName, contactNumber, googleLocation } = req.body;
        const existingCounter = await StaffModel.getCounterById(counterId);
        if (!existingCounter) {
            return res.status(404).json({ error: 'Counter not found' });
        }

        const normalizedOutletErpId = String(outletErpId || '').trim();
        const normalizedOutletName = String(outletName || '').trim();
        const normalizedGoogleLocation = String(googleLocation || '').trim();

        if (!normalizedGoogleLocation) {
            return res.status(400).json({ error: 'Google Location is required.' });
        }

        const duplicateCounter = await StaffModel.findDuplicateCounter(
            existingCounter.staff_id,
            normalizedOutletErpId,
            normalizedOutletName,
            counterId
        );

        if (duplicateCounter) {
            return res.status(400).json({ error: 'Same ERP Id or Outlet Name already exists.' });
        }

        await StaffModel.editCounter(counterId, {
            outletErpId: normalizedOutletErpId,
            outletName: normalizedOutletName,
            contactNumber,
            googleLocation: normalizedGoogleLocation,
        });
        res.status(200).json({ message: 'Counter updated successfully' });
    } catch (error) {
        console.error('Error editing counter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteCounter = async (req, res) => {
    try {
        const { counterId } = req.params;
        await StaffModel.deleteCounter(counterId);
        res.status(200).json({ message: 'Counter deleted successfully' });
    } catch (error) {
        console.error('Error deleting counter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getSalePayments = async (req, res) => {
    try {
        const { saleId } = req.params;
        const sale = await PaymentModel.getSaleSummary(saleId);

        if (!sale) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        const payments = await PaymentModel.getBySaleId(saleId);

        res.status(200).json({
            payments,
            summary: {
                price: parseFloat(sale.price),
                paidAmount: parseFloat(sale.paid_amount),
                balanceAmount: parseFloat(sale.balance_amount),
                invoiceNumber: sale.invoice_number,
            },
        });
    } catch (error) {
        console.error('Error fetching sale payments:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error.code === 'ER_NO_SUCH_TABLE'
                ? 'sale_payments table missing — restart server after running node src/initDB.js'
                : undefined,
        });
    }
};

export const addSalePayment = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { paymentDate, paymentMode, amount, referenceNo, referenceDate, creditDays, parentCreditPaymentId } = req.body;

        if (!paymentDate) {
            return res.status(400).json({ error: 'Payment date is required' });
        }
        if (!paymentMode) {
            return res.status(400).json({ error: 'Payment mode is required' });
        }


        const amountValidation = validateNumeric(amount, 'Amount');
        if (!amountValidation.valid) {
            return res.status(400).json({ error: amountValidation.error });
        }
        if (amountValidation.value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }

        const allowedModes = ['cash', 'upi', 'credit', 'cheque'];
        if (!allowedModes.includes(String(paymentMode).toLowerCase())) {
            return res.status(400).json({ error: 'Invalid payment mode' });
        }

        const mode = String(paymentMode).toLowerCase();
        let normalizedParentCreditPaymentId = null;
        if (parentCreditPaymentId) {
            const parentValidation = validatePositiveInteger(parentCreditPaymentId, 'Credit payment reference');
            if (!parentValidation.valid) {
                return res.status(400).json({ error: parentValidation.error });
            }
            normalizedParentCreditPaymentId = parentValidation.value;
        }

        if (normalizedParentCreditPaymentId && mode === 'credit') {
            return res.status(400).json({ error: 'Cannot add credit payment inside another credit entry.' });
        }

        if (mode === 'credit') {
            const daysValidation = validatePositiveInteger(creditDays, 'Credit days');
            if (!daysValidation.valid) {
                return res.status(400).json({ error: daysValidation.error });
            }
        }

        if (mode === 'cheque' && !referenceNo) {
            return res.status(400).json({ error: 'Cheque number is required' });
        }

        const formattedPaymentDate = normalizeDateInput(paymentDate);
        const formattedRefDate = normalizeDateInput(referenceDate);

        const result = await PaymentModel.addPayment(saleId, {
            paymentDate: formattedPaymentDate,
            paymentMode: mode,
            amount: amountValidation.value,
            referenceNo: referenceNo || null,
            referenceDate: formattedRefDate,
            creditDays: mode === 'credit' ? parseInt(creditDays, 10) : null,
            parentCreditPaymentId: normalizedParentCreditPaymentId,
        });


        res.status(201).json({
            message: 'Payment recorded successfully',
            ...result,
        });
    } catch (error) {
        if (error.message === 'SALE_NOT_FOUND') {
            return res.status(404).json({ error: 'Sale not found' });
        }
        if (error.message === 'EXCEEDS_BALANCE') {
            return res.status(400).json({
                error: `Amount exceeds remaining balance (₹${error.remaining.toFixed(2)} left)`,
            });
        }
        if (error.message === 'CREDIT_PAYMENT_NOT_FOUND') {
            return res.status(404).json({ error: 'Credit payment reference not found' });
        }
        if (error.message === 'EXCEEDS_CREDIT_BALANCE') {
            return res.status(400).json({
                error: `Amount exceeds remaining credit amount (â‚¹${error.remaining.toFixed(2)} left)`,
            });
        }
        if (error.message === 'CREDIT_CHILD_CANNOT_BE_CREDIT') {
            return res.status(400).json({ error: 'Cannot add credit payment inside another credit entry.' });
        }
        console.error('Error adding sale payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


export const editSalePayment = async (req, res) => {
    try {
        const { saleId, paymentId } = req.params;
        const { paymentDate, paymentMode, amount, referenceNo, referenceDate, creditDays } = req.body;

        if (!paymentDate) {
            return res.status(400).json({ error: 'Payment date is required' });
        }
        if (!paymentMode) {
            return res.status(400).json({ error: 'Payment mode is required' });
        }

        const amountValidation = validateNumeric(amount, 'Amount');
        if (!amountValidation.valid) {
            return res.status(400).json({ error: amountValidation.error });
        }
        if (amountValidation.value <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }

        const allowedModes = ['cash', 'upi', 'credit', 'cheque'];
        if (!allowedModes.includes(String(paymentMode).toLowerCase())) {
            return res.status(400).json({ error: 'Invalid payment mode' });
        }

        const mode = String(paymentMode).toLowerCase();
        if (mode === 'credit') {
            const daysValidation = validatePositiveInteger(creditDays, 'Credit days');
            if (!daysValidation.valid) {
                return res.status(400).json({ error: daysValidation.error });
            }
        }

        if (mode === 'cheque' && !referenceNo) {
            return res.status(400).json({ error: 'Cheque number is required' });
        }

        let formattedRefDate = referenceDate || null;
        if (formattedRefDate && typeof formattedRefDate === 'string' && formattedRefDate.includes('T')) {
            formattedRefDate = formattedRefDate.split('T')[0];
        }

        let formattedPaymentDate = paymentDate;
        if (formattedPaymentDate && typeof formattedPaymentDate === 'string' && formattedPaymentDate.includes('T')) {
            formattedPaymentDate = formattedPaymentDate.split('T')[0];
        }

        const result = await PaymentModel.updatePayment(paymentId, saleId, {
            paymentDate: formattedPaymentDate,

            paymentMode: mode,
            amount: amountValidation.value,
            referenceNo: referenceNo || null,
            referenceDate: formattedRefDate,
            creditDays: mode === 'credit' ? parseInt(creditDays, 10) : null,

        });


        res.status(200).json({
            message: 'Payment updated successfully',
            ...result,
        });
    } catch (error) {
        if (error.message === 'SALE_NOT_FOUND') {
            return res.status(404).json({ error: 'Sale not found' });
        }


        if (error.message === 'EXCEEDS_BALANCE') {
            return res.status(400).json({
                error: `Amount exceeds remaining balance (₹${error.remaining.toFixed(2)} left)`,
            });
        }
        if (error.message === 'CREDIT_PAYMENT_NOT_FOUND') {
            return res.status(404).json({ error: 'Credit payment reference not found' });
        }
        if (error.message === 'EXCEEDS_CREDIT_BALANCE') {
            return res.status(400).json({
                error: `Amount exceeds remaining credit amount (â‚¹${error.remaining.toFixed(2)} left)`,
            });
        }
        if (error.message === 'CREDIT_CHILD_CANNOT_BE_CREDIT') {
            return res.status(400).json({ error: 'Cannot change this credit payment entry into credit.' });
        }
        console.error('Error updating sale payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updatePaymentMode = async (req, res) => {
    try {
        const { saleId } = req.params;
        const { paymentMode, paidAmount, balanceAmount, referenceNo, referenceDate, creditDays } = req.body;
        
        if (!paymentMode) {
            return res.status(400).json({ error: 'Payment mode is required' });
        }

        const formattedDate = normalizeDateInput(referenceDate);

        await StaffModel.updatePayment(saleId, {
            paymentMode, 
            paidAmount, 
            balanceAmount, 
            referenceNo, 
            referenceDate: formattedDate, 
            creditDays
        });

        res.status(200).json({ message: 'Payment mode updated successfully' });
    } catch (error) {
        console.error('Error updating payment mode:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
