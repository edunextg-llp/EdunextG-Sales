import StaffModel from '../models/staffModel.js';

export const createStaff = async (req, res) => {
    try {
        const { name, contactNo, assignments } = req.body;

        // Create staff entry
        const staffId = await StaffModel.create(name, contactNo);

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
            for (const counter of counters) {
                await StaffModel.addCounter(id, day, location, counter);
            }
        }

        res.status(201).json({ message: 'Counters added successfully' });
    } catch (error) {
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
        const { name, contactNo, assignments } = req.body;

        // Update staff info
        await StaffModel.update(id, name, contactNo);

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
        const outlets = await StaffModel.getOutletsForStaffAndDay(id, dayName);
        
        res.status(200).json(outlets);
    } catch (error) {
        console.error('Error fetching outlets by date:', error);
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

        await StaffModel.saveSales(id, date, sales);
        res.status(201).json({ message: 'Sales recorded successfully' });
    } catch (error) {
        console.error('Error recording sales:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
