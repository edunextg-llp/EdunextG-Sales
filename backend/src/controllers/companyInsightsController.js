import CompanyInsightsModel from '../models/companyInsightsModel.js';

// GET /api/staff/reports/company-insights: data for the dashboard's company-wise charts.
export const getCompanyInsights = async (req, res) => {
    try {
        const data = await CompanyInsightsModel.get();
        res.set('Cache-Control', 'no-store');
        return res.json(data);
    } catch (error) {
        console.error('Error fetching company insights:', error);
        return res.status(500).json({ error: 'Unable to load the company insights.' });
    }
};
