import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
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

const tableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "none",
  borderBottom: "1px solid #e5e7eb",
  py: 1.5,
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const tableBodySx = {
  verticalAlign: "middle",
  py: 1.5,
};

function AddSales() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [salesData, setSalesData] = useState({});
  const [submittedSummary, setSubmittedSummary] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [outletSearch, setOutletSearch] = useState("");
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editForm, setEditForm] = useState({ invoiceNumber: "", price: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  const API = "https://bawarchee.edunextg.co/api";

  const mapSaleFromApi = (s) => ({
    id: s.id,
    outletId: s.outlet_id,
    shopName: s.outlet_name,
    outletErpId: s.outlet_erp_id || "",
    invoiceNumber: s.invoice_number,
    stickerNumber: s.sticker_number,
    paymentMode: s.payment_mode,
    amount: s.price,
    deliveryBoyName: s.delivery_boy_name || "",
    vehicleNo: s.vehicle_no || "",
  });

  const mapSaleFromSave = (s) => ({
    id: s.saleId,
    shopName: s.shopName,
    outletErpId: s.outletErpId || "",
    invoiceNumber: s.invoiceNumber,
    stickerNumber: s.stickerNumber,
    paymentMode: s.paymentMode,
    amount: s.amount,
    deliveryBoyName: s.deliveryBoyName || "",
    vehicleNo: s.vehicleNo || "",
  });

  const filteredOutlets = outlets.filter((outlet) => {
    if (!outletSearch.trim()) return true;
    const q = outletSearch.toLowerCase();
    const name = outlet.outlet_name ? outlet.outlet_name.toLowerCase() : "";
    const erpId = outlet.outlet_erp_id ? outlet.outlet_erp_id.toLowerCase() : "";
    return name.includes(q) || erpId.includes(q);
  });

  const refreshOutletsAndSubmitted = async () => {
    if (!selectedStaff || !selectedDate) return;
    try {
      const [outletsRes, salesRes] = await Promise.all([
        fetch(`${API}/staff/${selectedStaff.id}/outlets-by-date?date=${selectedDate}`),
        fetch(`${API}/staff/${selectedStaff.id}/sales-by-date?date=${selectedDate}`),
      ]);
      if (outletsRes.ok) {
        const data = await outletsRes.json();
        setOutlets(data);
        setSalesData((prev) => {
          const next = { ...prev };
          data.forEach((outlet) => {
            if (!next[outlet.id]) {
              next[outlet.id] = [
                { invoiceNumber: "", price: "", deliveryBoyId: "", vehicleNo: "" },
              ];
            }
          });
          return next;
        });
      }
      if (salesRes.ok) {
        const salesDataList = await salesRes.json();
        if (salesDataList.length > 0) {
          setSubmittedSummary({
            date: selectedDate,
            dayName: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
              new Date(`${selectedDate}T12:00:00`)
            ),
            staffName: selectedStaff.name,
            companyName: selectedStaff.company_name || "",
            sales: salesDataList.map(mapSaleFromApi),
          });
        } else {
          setSubmittedSummary(null);
        }
      }
    } catch (error) {
      console.error("Error refreshing sales data:", error);
    }
  };

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

  const dayName = selectedDate
    ? new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
      new Date(`${selectedDate}T12:00:00`)
    )
    : "";

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
            initialSales[outlet.id] = [{
              invoiceNumber: "",
              price: "",
              deliveryBoyId: "",
              vehicleNo: "",
            }];
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
                sales: salesDataList.map(mapSaleFromApi),
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

  const handleSalesChange = (outletId, index, field, value) => {
    setSalesData((prev) => {
      const outletSales = [...prev[outletId]];
      outletSales[index] = { ...outletSales[index], [field]: value };
      return {
        ...prev,
        [outletId]: outletSales,
      };
    });
  };

  const handleAddRow = (outletId) => {
    setSalesData((prev) => ({
      ...prev,
      [outletId]: [
        ...prev[outletId],
        { invoiceNumber: "", price: "", deliveryBoyId: "", vehicleNo: "" }
      ]
    }));
  };

  const handleRemoveRow = (outletId, index) => {
    setSalesData((prev) => {
      const outletSales = [...prev[outletId]];
      outletSales.splice(index, 1);
      return {
        ...prev,
        [outletId]: outletSales
      };
    });
  };

  const handleSaveRow = async (outletId) => {
    const dataList = salesData[outletId] || [];
    const validRows = dataList.filter(d => d.invoiceNumber?.trim() && d.price?.trim());

    if (validRows.length === 0) {
      alert("Please enter at least one valid invoice number and price.");
      return;
    }

    const hasInvalidFormat = validRows.some(d => isNaN(parseFloat(d.price)));
    if (hasInvalidFormat) {
       alert("Please enter a valid numeric value for the price.");
       return;
    }

    const hasIncomplete = dataList.some(d =>
      (d.invoiceNumber?.trim() && !d.price?.trim()) ||
      (!d.invoiceNumber?.trim() && d.price?.trim())
    );
    if (hasIncomplete) {
      alert("Please complete partially filled rows or remove them.");
      return;
    }

    const payload = {
      date: selectedDate,
      sales: validRows.map(d => ({
        outletId: parseInt(outletId, 10),
        invoiceNumber: d.invoiceNumber.trim(),
        price: parseFloat(d.price),
      }))
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

        setSubmittedSummary((prev) => {
          const newRows = result.summary.sales.map(mapSaleFromSave);
          if (prev) {
            return { ...prev, sales: [...prev.sales, ...newRows] };
          }
          return { ...result.summary, sales: newRows };
        });

        setOutlets((prev) => prev.filter((o) => o.id !== parseInt(outletId, 10)));
        setSalesData((prev) => {
          const next = { ...prev };
          delete next[outletId];
          return next;
        });
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to record sale.");
      }
    } catch (error) {
      console.error("Error submitting sale:", error);
      alert("Error submitting form.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    const allSales = [];
    const submittedOutletIds = new Set();
    let hasError = false;

    Object.entries(salesData).forEach(([outletId, dataList]) => {
      const filledRows = dataList.filter(d => d.invoiceNumber?.trim() || d.price?.trim());
      if (filledRows.length > 0) {
        const incomplete = filledRows.some(d => !d.invoiceNumber?.trim() || !d.price?.trim() || isNaN(parseFloat(d.price)));
        if (incomplete) {
          hasError = true;
        } else {
          submittedOutletIds.add(parseInt(outletId, 10));
          filledRows.forEach(d => {
            allSales.push({
              outletId: parseInt(outletId, 10),
              invoiceNumber: d.invoiceNumber.trim(),
              price: parseFloat(d.price)
            });
          });
        }
      }
    });

    if (!selectedStaff || !selectedDate || allSales.length === 0) {
      alert("Please select staff, date, and enter at least one valid invoice and price.");
      return;
    }
    if (hasError) {
      alert("Some rows are partially filled or invalid. Please provide both an invoice number and numeric price, or clear/remove the row.");
      return;
    }

    const payload = {
      date: selectedDate,
      sales: allSales,
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

        // Append to summary if exists, else set new summary
        setSubmittedSummary((prev) => {
          const newRows = result.summary.sales.map(mapSaleFromSave);
          if (prev) {
            return { ...prev, sales: [...prev.sales, ...newRows] };
          }
          return { ...result.summary, sales: newRows };
        });

        setOutlets((prev) => prev.filter((o) => !submittedOutletIds.has(o.id)));

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

  const startEditSale = (row) => {
    setEditingSaleId(row.id);
    setEditForm({
      invoiceNumber: row.invoiceNumber || "",
      price: String(row.amount ?? ""),
    });
  };

  const cancelEditSale = () => {
    setEditingSaleId(null);
    setEditForm({ invoiceNumber: "", price: "" });
  };

  const saveEditSale = async (saleId) => {
    if (!editForm.invoiceNumber.trim() || !editForm.price.trim()) {
      alert("Invoice number and price are required.");
      return;
    }
    const price = parseFloat(editForm.price);
    if (Number.isNaN(price)) {
      alert("Please enter a valid price.");
      return;
    }

    setSavingEdit(true);
    try {
      const response = await fetch(`${API}/staff/sales/${saleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: editForm.invoiceNumber.trim(),
          price,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setSubmittedSummary((prev) => ({
          ...prev,
          sales: prev.sales.map((s) => (s.id === saleId ? { ...s, ...data.sale } : s)),
        }));
        cancelEditSale();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update sale.");
      }
    } catch (error) {
      console.error("Error updating sale:", error);
      alert("Error updating sale.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSale = async (saleId) => {
    if (!window.confirm("Delete this sale record?")) return;

    try {
      const response = await fetch(`${API}/staff/sales/${saleId}`, { method: "DELETE" });
      if (response.ok) {
        setSubmittedSummary((prev) => {
          const nextSales = prev.sales.filter((s) => s.id !== saleId);
          return nextSales.length ? { ...prev, sales: nextSales } : null;
        });
        await refreshOutletsAndSubmitted();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to delete sale.");
      }
    } catch (error) {
      console.error("Error deleting sale:", error);
      alert("Error deleting sale.");
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12}>
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
                        isOptionEqualToValue={(option, value) => option.id === value.id}
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
                    <MDBox mb={2} maxWidth={400}>
                      <MDInput
                        type="text"
                        label="Search Outlet Name or ERP ID"
                        fullWidth
                        value={outletSearch}
                        onChange={(e) => setOutletSearch(e.target.value)}
                      />
                    </MDBox>
                    <TableContainer
                      sx={{
                        boxShadow: "none",
                        backgroundColor: "transparent",
                        borderTop: "1px solid #e5e7eb",
                        mt: 2,
                      }}
                    >
                      <Table
                        sx={{
                          tableLayout: "fixed",
                          width: "100%",
                          minWidth: 900,
                          "& .MuiTableCell-root": { overflow: "hidden" },
                        }}
                      >
                        <colgroup>
                          <col style={{ width: "56px" }} />
                          <col style={{ width: "30%" }} />
                          <col style={{ width: "20%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "24%" }} />
                        </colgroup>
                        <TableHead sx={{ backgroundColor: "#f9fafb" }}>
                          <TableRow>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: 56 }}>
                              Sr No
                            </TableCell>
                            <TableCell align="left" sx={tableHeadSx}>
                              Outlet
                            </TableCell>
                            <TableCell align="left" sx={tableHeadSx}>
                              Invoice No
                            </TableCell>
                            <TableCell align="left" sx={tableHeadSx}>
                              Price
                            </TableCell>
                            <TableCell align="center" sx={tableHeadSx}>
                              Action
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {filteredOutlets.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                                <MDTypography variant="body2" color="text">
                                  No outlets match your search.
                                </MDTypography>
                              </TableCell>
                            </TableRow>
                          ) : (
                          filteredOutlets.map((outlet, outletIndex) => {
                            const rows = salesData[outlet.id] || [];
                            return rows.map((row, index) => {
                              const rowBorder =
                                index === rows.length - 1
                                  ? { borderBottom: "1px solid #e5e7eb" }
                                  : { borderBottom: "1px solid #f0f0f0" };
                              return (
                              <TableRow
                                key={`${outlet.id}-${index}`}
                                sx={{
                                  backgroundColor: index % 2 !== 0 ? "#fafafa" : "inherit",
                                }}
                              >
                                {index === 0 && (
                                  <TableCell
                                    rowSpan={rows.length}
                                    align="center"
                                    sx={{
                                      ...tableBodySx,
                                      borderBottom: "1px solid #e5e7eb",
                                    }}
                                  >
                                    {outletIndex + 1}
                                  </TableCell>
                                )}
                                {index === 0 && (
                                  <TableCell
                                    rowSpan={rows.length}
                                    align="left"
                                    sx={{
                                      ...tableBodySx,
                                      borderBottom: "1px solid #e5e7eb",
                                    }}
                                  >
                                    <MDBox display="flex" alignItems="center" gap={1.5}>
                                      <MDAvatar
                                        bgColor="light"
                                        size="sm"
                                        sx={{ border: "1px solid #e5e7eb", color: "#374151", flexShrink: 0 }}
                                      >
                                        <MDTypography variant="caption" fontWeight="medium">
                                          {outlet.outlet_name.charAt(0)}
                                        </MDTypography>
                                      </MDAvatar>
                                      <MDBox lineHeight={1} minWidth={0}>
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
                                          sx={{ fontSize: "0.75rem", color: "#6b7280" }}
                                        >
                                          {outlet.outlet_erp_id}
                                        </MDTypography>
                                      </MDBox>
                                    </MDBox>
                                  </TableCell>
                                )}
                                <TableCell align="left" sx={{ ...tableBodySx, ...rowBorder }}>
                                  <MDInput
                                    type="text"
                                    placeholder="Invoice..."
                                    size="small"
                                    fullWidth
                                    sx={{ "& .MuiInputBase-root": { height: "36px" } }}
                                    value={row.invoiceNumber || ""}
                                    onChange={(e) =>
                                      handleSalesChange(outlet.id, index, "invoiceNumber", e.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell align="left" sx={{ ...tableBodySx, ...rowBorder }}>
                                  <MDInput
                                    type="number"
                                    placeholder="0.00"
                                    size="small"
                                    fullWidth
                                    disabled={!row.invoiceNumber?.trim()}
                                    sx={{
                                      "& .MuiInputBase-root": { height: "36px" },
                                      "& .Mui-disabled": { opacity: 0.8, backgroundColor: "#f3f4f6" },
                                    }}
                                    value={row.price || ""}
                                    onChange={(e) =>
                                      handleSalesChange(outlet.id, index, "price", e.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell align="center" sx={{ ...tableBodySx, ...rowBorder }}>
                                  <MDBox
                                    display="flex"
                                    gap={0.5}
                                    justifyContent="center"
                                    alignItems="center"
                                    flexWrap="nowrap"
                                  >
                                    {index === 0 && (
                                      <MDButton
                                        variant="gradient"
                                        color="info"
                                        size="small"
                                        onClick={() => handleSaveRow(outlet.id)}
                                        disabled={
                                          submitting ||
                                          !rows.some((r) => r.invoiceNumber?.trim() && r.price?.trim())
                                        }
                                        sx={{ minWidth: 64 }}
                                      >
                                        Save
                                      </MDButton>
                                    )}
                                    {index === rows.length - 1 && (
                                      <MDButton
                                        variant="outlined"
                                        color="dark"
                                        size="small"
                                        iconOnly
                                        circular
                                        sx={{ minWidth: 32, width: 32, height: 32 }}
                                        onClick={() => handleAddRow(outlet.id)}
                                      >
                                        <Icon>add</Icon>
                                      </MDButton>
                                    )}
                                    {rows.length > 1 && (
                                      <MDButton
                                        variant="outlined"
                                        color="error"
                                        size="small"
                                        iconOnly
                                        circular
                                        sx={{ minWidth: 32, width: 32, height: 32 }}
                                        onClick={() => handleRemoveRow(outlet.id, index)}
                                      >
                                        <Icon>close</Icon>
                                      </MDButton>
                                    )}
                                  </MDBox>
                                </TableCell>
                              </TableRow>
                              );
                            });
                          })
                          )}
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
    <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={2}>
      <MDTypography variant="h6" fontWeight="bold">
        Submitted Details
      </MDTypography>
      <MDButton
        variant="outlined"
        color="dark"
        size="small"
        onClick={() => printSalesStickers(submittedSummary.sales)}
      >
        <Icon sx={{ mr: 1 }}>label</Icon>
        Print Stickers
      </MDButton>
    </MDBox>
    <TableContainer
      sx={{
        boxShadow: "none",
        borderTop: "1px solid #e5e7eb",
        backgroundColor: "transparent",
      }}
    >
      <Table
        size="small"
        sx={{
          tableLayout: "fixed",
          width: "100%",
          minWidth: 720,
          "& .MuiTableCell-root": { overflow: "hidden" },
        }}
      >
        <colgroup>
          <col style={{ width: "48px" }} />
          <col style={{ width: "28%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "14%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <TableHead sx={{ backgroundColor: "#f9fafb" }}>
          <TableRow>
            <TableCell align="center" sx={tableHeadSx}>
              Sr No
            </TableCell>
            <TableCell align="left" sx={tableHeadSx}>
              Outlet
            </TableCell>
            <TableCell align="center" sx={tableHeadSx}>
              Invoice
            </TableCell>
            <TableCell align="center" sx={tableHeadSx}>
              Sticker
            </TableCell>
            <TableCell align="right" sx={tableHeadSx}>
              Amount
            </TableCell>
            <TableCell align="center" sx={tableHeadSx}>
              Action
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {submittedSummary.sales.map((row, index) => (
            <TableRow
              key={row.id || index}
              sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
            >
              <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                {index + 1}
              </TableCell>

              <TableCell align="left" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                <MDBox display="flex" alignItems="center" gap={1.5}>
                  <MDBox lineHeight={1} minWidth={0}>
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
                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
              >
                {editingSaleId === row.id ? (
                  <MDInput
                    type="text"
                    size="small"
                    value={editForm.invoiceNumber}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, invoiceNumber: e.target.value }))
                    }
                    inputProps={{ style: { textAlign: "center" } }}
                    sx={{ width: "100%", maxWidth: 140, mx: "auto" }}
                  />
                ) : (
                  row.invoiceNumber
                )}
              </TableCell>

              <TableCell
                align="center"
                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
              >
                {row.stickerNumber}
              </TableCell>

              <TableCell
                align="right"
                sx={{
                  ...tableBodySx,
                  borderBottom: "1px solid #e5e7eb",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#111827",
                }}
              >
                {editingSaleId === row.id ? (
                  <MDInput
                    type="number"
                    size="small"
                    value={editForm.price}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, price: e.target.value }))
                    }
                    inputProps={{ style: { textAlign: "right" } }}
                    sx={{ width: "100%", maxWidth: 120, ml: "auto" }}
                  />
                ) : (
                  `₹${Number(row.amount).toFixed(2)}`
                )}
              </TableCell>

              <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                {row.id ? (
                  <MDBox display="flex" gap={0.5} justifyContent="center" alignItems="center" flexWrap="wrap">
                    {editingSaleId === row.id ? (
                      <>
                        <MDButton variant="gradient" color="info" size="small" onClick={() => saveEditSale(row.id)} disabled={savingEdit}>
                          Save
                        </MDButton>
                        <MDButton variant="outlined" color="dark" size="small" onClick={cancelEditSale}>
                          Cancel
                        </MDButton>
                      </>
                    ) : (
                      <>
                        <MDButton variant="outlined" color="info" size="small" onClick={() => startEditSale(row)}>
                          <Icon fontSize="small">edit</Icon>
                        </MDButton>
                        <MDButton variant="outlined" color="error" size="small" onClick={() => handleDeleteSale(row.id)}>
                          <Icon fontSize="small">delete</Icon>
                        </MDButton>
                      </>
                    )}
                  </MDBox>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
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
