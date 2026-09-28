// prop-types is a library for typechecking of props
import PropTypes from "prop-types";

function Footer() {
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
