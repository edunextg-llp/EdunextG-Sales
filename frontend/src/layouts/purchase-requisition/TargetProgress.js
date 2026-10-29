import { LinearProgress } from "@mui/material";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

const money = (value) => Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Today's requisition target (e.g. SIL Rs. 11,250) for the logged-in staff member. */
function TargetProgress({ targets }) {
  if (!Array.isArray(targets) || !targets.length) return null;
  return (
    <MDBox display="flex" flexDirection="column" gap={1.5} mb={2}>
      {targets.map((target) => {
        const percent = target.target ? Math.min(100, (target.achieved / target.target) * 100) : 0;
        return (
          <MDBox
            key={target.companyId}
            p={2}
            borderRadius="lg"
            sx={{
              backgroundColor: target.completed ? "#f0fdf4" : "#fff7ed",
              border: `1px solid ${target.completed ? "#bbf7d0" : "#fed7aa"}`,
            }}
          >
            <MDBox display="flex" justifyContent="space-between" flexWrap="wrap" gap={1}>
              <MDTypography variant="button" fontWeight="bold">
                {target.companyName} daily target · ₹{money(target.target)}
              </MDTypography>
              <MDTypography variant="button" fontWeight="bold" color={target.completed ? "success" : "error"}>
                {target.completed
                  ? "Target completed"
                  : `₹${money(target.remaining)} more needed today`}
              </MDTypography>
            </MDBox>
            <LinearProgress
              variant="determinate"
              value={percent}
              color={target.completed ? "success" : "warning"}
              sx={{ height: 8, borderRadius: 4, my: 1 }}
            />
            <MDTypography variant="caption" color="text">
              Done today: ₹{money(target.achieved)} from {target.requisitionCount} requisition
              {target.requisitionCount === 1 ? "" : "s"}. Below target, your requisitions need special approval.
            </MDTypography>
          </MDBox>
        );
      })}
    </MDBox>
  );
}

export default TargetProgress;
