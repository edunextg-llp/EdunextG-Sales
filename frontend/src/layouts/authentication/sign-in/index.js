import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "context/AuthContext";

// @mui material components
import Switch from "@mui/material/Switch";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";

// react-icons/fa for eye/eye-slash
import { FaEye, FaEyeSlash } from "react-icons/fa";

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
        navigate("/dashboard", { replace: true });
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
      <Grid container sx={{ minHeight: "100vh", margin: 0, padding: 0, overflow: "hidden" }}>
        {/* Left Column - Vector Illustration (Only visible on md and up) */}
        <Grid
          item
          xs={0}
          md={6}
          lg={7}
          sx={{
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f8fafc",
            padding: 4,
            borderRight: "1px solid #e2e8f0",
          }}
        >
          <MDBox
            component="img"
            src="https://mdbcdn.b-cdn.net/img/Photos/new-templates/bootstrap-login-form/draw2.webp"
            alt="Login illustration"
            sx={{
              width: "100%",
              maxWidth: "600px",
              height: "auto",
              maxHeight: "70vh",
              objectFit: "contain",
              transition: "transform 0.4s ease-in-out",
              "&:hover": {
                transform: "scale(1.02)",
              },
            }}
          />
        </Grid>

        {/* Right Column - Login Form */}
        <Grid
          item
          xs={12}
          md={6}
          lg={5}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: { xs: 3, sm: 6, md: 8 },
            backgroundColor: "#ffffff",
          }}
        >
          <MDBox width="100%" maxWidth={420} px={2}>
            <MDBox mb={4}>
              <MDTypography variant="h3" fontWeight="bold" color="dark" gutterBottom>
                Sign In
              </MDTypography>
              <MDTypography variant="button" color="text" fontWeight="regular">
                Enter your email and password to log in.
              </MDTypography>
            </MDBox>

            <MDBox component="form" role="form" onSubmit={handleSubmit}>
              <MDBox mb={2.5}>
                <MDInput
                  type="email"
                  label="Email address"
                  fullWidth
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </MDBox>
              <MDBox mb={2.5} position="relative">
                <MDInput
                  type={showPassword ? "text" : "password"}
                  label="Password"
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <MDBox
                  sx={{
                    position: "absolute",
                    top: "50%",
                    right: 12,
                    transform: "translateY(-50%)",
                    cursor: "pointer",
                    zIndex: 2,
                    color: "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                  }}
                  onClick={() => setShowPassword((show) => !show)}
                >
                  {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
                </MDBox>
              </MDBox>

              {/* CAPTCHA Container */}
              <MDBox
                mb={2.5}
                p={2}
                sx={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  backgroundColor: "#f8fafc",
                }}
              >
                <MDBox mb={1.5}>
                  <MDTypography variant="caption" color="text" fontWeight="medium">
                    CAPTCHA verification
                  </MDTypography>
                  <MDBox display="flex" alignItems="center" gap={1.5} mt={1}>
                    <MDBox
                      px={2}
                      py={1}
                      sx={{
                        border: "1px dashed #cbd5e1",
                        borderRadius: "8px",
                        background:
                          "repeating-linear-gradient(135deg, #ffffff, #ffffff 8px, #f1f5f9 8px, #f1f5f9 16px)",
                        flexGrow: 1,
                        textAlign: "center",
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
                      onClick={fetchCaptcha}
                      sx={{ minWidth: 38, width: 38, height: 38, p: 0, borderRadius: "8px" }}
                    >
                      <Icon fontSize="small">refresh</Icon>
                    </MDButton>
                  </MDBox>
                </MDBox>
                <MDInput
                  type="text"
                  label="Type the code shown above"
                  fullWidth
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  required
                />
              </MDBox>

              {error && (
                <MDBox mb={2.5}>
                  <MDTypography variant="caption" color="error" fontWeight="medium">
                    {error}
                  </MDTypography>
                </MDBox>
              )}

              {/* Remember Me and Forgot Password Container */}
              <MDBox display="flex" alignItems="center" justifyContent="space-between" mb={3}>
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
                {/* <MDTypography
                  component="a"
                  href="#forgot-password"
                  variant="button"
                  color="info"
                  fontWeight="medium"
                  sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                >
                  Forgot password?
                </MDTypography> */}
              </MDBox>

              {/* Submit button */}
              <MDBox mt={4} mb={1}>
                <MDButton variant="gradient" color="info" fullWidth type="submit" disabled={loading} size="large">
                  {loading ? "Signing in..." : "Sign in"}
                </MDButton>
              </MDBox>


            </MDBox>
          </MDBox>
        </Grid>
      </Grid>
    </PageLayout>
  );
}

export default Basic;
