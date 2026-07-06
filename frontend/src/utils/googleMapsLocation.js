const GOOGLE_MAPS_SHORT_URL_PATTERN = /^https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9_-]+$/;

export function formatGoogleMapsLocation(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  if (GOOGLE_MAPS_SHORT_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const mapsAppMatch = trimmed.match(/^(?:https?:\/\/)?maps\.app\.goo\.gl\/([A-Za-z0-9_-]+)\/?$/i);
  if (mapsAppMatch) {
    return `https://maps.app.goo.gl/${mapsAppMatch[1]}`;
  }

  const gooGlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?goo\.gl\/maps\/([A-Za-z0-9_-]+)\/?$/i);
  if (gooGlMatch) {
    return `https://maps.app.goo.gl/${gooGlMatch[1]}`;
  }

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return `https://maps.app.goo.gl/${trimmed}`;
  }

  return trimmed;
}

export function isValidGoogleMapsShortUrl(value) {
  const formatted = formatGoogleMapsLocation(value);
  return GOOGLE_MAPS_SHORT_URL_PATTERN.test(formatted);
}
