import { useRef, useState } from "react";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import { Box, LinearProgress, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { useAuth } from "context/AuthContext";

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
      <MDBox pt={6} pb={3}>
        <MDBox mb={3}>
          <MDTypography variant="h4" fontWeight="medium">
            Invoice Lookup
          </MDTypography>
          <MDTypography variant="button" color="text">
            Find an invoice or an outlet to see the full journey from sale to delivery and every payment.
          </MDTypography>
          {isMarketingStaff && (
            <MDTypography variant="caption" color="info" fontWeight="medium" display="block" mt={0.5}>
              You are seeing only the invoices you created, with their delivery status and payments.
            </MDTypography>
          )}
        </MDBox>

        <Card sx={{ p: 3 }}>
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={handleModeChange} sx={{ mb: 2 }}>
            <ToggleButton value="invoice" sx={{ px: 2 }}>
              <Icon sx={{ mr: 0.75 }}>receipt_long</Icon> Invoice
            </ToggleButton>
            <ToggleButton value="outlet" sx={{ px: 2 }}>
              <Icon sx={{ mr: 0.75 }}>storefront</Icon> Outlet
            </ToggleButton>
          </ToggleButtonGroup>

          <Box component="form" onSubmit={handleSubmit} display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <MDBox flex={1} minWidth="240px">
              <MDInput
                fullWidth
                autoFocus
                label={config.label}
                placeholder={config.placeholder}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </MDBox>
            <MDButton variant="gradient" color="info" type="submit" disabled={loading}>
              <Icon sx={{ mr: 0.5 }}>search</Icon>
              {loading ? "Searching..." : "Search"}
            </MDButton>
          </Box>
          <MDTypography variant="caption" color="text" display="block" mt={1}>
            {config.help}
          </MDTypography>
          {loading && <LinearProgress sx={{ mt: 2 }} />}
        </Card>

        {error && (
          <MDBox mt={2}>
            <Typography color="error" variant="button">
              {error}
            </Typography>
          </MDBox>
        )}

        {notFound && (
          <Card sx={{ p: 3, mt: 3 }}>
            <MDBox display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
              <MDTypography variant="button" color="text">
                {mode === "invoice"
                  ? `No invoice found for "${searchedTerm}".`
                  : `No outlet found for "${searchedTerm}". Try part of the name, the ERP ID or the phone number.`}
              </MDTypography>
              {mode === "invoice" && (
                <MDButton size="small" variant="outlined" color="info" onClick={searchAsOutlet}>
                  <Icon sx={{ mr: 0.5 }}>storefront</Icon> Search &quot;{searchedTerm}&quot; as outlet
                </MDButton>
              )}
            </MDBox>
          </Card>
        )}

        {mode === "invoice" && invoiceResults.length > 1 && (
          <Card sx={{ p: 2, mt: 3 }}>
            <MDTypography variant="button" color="text" mb={1} display="block">
              {invoiceResults.length} invoices match — select one:
            </MDTypography>
            <MDBox display="flex" flexWrap="wrap" gap={1}>
              {invoiceResults.map((result, index) => (
                <MDButton
                  key={result.sale.id}
                  variant={selectedIndex === index ? "gradient" : "outlined"}
                  color="info"
                  size="small"
                  onClick={() => setSelectedIndex(index)}
                >
                  {result.sale.invoice_number} — {result.sale.outlet_name} ({result.sale.outlet_erp_id}) ·{" "}
                  {result.sale.formatted_date || formatDate(result.sale.sale_date)}
                </MDButton>
              ))}
            </MDBox>
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
              <MDBox mt={3}>
                <MDButton size="small" variant="text" color="info" onClick={() => setSelectedOutlet(null)}>
                  <Icon sx={{ mr: 0.5 }}>arrow_back</Icon> Back to {outlets.length} matching outlets
                </MDButton>
              </MDBox>
            )}
            <OutletHistory outletKey={selectedOutlet.outlet_key} />
          </>
        )}
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default InvoiceLookup;
