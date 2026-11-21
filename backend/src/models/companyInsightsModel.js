// Dashboard > Company Insights: everything the five company-wise dashboard charts need, in one call.
//
//   1. Target vs achieved (current month), per company per employee
//        target   = company's daily requisition target x working days (Mon-Sat) this month
//        achieved = the employee's outlet orders (purchase requisitions) this month, cancelled left out
//                   (same rule as the daily below-target check)
//   2. Distributors per company (active / inactive)
//   3. Outlets per company, per bit (bit = the outlet's area, staff_counters.location_name)
//   4. Outlet performance this month: outlets that ordered vs did not, and the top outlets
//   5. Employee growth: each employee's outlet orders, month by month, last 6 months
//
// An employee (staff) belongs to a company through staff.company_id or staff_companies; their
// outlets (staff_counters) count for each of their companies.
import db from '../config/db.js';
import { normalizeAreaName } from '../migrations/migrateAreas.js';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const GROWTH_MONTHS = 6;
const TOP_OUTLETS = 10;
const NO_BIT = 'NO BIT';

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (year, monthIndex) => {
    const d = new Date(Date.UTC(year, monthIndex, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Mon-Sat between two UTC dates (inclusive).
function workingDays(from, to) {
    let count = 0;
    for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
        if (d.getUTCDay() !== 0) count += 1;
    }
    return count;
}

// Current month in India time.
export function periodNow(now = new Date()) {
    const ist = new Date(now.getTime() + IST_OFFSET_MS);
    const year = ist.getUTCFullYear();
    const month = ist.getUTCMonth();
    const today = new Date(Date.UTC(year, month, ist.getUTCDate()));
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));
    const months = [];
    for (let i = GROWTH_MONTHS - 1; i >= 0; i--) months.push(monthKey(year, month - i));
    return {
        month: monthKey(year, month),
        today: `${year}-${pad(month + 1)}-${pad(ist.getUTCDate())}`,
        monthStart: `${monthKey(year, month)}-01`,
        nextMonthStart: `${monthKey(year, month + 1)}-01`,
        growthStart: `${months[0]}-01`,
        months,
        workingDays: workingDays(monthStart, monthEnd),
        workingDaysToDate: workingDays(monthStart, today),
    };
}

// staff_id -> company link, both ways a staff member can belong to a company.
const STAFF_COMPANY_LINKS = `
    SELECT id AS staff_id, company_id FROM staff WHERE company_id IS NOT NULL
    UNION
    SELECT staff_id, company_id FROM staff_companies`;

