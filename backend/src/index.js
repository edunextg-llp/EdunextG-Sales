import app from './app.js';
import dotenv from 'dotenv';
import { ensureSchema } from './ensureSchema.js';
import { startBitMailScheduler } from './services/bitMailScheduler.js';
import { startAutoAddSalesScheduler } from './services/autoAddSales.js';

dotenv.config();

const PORT = process.env.PORT;

// Under src/cluster.js several copies of this file run at once. Only the "leader" worker
// checks the schema and runs the schedulers, so mails and auto sales are not sent once per
// worker. Run directly (npm run dev), this process is the leader.
const IS_WORKER = Boolean(process.env.CLUSTER_WORKER_ID);
const IS_LEADER = !IS_WORKER || process.env.CLUSTER_LEADER === '1';
const tag = IS_WORKER ? `[worker ${process.env.CLUSTER_WORKER_ID} pid ${process.pid}] ` : '';

async function startServer() {
    if (IS_LEADER) {
        try {
            await ensureSchema();
        } catch (error) {
            console.error('Schema verification failed:', error);
            process.exit(1);
        }
    }

    const server = app.listen(PORT, () => {
        console.log(`${tag}Server is running on port ${PORT}`);
        if (IS_LEADER) {
            startBitMailScheduler();
            // Auto Add Sales: re-checks waiting invoices (approvals, invoice date reached).
            startAutoAddSalesScheduler();
        }
        if (IS_WORKER) process.send({ type: 'worker-ready' });
    });

    // Graceful stop (sent by the primary on shutdown / rolling restart): finish open
    // requests, then exit. Forced after 10 s so a hung request can't block it.
    const shutdown = () => {
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 10_000).unref();
    };
    process.on('SIGTERM', shutdown);
    if (IS_WORKER) {
        process.on('message', (message) => {
            if (message && message.type === 'shutdown') shutdown();
        });
    }
}

startServer();
