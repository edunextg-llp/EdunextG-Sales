import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  Icon,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDBadge from "components/MDBadge";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { formatDateTime, money } from "layouts/overdue-requests/components/ReviewDialog";

const API = process.env.REACT_APP_API_URL;

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "reason_pending", label: "Packer reason pending" },
  { value: "pending", label: "Waiting for review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];
const REVIEW_BADGE = {
  pending: { label: "Waiting for review", color: "warning" },
  approved: { label: "Approved", color: "success" },
  rejected: { label: "Rejected", color: "error" },
};
const qtyText = (value) => (value == null ? "" : String(Number(value)));

const headSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  borderBottom: "1px solid #e5e7eb",
  px: 2,
  py: 1.5,
  whiteSpace: "nowrap",
};
const cellSx = { px: 2, py: 1.5, verticalAlign: "top", fontSize: "0.8rem" };

// Extra / less material reported by delivery boys after delivery.
//  - Packaging staff: reports on invoices they packed; they must give the reason.
//  - Reviewers (material_report_review: DEEP and SUNANDA BISWAS): approve / reject extra and less.
//    Rejecting less adds the amount back to the bill; rejecting extra takes the star back.
//  - Admin: every report and each delivery boy's stars.
function MaterialReports() {
  // Tabs: less / extra product reports, and cancelled deliveries (reviewers and admin only).
  const [tab, setTab] = useState("less");
  const type = tab === "cancelled" ? "" : tab;
  const [cancelled, setCancelled] = useState([]);
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [reports, setReports] = useState([]);
  const [stars, setStars] = useState([]);
  const [access, setAccess] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null); // { report, kind: 'reason' | 'approve' | 'reject' }
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams();
        if (fromDate) params.set("fromDate", fromDate);
        if (toDate) params.set("toDate", toDate);
        if (search.trim()) params.set("search", search.trim());
        if (tab === "cancelled") {
          const response = await fetch(
            `${API}/material-reports/cancelled-deliveries?${params.toString()}`
          );
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Unable to load cancelled deliveries.");
          setCancelled(data.deliveries || []);
        } else {
          if (type) params.set("type", type);
          if (status) params.set("status", status);
          const response = await fetch(`${API}/material-reports?${params.toString()}`);
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Unable to load material reports.");
          setReports(data.reports || []);
          setStars(data.stars || []);
          setAccess(data.access || {});
        }
        setError("");
      } catch (err) {
        setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tab, type, status, fromDate, toDate, search]
  );

  useEffect(() => {
    const timer = setTimeout(() => load(), 300);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => load(true), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const myPackerId = access.packerId ? Number(access.packerId) : null;
  const totals = useMemo(
    () => ({
      extra: reports.filter((r) => r.report_type === "extra").length,
      less: reports.filter((r) => r.report_type === "less").length,
      lessAmount: reports
        .filter((r) => r.report_type === "less" && r.review_status !== "rejected")
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
      waitingReview: reports.filter((r) => r.review_status === "pending").length,
      waitingReason: reports.filter((r) => !String(r.packer_reason || "").trim()).length,
    }),
    [reports]
  );

  const openDialog = (report, kind) => {
    setDialog({ report, kind });
    setText(kind === "reason" ? report.packer_reason || "" : "");
  };

  const submitDialog = async () => {
    if (!dialog) return;
    const { report, kind } = dialog;
    const value = text.trim();
    if ((kind === "reason" || kind === "reject") && value.length < 3) {
      alert(kind === "reason" ? "Enter the reason." : "Enter why it is rejected.");
      return;
    }
    setSaving(true);
    try {
      const url =
        kind === "reason"
          ? `${API}/material-reports/${report.id}/reason`
          : `${API}/material-reports/${report.id}/review`;
      const body = kind === "reason" ? { reason: value } : { action: kind, remarks: value };
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to save.");
      setNotice({
        color: "success",
        text: `${report.invoice_number || report.bp_sale_id}: ${data.message}`,
      });
      setDialog(null);
      load(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const subtitle = access.isAdmin
    ? "Every extra / less material report from delivery boys, with packer reasons and reviews."
    : access.canReview
    ? "Review extra and less product reports. Rejecting less adds the amount back to the bill; rejecting extra takes the star back."
    : "Reports on invoices you packed. Give the reason for each one.";

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={2}>
            <MDTypography variant="h6">Material Reports</MDTypography>
            <MDTypography variant="caption" color="text">
              {subtitle}
              {totals.waitingReview && access.canReview
                ? ` ${totals.waitingReview} waiting for review.`
                : ""}
              {totals.waitingReason ? ` ${totals.waitingReason} without packer reason.` : ""}
            </MDTypography>
          </MDBox>

          <MDBox px={2} pb={2}>
            <Tabs value={tab} onChange={(event, value) => setTab(value)} sx={{ maxWidth: 560 }}>
              <Tab value="less" label="Less product" />
              <Tab value="extra" label="Extra product" />
              {(access.canReview || access.isAdmin) && (
                <Tab value="cancelled" label="Cancelled deliveries" />
              )}
            </Tabs>
          </MDBox>

          <MDBox px={2} pb={2}>
            <Grid container spacing={2} alignItems="center">
              {tab !== "cancelled" && (
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      label="Status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      sx={{ height: 40 }}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <MenuItem key={o.value || "all"} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
              <Grid item xs={6} md={2}>
                <MDInput
                  type="date"
                  label="From"
                  fullWidth
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6} md={2}>
                <MDInput
                  type="date"
                  label="To"
                  fullWidth
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={10} md={2}>
                <MDInput
                  label={
                    tab === "cancelled"
                      ? "Search invoice / outlet / reason"
                      : "Search invoice / outlet / name"
                  }
                  fullWidth
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Grid>
              <Grid item xs={2} md={1}>
                <Tooltip title="Refresh">
                  <span>
                    <IconButton color="info" onClick={() => load()} disabled={loading}>
                      <Icon>refresh</Icon>
                    </IconButton>
                  </span>
                </Tooltip>
              </Grid>
            </Grid>
            <MDTypography variant="caption" color="text" display="block" mt={1}>
              {tab === "cancelled"
                ? `Showing ${cancelled.length} cancelled deliver${
                    cancelled.length === 1 ? "y" : "ies"
                  } · ${money(cancelled.reduce((sum, row) => sum + (Number(row.price) || 0), 0))}`
                : tab === "less"
                ? `Showing ${reports.length} less report(s) · ${money(
                    totals.lessAmount
                  )} taken off bills`
                : `Showing ${reports.length} extra report(s)`}
            </MDTypography>
          </MDBox>

          {notice && (
            <MDBox px={2} pb={2}>
              <MDTypography variant="button" color={notice.color}>
                {notice.text}
              </MDTypography>
            </MDBox>
          )}
          {error && (
            <MDBox px={2} pb={2}>
              <MDTypography variant="button" color="error">
                {error}
              </MDTypography>
            </MDBox>
          )}

          {tab === "cancelled" ? (
            <TableContainer sx={{ boxShadow: "none" }}>
              <Table>
                <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                  <TableRow>
                    {[
                      "Sr. No.",
                      "Cancelled",
                      "Invoice / Outlet",
                      "Amount",
                      "Delivery person",
                      "Cancelled by",
                      "Reason",
                    ].map((h) => (
                      <TableCell key={h} sx={headSx}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!loading && cancelled.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                        No cancelled deliveries here.
                      </TableCell>
                    </TableRow>
                  )}
                  {cancelled.map((row, index) => (
                    <TableRow key={row.sale_id}>
                      <TableCell sx={cellSx}>{index + 1}</TableCell>
                      <TableCell sx={cellSx}>
                        {formatDateTime(row.cancelled_at) || "—"}
                        <MDTypography variant="caption" display="block" color="text">
                          Delivery date {row.delivery_date || "—"}
                        </MDTypography>
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <strong>{row.invoice_number || "—"}</strong> · {row.bp_sale_id}
                        <br />
                        {row.outlet_name || "—"}
                        {row.outlet_erp_id ? ` (${row.outlet_erp_id})` : ""}
                        <br />
                        {[row.company_name, row.location_name].filter(Boolean).join(" · ")}
                      </TableCell>
                      <TableCell sx={cellSx}>
                        {money(row.price)}
                        <MDTypography variant="caption" display="block" color="text">
                          {row.item_count} item(s)
                        </MDTypography>
                      </TableCell>
                      <TableCell sx={cellSx}>{row.delivery_person_name || "—"}</TableCell>
                      <TableCell sx={cellSx}>
                        {row.changed_by_name || "—"}
                        {row.changed_by_role && (
                          <MDTypography variant="caption" display="block" color="text">
                            {row.changed_by_role}
                          </MDTypography>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, maxWidth: 280 }}>
                        {row.cancellation_reason || "Not given"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <TableContainer sx={{ boxShadow: "none" }}>
              <Table>
                <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                  <TableRow>
                    {[
                      "Sr. No.",
                      "Reported",
                      "Invoice / Outlet",
                      "Type",
                      "Delivery boy",
                      "Packed by",
                      "Packer reason",
                      "Review",
                      "Actions",
                    ].map((h) => (
                      <TableCell key={h} sx={headSx}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!loading && reports.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ ...cellSx, textAlign: "center", py: 4 }}>
                        No material reports here.
                      </TableCell>
                    </TableRow>
                  )}
                  {reports.map((report, index) => {
                    const isLess = report.report_type === "less";
                    const isMine = myPackerId && Number(report.packed_by_id) === myPackerId;
                    const badge = REVIEW_BADGE[report.review_status];
                    return (
                      <TableRow key={report.id}>
                        <TableCell sx={cellSx}>{index + 1}</TableCell>
                        <TableCell sx={cellSx}>
                          #{report.id}
                          <br />
                          {formatDateTime(report.created_at)}
                        </TableCell>
                        <TableCell sx={cellSx}>
                          <strong>{report.invoice_number || "—"}</strong> · {report.bp_sale_id}
                          <br />
                          {report.outlet_name || "—"}
                          {report.company_name ? ` · ${report.company_name}` : ""}
                          <br />
                          Bill {money(report.price)}
                        </TableCell>
                        <TableCell sx={cellSx}>
                          <MDBadge
                            badgeContent={isLess ? `Less ${money(report.amount)}` : "Extra product"}
                            color={isLess ? "warning" : "success"}
                            variant="gradient"
                            size="sm"
                            container
                          />
                          {!isLess && report.product_name && (
                            <MDTypography
                              variant="caption"
                              display="block"
                              fontWeight="medium"
                              mt={0.5}
                            >
                              {report.product_name} · Qty {qtyText(report.product_qty)}
                            </MDTypography>
                          )}
                          {report.photo_url && (
                            <MDBox mt={0.5}>
                              <Link
                                href={report.photo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="caption"
                              >
                                View photo
                              </Link>
                            </MDBox>
                          )}
                          {report.remarks && (
                            <MDTypography variant="caption" display="block" color="text">
                              {report.remarks}
                            </MDTypography>
                          )}
                        </TableCell>
                        <TableCell sx={cellSx}>
                          <strong>{report.delivery_boy_name || "—"}</strong>
                          {report.star_awarded && (
                            <MDTypography variant="caption" display="block" color="text">
                              ⭐ 1 star
                            </MDTypography>
                          )}
                          {!isLess && report.review_status === "rejected" && (
                            <MDTypography variant="caption" display="block" color="error">
                              Star taken back
                            </MDTypography>
                          )}
                        </TableCell>
                        <TableCell sx={cellSx}>{report.packed_by_name || "Not recorded"}</TableCell>
                        <TableCell sx={{ ...cellSx, maxWidth: 260 }}>
                          {String(report.packer_reason || "").trim() ? (
                            <>
                              {report.packer_reason}
                              <MDTypography variant="caption" display="block" color="text">
                                {formatDateTime(report.packer_reason_at)}
                              </MDTypography>
                            </>
                          ) : (
                            <MDTypography variant="caption" color="error">
                              Reason pending
                            </MDTypography>
                          )}
                        </TableCell>
                        <TableCell sx={cellSx}>
                          {badge ? (
                            <>
                              <MDBadge
                                badgeContent={badge.label}
                                color={badge.color}
                                variant="gradient"
                                size="sm"
                                container
                              />
                              {report.reviewed_by_name && (
                                <MDTypography
                                  variant="caption"
                                  display="block"
                                  color="text"
                                  mt={0.5}
                                >
                                  {report.reviewed_by_name} · {formatDateTime(report.reviewed_at)}
                                </MDTypography>
                              )}
                              {report.review_remarks && (
                                <MDTypography variant="caption" display="block" color="text">
                                  {report.review_remarks}
                                </MDTypography>
                              )}
                            </>
                          ) : (
                            <MDTypography variant="caption" color="text">
                              Not needed
                            </MDTypography>
                          )}
                        </TableCell>
                        <TableCell sx={{ ...cellSx, whiteSpace: "nowrap" }}>
                          {isMine && (
                            <Tooltip title={report.packer_reason ? "Edit reason" : "Give reason"}>
                              <IconButton
                                size="small"
                                color="info"
                                onClick={() => openDialog(report, "reason")}
                              >
                                <Icon>edit_note</Icon>
                              </IconButton>
                            </Tooltip>
                          )}
                          {access.canReview && report.review_status === "pending" && (
                            <>
                              <Tooltip
                                title={
                                  isLess
                                    ? "Approve (amount stays off the bill)"
                                    : "Approve (keeps the star)"
                                }
                              >
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={() => openDialog(report, "approve")}
                                >
                                  <Icon>check_circle</Icon>
                                </IconButton>
                              </Tooltip>
                              <Tooltip
                                title={
                                  isLess
                                    ? "Reject (adds the amount back to the bill)"
                                    : "Reject (takes the star back)"
                                }
                              >
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => openDialog(report, "reject")}
                                >
                                  <Icon>cancel</Icon>
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>

        {tab !== "cancelled" && access.isAdmin && stars.length > 0 && (
          <Card sx={{ mt: 3 }}>
            <MDBox p={2}>
              <MDTypography variant="h6">Delivery boy stars</MDTypography>
              <MDTypography variant="caption" color="text">
                1 star for every extra product reported (all time, rejected ones removed).
              </MDTypography>
            </MDBox>
            <TableContainer sx={{ boxShadow: "none" }}>
              <Table>
                <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                  <TableRow>
                    {["Delivery boy", "Stars", "Extra reports", "Less reports", "Less amount"].map(
                      (h) => (
                        <TableCell key={h} sx={headSx}>
                          {h}
                        </TableCell>
                      )
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stars.map((row) => (
                    <TableRow key={row.delivery_boy_id}>
                      <TableCell sx={cellSx}>
                        <strong>{row.delivery_boy_name}</strong>
                      </TableCell>
                      <TableCell sx={cellSx}>⭐ {row.stars}</TableCell>
                      <TableCell sx={cellSx}>{row.extra_count}</TableCell>
                      <TableCell sx={cellSx}>{row.less_count}</TableCell>
                      <TableCell sx={cellSx}>{money(row.less_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </MDBox>

      <Dialog
        open={Boolean(dialog)}
        onClose={() => !saving && setDialog(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {dialog?.kind === "reason" && "Reason for the material difference"}
          {dialog?.kind === "approve" &&
            `Approve ${dialog.report.report_type === "less" ? "less" : "extra"} product`}
          {dialog?.kind === "reject" &&
            `Reject ${dialog.report.report_type === "less" ? "less" : "extra"} product`}
        </DialogTitle>
        <DialogContent>
          {dialog && (
            <MDTypography variant="caption" color="text" display="block" mb={2}>
              {dialog.report.invoice_number} · {dialog.report.outlet_name} ·{" "}
              {dialog.report.report_type === "less"
                ? `Less ${money(dialog.report.amount)}`
                : `Extra: ${dialog.report.product_name || "product"} · Qty ${qtyText(
                    dialog.report.product_qty
                  )}`}{" "}
              · reported by {dialog.report.delivery_boy_name}
              {dialog.kind === "reject" &&
                (dialog.report.report_type === "less"
                  ? ". Rejecting adds the amount back to the bill."
                  : ". Rejecting takes the delivery boy's star back.")}
            </MDTypography>
          )}
          <MDInput
            label={
              dialog?.kind === "reason"
                ? "Why was there extra / less material?"
                : dialog?.kind === "reject"
                ? "Why is it rejected?"
                : "Note (optional)"
            }
            fullWidth
            multiline
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <MDButton
            variant="outlined"
            color="secondary"
            disabled={saving}
            onClick={() => setDialog(null)}
          >
            Cancel
          </MDButton>
          <MDButton
            variant="gradient"
            color={
              dialog?.kind === "reject" ? "error" : dialog?.kind === "approve" ? "success" : "info"
            }
            disabled={saving}
            onClick={submitDialog}
          >
            {saving
              ? "Saving..."
              : dialog?.kind === "reason"
              ? "Save reason"
              : dialog?.kind === "approve"
              ? "Approve"
              : "Reject"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default MaterialReports;
