import crypto from 'crypto';

export function formatDeliveryLoginId(id) {
    return `BFPDB${String(id).padStart(3, '0')}`;
}

export function generateDeliveryPasscode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function getCredentialEncryptionKey() {
    const secret = process.env.DELIVERY_CREDENTIAL_SECRET
        || process.env.JWT_SECRET
        || 'delivery-credential-secret';
    return crypto.createHash('sha256').update(secret).digest();
}

export function encryptDeliveryPasscode(passcode) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getCredentialEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(passcode), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptDeliveryPasscode(value) {
    if (!value) return null;
    const stored = String(value);
    if (/^\d{6}$/.test(stored)) return stored;
    try {
        const [ivValue, tagValue, encryptedValue] = stored.split('.');
        if (!ivValue || !tagValue || !encryptedValue) return null;
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            getCredentialEncryptionKey(),
            Buffer.from(ivValue, 'base64')
        );
        decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
        return Buffer.concat([
            decipher.update(Buffer.from(encryptedValue, 'base64')),
            decipher.final(),
        ]).toString('utf8');
    } catch {
        return null;
    }
}
