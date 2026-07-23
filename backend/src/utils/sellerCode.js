const PREFIX = 'BFPSL';
const PAD_LENGTH = 4;

export function formatSellerCode(sequenceValue) {
    return `${PREFIX}${String(sequenceValue).padStart(PAD_LENGTH, '0')}`;
}

export function parseSellerCode(sellerCode) {
    const match = String(sellerCode).match(/^BFPSL(\d+)$/i);
    return match ? parseInt(match[1], 10) : null;
}
