import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import { FormControl, Select, MenuItem } from "@mui/material";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";
import MDAvatar from "components/MDAvatar";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { printSalesStickers } from "utils/printSalesStickers";
import { printSalesReceipt } from "utils/printSalesReceipt";

function AddSales() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [salesData, setSalesData] = useState({});
  const [submittedSummary, setSubmittedSummary] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryBoys, setDeliveryBoys] = useState([]);

  const API = "https://bawarchee.edunextg.co/api";

  useEffect(() => {
    const fetchDeliveryBoys = async () => {
      try {
        const response = await fetch(`${API}/delivery-boy`);
        if (response.ok) {
          const data = await response.json();
          setDeliveryBoys(data);
        }
      } catch (error) {
        console.error("Error fetching delivery boys:", error);
      }
    };
    fetchDeliveryBoys();
  }, []);

  const dayName = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    new Date(`${selectedDate}T12:00:00`)
  );

  const handleSearch = async (query) => {
    if (!query) return;
    try {
      const response = await fetch(`${API}/staff/search?query=${query}`);
      const data = await response.json();
      setStaffOptions(data);
    } catch (error) {
      console.error("Error searching staff:", error);
    }
  };

  useEffect(() => {
    if (selectedStaff && selectedDate) {
      const fetchAllData = async () => {
        try {
          const response = await fetch(
            `${API}/staff/${selectedStaff.id}/outlets-by-date?date=${selectedDate}`
          );
          const data = await response.json();
          setOutlets(data);
          const initialSales = {};
          data.forEach((outlet) => {
            initialSales[outlet.id] = {
              invoiceNumber: "",
              price: "",
              deliveryBoyId: "",
              vehicleNo: "",
            };
          });
          setSalesData(initialSales);

          // Fetch ALREADY submitted sales to display at the bottom
          const salesResponse = await fetch(
            `${API}/staff/${selectedStaff.id}/sales-by-date?date=${selectedDate}`
          );
          if (salesResponse.ok) {
            const salesDataList = await salesResponse.json();
            if (salesDataList && salesDataList.length > 0) {
              setSubmittedSummary({
                date: selectedDate,
                dayName: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
                  new Date(`${selectedDate}T12:00:00`)
                ),
                staffName: selectedStaff.name,
                companyName: selectedStaff.company_name || "",
                sales: salesDataList.map((s) => ({
                  shopName: s.outlet_name,
                  outletErpId: s.outlet_erp_id || "",
                  invoiceNumber: s.invoice_number,
                  stickerNumber: s.sticker_number,
                  paymentMode: s.payment_mode,
                  amount: s.price,
                  deliveryBoyName: s.delivery_boy_name || "",
                  vehicleNo: s.vehicle_no || "",
                })),
              });
            } else {
              setSubmittedSummary(null);
            }
          } else {
            setSubmittedSummary(null);
          }
        } catch (error) {
          console.error("Error fetching data:", error);
        }
      };
      fetchAllData();
    } else {
      setOutlets([]);
      setSubmittedSummary(null);
    }
  }, [selectedStaff, selectedDate]);

  const handleSalesChange = (outletId, field, value) => {
    setSalesData((prev) => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async () => {
    const salesEntries = Object.entries(salesData).filter(
      ([, data]) => data?.invoiceNumber?.trim() || data?.price?.trim()
    );

    if (!selectedStaff || !selectedDate || salesEntries.length === 0) {
      alert("Please select staff, date, and enter invoice numbers and prices.");
      return;
    }

    const incomplete = salesEntries.some(
      ([, data]) =>
        !data?.invoiceNumber?.trim() ||
        !data?.price?.trim() ||
        !data?.deliveryBoyId ||
        !data?.vehicleNo?.trim()
    );
    if (incomplete) {
      alert("Each row must have invoice number, price, delivery boy, and vehicle number.");
      return;
    }

    const payload = {
      date: selectedDate,
      sales: salesEntries.map(([outletId, data]) => ({
        outletId: parseInt(outletId),
        invoiceNumber: data.invoiceNumber.trim(),
        price: parseFloat(data.price),
        deliveryBoyId: parseInt(data.deliveryBoyId, 10),
        vehicleNo: data.vehicleNo.trim(),
      })),
    };

    setSubmitting(true);
    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        const submittedOutletIds = salesEntries.map(([id]) => parseInt(id, 10));

        // Append to summary if exists, else set new summary
        setSubmittedSummary((prev) => {
          if (prev) {
            return {
              ...prev,
              sales: [...prev.sales, ...result.summary.sales],
            };
          }
          return result.summary;
        });

        // Remove from the outlets table list
        setOutlets((prev) => prev.filter((o) => !submittedOutletIds.includes(o.id)));

        // Remove from salesData
        setSalesData((prev) => {
          const next = { ...prev };
          submittedOutletIds.forEach((id) => delete next[id]);
          return next;
        });

        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to record sales.");
      }
    } catch (error) {
      console.error("Error submitting sales:", error);
      alert("Error submitting form.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12} lg={10} mx="auto">
            <Card
              sx={{ boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }}
            >
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center">
                <MDBox display="flex" alignItems="center" gap={1.5}>
                  <MDTypography variant="h5" fontWeight="medium" color="dark">
                    Daily Outlet Price Entry
                  </MDTypography>
                  <MDBadge
                    badgeContent={`${outlets.length} outlet${outlets.length !== 1 ? "s" : ""}`}
                    color="light"
                    container
                    sx={{
                      "& .MuiBadge-badge": {
                        textTransform: "none",
                        border: "1px solid #e5e7eb",
                        backgroundColor: "#f9fafb",
                        color: "#374151",
                        fontWeight: 500,
                      },
                    }}
                  />
                </MDBox>
              </MDBox>
              <MDBox pb={3} px={3}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <MDBox mb={2}>
                      <MDInput
                        type="date"
                        label="Select Date"
                        fullWidth
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                      />
                    </MDBox>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <MDBox mb={2}>
                      <Autocomplete
                        options={staffOptions}
                        getOptionLabel={(option) => option.name}
                        onChange={(event, newValue) => {
                          setSelectedStaff(newValue);
                          setSubmittedSummary(null);
                        }}
                        onInputChange={(event, newInputValue) => handleSearch(newInputValue)}
                        renderInput={(params) => (
                          <MDInput {...params} label="Search Staff Name" fullWidth />
                        )}
                      />
                    </MDBox>
                  </Grid>
                </Grid>

                {selectedStaff && outlets.length > 0 && (
                  <MDBox mt={4}>
                    <MDBox display="flex" alignItems="center" flexWrap="wrap" gap={1} mb={2}>
                      <MDTypography variant="h6">
                        Enter Prices for {new Date(selectedDate).toLocaleDateString()}
                      </MDTypography>
                      <MDBox
                        px={1.5}
                        py={0.75}
                        sx={{
                          backgroundColor: "#f0f2f5",
                          borderRadius: "10px",
                          border: "1px solid #ddd",
                        }}
                      >
                        <MDTypography variant="button" fontWeight="bold" color="info">
                          {dayName}
                        </MDTypography>
                      </MDBox>
                    </MDBox>
                    <TableContainer
                      sx={{
                        boxShadow: "none",
                        backgroundColor: "transparent",
                        borderTop: "1px solid #e5e7eb",
                        mt: 2,
                      }}
                    >
                      <Table sx={{ minWidth: 900 }}>
                        <TableHead
                          sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}
                        >
                          <TableRow>
                            <TableCell
                              align="left"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Outlet
                            </TableCell>
                            <TableCell
                              align="left"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Invoice No
                            </TableCell>
                            <TableCell
                              align="left"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Price
                            </TableCell>
                            <TableCell
                              align="left"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Delivery Boy
                            </TableCell>
                            <TableCell
                              align="left"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Vehicle No
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {outlets.map((outlet) => (
                            <TableRow
                              key={outlet.id}
                              sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                            >
                              <TableCell sx={{ borderBottom: "1px solid #e5e7eb", py: 2 }}>
                                <MDBox display="flex" alignItems="center" gap={2}>
                                  <MDAvatar
                                    bgColor="light"
                                    size="sm"
                                    sx={{ border: "1px solid #e5e7eb", color: "#374151" }}
                                  >
                                    <MDTypography variant="caption" fontWeight="medium">
                                      {outlet.outlet_name.charAt(0)}
                                    </MDTypography>
                                  </MDAvatar>
                                  <MDBox lineHeight={1}>
                                    <MDTypography
                                      display="block"
                                      variant="button"
                                      fontWeight="medium"
                                      color="dark"
                                      sx={{ fontSize: "0.875rem" }}
                                    >
                                      {outlet.outlet_name}
                                    </MDTypography>
                                    <MDTypography
                                      variant="caption"
                                      color="text"
                                      sx={{ fontSize: "0.75rem", color: "#6b7280" }}
                                    >
                                      {outlet.outlet_erp_id}
                                    </MDTypography>
                                  </MDBox>
                                </MDBox>
                              </TableCell>
                              <TableCell sx={{ borderBottom: "1px solid #e5e7eb", py: 2 }}>
                                <MDInput
                                  type="text"
                                  placeholder="Invoice..."
                                  size="small"
                                  sx={{
                                    width: "120px",
                                    "& .MuiInputBase-root": { height: "36px" },
                                  }}
                                  value={salesData[outlet.id]?.invoiceNumber || ""}
                                  onChange={(e) =>
                                    handleSalesChange(outlet.id, "invoiceNumber", e.target.value)
                                  }
                                />
                              </TableCell>
                              <TableCell sx={{ borderBottom: "1px solid #e5e7eb", py: 2 }}>
                                <MDInput
                                  type="number"
                                  placeholder="0.00"
                                  size="small"
                                  disabled={!salesData[outlet.id]?.invoiceNumber?.trim()}
                                  sx={{
                                    width: "100px",
                                    "& .MuiInputBase-root": { height: "36px" },
                                    "& .Mui-disabled": { opacity: 0.8, backgroundColor: "#f3f4f6" }
                                  }}
                                  value={salesData[outlet.id]?.price || ""}
                                  onChange={(e) =>
                                    handleSalesChange(outlet.id, "price", e.target.value)
                                  }
                                />
                              </TableCell>
                              <TableCell sx={{ borderBottom: "1px solid #e5e7eb", py: 2 }}>
                                <FormControl size="small" sx={{ minWidth: 140 }}>
                                  <Select
                                    value={salesData[outlet.id]?.deliveryBoyId || ""}
                                    displayEmpty
                                    onChange={(e) =>
                                      handleSalesChange(outlet.id, "deliveryBoyId", e.target.value)
                                    }
                                    sx={{ height: "36px", fontSize: "0.875rem" }}
                                  >
                                    <MenuItem value="" disabled>
                                      {deliveryBoys.length === 0
                                        ? "Add delivery boy first"
                                        : "Select"}
                                    </MenuItem>
                                    {deliveryBoys.map((boy) => (
                                      <MenuItem key={boy.id} value={String(boy.id)}>
                                        {boy.name}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              </TableCell>
                              <TableCell sx={{ borderBottom: "1px solid #e5e7eb", py: 2 }}>
                                <MDInput
                                  type="text"
                                  placeholder="Vehicle..."
                                  size="small"
                                  sx={{
                                    width: "110px",
                                    "& .MuiInputBase-root": { height: "36px" },
                                  }}
                                  value={salesData[outlet.id]?.vehicleNo || ""}
                                  onChange={(e) =>
                                    handleSalesChange(outlet.id, "vehicleNo", e.target.value)
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    <MDBox mt={4}>
                      <MDButton
                        variant="gradient"
                        color="info"
                        fullWidth
                        onClick={handleSubmit}
                        disabled={submitting}
                      >
                        {submitting ? "Submitting..." : "Submit"}
                      </MDButton>
                    </MDBox>
                  </MDBox>
                )}

                {selectedStaff && outlets.length === 0 && (
                  <MDBox mt={4} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      No outlets assigned for this staff on this day of the week.
                    </MDTypography>
                  </MDBox>
                )}

                {submittedSummary && (
                  <MDBox
                    mt={4}
                    p={3}
                    sx={{
                      backgroundColor: "#f8f9fa",
                      borderRadius: "12px",
                      border: "1px solid #dee2e6",
                    }}
                  >
                    <MDTypography variant="h6" fontWeight="bold" mb={2}>
                      Submitted Details
                    </MDTypography>
                    {/* <MDTypography variant="body2" mb={1}>
                      <strong>Date:</strong> {new Date(submittedSummary.date).toLocaleDateString()}{" "}
                      ({submittedSummary.dayName})
                    </MDTypography>
                    <MDTypography variant="body2" mb={1}>
                      <strong>Staff:</strong> {submittedSummary.staffName}
                    </MDTypography>
                    <MDTypography variant="body2" mb={2}>
                      <strong>Company:</strong> {submittedSummary.companyName || "—"}
                    </MDTypography> */}

                    <TableContainer
                      sx={{
                        boxShadow: "none",
                        borderTop: "1px solid #e5e7eb",
                        backgroundColor: "transparent",
                      }}
                    >
                      <Table size="small" sx={{ minWidth: 650 }}>
                        <TableHead sx={{ backgroundColor: "#f9fafb" }}>
                          <TableRow>
                            <TableCell
                              align="left"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Outlet
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Invoice
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Sticker
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Delivery Boy
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Vehicle No
                            </TableCell>
                            <TableCell
                              align="right"
                              sx={{
                                color: "#6b7280",
                                fontSize: "0.75rem",
                                textTransform: "none",
                                fontWeight: 500,
                                borderBottom: "1px solid #e5e7eb",
                                py: 1.5,
                              }}
                            >
                              Amount
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {submittedSummary.sales.map((row, index) => (
                            <TableRow
                              key={index}
                              sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                            >
                              <TableCell
                                align="left"
                                sx={{ borderBottom: "1px solid #e5e7eb", py: 1.5 }}
                              >
                                <MDBox display="flex" alignItems="center" gap={1.5}>
                                  <MDAvatar
                                    bgColor="light"
                                    size="xs"
                                    sx={{ border: "1px solid #e5e7eb", color: "#374151" }}
                                  >
                                    <MDTypography variant="caption" fontWeight="medium">
                                      {row.shopName.charAt(0)}
                                    </MDTypography>
                                  </MDAvatar>
                                  <MDBox lineHeight={1}>
                                    <MDTypography
                                      display="block"
                                      variant="button"
                                      fontWeight="medium"
                                      color="dark"
                                      sx={{ fontSize: "0.875rem" }}
                                    >
                                      {row.shopName}
                                    </MDTypography>
                                    <MDTypography
                                      variant="caption"
                                      color="text"
                                      sx={{ fontSize: "0.75rem", color: "#6b7280" }}
                                    >
                                      {row.outletErpId || "—"}
                                    </MDTypography>
                                  </MDBox>
                                </MDBox>
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{
                                  borderBottom: "1px solid #e5e7eb",
                                  py: 1.5,
                                  fontSize: "0.875rem",
                                  color: "#374151",
                                }}
                              >
                                {row.invoiceNumber}
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{
                                  borderBottom: "1px solid #e5e7eb",
                                  py: 1.5,
                                  fontSize: "0.875rem",
                                  color: "#374151",
                                }}
                              >
                                {row.stickerNumber}
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{
                                  borderBottom: "1px solid #e5e7eb",
                                  py: 1.5,
                                  fontSize: "0.875rem",
                                  color: "#374151",
                                }}
                              >
                                {row.deliveryBoyName || "—"}
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{
                                  borderBottom: "1px solid #e5e7eb",
                                  py: 1.5,
                                  fontSize: "0.875rem",
                                  color: "#374151",
                                }}
                              >
                                {row.vehicleNo || "—"}
                              </TableCell>
                              <TableCell
                                align="right"
                                sx={{
                                  borderBottom: "1px solid #e5e7eb",
                                  py: 1.5,
                                  fontSize: "0.875rem",
                                  fontWeight: 500,
                                  color: "#111827",
                                }}
                              >
                                ₹{Number(row.amount).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    <MDBox
                      mt={3}
                      display="flex"
                      flexDirection={{ xs: "column", sm: "row" }}
                      gap={2}
                    >
                      {/* <MDButton
                        variant="gradient"
                        color="info"
                        fullWidth
                        onClick={() => printSalesReceipt(submittedSummary)}
                      >
                        <Icon sx={{ mr: 1 }}>print</Icon>
                        Print Price Entry (Receiver Signature)
                      </MDButton> */}
                      <MDButton
                        variant="outlined"
                        color="dark"
                        fullWidth
                        onClick={() => printSalesStickers(submittedSummary.sales)}
                      >
                        <Icon sx={{ mr: 1 }}>label</Icon>
                        Print Stickers
                      </MDButton>
                    </MDBox>
                  </MDBox>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default AddSales;
