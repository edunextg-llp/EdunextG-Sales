import crypto from 'crypto';

// Reversible encryption for staff passwords (AES-256-GCM), so an admin can view
// a staff member's password later. Login still checks the bcrypt hash.
// Keep STAFF_PASSWORD_KEY stable across environments sharing a database.
// During rotation, STAFF_PASSWORD_PREVIOUS_KEY can read existing encrypted passwords.
const encryptionSecret = () => process.env.STAFF_PASSWORD_KEY || process.env.JWT_SECRET;
const keyFor = (secret) => crypto.createHash('sha256').update(`staff-password:${secret}`).digest();

export function encryptPassword(plainText) {
    if (plainText === undefined || plainText === null || plainText === '') return null;
    const iv = crypto.randomBytes(12);
    const secret = encryptionSecret();
    if (!secret) throw new Error('Configure STAFF_PASSWORD_KEY or JWT_SECRET before saving passwords.');
    const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(secret), iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptPassword(payload) {
    if (!payload) return null;
    const parts = String(payload).split(':');
    const [version, ivB64, tagB64, dataB64] = parts;
    if (parts.length !== 4 || version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const secrets = new Set([encryptionSecret(), process.env.STAFF_PASSWORD_PREVIOUS_KEY, process.env.JWT_SECRET].filter(Boolean));
    for (const secret of secrets) {
        try {
            const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(secret), iv);
            decipher.setAuthTag(tag);
            return Buffer.concat([
                decipher.update(Buffer.from(dataB64, 'base64')),
                decipher.final(),
            ]).toString('utf8');
        } catch {
            // An old password may have been encrypted with another configured key.
        }
    }
    return null;
}
