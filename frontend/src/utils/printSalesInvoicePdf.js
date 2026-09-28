import ejs from "ejs/ejs.min.js";

import salesInvoicePrintTemplate from "templates/salesInvoicePrintTemplate";

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

const mapProducts = (sale) => {
  const lineItems = Array.isArray(sale.lineItems) ? sale.lineItems : [];

  if (lineItems.length > 0) {
    return lineItems.map((item) => {
      const qty = Number(item.qty) || 0;
      const rate = Number(item.rate) || 0;
      const amount = qty * rate;
      const name = `${item.productName || "Item"}${item.variantName ? `, ${item.variantName}` : ""}`;
      return {
        name,
        unit: "PCS",
        qty,
        rateText: formatMoneyForPrint(rate),
        amountText: formatMoneyForPrint(amount),
      };
    });
  }

  const qty = Number(sale.itemCount) || 1;
  const amount = Number(sale.amount) || 0;
  const rate = qty > 0 ? amount / qty : amount;

  return [
    {
      name: "Sale item(s)",
      unit: "PCS",
      qty,
      rateText: formatMoneyForPrint(rate),
      amountText: formatMoneyForPrint(amount),
    },
  ];
};

/**
 * Print / download sales invoice PDF for one outlet (all invoices for that outlet).
 * Template design follows cashCountingPrintTemplate letterhead style.
 */
export function printSalesInvoicePdf({
  outletName,
  outletErpId = "",
  locationName = "",
  saleDate,
  staffName = "",
  companyName = "",
  invoices = [],
}) {
  if (!invoices.length) {
    alert("No invoice data available to print.");
    return;
  }

  const printableInvoices = invoices.map((sale) => ({
    invoiceNumber: sale.invoiceNumber || "—",
    stickerNumber: sale.stickerNumber || "—",
    itemCount: sale.itemCount || "—",
    amountText: formatMoneyForPrint(sale.amount),
    products: mapProducts(sale),
  }));

  const grandTotalValue = invoices.reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0);

  const html = ejs.render(salesInvoicePrintTemplate, {
    companyName: "BAWARCHEE FOOD PACKAGING PRIVATE LIMITED",
    companySubtitle: "Sales Invoice / Outlet Bill Report",
    companyAddress:
      "Head Office: Holding No. 82, 121 Aswini Dutta Road, South Dum Dum, PO - Dum Dum, PS - Baguiati, South Dum Dum Municipality, Distt - North 24 Paragnas, West Bengal - 700028",
    companyLegal: "CIN: U15549WB2021PTC245833    GSTN: 19AAJCB9178Q1ZJ    PAN NUMBER: AAJCB9178Q",
    outletName: outletName || "—",
    outletErpId: outletErpId || "—",
    locationName: locationName || "—",
    saleDate: saleDate || "—",
    staffName: staffName || "—",
    companyLabel: companyName || "—",
    invoiceCount: printableInvoices.length,
    invoices: printableInvoices,
    grandTotal: formatMoneyForPrint(grandTotalValue),
    amountInWords: numberToIndianWords(grandTotalValue),
  });

  const printWindow = window.open("", "_blank", "width=900,height=900");
  if (!printWindow) {
    alert("Please allow popups to download the sales invoice PDF.");
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
