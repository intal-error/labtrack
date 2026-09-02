const { db } = require("../config/firebase");
const { sendOverdueEmail } = require("./emailService");
const { createFineForOverdue } = require("../controllers/finesController");

const TRANS = "transactions";
const NOTIF = "notifications";

const checkOverdueTransactions = async () => {
  try {
    const snap = await db.collection(TRANS)
      .where("action", "==", "borrowed")
      .get();
    const now = new Date();
    const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.status === "returned") continue;

      const ts = d.timestamp?.toDate?.() || (d.timestamp?.seconds ? new Date(d.timestamp.seconds * 1000) : null);
      if (!ts) continue;

      const dueTime = d.dueDate?.toDate?.() || (d.dueDate?.seconds ? new Date(d.dueDate.seconds * 1000) : new Date(ts.getTime() + 24 * 60 * 60 * 1000));

      if (now > dueTime) {
        const lastReminder = d.reminderSentAt?.toDate?.() || (d.reminderSentAt?.seconds ? new Date(d.reminderSentAt.seconds * 1000) : null);

        if (d.reminderSent && lastReminder && (now.getTime() - lastReminder.getTime()) < REMINDER_INTERVAL_MS) {
          continue;
        }

        const email = d.email || "";
        const name = `${d.firstName || ""} ${d.lastName || ""}`.trim();
        if (!email) continue;

        try {
          await sendOverdueEmail(name, email, d.itemName || "Unknown Item", dueTime.toLocaleString());

          if (d.userId) {
            await db.collection(NOTIF).add({
              targetUserId: d.userId,
              type: "overdue",
              title: "Overdue Return",
              message: `Your borrowed "${d.itemName || "Unknown Item"}" is past its due date. Please return it as soon as possible.`,
              read: false,
              dismissedBy: [],
              link: "/fines",
              createdAt: new Date(),
            });
          }

          await db.collection(TRANS).doc(doc.id).set(
            { reminderSent: true, reminderSentAt: new Date() },
            { merge: true }
          );

          await createFineForOverdue(doc.id);

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
