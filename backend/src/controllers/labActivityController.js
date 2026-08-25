const { db } = require("../config/firebase");

const ACTIVITIES = "labActivities";
const ATTENDANCE = "labAttendance";
const USERS = "users";

const toDate = (val) => {
  if (!val) return null;
  if (typeof val?.toDate === "function") return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val?.seconds === "number") return new Date(val.seconds * 1000);
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
};

const createActivity = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const {
      title, subject, description, date, startTime, endTime,
      course, year, section, room, instructor, status,
    } = req.body;

    if (!title || !subject || !date || !startTime || !endTime || !course || !year || !section || !room) {
      return res.status(400).json({ error: "All required fields must be filled" });
    }

    const activityData = {
      title: title.trim(),
      subject: subject.trim(),
      description: (description || "").trim(),
      date,
      startTime,
      endTime,
      course,
      year,
      section,
      room,
      instructor: (instructor || "").trim(),
      status: status || "upcoming",
      createdBy: req.user.uid,
      createdAt: new Date(),
    };

    const ref = await db.collection(ACTIVITIES).add(activityData);
    res.status(201).json({ id: ref.id, message: "Lab activity created" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getActivities = async (req, res) => {
  try {
    const snap = await db.collection(ACTIVITIES).orderBy("date", "desc").get();
    let activities = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (req.adminAssignment?.assignedCourse) {
      activities = activities.filter((a) => a.course === req.adminAssignment.assignedCourse);
    }

    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyActivities = async (req, res) => {
  try {
    const uid = req.user.uid;
    const userSnap = await db.collection(USERS).doc(uid).get();
    if (!userSnap.exists) return res.status(404).json({ error: "User not found" });

    const userData = userSnap.data();
    const course = userData.course || "";
    const year = userData.year || "";
    const section = userData.section || "";

    if (!course || !year || !section) {
      return res.json([]);
    }

    const snap = await db.collection(ACTIVITIES).get();
    let activities = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((a) => a.course === course && a.year === year && a.section === section);

    const today = new Date().toISOString().slice(0, 10);
    activities.sort((a, b) => {
      if (a.date === today && b.date !== today) return -1;
      if (a.date !== today && b.date === today) return 1;
      return (a.date || "").localeCompare(b.date || "");
    });

    const activityIds = activities.map((a) => a.id);
    let attendanceMap = {};
    if (activityIds.length > 0) {
      const attSnap = await db.collection(ATTENDANCE)
        .where("userId", "==", uid)
        .get();
      attSnap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.activityId) attendanceMap[data.activityId] = true;
      });
    }

    activities = activities.map((a) => ({
      ...a,
      joined: !!attendanceMap[a.id],
    }));

    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getActivityById = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection(ACTIVITIES).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Activity not found" });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateActivity = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    const docRef = db.collection(ACTIVITIES).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Activity not found" });

    const updates = { ...req.body, updatedAt: new Date() };
    delete updates.id;
    delete updates.createdBy;
    delete updates.createdAt;

    await docRef.set(updates, { merge: true });
    res.json({ message: "Activity updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteActivity = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    const doc = await db.collection(ACTIVITIES).doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "Activity not found" });

    const attSnap = await db.collection(ATTENDANCE)
      .where("activityId", "==", id)
      .get();
    const batch = db.batch();
    attSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db.collection(ACTIVITIES).doc(id));
    await batch.commit();

    res.json({ message: "Activity deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const joinSession = async (req, res) => {
  try {
    const { id } = req.params;
    const uid = req.user.uid;

    const activityDoc = await db.collection(ACTIVITIES).doc(id).get();
    if (!activityDoc.exists) return res.status(404).json({ error: "Activity not found" });

    const activity = activityDoc.data();

    const userDoc = await db.collection(USERS).doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const userData = userDoc.data();

    if (userData.course !== activity.course ||
        userData.year !== activity.year ||
        userData.section !== activity.section) {
      return res.status(403).json({ error: "You are not enrolled in this lab session" });
    }

    const existingSnap = await db.collection(ATTENDANCE)
      .where("activityId", "==", id)
      .where("userId", "==", uid)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return res.status(400).json({ error: "You have already joined this session" });
    }

    const attendanceData = {
      activityId: id,
      userId: uid,
      schoolId: userData.schoolId || userData.schoolID || "",
      firstName: userData.firstName || "",
      lastName: userData.lastName || "",
      course: userData.course || "",
      year: userData.year || "",
      section: userData.section || "",
      subject: activity.subject || "",
      loginTime: new Date(),
      status: "present",
    };

    const ref = await db.collection(ATTENDANCE).add(attendanceData);
    res.status(201).json({ id: ref.id, message: "Successfully joined lab session" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getSessionAttendees = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    const snap = await db.collection(ATTENDANCE)
      .where("activityId", "==", id)
      .get();

    let attendees = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (req.adminAssignment?.assignedCourse) {
      attendees = attendees.filter((a) => a.course === req.adminAssignment.assignedCourse);
    }

    attendees.sort((a, b) => {
      const ta = toDate(a.loginTime)?.getTime() || 0;
      const tb = toDate(b.loginTime)?.getTime() || 0;
      return ta - tb;
    });

    res.json(attendees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getSessionNonAttendees = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id } = req.params;
    const activityDoc = await db.collection(ACTIVITIES).doc(id).get();
    if (!activityDoc.exists) return res.status(404).json({ error: "Activity not found" });

    const activity = activityDoc.data();

    const studentsSnap = await db.collection(USERS)
      .where("role", "==", "student")
      .where("course", "==", activity.course)
      .where("year", "==", activity.year)
      .where("section", "==", activity.section)
      .get();

    const attendeesSnap = await db.collection(ATTENDANCE)
      .where("activityId", "==", id)
      .get();

    const attendedIds = new Set();
    attendeesSnap.docs.forEach((doc) => {
      attendedIds.add(doc.data().userId);
    });

    const nonAttendees = studentsSnap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          userId: doc.id,
          firstName: d.firstName || "",
          lastName: d.lastName || "",
          schoolId: d.schoolId || d.schoolID || "",
          course: d.course || "",
          year: d.year || "",
          section: d.section || "",
        };
      })
      .filter((s) => !attendedIds.has(s.userId));

    res.json(nonAttendees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markAbsent = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const { id, attendeeId } = req.params;
    const docRef = db.collection(ATTENDANCE).doc(attendeeId);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Attendance record not found" });

    const data = doc.data();
    if (data.activityId !== id) return res.status(400).json({ error: "Record does not match this activity" });

    await docRef.set({ status: "absent", markedAt: new Date() }, { merge: true });
    res.json({ message: "Student marked as absent" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createActivity, getActivities, getMyActivities, getActivityById,
  updateActivity, deleteActivity, joinSession,
  getSessionAttendees, getSessionNonAttendees, markAbsent,
};
