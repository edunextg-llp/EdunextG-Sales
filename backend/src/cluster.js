// Cluster entry point: runs several copies of the API (src/index.js) on the same PORT and
// hands incoming connections to them in round-robin order (worker 1, 2, 3, ..., 1, 2, ...).
//
//   npm run start:cluster            one worker per CPU core
//   CLUSTER_WORKERS=4 (backend/.env) fixed number of workers
//
// The primary process does not serve requests. It:
//   - starts the "leader" worker first (it checks the DB schema and runs the bit-mail /
//     auto-add-sales schedulers), then the others once the leader is listening;
//   - holds the shared captcha / OTP / login-lockout data (utils/sharedStore.js);
//   - restarts a worker that crashes (the leader's replacement becomes the leader);
//   - stops every worker gracefully on Ctrl+C / SIGTERM.
//
// Each worker has its own MySQL pool (connectionLimit 10 in config/db.js), so the database
// sees up to 10 x workers connections. Keep that under MySQL's max_connections.

import cluster from 'cluster';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { startSharedStorePrimary } from './utils/sharedStore.js';

dotenv.config();

// Round robin must be chosen before the first fork. (Node's default on Windows is to let
// the OS pick a worker, which is usually uneven.)
cluster.schedulingPolicy = cluster.SCHED_RR;

const cpuCount = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
const WORKER_COUNT = Math.max(1, Number.parseInt(process.env.CLUSTER_WORKERS, 10) || cpuCount);
const RESTART_DELAY_MS = 1000;
const MAX_RESTART_DELAY_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;

cluster.setupPrimary({ exec: path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js') });
startSharedStorePrimary();

const slots = new Map(); // slot number (1..N) -> worker
let shuttingDown = false;
let restartDelay = RESTART_DELAY_MS;

function fork(slot) {
    const leader = slot === 1;
    const worker = cluster.fork({
        CLUSTER_WORKER_ID: String(slot),
        CLUSTER_LEADER: leader ? '1' : '0',
    });
    worker.slot = slot;
    worker.startedAt = Date.now();
    slots.set(slot, worker);
    return new Promise((resolve) => {
        const onMessage = (message) => {
            if (message && message.type === 'worker-ready') {
                worker.off('message', onMessage);
                resolve(worker);
            }
        };
        worker.on('message', onMessage);
        worker.once('exit', () => resolve(null));
    });
}

cluster.on('exit', (worker, code, signal) => {
    if (slots.get(worker.slot) === worker) slots.delete(worker.slot);
    if (shuttingDown) return;

    console.error(`[cluster] worker ${worker.slot} (pid ${worker.process.pid}) exited (${signal || code}); restarting in ${restartDelay} ms`);
    // A worker that dies right after starting (bad config, DB down) backs off up to 30 s
    // instead of restarting in a tight loop.
    const livedMs = Date.now() - worker.startedAt;
    const delay = restartDelay;
    restartDelay = livedMs < 10_000 ? Math.min(restartDelay * 2, MAX_RESTART_DELAY_MS) : RESTART_DELAY_MS;
    setTimeout(() => {
        if (!shuttingDown) fork(worker.slot);
    }, delay);
});

function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[cluster] ${signal} received, stopping ${slots.size} worker(s)...`);
    for (const worker of slots.values()) {
        if (worker.isConnected()) worker.send({ type: 'shutdown' });
    }
    const timer = setTimeout(() => {
        for (const worker of slots.values()) worker.kill();
        process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    cluster.on('exit', () => {
        if (slots.size === 0) process.exit(0);
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function start() {
    console.log(`[cluster] primary pid ${process.pid}: starting ${WORKER_COUNT} worker(s), round-robin scheduling`);
    // Leader first, so the schema check finishes before the other workers take traffic.
    const leader = await fork(1);
    if (!leader) console.error('[cluster] leader worker failed to start; it will be retried');
    const others = [];
    for (let slot = 2; slot <= WORKER_COUNT; slot++) others.push(fork(slot));
    await Promise.all(others);
    if (!shuttingDown) console.log(`[cluster] ${slots.size} worker(s) listening on port ${process.env.PORT}`);
}

start();
