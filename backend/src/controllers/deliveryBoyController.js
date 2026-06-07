import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import CompanyModel from '../models/companyModel.js';
import { validateRequiredText, validateDigitsOnly } from '../utils/validation.js';

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
