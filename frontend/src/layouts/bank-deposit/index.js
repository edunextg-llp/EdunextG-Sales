import { useEffect, useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Autocomplete from "@mui/material/Autocomplete";
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
import { printCashCountingPdf } from "utils/printCashCountingPdf";

const CASH_NOTE_DENOMINATIONS = [500, 200, 100, 50, 20, 10];
const CASH_COIN_DENOMINATIONS = [20, 10, 5, 2, 1];
const CASH_DENOMINATIONS = [
  ...CASH_NOTE_DENOMINATIONS.map((denomination) => ({ key: `note_${denomination}`, denomination })),
  ...CASH_COIN_DENOMINATIONS.map((denomination) => ({ key: `coin_${denomination}`, denomination })),
];

const BANK_ACCOUNTS = [
  {
    bankName: "STATE BANK OF INDIA",
    accountName: "BAWARCHEE FOOD PACKAGING PRIVATE LIMITED",
    accountNo: "45211335025",
    branchName: "DUM DUM (02054)",
    ifscCode: "SBIN0002054",
  },
  {
    bankName: "STATE BANK OF INDIA",
    accountName: "BAWARCHEE FOOD PACKAGING PRIVATE LIMITED",
    accountNo: "44956272903",
    branchName: "KESTOPUR (14534)",
    ifscCode: "SBIN0014534",
  },
];

const BANK_NAMES = [...new Set(BANK_ACCOUNTS.map((account) => account.bankName))];

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
  accountName: "",
  branchName: "",
  bankAccountNo: "",
  ifscCode: "",
  depositorName: "",
  storeName: "",
  depositMode: "cash",
  amount: "",
  chequeNo: "",
  chequeDate: "",
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
  const [storeOptions, setStoreOptions] = useState([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [editingDepositId, setEditingDepositId] = useState(null);
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

  const cashDepositTotal = useMemo(
    () =>
      deposits
        .filter((deposit) => deposit.deposit_mode === "cash")
        .reduce((total, deposit) => total + Number(deposit.amount || 0), 0),
    [deposits]
  );

  const chequeDepositTotal = useMemo(
    () =>
      deposits
        .filter((deposit) => deposit.deposit_mode === "cheque")
        .reduce((total, deposit) => total + Number(deposit.amount || 0), 0),
    [deposits]
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

  useEffect(() => {
    if (form.depositMode !== "cheque") {
      setStoreOptions([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setLoadingStores(true);
      try {
        const params = new URLSearchParams();
        if (form.storeName.trim()) {
          params.set("search", form.storeName.trim());
        }
        const response = await fetch(`${API}/staff/bank-deposits/stores?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          setStoreOptions(data);
        }
      } catch (error) {
        console.error("Error fetching delivered stores:", error);
      } finally {
        setLoadingStores(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [form.depositMode, form.storeName]);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "bankName"
        ? {
            accountName: "",
            branchName: "",
            bankAccountNo: "",
            ifscCode: "",
          }
        : {}),
      ...(field === "depositMode"
        ? {
            amount: value === "cash" ? "" : prev.amount,
            chequeNo: value === "cash" ? "" : prev.chequeNo,
            chequeDate: value === "cash" ? "" : prev.chequeDate,
            storeName: value === "cash" ? "" : prev.storeName,
            cashDetails: value === "cash" ? emptyCashDetails() : prev.cashDetails,
          }
        : {}),
    }));
  };

  const handleAccountChange = (accountNo) => {
    const account = BANK_ACCOUNTS.find((item) => item.accountNo === accountNo);
    setForm((prev) => ({
      ...prev,
      bankAccountNo: accountNo,
      accountName: account?.accountName || "",
      branchName: account?.branchName || "",
      ifscCode: account?.ifscCode || "",
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
    if (!form.depositorName.trim()) return "Depositor name is required.";
    if (form.depositMode === "cash" && cashAmount <= 0) {
      return "Please enter cash note or coin count.";
    }
    if (form.depositMode === "cheque") {
      if (!form.storeName.trim()) return "Store name is required.";
      if (!form.chequeNo.trim()) return "Cheque no is required.";
      if (!form.chequeDate) return "Cheque date is required.";
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
        accountName: form.accountName.trim(),
        branchName: form.branchName.trim(),
        bankAccountNo: form.bankAccountNo.trim(),
        ifscCode: form.ifscCode.trim(),
        depositorName: form.depositorName.trim(),
        storeName: form.depositMode === "cheque" ? form.storeName.trim() : "",
        depositMode: form.depositMode,
        amount: form.depositMode === "cash" ? cashAmount : parseFloat(form.amount),
        chequeNo: form.depositMode === "cheque" ? form.chequeNo.trim() : null,
        chequeDate: form.depositMode === "cheque" ? form.chequeDate : null,
        cashDetails: form.depositMode === "cash" ? form.cashDetails : null,
      };

      const response = await fetch(
        editingDepositId
          ? `${API}/staff/bank-deposits/${editingDepositId}`
          : `${API}/staff/bank-deposits`,
        {
        method: editingDepositId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        setForm(emptyForm());
        setEditingDepositId(null);
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

  const startEditDeposit = (deposit) => {
    let cashDetails = emptyCashDetails();
    if (deposit.cash_details) {
      try {
        cashDetails = { ...cashDetails, ...JSON.parse(deposit.cash_details) };
      } catch (error) {
        cashDetails = emptyCashDetails();
      }
    }

    setEditingDepositId(deposit.id);
    setForm({
      depositDate: deposit.deposit_date || getTodayLocalDate(),
      bankName: deposit.bank_name || "",
      accountName: deposit.account_name || "",
      branchName: deposit.branch_name || "",
      bankAccountNo: deposit.bank_account_no || "",
      ifscCode: deposit.ifsc_code || "",
      depositorName: deposit.depositor_name || "",
      storeName: deposit.store_name || "",
      depositMode: deposit.deposit_mode || "cash",
      amount: deposit.deposit_mode === "cheque" ? String(deposit.amount || "") : "",
      chequeNo: deposit.cheque_no || "",
      chequeDate: deposit.cheque_date || "",
      cashDetails,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditDeposit = () => {
    setEditingDepositId(null);
    setForm(emptyForm());
  };

  const deleteDeposit = async (depositId) => {
    if (!window.confirm("Delete this bank deposit?")) return;
    try {
      const response = await fetch(`${API}/staff/bank-deposits/${depositId}`, { method: "DELETE" });
      if (response.ok) {
        await fetchDeposits();
        if (editingDepositId === depositId) cancelEditDeposit();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to delete bank deposit.");
      }
    } catch (error) {
      console.error("Error deleting bank deposit:", error);
      alert("Error deleting bank deposit.");
    }
  };

  const cashBreakdownRows = (cashDetails = form.cashDetails) =>
    CASH_DENOMINATIONS.map((item) => {
      const count = parseInt(cashDetails[item.key], 10) || 0;
      return {
        type: item.key.startsWith("note_") ? "Note" : "Coin",
        denomination: item.denomination,
        count,
        total: item.denomination * count,
      };
    }).filter((row) => row.count > 0);

  const printCashDetails = (deposit = null) => {
    let cashDetails = form.cashDetails;
    if (deposit?.cash_details) {
      try {
        cashDetails = JSON.parse(deposit.cash_details);
      } catch (error) {
        cashDetails = emptyCashDetails();
      }
    }

    const rows = cashBreakdownRows(cashDetails);
    if (!rows.length) {
      alert("Please enter cash note or coin count.");
      return;
    }

    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const depositRefNo = deposit?.deposit_ref_no || "Generated after save";
    const printDate = deposit?.deposit_date || form.depositDate;
    const depositorName = deposit?.depositor_name || form.depositorName;
    const bankName = deposit?.bank_name || form.bankName;
    const bankAccountNo = deposit?.bank_account_no || form.bankAccountNo;
    const branchName = deposit?.branch_name || form.branchName;
    const ifscCode = deposit?.ifsc_code || form.ifscCode;

    printCashCountingPdf({
      depositRefNo,
      depositDate: formatDate(printDate),
      depositorName: depositorName || "N/A",
      bankName: bankName || "N/A",
      branchName: branchName || "N/A",
      bankAccountNo: bankAccountNo || "N/A",
      ifscCode: ifscCode || "N/A",
      rows,
      total,
    });
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="button" color="text" fontWeight="medium">
                  Total Cash Deposit
                </MDTypography>
                <MDTypography variant="h4" fontWeight="bold" color="success">
                  {formatMoney(cashDepositTotal)}
                </MDTypography>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="button" color="text" fontWeight="medium">
                  Total Cheque Deposit
                </MDTypography>
                <MDTypography variant="h4" fontWeight="bold" color="warning">
                  {formatMoney(chequeDepositTotal)}
                </MDTypography>
              </MDBox>
            </Card>
          </Grid>
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
                    <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value={form.bankName}
                        onChange={(e) => handleFormChange("bankName", e.target.value)}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="" disabled>Choose Bank</MenuItem>
                        {BANK_NAMES.map((bankName) => (
                          <MenuItem key={bankName} value={bankName}>
                            {bankName}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value={form.bankAccountNo}
                        onChange={(e) => handleAccountChange(e.target.value)}
                        disabled={!form.bankName}
                        sx={{ height: 44, backgroundColor: "#fff" }}
                      >
                        <MenuItem value="" disabled>Choose Account No</MenuItem>
                        {BANK_ACCOUNTS.filter((account) => account.bankName === form.bankName).map((account) => (
                          <MenuItem key={account.accountNo} value={account.accountNo}>
                            {account.accountNo}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <MDInput
                      label="Branch"
                      fullWidth
                      value={form.branchName}
                      InputProps={{ readOnly: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      label="Account Name"
                      fullWidth
                      value={form.accountName}
                      InputProps={{ readOnly: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      label="IFSC Code"
                      fullWidth
                      value={form.ifscCode}
                      InputProps={{ readOnly: true }}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <MDInput
                      label="Depositor Name"
                      fullWidth
                      value={form.depositorName}
                      onChange={(e) => handleFormChange("depositorName", e.target.value)}
                    />
                  </Grid>
                  {form.depositMode === "cheque" && (
                  <Grid item xs={12} md={4}>
                    <Autocomplete
                      freeSolo
                      options={storeOptions}
                      loading={loadingStores}
                      value={form.storeName}
                      inputValue={form.storeName}
                      getOptionLabel={(option) =>
                        typeof option === "string" ? option : option.store_name || ""
                      }
                      isOptionEqualToValue={(option, value) =>
                        option.store_name === (typeof value === "string" ? value : value?.store_name)
                      }
                      onInputChange={(event, value) => handleFormChange("storeName", value || "")}
                      onChange={(event, value) =>
                        handleFormChange(
                          "storeName",
                          typeof value === "string" ? value : value?.store_name || ""
                        )
                      }
                      renderOption={(props, option) => (
                        <li {...props} key={`${option.store_name}-${option.outlet_erp_id || ""}`}>
                          <MDBox>
                            <MDTypography variant="button" fontWeight="medium">
                              {option.store_name}
                            </MDTypography>
                            <MDTypography variant="caption" color="text" display="block">
                              {option.outlet_erp_id || "No ERP"} · Delivered: {option.delivered_count}
                            </MDTypography>
                          </MDBox>
                        </li>
                      )}
                      renderInput={(params) => (
                        <MDInput
                          {...params}
                          label="Store Name"
                          fullWidth
                        />
                      )}
                    />
                  </Grid>
                  )}
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
                          type="date"
                          label="Cheque Date"
                          fullWidth
                          value={form.chequeDate}
                          onChange={(e) => handleFormChange("chequeDate", e.target.value)}
                          InputLabelProps={{ shrink: true }}
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
                      {form.depositMode === "cash" && (
                        <MDButton color="success" variant="outlined" onClick={() => printCashDetails()} sx={{ mr: 1 }}>
                          <Icon sx={{ mr: 1 }}>picture_as_pdf</Icon>
                          Print Cash PDF
                        </MDButton>
                      )}
                      <MDButton color="info" variant="gradient" onClick={handleSubmit} disabled={saving}>
                        <Icon sx={{ mr: 1 }}>account_balance</Icon>
                        {saving ? "Saving..." : editingDepositId ? "Update Deposit" : "Save Deposit"}
                      </MDButton>
                      {editingDepositId && (
                        <MDButton color="dark" variant="outlined" onClick={cancelEditDeposit} disabled={saving} sx={{ ml: 1 }}>
                          Cancel
                        </MDButton>
                      )}
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
                  <Table sx={{ minWidth: 1180 }}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={tableHeadSx}>Sr No</TableCell>
                        <TableCell sx={tableHeadSx}>Deposit ID</TableCell>
                        <TableCell sx={tableHeadSx}>Date</TableCell>
                        <TableCell sx={tableHeadSx}>Bank</TableCell>
                        {/* <TableCell sx={tableHeadSx}>Account Name</TableCell> */}
                        <TableCell sx={tableHeadSx}>Branch</TableCell>
                        <TableCell sx={tableHeadSx}>Bank No</TableCell>
                        <TableCell sx={tableHeadSx}>IFSC</TableCell>
                        <TableCell sx={tableHeadSx}>Depositor</TableCell>
                        <TableCell sx={tableHeadSx}>Store</TableCell>
                        <TableCell sx={tableHeadSx}>Mode</TableCell>
                        <TableCell sx={tableHeadSx}>Cheque No</TableCell>
                        <TableCell sx={tableHeadSx}>Cheque Date</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Amount</TableCell>
                        <TableCell align="center" sx={tableHeadSx}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {deposits.length > 0 ? (
                        deposits.map((deposit, index) => (
                          <TableRow key={deposit.id}>
                            <TableCell sx={tableBodySx}>{index + 1}</TableCell>
                            <TableCell sx={{ ...tableBodySx, fontWeight: 700 }}>
                              {deposit.deposit_ref_no || "N/A"}
                            </TableCell>
                            <TableCell sx={tableBodySx}>{formatDate(deposit.deposit_date)}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.bank_name}</TableCell>
                            {/* <TableCell sx={tableBodySx}>{deposit.account_name || "N/A"}</TableCell> */}
                            <TableCell sx={tableBodySx}>{deposit.branch_name}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.bank_account_no}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.ifsc_code || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.depositor_name || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.store_name || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>
                              {deposit.deposit_mode === "cash" ? "Cash" : "Cheque"}
                            </TableCell>
                            <TableCell sx={tableBodySx}>{deposit.cheque_no || "N/A"}</TableCell>
                            <TableCell sx={tableBodySx}>{formatDate(deposit.cheque_date)}</TableCell>
                            <TableCell align="right" sx={{ ...tableBodySx, fontWeight: 600 }}>
                              {formatMoney(deposit.amount)}
                            </TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <MDBox display="flex" gap={1} justifyContent="center">
                                {deposit.deposit_mode === "cash" && (
                                  <MDButton color="success" variant="outlined" size="small" onClick={() => printCashDetails(deposit)}>
                                    Print
                                  </MDButton>
                                )}
                                <MDButton color="info" variant="outlined" size="small" onClick={() => startEditDeposit(deposit)}>
                                  Edit
                                </MDButton>
                                <MDButton color="error" variant="outlined" size="small" onClick={() => deleteDeposit(deposit.id)}>
                                  Delete
                                </MDButton>
                              </MDBox>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={14} align="center" sx={{ py: 3, borderBottom: 0 }}>
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
