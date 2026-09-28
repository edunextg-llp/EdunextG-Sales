const PREFIX = 'BFPECH';
const PAD_LENGTH = 3;

export function formatChalanCode(sequenceValue) {
    return `${PREFIX}${String(sequenceValue).padStart(PAD_LENGTH, '0')}`;
}

export function parseChalanCode(chalanCode) {
    const match = String(chalanCode).match(/^BFPECH(\d+)$/i);
    return match ? parseInt(match[1], 10) : null;
}
