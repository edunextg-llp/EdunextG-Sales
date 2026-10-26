// Fixed invoice-number prefixes per company. The user only types the part after the prefix.
const INVOICE_PREFIXES = [
  { match: /everest/i, prefix: "16078314" },
  { match: /l'?or[eiy]+a?l/i, prefix: "IN1009850260" }, // Loriel / Loryal / L'Oreal
];

// Company names imported from the ERP may use L'Oréal's accented character
// or a typographic apostrophe. Match those the same as plain "Loreal".
const normalizeCompanyName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'");

export const getInvoicePrefix = (companyName) =>
  INVOICE_PREFIXES.find(({ match }) => match.test(normalizeCompanyName(companyName)))?.prefix || "";

// Part shown in the input box (the prefix is shown beside it).
export const getInvoiceSuffix = (invoiceNumber, prefix) => {
  const value = String(invoiceNumber || "");
  return prefix && value.startsWith(prefix) ? value.slice(prefix.length) : value;
};

// Full invoice number to store. Empty when nothing was typed, so blank rows stay blank.
export const buildInvoiceNumber = (typed, prefix) => {
  const suffix = getInvoiceSuffix(String(typed || "").trim(), prefix);
  return suffix ? `${prefix}${suffix}` : "";
};
