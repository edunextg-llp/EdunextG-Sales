export const getSaleCompanyIds = (row) =>
  String(row.company_ids || row.company_id || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

export const matchesSaleCompany = (row, companyId) =>
  !companyId || getSaleCompanyIds(row).includes(String(companyId));

export const getSaleCompanyOptions = (rows) => {
  const companies = new Map();
  rows.forEach((row) => {
    const ids = getSaleCompanyIds(row);
    const names = String(row.company_name || "").split(",").map((name) => name.trim());
    ids.forEach((id, index) => {
      companies.set(id, ids.length === 1
        ? row.company_name || `Company ${id}`
        : names[index] || `Company ${id}`);
    });
  });
  return [...companies].map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
