export const API = process.env.REACT_APP_API_URL;

export const STATUS_LABELS = {
  not_packing: "Not Packing",
  packing: "Packing In Progress",
  packing_done: "Packing Done",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const STATUS_ORDER = ["not_packing", "packing", "packing_done", "out_for_delivery", "delivered"];

export const STATUS_COLORS = {
  not_packing: "default",
  packing: "warning",
  packing_done: "info",
  out_for_delivery: "primary",
  delivered: "success",
  cancelled: "error",
  returned: "secondary",
};

export const PAYMENT_LABELS = {
  cash: "Cash",
  upi: "UPI",
  credit: "Credit",
  cheque: "Cheque",
};

// The theme renders TableHead as a block; tables here need normal column alignment.
export const TABLE_HEAD_SX = { display: "table-header-group", padding: 0 };

export function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

export function formatDate(value) {
  if (!value) return "N/A";
  const dateOnly = String(value).split("T")[0].split(" ")[0];
  const parts = dateOnly.split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return value;
}

export function formatDateTime(value) {
  if (!value) return "N/A";
  const [datePart, timePart = ""] = String(value).split(/[T ]/);
  return `${formatDate(datePart)}${timePart ? ` ${timePart.slice(0, 8)}` : ""}`;
}

export function formatCancelQtyDisplay(cancellation) {
  if (cancellation?.product_qty != null && cancellation.product_qty !== "") {
    return Number(cancellation.product_qty);
  }
  const legacyValue = String(cancellation?.product_size ?? "").trim();
  if (legacyValue && !Number.isNaN(Number(legacyValue))) {
    return Number(legacyValue);
  }
  return "—";
}

export async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

// Outlets are identified by ERP ID; the lookup key is its trimmed upper-case form.
export function outletKeyOf(erpId) {
  return String(erpId || "").trim().toUpperCase();
}
