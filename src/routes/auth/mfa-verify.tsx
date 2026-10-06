import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { ShieldCheck, KeyRound } from "lucide-react";
import { Link } from "@tanstack/react-router";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth/mfa-verify")({
  validateSearch: (s) => searchSchema.parse(s),
  component: MfaVerifyPage,
});

function MfaVerifyPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth/mfa-verify" });
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (!verified) {
        navigate({ to: "/auth/mfa-enrol", replace: true });
        return;
      }
      setFactorId(verified.id);
      setLoading(false);
    })();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setSubmitting(true);
    setAttempts((a) => a + 1);

    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr || !challenge) {
      setSubmitting(false);
      return toast.error(cErr?.message ?? "Failed to create challenge");
    }

    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (vErr) {
      setSubmitting(false);
      setCode("");
      if (attempts >= 2) {
        toast.error("Too many failed attempts. Sign in again.");
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
        return;
      }
      return toast.error(`Incorrect code (attempt ${attempts + 1}/3)`);
    }

    // Verification successful — session is now aal2
    toast.success("Verified. Welcome back.");
    navigate({ to: redirect ?? "/dashboard", replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto flex max-w-md flex-col px-6 pt-16 pb-24">
          <p className="text-sm text-muted-foreground">Loading…</p>
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
          <span className="text-xs font-medium uppercase tracking-wider">2-step verification</span>
        </div>
        <h1 className="mt-2 font-display text-4xl">Enter your code</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Open your authenticator app and enter the 6-digit code it shows.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="text-center font-mono text-2xl tracking-widest"
          />
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || code.length !== 6}
          >
            {submitting ? "Verifying…" : "Verify"}
          </Button>
        </form>

        <div className="mt-8 flex items-center gap-2 border-t border-border pt-6">
          <KeyRound className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <Link
            to="/auth/recover"
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Lost access? Use a recovery code
          </Link>
        </div>
      </div>
    </div>
  );
}
