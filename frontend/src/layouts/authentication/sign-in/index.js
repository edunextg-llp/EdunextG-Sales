import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "context/AuthContext";

// @mui material components
import Card from "@mui/material/Card";
import Switch from "@mui/material/Switch";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";

// import MuiLink from "@mui/material/Link";

// // @mui icons
// import FacebookIcon from "@mui/icons-material/Facebook";
// import GitHubIcon from "@mui/icons-material/GitHub";
// import GoogleIcon from "@mui/icons-material/Google";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

// Authentication layout components
import BasicLayout from "layouts/authentication/components/BasicLayout";

// Images
import bgImage from "assets/images/bg-sign-in-basic.jpeg";

function Basic() {
  const [rememberMe, setRememberMe] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const API = "https://bawarchee.eunextg.co/api/auth";

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
    <BasicLayout image={bgImage}>
      <Card>
        <MDBox
          variant="gradient"
          bgColor="info"
          borderRadius="lg"
          coloredShadow="info"
          mx={2}
          mt={-3}
          p={2}
          mb={1}
          textAlign="center"
        >
          <MDTypography variant="h4" fontWeight="medium" color="white" mt={1}>
            Sign in
          </MDTypography>
          <Grid container spacing={3} justifyContent="center" sx={{ mt: 1, mb: 2 }}>
            {/* <Grid item xs={2}>
              <MDTypography component={MuiLink} href="#" variant="body1" color="white">
                <FacebookIcon color="inherit" />
              </MDTypography>
            </Grid> */}
            {/* <Grid item xs={2}>
              <MDTypography component={MuiLink} href="#" variant="body1" color="white">
                <GitHubIcon color="inherit" />
              </MDTypography>
            </Grid> */}
            {/* <Grid item xs={2}>
              <MDTypography component={MuiLink} href="#" variant="body1" color="white">
                <GoogleIcon color="inherit" />
              </MDTypography>
            </Grid> */}
          </Grid>
        </MDBox>
        <MDBox pt={4} pb={3} px={3}>
          <MDBox component="form" role="form" onSubmit={handleSubmit}>
            <MDBox mb={2}>
              <MDInput type="email" label="Email" fullWidth value={email} onChange={(e) => setEmail(e.target.value)} required />
            </MDBox>
            <MDBox mb={2}>
              <MDInput type="password" label="Password" fullWidth value={password} onChange={(e) => setPassword(e.target.value)} required />
            </MDBox>
            <MDBox
              mb={2}
              p={2}
              sx={{
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                backgroundColor: "#f8fafc",
              }}
            >
              <MDBox
                mb={1.5}
              >
                <MDBox>
                  <MDTypography variant="caption" color="text" fontWeight="medium">
                    CAPTCHA verification
                  </MDTypography>
                </MDBox>
                <MDBox display="flex" alignItems="center" gap={1} mt={0.75}>
                  <MDBox
                    px={2}
                    py={1}
                    sx={{
                      border: "1px dashed #94a3b8",
                      borderRadius: "8px",
                      background:
                        "repeating-linear-gradient(135deg, #ffffff, #ffffff 8px, #eef2ff 8px, #eef2ff 16px)",
                      minWidth: 172,
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
                    sx={{ minWidth: 34, width: 34, height: 34, p: 0 }}
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
              <MDTypography variant="caption" color="error" fontWeight="medium" textGradient mb={2}>
                {error}
              </MDTypography>
            )}

            <MDBox display="flex" alignItems="center" ml={-1}>
              <Switch checked={rememberMe} onChange={handleSetRememberMe} />
              <MDTypography
                variant="button"
                fontWeight="regular"
                color="text"
                onClick={handleSetRememberMe}
                sx={{ cursor: "pointer", userSelect: "none", ml: -1 }}
              >
                &nbsp;&nbsp;Remember me
              </MDTypography>
            </MDBox>
            <MDBox mt={4} mb={1}>
              <MDButton variant="gradient" color="info" fullWidth type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </MDButton>
            </MDBox>
            {/* <MDBox mt={3} mb={1} textAlign="center">
              <MDTypography variant="button" color="text">
                Don&apos;t have an account?{" "}
                <MDTypography
                  component={Link}
                  to="/authentication/sign-up"
                  variant="button"
                  color="info"
                  fontWeight="medium"
                  textGradient
                >
                  Sign up
                </MDTypography>
              </MDTypography>
            </MDBox> */}
          </MDBox>
        </MDBox>
      </Card>
    </BasicLayout>
  );
}

export default Basic;
