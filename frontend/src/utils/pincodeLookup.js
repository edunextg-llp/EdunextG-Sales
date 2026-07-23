export async function lookupPincode(pincode) {
  const clean = String(pincode || "").trim();
  if (!/^\d{6}$/.test(clean)) return null;

  try {
    const response = await fetch(`https://api.postalpincode.in/pincode/${clean}`);
    if (!response.ok) return null;

    const data = await response.json();
    const result = Array.isArray(data) ? data[0] : null;
    if (!result || result.Status !== "Success") return null;

    const postOffice = result.PostOffice?.[0];
    if (!postOffice) return null;

    return {
      district: postOffice.District || "",
      state: postOffice.State || "",
      city: postOffice.Block || postOffice.District || postOffice.Name || "",
      area: postOffice.Name || "",
    };
  } catch {
    return null;
  }
}
