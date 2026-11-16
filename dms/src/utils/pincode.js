import { apiFetch } from "../auth";

// Same lookup as the main site (frontend/src/utils/pincodeLookup.js):
// try our backend first, then the public India Post API.

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Ladakh", "Lakshadweep", "Puducherry",
];

const STATE_ALIASES = {
  "andaman & nicobar islands": "Andaman and Nicobar Islands",
  "andaman and nicobar": "Andaman and Nicobar Islands",
  "jammu & kashmir": "Jammu and Kashmir",
  "dadra & nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman & diu": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "the dadra and nagar haveli and daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  pondicherry: "Puducherry",
  orissa: "Odisha",
  chattisgarh: "Chhattisgarh",
  uttaranchal: "Uttarakhand",
  "new delhi": "Delhi",
  "nct of delhi": "Delhi",
};

/** Maps a looked-up state name onto an entry of INDIAN_STATES ("" if none matches). */
export function matchState(state) {
  const key = String(state || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return "";
  const aliased = (STATE_ALIASES[key] || key).toLowerCase();
  return (
    INDIAN_STATES.find((s) => s.toLowerCase() === aliased || s.toLowerCase().replace(/ and /g, " & ") === key) || ""
  );
}

const viaBackend = async (pin) => {
  const res = await apiFetch(`/staff/purchase-sellers/pincode/${pin}`);
  if (res.status === 404 || res.status === 400) return { notFound: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const viaPostalApi = async (pin) => {
  const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const result = Array.isArray(data) ? data[0] : null;
  const po = result?.Status === "Success" ? result.PostOffice?.[0] : null;
  if (!po) return { notFound: true };
  return {
    district: po.District || "",
    state: po.State || "",
    city: po.Block && po.Block !== "NA" ? po.Block : po.District || "",
  };
};

/** Returns { city, district, state } for a 6-digit pin code, or null. */
export async function lookupPincode(pincode) {
  const clean = String(pincode || "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  for (const source of [viaBackend, viaPostalApi]) {
    try {
      const result = await source(clean);
      if (result?.notFound) return null;
      if (result && (result.state || result.district)) return result;
    } catch {
      // try the next source
    }
  }
  return null;
}
