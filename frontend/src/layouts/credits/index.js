import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import { IoPrintOutline } from "react-icons/io5";

function CreditsPage() {
  const [credits, setCredits] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [remarksDialog, setRemarksDialog] = useState({ open: false, mode: "edit", credit: null });
  const [remarksText, setRemarksText] = useState("");
  const [remarksDate, setRemarksDate] = useState("");
  const [remarksHistory, setRemarksHistory] = useState([]);
  const [loadingRemarks, setLoadingRemarks] = useState(false);
  const [savingRemarks, setSavingRemarks] = useState(false);
  const API = "https://bawarchee.edunextg.co/api";

  const getTodayLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const fetchCredits = async () => {
    try {
      const response = await fetch(`${API}/staff/credits/pending`);
      if (response.ok) {
        const data = await response.json();
        setCredits(data);
      } else {
        console.error("Failed to fetch pending credits");
      }
    } catch (error) {
      console.error("Error fetching credits:", error);
    }
  };

  useEffect(() => {
    fetchCredits();
  }, []);

  const getStatus = (saleDateStr, creditDays) => {
    if (!creditDays) return <Chip label="No Term" size="small" variant="outlined" />;

    const saleDate = new Date(saleDateStr);
    const msInDay = 24 * 60 * 60 * 1000;
    const dueDate = new Date(saleDate.getTime() + creditDays * msInDay);
    const now = new Date();

    now.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((dueDate - now) / msInDay);

    if (diffDays < 0) {
      return <Chip label={`Overdue by ${Math.abs(diffDays)} days`} color="error" size="small" />;
    } else if (diffDays === 0) {
      return <Chip label="Due Today" color="warning" size="small" />;
    } else {
      return <Chip label={`Due in ${diffDays} days`} color="success" size="small" />;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB");
  };

  const calcDueDate = (dateStr, days) => {
    if (!days) return "N/A";
    const date = new Date(dateStr);
    date.setDate(date.getDate() + parseInt(days, 10));
    return date.toLocaleDateString("en-GB");
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const getDiffDays = (saleDateStr, creditDays) => {
    if (!creditDays) return null;
    const saleDate = new Date(saleDateStr);
    const msInDay = 24 * 60 * 60 * 1000;
    const dueDate = new Date(saleDate.getTime() + creditDays * msInDay);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    return Math.round((dueDate - now) / msInDay);
  };

  const isTomorrowOrMissedCollection = (credit) => {
    const diff = getDiffDays(credit.sale_date, credit.credit_days);
    return diff !== null && (diff === 1 || diff < 0);
  };

  const getCollectionDueLabel = (credit) => {
    const diff = getDiffDays(credit.sale_date, credit.credit_days);
    if (diff === null) return "N/A";
    if (diff < 0) return `Missed (${Math.abs(diff)} days overdue)`;
    if (diff === 1) return "Tomorrow";
    return "N/A";
  };

  const sortTomorrowCollectionCredits = (creditsList) =>
    [...creditsList].sort((a, b) => {
      const diffA = getDiffDays(a.sale_date, a.credit_days) ?? 999;
      const diffB = getDiffDays(b.sale_date, b.credit_days) ?? 999;
      if (diffA !== diffB) return diffA - diffB;
      return (a.staff_name || "").localeCompare(b.staff_name || "");
    });

  const downloadCSV = (filename, csvContent) => {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const groupCreditsByStaff = (creditsList) => {
    const groups = {};
    creditsList.forEach((credit) => {
      const staffName = credit.staff_name || "Unknown Staff";
      if (!groups[staffName]) {
        groups[staffName] = [];
      }
      groups[staffName].push(credit);
    });
    return groups;
  };

  const getCreditRowSx = (credit) => {
    if ((Number(credit.remarks_count) || 0) > 0 || credit.remarks?.trim()) {
      return {
        backgroundColor: "#dcfce7",
        "&:hover": { backgroundColor: "#bbf7d0" },
      };
    }

    return {
      backgroundColor: "#fff",
      "&:hover": { backgroundColor: "#f8fafc" },
    };
  };

  const getCreditCompanyIds = (credit) =>
    String(credit?.company_ids || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

  const companyOptions = React.useMemo(() => {
    const companies = new Map();

    credits.forEach((credit) => {
      const ids = getCreditCompanyIds(credit);
      const names = String(credit.company_name || "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);

      ids.forEach((id, index) => {
        if (!companies.has(id)) {
          companies.set(id, names[index] || names[0] || `Company ${id}`);
        }
      });
    });

    return [...companies.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [credits]);

  const staffOptions = React.useMemo(() => {
    const staff = new Map();

    credits.forEach((credit) => {
      if (!credit.staff_id) return;
      if (selectedCompanyId && !getCreditCompanyIds(credit).includes(Number(selectedCompanyId))) {
        return;
      }
      if (!staff.has(credit.staff_id)) {
        staff.set(credit.staff_id, credit.staff_name || `Staff ${credit.staff_id}`);
      }
    });

    return [...staff.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [credits, selectedCompanyId]);

  const selectedCompanyName =
    companyOptions.find((company) => company.id === Number(selectedCompanyId))?.name || "";
  const selectedStaffName =
    staffOptions.find((staff) => staff.id === Number(selectedStaffId))?.name || "";
  const totalCreditLabel = selectedStaffName
    // ? `${selectedStaffName} Credit Dues Amount`
    // : selectedCompanyName
    //   ? `${selectedCompanyName} Credit Dues Amount`
    //   : "Total Credit Dues Amount";

  const handleCompanyChange = (value) => {
    setSelectedCompanyId(value);
    setSelectedStaffId("");
  };

  const openEditRemarks = (credit) => {
    setRemarksText("");
    setRemarksDate(getTodayLocalDate());
    setRemarksHistory([]);
    setRemarksDialog({ open: true, mode: "edit", credit });
  };

  const openViewRemarks = async (credit) => {
    setRemarksDialog({ open: true, mode: "view", credit });
    setRemarksHistory([]);
    setLoadingRemarks(true);
    try {
      const response = await fetch(`${API}/staff/credits/${credit.id}/remarks`);
      if (response.ok) {
        const data = await response.json();
        setRemarksHistory(data);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to load remarks.");
      }
    } catch (error) {
      console.error("Error loading remarks:", error);
      alert("Error loading remarks.");
    } finally {
      setLoadingRemarks(false);
    }
  };

  const closeRemarksDialog = () => {
    setRemarksDialog({ open: false, mode: "edit", credit: null });
    setRemarksText("");
    setRemarksDate("");
    setRemarksHistory([]);
    setLoadingRemarks(false);
  };

  const handleSaveRemarks = async () => {
    if (!remarksDialog.credit) return;
    if (!remarksDate) {
      alert("Please choose remarks date.");
      return;
    }
    if (!remarksText.trim()) {
      alert("Please enter remarks.");
      return;
    }

    setSavingRemarks(true);
    try {
      const response = await fetch(
        `${API}/staff/credits/${remarksDialog.credit.id}/remarks`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remarks: remarksText, remarkDate: remarksDate }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const savedRemark = data.remark;
        setCredits((prev) =>
          prev.map((credit) =>
            credit.id === remarksDialog.credit.id
              ? {
                  ...credit,
                  remarks: savedRemark?.remarks || remarksText.trim(),
                  remarks_count: (Number(credit.remarks_count) || 0) + 1,
                  latest_remark_date: savedRemark?.remark_date || remarksDate,
                }
              : credit
          )
        );
        closeRemarksDialog();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to save remarks.");
      }
    } catch (error) {
      console.error("Error saving remarks:", error);
      alert("Error saving remarks.");
    } finally {
      setSavingRemarks(false);
    }
  };

  const filteredCredits = credits.filter((credit) => {
    const saleBalance = Number(credit.sale_balance_amount ?? credit.saleBalanceAmount);
    if (!Number.isNaN(saleBalance) && saleBalance <= 0) {
      return false;
    }

    if (selectedCompanyId && !getCreditCompanyIds(credit).includes(Number(selectedCompanyId))) {
      return false;
    }
    if (selectedStaffId && Number(credit.staff_id) !== Number(selectedStaffId)) {
      return false;
    }

    const search = searchQuery.toLowerCase();
    const outletName = credit.outlet_name ? credit.outlet_name.toLowerCase() : "";
    const contactNumber = credit.contact_number ? credit.contact_number.toLowerCase() : "";
    const invoiceNum = credit.invoice_number ? credit.invoice_number.toLowerCase() : "";
    const staffName = credit.staff_name ? credit.staff_name.toLowerCase() : "";
    const remarks = credit.remarks ? credit.remarks.toLowerCase() : "";
    const stickerNum = credit.sticker_number ? credit.sticker_number.toLowerCase() : "";
    return (
      outletName.includes(search) ||
      contactNumber.includes(search) ||
      invoiceNum.includes(search) ||
      staffName.includes(search) ||
      remarks.includes(search) ||
      stickerNum.includes(search)
    )
  });

  const totalCreditDuesAmount = filteredCredits.reduce(
    (total, credit) => total + (Number(credit.balance_amount) || 0),
    0
  );

  const showPrintButton = Boolean(selectedCompanyId || selectedStaffId);

  const handlePrintPdf = () => {
    const companyLabel = selectedCompanyName || "All Companies";
    const staffLabel = selectedStaffName || "All Staff";
    const generatedOn = new Date().toLocaleString("en-GB");
    const rowsHtml = filteredCredits
    .map(
      (credit, index) => `
        <tr>
          <td>${index + 1}</td>
          
          <td>${escapeHtml(credit.sticker_number || "N/A")}</td>
          <td>${escapeHtml(credit.invoice_number || "N/A")}</td>
          <td>${escapeHtml(credit.outlet_name || "N/A")}</td>
          <td>${escapeHtml(credit.outlet_erp_id || "N/A")}</td>
          <td class="right">Rs. ${Number(credit.balance_amount || 0).toFixed(2)}</td>
          <td>${escapeHtml(formatDate(credit.sale_date))}</td>
          <td>${escapeHtml(calcDueDate(credit.sale_date, credit.credit_days))}</td>
        </tr>
      `
    )
    .join("");


    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Pending Credits Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; }
            h1 { font-size: 22px; margin: 0 0 12px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; margin-bottom: 18px; font-size: 13px; }
            .meta strong { display: inline-block; min-width: 110px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
            th { background: #f3f4f6; font-weight: 700; }
            .right { text-align: right; }
            .total { margin-top: 14px; text-align: right; font-size: 16px; font-weight: 700; }
            .empty { padding: 24px; text-align: center; color: #6b7280; border: 1px solid #d1d5db; }
            @media print {
              body { margin: 16mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Pending Credits Report</h1>
          <div class="meta">
            <div><strong>Company:</strong> ${escapeHtml(companyLabel)}</div>
            <div><strong>Staff:</strong> ${escapeHtml(staffLabel)}</div>
            <div><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
            <div><strong>Total Balance:</strong> Rs. ${totalCreditDuesAmount.toFixed(2)}</div>
          </div>
          ${
            filteredCredits.length > 0
              ? ` <table>
        <thead>
          <tr>
            <th>Sr No</th>
            <th>Sale ID</th>
            <th>Invoice No</th>
            <th>Outlet Name</th>
            <th>ERP ID</th>
            <th class="right">Outstanding Balance</th>
            <th>Issue Date</th>
            <th>Due Date</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>`
              : `<div class="empty">No outstanding credits found for this filter.</div>`
          }
          <div class="total">Total Balance: Rs. ${totalCreditDuesAmount.toFixed(2)}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handlePrintTomorrowCollection = () => {
    const tomorrowCredits = sortTomorrowCollectionCredits(
      filteredCredits.filter(isTomorrowOrMissedCollection)
    );

    const grouped = groupCreditsByStaff(tomorrowCredits);
    const staffNames = Object.keys(grouped).sort();

    const companyLabel = selectedCompanyName || "All Companies";
    const staffLabel = selectedStaffName || "All Staff";
    const generatedOn = new Date().toLocaleString("en-GB");
    const grandTotal = tomorrowCredits.reduce((sum, c) => sum + (Number(c.balance_amount) || 0), 0);
    const missedCount = tomorrowCredits.filter((c) => {
      const diff = getDiffDays(c.sale_date, c.credit_days);
      return diff !== null && diff < 0;
    }).length;
    const tomorrowCount = tomorrowCredits.length - missedCount;

    let tablesHtml = "";
    if (staffNames.length === 0) {
      tablesHtml = `<div class="empty">No tomorrow or missed collections found.</div>`;
    } else {
      staffNames.forEach((staffName) => {
        const staffCredits = sortTomorrowCollectionCredits(grouped[staffName]);
        const staffTotal = staffCredits.reduce((sum, c) => sum + (Number(c.balance_amount) || 0), 0);
        const rows = staffCredits.map((c, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${escapeHtml(c.sticker_number || "N/A")}</td>
            <td>${escapeHtml(c.invoice_number || "N/A")}</td>
            <td>${escapeHtml(c.outlet_name || "N/A")}</td>
            <td>${escapeHtml(c.outlet_erp_id || "N/A")}</td>
            <td>${escapeHtml(formatDate(c.sale_date))}</td>
            <td>${escapeHtml(calcDueDate(c.sale_date, c.credit_days))}</td>
            <td>${escapeHtml(getCollectionDueLabel(c))}</td>
            <td class="right">Rs. ${Number(c.balance_amount || 0).toFixed(2)}</td>
          </tr>
        `).join("");

        tablesHtml += `
          <div class="staff-section">
            <h2>Staff: ${escapeHtml(staffName)}</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 5%">Sr</th>
                  <th style="width: 12%">Sale ID</th>
                  <th style="width: 15%">Invoice</th>
                  <th>Outlet Name</th>
                  <th style="width: 12%">ERP ID</th>
                  <th style="width: 12%">Issue Date</th>
                  <th style="width: 12%">Due Date</th>
                  <th style="width: 14%">Status</th>
                  <th style="width: 14%" class="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="staff-total-row">
                  <td colspan="8" class="right"><strong>Total for ${escapeHtml(staffName)}</strong></td>
                  <td class="right"><strong>Rs. ${staffTotal.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      });
    }

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Staff Wise Tomorrow + Missed Collection Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; line-height: 1.4; }
            h1 { font-size: 20px; margin: 0 0 4px; text-transform: uppercase; color: #1e3a8a; }
            h2 { font-size: 14px; margin: 16px 0 6px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 20px; margin-bottom: 20px; font-size: 13px; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
            .meta strong { display: inline-block; min-width: 120px; color: #475569; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background: #f1f5f9; font-weight: 700; color: #334155; }
            .right { text-align: right; }
            .staff-section { margin-bottom: 24px; page-break-inside: avoid; }
            .staff-total-row { background: #f8fafc; }
            .grand-total { margin-top: 20px; padding: 12px; text-align: right; font-size: 16px; font-weight: 700; background: #e0f2fe; color: #0369a1; border-radius: 6px; border: 1px solid #bae6fd; }
            .empty { padding: 30px; text-align: center; color: #64748b; border: 1px solid #cbd5e1; border-radius: 6px; }
            @media print {
              body { margin: 12mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Staff-Wise Tomorrow + Missed Collection Report</h1>
          <div style="color: #4b5563; font-size: 12px; margin-bottom: 12px;">Report of pending credit balances due tomorrow and previously missed overdue collections.</div>
          <div class="meta">
            <div><strong>Company:</strong> ${escapeHtml(companyLabel)}</div>
            <div><strong>Staff:</strong> ${escapeHtml(staffLabel)}</div>
            <div><strong>Report Date:</strong> ${escapeHtml(new Date(Date.now() + 86400000).toLocaleDateString("en-GB"))} (Tomorrow)</div>
            <div><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
            <div><strong>Missed:</strong> ${missedCount}</div>
            <div><strong>Tomorrow:</strong> ${tomorrowCount}</div>
          </div>
          ${tablesHtml}
          ${tomorrowCredits.length > 0 ? `<div class="grand-total">Grand Total Tomorrow + Missed Collection: Rs. ${grandTotal.toFixed(2)}</div>` : ""}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDownloadTomorrowCollection = () => {
    const tomorrowCredits = sortTomorrowCollectionCredits(
      filteredCredits.filter(isTomorrowOrMissedCollection)
    );

    let csv = "Sr No,Staff Name,Sale ID,Invoice No,Outlet Name,ERP ID,Issue Date,Due Date,Status,Outstanding Balance\n";
    tomorrowCredits.forEach((c, idx) => {
      csv += `${idx + 1},"${(c.staff_name || "").replace(/"/g, '""')}",` +
             `"${(c.sticker_number || "").replace(/"/g, '""')}",` +
             `"${(c.invoice_number || "").replace(/"/g, '""')}",` +
             `"${(c.outlet_name || "").replace(/"/g, '""')}",` +
             `"${(c.outlet_erp_id || "").replace(/"/g, '""')}",` +
             `"${formatDate(c.sale_date)}",` +
             `"${calcDueDate(c.sale_date, c.credit_days)}",` +
             `"${getCollectionDueLabel(c).replace(/"/g, '""')}",` +
             `${Number(c.balance_amount || 0).toFixed(2)}\n`;
    });

    const total = tomorrowCredits.reduce((sum, c) => sum + (Number(c.balance_amount) || 0), 0);
    csv += `,,,,,,,,,Total: Rs. ${total.toFixed(2)}\n`;

    downloadCSV("Tomorrow_Missed_Collection_Report.csv", csv);
  };

  const handlePrintNext2DaysCollection = () => {
    const next2DaysCredits = filteredCredits.filter((c) => {
      const diff = getDiffDays(c.sale_date, c.credit_days);
      return diff === 1 || diff === 2;
    });

    const grouped = groupCreditsByStaff(next2DaysCredits);
    const staffNames = Object.keys(grouped).sort();

    const companyLabel = selectedCompanyName || "All Companies";
    const staffLabel = selectedStaffName || "All Staff";
    const generatedOn = new Date().toLocaleString("en-GB");
    const grandTotal = next2DaysCredits.reduce((sum, c) => sum + (Number(c.balance_amount) || 0), 0);

    let tablesHtml = "";
    if (staffNames.length === 0) {
      tablesHtml = `<div class="empty">No collections due in the next 2 days.</div>`;
    } else {
      staffNames.forEach((staffName) => {
        const staffCredits = grouped[staffName];
        const staffTotal = staffCredits.reduce((sum, c) => sum + (Number(c.balance_amount) || 0), 0);
        const rows = staffCredits.map((c, idx) => {
          const diff = getDiffDays(c.sale_date, c.credit_days);
          const dueInLabel = diff === 1 ? "Tomorrow" : "In 2 Days";
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(c.sticker_number || "N/A")}</td>
              <td>${escapeHtml(c.invoice_number || "N/A")}</td>
              <td>${escapeHtml(c.outlet_name || "N/A")}</td>
              <td>${escapeHtml(c.outlet_erp_id || "N/A")}</td>
              <td>${escapeHtml(formatDate(c.sale_date))}</td>
              <td>${escapeHtml(calcDueDate(c.sale_date, c.credit_days))} (${dueInLabel})</td>
              <td class="right">Rs. ${Number(c.balance_amount || 0).toFixed(2)}</td>
            </tr>
          `;
        }).join("");

        tablesHtml += `
          <div class="staff-section">
            <h2>Staff: ${escapeHtml(staffName)}</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 5%">Sr</th>
                  <th style="width: 12%">Sale ID</th>
                  <th style="width: 15%">Invoice</th>
                  <th>Outlet Name</th>
                  <th style="width: 12%">ERP ID</th>
                  <th style="width: 14%">Issue Date</th>
                  <th style="width: 20%">Due Date</th>
                  <th style="width: 16%" class="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="staff-total-row">
                  <td colspan="7" class="right"><strong>Total for ${escapeHtml(staffName)}</strong></td>
                  <td class="right"><strong>Rs. ${staffTotal.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      });
    }

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Staff Wise Next 2 Days Collection Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; line-height: 1.4; }
            h1 { font-size: 20px; margin: 0 0 4px; text-transform: uppercase; color: #0f766e; }
            h2 { font-size: 14px; margin: 16px 0 6px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 20px; margin-bottom: 20px; font-size: 13px; background: #f0fdfa; padding: 12px; border-radius: 6px; border: 1px solid #99f6e4; }
            .meta strong { display: inline-block; min-width: 120px; color: #0f766e; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background: #f0fdfa; font-weight: 700; color: #0f766e; }
            .right { text-align: right; }
            .staff-section { margin-bottom: 24px; page-break-inside: avoid; }
            .staff-total-row { background: #f0fdfa; }
            .grand-total { margin-top: 20px; padding: 12px; text-align: right; font-size: 16px; font-weight: 700; background: #ccfbf1; color: #0f766e; border-radius: 6px; border: 1px solid #99f6e4; }
            .empty { padding: 30px; text-align: center; color: #64748b; border: 1px solid #cbd5e1; border-radius: 6px; }
            @media print {
              body { margin: 12mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Staff-Wise Next 2 Days Collection Report</h1>
          <div style="color: #4b5563; font-size: 12px; margin-bottom: 12px;">Report of pending credit balances due in the next 2 days (tomorrow and day after tomorrow).</div>
          <div class="meta">
            <div><strong>Company:</strong> ${escapeHtml(companyLabel)}</div>
            <div><strong>Staff:</strong> ${escapeHtml(staffLabel)}</div>
            <div><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
            <div><strong>Total Collection:</strong> Rs. ${grandTotal.toFixed(2)}</div>
          </div>
          ${tablesHtml}
          ${next2DaysCredits.length > 0 ? `<div class="grand-total">Grand Total Next 2 Days Collection: Rs. ${grandTotal.toFixed(2)}</div>` : ""}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDownloadNext2DaysCollection = () => {
    const next2DaysCredits = filteredCredits.filter((c) => {
      const diff = getDiffDays(c.sale_date, c.credit_days);
      return diff === 1 || diff === 2;
    });

    next2DaysCredits.sort((a, b) => (a.staff_name || "").localeCompare(b.staff_name || ""));

    let csv = "Sr No,Staff Name,Sale ID,Invoice No,Outlet Name,ERP ID,Issue Date,Due Date,Outstanding Balance\n";
    next2DaysCredits.forEach((c, idx) => {
      csv += `${idx + 1},"${(c.staff_name || "").replace(/"/g, '""')}",` +
             `"${(c.sticker_number || c.bp_sale_id || "").replace(/"/g, '""')}",` +
             `"${(c.invoice_number || "").replace(/"/g, '""')}",` +
             `"${(c.outlet_name || "").replace(/"/g, '""')}",` +
             `"${(c.outlet_erp_id || "").replace(/"/g, '""')}",` +
             `"${formatDate(c.sale_date)}",` +
             `"${calcDueDate(c.sale_date, c.credit_days)}",` +
             `${Number(c.balance_amount || 0).toFixed(2)}\n`;
    });

    const total = next2DaysCredits.reduce((sum, c) => sum + (Number(c.balance_amount) || 0), 0);
    csv += `,,,,,,,,Total: Rs. ${total.toFixed(2)}\n`;

    downloadCSV("Next_2_Days_Collection_Report.csv", csv);
  };

  const handlePrintOverdueReport = () => {
    const overdueCredits = filteredCredits.filter((c) => {
      const diff = getDiffDays(c.sale_date, c.credit_days);
      return diff !== null && diff < 0;
    });

    const grouped = groupCreditsByStaff(overdueCredits);
    const staffNames = Object.keys(grouped).sort();

    const companyLabel = selectedCompanyName || "All Companies";
    const staffLabel = selectedStaffName || "All Staff";
    const generatedOn = new Date().toLocaleString("en-GB");
    const grandTotal = overdueCredits.reduce((sum, c) => sum + (Number(c.balance_amount) || 0), 0);

    let tablesHtml = "";
    if (staffNames.length === 0) {
      tablesHtml = `<div class="empty">No overdue credits found.</div>`;
    } else {
      staffNames.forEach((staffName) => {
        const staffCredits = grouped[staffName];
        const staffTotal = staffCredits.reduce((sum, c) => sum + (Number(c.balance_amount) || 0), 0);
        const rows = staffCredits.map((c, idx) => {
          const diff = getDiffDays(c.sale_date, c.credit_days);
          const overdueDays = diff ? Math.abs(diff) : 0;
          return `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(c.sticker_number || c.bp_sale_id || "N/A")}</td>
              <td>${escapeHtml(c.invoice_number || "N/A")}</td>
              <td>${escapeHtml(c.outlet_name || "N/A")}</td>
              <td>${escapeHtml(c.outlet_erp_id || "N/A")}</td>
              <td>${escapeHtml(formatDate(c.sale_date))}</td>
              <td>${escapeHtml(calcDueDate(c.sale_date, c.credit_days))}</td>
              <td class="right">${overdueDays} days</td>
              <td class="right">Rs. ${Number(c.balance_amount || 0).toFixed(2)}</td>
            </tr>
          `;
        }).join("");

        tablesHtml += `
          <div class="staff-section">
            <h2>Staff: ${escapeHtml(staffName)}</h2>
            <table>
              <thead>
                <tr>
                  <th style="width: 5%">Sr</th>
                  <th style="width: 12%">Sale ID</th>
                  <th style="width: 15%">Invoice</th>
                  <th>Outlet Name</th>
                  <th style="width: 12%">ERP ID</th>
                  <th style="width: 14%">Issue Date</th>
                  <th style="width: 14%">Due Date</th>
                  <th style="width: 12%" class="right">Overdue</th>
                  <th style="width: 16%" class="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="staff-total-row">
                  <td colspan="8" class="right"><strong>Total Overdue for ${escapeHtml(staffName)}</strong></td>
                  <td class="right"><strong>Rs. ${staffTotal.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      });
    }

    const printWindow = window.open("", "_blank", "width=1100,height=800");
    if (!printWindow) {
      alert("Please allow popups to print the report.");
      return;
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Staff Wise Overdue Report</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 28px; line-height: 1.4; }
            h1 { font-size: 20px; margin: 0 0 4px; text-transform: uppercase; color: #dc2626; }
            h2 { font-size: 14px; margin: 16px 0 6px; color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
            .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 20px; margin-bottom: 20px; font-size: 13px; background: #fef2f2; padding: 12px; border-radius: 6px; border: 1px solid #fecaca; }
            .meta strong { display: inline-block; min-width: 120px; color: #991b1b; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background: #fef2f2; font-weight: 700; color: #991b1b; }
            .right { text-align: right; }
            .staff-section { margin-bottom: 24px; page-break-inside: avoid; }
            .staff-total-row { background: #fef2f2; }
            .grand-total { margin-top: 20px; padding: 12px; text-align: right; font-size: 16px; font-weight: 700; background: #fef2f2; color: #b91c1c; border-radius: 6px; border: 1px solid #fca5a5; }
            .empty { padding: 30px; text-align: center; color: #64748b; border: 1px solid #cbd5e1; border-radius: 6px; }
            @media print {
              body { margin: 12mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Staff-Wise Overdue Report</h1>
          <div style="color: #4b5563; font-size: 12px; margin-bottom: 12px;">Report of pending credit balances past their due date.</div>
          <div class="meta">
            <div><strong>Company:</strong> ${escapeHtml(companyLabel)}</div>
            <div><strong>Staff:</strong> ${escapeHtml(staffLabel)}</div>
            <div><strong>Generated:</strong> ${escapeHtml(generatedOn)}</div>
            <div><strong>Total Overdue:</strong> Rs. ${grandTotal.toFixed(2)}</div>
          </div>
          ${tablesHtml}
          ${overdueCredits.length > 0 ? `<div class="grand-total">Grand Total Overdue for Staff: Rs. ${grandTotal.toFixed(2)}</div>` : ""}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleDownloadOverdueReport = () => {
    const overdueCredits = filteredCredits.filter((c) => {
      const diff = getDiffDays(c.sale_date, c.credit_days);
      return diff !== null && diff < 0;
    });

    overdueCredits.sort((a, b) => (a.staff_name || "").localeCompare(b.staff_name || ""));

    let csv = "Sr No,Staff Name,Sale ID,Invoice No,Outlet Name,ERP ID,Issue Date,Due Date,Overdue Days,Outstanding Balance\n";
    overdueCredits.forEach((c, idx) => {
      const diff = getDiffDays(c.sale_date, c.credit_days);
      const overdueDays = diff ? Math.abs(diff) : 0;
      csv += `${idx + 1},"${(c.staff_name || "").replace(/"/g, '""')}",` +
             `"${(c.sticker_number|| "").replace(/"/g, '""')}",` +
             `"${(c.invoice_number || "").replace(/"/g, '""')}",` +
             `"${(c.outlet_name || "").replace(/"/g, '""')}",` +
             `"${(c.outlet_erp_id || "").replace(/"/g, '""')}",` +
             `"${formatDate(c.sale_date)}",` +
             `"${calcDueDate(c.sale_date, c.credit_days)}",` +
             `${overdueDays},` +
             `${Number(c.balance_amount || 0).toFixed(2)}\n`;
    });

    const total = overdueCredits.reduce((sum, c) => sum + (Number(c.balance_amount) || 0), 0);
    csv += `,,,,,,,,,Total: Rs. ${total.toFixed(2)}\n`;

    downloadCSV("Staff_Wise_Overdue_Report.csv", csv);
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={6}>
          <Grid item xs={12}>
            <Card>
              <MDBox
                mx={2}
                mt={-3}
                py={3}
                px={2}
                variant="gradient"
                bgColor="info"
                borderRadius="lg"
                coloredShadow="info"
              >
                <MDTypography variant="h6" color="white">
                  Pending Credits Tracker
                </MDTypography>
              </MDBox>

              <MDBox px={3} pt={3} pb={1}>
                <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={6} lg={3}>
                    <MDInput
                      type="text"
                      label="Search Outlet, Contact, Invoice, Staff, or Sale ID..."
                      fullWidth
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <FormControl size="small" fullWidth>
                      <InputLabel id="credit-company-filter-label">Company</InputLabel>
                      <Select
                        labelId="credit-company-filter-label"
                        value={selectedCompanyId}
                        label="Company"
                        onChange={(e) => handleCompanyChange(e.target.value)}
                        sx={{ height: 44 }}
                      >
                        <MenuItem value="">All Companies</MenuItem>
                        {companyOptions.map((company) => (
                          <MenuItem key={company.id} value={company.id}>
                            {company.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={6} lg={3}>
                    <FormControl size="small" fullWidth>
                      <InputLabel id="credit-staff-filter-label">Staff</InputLabel>
                      <Select
                        labelId="credit-staff-filter-label"
                        value={selectedStaffId}
                        label="Staff"
                        onChange={(e) => setSelectedStaffId(e.target.value)}
                        sx={{ height: 44 }}
                      >
                        <MenuItem value="">All Staff</MenuItem>
                        {staffOptions.map((staff) => (
                          <MenuItem key={staff.id} value={staff.id}>
                            {staff.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  {showPrintButton && (
                    <Grid item xs={6} md={4} lg={2}>
                      {/* <MDButton
                        color="dark"
                        variant="outlined"
                        fullWidth */}
                        {/* onClick={handlePrintPdf}
                        disabled={filteredCredits.length === 0}
                        sx={{ height: 44 }} */}
                      {/* > */}
                        <IoPrintOutline  onClick={() => handlePrintPdf()}                         disabled={filteredCredits.length === 0}
 style={{ cursor: "pointer" }} color="#6C9CF0" size={20}/> 
                        
                      {/* </MDButton> */}
                    </Grid>
                  )}
                 
                  <Grid item xs={6} md={3} lg={2}>
                    <MDBox display="flex" justifyContent={{ xs: "flex-start", md: "flex-end" }}>
                      <MDBox
                        px={2}
                        py={1.25}
                        borderRadius="lg"
                        sx={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}
                      >
                        <MDTypography variant="caption" color="text">
                          {totalCreditLabel}
                        </MDTypography>
                        <MDTypography variant="h5" color="error" fontWeight="bold">
                          ₹{totalCreditDuesAmount.toFixed(2)}
                        </MDTypography>
                      </MDBox>
                    </MDBox>
                  </Grid>
                </Grid>
              </MDBox>

              <MDBox px={3} pt={1} pb={2} display="flex" flexDirection="column" gap={1.5} sx={{ borderBottom: "1px solid #f0f2f5" }}>
                <MDTypography variant="subtitle2" fontWeight="bold" color="text">
                  Staff-Wise Reports:
                </MDTypography>
                <MDBox display="flex" gap={2} flexWrap="wrap" alignItems="center">
                  {/* Tomorrow's Due Collection */}
                  <MDBox display="flex" gap={1} alignItems="center" sx={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                    <MDTypography variant="button" fontWeight="medium" color="dark" sx={{ mr: 1 }}>
                      Tomorrow + Missed:
                    </MDTypography>
                    <MDButton
                      color="info"
                      variant="gradient"
                      size="small"
                      onClick={handlePrintTomorrowCollection}
                      sx={{ py: 1 }}
                    >
                      <Icon sx={{ mr: 0.5 }}>print</Icon> Print
                    </MDButton>
                    <MDButton
                      color="info"
                      variant="outlined"
                      size="small"
                      onClick={handleDownloadTomorrowCollection}
                      sx={{ py: 1 }}
                    >
                      <Icon sx={{ mr: 0.5 }}>download</Icon> CSV
                    </MDButton>
                  </MDBox>

                  {/* Next 2 Days Due Collection */}
                  <MDBox display="flex" gap={1} alignItems="center" sx={{ background: "#f0fdfa", padding: "8px 12px", borderRadius: "8px", border: "1px solid #99f6e4" }}>
                    <MDTypography variant="button" fontWeight="medium" color="dark" sx={{ mr: 1 }}>
                      Next 2 Days Collection:
                    </MDTypography>
                    <MDButton
                      color="success"
                      variant="gradient"
                      size="small"
                      onClick={handlePrintNext2DaysCollection}
                      sx={{ py: 1 }}
                    >
                      <Icon sx={{ mr: 0.5 }}>print</Icon> Print
                    </MDButton>
                    <MDButton
                      color="success"
                      variant="outlined"
                      size="small"
                      onClick={handleDownloadNext2DaysCollection}
                      sx={{ py: 1 }}
                    >
                      <Icon sx={{ mr: 0.5 }}>download</Icon> CSV
                    </MDButton>
                  </MDBox>

                  {/* Overdue Credits */}
                  <MDBox display="flex" gap={1} alignItems="center" sx={{ background: "#fef2f2", padding: "8px 12px", borderRadius: "8px", border: "1px solid #fecaca" }}>
                    <MDTypography variant="button" fontWeight="medium" color="dark" sx={{ mr: 1 }}>
                      Overdue Report:
                    </MDTypography>
                    <MDButton
                      color="error"
                      variant="gradient"
                      size="small"
                      onClick={handlePrintOverdueReport}
                      sx={{ py: 1 }}
                    >
                      <Icon sx={{ mr: 0.5 }}>print</Icon> Print
                    </MDButton>
                    <MDButton
                      color="error"
                      variant="outlined"
                      size="small"
                      onClick={handleDownloadOverdueReport}
                      sx={{ py: 1 }}
                    >
                      <Icon sx={{ mr: 0.5 }}>download</Icon> CSV
                    </MDButton>
                  </MDBox>
                </MDBox>
              </MDBox>

              <MDBox pb={4} px={3}>
                <TableContainer
                  component={Paper}
                  sx={{ boxShadow: "none", backgroundColor: "transparent" }}
                >
                  <Table size="small">
                    <TableHead sx={{ display: "table-header-group" }}>
                      <TableRow>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Sr No
                        </TableCell>
                        <TableCell align="left" sx={{ fontWeight: "bold" }}>
                          Outlet Name
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          ERP ID
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Contact No
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Sale ID
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Invoice No
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Staff
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Outstanding Balance
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Issue Date
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Due Date
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Status
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: "bold" }}>
                          Action
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredCredits.map((credit, index) => (
                        <TableRow key={credit.id} sx={getCreditRowSx(credit)}>
                          <TableCell align="center">{index + 1}</TableCell>
                          <TableCell align="left">{credit.outlet_name}</TableCell>
                          <TableCell align="center">{credit.outlet_erp_id || "N/A"}</TableCell>
                          <TableCell align="center">{credit.contact_number || "N/A"}</TableCell>
                          <TableCell align="center">{credit.sticker_number}</TableCell>
                          <TableCell align="center">{credit.invoice_number}</TableCell>
                          <TableCell align="center">{credit.staff_name}</TableCell>
                          <TableCell
                            align="center"
                            sx={{ color: "error.main", fontWeight: "bold" }}
                          >
                            ₹{Number(credit.balance_amount).toFixed(2)}
                          </TableCell>
                          <TableCell align="center">{formatDate(credit.sale_date)}</TableCell>
                          <TableCell align="center">
                            {calcDueDate(credit.sale_date, credit.credit_days)}
                          </TableCell>
                          <TableCell align="center">
                            {getStatus(credit.sale_date, credit.credit_days)}
                          </TableCell>
                          <TableCell align="center">
                            <MDBox display="flex" gap={0.5} justifyContent="center" alignItems="center">
                              <MDButton
                                color="info"
                                variant="outlined"
                                size="small"
                                onClick={() => openEditRemarks(credit)}
                              >
                                Remarks
                              </MDButton>
                              <Tooltip title={(Number(credit.remarks_count) || 0) > 0 ? "View remarks" : "No remarks yet"}>
                                <span>
                                  <IconButton
                                    size="small"
                                    color={(Number(credit.remarks_count) || 0) > 0 ? "info" : "default"}
                                    disabled={(Number(credit.remarks_count) || 0) === 0}
                                    onClick={() => openViewRemarks(credit)}
                                  >
                                    <Icon fontSize="small">visibility</Icon>
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </MDBox>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredCredits.length === 0 && (
                    <MDBox mt={4} textAlign="center">
                      <MDTypography variant="body2" color="text">
                        No outstanding credits found in the system!
                      </MDTypography>
                    </MDBox>
                  )}
                </TableContainer>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />

      <Dialog
        open={remarksDialog.open}
        onClose={closeRemarksDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {remarksDialog.mode === "view" ? "View Remarks" : "Add Remarks"}
        </DialogTitle>
        <DialogContent dividers>
          {remarksDialog.credit && (
            <MDBox mb={2}>
              <MDTypography variant="button" fontWeight="medium">
                {remarksDialog.credit.outlet_name} - {remarksDialog.credit.sticker_number} - {remarksDialog.credit.invoice_number}
              </MDTypography>
            </MDBox>
          )}
          {remarksDialog.mode === "view" ? (
            loadingRemarks ? (
              <MDTypography variant="body2" color="text">
                Loading remarks...
              </MDTypography>
            ) : remarksHistory.length > 0 ? (
              <Table size="small">
                <TableHead sx={{ display: "table-header-group" }}>
                  <TableRow>
                    <TableCell align="center" sx={{ fontWeight: "bold", width: 120 }}>
                      Date
                    </TableCell>
                    <TableCell align="left" sx={{ fontWeight: "bold" }}>
                      Remarks
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {remarksHistory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell align="center">{formatDate(item.remark_date)}</TableCell>
                      <TableCell align="left" sx={{ whiteSpace: "pre-wrap" }}>
                        {item.remarks}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <MDTypography variant="body2" color="text">
                No remarks added.
              </MDTypography>
            )
          ) : (
            <MDBox>
              <MDBox mb={2}>
                <MDInput
                  type="date"
                  label="Remarks Date"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={remarksDate}
                  onChange={(e) => setRemarksDate(e.target.value)}
                />
              </MDBox>
              <MDInput
                type="text"
                label="Remarks"
                fullWidth
                multiline
                rows={4}
                value={remarksText}
                onChange={(e) => setRemarksText(e.target.value)}
                placeholder="Enter follow-up notes, payment promise, etc."
              />
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton color="secondary" onClick={closeRemarksDialog}>
            {remarksDialog.mode === "view" ? "Close" : "Cancel"}
          </MDButton>
          {remarksDialog.mode === "edit" && (
            <MDButton
              color="info"
              variant="gradient"
              onClick={handleSaveRemarks}
              disabled={savingRemarks}
            >
              {savingRemarks ? "Saving..." : "Save"}
            </MDButton>
          )}
        </DialogActions>
      </Dialog>
    </DashboardLayout>
  );
}

export default CreditsPage;
