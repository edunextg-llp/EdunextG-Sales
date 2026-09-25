import { useState } from "react";
import PropTypes from "prop-types";
import MDButton from "components/MDButton";
import { downloadSalesExcel } from "utils/downloadSalesExcel";

function SalesExcelButton({ rows, filename }) {
  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadSalesExcel(rows, filename);
    } catch (error) {
      console.error("Excel download failed:", error);
      window.alert("Unable to download Excel. Please try again.");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <MDButton color="success" variant="gradient" onClick={handleDownload}
      disabled={downloading || rows.length === 0}>
      {downloading ? "Downloading..." : "Download Excel"}
    </MDButton>
  );
}

SalesExcelButton.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  filename: PropTypes.string.isRequired,
};

export default SalesExcelButton;
