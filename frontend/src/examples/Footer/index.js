// prop-types is a library for typechecking of props
import PropTypes from "prop-types";

// @mui material components
import Link from "@mui/material/Link";
import Icon from "@mui/material/Icon";

// Material Dashboard 2 React components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

// Material Dashboard 2 React base styles
import typography from "assets/theme/base/typography";

function Footer() {
  return null;
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
