import Icon from "@mui/material/Icon";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDPagination from "components/MDPagination";

export const ROWS_PER_PAGE = 10;

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

export function TablePaginationFooter({ page, totalPages, total, onPageChange, limit = ROWS_PER_PAGE }) {
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
      <MDTypography variant="button" color="text" fontWeight="regular">
        Showing {entriesStart} to {entriesEnd} of {total} entries
      </MDTypography>
      {totalPages > 1 && (
        <MDPagination variant="gradient" color="info">
          <MDPagination item onClick={() => onPageChange(Math.max(1, page - 1))}>
            <Icon sx={{ fontWeight: "bold" }}>chevron_left</Icon>
          </MDPagination>
          {Array.from({ length: totalPages }, (_, pageIndex) => pageIndex + 1).map((pageNumber) => (
            <MDPagination
              key={pageNumber}
              item
              onClick={() => onPageChange(pageNumber)}
              active={page === pageNumber}
            >
              {pageNumber}
            </MDPagination>
          ))}
          <MDPagination item onClick={() => onPageChange(Math.min(totalPages, page + 1))}>
            <Icon sx={{ fontWeight: "bold" }}>chevron_right</Icon>
          </MDPagination>
        </MDPagination>
      )}
    </MDBox>
  );
}
