import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

const PrintableStickers = forwardRef(({ stickers }, ref) => {
  if (!stickers || stickers.length === 0) return null;

  // Chunk stickers into pages of 9
  const CHUNK_SIZE = 9;
  const pages = [];
  for (let i = 0; i < stickers.length; i += CHUNK_SIZE) {
    pages.push(stickers.slice(i, i + CHUNK_SIZE));
  }

  return (
    <div ref={ref} className="printable-stickers-container">
      <style>
        {`
          @media print {
            body {
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
            }
            #root, .MuiDialogTitle-root, .MuiDialogActions-root, .MuiBackdrop-root {
              display: none !important;
            }
            .MuiDialog-root, .MuiDialog-container, .MuiPaper-root, .MuiDialogContent-root {
              position: static !important;
              transform: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
              max-width: none !important;
              height: auto !important;
              max-height: none !important;
              overflow: visible !important;
              background: white !important;
            }
            .printable-stickers-container {
              display: block !important;
              background-color: white !important;
            }
            .sticker-page {
              page-break-after: always;
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              grid-template-rows: repeat(3, 1fr);
              gap: 15px;
              width: 210mm;
              height: 297mm;
              padding: 20mm 15mm;
              box-sizing: border-box;
              margin: 0 auto;
            }
            /* Remove margins from the body for flawless A4 filling */
            @page {
              margin: 0;
              size: A4;
            }
          }
          
          /* Visual Styles both for screen preview and print */
          .sticker-page {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 2rem;
            background: white;
            padding: 10px;
            border-radius: 8px;
          }
          .sticker-card {
            border: 2px dashed #bbb;
            border-radius: 8px;
            padding: 15px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            text-align: center;
            min-height: 200px;
            background: #fff;
          }
        `}
      </style>

      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="sticker-page">
          {page.map((sticker, idx) => (
            <div key={idx} className="sticker-card">
              <MDTypography variant="h5" fontWeight="bold" color="text">
                {sticker.shopName}
              </MDTypography>
              <MDTypography variant="caption" color="textSecondary" mb={1}>
                {sticker.outletErpId}
              </MDTypography>

              <MDBox mt={1} display="flex" justifyContent="space-between" px={2}>
                <MDTypography variant="button" fontWeight="medium">
                  Inv: {sticker.invoiceNumber}
                </MDTypography>
                <MDTypography variant="button" fontWeight="bold">
                  ₹{sticker.amount}
                </MDTypography>
              </MDBox>

              <MDTypography variant="h3" fontWeight="bold" mt={2} color="info">
                {sticker.stickerNumber}
              </MDTypography>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

PrintableStickers.propTypes = {
  stickers: PropTypes.arrayOf(
    PropTypes.shape({
      shopName: PropTypes.string,
      outletErpId: PropTypes.string,
      invoiceNumber: PropTypes.string,
      amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      stickerNumber: PropTypes.string,
    })
  ).isRequired,
};

export default PrintableStickers;
