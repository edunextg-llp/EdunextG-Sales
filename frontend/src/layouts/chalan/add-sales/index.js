import { useEffect, useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
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
  Paper,
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { printChalanPdf } from "utils/printChalanPdf";
import { FaRegEdit } from "react-icons/fa";
import { CiTrash } from "react-icons/ci";

const emptyItem = { itemName: "", qty: "", mrp: "" };

const selectFieldSx = { minHeight: 48, height: 48 };

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
  py: 1.5,
  verticalAlign: "middle",
  borderBottom: "1px solid #e5e7eb",
};

const tableHeadRowSx = {
  display: "table-header-group",
  backgroundColor: "#f9fafb",
  "& .MuiTableCell-root": { backgroundColor: "#f9fafb" },
};

const inputFieldSx = {
  "& .MuiInputBase-root": { height: "36px" },
};

const tableContainerSx = {
  boxShadow: "none",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  overflow: "hidden",
};

function formatSrNo(index) {
  return String(index + 1).padStart(2, "0");
}

function getRowTotalLabel(item) {
  const qtyText = item.qty?.toString().trim();
  const mrpText = item.mrp?.toString().trim();
  if (!qtyText || !mrpText) {
    return "—";
  }

  const qty = Number(qtyText);
  const mrp = Number(mrpText);
  if (Number.isNaN(qty) || Number.isNaN(mrp)) {
    return "—";
  }

  return `${qty} x ${mrp.toFixed(2)} = ₹${(qty * mrp).toFixed(2)}`;
}

function formatDisplayDate(value) {
  if (!value) return "—";
  const dateText = String(value).split("T")[0];
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateText;
  }
  return date.toLocaleDateString();
}

function getStaffCompanies(staff) {
  return String(staff?.company_name || "")
    .split(",")
    .map((company) => company.trim())
    .filter(Boolean);
}

