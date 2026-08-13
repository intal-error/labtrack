import { useState, useEffect, useCallback } from "react";

async function pingServer() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("/api/health", { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export default function ServerBanner() {
  const [offline, setOffline] = useState(false);

  const check = useCallback(async () => {
    const ok = await pingServer();
    setOffline(!ok);
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 20000);
    return () => clearInterval(interval);
  }, [check]);

  if (!offline) return null;

  return (
    <div className="server-banner">
      <span className="server-banner-icon">⚠</span>
      <p className="server-banner-text">
        Server offline — data won't load. Run <code>npm run dev:backend</code> (or <code>npm run dev:all</code>).
      </p>
      <div className="server-banner-actions">
        <button type="button" className="server-banner-retry" onClick={check}>Retry</button>
        <button type="button" className="server-banner-close" onClick={() => setOffline(false)} aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}
