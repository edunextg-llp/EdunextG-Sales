import ejs from "ejs/ejs.min.js";

import purchaseRequisitionPrintTemplate from "templates/purchaseRequisitionPrintTemplate";

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const fmt = (value, decimals = 2) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const twoDigitWords = (value) => {
  if (value < 20) return ONES[value];
  return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${ONES[value % 10]}` : ""}`;
};

const numberToIndianWords = (value) => {
  const amount = Math.round(Number(value) || 0);
  if (amount === 0) return "Zero Rupees";

  const parts = [];
  const crore = Math.floor(amount / 10000000);
  const lakh = Math.floor((amount % 10000000) / 100000);
  const thousand = Math.floor((amount % 100000) / 1000);
  const hundred = Math.floor((amount % 1000) / 100);
  const remainder = amount % 100;

  if (crore) parts.push(`${numberToIndianWords(crore).replace(" Rupees", "")} Crore`);
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (remainder) parts.push(twoDigitWords(remainder));

  return `${parts.join(" ")} Rupees`;
};

const formatInvoiceDate = (value) => {
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

const mapLineItems = (items = []) => {
  let orderQty = 0;
  let invoiceQty = 0;
  let netAmount = 0;
  let taxableValue = 0;
  let gstAmount = 0;
  let totalValue = 0;

  const rows = items.map((item, index) => {
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const gstPercent = Number(item.gst_percent) || 5;
    const net = qty * rate;
    const secondaryDiscount = 0;
    const cashDiscount = 0;
    const taxable = net - secondaryDiscount - cashDiscount;
    const gst = (taxable * gstPercent) / 100;
    const total = taxable + gst;

    orderQty += qty;
    invoiceQty += qty;
    netAmount += net;
    taxableValue += taxable;
    gstAmount += gst;
    totalValue += total;

    return {
      sno: index + 1,
      itemName: item.product_name || item.productName || "—",
      variantName: item.variant_name || item.variantName || "—",
      hsnCode: item.hsn_code || item.hsnCode || "—",
      mrp: fmt(item.mrp),
      orderQty: fmt(qty, qty % 1 === 0 ? 0 : 2),
      freeQty: "0",
      invoiceQty: fmt(qty, qty % 1 === 0 ? 0 : 2),
      pricePerPiece: fmt(rate),
      netAmount: fmt(net),
      secondaryDiscount: fmt(secondaryDiscount),
      cashDiscount: fmt(cashDiscount),
      taxableValue: fmt(taxable),
      gstPercent: fmt(gstPercent, gstPercent % 1 === 0 ? 0 : 2),
      gstAmount: fmt(gst),
      totalValue: fmt(total),
    };
  });

  const cgst = gstAmount / 2;
  const sgst = gstAmount / 2;

  return {
    rows,
    totals: {
      orderQty: fmt(orderQty, orderQty % 1 === 0 ? 0 : 2),
      freeQty: "0",
      invoiceQty: fmt(invoiceQty, invoiceQty % 1 === 0 ? 0 : 2),
      netAmount: fmt(netAmount),
      secondaryDiscount: fmt(0),
      cashDiscount: fmt(0),
      taxableValue: fmt(taxableValue),
      gstAmount: fmt(gstAmount),
      totalValue: fmt(totalValue),
      cgst: fmt(cgst),
      sgst: fmt(sgst),
    },
    payable: totalValue,
  };
};

const renderPurchaseRequisition = (requisition) => {
  const { rows, totals, payable } = mapLineItems(requisition.items || []);
  const beatRoute = requisition.location_name || requisition.outlet_day || "—";

  return ejs.render(purchaseRequisitionPrintTemplate, {
    requisitionNumber: requisition.requisition_number || "—",
    invoiceNumber: requisition.invoiced_invoice_number || "—",
    invoiceDate: formatInvoiceDate(requisition.created_at),
    sellerName: "BAWARCHEE FOOD PACKAGING PRIVATE LIMITED",
    sellerAddress: "121, ASWANI DUTTA ROAD, SOUTH DUM DUM P.S,BAGUIATI,NORTH 24 PARGANAS",
    sellerFssai: "—",
    sellerGst: "19AAJCB9178Q1ZJ",
    sellerPan: "AAJCB9178Q",
    sellerPhone: "9088399919",
    buyerName: requisition.outlet_name || "—",
    buyerAddress: requisition.outlet_address || "—",
    buyerFssai: "—",
    buyerGst: requisition.has_gst ? (requisition.gst_number || "—") : "—",
    buyerPan: "—",
    buyerPhone: requisition.outlet_contact || "—",
    buyerErpId: requisition.outlet_erp_id || "—",
    salesmanName: requisition.staff_name || "—",
    beatName: beatRoute,
    routeName: beatRoute,
    employeeContact: requisition.staff_contact || "—",
    items: rows,
    totals,
    amountInWords: numberToIndianWords(payable),
    remarks: requisition.company_name ? `Company: ${requisition.company_name}` : "—",
    roundOff: fmt(0),
  });
};

const openPrintWindow = (html) => {

  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) {
    alert("Please allow popups to print the requisition invoice.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
};

export function printPurchaseRequisitionPdf(requisition) {
  if (!requisition) {
    alert("No requisition data available to print.");
    return;
  }

  openPrintWindow(renderPurchaseRequisition(requisition));
}

export function printPurchaseRequisitionsPdf(requisitions = []) {
  const printable = requisitions.filter(Boolean);
  if (!printable.length) {
    alert("Select at least one requisition to print.");
    return;
  }

  const rendered = printable.map(renderPurchaseRequisition);
  const styles = rendered[0].match(/<style>[\s\S]*?<\/style>/i)?.[0] || "";
  const pages = rendered.map((html) => {
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
    return `<section class="print-document">${body}</section>`;
  }).join("");
  const title = printable.map((row) => row.requisition_number).filter(Boolean).join(", ");

  openPrintWindow(`<!DOCTYPE html><html><head><meta charset="utf-8" />
    <title>Selected Requisitions - ${title}</title>${styles}
    <style>.print-document { break-after: page; page-break-after: always; }
    .print-document:last-child { break-after: auto; page-break-after: auto; }</style>
    </head><body>${pages}</body></html>`);
}
