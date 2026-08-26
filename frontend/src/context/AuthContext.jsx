import { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const profilePromise = (async () => {
            const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              setRole((data.role || "").toLowerCase() || null);
              setUserProfile({ id: userDoc.id, ...data });
              return;
            }
            const adminDoc = await getDoc(doc(db, "admins", firebaseUser.uid));
            if (adminDoc.exists()) {
              const data = adminDoc.data();
              setRole("admin");
              setUserProfile({ id: adminDoc.id, role: "admin", ...data });
            } else {
              setRole(null);
              setUserProfile(null);
            }
          })();

          await Promise.race([
            profilePromise,
            new Promise((resolve) => setTimeout(resolve, 4000)),
          ]);
        } catch {
          setRole(null);
          setUserProfile(null);
        }
      } else {
        setRole(null);
        setUserProfile(null);
      }
      clearTimeout(timeout);
      setLoading(false);
    });
    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch {
      // sign out failed, continue cleanup
    }
    setRole(null);
    setUserProfile(null);
    const savedEmail = localStorage.getItem("slsu_remembered_email");
    const savedTheme = localStorage.getItem("theme");
    localStorage.clear();
    sessionStorage.clear();
    if (savedEmail) {
      localStorage.setItem("slsu_remembered_email", savedEmail);
    }
    if (savedTheme) {
      localStorage.setItem("theme", savedTheme);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, userProfile, setUserProfile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
