// Shared Tailwind CSS building blocks for pages moved off MUI (Permissions, Areas, ...).
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";

// Material Icons font (loaded in public/index.html), same icons as before.
export function Icon({ name, className }) {
  return <span className={`material-icons-round leading-none ${className}`} aria-hidden="true">{name}</span>;
}
Icon.propTypes = { name: PropTypes.string.isRequired, className: PropTypes.string };
Icon.defaultProps = { className: "text-[20px]" };

export const btn = {
  primary: "inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50",
  outline: "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
  ghost: "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40",
  danger: "inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-[13px] font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50",
  icon: "inline-flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent",
};

export const fieldClass = "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100";

export function Field({ label, width, hint, children }) {
  return (
    <label className={`flex flex-col gap-1 ${width}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-slate-500">{hint}</span>}
    </label>
  );
}
Field.propTypes = { label: PropTypes.string.isRequired, width: PropTypes.string, hint: PropTypes.node, children: PropTypes.node.isRequired };
Field.defaultProps = { width: "w-28", hint: null };

// Message box: error / success / info, optional close button.
const NOTICE_TONES = {
  error: { cls: "border-red-200 bg-red-50 text-red-800", icon: "error_outline" },
  success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: "check_circle" },
  info: { cls: "border-blue-200 bg-blue-50 text-blue-800", icon: "info" },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-800", icon: "warning_amber" },
};
export function Notice({ tone, children, onClose, className }) {
  const t = NOTICE_TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] ${t.cls} ${className}`}>
      <Icon name={t.icon} className="text-[19px]" />
      <span className="grow">{children}</span>
      {onClose && (
        <button type="button" aria-label="Close" onClick={onClose} className="opacity-60 hover:opacity-100"><Icon name="close" className="text-[18px]" /></button>
      )}
    </div>
  );
}
Notice.propTypes = { tone: PropTypes.oneOf(Object.keys(NOTICE_TONES)), children: PropTypes.node.isRequired, onClose: PropTypes.func, className: PropTypes.string };
Notice.defaultProps = { tone: "info", onClose: null, className: "" };

