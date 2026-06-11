/**
 * Validates that a value contains digits only (no letters or symbols).
 * Returns { valid: true, value } with trimmed string, or { valid: false, error }.
 */
export function validateDigitsOnly(value, fieldName, { required = true } = {}) {
    if (value === undefined || value === null || String(value).trim() === '') {
        if (!required) {
            return { valid: true, value: null };
        }
        return { valid: false, error: `${fieldName} is required` };
    }

    const normalized = String(value).trim();
    if (!/^\d+$/.test(normalized)) {
        return { valid: false, error: `${fieldName} must contain numbers only` };
    }

    return { valid: true, value: normalized };
}

/**
 * Validates a positive number (integer or decimal) for prices etc.
 */
export function validateNumeric(value, fieldName, { required = true } = {}) {
    if (value === undefined || value === null || String(value).trim() === '') {
        if (!required) {
            return { valid: true, value: null };
        }
        return { valid: false, error: `${fieldName} is required` };
    }

    const normalized = String(value).trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
        return { valid: false, error: `${fieldName} must be a valid number` };
    }

    return { valid: true, value: parseFloat(normalized) };
}

/**
 * Validates required non-empty text (trimmed).
 */
export function validateRequiredText(value, fieldName) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, value: String(value).trim() };
}

const PAYMENT_MODES = ['cash', 'upi'];

/**
 * Validates payment mode (cash or upi).
 */
export function validatePaymentMode(value, fieldName) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!PAYMENT_MODES.includes(normalized)) {
        return { valid: false, error: `${fieldName} must be Cash or UPI` };
    }
    return { valid: true, value: normalized };
}

/**
 * Validates a positive integer ID.
 */
export function validatePositiveInteger(value, fieldName) {
    const result = validateDigitsOnly(value, fieldName);
    if (!result.valid) {
        return result;
    }
    const num = parseInt(result.value, 10);
    if (num < 1) {
        return { valid: false, error: `${fieldName} must be a positive number` };
    }
    return { valid: true, value: num };
}
