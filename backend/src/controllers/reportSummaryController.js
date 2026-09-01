const { db } = require("../config/firebase");

const TRANS = "transactions";
const CATALOG = "catalog";
const USERS = "users";
const INCIDENTS = "incidents";
const MAINTENANCE = "maintenance";
const FINES = "fines";
const REQUESTS = "borrowRequests";
const ATTENDANCE = "labAttendance";

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isOpenBorrow(t) {
  if (t?.action !== "borrowed") return false;
  if ((t?.status || "").toLowerCase() === "returned") return false;
  const remaining = Math.max(0, (Number(t?.quantity) || 1) - (Number(t?.returnedQuantity) || 0));
  return remaining > 0;
}

const getSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [
      usersSnap,
      studentsSnap,
      catalogSnap,
      borrowedSnap,
      returnedSnap,
      incidentsSnap,
      maintenanceSnap,
      finesSnap,
      requestsSnap,
      attendanceSnap,
    ] = await Promise.all([
      db.collection(USERS).get(),
      db.collection(USERS).where("role", "==", "student").get(),
      db.collection(CATALOG).get(),
      db.collection(TRANS).where("action", "==", "borrowed").get(),
      db.collection(TRANS).where("action", "==", "returned").get(),
      db.collection(INCIDENTS).get(),
      db.collection(MAINTENANCE).get(),
      db.collection(FINES).orderBy("createdAt", "desc").get(),
      db.collection(REQUESTS).orderBy("createdAt", "desc").get(),
      db.collection(ATTENDANCE).where("date", "==", today).get(),
    ]);

    const activeBorrowed = borrowedSnap.docs.filter((doc) => isOpenBorrow(doc.data())).length;

    const allCatalog = catalogSnap.docs.map((doc) => {
      const d = doc.data();
      return { category: d.category || "Uncategorized", condition: d.condition || "Unknown", status: d.status || "Available" };
    });

    const allBorrowed = borrowedSnap.docs.map((doc) => doc.data());
    const allReturned = returnedSnap.docs.map((doc) => doc.data());

    const topItems = {};
    [...allReturned, ...allBorrowed].forEach((t) => {
      const name = t.itemName || "Unknown";
      topItems[name] = (topItems[name] || 0) + (Number(t.quantity) || 1);
    });
    const topBorrowedData = Object.entries(topItems)
      .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 18) + "..." : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const incidents = incidentsSnap.docs.map((doc) => ({ status: doc.data().status || "unknown" }));
    const incidentData = {};
    incidents.forEach((i) => { incidentData[i.status] = (incidentData[i.status] || 0) + 1; });

    const borrowRequests = requestsSnap.docs.map((doc) => ({ status: doc.data().status || "unknown" }));
    const requestStatusData = {};
    borrowRequests.forEach((r) => { requestStatusData[r.status] = (requestStatusData[r.status] || 0) + 1; });

    const fines = finesSnap.docs.map((doc) => {
      const d = doc.data();
      return { status: d.status || "unknown", totalFine: Number(d.totalFine) || 0 };
    });
    const pendingFines = fines.filter((f) => f.status === "pending");
    const totalPendingFineAmount = pendingFines.reduce((sum, f) => sum + f.totalFine, 0);

    const categoryData = {};
    const conditionData = {};
    allCatalog.forEach((c) => {
      categoryData[c.category] = (categoryData[c.category] || 0) + 1;
      conditionData[c.condition] = (conditionData[c.condition] || 0) + 1;
    });

    const maintenance = maintenanceSnap.docs.map((doc) => ({ status: doc.data().status || "unknown" }));
    const scheduledMaintenance = maintenance.filter((m) => m.status === "scheduled").length;

    res.json({
      counts: {
        users: usersSnap.size,
        students: studentsSnap.size,
        catalog: catalogSnap.size,
        borrowed: activeBorrowed,
        returned: returnedSnap.size,
      },
      charts: {
        categoryData: Object.entries(categoryData).map(([name, value]) => ({ name, value })),
        conditionData: Object.entries(conditionData).map(([name, value]) => ({ name, value })),
        topBorrowedData,
        incidentData: Object.entries(incidentData).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value })),
        requestStatusData: Object.entries(requestStatusData).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value })),
      },
      stats: {
        openIncidents: incidents.filter((i) => i.status === "open").length,
        scheduledMaintenance,
        pendingRequests: borrowRequests.filter((r) => r.status === "pending").length,
        pendingFines: pendingFines.length,
        totalPendingFineAmount,
        todaySessions: attendanceSnap.size,
      },
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getSummary };
