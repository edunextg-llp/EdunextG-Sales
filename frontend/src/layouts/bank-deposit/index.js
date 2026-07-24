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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { printCashCountingPdf } from "utils/printCashCountingPdf";
import { printChequeDepositPdf } from "utils/printChequeDepositPdf";
import { printUpiDepositPdf } from "utils/printUpiDepositPdf";
import {
  ROWS_PER_PAGE,
  TablePaginationFooter,
  paginatedTableContainerSx,
  paginatedTableHeadSx,
} from "utils/tablePagination";
import { FaRegEdit } from "react-icons/fa";
import { IoPrintOutline } from "react-icons/io5";
import { CiTrash } from "react-icons/ci";
import { FaRegEye } from "react-icons/fa";


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

const emptyChequeRow = () => ({
  rowKey: `cheque-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  paymentId: null,
  storeName: "",
  chequeNo: "",
  chequeDate: "",
  amount: "",
});

const emptyUpiRow = () => ({
  rowKey: `upi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  paymentId: null,
  storeName: "",
  invoiceNumber: "",
  upiId: "",
  amount: "",
});

const samePaymentId = (left, right) => {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return String(left) === String(right);
};

const mapPendingChequeToRow = (cheque) => ({
  rowKey: `cheque-${cheque.id}-${Date.now()}`,
  paymentId: cheque.id,
  storeName: cheque.outlet_name || "",
  chequeNo: cheque.reference_no || "",
  chequeDate: cheque.deposit_date || "",
  amount: cheque.amount === undefined || cheque.amount === null ? "" : String(cheque.amount),
});

const mapPendingUpiToRow = (upi) => ({
  rowKey: `upi-${upi.id}-${Date.now()}`,
  paymentId: upi.id,
  storeName: upi.outlet_name || "",
  invoiceNumber: upi.invoice_number || "",
  upiId: upi.reference_no || "",
  amount: upi.amount === undefined || upi.amount === null ? "" : String(upi.amount),
});

const getTodayLocalDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthStartDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};

