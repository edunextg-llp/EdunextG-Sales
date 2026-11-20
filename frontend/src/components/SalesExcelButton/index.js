// "Download Excel" for sales lists: Tailwind CSS (no MUI). Download logic unchanged.
import { useState } from "react";
import PropTypes from "prop-types";
import { downloadSalesExcel } from "utils/downloadSalesExcel";
import { Icon, btn } from "components/tw";

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
    <button type="button" className={btn.outline} onClick={handleDownload} disabled={downloading || rows.length === 0}>
      <Icon name="download" className="text-[18px] text-emerald-600" />
      {downloading ? "Downloading..." : "Download Excel"}
    </button>
  );
}

SalesExcelButton.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  filename: PropTypes.string.isRequired,
};

export default SalesExcelButton;
