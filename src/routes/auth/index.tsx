import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { ArrowLeft } from "lucide-react";
import { PasswordStrength } from "@/components/password-strength";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

type ForgotState = "idle" | "sending" | "sent";

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotState, setForgotState] = useState<ForgotState>("idle");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: redirect ?? "/dashboard", replace: true });
    });
  }, [navigate, redirect]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); return toast.error(error.message); }

    // Check if MFA is needed. Supabase does NOT bump to aal2 on sign-in alone.
    // If the user has a verified TOTP factor, they need to enter a 6-digit code.
    // If they have no factors, the dashboard middleware will send them to enrol.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setLoading(false);
    if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
      navigate({ to: "/auth/mfa-verify", search: { redirect: redirect ?? "/dashboard" }, replace: true });
      return;
    }
    navigate({ to: redirect ?? "/dashboard", replace: true });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    // For new sign-ups, force-enrol MFA immediately.
    toast.success("Account created. Let's set up 2-step verification.");
    navigate({ to: "/auth/mfa-enrol", replace: true });
  }

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setForgotState("sending");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?reset=1`,
    });
    if (error) {
      setForgotState("idle");
      return toast.error(error.message);
    }
    setForgotState("sent");
  }

  // ── Forgot password view ────────────────────────────────────
  if (forgotMode) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto flex max-w-md flex-col px-6 pt-16 pb-24">
          <button
            type="button"
            onClick={() => { setForgotMode(false); setForgotState("idle"); }}
            className="mb-4 inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </button>
          <h1 className="font-display text-4xl">Reset password</h1>
          {forgotState === "sent" ? (
            <div className="mt-6 rounded-lg border border-border bg-card p-6">
              <p className="text-sm">
                If an account exists for <span className="font-medium">{email}</span>,
                we've sent a password reset link. Check your inbox.
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                The link expires in 1 hour. If you don't see the email, check your spam folder.
              </p>
            </div>
          ) : (
            <form onSubmit={sendReset} className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                Enter your account email and we'll send you a reset link.
              </p>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <Button className="w-full" disabled={forgotState === "sending"}>
                {forgotState === "sending" ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── Default sign-in / sign-up view ──────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto flex max-w-md flex-col px-6 pt-16 pb-24">
        <h1 className="font-display text-4xl">Welcome</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to run and manage your cyber maturity assessments.</p>

        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-3 pt-4">
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label>Password</Label>
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button className="w-full" disabled={loading}>Sign in</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-3 pt-4">
                <div>
                  <Label>Your name</Label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} />
                  <p className="mt-1 text-xs text-muted-foreground">Used in the report header. You can change it later.</p>
                </div>
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                  <PasswordStrength password={password} />
                </div>
                <Button className="w-full" disabled={loading}>Create account</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
