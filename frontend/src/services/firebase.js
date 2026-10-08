// WHY THERE IS NO getFirestore HERE ANY MORE:
//
// This file used to call getFirestore() and export the instance. The only client
// consumers were AuthContext (two getDoc calls to resolve a role), SignInForm
// (the same two calls again) and BorrowerLookup (a doc-id get plus up to six
// field queries). That one import was enough to pull the whole Firestore SDK --
// WebChannel streaming, offline persistence, the query engine, an inlined `idb`
// helper -- into the eagerly-loaded entry chunk: 215 kB of a 562 kB bundle,
// re-downloaded on every app-code deploy.
//
// All three now use the API instead: authController.getProfile and
// userController.resolveCode answer the same questions server-side, where the
// data already lives and where the reads were happening regardless.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
