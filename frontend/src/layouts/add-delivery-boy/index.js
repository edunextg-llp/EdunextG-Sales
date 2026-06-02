import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

function AddDeliveryBoy() {
  const [name, setName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loadingList, setLoadingList] = useState(true);

  const API = "https://bawarchee.edunextg.co/api";

  const fetchDeliveryBoys = async () => {
    try {
      const response = await fetch(`${API}/delivery-boy`);
      if (response.ok) {
        const data = await response.json();
        setDeliveryBoys(data);
      }
    } catch (error) {
      console.error("Error fetching delivery boys:", error);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchDeliveryBoys();
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !contactNo.trim()) {
      alert("Please enter both Name and Contact Number.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API}/delivery-boy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, contactNo }),
      });

      if (response.ok) {
        alert("Delivery Boy created successfully!");
        setName("");
        setContactNo("");
        await fetchDeliveryBoys();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to create Delivery Boy.");
      }
    } catch (error) {
      console.error("Error creating Delivery Boy:", error);
      alert("Error submitting form.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox pt={6} pb={3}>
        <Grid container spacing={3} justifyContent="center">
          <Grid item xs={12} md={8} lg={6}>
            <Card>
              <MDBox
                variant="gradient"
                bgColor="info"
                borderRadius="lg"
                coloredShadow="info"
                mx={2}
                mt={-3}
                p={3}
                mb={1}
                textAlign="center"
              >
                <MDTypography variant="h4" fontWeight="medium" color="white" mt={1}>
                  Create Delivery Boy
                </MDTypography>
              </MDBox>
              <MDBox pt={4} pb={3} px={3}>
                <MDBox component="form" role="form">
                  <MDBox mb={2}>
                    <MDInput
                      type="text"
                      label="Name"
                      fullWidth
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </MDBox>
                  <MDBox mb={2}>
                    <MDInput
                      type="text"
                      label="Contact Number"
                      fullWidth
                      value={contactNo}
                      onChange={(e) => setContactNo(e.target.value)}
                    />
                  </MDBox>
                  <MDBox mt={4} mb={1}>
                    <MDButton
                      variant="gradient"
                      color="info"
                      fullWidth
                      onClick={handleSubmit}
                      disabled={submitting}
                    >
                      {submitting ? "Creating..." : "Create Delivery Boy"}
                    </MDButton>
                  </MDBox>
                </MDBox>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} md={10} lg={8}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h5" fontWeight="medium" mb={3}>
                  Delivery Boys
                </MDTypography>

                {loadingList ? (
                  <MDTypography variant="body2" color="text">
                    Loading...
                  </MDTypography>
                ) : deliveryBoys.length === 0 ? (
                  <MDTypography variant="body2" color="text">
                    No delivery boys added yet.
                  </MDTypography>
                ) : (
                  <TableContainer component={Paper} sx={{ boxShadow: "none" }}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: "bold" }}>#</TableCell>
                          <TableCell sx={{ fontWeight: "bold" }}>Name</TableCell>
                          <TableCell align="center" sx={{ fontWeight: "bold" }}>
                            Contact Number
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {deliveryBoys.map((boy, index) => (
                          <TableRow key={boy.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell>{boy.name}</TableCell>
                            <TableCell align="center">{boy.contact_no}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}

export default AddDeliveryBoy;
