import { createWorker } from 'tesseract.js';
import english from '@tesseract.js-data/eng';
import sharp from 'sharp';

const normalize = (value) => String(value ?? '').normalize('NFKC').toUpperCase()
    .replace(/[–—]/g, '-').replace(/\s+/g, '');

export function checkInvoiceText(text, expected) {
    const number = normalize(expected);
    if (!number) return { matched: false, code: 'INVOICE_NUMBER_MISSING', error: 'This bill has no invoice number. Please contact your administrator.' };
    // Only compare explicitly labelled invoice/bill numbers, never phone numbers,
    // totals, arbitrary substrings, or OCR guesses such as O -> 0.
    const source = String(text ?? '').normalize('NFKC').toUpperCase().replace(/[–—]/g, '-');
    const pattern = /\b(?:TAX\s+)?(?:INVOICE|INV\.?|BILL)\s*(?:(?:NO\.?|NUMBER|NUM\.?|#)\s*)?[:#.-]?\s*(?=[A-Z0-9 /\-]*[0-9])([A-Z0-9]+(?:[ \t]*[/\-][ \t]*[A-Z0-9]+)*)/g;
    const candidates = [...source.matchAll(pattern)].map((match) => normalize(match[1]))
        .filter((candidate) => /\d/.test(candidate));
    const unique = [...new Set(candidates)];
    if (unique.length === 1 && unique[0] === number) return { matched: true, invoiceNumber: String(expected) };
    if (!unique.length) return { matched: false, code: 'INVOICE_NUMBER_UNREADABLE', error: `Cannot read the invoice number. Take a clearer photo showing the invoice number ${expected}.` };
    return { matched: false, code: 'INVOICE_NUMBER_MISMATCH', error: `Invoice number does not match. Selected bill: ${expected}. Photo: ${unique.slice(0, 4).join(', ')}. Upload the correct invoice photo.` };
}

let active = 0;
export const invoicePhotoOcr = {
    async read(buffer) {
        if (active >= 2) throw new Error('OCR_BUSY');
        active++;
        let worker;
        let timer;
        let expired = false;
        try {
            const work = (async () => {
                const image = await sharp(buffer, { limitInputPixels: 25000000 })
                    .rotate().resize({ width: 2400, withoutEnlargement: true }).grayscale().normalize().png().toBuffer();
                if (expired) throw new Error('OCR_TIMEOUT');
                worker = await createWorker('eng', 1, { langPath: english.langPath, gzip: true, cacheMethod: 'none', errorHandler: () => {} });
                if (expired) { await worker.terminate(); throw new Error('OCR_TIMEOUT'); }
                await worker.setParameters({ tessedit_pageseg_mode: '11' });
                const { data } = await worker.recognize(image);
                return data.confidence >= 40 ? data.text : '';
            })();
            return await Promise.race([work, new Promise((_, reject) => {
                timer = setTimeout(() => { expired = true; reject(new Error('OCR_TIMEOUT')); }, 30000);
            })]);
        } finally {
            clearTimeout(timer);
            if (worker) await worker.terminate();
            active--;
        }
    },
};

export async function verifyInvoicePhoto(buffer, expected) {
    if (!normalize(expected)) return checkInvoiceText('', expected);
    return checkInvoiceText(await invoicePhotoOcr.read(buffer), expected);
}
