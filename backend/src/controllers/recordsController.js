const { db } = require("../config/firebase");

const COLLECTION = "records";

const getAll = async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
    const records = [];
    snap.forEach((doc) => records.push({ id: doc.id, ...doc.data() }));
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { studentName, studentId, subjectCode, subjectName, score, grade, status, semester, year } = req.body;
    if (!studentName || !studentId || !subjectCode) {
      return res.status(400).json({ error: "Student name, ID, and subject code are required" });
    }
    const docRef = await db.collection(COLLECTION).add({
      studentName,
      studentId,
      subjectCode,
      subjectName: subjectName || "",
      score: score || "",
      grade: grade || "",
      status: status || "Pending",
      semester: semester || "",
      year: year || "",
      createdAt: new Date(),
    });
    res.status(201).json({ id: docRef.id, message: "Record created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentName, studentId, subjectCode, subjectName, score, grade, status, semester, year } = req.body;
    await db.collection(COLLECTION).doc(id).set({
      studentName,
      studentId,
      subjectCode,
      subjectName: subjectName || "",
      score: score || "",
      grade: grade || "",
      status: status || "Pending",
      semester: semester || "",
      year: year || "",
      updatedAt: new Date(),
    }, { merge: true });
    res.json({ message: "Record updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ message: "Record deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAll, create, update, remove };
