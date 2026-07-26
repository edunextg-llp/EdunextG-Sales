
const fs = require('fs');
const path = 'd:/EdunextG-Sales/frontend/src/layouts/physical-stock/index.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Fetch companies instead of dmsImports
content = content.replace(
  /const \[dmsImports, setDmsImports\] = useState\(\[\]\);/,
  'const [companies, setCompanies] = useState([]);\n  const [dmsImportId, setDmsImportId] = useState(null);\n  const [approveModalOpen, setApproveModalOpen] = useState(false);\n  const [selectedApproveItem, setSelectedApproveItem] = useState(null);\n  const [approving, setApproving] = useState(false);'
);

content = content.replace(
  /const \[stockListImportFilter, setStockListImportFilter\] = useState\(""\);/,
  'const [companyFilter, setCompanyFilter] = useState("");'
);

content = content.replace(
  /const selectedDmsImportId = useMemo\([\s\S]*?\]\n  \);/,
  ''
);

content = content.replace(
  /const selectedDmsImport = useMemo\([\s\S]*?\]\n  \);/,
  ''
);

content = content.replace(
  /const fetchDmsImports = async \(\) => \{[\s\S]*?return imports;\n    \} catch \(fetchError\) \{[\s\S]*?\}\n  \};/,
  `const fetchCompanies = async () => {
    try {
      const response = await fetch(\`\${API}/staff/companies\`);
      const data = await response.json();
      setCompanies(data);
      return data;
    } catch (e) {
      setError(e.message);
      return [];
    }
  };`
);

content = content.replace(
  /const fetchPhysicalStock = async \(dmsImportId = selectedDmsImportId\) => \{[\s\S]*?setLoading\(false\);\n    \}\n  \};/,
  `const fetchPhysicalStock = async (companyId = companyFilter) => {
    if (!companyId) {
      setStockImport(null);
      setDmsImportId(null);
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(\`\${API}/staff/physical-stock/company?companyId=\${companyId}\`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch physical stock.");
      setStockImport(data.dmsImport || null);
      setDmsImportId(data.dmsImportId || null);
      setItems(data.items || []);
    } catch (fetchError) {
      setError(fetchError.message);
      setStockImport(null);
      setDmsImportId(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };`
);

content = content.replace(
  /fetchDmsImports\(\);/,
  'fetchCompanies();'
);

content = content.replace(
  /fetchPhysicalStock\(selectedDmsImportId\);\n    \/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\n  \}, \[stockListImportFilter, dmsImports\]\);/,
  `fetchPhysicalStock(companyFilter);\n    // eslint-disable-next-line react-hooks/exhaustive-deps\n  }, [companyFilter]);`
);

content = content.replace(
  /const handleImportFilterChange = \(event\) => \{[\s\S]*?\}\n  \};/,
  `const handleCompanyFilterChange = (event) => {
    setCompanyFilter(event.target.value);
    setSelectedFile(null);
    setMessage("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };`
);

// 2. Remove manual entry open logic parts we don't need, or fix manual entry
content = content.replace(
  /const manualDmsImportId = useMemo\([\s\S]*?\]\n  \);/,
  'const manualDmsImportId = dmsImportId;'
);

content = content.replace(
  /const uploadDmsImportId = useMemo\([\s\S]*?\]\n  \);/,
  'const uploadDmsImportId = dmsImportId;'
);

content = content.replace(
  /const handleEditPhysicalItem = async \(item\) => \{[\s\S]*?setError\(editError\.message\);\n    \}\n  \};/,
  `const handleEditPhysicalItem = async (item) => {
    if (!dmsImportId) {
      setError("Please select a company first.");
      return;
    }
    resetManualForm();
    setManualModalOpen(true);
    try {
      const product = await loadProductFromBackend(
        String(dmsImportId),
        item.product_erp_id
      );
      setErpOptions([product]);
      applyProductToForm(product);
      setStockForm({
        physicalStockInCase: String(item.physical_stock?.physical_stock_in_case ?? item.current_stock_in_case ?? ""),
        physicalStockInPcs: String(item.physical_stock?.physical_stock_in_pcs ?? item.current_stock_in_pcs ?? ""),
      });
      setMessage(\`Editing \${item.product_name}. Update the quantity and save.\`);
    } catch (editError) {
      setError(editError.message);
    }
  };`
);

// Replace Manual Entry button code inside render
content = content.replace(
  /<MDButton color="info" variant="gradient" onClick=\{openManualModal\}>\n\s*<Icon sx=\{\{ mr: 1 \}\}>add<\/Icon>\n\s*Manual Entry\n\s*<\/MDButton>/,
  ''
);

