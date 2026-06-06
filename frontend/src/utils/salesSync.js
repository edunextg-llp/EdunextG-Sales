import { useEffect } from "react";

export const SALES_POLL_INTERVAL_MS = 8000;

export const toDateInputValue = (value) => {
  if (!value) return "";
  return String(value).split("T")[0].split(" ")[0];
};

export const enhancePackagingRow = (row) => ({
  ...row,
  original_packaging_status: row.packaging_status,
  status_update_date: toDateInputValue(row.status_updated_at),
  status_update_date_changed: false,
});

export const enhanceDeliveryRow = (row) => ({
  ...row,
  original_packaging_status: row.packaging_status,
  _localDirty: false,
});

export const isPackagingRowDirty = (row) =>
  row.packaging_status !== row.original_packaging_status || row.status_update_date_changed;

export const isDeliveryRowDirty = (row) =>
  Boolean(row._localDirty) || row.packaging_status !== row.original_packaging_status;

export const mergeSalesRows = (serverRows, localRows, enhanceFn, isDirtyFn) => {
  const localById = new Map(localRows.map((row) => [row.id, row]));

  return serverRows.map((serverRow) => {
    const local = localById.get(serverRow.id);
    if (local && isDirtyFn(local)) {
      return local;
    }
    return enhanceFn(serverRow);
  });
};

export const useSalesPolling = (fetchSales, intervalMs = SALES_POLL_INTERVAL_MS) => {
  useEffect(() => {
    const poll = () => {
      if (!document.hidden) {
        fetchSales({ silent: true });
      }
    };

    const intervalId = setInterval(poll, intervalMs);
    const handleVisibility = () => {
      if (!document.hidden) {
        fetchSales({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchSales, intervalMs]);
};
