import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { Check, Copy, Download, ShieldCheck } from "lucide-react";
import { generateRecoveryCodes } from "@/lib/recovery-codes";
import bcrypt from "bcryptjs";

type Stage = "loading" | "enroll" | "verify" | "save-codes" | "done" | "error";

export const Route = createFileRoute("/auth/mfa-enrol")({
  component: MfaEnrolPage,
});

function MfaEnrolPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("loading");
  const [stageError, setStageError] = useState<string>("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [codesSaved, setCodesSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function signOutAndExit() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Safety net: if any async call hangs (e.g. the API is unreachable), give up
      // after 8 seconds and show the user a clear error rather than spinning forever.
      const timeout = setTimeout(() => {
        if (cancelled) return;
        setStage("error");
        setStageError("Request timed out. The server is unreachable — try refreshing the page.");
      }, 8000);

      try {
        const { data: sess } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!sess.session) {
          navigate({ to: "/auth", replace: true });
          return;
        }

        // If user already has a verified TOTP factor, skip enrolment
        const { data: factors, error: facErr } = await supabase.auth.mfa.listFactors();
        if (cancelled) return;
        if (facErr) {
          toast.error(facErr.message);
          navigate({ to: "/dashboard", replace: true });
          return;
        }
        const hasVerified = (factors?.totp ?? []).some((f) => f.status === "verified");
        if (hasVerified) {
          toast.info("2-step verification is already enabled.");
          navigate({ to: "/dashboard", replace: true });
          return;
        }

        // Start enrolment
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Authenticator app",
        });
        if (cancelled) return;
        if (error || !data) {
          clearTimeout(timeout);
          setStage("error");
          setStageError(
            error?.message
              ? `${error.message}. If this says "MFA enroll is disabled for TOTP", your Supabase server has GOTRUE_MFA_TOTP_ENROLL_ENABLED=false.`
              : "Failed to start 2-step verification enrolment"
          );
          return;
        }

        setFactorId(data.id);
        setSecret(data.totp.secret);
        // Build QR
        try {
          const svg = await QRCode.toString(data.totp.uri, { type: "svg", margin: 0, width: 200 });
          setQrSvg(svg);
        } catch {
          // non-fatal — user can type the secret manually
        }
        clearTimeout(timeout);
        if (cancelled) return;
        setStage("enroll");
      } catch (err: any) {
        clearTimeout(timeout);
        if (cancelled) return;
        setStage("error");
        setStageError(err?.message || "An unexpected error occurred during MFA enrolment.");
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !verifyCode) return;
    setSubmitting(true);

    // Step 1: create a challenge
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr || !challenge) {
      setSubmitting(false);
      return toast.error(cErr?.message ?? "Failed to create challenge");
    }

    // Step 2: verify the 6-digit code
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: verifyCode.trim(),
    });
    if (vErr) {
      setSubmitting(false);
      return toast.error(`Verification failed: ${vErr.message}`);
    }

    // Step 3: generate 10 recovery codes (client-side) and store bcrypt hashes server-side
    const codes = generateRecoveryCodes(10, 8);
    const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c.replace("-", ""), 10)));
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      setSubmitting(false);
      return toast.error("Session lost — sign in again");
    }
    const { error: rpcErr } = await supabase.rpc("create_recovery_codes", {
      p_user_id: sess.session.user.id,
      p_hashes: hashes,
    });
    if (rpcErr) {
      setSubmitting(false);
      return toast.error(`Could not store recovery codes: ${rpcErr.message}`);
    }

    setRecoveryCodes(codes);
    setSubmitting(false);
    setStage("save-codes");
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      toast.success("Recovery codes copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  function downloadCodes() {
    const text = [
      "CISO Compass — 2-step verification recovery codes",
      "",
      "Keep these safe. Each code can be used once to sign in if you lose",
      "access to your authenticator app.",
      "",
      ...recoveryCodes,
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ciso-compass-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function finish() {
    if (!codesSaved) {
      toast.error("Please confirm you've saved your recovery codes first");
      return;
    }
    setStage("done");
    setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1500);
  }

  if (stage === "loading") {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto flex max-w-md flex-col px-6 pt-16 pb-24">
          <p className="text-sm text-muted-foreground">Preparing 2-step verification…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto flex max-w-md flex-col px-6 pt-12 pb-24">
        <div className="flex items-center gap-2 text-ember">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-xs font-medium uppercase tracking-wider">Security</span>
        </div>
        <h1 className="mt-2 font-display text-4xl">Set up 2-step verification</h1>

        {stage === "enroll" && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Scan this QR code with an authenticator app (1Password, Authy,
              Google Authenticator, Bitwarden), then enter the 6-digit code
              the app shows.
            </p>
            <button
              type="button"
              onClick={signOutAndExit}
              className="mt-3 self-start text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Sign out
            </button>

            <div className="mt-6 flex justify-center rounded-lg border border-border bg-card p-6">
              {qrSvg ? (
                <div
                  className="h-48 w-48"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  aria-label="QR code"
                />
              ) : (
                <p className="text-sm text-muted-foreground">QR code unavailable</p>
              )}
            </div>

            {secret && (
              <details className="mt-3 rounded-md border border-border bg-card p-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Can't scan? Enter the key manually
                </summary>
                <p className="mt-2 break-all font-mono text-xs">{secret}</p>
              </details>
            )}

            <form onSubmit={handleVerify} className="mt-6 space-y-3">
              <Label htmlFor="verify-code">6-digit code</Label>
              <Input
                id="verify-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                required
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                placeholder="123456"
              />
              <Button type="submit" className="w-full" disabled={submitting || verifyCode.length !== 6}>
                {submitting ? "Verifying…" : "Verify and continue"}
              </Button>
            </form>
          </>
        )}

        {stage === "save-codes" && (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              Save these 10 recovery codes. Each can be used <strong>once</strong> to
              sign in if you lose access to your authenticator app. We don't store
              them — they're shown only now.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-4 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <div key={c} className="rounded bg-muted/30 px-2 py-1 text-center">
                  {c}
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={copyCodes} className="flex-1">
                <Copy className="mr-2 h-4 w-4" /> Copy
              </Button>
              <Button variant="outline" onClick={downloadCodes} className="flex-1">
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            </div>

            <label className="mt-6 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={codesSaved}
                onChange={(e) => setCodesSaved(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I have saved my recovery codes in a safe place. I understand that
                if I lose both my authenticator app and these codes, my account
                cannot be recovered.
              </span>
            </label>

            <Button
              className="mt-4 w-full"
              disabled={!codesSaved}
              onClick={finish}
            >
              <Check className="mr-2 h-4 w-4" /> Done
            </Button>
          </>
        )}

        {stage === "done" && (
          <div className="mt-8 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
            <Check className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-3 text-sm">2-step verification enabled. Redirecting…</p>
          </div>
        )}

        {stage === "error" && (
          <div className="mt-8 rounded-lg border border-rose-500/30 bg-rose-500/10 p-6">
            <h2 className="font-display text-2xl text-rose-300">MFA enrolment failed</h2>
            <p className="mt-3 text-sm text-rose-200/90">{stageError}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button variant="outline" onClick={signOutAndExit}>
                Sign out
              </Button>
              <Button
                onClick={() => navigate({ to: "/dashboard", replace: true })}
              >
                Skip for now
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              <strong>Note:</strong> the CISO Compass dashboard requires 2-step
              verification, so choosing "Skip for now" will redirect you back to
              enrolment on the next attempt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
