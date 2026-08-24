import Pagination from "@mui/material/Pagination";
import Stack from "@mui/material/Stack";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

export const ROWS_PER_PAGE = 10;
export const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export const paginatedTableContainerSx = {
  boxShadow: "none",
  border: "1px solid #e5e7eb",
  maxHeight: "70vh",
  overflow: "auto",
};

// A subtle one-step reduction for information-dense operational tables.
export const compactTableTextSx = {
  "& .MuiTableCell-root": {
    fontSize: "0.8125rem",
    paddingTop: "10px !important",
    paddingBottom: "10px !important",
  },
};

export const paginatedTableHeadSx = (backgroundColor = "#f9fafb") => ({
  display: "table-header-group",
  "& .MuiTableCell-head": {
    backgroundColor,
  },
});

export const paginatedTableHeadCellSx = {
  color: "#6b7280",
  borderBottom: "1px solid #e5e7eb",
  py: 1.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

export const paginatedTableHeadCellErrorSx = {
  ...paginatedTableHeadCellSx,
  color: "#7f1d1d",
  borderBottom: "1px solid #fecaca",
};

export function parseListResponse(payload) {
  if (Array.isArray(payload)) {
    return {
      data: payload,
      total: payload.length,
      page: 1,
      limit: payload.length || ROWS_PER_PAGE,
      totalPages: 1,
      summary: null,
      totalAmount: 0,
      totalBalance: 0,
    };
  }

  const total = Number(payload?.total) || 0;
  const limit = Number(payload?.limit) || ROWS_PER_PAGE;
  const page = Number(payload?.page) || 1;

  return {
    data: payload?.data || [],
    total,
    page,
    limit,
    totalPages: Number(payload?.totalPages) || Math.max(1, Math.ceil(total / limit)),
    summary: payload?.summary || null,
    totalAmount: Number(payload?.totalAmount) || 0,
    totalBalance: Number(payload?.totalBalance) || 0,
  };
}

export function getPageSliceMeta(page, total, limit = ROWS_PER_PAGE) {
  if (total <= 0) {
    return { entriesStart: 0, entriesEnd: 0 };
  }

  const entriesStart = (page - 1) * limit + 1;
  const entriesEnd = Math.min(page * limit, total);
  return { entriesStart, entriesEnd };
}

export function TablePaginationFooter({
  page,
  totalPages,
  total,
  onPageChange,
  limit = ROWS_PER_PAGE,
  onLimitChange,
  rowsPerPageOptions = ROWS_PER_PAGE_OPTIONS,
}) {
  const { entriesStart, entriesEnd } = getPageSliceMeta(page, total, limit);

  return (
    <MDBox
      display="flex"
      flexDirection={{ xs: "column", sm: "row" }}
      justifyContent="space-between"
      alignItems={{ xs: "flex-start", sm: "center" }}
      gap={2}
      mt={2}
    >
      <MDBox display="flex" alignItems="center" gap={2} flexWrap="wrap">
        <MDTypography variant="button" color="text" fontWeight="regular">
          Showing {entriesStart} to {entriesEnd} of {total} entries
        </MDTypography>
        {onLimitChange && (
          <MDBox display="flex" alignItems="center" gap={1}>
            <MDTypography variant="caption" color="text">
              Rows per page
            </MDTypography>
            <FormControl size="small" sx={{ minWidth: 72 }}>
              <Select
                value={limit}
                onChange={(event) => onLimitChange(Number(event.target.value))}
                sx={{ height: 32, fontSize: "0.8125rem" }}
              >
                {rowsPerPageOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </MDBox>
        )}
      </MDBox>
      {totalPages > 1 && (
        <Stack spacing={1} alignItems={{ xs: "flex-start", sm: "flex-end" }}>
          <MDTypography variant="caption" color="text">
            Page {page} of {totalPages}
          </MDTypography>
          <Pagination
            count={totalPages}
            page={page}
            color="primary"
            size="small"
            siblingCount={0}
            boundaryCount={1}
            showFirstButton
            showLastButton
            onChange={(_, value) => onPageChange(value)}
          />
        </Stack>
      )}
    </MDBox>
  );
}
