import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import CompanyModel from '../models/companyModel.js';
import { validateRequiredText, validateDigitsOnly } from '../utils/validation.js';
import jwt from 'jsonwebtoken';

async function parseAssignedCompanyIds(companyId, companyIds) {
    const requestedCompanyIds = Array.isArray(companyIds) ? companyIds : [companyId];
    const parsedCompanyIds = [
        ...new Set(
            requestedCompanyIds
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0)
        ),
    ];

    if (parsedCompanyIds.length === 0) {
        return { error: 'Company is required' };
    }

    const assignedCompanies = await CompanyModel.getAssignedToStaff();
    const assignedCompanyIds = new Set(assignedCompanies.map(company => company.id));
    const allCompaniesExist = parsedCompanyIds.every((id) => assignedCompanyIds.has(id));
    if (!allCompaniesExist) {
        return { error: 'Select a company assigned to staff' };
    }

    return { companyIds: parsedCompanyIds };
}

export const createDeliveryBoy = async (req, res) => {
    try {
        const { name, contactNo, companyId, companyIds } = req.body;
        
        const nameValidation = validateRequiredText(name, 'Delivery Boy name');
        if (!nameValidation.valid) {
            return res.status(400).json({ error: nameValidation.error });
        }
        
        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const companyParse = await parseAssignedCompanyIds(companyId, companyIds);
        if (companyParse.error) {
            return res.status(400).json({ error: companyParse.error });
        }
        const parsedCompanyIds = companyParse.companyIds;

        const deliveryBoyId = await DeliveryBoyModel.create(
            nameValidation.value,
            contactValidation.value,
            parsedCompanyIds[0]
        );
        await DeliveryBoyModel.setCompanies(deliveryBoyId, parsedCompanyIds);
        res.status(201).json({ message: 'Delivery Boy created successfully', deliveryBoyId });
    } catch (error) {
        console.error('Error creating delivery boy:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStaffAssignedCompanies = async (req, res) => {
    try {
        const companies = await CompanyModel.getAssignedToStaff();
        res.status(200).json(companies);
    } catch (error) {
        console.error('Error fetching staff assigned companies:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateDeliveryBoy = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contactNo, companyId, companyIds } = req.body;

        const existing = await DeliveryBoyModel.getById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Delivery Boy not found' });
        }

        const nameValidation = validateRequiredText(name, 'Delivery Boy name');
        if (!nameValidation.valid) {
            return res.status(400).json({ error: nameValidation.error });
        }

        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const companyParse = await parseAssignedCompanyIds(companyId, companyIds);
        if (companyParse.error) {
            return res.status(400).json({ error: companyParse.error });
        }
        const parsedCompanyIds = companyParse.companyIds;

        await DeliveryBoyModel.update(
            id,
            nameValidation.value,
            contactValidation.value,
            parsedCompanyIds[0]
        );
        await DeliveryBoyModel.setCompanies(id, parsedCompanyIds);

        res.status(200).json({ message: 'Delivery Boy updated successfully' });
    } catch (error) {
        console.error('Error updating delivery boy:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteDeliveryBoy = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await DeliveryBoyModel.delete(id);

        if (!deleted) {
            return res.status(404).json({ error: 'Delivery Boy not found' });
        }

        res.status(200).json({ message: 'Delivery Boy deleted successfully' });
    } catch (error) {
        console.error('Error deleting delivery boy:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getDeliveryBoys = async (req, res) => {
    try {
        const deliveryBoys = await DeliveryBoyModel.getAll();
        res.status(200).json(deliveryBoys);
    } catch (error) {
        console.error('Error fetching delivery boys:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const mobileLogin = async (req, res) => {
    try {
        const loginValidation = validateRequiredText(req.body.deliveryLoginId, 'Delivery login ID');
        if (!loginValidation.valid) {
            return res.status(400).json({ error: loginValidation.error });
        }
        const passValidation = validateRequiredText(req.body.passcode, 'Passcode');
        if (!passValidation.valid) {
            return res.status(400).json({ error: passValidation.error });
        }

        const deliveryBoy = await DeliveryBoyModel.getByLogin(
            loginValidation.value,
            passValidation.value
        );

        if (!deliveryBoy) {
            return res.status(401).json({ error: 'Invalid delivery login ID or passcode' });
        }

        const token = jwt.sign(
            {
                type: 'delivery_boy',
                deliveryBoyId: deliveryBoy.id,
                deliveryLoginId: deliveryBoy.delivery_login_id,
            },
            process.env.DELIVERY_JWT_SECRET || process.env.JWT_SECRET || 'delivery-secret',
            { expiresIn: '30d' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            deliveryBoy,
        });
    } catch (error) {
        console.error('Error during delivery boy mobile login:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMobileProfile = async (req, res) => {
    try {
        const deliveryBoy = await DeliveryBoyModel.getById(req.deliveryBoyId);
        if (!deliveryBoy) {
            return res.status(404).json({ error: 'Delivery Boy not found' });
        }
        res.status(200).json({
            id: deliveryBoy.id,
            name: deliveryBoy.name,
            contact_no: deliveryBoy.contact_no,
            delivery_login_id: deliveryBoy.delivery_login_id,
            company_name: deliveryBoy.company_name,
            company_ids: deliveryBoy.company_ids,
        });
    } catch (error) {
        console.error('Error fetching delivery boy mobile profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMobileAssignedItems = async (req, res) => {
    try {
        const status = String(req.query.status || '').trim();
        const date = String(req.query.date || '').trim();
        const allowedStatuses = ['out_for_delivery', 'delivered', 'cancelled', 'returned'];

        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status filter' });
        }

        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
        }

        const items = await DeliveryBoyModel.getAssignedSales(req.deliveryBoyId, { status, date });
        res.status(200).json(items);
    } catch (error) {
        console.error('Error fetching delivery boy assigned items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateMobileAssignedItemStatus = async (req, res) => {
    try {
        const saleId = Number(req.params.saleId);
        if (!Number.isInteger(saleId) || saleId <= 0) {
            return res.status(400).json({ error: 'saleId must be a positive integer' });
        }

        const status = String(req.body.status || '').trim().toLowerCase();
        const allowedStatuses = ['delivered', 'cancelled', 'returned'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Status must be delivered, cancelled, or returned' });
        }

        const updatedSale = await DeliveryBoyModel.updateAssignedSaleStatus(
            req.deliveryBoyId,
            saleId,
            status
        );

        if (!updatedSale) {
            return res.status(404).json({ error: 'Assigned delivery item not found' });
        }

        res.status(200).json({
            message: 'Delivery status updated successfully',
            sale: updatedSale,
        });
    } catch (error) {
        console.error('Error updating delivery boy assigned item status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
