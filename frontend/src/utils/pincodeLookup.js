const API = process.env.REACT_APP_API_URL;

// Names the pin code services use that differ from our state dropdown.
const STATE_ALIASES = {
  "andaman & nicobar islands": "Andaman and Nicobar Islands",
  "andaman and nicobar": "Andaman and Nicobar Islands",
  "jammu & kashmir": "Jammu and Kashmir",
  "dadra & nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman & diu": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "the dadra and nagar haveli and daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "pondicherry": "Puducherry",
  "orissa": "Odisha",
  "chattisgarh": "Chhattisgarh",
  "uttaranchal": "Uttarakhand",
  "new delhi": "Delhi",
  "nct of delhi": "Delhi",
};

/** Maps a state name from the lookup onto the matching entry in `stateOptions`. */
export function normaliseStateName(state, stateOptions = []) {
  const raw = String(state || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const aliased = STATE_ALIASES[key] || raw;
  const match = stateOptions.find(
    (option) => option.toLowerCase() === aliased.toLowerCase()
      || option.toLowerCase().replace(/ and /g, " & ") === key
  );
  return match || aliased;
}

const viaBackend = async (pin) => {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API}/staff/purchase-sellers/pincode/${pin}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 404 || response.status === 400) return { notFound: true };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const viaPostalApi = async (pin) => {
  const response = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const result = Array.isArray(data) ? data[0] : null;
  const postOffice = result?.Status === "Success" ? result.PostOffice?.[0] : null;
  if (!postOffice) return { notFound: true };
  return {
    district: postOffice.District || "",
    state: postOffice.State || "",
    city: postOffice.Block && postOffice.Block !== "NA" ? postOffice.Block : postOffice.District || "",
    area: postOffice.Name || "",
  };
};

/**
 * Looks up district/state for a 6-digit Indian pin code.
 * Returns the result object, or null when the pin code isn't found or every source failed.
 */
export async function lookupPincode(pincode) {
  const clean = String(pincode || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(clean)) return null;

  for (const source of [viaBackend, viaPostalApi]) {
    try {
      const result = await source(clean);
      if (result?.notFound) return null;
      if (result && (result.state || result.district)) return result;
    } catch (err) {
      // Try the next source.
    }
  }
  return null;
}
