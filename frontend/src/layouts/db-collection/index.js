import { useEffect, useMemo, useState } from "react";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import {
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadCellSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";

const PAYMENT_LABELS = {
  cash: "Cash",
  upi: "UPI",
  cheque: "Cheque",
  credit: "Credit",
};

const PAYMENT_COLORS = {
  cash: "success",
  upi: "info",
  cheque: "warning",
  credit: "secondary",
};

const CASH_DENOMINATIONS = [
  ["500 Note", "note_500", 500],
  ["200 Note", "note_200", 200],
  ["100 Note", "note_100", 100],
  ["50 Note", "note_50", 50],
  ["20 Note", "note_20", 20],
  ["10 Note", "note_10", 10],
  ["20 Coin", "coin_20", 20],
  ["10 Coin", "coin_10", 10],
  ["5 Coin", "coin_5", 5],
  ["2 Coin", "coin_2", 2],
  ["1 Coin", "coin_1", 1],
];

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "N/A";
  const dateOnly = String(value).split("T")[0].split(" ")[0];
  const parts = dateOnly.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return value;
}

function getPaymentDetails(row) {
  if (row.payment_mode === "cash") {
    const details = row.cash_details || {};
    const parts = CASH_DENOMINATIONS
      .map(([label, key, amount]) => {
        const count = Number(details[key]) || 0;
        if (!count) return null;
        return `${label}: ${count} (${formatCurrency(count * amount)})`;
      })
      .filter(Boolean);
    return parts.length ? parts.join(", ") : "Cash count not available";
  }

  if (row.payment_mode === "cheque") {
    return `Cheque No: ${row.reference_no || "N/A"} | Date: ${formatDate(row.reference_date)}`;
  }

  if (row.payment_mode === "upi") {
    return `UPI No: ${row.reference_no || "N/A"}`;
  }

  if (row.payment_mode === "credit") {
    return `Credit Days: ${row.credit_days || "N/A"}`;
  }

  return "N/A";
}

function DBCollection() {
  const [collections, setCollections] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const API = "https://bawarchee.edunextg.co/api";

  const fetchCollections = async (search = searchQuery) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const normalizedSearch = String(search || "").trim();
      if (normalizedSearch) {
        params.set("search", normalizedSearch);
      }
      const query = params.toString();
      const response = await fetch(`${API}/delivery-boy/collections${query ? `?${query}` : ""}`);
      if (response.ok) {
        setCollections(await response.json());
      } else {
        setCollections([]);
      }
    } catch (error) {
      console.error("Error fetching delivery boy collections:", error);
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCollections(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const totalAmount = useMemo(
    () => collections.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [collections]
  );

  const totalPages = Math.max(1, Math.ceil(collections.length / ROWS_PER_PAGE));
  const paginatedCollections = collections.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE
  );

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Card>
          <MDBox p={3}>
            <MDBox
              display="flex"
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              gap={2}
              flexDirection={{ xs: "column", md: "row" }}
              mb={3}
            >
              <MDBox>
                <MDTypography variant="h5" fontWeight="medium">
                  D.B. Collection
                </MDTypography>
                <MDTypography variant="button" color="text">
                  Read-only payment details submitted from delivery-boy mobile accounts.
                </MDTypography>
              </MDBox>
              <MDBox display="flex" gap={1.5} alignItems="center" flexWrap="wrap">
                <MDTypography variant="button" fontWeight="medium" color="dark">
                  Total: {formatCurrency(totalAmount)}
                </MDTypography>
                <MDButton variant="outlined" color="info" size="small" onClick={() => fetchCollections()}>
                  <Icon sx={{ mr: 1 }}>refresh</Icon>
                  Refresh
                </MDButton>
              </MDBox>
            </MDBox>

            <MDBox mb={2}>
              <MDInput
                label="Search outlet, invoice, delivery boy, payment mode, or sale id"
                fullWidth
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </MDBox>

            <TableContainer component={Paper} sx={paginatedTableContainerSx}>
              <Table stickyHeader size="small">
                <TableHead sx={paginatedTableHeadSx()}>
                  <TableRow>
                    <TableCell align="center" sx={{ ...paginatedTableHeadCellSx, width: 56 }}>
                      Sr No
                    </TableCell>
                    <TableCell align="left" sx={paginatedTableHeadCellSx}>Outlet Name</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Invoice No</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Sale ID</TableCell>
                    <TableCell align="left" sx={paginatedTableHeadCellSx}>Delivery Boy</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Payment Status</TableCell>
                    <TableCell align="right" sx={paginatedTableHeadCellSx}>Amount</TableCell>
                    <TableCell align="left" sx={paginatedTableHeadCellSx}>Details</TableCell>
                    <TableCell align="center" sx={paginatedTableHeadCellSx}>Updated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        <MDTypography variant="button" color="text">Loading...</MDTypography>
                      </TableCell>
                    </TableRow>
                  ) : paginatedCollections.length > 0 ? (
                    paginatedCollections.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell align="center">{(page - 1) * ROWS_PER_PAGE + index + 1}</TableCell>
                        <TableCell>{row.outlet_name || "N/A"}</TableCell>
                        <TableCell align="center">{row.invoice_number || "N/A"}</TableCell>
                        <TableCell align="center">BP{row.sale_id}</TableCell>
                        <TableCell>{row.delivery_boy_name || "N/A"}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={PAYMENT_LABELS[row.payment_mode] || row.payment_mode || "N/A"}
                            color={PAYMENT_COLORS[row.payment_mode] || "default"}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                        <TableCell sx={{ minWidth: 260 }}>{getPaymentDetails(row)}</TableCell>
                        <TableCell align="center">{formatDate(row.updated_at)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        <MDTypography variant="button" color="text">
                          No delivery-boy collection updates found.
                        </MDTypography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePaginationFooter
              page={page}
              totalPages={totalPages}
              total={collections.length}
              onPageChange={setPage}
            />
          </MDBox>
        </Card>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default DBCollection;
