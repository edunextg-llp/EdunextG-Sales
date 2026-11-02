import crypto from 'crypto';

// Reversible encryption for staff passwords (AES-256-GCM), so an admin can view
// a staff member's password later. Login still checks the bcrypt hash.
// Set STAFF_PASSWORD_KEY in .env; changing it makes saved passwords unreadable.
const SECRET = process.env.STAFF_PASSWORD_KEY
    || process.env.JWT_SECRET
    || 'super_secret_key_12345';
const KEY = crypto.createHash('sha256').update(`staff-password:${SECRET}`).digest();

export function encryptPassword(plainText) {
    if (plainText === undefined || plainText === null || plainText === '') return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptPassword(payload) {
    if (!payload) return null;
    try {
        const [version, ivB64, tagB64, dataB64] = String(payload).split(':');
        if (version !== 'v1') return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
        decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
        return Buffer.concat([
            decipher.update(Buffer.from(dataB64, 'base64')),
            decipher.final(),
        ]).toString('utf8');
    } catch {
        return null;
    }
}
