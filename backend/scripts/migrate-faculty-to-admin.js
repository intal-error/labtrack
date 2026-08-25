/**
 * Migration Script: Convert Faculty to Admin
 *
 * This script:
 * 1. Finds all users with role="faculty" in Firestore
 * 2. Converts their role to "admin" in the users collection
 * 3. Updates their Firebase Auth custom claims
 * 4. Removes any legacy "admins" collection entries for faculty
 * 5. Adds empty assignedCourse/assignedYear fields (to be set manually)
 *
 * Usage:
 *   cd backend
 *   node scripts/migrate-faculty-to-admin.js
 */

require("dotenv").config();
const admin = require("firebase-admin");

const firebaseConfig = {
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
};

if (!admin.apps.length) {
  admin.initializeApp(firebaseConfig);
}

const db = admin.firestore();
const auth = admin.auth();

async function migrate() {
  console.log("Starting faculty-to-admin migration...\n");

  // Step 1: Find all faculty users
  const facultySnap = await db.collection("users").where("role", "==", "faculty").get();
  console.log(`Found ${facultySnap.size} faculty users to migrate.\n`);

  if (facultySnap.size === 0) {
    console.log("No faculty users found. Migration complete.");
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const doc of facultySnap.docs) {
    const uid = doc.id;
    const data = doc.data();
    const name = `${data.firstName || ""} ${data.lastName || ""}`.trim();

    console.log(`Migrating: ${name || uid} (${data.email})...`);

    try {
      // Step 2: Update role in users collection
      await db.collection("users").doc(uid).set({
        role: "admin",
        assignedCourse: "",
        assignedYear: "",
        updatedAt: new Date(),
      }, { merge: true });

      // Step 3: Update Firebase Auth custom claims
      await auth.setCustomUserClaims(uid, { role: "admin" });

      // Step 4: Remove from legacy admins collection if present
      try {
        const adminDoc = await db.collection("admins").doc(uid).get();
        if (adminDoc.exists) {
          await db.collection("admins").doc(uid).delete();
          console.log(`  Removed legacy admins collection entry.`);
        }
      } catch (e) {
        // Non-critical
      }

      console.log(`  ✓ Migrated successfully.`);
      successCount++;
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`\nNote: assignedCourse and assignedYear are empty. Set them manually for each admin.`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
