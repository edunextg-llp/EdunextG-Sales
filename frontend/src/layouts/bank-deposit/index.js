import { useEffect, useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import {
  FormControl,
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

const CASH_NOTE_DENOMINATIONS = [500, 200, 100, 50, 20, 10];
const CASH_COIN_DENOMINATIONS = [20, 10, 5, 2, 1];
const CASH_DENOMINATIONS = [
  ...CASH_NOTE_DENOMINATIONS.map((denomination) => ({ key: `note_${denomination}`, denomination })),
  ...CASH_COIN_DENOMINATIONS.map((denomination) => ({ key: `coin_${denomination}`, denomination })),
];

const emptyCashDetails = () =>
  CASH_DENOMINATIONS.reduce((details, item) => {
    details[item.key] = "";
    return details;
  }, {});

const getTodayLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const emptyForm = () => ({
  depositDate: getTodayLocalDate(),
  bankName: "",
  branchName: "",
  bankAccountNo: "",
  storeName: "",
  depositMode: "cash",
  amount: "",
  chequeNo: "",
  cashDetails: emptyCashDetails(),
});

const tableHeadSx = {
  color: "#6b7280",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "none",
  borderBottom: "1px solid #e5e7eb",
  px: 2,
  py: 1.5,
  whiteSpace: "nowrap",
};

const tableBodySx = {
  px: 2,
  py: 1.5,
  verticalAlign: "middle",
};

const formatMoney = (value) => `Rs. ${Number(value || 0).toFixed(2)}`;

const formatDate = (value) => {
  if (!value) return "N/A";
  const parts = String(value).split("T")[0].split("-");
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : value;
};

function BankDeposit() {
  const [form, setForm] = useState(emptyForm());
  const [deposits, setDeposits] = useState([]);
  const [saving, setSaving] = useState(false);
  const API = "https://bawarchee.edunextg.co/api";

  const cashAmount = useMemo(
    () =>
      CASH_DENOMINATIONS.reduce(
        (total, item) => total + item.denomination * (parseInt(form.cashDetails[item.key], 10) || 0),
        0
      ),
    [form.cashDetails]
  );

  const fetchDeposits = async () => {
    try {
      const response = await fetch(`${API}/staff/bank-deposits`);
      if (response.ok) {
        const data = await response.json();
        setDeposits(data);
      }
    } catch (error) {
      console.error("Error fetching bank deposits:", error);
    }
  };

  useEffect(() => {
    fetchDeposits();
  }, []);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "depositMode"
        ? {
            amount: value === "cash" ? "" : prev.amount,
            chequeNo: value === "cash" ? "" : prev.chequeNo,
            cashDetails: value === "cash" ? emptyCashDetails() : prev.cashDetails,
          }
        : {}),
    }));
  };

  const handleCashChange = (key, value) => {
    const count = value === "" ? "" : Math.max(0, parseInt(value, 10) || 0);
    setForm((prev) => ({
      ...prev,
      cashDetails: {
        ...prev.cashDetails,
        [key]: count,
      },
    }));
  };

  const validateForm = () => {
    if (!form.depositDate) return "Deposit date is required.";
    if (!form.bankName.trim()) return "Bank name is required.";
    if (!form.branchName.trim()) return "Branch name is required.";
    if (!form.bankAccountNo.trim()) return "Bank account no is required.";
    if (!form.storeName.trim()) return "Store name is required.";
    if (form.depositMode === "cash" && cashAmount <= 0) {
      return "Please enter cash note or coin count.";
    }
    if (form.depositMode === "cheque") {
      if (!form.chequeNo.trim()) return "Cheque no is required.";
      if (!form.amount || Number.isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0) {
        return "Cheque amount is required.";
      }
    }
    return "";
  };

  const handleSubmit = async () => {
    const error = validateForm();
    if (error) {
      alert(error);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        depositDate: form.depositDate,
        bankName: form.bankName.trim(),
        branchName: form.branchName.trim(),
        bankAccountNo: form.bankAccountNo.trim(),
        storeName: form.storeName.trim(),
        depositMode: form.depositMode,
        amount: form.depositMode === "cash" ? cashAmount : parseFloat(form.amount),
        chequeNo: form.depositMode === "cheque" ? form.chequeNo.trim() : null,
        cashDetails: form.depositMode === "cash" ? form.cashDetails : null,
      };

      const response = await fetch(`${API}/staff/bank-deposits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setForm(emptyForm());
        await fetchDeposits();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to save bank deposit.");
      }
    } catch (error) {
      console.error("Error saving bank deposit:", error);
      alert("Error saving bank deposit.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h5" fontWeight="medium" color="dark">
                  Bank Deposit
                </MDTypography>
              </MDBox>
              <MDBox px={3} pb={3}>
                <Grid container spacing={2.5}>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      type="date"
                      label="Deposit Date"
                      fullWidth
                      value={form.depositDate}
                      onChange={(e) => handleFormChange("depositDate", e.target.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="Bank Name"
                      fullWidth
                      value={form.bankName}
                      onChange={(e) => handleFormChange("bankName", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="Branch"
                      fullWidth
                      value={form.branchName}
                      onChange={(e) => handleFormChange("branchName", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="Bank No"
                      fullWidth
                      value={form.bankAccountNo}
                      onChange={(e) => handleFormChange("bankAccountNo", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      label="Store Name"
                      fullWidth
                      value={form.storeName}
                      onChange={(e) => handleFormChange("storeName", e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={form.depositMode}
                        onChange={(e) => handleFormChange("depositMode", e.target.value)}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="cash">Cash</MenuItem>
                        <MenuItem value="cheque">Cheque</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDBox
                      height="44px"
                      display="flex"
                      alignItems="center"
                      px={2}
                      sx={{ border: "1px solid #d2d6da", borderRadius: 1, backgroundColor: "#f8fafc" }}
                    >
                      <MDTypography variant="button" fontWeight="medium" color="dark">
                        Total: {formatMoney(form.depositMode === "cash" ? cashAmount : form.amount)}
                      </MDTypography>
                    </MDBox>
                  </Grid>

                  {form.depositMode === "cash" && (
                    <Grid item xs={12}>
                      <MDTypography variant="button" fontWeight="medium" color="dark" display="block" mb={1}>
                        Notes
                      </MDTypography>
                      <MDBox
                        display="grid"
                        sx={{
                          gridTemplateColumns: {
                            xs: "repeat(2, minmax(0, 1fr))",
                            sm: "repeat(3, minmax(0, 1fr))",
                            md: "repeat(6, minmax(0, 1fr))",
                          },
                        }}
                        gap={1.5}
                      >
                        {CASH_NOTE_DENOMINATIONS.map((denomination) => (
                          <MDInput
                            key={`note-${denomination}`}
                            type="number"
                            label={`Rs. ${denomination} Note`}
                            value={form.cashDetails[`note_${denomination}`] || ""}
                            onChange={(e) => handleCashChange(`note_${denomination}`, e.target.value)}
                            inputProps={{ min: 0, step: 1 }}
                            fullWidth
                          />
                        ))}
                      </MDBox>
                      <MDTypography variant="button" fontWeight="medium" color="dark" display="block" mt={2} mb={1}>
                        Coins
                      </MDTypography>
                      <MDBox
                        display="grid"
                        sx={{
                          gridTemplateColumns: {
                            xs: "repeat(2, minmax(0, 1fr))",
                            sm: "repeat(3, minmax(0, 1fr))",
                            md: "repeat(5, minmax(0, 1fr))",
                          },
                        }}
                        gap={1.5}
                      >
                        {CASH_COIN_DENOMINATIONS.map((denomination) => (
                          <MDInput
                            key={`coin-${denomination}`}
                            type="number"
                            label={`Rs. ${denomination} Coin`}
                            value={form.cashDetails[`coin_${denomination}`] || ""}
                            onChange={(e) => handleCashChange(`coin_${denomination}`, e.target.value)}
                            inputProps={{ min: 0, step: 1 }}
                            fullWidth
                          />
                        ))}
                      </MDBox>
                    </Grid>
                  )}

                  {form.depositMode === "cheque" && (
                    <>
                      <Grid item xs={12} md={4}>
                        <MDInput
                          label="Cheque No"
                          fullWidth
                          value={form.chequeNo}
                          onChange={(e) => handleFormChange("chequeNo", e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <MDInput
                          type="number"
                          label="Cheque Amount"
                          fullWidth
                          value={form.amount}
                          onChange={(e) => handleFormChange("amount", e.target.value)}
                          inputProps={{ min: 0, step: "0.01" }}
                        />
                      </Grid>
                    </>
                  )}

                  <Grid item xs={12}>
                    <MDBox display="flex" justifyContent="flex-end">
                      <MDButton color="info" variant="gradient" onClick={handleSubmit} disabled={saving}>
                        <Icon sx={{ mr: 1 }}>account_balance</Icon>
                        {saving ? "Saving..." : "Save Deposit"}
                      </MDButton>
                    </MDBox>
                  </Grid>
                </Grid>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2}>
                <MDTypography variant="h6" fontWeight="medium">
                  Recent Bank Deposits
                </MDTypography>
              </MDBox>
              <MDBox px={3} pb={3}>
                <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
                  <Table sx={{ minWidth: 920 }}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={tableHeadSx}>Sr No</TableCell>
                        <TableCell sx={tableHeadSx}>Date</TableCell>
                        <TableCell sx={tableHeadSx}>Bank</TableCell>
                        <TableCell sx={tableHeadSx}>Branch</TableCell>
                        <TableCell sx={tableHeadSx}>Bank No</TableCell>
                        <TableCell sx={tableHeadSx}>Store</TableCell>
                        <TableCell sx={tableHeadSx}>Mode</TableCell>
                        <TableCell sx={tableHeadSx}>Cheque No</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {deposits.length > 0 ? (
                        deposits.map((deposit, index) => (
                          <TableRow key={deposit.id}>
                            <TableCell sx={tableBodySx}>{index + 1}</TableCell>
                            <TableCell sx={tableBodySx}>{formatDate(deposit.deposit_date)}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.bank_name}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.branch_name}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.bank_account_no}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.store_name}</TableCell>
                            <TableCell sx={tableBodySx}>
                              {deposit.deposit_mode === "cash" ? "Cash" : "Cheque"}
                            </TableCell>
                            <TableCell sx={tableBodySx}>{deposit.cheque_no || "N/A"}</TableCell>
                            <TableCell align="right" sx={{ ...tableBodySx, fontWeight: 600 }}>
                              {formatMoney(deposit.amount)}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={9} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No bank deposits found.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
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

export default BankDeposit;
