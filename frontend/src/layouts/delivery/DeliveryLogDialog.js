// Delivery Log (pending bills by company and area): Tailwind CSS (no MUI). Report building and Excel unchanged.
import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { buildDeliveryLog, deliveryLogColors, downloadDeliveryLog } from "utils/deliveryLog";
import { Icon, Modal, Notice, btn } from "components/tw";

export default function DeliveryLogDialog({ open, onClose, sales }) {
  const report = useMemo(() => buildDeliveryLog(sales), [sales]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    setDownloading(true);
    setError("");
    try { await downloadDeliveryLog(report); }
    catch (_error) { setError("Unable to download Excel. Please try again."); }
    finally { setDownloading(false); }
  };
  return (
    <Modal
      open={open} onClose={onClose} size="xl" title="Delivery Log — Pending Deliveries"
      actions={(
        <>
          <button type="button" className={btn.ghost} onClick={onClose}>Close</button>
          <button type="button" className={btn.primary} onClick={download} disabled={downloading || !report.companyCount}>
            <Icon name="download" className="text-[18px]" />{downloading ? "Downloading..." : "Download Excel"}
          </button>
        </>
      )}
    >
      <p className="m-0 mb-3 text-[12.5px] text-slate-500">All companies • Packed and returned bills awaiting delivery • <b className="text-slate-800">{report.total}</b> pending bills</p>
      {error && <Notice tone="error" className="mb-3">{error}</Notice>}
      {!report.companyCount ? (
        <p className="m-0 py-8 text-center text-[13px] text-slate-400">No delivery data available.</p>
      ) : (
        <div className="max-h-[62vh] overflow-auto rounded-xl border border-slate-200">
          <table aria-label="Pending delivery bills by company and area" className="table-fixed border-collapse" style={{ width: 160 + (report.width - 1) * 95 }}>
            <colgroup>
              <col style={{ width: 160 }} />
              {Array.from({ length: report.width - 1 }, (_, index) => <col key={index} style={{ width: 95 }} />)}
            </colgroup>
            <tbody>
              {report.rows.map(({ type, cells }, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={index}>
                  {(type === "section" || type === "spacer" ? [cells[0] || ""] : cells).map((value, column) => (
                    <td
                      // eslint-disable-next-line react/no-array-index-key
                      key={column}
                      colSpan={type === "section" ? 2 : type === "spacer" ? report.width : 1}
                      className={`px-1.5 text-[12px] leading-tight text-slate-800 [overflow-wrap:anywhere] ${type === "spacer" ? "border-0 py-0.5" : "border border-slate-300 py-1"} ${["section", "header", "total"].includes(type) ? "font-bold" : ""} ${column === 0 ? "text-left" : "text-center"} ${column === 0 && !["section", "spacer"].includes(type) ? "sticky left-0 z-[1] w-40" : ""}`}
                      style={{ backgroundColor: `#${deliveryLogColors[type]}` }}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

DeliveryLogDialog.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, sales: PropTypes.arrayOf(PropTypes.object).isRequired };
