const fs = require('fs');
const path = 'd:/EdunextG-Sales/frontend/src/layouts/physical-stock/index.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/stockListImportFilter/g, 'companyFilter');
content = content.replace(/setStockListImportFilter/g, 'setCompanyFilter');
content = content.replace(/dmsImports/g, 'companies');
content = content.replace(/setDmsImports/g, 'setCompanies');

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed undefined variables.');
