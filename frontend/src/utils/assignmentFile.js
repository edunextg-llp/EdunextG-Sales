// Document-assignment files live on Cloudinary. The API only hands out the
// Cloudinary links (`.../:id/link`); the browser then views or downloads the
// file straight from Cloudinary.
const API = process.env.REACT_APP_API_URL;

const linkEndpoint = (scope, id) => (scope === "admin"
  ? `${API}/staff/document-assignments/${id}/link`
  : `${API}/my-document-assignments/${id}/link`);

async function getLinks(scope, id) {
  const res = await fetch(linkEndpoint(scope, id), { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.viewUrl) throw new Error(data.error || "Unable to open the document.");
  return data;
}

// Opens the file from Cloudinary in a new tab (the browser's PDF viewer has Print).
export async function viewAssignmentFile(scope, id) {
  const tab = window.open("", "_blank"); // open inside the click so popup blockers allow it
  try {
    const { viewUrl } = await getLinks(scope, id);
    if (tab) tab.location.href = viewUrl;
    else window.open(viewUrl, "_blank");
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export const printAssignmentFile = viewAssignmentFile;

// Downloads the file from Cloudinary (signed link that saves instead of opening).
export async function downloadAssignmentFile(scope, id) {
  const { downloadUrl } = await getLinks(scope, id);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
