import { useRef, useCallback, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function ScannerCamera({ target, onScan, onStop }) {
  const scannerRef = useRef(null);
  const runningRef = useRef(false);
  const [status, setStatus] = React.useState("");

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    runningRef.current = false;
    if (s) {
      try { await s.stop(); } catch {}
      try { await s.clear(); } catch {}
    }
  }, []);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  const startScanner = async () => {
    await stopScanner();
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
          setStatus("Code scanned. Looking it up...");
          await stopScanner();
          onScan(decodedText);
        },
        () => {}
      );
      runningRef.current = true;
      setStatus("Point the camera at the code.");
    } catch {
      try {
        await stopScanner();
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;
        await scanner.start({ facingMode: "user" }, { fps: 10, qrbox: { width: 240, height: 240 } }, async (t) => {
          if (!runningRef.current) return;
          runningRef.current = false;
          await stopScanner();
          onScan(t);
        }, () => {});
        runningRef.current = true;
        setStatus("Point the camera at the code.");
      } catch {
        await stopScanner();
        setStatus("Camera unavailable. Enter codes manually.");
      }
    }
  };

  useEffect(() => { startScanner(); }, []);

  return (
    <div className="scanner-camera-wrap">
      <div id="qr-reader" />
      <p className="scanner-status">{status}</p>
      <button type="button" className="btn btn-orange scanner-stop" onClick={async () => { await stopScanner(); onStop?.(); }}>Stop camera</button>
    </div>
  );
}
