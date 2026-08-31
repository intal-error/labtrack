const { db } = require("../config/firebase");

const TRANS = "transactions";
const CATALOG = "catalog";
const USERS = "users";

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAvailableQuantity(item) {
  if (Number.isFinite(Number(item?.availableQuantity))) {
    return Math.max(0, numberOr(item.availableQuantity));
  }
  const quantity = Math.max(0, numberOr(item?.quantity));
  return (item?.status || "").toLowerCase() === "borrowed" ? 0 : quantity;
}

function getRemainingQuantity(t) {
  return Math.max(0, numberOr(t?.quantity, 1) - numberOr(t?.returnedQuantity));
}

function isOpenBorrow(t) {
  if (t?.action !== "borrowed") return false;
  if ((t?.status || "").toLowerCase() === "returned") return false;
  return getRemainingQuantity(t) > 0;
}

async function enrichWithProfileURL(items) {
  const userIds = [...new Set(items.map((i) => i.userId).filter(Boolean))];
  if (userIds.length === 0) return items;
  const userSnaps = await Promise.all(userIds.map((id) => db.collection(USERS).doc(id).get()));
  const profileMap = {};
  userSnaps.forEach((snap) => {
    if (snap.exists) {
      const data = snap.data();
      if (data.profileURL) profileMap[snap.id] = data.profileURL;
    }
  });
  return items.map((item) => ({
    ...item,
    profileURL: item.profileURL || profileMap[item.userId] || "",
  }));
}

