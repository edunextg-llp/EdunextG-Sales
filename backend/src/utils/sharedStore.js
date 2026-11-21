// Short-lived key/value data (captchas, OTP sessions, login lockouts) that every worker must see.
//
// In cluster mode (src/cluster.js) a request can land on any worker, so a captcha created on
// worker 1 may be checked on worker 3. The data therefore lives in the primary process and the
// workers reach it over the cluster IPC channel. Without a cluster (npm run dev, tests) the
// same API simply uses a local Map.
//
// Values must be JSON-serialisable (store Buffers as hex strings). Everything is in memory, so
// a full restart clears it, exactly like the old per-process Maps.

import cluster from 'cluster';

const MESSAGE_TAG = '__sharedStore';
const REQUEST_TIMEOUT_MS = 5000;

// ---------- storage (used by the primary, or locally when not clustered) ----------

const stores = new Map(); // storeName -> Map(key -> { value, expiresAt })

function storeOf(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
}

function live(entry) {
    return entry && (!entry.expiresAt || entry.expiresAt > Date.now());
}

function runOp({ store, op, key, value, ttlMs, field, match }) {
    const map = storeOf(store);
    switch (op) {
        case 'get': {
            const entry = map.get(key);
            if (!live(entry)) {
                map.delete(key);
                return undefined;
            }
            return entry.value;
        }
        case 'set':
            map.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : 0 });
            return true;
        case 'delete':
            return map.delete(key);
        case 'deleteWhere': {
            // Remove every entry whose value[field] === match (e.g. "one live OTP per admin").
            let removed = 0;
            for (const [k, entry] of map) {
                if (entry.value && entry.value[field] === match) {
                    map.delete(k);
                    removed += 1;
                }
            }
            return removed;
        }
        case 'clear':
            map.clear();
            return true;
        default:
            throw new Error(`Unknown shared store op: ${op}`);
    }
}

function sweepExpired() {
    const now = Date.now();
    for (const map of stores.values()) {
        for (const [key, entry] of map) {
            if (entry.expiresAt && entry.expiresAt <= now) map.delete(key);
        }
    }
}

// ---------- primary side ----------

let primaryStarted = false;

// Called once by the primary in src/cluster.js: answers the workers' store requests.
export function startSharedStorePrimary() {
    if (primaryStarted) return;
    primaryStarted = true;
    cluster.on('message', (worker, message) => {
        if (!message || message[MESSAGE_TAG] !== 'request') return;
        let reply;
        try {
            reply = { [MESSAGE_TAG]: 'reply', id: message.id, result: runOp(message) };
        } catch (error) {
            reply = { [MESSAGE_TAG]: 'reply', id: message.id, error: error.message };
        }
        if (worker.isConnected()) worker.send(reply);
    });
    setInterval(sweepExpired, 60 * 1000).unref();
}

// ---------- worker side ----------

const pending = new Map(); // requestId -> { resolve, reject, timer }
let nextId = 1;
let workerListening = false;

function requestFromPrimary(payload) {
    if (!workerListening) {
        workerListening = true;
        process.on('message', (message) => {
            if (!message || message[MESSAGE_TAG] !== 'reply') return;
            const call = pending.get(message.id);
            if (!call) return;
            pending.delete(message.id);
            clearTimeout(call.timer);
            if (message.error) call.reject(new Error(message.error));
            else call.resolve(message.result);
        });
    }
    return new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error('Shared store request timed out.'));
        }, REQUEST_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        process.send({ [MESSAGE_TAG]: 'request', id, ...payload });
    });
}

const inCluster = () => cluster.isWorker && typeof process.send === 'function';
let localSweepStarted = false;

function call(payload) {
    if (inCluster()) return requestFromPrimary(payload);
    if (!localSweepStarted) {
        localSweepStarted = true;
        setInterval(sweepExpired, 60 * 1000).unref();
    }
    try {
        return Promise.resolve(runOp(payload));
    } catch (error) {
        return Promise.reject(error);
    }
}

/**
 * A named store shared by all workers. Every method returns a Promise.
 *   get(key)                       -> value | undefined (expired entries read as undefined)
 *   set(key, value, ttlMs?)        -> true  (ttlMs = 0 / omitted: no expiry)
 *   delete(key)                    -> boolean
 *   deleteWhere(field, match)      -> number removed (value[field] === match)
 *   clear()
 */
export function createSharedStore(name) {
    return {
        get: (key) => call({ store: name, op: 'get', key }),
        set: (key, value, ttlMs = 0) => call({ store: name, op: 'set', key, value, ttlMs }),
        delete: (key) => call({ store: name, op: 'delete', key }),
        deleteWhere: (field, match) => call({ store: name, op: 'deleteWhere', field, match }),
        clear: () => call({ store: name, op: 'clear' }),
    };
}
