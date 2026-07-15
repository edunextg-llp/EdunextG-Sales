import { useState, useEffect, useMemo } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { printSalesStickers } from "utils/printSalesStickers";
import { FaRegEdit } from "react-icons/fa";
import { CiTrash } from "react-icons/ci";
import SalesInvoiceDialog from "layouts/add-sales/components/SalesInvoiceDialog";

const tableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "none",
  borderBottom: "1px solid #e5e7eb",
  px: 2,
  py: 1.5,
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const tableBodySx = {
  px: 2,
  verticalAlign: "middle",
  py: 1.5,
};

const tableHeadRowSx = {
  display: "table-header-group",
  backgroundColor: "#f9fafb",
  "& .MuiTableCell-root": { backgroundColor: "#f9fafb" },
};

function AddSales() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaffType, setSelectedStaffType] = useState("");
  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [allOutlets, setAllOutlets] = useState([]);
  const [salesData, setSalesData] = useState({});
  const [submittedSummary, setSubmittedSummary] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [outletSearch, setOutletSearch] = useState("");
  const [searchOutlets, setSearchOutlets] = useState([]);
  const [searchingOutlets, setSearchingOutlets] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [permissionDialog, setPermissionDialog] = useState({
    open: false,
    overdueOutlets: [],
    pendingPayload: null,
    submittedOutletIds: [],
    permissionNote: "",
  });
  const [invoiceDialog, setInvoiceDialog] = useState({
    open: false,
    outlet: null,
    rowIndex: 0,
    invoiceNumber: "",
    editSaleId: null,
    initialItemCount: "",
    initialPrice: "",
  });

  const API = "https://bawarchee.edunextg.co/api";
  const isCnfStaff = selectedStaff?.staff_type === "cnf";
  const emptySaleRow = { itemCount: "", invoiceNumber: "", price: "", deliveryBoyId: "", vehicleNo: "" };

  const outletKey = (id) => String(id);

  const getStaffCompanies = (staff) =>
    String(staff?.company_name || "")
      .split(",")
      .map((company) => company.trim())
      .filter(Boolean);

  const companyOptions = [
    ...new Set(
      staffOptions
        .filter((staff) => !selectedStaffType || (staff.staff_type || "distributor") === selectedStaffType)
        .flatMap(getStaffCompanies)
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filteredStaffOptions = staffOptions.filter((staff) => {
    const matchesType = !selectedStaffType || (staff.staff_type || "distributor") === selectedStaffType;
    const matchesCompany =
      !selectedCompanyName || getStaffCompanies(staff).includes(selectedCompanyName);
    return matchesType && matchesCompany;
  });

  const mergeOutletsById = (...lists) => {
    const map = new Map();
    lists.flat().forEach((o) => {
      if (o?.id != null) map.set(outletKey(o.id), o);
    });
    return Array.from(map.values());
  };

  const normalizeInvoice = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const hasDuplicateInvoiceNumbers = (invoiceNumbers, excludeSaleId = null) => {
    const normalizedInvoices = invoiceNumbers.map(normalizeInvoice).filter(Boolean);
    const hasDuplicateInEntry = normalizedInvoices.some(
      (invoiceNumber, index) => normalizedInvoices.indexOf(invoiceNumber) !== index
    );
    const hasDuplicateSubmitted = (submittedSummary?.sales || []).some(
      (sale) =>
        sale.id !== excludeSaleId &&
        normalizedInvoices.includes(normalizeInvoice(sale.invoiceNumber))
    );

    return hasDuplicateInEntry || hasDuplicateSubmitted;
  };

  const mapSaleFromApi = (s) => ({
    id: s.id != null ? Number(s.id) : null,
    outletId: s.outlet_id,
    shopName: s.outlet_name,
    outletErpId: s.outlet_erp_id || "",
    locationName: s.location_name || "",
    itemCount: s.item_count ?? s.itemCount ?? "",
    invoiceNumber: s.invoice_number,
    stickerNumber: s.sticker_number,
    paymentMode: s.payment_mode,
    amount: s.price,
    deliveryBoyName: s.delivery_boy_name || "",
    vehicleNo: s.vehicle_no || "",
    staffName: s.staff_name || selectedStaff?.name || "",
  });

  const activeSalesForAddSales = (sales) =>
    (sales || []).filter((s) => s.packaging_status !== "cancelled");

  const refreshSubmittedSales = async () => {
    if (!selectedStaff || !selectedDate) return;
    try {
      const salesRes = await fetch(
        `${API}/staff/${selectedStaff.id}/sales-by-date?date=${selectedDate}`
      );
      if (!salesRes.ok) return;
      const salesDataList = activeSalesForAddSales(await salesRes.json());
      if (salesDataList.length > 0) {
        setSubmittedSummary(
          buildSubmittedSummary(selectedStaff, selectedDate, salesDataList.map(mapSaleFromApi))
        );
      } else {
        setSubmittedSummary(null);
      }
    } catch (error) {
      console.error("Error refreshing submitted sales:", error);
    }
  };

  const matchesOutletSearch = (outlet, query) => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    return (
      String(outlet.outlet_name || "").toLowerCase().includes(q) ||
      String(outlet.outlet_erp_id || "").toLowerCase().includes(q) ||
      String(outlet.location_name || "").toLowerCase().includes(q)
    );
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const displayOutlets = useMemo(() => {
    const query = outletSearch.trim();
    if (query) {
      return mergeOutletsById(allOutlets, outlets, searchOutlets).filter((outlet) =>
        matchesOutletSearch(outlet, query)
      );
    }
    return mergeOutletsById(outlets, searchOutlets);
  }, [outlets, searchOutlets, outletSearch, salesData, allOutlets]); // eslint-disable-line react-hooks/exhaustive-deps

  const showEntryTable = Boolean(selectedStaff);

  const showNoDayOutletsHint =
    selectedStaff &&
    outlets.length === 0 &&
    !outletSearch.trim() &&
    searchOutlets.length === 0 &&
    displayOutlets.length === 0;

  const buildSubmittedSummary = (staff, date, sales) => ({
    date,
    dayName: new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
      new Date(`${date}T12:00:00`)
    ),
    staffName: staff.name,
    companyName: staff.company_name || "",
    sales,
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
        const initialSales = {};
        data.forEach((outlet) => {
          initialSales[outletKey(outlet.id)] = [
            { ...emptySaleRow },
          ];
        });
        setSalesData(initialSales);
      }
      if (salesRes.ok) {
        const salesDataList = activeSalesForAddSales(await salesRes.json());
        if (salesDataList.length > 0) {
          setSubmittedSummary(
            buildSubmittedSummary(selectedStaff, selectedDate, salesDataList.map(mapSaleFromApi))
          );
        } else {
          setSubmittedSummary(null);
        }
      }
    } catch (error) {
      console.error("Error refreshing sales data:", error);
    }
  };

  const dayName = selectedDate
    ? new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
      new Date(`${selectedDate}T12:00:00`)
    )
    : "";

  const fetchStaffOptions = async (query = "") => {
    try {
      const endpoint = query.trim()
        ? `${API}/staff/search?query=${encodeURIComponent(query)}`
        : `${API}/staff`;
      const response = await fetch(endpoint);
      if (!response.ok) return;
      const data = await response.json();
      setStaffOptions(data);
    } catch (error) {
      console.error("Error searching staff:", error);
    }
  };

  useEffect(() => {

    fetchStaffOptions();
  }, []);

  useEffect(() => {
    setSelectedCompanyName("");
    setSelectedStaff(null);
    setOutletSearch("");
  }, [selectedStaffType]);

  useEffect(() => {
    setSelectedStaff(null);
    setOutletSearch("");
  }, [selectedCompanyName]);

  useEffect(() => {
    if (!selectedStaff || !selectedDate) {
      setOutlets([]);
      setAllOutlets([]);
      setSearchOutlets([]);
      setSalesData({});
      setSubmittedSummary(null);
      return;
    }

    setOutlets([]);
    setAllOutlets([]);
    setSearchOutlets([]);
    setSalesData({});
    setSubmittedSummary(null);

    const fetchAllData = async () => {
      const staffId = selectedStaff.id;
      const date = selectedDate;

      try {
        const [outletsResponse, allCountersResponse, salesRes] = await Promise.all([
          fetch(`${API}/staff/${staffId}/outlets-by-date?date=${date}`),
          fetch(`${API}/staff/${staffId}/all-counters`),
          fetch(`${API}/staff/${staffId}/sales-by-date?date=${date}`),
        ]);

        if (outletsResponse.ok) {
          const data = await outletsResponse.json();
          setOutlets(data);

          const initialSales = {};
          data.forEach((outlet) => {
            initialSales[outletKey(outlet.id)] = [
              { ...emptySaleRow },
            ];
          });
          setSalesData(initialSales);
        }

        if (allCountersResponse.ok) {
          const allCounters = await allCountersResponse.json();
          setAllOutlets(allCounters);
        }

        if (salesRes.ok) {
          const salesDataList = activeSalesForAddSales(await salesRes.json());
          if (salesDataList.length > 0) {
            setSubmittedSummary(
              buildSubmittedSummary(selectedStaff, date, salesDataList.map(mapSaleFromApi))
            );
          } else {
            setSubmittedSummary(null);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStaff, selectedDate]);

  useEffect(() => {
    if (!selectedStaff || !outletSearch.trim()) {
      setSearchingOutlets(false);
      if (!outletSearch.trim()) {
        setSearchOutlets([]);
      }
      return undefined;
    }

    setSearchingOutlets(true);
    const timer = setTimeout(() => {
      const matched = (allOutlets || []).filter((outlet) =>
        matchesOutletSearch(outlet, outletSearch)
      );
      setSearchOutlets(matched);
      setSalesData((prev) => {
        const next = { ...prev };
        matched.forEach((outlet) => {
          const key = outletKey(outlet.id);
          if (!next[key]) {
            next[key] = [{ ...emptySaleRow }];
          }
        });
        return next;
      });
      setSearchingOutlets(false);
    }, 200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletSearch, selectedStaff, selectedDate, allOutlets]);

  const applySalesSuccess = async (submittedOutletIds = []) => {
    await refreshSubmittedSales();

    const outletIdSet = new Set((submittedOutletIds || []).map((id) => Number(id)));
    setOutlets((prev) => prev.filter((o) => !outletIdSet.has(Number(o.id))));
    setSearchOutlets((prev) => prev.filter((o) => !outletIdSet.has(Number(o.id))));

    setSalesData((prev) => {
      const next = { ...prev };
      outletIdSet.forEach((id) => delete next[outletKey(id)]);
      return next;
    });

    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const closePermissionDialog = () => {
    setPermissionDialog({
      open: false,
      overdueOutlets: [],
      pendingPayload: null,
      submittedOutletIds: [],
      permissionNote: "",
    });
  };

  const submitSalesPayload = async (
    payload,
    submittedOutletIds = [],
    { permissionGranted = false, permissionNote = "" } = {}
  ) => {
    setSubmitting(true);
    try {
      const response = await fetch(`${API}/staff/${selectedStaff.id}/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          permissionGranted,
          permissionNote,
        }),
      });

      if (response.ok) {
        closePermissionDialog();
        await applySalesSuccess(submittedOutletIds);
        return true;
      }

      const err = await response.json().catch(() => ({}));
      if (response.status === 409 && err.code === "OVERDUE_PERMISSION_REQUIRED") {
        setPermissionDialog({
          open: true,
          overdueOutlets: err.overdueOutlets || [],
          pendingPayload: payload,
          submittedOutletIds,
          permissionNote: "",
        });
        return false;
      }

      alert(err.error || "Failed to record sales.");
      return false;
    } catch (error) {
      console.error("Error submitting sales:", error);
      alert("Error submitting form.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleGrantPermissionAndSave = async () => {
    if (!permissionDialog.pendingPayload) return;
    const note = String(permissionDialog.permissionNote || "").trim();
    if (!note) {
      alert("Permission note is required.");
      return;
    }
    await submitSalesPayload(
      permissionDialog.pendingPayload,
      permissionDialog.submittedOutletIds,
      {
        permissionGranted: true,
        permissionNote: note,
      }
    );
  };

  const getPrevBillNoForOutlet = (outletId) => {
    const outletSales = (submittedSummary?.sales || []).filter(
      (sale) => Number(sale.outletId) === Number(outletId)
    );
    if (!outletSales.length) return "";
    return outletSales[outletSales.length - 1]?.invoiceNumber || "";
  };

  const openInvoiceDialog = (outlet, index) => {
    const row = (salesData[outletKey(outlet.id)] || [])[index];
    setInvoiceDialog({
      open: true,
      outlet,
      rowIndex: index,
      invoiceNumber: row?.invoiceNumber?.trim() || "",
      editSaleId: null,
      initialItemCount: "",
      initialPrice: "",
    });
  };

  const closeInvoiceDialog = () => {
    setInvoiceDialog({
      open: false,
      outlet: null,
      rowIndex: 0,
      invoiceNumber: "",
      editSaleId: null,
      initialItemCount: "",
      initialPrice: "",
    });
  };

  const openEditSaleDialog = (row) => {
    setInvoiceDialog({
      open: true,
      outlet: {
        id: row.outletId,
        outlet_name: row.shopName || "",
        outlet_erp_id: row.outletErpId || "",
        location_name: row.locationName || "",
      },
      rowIndex: 0,
      invoiceNumber: row.invoiceNumber || "",
      editSaleId: row.id,
      initialItemCount: row.itemCount ?? "",
      initialPrice: row.amount ?? "",
    });
  };

  const handleInvoiceSubmit = async ({ invoiceNumber, itemCount, price, addAnother }) => {
    const outlet = invoiceDialog.outlet;
    if (!outlet) return false;

    const editSaleId = invoiceDialog.editSaleId;

    if (hasDuplicateInvoiceNumbers([invoiceNumber], editSaleId)) {
      alert("Same invoice number already exists. Please use a unique invoice number.");
      return false;
    }

    // Edit existing submitted sale
    if (editSaleId) {
      setSavingEdit(true);
      try {
        const response = await fetch(`${API}/staff/sales/${editSaleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceNumber: invoiceNumber.trim(),
            itemCount: parseInt(itemCount, 10),
            price: parseFloat(price),
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setSubmittedSummary((prev) => ({
            ...prev,
            sales: prev.sales.map((s) => (s.id === editSaleId ? { ...s, ...data.sale } : s)),
          }));
          closeInvoiceDialog();
          return true;
        }
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to update sale.");
        return false;
      } catch (error) {
        console.error("Error updating sale:", error);
        alert("Error updating sale.");
        return false;
      } finally {
        setSavingEdit(false);
      }
    }

    const payload = {
      date: selectedDate,
      sales: [
        {
          outletId: parseInt(outlet.id, 10),
          itemCount: parseInt(itemCount, 10),
          invoiceNumber,
          price: parseFloat(price),
        },
      ],
    };

    const success = await submitSalesPayload(payload, [parseInt(outlet.id, 10)]);
    if (success) {
      if (!addAnother) {
        closeInvoiceDialog();
      }
      return true;
    }
    return false;
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
                    badgeContent={
                      displayOutlets.length > 0
                        ? `${displayOutlets.length} outlet${displayOutlets.length !== 1 ? "s" : ""}`
                        : `${outlets.length} today`
                    }
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
                  <Grid item xs={12} md={3}>
                    <MDBox mb={2}>
                      <MDInput
                        type="date"
                        label="Select Date"
                        fullWidth
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          setOutletSearch("");
                        }}
                        InputLabelProps={{ shrink: true }}
                      />
                    </MDBox>
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="sales-staff-type-label">Staff Type</InputLabel>
                      <Select
                        labelId="sales-staff-type-label"
                        value={selectedStaffType}
                        label="Staff Type"
                        onChange={(e) => setSelectedStaffType(e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                      >
                        <MenuItem value="">
                          <em>Select Staff Type</em>
                        </MenuItem>
                        <MenuItem value="distributor">Distributor</MenuItem>
                        <MenuItem value="cnf">CNF</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <FormControl fullWidth size="small" disabled={!selectedStaffType}>
                      <InputLabel id="sales-company-label">Company Name</InputLabel>
                      <Select
                        labelId="sales-company-label"
                        value={selectedCompanyName}
                        label="Company Name"
                        onChange={(e) => setSelectedCompanyName(e.target.value)}
                        sx={{ minHeight: 48, height: 48 }}
                      >
                        <MenuItem value="">
                          <em>Select Company</em>
                        </MenuItem>
                        {companyOptions.map((companyName) => (
                          <MenuItem key={companyName} value={companyName}>
                            {companyName}
                          </MenuItem>
                        ))}
                        {selectedStaffType && companyOptions.length === 0 && (
                          <MenuItem disabled>
                            No {selectedStaffType === "cnf" ? "CNF" : "Distributor"} company found
                          </MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={3}>
                    <MDBox mb={2}>
                      <Autocomplete
                        options={filteredStaffOptions}
                        value={selectedStaff}
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        onChange={(event, newValue) => {
                          setSelectedStaff(newValue);
                          setSubmittedSummary(null);
                          setOutletSearch("");
                        }}
                        onOpen={() => {
                          if (staffOptions.length === 0) {
                            fetchStaffOptions();
                          }
                        }}
                        onInputChange={(event, newInputValue) => fetchStaffOptions(newInputValue)}
                        disabled={!selectedStaffType || !selectedCompanyName}
                        renderInput={(params) => (
                          <MDInput {...params} label="Search Staff Name" fullWidth />
                        )}
                      />
                    </MDBox>
                  </Grid>
                  {/* <Grid item xs={12} md={4}>
                    <MDBox mb={2}>
                      <MDInput
                        type="text"
                        label="Search Outlet (any weekday)"
                        fullWidth
                        value={outletSearch}
                        onChange={(e) => setOutletSearch(e.target.value)}
                        disabled={!selectedStaff}
                        helperText={
                          selectedStaff
                            ? "Finds outlets from Mon–Sat routes; sale is saved for the selected date."
                            : ""
                        }
                      />
                    </MDBox>
                  </Grid> */}
                </Grid>

                {showEntryTable && (
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
                          {isCnfStaff ? "CNF" : dayName}
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
                        disabled={!selectedStaff}
                        helperText={
                          selectedStaff
                            ? "Search by outlet name, ERP ID, or area across all route days."
                            : ""
                        }
                      />
                    </MDBox>
                    {!isCnfStaff && (
                      <MDBox mb={2} maxWidth={400}>
                        <Autocomplete
                          options={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]}
                          onChange={(event, newValue) => {
                            if (newValue) {
                              const outletsToAdd = allOutlets.filter(
                                o => o.day === newValue && !outlets.some(existing => existing.id === o.id)
                              );

                              if (outletsToAdd.length > 0) {
                                setOutlets([...outlets, ...outletsToAdd]);
                                setSalesData((prev) => {
                                  const newData = { ...prev };
                                  outletsToAdd.forEach((o) => {
                                    newData[outletKey(o.id)] = [{ ...emptySaleRow }];
                                  });
                                  return newData;
                                });
                              }
                            }
                          }}
                          renderInput={(params) => (
                            <MDInput {...params} label="Load Outlets by Day" fullWidth />
                          )}
                          clearOnBlur
                          blurOnSelect
                        />
                      </MDBox>
                    )}

                    <TableContainer
                      sx={{
                        boxShadow: "none",
                        backgroundColor: "transparent",
                        borderTop: "1px solid #e5e7eb",
                        mt: 2,
                        overflowX: "auto",
                      }}
                    >
                      <Table
                        sx={{
                          tableLayout: "fixed",
                          width: "100%",
                          minWidth: 720,
                          "& .MuiTableCell-root": { overflow: "hidden" },
                        }}
                      >
                        <colgroup>
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "34%" }} />
                          <col style={{ width: "22%" }} />
                          <col style={{ width: "22%" }} />
                          <col style={{ width: "14%" }} />
                        </colgroup>
                        <TableHead sx={tableHeadRowSx}>
                          <TableRow>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "6%" }}>
                              Sr No
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "18%" }}>
                              Outlet
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "12%" }}>
                              Area
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "14%" }}>
                              Staff Name
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "16%" }}>
                              Action
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {searchingOutlets ? (
                            <TableRow>
                              <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }} />
                              <TableCell
                                colSpan={3}
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", py: 3 }}
                              >
                                <MDTypography variant="body2" color="text">
                                  Searching outlets...
                                </MDTypography>
                              </TableCell>
                              <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }} />
                            </TableRow>
                          ) : displayOutlets.length === 0 ? (
                            <TableRow>
                              <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }} />
                              <TableCell
                                colSpan={3}
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", py: 3 }}
                              >
                                <MDTypography variant="body2" color="text">
                                  {outletSearch.trim()
                                    ? "No outlets match this search on this staff's routes."
                                    : `No pending outlets for ${dayName}. Use Search Outlet above to find routes from other weekdays.`}
                                </MDTypography>
                              </TableCell>
                              <TableCell sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }} />
                            </TableRow>
                          ) : (
                            displayOutlets.map((outlet, outletIndex) => {
                              const rows = salesData[outletKey(outlet.id)] || [];
                              return rows.map((_, index) => {
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


                                    <TableCell
                                      align="center"
                                      sx={{
                                        ...tableBodySx,
                                        ...rowBorder,
                                      }}
                                    >
                                      {index === 0 ? outletIndex + 1 : `${outletIndex + 1}.${index + 1}`}
                                    </TableCell>
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
                                          {/* <MDAvatar
                                            bgColor="light"
                                            size="sm"
                                            sx={{ border: "1px solid #e5e7eb", color: "#374151", flexShrink: 0 }}
                                          >
                                            <MDTypography variant="caption" fontWeight="medium">
                                              {outlet.outlet_name.charAt(0)}
                                            </MDTypography>
                                          </MDAvatar> */}
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
                                    {index === 0 && (
                                      <TableCell
                                        rowSpan={rows.length}
                                        align="left"
                                        sx={{
                                          ...tableBodySx,
                                          borderBottom: "1px solid #e5e7eb",
                                          fontSize: "0.875rem",
                                          color: "#374151",
                                        }}
                                      >
                                        {outlet.location_name || "N/A"}
                                      </TableCell>
                                    )}
                                    {index === 0 && (
                                      <TableCell
                                        rowSpan={rows.length}
                                        align="left"
                                        sx={{
                                          ...tableBodySx,
                                          borderBottom: "1px solid #e5e7eb",
                                          fontSize: "0.875rem",
                                          color: "#374151",
                                        }}
                                      >
                                        {selectedStaff?.name || "N/A"}
                                      </TableCell>
                                    )}
                                    <TableCell align="center" sx={{ ...tableBodySx, ...rowBorder }}>
                                      <MDButton
                                        variant="gradient"
                                        color="info"
                                        size="small"
                                        onClick={() => openInvoiceDialog(outlet, index)}
                                        disabled={submitting}
                                        sx={{ minWidth: 72 }}
                                      >
                                        Sales
                                      </MDButton>
                                    </TableCell>
                                  </TableRow>
                                );
                              });
                            })

                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>

                  </MDBox>
                )}

                {showNoDayOutletsHint && (
                  <MDBox mt={2} textAlign="center">
                    <MDTypography variant="body2" color="text">
                      {isCnfStaff
                        ? "No CNF outlets for this staff. Search by outlet name in the box above."
                        : `No outlets on ${dayName} for this staff. Search by outlet name in the box above to record a sale from another weekday's route.`}
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
                        overflowX: "auto",
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
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "18%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "11%" }} />
                          <col style={{ width: "13%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "8%" }} />
                        </colgroup>
                        <TableHead sx={tableHeadRowSx}>
                          <TableRow>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "6%" }}>
                              Sr No
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "18%" }}>
                              Outlet
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "12%" }}>
                              Area
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "14%" }}>
                              Marketing Person
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "11%" }}>
                              No. of Item
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "13%" }}>
                              Invoice
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "12%" }}>
                              Sticker
                            </TableCell>
                            <TableCell align="right" sx={{ ...tableHeadSx, width: "12%" }}>
                              Amount
                            </TableCell>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "8%" }}>
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
                                align="left"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {row.locationName || "N/A"}
                              </TableCell>

                              <TableCell
                                align="left"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {row.staffName || "N/A"}
                              </TableCell>

                              <TableCell
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {row.itemCount || "N/A"}
                              </TableCell>

                              <TableCell
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {row.invoiceNumber}
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
                                {`₹${Number(row.amount).toFixed(2)}`}
                              </TableCell>

                              <TableCell align="center" sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb" }}>
                                {row.id ? (
                                  <MDBox display="flex" gap={0.5} justifyContent="center" alignItems="center" flexWrap="wrap">
                                    <FaRegEdit
                                      onClick={() => openEditSaleDialog(row)}
                                      style={{ cursor: "pointer" }}
                                      color="#E0E388"
                                      size={20}
                                    />
                                    <CiTrash
                                      onClick={() => handleDeleteSale(row.id)}
                                      style={{ cursor: "pointer" }}
                                      color="#FF0000"
                                      size={20}
                                    />
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

      <SalesInvoiceDialog
        open={invoiceDialog.open}
        onClose={closeInvoiceDialog}
        outlet={invoiceDialog.outlet}
        selectedDate={selectedDate}
        invoiceNumber={invoiceDialog.invoiceNumber}
        editMode={Boolean(invoiceDialog.editSaleId)}
        initialItemCount={invoiceDialog.initialItemCount}
        initialPrice={invoiceDialog.initialPrice}
        prevBillNo={
          invoiceDialog.outlet ? getPrevBillNoForOutlet(invoiceDialog.outlet.id) : ""
        }
        submitting={submitting || savingEdit}
        onSubmit={handleInvoiceSubmit}
      />

      <Dialog
        open={permissionDialog.open}
        onClose={submitting ? undefined : closePermissionDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Permission Required — Overdue Credit</DialogTitle>
        <DialogContent dividers>
          <MDTypography variant="body2" color="text" mb={2}>
            This ERP ID has credit overdue by more than 3 days. Permission note is required to add a
            new sale for the same ERP ID. This permission will be stored in the database.
          </MDTypography>

          {(permissionDialog.overdueOutlets || []).map((outlet) => (
            <MDBox
              key={`${outlet.outletId}-${outlet.outletErpId}`}
              mb={2}
              p={2}
              sx={{ backgroundColor: "#fff7f7", border: "1px solid #fecaca", borderRadius: "8px" }}
            >
              <MDTypography variant="button" fontWeight="bold" color="error">
                ERP: {outlet.outletErpId} — {outlet.outletName}
              </MDTypography>
              <MDTypography variant="caption" display="block" color="text" mb={1}>
                Max overdue: {outlet.maxOverdueDays} day(s)
              </MDTypography>
              {(outlet.credits || []).map((credit) => (
                <MDTypography key={credit.creditPaymentId} variant="caption" display="block" color="text">
                  Invoice {credit.invoiceNumber || "-"} | Balance ₹{Number(credit.balanceAmount || 0).toFixed(2)} | Due{" "}
                  {credit.dueDate || "-"} | Overdue {credit.overdueDays} day(s)
                  {credit.creditStaffName ? ` | Staff: ${credit.creditStaffName}` : ""}
                </MDTypography>
              ))}
            </MDBox>
          ))}

          <MDBox mt={1}>
            <MDInput
              label="Permission note *"
              fullWidth
              multiline
              rows={2}
              required
              value={permissionDialog.permissionNote}
              onChange={(e) =>
                setPermissionDialog((prev) => ({ ...prev, permissionNote: e.target.value }))
              }
            />
          </MDBox>
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" variant="outlined" onClick={closePermissionDialog} disabled={submitting}>
            Cancel
          </MDButton>
          <MDButton
            color="warning"
            variant="gradient"
            onClick={handleGrantPermissionAndSave}
            disabled={submitting || !String(permissionDialog.permissionNote || "").trim()}
          >
            {submitting ? "Saving..." : "Grant Permission & Save"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default AddSales;
