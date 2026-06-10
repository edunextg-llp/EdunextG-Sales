import ejs from "ejs/ejs.min.js";

import chequeDepositPrintTemplate from "templates/chequeDepositPrintTemplate";

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const formatMoneyForPrint = (value) =>
  `Rs. ${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const twoDigitWords = (value) => {
  if (value < 20) return ONES[value];
  return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${ONES[value % 10]}` : ""}`;
};

const numberToIndianWords = (value) => {
  const amount = Math.floor(Number(value) || 0);
  if (amount === 0) return "Zero Rupees Only";

  const parts = [];
  const crore = Math.floor(amount / 10000000);
  const lakh = Math.floor((amount % 10000000) / 100000);
  const thousand = Math.floor((amount % 100000) / 1000);
  const hundred = Math.floor((amount % 1000) / 100);
  const remainder = amount % 100;

  if (crore) parts.push(`${numberToIndianWords(crore).replace(" Rupees Only", "")} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (remainder) parts.push(twoDigitWords(remainder));

  return `${parts.join(" ")} Rupees Only`;
};

export function printChequeDepositPdf(chequeDepositData) {
  const printableRows = chequeDepositData.rows.map((row) => ({
    ...row,
    amountText: formatMoneyForPrint(row.amount),
  }));

  const html = ejs.render(chequeDepositPrintTemplate, {
    companyName: "BAWARCHEE FOOD PACKAGING PRIVATE LIMITED",
    companySubtitle: "Cheque Deposit Print",
    companyAddress:
      "Head Office: Holding No. 82, 121 Aswini Dutta Road, South Dum Dum, PO - Dum Dum, PS - Baguiati, South Dum Dum Municipality, Distt - North 24 Paragnas, West Bengal - 700028",
    companyLegal: "CIN: U15549WB2021PTC245833    GSTN: 19AAJCB9178Q1ZJ    PAN NUMBER: AAJCB9178Q",
    ...chequeDepositData,
    depositRefNo: chequeDepositData.depositRefNo || "Generated after save",
    rows: printableRows,
    totalAmount: formatMoneyForPrint(chequeDepositData.total),
    amountInWords: numberToIndianWords(chequeDepositData.total),
  });

  const printWindow = window.open("", "_blank", "width=900,height=900");
  if (!printWindow) {
    alert("Please allow popups to print cheque deposit PDF.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 250);
}
