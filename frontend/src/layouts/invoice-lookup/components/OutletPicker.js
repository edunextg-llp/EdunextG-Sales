// Outlet matches for Invoice Lookup: Tailwind CSS (no MUI).
import PropTypes from "prop-types";
import { Badge, Card, Icon } from "components/tw";
import { formatCurrency, formatDate } from "../format";

// Many different shops share a name ("Matri Bhander" exists in 18 areas), so every
// match is listed with the details that tell them apart: ERP ID, area, staff, phone.
function OutletPicker({ outlets, searchTerm, onSelect }) {
  // outlet_names can be empty for outlets saved without a name.
  const namesOf = (outlet) => String(outlet.outlet_names || "").split(" | ").filter(Boolean);
  const sameName = new Set(outlets.map((outlet) => String(outlet.outlet_names || "").toLowerCase())).size < outlets.length;

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div>
          <h3 className="m-0 text-[15px] font-semibold text-slate-900">{outlets.length} outlet{outlets.length === 1 ? "" : "s"} match &quot;{searchTerm}&quot;</h3>
          {sameName && <p className="m-0 mt-0.5 text-[12px] text-slate-500">Some outlets share the same name. Check the ERP ID, area and staff to pick the right one.</p>}
        </div>
        {outlets.length >= 50 && <Badge tone="amber">Showing first 50 — refine the search</Badge>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse">
          <thead>
            <tr>
              {["Outlet", "ERP ID", "Area", "Staff", "Contact"].map((h) => <th key={h} className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>)}
              <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-right">Bills</th>
              <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 text-right">Outstanding</th>
              <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last bill</th>
              <th className="whitespace-nowrap bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500" />
            </tr>
          </thead>
          <tbody>
            {outlets.map((outlet) => {
              const outstanding = Number(outlet.total_outstanding) || 0;
              const names = namesOf(outlet);
              return (
                <tr key={outlet.outlet_key} onClick={() => onSelect(outlet)} className="cursor-pointer hover:bg-blue-50/40">
                  <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700">
                    <span className="block font-semibold text-slate-900">{names[0] || "Unnamed outlet"}</span>
                    {names.length > 1 && <span className="block text-[11.5px] text-slate-500">also saved as: {names.slice(1).join(", ")}</span>}
                  </td>
                  <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 whitespace-nowrap font-mono text-[11.5px]">{outlet.outlet_erp_id}</td>
                  <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700">{outlet.locations || "—"}</td>
                  <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700">{outlet.staff_names || "—"}</td>
                  <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700">{outlet.contacts || "—"}</td>
                  <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 text-right tabular-nums">{outlet.invoice_count}</td>
                  <td className={`border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 whitespace-nowrap text-right font-bold tabular-nums ${outstanding > 0 ? "text-red-700" : "text-emerald-700"}`}>{formatCurrency(outstanding)}</td>
                  <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 whitespace-nowrap">{outlet.last_sale_date ? formatDate(outlet.last_sale_date) : "No bills"}</td>
                  <td className="border-t border-slate-100 px-3 py-2.5 align-top text-[12.5px] text-slate-700 text-right">
                    <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[12.5px] font-semibold text-blue-600">View<Icon name="chevron_right" className="text-[18px]" /></span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

OutletPicker.propTypes = {
  outlets: PropTypes.arrayOf(PropTypes.object).isRequired,
  searchTerm: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

export default OutletPicker;
