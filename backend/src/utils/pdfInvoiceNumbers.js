import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Reads the invoice numbers printed in an invoice PDF (one PDF can hold many bills).
// Company layouts differ: EVEREST prints "Invoice No:- IN-16078314-5041", L'Oreal prints
// "Invoice # : IN10098502602816". The number is the first value after such a label.
// Numbers are returned normalized: upper case, letters and digits only (IN-5125-554 -> IN5125554).

export const normalizeInvoiceNo = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Key used to match a PDF number with an Add Sales invoice: some companies are saved
// without the "IN" prefix (EVEREST IN-16078314-5041 is saved as 160783145041).
export const invoiceMatchKey = (value) => normalizeInvoiceNo(value).replace(/^IN(?=\d)/, '');

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
