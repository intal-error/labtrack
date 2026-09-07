const { supabase } = require("../config/supabase");
const { db } = require("../config/firebase");

function isOpenBorrow(t) {
  if (t?.action !== "borrowed") return false;
  if ((t?.status || "").toLowerCase() === "returned") return false;
  const remaining = Math.max(0, (Number(t?.quantity) || 1) - (Number(t?.returned_quantity) || 0));
  return remaining > 0;
}

const getSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [
      usersSnap,
      studentsSnap,
      { data: catalog, error: catalogErr },
      { data: borrowed, error: borrowedErr },
      { data: returned, error: returnedErr },
      { data: incidents, error: incidentsErr },
      { data: maintenance, error: maintenanceErr },
      { data: fines, error: finesErr },
      { data: requests, error: requestsErr },
      { data: attendance, error: attendanceErr },
    ] = await Promise.all([
      db.collection("users").get(),
      db.collection("users").where("role", "==", "student").get(),
      supabase.from("catalog").select("*"),
      supabase.from("transactions").select("*").eq("action", "borrowed"),
      supabase.from("transactions").select("*").eq("action", "returned"),
      supabase.from("incidents").select("*"),
      supabase.from("maintenance").select("*"),
      supabase.from("fines").select("*").order("created_at", { ascending: false }),
      supabase.from("borrow_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("lab_attendance").select("*").eq("date", today),
    ]);

    if (catalogErr) throw catalogErr;
    if (borrowedErr) throw borrowedErr;
    if (returnedErr) throw returnedErr;
    if (incidentsErr) throw incidentsErr;
    if (maintenanceErr) throw maintenanceErr;
    if (finesErr) throw finesErr;
    if (requestsErr) throw requestsErr;
    if (attendanceErr) throw attendanceErr;

    const activeBorrowed = (borrowed || []).filter(isOpenBorrow).length;

    const allCatalog = (catalog || []).map((d) => ({
      category: d.category || "Uncategorized",
      condition: d.condition || "Unknown",
      status: d.status || "Available",
    }));

    const topItems = {};
    [...(returned || []), ...(borrowed || [])].forEach((t) => {
      const name = t.item_name || "Unknown";
      topItems[name] = (topItems[name] || 0) + (Number(t.quantity) || 1);
    });
    const topBorrowedData = Object.entries(topItems)
      .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 18) + "..." : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const incidentData = {};
    (incidents || []).forEach((i) => {
      const s = i.status || "unknown";
      incidentData[s] = (incidentData[s] || 0) + 1;
    });

    const requestStatusData = {};
    (requests || []).forEach((r) => {
      const s = r.status || "unknown";
      requestStatusData[s] = (requestStatusData[s] || 0) + 1;
    });

    const finesData = (fines || []).map((d) => ({
      status: d.status || "unknown",
      totalFine: Number(d.total_fine) || 0,
    }));
    const pendingFines = finesData.filter((f) => f.status === "pending");
    const totalPendingFineAmount = pendingFines.reduce((sum, f) => sum + f.totalFine, 0);

    const categoryData = {};
    const conditionData = {};
    allCatalog.forEach((c) => {
      categoryData[c.category] = (categoryData[c.category] || 0) + 1;
      conditionData[c.condition] = (conditionData[c.condition] || 0) + 1;
    });

    const maintenanceData = (maintenance || []).map((d) => ({ status: d.status || "unknown" }));
    const scheduledMaintenance = maintenanceData.filter((m) => m.status === "scheduled").length;

    res.json({
      counts: {
        users: usersSnap.size,
        students: studentsSnap.size,
        catalog: (catalog || []).length,
        borrowed: activeBorrowed,
        returned: (returned || []).length,
      },
      charts: {
        categoryData: Object.entries(categoryData).map(([name, value]) => ({ name, value })),
        conditionData: Object.entries(conditionData).map(([name, value]) => ({ name, value })),
        topBorrowedData,
        incidentData: Object.entries(incidentData).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value,
        })),
        requestStatusData: Object.entries(requestStatusData).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value,
        })),
      },
      stats: {
        openIncidents: (incidents || []).filter((i) => i.status === "open").length,
        scheduledMaintenance,
        pendingRequests: (requests || []).filter((r) => r.status === "pending").length,
        pendingFines: pendingFines.length,
        totalPendingFineAmount,
        todaySessions: (attendance || []).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getSummary };
