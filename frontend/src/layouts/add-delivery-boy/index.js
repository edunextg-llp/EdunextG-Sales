import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import OutlinedInput from "@mui/material/OutlinedInput";
import Select from "@mui/material/Select";
// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

// Material Dashboard 2 React example components
import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import DataTable from "examples/Tables/DataTable";

function AddDeliveryBoy() {
  const [name, setName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [companyIds, setCompanyIds] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState(null);

  const API = "http://localhost:5000/api";

  const fetchCompanyOptions = async () => {
    try {
      const response = await fetch(`${API}/delivery-boy/companies`);
      if (response.ok) {
        const data = await response.json();
        setCompanyOptions(data);
      }
    } catch (error) {
      console.error("Error fetching staff assigned companies:", error);
    }
  };

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
    fetchCompanyOptions();
    fetchDeliveryBoys();
  }, []);

  const resetForm = () => {
    setCompanyIds([]);
    setName("");
    setContactNo("");
    setEditingId(null);
  };

  const parseCompanyIds = (boy) =>
    String(boy.company_ids || boy.company_id || "")
      .split(",")
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

  const startEditDeliveryBoy = (boy) => {
    setEditingId(boy.id);
    setName(boy.name || "");
    setContactNo(boy.contact_no || "");
    setCompanyIds(parseCompanyIds(boy));
  };

  const handleSubmit = async () => {
    if (companyIds.length === 0 || !name.trim() || !contactNo.trim()) {
      alert("Please choose Company Name and enter both Name and Contact Number.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        editingId ? `${API}/delivery-boy/${editingId}` : `${API}/delivery-boy`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, contactNo, companyIds }),
        }
      );

      if (response.ok) {
        alert(`Delivery Boy ${editingId ? "updated" : "created"} successfully!`);
        resetForm();
        await fetchDeliveryBoys();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || `Failed to ${editingId ? "update" : "create"} Delivery Boy.`);
      }
    } catch (error) {
      console.error(`Error ${editingId ? "updating" : "creating"} Delivery Boy:`, error);
      alert("Error submitting form.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDeliveryBoy = async (boy) => {
    if (!window.confirm(`Delete delivery boy "${boy.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API}/delivery-boy/${boy.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        alert("Delivery Boy deleted successfully!");
        if (editingId === boy.id) {
          resetForm();
        }
        await fetchDeliveryBoys();
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Failed to delete Delivery Boy.");
      }
    } catch (error) {
      console.error("Error deleting Delivery Boy:", error);
      alert("Error deleting Delivery Boy.");
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
                  {editingId ? "Edit Delivery Boy" : "Create Delivery Boy"}
                </MDTypography>
              </MDBox>
              <MDBox pt={4} pb={3} px={3}>
                <MDBox component="form" role="form">
                  <MDBox mb={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="delivery-company-label">Company Name</InputLabel>
                      <Select
                        labelId="delivery-company-label"
                        multiple
                        value={companyIds}
                        label="Company Name"
                        onChange={(e) => {
                          const value = e.target.value;
                          setCompanyIds(typeof value === "string" ? value.split(",") : value);
                        }}
                        input={<OutlinedInput label="Company Name" />}
                        renderValue={(selected) =>
                          selected
                            .map((id) => companyOptions.find((company) => company.id === id)?.name)
                            .filter(Boolean)
                            .join(", ")
                        }
                        sx={{ minHeight: 44 }}
                      >
                        {companyOptions.map((company) => (
                          <MenuItem key={company.id} value={company.id}>
                            {company.name}
                          </MenuItem>
                        ))}
                        {companyOptions.length === 0 && (
                          <MenuItem disabled>No staff company assigned</MenuItem>
                        )}
                      </Select>
                    </FormControl>
                  </MDBox>
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
                      {submitting
                        ? editingId
                          ? "Updating..."
                          : "Creating..."
                        : editingId
                          ? "Update Delivery Boy"
                          : "Create Delivery Boy"}
                    </MDButton>
                  </MDBox>
                  {editingId && (
                    <MDBox mt={1} mb={1}>
                      <MDButton
                        variant="outlined"
                        color="dark"
                        fullWidth
                        onClick={resetForm}
                        disabled={submitting}
                      >
                        Cancel Edit
                      </MDButton>
                    </MDBox>
                  )}
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
                  <MDBox pt={3}>
                    <DataTable
                      table={{
                        columns: [
                          { Header: <MDTypography variant="subtitle2" color="dark" fontWeight="bold">#</MDTypography>, accessor: "id", width: "10%", align: "left" },
                          { Header: <MDTypography variant="subtitle2" color="dark" fontWeight="bold">Company</MDTypography>, accessor: "company", width: "30%", align: "left" },
                          { Header: <MDTypography variant="subtitle2" color="dark" fontWeight="bold">Name</MDTypography>, accessor: "name", width: "30%", align: "left" },
                          { Header: <MDTypography variant="subtitle2" color="dark" fontWeight="bold">Contact Number</MDTypography>, accessor: "contact", align: "center" },
                          { Header: <MDTypography variant="subtitle2" color="dark" fontWeight="bold">Login ID</MDTypography>, accessor: "loginId", align: "center" },
                          { Header: <MDTypography variant="subtitle2" color="dark" fontWeight="bold">Passcode</MDTypography>, accessor: "passcode", align: "center" },
                          { Header: <MDTypography variant="subtitle2" color="dark" fontWeight="bold">Action</MDTypography>, accessor: "action", align: "center" },
                        ],
                        rows: deliveryBoys.map((boy, index) => ({
                          id: (
                            <MDTypography component="span" variant="caption" color="text" fontWeight="medium">
                              {index + 1}
                            </MDTypography>
                          ),
                          name: (
                            <MDTypography component="span" variant="caption" color="text" fontWeight="medium">
                              {boy.name}
                            </MDTypography>
                          ),
                          company: (
                            <MDTypography component="span" variant="caption" color="text" fontWeight="medium">
                              {boy.company_name || "—"}
                            </MDTypography>
                          ),
                          contact: (
                            <MDTypography component="span" variant="caption" color="text" fontWeight="medium">
                              {boy.contact_no}
                            </MDTypography>
                          ),
                          loginId: (
                            <MDTypography component="span" variant="caption" color="text" fontWeight="bold">
                              {boy.delivery_login_id || "N/A"}
                            </MDTypography>
                          ),
                          passcode: (
                            <MDTypography component="span" variant="caption" color="text" fontWeight="bold">
                              {boy.delivery_passcode || "N/A"}
                            </MDTypography>
                          ),
                          action: (
                            <MDBox display="flex" gap={1} justifyContent="center" flexWrap="wrap">
                              <MDButton
                                variant="outlined"
                                color="info"
                                size="small"
                                onClick={() => startEditDeliveryBoy(boy)}
                              >
                                Edit
                              </MDButton>
                              <MDButton
                                variant="outlined"
                                color="error"
                                size="small"
                                onClick={() => handleDeleteDeliveryBoy(boy)}
                              >
                                Delete
                              </MDButton>
                            </MDBox>
                          ),
                        })),
                      }}
                      isSorted={false}
                      entriesPerPage={false}
                      showTotalEntries={false}
                      noEndBorder
                    />
                  </MDBox>
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
