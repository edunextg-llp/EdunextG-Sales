import { useCallback, useEffect, useMemo, useState } from "react";
import { MdCheck, MdClose, MdContentCopy, MdExpandLess, MdExpandMore, MdRefresh, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { PageHeader, readJson, useFlash } from "../components/ui";
import { qty as showQty, showDate } from "../utils/purchaseCalc";

// Orders > Distributor Orders. Orders a distributor sends from the Distributor Portal
// (Orders page). Approve gives a requisition number (DRQ000001...): copy it, then on Create
// Sales choose the distributor, open Create Bill and paste it in Requisition No. > Load; the
// ordered items fill the bill. Saving that bill marks the order billed.

const TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "billed", label: "Billed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "", label: "All" },
];

const STATUS_BADGE = {
  pending: "badge-warning",
  approved: "badge-success",
  billed: "badge-info",
  rejected: "badge-error",
  cancelled: "badge-ghost",
};

function CopyButton({ text, onCopied }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers / no permission: select-and-copy fallback.
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    onCopied?.(text);
  };
  return (
    <button type="button" className="btn btn-ghost btn-xs gap-1 font-mono" title="Copy requisition number" onClick={copy}>
      {text} <MdContentCopy size={13} />
    </button>
  );
}

export default function DistributorOrders() {
  const [show, flashNode] = useFlash();
  const [status, setStatus] = useState("pending");
  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { order, reason }
  const [approved, setApproved] = useState(null); // { order, requisitionNumber }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await apiFetch(`/staff/distributor-orders?${params}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load orders.");
      setOrders(Array.isArray(body.orders) ? body.orders : []);
      setCounts(body.counts || {});
    } catch (err) {
      setOrders([]);
      show(false, err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (order) => {
    setBusyId(order.id);
    try {
      const res = await apiFetch(`/staff/distributor-orders/${order.id}/approve`, { method: "POST" });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not approve the order.");
      setApproved({ order, requisitionNumber: body.requisitionNumber });
      load();
    } catch (err) {
      show(false, err.message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (e) => {
    e.preventDefault();
    const { order, reason } = rejecting;
    if (!reason.trim()) return;
    setBusyId(order.id);
    try {
      const res = await apiFetch(`/staff/distributor-orders/${order.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not reject the order.");
      show(true, body.message);
      setRejecting(null);
      load();
    } catch (err) {
      show(false, err.message);
    } finally {
      setBusyId(null);
    }
  };

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return orders;
    return orders.filter((o) => {
      const hay = [o.id, o.order_number, o.requisition_number, o.distributor_name, o.login_id, o.company_name, o.city, o.invoice_number]
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [orders, search]);

  const copied = (text) => show(true, `${text} copied. Paste it in Create Sales > Create Bill > Requisition No.`);

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Orders" title="Distributor Orders">
        Orders sent by distributors from their portal. Approve an order to get its requisition number, then on Create
        Sales choose the distributor, open Create Bill and paste the number in Requisition No. to load the items.
      </PageHeader>

      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <div className="join">
            {TABS.map((t) => (
              <button
                key={t.value || "all"}
                type="button"
                className={`btn join-item btn-sm ${status === t.value ? "btn-primary" : "btn-outline field-border"}`}
                onClick={() => setStatus(t.value)}
              >
                {t.label}
                {t.value && counts[t.value] ? <span className="badge badge-sm ml-1">{counts[t.value]}</span> : null}
              </button>
            ))}
          </div>
          <label className="input input-sm ml-auto w-64">
            <MdSearch size={16} className="opacity-50" />
            <input placeholder="Distributor, ORD no., DRQ no." value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading} title="Reload">
            <MdRefresh size={18} />
          </button>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center">
            <span className="loading loading-spinner loading-sm" />
          </p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">
            No {status ? TABS.find((t) => t.value === status)?.label.toLowerCase() : ""} orders.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm whitespace-nowrap">
              <thead>
                <tr className="bg-base-200/60 text-base-content/70">
                  <th className="w-8" />
                  <th>Order No.</th>
                  <th>Date</th>
                  <th>Distributor</th>
                  <th>Company</th>
                  <th className="text-right">Items</th>
                  <th className="text-right">Qty (pcs)</th>
                  <th>Status</th>
                  <th>Requisition No.</th>
                  <th className="w-44">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => {
                  const isOpen = openId === o.id;
                  return [
                    <tr key={o.id} className="hover:bg-base-200/50">
                      <td>
                        <button type="button" className="btn btn-ghost btn-xs btn-square" onClick={() => setOpenId(isOpen ? null : o.id)} title="Items">
                          {isOpen ? <MdExpandLess size={18} /> : <MdExpandMore size={18} />}
                        </button>
                      </td>
                      <td className="font-mono text-xs font-semibold">{o.order_number || `ORD${String(o.id).padStart(6, "0")}`}</td>
                      <td className="text-xs">{showDate(o.created_at, true)}</td>
                      <td>
                        <div className="font-medium">{o.distributor_name}</div>
                        <div className="font-mono text-xs text-base-content/55">
                          {o.login_id}
                          {o.city ? ` · ${o.city}` : ""}
                        </div>
                      </td>
                      <td className="text-xs">{o.company_name}</td>
                      <td className="text-right tabular-nums">{o.item_count}</td>
                      <td className="text-right font-semibold tabular-nums">{showQty(o.total_qty)}</td>
                      <td>
                        <span className={`badge badge-sm ${STATUS_BADGE[o.status] || ""}`}>{o.status}</span>
                        <span className="badge badge-sm badge-outline ml-1">{o.price_type === "retail" ? "Retail" : "Wholesale"}</span>
                        {o.status === "billed" && o.invoice_number ? <div className="text-xs text-base-content/55">Bill {o.invoice_number}</div> : null}
                        {o.status === "rejected" && o.reject_reason ? (
                          <div className="max-w-48 truncate text-xs text-error" title={o.reject_reason}>
                            {o.reject_reason}
                          </div>
                        ) : null}
                      </td>
                      <td>{o.requisition_number ? <CopyButton text={o.requisition_number} onCopied={copied} /> : <span className="text-base-content/40">—</span>}</td>
                      <td className="text-right">
                        {o.status === "pending" && (
                          <span className="inline-flex gap-1">
                            <button type="button" className="btn btn-success btn-xs" disabled={busyId === o.id} onClick={() => approve(o)}>
                              {busyId === o.id ? <span className="loading loading-spinner loading-xs" /> : <MdCheck size={14} />} Approve
                            </button>
                            <button type="button" className="btn btn-outline btn-error btn-xs" disabled={busyId === o.id} onClick={() => setRejecting({ order: o, reason: "" })}>
                              <MdClose size={14} /> Reject
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>,
                    isOpen && (
                      <tr key={`${o.id}-items`} className="bg-base-200/40">
                        <td />
                        <td colSpan={9} className="py-2">
                          <table className="table table-xs w-auto">
                            <thead>
                              <tr className="text-base-content/60">
                                <th className="text-right">#</th>
                                <th>Item</th>
                                <th>ERP ID</th>
                                <th className="text-right">Qty (pcs)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.items.map((it, i) => (
                                <tr key={`${it.product_erp_id}-${i}`} className={it.is_free ? "bg-success/10" : ""}>
                                  <td className="text-right text-base-content/50">{i + 1}</td>
                                  <td>
                                    {it.is_free && (
                                      <>
                                        <span className="mr-1 text-success">↳</span>
                                        <span className="badge badge-success badge-xs mr-1">FREE</span>
                                      </>
                                    )}
                                    {it.product_name}
                                    {it.variant_name ? <span className="text-base-content/60">, {it.variant_name}</span> : null}
                                    {it.is_free && it.free_note ? <div className="text-xs text-success">{it.free_note}</div> : null}
                                  </td>
                                  <td className="font-mono text-xs">{it.product_erp_id}</td>
                                  <td className="text-right font-semibold tabular-nums">{showQty(it.qty)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {o.remarks && <p className="mt-1 text-xs text-base-content/70">Note from distributor: “{o.remarks}”</p>}
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {approved && (
        <div className="modal modal-open z-[1300]" role="dialog">
          <div className="modal-box max-w-sm text-center">
            <h3 className="font-semibold">Order {approved.order.order_number || `ORD${String(approved.order.id).padStart(6, "0")}`} approved</h3>
            <p className="mt-1 text-sm text-base-content/70">
              {approved.order.distributor_name} · {approved.order.company_name}
            </p>
            <div className="mt-4 rounded-box border border-success/30 bg-success/10 px-3 py-3">
              <div className="text-xs text-base-content/60">Requisition No.</div>
              <div className="font-mono text-2xl font-bold tracking-wide">{approved.requisitionNumber}</div>
            </div>
            <p className="mt-3 text-xs text-base-content/60">
              On Create Sales choose {approved.order.distributor_name}, open Create Bill and paste this number in Requisition No., then Load.
            </p>
            <div className="modal-action justify-center">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setApproved(null)}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(approved.requisitionNumber);
                  } catch {
                    /* the number is shown; it can be copied by hand */
                  }
                  copied(approved.requisitionNumber);
                  setApproved(null);
                }}
              >
                <MdContentCopy size={15} /> Copy &amp; close
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setApproved(null)} />
        </div>
      )}

      {rejecting && (
        <div className="modal modal-open z-[1300]" role="dialog">
          <form onSubmit={reject} className="modal-box max-w-md">
            <h3 className="font-semibold">Reject order {rejecting.order.order_number || `ORD${String(rejecting.order.id).padStart(6, "0")}`}</h3>
            <p className="mt-1 text-sm text-base-content/70">{rejecting.order.distributor_name} will see this reason on their portal.</p>
            <textarea
              className="textarea mt-3 w-full"
              rows={3}
              maxLength={500}
              autoFocus
              placeholder="Reason"
              value={rejecting.reason}
              onChange={(e) => setRejecting((r) => ({ ...r, reason: e.target.value }))}
            />
            <div className="modal-action">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRejecting(null)} disabled={busyId === rejecting.order.id}>
                Cancel
              </button>
              <button type="submit" className="btn btn-error btn-sm" disabled={!rejecting.reason.trim() || busyId === rejecting.order.id}>
                Reject order
              </button>
            </div>
          </form>
          <div className="modal-backdrop" onClick={() => setRejecting(null)} />
        </div>
      )}
      {flashNode}
    </div>
  );
}
