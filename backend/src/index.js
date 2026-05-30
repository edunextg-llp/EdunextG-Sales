import app from './app.js';
import dotenv from 'dotenv';
import { ensureSchema } from './ensureSchema.js';

dotenv.config();

const PORT = process.env.PORT;

async function startServer() {
    try {
        await ensureSchema();
    } catch (error) {
        console.error('Schema verification failed:', error);
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

startServer();
