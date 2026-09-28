import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import { useAuth } from "context/AuthContext";

function Welcome() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={8} display="flex" justifyContent="center">
        <Card sx={{ width: "100%", maxWidth: 680, textAlign: "center" }}>
          <MDBox p={5}>
            <MDBox
              mx="auto"
              mb={2}
              display="flex"
              alignItems="center"
              justifyContent="center"
              width={72}
              height={72}
              borderRadius="50%"
              bgColor="info"
              color="white"
            >
              <Icon sx={{ fontSize: "36px !important" }}>waving_hand</Icon>
            </MDBox>
            <MDTypography variant="h3" fontWeight="bold">
              Welcome Back, {user?.username || "Staff"}!
            </MDTypography>
            <MDTypography variant="body1" color="text" mt={1.5}>
              Your login was successful.
            </MDTypography>
            <MDTypography variant="body2" color="text" mt={1}>
              No page permissions have been assigned yet. Please contact the administrator.
            </MDTypography>
          </MDBox>
        </Card>
      </MDBox>
    </DashboardLayout>
  );
}

export default Welcome;
