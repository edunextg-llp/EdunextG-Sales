export function normalizeInvoiceNumber(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

export function getCompanyBillPrefix(companyName) {
    const letters = String(companyName || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase();
    return (letters.slice(0, 3) || 'BIL').padEnd(3, 'X');
}
