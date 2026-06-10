export function formatDeliveryLoginId(id) {
    return `BFPDB${String(id).padStart(3, '0')}`;
}

export function generateDeliveryPasscode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
