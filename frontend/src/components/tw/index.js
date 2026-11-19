// Shared Tailwind CSS building blocks for pages moved off MUI (Permissions, Areas, ...).
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={() => { if (!locked) onClose(); }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" className={`relative w-full ${MODAL_SIZES[size]} overflow-hidden rounded-2xl bg-white font-[Poppins,Roboto,sans-serif] text-slate-700 shadow-2xl`}>
        <h3 className="m-0 border-b border-slate-100 px-5 py-4 text-[16px] font-semibold text-slate-900">{title}</h3>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{actions}</div>
      </div>
    </div>
  );
}
Modal.propTypes = {
  open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, title: PropTypes.string.isRequired,
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
