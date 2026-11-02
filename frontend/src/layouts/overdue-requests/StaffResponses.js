import { useCallback, useEffect, useState } from "react";
import { Alert, Card, Chip, FormControl, InputLabel, MenuItem, Select } from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { formatDate, money, overdueBalance } from "layouts/overdue-requests/components/ReviewDialog";

const API = process.env.REACT_APP_API_URL;
const DAYS = [1, 2, 3, 4, 5, 6, 7];
const STATUS = {
  awaiting_staff: { label: "Your response needed", color: "warning" },
  pending: { label: "Waiting for approval", color: "info" },
  approved: { label: "Approved", color: "success" },
  used: { label: "Approved, sale created", color: "success" },
  rejected: { label: "Rejected", color: "error" },
};

// Marketing staff: outlets overdue by 14+ days that need a reason and days to pay.
function StaffResponses() {
  const [requests, setRequests] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API}/staff/overdue-requests/my`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to load overdue requests.");
      setRequests(data.requests || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setDraft = (id, change) => setDrafts((prev) => ({ ...prev, [id]: { reason: "", paymentDays: "", ...prev[id], ...change } }));

  const submit = async (request) => {
    const draft = drafts[request.id] || {};
    setSavingId(request.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API}/staff/overdue-requests/${request.id}/respond`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: draft.reason, paymentDays: Number(draft.paymentDays) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to submit your response.");
      setNotice(`${request.outlet_name}: ${data.message}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <MDBox mb={2}>
          <MDTypography variant="h4" fontWeight="bold">Overdue Requests</MDTypography>
          <MDTypography variant="button" color="text">
            Your outlets overdue by 14 days or more. Give the reason and how many days the payment will take.
          </MDTypography>
        </MDBox>
        {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice("")}>{notice}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading && <MDTypography variant="body2" color="text">Loading...</MDTypography>}
        {!loading && !error && requests.length === 0 && (
          <Card>
            <MDBox p={4} textAlign="center">
              <MDTypography variant="button" color="text">No overdue requests for your outlets.</MDTypography>
            </MDBox>
          </Card>
        )}
        {requests.map((request) => {
          const status = STATUS[request.status] || { label: request.status, color: "default" };
          const draft = drafts[request.id] || { reason: "", paymentDays: "" };
          const waiting = request.status === "awaiting_staff";
          return (
            <Card key={request.id} sx={{ mb: 2 }}>
              <MDBox p={2.5}>
                <MDBox display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                  <MDTypography variant="h6" fontWeight="medium">
                    {request.outlet_name} · ERP {request.outlet_erp_id}
                  </MDTypography>
                  <Chip size="small" color={status.color} label={status.label} />
                </MDBox>
                <MDTypography variant="button" color="error" fontWeight="medium" display="block">
                  Overdue {request.max_overdue_days} day(s) · {money(overdueBalance(request))}
                </MDTypography>
                <MDTypography variant="caption" color="text" display="block">
                  New invoice {(request.sales_summary?.invoiceNumbers || []).join(", ") || "—"} for{" "}
                  {money(request.sales_summary?.totalAmount)} · {formatDate(request.sale_date)}
                </MDTypography>
                {waiting ? (
                  <MDBox display="flex" gap={2} flexWrap="wrap" alignItems="flex-start" mt={2}>
                    <MDBox flex="1 1 320px">
                      <MDInput
                        label="Reason of overdue *"
                        fullWidth
                        multiline
                        rows={2}
                        inputProps={{ maxLength: 1000 }}
                        value={draft.reason}
                        onChange={(event) => setDraft(request.id, { reason: event.target.value })}
                      />
                    </MDBox>
                    <FormControl sx={{ minWidth: 220 }}>
                      <InputLabel id={`days-${request.id}`}>Days to complete payment *</InputLabel>
                      <Select
                        labelId={`days-${request.id}`}
                        label="Days to complete payment *"
                        value={draft.paymentDays}
                        sx={{ height: 44 }}
                        onChange={(event) => setDraft(request.id, { paymentDays: event.target.value })}
                      >
                        {DAYS.map((day) => <MenuItem key={day} value={day}>{day} day{day === 1 ? "" : "s"}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <MDButton
                      color="info"
                      variant="gradient"
                      disabled={savingId === request.id || !draft.reason.trim() || !draft.paymentDays}
                      onClick={() => submit(request)}
                    >
                      {savingId === request.id ? "Submitting..." : "Submit"}
                    </MDButton>
                  </MDBox>
                ) : (
                  <MDTypography variant="caption" color="text" display="block" mt={1}>
                    Your reason: {request.request_note} · Pay within {request.payment_days} day(s)
                    {request.review_note ? ` · Note: ${request.review_note}` : ""}
                  </MDTypography>
                )}
              </MDBox>
            </Card>
          );
        })}
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default StaffResponses;
