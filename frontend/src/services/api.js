const API_URL = import.meta.env.VITE_API_URL || "/api";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
  } catch {
    throw new Error("Cannot reach the server. Run 'npm run dev:backend'.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getDashboardCounts: () => request("/transactions/counts"),
  getChartData: () => request("/transactions/chart"),
  getBorrowed: () => request("/transactions/borrowed"),
  getReturned: () => request("/transactions/returned"),
  recordBorrow: (data) => request("/transactions/borrow", { method: "POST", body: JSON.stringify(data) }),
  recordReturn: (data) => request("/transactions/return", { method: "POST", body: JSON.stringify(data) }),

  getCatalog: () => request("/catalog"),
  createCatalogItem: (data) => request("/catalog", { method: "POST", body: JSON.stringify(data) }),
  updateCatalogItem: (id, data) => request(`/catalog/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCatalogItem: (id) => request(`/catalog/${id}`, { method: "DELETE" }),

  searchUser: (firstName, lastName) => request(`/users/search?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`),

  getAdmins: () => request("/admin"),
  createAdmin: (data) => request("/admin", { method: "POST", body: JSON.stringify(data) }),
  updateAdmin: (id, data) => request(`/admin/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAdmin: (id) => request(`/admin/${id}`, { method: "DELETE" }),

  downloadReport: async (type) => {
    let res;
    try {
      res = await fetch(`${API_URL}/reports/${type}`);
    } catch {
      throw new Error("Cannot reach the server. Run 'npm run dev:backend'.");
    }
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}_report.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  },

  uploadImage: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    let res;
    try {
      res = await fetch(`${API_URL}/upload/image`, { method: "POST", body: formData });
    } catch {
      throw new Error("Cannot reach the server. Run 'npm run dev:backend'.");
    }
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  generateQR: (text) => request("/upload/qr", { method: "POST", body: JSON.stringify({ text }) }),
};
