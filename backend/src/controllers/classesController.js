const { db } = require("../config/firebase");

const getAll = async (req, res) => {
  try {
    const recordsSnap = await db.collection("records").get();
    const classMap = {};

    recordsSnap.forEach((doc) => {
      const data = doc.data();
      const key = `${data.subjectCode || "Unknown"}-${data.studentId ? "section" : "general"}`;
      if (!classMap[key]) {
        classMap[key] = {
          id: key,
          course: data.subjectCode || "Unknown",
          section: "General",
          subject: data.subjectCode || "",
          students: [],
          passed: 0,
          failed: 0,
          pending: 0,
          total: 0,
        };
      }
      classMap[key].students.push(data);
      classMap[key].total++;
      const s = (data.status || "").toLowerCase();
      if (s === "passed") classMap[key].passed++;
      else if (s === "failed") classMap[key].failed++;
      else classMap[key].pending++;
    });

    const classes = Object.values(classMap).map((c) => ({
      ...c,
      averageGrade: c.students.length
        ? Math.round(c.students.reduce((sum, s) => sum + (parseFloat(s.score) || 0), 0) / c.students.length)
        : 0,
      completion: c.total > 0 ? Math.round(((c.passed + c.failed) / c.total) * 100) : 0,
    }));

    res.json(classes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll };
