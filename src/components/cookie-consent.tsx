import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { X, Cookie } from "lucide-react";

const STORAGE_KEY = "ciso-compass.cookie-consent.v1";

type Consent = "accepted" | "rejected";

/**
 * Privacy & cookie notice.
 * Renders once on the first visit per browser. Persists the choice in
 * localStorage so it doesn't reappear. Pure functional — no analytics
 * third parties, no fingerprinting, no tracking. Only localStorage is used.
 */
export function CookieConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (!v) setOpen(true);
    } catch {
      // localStorage unavailable (private mode, etc.) — don't show, harmless
    }
  }, []);

  function dismiss(consent: Consent) {
    try {
      localStorage.setItem(STORAGE_KEY, consent);
    } catch {
      // ignore
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie and privacy notice"
      aria-modal="false"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur shadow-lg"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-ember" strokeWidth={1.5} />
          <div className="text-sm">
            <p className="font-medium">Privacy and cookies</p>
            <p className="mt-0.5 text-muted-foreground">
              CISO Compass uses only essential cookies (your sign-in session
              and the work-in-progress answers you save). We don't use
              third-party analytics, advertising or tracking.{" "}
              <Link
                to="/privacy"
                onClick={() => dismiss("accepted")}
                className="underline hover:text-foreground"
              >
                Privacy policy
              </Link>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => dismiss("rejected")}>
            Reject non-essential
          </Button>
          <Button size="sm" onClick={() => dismiss("accepted")}>
            Got it
          </Button>
          <button
            type="button"
            onClick={() => dismiss("rejected")}
            aria-label="Dismiss"
            className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
