import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Icon from "@mui/material/Icon";
import IconButton from "@mui/material/IconButton";

import PageLayout from "examples/LayoutContainers/PageLayout";

// Hero banners (text is part of the image).
import heroPackagingExcellence from "assets/images/landing/hero-1.jpg";
import heroQualityPackaging from "assets/images/landing/hero-2.jpg";
// Product card and About images: replace these files with the real photos
// (keep the same file names, or change the imports below).
import everestImage from "assets/images/landing/products/everest.png";
import lorealImage from "assets/images/landing/products/loreal.png";
import neevamImage from "assets/images/landing/products/neevam.png";
import relianceImage from "assets/images/landing/products/reliance.png";
import assamTeaImage from "assets/images/landing/products/assam-tea.png";
import saloniImage from "assets/images/landing/products/saloni.png";
import aboutImage from "assets/images/landing/about.png";
// Brand logos (transparent PNGs).
import everestLogo from "assets/images/landing/brands/everest.png";
import lorealLogo from "assets/images/landing/brands/loreal.png";
import neevamLogo from "assets/images/landing/brands/neevam.png";
import relianceLogo from "assets/images/landing/brands/reliance.png";
import saloniLogo from "assets/images/landing/brands/saloni.png";
// Doodle pattern behind the "Our Products" section.
import productsBackground from "assets/images/landing/products-bg.jpg";

const NAVY = "#1e2a6e";
const BLUE = "#2b4cc4";
const GREEN = "#2e8b3c";
const FONT = "'Poppins', 'Roboto', 'Helvetica', sans-serif";
const SERIF = "'Georgia', 'Times New Roman', serif";

const heroSlides = [
  {
    image: heroPackagingExcellence,
    alt: "Packaging Excellence for Every Brand – high-quality, reliable and innovative food packaging for leading brands",
  },
  {
    image: heroQualityPackaging,
    alt: "Quality Packaging for Every Product – Pack. Protect. Deliver.",
  },
];

const products = [
  { name: "Everest", text: "Authentic spices for richer taste and flavour in every meal.", image: everestImage },
  { name: "L'Oréal", text: "Advanced hair care for stronger, healthier and shinier hair.", image: lorealImage },
  { name: "Neevam", text: "Traditional spices, crafted for authentic Indian taste.", image: neevamImage },
  { name: "Reliance", text: "Quality you can trust, for a healthier lifestyle.", image: relianceImage },
  { name: "Assam Tea", text: "Rich aroma and bold flavour in every sip.", image: assamTeaImage },
  { name: "Saloni Oil", text: "Pure and healthy mustard oil, packed with freshness and natural goodness.", image: saloniImage },
];

// Brands with `logo` show the image; the others show their name as styled text.
const brands = [
  { name: "Everest", logo: everestLogo },
  { name: "L'Oréal", logo: lorealLogo },
  { name: "Neevam", logo: neevamLogo },
  { name: "Reliance Consumer Products", logo: relianceLogo },
  { name: "Assam Tea", color: "#1f6b2a", bg: "transparent", font: FONT },
  { name: "Saloni Kachchi Ghani Mustard Oil", logo: saloniLogo },
];

const highlights = [
  { icon: "verified_user", label: "Quality First", gradient: "linear-gradient(145deg,#4c6ef5,#1e2a6e)" },
  { icon: "settings", label: "Reliable Process", gradient: "linear-gradient(145deg,#43b05c,#1d6b2c)" },
  { icon: "layers", label: "Multiple Categories", gradient: "linear-gradient(145deg,#f7c948,#c98a0c)" },
];

const navItems = [
  ["Home", "#home"],
  ["Products", "#products"],
  ["Solutions", "#solutions"],
  ["About Us", "#about"],
  ["Contact Us", "#contact"],
];

const SLIDE_MS = 4000; // auto-slide interval

