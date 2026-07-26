const fs = require('fs');
const path = 'd:/EdunextG-Sales/frontend/src/layouts/physical-stock/index.js';
let content = fs.readFileSync(path, 'utf8');

const approveRegex = /const handleApprove = async \(\) => \{[\s\S]*?fetchPhysicalStock\(\);\n    \} catch \(err\) \{[\s\S]*?\}\n  \};\n/;

const match = content.match(approveRegex);
if (match) {
  content = content.replace(approveRegex, '');
  
  const target = 'function PhysicalStock() {\n';
  content = content.replace(target, target + match[0]);
  
  fs.writeFileSync(path, content, 'utf8');
  console.log('Fixed handleApprove position.');
} else {
  console.log('Could not find handleApprove.');
}
