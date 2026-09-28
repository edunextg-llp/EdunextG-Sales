const API = "https://bawarchee.edunextg.co/api";

export async function uploadStaffDocument(file, documentType) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("documentType", documentType);

  const response = await fetch(`${API}/staff/upload-document`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to upload document.");
  }

  return data;
}

export function isImageDocument(url = "") {
  return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) || /\/image\/upload\//i.test(url);
}

export function formatDateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
