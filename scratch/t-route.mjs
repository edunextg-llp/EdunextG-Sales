import { approvalRouteFor, readApproverRule } from './src/utils/permissionKeys.js';
const rule = { ...readApproverRule({ from: 16, to: 26, maxAmount: 5000, approverId: 7 }), approverName: 'Ravi' };
for (const [d, a] of [[16, 4999], [26, 1000], [16, 5000], [27, 100], [20, 8000], [10, 100]]) {
  console.log(`${d} days, Rs ${a} ->`, approvalRouteFor(rule, d, a).to === 'approver' ? 'Ravi' : 'admin');
}
console.log('no limit amount:', approvalRouteFor({ ...rule, maxAmount: null }, 20, 99999).to);
for (const bad of [{ from: 0, approverId: 1 }, { from: 16, to: 10, approverId: 1 }, { from: 16, maxAmount: -1, approverId: 1 }, { from: 16 }]) {
  try { readApproverRule(bad); console.log('accepted?!'); } catch (e) { console.log('rejected:', e.message); }
}
