// Sends the daily bit mails at 9:30 AM India time while the backend is running.
//
// backend/.env:
//   BIT_MAIL_ENABLED=true             turn the daily mails on
//   BIT_MAIL_TIME=09:30               send time, 24-hour HH:MM India time (default 09:30)
//   BIT_MAIL_CATCH_UP_ON_START=true   if the backend was off at send time, send today's unsent
//                                     mails when it starts - but only until BIT_MAIL_CATCH_UP_UNTIL
//   BIT_MAIL_CATCH_UP_UNTIL=13:00     latest time of day a startup catch-up may send (default 13:00)

import { sendBitMails, istDateKey } from './bitMailService.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
let timer = null;

function parseTime(value, fallback) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return fallback;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return fallback;
    return { hours, minutes };
}

const sendTime = () => parseTime(process.env.BIT_MAIL_TIME, { hours: 9, minutes: 30 });
const catchUpUntil = () => parseTime(process.env.BIT_MAIL_CATCH_UP_UNTIL, { hours: 13, minutes: 0 });
const label = ({ hours, minutes }) => {
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${h12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

function minutesNowIst() {
    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    return nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
}

function msUntilNextRun({ hours, minutes }) {
    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    let target = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate(), hours, minutes, 0);
    if (target <= nowIst.getTime()) target += 24 * 60 * 60 * 1000;
    return target - nowIst.getTime();
}

async function runAndReport(runLabel) {
    try {
        const { dateKey, results = [], reason } = await sendBitMails({ dateKey: istDateKey() });
        const count = (status) => results.filter((r) => r.status === status).length;
        console.log(
            `[bit-mail] ${runLabel} ${dateKey}: sent ${count('sent')}, failed ${count('failed')}, skipped ${count('skipped')}` +
                (reason ? ` (${reason})` : '')
        );
        results
            .filter((r) => r.status === 'failed')
            .forEach((r) => console.error(`[bit-mail] failed: ${r.staffName} / ${r.bitName}: ${r.message}`));
    } catch (error) {
        console.error(`[bit-mail] ${runLabel} run crashed:`, error);
    }
}

function scheduleNext() {
    const time = sendTime();
    const delay = msUntilNextRun(time);
    timer = setTimeout(async () => {
        await runAndReport('daily run');
        scheduleNext();
    }, delay);
    console.log(`[bit-mail] next run at ${label(time)} IST (in ${Math.round(delay / 60000)} min)`);
}

export function startBitMailScheduler() {
    if (String(process.env.BIT_MAIL_ENABLED || '').toLowerCase() !== 'true') {
        console.log('[bit-mail] daily bit mails are off (set BIT_MAIL_ENABLED=true in backend/.env)');
        return;
    }
    if (timer) return;

    scheduleNext();

    if (String(process.env.BIT_MAIL_CATCH_UP_ON_START ?? 'true').toLowerCase() === 'false') return;

    const start = sendTime();
    const until = catchUpUntil();
    const now = minutesNowIst();
    const startMin = start.hours * 60 + start.minutes;
    const untilMin = until.hours * 60 + until.minutes;

    if (now >= startMin && now < untilMin) {
        // Already-sent mails are skipped, so restarts don't send duplicates.
        setTimeout(() => runAndReport('startup catch-up'), 10000);
    } else if (now >= untilMin) {
        console.log(`[bit-mail] no startup catch-up after ${label(until)}; next mails go out at the next ${label(start)}`);
    }
}
