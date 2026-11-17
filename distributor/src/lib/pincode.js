import { api } from "@/lib/api";

// Pin code -> district / state for the Outlets form, through our backend's lookup
// (/api/distributor/pincode/:pin, the same one the main site uses). State names match the
// list below (same list as the DMS app, dms/src/utils/pincode.js).

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

/** Returns { district, state, city } for a 6-digit pin code, or null when it isn't found. */
export async function lookupPincode(pin) {
  const clean = String(pin || "").replace(/\D/g, "");
  if (!/^[1-9]\d{5}$/.test(clean)) return null;
  try {
    const data = await api(`/pincode/${clean}`);
    return data && (data.state || data.district) ? data : null;
  } catch {
    return null;
  }
}
