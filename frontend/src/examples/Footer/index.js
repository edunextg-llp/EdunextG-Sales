// prop-types is a library for typechecking of props
import PropTypes from "prop-types";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

function Footer() {
  return (
    <MDBox
      component="footer"
      display="flex"
      justifyContent="space-between"
      alignItems="center"
      flexWrap="wrap"
      gap={1}
      px={3}
      py={2}
      mt={2}
    >
      <MDTypography variant="caption" color="text">
        © {new Date().getFullYear()} EduNextG India LLP
      </MDTypography>
      <MDTypography
        component="a"
        href="/privacy-policy"
        variant="caption"
        color="dark"
        sx={{ fontWeight: 600, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
      >
        Privacy Policy
      </MDTypography>
    </MDBox>
  );
}

// Setting default values for the props of Footer
Footer.defaultProps = {
  company: { href: "https://www.edunextg.in/", name: "EduNextG India LLP" },
  links: [
    { href: "https://www.edunextg.in/", name: "EduNextG India LLP" },
    { href: "https://www.edunextg.in/", name: "About Us" },
    { href: "https://www.edunextg.in/", name: "Blog" },
    { href: "https://www.edunextg.in/", name: "License" },
  ],
};

// Typechecking props for the Footer
Footer.propTypes = {
  company: PropTypes.objectOf(PropTypes.string),
  links: PropTypes.arrayOf(PropTypes.object),
};

export default Footer;
