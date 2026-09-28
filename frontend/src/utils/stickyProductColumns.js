const STICKY_COLUMNS = [
  { key: "srNo", width: 72 },
  { key: "productErpId", width: 140 },
  { key: "skuName", width: 240 },
  { key: "productDivision", width: 150 },
];

const getStickyLeft = (columnIndex) =>
  STICKY_COLUMNS.slice(0, columnIndex).reduce((sum, column) => sum + column.width, 0);

export const stickyTableContainerSx = {
  boxShadow: "none",
  border: "1px solid #e5e7eb",
  overflow: "auto",
  maxWidth: "100%",
  maxHeight: "70vh",
};

export const stickyTableSx = (minWidth) => ({
  minWidth,
  borderCollapse: "separate",
  borderSpacing: 0,
});

export const stickyHeadRowSx = (baseSx = {}, backgroundColor = "#f9fafb") => ({
  ...baseSx,
  position: "sticky",
  top: 0,
  zIndex: 3,
  backgroundColor,
});

export const stickyColumnSx = (columnIndex, { isHead = false, baseSx = {}, backgroundColor } = {}) => {
  const column = STICKY_COLUMNS[columnIndex];
  const left = getStickyLeft(columnIndex);
  const isLastSticky = columnIndex === STICKY_COLUMNS.length - 1;
  const bg = backgroundColor ?? (isHead ? "#f9fafb" : "#fff");

  return {
    ...baseSx,
    position: "sticky",
    left,
    ...(isHead ? { top: 0, zIndex: 5 } : { zIndex: 2 }),
    minWidth: column.width,
    maxWidth: column.width,
    width: column.width,
    backgroundColor: bg,
    boxShadow: isLastSticky ? "4px 0 8px -4px rgba(15, 23, 42, 0.15)" : "none",
  };
};
