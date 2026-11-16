import SellerLedgerModel, { ENTRY_TYPES, PAYMENT_MODES } from '../models/sellerLedgerModel.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const text = (value, max) => {
    const s = String(value ?? '').trim();
    return s ? s.slice(0, max) : null;
};

// Staff accounts only see sellers of their assigned companies.
const canSeeCompany = (user, companyId) => (
    user?.role !== 'staff'
    || !companyId
    || (user.companyIds || []).map(Number).includes(Number(companyId))
);

function readEntry(body) {
    const entryType = String(body?.entryType || '');
    if (!ENTRY_TYPES[entryType]) return { error: 'Choose what kind of entry this is.' };
    const entryDate = String(body?.entryDate || '').slice(0, 10);
    if (!DATE_PATTERN.test(entryDate)) return { error: 'Enter a valid date.' };
    const amount = Math.round(Number(body?.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be more than zero.' };
    if (amount > 999999999) return { error: 'Amount is too large.' };
    let paymentMode = null;
    if (entryType === 'payment') {
        paymentMode = String(body?.paymentMode || '').toLowerCase();
        if (!PAYMENT_MODES.includes(paymentMode)) return { error: 'Choose how the payment was made.' };
    }
    return {
        value: {
            entryType,
            entryDate,
            amount,
            paymentMode,
            reference: text(body?.reference, 100),
            note: text(body?.note, 500),
        },
    };
}

export const getSellerLedgerSummary = async (req, res) => {
    try {
        const companyId = parseInt(req.query.companyId, 10) || null;
        const rows = (await SellerLedgerModel.getSummary(companyId))
            .filter((row) => canSeeCompany(req.user, row.company_id));
        res.json({ sellers: rows });
    } catch (error) {
        console.error('Error fetching seller ledger summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getSellerLedger = async (req, res) => {
    try {
        const sellerId = parseInt(req.params.sellerId, 10);
        const seller = await SellerLedgerModel.getSeller(sellerId);
        if (!seller) return res.status(404).json({ error: 'Seller not found.' });
        if (!canSeeCompany(req.user, seller.company_id)) {
            return res.status(403).json({ error: 'This company is not assigned to your account.' });
        }
        const lines = await SellerLedgerModel.getLedger(sellerId);
        res.json({ seller, lines });
    } catch (error) {
        console.error('Error fetching seller ledger:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createSellerLedgerEntry = async (req, res) => {
    try {
        const sellerId = parseInt(req.body?.sellerId, 10);
        const seller = await SellerLedgerModel.getSeller(sellerId);
        if (!seller) return res.status(400).json({ error: 'Seller not found.' });
        if (!canSeeCompany(req.user, seller.company_id)) {
            return res.status(403).json({ error: 'This company is not assigned to your account.' });
        }
        const { value, error } = readEntry(req.body);
        if (error) return res.status(400).json({ error });
        const entry = await SellerLedgerModel.createEntry({
            ...value,
            sellerId,
            companyId: seller.company_id || null,
            createdBy: req.user?.id || null,
        });
        res.status(201).json({ message: `${ENTRY_TYPES[value.entryType].label} saved.`, entry });
    } catch (error) {
        console.error('Error saving seller ledger entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateSellerLedgerEntry = async (req, res) => {
    try {
        const id = parseInt(req.params.entryId, 10);
        const existing = await SellerLedgerModel.getEntry(id);
        if (!existing) return res.status(404).json({ error: 'Entry not found.' });
        if (!canSeeCompany(req.user, existing.company_id)) {
            return res.status(403).json({ error: 'This company is not assigned to your account.' });
        }
        const { value, error } = readEntry(req.body);
        if (error) return res.status(400).json({ error });
        const entry = await SellerLedgerModel.updateEntry(id, value);
        res.json({ message: 'Entry updated.', entry });
    } catch (error) {
        console.error('Error updating seller ledger entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteSellerLedgerEntry = async (req, res) => {
    try {
        const id = parseInt(req.params.entryId, 10);
        const existing = await SellerLedgerModel.getEntry(id);
        if (!existing) return res.status(404).json({ error: 'Entry not found.' });
        if (!canSeeCompany(req.user, existing.company_id)) {
            return res.status(403).json({ error: 'This company is not assigned to your account.' });
        }
        await SellerLedgerModel.deleteEntry(id);
        res.json({ message: 'Entry deleted.' });
    } catch (error) {
        console.error('Error deleting seller ledger entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
