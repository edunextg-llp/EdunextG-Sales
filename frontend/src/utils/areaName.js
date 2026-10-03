export const reportAreaName = (value) =>
  String(value || "").trim().replace(/\s+/g, " ").toUpperCase() || "Area not assigned";
