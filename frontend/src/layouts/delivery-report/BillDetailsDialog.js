import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Dialog, DialogTitle, DialogContent, DialogActions, TableContainer, Table, TableHead, TableBody, TableRow, TableCell } from "@mui/material";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";

const money = (value) => value == null ? "—" : `Rs. ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BillDetailsDialog({ bill, onClose, api }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!bill) return undefined;
    const controller = new AbortController();
    setItems([]); setError(""); setLoading(true);
    const load = async () => {
      try {
        const response = await fetch(`${api}/staff/sales/${bill.row.id}/items`, { signal: controller.signal });
        if (!response.ok) throw new Error("Unable to load bill items. Please retry.");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid bill items response. Please retry.");
        if (!controller.signal.aborted) setItems(data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [bill, api, retry]);
  const row = bill?.row || {};
  const draft = bill?.draft || {};
  const details = [
    ["Invoice", row.invoice_number || row.id], ["Sticker number", row.sticker_number],
    ["Bill date", row.formatted_date || row.sale_date], ["Company", row.company_name],
    ["Outlet", row.outlet_name], ["Outlet ERP ID", row.outlet_erp_id],
    ["Area", row.location_name], ["Sales staff", row.staff_name],
    ["Outlet staff", row.outlet_staff_name], ["Status", row.packaging_status],
    ["Assigned delivery staff", draft.name], ["Assignment date", draft.date],
    ["Vehicle", draft.vehicle], ["Packed by", row.packed_by_name],
    ["Packing date", row.packing_date], ["Items", row.item_count],
    ["Packed items", row.packed_item_count], ["Boxes", row.box_count], ["Packets", row.packet_count],
    ["Payment mode", row.payment_mode], ["Original bill total", money(row.price)],
    ["Cancelled amount", money(row.cancelled_amount)], ["Bill total", money(row.effective_price ?? row.price)],
    ["Paid", money(row.paid_amount)], ["Balance", money(row.balance_amount)],
  ];
  return <Dialog open={Boolean(bill)} onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="bill-details-title">
    <DialogTitle id="bill-details-title">Bill Details — {row.invoice_number || row.id}</DialogTitle>
    <DialogContent dividers>
      <MDBox display="grid" sx={{ gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1, mb: 2 }}>
        {details.map(([label, value]) => <MDTypography key={label} variant="caption"><strong>{label}:</strong> {value === "" || value == null ? "—" : String(value)}</MDTypography>)}
      </MDBox>
      <MDTypography variant="h6">Bill Items</MDTypography>
      {loading ? <MDTypography variant="body2" role="status">Loading items…</MDTypography> : error ?
        <MDBox><MDTypography variant="body2" color="error" role="alert">{error}</MDTypography><MDButton onClick={() => setRetry((value) => value + 1)} color="info">Retry</MDButton></MDBox> :
        <TableContainer><Table size="small" aria-label="Bill items">
          <TableHead sx={{ display: "table-header-group" }}><TableRow>
            {["Product", "ERP ID", "Division", "Variant", "Quantity", "Rate", "Amount"].map((label) => <TableCell key={label}>{label}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>{items.map((item, index) => <TableRow key={item.id ?? index}>
            <TableCell>{item.product_name || "—"}</TableCell><TableCell>{item.product_erp_id || "—"}</TableCell>
            <TableCell>{item.product_division || "—"}</TableCell><TableCell>{item.variant_name || "—"}</TableCell>
            <TableCell>{item.qty}</TableCell><TableCell>{money(item.rate)}</TableCell><TableCell>{money(item.line_total)}</TableCell>
          </TableRow>)}
          {!items.length && <TableRow><TableCell colSpan={7}>No item details recorded for this bill.</TableCell></TableRow>}
          </TableBody>
        </Table></TableContainer>}
    </DialogContent>
    <DialogActions><MDButton color="secondary" onClick={onClose}>Close</MDButton></DialogActions>
  </Dialog>;
}

BillDetailsDialog.propTypes = { bill: PropTypes.object, onClose: PropTypes.func.isRequired, api: PropTypes.string.isRequired };