export function Spinner({ className }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-slate-200 border-t-blue-600 ${className}`} aria-label="Loading" />;
}
Spinner.propTypes = { className: PropTypes.string };
Spinner.defaultProps = { className: "size-5" };

const MODAL_SIZES = { md: "max-w-md", lg: "max-w-2xl", xl: "max-w-4xl" };
// Centered dialog; Escape or the backdrop closes it (unless locked while saving).
export function Modal({ open, onClose, title, children, actions, locked, size }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape" && !locked) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, locked]);
  if (!open) return null;
  // Rendered at the end of <body> so it always sits above the page (and any MUI dialog still in use).
  return createPortal((
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={() => { if (!locked) onClose(); }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" className={`relative w-full ${MODAL_SIZES[size]} overflow-hidden rounded-2xl bg-white font-[Poppins,Roboto,sans-serif] text-slate-700 shadow-2xl`}>
        <h3 className="m-0 border-b border-slate-100 px-5 py-4 text-[16px] font-semibold text-slate-900">{title}</h3>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{actions}</div>
      </div>
    </div>
  ), document.body);
}
Modal.propTypes = {
  open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, title: PropTypes.node.isRequired,
  children: PropTypes.node.isRequired, actions: PropTypes.node.isRequired, locked: PropTypes.bool, size: PropTypes.oneOf(["md", "lg", "xl"]),
};
Modal.defaultProps = { locked: false, size: "md" };

// Small stat box for page headers.
export function StatBox({ label, value, icon }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <Icon name={icon} className="text-[18px] text-slate-400" />
      <span className="text-[18px] font-bold tabular-nums text-slate-900">{value}</span>
      <span className="text-[12px] text-slate-500">{label}</span>
    </div>
  );
}
StatBox.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.node.isRequired, icon: PropTypes.string.isRequired };

// On/off switch (a real checkbox underneath, so labels and keyboard work).
export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} aria-label={label} disabled={disabled} />
      <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40 peer-disabled:opacity-50" />
      <span className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
    </span>
  );
}
Toggle.propTypes = { checked: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired, label: PropTypes.string.isRequired, disabled: PropTypes.bool };
Toggle.defaultProps = { disabled: false };

// Page title row: title, description, actions on the right.
export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-4">
      <div className="min-w-0 grow">
        <h2 className="m-0 text-[22px] font-bold text-slate-900">{title}</h2>
        {description && <p className="m-0 mt-1 max-w-3xl text-[13px] text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
PageHeader.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.node, actions: PropTypes.node };
PageHeader.defaultProps = { description: null, actions: null };

// White card wrapper used for lists and forms.
export function Card({ children, className }) {
  return <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>{children}</section>;
}
Card.propTypes = { children: PropTypes.node.isRequired, className: PropTypes.string };
Card.defaultProps = { className: "" };

// Table header cell / body cell classes.
export const th = "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
export const td = "px-4 py-3 text-[13px] text-slate-700";

// Initials for avatar circles.
export const initialsOf = (name = "") => String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "?";

// "Select all" checkbox with the in-between state.
export function TriCheck({ checked, indeterminate, onChange, label, disabled }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} title={label} disabled={disabled}
      className="size-[18px] shrink-0 cursor-pointer rounded accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}
TriCheck.propTypes = { checked: PropTypes.bool.isRequired, indeterminate: PropTypes.bool, onChange: PropTypes.func.isRequired, label: PropTypes.string.isRequired, disabled: PropTypes.bool };
TriCheck.defaultProps = { indeterminate: false, disabled: false };

// Searchable dropdown (replaces MUI Autocomplete): type to filter, arrows + Enter to pick, Esc to close.
// options: [{ value, label, disabled }]; value: the chosen option's value (or "" / null).
export function SearchSelect({ options, value, onChange, placeholder, disabled, noOptionsText, label, loading }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => String(o.label).toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => { setActive(0); }, [query, open]);

  const pick = (option) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    setQuery("");
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === "Enter" && open) { event.preventDefault(); pick(filtered[active]); }
    else if (event.key === "Escape") setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <input
          type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-label={label || placeholder} disabled={disabled}
          className={`${fieldClass} pr-14`} placeholder={selected ? selected.label : placeholder}
          value={open ? query : selected?.label || ""}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {loading && <Spinner className="size-3.5" />}
          {selected && !disabled && (
            <button type="button" aria-label="Clear" onClick={() => { onChange(null); setQuery(""); }} className="rounded p-0.5 text-slate-400 hover:text-slate-700">
              <Icon name="close" className="text-[16px]" />
            </button>
          )}
          <Icon name="expand_more" className="pointer-events-none text-[18px] text-slate-400" />
        </span>
      </div>
      {open && !disabled && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-[calc(100%+4px)] z-[1400] m-0 max-h-64 list-none overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {filtered.map((option, index) => (
            <li
              key={option.value} role="option" aria-selected={option.value === value} aria-disabled={option.disabled}
              onMouseDown={(event) => { event.preventDefault(); pick(option); }} onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-[13px] ${option.disabled ? "cursor-not-allowed text-slate-300" : index === active ? "bg-blue-50 text-blue-800" : "text-slate-700"} ${option.value === value ? "font-semibold" : ""}`}
            >
              {option.label}
              {option.value === value && <Icon name="check" className="text-[16px] text-blue-600" />}
            </li>
          ))}
          {!filtered.length && <li className="px-2.5 py-2 text-[12.5px] text-slate-400">{noOptionsText}</li>}
        </ul>
      )}
    </div>
  );
}
SearchSelect.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), label: PropTypes.string, disabled: PropTypes.bool })).isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  noOptionsText: PropTypes.string,
  label: PropTypes.string,
  loading: PropTypes.bool,
};
SearchSelect.defaultProps = { value: null, placeholder: "Search…", disabled: false, noOptionsText: "No matches", label: "", loading: false };