const toComparableDate = (value) => {
  if (!value) return "";
  return String(value).split("T")[0].split(" ")[0];
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
  chequeDetails: [emptyChequeRow()],
  upiDetails: [emptyUpiRow()],
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

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const parseChequeDetails = (deposit) => {
  if (deposit?.cash_details) {
    try {
      const details = JSON.parse(deposit.cash_details);
      if (Array.isArray(details?.cheques) && details.cheques.length) {
        return details.cheques.map((cheque) => ({
          rowKey: `cheque-${cheque.chequeNo || "row"}-${cheque.chequeDate || ""}-${cheque.amount || ""}`,
          paymentId: cheque.paymentId || null,
          storeName: cheque.storeName || "",
          chequeNo: cheque.chequeNo || "",
          chequeDate: cheque.chequeDate || "",
          amount: cheque.amount === undefined || cheque.amount === null ? "" : String(cheque.amount),
        }));
      }
    } catch (error) {
      // Fall back to legacy columns below.
    }
  }

  if (deposit?.deposit_mode === "cheque") {
    return [
      {
        rowKey: `cheque-${deposit.cheque_no || "legacy"}-${deposit.id}`,
        paymentId: null,
        storeName: deposit.store_name || "",
        chequeNo: deposit.cheque_no || "",
        chequeDate: deposit.cheque_date || "",
        amount: deposit.amount === undefined || deposit.amount === null ? "" : String(deposit.amount),
      },
    ];
  }

  return [emptyChequeRow()];
};

const parseUpiDetails = (deposit) => {
  if (deposit?.cash_details) {
    try {
      const details = JSON.parse(deposit.cash_details);
      if (Array.isArray(details?.upis) && details.upis.length) {
        return details.upis.map((upi) => ({
          rowKey: `upi-${upi.invoiceNumber || "row"}-${upi.upiId || ""}-${upi.amount || ""}`,
          paymentId: upi.paymentId || null,
          storeName: upi.storeName || "",
          invoiceNumber: upi.invoiceNumber || "",
          upiId: upi.upiId || "",
          amount: upi.amount === undefined || upi.amount === null ? "" : String(upi.amount),
        }));
      }
    } catch (error) {
      // Fall back to legacy columns below.
    }
  }

  if (deposit?.deposit_mode === "upi") {
    return [
      {
        rowKey: `upi-${deposit.cheque_no || "legacy"}-${deposit.id}`,
        paymentId: null,
        storeName: deposit.store_name || "",
        invoiceNumber: deposit.cheque_no || "",
        upiId: "",
        amount: deposit.amount === undefined || deposit.amount === null ? "" : String(deposit.amount),
      },
    ];
  }

  return [emptyUpiRow()];
};

const chequeDisplayText = (deposit, field) => {
  const rows = parseChequeDetails(deposit).filter((row) => row[field]);
  if (!rows.length) return "N/A";
  if (rows.length === 1) return rows[0][field];
  return `${rows.length} cheques`;
};

const upiDisplayText = (deposit, field) => {
  const rows = parseUpiDetails(deposit).filter((row) => row[field]);
  if (!rows.length) return "N/A";
  if (rows.length === 1) return rows[0][field];
  return `${rows.length} UPI entries`;
};

function BankDeposit() {
  const [form, setForm] = useState(emptyForm());
  const [deposits, setDeposits] = useState([]);
  const [pendingCheques, setPendingCheques] = useState([]);
  const [loadingPendingCheques, setLoadingPendingCheques] = useState(false);
  const [pendingUpiInvoices, setPendingUpiInvoices] = useState([]);
  const [loadingPendingUpi, setLoadingPendingUpi] = useState(false);
  const [editingDepositId, setEditingDepositId] = useState(null);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [depositTotalStartDate, setDepositTotalStartDate] = useState("");
  const [depositTotalEndDate, setDepositTotalEndDate] = useState(() => getTodayLocalDate());
  const [depositsPage, setDepositsPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE);
  const API = "https://bawarche.edunextg.co/api";

  const cashAmount = useMemo(
    () =>
      CASH_DENOMINATIONS.reduce(
        (total, item) => total + item.denomination * (parseInt(form.cashDetails[item.key], 10) || 0),
        0
      ),
    [form.cashDetails]
  );

  const chequeAmount = useMemo(
    () =>
      form.chequeDetails.reduce(
        (total, cheque) => total + (Number.isNaN(parseFloat(cheque.amount)) ? 0 : parseFloat(cheque.amount)),
        0
      ),
    [form.chequeDetails]
  );

  const upiAmount = useMemo(
    () =>
      form.upiDetails.reduce(
        (total, upi) => total + (Number.isNaN(parseFloat(upi.amount)) ? 0 : parseFloat(upi.amount)),
        0
      ),
    [form.upiDetails]
  );

  const activeDepositAmount =
    form.depositMode === "cash" ? cashAmount : form.depositMode === "cheque" ? chequeAmount : upiAmount;

  const depositsInTotalRange = useMemo(() => {
    return deposits.filter((deposit) => {
      const depositDate = toComparableDate(deposit.deposit_date);
      if (!depositDate) return false;
      if (depositTotalStartDate && depositDate < depositTotalStartDate) return false;
      if (depositTotalEndDate && depositDate > depositTotalEndDate) return false;
      return true;
    });
  }, [deposits, depositTotalStartDate, depositTotalEndDate]);

  const cashDepositTotal = useMemo(
    () =>
      depositsInTotalRange
        .filter((deposit) => deposit.deposit_mode === "cash")
        .reduce((total, deposit) => total + Number(deposit.amount || 0), 0),
    [depositsInTotalRange]
  );

  const chequeDepositTotal = useMemo(
    () =>
      depositsInTotalRange
        .filter((deposit) => deposit.deposit_mode === "cheque")
        .reduce((total, deposit) => total + Number(deposit.amount || 0), 0),
    [depositsInTotalRange]
  );

  const upiDepositTotal = useMemo(
    () =>
      depositsInTotalRange
        .filter((deposit) => deposit.deposit_mode === "upi")
        .reduce((total, deposit) => total + Number(deposit.amount || 0), 0),
    [depositsInTotalRange]
  );

  const bankWiseDepositSummary = useMemo(() => {
    const summary = new Map();

    depositsInTotalRange.forEach((deposit) => {
      const bankName = deposit.bank_name || "Unknown Bank";
      const accountNo = deposit.bank_account_no || "N/A";
      const key = `${bankName}|${accountNo}|${deposit.branch_name || ""}`;
      const current =
        summary.get(key) || {
          bankName,
          branchName: deposit.branch_name || "N/A",
          accountNo,
          cashAmount: 0,
          chequeAmount: 0,
          upiAmount: 0,
          totalAmount: 0,
          depositCount: 0,
        };

      const amount = Number(deposit.amount || 0);
      if (deposit.deposit_mode === "cash") {
        current.cashAmount += amount;
      } else if (deposit.deposit_mode === "cheque") {
        current.chequeAmount += amount;
      } else if (deposit.deposit_mode === "upi") {
        current.upiAmount += amount;
      }
      current.totalAmount += amount;
      current.depositCount += 1;
      summary.set(key, current);
    });

    return [...summary.values()].sort((a, b) =>
      `${a.bankName} ${a.accountNo}`.localeCompare(`${b.bankName} ${b.accountNo}`)
    );
  }, [depositsInTotalRange]);

  const totalDepositAmount = cashDepositTotal + chequeDepositTotal + upiDepositTotal;

  const depositsTotalPages = Math.max(1, Math.ceil(deposits.length / rowsPerPage));
  const paginatedDeposits = deposits.slice(
    (depositsPage - 1) * rowsPerPage,
    depositsPage * rowsPerPage
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
    setDepositsPage(1);
  }, [deposits.length, rowsPerPage]);

  useEffect(() => {
    if (depositTotalStartDate) return;
    if (!deposits.length) return;
    const earliest = deposits
      .map((deposit) => toComparableDate(deposit.deposit_date))
      .filter(Boolean)
      .sort()[0];
    setDepositTotalStartDate(earliest || getMonthStartDate());
  }, [deposits, depositTotalStartDate]);

  useEffect(() => {
    if (form.depositMode !== "cheque" || editingDepositId) {
      setPendingCheques([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setLoadingPendingCheques(true);
      try {
        const params = new URLSearchParams({ dueByToday: "true" });
        const response = await fetch(`${API}/staff/bank-deposits/pending-cheques?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          setPendingCheques(data);
        }
      } catch (error) {
        console.error("Error fetching pending cheques:", error);
      } finally {
        setLoadingPendingCheques(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [form.depositMode, editingDepositId]);

  useEffect(() => {
    if (form.depositMode !== "upi" || editingDepositId) {
      setPendingUpiInvoices([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setLoadingPendingUpi(true);
      try {
        const response = await fetch(`${API}/staff/bank-deposits/upi-invoices`);
        if (response.ok) {
          const data = await response.json();
          setPendingUpiInvoices(data);
        }
      } catch (error) {
        console.error("Error fetching UPI invoices:", error);
      } finally {
        setLoadingPendingUpi(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [form.depositMode, editingDepositId]);

  const getAvailableChequesForRow = (rowIndex) => {
    const usedPaymentIds = new Set(
      form.chequeDetails
        .filter((_, index) => index !== rowIndex)
        .map((cheque) => cheque.paymentId)
        .filter((paymentId) => paymentId !== null && paymentId !== undefined)
        .map((paymentId) => String(paymentId))
    );
    return pendingCheques.filter((cheque) => !usedPaymentIds.has(String(cheque.id)));
  };

  const getAvailableUpiInvoicesForRow = (rowIndex) => {
    const usedPaymentIds = new Set(
      form.upiDetails
        .filter((_, index) => index !== rowIndex)
        .map((upi) => upi.paymentId)
        .filter((paymentId) => paymentId !== null && paymentId !== undefined)
        .map((paymentId) => String(paymentId))
    );
    return pendingUpiInvoices.filter((upi) => !usedPaymentIds.has(String(upi.id)));
  };

  const handleChequeSelect = (index, cheque) => {
    if (!cheque) {
      setForm((prev) => ({
        ...prev,
        chequeDetails: prev.chequeDetails.map((row, rowIndex) =>
          rowIndex === index ? { ...emptyChequeRow(), rowKey: row.rowKey } : row
        ),
      }));
      return;
    }

    const mappedCheque = mapPendingChequeToRow(cheque);
    setForm((prev) => ({
      ...prev,
      chequeDetails: prev.chequeDetails.map((row, rowIndex) =>
        rowIndex === index ? { ...mappedCheque, rowKey: row.rowKey || mappedCheque.rowKey } : row
      ),
    }));
  };

  const handleUpiSelect = (index, upi) => {
    if (!upi) {
      setForm((prev) => ({
        ...prev,
        upiDetails: prev.upiDetails.map((row, rowIndex) =>
          rowIndex === index ? { ...emptyUpiRow(), rowKey: row.rowKey } : row
        ),
      }));
      return;
    }

    const mappedUpi = mapPendingUpiToRow(upi);
    setForm((prev) => ({
      ...prev,
      upiDetails: prev.upiDetails.map((row, rowIndex) =>
        rowIndex === index ? { ...mappedUpi, rowKey: row.rowKey || mappedUpi.rowKey } : row
      ),
    }));
  };

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
          chequeDetails: value === "cheque" ? prev.chequeDetails : [emptyChequeRow()],
          upiDetails: value === "upi" ? prev.upiDetails : [emptyUpiRow()],
          cashDetails: value === "cash" ? emptyCashDetails() : prev.cashDetails,
          depositorName: value === "upi" ? "" : prev.depositorName,
        }
        : {}),
      ...(field === "storeName"
        ? {
          chequeDetails: prev.chequeDetails.map((cheque, index) =>
            index === 0 ? { ...cheque, storeName: value } : cheque
          ),
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

  const handleChequeChange = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      ...(index === 0 && field === "storeName" ? { storeName: value } : {}),
      chequeDetails: prev.chequeDetails.map((cheque, chequeIndex) =>
        chequeIndex === index ? { ...cheque, [field]: value } : cheque
      ),
    }));
  };

  const addChequeRow = () => {
    setForm((prev) => ({
      ...prev,
      chequeDetails: [...prev.chequeDetails, emptyChequeRow()],
    }));
  };

  const removeChequeRow = (index) => {
    setForm((prev) => ({
      ...prev,
      chequeDetails:
        prev.chequeDetails.length === 1
          ? [emptyChequeRow()]
          : prev.chequeDetails.filter((_, chequeIndex) => chequeIndex !== index),
    }));
  };

  const handleUpiChange = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      upiDetails: prev.upiDetails.map((upi, upiIndex) =>
        upiIndex === index ? { ...upi, [field]: value } : upi
      ),
    }));
  };

  const addUpiRow = () => {
    setForm((prev) => ({
      ...prev,
      upiDetails: [...prev.upiDetails, emptyUpiRow()],
    }));
  };

  const removeUpiRow = (index) => {
    setForm((prev) => ({
      ...prev,
      upiDetails:
        prev.upiDetails.length === 1
          ? [emptyUpiRow()]
          : prev.upiDetails.filter((_, upiIndex) => upiIndex !== index),
    }));
  };

  const validateForm = () => {
    if (!form.depositDate) return "Deposit date is required.";
    if (!form.bankName.trim()) return "Bank name is required.";
    if (!form.branchName.trim()) return "Branch name is required.";
    if (!form.bankAccountNo.trim()) return "Bank account no is required.";
    if (form.depositMode !== "upi" && !form.depositorName.trim()) return "Depositor name is required.";
    if (form.depositMode === "cash" && cashAmount <= 0) {
      return "Please enter cash note or coin count.";
    }
    if (form.depositMode === "cheque") {
      for (let index = 0; index < form.chequeDetails.length; index += 1) {
        const cheque = form.chequeDetails[index];
        const label = `Cheque ${index + 1}`;
        if (!cheque.storeName.trim()) return `${label} store name is required.`;
        if (!cheque.chequeNo.trim()) return `${label} no is required.`;
        if (!cheque.chequeDate) return `${label} date is required.`;
        if (!cheque.amount || Number.isNaN(parseFloat(cheque.amount)) || parseFloat(cheque.amount) <= 0) {
          return `${label} amount is required.`;
        }
      }
    }
    if (form.depositMode === "upi") {
      for (let index = 0; index < form.upiDetails.length; index += 1) {
        const upi = form.upiDetails[index];
        const label = `UPI ${index + 1}`;
        if (!upi.storeName.trim()) return `${label} outlet name is required.`;
        if (!upi.invoiceNumber.trim()) return `${label} invoice number is required.`;
        if (!upi.upiId.trim()) return `${label} UPI ID is required.`;
        if (!upi.amount || Number.isNaN(parseFloat(upi.amount)) || parseFloat(upi.amount) <= 0) {
          return `${label} amount is required.`;
        }
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
        depositorName: form.depositMode === "upi" ? "" : form.depositorName.trim(),
        storeName: form.depositMode === "cheque" ? form.chequeDetails[0]?.storeName.trim() || "" : "",
        depositMode: form.depositMode,
        amount: activeDepositAmount,
        chequeNo: form.depositMode === "cheque" ? form.chequeDetails[0]?.chequeNo.trim() || "" : null,
        chequeDate: form.depositMode === "cheque" ? form.chequeDetails[0]?.chequeDate || "" : null,
        chequeDetails:
          form.depositMode === "cheque"
            ? form.chequeDetails.map((cheque) => ({
              paymentId: cheque.paymentId || null,
              storeName: cheque.storeName.trim(),
              chequeNo: cheque.chequeNo.trim(),
              chequeDate: cheque.chequeDate,
              amount: parseFloat(cheque.amount),
            }))
            : [],
        upiDetails:
          form.depositMode === "upi"
            ? form.upiDetails.map((upi) => ({
              paymentId: upi.paymentId || null,
              storeName: upi.storeName.trim(),
              invoiceNumber: upi.invoiceNumber.trim(),
              upiId: upi.upiId.trim(),
              amount: parseFloat(upi.amount),
            }))
            : [],
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
        closeDepositModal();
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
      chequeDetails: parseChequeDetails(deposit),
      upiDetails: parseUpiDetails(deposit),
      cashDetails,
    });
    setDepositModalOpen(true);
  };

  const openDepositModal = () => {
    setEditingDepositId(null);
    setForm(emptyForm());
    setDepositModalOpen(true);
  };

  const closeDepositModal = () => {
    setDepositModalOpen(false);
    setEditingDepositId(null);
    setForm(emptyForm());
  };

  const cancelEditDeposit = () => {
    closeDepositModal();
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

  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedViewDeposit, setSelectedViewDeposit] = useState(null);

  // View action trigger
  const handleViewDeposit = (deposit) => {
    setSelectedViewDeposit(deposit);
    setOpenViewDialog(true);
  };

  const closeViewDialog = () => {
    setOpenViewDialog(false);
    setSelectedViewDeposit(null);
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

  const printChequeDetails = (deposit = null) => {
    const rows = (deposit ? parseChequeDetails(deposit) : form.chequeDetails)
      .filter((cheque) => cheque.storeName || cheque.chequeNo || cheque.chequeDate || cheque.amount)
      .map((cheque) => ({
        storeName: cheque.storeName || "N/A",
        chequeNo: cheque.chequeNo || "N/A",
        chequeDate: formatDate(cheque.chequeDate),
        amount: parseFloat(cheque.amount) || 0,
      }));

    if (!rows.length) {
      alert("Please enter cheque details.");
      return;
    }

    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    const depositRefNo = deposit?.deposit_ref_no || "Generated after save";
    const printDate = deposit?.deposit_date || form.depositDate;
    const depositorName = deposit?.depositor_name || form.depositorName;
    const bankName = deposit?.bank_name || form.bankName;
    const bankAccountNo = deposit?.bank_account_no || form.bankAccountNo;
    const branchName = deposit?.branch_name || form.branchName;
    const ifscCode = deposit?.ifsc_code || form.ifscCode;

    printChequeDepositPdf({
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

  const printUpiDetails = (deposit = null) => {
    const rows = (deposit ? parseUpiDetails(deposit) : form.upiDetails)
      .filter((upi) => upi.storeName || upi.invoiceNumber || upi.upiId || upi.amount)
      .map((upi) => ({
        storeName: upi.storeName || "N/A",
        invoiceNumber: upi.invoiceNumber || "N/A",
        upiId: upi.upiId || "N/A",
        amount: parseFloat(upi.amount) || 0,
      }));

    if (!rows.length) {
      alert("Please enter UPI details.");
      return;
    }

    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    const depositRefNo = deposit?.deposit_ref_no || "Generated after save";
    const printDate = deposit?.deposit_date || form.depositDate;
    const bankName = deposit?.bank_name || form.bankName;
    const bankAccountNo = deposit?.bank_account_no || form.bankAccountNo;
    const branchName = deposit?.branch_name || form.branchName;
    const ifscCode = deposit?.ifsc_code || form.ifscCode;

    printUpiDepositPdf({
      depositRefNo,
      depositDate: formatDate(printDate),
      bankName: bankName || "N/A",
      branchName: branchName || "N/A",
      bankAccountNo: bankAccountNo || "N/A",
      ifscCode: ifscCode || "N/A",
      rows,
      total,
    });
  };

  const printBankWiseDepositReport = () => {
    const rowsHtml = bankWiseDepositSummary
      .map(
        (row, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.bankName)}</td>
            <td>${escapeHtml(row.branchName)}</td>
            <td>${escapeHtml(row.accountNo)}</td>
            <td class="right">${row.depositCount}</td>
            <td class="right">Rs. ${row.cashAmount.toFixed(2)}</td>
            <td class="right">Rs. ${row.chequeAmount.toFixed(2)}</td>
            <td class="right">Rs. ${row.totalAmount.toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

    const detailRowsHtml = depositsInTotalRange
      .map(
        (deposit, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(deposit.deposit_ref_no || "N/A")}</td>
            <td>${escapeHtml(formatDate(deposit.deposit_date))}</td>
            <td>${escapeHtml(deposit.bank_name || "N/A")}</td>
            <td>${escapeHtml(deposit.branch_name || "N/A")}</td>
            <td>${escapeHtml(deposit.bank_account_no || "N/A")}</td>
            <td>${escapeHtml(deposit.deposit_mode === "cash" ? "Cash" : deposit.deposit_mode === "upi" ? "UPI" : "Cheque")}</td>
            <td class="right">Rs. ${Number(deposit.amount || 0).toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) {
      alert("Please allow popups to download the report.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Bank Wise Deposit Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; line-height: 1.35; }
            h1 { font-size: 22px; margin: 0 0 6px; }
            h2 { font-size: 15px; margin: 20px 0 8px; color: #1f2937; }
            .sub { color: #4b5563; font-size: 13px; margin-bottom: 14px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 20px; margin-bottom: 16px; font-size: 13px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }
            .meta strong { display: inline-block; min-width: 120px; color: #4b5563; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; font-weight: 700; color: #374151; }
            .right { text-align: right; white-space: nowrap; }
            .total { margin-top: 12px; padding: 10px 12px; background: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 15px; font-weight: 700; text-align: right; color: #166534; }
            .empty { padding: 24px; text-align: center; color: #6b7280; border: 1px solid #d1d5db; }
            @media print { body { margin: 12mm; } }
          </style>
        </head>
        <body>
          <h1>Bank Wise Deposit Report</h1>
          <div class="sub">Range wise total deposit summary grouped by bank account.</div>
          <div class="meta">
            <div><strong>From Date:</strong> ${escapeHtml(formatDate(depositTotalStartDate))}</div>
            <div><strong>To Date:</strong> ${escapeHtml(formatDate(depositTotalEndDate))}</div>
            <div><strong>Generated:</strong> ${escapeHtml(new Date().toLocaleString("en-GB"))}</div>
            <div><strong>Total Deposits:</strong> ${depositsInTotalRange.length}</div>
            <div><strong>Total Cash:</strong> Rs. ${cashDepositTotal.toFixed(2)}</div>
            <div><strong>Total Cheque:</strong> Rs. ${chequeDepositTotal.toFixed(2)}</div>
            <div><strong>Total UPI:</strong> Rs. ${upiDepositTotal.toFixed(2)}</div>
          </div>
          <h2>Bank Wise Total</h2>
          ${bankWiseDepositSummary.length > 0
        ? `<table>
                  <thead>
                    <tr>
                      <th>Sr No</th>
                      <th>Bank</th>
                      <th>Branch</th>
                      <th>Account No</th>
                      <th class="right">Deposit Count</th>
                      <th class="right">Cash Deposit</th>
                      <th class="right">Cheque Deposit</th>
                      <th class="right">Total Deposit</th>
                    </tr>
                  </thead>
                  <tbody>${rowsHtml}</tbody>
                </table>`
        : `<div class="empty">No deposits found for this range.</div>`
      }
          <div class="total">Grand Total Deposit: Rs. ${totalDepositAmount.toFixed(2)}</div>
          <h2>Deposit Details</h2>
          ${depositsInTotalRange.length > 0
        ? `<table>
                  <thead>
                    <tr>
                      <th>Sr No</th>
                      <th>Deposit ID</th>
                      <th>Date</th>
                      <th>Bank</th>
                      <th>Branch</th>
                      <th>Account No</th>
                      <th>Mode</th>
                      <th class="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>${detailRowsHtml}</tbody>
                </table>`
        : ""
      }
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" fontWeight="medium" color="dark" mb={2}>
                  Deposit Totals
                </MDTypography>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={4} md={3}>
                    <MDInput
                      type="date"
                      label="From Date"
                      fullWidth
                      value={depositTotalStartDate}
                      onChange={(e) => setDepositTotalStartDate(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4} md={3}>
                    <MDInput
                      type="date"
                      label="To Date"
                      fullWidth
                      value={depositTotalEndDate}
                      onChange={(e) => setDepositTotalEndDate(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4} md={6}>
                    <MDTypography variant="caption" color="text">
                      Totals below are calculated for deposits between the selected dates.
                    </MDTypography>
                  </Grid>
                </Grid>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="button" color="text" fontWeight="medium">
                  Total Cash Deposit
                </MDTypography>
                <MDTypography variant="caption" color="text" display="block" mb={1}>
                  {formatDate(depositTotalStartDate)} to {formatDate(depositTotalEndDate)}
                </MDTypography>
                <MDTypography variant="h4" fontWeight="bold" color="success">
                  {formatMoney(cashDepositTotal)}
                </MDTypography>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="button" color="text" fontWeight="medium">
                  Total Cheque Deposit
                </MDTypography>
                <MDTypography variant="caption" color="text" display="block" mb={1}>
                  {formatDate(depositTotalStartDate)} to {formatDate(depositTotalEndDate)}
                </MDTypography>
                <MDTypography variant="h4" fontWeight="bold" color="warning">
                  {formatMoney(chequeDepositTotal)}
                </MDTypography>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="button" color="text" fontWeight="medium">
                  Total UPI Deposit
                </MDTypography>
                <MDTypography variant="caption" color="text" display="block" mb={1}>
                  {formatDate(depositTotalStartDate)} to {formatDate(depositTotalEndDate)}
                </MDTypography>
                <MDTypography variant="h4" fontWeight="bold" color="info">
                  {formatMoney(upiDepositTotal)}
                </MDTypography>
              </MDBox>
            </Card>
          </Grid>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                <MDBox>
                  <MDTypography variant="h6" fontWeight="medium" color="dark">
                    Bank Wise Deposit Report
                  </MDTypography>
                  <MDTypography variant="caption" color="text">
                    {formatDate(depositTotalStartDate)} to {formatDate(depositTotalEndDate)}
                  </MDTypography>
                </MDBox>
                <MDBox display="flex" alignItems="center" gap={2} flexWrap="wrap">
                  <MDTypography variant="button" color="success" fontWeight="bold">
                    Total: {formatMoney(totalDepositAmount)}
                  </MDTypography>
                  <MDButton
                    color="dark"
                    variant="contained"
                    size="small"
                    onClick={printBankWiseDepositReport}
                    disabled={bankWiseDepositSummary.length === 0}
                  >
                    Download PDF
                  </MDButton>
                </MDBox>
              </MDBox>
              <MDBox px={3} pb={3}>
                <TableContainer component={Paper} sx={{ boxShadow: "none", border: "1px solid #e5e7eb" }}>
                  <Table sx={{ minWidth: 900 }}>
                    <TableHead sx={{ display: "table-header-group", backgroundColor: "#f9fafb" }}>
                      <TableRow>
                        <TableCell sx={tableHeadSx}>Sr No</TableCell>
                        <TableCell sx={tableHeadSx}>Bank</TableCell>
                        <TableCell sx={tableHeadSx}>Branch</TableCell>
                        <TableCell sx={tableHeadSx}>Account No</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Deposit Count</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Cash Deposit</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Cheque Deposit</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Total Deposit</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {bankWiseDepositSummary.length > 0 ? (
                        bankWiseDepositSummary.map((row, index) => (
                          <TableRow key={`${row.bankName}-${row.accountNo}-${row.branchName}`}>
                            <TableCell sx={tableBodySx}>{index + 1}</TableCell>
                            <TableCell sx={tableBodySx}>{row.bankName}</TableCell>
                            <TableCell sx={tableBodySx}>{row.branchName}</TableCell>
                            <TableCell sx={tableBodySx}>{row.accountNo}</TableCell>
                            <TableCell align="right" sx={tableBodySx}>{row.depositCount}</TableCell>
                            <TableCell align="right" sx={tableBodySx}>{formatMoney(row.cashAmount)}</TableCell>
                            <TableCell align="right" sx={tableBodySx}>{formatMoney(row.chequeAmount)}</TableCell>
                            <TableCell align="right" sx={{ ...tableBodySx, fontWeight: 700 }}>
                              {formatMoney(row.totalAmount)}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No deposits found for this range.
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
          <Grid item xs={12}>
            <Card>
              <MDBox p={3} pb={2} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                <MDTypography variant="h6" fontWeight="medium">
                  Recent Bank Deposits
                </MDTypography>
                <MDButton color="info" variant="gradient" onClick={openDepositModal}>
                  <Icon sx={{ mr: 1 }}>add</Icon>
                  Add Deposit
                </MDButton>
              </MDBox>
              <MDBox px={3} pb={3}>
                <TableContainer component={Paper} sx={paginatedTableContainerSx}>
                  <Table stickyHeader sx={{ minWidth: 1180 }}>
                    <TableHead sx={paginatedTableHeadSx()}>
                      <TableRow>
                        <TableCell sx={tableHeadSx}>Sr No</TableCell>
                        <TableCell sx={tableHeadSx}>Deposit ID</TableCell>
                        <TableCell sx={tableHeadSx}>Date</TableCell>
                        <TableCell sx={tableHeadSx}>Bank</TableCell>
                        <TableCell sx={tableHeadSx}>Branch</TableCell>
                        <TableCell sx={tableHeadSx}>Bank No</TableCell>
                        {/* IFSC, Store, Mode removed from here */}
                        <TableCell sx={tableHeadSx}>Cheque / Invoice No</TableCell>
                        <TableCell sx={tableHeadSx}>Cheque Date / UPI ID</TableCell>
                        <TableCell align="right" sx={tableHeadSx}>Amount</TableCell>
                        <TableCell align="center" sx={tableHeadSx}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedDeposits.length > 0 ? (
                        paginatedDeposits.map((deposit, index) => (
                          <TableRow key={deposit.id}>
                            <TableCell sx={tableBodySx}>{(depositsPage - 1) * rowsPerPage + index + 1}</TableCell>
                            <TableCell sx={{ ...tableBodySx, fontWeight: 700 }}>
                              {deposit.deposit_ref_no || "N/A"}
                            </TableCell>
                            <TableCell sx={tableBodySx}>{formatDate(deposit.deposit_date)}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.bank_name}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.branch_name}</TableCell>
                            <TableCell sx={tableBodySx}>{deposit.bank_account_no}</TableCell>
                            {/* Removed IFSC, Store, Mode from here */}
                            <TableCell sx={tableBodySx}>
                              {deposit.deposit_mode === "cheque"
                                ? chequeDisplayText(deposit, "chequeNo")
                                : deposit.deposit_mode === "upi"
                                  ? upiDisplayText(deposit, "invoiceNumber")
                                  : deposit.cheque_no || "N/A"}
                            </TableCell>
                            <TableCell sx={tableBodySx}>
                              {deposit.deposit_mode === "cheque"
                                ? formatDate(deposit.cheque_date)
                                : deposit.deposit_mode === "upi"
                                  ? upiDisplayText(deposit, "upiId")
                                  : formatDate(deposit.cheque_date)}
                            </TableCell>
                            <TableCell align="right" sx={{ ...tableBodySx, fontWeight: 600 }}>
                              {formatMoney(deposit.amount)}
                            </TableCell>
                            <TableCell align="center" sx={tableBodySx}>
                              <MDBox display="flex" gap={1} justifyContent="center">
                                {/* <MDButton color="info" variant="outlined" size="small" onClick={() => handleViewDeposit(deposit)}> */}
                                <FaRegEye onClick={() => handleViewDeposit(deposit)} style={{ cursor: "pointer" }} color="" size={20} />
                                {/* </MDButton> */}
                                {deposit.deposit_mode === "cash" && (
                                  // <MDButton color="success" variant="outlined" size="small" onClick={() => printCashDetails(deposit)}>

                                  <IoPrintOutline onClick={() => printCashDetails(deposit)} style={{ cursor: "pointer" }} color="#6C9CF0" size={20} />
                                  // {/* </MDButton> */}
                                )}
                                {deposit.deposit_mode === "cheque" && (
                                  <IoPrintOutline onClick={() => printChequeDetails(deposit)} style={{ cursor: "pointer" }} color="#6C9CF0" size={20} />
                                )}
                                {deposit.deposit_mode === "upi" && (
                                  <IoPrintOutline onClick={() => printUpiDetails(deposit)} style={{ cursor: "pointer" }} color="#6C9CF0" size={20} />
                                )}
                                {/* // <MDButton color="info" variant="outlined" size="small" onClick={() => startEditDeposit(deposit)}> */}
                                <FaRegEdit onClick={() => startEditDeposit(deposit)} style={{ cursor: "pointer" }} color="#E0E388" size={20} />
                                {/* // </MDButton> */}
                                {/* // <MDButton color="error" variant="outlined" size="small" onClick={() => deleteDeposit(deposit.id)}> */}
                                <CiTrash onClick={() => deleteDeposit(deposit.id)} style={{ cursor: "pointer" }} color="#D2042D" size={20} />
                                {/* // </MDButton> */}
                              </MDBox>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={10} align="center" sx={{ py: 3, borderBottom: 0 }}>
                            <MDTypography variant="body2" color="text">
                              No bank deposits found. Click &quot;Add Deposit&quot; to create one.
                            </MDTypography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePaginationFooter
                  page={depositsPage}
                  totalPages={depositsTotalPages}
                  total={deposits.length}
                  onPageChange={setDepositsPage}
                  limit={rowsPerPage}
                  onLimitChange={setRowsPerPage}
                />
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>


      <Dialog open={depositModalOpen} onClose={closeDepositModal} fullWidth maxWidth="lg" scroll="paper">
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          {editingDepositId ? "Edit Bank Deposit" : "Add Bank Deposit"}
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1}>
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
                  disabled={form.depositMode === "upi"}
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
                    <MenuItem value="upi">UPI</MenuItem>
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
                    Total: {formatMoney(activeDepositAmount)}
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
                <Grid item xs={12}>
                  <MDBox display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <MDBox>
                      <MDTypography variant="button" fontWeight="medium" color="dark">
                        Cheque Details
                      </MDTypography>
                      {!editingDepositId && (
                        <MDTypography variant="caption" color="text" display="block">
                          Only today&apos;s deposit cheques and previously missed cheques not yet deposited.
                        </MDTypography>
                      )}
                    </MDBox>
                    <MDButton color="info" variant="outlined" size="small" onClick={addChequeRow}>
                      <Icon sx={{ mr: 1 }}>add</Icon>
                      Add Cheque
                    </MDButton>
                  </MDBox>
                  <MDBox display="flex" flexDirection="column" gap={1.5}>
                    {form.chequeDetails.map((cheque, index) => (
                      <Grid container spacing={1.5} key={cheque.rowKey || `cheque-row-${index}`}>
                        <Grid item xs={12} md={3}>
                          {editingDepositId ? (
                            <MDInput
                              label="Cheque No"
                              fullWidth
                              value={cheque.chequeNo}
                              onChange={(e) => handleChequeChange(index, "chequeNo", e.target.value)}
                            />
                          ) : (
                            <Autocomplete
                              id={`cheque-autocomplete-${cheque.rowKey || index}`}
                              options={getAvailableChequesForRow(index)}
                              loading={loadingPendingCheques}
                              value={
                                pendingCheques.find((item) => samePaymentId(item.id, cheque.paymentId)) ||
                                (cheque.chequeNo
                                  ? {
                                    id: cheque.paymentId,
                                    reference_no: cheque.chequeNo,
                                    outlet_name: cheque.storeName,
                                    deposit_date: cheque.chequeDate,
                                    amount: cheque.amount,
                                  }
                                  : null)
                              }
                              getOptionLabel={(option) => option.reference_no || ""}
                              isOptionEqualToValue={(option, value) => samePaymentId(option?.id, value?.id)}
                              onChange={(event, value) => handleChequeSelect(index, value)}
                              renderOption={(props, option) => (
                                <li {...props} key={option.id}>
                                  <MDBox>
                                    <MDTypography variant="button" fontWeight="medium">
                                      {option.reference_no}
                                    </MDTypography>
                                    <MDTypography variant="caption" color="text" display="block">
                                      {option.outlet_name || "N/A"} ┬╖ {formatDate(option.deposit_date)} ┬╖{" "}
                                      {formatMoney(option.amount)}
                                      {option.report_status === "due_today"
                                        ? " ┬╖ Due today"
                                        : option.report_status === "missed" || option.report_status === "clearing_done"
                                          ? " ┬╖ Missed / not deposited"
                                          : ""}
                                    </MDTypography>
                                  </MDBox>
                                </li>
                              )}
                              renderInput={(params) => (
                                <MDInput {...params} label="Cheque No" fullWidth />
                              )}
                            />
                          )}
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <MDInput
                            label="Store Name"
                            fullWidth
                            value={cheque.storeName}
                            onChange={(e) => handleChequeChange(index, "storeName", e.target.value)}
                            InputProps={{ readOnly: !editingDepositId }}
                          />
                        </Grid>
                        <Grid item xs={12} md={2}>
                          <MDInput
                            type="date"
                            label="Cheque Date"
                            fullWidth
                            value={cheque.chequeDate}
                            onChange={(e) => handleChequeChange(index, "chequeDate", e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            InputProps={{ readOnly: !editingDepositId }}
                          />
                        </Grid>
                        <Grid item xs={12} md={2}>
                          <MDInput
                            type="number"
                            label="Amount"
                            fullWidth
                            value={cheque.amount}
                            onChange={(e) => handleChequeChange(index, "amount", e.target.value)}
                            inputProps={{ min: 0, step: "0.01" }}
                            InputProps={{ readOnly: !editingDepositId }}
                          />
                        </Grid>
                        <Grid item xs={12} md={2}>
                          <MDButton
                            color="error"
                            variant="outlined"
                            fullWidth
                            sx={{ height: 44 }}
                            onClick={() => removeChequeRow(index)}
                          >
                            <Icon sx={{ mr: 1 }}>delete</Icon>
                            Remove
                          </MDButton>
                        </Grid>
                      </Grid>
                    ))}
                  </MDBox>
                </Grid>
              )}

              {form.depositMode === "upi" && (
                <Grid item xs={12}>
                  <MDBox display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <MDBox>
                      <MDTypography variant="button" fontWeight="medium" color="dark">
                        UPI Details
                      </MDTypography>
                      {!editingDepositId && (
                        <MDTypography variant="caption" color="text" display="block">
                          Choose invoice number to auto-fill outlet name, UPI ID, and amount.
                        </MDTypography>
                      )}
                    </MDBox>
                    <MDButton color="info" variant="outlined" size="small" onClick={addUpiRow}>
                      <Icon sx={{ mr: 1 }}>add</Icon>
                      Add UPI
                    </MDButton>
                  </MDBox>
                  <MDBox display="flex" flexDirection="column" gap={1.5}>
                    {form.upiDetails.map((upi, index) => (
                      <Grid container spacing={1.5} key={upi.rowKey || `upi-row-${index}`}>
                        <Grid item xs={12} md={3}>
                          {editingDepositId ? (
                            <MDInput
                              label="Invoice No"
                              fullWidth
                              value={upi.invoiceNumber}
                              onChange={(e) => handleUpiChange(index, "invoiceNumber", e.target.value)}
                            />
                          ) : (
                            <Autocomplete
                              id={`upi-autocomplete-${upi.rowKey || index}`}
                              options={getAvailableUpiInvoicesForRow(index)}
                              loading={loadingPendingUpi}
                              value={
                                pendingUpiInvoices.find((item) => samePaymentId(item.id, upi.paymentId)) ||
                                (upi.invoiceNumber
                                  ? {
                                    id: upi.paymentId,
                                    invoice_number: upi.invoiceNumber,
                                    outlet_name: upi.storeName,
                                    reference_no: upi.upiId,
                                    amount: upi.amount,
                                  }
                                  : null)
                              }
                              getOptionLabel={(option) => option.invoice_number || ""}
                              isOptionEqualToValue={(option, value) => samePaymentId(option?.id, value?.id)}
                              onChange={(event, value) => handleUpiSelect(index, value)}
                              renderOption={(props, option) => (
                                <li {...props} key={option.id}>
                                  <MDBox>
                                    <MDTypography variant="button" fontWeight="medium">
                                      {option.invoice_number}
                                    </MDTypography>
                                    <MDTypography variant="caption" color="text" display="block">
                                      {option.outlet_name || "N/A"} ┬╖ {option.reference_no || "No UPI ID"} ┬╖{" "}
                                      {formatMoney(option.amount)}
                                    </MDTypography>
                                  </MDBox>
                                </li>
                              )}
                              renderInput={(params) => (
                                <MDInput {...params} label="Invoice No" fullWidth />
                              )}
                            />
                          )}
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <MDInput
                            label="Outlet Name"
                            fullWidth
                            value={upi.storeName}
                            onChange={(e) => handleUpiChange(index, "storeName", e.target.value)}
                            InputProps={{ readOnly: !editingDepositId }}
                          />
                        </Grid>
                        <Grid item xs={12} md={2}>
                          <MDInput
                            label="UPI ID"
                            fullWidth
                            value={upi.upiId}
                            onChange={(e) => handleUpiChange(index, "upiId", e.target.value)}
                            InputProps={{ readOnly: !editingDepositId }}
                          />
                        </Grid>
                        <Grid item xs={12} md={2}>
                          <MDInput
                            type="number"
                            label="Amount"
                            fullWidth
                            value={upi.amount}
                            onChange={(e) => handleUpiChange(index, "amount", e.target.value)}
                            inputProps={{ min: 0, step: "0.01" }}
                            InputProps={{ readOnly: !editingDepositId }}
                          />
                        </Grid>
                        <Grid item xs={12} md={2}>
                          <MDButton
                            color="error"
                            variant="outlined"
                            fullWidth
                            sx={{ height: 44 }}
                            onClick={() => removeUpiRow(index)}
                          >
                            <Icon sx={{ mr: 1 }}>delete</Icon>
                            Remove
                          </MDButton>
                        </Grid>
                      </Grid>
                    ))}
                  </MDBox>
                </Grid>
              )}

            </Grid>
          </MDBox>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, flexWrap: "wrap", gap: 1 }}>
          {form.depositMode === "cash" && (
            <MDButton color="success" variant="outlined" onClick={() => printCashDetails()} disabled={saving}>
              <Icon sx={{ mr: 1 }}>picture_as_pdf</Icon>
              Print Cash PDF
            </MDButton>
          )}
          {form.depositMode === "cheque" && (
            <MDButton color="warning" variant="outlined" onClick={() => printChequeDetails()} disabled={saving}>
              <Icon sx={{ mr: 1 }}>picture_as_pdf</Icon>
              Print Cheque PDF
            </MDButton>
          )}
          {form.depositMode === "upi" && (
            <MDButton color="info" variant="outlined" onClick={() => printUpiDetails()} disabled={saving}>
              <Icon sx={{ mr: 1 }}>picture_as_pdf</Icon>
              Print UPI PDF
            </MDButton>
          )}
          <MDButton color="dark" variant="outlined" onClick={closeDepositModal} disabled={saving}>
            Cancel
          </MDButton>
          <MDButton color="info" variant="gradient" onClick={handleSubmit} disabled={saving}>
            <Icon sx={{ mr: 1 }}>account_balance</Icon>
            {saving ? "Saving..." : editingDepositId ? "Update Deposit" : "Save Deposit"}
          </MDButton>
        </DialogActions>
      </Dialog>

      {/* View Dialog for IFSC, Store, Mode */}
      <Dialog open={openViewDialog} onClose={closeViewDialog} maxWidth="xs" fullWidth>
        <DialogTitle>
          View Bank Deposit Details
        </DialogTitle>
        <DialogContent dividers>
          {selectedViewDeposit && (
            <MDBox>
              <MDTypography variant="subtitle2" fontWeight="bold" gutterBottom>
                IFSC:{" "}
                <span style={{ fontWeight: 400 }}>
                  {selectedViewDeposit.ifsc_code || "N/A"}
                </span>
              </MDTypography>
              <MDTypography variant="subtitle2" fontWeight="bold" gutterBottom>
                Store:{" "}
                <span style={{ fontWeight: 400 }}>
                  {selectedViewDeposit.deposit_mode === "cheque"
                    ? chequeDisplayText(selectedViewDeposit, "storeName")
                    : selectedViewDeposit.deposit_mode === "upi"
                      ? upiDisplayText(selectedViewDeposit, "storeName")
                      : selectedViewDeposit.store_name || "N/A"}
                </span>
              </MDTypography>
              <MDTypography variant="subtitle2" fontWeight="bold">
                Mode:{" "}
                <span style={{ fontWeight: 400 }}>
                  {selectedViewDeposit.deposit_mode === "cash"
                    ? "Cash"
                    : selectedViewDeposit.deposit_mode === "upi"
                      ? "UPI"
                      : "Cheque"}
                </span>
              </MDTypography>
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton onClick={closeViewDialog} color="info" variant="contained">
            Close
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default BankDeposit;
