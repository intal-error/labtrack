import { useState, useEffect } from "react";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdAssessment, MdDownload, MdPeople, MdInventory, MdWarning, MdBuild } from "react-icons/md";

export default function ReportsTab() {
  const [counts, setCounts] = useState({ borrowed: 0, returned: 0, users: 0, students: 0, faculty: 0 });
  const [catalog, setCatalog] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [c, cat, inc, maint] = await Promise.all([
        api.getDashboardCounts(),
        api.getCatalog(),
        api.getIncidents(),
        api.getMaintenance(),
      ]);
      setCounts(c);
      setCatalog(cat);
      setIncidents(inc);
      setMaintenance(maint);
    } catch {
      toast.error("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }

  async function downloadReport(type) {
    try {
      await api.downloadReport(type);
      toast.success("Report downloaded");
    } catch {
      toast.error("Download failed");
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  const conditionCounts = catalog.reduce((acc, item) => {
    const cond = item.condition || "Unknown";
    acc[cond] = (acc[cond] || 0) + 1;
    return acc;
  }, {});

  const incidentByStatus = incidents.reduce((acc, inc) => {
    acc[inc.status] = (acc[inc.status] || 0) + 1;
    return acc;
  }, {});

  const maintenanceByStatus = maintenance.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2><MdAssessment size={22} /> Reports Dashboard</h2>
        <div className="reports-downloads">
          <button className="btn btn-outline btn-sm" onClick={() => downloadReport("borrowed")}>
            <MdDownload size={14} /> Borrowed Excel
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => downloadReport("returned")}>
            <MdDownload size={14} /> Returned Excel
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => downloadReport("catalog")}>
            <MdDownload size={14} /> Catalog Excel
          </button>
        </div>
      </div>

      <div className="reports-summary-grid">
        <div className="report-summary-card">
          <MdPeople size={28} style={{ color: "#1976d2" }} />
          <div className="report-summary-value">{counts.users}</div>
          <div className="report-summary-label">Total Users</div>
          <div className="report-summary-detail">{counts.students} students, {counts.faculty} faculty</div>
        </div>
        <div className="report-summary-card">
          <MdInventory size={28} style={{ color: "#2e7d32" }} />
          <div className="report-summary-value">{catalog.length}</div>
          <div className="report-summary-label">Catalog Items</div>
          <div className="report-summary-detail">{counts.borrowed} currently borrowed</div>
        </div>
        <div className="report-summary-card">
          <MdWarning size={28} style={{ color: "#f57c00" }} />
          <div className="report-summary-value">{incidents.length}</div>
          <div className="report-summary-label">Incidents</div>
          <div className="report-summary-detail">{incidentByStatus.open || 0} open</div>
        </div>
        <div className="report-summary-card">
          <MdBuild size={28} style={{ color: "#7b1fa2" }} />
          <div className="report-summary-value">{maintenance.length}</div>
          <div className="report-summary-label">Maintenance</div>
          <div className="report-summary-detail">{maintenanceByStatus.scheduled || 0} scheduled</div>
        </div>
      </div>

      <div className="reports-charts-grid">
        <div className="report-chart-box">
          <h4>Item Condition Distribution</h4>
          <div className="report-bar-chart">
            {Object.entries(conditionCounts).map(([cond, count]) => (
              <div className="report-bar-row" key={cond}>
                <span className="report-bar-label">{cond}</span>
                <div className="report-bar-track">
                  <div className="report-bar-fill" style={{ width: `${(count / catalog.length) * 100}%`, background: "#2e7d32" }} />
                </div>
                <span className="report-bar-value">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="report-chart-box">
          <h4>Incident Status</h4>
          <div className="report-bar-chart">
            {Object.entries(incidentByStatus).map(([status, count]) => (
              <div className="report-bar-row" key={status}>
                <span className="report-bar-label">{status}</span>
                <div className="report-bar-track">
                  <div className="report-bar-fill" style={{ width: `${(count / incidents.length) * 100}%`, background: "#f57c00" }} />
                </div>
                <span className="report-bar-value">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="report-chart-box">
          <h4>Maintenance Status</h4>
          <div className="report-bar-chart">
            {Object.entries(maintenanceByStatus).map(([status, count]) => (
              <div className="report-bar-row" key={status}>
                <span className="report-bar-label">{status}</span>
                <div className="report-bar-track">
                  <div className="report-bar-fill" style={{ width: `${(count / maintenance.length) * 100}%`, background: "#7b1fa2" }} />
                </div>
                <span className="report-bar-value">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