const getBorrowed = async (req, res) => {
  try {
    const snap = await db.collection(TRANS).where("action", "==", "borrowed").get();
    const items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((d) => isOpenBorrow(d))
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));
    const enriched = await enrichWithProfileURL(items);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getReturned = async (req, res) => {
  try {
    const snap = await db.collection(TRANS).where("action", "==", "returned").get();
    let items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));

    const missingDates = items.filter((i) => !i.borrowedAt && i.originalTransactionId);
    if (missingDates.length > 0) {
      const borrowIds = [...new Set(missingDates.map((i) => i.originalTransactionId))];
      const borrowSnaps = await Promise.all(borrowIds.map((id) => db.collection(TRANS).doc(id).get()));
      const borrowMap = {};
      borrowSnaps.forEach((s) => { if (s.exists) borrowMap[s.id] = s.data(); });
      items = items.map((item) => {
        if (!item.borrowedAt && item.originalTransactionId && borrowMap[item.originalTransactionId]) {
          const borrow = borrowMap[item.originalTransactionId];
          return {
            ...item,
            borrowedAt: borrow.borrowedAt || borrow.timestamp || null,
            dueDate: item.dueDate || borrow.dueDate || null,
          };
        }
        return item;
      });
    }

    const enriched = await enrichWithProfileURL(items);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyBorrowed = async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection(TRANS)
      .where("action", "==", "borrowed")
      .where("userId", "==", uid)
      .get();
    const items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((d) => isOpenBorrow(d))
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));
    const enriched = await enrichWithProfileURL(items);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyReturned = async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection(TRANS)
      .where("action", "==", "returned")
      .where("userId", "==", uid)
      .get();
    let items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));

    const missingDates = items.filter((i) => !i.borrowedAt && i.originalTransactionId);
    if (missingDates.length > 0) {
      const borrowIds = [...new Set(missingDates.map((i) => i.originalTransactionId))];
      const borrowSnaps = await Promise.all(borrowIds.map((id) => db.collection(TRANS).doc(id).get()));
      const borrowMap = {};
      borrowSnaps.forEach((s) => { if (s.exists) borrowMap[s.id] = s.data(); });
      items = items.map((item) => {
        if (!item.borrowedAt && item.originalTransactionId && borrowMap[item.originalTransactionId]) {
          const borrow = borrowMap[item.originalTransactionId];
          return {
            ...item,
            borrowedAt: borrow.borrowedAt || borrow.timestamp || null,
            dueDate: item.dueDate || borrow.dueDate || null,
          };
        }
        return item;
      });
    }

    const enriched = await enrichWithProfileURL(items);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDashboardCounts = async (req, res) => {
  try {
    const [borrowedSnap, returnedSnap, studentsSnap] = await Promise.all([
      db.collection(TRANS).where("action", "==", "borrowed").get(),
      db.collection(TRANS).where("action", "==", "returned").get(),
      db.collection(USERS).where("role", "==", "student").get(),
    ]);
    const activeBorrowed = borrowedSnap.docs.filter((doc) => isOpenBorrow(doc.data())).length;
    const returnedCount = returnedSnap.size;
    const studentsCount = studentsSnap.size;
    const usersSnap = await db.collection(USERS).get();
    const usersCount = usersSnap.size;
    res.json({
      borrowed: activeBorrowed,
      returned: returnedCount,
      users: usersCount,
      students: studentsCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getChartData = async (req, res) => {
  try {
    const [borrowedSnap, returnedSnap, availableSnap, inventorySnap] = await Promise.all([
      db.collection(TRANS).where("action", "==", "borrowed").get(),
      db.collection(TRANS).where("action", "==", "returned").get(),
      db.collection(CATALOG).where("available", "==", true).get(),
      db.collection(CATALOG).get(),
    ]);
    res.json({
      borrowed: borrowedSnap.size,
      returned: returnedSnap.size,
      available: availableSnap.size,
      inventory: inventorySnap.size,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const recordBorrow = async (req, res) => {
  try {
    const { itemId, borrower, quantity, dueDate, borrowPhotoURL, conditionOnBorrow } = req.body;
    const catalogRef = db.collection(CATALOG).doc(itemId);
    const borrowRef = db.collection(TRANS).doc();

    let userRef;
    let resolvedUser = null;
    if (borrower.userId) {
      userRef = db.collection(USERS).doc(borrower.userId);
    } else if (borrower.schoolID) {
      let userSnap = await db.collection(USERS)
        .where("schoolId", "==", borrower.schoolID).limit(1).get();
      if (userSnap.empty) {
        userSnap = await db.collection(USERS)
          .where("employeeId", "==", borrower.schoolID).limit(1).get();
      }
      if (!userSnap.empty) {
        resolvedUser = { id: userSnap.docs[0].id, ...userSnap.docs[0].data() };
        userRef = userSnap.docs[0].ref;
      } else {
        userRef = db.collection(USERS).doc();
      }
    } else {
      userRef = db.collection(USERS).doc();
    }

    await db.runTransaction(async (t) => {
      const catalogSnap = await t.get(catalogRef);
      if (!catalogSnap.exists) throw new Error("Catalog item not found");
      const current = catalogSnap.data();
      const available = getAvailableQuantity(current);
      if (available < quantity) throw new Error(`Only ${available} available`);

      let userCourse = borrower.course || "";
      if (!userCourse) {
        const userData = resolvedUser || (await t.get(db.collection(USERS).doc(userRef.id)));
        if (userData?.data) {
          userCourse = userData.data.course || "";
        } else if (userData?.exists) {
          userCourse = userData.data().course || "";
        }
      }

      let userYear = borrower.year || "";
      if (!userYear) {
        const userData = resolvedUser || (await t.get(db.collection(USERS).doc(userRef.id)));
        if (userData?.data) {
          userYear = userData.data.year || "";
        } else if (userData?.exists) {
          userYear = userData.data().year || "";
        }
      }

      const nextAvailable = available - quantity;
      const userData = {
        schoolID: borrower.schoolID,
        firstName: borrower.firstName,
        lastName: borrower.lastName,
        role: borrower.role || "student",
        updatedAt: new Date(),
      };
      if (borrower.email) userData.email = borrower.email;
      if (userCourse) userData.course = userCourse;
      if (!borrower.userId && !resolvedUser) userData.createdAt = new Date();

      const loanData = {
        action: "borrowed",
        status: "borrowed",
        catalogId: itemId,
        itemName: current.itemName,
        scanCode: `SLSU-TOOL:${itemId}`,
        quantity: Number(quantity),
        returnedQuantity: 0,
        quantityRemaining: Number(quantity),
        schoolID: borrower.schoolID,
        firstName: borrower.firstName,
        lastName: borrower.lastName,
        course: userCourse,
        year: userYear,
        userId: userRef.id,
        dueDate: new Date(dueDate),
        timestamp: new Date(),
        borrowedAt: new Date(),
        // Equipment and admin tracking
        equipment_course: current.course || "",
        assigned_admin_id: borrower.assigned_admin_id || "",
        approvedBy: borrower.approvedBy || "",
      };
      if (borrower.email) loanData.email = borrower.email;
      if (borrower.profileURL) loanData.profileURL = borrower.profileURL;
      if (borrowPhotoURL) loanData.borrowPhotoURL = borrowPhotoURL;
      if (conditionOnBorrow) loanData.conditionOnBorrow = conditionOnBorrow;

      const totalQty = Math.max(numberOr(current.quantity), nextAvailable);
      t.set(catalogRef, {
        availableQuantity: nextAvailable,
        available: nextAvailable > 0,
        status: nextAvailable < totalQty ? "Borrowed" : "Available",
        updatedAt: new Date(),
      }, { merge: true });
      t.set(userRef, userData, { merge: true });
      t.set(borrowRef, loanData);
      t.set(userRef.collection("borrowed").doc(borrowRef.id), {
        transactionId: borrowRef.id,
        catalogId: itemId,
        itemName: current.itemName,
        quantity: Number(quantity),
        returnedQuantity: 0,
        quantityRemaining: Number(quantity),
        status: "borrowed",
        dueDate: new Date(dueDate),
        timestamp: new Date(),
      });
    });

    res.status(201).json({ message: "Borrow recorded" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const recordReturn = async (req, res) => {
  try {
    const { borrowId, itemId, schoolID, quantity, returnPhotoURL, conditionOnReturn } = req.body;
    const catalogRef = db.collection(CATALOG).doc(itemId);
    const borrowRef = db.collection(TRANS).doc(borrowId);
    const returnRef = db.collection(TRANS).doc();

    await db.runTransaction(async (t) => {
      const [catalogSnap, borrowSnap] = await Promise.all([t.get(catalogRef), t.get(borrowRef)]);
      if (!catalogSnap.exists) throw new Error("Catalog item not found");
      if (!borrowSnap.exists) throw new Error("Borrow record not found");

      const borrow = borrowSnap.data();
      if (!isOpenBorrow(borrow)) throw new Error("Already returned");

      // No course-based restriction — any admin can process any return
      const remaining = getRemainingQuantity(borrow);
      if (quantity > remaining) throw new Error(`Only ${remaining} remain`);

      const returned = numberOr(borrow.returnedQuantity) + quantity;
      const remainingQty = Math.max(0, numberOr(borrow.quantity, 1) - returned);
      const fullReturn = remainingQty === 0;
      const current = catalogSnap.data();
      const currentAvail = getAvailableQuantity(current);
      const totalQty = Math.max(numberOr(current.quantity), currentAvail + quantity);
      const nextAvailable = Math.min(totalQty, currentAvail + quantity);

      const returnData = {
        action: "returned",
        status: "returned",
        originalTransactionId: borrowId,
        catalogId: itemId,
        itemName: borrow.itemName,
        quantity: Number(quantity),
        schoolID: borrow.schoolID,
        firstName: borrow.firstName || "",
        lastName: borrow.lastName || "",
        course: borrow.course || "",
        year: borrow.year || "",
        userId: borrow.userId || null,
        timestamp: new Date(),
        returnedAt: new Date(),
        // Equipment and admin tracking
        equipment_course: borrow.equipment_course || "",
        assigned_admin_id: borrow.assigned_admin_id || "",
        returnedTo: req.user.uid,
      };
      if (borrow.email) returnData.email = borrow.email;
      if (borrow.dueDate) returnData.dueDate = borrow.dueDate;
      if (borrow.borrowedAt) returnData.borrowedAt = borrow.borrowedAt;
      if (borrow.timestamp) returnData.borrowedAt = borrow.borrowedAt || borrow.timestamp;
      if (returnPhotoURL) returnData.returnPhotoURL = returnPhotoURL;
      if (conditionOnReturn) returnData.conditionOnReturn = conditionOnReturn;
      if (borrow.borrowPhotoURL) returnData.borrowPhotoURL = borrow.borrowPhotoURL;
      if (borrow.conditionOnBorrow) returnData.conditionOnBorrow = borrow.conditionOnBorrow;

      t.set(catalogRef, {
        availableQuantity: nextAvailable,
        available: nextAvailable > 0,
        status: nextAvailable < totalQty ? "Borrowed" : "Available",
        updatedAt: new Date(),
      }, { merge: true });
      t.set(borrowRef, {
        returnedQuantity: returned,
        quantityRemaining: remainingQty,
        status: fullReturn ? "returned" : "partially_returned",
        lastReturnedAt: new Date(),
        ...(fullReturn ? { returnedAt: new Date() } : {}),
      }, { merge: true });
      t.set(returnRef, returnData);

      if (borrow.userId) {
        t.set(db.collection(USERS).doc(borrow.userId).collection("borrowed").doc(borrowId), {
          returnedQuantity: returned,
          quantityRemaining: remainingQty,
          status: fullReturn ? "returned" : "borrowed",
          lastReturnedAt: new Date(),
        }, { merge: true });
        t.set(db.collection(USERS).doc(borrow.userId).collection("returned").doc(returnRef.id), {
          transactionId: returnRef.id,
          originalTransactionId: borrowId,
          catalogId: itemId,
          itemName: borrow.itemName,
          quantity: Number(quantity),
          status: "returned",
          timestamp: new Date(),
        });
      }
    });

    res.status(201).json({ message: "Return recorded" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getRecentActivity = async (req, res) => {
  try {
    const [borrowSnap, returnSnap] = await Promise.all([
      db.collection(TRANS).where("action", "==", "borrowed").get(),
      db.collection(TRANS).where("action", "==", "returned").get(),
    ]);

    const borrows = borrowSnap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          action: "borrowed",
          firstName: d.firstName || "",
          lastName: d.lastName || "",
          itemName: d.itemName || "",
          quantity: numberOr(d.quantity, 1),
          timestamp: d.timestamp || d.borrowedAt || null,
          dueDate: d.dueDate || null,
          schoolID: d.schoolID || "",
          course: d.course || "",
          equipment_course: d.equipment_course || "",
          email: d.email || "",
          role: d.role || "",
        };
      });

    const returns = returnSnap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          action: "returned",
          firstName: d.firstName || "",
          lastName: d.lastName || "",
          itemName: d.itemName || "",
          quantity: numberOr(d.quantity, 1),
          timestamp: d.timestamp || d.returnedAt || null,
          returnedAt: d.returnedAt || null,
          dueDate: d.dueDate || null,
          schoolID: d.schoolID || "",
          course: d.course || "",
          equipment_course: d.equipment_course || "",
          email: d.email || "",
          role: d.role || "",
        };
      });

    const merged = [...borrows, ...returns]
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0))
      .slice(0, 10);

    const enriched = await enrichWithProfileURL(merged);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getBorrowed, getReturned, getMyBorrowed, getMyReturned, getDashboardCounts, getChartData, recordBorrow, recordReturn, getRecentActivity };
