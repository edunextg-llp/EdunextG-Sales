// prop-types is a library for typechecking of props
import PropTypes from "prop-types";

// // @mui material components
// import Container from "@mui/material/Container";
// import Link from "@mui/material/Link";
// // import Icon from "@mui/material/Icon";

// // Material Dashboard 2 React components
// import MDBox from "components/MDBox";
// import MDTypography from "components/MDTypography";

// Material Dashboard 2 React base styles
import typography from "assets/theme/base/typography";

function Footer() {
  // const { size } = typography;

  return null;
}

// Setting default props for the Footer
Footer.defaultProps = {
  light: false,
};

// Typechecking props for the Footer
Footer.propTypes = {
  light: PropTypes.bool,
};

export default Footer;
