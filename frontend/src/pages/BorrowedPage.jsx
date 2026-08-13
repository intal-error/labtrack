import { useState, useEffect } from "react";
import { api } from "../services/api";
import { toDate, formatDate, getRemainingQuantity } from "../utils/helpers";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import EmptyState from "../components/ui/EmptyState";
import toast from "react-hot-toast";
import "../styles/pages/tables.css";

export default function BorrowedPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getBorrowed().then(setItems).catch(console.error).finally(() => setLoading(false));
  }, []);

  const downloadReport = async () => {
    try { await api.downloadReport("borrowed"); toast.success("Report downloaded!"); }
    catch { toast.error("Download failed"); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <section className="tables-page">
      <h1>Borrowed Tools</h1>
      <button className="btn btn-report" onClick={downloadReport}>Download Report</button>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr><th>School ID</th><th>First Name</th><th>Last Name</th><th>Item Name</th><th>Quantity</th><th>Date & Time Borrowed</th></tr>
          </thead>
          <tbody>
            {items.length === 0 ? <EmptyState colSpan={6} message="No borrowed items" /> :
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.schoolID || "-"}</td>
                  <td>{item.firstName || "-"}</td>
                  <td>{item.lastName || "-"}</td>
                  <td>{item.itemName || "-"}</td>
                  <td>{getRemainingQuantity(item)}</td>
                  <td>{formatDate(toDate(item.timestamp))}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </section>
  );
}
