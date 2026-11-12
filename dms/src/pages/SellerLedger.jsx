import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MdAdd, MdDeleteOutline, MdEdit, MdRefresh, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { COMPANY_TYPES, ConfirmDialog, ExcelButton, Field, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";
import { downloadExcel, fileSafe } from "../utils/excel";
import { rupees, showDate, todayLocal } from "../utils/purchaseCalc";

// Seller ledger. Credit = we owe more (purchases, opening balance, credit adjustments).
// Debit = we owe less (payments, debit notes). Balance "Cr" = payable to the seller,
// "Dr" = advance paid. The backend builds the lines: backend/src/models/sellerLedgerModel.js.

const ENTRY_TYPES = [
  { value: "payment", label: "Payment", side: "Dr", hint: "Money paid to the seller" },
  { value: "debit_note", label: "Debit note", side: "Dr", hint: "Goods returned, claims or discount from the seller" },
  { value: "credit_note", label: "Credit adjustment", side: "Cr", hint: "Extra charges the seller added" },
  { value: "opening", label: "Opening balance", side: "Cr", hint: "Amount already owed before using this ledger" },
];
const MODES = [
  { value: "bank", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
];
const modeLabel = (v) => MODES.find((m) => m.value === v)?.label || "";
const typeMeta = (v) => ENTRY_TYPES.find((t) => t.value === v);

const balanceText = (value) => {
  const v = Math.round((Number(value) || 0) * 100) / 100;
  if (!v) return "₹0.00";
  return `${rupees(Math.abs(v))} ${v > 0 ? "Cr" : "Dr"}`;
};

const KIND_STYLE = {
  purchase: "text-base-content",
  payment: "text-success",
  debit_note: "text-info",
  credit_note: "text-secondary",
  opening: "text-base-content/70",
};

function EntryDialog({ seller, entry, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    entryType: entry?.kind || "payment",
    entryDate: entry?.date || todayLocal(),
    amount: entry ? String(entry.amount) : "",
    paymentMode: entry?.paymentMode || "bank",
    reference: entry?.reference || "",
    note: entry?.note || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const meta = typeMeta(form.entryType);

  const save = async (e) => {
    e.preventDefault();
    if (!(Number(form.amount) > 0)) return setError("Amount must be more than zero.");
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(entry ? `/staff/seller-ledger/entries/${entry.id}` : "/staff/seller-ledger/entries", {
        method: entry ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sellerId: seller.id }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Could not save.");
      onSaved(data.message || "Saved.");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="modal modal-open z-[1300]" role="dialog">
      <form onSubmit={save} className="modal-box max-w-lg p-0">
        <div className="border-b border-base-300 px-5 py-3">
          <h3 className="font-semibold">{entry ? "Edit entry" : "New ledger entry"}</h3>
          <p className="text-xs text-base-content/60">
            {seller.seller_name} · {seller.company_name}
          </p>
        </div>
        <fieldset disabled={busy} className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-2">
            {ENTRY_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm((p) => ({ ...p, entryType: t.value }))}
                className={`rounded-box border px-3 py-2 text-left text-sm ${
                  form.entryType === t.value ? "border-primary bg-primary/5" : "border-base-300 hover:border-base-content/30"
                }`}
              >
                <span className="flex items-center justify-between font-medium">
                  {t.label}
                  <span className={`text-xs ${t.side === "Dr" ? "text-success" : "text-secondary"}`}>
                    {t.side === "Dr" ? "reduces due" : "adds to due"}
                  </span>
                </span>
                <span className="text-xs text-base-content/55">{t.hint}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <input type="date" className="input w-full" value={form.entryDate} max={todayLocal()} onChange={set("entryDate")} />
            </Field>
            <Field label="Amount (₹)" required>
              <input type="number" min="0.01" step="0.01" className="input w-full" value={form.amount} onChange={set("amount")} autoFocus />
            </Field>
            {form.entryType === "payment" && (
              <Field label="Paid by" required>
                <select className="select w-full" value={form.paymentMode} onChange={set("paymentMode")}>
                  {MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              label={form.entryType === "payment" ? (form.paymentMode === "cheque" ? "Cheque no." : "Reference / UTR") : "Reference no."}
              className={form.entryType === "payment" ? "" : "col-span-2"}
            >
              <input className="input w-full" maxLength={100} value={form.reference} onChange={set("reference")} />
            </Field>
            <Field label="Note" className="col-span-2">
              <input className="input w-full" maxLength={500} value={form.note} onChange={set("note")} placeholder="Optional" />
            </Field>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
        </fieldset>
        <div className="flex items-center justify-end gap-2 border-t border-base-300 bg-base-200/50 px-5 py-3">
          <span className="mr-auto text-xs text-base-content/55">
            Goes in the {meta?.side === "Dr" ? "Debit" : "Credit"} column
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            {entry ? "Save changes" : `Save ${meta?.label.toLowerCase()}`}
          </button>
        </div>
      </form>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
    </div>
  );
}

function Figure({ label, value, tone = "", sub }) {
  return (
    <div className="bg-base-100 px-4 py-3">
      <dt className="text-xs text-base-content/55">{label}</dt>
      <dd className={`mt-0.5 text-lg font-medium ${tone}`}>{value}</dd>
      {sub && <dd className="text-xs text-base-content/50">{sub}</dd>}
    </div>
  );
}

export default function SellerLedger() {
  const companies = useCompanies();
  const [showFlash, flashNode] = useFlash();
  const [params, setParams] = useSearchParams();
  const sellerId = params.get("seller") || "";

  const [summary, setSummary] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [type, setType] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [onlyDue, setOnlyDue] = useState(false);

  const [ledger, setLedger] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dialog, setDialog] = useState(null); // { entry? }
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadSummary = useCallback(() => {
    setLoadingSummary(true);
    apiFetch("/staff/seller-ledger/summary")
      .then(readJson)
      .then((data) => setSummary(Array.isArray(data.sellers) ? data.sellers : []))
      .catch(() => setSummary([]))
      .finally(() => setLoadingSummary(false));
  }, []);

  const loadLedger = useCallback(async (id) => {
    if (!id) {
      setLedger(null);
      return;
    }
    setLoadingLedger(true);
    setLedgerError("");
    try {
      const res = await apiFetch(`/staff/seller-ledger/${id}`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Could not load the ledger.");
      setLedger(data);
    } catch (err) {
      setLedgerError(err.message);
      setLedger(null);
    } finally {
      setLoadingLedger(false);
    }
  }, []);

  useEffect(loadSummary, [loadSummary]);
  useEffect(() => {
    loadLedger(sellerId);
  }, [sellerId, loadLedger]);

  const pickSeller = (id) => {
    setParams(id ? { seller: String(id) } : {});
    setFrom("");
    setTo("");
  };

  const sellers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summary
      .filter(
        (s) =>
          (!type || s.company_type === type) &&
          (!companyId || String(s.company_id) === companyId) &&
          (!onlyDue || Math.abs(s.balance) >= 0.01) &&
          (!q || [s.seller_name, s.seller_code, s.company_name].some((v) => String(v || "").toLowerCase().includes(q)))
      )
      .sort((a, b) => b.balance - a.balance || String(a.seller_name).localeCompare(String(b.seller_name)));
  }, [summary, type, companyId, onlyDue, search]);
  const totalDue = sellers.reduce((t, s) => t + (Number(s.balance) || 0), 0);

  // Statement for the chosen period: brought-forward balance, lines, totals, closing.
  const statement = useMemo(() => {
    const lines = ledger?.lines || [];
    const before = from ? lines.filter((l) => l.date < from) : [];
    const opening = before.length ? before[before.length - 1].balance : 0;
    const inRange = lines.filter((l) => (!from || l.date >= from) && (!to || l.date <= to));
    const debit = inRange.reduce((t, l) => t + l.debit, 0);
    const credit = inRange.reduce((t, l) => t + l.credit, 0);
    const closing = inRange.length ? inRange[inRange.length - 1].balance : opening;
    const all = lines.reduce(
      (t, l) => ({
        purchases: t.purchases + (l.kind === "purchase" ? l.credit : 0),
        payments: t.payments + (l.kind === "payment" ? l.debit : 0),
        notes: t.notes + (l.kind === "debit_note" ? l.debit : 0),
        other: t.other + (l.kind === "credit_note" || l.kind === "opening" ? l.credit : 0),
      }),
      { purchases: 0, payments: 0, notes: 0, other: 0 }
    );
    const lastPayment = [...lines].reverse().find((l) => l.kind === "payment");
    return { opening, rows: inRange, debit, credit, closing, all, lastPayment, hasBefore: Boolean(from) };
  }, [ledger, from, to]);

  const refreshAll = () => {
    loadSummary();
    loadLedger(sellerId);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/staff/seller-ledger/entries/${toDelete.id}`, { method: "DELETE" });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Could not delete.");
      showFlash(true, "Entry deleted.");
      refreshAll();
    } catch (err) {
      showFlash(false, err.message);
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const seller = ledger?.seller;

  const exportStatement = () => {
    const rows = [
      ...(statement.hasBefore
        ? [{ date: from, particulars: "Opening balance b/f", reference: "", mode: "", debit: null, credit: null, balance: statement.opening }]
        : []),
      ...statement.rows.map((l) => ({
        date: l.date,
        particulars: l.particulars,
        reference: l.reference,
        entryCode: l.entryCode,
        mode: modeLabel(l.paymentMode),
        note: l.note,
        debit: l.debit || null,
        credit: l.credit || null,
        balance: l.balance,
      })),
    ];
    return downloadExcel({
      fileName: `Ledger_${fileSafe(seller.seller_name)}_${fileSafe(seller.company_name)}`,
      title: `Seller ledger · ${seller.seller_name} (${seller.seller_code || ""}) · ${seller.company_name}${
        from || to ? ` · ${from ? showDate(from) : "start"} to ${to ? showDate(to) : "today"}` : ""
      }`,
      sheets: [
        {
          name: "Ledger",
          rows,
          columns: [
            { header: "Date", key: "date", width: 12, type: "date" },
            { header: "Particulars", key: "particulars", width: 22 },
            { header: "Ref / Invoice No.", key: "reference", width: 18 },
            { header: "Entry Code", key: "entryCode", width: 15 },
            { header: "Mode", key: "mode", width: 13 },
            { header: "Note", key: "note", width: 30 },
            { header: "Debit (₹)", key: "debit", width: 14, type: "money", total: true },
            { header: "Credit (₹)", key: "credit", width: 14, type: "money", total: true },
            { header: "Balance (₹, + payable / − advance)", key: "balance", width: 18, type: "money" },
          ],
        },
      ],
    });
  };

  const exportSummary = () =>
    downloadExcel({
      fileName: "Seller_Balances",
      title: "Seller balances",
      sheets: [
        {
          name: "Balances",
          rows: sellers,
          columns: [
            { header: "Seller Code", key: "seller_code", width: 13 },
            { header: "Seller", key: "seller_name", width: 32 },
            { header: "Company", key: "company_name", width: 24 },
            { header: "Invoices", key: "invoice_count", width: 9, type: "number", total: true },
            { header: "Opening", key: "opening", width: 13, type: "money", total: true },
            { header: "Purchases", key: "purchases", width: 14, type: "money", total: true },
            { header: "Credit Adj.", key: "credit_adjustments", width: 13, type: "money", total: true },
            { header: "Payments", key: "payments", width: 14, type: "money", total: true },
            { header: "Debit Notes", key: "debit_notes", width: 13, type: "money", total: true },
            { header: "Balance Due", key: "balance", width: 14, type: "money", total: true },
            { header: "Last Purchase", key: "last_purchase_date", width: 12, type: "date" },
            { header: "Last Payment", key: "last_payment_date", width: 12, type: "date" },
          ],
        },
      ],
    });

  return (
    <div data-theme="dms" className="bg-transparent text-base-content">
      <div className="mx-auto max-w-[1400px]">
        <PageHeader eyebrow="Accounts" title="Seller ledger">
          Purchases add to what you owe a seller; payments and debit notes reduce it. Cr = payable, Dr = advance paid.
        </PageHeader>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_1fr]">
          {/* Seller list */}
          <aside className="self-start rounded-box border border-base-300 bg-base-100 xl:sticky xl:top-20">
            <div className="space-y-2 border-b border-base-300 p-3">
              <div className="join w-full">
                {[{ value: "", label: "All" }, ...COMPANY_TYPES].map((t) => (
                  <button
                    key={t.value || "all"}
                    type="button"
                    className={`btn join-item btn-xs flex-1 ${type === t.value ? "btn-primary" : "btn-outline field-border"}`}
                    onClick={() => {
                      setType(t.value);
                      setCompanyId("");
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <select className="select select-sm w-full" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">All companies</option>
                {companies
                  .filter((c) => !type || c.type === type)
                  .map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <label className="input input-sm w-full">
                <MdSearch size={16} className="opacity-50" />
                <input type="search" placeholder="Seller, code or company" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <div className="flex items-center justify-between text-xs">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" className="checkbox checkbox-xs" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
                  Only with a balance
                </label>
                <ExcelButton label="Excel" className="btn-xs" disabled={!sellers.length} onExport={exportSummary} />
              </div>
            </div>

            <div className="flex items-baseline justify-between border-b border-base-300 bg-base-200/50 px-3 py-2 text-sm">
              <span className="text-base-content/60">
                {sellers.length} seller{sellers.length === 1 ? "" : "s"}
              </span>
              <span>
                Total due <b className="tabular-nums">{balanceText(totalDue)}</b>
              </span>
            </div>

            <ul className="max-h-[60vh] overflow-y-auto">
              {loadingSummary && !summary.length ? (
                <li className="flex justify-center py-8">
                  <span className="loading loading-dots loading-sm text-primary" />
                </li>
              ) : sellers.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-base-content/55">No sellers match.</li>
              ) : (
                sellers.map((s) => {
                  const active = String(s.seller_id) === sellerId;
                  return (
                    <li key={s.seller_id}>
                      <button
                        type="button"
                        onClick={() => pickSeller(s.seller_id)}
                        className={`flex w-full items-start gap-2 border-b border-base-200 px-3 py-2.5 text-left ${
                          active ? "bg-primary/10" : "hover:bg-base-200/60"
                        }`}
                      >
                        <span className={`mt-1 h-8 w-1 shrink-0 rounded-full ${active ? "bg-primary" : "bg-transparent"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{s.seller_name}</span>
                          <span className="block truncate text-xs text-base-content/55">
                            <span className="font-mono">{s.seller_code}</span> · {s.company_name || "—"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={`block text-sm tabular-nums ${s.balance > 0 ? "font-semibold" : "text-base-content/55"}`}>
                            {balanceText(s.balance)}
                          </span>
                          <span className="block text-[11px] text-base-content/45">
                            {s.invoice_count} inv{s.last_payment_date ? ` · paid ${showDate(s.last_payment_date)}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </aside>

          {/* Statement */}
          <section className="min-w-0">
            {!sellerId ? (
              <div className="rounded-box border border-dashed border-base-300 bg-base-100 px-6 py-20 text-center">
                <p className="font-medium">Pick a seller on the left</p>
                <p className="mt-1 text-sm text-base-content/60">Their purchases, payments and balance will show here.</p>
              </div>
            ) : ledgerError ? (
              <div className="rounded-box border border-base-300 bg-base-100 px-6 py-16 text-center text-sm text-error">{ledgerError}</div>
            ) : !seller ? (
              <div className="flex justify-center rounded-box border border-base-300 bg-base-100 py-20">
                <span className="loading loading-dots loading-md text-primary" />
              </div>
            ) : (
              <div className={loadingLedger ? "opacity-60" : ""}>
                {/* Seller header */}
                <div className="mb-4 rounded-box border border-base-300 bg-base-100">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-primary">{seller.seller_code}</p>
                      <h2 className="text-xl font-semibold">{seller.seller_name}</h2>
                      <p className="text-sm text-base-content/60">
                        {seller.company_name}
                        {seller.gstin ? ` · GSTIN ${seller.gstin}` : ""}
                        {seller.contact ? ` · ${seller.contact}` : ""}
                      </p>
                      {(seller.address || seller.city) && (
                        <p className="text-xs text-base-content/50">
                          {[seller.address, seller.city, seller.district, seller.state, seller.in_code].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-base-content/55">Balance due</p>
                      <p className={`text-3xl font-semibold ${statement.closing > 0 && !to ? "text-secondary" : ""}`}>
                        {balanceText((ledger.lines.at(-1) || {}).balance || 0)}
                      </p>
                      {statement.lastPayment && (
                        <p className="text-xs text-base-content/55">
                          Last paid {rupees(statement.lastPayment.debit)} on {showDate(statement.lastPayment.date)}
                        </p>
                      )}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-px border-t border-base-300 bg-base-300 sm:grid-cols-4">
                    <Figure label="Purchases" value={rupees(statement.all.purchases)} />
                    <Figure label="Opening + adjustments" value={rupees(statement.all.other)} />
                    <Figure label="Payments" value={rupees(statement.all.payments)} tone="text-success" />
                    <Figure label="Debit notes" value={rupees(statement.all.notes)} tone="text-info" />
                  </dl>
                </div>

                {/* Toolbar */}
                <div className="mb-3 flex flex-wrap items-end gap-3">
                  <Field label="From">
                    <input type="date" className="input input-sm w-36" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label="To">
                    <input type="date" className="input input-sm w-36" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                  {(from || to) && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFrom(""); setTo(""); }}>
                      All dates
                    </button>
                  )}
                  <div className="ml-auto flex flex-wrap gap-2">
                    <button type="button" className="btn btn-ghost btn-sm btn-square" title="Refresh" onClick={refreshAll}>
                      <MdRefresh size={18} className={loadingLedger ? "animate-spin" : ""} />
                    </button>
                    <ExcelButton disabled={!statement.rows.length && !statement.hasBefore} onExport={exportStatement} />
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog({})}>
                      <MdAdd size={18} /> Add entry
                    </button>
                  </div>
                </div>

                {/* Ledger table */}
                <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
                  <table className="table table-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b-2 border-base-300 bg-base-200/70 text-base-content/70">
                        <th className="w-28">Date</th>
                        <th>Particulars</th>
                        <th>Ref / Invoice</th>
                        <th className="w-36 text-right">Debit (₹)</th>
                        <th className="w-36 text-right">Credit (₹)</th>
                        <th className="w-40 text-right">Balance</th>
                        <th className="w-16">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.hasBefore && (
                        <tr className="bg-base-200/40 italic text-base-content/70">
                          <td>{showDate(from)}</td>
                          <td colSpan={4}>Opening balance brought forward</td>
                          <td className="text-right font-medium not-italic tabular-nums">{balanceText(statement.opening)}</td>
                          <td />
                        </tr>
                      )}
                      {statement.rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-sm text-base-content/55">
                            {ledger.lines.length ? "No entries in these dates." : "Nothing on this ledger yet."}
                          </td>
                        </tr>
                      ) : (
                        statement.rows.map((l) => (
                          <tr key={l.key} className="hover:bg-base-200/40">
                            <td className="tabular-nums">{showDate(l.date)}</td>
                            <td className="max-w-80">
                              <div className={`font-medium ${KIND_STYLE[l.kind] || ""}`}>
                                {l.particulars}
                                {l.paymentMode && <span className="font-normal text-base-content/60"> · {modeLabel(l.paymentMode)}</span>}
                              </div>
                              {l.note && <div className="truncate text-xs text-base-content/55" title={l.note}>{l.note}</div>}
                            </td>
                            <td>
                              <div className="text-sm">{l.reference || "—"}</div>
                              {l.entryCode && l.entryCode !== l.reference && (
                                <div className="font-mono text-xs text-primary">{l.entryCode}</div>
                              )}
                            </td>
                            <td className="text-right tabular-nums">{l.debit ? rupees(l.debit) : ""}</td>
                            <td className="text-right tabular-nums">{l.credit ? rupees(l.credit) : ""}</td>
                            <td className={`text-right font-medium tabular-nums ${l.balance < 0 ? "text-success" : ""}`}>
                              {balanceText(l.balance)}
                            </td>
                            <td className="text-right">
                              {l.kind !== "purchase" && (
                                <>
                                  <button type="button" className="btn btn-ghost btn-xs btn-square" title="Edit" onClick={() => setDialog({ entry: l })}>
                                    <MdEdit size={15} />
                                  </button>
                                  <button type="button" className="btn btn-ghost btn-xs btn-square text-error" title="Delete" onClick={() => setToDelete(l)}>
                                    <MdDeleteOutline size={16} />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-base-300 text-sm text-base-content">
                        <td colSpan={3} className="font-semibold">
                          {from || to ? "Total for these dates" : "Total"}
                        </td>
                        <td className="text-right font-semibold tabular-nums">{rupees(statement.debit)}</td>
                        <td className="text-right font-semibold tabular-nums">{rupees(statement.credit)}</td>
                        <td />
                        <td />
                      </tr>
                      <tr className="bg-primary/5 text-sm text-base-content">
                        <td colSpan={5} className="font-semibold">
                          Closing balance{to ? ` on ${showDate(to)}` : ""}
                          <span className="ml-2 font-normal text-base-content/55">
                            {statement.closing > 0 ? "payable to seller" : statement.closing < 0 ? "advance with seller" : "settled"}
                          </span>
                        </td>
                        <td className="text-right text-base font-semibold tabular-nums">{balanceText(statement.closing)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {dialog && seller && (
        <EntryDialog
          seller={seller}
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onSaved={(msg) => {
            setDialog(null);
            showFlash(true, msg);
            refreshAll();
          }}
        />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete this entry?" busy={deleting} onCancel={() => setToDelete(null)} onConfirm={handleDelete}>
          {toDelete.particulars} of <b className="text-base-content">{rupees(toDelete.amount)}</b> on {showDate(toDelete.date)} will be
          removed and the balance recalculated.
        </ConfirmDialog>
      )}
      {flashNode}
    </div>
  );
}
