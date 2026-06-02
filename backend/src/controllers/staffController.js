import StaffModel from '../models/staffModel.js';
import PaymentModel from '../models/paymentModel.js';
import CompanyModel from '../models/companyModel.js';
import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import {
    validateDigitsOnly,
    validateNumeric,
    validatePositiveInteger,
    validateRequiredText,
} from '../utils/validation.js';

async function resolveCompanyId(companyName) {
    if (!companyName || !String(companyName).trim()) {
        return null;
    }
    return CompanyModel.findOrCreateByName(String(companyName).trim());
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

export const createStaff = async (req, res) => {
    try {
        const { name, contactNo, companyName, assignments } = req.body;

        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const companyId = await resolveCompanyId(companyName);

        // Create staff entry
        const staffId = await StaffModel.create(name, contactValidation.value, companyId);

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
            for (let i = 0; i < counters.length; i++) {
                const counter = counters[i];
                const contactValidation = validateDigitsOnly(
                    counter.contactNumber,
                    `Counter ${i + 1} contact number`
                );
                if (!contactValidation.valid) {
                    return res.status(400).json({ error: contactValidation.error });
                }
                await StaffModel.addCounter(id, day, location, {
                    ...counter,
                    contactNumber: contactValidation.value,
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
            Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: []
        };
        locations.forEach(loc => {
            if (assignments[loc.day]) {
                assignments[loc.day].push({ locationName: loc.location_name });
            }
        });

        res.status(200).json({ ...staff, assignments });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contactNo, companyName, assignments } = req.body;

        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const companyId = await resolveCompanyId(companyName);

        // Update staff info
        await StaffModel.update(id, name, contactValidation.value, companyId);

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
        const { invoiceNumber, price } = req.body;

        const invoiceValidation = validateRequiredText(invoiceNumber, 'Invoice number');
        if (!invoiceValidation.valid) {
            return res.status(400).json({ error: invoiceValidation.error });
        }
        const priceValidation = validateNumeric(price, 'Price');
        if (!priceValidation.valid) {
            return res.status(400).json({ error: priceValidation.error });
        }

        const existing = await StaffModel.getSaleById(saleId);
        if (!existing) {
            return res.status(404).json({ error: 'Sale not found' });
        }

        const updated = await StaffModel.updateSale(
            saleId,
            invoiceValidation.value,
            priceValidation.value
        );

        res.status(200).json({
            message: 'Sale updated successfully',
            sale: {
                id: updated.id,
                shopName: updated.outlet_name,
                outletErpId: updated.outlet_erp_id || '',
                invoiceNumber: updated.invoice_number,
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
        const { packagingStatus, deliveryBoyId, vehicleNo } = req.body;

        if (!['not_packing', 'packing', 'packing_done', 'out_for_delivery', 'delivered', 'cancelled'].includes(packagingStatus)) {
            return res.status(400).json({ error: 'Invalid packaging status' });
        }

        await StaffModel.updatePackagingStatus(saleId, packagingStatus, deliveryBoyId || null, vehicleNo || null);
        res.status(200).json({ message: 'Packaging status updated successfully' });
    } catch (error) {
        console.error('Error updating packaging status:', error);
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
        const { outletErpId, outletName, contactNumber } = req.body;
        
        await StaffModel.editCounter(counterId, { outletErpId, outletName, contactNumber });
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
        const parsed = parsePaymentBody(req.body);
        if (parsed.error) {
            return res.status(400).json({ error: parsed.error });
        }

<<<<<<< HEAD
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

        const formattedPaymentDate = normalizeDateInput(paymentDate);
        const formattedRefDate = normalizeDateInput(referenceDate);

        const result = await PaymentModel.addPayment(saleId, {
            paymentDate: formattedPaymentDate,
            paymentMode: mode,
            amount: amountValidation.value,
            referenceNo: referenceNo || null,
            referenceDate: formattedRefDate,
            creditDays: mode === 'credit' ? parseInt(creditDays, 10) : null,
        });
=======
        const result = await PaymentModel.addPayment(saleId, parsed.data);
>>>>>>> 6b12021be87627cf361a91ede0efaed0830d0825

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
        console.error('Error adding sale payment:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

<<<<<<< HEAD
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
=======
function parsePaymentBody(body) {
    const { paymentDate, paymentMode, amount, referenceNo, referenceDate, creditDays } = body;

    if (!paymentDate) {
        return { error: 'Payment date is required' };
    }
    if (!paymentMode) {
        return { error: 'Payment mode is required' };
    }

    const amountValidation = validateNumeric(amount, 'Amount');
    if (!amountValidation.valid) {
        return { error: amountValidation.error };
    }
    if (amountValidation.value <= 0) {
        return { error: 'Amount must be greater than zero' };
    }

    const allowedModes = ['cash', 'upi', 'credit', 'cheque'];
    if (!allowedModes.includes(String(paymentMode).toLowerCase())) {
        return { error: 'Invalid payment mode' };
    }

    const mode = String(paymentMode).toLowerCase();
    if (mode === 'credit') {
        const daysValidation = validatePositiveInteger(creditDays, 'Credit days');
        if (!daysValidation.valid) {
            return { error: daysValidation.error };
        }
    }

    if (mode === 'cheque' && !referenceNo) {
        return { error: 'Cheque number is required' };
    }

    let formattedRefDate = referenceDate || null;
    if (formattedRefDate && typeof formattedRefDate === 'string' && formattedRefDate.includes('T')) {
        formattedRefDate = formattedRefDate.split('T')[0];
    }

    return {
        data: {
            paymentDate,
>>>>>>> 6b12021be87627cf361a91ede0efaed0830d0825
            paymentMode: mode,
            amount: amountValidation.value,
            referenceNo: referenceNo || null,
            referenceDate: formattedRefDate,
            creditDays: mode === 'credit' ? parseInt(creditDays, 10) : null,
<<<<<<< HEAD
        });
=======
        },
    };
}

export const updateSalePayment = async (req, res) => {
    try {
        const { saleId, paymentId } = req.params;
        const parsed = parsePaymentBody(req.body);
        if (parsed.error) {
            return res.status(400).json({ error: parsed.error });
        }

        const result = await PaymentModel.updatePayment(saleId, paymentId, parsed.data);
>>>>>>> 6b12021be87627cf361a91ede0efaed0830d0825

        res.status(200).json({
            message: 'Payment updated successfully',
            ...result,
        });
    } catch (error) {
        if (error.message === 'SALE_NOT_FOUND') {
            return res.status(404).json({ error: 'Sale not found' });
        }
<<<<<<< HEAD
=======
        if (error.message === 'PAYMENT_NOT_FOUND') {
            return res.status(404).json({ error: 'Payment not found' });
        }
>>>>>>> 6b12021be87627cf361a91ede0efaed0830d0825
        if (error.message === 'EXCEEDS_BALANCE') {
            return res.status(400).json({
                error: `Amount exceeds remaining balance (₹${error.remaining.toFixed(2)} left)`,
            });
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
