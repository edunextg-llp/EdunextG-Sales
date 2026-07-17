import { useState, useEffect } from "react";

// @mui material components
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Select,
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
import DataTable from "examples/Tables/DataTable";
import { FaRegEdit } from "react-icons/fa";
import { CiTrash } from "react-icons/ci";


function AddDeliveryBoy() {
  const [name, setName] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [companyIds, setCompanyIds] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);

  const API = "https://bawarchee.edunextg.co/api";

  const fetchCompanyOptions = async () => {
    try {
      const response = await fetch(`${API}/staff/companies`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (response.ok) {
        const data = await response.json();
        setCompanyOptions(data);
      }
    } catch (error) {
      console.error("Error fetching companies:", error);
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

  const openDeliveryModal = () => {
    resetForm();
    setDeliveryModalOpen(true);
  };

  const closeDeliveryModal = () => {
    setDeliveryModalOpen(false);
    resetForm();
  };

  const startEditDeliveryBoy = (boy) => {
    setEditingId(boy.id);
    setName(boy.name || "");
    setContactNo(boy.contact_no || "");
    setCompanyIds(parseCompanyIds(boy));
    setDeliveryModalOpen(true);
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
        closeDeliveryModal();
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
          closeDeliveryModal();
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
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3}>
                <MDBox
                  display="flex"
                  flexDirection={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ xs: "stretch", sm: "center" }}
                  gap={2}
                  mb={3}
                >
                  <MDTypography variant="h5" fontWeight="medium">
                    Delivery Boys
                  </MDTypography>
                  <MDButton color="info" variant="gradient" onClick={openDeliveryModal}>
                    <Icon sx={{ mr: 1 }}>add</Icon>
                    Create Delivery Boy
                  </MDButton>
                </MDBox>

                {loadingList ? (
                  <MDTypography variant="body2" color="text">
                    Loading...
                  </MDTypography>
                ) : deliveryBoys.length === 0 ? (
                  <MDTypography variant="body2" color="text">
                    No delivery boys added yet. Click &quot;Create Delivery Boy&quot; to add one.
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
                              {/* <MDButton
                                variant="outlined"
                                color="info"
                                size="small"
                                onClick={() => startEditDeliveryBoy(boy)}
                              >
                                Edit
                              </MDButton> */}
                              <FaRegEdit   onClick={() => startEditDeliveryBoy(boy)} style={{ cursor: "pointer" }} color="#E0E388" size={20}/>
                              <CiTrash   onClick={() => handleDeleteDeliveryBoy(boy)} style={{ cursor: "pointer" }} color="#FF0000" size={20}/>
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

      <Dialog open={deliveryModalOpen} onClose={closeDeliveryModal} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>
          {editingId ? "Edit Delivery Boy" : "Create Delivery Boy"}
        </DialogTitle>
        <DialogContent dividers>
          <MDBox pt={1} component="form" role="form">
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
          </MDBox>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <MDButton variant="outlined" color="dark" onClick={closeDeliveryModal} disabled={submitting}>
            Cancel
          </MDButton>
          <MDButton variant="gradient" color="info" onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? editingId
                ? "Updating..."
                : "Creating..."
              : editingId
                ? "Update Delivery Boy"
                : "Create Delivery Boy"}
          </MDButton>
        </DialogActions>
      </Dialog>

      <Footer />
    </DashboardLayout>
  );
}

export default AddDeliveryBoy;