const CompanyInsightsModel = {
    async get() {
        const period = periodNow();

        const [
            [companies],
            [employees],
            [orderMonths],
            [distributors],
            [outletBits],
            [orderedOutlets],
            [topOutlets],
        ] = await Promise.all([
            db.query('SELECT id, name, daily_requisition_target FROM companies ORDER BY name'),

            // Active company staff of each company.
            db.query(
                `SELECT DISTINCT link.company_id, s.id AS staff_id, s.name
                 FROM (${STAFF_COMPANY_LINKS}) link
                 JOIN staff s ON s.id = link.staff_id
                 WHERE s.is_active = 1 AND s.staff_category = 'company_staff'`
            ),

            // Outlet orders per company / employee / month, last 6 months.
            db.query(
                `SELECT pr.company_id, pr.staff_id, s.name AS staff_name,
                        DATE_FORMAT(pr.created_at, '%Y-%m') AS ym,
                        SUM(pr.total_amount) AS amount, COUNT(*) AS orders
                 FROM purchase_requisitions pr
                 JOIN staff s ON s.id = pr.staff_id
                 WHERE pr.status <> 'cancelled' AND pr.created_at >= ? AND pr.created_at < ?
                 GROUP BY pr.company_id, pr.staff_id, s.name, ym`,
                [period.growthStart, period.nextMonthStart]
            ),

            db.query(
                `SELECT company_id,
                        SUM(is_active = 1) AS active,
                        SUM(is_active <> 1) AS inactive
                 FROM distributors
                 GROUP BY company_id`
            ),

            // Outlets of active staff, per company and bit (area).
            db.query(
                `SELECT link.company_id, sc.location_name AS bit, COUNT(DISTINCT sc.id) AS outlets
                 FROM staff_counters sc
                 JOIN staff s ON s.id = sc.staff_id AND s.is_active = 1
                 JOIN (${STAFF_COMPANY_LINKS}) link ON link.staff_id = sc.staff_id
                 GROUP BY link.company_id, sc.location_name`
            ),

            // Of those outlets, how many ordered for that company this month.
            db.query(
                `SELECT pr.company_id, COUNT(DISTINCT pr.outlet_id) AS ordered
                 FROM purchase_requisitions pr
                 JOIN staff_counters sc ON sc.id = pr.outlet_id
                 JOIN staff s ON s.id = sc.staff_id AND s.is_active = 1
                 JOIN (${STAFF_COMPANY_LINKS}) link ON link.staff_id = sc.staff_id AND link.company_id = pr.company_id
                 WHERE pr.status <> 'cancelled' AND pr.created_at >= ? AND pr.created_at < ?
                 GROUP BY pr.company_id`,
                [period.monthStart, period.nextMonthStart]
            ),

            // Order value per outlet this month (the top ones are picked below).
            db.query(
                `SELECT pr.company_id, pr.outlet_id, sc.outlet_name, sc.location_name AS bit,
                        SUM(pr.total_amount) AS amount, COUNT(*) AS orders
                 FROM purchase_requisitions pr
                 JOIN staff_counters sc ON sc.id = pr.outlet_id
                 WHERE pr.status <> 'cancelled' AND pr.created_at >= ? AND pr.created_at < ?
                 GROUP BY pr.company_id, pr.outlet_id, sc.outlet_name, sc.location_name`,
                [period.monthStart, period.nextMonthStart]
            ),
        ]);

        const byCompany = new Map(companies.map((c) => [c.id, {
            id: c.id,
            name: c.name,
            dailyTarget: Number(c.daily_requisition_target) > 0 ? round2(c.daily_requisition_target) : null,
            distributors: { active: 0, inactive: 0, total: 0 },
            outlets: { total: 0, ordered: 0, notOrdered: 0, bits: [], top: [] },
            employees: new Map(),
        }]));

        const employeeOf = (company, staffId, name) => {
            if (!company.employees.has(staffId)) {
                company.employees.set(staffId, {
                    id: staffId, name, achieved: 0, orders: 0,
                    monthly: Object.fromEntries(period.months.map((m) => [m, 0])),
                });
            }
            return company.employees.get(staffId);
        };

        employees.forEach((row) => {
            const company = byCompany.get(row.company_id);
            if (company) employeeOf(company, row.staff_id, row.name);
        });

        // Orders also bring in staff who are now inactive or not linked any more, so the
        // company total is never missing anything.
        orderMonths.forEach((row) => {
            const company = byCompany.get(row.company_id);
            if (!company) return;
            const emp = employeeOf(company, row.staff_id, row.staff_name);
            const amount = round2(row.amount);
            emp.monthly[row.ym] = round2((emp.monthly[row.ym] || 0) + amount);
            if (row.ym === period.month) {
                emp.achieved = round2(emp.achieved + amount);
                emp.orders += Number(row.orders) || 0;
            }
        });

        distributors.forEach((row) => {
            const company = byCompany.get(row.company_id);
            if (!company) return;
            const active = Number(row.active) || 0;
            const inactive = Number(row.inactive) || 0;
            company.distributors = { active, inactive, total: active + inactive };
        });

        // Bits: merge spellings that differ only in case / spaces.
        const bitTotals = new Map(); // companyId -> Map(bit -> outlets)
        outletBits.forEach((row) => {
            if (!byCompany.has(row.company_id)) return;
            const bit = normalizeAreaName(row.bit) || NO_BIT;
            if (!bitTotals.has(row.company_id)) bitTotals.set(row.company_id, new Map());
            const bits = bitTotals.get(row.company_id);
            bits.set(bit, (bits.get(bit) || 0) + (Number(row.outlets) || 0));
        });
        bitTotals.forEach((bits, companyId) => {
            const company = byCompany.get(companyId);
            company.outlets.bits = [...bits.entries()]
                .map(([name, outlets]) => ({ name, outlets }))
                .sort((a, b) => b.outlets - a.outlets || a.name.localeCompare(b.name));
            company.outlets.total = company.outlets.bits.reduce((sum, b) => sum + b.outlets, 0);
        });

        orderedOutlets.forEach((row) => {
            const company = byCompany.get(row.company_id);
            if (company) company.outlets.ordered = Math.min(Number(row.ordered) || 0, company.outlets.total);
        });

        const topByCompany = new Map();
        topOutlets.forEach((row) => {
            if (!byCompany.has(row.company_id)) return;
            if (!topByCompany.has(row.company_id)) topByCompany.set(row.company_id, []);
            topByCompany.get(row.company_id).push({
                id: row.outlet_id,
                name: row.outlet_name,
                bit: normalizeAreaName(row.bit) || NO_BIT,
                amount: round2(row.amount),
                orders: Number(row.orders) || 0,
            });
        });

        const result = [...byCompany.values()].map((company) => {
            const target = company.dailyTarget;
            const top = (topByCompany.get(company.id) || [])
                .sort((a, b) => b.amount - a.amount)
                .slice(0, TOP_OUTLETS);
            const staff = [...company.employees.values()]
                .map((emp) => ({
                    id: emp.id,
                    name: emp.name,
                    target: target ? round2(target * period.workingDays) : null,
                    targetToDate: target ? round2(target * period.workingDaysToDate) : null,
                    achieved: emp.achieved,
                    orders: emp.orders,
                    monthly: period.months.map((m) => emp.monthly[m] || 0),
                }))
                .sort((a, b) => b.achieved - a.achieved || a.name.localeCompare(b.name));
            return {
                id: company.id,
                name: company.name,
                dailyTarget: target,
                distributors: company.distributors,
                outlets: {
                    ...company.outlets,
                    notOrdered: Math.max(company.outlets.total - company.outlets.ordered, 0),
                    top,
                },
                employees: staff,
            };
        });

        return {
            month: period.month,
            today: period.today,
            months: period.months,
            workingDays: period.workingDays,
            workingDaysToDate: period.workingDaysToDate,
            companies: result,
        };
    },
};

export default CompanyInsightsModel;
