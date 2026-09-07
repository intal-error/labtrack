const { randomUUID } = require("crypto");
const { supabase } = require("../config/supabase");
const { sendOverdueEmail } = require("./emailService");
const { createFineForOverdue } = require("../controllers/finesController");

const checkOverdueTransactions = async () => {
  try {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("action", "borrowed");

    if (error) throw error;

    const now = new Date();
    const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

    for (const tx of transactions || []) {
      if (tx.status === "returned") continue;

      const ts = tx.timestamp ? new Date(tx.timestamp) : null;
      if (!ts) continue;

      const dueTime = tx.due_date ? new Date(tx.due_date) : new Date(ts.getTime() + 24 * 60 * 60 * 1000);

      if (now > dueTime) {
        const lastReminder = tx.reminder_sent_at ? new Date(tx.reminder_sent_at) : null;

        if (tx.reminder_sent && lastReminder && (now.getTime() - lastReminder.getTime()) < REMINDER_INTERVAL_MS) {
          continue;
        }

        // Create fine independently — email failure should not block fine creation
        try {
          await createFineForOverdue(tx.id);
        } catch (e) {
          console.error(`Failed to create fine for ${tx.id}:`, e.message);
        }

        const email = tx.email || "";
        const name = `${tx.first_name || ""} ${tx.last_name || ""}`.trim();
        if (!email) continue;

        try {
          await sendOverdueEmail(name, email, tx.item_name || "Unknown Item", dueTime.toLocaleString());

          if (tx.user_id) {
            await supabase.from("notifications").insert({
              id: randomUUID(),
              target_user_id: tx.user_id,
              type: "overdue",
              title: "Overdue Return",
              message: `Your borrowed "${tx.item_name || "Unknown Item"}" is past its due date. Please return it as soon as possible.`,
              read: false,
              dismissed_by: [],
              link: "/fines",
              created_at: new Date().toISOString(),
            });
          }

          await supabase
            .from("transactions")
            .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString() })
            .eq("id", tx.id);

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
