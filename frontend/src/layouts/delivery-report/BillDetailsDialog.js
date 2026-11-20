// Bill details + items popup: Tailwind CSS (no MUI). Loading logic unchanged.
import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Modal, Notice, btn } from "components/tw";

const money = (value) => value == null ? "—" : `Rs. ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BillDetailsDialog({ bill, onClose, api }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!bill) return undefined;
    const controller = new AbortController();
    setItems([]); setError(""); setLoading(true);
    const load = async () => {
      try {
        const response = await fetch(`${api}/staff/sales/${bill.row.id}/items`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unable to load bill items. Please retry.");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid bill items response. Please retry.");
        if (!controller.signal.aborted) setItems(data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [bill, api, retry]);
  const row = bill?.row || {};
  const draft = bill?.draft || {};
  const details = [
    ["Invoice", row.invoice_number || row.id], ["Sticker number", row.sticker_number],
    ["Bill date", row.formatted_date || row.sale_date], ["Company", row.company_name],
    ["Outlet", row.outlet_name], ["Outlet ERP ID", row.outlet_erp_id],
    ["Area", row.location_name], ["Sales staff", row.staff_name],
    ["Outlet staff", row.outlet_staff_name], ["Status", row.packaging_status],
    ["Assigned delivery staff", draft.name], ["Assignment date", draft.date],
    ["Vehicle", draft.vehicle], ["Packed by", row.packed_by_name],
    ["Packing date", row.packing_date], ["Items", row.item_count],
    ["Packed items", row.packed_item_count], ["Boxes", row.box_count], ["Packets", row.packet_count],
    ["Payment mode", row.payment_mode], ["Original bill total", money(row.price)],
    ["Cancelled amount", money(row.cancelled_amount)], ["Bill total", money(row.effective_price ?? row.price)],
    ["Paid", money(row.paid_amount)], ["Balance", money(row.balance_amount)],
  ];
  const th = "sticky top-0 z-[1] whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const td = "border-t border-slate-100 px-3 py-2 text-[12.5px] align-top";
  return (
    <Modal
      open={Boolean(bill)} onClose={onClose} size="xl" title={`Bill Details — ${row.invoice_number || row.id}`}
      actions={<button type="button" className={btn.ghost} onClick={onClose}>Close</button>}
    >
      <dl className="m-0 mb-5 grid gap-x-6 gap-y-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
        {details.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="m-0 truncate text-[13px] font-medium text-slate-800">{value === "" || value == null ? "—" : String(value)}</dd>
          </div>
        ))}
      </dl>
      <h4 className="m-0 mb-2 text-[14px] font-semibold text-slate-900">Bill items</h4>
      {loading ? <p role="status" className="m-0 py-6 text-center text-[13px] text-slate-400">Loading items…</p> : error ? (
        <div className="flex flex-wrap items-center gap-3">
          <Notice tone="error">{error}</Notice>
          <button type="button" className={btn.outline} onClick={() => setRetry((value) => value + 1)}>Retry</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table aria-label="Bill items" className="w-full border-collapse">
            <thead><tr>{["Product", "ERP ID", "Division", "Variant", "Quantity", "Rate", "Amount"].map((label) => <th key={label} className={th}>{label}</th>)}</tr></thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id ?? index}>
                  <td className={`${td} font-medium text-slate-800`}>{item.product_name || "—"}</td>
                  <td className={`${td} font-mono text-[11.5px]`}>{item.product_erp_id || "—"}</td>
                  <td className={td}>{item.product_division || "—"}</td>
                  <td className={td}>{item.variant_name || "—"}</td>
                  <td className={`${td} tabular-nums`}>{item.qty}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{money(item.rate)}</td>
                  <td className={`${td} whitespace-nowrap font-semibold tabular-nums`}>{money(item.line_total)}</td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-slate-400">No item details recorded for this bill.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

BillDetailsDialog.propTypes = { bill: PropTypes.object, onClose: PropTypes.func.isRequired, api: PropTypes.string.isRequired };
