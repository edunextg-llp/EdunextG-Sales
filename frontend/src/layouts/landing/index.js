import { useState } from "react";
import { Link } from "react-router-dom";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Icon from "@mui/material/Icon";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";

import PageLayout from "examples/LayoutContainers/PageLayout";
import brandLogo from "assets/images/logo-ct-dark.png";

const features = [
  {
    icon: "inventory_2",
    title: "Smarter stock control",
    text: "Track DMS stock, physical inventory, batches, expiry dates, GST, margins, and pricing in one place.",
  },
  {
    icon: "receipt_long",
    title: "Sales & billing",
    text: "Create sales, invoices, challans, collections, and payment updates through one connected workflow.",
  },
  {
    icon: "local_shipping",
    title: "Delivery visibility",
    text: "Move orders from packaging to delivery and completion with clear ownership at every step.",
  },
  {
    icon: "admin_panel_settings",
    title: "Role-based access",
    text: "Give administrators, staff, packaging teams, and delivery teams only the tools they need.",
  },
  {
    icon: "storefront",
    title: "Outlet management",
    text: "Maintain sellers, outlets, locations, route days, companies, and staff assignments accurately.",
  },
  {
    icon: "query_stats",
    title: "Actionable overview",
    text: "See the operational picture quickly and make confident decisions using live business data.",
  },
];

