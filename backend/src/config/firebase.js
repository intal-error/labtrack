const admin = require("firebase-admin");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !rawPrivateKey) {
  console.error("FATAL: Missing Firebase credentials in environment variables.");
  console.error(`FIREBASE_PROJECT_ID: ${projectId ? "OK" : "MISSING"}`);
  console.error(`FIREBASE_CLIENT_EMAIL: ${clientEmail ? "OK" : "MISSING"}`);
  console.error(`FIREBASE_PRIVATE_KEY: ${rawPrivateKey ? "OK" : "MISSING"}`);
  process.exit(1);
}

const privateKey = rawPrivateKey
  .replace(/\\n/g, "\n")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

const firebaseConfig = {
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  }),
};

if (!admin.apps.length) {
  admin.initializeApp(firebaseConfig);
}

const db = admin.firestore();
const auth = admin.auth();

// Exported so callers can build batched `where(documentId(), "in", [...])` reads
// instead of N individual doc gets. Firestore caps `in` at 30 values, which is why
// transactionController chunks its lookups.
const FieldPath = admin.firestore.FieldPath;

module.exports = { admin, db, auth, FieldPath };
