import bcrypt from 'bcryptjs';
import db from '../config/db.js';
import {
    formatDeliveryLoginId,
    generateDeliveryPasscode,
} from '../utils/deliveryCredentials.js';

const resetAll = process.argv.includes('--reset');

async function main() {
    const [deliveryBoys] = await db.execute(
        `SELECT id, name, contact_no, delivery_login_id, delivery_passcode_hash
         FROM delivery_boys
         ORDER BY id ASC`
    );

    if (deliveryBoys.length === 0) {
        console.log('No delivery boys found.');
        return;
    }

    const generated = [];

    for (const deliveryBoy of deliveryBoys) {
        const deliveryLoginId = formatDeliveryLoginId(deliveryBoy.id);
        const shouldGeneratePasscode = resetAll || !deliveryBoy.delivery_passcode_hash;
        let passcode = null;
        let passcodeHash = deliveryBoy.delivery_passcode_hash;

        if (shouldGeneratePasscode) {
            passcode = generateDeliveryPasscode();
            passcodeHash = await bcrypt.hash(passcode, 10);
        }

        await db.execute(
            `UPDATE delivery_boys
             SET delivery_login_id = ?, delivery_passcode_hash = ?
             WHERE id = ?`,
            [deliveryLoginId, passcodeHash, deliveryBoy.id]
        );

        if (passcode) {
            generated.push({
                id: deliveryBoy.id,
                name: deliveryBoy.name,
                deliveryLoginId,
                passcode,
            });
        }
    }

    if (generated.length === 0) {
        console.log('All delivery boys already have credentials. Use --reset to regenerate passcodes.');
        return;
    }

    console.table(generated);
    console.log('Save these passcodes now. They are not returned by list APIs.');
}

main()
    .catch((error) => {
        console.error('Failed to generate delivery credentials:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.end();
    });
