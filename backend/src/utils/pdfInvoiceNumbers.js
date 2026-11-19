import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Reads the invoice numbers printed in an invoice PDF (one PDF can hold many bills).
// Company layouts differ: EVEREST prints "Invoice No:- IN-16078314-5041", L'Oreal prints
// "Invoice # : IN10098502602816". The number is the first value after such a label.
// Numbers are returned normalized: upper case, letters and digits only (IN-5125-554 -> IN5125554).

export const normalizeInvoiceNo = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// EVEREST and EVEREST (NEEVAN) do not count the "IN" prefix: IN-16078314-5041 is
// 160783145041 (that is how Add Sales saves it). Every other company keeps "IN".
export const dropsInPrefix = (companyName) => /EVEREST/i.test(String(companyName || ''));

// The invoice number as the company counts it: IN-5784-885 -> IN5784885,
// or 5784885 for EVEREST / EVEREST (NEEVAN).
export const companyInvoiceNo = (value, companyName) => {
    const normalized = normalizeInvoiceNo(value);
    return dropsInPrefix(companyName) ? normalized.replace(/^IN(?=\d)/, '') : normalized;
};

const LABEL = /^(invoice|inv\.?|bill)\s*(no\.?|number|#)?\s*[:\-.]*$/i;
const SEPARATOR = /^[\s:\-.#]*$/;
// "Invoice No:- IN-16078314-5041" in one piece of text.
const INLINE = /(?:invoice|inv\.?|bill)\s*(?:no\.?|number|#)\s*[:\-.]*\s*([A-Z]{0,6}[-/ ]?\d[\dA-Z\-/]{3,})/gi;
// A value: at least 4 digits, letters / dashes / slashes allowed (not a date).
const looksLikeNumber = (text) => {
    const value = String(text || '').trim();
    if (!/^[A-Z0-9][A-Z0-9\-/]{3,40}$/i.test(value)) return false;
    if ((value.match(/\d/g) || []).length < 4) return false;
    return !/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(value);
};

async function pageTexts(buffer) {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
    const pages = [];
    try {
        for (let i = 1; i <= doc.numPages; i += 1) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            pages.push(content.items.map((item) => String(item.str || '').trim()).filter(Boolean));
            page.cleanup();
        }
    } finally {
        await doc.destroy();
    }
    return pages;
}

export async function invoiceNumbersFromPdf(buffer) {
    const found = new Set();
    const add = (raw) => {
        const value = normalizeInvoiceNo(raw);
        if (value && looksLikeNumber(value)) found.add(value);
    };
    const pages = await pageTexts(buffer);
    pages.forEach((tokens) => {
        // Label and value in separate pieces: "Invoice No:-" | "IN-16078314-5041".
        tokens.forEach((token, index) => {
            // "Invoice #" may be split as "Invoice" | "#".
            const joined = `${token} ${tokens[index + 1] || ''}`.trim();
            const labelSize = LABEL.test(token) && /(no|number|#)/i.test(token) ? 1
                : LABEL.test(joined) && /(no|number|#)/i.test(joined) ? 2 : 0;
            if (!labelSize) return;
            for (let j = index + labelSize; j < Math.min(tokens.length, index + labelSize + 4); j += 1) {
                if (SEPARATOR.test(tokens[j])) continue;
                if (looksLikeNumber(tokens[j])) add(tokens[j]);
                break;
            }
        });
        // Label and value in the same piece of text.
        for (const match of tokens.join(' ').matchAll(INLINE)) add(match[1]);
    });
    return [...found];
}

// ---------------------------------------------------------------------------------------------
// Invoice details for auto-creating Add Sales: one entry per invoice in the PDF.
// Supported layouts: EVEREST / EVEREST (NEEVAN) ("Invoice No:-", "TO:-", "Buyer Erp Id:-",
// "Net Payable Amount:") and L'Oreal ("Invoice #", "Billed to :", "Net Payable Amt.").
// An invoice printed over several pages is read as one invoice.

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad = (n) => String(n).padStart(2, '0');
const isSeparator = (token) => SEPARATOR.test(token) || token === '₹';
const toAmount = (token) => {
    const text = String(token || '').replace(/[₹,\s]/g, '');
    return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
};

// "14 Nov 2026, 10:20 am" or "12-11-2026" -> "2026-11-14" / "2026-11-12".
const toIsoDate = (text) => {
    const value = String(text || '').trim();
    let m = value.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})/);
    if (m && MONTHS[m[2].toUpperCase()]) return `${m[3]}-${pad(MONTHS[m[2].toUpperCase()])}-${pad(m[1])}`;
    m = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return null;
};

// First non-separator token after index i (within a few tokens).
const valueAfter = (tokens, i, look = 4) => {
    for (let j = i + 1; j < Math.min(tokens.length, i + 1 + look); j += 1) {
        if (!isSeparator(tokens[j])) return tokens[j];
    }
    return null;
};

// The invoice number printed on one page (first labelled value).
const pageInvoiceNo = (tokens) => {
    for (let i = 0; i < tokens.length; i += 1) {
        const joined = `${tokens[i]} ${tokens[i + 1] || ''}`.trim();
        const size = LABEL.test(tokens[i]) && /(no|number|#)/i.test(tokens[i]) ? 1
            : LABEL.test(joined) && /(no|number|#)/i.test(joined) ? 2 : 0;
        if (!size) continue;
        const value = valueAfter(tokens, i + size - 1);
        if (value && looksLikeNumber(value)) return normalizeInvoiceNo(value);
    }
    const inline = tokens.join(' ').matchAll(INLINE).next().value;
    return inline ? normalizeInvoiceNo(inline[1]) : null;
};

// Product lines: each row starts with its serial number (1, 2, 3 ...) followed by the item
// name. Rows continue across pages (page 2 starts at 10), so counting runs over all pages.
const lineCount = (groupPages) => {
    let next = 1;
    groupPages.flat().forEach((token, i, tokens) => {
        if (token === String(next) && /[A-Za-z]{2}/.test(tokens[i + 1] || '')) next += 1;
    });
    return next - 1;
};

function readHeader(tokens) {
    const details = { date: null, outletName: null, outletErpId: null, salesman: null, amount: null };
    for (let i = 0; i < tokens.length; i += 1) {
        const t = tokens[i];
        // EVEREST "Salesman Name:-" | "Debasish Das (Kol-1)"; L'Oreal "Salesman" | ":" | "ROHIT KAIRI".
        if (!details.salesman && /^salesman(\s+name)?\s*[:\-]*$/i.test(t)) details.salesman = valueAfter(tokens, i);
        if (!details.date && /^(invoice\s*)?date\s*[:\-]*$/i.test(t)) details.date = toIsoDate(valueAfter(tokens, i));
        if (!details.outletName && /^TO\s*:-?\s*\S/i.test(t)) details.outletName = t.replace(/^TO\s*:-?\s*/i, '').trim();
        if (!details.outletName && /^billed\s+to\s*:?$/i.test(t)) details.outletName = valueAfter(tokens, i);
        if (!details.outletErpId && /^buyer\s+erp\s+id\s*[:\-]*$/i.test(t)) details.outletErpId = valueAfter(tokens, i);
    }
    return details;
}

function readAmount(tokens) {
    let amount = null;
    for (let i = 0; i < tokens.length; i += 1) {
        // EVEREST: "Net Payable Amount:" | "₹" | "618.00"
        if (/^net\s+payable\s+amount\s*:?$/i.test(tokens[i])) {
            const value = toAmount(valueAfter(tokens, i));
            if (value !== null) amount = value;
        }
        // L'Oreal: "Net" | "Payable" | "Amt." | <10 values ...> ; Net Payable is the last value of the row.
        if (/^net$/i.test(tokens[i]) && /^payable$/i.test(tokens[i + 1] || '') && /^amt\.?$/i.test(tokens[i + 2] || '')) {
            let last = null;
            for (let j = i + 3; j < tokens.length && toAmount(tokens[j]) !== null; j += 1) last = toAmount(tokens[j]);
            if (last !== null) amount = last;
        }
    }
    return amount;
}

export async function invoiceDetailsFromPdf(buffer) {
    const pages = await pageTexts(buffer);
    const groups = new Map();
    pages.forEach((tokens) => {
        const number = pageInvoiceNo(tokens);
        if (!number) return;
        if (!groups.has(number)) groups.set(number, []);
        groups.get(number).push(tokens);
    });
    return [...groups.entries()].map(([invoiceNo, groupPages]) => {
        const header = readHeader(groupPages[0]);
        const all = groupPages.flat();
        return {
            invoiceNo,
            ...header,
            amount: readAmount(all),
            itemCount: lineCount(groupPages),
        };
    });
}
