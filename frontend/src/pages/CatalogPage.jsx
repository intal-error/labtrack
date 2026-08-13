import { useState, useEffect } from "react";
import { api } from "../services/api";
import { numOr, getAvailableQuantity } from "../utils/helpers";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import EmptyState from "../components/ui/EmptyState";
import Modal from "../components/ui/Modal";
import toast from "react-hot-toast";
import "../styles/pages/catalog.css";

export default function CatalogPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("name");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showQr, setShowQr] = useState(null);
  const [showUpdate, setShowUpdate] = useState(null);
  const [imageOverlay, setImageOverlay] = useState(null);
  const [form, setForm] = useState({ itemName: "", category: "", quantity: "", condition: "", status: "Available", imageUrl: "", barcode: "" });
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const data = await api.getCatalog();
      let filtered = filter === "All" ? data : data.filter((i) => i.status === filter);
      if (sort === "name") filtered.sort((a, b) => (a.itemName || "").localeCompare(b.itemName || ""));
      else if (sort === "number") filtered.sort((a, b) => (parseFloat(a.itemName) || 0) - (parseFloat(b.itemName) || 0));
      else if (sort === "date") filtered.sort((a, b) => new Date(b.createdAt?.seconds * 1000 || 0) - new Date(a.createdAt?.seconds * 1000 || 0));
      setItems(filtered);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filter, sort]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
      toast.success("Image uploaded!");
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.itemName || !form.imageUrl) { toast.error("Item name and image required"); return; }
    try {
      await api.createCatalogItem({ ...form, quantity: Number(form.quantity) || 0 });
      toast.success("Item created!");
      setShowCreate(false);
      setForm({ itemName: "", category: "", quantity: "", condition: "", status: "Available", imageUrl: "", barcode: "" });
      load();
    } catch (err) { toast.error(err.message); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.updateCatalogItem(showUpdate.id, { ...showUpdate, quantity: Number(showUpdate.quantity) || 0 });
      toast.success("Item updated!");
      setShowUpdate(null);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this item?")) return;
    try { await api.deleteCatalogItem(id); toast.success("Deleted!"); load(); }
    catch (err) { toast.error(err.message); }
  };

  const showQrModal = async (id, name) => {
    try {
      const { dataUrl } = await api.generateQR(`SLSU-TOOL:${id}`);
      setShowQr({ name, value: `SLSU-TOOL:${id}`, dataUrl });
    } catch { toast.error("Failed to generate QR"); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <section className="catalog-page">
      <h1>CATALOG</h1>

      <div className="catalog-filter">
        {["All", "Available", "Borrowed"].map((f) => (
          <label key={f}><input type="radio" name="statusFilter" checked={filter === f} onChange={() => setFilter(f)} /> {f}</label>
        ))}
        <div className="sort-group">
          <label>Sort:</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Name (A-Z)</option>
            <option value="date">Date Created (Newest)</option>
            <option value="number">1-200 (Numeric)</option>
          </select>
        </div>
      </div>

      <div className="catalog-table-container">
        <table>
          <thead>
            <tr><th>Image</th><th>Item Name</th><th>Category</th><th>Quantity</th><th>Condition</th><th>Status</th><th>Action</th></tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const avail = getAvailableQuantity(item);
              const total = Math.max(0, numOr(item.quantity));
              return (
                <tr key={item.id}>
                  <td>
                    {item.imageUrl
                      ? <img className="catalog-img" src={item.imageUrl} alt={item.itemName} onClick={() => setImageOverlay(item.imageUrl)} />
                      : <div className="catalog-img no-img-cell">No image</div>
                    }
                  </td>
                  <td>{item.itemName || "-"}</td>
                  <td>{item.category || "-"}</td>
                  <td>{Number.isFinite(Number(item.availableQuantity)) ? `${avail} / ${total}` : total}</td>
                  <td>{item.condition || "-"}</td>
                  <td>{item.status || "Available"}</td>
                  <td className="action-cell">
                    <button className="btn btn-green" onClick={() => showQrModal(item.id, item.itemName)}>QR Code</button>
                    <button className="btn btn-yellow" onClick={() => setShowUpdate({ ...item })}>Update</button>
                    <button className="btn btn-red" onClick={() => handleDelete(item.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={7} style={{textAlign:"center",color:"#888"}}>No items found</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="catalog-actions-bar">
        <button className="btn btn-green" onClick={() => setShowCreate(true)}>Create Item</button>
        <button className="btn btn-red" onClick={async () => { try { await api.downloadReport("catalog"); toast.success("Downloaded!"); } catch { toast.error("Failed"); } }}>Download Report</button>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Create Item</h2>
            <form onSubmit={handleCreate}>
              <input type="text" placeholder="Item Name" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} required />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                <option value="" disabled>Select Category</option>
                <option value="Tools">Tools</option>
                <option value="Equipment">Equipment</option>
              </select>
              <input type="number" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
              <input type="text" placeholder="Barcode (optional)" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} required>
                <option value="" disabled>Select Condition</option>
                {["Excellent", "Good", "Fair", "Damaged", "For Repair", "Missing"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="Available">Available</option>
                <option value="Borrowed">Borrowed</option>
              </select>
              <div className="image-upload-row">
                <input type="url" placeholder="Image URL" value={form.imageUrl} readOnly required />
                <label className="text-btn">
                  {uploading ? "Uploading..." : "Upload"}
                  <input type="file" accept="image/*" onChange={handleUpload} hidden />
                </label>
              </div>
              <div className="catalog-actions">
                <button type="submit" className="btn btn-green">Create</button>
                <button type="button" className="btn btn-orange" onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQr && (
        <div className="modal-overlay" onClick={() => setShowQr(null)}>
          <div className="modal-content qr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{showQr.name || "Item QR Code"}</h2>
            <p>Print this code and attach it to the item.</p>
            <div className="qr-canvas"><img src={showQr.dataUrl} alt="QR Code" /></div>
            <p className="qr-value">{showQr.value}</p>
            <div className="catalog-actions">
              <button className="btn btn-green" onClick={() => window.print()}>Print</button>
              <button className="btn btn-orange" onClick={() => setShowQr(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showUpdate && (
        <div className="modal-overlay" onClick={() => setShowUpdate(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Update Item</h2>
            <form onSubmit={handleUpdate}>
              <input type="text" placeholder="Item Name" value={showUpdate.itemName || ""} onChange={(e) => setShowUpdate({ ...showUpdate, itemName: e.target.value })} required />
              <select value={showUpdate.category || ""} onChange={(e) => setShowUpdate({ ...showUpdate, category: e.target.value })} required>
                <option value="" disabled>Select Category</option>
                <option value="Tools">Tools</option>
                <option value="Equipment">Equipment</option>
              </select>
              <input type="number" placeholder="Quantity" value={showUpdate.quantity || ""} onChange={(e) => setShowUpdate({ ...showUpdate, quantity: e.target.value })} required />
              <select value={showUpdate.condition || ""} onChange={(e) => setShowUpdate({ ...showUpdate, condition: e.target.value })} required>
                <option value="" disabled>Select Condition</option>
                {["Excellent", "Good", "Fair", "Damaged", "For Repair", "Missing"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={showUpdate.status || "Available"} onChange={(e) => setShowUpdate({ ...showUpdate, status: e.target.value })}>
                <option value="Available">Available</option>
                <option value="Borrowed">Borrowed</option>
              </select>
              <input type="url" placeholder="Image URL" value={showUpdate.imageUrl || ""} readOnly required />
              <div className="catalog-actions">
                <button type="submit" className="btn btn-green">Update</button>
                <button type="button" className="btn btn-orange" onClick={() => setShowUpdate(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {imageOverlay && (
        <div className="image-overlay" onClick={() => setImageOverlay(null)}>
          <div className="image-overlay-content">
            <img src={imageOverlay} alt="Large View" />
            <button className="btn-close" onClick={() => setImageOverlay(null)}>&times;</button>
          </div>
        </div>
      )}
    </section>
  );
}