const stats = [
  ["One platform", "Sales to delivery"],
  ["Real-time", "Stock visibility"],
  ["Role based", "Secure access"],
  ["GST ready", "Price calculations"],
];

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const year = new Date().getFullYear();

  return (
    <PageLayout>
      <Box sx={{ minHeight: "100vh", bgcolor: "#f8fafc", color: "#172554", overflow: "hidden" }}>
        <Box
          component="header"
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            bgcolor: "rgba(255,255,255,.9)",
            backdropFilter: "blur(16px)",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <Container maxWidth="lg">
            <Box sx={{ minHeight: 76, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box component={Link} to="/" sx={{ display: "flex", alignItems: "center", gap: 1.25, textDecoration: "none" }}>
                <Box component="img" src={brandLogo} alt="EduNextG Sales" sx={{ width: 42, height: 42, objectFit: "contain" }} />
                <Box>
                  <Box sx={{ fontWeight: 800, fontSize: 20, color: "#172554", lineHeight: 1.05 }}>EduNextG</Box>
                  <Box sx={{ color: "#2563eb", fontSize: 11, fontWeight: 800, letterSpacing: 1.8 }}>SALES</Box>
                </Box>
              </Box>

              <Stack direction="row" spacing={4} sx={{ display: { xs: "none", md: "flex" }, alignItems: "center" }}>
                {[
                  ["Features", "#features"],
                  ["Solutions", "#solutions"],
                  ["Contact", "#contact"],
                ].map(([label, href]) => (
                  <Box
                    key={label}
                    component="a"
                    href={href}
                    sx={{ color: "#475569", fontWeight: 700, fontSize: 14, textDecoration: "none", "&:hover": { color: "#2563eb" } }}
                  >
                    {label}
                  </Box>
                ))}
                <Box
                  component={Link}
                  to="/authentication/sign-in"
                  sx={{
                    px: 2.6,
                    py: 1.25,
                    borderRadius: "10px",
                    color: "#fff",
                    bgcolor: "#2563eb",
                    fontWeight: 800,
                    fontSize: 14,
                    textDecoration: "none",
                    boxShadow: "0 10px 22px rgba(37,99,235,.25)",
                    "&:hover": { bgcolor: "#1d4ed8", transform: "translateY(-1px)" },
                  }}
                >
                  Sign in
                </Box>
              </Stack>

              <IconButton onClick={() => setMenuOpen((value) => !value)} sx={{ display: { md: "none" }, color: "#172554" }}>
                <Icon>{menuOpen ? "close" : "menu"}</Icon>
              </IconButton>
            </Box>

            {menuOpen && (
              <Stack spacing={1.5} sx={{ display: { md: "none" }, pb: 2.5 }}>
                {["features", "solutions", "contact"].map((item) => (
                  <Box
                    component="a"
                    href={`#${item}`}
                    key={item}
                    onClick={() => setMenuOpen(false)}
                    sx={{ textTransform: "capitalize", color: "#475569", fontWeight: 700, textDecoration: "none", py: 0.5 }}
                  >
                    {item}
                  </Box>
                ))}
                <Box component={Link} to="/authentication/sign-in" sx={{ color: "#2563eb", fontWeight: 800, textDecoration: "none", py: 0.5 }}>
                  Sign in to dashboard
                </Box>
              </Stack>
            )}
          </Container>
        </Box>

        <Box
          component="main"
          sx={{
            background:
              "radial-gradient(circle at 80% 12%, rgba(59,130,246,.18), transparent 29%), radial-gradient(circle at 7% 28%, rgba(14,165,233,.12), transparent 22%)",
          }}
        >
          <Container maxWidth="lg">
            <Grid container spacing={6} alignItems="center" sx={{ minHeight: { md: 650 }, py: { xs: 9, md: 7 } }}>
              <Grid item xs={12} md={6}>
                <Box
                  sx={{
                    display: "inline-flex",
                    gap: 1,
                    alignItems: "center",
                    px: 1.5,
                    py: 0.75,
                    mb: 3,
                    borderRadius: 10,
                    bgcolor: "#dbeafe",
                    color: "#1d4ed8",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 0.4,
                  }}
                >
                  <Icon sx={{ fontSize: "17px !important" }}>auto_awesome</Icon>
                  BUILT FOR MODERN DISTRIBUTION
                </Box>
                <Box component="h1" sx={{ m: 0, maxWidth: 650, color: "#0f172a", fontSize: { xs: 43, sm: 58, md: 64 }, lineHeight: 1.04, letterSpacing: -2.2 }}>
                  Run your entire sales operation with{" "}
                  <Box component="span" sx={{ color: "#2563eb" }}>clarity.</Box>
                </Box>
                <Box component="p" sx={{ mt: 3, mb: 4, maxWidth: 590, color: "#64748b", fontSize: { xs: 17, md: 19 }, lineHeight: 1.75 }}>
                  EduNextG Sales connects stock, outlets, billing, packaging, delivery, and collections—so every team works from the same reliable information.
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Box
                    component={Link}
                    to="/authentication/sign-in"
                    sx={{
                      display: "inline-flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 1,
                      px: 3.2,
                      py: 1.65,
                      borderRadius: "12px",
                      bgcolor: "#2563eb",
                      color: "#fff",
                      fontWeight: 800,
                      textDecoration: "none",
                      boxShadow: "0 14px 30px rgba(37,99,235,.3)",
                    }}
                  >
                    Open dashboard <Icon>arrow_forward</Icon>
                  </Box>
                  <Box
                    component="a"
                    href="#features"
                    sx={{
                      display: "inline-flex",
                      justifyContent: "center",
                      alignItems: "center",
                      px: 3.2,
                      py: 1.65,
                      borderRadius: "12px",
                      border: "1px solid #cbd5e1",
                      bgcolor: "#fff",
                      color: "#334155",
                      fontWeight: 800,
                      textDecoration: "none",
                    }}
                  >
                    Explore features
                  </Box>
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Box sx={{ position: "relative", p: { xs: 1, sm: 3 } }}>
                  <Box
                    sx={{
                      position: "absolute",
                      inset: "12% 4%",
                      bgcolor: "#3b82f6",
                      filter: "blur(70px)",
                      opacity: 0.18,
                    }}
                  />
                  <Box
                    sx={{
                      position: "relative",
                      p: 2,
                      bgcolor: "#fff",
                      border: "1px solid rgba(148,163,184,.35)",
                      borderRadius: "22px",
                      boxShadow: "0 30px 70px rgba(15,23,42,.16)",
                      transform: { md: "perspective(1200px) rotateY(-4deg) rotateX(2deg)" },
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.7, mb: 2 }}>
                      {["#fb7185", "#fbbf24", "#4ade80"].map((color) => (
                        <Box key={color} sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: color }} />
                      ))}
                      <Box sx={{ ml: 1, height: 8, width: "40%", borderRadius: 4, bgcolor: "#e2e8f0" }} />
                    </Box>
                    <Grid container spacing={1.4}>
                      {[
                        ["Total Sales", "₹4,82,650", "trending_up", "#2563eb"],
                        ["Current Stock", "12,480", "inventory", "#0891b2"],
                        ["Deliveries", "186", "local_shipping", "#7c3aed"],
                      ].map(([label, value, icon, color]) => (
                        <Grid item xs={4} key={label}>
                          <Box sx={{ p: { xs: 1.2, sm: 1.8 }, borderRadius: "12px", bgcolor: "#f8fafc", minHeight: 100 }}>
                            <Icon sx={{ color, fontSize: "20px !important" }}>{icon}</Icon>
                            <Box sx={{ mt: 1, color: "#64748b", fontSize: { xs: 9, sm: 11 }, fontWeight: 700 }}>{label}</Box>
                            <Box sx={{ color: "#0f172a", fontSize: { xs: 14, sm: 20 }, fontWeight: 800 }}>{value}</Box>
                          </Box>
                        </Grid>
                      ))}
                      <Grid item xs={8}>
                        <Box sx={{ p: 2, height: 190, borderRadius: "14px", bgcolor: "#f8fafc" }}>
                          <Box sx={{ fontWeight: 800, fontSize: 13, color: "#334155" }}>Sales overview</Box>
                          <Box sx={{ mt: 3, height: 115, display: "flex", alignItems: "flex-end", gap: 1.2 }}>
                            {[40, 62, 47, 78, 59, 92, 72, 100].map((height, index) => (
                              <Box key={index} sx={{ flex: 1, height: `${height}%`, borderRadius: "5px 5px 2px 2px", background: "linear-gradient(180deg,#60a5fa,#2563eb)" }} />
                            ))}
                          </Box>
                        </Box>
                      </Grid>
                      <Grid item xs={4}>
                        <Box sx={{ p: 2, height: 190, borderRadius: "14px", bgcolor: "#eff6ff", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                          <Icon sx={{ color: "#2563eb" }}>verified</Icon>
                          <Box>
                            <Box sx={{ color: "#1e3a8a", fontWeight: 800, fontSize: { xs: 17, sm: 24 } }}>98.4%</Box>
                            <Box sx={{ color: "#64748b", fontWeight: 700, fontSize: 10 }}>Orders completed</Box>
                          </Box>
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </Container>

          <Box sx={{ bgcolor: "#0f172a", py: 3.5 }}>
            <Container maxWidth="lg">
              <Grid container spacing={3}>
                {stats.map(([value, label]) => (
                  <Grid item xs={6} md={3} key={label}>
                    <Box sx={{ textAlign: "center" }}>
                      <Box sx={{ color: "#fff", fontWeight: 800, fontSize: { xs: 18, md: 22 } }}>{value}</Box>
                      <Box sx={{ color: "#94a3b8", fontSize: 12, mt: 0.4 }}>{label}</Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Container>
          </Box>

          <Box id="features" sx={{ py: { xs: 9, md: 12 }, bgcolor: "#fff" }}>
            <Container maxWidth="lg">
              <Box sx={{ textAlign: "center", maxWidth: 720, mx: "auto", mb: 7 }}>
                <Box sx={{ color: "#2563eb", fontSize: 13, fontWeight: 800, letterSpacing: 1.6 }}>EVERYTHING CONNECTED</Box>
                <Box component="h2" sx={{ color: "#0f172a", fontSize: { xs: 34, md: 46 }, lineHeight: 1.15, mt: 1.5, mb: 2 }}>
                  One workspace for every moving part
                </Box>
                <Box component="p" sx={{ color: "#64748b", fontSize: 17, lineHeight: 1.7, m: 0 }}>
                  Replace scattered records with a secure operating system built around the way your sales and distribution teams actually work.
                </Box>
              </Box>
              <Grid container spacing={3}>
                {features.map((feature) => (
                  <Grid item xs={12} sm={6} md={4} key={feature.title}>
                    <Box
                      sx={{
                        height: "100%",
                        p: 3.5,
                        border: "1px solid #e2e8f0",
                        borderRadius: "18px",
                        bgcolor: "#fff",
                        transition: "all .25s ease",
                        "&:hover": { transform: "translateY(-6px)", borderColor: "#bfdbfe", boxShadow: "0 18px 40px rgba(15,23,42,.08)" },
                      }}
                    >
                      <Box sx={{ width: 48, height: 48, display: "grid", placeItems: "center", borderRadius: "13px", bgcolor: "#eff6ff", color: "#2563eb" }}>
                        <Icon>{feature.icon}</Icon>
                      </Box>
                      <Box component="h3" sx={{ color: "#0f172a", fontSize: 19, mt: 2.5, mb: 1.2 }}>{feature.title}</Box>
                      <Box component="p" sx={{ color: "#64748b", fontSize: 14.5, lineHeight: 1.75, m: 0 }}>{feature.text}</Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Container>
          </Box>

          <Box id="solutions" sx={{ py: { xs: 9, md: 12 }, bgcolor: "#f1f5f9" }}>
            <Container maxWidth="lg">
              <Grid container spacing={7} alignItems="center">
                <Grid item xs={12} md={6}>
                  <Box sx={{ color: "#2563eb", fontSize: 13, fontWeight: 800, letterSpacing: 1.6 }}>FROM DESK TO DOORSTEP</Box>
                  <Box component="h2" sx={{ color: "#0f172a", fontSize: { xs: 34, md: 46 }, lineHeight: 1.15, mt: 1.5, mb: 2.5 }}>
                    Give every team the right view and the right tools.
                  </Box>
                  <Box component="p" sx={{ color: "#64748b", fontSize: 17, lineHeight: 1.75, mb: 3.5 }}>
                    Administrators stay in control while staff members see only their assigned pages. Packaging and delivery teams can focus on execution without navigating unnecessary menus.
                  </Box>
                  {[
                    "Permission-based menus for every staff role",
                    "One-time secure login credential generation",
                    "Clear handoff across packaging and delivery",
                    "Centralized sales, stock, and collection records",
                  ].map((item) => (
                    <Box key={item} sx={{ display: "flex", gap: 1.3, alignItems: "center", mb: 1.5, color: "#334155", fontWeight: 700, fontSize: 14 }}>
                      <Icon sx={{ color: "#22c55e" }}>check_circle</Icon> {item}
                    </Box>
                  ))}
                </Grid>
                <Grid item xs={12} md={6}>
                  <Box sx={{ p: { xs: 3, sm: 5 }, bgcolor: "#172554", color: "#fff", borderRadius: "24px", boxShadow: "0 25px 55px rgba(15,23,42,.2)" }}>
                    <Box sx={{ fontSize: 13, fontWeight: 800, color: "#93c5fd", letterSpacing: 1 }}>A SIMPLE FLOW</Box>
                    {[
                      ["01", "Create & assign", "Set up staff, outlets, companies, and access."],
                      ["02", "Sell & prepare", "Process billing, stock, packaging, and challans."],
                      ["03", "Deliver & collect", "Complete delivery and keep payments visible."],
                    ].map(([number, title, text], index) => (
                      <Box key={number} sx={{ display: "flex", gap: 2.2, py: 3, borderBottom: index < 2 ? "1px solid rgba(148,163,184,.22)" : 0 }}>
                        <Box sx={{ color: "#60a5fa", fontSize: 14, fontWeight: 800 }}>{number}</Box>
                        <Box>
                          <Box sx={{ fontSize: 18, fontWeight: 800, mb: 0.6 }}>{title}</Box>
                          <Box sx={{ color: "#cbd5e1", fontSize: 14, lineHeight: 1.6 }}>{text}</Box>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Grid>
              </Grid>
            </Container>
          </Box>

          <Box id="contact" sx={{ py: { xs: 9, md: 11 }, bgcolor: "#fff" }}>
            <Container maxWidth="md">
              <Box sx={{ textAlign: "center", p: { xs: 4, md: 7 }, borderRadius: "26px", background: "linear-gradient(135deg,#1d4ed8,#2563eb 55%,#0ea5e9)", color: "#fff", boxShadow: "0 25px 60px rgba(37,99,235,.25)" }}>
                <Box component="h2" sx={{ fontSize: { xs: 32, md: 43 }, lineHeight: 1.15, m: 0 }}>Ready to get back to business?</Box>
                <Box component="p" sx={{ maxWidth: 600, mx: "auto", my: 2.5, color: "#dbeafe", fontSize: 16.5, lineHeight: 1.7 }}>
                  Sign in to access your personalized dashboard, assigned tools, and latest operational data.
                </Box>
                <Box component={Link} to="/authentication/sign-in" sx={{ display: "inline-flex", alignItems: "center", gap: 1, mt: 1, px: 3.4, py: 1.55, borderRadius: "12px", bgcolor: "#fff", color: "#1d4ed8", fontWeight: 800, textDecoration: "none" }}>
                  Sign in securely <Icon>login</Icon>
                </Box>
              </Box>
            </Container>
          </Box>
        </Box>

        <Box component="footer" sx={{ bgcolor: "#0b1220", color: "#cbd5e1", pt: 7, pb: 3 }}>
          <Container maxWidth="lg">
            <Grid container spacing={5} sx={{ pb: 5 }}>
              <Grid item xs={12} md={5}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, mb: 2 }}>
                  <Box component="img" src={brandLogo} alt="" sx={{ width: 40, height: 40, objectFit: "contain", filter: "brightness(0) invert(1)" }} />
                  <Box sx={{ color: "#fff", fontWeight: 800, fontSize: 19 }}>EduNextG Sales</Box>
                </Box>
                <Box sx={{ maxWidth: 430, color: "#94a3b8", fontSize: 14, lineHeight: 1.75 }}>
                  A connected sales and distribution management platform for teams that value speed, accuracy, and accountability.
                </Box>
              </Grid>
              <Grid item xs={6} md={2}>
                <Box sx={{ color: "#fff", fontWeight: 800, mb: 2 }}>Product</Box>
                {["Features", "Solutions", "Dashboard"].map((item) => (
                  <Box key={item} component={item === "Dashboard" ? Link : "a"} to={item === "Dashboard" ? "/authentication/sign-in" : undefined} href={item !== "Dashboard" ? `#${item.toLowerCase()}` : undefined} sx={{ display: "block", color: "#94a3b8", fontSize: 14, textDecoration: "none", mb: 1.2, "&:hover": { color: "#fff" } }}>{item}</Box>
                ))}
              </Grid>
              <Grid item xs={6} md={2}>
                <Box sx={{ color: "#fff", fontWeight: 800, mb: 2 }}>Access</Box>
                <Box component={Link} to="/authentication/sign-in" sx={{ display: "block", color: "#94a3b8", fontSize: 14, textDecoration: "none", mb: 1.2, "&:hover": { color: "#fff" } }}>Staff login</Box>
                <Box component={Link} to="/authentication/sign-in" sx={{ display: "block", color: "#94a3b8", fontSize: 14, textDecoration: "none", mb: 1.2, "&:hover": { color: "#fff" } }}>Admin login</Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ color: "#fff", fontWeight: 800, mb: 2 }}>Secure operations</Box>
                <Box sx={{ display: "flex", gap: 1, color: "#94a3b8", fontSize: 14, lineHeight: 1.6 }}>
                  <Icon sx={{ color: "#60a5fa" }}>lock</Icon>
                  Protected access for every authorized user.
                </Box>
              </Grid>
            </Grid>
            <Box sx={{ pt: 3, borderTop: "1px solid #1e293b", display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1, justifyContent: "space-between", color: "#64748b", fontSize: 12.5 }}>
              <Box>© {year} EduNextG Sales. All rights reserved.</Box>
              <Box>Designed for reliable business operations.</Box>
            </Box>
          </Container>
        </Box>
      </Box>
    </PageLayout>
  );
}

export default LandingPage;
