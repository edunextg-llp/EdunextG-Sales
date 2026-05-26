import DeliveryBoyModel from '../models/deliveryBoyModel.js';
import { validateRequiredText, validateDigitsOnly } from '../utils/validation.js';

export const createDeliveryBoy = async (req, res) => {
    try {
        const { name, contactNo } = req.body;
        
        const nameValidation = validateRequiredText(name, 'Delivery Boy name');
        if (!nameValidation.valid) {
            return res.status(400).json({ error: nameValidation.error });
        }
        
        const contactValidation = validateDigitsOnly(contactNo, 'Contact number');
        if (!contactValidation.valid) {
            return res.status(400).json({ error: contactValidation.error });
        }

        const deliveryBoyId = await DeliveryBoyModel.create(nameValidation.value, contactValidation.value);
        res.status(201).json({ message: 'Delivery Boy created successfully', deliveryBoyId });
    } catch (error) {
        console.error('Error creating delivery boy:', error);
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