function ChalanAddSales() {
  const API = "https://bawarche.edunextg.co/api";

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [assigneeType, setAssigneeType] = useState("");
  const [staffOptions, setStaffOptions] = useState([]);
  const [deliveryBoyOptions, setDeliveryBoyOptions] = useState([]);
  const [selectedCompanyName, setSelectedCompanyName] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState("");
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingCode, setEditingCode] = useState("");
  const [chalanList, setChalanList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  const fetchChalanList = async (date = selectedDate) => {
    if (!date) {
      setChalanList([]);
      return;
    }

    setLoadingList(true);
    try {
      const response = await fetch(`${API}/chalan/sales?date=${date}`);
      if (response.ok) {
        setChalanList(await response.json());
      } else {
        setChalanList([]);
      }
    } catch (error) {
      console.error("Error loading chalan list:", error);
      setChalanList([]);
    } finally {
      setLoadingList(false);
    }
  };

  const resetEntryForm = () => {
    setItems([{ ...emptyItem }]);
    setSelectedCompanyName("");
    setSelectedStaffId("");
    setSelectedDeliveryBoyId("");
    setAssigneeType("");
    setEditingId(null);
    setEditingCode("");
    setErrorMessage("");
  };

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [staffRes, deliveryBoyRes] = await Promise.all([
          fetch(`${API}/staff`),
          fetch(`${API}/delivery-boy`),
        ]);

        if (staffRes.ok) {
          setStaffOptions(await staffRes.json());
        }
        if (deliveryBoyRes.ok) {
          setDeliveryBoyOptions(await deliveryBoyRes.json());
        }
      } catch (error) {
        console.error("Error loading chalan form options:", error);
      }
    };

    fetchOptions();
  }, [API]);

  useEffect(() => {
    fetchChalanList(selectedDate);
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      assigneeType !== "company_staff" ||
      !selectedStaffId ||
      selectedCompanyName ||
      staffOptions.length === 0
    ) {
      return;
    }

    const staff = staffOptions.find(
      (option) => Number(option.id) === Number(selectedStaffId)
    );
    const companies = getStaffCompanies(staff);
    if (companies.length > 0) {
      setSelectedCompanyName(companies[0]);
    }
  }, [assigneeType, selectedStaffId, selectedCompanyName, staffOptions]);

  const totalAmount = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = Number(item.qty || 0);
        const mrp = Number(item.mrp || 0);
        if (Number.isNaN(qty) || Number.isNaN(mrp)) {
          return sum;
        }
        return sum + qty * mrp;
      }, 0),
    [items]
  );

  const companyOptions = useMemo(
    () =>
      [...new Set(staffOptions.flatMap(getStaffCompanies))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [staffOptions]
  );

  const filteredStaffOptions = useMemo(
    () =>
      staffOptions.filter((staff) => {
        if (!selectedCompanyName) return false;
        return getStaffCompanies(staff).includes(selectedCompanyName);
      }),
    [staffOptions, selectedCompanyName]
  );

  const handleAssigneeTypeChange = (value) => {
    setAssigneeType(value);
    setSelectedCompanyName("");
    setSelectedStaffId("");
    setSelectedDeliveryBoyId("");
    setErrorMessage("");
  };

  const handleCompanyChange = (value) => {
    setSelectedCompanyName(value);
    setSelectedStaffId("");
    setErrorMessage("");
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
    setErrorMessage("");
  };

  const handleAddItem = () => {
    setItems((prev) => [...prev, { ...emptyItem }]);
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, itemIndex) => itemIndex !== index)));
  };

  const validateForm = () => {
    if (!selectedDate) {
      return "Please choose a date.";
    }
    if (!assigneeType) {
      return "Please choose company staff or delivery boy.";
    }
    if (assigneeType === "company_staff" && !selectedCompanyName) {
      return "Please choose a company.";
    }
    if (assigneeType === "company_staff" && !selectedStaffId) {
      return "Please choose a company staff name.";
    }
    if (assigneeType === "delivery_boy" && !selectedDeliveryBoyId) {
      return "Please choose a delivery boy name.";
    }

    const hasValidItem = items.some(
      (item) =>
        item.itemName.trim() &&
        item.qty.toString().trim() &&
        item.mrp.toString().trim() &&
        Number(item.qty) > 0 &&
        Number(item.mrp) >= 0
    );

    if (!hasValidItem) {
      return "Please add at least one item with name, qty, and MRP.";
    }

    const hasIncompleteItem = items.some((item) => {
      const hasAnyValue =
        item.itemName.trim() || item.qty.toString().trim() || item.mrp.toString().trim();
      const isComplete =
        item.itemName.trim() &&
        item.qty.toString().trim() &&
        item.mrp.toString().trim() &&
        Number(item.qty) > 0 &&
        Number(item.mrp) >= 0;
      return hasAnyValue && !isComplete;
    });

    if (hasIncompleteItem) {
      return "Please complete all item rows or remove empty rows.";
    }

    return "";
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const payload = {
      date: selectedDate,
      assigneeType,
      staffId: assigneeType === "company_staff" ? Number(selectedStaffId) : null,
      deliveryBoyId: assigneeType === "delivery_boy" ? Number(selectedDeliveryBoyId) : null,
      items: items
        .filter(
          (item) =>
            item.itemName.trim() &&
            item.qty.toString().trim() &&
            item.mrp.toString().trim()
        )
        .map((item) => ({
          itemName: item.itemName.trim(),
          qty: Number(item.qty),
          mrp: Number(item.mrp),
        })),
    };

    setSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        editingId ? `${API}/chalan/sales/${editingId}` : `${API}/chalan/sales`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Failed to ${editingId ? "update" : "create"} chalan.`);
      }

      resetEntryForm();
      await fetchChalanList(selectedDate);
    } catch (error) {
      setErrorMessage(error.message || `Failed to ${editingId ? "update" : "create"} chalan.`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async (id) => {
    try {
      const response = await fetch(`${API}/chalan/sales/${id}`);
      const sale = await response.json();
      if (!response.ok) {
        throw new Error(sale.error || "Failed to load chalan for PDF.");
      }
      printChalanPdf(sale);
    } catch (error) {
      alert(error.message || "Failed to download PDF.");
    }
  };

  const handleEdit = async (row) => {
    try {
      const response = await fetch(`${API}/chalan/sales/${row.id}`);
      const sale = await response.json();
      if (!response.ok) {
        throw new Error(sale.error || "Failed to load chalan.");
      }

      const saleDate = String(sale.saleDate).split("T")[0];
      setSelectedDate(saleDate);
      setAssigneeType(sale.assigneeType);

      if (sale.assigneeType === "company_staff") {
        const staff = staffOptions.find((option) => Number(option.id) === Number(sale.staffId));
        const staffCompanies = getStaffCompanies(staff);
        const saleCompany = String(sale.companyName || sale.company_name || "")
          .split(",")
          .map((name) => name.trim())
          .find(Boolean);
        setSelectedCompanyName(
          saleCompany && staffCompanies.includes(saleCompany)
            ? saleCompany
            : staffCompanies[0] || saleCompany || ""
        );
        setSelectedStaffId(sale.staffId || "");
        setSelectedDeliveryBoyId("");
      } else {
        setSelectedCompanyName("");
        setSelectedStaffId("");
        setSelectedDeliveryBoyId(sale.deliveryBoyId || "");
      }

      setItems(
        sale.items.length > 0
          ? sale.items.map((item) => ({
            itemName: item.itemName,
            qty: String(item.qty),
            mrp: String(item.mrp),
          }))
          : [{ ...emptyItem }]
      );
      setEditingId(sale.id);
      setEditingCode(sale.chalanCode);
      setErrorMessage("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      alert(error.message || "Failed to load chalan for edit.");
    }
  };

  const handleDelete = async (row) => {
    const confirmed = window.confirm(`Delete chalan ${row.chalanCode}?`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API}/chalan/sales/${row.id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete chalan.");
      }

      if (editingId === row.id) {
        resetEntryForm();
      }
      await fetchChalanList(selectedDate);
    } catch (error) {
      alert(error.message || "Failed to delete chalan.");
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h5" fontWeight="medium" mb={2}>
                  Chalan Add Sales
                </MDTypography>
                {editingCode && (
                  <MDTypography variant="button" color="info" display="block" mb={2}>
                    Editing: {editingCode}
                  </MDTypography>
                )}

                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      type="date"
                      label="Choose Date"
                      value={selectedDate}
                      onChange={(event) => {
                        setSelectedDate(event.target.value);
                        setErrorMessage("");
                      }}
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>

                  <Grid item xs={12} md={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="assignee-type-label">Assign To</InputLabel>
                      <Select
                        labelId="assignee-type-label"
                        label="Assign To"
                        value={assigneeType}
                        onChange={(event) => handleAssigneeTypeChange(event.target.value)}
                        sx={selectFieldSx}
                      >
                        <MenuItem value="company_staff">Company Staff</MenuItem>
                        <MenuItem value="delivery_boy">Delivery Boy</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  {assigneeType === "company_staff" && (
                    <>
                      <Grid item xs={12} md={4}>
                        <FormControl fullWidth size="small">
                          <InputLabel id="company-name-label">Company Name</InputLabel>
                          <Select
                            labelId="company-name-label"
                            label="Company Name"
                            value={selectedCompanyName}
                            onChange={(event) => handleCompanyChange(event.target.value)}
                            sx={selectFieldSx}
                          >
                            <MenuItem value="">
                              <em>Select Company</em>
                            </MenuItem>
                            {companyOptions.map((companyName) => (
                              <MenuItem key={companyName} value={companyName}>
                                {companyName}
                              </MenuItem>
                            ))}
                            {companyOptions.length === 0 && (
                              <MenuItem disabled>No company found</MenuItem>
                            )}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <FormControl fullWidth size="small" disabled={!selectedCompanyName}>
                          <InputLabel id="staff-name-label">Company Staff Name</InputLabel>
                          <Select
                            labelId="staff-name-label"
                            label="Company Staff Name"
                            value={selectedStaffId}
                            onChange={(event) => {
                              setSelectedStaffId(event.target.value);
                              setErrorMessage("");
                            }}
                            sx={selectFieldSx}
                          >
                            <MenuItem value="">
                              <em>Select Staff</em>
                            </MenuItem>
                            {filteredStaffOptions.map((staff) => (
                              <MenuItem key={staff.id} value={staff.id}>
                                {staff.name}
                              </MenuItem>
                            ))}
                            {selectedCompanyName && filteredStaffOptions.length === 0 && (
                              <MenuItem disabled>No staff found for this company</MenuItem>
                            )}
                          </Select>
                        </FormControl>
                      </Grid>
                    </>
                  )}

                  {assigneeType === "delivery_boy" && (
                    <Grid item xs={12} md={4}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="delivery-boy-label">Delivery Boy Name</InputLabel>
                        <Select
                          labelId="delivery-boy-label"
                          label="Delivery Boy Name"
                          value={selectedDeliveryBoyId}
                          onChange={(event) => {
                            setSelectedDeliveryBoyId(event.target.value);
                            setErrorMessage("");
                          }}
                          sx={selectFieldSx}
                        >
                          {deliveryBoyOptions.map((boy) => (
                            <MenuItem key={boy.id} value={boy.id}>
                              {boy.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  )}
                </Grid>

                <MDBox mt={3}>
                  <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <MDTypography variant="h6">Items</MDTypography>
                    <MDButton variant="outlined" color="info" size="small" onClick={handleAddItem}>
                      <Icon fontSize="small" sx={{ mr: 0.5 }}>
                        add
                      </Icon>
                      Add Item
                    </MDButton>
                  </MDBox>

                  <TableContainer component={Paper} sx={tableContainerSx}>
                    <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
                      <TableHead sx={tableHeadRowSx}>
                        <TableRow>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "8%" }}>
                            SR
                          </TableCell>
                          <TableCell sx={{ ...tableHeadSx, width: "32%" }}>Item Name</TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "12%" }}>
                            Qty
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "12%" }}>
                            MRP
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "24%" }}>
                            Total
                          </TableCell>
                          <TableCell align="center" sx={{ ...tableHeadSx, width: "12%" }}>
                            Action
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {items.map((item, index) => (
                          <TableRow key={`item-${index}`}>
                            <TableCell align="center" sx={tableBodySx}>
                              {formatSrNo(index)}
                            </TableCell>
                            <TableCell sx={tableBodySx}>
                              <MDInput
                                value={item.itemName}
                                onChange={(event) =>
                                  handleItemChange(index, "itemName", event.target.value)
                                }
                                placeholder="Item name"
                                size="small"
                                fullWidth
                                sx={inputFieldSx}
                              />
                            </TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <MDInput
                                type="number"
                                value={item.qty}
                                onChange={(event) =>
                                  handleItemChange(index, "qty", event.target.value)
                                }
                                placeholder="Qty"
                                size="small"
                                fullWidth
                                sx={inputFieldSx}
                                inputProps={{ min: 0, step: "any" }}
                              />
                            </TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <MDInput
                                type="number"
                                value={item.mrp}
                                onChange={(event) =>
                                  handleItemChange(index, "mrp", event.target.value)
                                }
                                placeholder="MRP"
                                size="small"
                                fullWidth
                                sx={inputFieldSx}
                                inputProps={{ min: 0, step: "0.01" }}
                              />
                            </TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <MDTypography variant="caption" color="text" fontWeight="medium">
                                {getRowTotalLabel(item)}
                              </MDTypography>
                            </TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <MDButton
                                variant="text"
                                color="error"
                                size="small"
                                onClick={() => handleRemoveItem(index)}
                                disabled={items.length === 1}
                              >
                                <Icon fontSize="small">delete</Icon>
                              </MDButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <MDBox mt={2} display="flex" justifyContent="flex-end">
                    <MDTypography variant="button" fontWeight="medium">
                      Total Amount: ₹{totalAmount.toFixed(2)}
                    </MDTypography>
                  </MDBox>
                </MDBox>

                {errorMessage && (
                  <MDTypography variant="button" color="error" display="block" mt={2}>
                    {errorMessage}
                  </MDTypography>
                )}

                <MDBox mt={3} display="flex" gap={1}>
                  <MDButton
                    variant="gradient"
                    color="info"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? "Saving..." : editingId ? "Update" : "Submit"}
                  </MDButton>
                  {editingId && (
                    <MDButton variant="outlined" color="secondary" onClick={resetEntryForm}>
                      Cancel Edit
                    </MDButton>
                  )}
                </MDBox>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" fontWeight="medium" mb={2}>
                  Chalan List
                </MDTypography>

                <TableContainer component={Paper} sx={tableContainerSx}>
                  <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
                    <TableHead sx={tableHeadRowSx}>
                      <TableRow>
                        <TableCell align="center" sx={{ ...tableHeadSx, width: "8%" }}>
                          SR
                        </TableCell>
                        <TableCell sx={{ ...tableHeadSx, width: "16%" }}>Code</TableCell>
                        <TableCell sx={{ ...tableHeadSx, width: "12%" }}>Date</TableCell>
                        <TableCell sx={{ ...tableHeadSx, width: "22%" }}>Staff / Delivery Name</TableCell>
                        <TableCell sx={{ ...tableHeadSx, width: "18%" }}>Company</TableCell>
                        <TableCell align="center" sx={{ ...tableHeadSx, width: "10%" }}>
                          PDF
                        </TableCell>
                        <TableCell align="center" sx={{ ...tableHeadSx, width: "13%" }}>
                          Edit
                        </TableCell>
                        <TableCell align="center" sx={{ ...tableHeadSx, width: "13%" }}>
                          Delete
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {loadingList ? (
                        <TableRow>
                          <TableCell colSpan={8} align="center" sx={tableBodySx}>
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : chalanList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} align="center" sx={tableBodySx}>
                            No chalan found for selected date.
                          </TableCell>
                        </TableRow>
                      ) : (
                        chalanList.map((row, index) => (
                          <TableRow key={row.id}>
                            <TableCell align="center" sx={tableBodySx}>
                              {formatSrNo(index)}
                            </TableCell>
                            <TableCell sx={tableBodySx}>{row.chalanCode}</TableCell>
                            <TableCell sx={tableBodySx}>{formatDisplayDate(row.saleDate)}</TableCell>
                            <TableCell sx={tableBodySx}>{row.assigneeName || "—"}</TableCell>
                            <TableCell sx={tableBodySx}>{row.companyName || row.company_name || "N/A"}</TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <Icon
                                fontSize="small"
                                sx={{ cursor: "pointer", color: "#344767" }}
                                onClick={() => handleDownloadPdf(row.id)}
                              >
                                download
                              </Icon>
                            </TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <FaRegEdit
                                onClick={() => handleEdit(row)}
                                style={{ cursor: "pointer" }}
                                color="#E0E388"
                                size={20}
                              />
                            </TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <CiTrash
                                onClick={() => handleDelete(row)}
                                style={{ cursor: "pointer" }}
                                color="#FF0000"
                                size={20}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default ChalanAddSales;
