export const formatBpSaleId = (sale) => {
  const id = sale?.bp_sale_id || sale?.sale_number || sale?.sale_id || sale?.id;
  if (!id) return "N/A";
  const value = String(id).trim();
  return value.toUpperCase().startsWith("BP") ? value : `BP${value}`;
};
