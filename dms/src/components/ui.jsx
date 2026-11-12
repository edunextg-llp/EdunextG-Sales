import { useEffect, useState } from "react";
import { MdFileDownload } from "react-icons/md";
import { apiFetch } from "../auth";

// Small building blocks shared by the daisyUI pages (theme "dms" in index.css).

export const COMPANY_TYPES = [
  { value: "distributor", label: "Distributor" },
  { value: "cnf", label: "CNF" },
];

export const readJson = (res) => res.json().catch(() => ({}));

/** Loads the company list once for the page (skipped when `enabled` is false). */
export function useCompanies(enabled = true) {
  const [companies, setCompanies] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    apiFetch("/staff/companies")
      .then(readJson)
      .then((data) => setCompanies(Array.isArray(data) ? data : []))
      .catch(() => setCompanies([]));
  }, [enabled]);
  return companies;
}

/** Short message in the bottom corner that hides itself. */
export function useFlash() {
  const [flash, setFlash] = useState(null);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const show = (ok, text) => setFlash({ ok, text, at: Date.now() });
  const node = flash ? (
    <div className="toast toast-end z-[1400]">
      <div className={`alert py-2 text-sm ${flash.ok ? "alert-success" : "alert-error"}`}>{flash.text}</div>
    </div>
  ) : null;
  return [show, node];
}

export function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-base-300 pb-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-secondary">{eyebrow}</p>
        <h1 className="mt-0.5 text-2xl font-semibold">{title}</h1>
      </div>
      {children && <p className="max-w-md text-sm text-base-content/60">{children}</p>}
    </header>
  );
}

export function Field({ label, required, hint, className = "", children }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[13px] font-medium text-base-content/80">
        {label}
        {required && <span className="text-secondary"> *</span>}
      </span>
      {children}
      {hint}
    </label>
  );
}

/** Company type toggle + company dropdown. Extra controls (e.g. seller) go in children. */
export function CompanyPicker({ companies, type, onTypeChange, companyId, onCompanyChange, children }) {
  const ofType = companies.filter((c) => c.type === type);
  return (
    <section className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-box border border-base-300 bg-base-100 px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] font-medium text-base-content/80">Company type</span>
        <div className="join">
          {COMPANY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`btn join-item btn-sm min-w-28 ${type === t.value ? "btn-primary" : "btn-outline field-border"}`}
              onClick={() => onTypeChange(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <Field label="Company" className="min-w-64 flex-1 sm:max-w-sm">
        <select
          className="select select-sm w-full"
          value={companyId}
          disabled={!type}
          onChange={(e) => onCompanyChange(e.target.value)}
        >
          <option value="">
            {!type ? "Choose a type first" : ofType.length ? "Select company" : "No companies of this type"}
          </option>
          {ofType.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
              {c.code ? ` (${c.code})` : ""}
            </option>
          ))}
        </select>
      </Field>

      {children}
    </section>
  );
}

export function ConfirmDialog({ title, children, confirmLabel = "Delete", busy, onCancel, onConfirm }) {
  return (
    <div className="modal modal-open z-[1300]" role="dialog">
      <div className="modal-box max-w-sm">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="mt-2 text-sm text-base-content/70">{children}</div>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-error btn-sm" onClick={onConfirm} disabled={busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            {confirmLabel}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={busy ? undefined : onCancel} />
    </div>
  );
}

/** Edit dialog shell: header, body, Cancel / Save footer. */
export function EditDialog({ title, subtitle, busy, error, onClose, onSubmit, children }) {
  return (
    <div className="modal modal-open z-[1300]" role="dialog">
      <form onSubmit={onSubmit} className="modal-box max-w-2xl p-0">
        <div className="border-b border-base-300 px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="font-mono text-xs text-base-content/60">{subtitle}</p>}
        </div>
        <div className="p-5">
          {children}
          {error && <p className="mt-3 text-sm text-error">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-base-300 bg-base-200/50 px-5 py-3">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy && <span className="loading loading-spinner loading-xs" />}
            Save changes
          </button>
        </div>
      </form>
      <div className="modal-backdrop" onClick={busy ? undefined : onClose} />
    </div>
  );
}

/** "Download Excel" button. `onExport` builds and downloads the file (may be async). */
export function ExcelButton({ onExport, disabled, label = "Download Excel", onError, className = "" }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onExport();
    } catch (err) {
      if (onError) onError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className={`btn btn-soft btn-primary btn-sm ${className}`}
      disabled={disabled || busy}
      onClick={run}
    >
      {busy ? <span className="loading loading-spinner loading-xs" /> : <MdFileDownload size={17} />}
      {label}
    </button>
  );
}
