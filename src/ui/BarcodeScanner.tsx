import { useEffect, useEffectEvent, useRef, useState, type SyntheticEvent } from "react";
// Nur der Typ – die Bibliothek selbst wird erst beim Öffnen des Scanners geladen
import type { DecodeHintType as DecodeHint } from "@zxing/library";
import { BarcodeSchema, normalizeBarcode } from "../domain/barcode.ts";
import { CloseIcon } from "./icons.tsx";

interface BarcodeScannerProps {
  onResult: (barcode: string) => void;
  onClose: () => void;
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Kein Kamera-Zugriff. Erlaube die Kamera in den iPhone-Einstellungen (Einstellungen → Safari → Kamera) – oder tippe die Nummer unten ein.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Keine Kamera gefunden. Tippe die Nummer unten ein.";
  }
  return "Die Kamera konnte nicht gestartet werden. Tippe die Nummer unten ein.";
}

/**
 * Barcode-Scanner (Vollbild).
 * Das Kamerabild wird nur auf dem Gerät ausgewertet und nirgendwohin gesendet.
 * Die Scanner-Bibliothek wird erst beim Öffnen geladen (kleinere App, schnellerer Start).
 */
export function BarcodeScanner({ onResult, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const emitResult = useEffectEvent((barcode: string) => {
    onResult(barcode);
  });

  useEffect(() => {
    let cancelled = false;
    // Als Funktion, damit TypeScript die Prüfung nach dem Warten nicht wegoptimiert:
    // Der Scanner kann geschlossen werden, während noch auf die Kamera gewartet wird.
    const isCancelled = () => cancelled;
    let controls: { stop: () => void } | undefined;

    const start = async () => {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const video = videoRef.current;
      if (cancelled || !video) return;
      const hints = new Map<DecodeHint, unknown>([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A],
        ],
      ]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
      controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" }, audio: false },
        video,
        (result) => {
          if (!result || cancelled) return;
          const barcode = normalizeBarcode(result.getText());
          // Fehl-Scans (falsche Prüfziffer) ignorieren und weitersuchen
          if (!BarcodeSchema.safeParse(barcode).success) return;
          cancelled = true;
          controls?.stop();
          emitResult(barcode);
        },
      );
      if (isCancelled()) controls.stop();
    };

    start().catch((error: unknown) => {
      if (!cancelled) setCameraError(cameraErrorMessage(error));
    });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  const submitManual = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = BarcodeSchema.safeParse(normalizeBarcode(manual));
    if (!result.success) {
      setManualError(result.error.issues[0]?.message ?? "Ungültiger Barcode.");
      return;
    }
    onResult(result.data);
  };

  return (
    <div
      className="fixed inset-0 z-60 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Barcode scannen"
    >
      <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
        <h2 className="text-lg font-bold">Barcode scannen</h2>
        <button
          type="button"
          aria-label="Scanner schließen"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15"
          onClick={onClose}
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {cameraError ? (
          <p className="absolute inset-x-4 top-1/3 rounded-2xl bg-black/80 p-4 text-center text-sm">
            {cameraError}
          </p>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-x-10 top-1/2 h-36 -translate-y-1/2 rounded-2xl border-4 border-white/80"
            />
            <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/90">
              Barcode in den Rahmen halten
            </p>
          </>
        )}
      </div>

      <form
        onSubmit={submitManual}
        noValidate
        className="space-y-2 bg-stone-900 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex gap-2">
          <input
            className="min-h-11 min-w-0 flex-1 rounded-xl bg-white/10 px-3 text-base text-white placeholder:text-white/50 outline-none focus:ring-2 focus:ring-white/40"
            inputMode="numeric"
            placeholder="Oder Nummer eintippen"
            aria-label="Barcode-Nummer"
            maxLength={20}
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              setManualError(null);
            }}
          />
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-white px-4 font-semibold text-black"
          >
            OK
          </button>
        </div>
        {manualError && <p className="text-sm text-red-300">{manualError}</p>}
      </form>
    </div>
  );
}
