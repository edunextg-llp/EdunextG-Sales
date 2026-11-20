// Delivery Manager > Material Reports: Tailwind CSS (no MUI). Loading, reason and review logic unchanged.
import { useCallback, useEffect, useMemo, useState } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { formatDateTime, money } from "layouts/overdue-requests/components/ReviewDialog";
import {
  Badge, Card, EmptyState, Field, Icon, Modal, Notice, PageHeader, SearchBox, Segmented, Spinner, StatBox, btn, fieldClass, td, th,
} from "components/tw";

const API = process.env.REACT_APP_API_URL;

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "reason_pending", label: "Packer reason pending" },
  { value: "pending", label: "Waiting for review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];
// Review badge: [label, tone].
const REVIEW_BADGE = {
  pending: ["Waiting for review", "amber"],
  approved: ["Approved", "green"],
  rejected: ["Rejected", "red"],
};
const qtyText = (value) => (value == null ? "" : String(Number(value)));

// Extra / less material reported by delivery boys after delivery.
//  - Packaging staff: reports on invoices they packed; they must give the reason.
//  - Reviewers (material_report_review: DEEP and SUNANDA BISWAS): approve / reject extra and less.
//    Rejecting less adds the amount back to the bill; rejecting extra takes the star back.
//  - Admin: every report and each delivery boy's stars.
function MaterialReports() {
  // Tabs: less / extra product reports, and cancelled deliveries (reviewers and admin only).
  const [tab, setTab] = useState("less");
  const type = tab === "cancelled" ? "" : tab;
  const [cancelled, setCancelled] = useState([]);
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [reports, setReports] = useState([]);
  const [stars, setStars] = useState([]);
  const [access, setAccess] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null); // { report, kind: 'reason' | 'approve' | 'reject' }
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (fromDate) params.set("fromDate", fromDate);
        if (toDate) params.set("toDate", toDate);
        if (search.trim()) params.set("search", search.trim());
        if (tab === "cancelled") {
          const response = await fetch(
            `${API}/material-reports/cancelled-deliveries?${params.toString()}`
          );
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Unable to load cancelled deliveries.");
          setCancelled(data.deliveries || []);
        } else {
          if (type) params.set("type", type);
          if (status) params.set("status", status);
          const response = await fetch(`${API}/material-reports?${params.toString()}`);
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Unable to load material reports.");
          setReports(data.reports || []);
          setStars(data.stars || []);
          setAccess(data.access || {});
        }
        setError("");
      } catch (err) {
        setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tab, type, status, fromDate, toDate, search]
  );

  useEffect(() => {
    const timer = setTimeout(() => load(), 300);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => load(true), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const myPackerId = access.packerId ? Number(access.packerId) : null;
  const totals = useMemo(
    () => ({
      extra: reports.filter((r) => r.report_type === "extra").length,
      less: reports.filter((r) => r.report_type === "less").length,
      lessAmount: reports
        .filter((r) => r.report_type === "less" && r.review_status !== "rejected")
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
      waitingReview: reports.filter((r) => r.review_status === "pending").length,
      waitingReason: reports.filter((r) => !String(r.packer_reason || "").trim()).length,
    }),
    [reports]
  );

  const openDialog = (report, kind) => {
    setDialog({ report, kind });
    setText(kind === "reason" ? report.packer_reason || "" : "");
  };

  const submitDialog = async () => {
    if (!dialog) return;
    const { report, kind } = dialog;
    const value = text.trim();
    if ((kind === "reason" || kind === "reject") && value.length < 3) {
      alert(kind === "reason" ? "Enter the reason." : "Enter why it is rejected.");
      return;
    }
    setSaving(true);
    try {
      const url =
        kind === "reason"
          ? `${API}/material-reports/${report.id}/reason`
          : `${API}/material-reports/${report.id}/review`;
      const body = kind === "reason" ? { reason: value } : { action: kind, remarks: value };
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save.");
      setNotice({
        color: "success",
        text: `${report.invoice_number || report.bp_sale_id}: ${data.message}`,
      });
      setDialog(null);
      load(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const subtitle = access.isAdmin
    ? "Every extra / less material report from delivery boys, with packer reasons and reviews."
    : access.canReview
    ? "Review extra and less product reports. Rejecting less adds the amount back to the bill; rejecting extra takes the star back."
    : "Reports on invoices you packed. Give the reason for each one.";

  const tabs = [["less", "Less product"], ["extra", "Extra product"], ...((access.canReview || access.isAdmin) ? [["cancelled", "Cancelled deliveries"]] : [])];
  const iconAction = (title, icon, tone, onClick) => (
    <button
      type="button" title={title} aria-label={title} onClick={onClick}
      className={`${btn.icon} ${tone === "green" ? "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" : tone === "red" ? "text-red-500 hover:bg-red-50 hover:text-red-600" : "hover:text-blue-700"}`}
    >
      <Icon name={icon} className="text-[20px]" />
    </button>
  );
  const invoiceCell = (row) => (
    <>
      <span className="block text-[12.5px]"><b className="font-mono text-slate-800">{row.invoice_number || "—"}</b> <span className="text-slate-400">· {row.bp_sale_id}</span></span>
      <span className="block font-semibold text-slate-800">{row.outlet_name || "—"}</span>
    </>
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Material Reports"
          description={`${subtitle}${totals.waitingReview && access.canReview ? ` ${totals.waitingReview} waiting for review.` : ""}${totals.waitingReason ? ` ${totals.waitingReason} without packer reason.` : ""}`}
          actions={(
            <button type="button" className={btn.outline} onClick={() => load()} disabled={loading}>
              <Icon name="refresh" className="text-[18px]" />Refresh
            </button>
          )}
        />

        {tab !== "cancelled" && (
          <div className="mb-5 flex flex-wrap gap-2">
            <StatBox label="Less reports" value={totals.less} icon="remove_shopping_cart" />
            <StatBox label="Taken off bills" value={money(totals.lessAmount)} icon="currency_rupee" />
            <StatBox label="Extra reports" value={totals.extra} icon="add_shopping_cart" />
            <StatBox label="Waiting review" value={totals.waitingReview} icon="hourglass_top" />
            <StatBox label="Reason pending" value={totals.waitingReason} icon="edit_note" />
          </div>
        )}
        {notice && <Notice tone="success" className="mb-4" onClose={() => setNotice(null)}>{notice.text}</Notice>}
        {error && <Notice tone="error" className="mb-4">{error}</Notice>}

        <Card>
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
            <Segmented label="Report type" value={tab} onChange={setTab} options={tabs} />
            <div className="grow" />
            {tab !== "cancelled" && (
              <Field label="Status" width="w-52">
                <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((o) => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="From" width="w-36"><input type="date" className={fieldClass} value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
            <Field label="To" width="w-36"><input type="date" className={fieldClass} value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field>
            <SearchBox value={search} onChange={setSearch} className="w-64" placeholder={tab === "cancelled" ? "Search invoice / outlet / reason" : "Search invoice / outlet / name"} />
          </div>
          <p className="m-0 border-b border-slate-100 px-4 py-2 text-[12px] text-slate-500">
            {tab === "cancelled"
              ? `Showing ${cancelled.length} cancelled deliver${cancelled.length === 1 ? "y" : "ies"} · ${money(cancelled.reduce((sum, row) => sum + (Number(row.price) || 0), 0))}`
              : tab === "less"
                ? `Showing ${reports.length} less report(s) · ${money(totals.lessAmount)} taken off bills`
                : `Showing ${reports.length} extra report(s)`}
          </p>

          {loading ? (
            <div className="flex justify-center py-14"><Spinner className="size-7" /></div>
          ) : tab === "cancelled" ? (
            cancelled.length === 0 ? <EmptyState icon="local_shipping" text="No cancelled deliveries here." /> : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      {["#", "Cancelled", "Invoice / outlet", "Amount", "Delivery person", "Cancelled by", "Reason"].map((h) => <th key={h} className={`${th} whitespace-nowrap`}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {cancelled.map((row, index) => (
                      <tr key={row.sale_id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                        <td className={`${td} text-slate-400`}>{index + 1}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          <span className="block text-[12.5px]">{formatDateTime(row.cancelled_at) || "—"}</span>
                          <span className="block text-[11.5px] text-slate-500">Delivery date {row.delivery_date || "—"}</span>
                        </td>
                        <td className={td}>
                          {invoiceCell(row)}
                          <span className="block text-[12px] text-slate-500">
                            {row.outlet_erp_id ? `${row.outlet_erp_id} · ` : ""}{[row.company_name, row.location_name].filter(Boolean).join(" · ")}
                          </span>
                        </td>
                        <td className={`${td} whitespace-nowrap`}>
                          <span className="block font-semibold tabular-nums text-slate-900">{money(row.price)}</span>
                          <span className="block text-[11.5px] text-slate-500">{row.item_count} item(s)</span>
                        </td>
                        <td className={td}>{row.delivery_person_name || "—"}</td>
                        <td className={td}>
                          <span className="block">{row.changed_by_name || "—"}</span>
                          {row.changed_by_role && <span className="block text-[11.5px] text-slate-500">{row.changed_by_role}</span>}
                        </td>
                        <td className={`${td} max-w-72 text-[12.5px]`}>{row.cancellation_reason || <span className="text-slate-400">Not given</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : reports.length === 0 ? (
            <EmptyState icon="inventory" text="No material reports here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["#", "Reported", "Invoice / outlet", "Type", "Delivery boy", "Packed by", "Packer reason", "Review", ""].map((h) => <th key={h} className={`${th} whitespace-nowrap`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report, index) => {
                    const isLess = report.report_type === "less";
                    const isMine = myPackerId && Number(report.packed_by_id) === myPackerId;
                    const badge = REVIEW_BADGE[report.review_status];
                    const hasReason = Boolean(String(report.packer_reason || "").trim());
                    return (
                      <tr key={report.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
                        <td className={`${td} text-slate-400`}>{index + 1}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          <span className="block font-mono text-[12px] text-slate-500">#{report.id}</span>
                          <span className="block text-[12.5px]">{formatDateTime(report.created_at)}</span>
                        </td>
                        <td className={td}>
                          {invoiceCell(report)}
                          <span className="block text-[12px] text-slate-500">{report.company_name ? `${report.company_name} · ` : ""}Bill {money(report.price)}</span>
                        </td>
                        <td className={td}>
                          <Badge tone={isLess ? "amber" : "green"} icon={isLess ? "remove" : "add"}>{isLess ? `Less ${money(report.amount)}` : "Extra product"}</Badge>
                          {!isLess && report.product_name && <span className="mt-1 block text-[12px] font-semibold text-slate-700">{report.product_name} · Qty {qtyText(report.product_qty)}</span>}
                          {report.photo_url && (
                            <a href={report.photo_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-700 hover:underline">
                              <Icon name="photo_camera" className="text-[15px]" />View photo
                            </a>
                          )}
                          {report.remarks && <span className="block text-[12px] text-slate-500">{report.remarks}</span>}
                        </td>
                        <td className={td}>
                          <span className="block font-semibold text-slate-800">{report.delivery_boy_name || "—"}</span>
                          {report.star_awarded && <span className="block text-[12px] text-amber-600">⭐ 1 star</span>}
                          {!isLess && report.review_status === "rejected" && <span className="block text-[12px] font-semibold text-red-600">Star taken back</span>}
                        </td>
                        <td className={td}>{report.packed_by_name || <span className="text-slate-400">Not recorded</span>}</td>
                        <td className={`${td} max-w-64`}>
                          {hasReason ? (
                            <>
                              <span className="block text-[12.5px]">{report.packer_reason}</span>
                              <span className="block text-[11.5px] text-slate-500">{formatDateTime(report.packer_reason_at)}</span>
                            </>
                          ) : <Badge tone="red" icon="error_outline">Reason pending</Badge>}
                        </td>
                        <td className={td}>
                          {badge ? (
                            <>
                              <Badge tone={badge[1]}>{badge[0]}</Badge>
                              {report.reviewed_by_name && <span className="mt-1 block text-[11.5px] text-slate-500">{report.reviewed_by_name} · {formatDateTime(report.reviewed_at)}</span>}
                              {report.review_remarks && <span className="block text-[11.5px] text-slate-500">{report.review_remarks}</span>}
                            </>
                          ) : <span className="text-[12px] text-slate-400">Not needed</span>}
                        </td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          {isMine && iconAction(report.packer_reason ? "Edit reason" : "Give reason", "edit_note", "", () => openDialog(report, "reason"))}
                          {access.canReview && report.review_status === "pending" && (
                            <>
                              {iconAction(isLess ? "Approve (amount stays off the bill)" : "Approve (keeps the star)", "check_circle", "green", () => openDialog(report, "approve"))}
                              {iconAction(isLess ? "Reject (adds the amount back to the bill)" : "Reject (takes the star back)", "cancel", "red", () => openDialog(report, "reject"))}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {tab !== "cancelled" && access.isAdmin && stars.length > 0 && (
          <Card className="mt-5">
            <div className="border-b border-slate-100 px-5 py-3">
              <h3 className="m-0 text-[15px] font-semibold text-slate-900">Delivery boy stars</h3>
              <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">1 star for every extra product reported (all time, rejected ones removed).</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    {["Delivery boy", "Stars", "Extra reports", "Less reports", "Less amount"].map((h) => <th key={h} className={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {stars.map((row) => (
                    <tr key={row.delivery_boy_id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className={`${td} font-semibold text-slate-800`}>{row.delivery_boy_name}</td>
                      <td className={`${td} font-semibold text-amber-600`}>⭐ {row.stars}</td>
                      <td className={`${td} tabular-nums`}>{row.extra_count}</td>
                      <td className={`${td} tabular-nums`}>{row.less_count}</td>
                      <td className={`${td} tabular-nums font-semibold`}>{money(row.less_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={Boolean(dialog)} onClose={() => setDialog(null)} locked={saving} size="lg"
        title={
          dialog?.kind === "reason" ? "Reason for the material difference"
            : dialog ? `${dialog.kind === "approve" ? "Approve" : "Reject"} ${dialog.report.report_type === "less" ? "less" : "extra"} product` : ""
        }
        actions={(
          <>
            <button type="button" className={btn.ghost} disabled={saving} onClick={() => setDialog(null)}>Cancel</button>
            <button
              type="button" disabled={saving} onClick={submitDialog}
              className={`${btn.primary} ${dialog?.kind === "reject" ? "bg-red-600 hover:bg-red-700" : dialog?.kind === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
            >
              {saving ? "Saving..." : dialog?.kind === "reason" ? "Save reason" : dialog?.kind === "approve" ? "Approve" : "Reject"}
            </button>
          </>
        )}
      >
        {dialog && (
          <p className="m-0 mb-4 rounded-xl bg-slate-50 px-3.5 py-3 text-[13px] leading-relaxed text-slate-600">
            {dialog.report.invoice_number} · {dialog.report.outlet_name} ·{" "}
            {dialog.report.report_type === "less"
              ? `Less ${money(dialog.report.amount)}`
              : `Extra: ${dialog.report.product_name || "product"} · Qty ${qtyText(dialog.report.product_qty)}`}{" "}
            · reported by {dialog.report.delivery_boy_name}
            {dialog.kind === "reject" && (dialog.report.report_type === "less"
              ? ". Rejecting adds the amount back to the bill."
              : ". Rejecting takes the delivery boy's star back.")}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {dialog?.kind === "reason" ? "Why was there extra / less material?" : dialog?.kind === "reject" ? "Why is it rejected?" : "Note (optional)"}
          </span>
          <textarea rows={3} className={`${fieldClass} h-auto py-2`} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </Modal>

      <Footer />
    </DashboardLayout>
  );
}

export default MaterialReports;
