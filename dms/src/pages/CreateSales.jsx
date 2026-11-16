import { useCallback, useEffect, useMemo, useState } from "react";
import { MdAdd, MdPrint, MdRefresh, MdSearch } from "react-icons/md";
import { apiFetch } from "../auth";
import { CompanyPicker, ExcelButton, Field, PageHeader, readJson, useCompanies, useFlash } from "../components/ui";
import SalesInvoiceDialog from "../components/sales/SalesInvoiceDialog";
import { getInvoicePrefix } from "../utils/invoicePrefix";
import { downloadExcel } from "../utils/excel";
import { qty as showQty, rupees, showDate, todayLocal } from "../utils/purchaseCalc";
import { printInvoice } from "../utils/dmsInvoice";

// Sales > Create Sales: a bill to a distributor / CNF (Add Distributor) or to an outlet.
// "Create Bill" opens the same form as Add Sales > "Yes, Create Bill" (SalesInvoiceDialog).
// Its rates are before GST (5% is added); the bill is saved with GST-inclusive rates after the
// flat discount. Saving takes the stock off (lot by lot, free goods at ₹0); the bill is printed.

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round((num(v) + Number.EPSILON) * 100) / 100;



export default function CreateSales() {
  const companies = useCompanies();
  const [show, flashNode] = useFlash();

  // Buyer
  const [companyType, setCompanyType] = useState("");
  // A CNF company bills its distributors; a distributor company bills outlets
  // (chosen by staff, then location, then outlet).
  const buyerType = companyType === "cnf" ? "distributor" : "outlet";
  const [companyId, setCompanyId] = useState("");
  const company = companies.find((c) => String(c.id) === String(companyId));
  const [distributors, setDistributors] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [buyerId, setBuyerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [locationName, setLocationName] = useState("");

  // Bill
  const [saleDate, setSaleDate] = useState(todayLocal());
  const [billOpen, setBillOpen] = useState(false);
  const [billNumber, setBillNumber] = useState("");
  const [saving, setSaving] = useState(false);

  // Bills list
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [listFrom, setListFrom] = useState("");
  const [listTo, setListTo] = useState("");
  const [search, setSearch] = useState("");

  // Company: its distributors and outlets.
  useEffect(() => {
    setBillOpen(false);
    setBuyerId("");
    setStaffId("");
    setLocationName("");
    setDistributors([]);
    setOutlets([]);
    if (!companyId) return;
    apiFetch(`/staff/distributors?${new URLSearchParams({ companyId })}`)
      .then(readJson)
      .then((b) => setDistributors((b.distributors || []).filter((d) => d.is_active)))
      .catch(() => {});
    apiFetch(`/staff/dms-sales/outlets?${new URLSearchParams({ companyId })}`)
      .then(readJson)
      .then((b) => setOutlets(b.outlets || []))
      .catch(() => {});
  }, [companyId]);

  const buyer =
    buyerType === "distributor"
      ? distributors.find((d) => String(d.id) === String(buyerId))
      : outlets.find((o) => String(o.id) === String(buyerId));


  // Buyer as the Create Bill form expects it (it shows the address and loads requisitions by id).
  const billBuyer = useMemo(() => {
    if (!buyer) return null;
    return {
      ...buyer,
      buyerType,
      address: [buyer.address || buyer.location_name || "", buyer.gstin ? `GSTIN:-${buyer.gstin}` : ""].filter(Boolean).join(" "),
      contact_number: buyer.contact_number || buyer.contact_no || "",
    };
  }, [buyer, buyerType]);

  // Bill number made by the server (like Add Sales). Everest / Loriel use printed invoice books
  // with a fixed leading number, so their box is left for the rest of the number.
  const fetchNextBillNumber = async () => {
    if (!company || getInvoicePrefix(company.name)) return "";
    try {
      const res = await apiFetch(`/staff/dms-sales/next-invoice?${new URLSearchParams({ companyId })}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not make a bill number.");
      return body.billNumber || "";
    } catch (err) {
      show(false, err.message);
      return "";
    }
  };
  const openBill = async () => {
    setBillNumber(await fetchNextBillNumber());
    setBillOpen(true);
  };

  // Create Bill form submit. Its rates are before GST (5% added on the form), less the flat
  // discount; the bill is saved with that GST-inclusive rate per piece. Free lines are worked
  // out again by the server. Paid later from the bills list (Record payment).
  const submitBill = async ({ invoiceNumber, requisitionNumber, remarks, lineItems = [], totals, addAnother }) => {
    if (!company || !buyer) {
      alert("Choose the company and the buyer first.");
      return false;
    }
    const discount = 1 - num(totals?.flatDiscountPercent) / 100;
    setSaving(true);
    try {
      const res = await apiFetch("/staff/dms-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: Number(companyId),
          buyerType,
          distributorId: buyerType === "distributor" ? Number(buyerId) : undefined,
          outletId: buyerType === "outlet" ? Number(buyerId) : undefined,
          invoiceNumber: String(invoiceNumber || "").trim(),
          // A distributor order's DRQ number: the server marks that order billed with this bill.
          requisitionNumber: String(requisitionNumber || "").trim() || undefined,
          saleDate,
          lines: lineItems
            .filter((l) => !l.isFree && num(l.qty) > 0)
            .map((l) => ({
              productErpId: l.productErpId,
              qty: num(l.qty),
              rate: round2(num(l.rate) * discount * 1.05),
              mrp: l.mrp,
              batchNumber: l.batchNumber,
              expiryDate: l.expiryDate,
            })),
          paymentMode: "credit",
          paidAmount: 0,
          remarks,
        }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not save the bill.");
      show(true, body.message || "Saved.");
      if (!addAnother) setBillOpen(false);
      loadSales();
      if (body.id) openPrint(body.id);
      return true;
    } catch (err) {
      alert(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ---- bills ----
  const loadSales = useCallback(async () => {
    setLoadingSales(true);
    try {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      if (listFrom) params.set("from", listFrom);
      if (listTo) params.set("to", listTo);
      const res = await apiFetch(`/staff/dms-sales?${params}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load bills.");
      setSales(Array.isArray(body.sales) ? body.sales : []);
    } catch (err) {
      setSales([]);
      show(false, err.message);
    } finally {
      setLoadingSales(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, listFrom, listTo]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const openPrint = async (id) => {
    try {
      const res = await apiFetch(`/staff/dms-sales/${id}`);
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load the bill.");
      printInvoice(body);
    } catch (err) {
      show(false, err.message);
    }
  };


  const shownSales = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return sales;
    return sales.filter((s) => {
      const hay = [s.invoice_number, s.buyer_name, s.buyer_code, s.company_name].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [sales, search]);
  const dueTotal = shownSales.filter((s) => s.status === "active").reduce((t, s) => t + num(s.balance_amount), 0);

  const exportSales = () =>
    downloadExcel({
      fileName: "DMS_Sales",
      title: `Sales${company ? ` · ${company.name}` : ""}`,
      sheets: [
        {
          name: "Sales",
          rows: shownSales,
          totalLabel: "Total",
          columns: [
            { header: "Sr No.", value: (_, i) => i + 1, width: 8, type: "number" },
            { header: "Date", key: "sale_date", width: 12, type: "date" },
            { header: "Invoice", key: "invoice_number", width: 14 },
            { header: "Company", key: "company_name", width: 18 },
            { header: "Buyer type", value: (s) => (s.buyer_type === "outlet" ? "Outlet" : "Distributor / CNF"), width: 16 },
            { header: "Buyer", key: "buyer_name", width: 28 },
            { header: "Code", key: "buyer_code", width: 12 },
            { header: "Qty", key: "total_qty", width: 9, type: "number", total: true },
            { header: "Taxable", key: "taxable_amount", width: 13, type: "money", total: true },
            { header: "GST", key: "gst_amount", width: 11, type: "money", total: true },
            { header: "Total", key: "total_amount", width: 13, type: "money", total: true },
            { header: "Paid", key: "paid_amount", width: 12, type: "money", total: true },
            { header: "Balance", key: "balance_amount", width: 12, type: "money", total: true },
          ],
        },
      ],
    });

  // Outlet bill: staff, then their location, then the outlet.
  const staffShown = useMemo(() => {
    const seen = new Map();
    outlets.forEach((o) => {
      if (o.staff_id && !seen.has(String(o.staff_id))) seen.set(String(o.staff_id), o.staff_name || `Staff ${o.staff_id}`);
    });
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [outlets]);
  const locationsShown = useMemo(
    () =>
      [...new Set(outlets.filter((o) => String(o.staff_id) === staffId).map((o) => String(o.location_name || "").trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [outlets, staffId]
  );
  const outletsShown = useMemo(
    () => outlets.filter((o) => String(o.staff_id) === staffId && String(o.location_name || "").trim() === locationName),
    [outlets, staffId, locationName]
  );

  const ready = Boolean(company && buyer);

  return (
    <div data-theme="dms" className="bg-transparent pb-20">
      <PageHeader eyebrow="Sales" title="Create Sales">
        A CNF company bills its distributors; a distributor company bills outlets (staff → location → outlet). Rates are wholesale prices incl. GST (editable); free goods are added at ₹0.
      </PageHeader>

      <CompanyPicker
        companies={companies}
        type={companyType}
        onTypeChange={(t) => {
          setCompanyType(t);
          setCompanyId("");
        }}
        companyId={companyId}
        onCompanyChange={setCompanyId}
        className="lg:flex-nowrap lg:gap-x-3"
        companyClassName="min-w-44 flex-1"
      >
        {buyerType === "distributor" ? (
          <Field label="Distributor" className="min-w-44 flex-1">
            <select className="select select-sm w-full" value={buyerId} disabled={!company} onChange={(e) => setBuyerId(e.target.value)}>
              <option value="">{!company ? "Choose the company first" : distributors.length ? "Select" : "None added on Add Distributor"}</option>
              {distributors.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.distributor_name} ({d.login_id})
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Staff" className="min-w-36 flex-1">
              <select
                className="select select-sm w-full"
                value={staffId}
                disabled={!company}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  setLocationName("");
                  setBuyerId("");
                }}
              >
                <option value="">{!company ? "Choose the company first" : staffShown.length ? "Select staff" : "No staff"}</option>
                {staffShown.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location" className="min-w-36 flex-1">
              <select
                className="select select-sm w-full"
                value={locationName}
                disabled={!staffId}
                onChange={(e) => {
                  setLocationName(e.target.value);
                  setBuyerId("");
                }}
              >
                <option value="">{!staffId ? "Choose the staff first" : locationsShown.length ? "Select location" : "No locations"}</option>
                {locationsShown.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Outlet" className="min-w-44 flex-1">
              <select className="select select-sm w-full" value={buyerId} disabled={!locationName} onChange={(e) => setBuyerId(e.target.value)}>
                <option value="">{!locationName ? "Choose the location first" : outletsShown.length ? "Select outlet" : "No outlets"}</option>
                {outletsShown.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.outlet_name}
                    {o.outlet_erp_id ? ` (${o.outlet_erp_id})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </CompanyPicker>

      {/* Bill: "Create Bill" opens the Add Sales > "Yes, Create Bill" form */}
      <section className="mb-5 flex flex-wrap items-end gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3">
        <div className="mr-auto">
          <h2 className="font-semibold">New bill{buyer ? ` · ${buyer.distributor_name || buyer.outlet_name}` : ""}</h2>
          {buyer ? (
            <p className="text-xs text-base-content/55">
              {buyer.login_id || buyer.outlet_erp_id || ""}
              {buyer.gstin ? ` · GSTIN ${buyer.gstin}` : ""}
              {buyer.contact_no || buyer.contact_number ? ` · ${buyer.contact_no || buyer.contact_number}` : ""}
            </p>
          ) : (
            <p className="text-xs text-base-content/55">Choose the company and the {buyerType === "outlet" ? "outlet" : "distributor"} first.</p>
          )}
        </div>
        <Field label="Date" required className="w-40">
          <input type="date" className="input input-sm w-full" max={todayLocal()} disabled={!ready} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
        </Field>
        <button type="button" className="btn btn-primary btn-sm" disabled={!ready} onClick={openBill}>
          <MdAdd size={18} /> Create Bill
        </button>
      </section>

      <SalesInvoiceDialog
        open={billOpen && ready}
        onClose={() => setBillOpen(false)}
        outlet={billBuyer}
        selectedDate={saleDate}
        companyName={company?.name || ""}
        invoiceNumber={billNumber}
        fetchNextBillNumber={fetchNextBillNumber}
        submitting={saving}
        onSubmit={submitBill}
      />

      {/* Bills */}
      <section className="rounded-box border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-300 px-4 py-3">
          <div className="mr-auto">
            <h2 className="font-semibold">Bills{company ? ` · ${company.name}` : ""}</h2>
            <p className="text-xs text-base-content/55">
              {shownSales.length} bill{shownSales.length === 1 ? "" : "s"} · due <b className="text-error">{rupees(dueTotal)}</b>
            </p>
          </div>
          <label className="flex items-center gap-1 text-xs text-base-content/60">
            From
            <input type="date" className="input input-sm w-36" value={listFrom} max={listTo || undefined} onChange={(e) => setListFrom(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-xs text-base-content/60">
            To
            <input type="date" className="input input-sm w-36" value={listTo} min={listFrom || undefined} onChange={(e) => setListTo(e.target.value)} />
          </label>
          <label className="input input-sm w-56">
            <MdSearch size={16} className="opacity-50" />
            <input placeholder="Invoice, buyer, code" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button type="button" className="btn btn-ghost btn-sm btn-square" title="Refresh" disabled={loadingSales} onClick={loadSales}>
            <MdRefresh size={18} />
          </button>
          <ExcelButton disabled={!shownSales.length} onExport={exportSales} onError={(err) => show(false, err.message)} />
        </div>
        {loadingSales ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">
            <span className="loading loading-spinner loading-sm" />
          </p>
        ) : shownSales.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-base-content/55">No bills yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm whitespace-nowrap">
              <thead>
                <tr className="bg-base-200/60 text-base-content/70">
                  <th className="w-10 text-right">Sr</th>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Buyer</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                  <th className="w-48">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shownSales.map((s, i) => {
                  const cancelled = s.status === "cancelled";
                  const due = num(s.balance_amount) > 0;
                  return (
                    <tr key={s.id} className={cancelled ? "opacity-55" : "hover:bg-base-200/50"}>
                      <td className="text-right tabular-nums text-base-content/50">{i + 1}</td>
                      <td>{showDate(s.sale_date)}</td>
                      <td className="font-mono text-xs font-semibold">{s.invoice_number}</td>
                      <td className="max-w-64">
                        <div className="truncate font-medium">{s.buyer_name}</div>
                        <div className="truncate text-xs text-base-content/55">
                          {s.buyer_type === "outlet" ? "Outlet" : "Distributor / CNF"}
                          {s.buyer_code ? ` · ${s.buyer_code}` : ""}
                          {!companyId && s.company_name ? ` · ${s.company_name}` : ""}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">{showQty(s.total_qty)}</td>
                      <td className="text-right font-semibold tabular-nums">{rupees(s.total_amount)}</td>
                      <td className="text-right tabular-nums">{rupees(s.paid_amount)}</td>
                      <td className={`text-right tabular-nums ${due && !cancelled ? "font-semibold text-error" : ""}`}>{rupees(s.balance_amount)}</td>
                      <td className="text-right">
                        <button type="button" className="btn btn-ghost btn-xs" title="Print / PDF" onClick={() => openPrint(s.id)}>
                          <MdPrint size={15} /> Print
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {flashNode}
    </div>
  );
}
