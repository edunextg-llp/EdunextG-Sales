import ejs from "ejs/ejs.min.js";

import cashCountingPrintTemplate from "templates/cashCountingPrintTemplate";

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

export function printCashCountingPdf(cashCountingData) {
  const printableRows = cashCountingData.rows.map((row) => ({
    ...row,
    amount: formatMoneyForPrint(row.total),
  }));

  const html = ejs.render(cashCountingPrintTemplate, {
    companyName: "BAWARCHEE FOOD PACKAGING PRIVATE LIMITED",
    companySubtitle: "Cash Deposit / Cash Counting Print",
    ...cashCountingData,
    noteRows: printableRows.filter((row) => row.type === "Note"),
    coinRows: printableRows.filter((row) => row.type === "Coin"),
    totalAmount: formatMoneyForPrint(cashCountingData.total),
    amountInWords: numberToIndianWords(cashCountingData.total),
  });

  const printWindow = window.open("", "_blank", "width=900,height=900");
  if (!printWindow) {
    alert("Please allow popups to print cash counting PDF.");
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
