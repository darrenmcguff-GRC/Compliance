import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }

    // MFA gate: if the user has any verified TOTP factor, require aal2.
    // If they have no factors at all, send them to enrol on the dashboard.
    // The enrol page is at /auth/mfa-enrol, separate from the app shell.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
      // User is signed in but hasn't done 2-step verification on this device.
      // Bounce to verify unless they're already on the verify/enrol/recover pages.
      const path = location.pathname;
      const isMfaShell =
        path.startsWith("/auth/mfa-enrol") ||
        path.startsWith("/auth/mfa-verify") ||
        path.startsWith("/auth/recover");
      if (!isMfaShell) {
        throw redirect({ to: "/auth/mfa-verify", search: { redirect: location.href } });
      }
    } else if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal1") {
      // User has no verified TOTP factor at all. Force enrolment.
      const path = location.pathname;
      if (!path.startsWith("/auth/mfa-enrol")) {
        throw redirect({ to: "/auth/mfa-enrol", replace: true });
      }
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
