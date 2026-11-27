import { useEffect, useRef, useState } from "react";
import JoditEditor from "jodit-react";
import "jodit/es2021/jodit.min.css";
import { apiFetch } from "../../auth";
import { readJson } from "../ui";
import { DEFAULT_DECLARATION, invoiceRichText } from "../../utils/dmsInvoice";

const editorConfig = {
  height: 140,
  minHeight: 110,
  toolbarAdaptive: false,
  buttons: ["bold", "italic", "underline", "|", "ul", "ol", "|", "undo", "redo"],
  showCharsCounter: false,
  showWordsCounter: false,
  showXPathInStatusbar: false,
  askBeforePasteHTML: false,
  askBeforePasteFromWord: false,
  defaultActionOnPaste: "insert_only_text",
};

function CompanyInvoiceFields({ company, distributors, onClose }) {
  const [initial] = useState(() => ({
    deliveryTerms: invoiceRichText(company.delivery_terms_html),
    declaration: invoiceRichText(company.declaration_html ?? DEFAULT_DECLARATION),
  }));
  const fields = useRef({ ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const readFields = () => ({
    deliveryTerms: invoiceRichText(fields.current.deliveryTerms),
    declaration: invoiceRichText(fields.current.declaration),
  });

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await apiFetch(`/staff/companies/${company.id}/invoice-print-details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(readFields()),
      });
      const body = await readJson(response);
      if (!response.ok) throw new Error(body.error || "Could not save the invoice text.");
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
        <p className="mt-1 text-sm text-base-content/65">{company.name} · Used on invoices for every distributor in this company.</p>
        <details className="mt-3 rounded-lg border border-base-300 p-3" open>
          <summary className="cursor-pointer text-sm font-semibold">Distributors ({distributors.length})</summary>
          {distributors.length > 0 ? (
            <ul className="mt-2 max-h-28 overflow-y-auto text-sm">
              {distributors.map((distributor) => (
                <li key={distributor.id} className="py-1">
                  {distributor.distributor_name}
                  {distributor.login_id && <span className="ml-2 text-base-content/60">{distributor.login_id}</span>}
                  {!Number(distributor.is_active) && <span className="ml-2 text-base-content/60">Inactive</span>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-base-content/60">This company has no distributors yet.</p>}
        </details>
        <fieldset disabled={saving} className="mt-4 grid gap-4">
          {[["deliveryTerms", "Terms of Delivery"], ["declaration", "Declaration"]].map(([key, label]) => (
            <section key={key} aria-label={label}>
              <h3 className="mb-1.5 text-sm font-semibold">{label}</h3>
              <JoditEditor value={initial[key]} config={editorConfig} onChange={(value) => {
                fields.current[key] = value;
                setSaved(false);
              }} />
            </section>
          ))}
        </fieldset>
        {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
        {saved && <p role="status" className="mt-2 text-sm text-success">Invoice print details saved.</p>}
        <div className="modal-action flex-wrap">
          <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save company settings"}</button>
        </div>
    </>
  );
}

export default function CnfInvoicePrintDialog({ companyId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const request = new AbortController();
    apiFetch(`/staff/companies/${companyId}/invoice-print-details`, { signal: request.signal })
      .then(async (response) => {
        const body = await readJson(response);
        if (!response.ok) throw new Error(body.error || "Could not load company invoice settings.");
        if (!request.signal.aborted) setData(body);
      })
      .catch((err) => { if (!request.signal.aborted) setError(err.message); });
    return () => request.abort();
  }, [companyId]);

  return (
    <div className="modal modal-open z-[1300]" role="dialog" aria-modal="true" aria-labelledby="cnf-print-title">
      <div className="modal-box max-w-3xl">
        <h2 id="cnf-print-title" className="text-lg font-bold">Company invoice settings</h2>
        {data ? <CompanyInvoiceFields {...data} onClose={onClose} /> : (
          <>
            <p className={error ? "text-error" : "text-base-content/65"} role={error ? "alert" : "status"}>
              {error || "Loading company settings…"}
            </p>
            <div className="modal-action"><button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></div>
          </>
        )}
      </div>
    </div>
  );
}