function HeroSlider() {
  const [active, setActive] = useState(0);
  const go = useCallback((index) => setActive((index + heroSlides.length) % heroSlides.length), []);

  // Always auto-slide. The timer restarts after a manual click, so a chosen
  // slide still stays on screen for the full interval.
  useEffect(() => {
    const timer = setTimeout(() => go(active + 1), SLIDE_MS);
    return () => clearTimeout(timer);
  }, [active, go]);

  return (
    <Box
      id="home"
      component="section"
      aria-roledescription="carousel"
      aria-label="Bawarchee highlights"
      sx={{
        position: "relative",
        width: "100%",
        aspectRatio: { xs: "auto", sm: "1600 / 571" },
        height: { xs: 260, sm: "auto" },
        overflow: "hidden",
        bgcolor: "#e9f1e4",
      }}
    >
      {heroSlides.map((slide, index) => (
        <Box
          key={slide.alt}
          component="img"
          src={slide.image}
          alt={slide.alt}
          aria-hidden={index !== active}
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // On phones keep the headline (left side) in view.
            objectPosition: { xs: "left center", sm: "center" },
            opacity: index === active ? 1 : 0,
            transform: index === active ? "scale(1)" : "scale(1.03)",
            transition: "opacity 900ms ease, transform 5s ease",
          }}
        />
      ))}

      {[["chevron_left", -1, "Previous slide", { left: 12 }], ["chevron_right", 1, "Next slide", { right: 12 }]].map(([icon, step, label, side]) => (
        <IconButton
          key={icon}
          aria-label={label}
          onClick={() => go(active + step)}
          sx={{
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            ...side,
            display: { xs: "none", md: "inline-flex" },
            bgcolor: "rgba(255,255,255,.75)",
            color: NAVY,
            boxShadow: "0 4px 14px rgba(0,0,0,.12)",
            "&:hover": { bgcolor: "#fff" },
          }}
        >
          <Icon>{icon}</Icon>
        </IconButton>
      ))}

      <Box sx={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 1 }}>
        {heroSlides.map((slide, index) => (
          <Box
            key={slide.alt}
            component="button"
            type="button"
            aria-label={`Show slide ${index + 1}`}
            aria-current={index === active}
            onClick={() => go(index)}
            sx={{
              width: index === active ? 26 : 10,
              height: 10,
              p: 0,
              border: "2px solid #fff",
              borderRadius: 10,
              cursor: "pointer",
              bgcolor: index === active ? "#fff" : "rgba(255,255,255,.45)",
              boxShadow: "0 1px 4px rgba(0,0,0,.25)",
              transition: "all 300ms ease",
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

function SectionHeading({ eyebrow, title, text, center = false, eyebrowColor = GREEN }) {
  return (
    <Box sx={{ textAlign: center ? "center" : "left", mb: { xs: 3, md: 4 } }}>
      <Box sx={{ color: eyebrowColor, fontWeight: 700, fontSize: { xs: 15, md: 19 }, letterSpacing: 0.4, textTransform: center ? "none" : "uppercase" }}>
        {center ? `--- ${eyebrow} ---` : eyebrow}
      </Box>
      <Box component="h2" sx={{ m: 0, mt: 0.5, color: NAVY, fontWeight: 800, fontSize: { xs: 25, md: 34 }, lineHeight: 1.2 }}>
        {title}
      </Box>
      {text && (
        <Box component="p" sx={{ m: 0, mt: 1, color: "#334155", fontSize: { xs: 13.5, md: 15 }, maxWidth: 640, mx: center ? "auto" : 0 }}>
          {text}
        </Box>
      )}
    </Box>
  );
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const year = new Date().getFullYear();

  return (
    <PageLayout>
      <Box sx={{ minHeight: "100vh", bgcolor: "#fff", color: NAVY, fontFamily: FONT, overflowX: "hidden" }}>
        {/* Header */}
        <Box
          component="header"
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            background: `linear-gradient(90deg, #1b2466 0%, ${NAVY} 35%, #3150b8 100%)`,
            boxShadow: "0 4px 18px rgba(15,23,42,.25)",
          }}
        >
          <Container maxWidth="xl">
            <Box sx={{ minHeight: { xs: 64, md: 76 }, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
              <Box component="a" href="#home" sx={{ textDecoration: "none", color: "#fff", lineHeight: 1.05 }}>
                <Box sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: { xs: 22, md: 30 }, letterSpacing: 1 }}>BAWARCHEE</Box>
                <Box sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: { xs: 10.5, md: 15 }, letterSpacing: 0.4 }}>FOOD PACKAGING PVT. LTD.</Box>
              </Box>

              <Box component="nav" aria-label="Main" sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: { md: 3, lg: 5 } }}>
                {navItems.map(([label, href], index) => (
                  <Box
                    key={label}
                    component="a"
                    href={href}
                    sx={{
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 16,
                      textDecoration: index === 0 ? "underline" : "none",
                      textUnderlineOffset: "8px",
                      textDecorationThickness: "2px",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    {label}
                  </Box>
                ))}
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  component={Link}
                  to="/authentication/sign-in"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: { xs: 1.5, md: 2.25 },
                    py: { xs: 0.8, md: 1.1 },
                    borderRadius: "12px",
                    background: "linear-gradient(135deg,#5fb4ff,#2f7ef0)",
                    border: "1px solid rgba(255,255,255,.6)",
                    boxShadow: "0 0 14px rgba(95,180,255,.65)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: { xs: 13, md: 15 },
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    "&:hover": { filter: "brightness(1.08)" },
                  }}
                >
                  <Icon sx={{ fontSize: "20px !important" }}>manage_accounts</Icon> Portal Login
                </Box>
                <IconButton
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  sx={{ display: { xs: "inline-flex", md: "none" }, color: "#fff" }}
                >
                  <Icon>{menuOpen ? "close" : "menu"}</Icon>
                </IconButton>
              </Box>
            </Box>
            {menuOpen && (
              <Box component="nav" aria-label="Mobile" sx={{ display: { md: "none" }, pb: 2 }}>
                {navItems.map(([label, href]) => (
                  <Box
                    key={label}
                    component="a"
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    sx={{ display: "block", color: "#fff", fontWeight: 600, py: 1.1, borderTop: "1px solid rgba(255,255,255,.15)", textDecoration: "none" }}
                  >
                    {label}
                  </Box>
                ))}
              </Box>
            )}
          </Container>
        </Box>

        <HeroSlider />

        {/* Products */}
        <Box
          id="products"
          component="section"
          sx={{
            py: { xs: 5, md: 7 },
            bgcolor: "#eef4fa",
            backgroundImage: `url(${productsBackground})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            scrollMarginTop: 80,
          }}
        >
          <Container maxWidth="xl">
            <SectionHeading
              eyebrow="Our Products"
              title="Premium Packaging for Leading Brands"
              text="We offer a wide range of high-quality packaging solutions for your trusted brands."
            />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", lg: "repeat(6, 1fr)" }, gap: { xs: 1.5, md: 2.5 } }}>
              {products.map((product) => (
                <Box
                  key={product.name}
                  component="article"
                  sx={{
                    bgcolor: "#fff",
                    borderRadius: "16px",
                    border: "1px solid #dbe4f0",
                    boxShadow: "0 6px 18px rgba(30,42,110,.08)",
                    p: { xs: 1.25, md: 1.5 },
                    display: "flex",
                    flexDirection: "column",
                    transition: "transform 200ms ease, box-shadow 200ms ease",
                    "&:hover": { transform: "translateY(-4px)", boxShadow: "0 14px 28px rgba(30,42,110,.15)" },
                  }}
                >
                  <Box
                    component="img"
                    src={product.image}
                    alt={`${product.name} products`}
                    loading="lazy"
                    sx={{ width: "100%", aspectRatio: "5 / 4", objectFit: "contain", borderRadius: "10px" }}
                  />
                  <Box component="h3" sx={{ m: 0, mt: 1.25, textAlign: "center", color: NAVY, fontWeight: 600, fontSize: { xs: 17, md: 21 } }}>
                    {product.name}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1, mt: 0.75, flex: 1 }}>
                    <Box component="p" sx={{ m: 0, flex: 1, color: "#475569", fontSize: { xs: 11.5, md: 12.5 }, lineHeight: 1.45 }}>
                      {product.text}
                    </Box>
                    <Box
                      component="a"
                      href="#contact"
                      aria-label={`Ask about ${product.name} packaging`}
                      sx={{
                        flexShrink: 0,
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        color: "#fff",
                        background: `linear-gradient(145deg,${BLUE},${NAVY})`,
                        boxShadow: "0 3px 8px rgba(30,42,110,.35)",
                      }}
                    >
                      <Icon sx={{ fontSize: "20px !important" }}>chevron_right</Icon>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Brands */}
        <Box id="solutions" component="section" sx={{ py: { xs: 5, md: 6 }, bgcolor: "#f5f7ea", scrollMarginTop: 80 }}>
          <Container maxWidth="xl">
            <SectionHeading
              center
              eyebrow="Our Trusted Brands"
              title="Brands We Work With"
              text="We are proud to be the packaging partner for some of the most trusted names in the food and lifestyle industry."
            />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", lg: "repeat(6, 1fr)" }, gap: { xs: 1.5, md: 2 } }}>
              {brands.map((brand) => (
                <Box
                  key={brand.name}
                  sx={{
                    minHeight: { xs: 84, md: 110 },
                    borderRadius: "18px",
                    border: `2px solid ${GREEN}`,
                    bgcolor: "#fff",
                    boxShadow: "0 4px 12px rgba(46,139,60,.12)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    px: 1.5,
                    textAlign: "center",
                  }}
                >
                  {brand.logo ? (
                    <Box component="img" src={brand.logo} alt={brand.name} loading="lazy" sx={{ maxWidth: "86%", maxHeight: { xs: 54, md: 72 }, objectFit: "contain" }} />
                  ) : (
                    <>
                      <Box
                        sx={{
                          px: brand.bg === "transparent" ? 0 : 1.25,
                          py: brand.bg === "transparent" ? 0 : 0.4,
                          bgcolor: brand.bg,
                          color: brand.color,
                          fontFamily: brand.font,
                          fontWeight: 600,
                          letterSpacing: brand.spacing || 0,
                          fontSize: { xs: 21, md: 28 },
                          borderRadius: "4px",
                          lineHeight: 1.15,
                        }}
                      >
                        {brand.name}
                      </Box>
                      {brand.sub && (
                        <Box sx={{ mt: 0.4, color: "#1f2937", fontSize: { xs: 7.5, md: 9 }, fontWeight: 700, letterSpacing: 0.3 }}>{brand.sub}</Box>
                      )}
                    </>
                  )}
                </Box>
              ))}
            </Box>
          </Container>
        </Box>

        {/* About */}
        <Box id="about" component="section" sx={{ py: { xs: 6, md: 8 }, bgcolor: "#fff", position: "relative", overflow: "hidden", scrollMarginTop: 80 }}>
          <Container maxWidth="xl">
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.25fr 1fr" }, gap: { xs: 4, md: 6 }, alignItems: "center" }}>
              <Box>
                <Box sx={{ color: NAVY, fontWeight: 700, fontSize: { xs: 18, md: 26 }, letterSpacing: 0.3 }}>ABOUT BAWARCHEE</Box>
                <Box component="h2" sx={{ m: 0, mt: 1, fontFamily: SERIF, color: NAVY, fontWeight: 700, fontSize: { xs: 28, md: 40 }, lineHeight: 1.2 }}>
                  Packaging That Builds Brands
                </Box>
                <Box component="p" sx={{ m: 0, mt: 2.5, fontFamily: SERIF, color: BLUE, fontWeight: 700, fontSize: { xs: 17, md: 24 }, lineHeight: 1.45, maxWidth: 640 }}>
                  At BAWARCHEE FOOD PACKAGING PVT. LTD., we focus on delivering dependable packaging solutions designed
                  around product quality, brand identity and consumer appeal.
                </Box>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 3, md: 6 }, mt: { xs: 4, md: 5 } }}>
                  {highlights.map((item) => (
                    <Box key={item.label} sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.25, minWidth: 110 }}>
                      <Box
                        sx={{
                          width: { xs: 70, md: 86 },
                          height: { xs: 70, md: 86 },
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          background: item.gradient,
                          boxShadow: "inset 0 -4px 10px rgba(0,0,0,.2), 0 6px 14px rgba(0,0,0,.15)",
                          border: "3px solid rgba(255,255,255,.7)",
                        }}
                      >
                        <Icon sx={{ color: "#fff", fontSize: { xs: "34px !important", md: "42px !important" } }}>{item.icon}</Icon>
                      </Box>
                      <Box sx={{ color: NAVY, fontWeight: 600, fontSize: { xs: 14, md: 17 } }}>{item.label}</Box>
                    </Box>
                  ))}
                </Box>
              </Box>

              <Box sx={{ position: "relative", maxWidth: 520, width: "100%", mx: "auto" }}>
                <Box
                  aria-hidden
                  sx={{
                    position: "absolute",
                    inset: "-6% -10% -6% 8%",
                    borderRadius: "48% 0 0 48% / 50% 0 0 50%",
                    background: `linear-gradient(160deg, ${GREEN} 0%, #7cc576 30%, ${BLUE} 70%, ${NAVY} 100%)`,
                    opacity: 0.9,
                  }}
                />
                <Box
                  component="img"
                  src={aboutImage}
                  alt="Bawarchee packaged products"
                  loading="lazy"
                  sx={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    borderRadius: "44% 12px 12px 44% / 50% 12px 12px 50%",
                    border: "6px solid #fff",
                    boxShadow: "0 18px 40px rgba(30,42,110,.25)",
                  }}
                />
              </Box>
            </Box>
          </Container>
        </Box>

        {/* Contact + footer */}
        <Box
          id="contact"
          component="footer"
          sx={{ background: `linear-gradient(90deg, #1b2466 0%, ${NAVY} 45%, #3150b8 100%)`, color: "#dbe4ff", pt: { xs: 5, md: 6 }, pb: 3, scrollMarginTop: 80 }}
        >
          <Container maxWidth="xl">
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr 1fr" }, gap: 4, pb: 4 }}>
              <Box>
                <Box sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: 26, color: "#fff", letterSpacing: 1 }}>BAWARCHEE</Box>
                <Box sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: 13, color: "#fff" }}>FOOD PACKAGING PVT. LTD.</Box>
                <Box component="p" sx={{ m: 0, mt: 1.5, fontSize: 14, lineHeight: 1.7, maxWidth: 420 }}>
                  Quality packaging, trusted brands and a better tomorrow – ensuring freshness, safety and trust in every pack.
                </Box>
              </Box>
              <Box>
                <Box sx={{ color: "#fff", fontWeight: 700, mb: 1.5 }}>Quick Links</Box>
                {navItems.map(([label, href]) => (
                  <Box key={label} component="a" href={href} sx={{ display: "block", color: "#dbe4ff", fontSize: 14, mb: 1, textDecoration: "none", "&:hover": { color: "#fff" } }}>
                    {label}
                  </Box>
                ))}
              </Box>
              <Box>
                <Box sx={{ color: "#fff", fontWeight: 700, mb: 1.5 }}>Contact Us</Box>
                <Box component="p" sx={{ m: 0, mb: 2, fontSize: 14, lineHeight: 1.7 }}>
                  Staff, partners and delivery teams can sign in to the Bawarchee portal.
                </Box>
                <Box
                  component={Link}
                  to="/authentication/sign-in"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, px: 2.25, py: 1.1, borderRadius: "12px", bgcolor: "#fff", color: NAVY, fontWeight: 700, textDecoration: "none" }}
                >
                  <Icon>login</Icon> Portal Login
                </Box>
              </Box>
            </Box>
            <Box sx={{ pt: 2.5, borderTop: "1px solid rgba(255,255,255,.18)", display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: 1, justifyContent: "space-between", fontSize: 12.5 }}>
              <Box>© {year} Bawarchee Food Packaging Pvt. Ltd. All rights reserved.</Box>
              <Box component={Link} to="/privacy-policy" sx={{ color: "#dbe4ff", textDecoration: "none", "&:hover": { color: "#fff" } }}>Privacy Policy</Box>
            </Box>
          </Container>
        </Box>
      </Box>
    </PageLayout>
  );
}

export default LandingPage;
