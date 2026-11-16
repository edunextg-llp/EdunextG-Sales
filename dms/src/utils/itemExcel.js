import { downloadExcel, fileSafe } from "./excel";

// "Download Excel" on Add Item: every item of the selected seller.
export function downloadItemsExcel(items, { company, seller }) {
  return downloadExcel({
    fileName: ["Items", fileSafe(company?.name), fileSafe(seller?.seller_name)].filter(Boolean).join("_"),
    title: `Items · ${company?.name || ""} · ${seller?.seller_name || ""}`,
    sheets: [
      {
        name: "Items",
        rows: items,
        columns: [
          { header: "Sr No", width: 7, type: "number", value: (_, i) => i + 1 },
          { header: "Item Code", key: "item_code", width: 15 },
          { header: "Product ERP ID", key: "product_erp_id", width: 18 },
          { header: "SKU Name", key: "sku_name", width: 32 },
          { header: "Variant Name", key: "variant_name", width: 30 },
          { header: "HSN Code", key: "hsn_code", width: 12 },
          { header: "GST %", key: "gst_percent", width: 8, type: "percent" },
          { header: "CGST %", key: "cgst_percent", width: 8, type: "percent" },
          { header: "SGST %", key: "sgst_percent", width: 8, type: "percent" },
          { header: "Pcs / Box", width: 10, type: "number", value: (it) => (it.pcs_per_box != null ? Math.trunc(Number(it.pcs_per_box)) : null) },
          { header: "Company", width: 24, value: (it) => it.company_name || company?.name },
          { header: "Seller Code", width: 13, value: (it) => it.seller_code || seller?.seller_code },
          { header: "Seller Name", width: 32, value: (it) => it.seller_name || seller?.seller_name },
          { header: "Added On", key: "created_at", width: 12, type: "date" },
        ],
      },
    ],
  });
}
