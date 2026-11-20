// One invoice: details, journey, delivery, payments, collections, cancellations (Invoice Lookup): Tailwind CSS (no MUI).
import PropTypes from "prop-types";
import { useAuth } from "context/AuthContext";
import { Badge, Icon } from "components/tw";

import {
  PAYMENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_ORDER,
  formatCancelQtyDisplay,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "../format";

// format.js status colours (MUI names) -> Badge tones.
const TONE = { default: "slate", warning: "amber", info: "blue", primary: "violet", success: "green", error: "red", secondary: "slate" };

const th = "whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700";

function InfoRow({ label, value }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="block break-words text-[13px] font-medium text-slate-800">{value || "N/A"}</span>
    </div>
  );
}
InfoRow.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.node };
InfoRow.defaultProps = { value: null };

// A titled white panel.
function Panel({ title, right, children, embedded }) {
  return (
    <section className={`mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white ${embedded ? "" : "shadow-[0_1px_2px_rgba(15,23,42,0.04)]"}`}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h4 className="m-0 text-[14px] font-semibold text-slate-900">{title}</h4>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
Panel.propTypes = { title: PropTypes.node, right: PropTypes.node, children: PropTypes.node.isRequired, embedded: PropTypes.bool };
Panel.defaultProps = { title: null, right: null, embedded: false };

// A small bordered table.
function MiniTable({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead><tr>{head}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
MiniTable.propTypes = { head: PropTypes.node.isRequired, children: PropTypes.node.isRequired };

// Who did a journey step. Older entries (before tracking started) fall back to the
// packer / delivery boy saved on the invoice, marked as "assigned".
function journeyActor(entry, sale) {
  if (entry.changed_by_name) {
    return { name: entry.changed_by_name, role: entry.changed_by_role, recorded: true };
  }
  if (entry.status === "not_packing" && sale.created_by_name) {
    return { name: sale.created_by_name, role: sale.created_by_role, recorded: true };
  }
  if (["packing", "packing_done"].includes(entry.status) && sale.packed_by_name) {
    return { name: sale.packed_by_name, role: "Packing (assigned)", recorded: false };
  }
  if (["out_for_delivery", "delivered", "returned"].includes(entry.status) && sale.delivery_boy_name) {
    return { name: sale.delivery_boy_name, role: "Delivery (assigned)", recorded: false };
  }
  return null;
}

function ActorCell({ actor }) {
  if (!actor) return <span className="text-[11.5px] text-slate-400">Not recorded</span>;
  return (
    <span className="block leading-tight">
      <span className={`block text-[12.5px] text-slate-800 ${actor.recorded ? "font-semibold" : ""}`}>{actor.name}</span>
      {actor.role && <span className={`block text-[11px] text-slate-500 ${actor.recorded ? "" : "italic"}`}>{actor.role}</span>}
    </span>
  );
}
ActorCell.propTypes = { actor: PropTypes.object };
ActorCell.defaultProps = { actor: null };

const ACTION_LABELS = {
  not_packing: "Added sale",
  packing: "Started packing",
  packing_done: "Packed",
  out_for_delivery: "Sent for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

function InvoiceDetails({ details, embedded = false }) {
  const { sale, history, payments, cancellations, collections, takenBills, summary } = details;
  // Who did what (names, roles, login IDs) is shown to Admin only.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const currentStatus = sale.packaging_status || "not_packing";
  const activeStep = STATUS_ORDER.indexOf(currentStatus);

  // Bill after cancellations, matching the backend's paid + balance totals.
  const effectivePrice = Number(summary.paidAmount || 0) + Number(summary.balanceAmount || 0);
  let paidSoFar = 0;
  const paymentHistory = payments.map((payment) => {
    const isCredit = payment.payment_mode === "credit";
    // Credit entries record an amount owed; only cash, UPI and cheque count as paid.
    if (!isCredit) paidSoFar += Number(payment.amount) || 0;
    const modeLabel = PAYMENT_LABELS[payment.payment_mode] || payment.payment_mode;
    return {
      ...payment,
      isCredit,
      typeLabel: isCredit
        ? "Credit Given"
        : payment.parent_credit_payment_id
          ? `Credit Collection (${modeLabel})`
          : modeLabel,
      paidSoFar,
      balanceAfter: Math.max(0, Math.round((effectivePrice - paidSoFar) * 100) / 100),
    };
  });

  const steps = STATUS_ORDER;
  return (
    <div className={embedded ? "" : "mb-1"}>
      {/* Invoice header + facts */}
      <Panel embedded={embedded}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="m-0 text-[18px] font-bold text-slate-900">Invoice {sale.invoice_number}</h3>
            <p className="m-0 text-[12.5px] text-slate-500">Sale ID: {sale.sticker_number || sale.id} · Date: {sale.formatted_date || formatDate(sale.sale_date)}</p>
          </div>
          <Badge tone={TONE[STATUS_COLORS[currentStatus]] || "slate"}>{STATUS_LABELS[currentStatus] || currentStatus}</Badge>
        </div>
        <div className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoRow label="Company" value={sale.company_name} />
          <InfoRow label="Staff" value={sale.staff_name} />
          <InfoRow label="Outlet" value={sale.outlet_name} />
          <InfoRow label="Outlet ERP ID" value={sale.outlet_erp_id} />
          <InfoRow label="Location" value={sale.location_name} />
          <InfoRow label="Contact" value={sale.contact_number} />
          <InfoRow label="Items" value={sale.item_count} />
          <InfoRow label="Packed items" value={sale.packed_item_count} />
          <InfoRow label="Boxes / packets" value={`${sale.box_count || 0} / ${sale.packet_count || 0}`} />
          <InfoRow label="Bill amount" value={formatCurrency(summary.price)} />
          <InfoRow label="Paid amount" value={formatCurrency(summary.paidAmount)} />
          <InfoRow label="Balance" value={formatCurrency(summary.balanceAmount)} />
          <InfoRow label="Payment mode" value={PAYMENT_LABELS[sale.payment_mode] || sale.payment_mode} />
          {sale.reference_no && <InfoRow label="Reference no" value={sale.reference_no} />}
          {sale.reference_date && <InfoRow label="Reference date" value={formatDate(sale.reference_date)} />}
          {sale.credit_days && <InfoRow label="Credit days" value={sale.credit_days} />}
          {isAdmin && (
            <InfoRow
              label="Added by"
              value={sale.created_by_name ? `${sale.created_by_name}${sale.created_by_role ? ` (${sale.created_by_role})` : ""}` : "Not recorded"}
            />
          )}
          {sale.credit_photo_url && (
            <div className="min-w-0">
              <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Credit bill photo</span>
              <a href={sale.credit_photo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-600 hover:underline">
                <Icon name="image" className="text-[16px]" />View photo
              </a>
              <span className="block text-[11.5px] text-slate-500">
                {isAdmin && (sale.credit_photo_by_name
                  ? `Uploaded by ${sale.credit_photo_by_name}${sale.credit_photo_by_role ? ` (${sale.credit_photo_by_role})` : ""}`
                  : "Uploader not recorded")}
                {sale.credit_photo_at ? `${isAdmin ? " · " : ""}${formatDateTime(sale.credit_photo_at)}` : ""}
              </span>
            </div>
          )}
          {sale.requisition_number && (
            <InfoRow
              label="From requisition"
              value={`${sale.requisition_number}${isAdmin && sale.requisition_raised_by ? ` · raised by ${sale.requisition_raised_by}` : ""}${
                isAdmin && sale.requisition_approved_by ? ` · approved by ${sale.requisition_approved_by}` : ""
              }`}
            />
          )}
        </div>
      </Panel>

      {/* Journey */}
      <Panel title="Invoice Journey" embedded={embedded}>
        <div className="px-5 py-4">
          {currentStatus === "cancelled" && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
              <span className="block text-[13px] font-bold text-red-700">Invoice Cancelled</span>
              {sale.cancellation_reason && <span className="block text-[12px] text-red-700">Reason: {sale.cancellation_reason}</span>}
            </div>
          )}
          <ol className="m-0 mb-4 flex list-none items-start p-0">
            {steps.map((status, index) => {
              const done = index <= activeStep;
              return (
                <li key={status} className="relative flex flex-1 flex-col items-center text-center">
                  {index > 0 && <span className={`absolute right-1/2 top-3.5 h-0.5 w-full ${index <= activeStep ? "bg-blue-600" : "bg-slate-200"}`} />}
                  <span className={`relative z-[1] flex size-7 items-center justify-center rounded-full text-[12px] font-bold ${done ? "bg-blue-600 text-white" : "border-2 border-slate-200 bg-white text-slate-400"}`}>
                    {done ? <Icon name="check" className="text-[16px]" /> : index + 1}
                  </span>
                  <span className={`mt-1.5 px-1 text-[11.5px] font-medium ${done ? "text-slate-800" : "text-slate-400"}`}>{STATUS_LABELS[status]}</span>
                </li>
              );
            })}
          </ol>
          {history.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <MiniTable head={<><th className={th}>Stage</th><th className={th}>Date &amp; time</th><th className={th}>{isAdmin ? "Done by" : "Action"}</th></>}>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td className={td}><Badge tone={TONE[STATUS_COLORS[entry.status]] || "slate"}>{STATUS_LABELS[entry.status] || entry.status}</Badge></td>
                    <td className={`${td} whitespace-nowrap`}>{formatDateTime(entry.changed_at)}</td>
                    <td className={td}>
                      <span className="block text-[11.5px] text-slate-500">{ACTION_LABELS[entry.status] || ""}</span>
                      {entry.remarks && <span className="block text-[11.5px] text-red-700">{entry.remarks}</span>}
                      {isAdmin && <ActorCell actor={journeyActor(entry, sale)} />}
                    </td>
                  </tr>
                ))}
              </MiniTable>
            </div>
          ) : <p className="m-0 text-[13px] text-slate-400">No status history recorded yet.</p>}
        </div>
      </Panel>

      {(sale.delivery_boy_name || sale.vehicle_no || sale.delivery_date || sale.packed_by_name) && (
        <Panel title="Delivery Details" embedded={embedded}>
          <div className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-5">
            <InfoRow label="Delivery boy" value={sale.delivery_boy_name} />
            <InfoRow label="Vehicle no" value={sale.vehicle_no} />
            <InfoRow label="Delivery date" value={formatDate(sale.delivery_date)} />
            <InfoRow label="Packed by" value={sale.packed_by_name} />
            <InfoRow label="Packing date" value={formatDate(sale.packing_date)} />
          </div>
        </Panel>
      )}

      {/* Payments */}
      <Panel
        embedded={embedded} title={`Payment History (${payments.length})`}
        right={(
          <span className="flex flex-wrap gap-1.5">
            <Badge>Bill: {formatCurrency(effectivePrice)}</Badge>
            <Badge tone="green">Paid: {formatCurrency(summary.paidAmount)}</Badge>
            <Badge tone={Number(summary.balanceAmount) > 0 ? "red" : "green"}>Balance: {formatCurrency(summary.balanceAmount)}</Badge>
          </span>
        )}
      >
        {paymentHistory.length > 0 ? (
          <MiniTable
            head={(
              <>
                {["#", "Payment date", "Type"].map((h) => <th key={h} className={th}>{h}</th>)}
                {["Amount", "Total paid", "Balance after"].map((h) => <th key={h} className={`${th} text-right`}>{h}</th>)}
                <th className={th}>Collector</th>
                <th className={th}>Reference</th>
                {isAdmin && <th className={th}>Entered by</th>}
                <th className={th}>Entry time</th>
              </>
            )}
          >
            {paymentHistory.map((payment, index) => (
              <tr key={payment.id} className={payment.isCredit ? "bg-orange-50/60" : ""}>
                <td className={`${td} text-slate-400`}>{index + 1}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDate(payment.payment_date)}</td>
                <td className={td}><Badge tone={payment.isCredit ? "amber" : "green"}>{payment.typeLabel}</Badge></td>
                <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums text-slate-900`}>{formatCurrency(payment.amount)}</td>
                <td className={`${td} whitespace-nowrap text-right tabular-nums`}>{formatCurrency(payment.paidSoFar)}</td>
                <td className={`${td} whitespace-nowrap text-right font-bold tabular-nums ${payment.balanceAfter > 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(payment.balanceAfter)}</td>
                <td className={td}>{payment.collector_staff_name || payment.collector_name || "N/A"}</td>
                <td className={td}>
                  {payment.reference_no
                    ? `${payment.reference_no}${payment.reference_date ? ` (${formatDate(payment.reference_date)})` : ""}`
                    : "—"}
                  {payment.isCredit && payment.credit_days ? ` · ${payment.credit_days} days` : ""}
                </td>
                {isAdmin && (
                  <td className={td}>
                    {payment.updated_by_role === "admin"
                      ? "Admin"
                      : payment.updated_by_name && payment.updated_by_name !== "Staff"
                        ? `${payment.updated_by_name}${payment.updated_by_employee_code ? ` (${payment.updated_by_employee_code})` : ""}`
                        : payment.updated_by_employee_code || "Not recorded"}
                  </td>
                )}
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(payment.created_at)}</td>
              </tr>
            ))}
          </MiniTable>
        ) : <p className="m-0 px-5 py-6 text-[13px] text-slate-400">No payments recorded yet.</p>}
      </Panel>

      {collections.length > 0 && (
        <Panel title="D.B. Collection Submissions" embedded={embedded}>
          <MiniTable head={<>{["Delivery boy", "Mode", "Amount", "Reference", "Submitted at"].map((h) => <th key={h} className={th}>{h}</th>)}</>}>
            {collections.map((row) => (
              <tr key={row.id}>
                <td className={td}>{row.delivery_boy_name}</td>
                <td className={td}>{PAYMENT_LABELS[row.payment_mode] || row.payment_mode}</td>
                <td className={`${td} tabular-nums`}>{formatCurrency(row.amount)}</td>
                <td className={td}>
                  {row.reference_no
                    ? `${row.reference_no}${row.reference_date ? ` (${formatDate(row.reference_date)})` : ""}`
                    : "—"}
                </td>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(row.updated_at || row.created_at)}</td>
              </tr>
            ))}
          </MiniTable>
        </Panel>
      )}

      {takenBills.length > 0 && (
        <Panel title="Credit Bill Collection" embedded={embedded}>
          <MiniTable head={<>{["Taken date", "Collector", "Credit amount", "Status"].map((h) => <th key={h} className={th}>{h}</th>)}</>}>
            {takenBills.map((row) => (
              <tr key={row.id}>
                <td className={`${td} whitespace-nowrap`}>{formatDate(row.taken_date)}</td>
                <td className={td}>{row.staff_name || row.delivery_boy_name || "N/A"}</td>
                <td className={`${td} tabular-nums`}>{formatCurrency(row.credit_amount)}</td>
                <td className={td}>{row.returned_at ? `Returned (${formatDateTime(row.returned_at)})` : "Taken"}</td>
              </tr>
            ))}
          </MiniTable>
        </Panel>
      )}

      {cancellations.length > 0 && (
        <Panel title="Cancellations / Returns" embedded={embedded}>
          <MiniTable
            head={(
              <>
                {["Product", "Qty to cancel", "Amount", "Date"].map((h) => <th key={h} className={th}>{h}</th>)}
                {isAdmin && <th className={th}>Requested by</th>}
                {isAdmin && <th className={th}>Cancelled / approved by</th>}
              </>
            )}
          >
            {cancellations.map((row) => (
              <tr key={row.id}>
                <td className={td}>{row.product_name}</td>
                <td className={`${td} tabular-nums`}>{formatCancelQtyDisplay(row)}</td>
                <td className={`${td} tabular-nums`}>{formatCurrency(row.amount)}</td>
                <td className={`${td} whitespace-nowrap`}>{formatDateTime(row.created_at)}</td>
                {isAdmin && <td className={td}>{row.requested_by_name || "—"}</td>}
                {isAdmin && (
                  <td className={td}>
                    <ActorCell
                      actor={
                        row.approved_by_name
                          ? { name: row.approved_by_name, role: row.cancelled_by_role, recorded: true }
                          : null
                      }
                    />
                  </td>
                )}
              </tr>
            ))}
          </MiniTable>
        </Panel>
      )}
    </div>
  );
}

InvoiceDetails.propTypes = { details: PropTypes.object.isRequired, embedded: PropTypes.bool };
InvoiceDetails.defaultProps = { embedded: false };

export default InvoiceDetails;
