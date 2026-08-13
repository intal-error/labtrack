import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { toDate, formatDate } from "../utils/helpers";
import TransactionTable from "../components/ui/TransactionTable";
import toast from "react-hot-toast";
import "../styles/pages/tables.css";

const columns = ["School ID", "First Name", "Last Name", "Item Name", "Quantity", "Date & Time Returned", "Status"];

export default function ReturnedPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api.getReturned());
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const downloadReport = async () => {
    try { await api.downloadReport("returned"); toast.success("Report downloaded!"); }
    catch (err) { toast.error(err.message || "Download failed"); }
  };

  return (
    <section className="tables-page">
      <h1>Returned Tools</h1>
      <button className="btn btn-report" onClick={downloadReport}>Download Report</button>
      <TransactionTable
        columns={columns}
        items={items}
        loading={loading}
        error={error}
        onRetry={load}
        renderRow={(item) => (
          <tr key={item.id}>
            <td>{item.schoolID || "-"}</td>
            <td>{item.firstName || "-"}</td>
            <td>{item.lastName || "-"}</td>
            <td>{item.itemName || "-"}</td>
            <td>{item.quantity || 0}</td>
            <td>{formatDate(toDate(item.timestamp))}</td>
            <td>{item.status || "returned"}</td>
          </tr>
        )}
      />
    </section>
  );
}
