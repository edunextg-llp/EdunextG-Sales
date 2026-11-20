// Invoice Lookup: Tailwind CSS (no MUI). Search, mode switch and result logic unchanged.
import { useRef, useState } from "react";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useAuth } from "context/AuthContext";
import { Card, Icon, Notice, PageHeader, Spinner, btn, fieldClass } from "components/tw";

import InvoiceDetails from "./components/InvoiceDetails";
import OutletHistory from "./components/OutletHistory";
import OutletPicker from "./components/OutletPicker";
import { API, fetchJson, formatDate, outletKeyOf } from "./format";

const MODES = {
  invoice: {
    label: "Invoice Number",
    placeholder: "Enter invoice number, sale ID or sticker number...",
    help: "Shows the invoice journey and payments, followed by every other invoice of the same outlet.",
  },
  outlet: {
    label: "Outlet Name / ERP ID / Phone",
    placeholder: "e.g. Matri Bhander, EVWB000001827 or 98749...",
    help: "Shows every outlet that matches. Outlets with the same name are listed separately by ERP ID.",
  },
};

function InvoiceLookup() {
  const { user } = useAuth();
  const isMarketingStaff = user?.role === "staff";
  const [mode, setMode] = useState("invoice");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchedTerm, setSearchedTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [invoiceResults, setInvoiceResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState(null);

  // Only the latest search may update the page, even if an older one answers later.
  const requestIdRef = useRef(0);

  const resetResults = () => {
    setError("");
    setNotFound(false);
    setInvoiceResults([]);
    setSelectedIndex(0);
    setOutlets([]);
    setSelectedOutlet(null);
  };

  const runSearch = async (searchMode, rawTerm) => {
    const term = rawTerm.trim();
    resetResults();
    if (!term) {
      setError(searchMode === "invoice" ? "Please enter an invoice number." : "Please enter an outlet name, ERP ID or phone.");
      return;
    }
    if (searchMode === "outlet" && term.length < 2) {
      setError("Enter at least 2 characters to search outlets.");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSearchedTerm(term);
    setLoading(true);

    try {
      if (searchMode === "invoice") {
        const data = await fetchJson(`${API}/staff/sales/lookup?invoiceNumber=${encodeURIComponent(term)}`);
        if (requestId !== requestIdRef.current) return;
        if (!data.results?.length) {
          setNotFound(true);
          return;
        }
        setInvoiceResults(data.results);
      } else {
        const data = await fetchJson(`${API}/staff/sales/lookup/outlets?search=${encodeURIComponent(term)}`);
        if (requestId !== requestIdRef.current) return;
        const found = data.outlets || [];
        if (!found.length) {
          setNotFound(true);
          return;
        }
        setOutlets(found);
        if (found.length === 1) setSelectedOutlet(found[0]);
      }
    } catch (searchError) {
      if (requestId !== requestIdRef.current) return;
      if (searchError.status === 404) {
        setNotFound(true);
      } else {
        console.error("Invoice lookup failed:", searchError);
        setError(searchError.message || "Search failed. Please try again.");
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    runSearch(mode, searchQuery);
  };

  const handleModeChange = (_, nextMode) => {
    if (!nextMode || nextMode === mode) return;
    setMode(nextMode);
    requestIdRef.current += 1;
    setLoading(false);
    resetResults();
  };

  const searchAsOutlet = () => {
    setMode("outlet");
    runSearch("outlet", searchQuery);
  };

  const selectedInvoice = invoiceResults[selectedIndex] || null;
  const config = MODES[mode];

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <div className="pb-8 font-[Poppins,Roboto,sans-serif] text-slate-700">
        <PageHeader
          title="Invoice Lookup"
          description="Find an invoice or an outlet to see the full journey from sale to delivery and every payment."
        />
        {isMarketingStaff && (
          <Notice tone="info" className="mb-4">You are seeing only the invoices you created, with their delivery status and payments.</Notice>
        )}

        <Card className="mb-5">
          <div className="px-5 py-4">
            <div className="mb-3 inline-flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Search by">
              {[["invoice", "receipt_long", "Invoice"], ["outlet", "storefront", "Outlet"]].map(([value, icon, text]) => (
                <button
                  key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => handleModeChange(null, value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${mode === value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  <Icon name={icon} className="text-[18px]" />{text}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-60 grow flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{config.label}</span>
                <span className="relative block">
                  <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-slate-400" />
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                  <input
                    autoFocus type="search" className={`${fieldClass} h-11 pl-10 text-[14px]`} placeholder={config.placeholder}
                    value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </span>
              </label>
              <button type="submit" className={`${btn.primary} h-11 px-6 text-[14px]`} disabled={loading}>
                {loading ? <Spinner className="size-4 border-white/40 border-t-white" /> : <Icon name="search" className="text-[19px]" />}
                {loading ? "Searching..." : "Search"}
              </button>
            </form>
            <p className="m-0 mt-2 text-[12px] text-slate-500">{config.help}</p>
          </div>
          {loading && <div className="h-1 overflow-hidden bg-blue-100"><div className="h-full w-1/3 animate-pulse bg-blue-600" /></div>}
        </Card>

        {error && <Notice tone="error" className="mb-5" onClose={() => setError("")}>{error}</Notice>}

        {notFound && (
          <Card className="mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="flex items-center gap-2 text-[13.5px] text-slate-600">
                <Icon name="search_off" className="text-[22px] text-slate-400" />
                {mode === "invoice"
                  ? `No invoice found for "${searchedTerm}".`
                  : `No outlet found for "${searchedTerm}". Try part of the name, the ERP ID or the phone number.`}
              </span>
              {mode === "invoice" && (
                <button type="button" className={btn.outline} onClick={searchAsOutlet}>
                  <Icon name="storefront" className="text-[18px]" />Search &quot;{searchedTerm}&quot; as outlet
                </button>
              )}
            </div>
          </Card>
        )}

        {mode === "invoice" && invoiceResults.length > 1 && (
          <Card className="mb-5">
            <div className="px-5 py-4">
              <p className="m-0 mb-2 text-[13px] font-semibold text-slate-700">{invoiceResults.length} invoices match — select one:</p>
              <div className="flex flex-wrap gap-2">
                {invoiceResults.map((result, index) => (
                  <button
                    key={result.sale.id} type="button" onClick={() => setSelectedIndex(index)}
                    className={`rounded-lg border px-3 py-1.5 text-left text-[12.5px] transition ${selectedIndex === index ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}
                  >
                    <b>{result.sale.invoice_number}</b> — {result.sale.outlet_name} ({result.sale.outlet_erp_id}) ·{" "}
                    {result.sale.formatted_date || formatDate(result.sale.sale_date)}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        {mode === "invoice" && selectedInvoice && (
          <>
            <InvoiceDetails details={selectedInvoice} />
            {selectedInvoice.sale.outlet_erp_id && (
              <OutletHistory
                outletKey={outletKeyOf(selectedInvoice.sale.outlet_erp_id)}
                currentSaleId={selectedInvoice.sale.id}
              />
            )}
          </>
        )}

        {mode === "outlet" && outlets.length > 0 && !selectedOutlet && (
          <OutletPicker outlets={outlets} searchTerm={searchedTerm} onSelect={setSelectedOutlet} />
        )}

        {mode === "outlet" && selectedOutlet && (
          <>
            {outlets.length > 1 && (
              <button type="button" className={`${btn.ghost} mb-3`} onClick={() => setSelectedOutlet(null)}>
                <Icon name="arrow_back" className="text-[18px]" />Back to {outlets.length} matching outlets
              </button>
            )}
            <OutletHistory outletKey={selectedOutlet.outlet_key} />
          </>
        )}
      </div>
      <Footer />
    </DashboardLayout>
  );
}

export default InvoiceLookup;
