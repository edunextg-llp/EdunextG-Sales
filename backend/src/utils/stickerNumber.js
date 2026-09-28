const PREFIX = 'BFP';
const PAD_LENGTH = 4;

export function formatStickerNumber(sequenceValue) {
    return `${PREFIX}${String(sequenceValue).padStart(PAD_LENGTH, '0')}`;
}

export function parseStickerNumber(stickerNumber) {
    const match = String(stickerNumber).match(/^BFP(\d+)$/i);
    return match ? parseInt(match[1], 10) : null;
}
