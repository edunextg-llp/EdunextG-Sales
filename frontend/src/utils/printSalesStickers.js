import JsBarcode from "jsbarcode";

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBarcodeDataUrl(value) {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, {
    format: "CODE128",
    width: 2,
    height: 50,
    displayValue: true,
    fontSize: 12,
    margin: 6,
  });
  return canvas.toDataURL("image/png");
}

/**
 * Opens a print window with barcode stickers for each sale.
 * @param {Array<{ stickerNumber, shopName, invoiceNumber, amount }>} stickers
 */
export function printSalesStickers(stickers) {
  if (!stickers?.length) {
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Please allow popups to print stickers.");
    return;
  }

  const stickerBlocks = stickers
    .map((sticker) => {
      const barcodeImg = buildBarcodeDataUrl(sticker.stickerNumber);
      return `
        <div class="sticker">
          <div class="shop-name">${escapeHtml(sticker.shopName)}</div>
          <div class="detail"><strong>Invoice:</strong> ${escapeHtml(sticker.invoiceNumber)}</div>
          <div class="detail"><strong>Amount:</strong> ₹${Number(sticker.amount).toFixed(2)}</div>
          <img class="barcode" src="${barcodeImg}" alt="${escapeHtml(sticker.stickerNumber)}" />
          <div class="sticker-code">${escapeHtml(sticker.stickerNumber)}</div>
        </div>
      `;
    })
    .join("");

  printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Print Stickers</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 12px;
      }
      .stickers-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .sticker {
        width: 280px;
        border: 2px solid #000;
        border-radius: 8px;
        padding: 12px;
        text-align: center;
        page-break-inside: avoid;
      }
      .shop-name {
        font-size: 16px;
        font-weight: bold;
        margin-bottom: 8px;
        word-break: break-word;
      }
      .detail {
        font-size: 13px;
        margin-bottom: 4px;
        text-align: left;
      }
      .barcode {
        width: 100%;
        max-width: 240px;
        height: auto;
        margin: 8px auto 4px;
        display: block;
      }
      .sticker-code {
        font-size: 18px;
        font-weight: bold;
        letter-spacing: 1px;
      }
      @media print {
        body { padding: 0; }
        .sticker { margin: 8px; }
      }
    </style>
  </head>
  <body>
    <div class="stickers-grid">${stickerBlocks}</div>
    <script>
      window.onload = function () {
        window.focus();
        window.print();
      };
    </script>
  </body>
</html>`);

  printWindow.document.close();
}
