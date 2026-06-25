import { useEffect } from "react";

export const SALES_POLL_INTERVAL_MS = 8000;

export const toDateInputValue = (value) => {
  if (!value) return "";
  return String(value).split("T")[0].split(" ")[0];
};

export const enhancePackagingRow = (row) => ({
  ...row,
  packed_item_count: row.packed_item_count ?? row.item_count ?? "",
  box_count: row.box_count ?? "",
  original_packed_item_count: row.packed_item_count ?? row.item_count ?? "",
  original_box_count: row.box_count ?? "",
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
  row.packaging_status !== row.original_packaging_status ||
  row.status_update_date_changed ||
  String(row.packed_item_count ?? "") !== String(row.original_packed_item_count ?? "") ||
  String(row.box_count ?? "") !== String(row.original_box_count ?? "");

export const isDeliveryRowDirty = (row) =>
  Boolean(row._localDirty) || row.packaging_status !== row.original_packaging_status;

export const mergeSalesRows = (
  serverRows,
  localRows,
  enhanceFn,
  isDirtyFn,
  recentlySavedMap = null
) => {
  const localById = new Map(localRows.map((row) => [row.id, row]));
  const now = Date.now();

  return serverRows.map((serverRow) => {
    const local = localById.get(serverRow.id);

    if (serverRow.packaging_status === "cancelled") {
      return enhanceFn(serverRow);
    }

    if (local && recentlySavedMap) {
      const savedAt = recentlySavedMap.get(serverRow.id);
      if (savedAt && now - savedAt < 15000) {
        return local;
      }
    }

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
