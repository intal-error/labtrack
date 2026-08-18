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

const getBorrowed = async (req, res) => {
  try {
    const snap = await db.collection(TRANS).where("action", "==", "borrowed").get();
    const items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((d) => isOpenBorrow(d))
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getReturned = async (req, res) => {
  try {
    const snap = await db.collection(TRANS).where("action", "==", "returned").get();
    const items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyBorrowed = async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection(TRANS).where("action", "==", "borrowed").get();
    const items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((d) => d.userId === uid && isOpenBorrow(d))
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyReturned = async (req, res) => {
  try {
    const uid = req.user.uid;
    const snap = await db.collection(TRANS).where("action", "==", "returned").get();
    const items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((d) => d.userId === uid)
      .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDashboardCounts = async (req, res) => {
  try {
    const [borrowedSnap, returnedSnap, usersSnap, studentsSnap, facultySnap] = await Promise.all([
      db.collection(TRANS).where("action", "==", "borrowed").get(),
      db.collection(TRANS).where("action", "==", "returned").get(),
      db.collection(USERS).get(),
      db.collection(USERS).where("role", "==", "student").get(),
      db.collection(USERS).where("role", "==", "faculty").get(),
    ]);
    const activeBorrowed = borrowedSnap.docs.filter((doc) => isOpenBorrow(doc.data())).length;
    res.json({
      borrowed: activeBorrowed,
      returned: returnedSnap.size,
      users: usersSnap.size,
      students: studentsSnap.size,
      faculty: facultySnap.size,
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
    const { itemId, borrower, quantity, dueDate } = req.body;
    const catalogRef = db.collection(CATALOG).doc(itemId);
    const borrowRef = db.collection(TRANS).doc();

    let userRef;
    let resolvedUser = null;
    if (borrower.userId) {
      userRef = db.collection(USERS).doc(borrower.userId);
    } else if (borrower.schoolID) {
      const userSnap = await db.collection(USERS)
        .where("schoolId", "==", borrower.schoolID).limit(1).get();
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
        userId: userRef.id,
        dueDate: new Date(dueDate),
        timestamp: new Date(),
        borrowedAt: new Date(),
      };
      if (borrower.email) loanData.email = borrower.email;

      t.set(catalogRef, {
        availableQuantity: nextAvailable,
        available: nextAvailable > 0,
        status: nextAvailable > 0 ? "Available" : "Borrowed",
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
    const { borrowId, itemId, schoolID, quantity } = req.body;
    const catalogRef = db.collection(CATALOG).doc(itemId);
    const borrowRef = db.collection(TRANS).doc(borrowId);
    const returnRef = db.collection(TRANS).doc();

    await db.runTransaction(async (t) => {
      const [catalogSnap, borrowSnap] = await Promise.all([t.get(catalogRef), t.get(borrowRef)]);
      if (!catalogSnap.exists) throw new Error("Catalog item not found");
      if (!borrowSnap.exists) throw new Error("Borrow record not found");

      const borrow = borrowSnap.data();
      if (!isOpenBorrow(borrow)) throw new Error("Already returned");
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
        userId: borrow.userId || null,
        timestamp: new Date(),
        returnedAt: new Date(),
      };
      if (borrow.email) returnData.email = borrow.email;
      if (borrow.dueDate) returnData.dueDate = borrow.dueDate;

      t.set(catalogRef, {
        availableQuantity: nextAvailable,
        available: nextAvailable > 0,
        status: nextAvailable > 0 ? "Available" : "Borrowed",
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

module.exports = { getBorrowed, getReturned, getMyBorrowed, getMyReturned, getDashboardCounts, getChartData, recordBorrow, recordReturn };
