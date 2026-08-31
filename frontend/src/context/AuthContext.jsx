import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setRole((data.role || "").toLowerCase() || null);
            setUserProfile({ id: userDoc.id, ...data });
          } else {
            const adminDoc = await getDoc(doc(db, "admins", firebaseUser.uid));
            if (adminDoc.exists()) {
              const data = adminDoc.data();
              setRole("admin");
              setUserProfile({ id: adminDoc.id, role: "admin", ...data });
            } else {
              setRole(null);
              setUserProfile(null);
            }
          }
        } catch (err) {
          console.error("Failed to load user profile:", err);
          setRole(null);
          setUserProfile(null);
        }
      } else {
        setRole(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const logout = useCallback(async () => {
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
  }, []);

  const value = useMemo(
    () => ({ user, role, userProfile, setUserProfile, loading, logout }),
    [user, role, userProfile, loading, logout]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
