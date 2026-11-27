import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MdAdd, MdEdit, MdPrint, MdRefresh, MdSearch } from "react-icons/md";
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
const newDraftSession = (saved) => ({
  id: saved?.id,
  revision: saved?.revision,
  clientKey: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join(""),
  task: Promise.resolve(),
});



export default function CreateSales({ user }) {
  const isAdmin = user?.role === "admin";
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
  const [distributorsFor, setDistributorsFor] = useState("");
  const [outlets, setOutlets] = useState([]);
  // Which company the outlets list was loaded for (the requisition link waits for it).
  const [outletsFor, setOutletsFor] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [locationName, setLocationName] = useState("");

  // Bill
  const [saleDate, setSaleDate] = useState(todayLocal());
  const [billOpen, setBillOpen] = useState(false);
  const [billNumber, setBillNumber] = useState("");
  // Requisition the bill opens with (Outlet Orders > Create Sales); the form loads its items.
  const [billRequisition, setBillRequisition] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeDraft, setActiveDraft] = useState(null);
  const draftSession = useRef(null);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [openingDraft, setOpeningDraft] = useState(null);
  const [draftList, setDraftList] = useState({ loading: true, drafts: [], error: "" });

  // Bills list
  const [sales, setSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [listFrom, setListFrom] = useState("");
  const [listTo, setListTo] = useState("");
  const [search, setSearch] = useState("");
  const [openingSale, setOpeningSale] = useState(null);
  const [editingSale, setEditingSale] = useState(null);
  const [editingSaleDate, setEditingSaleDate] = useState("");

  // Company: its distributors and outlets.
  useEffect(() => {
    setBillOpen(false);
    setBuyerId("");
    setStaffId("");
    setLocationName("");
    setDistributors([]);
    setDistributorsFor("");
    setOutlets([]);
    setOutletsFor("");
    if (!companyId) return undefined;
    const controller = new AbortController();
    apiFetch(`/staff/distributors?${new URLSearchParams({ companyId })}`, { signal: controller.signal })
      .then(readJson)
      .then((b) => {
        if (!controller.signal.aborted) setDistributors((b.distributors || []).filter((d) => d.is_active));
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setDistributorsFor(companyId); });
    apiFetch(`/staff/dms-sales/outlets?${new URLSearchParams({ companyId })}`, { signal: controller.signal })
      .then(readJson)
      .then((b) => {
        if (!controller.signal.aborted) setOutlets(b.outlets || []);
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setOutletsFor(companyId); });
    return () => controller.abort();
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
    draftSession.current = newDraftSession();
    setActiveDraft(null);
    setBillRequisition("");
    setBillNumber(await fetchNextBillNumber());
    setBillOpen(true);
  };

  const loadDrafts = useCallback(async () => {
    setDraftList((previous) => ({ ...previous, loading: true, error: "" }));
    try {
      const res = await apiFetch("/staff/dms-sales/drafts");
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not load sales drafts.");
      setDraftList({ loading: false, drafts: body.drafts || [], error: "" });
    } catch (error) {
      setDraftList({ loading: false, drafts: [], error: error.message });
    }
  }, []);

  useEffect(() => { void loadDrafts(); }, [loadDrafts]);

  const openSavedDraft = async (id) => {
    setOpeningDraft(id);
    try {
      const res = await apiFetch(`/staff/dms-sales/drafts/${id}`);
      const body = await readJson(res);
      if (!res.ok || !body.draft) throw new Error(body.error || "Could not open the draft.");
      const savedCompany = companies.find((entry) => Number(entry.id) === Number(body.draft.company_id));
      if (!savedCompany) throw new Error("The draft’s company is unavailable.");
      setBillOpen(false);
      setCompanyType(savedCompany.type);
      setCompanyId(String(savedCompany.id));
      setPendingDraft(body.draft);
    } catch (error) {
      setOpeningDraft(null);
      show(false, error.message);
    }
  };

  useEffect(() => {
    if (!pendingDraft || String(pendingDraft.company_id) !== companyId) return;
    const distributor = pendingDraft.payload.buyerType === "distributor";
    if ((distributor ? distributorsFor : outletsFor) !== companyId) return;
    const savedBuyer = (distributor ? distributors : outlets)
      .find((entry) => Number(entry.id) === Number(pendingDraft.payload.buyerId));
    setOpeningDraft(null);
    setPendingDraft(null);
    if (!savedBuyer) {
      show(false, "The draft’s buyer is unavailable.");
      return;
    }
    if (!distributor) {
      setStaffId(String(savedBuyer.staff_id || ""));
      setLocationName(String(savedBuyer.location_name || "").trim());
    }
    setBuyerId(String(savedBuyer.id));
    setSaleDate(pendingDraft.sale_date);
    setBillNumber(pendingDraft.invoice_number || "");
    setBillRequisition("");
    setActiveDraft(pendingDraft);
    draftSession.current = newDraftSession(pendingDraft);
    setBillOpen(true);
  }, [pendingDraft, companyId, distributorsFor, outletsFor, distributors, outlets, show]);

  const saveDraft = useCallback((form) => {
    const session = draftSession.current;
    if (!session) return Promise.reject(new Error("Open a bill before saving a draft."));
    const task = session.task.catch(() => {}).then(async () => {
      const res = await apiFetch(session.id ? `/staff/dms-sales/drafts/${session.id}` : "/staff/dms-sales/drafts", {
        method: session.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          companyId: Number(companyId),
          buyerType,
          distributorId: buyerType === "distributor" ? Number(buyerId) : undefined,
          outletId: buyerType === "outlet" ? Number(buyerId) : undefined,
          saleDate,
          clientKey: session.clientKey,
          revision: session.revision,
        }),
      });
      const body = await readJson(res);
      if (!res.ok) throw new Error(body.error || "Could not save the draft.");
      session.id = body.id || session.id;
      session.revision = body.revision;
    });
    session.task = task;
    return task;
  }, [companyId, buyerType, buyerId, saleDate]);

  // Outlet Orders > Create Sales opens /create-sales?requisition=PRQ...: load that approved
  // requisition, choose its company, staff, location and outlet, then open the bill with it.
  // Each choice waits for the data it needs (companies, then that company's outlets).
  const location = useLocation();
  const navigate = useNavigate();
  const [linkedRequisition, setLinkedRequisition] = useState(null); // { step, requisition }
  useEffect(() => {
    if (location.pathname !== "/create-sales") return;
    const code = new URLSearchParams(location.search).get("requisition");
    if (!code) return;
    navigate("/create-sales", { replace: true });
    (async () => {
      try {
        const res = await apiFetch(`/staff/purchase-requisitions/${encodeURIComponent(code)}`);
        const body = await readJson(res);
        if (!res.ok || !body.requisition) throw new Error(body.error || `Requisition ${code} was not found.`);
        setLinkedRequisition({ step: "company", requisition: body.requisition });
      } catch (err) {
        alert(err.message || "Could not load the requisition.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!linkedRequisition) return;
    const { step, requisition } = linkedRequisition;
    const stop = (message) => {
      setLinkedRequisition(null);
      if (message) alert(message);
    };
    if (step === "company") {
      if (!companies.length) return; // companies still loading
      const reqCompany = companies.find((c) => Number(c.id) === Number(requisition.company_id));
      if (!reqCompany) return stop(`${requisition.company_name || "The requisition's company"} was not found.`);
      if (reqCompany.type === "cnf") return stop(`${reqCompany.name} is a CNF company; it bills distributors, not outlets.`);
      setBillOpen(false);
      setCompanyType(reqCompany.type);
      setCompanyId(String(reqCompany.id));
      setLinkedRequisition({ step: "outlet", requisition });
    } else if (step === "outlet") {
      if (outletsFor !== String(requisition.company_id)) return; // outlets still loading
      const outlet =
        outlets.find((o) => Number(o.id) === Number(requisition.outlet_id) && Number(o.staff_id) === Number(requisition.staff_id))
        || outlets.find((o) => Number(o.id) === Number(requisition.outlet_id));
      if (!outlet) return stop(`${requisition.outlet_name || "The requisition's outlet"} is not in ${requisition.company_name || "this company"}'s outlet list.`);
      setStaffId(String(outlet.staff_id));
      setLocationName(String(outlet.location_name || "").trim());
      setBuyerId(String(outlet.id));
      setLinkedRequisition({ step: "bill", requisition });
    } else if (step === "bill") {
      if (!company || !buyer) return;
      stop();
      (async () => {
        draftSession.current = newDraftSession();
        setActiveDraft(null);
        setBillNumber(await fetchNextBillNumber());
        setBillRequisition(requisition.requisition_number);
        setBillOpen(true);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedRequisition, companies, outletsFor, outlets, company, buyer]);

  // Create Bill form submit. Its rates are before GST (5% added on the form), less the flat
  // discount; the bill is saved with that GST-inclusive rate per piece. Free lines are worked
  // out again by the server. Paid later from the bills list (Record payment).
  const submitBill = async ({ invoiceNumber, requisitionNumber, remarks, lineItems = [], totals, addAnother }) => {
    if (!company || !buyer) {
      alert("Choose the company and the buyer first.");
      return false;
    }
    const discount = 1 - num(totals?.flatDiscountPercent) / 100;
    const session = draftSession.current;
    setSaving(true);
    try {
      await session?.task;
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
          draftId: session?.id,
          draftRevision: session?.revision,
          lines: lineItems
            .filter((l) => !l.isFree && num(l.qty) > 0)
            .map((l) => ({
              productErpId: l.productErpId,
              qty: num(l.qty),
              ...(l.rateBeforeGst
                ? { rateBeforeGst: num(l.rate) * discount }
                : { rate: round2(num(l.rate) * discount * 1.05) }),
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
      draftSession.current = addAnother ? newDraftSession() : null;
      if (activeDraft) {
        setActiveDraft(null);
      }
      if (session?.id) {
        void loadDrafts();
      }
      setBillRequisition("");
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

  const openSaleEdit = async (id) => {
    setOpeningSale(id);
    try {
      const response = await apiFetch(`/staff/dms-sales/${id}`);
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.error || "Could not open the bill.");
      if (body.sale.status !== "active") throw new Error("Cancelled bills cannot be edited.");
      setEditingSaleDate(body.sale.sale_date);
      setEditingSale({
        sale: body.sale,
        lines: (body.items || []).map((item) => ({
          saleItemId: item.id,
          productErpId: item.product_erp_id,
          productName: item.product_name || "",
          variantName: item.variant_name || "",
          qty: String(item.qty),
          rate: String(item.rate_before_gst ?? item.rate),
          rateBeforeGst: item.rate_before_gst != null,
          mrp: item.mrp,
          batchNumber: item.batch_number || "",
          expiryDate: item.expiry_date || "",
          isFree: Number(item.is_free) === 1,
          freeNote: item.free_note,
          gstPercent: Number(item.gst_percent),
        })),
      });
    } catch (error) {
      show(false, error.message);
    } finally {
      setOpeningSale(null);
    }
  };

  const submitSaleEdit = async ({ invoiceNumber, remarks, lineItems }) => {
    const { sale } = editingSale;
    setSaving(true);
    try {
      const response = await apiFetch(`/staff/dms-sales/${sale.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber,
          saleDate: editingSaleDate,
          remarks,
          revision: Number(sale.edit_revision),
          lines: lineItems.filter((item) => !item.isFree).map((item) => ({
            id: item.saleItemId,
            productErpId: item.productErpId,
            qty: item.qty,
            ...(item.rateBeforeGst ? { rateBeforeGst: item.rate } : { rate: item.rate }),
            mrp: item.mrp,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
          })),
        }),
      });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.error || "Could not update the bill.");
      setEditingSale(null);
      show(true, body.message || "Bill updated.");
      void loadSales();
      return true;
    } catch (error) {
      alert(error.message);
      return false;
    } finally {
      setSaving(false);
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
          if (openingDraft !== null) return;
          setCompanyType(t);
          setCompanyId("");
        }}
        companyId={companyId}
        onCompanyChange={(id) => { if (openingDraft === null) setCompanyId(id); }}
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
        <button type="button" className="btn btn-primary btn-sm" disabled={!ready || openingDraft !== null} onClick={openBill}>
          <MdAdd size={18} /> Create Bill
        </button>
      </section>

      <SalesInvoiceDialog
        open={billOpen && ready}
        onClose={() => {
          draftSession.current = null;
          setBillOpen(false);
          setBillRequisition("");
          setActiveDraft(null);
          void loadDrafts();
        }}
        outlet={billBuyer}
        forceWholesale={company?.type === "cnf"}
        initialRequisitionNumber={billRequisition}
        initialDraft={activeDraft?.payload}
        selectedDate={saleDate}
        companyName={company?.name || ""}
        invoiceNumber={billNumber}
        fetchNextBillNumber={fetchNextBillNumber}
        submitting={saving}
        onSubmit={submitBill}
        onSaveDraft={saveDraft}
      />

      <section className="mb-5 rounded-box border border-base-300 bg-base-100">
        <header className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
          <div>
            <h2 className="font-semibold">Saved drafts</h2>
            <p className="text-xs text-base-content/60">Resume an unfinished bill. Stock is deducted when you submit the bill.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadDrafts} disabled={draftList.loading} aria-label="Refresh drafts">
            <MdRefresh size={18} />
          </button>
        </header>
        {draftList.error ? <p role="alert" className="px-4 py-3 text-sm text-error">{draftList.error}</p>
          : draftList.loading ? <p className="px-4 py-3 text-sm text-base-content/60">Loading drafts…</p>
            : draftList.drafts.length === 0 ? <p className="px-4 py-3 text-sm text-base-content/60">No saved drafts.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead><tr><th>Bill number</th><th>Company</th><th>Buyer</th><th>Sale date</th><th className="text-right">Lines</th><th>Last saved</th><th><span className="sr-only">Action</span></th></tr></thead>
                    <tbody>
                      {draftList.drafts.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.invoice_number || `Draft #${entry.id}`}</td>
                          <td>{entry.company_name || "—"}</td>
                          <td>{entry.buyer_name}</td>
                          <td className="whitespace-nowrap">{showDate(entry.sale_date)}</td>
                          <td className="text-right tabular-nums">{showQty(entry.line_count)}</td>
                          <td className="whitespace-nowrap">{showDate(entry.updated_at, true)}</td>
                          <td className="text-right">
                            <button type="button" className="btn btn-outline btn-xs" disabled={openingDraft !== null || saving}
                              onClick={() => openSavedDraft(entry.id)}>
                              {openingDraft === entry.id ? "Opening…" : "Edit draft"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
      </section>

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
                        {isAdmin && !cancelled && (
                          <button type="button" className="btn btn-ghost btn-xs" disabled={openingSale !== null} onClick={() => openSaleEdit(s.id)}>
                            <MdEdit size={15} /> {openingSale === s.id ? "Opening…" : "Edit"}
                          </button>
                        )}
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

      {isAdmin && editingSale && (
        <SalesInvoiceDialog
          open
          editMode
          postedEdit
          postedSaleId={editingSale.sale.id}
          onClose={() => setEditingSale(null)}
          outlet={{
            outlet_name: editingSale.sale.buyer_name,
            outlet_erp_id: editingSale.sale.buyer_code,
            address: editingSale.sale.buyer_address,
            contact_number: editingSale.sale.buyer_contact,
          }}
          companyName={editingSale.sale.company_name}
          forceWholesale={editingSale.sale.company_type === "cnf"}
          selectedDate={editingSaleDate}
          onDateChange={setEditingSaleDate}
          invoiceNumber={editingSale.sale.invoice_number}
          initialLineItems={editingSale.lines}
          initialRemarks={editingSale.sale.remarks || ""}
          paidAmount={editingSale.sale.paid_amount}
          submitting={saving}
          onSubmit={submitSaleEdit}
        />
      )}
      {flashNode}
    </div>
  );
}
