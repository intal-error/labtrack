import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(null);

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
  // localStorage can throw (private mode, MDM policy blocking site data,
  // storage-disabled WebViews). This initializer runs during render, so an
  // uncaught throw would take the whole app down rather than fall back.
  const [dark, setDark] = useState(() => {
    try {
      const stored = localStorage.getItem("theme");
      if (stored) return stored === "dark";
    } catch {
      /* storage unavailable - use the default below */
    }
    return true;
  });

  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      /* preference just won't persist; theme still applies for this session */
    }
    // Keep mobile browser / PWA chrome on the active theme. index.html ships
    // prefers-color-scheme-scoped tags for first paint; the un-scoped one is
    // updated here so an explicit user choice wins from then on.
    const meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute("content", dark ? "#000000" : "#f5f5f0");
  }, [dark]);

  const toggleTheme = () => setDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ dark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
