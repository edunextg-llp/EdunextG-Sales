import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Autocomplete, Card, FormControl, Grid, Icon, MenuItem, Select,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDTypography from "components/MDTypography";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { printPurchaseRequisitionPdf } from "utils/printPurchaseRequisitionPdf";
import { useAuth } from "context/AuthContext";

const API = "https://bawarchee.edunextg.co/api";
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "CNF"];

const formatDateLabel = (value) => {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const toDateInputValue = (value) => {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
};

function PurchaseRequisition() {
  const { user } = useAuth();
  const isStaff = user?.role === "staff";
  const [sellerType, setSellerType] = useState("");
  const [companies, setCompanies] = useState([]);
  const [staff, setStaff] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [day, setDay] = useState("");
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [stock, setStock] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [priceType, setPriceType] = useState("retail");
  const [items, setItems] = useState([]);
  const [result, setResult] = useState("");
  const [savedRequisitions, setSavedRequisitions] = useState([]);
  const [historyCompanyId, setHistoryCompanyId] = useState("");
  const [historyStaffId, setHistoryStaffId] = useState("");
  const [historyDateFilter, setHistoryDateFilter] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isStaff) {
      const assignedCompanies = Array.isArray(user?.companies) ? user.companies : [];
      setCompanies(assignedCompanies);
      setStaff([{
        id: user.staffId,
        name: user.username,
        staff_type: user.staffType,
        company_ids: assignedCompanies.map((company) => company.id).join(","),
      }]);
      setSellerType(user.staffType || "distributor");
      setStaffId(String(user.staffId || ""));
      if (assignedCompanies[0]) {
        setCompanyId(String(assignedCompanies[0].id));
        fetch(`${API}/staff/current-stock?companyName=${encodeURIComponent(assignedCompanies[0].name)}`)
          .then((response) => response.json())
          .then((data) => setStock((data.items || []).filter((item) => Number(item.total_current_stock_in_pcs) > 0)))
          .catch(() => setStock([]));
      }
      return;
    }
    Promise.all([
      fetch(`${API}/staff/companies`, { headers: auth() }).then((r) => r.json()),
      fetch(`${API}/staff`, { headers: auth() }).then((r) => r.json()),
    ]).then(([companyRows, staffRows]) => {
      setCompanies(Array.isArray(companyRows) ? companyRows : []);
      setStaff(Array.isArray(staffRows) ? staffRows : []);
    });
  }, [isStaff, user]);

  const filteredStaff = staff.filter((row) => {
    const ids = String(row.company_ids || row.company_id || "").split(",").map((id) => id.trim());
    return (row.staff_type || "distributor") === sellerType && ids.includes(String(companyId));
  });

  const historyStaff = staff.filter((row) => {
    if (!historyCompanyId) return true;
    const companyIds = String(row.company_ids || row.company_id || "").split(",").map((id) => id.trim());
    return companyIds.includes(String(historyCompanyId));
  });

  const availableStock = useMemo(
    () => stock.filter((item) => Number(item.total_current_stock_in_pcs) > 0),
    [stock]
  );

  const fetchHistory = useCallback(async (selectedStaffId, selectedCompanyId, dateFilter = "") => {
    if (!selectedStaffId && isStaff) {
      setSavedRequisitions([]);
      return;
    }

    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (selectedStaffId) params.set("staffId", String(selectedStaffId));
      if (selectedCompanyId) params.set("companyId", String(selectedCompanyId));
      if (dateFilter) params.set("date", dateFilter);
      const response = await fetch(`${API}/staff/purchase-requisitions?${params.toString()}`, {
        headers: auth(),
      });
      const data = await response.json();
      setSavedRequisitions(response.ok && Array.isArray(data.requisitions) ? data.requisitions : []);
    } catch {
      setSavedRequisitions([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [isStaff]);

  useEffect(() => {
    fetchHistory(isStaff ? staffId : historyStaffId, historyCompanyId, historyDateFilter);
  }, [staffId, historyCompanyId, historyStaffId, historyDateFilter, fetchHistory, isStaff]);

  const groupedHistory = useMemo(() => {
    const groups = new Map();
    savedRequisitions.forEach((row) => {
      const key = toDateInputValue(row.created_at) || "unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [savedRequisitions]);

  const chooseCompany = async (value) => {
    setCompanyId(value);
    if (!isStaff) setStaffId("");
    setOutletId("");
    setItems([]);
    setSavedRequisitions([]);
    const selected = companies.find((row) => String(row.id) === String(value));
    if (!selected) return setStock([]);
    const response = await fetch(`${API}/staff/current-stock?companyName=${encodeURIComponent(selected.name)}`);
    const data = await response.json();
    setStock((data.items || []).filter((item) => Number(item.total_current_stock_in_pcs) > 0));
  };

  const loadOutlets = async (selectedStaffId, selectedDay) => {
    if (!selectedStaffId || !selectedDay) return setOutlets([]);
    const response = await fetch(`${API}/staff/${selectedStaffId}/outlets-by-day?day=${encodeURIComponent(selectedDay)}`);
    setOutlets(response.ok ? await response.json() : []);
  };

  const addItem = () => {
    if (!selectedItem) return alert("Select an available item.");
    const qty = Number(quantity);
    if (!qty || qty > Number(selectedItem.total_current_stock_in_pcs)) {
      return alert(`Quantity cannot exceed current stock (${selectedItem.total_current_stock_in_pcs}).`);
    }
    const rate = priceType === "wholesale" ? selectedItem.wholesale_price : selectedItem.retail_price;
    setItems((prev) => [...prev.filter((row) => row.productErpId !== selectedItem.product_erp_id), {
      productErpId: selectedItem.product_erp_id,
      productName: selectedItem.product_name,
      variantName: selectedItem.variant_name,
      hsnCode: selectedItem.hsn_code,
      mrp: selectedItem.mrp,
      gstPercent: selectedItem.gst_percent || 5,
      available: selectedItem.total_current_stock_in_pcs,
      quantity: qty,
      priceType,
      rate: Number(rate || 0),
    }]);
    setSelectedItem(null);
    setQuantity("");
  };

  const save = async () => {
    if (!sellerType || !companyId || !staffId || !outletId || !items.length) {
      return alert("Choose seller type, company, staff, outlet, and items.");
    }

    setSaving(true);
    try {
      const response = await fetch(`${API}/staff/purchase-requisitions`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerType,
          companyId,
          staffId,
          outletId,
          outletDay: day,
          items: items.map((item) => ({
            productErpId: item.productErpId,
            quantity: item.quantity,
            priceType: item.priceType,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Unable to create requisition.");
        return;
      }

      const requisition = data.requisition;
      setResult(requisition.requisition_number);
      setItems([]);
      setSelectedItem(null);
      setQuantity("");
      await fetchHistory(isStaff ? staffId : historyStaffId, historyCompanyId, historyDateFilter);
      printPurchaseRequisitionPdf(requisition);
    } finally {
      setSaving(false);
    }
  };

  const reviewRequisition = async (requisitionId, status) => {
    const action = status === "approved" ? "approve" : "cancel";
    if (!window.confirm(`Are you sure you want to ${action} this requisition?`)) return;
    const response = await fetch(`${API}/staff/purchase-requisitions/${requisitionId}/status`, {
      method: "PUT",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!response.ok) return alert(data.error || `Unable to ${action} requisition.`);
    await fetchHistory(isStaff ? staffId : historyStaffId, historyCompanyId, historyDateFilter);
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        {isStaff && <Card>
          <MDBox p={3}>
            <MDTypography variant="h5" fontWeight="bold">Purchase Requisition</MDTypography>
            <Grid container spacing={2} mt={0.5}>
              {[
                ["Seller Type", sellerType, (v) => { setSellerType(v); setCompanyId(""); }, [
                  { id: "distributor", name: "Distributor" }, { id: "cnf", name: "CNF" },
                ]],
                ["Company", companyId, chooseCompany, companies.filter((c) => !sellerType || c.type === sellerType)],
                ["Staff", staffId, (v) => { setStaffId(v); setOutletId(""); loadOutlets(v, day); }, filteredStaff.map((s) => ({ id: s.id, name: s.name }))],
                ["Day", day, (v) => { setDay(v); setOutletId(""); loadOutlets(staffId, v); }, days.map((name) => ({ id: name, name }))],
                ["Outlet", outletId, setOutletId, outlets.map((o) => ({ id: o.id, name: o.outlet_name }))],
              ].map(([label, value, change, options]) => (
                <Grid item xs={12} md={2.4} key={label}>
                  <MDTypography variant="caption" fontWeight="bold">{label}</MDTypography>
                  <FormControl fullWidth>
                    <Select
                      value={value}
                      displayEmpty
                      disabled={isStaff && ["Seller Type", "Staff"].includes(label)}
                      onChange={(e) => change(e.target.value)}
                      sx={{ height: 48 }}
                    >
                      <MenuItem value="">Select {label}</MenuItem>
                      {options.map((o) => <MenuItem key={o.id} value={String(o.id)}>{o.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              ))}
            </Grid>

            <Grid container spacing={2} mt={1} alignItems="flex-end">
              <Grid item xs={12} md={5}>
                <MDTypography variant="caption" fontWeight="bold">Available Item</MDTypography>
                <Autocomplete
                  options={availableStock}
                  value={selectedItem}
                  onChange={(_, value) => setSelectedItem(value)}
                  getOptionLabel={(o) => `${o.product_name} | ${o.variant_name || ""} | Stock ${o.total_current_stock_in_pcs}`}
                  renderInput={(params) => <MDInput {...params} placeholder="Search available stock item" />}
                />
              </Grid>
              <Grid item xs={6} md={2}>
                <MDInput label="Quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Grid>
              <Grid item xs={6} md={2}>
                <FormControl fullWidth>
                  <Select value={priceType} onChange={(e) => setPriceType(e.target.value)} sx={{ height: 44 }}>
                    <MenuItem value="retail">Retail Price</MenuItem>
                    <MenuItem value="wholesale">Wholesale Price</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={2}>
                <MDButton color="info" variant="gradient" onClick={addItem}>Add Item</MDButton>
              </Grid>
            </Grid>

            <TableContainer sx={{ mt: 3 }}>
              <Table>
                <TableHead sx={{ display: "table-header-group" }}>
                  <TableRow>
                    {["Sr", "Item Name", "Variant", "HSN", "MRP", "Available", "Qty", "Price Type", "Rate", "Amount", "Action"].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={item.productErpId}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell>{item.variantName}</TableCell>
                      <TableCell>{item.hsnCode}</TableCell>
                      <TableCell>{item.mrp}</TableCell>
                      <TableCell>{item.available}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.priceType}</TableCell>
                      <TableCell>{item.rate}</TableCell>
                      <TableCell>{(item.quantity * item.rate).toFixed(2)}</TableCell>
                      <TableCell>
                        <MDButton color="error" variant="text" onClick={() => setItems((p) => p.filter((_, x) => x !== i))}>
                          Delete
                        </MDButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <MDBox display="flex" justifyContent="space-between" mt={3}>
              <MDTypography color="success" fontWeight="bold">
                {result ? `Requisition Number: ${result}` : ""}
              </MDTypography>
              <MDButton color="info" variant="gradient" onClick={save} disabled={saving}>
                {saving ? "Submitting..." : "Create Requisition"}
              </MDButton>
            </MDBox>
          </MDBox>
        </Card>}

        {(staffId || !isStaff) && (
          <Card sx={{ mt: 3 }}>
            <MDBox p={3}>
              <MDBox display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
                <MDBox>
                  <MDTypography variant="h6" fontWeight="bold">Submitted Requisitions</MDTypography>
                  <MDTypography variant="caption" color="text">
                    {isStaff
                      ? "Your submitted requisitions, grouped by date."
                      : staffId
                        ? "Showing requisitions for selected staff, grouped by date."
                        : "Admin review queue for all staff requisitions."}
                  </MDTypography>
                </MDBox>
                {!isStaff && <MDBox minWidth={200}>
                  <MDTypography variant="caption" fontWeight="bold">Company</MDTypography>
                  <FormControl fullWidth>
                    <Select
                      value={historyCompanyId}
                      displayEmpty
                      onChange={(e) => {
                        setHistoryCompanyId(e.target.value);
                        setHistoryStaffId("");
                      }}
                      sx={{ height: 44 }}
                    >
                      <MenuItem value="">All Companies</MenuItem>
                      {companies.map((company) => (
                        <MenuItem key={company.id} value={String(company.id)}>{company.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </MDBox>}
                {!isStaff && <MDBox minWidth={200}>
                  <MDTypography variant="caption" fontWeight="bold">Staff</MDTypography>
                  <FormControl fullWidth>
                    <Select value={historyStaffId} displayEmpty onChange={(e) => setHistoryStaffId(e.target.value)} sx={{ height: 44 }}>
                      <MenuItem value="">All Staff</MenuItem>
                      {historyStaff.map((member) => (
                        <MenuItem key={member.id} value={String(member.id)}>{member.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </MDBox>}
                <MDBox minWidth={220}>
                  <MDInput
                    type="date"
                    label="Filter by Date"
                    fullWidth
                    value={historyDateFilter}
                    onChange={(e) => setHistoryDateFilter(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </MDBox>
              </MDBox>

              {loadingHistory ? (
                <MDTypography variant="body2" color="text">Loading requisitions...</MDTypography>
              ) : groupedHistory.length === 0 ? (
                <MDTypography variant="body2" color="text">
                  No requisitions found{historyDateFilter ? " on the selected date" : ""}.
                </MDTypography>
              ) : (
                groupedHistory.map(([dateKey, rows]) => (
                  <MDBox key={dateKey} mb={3}>
                    <MDTypography variant="button" fontWeight="bold" color="dark" mb={1} display="block">
                      {formatDateLabel(dateKey)}
                    </MDTypography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead sx={{ display: "table-header-group" }}>
                          <TableRow>
                            {[
                              "Requisition No", "Time", ...(!isStaff ? ["Staff", "Company"] : []),
                              "Outlet", "Items", "Total Qty", "Amount", "Status", "PDF",
                              ...(!isStaff ? ["Admin Action"] : []),
                            ].map((h) => (
                              <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((row) => (
                            <TableRow key={row.id || row.requisition_number}>
                              <TableCell>{row.requisition_number}</TableCell>
                              <TableCell>{formatDateTime(row.created_at)}</TableCell>
                              {!isStaff && <TableCell>{row.staff_name}</TableCell>}
                              {!isStaff && <TableCell>{row.company_name}</TableCell>}
                              <TableCell>{row.outlet_name}</TableCell>
                              <TableCell>{row.item_count}</TableCell>
                              <TableCell>{Number(row.total_quantity || 0).toFixed(2)}</TableCell>
                              <TableCell>{Number(row.total_amount || 0).toFixed(2)}</TableCell>
                              <TableCell>{row.status || "open"}</TableCell>
                              <TableCell>
                                <MDButton
                                  color="info"
                                  variant="text"
                                  size="small"
                                  onClick={() => printPurchaseRequisitionPdf(row)}
                                >
                                  <Icon fontSize="small">picture_as_pdf</Icon>
                                </MDButton>
                              </TableCell>
                              {!isStaff && (
                                <TableCell>
                                  {["open", "pending"].includes(row.status || "pending") ? (
                                    <MDBox display="flex" gap={1}>
                                      <MDButton
                                        color="success"
                                        variant="gradient"
                                        size="small"
                                        onClick={() => reviewRequisition(row.id, "approved")}
                                      >
                                        Approve
                                      </MDButton>
                                      <MDButton
                                        color="error"
                                        variant="outlined"
                                        size="small"
                                        onClick={() => reviewRequisition(row.id, "cancelled")}
                                      >
                                        Cancel
                                      </MDButton>
                                    </MDBox>
                                  ) : (
                                    <MDTypography variant="caption" color="text">Reviewed</MDTypography>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </MDBox>
                ))
              )}
            </MDBox>
          </Card>
        )}
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default PurchaseRequisition;
