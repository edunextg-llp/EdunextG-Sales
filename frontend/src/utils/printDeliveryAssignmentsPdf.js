import ejs from "ejs/ejs.min.js";

export function printDeliveryAssignmentsPdf(drafts) {
  const groups = new Map();
  drafts.forEach((draft) => {
    draft.rows.forEach((row) => {
      const area = String(row.location_name || "Area not assigned").trim();
      const key = JSON.stringify([draft.date, draft.boy, area]);
      const group = groups.get(key) || {
        date: draft.date, name: draft.name, area, count: 0,
      };
      group.count += 1;
      groups.set(key, group);
    });
  });
  const rows = [...groups.values()].sort((a, b) =>
    a.date.localeCompare(b.date) || a.name.localeCompare(b.name) || a.area.localeCompare(b.area)
  );
  if (!rows.length) return;
  const html = ejs.render(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Delivery Assignments</title>
    <style>
      @page { size: A4; margin: 15mm; }
      body { font-family: Arial, sans-serif; color: #172033; font-size: 12px; }
      h1 { font-size: 22px; margin-bottom: 6px; }
      p { color: #475569; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #94a3b8; padding: 9px; text-align: left; overflow-wrap: anywhere; }
      th { background: #dbeafe; }
      th:first-child { width: 20%; }
      th:last-child { width: 16%; }
      .count { text-align: right; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      .total { font-weight: bold; background: #fef3c7; }
      button { padding: 10px 16px; margin-bottom: 16px; cursor: pointer; }
      @media print { button, .hint { display: none; } }
    </style></head><body>
      <button onclick="window.print()">Print / Save as PDF</button>
      <p class="hint">Choose Save as PDF in the print dialog to download this report.</p>
      <h1>Delivery Assignments</h1><p>Draft assignment summary · Total bill counts</p>
      <table><thead><tr><th>Date</th><th>Staff Name</th><th>Assigned Area</th><th class="count">Total Bills</th></tr></thead>
      <tbody><% rows.forEach(function(row) { %>
        <tr><td><%= row.date %></td><td><%= row.name %></td><td><%= row.area %></td><td class="count"><%= row.count %></td></tr>
      <% }); %>
        <tr class="total"><td colspan="3">Grand Total</td><td class="count"><%= total %></td></tr>
      </tbody></table>
    </body></html>`, { rows, total: rows.reduce((sum, row) => sum + row.count, 0) });
  const printWindow = window.open("", "_blank", "width=900,height=900");
  if (!printWindow) throw new Error("Please allow popups to download the assignments PDF.");
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { if (!printWindow.closed) printWindow.print(); }, 250);
}