// Segmented switch (Pending / Approved / ...). options: [[value, label]].
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
Segmented.propTypes = {
  options: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.node)).isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string,
};
Segmented.defaultProps = { label: "Filter" };

// Status pill. tone: green | amber | red | blue | violet | slate.
const BADGE_TONES = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-blue-50 text-blue-700",
  violet: "bg-violet-50 text-violet-700",
  slate: "bg-slate-100 text-slate-600",
};
// Common request statuses -> tone.
export const STATUS_TONE = {
  pending: "amber", awaiting_staff: "amber", open: "amber",
  approved: "green", used: "blue", done: "green", active: "green",
  rejected: "red", cancelled: "red", expired: "red",
};
export function Badge({ tone, children, icon }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${BADGE_TONES[tone] || BADGE_TONES.slate}`}>
      {icon && <Icon name={icon} className="text-[14px]" />}
      {children}
    </span>
  );
}
Badge.propTypes = { tone: PropTypes.string, children: PropTypes.node.isRequired, icon: PropTypes.string };
Badge.defaultProps = { tone: "slate", icon: "" };

// Search box with icon.
export function SearchBox({ value, onChange, placeholder, className }) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={`${fieldClass} pl-8`} />
    </div>
  );
}
SearchBox.propTypes = { value: PropTypes.string.isRequired, onChange: PropTypes.func.isRequired, placeholder: PropTypes.string, className: PropTypes.string };
SearchBox.defaultProps = { placeholder: "Search", className: "w-full max-w-xs" };

// Empty / loading placeholders inside a card.
export function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-14 text-center">
      <Icon name={icon} className="text-[34px] text-slate-300" />
      <p className="m-0 text-[13px] text-slate-500">{text}</p>
    </div>
  );
}
EmptyState.propTypes = { icon: PropTypes.string, text: PropTypes.node.isRequired };
EmptyState.defaultProps = { icon: "inbox" };

// Pagination footer: "Showing 1 to 10 of 52", rows per page, page buttons.
export function Pagination({ page, totalPages, total, onPageChange, limit, onLimitChange, options }) {
  const start = total <= 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  // Page numbers around the current page: 1 … 4 5 6 … 12
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  const pageButton = "inline-flex size-8 items-center justify-center rounded-lg text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-[12.5px] text-slate-500">
      <div className="flex flex-wrap items-center gap-3">
        <span>Showing <b className="text-slate-700">{start}</b> to <b className="text-slate-700">{end}</b> of <b className="text-slate-700">{total}</b></span>
        {onLimitChange && (
          <label className="flex items-center gap-1.5">
            Rows
            <select className={`${fieldClass} h-8 w-auto px-2`} value={limit} onChange={(e) => onLimitChange(Number(e.target.value))}>
              {options.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" className={`${pageButton} text-slate-500 hover:bg-slate-100`} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <Icon name="chevron_left" className="text-[18px]" />
        </button>
        {pages.map((p, i) => (p === "…" ? (
          // eslint-disable-next-line react/no-array-index-key
          <span key={`gap-${i}`} className="px-1 text-slate-400">…</span>
        ) : (
          <button
            key={p} type="button" onClick={() => onPageChange(p)} aria-current={p === page ? "page" : undefined}
            className={`${pageButton} ${p === page ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {p}
          </button>
        )))}
        <button type="button" className={`${pageButton} text-slate-500 hover:bg-slate-100`} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <Icon name="chevron_right" className="text-[18px]" />
        </button>
      </div>
    </div>
  );
}
Pagination.propTypes = {
  page: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  onPageChange: PropTypes.func.isRequired,
  limit: PropTypes.number,
  onLimitChange: PropTypes.func,
  options: PropTypes.arrayOf(PropTypes.number),
};
Pagination.defaultProps = { limit: 10, onLimitChange: null, options: [10, 25, 50, 100] };
