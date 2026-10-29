import { Icon, LinearProgress } from "@mui/material";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";

const money = (value) => Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Today's requisition target (e.g. SIL Rs. 11,250) for the logged-in staff member. */
function TargetProgress({ targets, onFinalSubmit, submitting = false }) {
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
            <MDTypography variant="caption" color="text" display="block">
              Done today: ₹{money(target.achieved)} from {target.requisitionCount} requisition
              {target.requisitionCount === 1 ? "" : "s"}. Requisitions are saved as drafts until you Final Submit.
              {target.completed ? "" : " If you Final Submit below the target, Admin has to approve them."}
            </MDTypography>
            {target.draftCount > 0 ? (
              <MDBox display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mt={1.5}>
                <MDTypography variant="button" fontWeight="medium">
                  {target.draftCount} draft{target.draftCount === 1 ? "" : "s"} not submitted · ₹{money(target.draftTotal)}
                </MDTypography>
                {onFinalSubmit && (
                  <MDButton
                    color={target.completed ? "success" : "warning"}
                    variant="gradient"
                    size="small"
                    disabled={submitting}
                    onClick={() => onFinalSubmit(target)}
                  >
                    <Icon sx={{ mr: 0.5 }}>task_alt</Icon> Final Submit
                  </MDButton>
                )}
              </MDBox>
            ) : (
              target.requisitionCount > 0 && (
                <MDTypography variant="caption" color="success" fontWeight="medium" display="block" mt={1}>
                  All of today&apos;s requisitions are submitted.
                </MDTypography>
              )
            )}
          </MDBox>
        );
      })}
    </MDBox>
  );
}

export default TargetProgress;
