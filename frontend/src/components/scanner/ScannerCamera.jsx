import { useState, useRef, useCallback, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { hapticLight, hapticWarn, hapticCancel } from "../../utils/haptics";

export default function ScannerCamera({ target, onScan, onStop }) {
  const scannerRef = useRef(null);
  const runningRef = useRef(false);
  const [status, setStatus] = useState("");
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    runningRef.current = false;
    if (s) {
      try { await s.stop(); } catch {}
      try { await s.clear(); } catch {}
    }
    // Cancels any in-flight haptic pattern too, so a vibration started just before an
    // unmount does not continue buzzing after the page has gone.
    hapticCancel();
  }, []);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await stopScanner();
      if (cancelled) return;
      setStatus(target === "borrower" ? "Opening camera for borrower ID..." : "Opening camera for item code...");
      try {
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          async (decodedText) => {
            if (!runningRef.current) return;
            runningRef.current = false;
            await stopScanner();
            setStatus("Code scanned. Looking it up...");
            onScanRef.current?.(decodedText);
          },
          () => {}
        );
        // WHY stopScanner HERE AND NOT A PLAIN RETURN: this branch is reached after
        // awaiting start(), which takes a few hundred ms while the camera is
        // acquired. The unmount cleanup at line 24 runs *during* that await, so it
        // reads scannerRef.current as null and stops nothing; then it sets
        // cancelled = true. Without stopping here, the MediaStream that start() just
        // opened is never released and the camera light stays on after the user has
        // left the page.
        if (cancelled) {
          await stopScanner();
          return;
        }
        runningRef.current = true;
        hapticLight();
        setStatus("Point the camera at the code.");
      } catch {
        try {
          await stopScanner();
          if (cancelled) return;
          const scanner = new Html5Qrcode("qr-reader");
          scannerRef.current = scanner;
          await scanner.start({ facingMode: "user" }, { fps: 10, qrbox: { width: 240, height: 240 } }, async (t) => {
            if (!runningRef.current) return;
            runningRef.current = false;
            await stopScanner();
            onScanRef.current?.(t);
          }, () => {});
          // Same reasoning as above: this is the front-camera fallback, and an
          // unmount during its start() would leak the stream just the same.
          if (cancelled) {
            await stopScanner();
            return;
          }
          runningRef.current = true;
          hapticLight();
          setStatus("Point the camera at the code.");
        } catch {
          await stopScanner();
          if (cancelled) return;
          // The camera is unavailable, which is worth a distinct pattern -- the
          // operator needs to know to type the code manually instead of retrying the
          // scan.
          hapticWarn();
          setStatus("Camera unavailable. Enter codes manually.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [stopScanner, target]);

  return (
    <div className="scanner-camera-wrap">
      <div id="qr-reader" />
      <p className="scanner-status">{status}</p>
      <button type="button" className="btn btn-orange scanner-stop" onClick={async () => { await stopScanner(); onStop?.(); }}>Stop camera</button>
    </div>
  );
}
