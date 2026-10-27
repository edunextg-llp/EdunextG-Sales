import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { prepareUpload } from "utils/compressImage";
import { Alert, Box, Button, Icon, IconButton, Tooltip } from "@mui/material";

export function CreditPhotoLink({ url }) {
  if (!url) return null;
  return <Tooltip title="View credit invoice"><IconButton aria-label="View credit invoice" component="a" href={url} target="_blank" rel="noopener noreferrer" size="small" color="info"><Icon>visibility</Icon></IconButton></Tooltip>;
}
CreditPhotoLink.propTypes = { url: PropTypes.string };

export default function CreditPhoto({ api, saleId, disabled, onBusyChange, onPhotoReady, onUploaded, requiredForPayment = true }) {
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `${api}/staff/sales/${saleId}/credit-photo`;
  useEffect(() => {
    let active = true;
    fetch(endpoint).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load credit photo.");
      if (active) { setUrl(data.url); onPhotoReady?.(data.url ? saleId : null); }
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
      onUploaded?.(data.url);
      onPhotoReady?.(data.url ? saleId : null);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <Box sx={{ my: 2 }}>
    {url && <a href={url} target="_blank" rel="noopener noreferrer"><Box component="img" src={url} alt="Credit invoice photo" sx={{ display: "block", maxWidth: "100%", height: 140, objectFit: "contain", mb: 1 }} /></a>}
    <Box sx={{ mb: 1, fontSize: "0.8rem" }}>JPG, PNG, or WebP · max 1 MB</Box>
    <Button component="label" variant="outlined" disabled={disabled || busy}>
      {busy ? "Uploading…" : url ? "Replace credit photo" : "Upload credit photo"}
      <input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || busy} onChange={upload} />
    </Button>
    {!url && requiredForPayment && <Alert severity="info" sx={{ mt: 1 }}>Credit photo is required before submitting Credit.</Alert>}
    {url && !busy && <Alert severity="success" sx={{ mt: 1 }}>Photo saved to this invoice.</Alert>}
    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
  </Box>;
}
CreditPhoto.propTypes = { api: PropTypes.string.isRequired, saleId: PropTypes.number.isRequired, disabled: PropTypes.bool, onBusyChange: PropTypes.func, onPhotoReady: PropTypes.func, onUploaded: PropTypes.func, requiredForPayment: PropTypes.bool };
