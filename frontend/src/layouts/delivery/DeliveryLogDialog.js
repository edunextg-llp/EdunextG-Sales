import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Dialog, DialogTitle, DialogContent, DialogActions, TableContainer, Table, TableBody, TableRow, TableCell } from "@mui/material";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import { buildDeliveryLog, deliveryLogColors, downloadDeliveryLog } from "utils/deliveryLog";

export default function DeliveryLogDialog({ open, onClose, sales }) {
  const report = useMemo(() => buildDeliveryLog(sales), [sales]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setDownloading(true);
    setError("");
    try { await downloadDeliveryLog(report); }
    catch (_error) { setError("Unable to download Excel. Please try again."); }
    finally { setDownloading(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" PaperProps={{ sx: { width: Math.max(560, 160 + (report.width - 1) * 95), maxWidth: "calc(100% - 32px)", m: 2 } }} aria-labelledby="delivery-log-title">
      <DialogTitle id="delivery-log-title" sx={{ py: 0.5, px: 1, backgroundColor: "#dbeafe", borderBottom: "1px solid #93c5fd" }}>
        <MDBox display="flex" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
          <MDTypography variant="h6" color="dark">Delivery Log — Pending Deliveries</MDTypography>
          <MDButton size="small" color="success" variant="gradient" onClick={download} disabled={downloading || !report.companyCount}>
            {downloading ? "Downloading..." : "Download Excel"}
          </MDButton>
        </MDBox>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <MDBox px={1} py={0.5} bgColor="#eff6ff">
          <MDTypography variant="caption">All companies • Packed and returned bills awaiting delivery • {report.total} pending bills</MDTypography>
          {error && <MDTypography variant="caption" display="block" color="error">{error}</MDTypography>}
        </MDBox>
        {!report.companyCount ? <MDBox p={3}><MDTypography variant="button">No delivery data available.</MDTypography></MDBox> : (
          <TableContainer sx={{ maxHeight: "72vh" }}>
            <Table size="small" aria-label="Pending delivery bills by company and area" sx={{ tableLayout: "fixed", width: 160 + (report.width - 1) * 95, borderCollapse: "collapse" }}>
              <colgroup>
                <col style={{ width: 160 }} />
                {Array.from({ length: report.width - 1 }, (_, index) => <col key={index} style={{ width: 95 }} />)}
              </colgroup>
              <TableBody>
                {report.rows.map(({ type, cells }, index) => (
                  <TableRow key={index}>
                    {(type === "section" || type === "spacer" ? [cells[0] || ""] : cells).map((value, column) => (
                      <TableCell key={column} colSpan={type === "section" ? 2 : type === "spacer" ? report.width : 1} sx={{
                        px: 0.5, py: type === "spacer" ? 0.25 : 0.35, fontSize: "0.75rem", lineHeight: 1.2, color: "#172033",
                        border: type === "spacer" ? 0 : "1px solid #cbd5e1",
                        backgroundColor: `#${deliveryLogColors[type]}`,
                        fontWeight: ["section", "header", "total"].includes(type) ? 700 : 400,
                        textAlign: column === 0 ? "left" : "center", overflowWrap: "anywhere",
                        ...(column === 0 && !["section", "spacer"].includes(type) ? { position: "sticky", left: 0, zIndex: 1, width: 160 } : {}),
                      }}>{value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 1, py: 0.5 }}><MDButton size="small" color="secondary" onClick={onClose}>Close</MDButton></DialogActions>
    </Dialog>
  );
}

DeliveryLogDialog.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, sales: PropTypes.arrayOf(PropTypes.object).isRequired };
