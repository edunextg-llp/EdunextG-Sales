import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "context/AuthContext";

// @mui material components
import Switch from "@mui/material/Switch";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

// Authentication layout components
import PageLayout from "examples/LayoutContainers/PageLayout";

function Basic() {
  const [rememberMe, setRememberMe] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // Added for show/hide
  const [captcha, setCaptcha] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const API = "https://bawarchee.edunextg.co/api/auth";

  const handleSetRememberMe = () => setRememberMe(!rememberMe);

  const fetchCaptcha = useCallback(async () => {
    try {
      const response = await fetch(`${API}/captcha`);
      if (response.ok) {
        const data = await response.json();
        setCaptcha(data);
        setCaptchaAnswer("");
      } else {
        setCaptcha(null);
      }
    } catch (err) {
      console.error("Error fetching CAPTCHA:", err);
      setCaptcha(null);
    }
  }, [API]);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!captcha?.captchaId || !captchaAnswer.trim()) {
      setError("Please solve the CAPTCHA.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          captchaId: captcha.captchaId,
          captchaAnswer,
          rememberMe,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        login(data.user, data.token, data.refreshToken, rememberMe);
        const permissions = Array.isArray(data.user?.permissions) ? data.user.permissions : [];
        const destination =
          data.user?.role === "staff"
            ? "/purchase-requisition"
            : data.user?.role === "admin" || permissions.includes("dashboard")
              ? "/dashboard"
              : permissions.includes("dms") && permissions.includes("add_seller")
                ? "/add-seller"
                : permissions.includes("dms") && permissions.includes("add_item")
                  ? "/add-item"
                  : permissions.includes("dms") && permissions.includes("item_list")
                    ? "/dms-stock"
                    : permissions.includes("update_payment")
                      ? "/update-payment"
                      : permissions.includes("bank_deposit")
                        ? "/bank-deposit"
                        : permissions.includes("out_bill")
                          ? "/out-bill"
                          : permissions.includes("requisition_approval")
                            ? "/requisition-approvals"
                          : permissions.includes("add_outlet")
                            ? "/add-outlet"
                            : permissions.includes("add_sales")
                              ? "/add-sales"
                              : "/welcome";
        navigate(destination, { replace: true });
      } else {
        const err = await response.json().catch(() => ({}));
        setError(err.error || "Invalid login credentials");
        fetchCaptcha();
      }
    } catch (err) {
      console.error(err);
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout background="white">
      <Grid
        container
        sx={{
          height: "100dvh",
          minHeight: 0,
          maxHeight: "100dvh",
          m: 0,
          overflow: "hidden",
          backgroundColor: "#f8fafc",
        }}
      >
        <Grid
          item
          xs={0}
          md={6}
          lg={6.5}
          sx={{
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            overflow: "hidden",
            p: { md: 4, lg: 5 },
            color: "white",
            background: "linear-gradient(145deg, #0f172a 0%, #172554 48%, #1d4ed8 100%)",
          }}
        >
          <MDBox
            sx={{
              position: "absolute", width: 420, height: 420, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.13)", top: -150, right: -130,
            }}
          />
          <MDBox
            sx={{
              position: "absolute", width: 300, height: 300, borderRadius: "50%",
              background: "rgba(56,189,248,0.10)", bottom: -120, left: -80,
            }}
          />

          <MDBox position="relative" zIndex={1} display="flex" alignItems="center" gap={1.5}>
            <MDBox
              width={44} height={44} borderRadius="12px" display="flex" alignItems="center"
              justifyContent="center" sx={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }}
            >
              <MDTypography variant="h5" color="white" fontWeight="bold">E</MDTypography>
            </MDBox>
            <MDBox>
              <MDTypography variant="h5" color="white" fontWeight="bold">EduNextG Sales</MDTypography>
              <MDTypography variant="caption" sx={{ color: "rgba(255,255,255,0.68)" }}>
                Business operations, connected
              </MDTypography>
            </MDBox>
          </MDBox>

          <MDBox position="relative" zIndex={1} maxWidth={580} my={3}>
            <MDTypography variant="h2" color="white" fontWeight="bold" lineHeight={1.15}>
              Run every sales operation from one place.
            </MDTypography>
            <MDTypography variant="body1" mt={2} sx={{ color: "rgba(255,255,255,0.72)", lineHeight: 1.65 }}>
              Keep stock, outlets, invoicing, delivery, collections, and reporting aligned with a secure workspace built for your team.
            </MDTypography>
            <Grid container spacing={1.5} mt={2}>
              {["Role-based access", "Real-time operations", "Protected business data"].map((feature) => (
                <Grid item xs={12} lg={6} key={feature}>
                  <MDBox display="flex" alignItems="center" gap={1.2}>
                    <MDBox
                      width={28} height={28} borderRadius="50%" display="flex" alignItems="center"
                      justifyContent="center" sx={{ background: "rgba(56,189,248,0.18)" }}
                    >
                      <Icon sx={{ color: "#7dd3fc", fontSize: "17px !important" }}>check</Icon>
                    </MDBox>
                    <MDTypography variant="button" color="white" fontWeight="medium">{feature}</MDTypography>
                  </MDBox>
                </Grid>
              ))}
            </Grid>
          </MDBox>

          <MDTypography variant="caption" position="relative" zIndex={1} sx={{ color: "rgba(255,255,255,0.5)" }}>
            © {new Date().getFullYear()} EduNextG India LLP. Authorized access only.
          </MDTypography>
        </Grid>

        <Grid
          item
          xs={12}
          md={6}
          lg={5.5}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: { xs: 1.5, sm: 2.5, md: 3, lg: 4 },
            position: "relative",
          }}
        >
          <MDBox
            width="100%"
            maxWidth={470}
            p={{ xs: 2.25, sm: 3 }}
            sx={{
              backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "20px",
              boxShadow: "0 24px 60px rgba(15,23,42,0.10)",
              maxHeight: "calc(100dvh - 24px)",
            }}
          >
            <MDBox display={{ xs: "flex", md: "none" }} alignItems="center" gap={1.25} mb={2}>
              <MDBox width={38} height={38} borderRadius="10px" display="flex" alignItems="center"
                justifyContent="center" sx={{ background: "linear-gradient(135deg, #172554, #2563eb)" }}>
                <MDTypography variant="button" color="white" fontWeight="bold">E</MDTypography>
              </MDBox>
              <MDTypography variant="h6" fontWeight="bold">EduNextG Sales</MDTypography>
            </MDBox>

            <MDBox mb={2}>
              <MDTypography variant="h3" fontWeight="bold" color="dark" mb={0.75}>
                Welcome back
              </MDTypography>
              {/* <MDTypography variant="body2" color="text" sx={{ lineHeight: 1.6 }}>
                Sign in with your assigned account to continue to your workspace.
              </MDTypography> */}
            </MDBox>

            <MDBox component="form" role="form" onSubmit={handleSubmit}>
              <MDBox mb={1.5}>
                <MDTypography variant="caption" fontWeight="bold" color="dark" display="block" mb={0.75}>
                  Account ID
                </MDTypography>
                <MDInput
                  type="text"
                  placeholder="Email, staff ID, delivery ID, or login ID"
                  fullWidth
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                  sx={{ "& .MuiInputBase-root": { minHeight: 44, borderRadius: "10px" } }}
                />
              </MDBox>
              <MDBox mb={1.5}>
                <MDTypography variant="caption" fontWeight="bold" color="dark" display="block" mb={0.75}>
                  Password
                </MDTypography>
                <MDInput
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  sx={{ "& .MuiInputBase-root": { minHeight: 44, borderRadius: "10px" } }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          edge="end"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((show) => !show)}
                        >
                          <Icon fontSize="small">{showPassword ? "visibility_off" : "visibility"}</Icon>
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </MDBox>

              <MDBox
                mb={1.5}
                p={1.5}
                sx={{
                  border: "1px solid #dbe4f0", borderRadius: "12px", backgroundColor: "#f8fafc",
                }}
              >
                <MDBox mb={1}>
                  <MDBox display="flex" alignItems="center" gap={0.75}>
                    <Icon sx={{ color: "#2563eb", fontSize: "17px !important" }}>verified_user</Icon>
                    <MDTypography variant="caption" color="dark" fontWeight="bold">
                      Security verification
                    </MDTypography>
                  </MDBox>
                  <MDBox display="flex" alignItems="center" gap={1.25} mt={0.75}>
                    <MDBox
                      px={2}
                      py={0.6}
                      sx={{
                        border: "1px dashed #94a3b8", borderRadius: "9px",
                        background:
                          "repeating-linear-gradient(135deg, #ffffff, #ffffff 8px, #f1f5f9 8px, #f1f5f9 16px)",
                        flexGrow: 1, textAlign: "center",
                      }}
                    >
                      <MDTypography
                        variant="h5"
                        fontWeight="bold"
                        color="dark"
                        sx={{
                          letterSpacing: "0.22em",
                          fontFamily: "monospace",
                          userSelect: "none",
                        }}
                      >
                        {captcha?.question || "......"}
                      </MDTypography>
                    </MDBox>
                    <MDButton
                      variant="outlined"
                      color="info"
                      size="small"
                      type="button"
                      aria-label="Refresh security code"
                      onClick={fetchCaptcha}
                      sx={{ minWidth: 38, width: 38, height: 38, p: 0, borderRadius: "9px" }}
                    >
                      <Icon fontSize="small">refresh</Icon>
                    </MDButton>
                  </MDBox>
                </MDBox>
                <MDInput
                  type="text"
                  placeholder="Enter the code shown above"
                  fullWidth
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  required
                  autoComplete="off"
                  sx={{ "& .MuiInputBase-root": { minHeight: 42, borderRadius: "9px", backgroundColor: "#fff" } }}
                />
              </MDBox>

              {error && (
                <Alert severity="error" sx={{ mb: 2.25, borderRadius: "10px", py: 0.5 }}>
                  {error}
                </Alert>
              )}

              <MDBox display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                <MDBox display="flex" alignItems="center" ml={-1}>
                  <Switch checked={rememberMe} onChange={handleSetRememberMe} />
                  <MDTypography
                    variant="button"
                    fontWeight="regular"
                    color="text"
                    onClick={handleSetRememberMe}
                    sx={{ cursor: "pointer", userSelect: "none", ml: -0.5 }}
                  >
                    Remember me
                  </MDTypography>
                </MDBox>
              </MDBox>

              <MDButton
                variant="gradient" color="info" fullWidth type="submit" disabled={loading} size="large"
                sx={{ minHeight: 44, borderRadius: "10px", fontSize: "0.82rem", boxShadow: "0 10px 24px rgba(37,99,235,0.22)" }}
              >
                  {loading ? "Signing in..." : "Sign in"}
              </MDButton>

              <MDBox mt={1.75} pt={1.5} sx={{ borderTop: "1px solid #e2e8f0" }} textAlign="center">
                <MDTypography variant="caption" color="text">
                  Having trouble signing in? Contact your system administrator.
                </MDTypography>
              </MDBox>
            </MDBox>
          </MDBox>
        </Grid>
      </Grid>
    </PageLayout>
  );
}

export default Basic;