// Change the stockListImportFilter to company filter in the UI
content = content.replace(
  /value=\{stockListImportFilter\}\n\s*onChange=\{handleImportFilterChange\}/,
  'value={companyFilter}\n                        onChange={handleCompanyFilterChange}'
);
content = content.replace(
  /<MenuItem value="">Latest DMS Upload<\/MenuItem>\n\s*\{dmsImports\.map\(\(stock\) => \(\n\s*<MenuItem key=\{stock\.id\} value=\{String\(stock\.id\)\}>\n\s*\{formatDmsImportLabel\(stock\)\}\n\s*<\/MenuItem>\n\s*\)\)\}/,
  `<MenuItem value="">Select Company</MenuItem>
                        {companies.map((comp) => (
                          <MenuItem key={comp.id} value={String(comp.id)}>
                            {comp.name}
                          </MenuItem>
                        ))}`
);

// Update table to show items with green row
content = content.replace(
  /<TableRow key=\{item\.id\}>/g,
  '<TableRow key={item.id} sx={item.is_approved ? { backgroundColor: "#dcfce7" } : {}}>'
);

// Change table headers - we want DMS data and Physical data if available
content = content.replace(
  /<TableCell align="right" sx=\{tableBodySx\}>\{unitFormat\(item\.physical_stock_in_case\)\}<\/TableCell>\n\s*<TableCell align="right" sx=\{tableBodySx\}>\{unitFormat\(item\.physical_stock_in_pcs\)\}<\/TableCell>\n\s*<TableCell align="right" sx=\{calculatedCellSx\}>\{unitFormat\(item\.total_physical_stock_in_pcs\)\}<\/TableCell>/,
  `<TableCell align="right" sx={tableBodySx}>{unitFormat(item.physical_stock ? item.physical_stock.physical_stock_in_case : item.current_stock_in_case)}</TableCell>
                          <TableCell align="right" sx={tableBodySx}>{unitFormat(item.physical_stock ? item.physical_stock.physical_stock_in_pcs : item.current_stock_in_pcs)}</TableCell>
                          <TableCell align="right" sx={calculatedCellSx}>{unitFormat(item.physical_stock ? item.physical_stock.total_physical_stock_in_pcs : item.total_current_stock_in_pcs)}</TableCell>`
);

content = content.replace(
  /<TableCell align="right" sx=\{calculatedCellSx\}>\{money\(item\.total_value\)\}<\/TableCell>/,
  '<TableCell align="right" sx={calculatedCellSx}>{money(item.physical_stock ? item.physical_stock.total_value : item.total_value)}</TableCell>'
);

content = content.replace(
  /<IconButton\n\s*color="info"\n\s*size="small"\n\s*title="View stock history"\n\s*onClick=\{[^}]+\}\n\s*>\n\s*<Icon fontSize="small">visibility<\/Icon>\n\s*<\/IconButton>/,
  `<IconButton
                              color="info"
                              size="small"
                              title="Approve Stock"
                              onClick={() => {
                                setSelectedApproveItem(item);
                                setApproveModalOpen(true);
                              }}
                            >
                              <Icon fontSize="small">visibility</Icon>
                            </IconButton>`
);

// Add the approve handler and modal
const approveCode = `
  const handleApprove = async () => {
    if (!dmsImportId || !selectedApproveItem) return;
    setApproving(true);
    try {
      const response = await fetch(\`\${API}/staff/physical-stock/approve\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dmsImportId,
          productErpId: selectedApproveItem.product_erp_id,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to approve stock.");
      }
      setMessage(\`\${selectedApproveItem.product_name} approved successfully.\`);
      setApproveModalOpen(false);
      fetchPhysicalStock();
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  };
`;

content = content.replace(/return \(/, approveCode + '\n  return (');

const approveModalJSX = `
      <Dialog open={approveModalOpen} onClose={() => setApproveModalOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: "bold", color: "#344767" }}>Approve Current Stock</DialogTitle>
        <DialogContent dividers>
          {selectedApproveItem && (
            <MDBox>
              <MDTypography variant="h6">{selectedApproveItem.product_name}</MDTypography>
              <MDTypography variant="body2" color="text">ERP ID: {selectedApproveItem.product_erp_id}</MDTypography>
              <MDTypography variant="body2" color="text">DMS Total Pcs: {unitFormat(selectedApproveItem.total_current_stock_in_pcs)}</MDTypography>
              <MDBox mt={2} p={2} sx={{ backgroundColor: "#eff6ff", borderRadius: 1 }}>
                <MDTypography variant="body2" fontWeight="medium">
                  Clicking OK will save {unitFormat(selectedApproveItem.total_current_stock_in_pcs)} as the Physical Stock for this item.
                </MDTypography>
              </MDBox>
            </MDBox>
          )}
        </DialogContent>
        <DialogActions>
          <MDButton color="dark" variant="outlined" onClick={() => setApproveModalOpen(false)} disabled={approving}>Cancel</MDButton>
          <MDButton color="info" variant="gradient" onClick={handleApprove} disabled={approving}>
            {approving ? "Approving..." : "OK"}
          </MDButton>
        </DialogActions>
      </Dialog>
`;

content = content.replace(/<Footer \/>/, approveModalJSX + '\n      <Footer />');

// Remove the obsolete search filtering code that reset stockListImportFilter
content = content.replace(
  /setStockListImportFilter\(""\);/g,
  'setCompanyFilter("");'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Done replacing content.');
