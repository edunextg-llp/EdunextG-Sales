// Credit invoice photo (view / upload): Tailwind CSS (no MUI). Load and upload logic unchanged.
import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { prepareUpload } from "utils/compressImage";
import { Icon, Notice, btn } from "components/tw";

export function CreditPhotoLink({ url }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="View credit invoice" aria-label="View credit invoice" className={`${btn.icon} text-blue-600 hover:bg-blue-50`}>
      <Icon name="visibility" className="text-[19px]" />
    </a>
  );
}
CreditPhotoLink.propTypes = { url: PropTypes.string };
CreditPhotoLink.defaultProps = { url: null };

export default function CreditPhoto({ api, saleId, disabled, onBusyChange, onPhotoReady, onUploaded, requiredForPayment = true }) {
  const [url, setUrl] = useState(null);
  const [uploader, setUploader] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `${api}/staff/sales/${saleId}/credit-photo`;
  useEffect(() => {
    let active = true;
    fetch(endpoint).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load credit photo.");
      if (active) { setUrl(data.url); setUploader(data.url ? data : null); onPhotoReady?.(data.url ? saleId : null); }
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; onPhotoReady?.(null); };
  }, [endpoint, saleId, onPhotoReady]);

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      // Max 1 MB; photos above 70 KB are shrunk to about 70 KB first.
      const photo = await prepareUpload(file);
      const body = new FormData();
      body.append("file", photo);
      const response = await fetch(endpoint, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Photo upload failed.");
      setUrl(data.url);
      setUploader(data);
      onUploaded?.(data.url);
      onPhotoReady?.(data.url ? saleId : null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return (
    <div className="my-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mb-2 block">
          <img src={url} alt="Credit invoice" className="block h-36 max-w-full rounded-lg border border-slate-200 bg-white object-contain" />
        </a>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${btn.outline} cursor-pointer ${disabled || busy ? "pointer-events-none opacity-50" : ""}`}>
          <Icon name="photo_camera" className="text-[18px]" />
          {busy ? "Uploading…" : url ? "Replace credit photo" : "Upload credit photo"}
          <input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={upload} />
        </label>
        <span className="text-[12px] text-slate-500">JPG, PNG, or WebP · max 1 MB</span>
      </div>
      {!url && requiredForPayment && <Notice tone="info" className="mt-2">Credit photo is required before submitting Credit.</Notice>}
      {url && !busy && (
        <Notice tone="success" className="mt-2">
          Photo saved to this invoice
          {uploader?.uploadedBy ? ` · by ${uploader.uploadedBy}${uploader.uploadedByRole ? ` (${uploader.uploadedByRole})` : ""}` : ""}
          {uploader?.uploadedAt ? ` · ${uploader.uploadedAt.slice(8, 10)}-${uploader.uploadedAt.slice(5, 7)}-${uploader.uploadedAt.slice(0, 4)} ${uploader.uploadedAt.slice(11, 16)}` : ""}
        </Notice>
      )}
      {error && <Notice tone="error" className="mt-2">{error}</Notice>}
    </div>
  );
}
CreditPhoto.propTypes = { api: PropTypes.string.isRequired, saleId: PropTypes.number.isRequired, disabled: PropTypes.bool, onBusyChange: PropTypes.func, onPhotoReady: PropTypes.func, onUploaded: PropTypes.func, requiredForPayment: PropTypes.bool };
