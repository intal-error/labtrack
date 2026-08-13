const { db } = require("../config/firebase");
const { sendOverdueEmail } = require("./emailService");

const TRANS = "transactions";

const checkOverdueTransactions = async () => {
  try {
    const snap = await db.collection(TRANS).get();
    const now = new Date();

    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.action === "returned" || d.status === "Returned") continue;
      if (d.reminderSent) continue;

      const ts = d.timestamp?.toDate?.() || (d.timestamp?.seconds ? new Date(d.timestamp.seconds * 1000) : null);
      if (!ts) continue;

      const dueTime = d.dueDate?.toDate?.() || (d.dueDate?.seconds ? new Date(d.dueDate.seconds * 1000) : new Date(ts.getTime() + 24 * 60 * 60 * 1000));

      if (now > dueTime) {
        const email = d.email || "";
        const name = `${d.firstName || ""} ${d.lastName || ""}`.trim();
        if (!email) continue;

        try {
          await sendOverdueEmail(name, email, d.itemName || "Unknown Item", dueTime.toLocaleString());
          await db.collection(TRANS).doc(doc.id).set(
            { reminderSent: true, reminderSentAt: new Date() },
            { merge: true }
          );
          console.log(`Overdue reminder sent to ${email}`);
        } catch (e) {
          console.error(`Failed to send reminder to ${email}:`, e.message);
        }
      }
    }
  } catch (err) {
    console.error("Overdue check error:", err);
  }
};

module.exports = { checkOverdueTransactions };
