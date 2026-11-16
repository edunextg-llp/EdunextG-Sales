// DMS item codes: BFPDI000001, BFPDI000002, ...
// Stored in seller_items.item_code. This is our own code; product_erp_id stays the
// company's ERP id that stock, purchase and damage screens match on.
const PREFIX = 'BFPDI';
const PAD_LENGTH = 6;

// When several items get codes in one go (the first backfill, an Excel upload),
// these companies come first, in this order. Everything else follows.
const COMPANY_ORDER = ['EVEREST', 'EVEREST NEEVAN', 'LOREAL', 'SIL', 'SALONI', 'ASSAM TEA'];

export function formatItemCode(sequenceValue) {
    return `${PREFIX}${String(sequenceValue).padStart(PAD_LENGTH, '0')}`;
}

export function parseItemCode(itemCode) {
    const match = String(itemCode || '').match(/^BFPDI(\d+)$/i);
    return match ? parseInt(match[1], 10) : null;
}

// "L'Oréal" -> "LOREAL", "EVEREST (NEEVAN)" -> "EVEREST NEEVAN", "ASSAM TEA CORPORATION" -> "ASSAM TEA CORPORATION"
const normaliseCompany = (name) =>
    String(name || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\bNEVAN\b/g, 'NEEVAN')
        .replace(/\bEVERST\b/g, 'EVEREST')
        .replace(/\bL OREAL\b/g, 'LOREAL')
        .trim();

export function companyRank(companyName) {
    const name = normaliseCompany(companyName);
    // Exact match first so "EVEREST" doesn't also catch "EVEREST NEEVAN".
    const exact = COMPANY_ORDER.indexOf(name);
    if (exact !== -1) return exact;
    const prefix = COMPANY_ORDER.findIndex((entry) => name.startsWith(`${entry} `));
    return prefix !== -1 ? prefix : COMPANY_ORDER.length;
}

/**
 * Gives every seller_items row without an item_code the next BFPDI number.
 * Rows are numbered by company (COMPANY_ORDER first), then seller, then the order
 * they were added. Pass a connection that is inside a transaction when you can.
 * Returns how many codes were assigned.
 */
export async function assignMissingItemCodes(connection) {
    await connection.query('INSERT IGNORE INTO item_code_sequence (id, seq_value) VALUES (1, 0)');
    // Lock the counter first so two saves at the same time can't get the same number.
    const [[seqRow]] = await connection.query('SELECT seq_value FROM item_code_sequence WHERE id = 1 FOR UPDATE');

    const [missing] = await connection.query(
        `SELECT si.id, si.company_id, si.seller_id, c.name AS company_name
         FROM seller_items si
         LEFT JOIN companies c ON c.id = si.company_id
         WHERE si.item_code IS NULL OR si.item_code = ''`
    );
    if (!missing.length) return 0;

    const [[maxRow]] = await connection.query(
        `SELECT MAX(CAST(SUBSTRING(item_code, ${PREFIX.length + 1}) AS UNSIGNED)) AS max_seq
         FROM seller_items
         WHERE item_code REGEXP '^BFPDI[0-9]+$'`
    );

    missing.sort(
        (a, b) =>
            companyRank(a.company_name) - companyRank(b.company_name) ||
            a.company_id - b.company_id ||
            a.seller_id - b.seller_id ||
            a.id - b.id
    );

    let next = Math.max(Number(seqRow?.seq_value) || 0, Number(maxRow?.max_seq) || 0);
    for (const row of missing) {
        next += 1;
        await connection.query('UPDATE seller_items SET item_code = ? WHERE id = ?', [formatItemCode(next), row.id]);
    }
    await connection.query('UPDATE item_code_sequence SET seq_value = ? WHERE id = 1', [next]);
    return missing.length;
}
