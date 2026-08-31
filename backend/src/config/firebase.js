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

module.exports = { admin, db, auth };
