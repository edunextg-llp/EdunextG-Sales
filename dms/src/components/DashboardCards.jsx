import { MdBarChart, MdInsights, MdTune } from "react-icons/md";

const cardClass = "rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export const dashboardActionClass = "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50";

export function DashboardFilters({ children }) {
  return (
    <div role="group" aria-label="Dashboard filters" className={`${cardClass} mb-4 flex flex-wrap items-end gap-3 px-4 py-3 sm:px-5`}>
      <span className="mr-1 flex items-center gap-1.5 self-center text-[13px] font-semibold text-slate-800">
        <MdTune size={18} aria-hidden="true" className="text-slate-500" /> Filters
      </span>
      {children}
    </div>
  );
}

export function DashboardSelect({ label, value, onChange, disabled, children }) {
  return (
    <label className="flex min-w-36 grow flex-col gap-1 sm:grow-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-400"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

export function DashboardSectionHeading({ children }) {
  return <h2 className="mb-2.5 mt-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">{children}</h2>;
}

export function Panel({ title, subtitle, icon = <MdBarChart size={19} />, action, children }) {
  return (
    <section className={`${cardClass} flex h-full min-w-0 flex-col`}>
      <header className="flex flex-wrap items-start gap-3 border-b border-slate-100 px-4 pb-3 pt-4 sm:px-5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[15px] font-semibold leading-snug text-slate-900">{title}</h3>
          {subtitle && <p className="m-0 mt-0.5 text-[12.5px] text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="min-w-0 grow px-3 pb-3 pt-2">{children}</div>
    </section>
  );
}

export function StatTile({ label, value, note, icon = <MdInsights size={20} />, tone = "#2563eb" }) {
  return (
    <div className={`${cardClass} flex h-full items-start gap-3 p-4`}>
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `${tone}14`, color: tone }}>
        {icon}
      </span>
      <div className="min-w-0 grow">
        <div className="text-[12px] font-medium text-slate-500">{label}</div>
        <div className="mt-0.5 text-[20px] font-bold leading-tight tabular-nums tracking-tight text-slate-900">{value}</div>
        {note && <div className="mt-1 text-[11.5px] text-slate-500">{note}</div>}
      </div>
    </div>
  );
}
