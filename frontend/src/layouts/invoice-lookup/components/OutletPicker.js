import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import { Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";

import { TABLE_HEAD_SX, formatCurrency, formatDate } from "../format";

// Many different shops share a name ("Matri Bhander" exists in 18 areas), so every
// match is listed with the details that tell them apart: ERP ID, area, staff, phone.
function OutletPicker({ outlets, searchTerm, onSelect }) {
  const sameName = new Set(outlets.map((outlet) => outlet.outlet_names.toLowerCase())).size < outlets.length;

  return (
    <Card sx={{ p: 3, mt: 3 }}>
      <MDBox display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={1}>
        <MDTypography variant="h6" fontWeight="medium">
          {outlets.length} outlet{outlets.length === 1 ? "" : "s"} match &quot;{searchTerm}&quot;
        </MDTypography>
        {outlets.length >= 50 && (
          <Chip size="small" color="warning" variant="outlined" label="Showing first 50 — refine the search" />
        )}
      </MDBox>
      {sameName && (
        <MDTypography variant="caption" color="text" display="block" mb={2}>
          Some outlets share the same name. Check the ERP ID, area and staff to pick the right one.
        </MDTypography>
      )}

      <TableContainer sx={{ boxShadow: "none" }}>
        <Table size="small">
          <TableHead sx={TABLE_HEAD_SX}>
            <TableRow>
              <TableCell>Outlet</TableCell>
              <TableCell>ERP ID</TableCell>
              <TableCell>Area</TableCell>
              <TableCell>Staff</TableCell>
              <TableCell>Contact</TableCell>
              <TableCell align="right">Bills</TableCell>
              <TableCell align="right">Outstanding</TableCell>
              <TableCell>Last Bill</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {outlets.map((outlet) => {
              const outstanding = Number(outlet.total_outstanding) || 0;
              const names = outlet.outlet_names.split(" | ");
              return (
                <TableRow
                  key={outlet.outlet_key}
                  hover
                  onClick={() => onSelect(outlet)}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>
                    <MDTypography variant="button" fontWeight="medium" display="block">
                      {names[0]}
                    </MDTypography>
                    {names.length > 1 && (
                      <MDTypography variant="caption" color="text">
                        also saved as: {names.slice(1).join(", ")}
                      </MDTypography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{outlet.outlet_erp_id}</TableCell>
                  <TableCell>{outlet.locations || "—"}</TableCell>
                  <TableCell>{outlet.staff_names || "—"}</TableCell>
                  <TableCell>{outlet.contacts || "—"}</TableCell>
                  <TableCell align="right">{outlet.invoice_count}</TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 700, whiteSpace: "nowrap", color: outstanding > 0 ? "#b91c1c" : "#15803d" }}
                  >
                    {formatCurrency(outstanding)}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {outlet.last_sale_date ? formatDate(outlet.last_sale_date) : "No bills"}
                  </TableCell>
                  <TableCell align="right">
                    <MDButton size="small" variant="outlined" color="info" sx={{ whiteSpace: "nowrap" }}>
                      View <Icon sx={{ ml: 0.5 }}>chevron_right</Icon>
                    </MDButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

export default OutletPicker;
