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
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [outletSearch, setOutletSearch] = useState("");
  const [searchOutlets, setSearchOutlets] = useState([]);
  const [searchingOutlets, setSearchingOutlets] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [editForm, setEditForm] = useState({ itemCount: "", invoiceNumber: "", price: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  const API = "https://bawarchee.eunextg.co/api";
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

  const rowHasDraft = (row) =>
    Boolean(row?.itemCount?.toString().trim() || row?.invoiceNumber?.trim() || row?.price?.toString().trim());

  const normalizeInvoice = (value) => String(value || "").trim().toLowerCase();

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

  const outletHasDraft = (id) => {
    const rows = salesData[outletKey(id)] || [];
    return rows.some(rowHasDraft);
  };

  const mapSaleFromApi = (s) => ({
    id: s.id != null ? Number(s.id) : null,
    outletId: s.outlet_id,
    shopName: s.outlet_name,
    outletErpId: s.outlet_erp_id || "",
    itemCount: s.item_count ?? s.itemCount ?? "",
    invoiceNumber: s.invoice_number,
    stickerNumber: s.sticker_number,
    paymentMode: s.payment_mode,
    amount: s.price,
    deliveryBoyName: s.delivery_boy_name || "",
    vehicleNo: s.vehicle_no || "",
    staffName: s.staff_name || selectedStaff?.name || "",
  });

  const mapSaleFromSaveResponse = (s) => ({
    id: s.id != null ? Number(s.id) : s.saleId != null ? Number(s.saleId) : null,
    outletId: s.outletId ?? s.outlet_id,
    shopName: s.shopName || s.outlet_name || "Unknown Shop",
    outletErpId: s.outletErpId || s.outlet_erp_id || "",
    itemCount: s.itemCount ?? s.item_count ?? "",
    invoiceNumber: s.invoiceNumber || s.invoice_number || "",
    stickerNumber: s.stickerNumber || s.sticker_number || "",
    paymentMode: s.paymentMode || s.payment_mode || "",
    amount: s.amount ?? s.price ?? 0,
    deliveryBoyName: s.deliveryBoyName || s.delivery_boy_name || "",
    vehicleNo: s.vehicleNo || s.vehicle_no || "",
    staffName: s.staffName || selectedStaff?.name || "",
  });

  const mergeSubmittedSales = (existingSales, incomingSales) => {
    const merged = new Map();
    [...existingSales, ...incomingSales].forEach((sale) => {
      const key = sale.id
        ? `id:${sale.id}`
        : `invoice:${sale.outletId || ""}:${normalizeInvoice(sale.invoiceNumber)}`;
      merged.set(key, sale);
    });
    return Array.from(merged.values());
  };

  const addSubmittedSalesFromSave = (summary) => {
    const savedSales = (summary?.sales || []).map(mapSaleFromSaveResponse);
    if (!savedSales.length || !selectedStaff || !selectedDate) return;

    setSubmittedSummary((prev) => {
      const existingSales = prev?.date === selectedDate ? prev.sales || [] : [];
      return buildSubmittedSummary(
        selectedStaff,
        selectedDate,
        mergeSubmittedSales(existingSales, savedSales)
      );
    });
  };

  const displayOutlets = useMemo(() => {
    if (outletSearch.trim()) {
      return mergeOutletsById(outlets, searchOutlets);
    }
    return mergeOutletsById(
      outlets,
      searchOutlets.filter((o) => outletHasDraft(o.id))
    );
  }, [outlets, searchOutlets, outletSearch, salesData]);

  const hasSubmittableSales = useMemo(
    () =>
      Object.values(salesData).some((dataList) =>
        (dataList || []).some(
          (d) =>
            d.itemCount?.toString().trim() &&
            d.invoiceNumber?.trim() &&
            d.price?.toString().trim() &&
            !Number.isNaN(parseInt(d.itemCount, 10)) &&
            parseInt(d.itemCount, 10) > 0 &&
            !Number.isNaN(parseFloat(d.price))
        )
      ),
    [salesData]
  );

  const showEntryTable = Boolean(selectedStaff);

  const showNoDayOutletsHint =
    selectedStaff &&
    outlets.length === 0 &&
    !outletSearch.trim() &&
    searchOutlets.length === 0 &&
    displayOutlets.length === 0 &&
    !hasSubmittableSales;

  const submittedForSelectedDate =
    submittedSummary && submittedSummary.date === selectedDate ? submittedSummary : null;

  // Always show all sales for the selected date — outlet search only filters the entry table above.
  const submittedSales = submittedForSelectedDate?.sales || [];

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
        const salesDataList = await salesRes.json();
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
      setSearchOutlets([]);
      setSalesData({});
      setSubmittedSummary(null);
      return;
    }

    setOutlets([]);
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

          if (allCountersResponse.ok) {
            const allCounters = await allCountersResponse.json();
            setAllOutlets(allCounters);
          }

          const initialSales = {};
          data.forEach((outlet) => {
            initialSales[outletKey(outlet.id)] = [
              { ...emptySaleRow },
            ];
          });
          setSalesData(initialSales);
        }

        if (salesRes.ok) {
          const salesDataList = await salesRes.json();
          if (salesDataList.length > 0) {
            setSubmittedSummary(
              buildSubmittedSummary(selectedStaff, date, salesDataList.map(mapSaleFromApi))
            );
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchAllData();
  }, [selectedStaff, selectedDate]);

  useEffect(() => {
    if (!selectedStaff || !selectedDate || !outletSearch.trim()) {
      setSearchingOutlets(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSearchingOutlets(true);
      try {
        const params = new URLSearchParams({
          date: selectedDate,
          search: outletSearch.trim(),
        });
        const response = await fetch(
          `${API}/staff/${selectedStaff.id}/outlets-by-date?${params.toString()}`
        );
        if (response.ok) {
          const data = await response.json();
          setSearchOutlets((prev) => mergeOutletsById(prev, data));
          setSalesData((prev) => {
            const next = { ...prev };
            data.forEach((outlet) => {
              const key = outletKey(outlet.id);
              if (!next[key]) {
                next[key] = [
                  { ...emptySaleRow },
                ];
              }
            });
            return next;
          });
        }
      } catch (error) {
        console.error("Error searching outlets:", error);
      } finally {
        setSearchingOutlets(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [outletSearch, selectedStaff, selectedDate]);

  const handleSalesChange = (outletId, index, field, value) => {
    const key = outletKey(outletId);
    setSalesData((prev) => {
      const existing = prev[key] || [
        { ...emptySaleRow },
      ];
      const outletSales = [...existing];
      outletSales[index] = { ...outletSales[index], [field]: value };
      return {
        ...prev,
        [key]: outletSales,
      };
    });
  };

  const handleAddRow = (outletId) => {
    const key = outletKey(outletId);
    setSalesData((prev) => ({
      ...prev,
      [key]: [
        ...(prev[key] || [{ ...emptySaleRow }]),
        { ...emptySaleRow },
      ],
    }));
  };

  const handleRemoveRow = (outletId, index) => {
    const key = outletKey(outletId);
    setSalesData((prev) => {
      const outletSales = [...(prev[key] || [])];
      if (outletSales.length <= 1) {
        return {
          ...prev,
          [key]: [{ ...emptySaleRow }],
        };
      }
      outletSales.splice(index, 1);
      return {
        ...prev,
        [key]: outletSales,
      };
    });
  };

  const handleSaveRow = async (outletId) => {
    const key = outletKey(outletId);
    const dataList = salesData[key] || [];
    const validRows = dataList.filter(
      (d) =>
        d.itemCount?.toString().trim() &&
        d.invoiceNumber?.trim() &&
        d.price?.toString().trim() &&
        !Number.isNaN(parseInt(d.itemCount, 10)) &&
        parseInt(d.itemCount, 10) > 0 &&
        !Number.isNaN(parseFloat(d.price))
    );

    if (validRows.length === 0) {
      alert("Please enter at least one valid no. of item, invoice number, and price.");
      return;
    }

    const hasInvalidFormat = validRows.some(
      (d) => Number.isNaN(parseInt(d.itemCount, 10)) || Number.isNaN(parseFloat(d.price))
    );
    if (hasInvalidFormat) {
      alert("Please enter valid numeric values for no. of item and price.");
      return;
    }

    const hasIncomplete = dataList.some(
      (d) =>
        rowHasDraft(d) &&
        (!d.itemCount?.toString().trim() ||
          !d.invoiceNumber?.trim() ||
          !d.price?.toString().trim() ||
          Number.isNaN(parseInt(d.itemCount, 10)) ||
          parseInt(d.itemCount, 10) <= 0 ||
          Number.isNaN(parseFloat(d.price)))
    );
    if (hasIncomplete) {
      alert("Please complete partially filled rows or remove them.");
      return;
    }
    if (hasDuplicateInvoiceNumbers(validRows.map((d) => d.invoiceNumber))) {
      alert("Same invoice number already exists. Please use a unique invoice number.");
      return;
    }

    const payload = {
      date: selectedDate,
      sales: validRows.map(d => ({
        outletId: parseInt(outletId, 10),
        itemCount: parseInt(d.itemCount, 10),
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
        const data = await response.json().catch(() => ({}));
        addSubmittedSalesFromSave(data.summary);

        // Remove the submitted outlet
        setOutlets((prev) => prev.filter((o) => outletKey(o.id) !== key));
        setSearchOutlets((prev) => prev.filter((o) => outletKey(o.id) !== key));

        setSalesData((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
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

    Object.entries(salesData).forEach(([key, dataList]) => {
      const filledRows = dataList.filter(rowHasDraft);
      if (filledRows.length > 0) {
        const incomplete = filledRows.some(
          (d) =>
            !d.invoiceNumber?.trim() ||
            !d.itemCount?.toString().trim() ||
            !d.price?.toString().trim() ||
            Number.isNaN(parseInt(d.itemCount, 10)) ||
            parseInt(d.itemCount, 10) <= 0 ||
            Number.isNaN(parseFloat(d.price))
        );
        if (incomplete) {
          hasError = true;
        } else {
          submittedOutletIds.add(parseInt(key, 10));
          filledRows.forEach((d) => {
            allSales.push({
              outletId: parseInt(key, 10),
              itemCount: parseInt(d.itemCount, 10),
              invoiceNumber: d.invoiceNumber.trim(),
              price: parseFloat(d.price)
            });
          });
        }
      }
    });

    if (!selectedStaff || !selectedDate || allSales.length === 0) {
      alert("Please select staff, date, and enter at least one valid no. of item, invoice, and price.");
      return;
    }
    if (hasError) {
      alert("Some rows are partially filled or invalid. Please provide no. of item, invoice number, and numeric price, or clear/remove the row.");
      return;
    }
    if (hasDuplicateInvoiceNumbers(allSales.map((sale) => sale.invoiceNumber))) {
      alert("Same invoice number already exists. Please use unique invoice numbers.");
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
        const data = await response.json().catch(() => ({}));
        addSubmittedSalesFromSave(data.summary);

        // Remove the submitted outlets
        setOutlets((prev) => prev.filter((o) => !submittedOutletIds.has(o.id)));


        setSalesData((prev) => {
          const next = { ...prev };
          submittedOutletIds.forEach((id) => delete next[outletKey(id)]);
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
      itemCount: String(row.itemCount ?? ""),
      invoiceNumber: row.invoiceNumber || "",
      price: String(row.amount ?? ""),
    });
  };

  const cancelEditSale = () => {
    setEditingSaleId(null);
    setEditForm({ itemCount: "", invoiceNumber: "", price: "" });
  };

  const saveEditSale = async (saleId) => {
    if (!editForm.itemCount.toString().trim() || !editForm.invoiceNumber.trim() || !editForm.price.trim()) {
      alert("No. of item, invoice number, and price are required.");
      return;
    }
    const itemCount = parseInt(editForm.itemCount, 10);
    const price = parseFloat(editForm.price);
    if (Number.isNaN(itemCount) || itemCount <= 0) {
      alert("Please enter a valid no. of item.");
      return;
    }
    if (Number.isNaN(price)) {
      alert("Please enter a valid price.");
      return;
    }
    if (hasDuplicateInvoiceNumbers([editForm.invoiceNumber], saleId)) {
      alert("Same invoice number already exists. Please use a unique invoice number.");
      return;
    }

    setSavingEdit(true);
    try {
      const response = await fetch(`${API}/staff/sales/${saleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: editForm.invoiceNumber.trim(),
          itemCount,
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
                                  outletsToAdd.forEach(o => {
                                    newData[o.id] = [{ ...emptySaleRow }];
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
                          <col style={{ width: "6%" }} />
                          <col style={{ width: "22%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "16%" }} />
                        </colgroup>
                        <TableHead sx={tableHeadRowSx}>
                          <TableRow>
                            <TableCell align="center" sx={{ ...tableHeadSx, width: "6%" }}>
                              Sr No
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "22%" }}>
                              Outlet
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "16%" }}>
                              Staff Name
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "12%" }}>
                              No. of Item
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "16%" }}>
                              Invoice No
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "12%" }}>
                              Price
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
                                colSpan={5}
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
                                colSpan={5}
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
                              const alreadySubmitted = Boolean(
                                outlet.already_submitted_today === 1 ||
                                outlet.already_submitted_today === true
                              );
                              const rows = salesData[outletKey(outlet.id)] || [];
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
                                        {selectedStaff?.name || "N/A"}
                                      </TableCell>
                                    )}
                                    <TableCell align="left" sx={{ ...tableBodySx, ...rowBorder }}>
                                      <MDInput
                                        type="number"
                                        placeholder="Items"
                                        size="small"
                                        fullWidth
                                        inputProps={{ min: 1 }}
                                        sx={{ "& .MuiInputBase-root": { height: "36px" } }}
                                        value={row.itemCount || ""}
                                        onChange={(e) =>
                                          handleSalesChange(outlet.id, index, "itemCount", e.target.value)
                                        }
                                      />
                                    </TableCell>
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
                                              !rows.some(
                                                (r) =>
                                                  r.itemCount?.toString().trim() &&
                                                  r.invoiceNumber?.trim() &&
                                                  r.price?.trim()
                                              )
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
                        disabled={submitting || !hasSubmittableSales}
                      >
                        {submitting ? "Submitting..." : "Submit"}
                      </MDButton>
                    </MDBox>
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
                          <col style={{ width: "22%" }} />
                          <col style={{ width: "16%" }} />
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
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "22%" }}>
                              Outlet
                            </TableCell>
                            <TableCell align="left" sx={{ ...tableHeadSx, width: "16%" }}>
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
                                {row.staffName || "N/A"}
                              </TableCell>

                              <TableCell
                                align="center"
                                sx={{ ...tableBodySx, borderBottom: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#374151" }}
                              >
                                {editingSaleId === row.id ? (
                                  <MDInput
                                    type="number"
                                    size="small"
                                    value={editForm.itemCount}
                                    onChange={(e) =>
                                      setEditForm((f) => ({ ...f, itemCount: e.target.value }))
                                    }
                                    inputProps={{ min: 1, style: { textAlign: "center" } }}
                                    sx={{ width: "100%" }}
                                  />
                                ) : (
                                  row.itemCount || "N/A"
                                )}
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
                                    sx={{ width: "100%" }}
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
                                    sx={{ width: "100%" }}
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
