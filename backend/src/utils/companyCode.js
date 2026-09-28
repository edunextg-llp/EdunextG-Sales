const PREFIX = 'BFPCO';
const PAD_LENGTH = 3;

export function formatCompanyCode(sequenceValue) {
    return `${PREFIX}${String(sequenceValue).padStart(PAD_LENGTH, '0')}`;
}

export function parseCompanyCode(companyCode) {
    const match = String(companyCode).match(/^BFPCO(\d+)$/i);
    return match ? parseInt(match[1], 10) : null;
}
