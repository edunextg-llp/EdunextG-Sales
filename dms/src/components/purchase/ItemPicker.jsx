import { useEffect, useMemo, useRef, useState } from "react";
import { MdClose, MdSearch } from "react-icons/md";

const MAX_SHOWN = 60;

// The box shows the item name (with its Sr no. when the list has one); code, ERP ID etc.
// sit in their own boxes beside it.
const nameOf = (item) => item.variant_name || item.sku_name || item.product_erp_id || "";
const labelOf = (item) => `${item.sr ? `${item.sr} · ` : ""}${nameOf(item)}`;

/**
 * Type-to-search list of the seller's items.
 * `value` is the chosen seller item (or null); `onPick(item | null)`.
 * Items may carry `sr` (Sr no.): it shows before the name, and typing that number finds it.
 */
export default function ItemPicker({ items, value, onPick, disabled, loading }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = words.length
      ? items.filter((it) => {
          const hay = [it.item_code, it.product_erp_id, it.sku_name, it.variant_name].join(" ").toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : items;
    // A plain number: the item with that Sr no. comes first.
    const bySr = /^\d+$/.test(query.trim()) ? items.filter((it) => it.sr && String(it.sr) === query.trim()) : [];
    return [...bySr, ...list.filter((it) => !bySr.includes(it))].slice(0, MAX_SHOWN);
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (item) => {
    onPick(item);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active]) pick(matches[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const placeholder = disabled
    ? "Select a seller first"
    : loading
      ? "Loading items…"
      : items.some((it) => it.sr)
        ? "Search item or Sr no."
        : "Search item";

  return (
    <div ref={boxRef} className="relative">
      <label className="input w-full">
        <MdSearch size={17} className="shrink-0 opacity-50" />
        <input
          value={open ? query : value ? labelOf(value) : query}
          placeholder={placeholder}
          disabled={disabled || loading}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {value && !disabled && (
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            title="Clear item"
            onClick={() => {
              onPick(null);
              setQuery("");
            }}
          >
            <MdClose size={14} />
          </button>
        )}
      </label>

      {open && !disabled && !loading && (
        <ul
          ref={listRef}
          className="absolute z-30 mt-1 max-h-72 w-[min(30rem,calc(100vw-3rem))] overflow-y-auto rounded-box border border-base-300 bg-base-100 py-1 shadow-lg"
        >
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-base-content/60">No matching items</li>}
          {matches.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(it)}
                className={`flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-sm ${
                  i === active ? "bg-base-200" : ""
                }`}
              >
                {it.sr ? <span className="w-8 shrink-0 text-right text-xs tabular-nums text-base-content/50">{it.sr}</span> : null}
                <span className="w-24 shrink-0 font-mono text-xs text-primary">{it.item_code || it.product_erp_id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{it.variant_name || it.sku_name}</span>
                  <span className="block truncate text-xs text-base-content/55">
                    {it.product_erp_id}
                    {it.sku_name && it.variant_name ? ` · ${it.sku_name}` : ""}
                  </span>
                </span>
                {it.pcs_per_box ? (
                  <span className="shrink-0 text-xs text-base-content/50">{Math.trunc(Number(it.pcs_per_box))}/box</span>
                ) : null}
              </button>
            </li>
          ))}
          {items.length > MAX_SHOWN && matches.length === MAX_SHOWN && (
            <li className="px-3 py-1.5 text-xs text-base-content/50">Showing first {MAX_SHOWN}. Type to narrow down.</li>
          )}
        </ul>
      )}
    </div>
  );
}
